import assert from 'node:assert/strict';
import { UserService } from '../services/userService.ts';
import { EmailService, DispatchedEmailMessage } from '../services/emailService.ts';
import { AuditService } from '../services/auditService.ts';
import { AuthContext } from '../types/leave.ts';

const superAdminActor: AuthContext = {
  userId: 1,
  username: 'superadmin',
  employeeId: 1,
  role: 'SUPER_ADMIN',
  departmentId: 1,
};

const hrActor: AuthContext = {
  userId: 2,
  username: 'hr_admin',
  employeeId: 2,
  role: 'HR',
  departmentId: 2,
};

async function runTests() {
  console.log('============================================================');
  console.log('PHASE 1A — NEW EMPLOYEE EMAIL CREDENTIALS VERIFICATION SUITE');
  console.log('============================================================\n');

  EmailService.resetOutbox();

  const dispatchedMessages: DispatchedEmailMessage[] = [];
  EmailService.setTransport(async (msg) => {
    dispatchedMessages.push(msg);
    return { messageId: `<test-${Date.now()}@maestro.local>` };
  });

  try {
    // ---------------------------------------------------------
    // 1. Secure Temporary Password Generation
    // ---------------------------------------------------------
    console.log('1. Testing secure temporary password generation...');
    const tempPasswords = new Set<string>();
    for (let i = 0; i < 20; i++) {
      const pwd = UserService.generateTemporaryPassword();
      assert.ok(pwd.length >= 12, `Temporary password must be at least 12 chars, got ${pwd.length}`);
      assert.match(pwd, /[A-Z]/, 'Temporary password must contain uppercase letter');
      assert.match(pwd, /[a-z]/, 'Temporary password must contain lowercase letter');
      assert.match(pwd, /[0-9]/, 'Temporary password must contain digit');
      assert.match(pwd, /[!@#$%^&*?]/, 'Temporary password must contain special symbol');
      tempPasswords.add(pwd);
    }
    assert.equal(tempPasswords.size, 20, 'Generated temporary passwords must be unique and non-static');
    console.log('   ✓ Secure temporary password generator produces unique, strong credentials.\n');

    // ---------------------------------------------------------
    // 2. Employee Creation -> User ID + Temporary Credential + Email Dispatch
    // ---------------------------------------------------------
    console.log('2. Testing new employee creation & credential email dispatch...');
    dispatchedMessages.length = 0;
    const uniqueSuffix = Date.now().toString().slice(-5);
    const registeredEmail = `ananya.verma.${uniqueSuffix}@maestro.com`;

    const createdEmployee = await UserService.createEmployee(
      {
        employeeName: 'Ananya Verma',
        officialEmail: registeredEmail,
        departmentId: 1,
        designationId: 1,
        employmentType: 'FULL_TIME',
      },
      hrActor
    );

    assert.ok(createdEmployee.employeeCode, 'Employee code / User ID must be generated');
    const expectedUserId = createdEmployee.employeeCode.toLowerCase();
    assert.equal(createdEmployee.username, expectedUserId, 'User ID must match generated employee code');
    assert.equal(createdEmployee.mustChangePassword, true, 'New employee must require password change on first login');

    // Verify email delivery status on returned DTO
    assert.ok(createdEmployee.credentialEmail, 'EmployeeDto must include credentialEmail delivery status');
    assert.equal(createdEmployee.credentialEmail.sent, true, 'Credential email should be marked sent');
    assert.equal(createdEmployee.credentialEmail.status, 'SENT');
    assert.equal(createdEmployee.credentialEmail.recipientEmail, registeredEmail);

    // Verify dispatched email payload
    assert.equal(dispatchedMessages.length, 1, 'Exactly one email should be dispatched for new employee');
    const dispatched = dispatchedMessages[0];
    assert.equal(dispatched.to, registeredEmail, 'Email must be sent strictly to registered employee email');
    assert.ok(dispatched.text.includes('Ananya Verma'), 'Email must include employee name');
    assert.ok(dispatched.text.includes(expectedUserId), 'Email must include User ID');
    assert.ok(dispatched.text.includes(createdEmployee.employeeCode), 'Email must include Employee Code');
    assert.ok(
      dispatched.text.includes('Login URL:') && dispatched.text.includes('Login Instructions:'),
      'Email must include login instructions'
    );
    assert.ok(
      dispatched.text.toLowerCase().includes('change your password immediately after your first login'),
      'Email must instruct employee to change password after first login'
    );

    // Extract temporary password from the dispatched message and verify it authenticates the new user
    const matchPwd = dispatched.text.match(/Temporary Password:\s*(\S+)/);
    assert.ok(matchPwd && matchPwd[1], 'Dispatched email must contain generated temporary password');
    const extractedTempPassword = matchPwd[1];
    assert.notEqual(extractedTempPassword, '[REDACTED]', 'Live dispatched email must contain usable temporary credential');

    const authUser = await UserService.authenticateUser(expectedUserId, extractedTempPassword);
    assert.equal(
      authUser.email,
      registeredEmail,
      'New employee must be able to authenticate with the emailed User ID and temporary password'
    );
    console.log('   ✓ Employee created with User ID, temporary credential emailed to registered address, and login verified.\n');

    // ---------------------------------------------------------
    // 3. No Plaintext Password Storage or Logging
    // ---------------------------------------------------------
    console.log('3. Testing zero plaintext password storage in DTOs, outbox, and audit logs...');
    const serializedEmployee = JSON.stringify(createdEmployee);
    assert.ok(
      !serializedEmployee.includes(extractedTempPassword),
      'EmployeeDto must NEVER expose or store plaintext temporary password'
    );

    const userRecord = await UserService.getUserById(createdEmployee.userId!);
    assert.ok(userRecord, 'Created user DTO must exist');
    assert.ok(
      !JSON.stringify(userRecord).includes(extractedTempPassword),
      'UserDto must NEVER expose or store plaintext temporary password'
    );

    const outbox = EmailService.getEmailsForRecipient(registeredEmail);
    assert.equal(outbox.length, 1, 'Outbox record must exist for recipient');
    assert.ok(
      !JSON.stringify(outbox[0]).includes(extractedTempPassword),
      'Outbox diagnostic record must redact temporary password and never store it in plaintext'
    );
    assert.ok(
      outbox[0].textBody.includes('[REDACTED]'),
      'Outbox diagnostic body must show [REDACTED] in place of temporary password'
    );
    assert.deepEqual(outbox[0].contentChecks, {
      hasEmployeeName: true,
      hasUserId: true,
      hasTemporaryPassword: true,
      hasLoginInstructions: true,
      hasChangePasswordInstruction: true,
    });

    const recentAudits = AuditService.getMemoryAuditLogs();
    const serializedAudits = JSON.stringify(recentAudits);
    assert.ok(
      !serializedAudits.includes(extractedTempPassword),
      'Audit logs must NEVER contain plaintext temporary password'
    );
    const credAudit = recentAudits.find(
      (a) => a.action === 'USER_CREDENTIAL_EMAIL_SENT' && a.targetId === String(createdEmployee.userId)
    );
    assert.ok(credAudit, 'USER_CREDENTIAL_EMAIL_SENT audit event must be recorded');
    assert.equal(
      (credAudit.metadata as any)?.temporaryPassword,
      '[REDACTED]',
      'Audit metadata must explicitly redact temporaryPassword'
    );
    console.log('   ✓ Plaintext temporary password is never stored in DTOs, outbox records, or audit logs.\n');

    // ---------------------------------------------------------
    // 4. Recipient Security Protection (Never send to admin/other address)
    // ---------------------------------------------------------
    console.log('4. Testing strict recipient enforcement (reject non-registered/admin email)...');
    dispatchedMessages.length = 0;
    const emp2Email = `rohan.kapoor.${uniqueSuffix}@maestro.com`;
    const adminEmailAttempt = 'superadmin@maestro.com';

    const empWithMismatchedRecipient = await UserService.createEmployee(
      {
        employeeName: 'Rohan Kapoor',
        officialEmail: emp2Email,
        recipientEmail: adminEmailAttempt,
        departmentId: 1,
        designationId: 1,
      },
      superAdminActor
    );

    assert.equal(
      empWithMismatchedRecipient.credentialEmail?.sent,
      false,
      'Email must NOT be sent when recipientEmail differs from registered employee email'
    );
    assert.equal(empWithMismatchedRecipient.credentialEmail?.status, 'FAILED');
    assert.match(
      empWithMismatchedRecipient.credentialEmail?.error || '',
      /Security violation/i,
      'Error must report security violation for mismatched recipient'
    );
    assert.equal(
      dispatchedMessages.length,
      0,
      'Zero emails may be dispatched to admin or non-registered address'
    );
    console.log('   ✓ Credentials blocked from being sent to admin or any non-registered email address.\n');

    // ---------------------------------------------------------
    // 5. Email Delivery Failure Handling (No false success)
    // ---------------------------------------------------------
    console.log('5. Testing email delivery failure handling (transport failure & simulated failure)...');
    EmailService.setTransport(async () => {
      throw new Error('SMTP connection refused by upstream mail relay');
    });

    const emp3Email = `meera.nair.${uniqueSuffix}@maestro.com`;
    const empWithFailedEmail = await UserService.createEmployee(
      {
        employeeName: 'Meera Nair',
        officialEmail: emp3Email,
        departmentId: 1,
        designationId: 1,
      },
      superAdminActor
    );

    assert.equal(empWithFailedEmail.credentialEmail?.sent, false, 'Failed delivery must set sent=false');
    assert.equal(empWithFailedEmail.credentialEmail?.status, 'FAILED', 'Failed delivery must set status=FAILED');
    assert.match(
      empWithFailedEmail.credentialEmail?.error || '',
      /SMTP connection refused/i,
      'Failed delivery must preserve clear error message for admin'
    );

    const failureAudits = AuditService.getMemoryAuditLogs();
    const failedEmailAudit = failureAudits.find(
      (a) =>
        a.action === 'USER_CREDENTIAL_EMAIL_FAILED' &&
        a.targetId === String(empWithFailedEmail.userId)
    );
    assert.ok(failedEmailAudit, 'USER_CREDENTIAL_EMAIL_FAILED audit event must be logged on failure');
    assert.equal((failedEmailAudit.metadata as any)?.temporaryPassword, '[REDACTED]');

    // Restore transport and verify UserService.createUser also dispatches credentials properly
    dispatchedMessages.length = 0;
    EmailService.setTransport(async (msg) => {
      dispatchedMessages.push(msg);
      return { messageId: `<test-${Date.now()}@maestro.local>` };
    });

    const user4Email = `vikram.sethi.${uniqueSuffix}@maestro.com`;
    const createdUser = await UserService.createUser(
      {
        username: `vikram_${uniqueSuffix}`,
        email: user4Email,
        fullName: 'Vikram Sethi',
        role: 'EMPLOYEE',
        departmentId: 1,
      },
      superAdminActor
    );

    assert.equal(createdUser.credentialEmail?.sent, true);
    assert.equal(createdUser.credentialEmail?.recipientEmail, user4Email);
    assert.equal(dispatchedMessages.length, 1);
    assert.equal(dispatchedMessages[0].to, user4Email);
    assert.ok(dispatchedMessages[0].text.includes(`vikram_${uniqueSuffix}`));
    console.log('   ✓ Email delivery failures handled safely and UserService.createUser verified.\n');

    console.log('============================================================');
    console.log('ALL PHASE 1A EMAIL CREDENTIAL TESTS PASSED SUCCESSFULLY!');
    console.log('============================================================');
  } finally {
    EmailService.setTransport(null);
  }
}

runTests().catch((err) => {
  console.error('PHASE 1A TEST FAILURE:', err);
  process.exit(1);
});
