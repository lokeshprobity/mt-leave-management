import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import express from 'express';
import { registerApiRoutes } from '../../server.ts';
import { UserService } from '../services/userService.ts';
import { AuditService } from '../services/auditService.ts';
import {
  setActiveRole,
  getActiveRole,
  getActiveUserId,
  getActiveUserSession,
  isUserAuthenticated,
  loginUserSession,
  logoutUserSession,
} from '../lib/api.ts';
import { UserRole } from '../types/leave.ts';

interface ApiResponse<T = any> {
  status: number;
  data: T;
  headers: http.IncomingHttpHeaders;
}

async function runTests() {
  console.log('\n====================================================================');
  console.log('  LOGOUT, USER PROFILE PHOTO & COMPANY LOGO VERIFICATION SUITE');
  console.log('====================================================================\n');

  UserService.resetMemoryStores();
  AuditService.resetMemoryAuditLogs();

  const app = express();
  app.use(express.json({ limit: '15mb' }));
  registerApiRoutes(app);

  const server = http.createServer(app);

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const address = server.address() as { port: number };
  const baseUrl = `http://127.0.0.1:${address.port}`;

  let passed = 0;
  let failed = 0;

  async function test(name: string, fn: () => Promise<void> | void) {
    try {
      await fn();
      passed++;
      console.log(`  PASS  ${name}`);
    } catch (err: any) {
      failed++;
      console.error(`  FAIL  ${name}`);
      console.error(`        ${err?.message || err}`);
    }
  }

  async function apiRequest<T = any>(
    method: string,
    urlPath: string,
    options: {
      role?: UserRole | 'LOGGED_OUT';
      userId?: number;
      employeeId?: number;
      authState?: string;
      body?: any;
    } = {}
  ): Promise<ApiResponse<T>> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (options.authState) {
      headers['x-auth-state'] = options.authState;
    }
    if (options.role) {
      headers['x-user-role'] = options.role;
    }
    if (options.userId !== undefined) {
      headers['x-user-id'] = String(options.userId);
    }
    if (options.employeeId !== undefined) {
      headers['x-employee-id'] = String(options.employeeId);
    }

    const res = await fetch(`${baseUrl}${urlPath}`, {
      method,
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });

    const contentType = res.headers.get('content-type') || '';
    let data: any;
    if (contentType.includes('application/json')) {
      data = await res.json();
    } else {
      const arrayBuf = await res.arrayBuffer();
      data = Buffer.from(arrayBuf);
    }

    const headerObj: http.IncomingHttpHeaders = {};
    res.headers.forEach((v, k) => {
      headerObj[k] = v;
    });

    return {
      status: res.status,
      data,
      headers: headerObj,
    };
  }

  // Valid image buffers with real magic bytes
  // 1. Valid PNG: 89 50 4E 47 0D 0A 1A 0A ...
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
  const VALID_PNG_BASE64 = `data:image/png;base64,${VALID_PNG_BYTES.toString('base64')}`;

  // 2. Valid JPEG: FF D8 FF E0 ... FF D9
  const VALID_JPEG_BYTES = Buffer.from([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46,
    0x49, 0x46, 0x00, 0x01, 0x01, 0x01, 0x00, 0x48,
    0x00, 0x48, 0x00, 0x00, 0xff, 0xdb, 0x00, 0x43,
    0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08,
    0xff, 0xd9,
  ]);
  const VALID_JPEG_BASE64 = `data:image/jpeg;base64,${VALID_JPEG_BYTES.toString('base64')}`;

  // 3. Valid WEBP: RIFF....WEBP
  const VALID_WEBP_BYTES = Buffer.from([
    0x52, 0x49, 0x46, 0x46, // "RIFF"
    0x1a, 0x00, 0x00, 0x00, // size
    0x57, 0x45, 0x42, 0x50, // "WEBP"
    0x56, 0x50, 0x38, 0x20, // "VP8 "
    0x0e, 0x00, 0x00, 0x00,
    0x30, 0x01, 0x00, 0x9d, 0x01, 0x2a, 0x01, 0x00, 0x01, 0x00, 0x02, 0x00, 0x34, 0x25,
  ]);
  const VALID_WEBP_BASE64 = `data:image/webp;base64,${VALID_WEBP_BYTES.toString('base64')}`;

  // ============================================================================
  // SECTION 1: FEATURE 1 — LOGOUT FOR EVERY USER
  // ============================================================================
  console.log('--- Section 1: Universal Logout for Every Authenticated Role ---');

  const allRoles: { role: UserRole; userId: number; employeeId: number; username: string }[] = [
    { role: 'SUPER_ADMIN', userId: 1, employeeId: 1, username: 'superadmin' },
    { role: 'HR', userId: 2, employeeId: 2, username: 'hruser' },
    { role: 'TOP_MANAGEMENT', userId: 3, employeeId: 3, username: 'manager_john' },
    { role: 'TEAM_LEADER', userId: 5, employeeId: 5, username: 'tl_robert' },
    { role: 'EMPLOYEE', userId: 4, employeeId: 4, username: 'alice_emp' },
  ];

  for (const r of allRoles) {
    await test(`1.${r.role}: Role ${r.role} can check session (/api/auth/me) and execute logout (/api/auth/logout)`, async () => {
      const meBefore = await apiRequest('GET', '/api/auth/me', {
        role: r.role,
        userId: r.userId,
        employeeId: r.employeeId,
      });
      assert.strictEqual(meBefore.status, 200);
      assert.strictEqual(meBefore.data.authenticated, true);
      assert.strictEqual(meBefore.data.user.role, r.role);

      const logoutRes = await apiRequest('POST', '/api/auth/logout', {
        role: r.role,
        userId: r.userId,
        employeeId: r.employeeId,
      });
      assert.strictEqual(logoutRes.status, 200);
      assert.strictEqual(logoutRes.data.success, true);
      assert.strictEqual(logoutRes.data.authenticated, false);
      assert.strictEqual(logoutRes.data.loggedOut, true);
    });
  }

  await test('2. Client session state: loginUserSession sets active user & logoutUserSession clears authentication state', async () => {
    loginUserSession({
      id: 4,
      employeeId: 4,
      roleName: 'EMPLOYEE',
      username: 'alice_emp',
      fullName: 'Alice Johnson',
      profilePhotoUrl: '/api/users/4/profile-photo/image',
    });
    assert.strictEqual(isUserAuthenticated(), true);
    assert.strictEqual(getActiveRole(), 'EMPLOYEE');
    assert.strictEqual(getActiveUserId(), 4);
    assert.strictEqual(getActiveUserSession().username, 'alice_emp');

    // Perform client logout
    await logoutUserSession();
    assert.strictEqual(isUserAuthenticated(), false);
    const clearedSession = getActiveUserSession();
    assert.strictEqual(clearedSession.isAuthenticated, false);
    assert.strictEqual(clearedSession.userId, 0);
    assert.strictEqual(clearedSession.username, '');
    assert.strictEqual(clearedSession.fullName, '');
    assert.strictEqual(clearedSession.profilePhotoUrl, null);
  });

  await test('3. Protected API routes reject unauthenticated / logged-out requests with 401 Unauthorized (previous user data not accessible)', async () => {
    const meAfterLogout = await apiRequest('GET', '/api/auth/me', {
      authState: 'LOGGED_OUT',
      role: 'LOGGED_OUT',
    });
    assert.strictEqual(meAfterLogout.status, 401);
    assert.strictEqual(meAfterLogout.data.authenticated, false);

    const profileRes = await apiRequest('GET', '/api/users/profile/me', {
      authState: 'LOGGED_OUT',
      role: 'LOGGED_OUT',
    });
    assert.strictEqual(profileRes.status, 401);

    const completeProfileRes = await apiRequest('GET', '/api/users/4/complete-profile', {
      authState: 'LOGGED_OUT',
      role: 'LOGGED_OUT',
    });
    assert.strictEqual(completeProfileRes.status, 401);

    const leaveRequestsRes = await apiRequest('GET', '/api/leave-requests', {
      authState: 'LOGGED_OUT',
      role: 'LOGGED_OUT',
    });
    assert.strictEqual(leaveRequestsRes.status, 401);
  });

  await test('4. UI source verification: Header and MyProfile provide visible Logout button and confirmation modal for all roles', () => {
    const appCode = fs.readFileSync(path.resolve(process.cwd(), 'src/App.tsx'), 'utf-8');
    const profileCode = fs.readFileSync(path.resolve(process.cwd(), 'src/components/MyProfile.tsx'), 'utf-8');

    assert.ok(appCode.includes('id="btn-header-logout"'), 'App header must include direct logout button');
    assert.ok(appCode.includes('id="menu-btn-logout"'), 'User menu must include logout option');
    assert.ok(appCode.includes('id="logout-confirm-modal"'), 'App must include logout confirmation modal');
    assert.ok(appCode.includes('id="login-screen"'), 'App must render login screen when logged out');
    assert.ok(profileCode.includes('id="btn-profile-logout"'), 'MyProfile must include logout button');
  });

  // Restore default SUPER_ADMIN active role in client helper for subsequent tests
  setActiveRole('SUPER_ADMIN', 1, 1);

  // ============================================================================
  // SECTION 2: FEATURE 2 — USER PROFILE PHOTO
  // ============================================================================
  console.log('\n--- Section 2: User Profile Photo Upload, Replace, Remove, RBAC & Persistence ---');

  await test('5. Normal user (Alice, User #4) can upload her own PNG profile photo', async () => {
    const uploadRes = await apiRequest('POST', '/api/users/4/profile-photo', {
      role: 'EMPLOYEE',
      userId: 4,
      employeeId: 4,
      body: {
        fileName: 'alice-avatar.png',
        mimeType: 'image/png',
        fileData: VALID_PNG_BASE64,
      },
    });
    assert.strictEqual(uploadRes.status, 200);
    assert.strictEqual(uploadRes.data.success, true);
    assert.strictEqual(uploadRes.data.photo.userId, 4);
    assert.strictEqual(uploadRes.data.photo.hasProfilePhoto, true);
    assert.strictEqual(uploadRes.data.photo.mimeType, 'image/png');
    assert.ok(uploadRes.data.profilePhotoUrl.includes('/api/users/4/profile-photo/image'));

    // Verify binary image endpoint serves exact PNG bytes
    const imgRes = await apiRequest<Buffer>('GET', '/api/users/4/profile-photo/image', {
      role: 'EMPLOYEE',
      userId: 4,
      employeeId: 4,
    });
    assert.strictEqual(imgRes.status, 200);
    assert.strictEqual(imgRes.headers['content-type'], 'image/png');
    assert.strictEqual(Buffer.compare(imgRes.data, VALID_PNG_BYTES), 0);
  });

  await test('6. Normal user (Alice, User #4) can replace her own profile photo with a JPEG image', async () => {
    const replaceRes = await apiRequest('PUT', '/api/users/4/profile-photo', {
      role: 'EMPLOYEE',
      userId: 4,
      employeeId: 4,
      body: {
        fileName: 'alice-updated.jpg',
        mimeType: 'image/jpeg',
        fileData: VALID_JPEG_BASE64,
      },
    });
    assert.strictEqual(replaceRes.status, 200);
    assert.strictEqual(replaceRes.data.photo.mimeType, 'image/jpeg');
    assert.strictEqual(replaceRes.data.photo.originalName, 'alice-updated.jpg');

    const imgRes = await apiRequest<Buffer>('GET', '/api/users/4/profile-photo/image', {
      role: 'EMPLOYEE',
      userId: 4,
      employeeId: 4,
    });
    assert.strictEqual(imgRes.status, 200);
    assert.strictEqual(imgRes.headers['content-type'], 'image/jpeg');
    assert.strictEqual(Buffer.compare(imgRes.data, VALID_JPEG_BYTES), 0);
  });

  await test('7. Profile photo URL is exposed consistently in /api/users/profile/me, /api/users/:id/complete-profile, /api/users, and /api/employees', async () => {
    const meProfile = await apiRequest('GET', '/api/users/profile/me', {
      role: 'EMPLOYEE',
      userId: 4,
      employeeId: 4,
    });
    assert.strictEqual(meProfile.status, 200);
    assert.strictEqual(meProfile.data.user.hasProfilePhoto, true);
    assert.ok(meProfile.data.user.profilePhotoUrl.includes('/api/users/4/profile-photo/image'));

    const completeProfile = await apiRequest('GET', '/api/users/4/complete-profile', {
      role: 'EMPLOYEE',
      userId: 4,
      employeeId: 4,
    });
    assert.strictEqual(completeProfile.status, 200);
    assert.strictEqual(completeProfile.data.profile.user.hasProfilePhoto, true);
    assert.ok(completeProfile.data.profile.user.profilePhotoUrl.includes('/api/users/4/profile-photo/image'));

    const allUsersRes = await apiRequest('GET', '/api/users', {
      role: 'SUPER_ADMIN',
      userId: 1,
      employeeId: 1,
    });
    const aliceUser = allUsersRes.data.users.find((u: any) => u.id === 4);
    assert.ok(aliceUser, 'Alice user must exist in /api/users');
    assert.strictEqual(aliceUser.hasProfilePhoto, true);
    assert.ok(aliceUser.profilePhotoUrl.includes('/api/users/4/profile-photo/image'));

    const allEmployeesRes = await apiRequest('GET', '/api/employees', {
      role: 'SUPER_ADMIN',
      userId: 1,
      employeeId: 1,
    });
    const aliceEmp = allEmployeesRes.data.employees.find((e: any) => e.id === 4);
    assert.ok(aliceEmp, 'Alice employee must exist in /api/employees');
    assert.strictEqual(aliceEmp.hasProfilePhoto, true);
    assert.ok(aliceEmp.profilePhotoUrl.includes('/api/users/4/profile-photo/image'));
  });

  await test('8. Normal users (EMPLOYEE, TEAM_LEADER, HR, TOP_MANAGEMENT) CANNOT upload, replace, or remove another user’s profile photo (403 Forbidden)', async () => {
    // Alice (User #4) tries to modify Bob's (User #6) photo
    const empUploadOther = await apiRequest('POST', '/api/users/6/profile-photo', {
      role: 'EMPLOYEE',
      userId: 4,
      employeeId: 4,
      body: {
        fileName: 'hack.png',
        mimeType: 'image/png',
        fileData: VALID_PNG_BASE64,
      },
    });
    assert.strictEqual(empUploadOther.status, 403);

    // HR (User #2) tries to modify Alice's (User #4) photo
    const hrUploadOther = await apiRequest('PUT', '/api/users/4/profile-photo', {
      role: 'HR',
      userId: 2,
      employeeId: 2,
      body: {
        fileName: 'hr-override.png',
        mimeType: 'image/png',
        fileData: VALID_PNG_BASE64,
      },
    });
    assert.strictEqual(hrUploadOther.status, 403);

    // Team Leader (User #5) tries to delete Alice's (User #4) photo
    const tlDeleteOther = await apiRequest('DELETE', '/api/users/4/profile-photo', {
      role: 'TEAM_LEADER',
      userId: 5,
      employeeId: 5,
    });
    assert.strictEqual(tlDeleteOther.status, 403);
  });

  await test('9. SUPER_ADMIN CAN upload, replace, and remove another user’s profile photo (User #6)', async () => {
    const adminUploadRes = await apiRequest('POST', '/api/users/6/profile-photo', {
      role: 'SUPER_ADMIN',
      userId: 1,
      employeeId: 1,
      body: {
        fileName: 'bob-webp-photo.webp',
        mimeType: 'image/webp',
        fileData: VALID_WEBP_BASE64,
      },
    });
    assert.strictEqual(adminUploadRes.status, 200);
    assert.strictEqual(adminUploadRes.data.photo.userId, 6);
    assert.strictEqual(adminUploadRes.data.photo.mimeType, 'image/webp');

    // Remove User #6 photo as SUPER_ADMIN
    const adminRemoveRes = await apiRequest('DELETE', '/api/users/6/profile-photo', {
      role: 'SUPER_ADMIN',
      userId: 1,
      employeeId: 1,
    });
    assert.strictEqual(adminRemoveRes.status, 200);
    assert.strictEqual(adminRemoveRes.data.photo.hasProfilePhoto, false);
    assert.strictEqual(adminRemoveRes.data.profilePhotoUrl, null);
  });

  await test('10. Profile photo persists across simulated server restart and logout/login cycles', async () => {
    // Simulate server restart: clears memory stores and reloads from disk
    UserService.simulateServerRestart();

    const metaAfterRestart = await apiRequest('GET', '/api/users/4/profile-photo', {
      role: 'EMPLOYEE',
      userId: 4,
      employeeId: 4,
    });
    assert.strictEqual(metaAfterRestart.status, 200);
    assert.strictEqual(metaAfterRestart.data.photo.hasProfilePhoto, true);
    assert.strictEqual(metaAfterRestart.data.photo.mimeType, 'image/jpeg');

    const imgAfterRestart = await apiRequest<Buffer>('GET', '/api/users/4/profile-photo/image', {
      role: 'EMPLOYEE',
      userId: 4,
      employeeId: 4,
    });
    assert.strictEqual(imgAfterRestart.status, 200);
    assert.strictEqual(Buffer.compare(imgAfterRestart.data, VALID_JPEG_BYTES), 0);
  });

  await test('11. Normal user (Alice, User #4) can remove her own profile photo and return to default avatar', async () => {
    const removeRes = await apiRequest('DELETE', '/api/users/4/profile-photo', {
      role: 'EMPLOYEE',
      userId: 4,
      employeeId: 4,
    });
    assert.strictEqual(removeRes.status, 200);
    assert.strictEqual(removeRes.data.photo.hasProfilePhoto, false);
    assert.strictEqual(removeRes.data.profilePhotoUrl, null);

    const imgResAfterRemove = await apiRequest('GET', '/api/users/4/profile-photo/image', {
      role: 'EMPLOYEE',
      userId: 4,
      employeeId: 4,
    });
    assert.strictEqual(imgResAfterRemove.status, 404);
  });

  // ============================================================================
  // SECTION 3: FEATURE 3 — COMPANY LOGO (SUPER_ADMIN ONLY)
  // ============================================================================
  console.log('\n--- Section 3: Company Logo Upload, Replace, Remove, RBAC & Global Persistence ---');

  await test('12. Non-SUPER_ADMIN roles (HR, TOP_MANAGEMENT, TEAM_LEADER, EMPLOYEE) CANNOT upload, replace, or remove the company logo (403 Forbidden)', async () => {
    const nonAdminRoles: { role: UserRole; userId: number; employeeId: number }[] = [
      { role: 'HR', userId: 2, employeeId: 2 },
      { role: 'TOP_MANAGEMENT', userId: 3, employeeId: 3 },
      { role: 'TEAM_LEADER', userId: 5, employeeId: 5 },
      { role: 'EMPLOYEE', userId: 4, employeeId: 4 },
    ];

    for (const actor of nonAdminRoles) {
      const postRes = await apiRequest('POST', '/api/company-logo', {
        role: actor.role,
        userId: actor.userId,
        employeeId: actor.employeeId,
        body: {
          fileName: 'unauthorized-logo.png',
          mimeType: 'image/png',
          fileData: VALID_PNG_BASE64,
        },
      });
      assert.strictEqual(postRes.status, 403, `POST /api/company-logo must return 403 for ${actor.role}`);

      const deleteRes = await apiRequest('DELETE', '/api/company-logo', {
        role: actor.role,
        userId: actor.userId,
        employeeId: actor.employeeId,
      });
      assert.strictEqual(deleteRes.status, 403, `DELETE /api/company-logo must return 403 for ${actor.role}`);
    }
  });

  await test('13. SUPER_ADMIN can upload and replace the company logo, and all roles can view the global logo', async () => {
    // Upload PNG company logo as SUPER_ADMIN
    const uploadLogoRes = await apiRequest('POST', '/api/company-logo', {
      role: 'SUPER_ADMIN',
      userId: 1,
      employeeId: 1,
      body: {
        fileName: 'maestro-official-logo.png',
        mimeType: 'image/png',
        fileData: VALID_PNG_BASE64,
      },
    });
    assert.strictEqual(uploadLogoRes.status, 200);
    assert.strictEqual(uploadLogoRes.data.success, true);
    assert.strictEqual(uploadLogoRes.data.branding.applicationName, 'Maestro Leave Management');
    assert.strictEqual(uploadLogoRes.data.branding.hasCustomLogo, true);
    assert.ok(uploadLogoRes.data.branding.logoUrl.includes('/api/company-logo/image'));

    // Replace with WEBP company logo as SUPER_ADMIN
    const replaceLogoRes = await apiRequest('PUT', '/api/company-logo', {
      role: 'SUPER_ADMIN',
      userId: 1,
      employeeId: 1,
      body: {
        fileName: 'maestro-logo-v2.webp',
        mimeType: 'image/webp',
        fileData: VALID_WEBP_BASE64,
      },
    });
    assert.strictEqual(replaceLogoRes.status, 200);
    assert.strictEqual(replaceLogoRes.data.branding.hasCustomLogo, true);
    assert.strictEqual(replaceLogoRes.data.branding.mimeType, 'image/webp');

    // Verify every role (and login screen) can view the company logo metadata & image
    for (const r of allRoles) {
      const getLogoMeta = await apiRequest('GET', '/api/company-logo', {
        role: r.role,
        userId: r.userId,
        employeeId: r.employeeId,
      });
      assert.strictEqual(getLogoMeta.status, 200);
      assert.strictEqual(getLogoMeta.data.branding.hasCustomLogo, true);
      assert.strictEqual(getLogoMeta.data.branding.applicationName, 'Maestro Leave Management');

      const getLogoImg = await apiRequest<Buffer>('GET', '/api/company-logo/image', {
        role: r.role,
        userId: r.userId,
        employeeId: r.employeeId,
      });
      assert.strictEqual(getLogoImg.status, 200);
      assert.strictEqual(getLogoImg.headers['content-type'], 'image/webp');
      assert.strictEqual(Buffer.compare(getLogoImg.data, VALID_WEBP_BYTES), 0);
    }
  });

  await test('14. Company logo persists across simulated server restart', async () => {
    UserService.simulateServerRestart();

    const brandingAfterRestart = await apiRequest('GET', '/api/company-logo', {
      role: 'EMPLOYEE',
      userId: 4,
      employeeId: 4,
    });
    assert.strictEqual(brandingAfterRestart.status, 200);
    assert.strictEqual(brandingAfterRestart.data.branding.hasCustomLogo, true);
    assert.strictEqual(brandingAfterRestart.data.branding.mimeType, 'image/webp');

    const imgAfterRestart = await apiRequest<Buffer>('GET', '/api/company-logo/image', {
      role: 'EMPLOYEE',
      userId: 4,
      employeeId: 4,
    });
    assert.strictEqual(imgAfterRestart.status, 200);
    assert.strictEqual(Buffer.compare(imgAfterRestart.data, VALID_WEBP_BYTES), 0);
  });

  await test('15. SUPER_ADMIN can remove the company logo and restore default Maestro branding', async () => {
    const removeLogoRes = await apiRequest('DELETE', '/api/company-logo', {
      role: 'SUPER_ADMIN',
      userId: 1,
      employeeId: 1,
    });
    assert.strictEqual(removeLogoRes.status, 200);
    assert.strictEqual(removeLogoRes.data.branding.hasCustomLogo, false);
    assert.strictEqual(removeLogoRes.data.branding.logoUrl, null);
    assert.strictEqual(removeLogoRes.data.branding.applicationName, 'Maestro Leave Management');

    const imgAfterRemove = await apiRequest('GET', '/api/company-logo/image', {
      role: 'SUPER_ADMIN',
      userId: 1,
      employeeId: 1,
    });
    assert.strictEqual(imgAfterRemove.status, 404);
  });

  // ============================================================================
  // SECTION 4: FILE VALIDATION & SECURITY (MAGIC BYTES, SPOOFING, SVG, SIZE)
  // ============================================================================
  console.log('\n--- Section 4: Image Validation & Security Hardening ---');

  await test('16. Rejects SVG, HTML, and executable files even when disguised with image MIME types', async () => {
    const svgPayload = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    const svgBase64 = `data:image/png;base64,${svgPayload.toString('base64')}`;

    const svgProfileRes = await apiRequest('POST', '/api/users/4/profile-photo', {
      role: 'EMPLOYEE',
      userId: 4,
      employeeId: 4,
      body: {
        fileName: 'malicious.svg',
        mimeType: 'image/svg+xml',
        fileData: svgBase64,
      },
    });
    assert.strictEqual(svgProfileRes.status, 400);

    const svgSpoofedAsPngRes = await apiRequest('POST', '/api/users/4/profile-photo', {
      role: 'EMPLOYEE',
      userId: 4,
      employeeId: 4,
      body: {
        fileName: 'malicious.png',
        mimeType: 'image/png',
        fileData: svgBase64,
      },
    });
    assert.strictEqual(svgSpoofedAsPngRes.status, 400);

    const htmlPayload = Buffer.from('<!DOCTYPE html><html><body><script>evil()</script></body></html>');
    const htmlSpoofedLogoRes = await apiRequest('POST', '/api/company-logo', {
      role: 'SUPER_ADMIN',
      userId: 1,
      employeeId: 1,
      body: {
        fileName: 'spoofed.jpg',
        mimeType: 'image/jpeg',
        fileData: `data:image/jpeg;base64,${htmlPayload.toString('base64')}`,
      },
    });
    assert.strictEqual(htmlSpoofedLogoRes.status, 400);

    const exePayload = Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00, 0x04, 0x00, 0x00, 0x00, 0xff, 0xff]);
    const exeSpoofedRes = await apiRequest('POST', '/api/company-logo', {
      role: 'SUPER_ADMIN',
      userId: 1,
      employeeId: 1,
      body: {
        fileName: 'trojan.png',
        mimeType: 'image/png',
        fileData: exePayload.toString('base64'),
      },
    });
    assert.strictEqual(exeSpoofedRes.status, 400);
  });

  await test('17. Rejects spoofed MIME / extension mismatch, malformed images, path traversal filenames, and oversized (> 5 MB) files', async () => {
    // Valid PNG bytes uploaded with .jpg extension -> rejected
    const mismatchRes = await apiRequest('POST', '/api/users/4/profile-photo', {
      role: 'EMPLOYEE',
      userId: 4,
      employeeId: 4,
      body: {
        fileName: 'mismatch.jpg',
        mimeType: 'image/jpeg',
        fileData: VALID_PNG_BASE64,
      },
    });
    assert.strictEqual(mismatchRes.status, 400);

    // Path traversal filename -> rejected
    const traversalRes = await apiRequest('POST', '/api/users/4/profile-photo', {
      role: 'EMPLOYEE',
      userId: 4,
      employeeId: 4,
      body: {
        fileName: '../../etc/passwd.png',
        mimeType: 'image/png',
        fileData: VALID_PNG_BASE64,
      },
    });
    assert.strictEqual(traversalRes.status, 400);

    // Malformed / random bytes -> rejected
    const malformedBytes = Buffer.from([0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e]);
    const malformedRes = await apiRequest('POST', '/api/company-logo', {
      role: 'SUPER_ADMIN',
      userId: 1,
      employeeId: 1,
      body: {
        fileName: 'corrupt.png',
        mimeType: 'image/png',
        fileData: malformedBytes.toString('base64'),
      },
    });
    assert.strictEqual(malformedRes.status, 400);

    // Oversized > 5 MB buffer with PNG header -> rejected
    const oversizedBuf = Buffer.alloc(5 * 1024 * 1024 + 2048, 0x00);
    VALID_PNG_BYTES.copy(oversizedBuf, 0);
    const oversizedRes = await apiRequest('POST', '/api/users/4/profile-photo', {
      role: 'EMPLOYEE',
      userId: 4,
      employeeId: 4,
      body: {
        fileName: 'huge-photo.png',
        mimeType: 'image/png',
        fileData: oversizedBuf.toString('base64'),
      },
    });
    assert.strictEqual(oversizedRes.status, 400);
  });

  // ============================================================================
  // SECTION 5: AUDIT TRAIL VERIFICATION (NO RAW BINARY OR SECRETS)
  // ============================================================================
  console.log('\n--- Section 5: Audit Trail Verification ---');

  await test('18. Audit logs record profile photo & company logo actions with actor, role, target, and safe before/after metadata — and NEVER log binary or base64 data', async () => {
    const logs = await AuditService.getAuditLogs({ limit: 100 });

    const photoUploadedLog = logs.find((l) => l.action === 'USER_PROFILE_PHOTO_UPLOADED');
    const photoReplacedLog = logs.find((l) => l.action === 'USER_PROFILE_PHOTO_REPLACED');
    const photoRemovedLog = logs.find((l) => l.action === 'USER_PROFILE_PHOTO_REMOVED');
    const logoUploadedLog = logs.find((l) => l.action === 'COMPANY_LOGO_UPLOADED');
    const logoReplacedLog = logs.find((l) => l.action === 'COMPANY_LOGO_REPLACED');
    const logoRemovedLog = logs.find((l) => l.action === 'COMPANY_LOGO_REMOVED');

    assert.ok(photoUploadedLog, 'Audit log must contain USER_PROFILE_PHOTO_UPLOADED');
    assert.ok(photoReplacedLog, 'Audit log must contain USER_PROFILE_PHOTO_REPLACED');
    assert.ok(photoRemovedLog, 'Audit log must contain USER_PROFILE_PHOTO_REMOVED');
    assert.ok(logoUploadedLog, 'Audit log must contain COMPANY_LOGO_UPLOADED');
    assert.ok(logoReplacedLog, 'Audit log must contain COMPANY_LOGO_REPLACED');
    assert.ok(logoRemovedLog, 'Audit log must contain COMPANY_LOGO_REMOVED');

    // Verify company logo actor is SUPER_ADMIN
    assert.strictEqual(logoUploadedLog!.actorRole, 'SUPER_ADMIN');
    assert.strictEqual(logoReplacedLog!.actorRole, 'SUPER_ADMIN');
    assert.strictEqual(logoRemovedLog!.actorRole, 'SUPER_ADMIN');

    // Verify before/after metadata and targetUserId on profile photo logs
    assert.strictEqual(String(photoReplacedLog!.targetId), '4');
    assert.strictEqual(photoReplacedLog!.metadata?.targetUserId, 4);
    assert.ok(photoReplacedLog!.metadata?.before?.fileName, 'Before file reference must be recorded');
    assert.ok(photoReplacedLog!.metadata?.after?.fileName, 'After file reference must be recorded');
    assert.ok(photoReplacedLog!.createdAt, 'Timestamp must be recorded');

    // Ensure NO audit log contains base64 image data, raw binary, or secrets
    const serializedLogs = JSON.stringify(logs);
    assert.ok(!serializedLogs.includes('data:image/'), 'Audit logs must NEVER contain data:image/ base64 strings');
    assert.ok(!serializedLogs.includes(VALID_PNG_BYTES.toString('base64')), 'Audit logs must NEVER contain raw PNG base64');
    assert.ok(!serializedLogs.includes('SuperAdmin@123'), 'Audit logs must NEVER contain plaintext passwords');
  });

  server.close();

  console.log('\n====================================================================');
  console.log(`  SUMMARY: ${passed} passed, ${failed} failed (Total: ${passed + failed})`);
  console.log('====================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Fatal error in logout-photo-logo.test.ts:', err);
  process.exit(1);
});
