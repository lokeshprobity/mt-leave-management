import crypto from 'node:crypto';
import net from 'node:net';
import tls from 'node:tls';

export interface EmailDeliveryResult {
  sent: boolean;
  status: 'SENT' | 'FAILED';
  recipientEmail: string;
  subject: string;
  sentAt: string | null;
  messageId: string | null;
  error: string | null;
  transportMode?: 'SMTP' | 'RESEND' | 'CUSTOM_TRANSPORT' | 'LOCAL_OUTBOX';
}

export interface DispatchedEmailMessage {
  from: string;
  to: string;
  subject: string;
  text: string;
  html: string;
  metadata: {
    employeeName: string;
    userId: string;
    employeeCode?: string | null;
    loginUrl: string;
    mustChangePassword: boolean;
  };
}

export interface OutboxEmailRecord {
  id: string;
  messageId: string | null;
  type: 'NEW_EMPLOYEE_CREDENTIALS' | 'PASSWORD_RESET';
  from: string;
  to: string;
  registeredEmail: string;
  subject: string;
  textBody: string;
  htmlBody: string;
  status: 'SENT' | 'FAILED';
  sentAt: string | null;
  error: string | null;
  transportMode: 'SMTP' | 'RESEND' | 'CUSTOM_TRANSPORT' | 'LOCAL_OUTBOX';
  contentChecks: {
    hasEmployeeName: boolean;
    hasUserId: boolean;
    hasTemporaryPassword: boolean;
    hasLoginInstructions: boolean;
    hasChangePasswordInstruction: boolean;
    hasResetLink?: boolean;
    hasResetToken?: boolean;
    hasExpirationNotice?: boolean;
  };
  metadata: {
    employeeName: string;
    userId: string;
    employeeCode?: string | null;
    loginUrl: string;
    mustChangePassword: boolean;
    expiresInMinutes?: number;
  };
}

export type EmailTransportHandler = (
  message: DispatchedEmailMessage
) => Promise<{ messageId?: string } | void> | { messageId?: string } | void;

let emailOutbox: OutboxEmailRecord[] = [];
let simulateFailureMode = false;
let simulateFailureReason =
  'SMTP transport connection refused: Unable to deliver email to recipient server.';
let customTransport: EmailTransportHandler | null = null;

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export class EmailService {
  public static resetOutbox(): void {
    emailOutbox = [];
    simulateFailureMode = false;
    simulateFailureReason =
      'SMTP transport connection refused: Unable to deliver email to recipient server.';
    customTransport = null;
  }

  public static setTransport(handler: EmailTransportHandler | null): void {
    customTransport = handler;
  }

  public static setSimulateFailure(shouldFail: boolean, reason?: string): void {
    simulateFailureMode = shouldFail;
    simulateFailureReason =
      reason || 'SMTP transport connection refused: Unable to deliver email to recipient server.';
  }

  public static getOutbox(): OutboxEmailRecord[] {
    return [...emailOutbox];
  }

  public static getEmailsForRecipient(email: string): OutboxEmailRecord[] {
    const clean = String(email || '').trim().toLowerCase();
    return emailOutbox.filter((e) => e.to.toLowerCase() === clean);
  }

  public static getLatestEmailForRecipient(email: string): OutboxEmailRecord | undefined {
    const list = this.getEmailsForRecipient(email);
    return list.length > 0 ? list[0] : undefined;
  }

  public static getLoginUrl(): string {
    return (
      process.env.APP_LOGIN_URL ||
      (process.env.APP_URL ? `${process.env.APP_URL.replace(/\/$/, '')}/#login` : '/#login')
    );
  }

  public static getFromAddress(): string {
    return process.env.RESEND_FROM || process.env.SMTP_FROM || 'no-reply@maestro.com';
  }

  public static isResendConfigured(): boolean {
    return Boolean(process.env.RESEND_API_KEY && process.env.RESEND_API_KEY.trim().length > 0);
  }

  public static isSmtpConfigured(): boolean {
    return Boolean(process.env.SMTP_HOST && process.env.SMTP_HOST.trim().length > 0);
  }

  /**
   * Sends login credentials (User ID + Temporary Password) strictly to the employee's registered email address.
   * Never sends credentials to an admin's email or any other email address.
   * Never stores the temporary password permanently in plaintext in logs or outbox records.
   */
  public static async sendTemporaryCredentialsEmail(params: {
    registeredEmail: string;
    recipientEmail?: string;
    actorEmail?: string | null;
    employeeName: string;
    userId: string;
    employeeCode?: string | null;
    temporaryPassword: string;
    roleName?: string;
    simulateFailure?: boolean;
  }): Promise<EmailDeliveryResult> {
    const registered = String(params.registeredEmail || '').trim().toLowerCase();
    const requestedRecipient = params.recipientEmail
      ? String(params.recipientEmail).trim().toLowerCase()
      : registered;
    const fromAddress = this.getFromAddress();
    const loginUrl = this.getLoginUrl();
    const subject = 'Welcome to Maestro Leave Management — Your Login Credentials';

    // 1. Validate registered email format
    if (!registered || !EMAIL_REGEX.test(registered)) {
      const errMsg = `Invalid registered email address '${params.registeredEmail || ''}'.`;
      this.recordEmail({
        type: 'NEW_EMPLOYEE_CREDENTIALS',
        from: fromAddress,
        to: registered,
        registeredEmail: registered,
        subject,
        textBody: '',
        htmlBody: '',
        status: 'FAILED',
        sentAt: null,
        messageId: null,
        error: errMsg,
        transportMode: 'LOCAL_OUTBOX',
        contentChecks: {
          hasEmployeeName: false,
          hasUserId: false,
          hasTemporaryPassword: false,
          hasLoginInstructions: false,
          hasChangePasswordInstruction: false,
        },
        metadata: {
          employeeName: params.employeeName,
          userId: params.userId,
          employeeCode: params.employeeCode ?? null,
          loginUrl,
          mustChangePassword: true,
        },
      });
      return {
        sent: false,
        status: 'FAILED',
        recipientEmail: registered,
        subject,
        sentAt: null,
        messageId: null,
        error: errMsg,
      };
    }

    // 2. Strict recipient guard: never send credentials to an admin email or any other email address
    if (requestedRecipient !== registered) {
      const errMsg =
        "Security violation: Login credentials can only be sent to the employee's registered email address.";
      this.recordEmail({
        type: 'NEW_EMPLOYEE_CREDENTIALS',
        from: fromAddress,
        to: registered,
        registeredEmail: registered,
        subject,
        textBody: '',
        htmlBody: '',
        status: 'FAILED',
        sentAt: null,
        messageId: null,
        error: errMsg,
        transportMode: 'LOCAL_OUTBOX',
        contentChecks: {
          hasEmployeeName: false,
          hasUserId: false,
          hasTemporaryPassword: false,
          hasLoginInstructions: false,
          hasChangePasswordInstruction: false,
        },
        metadata: {
          employeeName: params.employeeName,
          userId: params.userId,
          employeeCode: params.employeeCode ?? null,
          loginUrl,
          mustChangePassword: true,
        },
      });
      return {
        sent: false,
        status: 'FAILED',
        recipientEmail: registered,
        subject,
        sentAt: null,
        messageId: null,
        error: errMsg,
      };
    }

    if (!params.temporaryPassword || params.temporaryPassword.trim().length < 6) {
      const errMsg = 'Temporary password credential is missing or invalid.';
      return {
        sent: false,
        status: 'FAILED',
        recipientEmail: registered,
        subject,
        sentAt: null,
        messageId: null,
        error: errMsg,
      };
    }

    const displayUserId = params.employeeCode
      ? `${params.employeeCode} (Username: ${params.userId})`
      : params.userId;

    const rawTextBody = [
      `Hello ${params.employeeName},`,
      '',
      'Welcome to Maestro Leave Management! Your employee login account has been created. Below are your initial login credentials:',
      '',
      `Employee Name: ${params.employeeName}`,
      `User ID: ${params.userId}`,
      ...(params.employeeCode ? [`Employee ID: ${params.employeeCode}`] : []),
      `Registered Email: ${registered}`,
      `Temporary Password: ${params.temporaryPassword}`,
      '',
      `Login URL: ${loginUrl}`,
      'Login Instructions: Open the Maestro Leave Management login portal and sign in using your User ID (or Registered Email) and the temporary password above.',
      '',
      'IMPORTANT SECURITY INSTRUCTION:',
      'Please change your password immediately after your first login. Do not share this temporary credential with anyone.',
      '',
      'Regards,',
      'Maestro Leave Management System',
    ].join('\n');

    const rawHtmlBody = `
      <div style="font-family: Inter, Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden;">
        <div style="background-color: #DC2626; color: #ffffff; padding: 20px 24px;">
          <h2 style="margin: 0; font-size: 18px;">Maestro Leave Management</h2>
          <p style="margin: 4px 0 0; font-size: 13px; opacity: 0.9;">New Employee Login Credentials</p>
        </div>
        <div style="padding: 24px; color: #0f172a; font-size: 14px; line-height: 1.6;">
          <p>Hello <strong>${params.employeeName}</strong>,</p>
          <p>Your employee account has been provisioned in Maestro Leave Management. Use the credentials below to sign in:</p>
          <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin: 16px 0;">
            <p style="margin: 4px 0;"><strong>Employee Name:</strong> ${params.employeeName}</p>
            <p style="margin: 4px 0;"><strong>User ID:</strong> ${displayUserId}</p>
            <p style="margin: 4px 0;"><strong>Registered Email:</strong> ${registered}</p>
            <p style="margin: 4px 0;"><strong>Temporary Password:</strong> <code style="background: #fee2e2; color: #991b1b; padding: 2px 6px; border-radius: 4px; font-weight: bold;">${params.temporaryPassword}</code></p>
            <p style="margin: 8px 0 4px;"><strong>Login Portal:</strong> <a href="${loginUrl}" style="color: #DC2626;">${loginUrl}</a></p>
          </div>
          <p style="margin: 12px 0;"><strong>Login Instructions:</strong> Visit the Login Portal above and enter your User ID (<code>${params.userId}</code>${
            params.employeeCode ? ` or <code>${params.employeeCode}</code>` : ''
          }) and your Temporary Password.</p>
          <div style="background-color: #fffbeb; border-left: 4px solid #f59e0b; padding: 12px 16px; margin: 16px 0; color: #92400e; font-size: 13px;">
            <strong>Mandatory First-Login Action:</strong> Please change your password immediately after your first login.
          </div>
        </div>
      </div>
    `.trim();

    const contentChecks = {
      hasEmployeeName: rawTextBody.includes(params.employeeName),
      hasUserId:
        rawTextBody.includes(params.userId) &&
        (!params.employeeCode || rawTextBody.includes(params.employeeCode)),
      hasTemporaryPassword: rawTextBody.includes(params.temporaryPassword),
      hasLoginInstructions:
        rawTextBody.includes('Login Instructions:') && rawTextBody.includes(loginUrl),
      hasChangePasswordInstruction: rawTextBody
        .toLowerCase()
        .includes('change your password immediately after your first login'),
    };

    // Redact temporary password before storing in any in-memory/diagnostic record so plaintext password is NEVER stored permanently
    const redactedTextBody = rawTextBody.split(params.temporaryPassword).join('[REDACTED]');
    const redactedHtmlBody = rawHtmlBody.split(params.temporaryPassword).join('[REDACTED]');

    const shouldFail =
      Boolean(params.simulateFailure) ||
      simulateFailureMode ||
      process.env.EMAIL_SIMULATE_FAILURE === 'true' ||
      registered.endsWith('@fail-delivery.invalid') ||
      registered.endsWith('@smtp-error.invalid');

    if (shouldFail) {
      const errMsg = simulateFailureReason;
      this.recordEmail({
        type: 'NEW_EMPLOYEE_CREDENTIALS',
        from: fromAddress,
        to: registered,
        registeredEmail: registered,
        subject,
        textBody: redactedTextBody,
        htmlBody: redactedHtmlBody,
        status: 'FAILED',
        sentAt: null,
        messageId: null,
        error: errMsg,
        transportMode: customTransport
          ? 'CUSTOM_TRANSPORT'
          : this.isResendConfigured()
            ? 'RESEND'
            : this.isSmtpConfigured()
              ? 'SMTP'
              : 'LOCAL_OUTBOX',
        contentChecks,
        metadata: {
          employeeName: params.employeeName,
          userId: params.userId,
          employeeCode: params.employeeCode ?? null,
          loginUrl,
          mustChangePassword: true,
        },
      });
      return {
        sent: false,
        status: 'FAILED',
        recipientEmail: registered,
        subject,
        sentAt: null,
        messageId: null,
        error: errMsg,
      };
    }

    let transportMode: 'SMTP' | 'RESEND' | 'CUSTOM_TRANSPORT' | 'LOCAL_OUTBOX' = 'LOCAL_OUTBOX';
    let messageId = `<cred-${crypto.randomBytes(8).toString('hex')}@maestro-leave.local>`;

    const outgoingMessage: DispatchedEmailMessage = {
      from: fromAddress,
      to: registered,
      subject,
      text: rawTextBody,
      html: rawHtmlBody,
      metadata: {
        employeeName: params.employeeName,
        userId: params.userId,
        employeeCode: params.employeeCode ?? null,
        loginUrl,
        mustChangePassword: true,
      },
    };

    try {
      if (customTransport) {
        transportMode = 'CUSTOM_TRANSPORT';
        const res = await customTransport(outgoingMessage);
        if (res && res.messageId) {
          messageId = res.messageId;
        }
      } else if (this.isResendConfigured()) {
        transportMode = 'RESEND';
        const resendRes = await this.deliverViaResend(outgoingMessage);
        messageId = resendRes.messageId;
      } else if (this.isSmtpConfigured()) {
        transportMode = 'SMTP';
        const smtpRes = await this.deliverViaSmtp(outgoingMessage);
        messageId = smtpRes.messageId;
      }
    } catch (err: any) {
      const errMsg = err?.message || 'Email delivery failed due to transport error.';
      this.recordEmail({
        type: 'NEW_EMPLOYEE_CREDENTIALS',
        from: fromAddress,
        to: registered,
        registeredEmail: registered,
        subject,
        textBody: redactedTextBody,
        htmlBody: redactedHtmlBody,
        status: 'FAILED',
        sentAt: null,
        messageId: null,
        error: errMsg,
        transportMode,
        contentChecks,
        metadata: {
          employeeName: params.employeeName,
          userId: params.userId,
          employeeCode: params.employeeCode ?? null,
          loginUrl,
          mustChangePassword: true,
        },
      });
      return {
        sent: false,
        status: 'FAILED',
        recipientEmail: registered,
        subject,
        sentAt: null,
        messageId: null,
        error: errMsg,
        transportMode,
      };
    }

    const nowIso = new Date().toISOString();

    this.recordEmail({
      type: 'NEW_EMPLOYEE_CREDENTIALS',
      from: fromAddress,
      to: registered,
      registeredEmail: registered,
      subject,
      textBody: redactedTextBody,
      htmlBody: redactedHtmlBody,
      status: 'SENT',
      sentAt: nowIso,
      messageId,
      error: null,
      transportMode,
      contentChecks,
      metadata: {
        employeeName: params.employeeName,
        userId: params.userId,
        employeeCode: params.employeeCode ?? null,
        loginUrl,
        mustChangePassword: true,
      },
    });

    return {
      sent: true,
      status: 'SENT',
      recipientEmail: registered,
      subject,
      sentAt: nowIso,
      messageId,
      error: null,
      transportMode,
    };
  }

  /**
   * Sends a one-time Password Reset link & instructions strictly to the user's registered email address.
   * Redacts the raw reset token in diagnostic/outbox records so tokens are never stored in plaintext logs.
   */
  public static async sendPasswordResetEmail(params: {
    registeredEmail: string;
    employeeName: string;
    userId: string;
    employeeCode?: string | null;
    resetToken: string;
    expiresInMinutes?: number;
    simulateFailure?: boolean;
  }): Promise<EmailDeliveryResult> {
    const registered = String(params.registeredEmail || '').trim().toLowerCase();
    const fromAddress = this.getFromAddress();
    const baseUrl = this.getLoginUrl().replace(/#.*$/, '');
    const resetLink = `${baseUrl}#reset-password?token=${encodeURIComponent(params.resetToken)}`;
    const expiresInMinutes = params.expiresInMinutes ?? 15;
    const subject = 'Maestro Leave Management — Password Reset Instructions';

    if (!registered || !EMAIL_REGEX.test(registered)) {
      const errMsg = `Invalid registered email address '${params.registeredEmail || ''}'.`;
      return {
        sent: false,
        status: 'FAILED',
        recipientEmail: registered,
        subject,
        sentAt: null,
        messageId: null,
        error: errMsg,
      };
    }

    if (!params.resetToken || params.resetToken.trim().length < 16) {
      return {
        sent: false,
        status: 'FAILED',
        recipientEmail: registered,
        subject,
        sentAt: null,
        messageId: null,
        error: 'Invalid password reset token.',
      };
    }

    const rawTextBody = [
      `Hello ${params.employeeName},`,
      '',
      'We received a request to reset the password for your Maestro Leave Management account.',
      '',
      `Account User ID: ${params.userId}`,
      ...(params.employeeCode ? [`Employee ID: ${params.employeeCode}`] : []),
      `Registered Email: ${registered}`,
      '',
      `Password Reset Link: ${resetLink}`,
      `One-Time Reset Token: ${params.resetToken}`,
      '',
      `Expiration Notice: This one-time reset link and token will expire in ${expiresInMinutes} minutes and can only be used once.`,
      'If you did not request a password reset, you can safely ignore this email.',
      '',
      'Regards,',
      'Maestro Leave Management Security',
    ].join('\n');

    const rawHtmlBody = `
      <div style="font-family: Inter, Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden;">
        <div style="background-color: #DC2626; color: #ffffff; padding: 20px 24px;">
          <h2 style="margin: 0; font-size: 18px;">Maestro Leave Management</h2>
          <p style="margin: 4px 0 0; font-size: 13px; opacity: 0.9;">Password Reset Request</p>
        </div>
        <div style="padding: 24px; color: #0f172a; font-size: 14px; line-height: 1.6;">
          <p>Hello <strong>${params.employeeName}</strong>,</p>
          <p>We received a request to reset the password for your account (User ID: <code>${params.userId}</code>).</p>
          <p style="margin: 16px 0;">
            <a href="${resetLink}" style="display: inline-block; background-color: #DC2626; color: #ffffff; text-decoration: none; padding: 10px 18px; border-radius: 8px; font-weight: 600;">Reset Your Password</a>
          </p>
          <p style="font-size: 12px; color: #475569;">Or copy and paste this reset link: <br/><a href="${resetLink}" style="color: #DC2626; word-break: break-all;">${resetLink}</a></p>
          <div style="background-color: #fffbeb; border-left: 4px solid #f59e0b; padding: 12px 16px; margin: 16px 0; color: #92400e; font-size: 13px;">
            <strong>Security Notice:</strong> This reset link expires in ${expiresInMinutes} minutes and is valid for a single use only.
          </div>
        </div>
      </div>
    `.trim();

    const contentChecks = {
      hasEmployeeName: rawTextBody.includes(params.employeeName),
      hasUserId: rawTextBody.includes(params.userId),
      hasTemporaryPassword: false,
      hasLoginInstructions: rawTextBody.includes(resetLink),
      hasChangePasswordInstruction: true,
      hasResetLink: rawTextBody.includes(resetLink),
      hasResetToken: rawTextBody.includes(params.resetToken),
      hasExpirationNotice: rawTextBody.includes(`${expiresInMinutes} minutes`),
    };

    const redactedTextBody = rawTextBody
      .split(params.resetToken)
      .join('[REDACTED]')
      .split(encodeURIComponent(params.resetToken))
      .join('[REDACTED]');
    const redactedHtmlBody = rawHtmlBody
      .split(params.resetToken)
      .join('[REDACTED]')
      .split(encodeURIComponent(params.resetToken))
      .join('[REDACTED]');

    const shouldFail =
      Boolean(params.simulateFailure) ||
      simulateFailureMode ||
      process.env.EMAIL_SIMULATE_FAILURE === 'true' ||
      registered.endsWith('@fail-delivery.invalid') ||
      registered.endsWith('@smtp-error.invalid');

    if (shouldFail) {
      const errMsg = simulateFailureReason;
      this.recordEmail({
        type: 'PASSWORD_RESET',
        from: fromAddress,
        to: registered,
        registeredEmail: registered,
        subject,
        textBody: redactedTextBody,
        htmlBody: redactedHtmlBody,
        status: 'FAILED',
        sentAt: null,
        messageId: null,
        error: errMsg,
        transportMode: customTransport
          ? 'CUSTOM_TRANSPORT'
          : this.isResendConfigured()
            ? 'RESEND'
            : this.isSmtpConfigured()
              ? 'SMTP'
              : 'LOCAL_OUTBOX',
        contentChecks,
        metadata: {
          employeeName: params.employeeName,
          userId: params.userId,
          employeeCode: params.employeeCode ?? null,
          loginUrl: baseUrl,
          mustChangePassword: false,
          expiresInMinutes,
        },
      });
      return {
        sent: false,
        status: 'FAILED',
        recipientEmail: registered,
        subject,
        sentAt: null,
        messageId: null,
        error: errMsg,
      };
    }

    let transportMode: 'SMTP' | 'RESEND' | 'CUSTOM_TRANSPORT' | 'LOCAL_OUTBOX' = 'LOCAL_OUTBOX';
    let messageId = `<reset-${crypto.randomBytes(8).toString('hex')}@maestro-leave.local>`;

    const outgoingMessage: DispatchedEmailMessage = {
      from: fromAddress,
      to: registered,
      subject,
      text: rawTextBody,
      html: rawHtmlBody,
      metadata: {
        employeeName: params.employeeName,
        userId: params.userId,
        employeeCode: params.employeeCode ?? null,
        loginUrl: resetLink,
        mustChangePassword: false,
      },
    };

    try {
      if (customTransport) {
        transportMode = 'CUSTOM_TRANSPORT';
        const res = await customTransport(outgoingMessage);
        if (res && res.messageId) {
          messageId = res.messageId;
        }
      } else if (this.isResendConfigured()) {
        transportMode = 'RESEND';
        const resendRes = await this.deliverViaResend(outgoingMessage);
        messageId = resendRes.messageId;
      } else if (this.isSmtpConfigured()) {
        transportMode = 'SMTP';
        const smtpRes = await this.deliverViaSmtp(outgoingMessage);
        messageId = smtpRes.messageId;
      }
    } catch (err: any) {
      const errMsg = err?.message || 'Password reset email delivery failed due to transport error.';
      console.error('[EmailService] Password reset SMTP delivery failed', {
        host: String(process.env.SMTP_HOST || '').trim(),
        port: Number(process.env.SMTP_PORT || 587),
        recipient: registered,
        error: errMsg,
      });
      this.recordEmail({
        type: 'PASSWORD_RESET',
        from: fromAddress,
        to: registered,
        registeredEmail: registered,
        subject,
        textBody: redactedTextBody,
        htmlBody: redactedHtmlBody,
        status: 'FAILED',
        sentAt: null,
        messageId: null,
        error: errMsg,
        transportMode,
        contentChecks,
        metadata: {
          employeeName: params.employeeName,
          userId: params.userId,
          employeeCode: params.employeeCode ?? null,
          loginUrl: baseUrl,
          mustChangePassword: false,
          expiresInMinutes,
        },
      });
      return {
        sent: false,
        status: 'FAILED',
        recipientEmail: registered,
        subject,
        sentAt: null,
        messageId: null,
        error: errMsg,
        transportMode,
      };
    }

    const nowIso = new Date().toISOString();
    this.recordEmail({
      type: 'PASSWORD_RESET',
      from: fromAddress,
      to: registered,
      registeredEmail: registered,
      subject,
      textBody: redactedTextBody,
      htmlBody: redactedHtmlBody,
      status: 'SENT',
      sentAt: nowIso,
      messageId,
      error: null,
      transportMode,
      contentChecks,
      metadata: {
        employeeName: params.employeeName,
        userId: params.userId,
        employeeCode: params.employeeCode ?? null,
        loginUrl: baseUrl,
        mustChangePassword: false,
        expiresInMinutes,
      },
    });

    return {
      sent: true,
      status: 'SENT',
      recipientEmail: registered,
      subject,
      sentAt: nowIso,
      messageId,
      error: null,
      transportMode,
    };
  }

  /** Sends email through Resend's HTTPS API, avoiding outbound SMTP port restrictions. */
  private static async deliverViaResend(
    message: DispatchedEmailMessage
  ): Promise<{ messageId: string }> {
    const apiKey = String(process.env.RESEND_API_KEY || '').trim();
    const from = String(process.env.RESEND_FROM || '').trim() || message.from;
    if (!apiKey) throw new Error('RESEND_API_KEY is not configured.');
    if (!from) throw new Error('RESEND_FROM must be configured with a verified sender address.');

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [message.to],
        subject: message.subject,
        text: message.text,
        html: message.html,
      }),
      signal: AbortSignal.timeout(20000),
    });

    const payload: any = await response.json().catch(() => ({}));
    if (!response.ok) {
      const detail = String(payload?.message || payload?.name || `HTTP ${response.status}`);
      throw new Error(`Resend API rejected email (${response.status}): ${detail}`);
    }
    if (!payload?.id) throw new Error('Resend API returned no message ID.');
    return { messageId: String(payload.id) };
  }

  /**
   * Minimal standard SMTP client using Node's built-in net/tls modules when SMTP_HOST is configured.
   */
  private static async deliverViaSmtp(
    message: DispatchedEmailMessage
  ): Promise<{ messageId: string }> {
    const host = String(process.env.SMTP_HOST || '').trim();
    const port = Number(process.env.SMTP_PORT || 587);
    const user = String(process.env.SMTP_USER || '').trim();
    const pass = String(process.env.SMTP_PASS || '').trim();
    const secure = process.env.SMTP_SECURE === 'true' || port === 465;
    if (!host) throw new Error('SMTP_HOST is not configured.');
    if (!user || !pass) throw new Error('SMTP_USER or SMTP_PASS is missing; authenticated SMTP is required.');

    const messageId = `<mt-leave-${crypto.randomBytes(12).toString('hex')}@${host}>`;
    return new Promise((resolve, reject) => {
      const socket = secure
        ? tls.connect({ host, port, servername: host, rejectUnauthorized: true })
        : net.createConnection({ host, port });
      let step = 0;
      let settled = false;
      let responseBuffer = '';
      let responseLines: string[] = [];
      const timeout = setTimeout(() => {
        finish(new Error(`SMTP timed out at ${host}:${port} (protocol step ${step}).`));
      }, 20000);

      const finish = (err?: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        socket.removeAllListeners('data');
        try { socket.destroy(); } catch {}
        if (err) reject(err);
        else resolve({ messageId });
      };
      const sendLine = (line: string) => socket.write(`${line}\r\n`);

      const handleResponse = (response: string) => {
        const finalLine = response.split('\n').pop() || '';
        const code = Number(finalLine.slice(0, 3));
        if (!Number.isFinite(code)) return finish(new Error(`Unrecognized SMTP response: ${response.slice(0, 300)}`));
        if (code >= 400) return finish(new Error(`SMTP server rejected request (${code}): ${response.slice(0, 600)}`));

        if (step === 0 && code === 220) {
          step = 1;
          sendLine('EHLO mt-leave-management.local');
        } else if (step === 1 && code === 250) {
          step = 2;
          const authPlain = Buffer.from(`\u0000${user}\u0000${pass}`).toString('base64');
          sendLine(`AUTH PLAIN ${authPlain}`);
        } else if (step === 2 && code === 235) {
          step = 3;
          sendLine(`MAIL FROM:<${message.from}>`);
        } else if (step === 3 && code === 250) {
          step = 4;
          sendLine(`RCPT TO:<${message.to}>`);
        } else if (step === 4 && (code === 250 || code === 251)) {
          step = 5;
          sendLine('DATA');
        } else if (step === 5 && code === 354) {
          step = 6;
          const safeSubject = message.subject.replace(/[\\r\\n]+/g, ' ').trim();
          const safeFrom = message.from.replace(/[\\r\\n<>]/g, '');
          const safeTo = message.to.replace(/[\\r\\n<>]/g, '');
          const body = message.text.replace(/(^|\\r?\\n)\\./g, '$1..');
          const mime = [
            `From: Maestro Leave Management <${safeFrom}>`,
            `To: <${safeTo}>`,
            `Subject: ${safeSubject}`,
            `Message-ID: ${messageId}`,
            `Date: ${new Date().toUTCString()}`,
            'MIME-Version: 1.0',
            'Content-Type: text/plain; charset=UTF-8',
            'Content-Transfer-Encoding: 8bit',
            '',
            body,
            '.',
          ].join('\r\n');
          socket.write(`${mime}\r\n`);
        } else if (step === 6 && code === 250) {
          // SMTP 250 after DATA means the server accepted the message for delivery.
          step = 7;
          sendLine('QUIT');
          finish();
        } else {
          finish(new Error(`Unexpected SMTP response at step ${step}: ${response.slice(0, 400)}`));
        }
      };

      socket.on('error', (err) => finish(new Error(`SMTP transport error (${host}:${port}): ${err.message}`)));
      socket.on('data', (chunk) => {
        responseBuffer += chunk.toString('utf8');
        while (responseBuffer.includes('\r\n') && !settled) {
          const boundary = responseBuffer.indexOf('\r\n');
          const line = responseBuffer.slice(0, boundary);
          responseBuffer = responseBuffer.slice(boundary + 2);
          responseLines.push(line);
          // SMTP multiline responses continue with "code-"; the final line is "code ".
          if (/^\d{3} /.test(line)) {
            const completeResponse = responseLines.join('\n');
            responseLines = [];
            handleResponse(completeResponse);
          } else if (!/^\d{3}-/.test(line)) {
            finish(new Error(`Malformed SMTP response: ${line.slice(0, 300)}`));
          }
        }
      });
    });
  }

  private static recordEmail(entry: Omit<OutboxEmailRecord, 'id'>): void {
    const id = `email_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    emailOutbox.unshift({
      id,
      ...entry,
    });
    if (emailOutbox.length > 500) {
      emailOutbox.length = 500;
    }
  }
}
