import fs from 'fs';
import path from 'path';
import http from 'http';
import express from 'express';
import { registerApiRoutes } from '../../server.ts';
import { formatAuditLogForDisplay } from '../components/SystemAuditAdmin.tsx';
import { UserService } from '../services/userService.ts';
import { AuditService } from '../services/auditService.ts';
import { LeaveService } from '../services/leaveService.ts';
import { LeaveRequestService } from '../services/leaveRequestService.ts';
import { ApprovalService } from '../services/approvalService.ts';
import { ShiftService } from '../services/shiftService.ts';
import { HolidayService } from '../services/holidayService.ts';
import { WorkingDaysService } from '../services/workingDaysService.ts';
import { OvertimeService } from '../services/overtimeService.ts';
import { NotificationService } from '../services/notificationService.ts';
import {
  loginUserSession,
  logoutUserSession,
  setActiveRole,
  canAccessModule,
  canAccessAdminTab,
  canAccessFrontendRoute,
  formatRoleDisplayName,
} from '../lib/api.ts';

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string, details?: any) {
  if (condition) {
    console.log(`[PASS] ${message}`);
    passed++;
  } else {
    console.error(`[FAIL] ${message}`, details !== undefined ? details : '');
    failed++;
  }
}

function resetStores() {
  UserService.resetMemoryStores();
  ShiftService.resetMemoryStores();
  WorkingDaysService.resetMemoryHolidays();
  HolidayService.resetMemoryHolidays();
  LeaveService.resetMemoryStores();
  LeaveRequestService.resetMemoryStores();
  OvertimeService.resetMemoryStores();
  NotificationService.resetMemoryNotifications();
  AuditService.resetMemoryAuditLogs();
}

const VALID_PNG_BYTES = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
  0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41,
  0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
  0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00,
  0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
  0x42, 0x60, 0x82,
]);

const VALID_JPEG_BYTES = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46,
  0x49, 0x46, 0x00, 0x01, 0x01, 0x01, 0x00, 0x48,
  0x00, 0x48, 0x00, 0x00, 0xff, 0xd9,
]);

const VALID_WEBP_BYTES = Buffer.from([
  0x52, 0x49, 0x46, 0x46, 0x14, 0x00, 0x00, 0x00,
  0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x20,
  0x08, 0x00, 0x00, 0x00, 0x30, 0x01, 0x00, 0x9d,
  0x01, 0x2a, 0x01, 0x00,
]);

async function runTests() {
  resetStores();

  const app = express();
  app.use(express.json({ limit: '15mb' }));
  registerApiRoutes(app);
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address() as { port: number };
  const baseUrl = `http://127.0.0.1:${addr.port}`;

  try {
    console.log('\n================================================================');
    console.log('1. UNWANTED USER_PASSWORD_RESET AUDIT ON LOGIN REGRESSION');
    console.log('================================================================');

    // Step 1: Record current audit state before login
    const logsBeforeLogin = await AuditService.getAuditLogs({ limit: 500 });
    const resetLogsBeforeLogin = logsBeforeLogin.filter((l) => l.action === 'USER_PASSWORD_RESET');

    // Step 2: Login as Super Admin via POST /api/auth/login
    const saLoginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        usernameOrEmail: 'superadmin',
        password: 'SuperAdmin@123',
      }),
    });
    const saLoginBody = await saLoginRes.json();

    assert(
      saLoginRes.status === 200 && saLoginBody.authenticated === true && saLoginBody.user?.roleName === 'SUPER_ADMIN',
      '1.1 Super Admin login succeeds and returns authenticated user profile'
    );

    // Step 3: Verify login did NOT create a new USER_PASSWORD_RESET
    const logsAfterLogin = await AuditService.getAuditLogs({ limit: 500 });
    const resetLogsAfterLogin = logsAfterLogin.filter((l) => l.action === 'USER_PASSWORD_RESET');
    const loginAuditLogs = logsAfterLogin.filter((l) => l.action === 'USER_LOGIN');

    assert(
      resetLogsAfterLogin.length === resetLogsBeforeLogin.length,
      '1.2 Normal Super Admin login does NOT generate any USER_PASSWORD_RESET audit event',
      { beforeCount: resetLogsBeforeLogin.length, afterCount: resetLogsAfterLogin.length }
    );
    assert(
      loginAuditLogs.length > 0 && loginAuditLogs[0].actorRole === 'SUPER_ADMIN',
      '1.3 Normal Super Admin login records USER_LOGIN audit event'
    );

    // Also verify operateUserProfile with empty/omitted resetPassword does NOT trigger USER_PASSWORD_RESET
    const operateNoResetRes = await fetch(`${baseUrl}/api/users/4/profile-operate`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'x-user-role': 'SUPER_ADMIN',
        'x-user-id': '1',
      },
      body: JSON.stringify({
        mobile: '+1-555-0199',
        resetPassword: { newPassword: '   ' },
      }),
    });
    assert(operateNoResetRes.status === 200, '1.4 operateUserProfile without actual newPassword succeeds');
    const logsAfterOperate = await AuditService.getAuditLogs({ limit: 500 });
    const resetLogsAfterOperate = logsAfterOperate.filter((l) => l.action === 'USER_PASSWORD_RESET');
    assert(
      resetLogsAfterOperate.length === resetLogsBeforeLogin.length,
      '1.5 operateUserProfile with blank password does NOT generate USER_PASSWORD_RESET'
    );

    // Step 4: Perform an actual password reset
    const actualResetRes = await fetch(`${baseUrl}/api/users/4/reset-password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-role': 'SUPER_ADMIN',
        'x-user-id': '1',
      },
      body: JSON.stringify({
        newPassword: 'ResetPassword@2026!',
      }),
    });
    assert(actualResetRes.status === 200, '1.6 Actual Super Admin password reset succeeds');

    // Step 5: Verify the password-reset audit is created
    const logsAfterActualReset = await AuditService.getAuditLogs({ limit: 500 });
    const resetLogsAfterActualReset = logsAfterActualReset.filter((l) => l.action === 'USER_PASSWORD_RESET');
    assert(
      resetLogsAfterActualReset.length === resetLogsBeforeLogin.length + 1,
      '1.7 Actual password reset creates exactly one USER_PASSWORD_RESET audit event'
    );

    // Step 6: Perform actual user password change & verify USER_PASSWORD_CHANGED
    const actualChangeRes = await fetch(`${baseUrl}/api/users/4/change-password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-role': 'EMPLOYEE',
        'x-user-id': '4',
      },
      body: JSON.stringify({
        currentPassword: 'ResetPassword@2026!',
        newPassword: 'Employee@123',
      }),
    });
    assert(actualChangeRes.status === 200, '1.8 Actual user self-service password change succeeds');

    const logsAfterChange = await AuditService.getAuditLogs({ limit: 500 });
    const changeLogs = logsAfterChange.filter((l) => l.action === 'USER_PASSWORD_CHANGED');
    assert(changeLogs.length >= 1, '1.9 Actual user password change creates USER_PASSWORD_CHANGED audit event');

    // Verify sensitive password values remain redacted
    const latestResetMeta = JSON.stringify(resetLogsAfterActualReset[0]?.metadata || {});
    const latestChangeMeta = JSON.stringify(changeLogs[0]?.metadata || {});
    assert(
      latestResetMeta.includes('[REDACTED]') &&
        !latestResetMeta.includes('ResetPassword@2026!') &&
        !latestResetMeta.includes('hashed_') &&
        latestChangeMeta.includes('[REDACTED]') &&
        !latestChangeMeta.includes('Employee@123') &&
        !latestChangeMeta.includes('hashed_'),
      '1.10 Sensitive password values and hashes are strictly redacted as [REDACTED] in audit metadata'
    );

    const profileAfterPwdOpsRes = await fetch(`${baseUrl}/api/users/4/complete-profile`, {
      headers: {
        'x-user-role': 'SUPER_ADMIN',
        'x-user-id': '1',
      },
    });
    const profileAfterPwdOpsBody = await profileAfterPwdOpsRes.json();
    const profileAfterPwdOpsStr = JSON.stringify(profileAfterPwdOpsBody);
    const profileAuditHasReset = (profileAfterPwdOpsBody?.profile?.auditLogs || []).some(
      (l: any) => l.action === 'USER_PASSWORD_RESET' && JSON.stringify(l.metadata || {}).includes('[REDACTED]')
    );
    assert(
      profileAfterPwdOpsRes.status === 200 &&
        profileAuditHasReset &&
        !profileAfterPwdOpsStr.includes('ResetPassword@2026!') &&
        !profileAfterPwdOpsStr.includes('Employee@123') &&
        !profileAfterPwdOpsStr.includes('hashed_') &&
        !profileAfterPwdOpsStr.includes('passwordHash'),
      '1.11 Complete profile response preserves [REDACTED] audit history and never exposes passwordHash or actual password/hash values'
    );

    console.log('\n================================================================');
    console.log('2. PROFILE PHOTO POST / PUT / DELETE ENDPOINT VERIFICATION');
    console.log('================================================================');

    // 2.1 POST /api/users/1/profile-photo by Super Admin
    const postPhoto1Res = await fetch(`${baseUrl}/api/users/1/profile-photo`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-role': 'SUPER_ADMIN',
        'x-user-id': '1',
      },
      body: JSON.stringify({
        fileName: 'superadmin-avatar.png',
        mimeType: 'image/png',
        contentBase64: VALID_PNG_BYTES.toString('base64'),
      }),
    });
    const postPhoto1Body = await postPhoto1Res.json();
    assert(
      postPhoto1Res.status === 200 &&
        postPhoto1Body.profilePhoto?.hasProfilePhoto === true &&
        typeof postPhoto1Body.profilePhoto?.profilePhotoUrl === 'string',
      '2.1 POST /api/users/1/profile-photo succeeds (200 OK) for Super Admin and returns profilePhotoUrl',
      { status: postPhoto1Res.status, body: postPhoto1Body }
    );

    // 2.2 PUT /api/users/1/profile-photo by Super Admin (JPEG)
    const putPhoto1Res = await fetch(`${baseUrl}/api/users/1/profile-photo`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'x-user-role': 'SUPER_ADMIN',
        'x-user-id': '1',
      },
      body: JSON.stringify({
        fileName: 'superadmin-avatar.jpg',
        mimeType: 'image/jpeg',
        contentBase64: VALID_JPEG_BYTES.toString('base64'),
      }),
    });
    const putPhoto1Body = await putPhoto1Res.json();
    assert(
      putPhoto1Res.status === 200 &&
        putPhoto1Body.profilePhoto?.mimeType === 'image/jpeg',
      '2.2 PUT /api/users/1/profile-photo succeeds (200 OK) for JPEG upload'
    );

    // 2.3 WEBP upload & binary image retrieval
    const webpPhoto1Res = await fetch(`${baseUrl}/api/users/1/profile-photo`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-role': 'SUPER_ADMIN',
        'x-user-id': '1',
      },
      body: JSON.stringify({
        fileName: 'superadmin-avatar.webp',
        mimeType: 'image/webp',
        contentBase64: VALID_WEBP_BYTES.toString('base64'),
      }),
    });
    assert(webpPhoto1Res.status === 200, '2.3 POST /api/users/1/profile-photo accepts valid WEBP image');

    const imageGetRes = await fetch(`${baseUrl}/api/users/1/profile-photo/image`, {
      headers: { 'x-user-role': 'SUPER_ADMIN', 'x-user-id': '1' },
    });
    const imageGetBuf = Buffer.from(await imageGetRes.arrayBuffer());
    assert(
      imageGetRes.status === 200 &&
        imageGetRes.headers.get('content-type') === 'image/webp' &&
        imageGetBuf.equals(VALID_WEBP_BYTES),
      '2.4 GET /api/users/1/profile-photo/image serves exact binary bytes and Content-Type'
    );

    // 2.5 Super Admin can manage another user's photo (user 4)
    const saManageOtherRes = await fetch(`${baseUrl}/api/users/4/profile-photo`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-role': 'SUPER_ADMIN',
        'x-user-id': '1',
      },
      body: JSON.stringify({
        fileName: 'alice-photo.png',
        mimeType: 'image/png',
        contentBase64: VALID_PNG_BYTES.toString('base64'),
      }),
    });
    assert(saManageOtherRes.status === 200, '2.5 Super Admin can upload another user profile photo (POST /api/users/4/profile-photo)');

    // 2.6 Normal user can manage own photo (user 4 -> user 4)
    const selfPhotoRes = await fetch(`${baseUrl}/api/users/4/profile-photo`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-role': 'EMPLOYEE',
        'x-user-id': '4',
      },
      body: JSON.stringify({
        fileName: 'alice-self.png',
        mimeType: 'image/png',
        contentBase64: VALID_PNG_BYTES.toString('base64'),
      }),
    });
    assert(selfPhotoRes.status === 200, '2.6 Normal user can upload their own profile photo');

    // 2.7 Normal user modifying another user's photo returns 403
    const otherUserForbiddenPost = await fetch(`${baseUrl}/api/users/1/profile-photo`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-role': 'EMPLOYEE',
        'x-user-id': '4',
      },
      body: JSON.stringify({
        fileName: 'hack.png',
        mimeType: 'image/png',
        contentBase64: VALID_PNG_BYTES.toString('base64'),
      }),
    });
    const otherUserForbiddenDelete = await fetch(`${baseUrl}/api/users/1/profile-photo`, {
      method: 'DELETE',
      headers: {
        'x-user-role': 'EMPLOYEE',
        'x-user-id': '4',
      },
    });
    assert(
      otherUserForbiddenPost.status === 403 && otherUserForbiddenDelete.status === 403,
      '2.7 Non-Super Admin attempting to POST or DELETE another user photo receives HTTP 403 Forbidden'
    );

    // 2.8 Magic-byte validation, invalid MIME, path traversal, and 5 MB size limit
    const badMagicRes = await fetch(`${baseUrl}/api/users/1/profile-photo`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-role': 'SUPER_ADMIN',
        'x-user-id': '1',
      },
      body: JSON.stringify({
        fileName: 'spoofed.png',
        mimeType: 'image/png',
        contentBase64: Buffer.from('not-an-image-at-all').toString('base64'),
      }),
    });
    const pathTraversalRes = await fetch(`${baseUrl}/api/users/1/profile-photo`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-role': 'SUPER_ADMIN',
        'x-user-id': '1',
      },
      body: JSON.stringify({
        fileName: '../../etc/passwd.png',
        mimeType: 'image/png',
        contentBase64: VALID_PNG_BYTES.toString('base64'),
      }),
    });
    const pathTraversalBody = await pathTraversalRes.json();
    assert(
      badMagicRes.status === 400 && pathTraversalRes.status === 400,
      '2.8 Spoofed magic bytes and path traversal filenames are strictly rejected with HTTP 400'
    );

    // 2.9 Persistence across re-login & DELETE /api/users/1/profile-photo
    const reloginWithPhoto = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usernameOrEmail: 'superadmin', password: 'SuperAdmin@123' }),
    });
    const reloginPhotoBody = await reloginWithPhoto.json();
    assert(
      reloginWithPhoto.status === 200 &&
        Boolean(reloginPhotoBody.user?.profilePhotoUrl),
      '2.9 Profile photo URL persists across login sessions'
    );

    const deletePhoto1Res = await fetch(`${baseUrl}/api/users/1/profile-photo`, {
      method: 'DELETE',
      headers: {
        'x-user-role': 'SUPER_ADMIN',
        'x-user-id': '1',
      },
    });
    const deletePhoto1Body = await deletePhoto1Res.json();
    assert(
      deletePhoto1Res.status === 200 && deletePhoto1Body.profilePhoto?.hasProfilePhoto === false,
      '2.10 DELETE /api/users/1/profile-photo removes photo and returns hasProfilePhoto=false'
    );

    console.log('\n================================================================');
    console.log('3. DYNAMIC ROLE CREATION (CUSTOM_ROLE_TEST) END-TO-END');
    console.log('================================================================');

    // 3.1 Create CUSTOM_ROLE_TEST via API with limited permissions (REPORT_VIEW + basic self-service)
    const createRoleRes = await fetch(`${baseUrl}/api/roles`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-role': 'SUPER_ADMIN',
        'x-user-id': '1',
      },
      body: JSON.stringify({
        name: 'CUSTOM_ROLE_TEST',
        description: 'Custom test role with limited Reports & Self-Service access',
        permissions: [
          'LEAVE_APPLY',
          'LEAVE_VIEW_OWN',
          'PROFILE_VIEW_OWN',
          'PROFILE_EDIT_BASIC',
          'SCHEDULE_VIEW_OWN',
          'REPORT_VIEW',
        ],
      }),
    });
    const createRoleBody = await createRoleRes.json();
    assert(
      createRoleRes.status === 201 &&
        createRoleBody.role?.name === 'CUSTOM_ROLE_TEST' &&
        createRoleBody.role?.permissions.includes('REPORT_VIEW'),
      '3.1 Super Admin creates CUSTOM_ROLE_TEST with limited permissions via POST /api/roles',
      createRoleBody
    );

    // 3.2 Update role permissions via PUT /api/roles/CUSTOM_ROLE_TEST/permissions
    const updateRolePermsRes = await fetch(`${baseUrl}/api/roles/CUSTOM_ROLE_TEST/permissions`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'x-user-role': 'SUPER_ADMIN',
        'x-user-id': '1',
      },
      body: JSON.stringify({
        permissions: [
          'LEAVE_APPLY',
          'LEAVE_VIEW_OWN',
          'PROFILE_VIEW_OWN',
          'PROFILE_EDIT_BASIC',
          'SCHEDULE_VIEW_OWN',
          'REPORT_VIEW',
        ],
      }),
    });
    assert(updateRolePermsRes.status === 200, '3.2 PUT /api/roles/CUSTOM_ROLE_TEST/permissions updates permissions cleanly');

    // 3.3 Assign CUSTOM_ROLE_TEST to test user (User 4 - Alice Johnson) via PATCH /api/users/4/role
    const assignRoleRes = await fetch(`${baseUrl}/api/users/4/role`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'x-user-role': 'SUPER_ADMIN',
        'x-user-id': '1',
      },
      body: JSON.stringify({
        role: 'CUSTOM_ROLE_TEST',
      }),
    });
    const assignRoleBody = await assignRoleRes.json();
    assert(
      assignRoleRes.status === 200 && assignRoleBody.user?.roleName === 'CUSTOM_ROLE_TEST',
      '3.3 Assign CUSTOM_ROLE_TEST to user 4 via PATCH /api/users/4/role succeeds'
    );

    // 3.4 Authenticate as that user via POST /api/auth/login
    const customLoginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        usernameOrEmail: 'alice_emp',
        password: 'Employee@123',
      }),
    });
    const customLoginBody = await customLoginRes.json();
    assert(
      customLoginRes.status === 200 &&
        customLoginBody.authenticated === true &&
        customLoginBody.user?.roleName === 'CUSTOM_ROLE_TEST' &&
        Array.isArray(customLoginBody.user?.permissions) &&
        customLoginBody.user.permissions.includes('REPORT_VIEW'),
      '3.4 Login as user with CUSTOM_ROLE_TEST resolves role and permissions array in session payload',
      customLoginBody
    );

    // 3.5 Verify frontend session resolution, role display, navigation & route guards
    const session = loginUserSession(customLoginBody.user);
    assert(
      session.role === 'CUSTOM_ROLE_TEST' &&
        formatRoleDisplayName(session.role) === 'CUSTOM_ROLE_TEST' &&
        session.permissions.includes('REPORT_VIEW'),
      '3.5 Frontend session resolves CUSTOM_ROLE_TEST and displays role name accurately'
    );

    assert(
      canAccessModule('reports') === true &&
        canAccessModule('my-leave') === true &&
        canAccessModule('my-profile') === true &&
        canAccessFrontendRoute('/reports') === true,
      '3.6 Permitted modules (reports, my-leave, my-profile) and /reports route are accessible to CUSTOM_ROLE_TEST'
    );

    assert(
      canAccessModule('hr') === false &&
        canAccessModule('team-leader') === false &&
        canAccessModule('management') === false &&
        canAccessModule('administration') === false &&
        canAccessAdminTab('roles') === false &&
        canAccessAdminTab('audit') === false &&
        canAccessFrontendRoute('/hr') === false &&
        canAccessFrontendRoute('/administration') === false &&
        canAccessFrontendRoute('/system-overview') === false,
      '3.7 Unpermitted modules (hr, team-leader, management, administration) and direct frontend routes are blocked for CUSTOM_ROLE_TEST'
    );

    // 3.6 Verify backend API authorization for CUSTOM_ROLE_TEST
    const customHeaders = {
      'Content-Type': 'application/json',
      'x-user-role': 'CUSTOM_ROLE_TEST',
      'x-user-id': '4',
      'x-employee-id': '4',
      'x-username': 'alice_emp',
    };

    const reportsApiRes = await fetch(`${baseUrl}/api/reports/data?reportType=LEAVE`, {
      headers: customHeaders,
    });
    assert(
      reportsApiRes.status === 200,
      '3.8 Permitted API GET /api/reports/data returns 200 OK for CUSTOM_ROLE_TEST'
    );

    const auditApiRes = await fetch(`${baseUrl}/api/audit-logs`, {
      headers: customHeaders,
    });
    const hrQueueApiRes = await fetch(`${baseUrl}/api/hr/leave-requests`, {
      headers: customHeaders,
    });
    const createRoleForbiddenRes = await fetch(`${baseUrl}/api/roles`, {
      method: 'POST',
      headers: customHeaders,
      body: JSON.stringify({ name: 'HACK_ROLE' }),
    });
    assert(
      auditApiRes.status === 403 &&
        hrQueueApiRes.status === 403 &&
        createRoleForbiddenRes.status === 403,
      '3.9 Unauthorized APIs (/api/audit-logs, /api/hr/leave-requests, POST /api/roles) return HTTP 403 Forbidden for CUSTOM_ROLE_TEST',
      {
        auditStatus: auditApiRes.status,
        hrStatus: hrQueueApiRes.status,
        createRoleStatus: createRoleForbiddenRes.status,
      }
    );

    // 3.7 Verify operational-role / reporting-hierarchy leave workflow remains intact for CUSTOM_ROLE_TEST
    await LeaveService.initializeEmployeeBalances(4, 2026, {
      userId: 1,
      username: 'superadmin',
      role: 'SUPER_ADMIN',
    });
    const customLeaveSubmitRes = await fetch(`${baseUrl}/api/leave-requests`, {
      method: 'POST',
      headers: customHeaders,
      body: JSON.stringify({
        leaveTypeId: 1,
        startDate: '2026-12-02',
        endDate: '2026-12-02',
        dayType: 'FULL_DAY',
        reason: 'Leave submission by user with CUSTOM_ROLE_TEST',
        applicationTimestampOverride: '2026-11-15T09:00:00+05:30',
      }),
    });
    const customLeaveSubmitBody = await customLeaveSubmitRes.json();
    assert(
      customLeaveSubmitRes.status === 201 &&
        customLeaveSubmitBody.leaveRequest?.applicantRole === 'CUSTOM_ROLE_TEST' &&
        customLeaveSubmitBody.leaveRequest?.applicantOperationalRole === 'EMPLOYEE' &&
        customLeaveSubmitBody.leaveRequest?.teamLeaderDecision === 'PENDING',
      '3.10 Leave request from CUSTOM_ROLE_TEST user preserves operational EMPLOYEE routing (Team Leader -> HR -> Top Management)'
    );

    // 3.8 Verify audit trail records role creation, permission assignment, and user role assignment
    const finalAuditLogs = await AuditService.getAuditLogs({ limit: 500 });
    const hasRoleCreatedAudit = finalAuditLogs.some(
      (l) => l.action === 'ROLE_CREATED' && l.metadata?.roleName === 'CUSTOM_ROLE_TEST'
    );
    const hasRolePermsAudit = finalAuditLogs.some(
      (l) => l.action === 'ROLE_PERMISSIONS_UPDATED' && l.metadata?.roleName === 'CUSTOM_ROLE_TEST'
    );
    const hasUserRoleAssignedAudit = finalAuditLogs.some(
      (l) =>
        (l.action === 'USER_ROLE_ASSIGNED' || l.action === 'ROLE_ASSIGNED') &&
        l.metadata?.newRole === 'CUSTOM_ROLE_TEST'
    );
    assert(
      hasRoleCreatedAudit && hasRolePermsAudit && hasUserRoleAssignedAudit,
      '3.11 Audit trail records ROLE_CREATED, ROLE_PERMISSIONS_UPDATED, and USER_ROLE_ASSIGNED for CUSTOM_ROLE_TEST'
    );

    console.log('\n================================================================');
    console.log('4. ADMINISTRATIVE AUDIT TRAIL UI PRESENTATION REGRESSION');
    console.log('================================================================');

    const myProfileSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/MyProfile.tsx'), 'utf-8');
    const systemAuditSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/SystemAuditAdmin.tsx'), 'utf-8');
    const myProfileAuditTabSrc = myProfileSrc.slice(myProfileSrc.indexOf("activeTab === 'audit_trail'"));

    assert(
      myProfileAuditTabSrc.includes('<AuditEventDetailsView log={log} />') &&
        systemAuditSrc.includes('<AuditEventDetailsView log={selectedLog} />') &&
        !myProfileAuditTabSrc.includes('JSON.stringify') &&
        !myProfileSrc.includes('JSON.stringify(log.metadata') &&
        !myProfileSrc.includes('<pre') &&
        !systemAuditSrc.includes('JSON.stringify') &&
        !systemAuditSrc.includes('<pre'),
      '4.1 Administrative Audit Trail UI (MyProfile & SystemAuditAdmin) reuses AuditEventDetailsView and contains zero JSON.stringify or <pre> blocks in audit rendering'
    );

    const uploadedDisplay = formatAuditLogForDisplay({
      action: 'USER_PROFILE_PHOTO_UPLOADED',
      targetId: '1',
      createdAt: '2026-09-28T09:49:43.000Z',
      metadata: {
        targetUserId: 1,
        targetUsername: 'superadmin',
        employeeId: 1,
        before: null,
        after: {
          fileName: 'avatar_u1_1759052983_abc.png',
          originalName: 'Screenshot_2025-01-27_at_9.54.29_AM.png',
          mimeType: 'image/png',
          fileSizeBytes: 1212315,
          storagePath: 'uploads/avatars/avatar_u1_1759052983_abc.png',
        },
        timestamp: '2026-09-28T09:49:43.000Z',
      },
    });
    const uploadedText = uploadedDisplay.lines.join('\n');
    assert(
      uploadedDisplay.title === 'Profile Photo Uploaded' &&
        uploadedText.includes('User: superadmin') &&
        uploadedText.includes('User ID: 1') &&
        uploadedText.includes('Employee ID: 1') &&
        uploadedText.includes('File: Screenshot_2025-01-27_at_9.54.29_AM.png') &&
        uploadedText.includes('Type: PNG Image') &&
        uploadedText.includes('Size: 1.16 MB') &&
        uploadedText.includes('Uploaded: 28/09/2026, 15:19:43') &&
        !uploadedText.includes('{') &&
        !uploadedText.includes('targetUsername'),
      '4.2 USER_PROFILE_PHOTO_UPLOADED renders clean human-readable fields and never raw JSON',
      uploadedDisplay.lines
    );

    const removedDisplay = formatAuditLogForDisplay({
      action: 'USER_PROFILE_PHOTO_REMOVED',
      targetId: '1',
      createdAt: '2026-09-28T09:50:06.000Z',
      metadata: {
        targetUserId: 1,
        targetUsername: 'superadmin',
        employeeId: 1,
        before: {
          fileName: 'avatar_u1_1759052983_abc.png',
          originalName: 'Screenshot_2025-01-27_at_9.54.29_AM.png',
          mimeType: 'image/png',
          fileSizeBytes: 1212315,
          storagePath: 'uploads/avatars/avatar_u1_1759052983_abc.png',
        },
        after: null,
        timestamp: '2026-09-28T09:50:06.000Z',
      },
    });
    const removedText = removedDisplay.lines.join('\n');
    assert(
      removedDisplay.title === 'Profile Photo Removed' &&
        removedText.includes('User: superadmin') &&
        removedText.includes('User ID: 1') &&
        removedText.includes('Employee ID: 1') &&
        removedText.includes('Previous File: Screenshot_2025-01-27_at_9.54.29_AM.png') &&
        removedText.includes('Type: PNG Image') &&
        removedText.includes('Size: 1.16 MB') &&
        removedText.includes('Removed: 28/09/2026, 15:20:06') &&
        !removedText.includes('{') &&
        !removedText.includes('fileSizeBytes'),
      '4.3 USER_PROFILE_PHOTO_REMOVED renders clean human-readable fields and never raw JSON',
      removedDisplay.lines
    );

    const futureEventDisplay = formatAuditLogForDisplay({
      action: 'CUSTOM_POLICY_OVERRIDE_APPLIED',
      targetId: '42',
      createdAt: '2026-09-28T10:00:00.000Z',
      metadata: {
        policyCategoryCode: 'ANNUAL_CARRY',
        override_reason_note: 'Year-end executive approval',
        before: {
          maxCarryForwardDays: 5,
          is_auto_approved: false,
        },
        after: {
          maxCarryForwardDays: 10,
          is_auto_approved: true,
        },
      },
    });
    const futureText = futureEventDisplay.lines.join('\n');
    assert(
      futureEventDisplay.title === 'Custom Policy Override Applied' &&
        futureText.includes('Policy Category Code: ANNUAL_CARRY') &&
        futureText.includes('Override Reason Note: Year-end executive approval') &&
        futureEventDisplay.sections.some((s) => s.title === 'Before') &&
        futureEventDisplay.sections.some((s) => s.title === 'After') &&
        futureText.includes('Max Carry Forward Days: 5') &&
        futureText.includes('Max Carry Forward Days: 10') &&
        !futureText.includes('{'),
      '4.4 Unknown/future audit event converts camelCase/snake_case keys and renders structured Before/After sections',
      futureEventDisplay
    );

    // Restore client session to default SUPER_ADMIN
    setActiveRole('SUPER_ADMIN', 1, 1);
  } finally {
    UserService.resetMemoryStores();
    LeaveService.resetMemoryStores();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  console.log('\n================================================================');
  console.log(`PRODUCTION ISSUES REGRESSION SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================');
  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Fatal error in production-issues-regression.test.ts:', err);
  process.exit(1);
});
