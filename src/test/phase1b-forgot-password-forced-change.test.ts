import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import express from 'express';
import { registerApiRoutes } from '../../server.ts';
import { UserService } from '../services/userService.ts';
import { EmailService, DispatchedEmailMessage } from '../services/emailService.ts';
import { AuditService } from '../services/auditService.ts';
import {
  loginUserSession,
  logoutUserSession,
  mustUserChangePassword,
  clearMustChangePasswordFlag,
  canAccessModule,
  canAccessFrontendRoute,
  setActiveRole,
} from '../lib/api.ts';

async function runPhase1BTests() {
  console.log('====================================================================');
  console.log('PHASE 1B — FORGOT PASSWORD & FORCED FIRST-LOGIN PASSWORD CHANGE TEST');
  console.log('====================================================================\n');

  UserService.resetMemoryStores();
  AuditService.resetMemoryAuditLogs();
  EmailService.resetOutbox();

  const dispatchedEmails: DispatchedEmailMessage[] = [];
  EmailService.setTransport(async (msg) => {
    dispatchedEmails.push(msg);
    return { messageId: `<phase1b-${Date.now()}@maestro.local>` };
  });

  const app = express();
  app.use(express.json({ limit: '15mb' }));
  registerApiRoutes(app);
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address() as { port: number };
  const baseUrl = `http://127.0.0.1:${addr.port}`;

  const superAdminHeaders = {
    'Content-Type': 'application/json',
    'x-user-role': 'SUPER_ADMIN',
    'x-user-id': '1',
    'x-employee-id': '1',
    'x-username': 'superadmin',
  };

  try {
    // ------------------------------------------------------------------
    // 1. Forgot Password UI, Reset Password UI & Forced Change UI Exist
    // ------------------------------------------------------------------
    console.log('1. Verifying Forgot Password, Reset Password & Forced Change UI...');
    const appSrc = fs.readFileSync(path.join(process.cwd(), 'src/App.tsx'), 'utf-8');
    assert.ok(appSrc.includes('id="btn-forgot-password"'), 'Login screen must include #btn-forgot-password');
    assert.ok(appSrc.includes('Forgot Password?'), 'Login screen must display "Forgot Password?" action');
    assert.ok(appSrc.includes('id="forgot-password-screen"'), 'Forgot Password screen must exist');
    assert.ok(appSrc.includes('id="input-forgot-identifier"'), 'Forgot Password identifier input must exist');
    assert.ok(appSrc.includes('id="btn-forgot-submit"'), 'Forgot Password submit button must exist');
    assert.ok(appSrc.includes('id="forgot-password-generic-response"'), 'Safe generic response alert must exist');
    assert.ok(appSrc.includes('id="reset-password-screen"'), 'Reset Password screen must exist');
    assert.ok(appSrc.includes('id="input-reset-token"'), 'Reset token input must exist');
    assert.ok(appSrc.includes('id="input-reset-new-password"'), 'Reset new password input must exist');
    assert.ok(appSrc.includes('id="input-reset-confirm-password"'), 'Reset confirm password input must exist');
    assert.ok(appSrc.includes('id="btn-reset-password-submit"'), 'Reset password submit button must exist');
    assert.ok(appSrc.includes('id="forced-password-change-screen"'), 'Forced first-login password change screen must exist');
    assert.ok(appSrc.includes('id="input-forced-current-password"'), 'Forced change current password input must exist');
    assert.ok(appSrc.includes('id="input-forced-new-password"'), 'Forced change new password input must exist');
    assert.ok(appSrc.includes('id="input-forced-confirm-password"'), 'Forced change confirm password input must exist');
    console.log('   ✓ Forgot Password UI, Reset Password UI, and Forced Password Change UI verified.\n');

    // ------------------------------------------------------------------
    // 2 & 3. Forgot Password Request & Safe Generic Response
    // ------------------------------------------------------------------
    console.log('2 & 3. Testing Forgot Password request and safe generic response for known/unknown accounts...');
    dispatchedEmails.length = 0;

    // Unknown account request
    const unknownRes = await fetch(`${baseUrl}/api/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-auth-state': 'LOGGED_OUT' },
      body: JSON.stringify({ identifier: 'nonexistent.user.99999@maestro.com' }),
    });
    const unknownBody = await unknownRes.json();
    assert.equal(unknownRes.status, 200, 'Unknown account forgot-password must return HTTP 200');
    assert.equal(unknownBody.success, true);
    assert.equal(
      dispatchedEmails.length,
      0,
      'No email should be dispatched for nonexistent account'
    );

    // Known account request (Alice Johnson, user 4, email: alice@company.com)
    const knownRes = await fetch(`${baseUrl}/api/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-auth-state': 'LOGGED_OUT' },
      body: JSON.stringify({ identifier: 'alice_emp' }),
    });
    const knownBody = await knownRes.json();
    assert.equal(knownRes.status, 200, 'Known account forgot-password must return HTTP 200');
    assert.equal(knownBody.success, true);
    assert.equal(
      knownBody.message,
      unknownBody.message,
      'Response message must be identical for known and unknown accounts so account existence is never revealed'
    );
    assert.ok(
      !JSON.stringify(knownBody).includes('alice@company.com') &&
        !JSON.stringify(knownBody).includes('token'),
      'Forgot password HTTP response must never leak email or reset token'
    );
    console.log('   ✓ Forgot Password endpoint returns identical safe generic response for known & unknown accounts.\n');

    // ------------------------------------------------------------------
    // 4 & 5. Reset Email Generation, Hashed Token Storage & Valid Token Verification
    // ------------------------------------------------------------------
    console.log('4 & 5. Testing reset email generation, SHA-256 hashed token storage, and valid token verification...');
    assert.equal(dispatchedEmails.length, 1, 'Exactly one reset email must be sent for known account');
    const resetEmail = dispatchedEmails[0];
    assert.equal(resetEmail.to, 'alice@company.com', 'Reset email must be sent strictly to registered email');
    assert.ok(
      resetEmail.text.includes('#reset-password?token='),
      'Reset email must include reset link with token parameter'
    );
    assert.ok(
      resetEmail.text.includes('expire in 15 minutes') && resetEmail.text.includes('used once'),
      'Reset email must include expiration and single-use instructions'
    );

    const tokenMatch = resetEmail.text.match(/One-Time Reset Token:\s*([a-f0-9]{64})/i);
    assert.ok(tokenMatch && tokenMatch[1], 'Reset email must contain 64-hex-char (256-bit) cryptographically secure token');
    const rawResetToken = tokenMatch[1];

    // Verify backend stores ONLY the SHA-256 hash of the token and NEVER the raw token
    const storedTokenRecords = UserService.getStoredPasswordResetTokenRecords();
    assert.ok(storedTokenRecords.length >= 1, 'Stored token record must exist');
    assert.ok(
      !JSON.stringify(storedTokenRecords).includes(rawResetToken),
      'Backend token store must NEVER store the raw reset token'
    );
    const expectedHash = crypto.createHash('sha256').update(rawResetToken).digest('hex');
    assert.equal(
      storedTokenRecords[0].tokenHash,
      expectedHash,
      'Backend token store must store SHA-256 hash of the reset token'
    );

    // Verify valid token via API
    const verifyValidRes = await fetch(
      `${baseUrl}/api/auth/verify-reset-token?token=${encodeURIComponent(rawResetToken)}`,
      { headers: { 'x-auth-state': 'LOGGED_OUT' } }
    );
    const verifyValidBody = await verifyValidRes.json();
    assert.equal(verifyValidRes.status, 200);
    assert.equal(verifyValidBody.valid, true);

    // Verify invalid/random token is rejected
    const verifyInvalidRes = await fetch(
      `${baseUrl}/api/auth/verify-reset-token?token=0000000000000000000000000000000000000000000000000000000000000000`,
      { headers: { 'x-auth-state': 'LOGGED_OUT' } }
    );
    assert.equal(verifyInvalidRes.status, 400, 'Invalid reset token must be rejected with HTTP 400');
    console.log('   ✓ Reset email dispatched, token stored as SHA-256 hash only, and token verification works.\n');

    // ------------------------------------------------------------------
    // 6. Expired Reset Token Rejection
    // ------------------------------------------------------------------
    console.log('6. Testing expired reset token rejection...');
    dispatchedEmails.length = 0;
    await fetch(`${baseUrl}/api/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-auth-state': 'LOGGED_OUT' },
      body: JSON.stringify({ identifier: 'hruser', expiresInMs: -5000 }),
    });
    assert.equal(dispatchedEmails.length, 1);
    const expiredTokenMatch = dispatchedEmails[0].text.match(/One-Time Reset Token:\s*([a-f0-9]{64})/i);
    const expiredToken = expiredTokenMatch![1];

    const verifyExpiredRes = await fetch(`${baseUrl}/api/auth/verify-reset-token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-auth-state': 'LOGGED_OUT' },
      body: JSON.stringify({ token: expiredToken }),
    });
    const verifyExpiredBody = await verifyExpiredRes.json();
    assert.equal(verifyExpiredRes.status, 400, 'Expired token verification must fail with HTTP 400');
    assert.match(verifyExpiredBody.error || '', /expired/i);

    const resetWithExpiredRes = await fetch(`${baseUrl}/api/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-auth-state': 'LOGGED_OUT' },
      body: JSON.stringify({
        token: expiredToken,
        newPassword: 'NewHrPassword@123',
        confirmPassword: 'NewHrPassword@123',
      }),
    });
    const resetWithExpiredBody = await resetWithExpiredRes.json();
    assert.equal(resetWithExpiredRes.status, 400, 'Resetting password with expired token must fail with HTTP 400');
    assert.match(resetWithExpiredBody.error || '', /expired/i);
    console.log('   ✓ Expired reset tokens are strictly rejected.\n');

    // ------------------------------------------------------------------
    // 7 & 8. Successful Password Reset & Single-Use Token Invalidation
    // ------------------------------------------------------------------
    console.log('7 & 8. Testing successful password reset and single-use token invalidation...');
    // First test mismatched confirmPassword rejection
    const mismatchRes = await fetch(`${baseUrl}/api/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-auth-state': 'LOGGED_OUT' },
      body: JSON.stringify({
        token: rawResetToken,
        newPassword: 'AliceReset@2026!',
        confirmPassword: 'DifferentPassword@2026!',
      }),
    });
    assert.equal(mismatchRes.status, 400, 'Mismatched confirmPassword must be rejected before consuming token');

    // Now perform valid password reset for Alice using rawResetToken
    const validResetRes = await fetch(`${baseUrl}/api/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-auth-state': 'LOGGED_OUT' },
      body: JSON.stringify({
        token: rawResetToken,
        newPassword: 'AliceReset@2026!',
        confirmPassword: 'AliceReset@2026!',
      }),
    });
    const validResetBody = await validResetRes.json();
    assert.equal(validResetRes.status, 200, 'Valid password reset must succeed with HTTP 200');
    assert.equal(validResetBody.success, true);

    // Attempt to reuse the same token a second time -> must fail!
    const reuseTokenRes = await fetch(`${baseUrl}/api/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-auth-state': 'LOGGED_OUT' },
      body: JSON.stringify({
        token: rawResetToken,
        newPassword: 'AnotherPassword@2026!',
        confirmPassword: 'AnotherPassword@2026!',
      }),
    });
    const reuseTokenBody = await reuseTokenRes.json();
    assert.equal(reuseTokenRes.status, 400, 'Reusing an already-used reset token must be rejected');
    assert.match(reuseTokenBody.error || '', /already been used/i);

    // Verify Alice can now log in with her new password and old password no longer works
    const oldLoginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: 'alice_emp', password: 'Employee@123' }),
    });
    assert.equal(oldLoginRes.status, 401, 'Old password must be rejected after reset');

    const newLoginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: 'alice_emp', password: 'AliceReset@2026!' }),
    });
    const newLoginBody = await newLoginRes.json();
    assert.equal(newLoginRes.status, 200, 'Login with new reset password must succeed');
    assert.equal(newLoginBody.mustChangePassword, false, 'Reset password clears any forced-change flag');

    // Restore Alice's default password for any subsequent suites
    await UserService.resetPassword(4, 'Employee@123');
    console.log('   ✓ Password reset succeeded, single-use token invalidated, and login verified.\n');

    // ------------------------------------------------------------------
    // 9 & 10. Temporary User Forced to Change Password on First Login & Cannot Bypass
    // ------------------------------------------------------------------
    console.log('9 & 10. Testing forced password change on first login & anti-bypass enforcement...');
    dispatchedEmails.length = 0;
    const uniqueSuffix = Date.now().toString().slice(-5);
    const newEmpEmail = `divya.sharma.${uniqueSuffix}@maestro.com`;

    const createEmpRes = await fetch(`${baseUrl}/api/employees`, {
      method: 'POST',
      headers: superAdminHeaders,
      body: JSON.stringify({
        employeeName: 'Divya Sharma',
        officialEmail: newEmpEmail,
        departmentId: 1,
        designationId: 4,
        employmentType: 'FULL_TIME',
      }),
    });
    const createEmpBody = await createEmpRes.json();
    assert.equal(createEmpRes.status, 201);
    assert.equal(dispatchedEmails.length, 1);

    const tempPwdMatch = dispatchedEmails[0].text.match(/Temporary Password:\s*(\S+)/);
    const tempPassword = tempPwdMatch![1];
    const newEmployeeUserId = createEmpBody.employee.username;

    // New employee logs in using temporary password
    const firstLoginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: newEmployeeUserId, password: tempPassword }),
    });
    const firstLoginBody = await firstLoginRes.json();
    assert.equal(firstLoginRes.status, 200, 'First login with temporary password must authenticate');
    assert.equal(
      firstLoginBody.mustChangePassword,
      true,
      'Login response must set mustChangePassword = true for newly created user'
    );
    assert.equal(
      firstLoginBody.user.mustChangePassword,
      true,
      'Login user object must include mustChangePassword = true'
    );

    // Frontend session & navigation bypass checks
    const clientSession = loginUserSession(firstLoginBody.user);
    assert.equal(clientSession.mustChangePassword, true);
    assert.equal(mustUserChangePassword(), true);
    assert.equal(
      canAccessModule('dashboard'),
      false,
      'User with mustChangePassword=true cannot access Dashboard module'
    );
    assert.equal(
      canAccessModule('my-leave'),
      false,
      'User with mustChangePassword=true cannot access My Leave module'
    );
    assert.equal(
      canAccessModule('my-profile'),
      false,
      'User with mustChangePassword=true cannot access My Profile module'
    );
    assert.equal(
      canAccessFrontendRoute('#dashboard'),
      false,
      'User with mustChangePassword=true cannot bypass via direct URL #dashboard'
    );
    assert.equal(
      canAccessFrontendRoute('/my-leave'),
      false,
      'User with mustChangePassword=true cannot bypass via direct URL /my-leave'
    );
    assert.equal(
      canAccessFrontendRoute('#change-password'),
      true,
      'User with mustChangePassword=true is restricted strictly to #change-password'
    );

    // Backend API bypass checks: direct API calls to normal endpoints must return 403 PASSWORD_CHANGE_REQUIRED
    const newEmpHeaders = {
      'Content-Type': 'application/json',
      'x-user-role': 'EMPLOYEE',
      'x-user-id': String(firstLoginBody.user.id),
      'x-employee-id': String(firstLoginBody.user.employeeId),
      'x-username': firstLoginBody.user.username,
    };

    const blockedLeaveRes = await fetch(
      `${baseUrl}/api/leave-balances?employeeId=${firstLoginBody.user.employeeId}`,
      { headers: newEmpHeaders }
    );
    const blockedLeaveBody = await blockedLeaveRes.json();
    assert.equal(
      blockedLeaveRes.status,
      403,
      'Direct API request to /api/leave-balances must be blocked with 403 before password change'
    );
    assert.equal(blockedLeaveBody.code, 'PASSWORD_CHANGE_REQUIRED');
    assert.equal(blockedLeaveBody.mustChangePassword, true);

    const blockedScheduleRes = await fetch(
      `${baseUrl}/api/employees/${firstLoginBody.user.employeeId}/schedule`,
      { headers: newEmpHeaders }
    );
    assert.equal(
      blockedScheduleRes.status,
      403,
      'Direct API request to /api/employees/:id/schedule must be blocked with 403 before password change'
    );

    // Attempting to "change" password to the exact same temporary password must be rejected
    const samePwdRes = await fetch(`${baseUrl}/api/users/change-password`, {
      method: 'POST',
      headers: newEmpHeaders,
      body: JSON.stringify({
        userId: firstLoginBody.user.id,
        currentPassword: tempPassword,
        newPassword: tempPassword,
        confirmPassword: tempPassword,
      }),
    });
    assert.equal(samePwdRes.status, 400, 'Setting new password identical to temporary password must be rejected');

    // Now complete the forced password change with a new strong password
    const newPermanentPassword = 'DivyaPermanent@2026!';
    const changePwdRes = await fetch(`${baseUrl}/api/users/change-password`, {
      method: 'POST',
      headers: newEmpHeaders,
      body: JSON.stringify({
        userId: firstLoginBody.user.id,
        currentPassword: tempPassword,
        newPassword: newPermanentPassword,
        confirmPassword: newPermanentPassword,
      }),
    });
    const changePwdBody = await changePwdRes.json();
    assert.equal(changePwdRes.status, 200, 'Forced password change must succeed');
    assert.equal(changePwdBody.mustChangePassword, false, 'mustChangePassword must be false after password change');

    clearMustChangePasswordFlag();
    assert.equal(mustUserChangePassword(), false);
    assert.equal(canAccessModule('dashboard'), true, 'Dashboard access unlocked after forced password change');
    assert.equal(canAccessModule('my-leave'), true, 'My Leave access unlocked after forced password change');

    // Verify API calls now succeed for the employee
    const unlockedBalanceRes = await fetch(
      `${baseUrl}/api/leave-balances?employeeId=${firstLoginBody.user.employeeId}`,
      { headers: newEmpHeaders }
    );
    assert.equal(
      unlockedBalanceRes.status,
      200,
      'API access to /api/leave-balances succeeds after forced password change'
    );
    console.log('   ✓ Forced password change on first login enforced across UI & API and unlocked after change.\n');

    // ------------------------------------------------------------------
    // 11. Existing Normal User Login Remains Unchanged
    // ------------------------------------------------------------------
    console.log('11. Testing existing normal user login remains unchanged...');
    const normalSaLogin = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: 'superadmin', password: 'SuperAdmin@123' }),
    });
    const normalSaBody = await normalSaLogin.json();
    assert.equal(normalSaLogin.status, 200);
    assert.equal(
      normalSaBody.mustChangePassword,
      false,
      'Existing Super Admin user must have mustChangePassword = false'
    );

    const normalHrLogin = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: 'hruser', password: 'HrManager@123' }),
    });
    const normalHrBody = await normalHrLogin.json();
    assert.equal(normalHrLogin.status, 200);
    assert.equal(
      normalHrBody.mustChangePassword,
      false,
      'Existing HR user must have mustChangePassword = false'
    );
    console.log('   ✓ Existing users log in normally without forced password change interruption.\n');

    // ------------------------------------------------------------------
    // 12. Password / Token Data Never Exposed in Logs or API Responses
    // ------------------------------------------------------------------
    console.log('12. Verifying no passwords or reset tokens are exposed in audit logs, outbox, or APIs...');
    const allAuditLogs = AuditService.getMemoryAuditLogs();
    const auditLogsJson = JSON.stringify(allAuditLogs);
    assert.ok(!auditLogsJson.includes(rawResetToken), 'Audit logs must NEVER contain raw reset token');
    assert.ok(!auditLogsJson.includes(expectedHash), 'Audit logs must NEVER contain reset token hash');
    assert.ok(!auditLogsJson.includes(tempPassword), 'Audit logs must NEVER contain temporary password');
    assert.ok(!auditLogsJson.includes(newPermanentPassword), 'Audit logs must NEVER contain new permanent password');
    assert.ok(!auditLogsJson.includes('AliceReset@2026!'), 'Audit logs must NEVER contain reset password');

    const outboxRecords = EmailService.getOutbox();
    const outboxJson = JSON.stringify(outboxRecords);
    assert.ok(!outboxJson.includes(rawResetToken), 'Outbox diagnostic records must redact raw reset token');
    assert.ok(!outboxJson.includes(tempPassword), 'Outbox diagnostic records must redact temporary password');

    setActiveRole('SUPER_ADMIN', 1, 1);
    console.log('   ✓ Zero exposure of passwords, hashes, or reset tokens in logs or API responses.\n');

    console.log('====================================================================');
    console.log('ALL 12 PHASE 1B TEST GROUPS PASSED SUCCESSFULLY!');
    console.log('====================================================================');
  } finally {
    EmailService.setTransport(null);
    await logoutUserSession().catch(() => {});
    setActiveRole('SUPER_ADMIN', 1, 1);
    UserService.resetMemoryStores();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

runPhase1BTests().catch((err) => {
  console.error('PHASE 1B TEST SUITE FAILED:', err);
  process.exit(1);
});
