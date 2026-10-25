import express, { Request, Response, NextFunction } from 'express';
import { desc, eq } from 'drizzle-orm';
import path from 'path';
import { fileURLToPath } from 'url';
import * as dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';
import {
  assertProductionDbConfigured,
  getDb,
  isDbConfigured,
  isProductionRuntime,
  verifyDatabaseConnectivity,
} from './src/db/index.ts';
import { runMigrations } from './src/db/migrate.ts';
import { employees, roles, systemSettings, systemAuditLogs } from './src/db/schema.ts';
import { INITIAL_ROLES, INITIAL_SYSTEM_SETTINGS, seedDatabase } from './src/db/seed.ts';
import { authMiddleware, requireRole } from './src/middleware/auth.ts';
import { createSessionToken } from './src/services/sessionService.ts';
import { LeaveService } from './src/services/leaveService.ts';
import { LeaveRequestService } from './src/services/leaveRequestService.ts';
import { ApprovalService } from './src/services/approvalService.ts';
import { WorkingDaysService } from './src/services/workingDaysService.ts';
import { HolidayService } from './src/services/holidayService.ts';
import { NotificationService } from './src/services/notificationService.ts';
import { AttachmentService } from './src/services/attachmentService.ts';
import { ShiftService } from './src/services/shiftService.ts';
import { UserService } from './src/services/userService.ts';
import { OvertimeService } from './src/services/overtimeService.ts';
import { AttendanceService } from './src/services/attendanceService.ts';
import { AuditService } from './src/services/auditService.ts';
import { ValidationError } from './src/services/validation.ts';
import { TeamLeaderRotationService } from './src/services/teamLeaderRotationService.ts';
import { DataImportService } from './src/services/dataImportService.ts';

dotenv.config();

export function registerApiRoutes(app: express.Express) {
  app.use(express.json({ limit: '15mb' }));
  app.use(express.urlencoded({ extended: true, limit: '15mb' }));
  app.use('/api', authMiddleware);

  const parseIdOrCode = (val: any): number | string | undefined => {
    if (val === undefined || val === null || String(val).trim() === '') return undefined;
    const s = String(val).trim();
    return /^\d+$/.test(s) ? Number(s) : s;
  };

  const isSameEmployeeActor = (actor: any, targetIdOrCode: number | string | undefined): boolean => {
    if (!actor || targetIdOrCode === undefined || targetIdOrCode === null) return false;
    const targetEmp = UserService.resolveEmployeeRecordSync(targetIdOrCode);
    const actorEmp = UserService.resolveEmployeeRecordSync(
      actor.employeeCode ?? actor.employeeId ?? actor.userId
    );
    if (targetEmp && actorEmp) {
      return targetEmp.id === actorEmp.id;
    }
    return (
      (actor.employeeId && Number(actor.employeeId) === Number(targetIdOrCode)) ||
      (actor.employeeCode &&
        String(actor.employeeCode).toUpperCase() === String(targetIdOrCode).trim().toUpperCase())
    );
  };

  const denySuperAdminEmployeeTarget = async (
    targetId: number | string | undefined,
    req: Request,
    res: Response
  ): Promise<boolean> => {
    if (req.user?.role === 'SUPER_ADMIN' || targetId === undefined || targetId === null) return false;
    const target = await UserService.getEmployeeById(targetId);
    if (String(target?.role || '').toUpperCase() !== 'SUPER_ADMIN') return false;
    res.status(404).json({ error: 'Employee profile not found.' });
    return true;
  };

  const excludeSuperAdminRequests = async (requests: any[], actorRole?: string): Promise<any[]> => {
    if (actorRole === 'SUPER_ADMIN' || !Array.isArray(requests)) return requests;
    const allEmployees = await UserService.getAllEmployees();
    const superAdminEmployeeIds = new Set(
      allEmployees
        .filter((employee: any) => String(employee.role || '').toUpperCase() === 'SUPER_ADMIN')
        .map((employee: any) => Number(employee.id))
    );
    return requests.filter((request: any) => {
      const employeeId = Number(request?.employeeId);
      // Fail closed for malformed/unlinked records so they cannot expose a hidden account.
      return Number.isFinite(employeeId) && !superAdminEmployeeIds.has(employeeId);
    });
  };

  // ----------------------------------------------------
  // API Routes
  // ----------------------------------------------------

  // 1. Health & Database Status Check
  app.get('/api/health', async (_req: Request, res: Response) => {
    const configured = isDbConfigured();
    let connected = false;
    if (configured) {
      try {
        await verifyDatabaseConnectivity();
        connected = true;
      } catch {
        return res.status(503).json({
          application: 'MT Leave Management',
          status: 'degraded',
          database: {
            engine: 'PostgreSQL',
            orm: 'Drizzle ORM',
            isConfigured: true,
            isConnected: false,
          },
        });
      }
    }
    res.status(configured && !connected ? 503 : 200).json({
      application: 'MT Leave Management',
      status: 'ok',
      database: {
        engine: 'PostgreSQL',
        orm: 'Drizzle ORM',
        isConfigured: configured,
        isConnected: connected,
        tablesDefined: [
          'users',
          'roles',
          'employees',
          'departments',
          'designations',
          'system_settings',
          'leave_types',
          'leave_policies',
          'leave_balances',
          'leave_balance_transactions',
          'holidays',
          'holiday_lists',
          'employee_holiday_assignments',
          'leave_requests',
          'leave_request_events',
          'notifications',
          'shifts',
          'shift_segments',
          'employee_shift_assignments',
          'employee_weekly_off_assignments',
          'system_audit_logs',
        ],
      },
    });
  });

  // Current session/auth info
  app.get('/api/auth/me', async (req: Request, res: Response) => {
    if (!req.user) {
      return res.status(401).json({
        authenticated: false,
        user: null,
        error: 'Unauthorized: No active session',
      });
    }
    try {
      const fullUser = await UserService.getUserById(req.user.userId || 1);
      return res.json({
        authenticated: true,
        mustChangePassword: Boolean(fullUser?.mustChangePassword),
        user: {
          ...req.user,
          roleName: fullUser?.roleName || req.user.role,
          operationalRole: fullUser?.operationalRole ?? req.user.operationalRole ?? null,
          permissions: fullUser?.permissions || req.user.permissions || [],
          fullName: fullUser?.fullName || req.user.username,
          email: fullUser?.email || null,
          employeeId: fullUser?.employeeId ?? req.user.employeeId ?? null,
          employeeCode: fullUser?.employeeCode || req.user.employeeCode || null,
          departmentId: fullUser?.departmentId ?? req.user.departmentId ?? null,
          departmentCode: fullUser?.departmentCode || req.user.departmentCode || null,
          departmentName: fullUser?.departmentName || null,
          designationName: fullUser?.designationName || null,
          profilePhotoUrl: fullUser?.profilePhotoUrl || null,
          hasProfilePhoto: fullUser?.hasProfilePhoto || false,
          mustChangePassword: Boolean(fullUser?.mustChangePassword),
        },
      });
    } catch {
      return res.json({ authenticated: true, user: req.user });
    }
  });

  // Login endpoint
  app.post('/api/auth/login', async (req: Request, res: Response) => {
    try {
      const { username, email, identifier, usernameOrEmail, password } = req.body || {};
      const loginId = identifier || usernameOrEmail || username || email || '';
      const user = await UserService.authenticateUser(loginId, password);
      const session = createSessionToken({ userId: user.id, username: user.username, role: user.roleName });
      await AuditService.logEvent({
        actorId: user.id,
        actorRole: user.roleName,
        action: 'USER_LOGIN',
        targetEntity: 'users',
        targetId: String(user.id),
        metadata: {
          userId: user.id,
          username: user.username,
          role: user.roleName,
          employeeId: user.employeeId ?? null,
          employeeCode: user.employeeCode ?? null,
          departmentId: user.departmentId ?? null,
          departmentCode: user.departmentCode ?? null,
          timestamp: new Date().toISOString(),
        },
      });
      res.json({
        success: true,
        authenticated: true,
        sessionToken: session.sessionToken,
        expiresAt: session.expiresAt,
        mustChangePassword: Boolean(user.mustChangePassword),
        user: {
          sessionToken: session.sessionToken,
          expiresAt: session.expiresAt,
          id: user.id,
          userId: user.id,
          username: user.username,
          email: user.email,
          role: user.roleName,
          roleName: user.roleName,
          operationalRole: user.operationalRole,
          permissions: user.permissions || [],
          employeeId: user.employeeId,
          employeeCode: user.employeeCode,
          employeeName: user.employeeName,
          fullName: user.fullName,
          departmentId: user.departmentId,
          departmentCode: user.departmentCode,
          departmentName: user.departmentName,
          teamId: user.teamId,
          teamCode: user.teamCode,
          teamName: user.teamName,
          designationId: user.designationId,
          designationName: user.designationName,
          reportingManagerId: user.reportingManagerId,
          reportingManagerCode: user.reportingManagerCode,
          reportingManagerName: user.reportingManagerName,
          profilePhotoUrl: user.profilePhotoUrl ?? null,
          hasProfilePhoto: Boolean(user.hasProfilePhoto),
          mustChangePassword: Boolean(user.mustChangePassword),
        },
      });
    } catch (err: any) {
      if (err instanceof ValidationError) {
        return res.status(401).json({ error: err.message });
      }
      res.status(500).json({ error: err.message });
    }
  });

  // Logout endpoint (Accessible for every authenticated role)
  app.post('/api/auth/logout', async (req: Request, res: Response) => {
    try {
      const actor = req.user;
      if (actor && actor.userId) {
        await AuditService.logEvent({
          actorId: actor.userId,
          actorRole: actor.role,
          action: 'USER_LOGOUT',
          targetEntity: 'users',
          targetId: String(actor.userId),
          metadata: {
            userId: actor.userId,
            username: actor.username,
            role: actor.role,
            employeeId: actor.employeeId ?? null,
            timestamp: new Date().toISOString(),
          },
        });
      }
      res.setHeader('Clear-Site-Data', '"cache", "storage"');
      return res.json({
        success: true,
        authenticated: false,
        loggedOut: true,
        user: null,
        redirectTo: '/login',
        message: 'Logged out successfully.',
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Logout failed' });
    }
  });

  // Forgot Password endpoint (Public, returns safe generic response so account existence is never revealed)
  app.post('/api/auth/forgot-password', async (req: Request, res: Response) => {
    try {
      const { identifier, email, username, userId, usernameOrEmail, expiresInMs, simulateEmailFailure } =
        req.body || {};
      const targetIdentifier = identifier || email || username || userId || usernameOrEmail || '';
      const result = await UserService.requestPasswordReset(String(targetIdentifier), {
        expiresInMs,
        simulateEmailFailure,
      });
      return res.json(result);
    } catch (err: any) {
      if (err instanceof ValidationError) {
        return res.status(400).json({ error: err.message });
      }
      return res.status(400).json({ error: err.message || 'Unable to process password reset request' });
    }
  });

  // Verify Password Reset Token endpoint (Public)
  const handleVerifyResetToken = async (req: Request, res: Response) => {
    try {
      const token = String(req.body?.token ?? req.query?.token ?? '').trim();
      const result = await UserService.verifyPasswordResetToken(token);
      return res.json({ success: true, valid: result.valid, username: result.username });
    } catch (err: any) {
      return res.status(400).json({
        success: false,
        valid: false,
        error: err.message || 'Invalid or expired password reset token',
      });
    }
  };
  app.get('/api/auth/verify-reset-token', handleVerifyResetToken);
  app.post('/api/auth/verify-reset-token', handleVerifyResetToken);

  // Reset Password with One-Time Token endpoint (Public)
  app.post('/api/auth/reset-password', async (req: Request, res: Response) => {
    try {
      const { token, resetToken, newPassword, confirmPassword } = req.body || {};
      const result = await UserService.completePasswordReset({
        token: String(token || resetToken || ''),
        newPassword: String(newPassword || ''),
        confirmPassword: confirmPassword !== undefined ? String(confirmPassword) : undefined,
      });
      return res.json(result);
    } catch (err: any) {
      if (err instanceof ValidationError) {
        return res.status(400).json({ error: err.message });
      }
      return res.status(400).json({ error: err.message || 'Failed to reset password' });
    }
  });

  // ----------------------------------------------------
  // Company Logo & Branding Endpoints
  // ----------------------------------------------------

  // Get Global Company Logo / Branding (All Users)
  app.get('/api/company-logo', async (_req: Request, res: Response) => {
    try {
      const branding = await UserService.getCompanyBranding();
      return res.json({ success: true, branding });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Failed to load company branding' });
    }
  });

  app.get('/api/company-branding', async (_req: Request, res: Response) => {
    try {
      const branding = await UserService.getCompanyBranding();
      return res.json({ success: true, branding });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Failed to load company branding' });
    }
  });

  // Serve Global Company Logo Binary Image (All Users)
  app.get('/api/company-logo/image', async (_req: Request, res: Response) => {
    try {
      const file = await UserService.getCompanyLogoFile();
      res.setHeader('Content-Type', file.mimeType);
      res.setHeader('Content-Length', String(file.size));
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader(
        'Content-Security-Policy',
        "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'"
      );
      res.setHeader('Cache-Control', 'no-cache');
      return res.send(file.buffer);
    } catch (err: any) {
      return res.status(404).json({ error: err.message || 'Company logo not found' });
    }
  });

  // Upload or Replace Company Logo (SUPER_ADMIN Only)
  const handleCompanyLogoUpload = async (req: Request, res: Response) => {
    try {
      if (!req.user || req.user.role !== 'SUPER_ADMIN') {
        return res.status(403).json({
          error: 'Forbidden: Only SUPER_ADMIN can upload or replace the company logo.',
        });
      }
      const { fileName, fileData, mimeType } = req.body || {};
      const branding = await UserService.uploadCompanyLogo(
        { fileName, fileData, mimeType },
        req.user
      );
      return res.json({ success: true, branding });
    } catch (err: any) {
      if (err.message?.includes('Forbidden')) {
        return res.status(403).json({ error: err.message });
      }
      if (err instanceof ValidationError) {
        return res.status(400).json({ error: err.message, fieldErrors: err.fieldErrors });
      }
      return res.status(400).json({ error: err.message || 'Failed to upload company logo' });
    }
  };

  app.post('/api/company-logo', requireRole(['SUPER_ADMIN']), handleCompanyLogoUpload);
  app.put('/api/company-logo', requireRole(['SUPER_ADMIN']), handleCompanyLogoUpload);
  app.post('/api/company-branding/logo', requireRole(['SUPER_ADMIN']), handleCompanyLogoUpload);

  // Remove Company Logo and Restore Default Branding (SUPER_ADMIN Only)
  const handleCompanyLogoRemove = async (req: Request, res: Response) => {
    try {
      if (!req.user || req.user.role !== 'SUPER_ADMIN') {
        return res.status(403).json({
          error: 'Forbidden: Only SUPER_ADMIN can remove the company logo.',
        });
      }
      const branding = await UserService.removeCompanyLogo(req.user);
      return res.json({ success: true, branding });
    } catch (err: any) {
      if (err.message?.includes('Forbidden')) {
        return res.status(403).json({ error: err.message });
      }
      return res.status(400).json({ error: err.message || 'Failed to remove company logo' });
    }
  };

  app.delete('/api/company-logo', requireRole(['SUPER_ADMIN']), handleCompanyLogoRemove);
  app.delete('/api/company-branding/logo', requireRole(['SUPER_ADMIN']), handleCompanyLogoRemove);

  // 2. System Settings Endpoint (SUPER_ADMIN Only)
  app.get('/api/settings', requireRole(['SUPER_ADMIN']), async (_req: Request, res: Response) => {
    try {
      const branding = await UserService.getCompanyBranding();
      const baseSettings = UserService.getSystemSettings(INITIAL_SYSTEM_SETTINGS);
      if (!isDbConfigured()) {
        return res.json({
          source: 'default_config',
          settings: baseSettings,
          branding,
          isDbConnected: false,
        });
      }

      const db = getDb();
      if (!db) {
        return res.json({
          source: 'default_config',
          settings: baseSettings,
          branding,
          isDbConnected: false,
        });
      }

      const dbSettings = await db.select().from(systemSettings);
      const filteredDb = (dbSettings || []).filter(
        (s) =>
          s.settingKey !== 'company_logo' &&
          !s.settingKey.startsWith('user_profile_photo_')
      );
      if (filteredDb.length === 0) {
        return res.json({
          source: 'default_config',
          settings: baseSettings,
          branding,
          isDbConnected: true,
          note: 'Database configured; no custom rows inserted yet. Using default configurations.',
        });
      }

      const mergedMap = new Map(baseSettings.map((s) => [s.settingKey, s]));
      for (const row of filteredDb) {
        mergedMap.set(row.settingKey, {
          settingKey: row.settingKey,
          settingValue: row.settingValue,
          description: row.description ?? undefined,
          updatedAt: row.updatedAt ? new Date(row.updatedAt).toISOString() : undefined,
        });
      }
      // Ensure in-memory/manifest updates take precedence if updated more recently
      const finalSettings = UserService.getSystemSettings(Array.from(mergedMap.values()));

      return res.json({
        source: 'database',
        settings: finalSettings,
        branding,
        isDbConnected: true,
      });
    } catch (error) {
      console.warn('Could not query database for settings, returning defaults:', error);
      const branding = await UserService.getCompanyBranding();
      return res.json({
        source: 'default_config',
        settings: UserService.getSystemSettings(INITIAL_SYSTEM_SETTINGS),
        branding,
        isDbConnected: false,
      });
    }
  });

  // 3. Roles Master Data & RBAC Permission Configuration Endpoints
  app.get(
    '/api/roles',
    requireRole(['SUPER_ADMIN', 'HR', 'TOP_MANAGEMENT']),
    async (_req: Request, res: Response) => {
    try {
      const rolesList = await UserService.getRoles();
      const configured = isDbConfigured();
      return res.json({
        success: true,
        source: configured ? 'database' : 'default_config',
        roles: rolesList,
        availablePermissions: UserService.getAvailablePermissions(),
        isDbConnected: configured,
      });
    } catch (error: any) {
      return res.status(500).json({
        error: error.message || 'Failed to load roles',
      });
    }
  });

  app.get(
    '/api/roles/permissions-catalog',
    requireRole(['SUPER_ADMIN', 'HR', 'TOP_MANAGEMENT']),
    async (_req: Request, res: Response) => {
    return res.json({
      success: true,
      permissions: UserService.getAvailablePermissions(),
    });
  });

  app.get(
    '/api/roles/:id',
    requireRole(['SUPER_ADMIN', 'HR', 'TOP_MANAGEMENT']),
    async (req: Request, res: Response) => {
      try {
        const rawParam = String(req.params.id || '').trim();
        if (!rawParam) return res.status(400).json({ error: 'Invalid role ID or code' });
        const roleIdOrName = /^\d+$/.test(rawParam) ? Number(rawParam) : rawParam;
        const role = await UserService.getRoleByIdOrCode(roleIdOrName);
        if (!role) {
          return res.status(404).json({ error: `Role '${rawParam}' not found.` });
        }
        return res.json({
          success: true,
          role,
          availablePermissions: UserService.getAvailablePermissions(),
        });
      } catch (err: any) {
        return res.status(500).json({ error: err.message || 'Failed to fetch role details' });
      }
    }
  );

  app.post(
    '/api/roles',
    requireRole(['SUPER_ADMIN']),
    async (req: Request, res: Response) => {
      try {
        const created = await UserService.createRole(req.body || {}, req.user!);
        return res.status(201).json({
          success: true,
          role: created,
        });
      } catch (err: any) {
        if (err instanceof ValidationError) {
          return res.status(400).json({ error: err.message, fieldErrors: err.fieldErrors });
        }
        if (err.message?.includes('Forbidden')) {
          return res.status(403).json({ error: err.message });
        }
        return res.status(400).json({ error: err.message || 'Failed to create role' });
      }
    }
  );

  const handleUpdateRole = async (req: Request, res: Response) => {
    try {
      const rawParam = String(req.params.id || '').trim();
      if (!rawParam) return res.status(400).json({ error: 'Invalid role ID or name' });
      const roleIdOrName = /^\d+$/.test(rawParam) ? Number(rawParam) : rawParam;
      const updated = await UserService.updateRole(roleIdOrName, req.body || {}, req.user!);
      return res.json({
        success: true,
        role: updated,
      });
    } catch (err: any) {
      if (err instanceof ValidationError) {
        if (err.message.toLowerCase().includes('not found')) {
          return res.status(404).json({ error: err.message });
        }
        return res.status(400).json({ error: err.message, fieldErrors: err.fieldErrors });
      }
      if (err.message?.includes('Forbidden')) {
        return res.status(403).json({ error: err.message });
      }
      return res.status(400).json({ error: err.message || 'Failed to update role' });
    }
  };

  app.put('/api/roles/:id', requireRole(['SUPER_ADMIN']), handleUpdateRole);
  app.patch('/api/roles/:id', requireRole(['SUPER_ADMIN']), handleUpdateRole);

  app.delete(
    '/api/roles/:id',
    requireRole(['SUPER_ADMIN']),
    async (req: Request, res: Response) => {
      try {
        const rawParam = String(req.params.id || '').trim();
        if (!rawParam) return res.status(400).json({ error: 'Invalid role ID or name' });
        const roleIdOrName = /^\d+$/.test(rawParam) ? Number(rawParam) : rawParam;
        const force = req.query.force === 'true' || req.body?.force === true;
        const result = await UserService.deleteRole(roleIdOrName, req.user!, force);
        return res.json(result);
      } catch (err: any) {
        if (err instanceof ValidationError) {
          if (err.message.toLowerCase().includes('not found')) {
            return res.status(404).json({ error: err.message });
          }
          return res.status(400).json({
            error: err.message,
            isDependencyError: true,
            fieldErrors: err.fieldErrors,
          });
        }
        if (err.message?.includes('Forbidden')) {
          return res.status(403).json({ error: err.message });
        }
        return res.status(400).json({ error: err.message || 'Failed to delete role' });
      }
    }
  );

  app.put(
    '/api/roles/:id/permissions',
    requireRole(['SUPER_ADMIN']),
    async (req: Request, res: Response) => {
      try {
        const rawParam = String(req.params.id || '').trim();
        if (!rawParam) return res.status(400).json({ error: 'Invalid role ID or name' });
        const roleIdOrName = /^\d+$/.test(rawParam) ? Number(rawParam) : rawParam;
        const { permissions, description, isActive } = req.body || {};
        const updated = await UserService.updateRolePermissions(
          roleIdOrName,
          { permissions: Array.isArray(permissions) ? permissions : [], description, isActive },
          req.user!
        );
        return res.json({
          success: true,
          role: updated,
        });
      } catch (err: any) {
        if (err instanceof ValidationError) {
          return res.status(400).json({ error: err.message, fieldErrors: err.fieldErrors });
        }
        if (err.message?.includes('Forbidden')) {
          return res.status(403).json({ error: err.message });
        }
        return res.status(500).json({ error: err.message || 'Failed to update role permissions' });
      }
    }
  );

  // 4. Leave Types Endpoints
  app.get('/api/leave-types', async (req: Request, res: Response) => {
    try {
      const includeInactive = req.query.includeInactive === 'true' || req.user?.role === 'SUPER_ADMIN';
      const items = await LeaveService.getLeaveTypes({ includeInactive });
      res.json({ leaveTypes: items });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Internal server error' });
    }
  });

  app.post(
    '/api/leave-types',
    requireRole(['SUPER_ADMIN']),
    async (req: Request, res: Response) => {
      try {
        const created = await LeaveService.createLeaveType(req.body, req.user!);
        res.status(201).json({ success: true, leaveType: created });
      } catch (err: any) {
        if (err instanceof ValidationError) {
          return res.status(400).json({ error: err.message, fieldErrors: err.fieldErrors });
        }
        res.status(err.message?.includes('Forbidden') ? 403 : 500).json({ error: err.message });
      }
    }
  );

  app.patch(
    '/api/leave-types/:id',
    requireRole(['SUPER_ADMIN']),
    async (req: Request, res: Response) => {
      try {
        const id = Number(req.params.id);
        if (isNaN(id)) return res.status(400).json({ error: 'Invalid leave type ID' });

        const updated = await LeaveService.updateLeaveType(id, req.body, req.user!);
        res.json({ success: true, leaveType: updated });
      } catch (err: any) {
        if (err instanceof ValidationError) {
          return res.status(400).json({ error: err.message, fieldErrors: err.fieldErrors });
        }
        if (err.message?.includes('not found')) {
          return res.status(404).json({ error: err.message });
        }
        res.status(err.message?.includes('Forbidden') ? 403 : 500).json({ error: err.message });
      }
    }
  );

  app.delete(
    '/api/leave-types/:id',
    requireRole(['SUPER_ADMIN']),
    async (req: Request, res: Response) => {
      try {
        const id = Number(req.params.id);
        if (isNaN(id)) return res.status(400).json({ error: 'Invalid leave type ID' });
        const force = req.query.force === 'true' || req.body?.force === true;
        const result = await LeaveService.deleteLeaveType(id, req.user!, force);
        res.json(result);
      } catch (err: any) {
        if (err instanceof ValidationError) {
          return res.status(400).json({ error: err.message, isDependencyError: true, fieldErrors: err.fieldErrors });
        }
        res.status(err.message?.includes('Forbidden') ? 403 : 500).json({ error: err.message });
      }
    }
  );

  // 5. Leave Policies Endpoints
  app.get(
    '/api/leave-policies',
    requireRole(['SUPER_ADMIN', 'HR', 'TOP_MANAGEMENT', 'TEAM_LEADER', 'EMPLOYEE']),
    async (req: Request, res: Response) => {
      try {
        const leaveTypeId = req.query.leaveTypeId ? Number(req.query.leaveTypeId) : undefined;
        const includeInactive = req.query.includeInactive === 'true' || req.user?.role === 'SUPER_ADMIN';
        const policies = await LeaveService.getLeavePolicies({ leaveTypeId, includeInactive });
        res.json({ policies });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    }
  );

  app.post(
    '/api/leave-policies',
    requireRole(['SUPER_ADMIN']),
    async (req: Request, res: Response) => {
      try {
        const created = await LeaveService.createLeavePolicy(req.body, req.user!);
        res.status(201).json({ success: true, policy: created });
      } catch (err: any) {
        if (err instanceof ValidationError) {
          return res.status(400).json({ error: err.message, fieldErrors: err.fieldErrors });
        }
        res.status(err.message?.includes('Forbidden') ? 403 : 500).json({ error: err.message });
      }
    }
  );

  app.patch(
    '/api/leave-policies/:id',
    requireRole(['SUPER_ADMIN']),
    async (req: Request, res: Response) => {
      try {
        const id = Number(req.params.id);
        if (isNaN(id)) return res.status(400).json({ error: 'Invalid policy ID' });

        const updated = await LeaveService.updateLeavePolicy(id, req.body, req.user!);
        res.json({ success: true, policy: updated });
      } catch (err: any) {
        if (err instanceof ValidationError) {
          return res.status(400).json({ error: err.message, fieldErrors: err.fieldErrors });
        }
        if (err.message?.includes('not found')) {
          return res.status(404).json({ error: err.message });
        }
        res.status(err.message?.includes('Forbidden') ? 403 : 500).json({ error: err.message });
      }
    }
  );

  app.delete(
    '/api/leave-policies/:id',
    requireRole(['SUPER_ADMIN']),
    async (req: Request, res: Response) => {
      try {
        const id = Number(req.params.id);
        if (isNaN(id)) return res.status(400).json({ error: 'Invalid policy ID' });
        const result = await LeaveService.deleteLeavePolicy(id, req.user!);
        res.json(result);
      } catch (err: any) {
        if (err instanceof ValidationError) {
          return res.status(400).json({ error: err.message });
        }
        res.status(err.message?.includes('Forbidden') ? 403 : 500).json({ error: err.message });
      }
    }
  );

  // 6. Leave Balances Endpoints
  app.get(
    '/api/leave-balances',
    requireRole(['SUPER_ADMIN', 'HR', 'TOP_MANAGEMENT', 'TEAM_LEADER', 'EMPLOYEE']),
    async (req: Request, res: Response) => {
      try {
        const employeeId = parseIdOrCode(req.query.employeeId ?? req.query.employeeCode);
        const year = req.query.year ? Number(req.query.year) : undefined;
        const balances = await LeaveService.getLeaveBalances({ employeeId, year }, req.user);
        res.json({ balances });
      } catch (err: any) {
        res.status(err.message?.includes('Forbidden') ? 403 : 500).json({ error: err.message });
      }
    }
  );

  app.post(
    '/api/leave-balances',
    async (req: Request, res: Response) => {
      try {
        if (!req.user || !(await UserService.hasPermission(req.user, 'LEAVE_BALANCE_ADJUST'))) {
          return res.status(403).json({
            error: "Forbidden: You do not have permission to add or initialize leave balances (LEAVE_BALANCE_ADJUST required).",
          });
        }
        const created = await LeaveService.createOrInitBalance(req.body, req.user!);
        res.status(201).json({ success: true, balance: created });
      } catch (err: any) {
        if (err instanceof ValidationError) {
          return res.status(400).json({ error: err.message, fieldErrors: err.fieldErrors });
        }
        res.status(err.message?.includes('Forbidden') ? 403 : 500).json({ error: err.message });
      }
    }
  );

  app.post(
    '/api/leave-balances/adjust',
    async (req: Request, res: Response) => {
      try {
        if (!req.user || !(await UserService.hasPermission(req.user, 'LEAVE_BALANCE_ADJUST'))) {
          return res.status(403).json({
            error: "Forbidden: You do not have permission to add or adjust leave balances (LEAVE_BALANCE_ADJUST required).",
          });
        }
        const adjusted = await LeaveService.adjustLeaveBalance(req.body, req.user!);
        res.json({ success: true, balance: adjusted });
      } catch (err: any) {
        if (err instanceof ValidationError) {
          return res.status(400).json({ error: err.message });
        }
        res.status(err.message?.includes('Forbidden') ? 403 : 500).json({ error: err.message });
      }
    }
  );

  // 6c. Delete Leave Balance (SUPER_ADMIN only, dependency-safe)
  app.delete(
    '/api/leave-balances/:id',
    requireRole(['SUPER_ADMIN']),
    async (req: Request, res: Response) => {
      try {
        const id = Number(req.params.id);
        if (isNaN(id) || id <= 0) {
          return res.status(400).json({ error: 'Invalid leave balance ID' });
        }
        const force = req.query.force === 'true' || req.body?.force === true;
        const result = await LeaveService.deleteLeaveBalance(id, req.user!, force);
        res.json(result);
      } catch (err: any) {
        if (err instanceof ValidationError) {
          if (err.message.toLowerCase().includes('not found')) {
            return res.status(404).json({ error: err.message });
          }
          return res.status(400).json({ error: err.message, isDependencyError: true, fieldErrors: err.fieldErrors });
        }
        res.status(err.message?.includes('Forbidden') ? 403 : 500).json({ error: err.message });
      }
    }
  );

  // 7. Leave Balance Transactions Endpoints
  app.get(
    '/api/leave-balance-transactions',
    requireRole(['SUPER_ADMIN', 'HR', 'TOP_MANAGEMENT', 'TEAM_LEADER', 'EMPLOYEE']),
    async (req: Request, res: Response) => {
      try {
        const employeeId = parseIdOrCode(req.query.employeeId ?? req.query.employeeCode);
        const leaveBalanceId = req.query.leaveBalanceId ? Number(req.query.leaveBalanceId) : undefined;
        const transactions = await LeaveService.getLeaveBalanceTransactions(
          { employeeId, leaveBalanceId },
          req.user
        );
        res.json({ transactions });
      } catch (err: any) {
        res.status(err.message?.includes('Forbidden') ? 403 : 500).json({ error: err.message });
      }
    }
  );

  // 7b. Delete Leave Balance Transaction (SUPER_ADMIN only)
  app.delete(
    '/api/leave-balance-transactions/:id',
    requireRole(['SUPER_ADMIN']),
    async (req: Request, res: Response) => {
      try {
        const id = Number(req.params.id);
        if (isNaN(id) || id <= 0) {
          return res.status(400).json({ error: 'Invalid transaction ID' });
        }
        const result = await LeaveService.deleteLeaveBalanceTransaction(id, req.user!);
        res.json(result);
      } catch (err: any) {
        if (err instanceof ValidationError) {
          return res.status(404).json({ error: err.message });
        }
        res.status(err.message?.includes('Forbidden') ? 403 : 500).json({ error: err.message });
      }
    }
  );

  // 8. Holidays Endpoint (supporting departmentId, strictDepartmentId, employeeId, year, month, search)
  app.get('/api/holidays', async (req: Request, res: Response) => {
    try {
      const year = req.query.year ? Number(req.query.year) : undefined;
      const month = req.query.month ? Number(req.query.month) : undefined;
      const isActive = req.query.isActive !== undefined ? req.query.isActive === 'true' : undefined;
      const isOptional = req.query.isOptional !== undefined ? req.query.isOptional === 'true' : undefined;
      const search = req.query.search as string | undefined;

      let departmentId: number | string | null | undefined = undefined;
      if (req.query.departmentId !== undefined && req.query.departmentId !== '') {
        departmentId = req.query.departmentId === 'all' || req.query.departmentId === 'null' ? null : parseIdOrCode(req.query.departmentId);
      }

      let strictDepartmentId: number | string | null | undefined = undefined;
      if (req.query.strictDepartmentId !== undefined && req.query.strictDepartmentId !== '') {
        strictDepartmentId = req.query.strictDepartmentId === 'null' ? null : parseIdOrCode(req.query.strictDepartmentId);
      }

      const holidayListId = req.query.holidayListId ? Number(req.query.holidayListId) : undefined;
      const employeeId = parseIdOrCode(req.query.employeeId ?? req.query.employeeCode);

      let items: any[] = [];
      if (employeeId && departmentId === undefined && strictDepartmentId === undefined && holidayListId === undefined) {
        items = await HolidayService.getHolidaysForEmployee(employeeId, year);
      } else {
        items = await HolidayService.getHolidays({
          year,
          month,
          isActive,
          isOptional,
          search,
          holidayListId,
          departmentId,
          strictDepartmentId,
        });
      }
      res.json({ holidays: items });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 9. Leave Request Calculation Preview Endpoint
  app.post(
    '/api/leave-requests/calculate',
    requireRole(['SUPER_ADMIN', 'HR', 'TOP_MANAGEMENT', 'TEAM_LEADER', 'EMPLOYEE']),
    async (req: Request, res: Response) => {
      try {
        const preview = await LeaveRequestService.calculatePreview(req.body, req.user!);
        res.json({ preview });
      } catch (err: any) {
        if (err instanceof ValidationError) {
          return res.status(400).json({ error: err.message, fieldErrors: err.fieldErrors });
        }
        res.status(500).json({ error: err.message });
      }
    }
  );

  // 10. Attachment Validation & Upload Endpoint
  const handleAttachmentUpload = async (req: Request, res: Response) => {
    try {
      const { fileName, fileSize, mimeType, fileMime, fileData } = req.body;
      const requestedMime = AttachmentService.normalizeMimeType(
        mimeType || fileMime || AttachmentService.inferMimeType(fileName, null)
      );
      const processed = AttachmentService.validateAndProcessAttachment(
        fileName,
        Number(fileSize || 1024),
        requestedMime
      );
      const storedBuffer = AttachmentService.storeAttachmentData(
        processed.safeStoragePath,
        processed.safeFileName,
        fileData,
        processed.normalizedMimeType,
        processed.sanitizedOriginalName
      );
      const detectedMime =
        AttachmentService.detectMimeTypeFromBuffer(storedBuffer) || processed.normalizedMimeType;
      const safeSize = Number(storedBuffer.byteLength || fileSize || 1024);
      res.json({
        success: true,
        attachment: {
          ...processed,
          attachmentPath: processed.safeStoragePath,
          attachmentName: processed.sanitizedOriginalName,
          attachmentSize: safeSize,
          attachmentMime: detectedMime,
        },
        attachmentPath: processed.safeStoragePath,
        attachmentName: processed.sanitizedOriginalName,
        attachmentSize: safeSize,
        attachmentMime: detectedMime,
      });
    } catch (err: any) {
      if (err instanceof ValidationError) {
        return res.status(400).json({ error: err.message, fieldErrors: err.fieldErrors });
      }
      res.status(500).json({ error: err.message });
    }
  };

  app.post(
    '/api/leave-requests/upload',
    requireRole(['SUPER_ADMIN', 'HR', 'TOP_MANAGEMENT', 'TEAM_LEADER', 'EMPLOYEE']),
    handleAttachmentUpload
  );

  app.post(
    '/api/leave-requests/upload-document',
    requireRole(['SUPER_ADMIN', 'HR', 'TOP_MANAGEMENT', 'TEAM_LEADER', 'EMPLOYEE']),
    handleAttachmentUpload
  );

  // 10b. Authenticated & Authorized Attachment View / Download Endpoint
  app.get(
    [
      '/api/leave-requests/:id/attachment',
      '/api/team-leader/leave-requests/:id/attachment',
      '/api/hr/leave-requests/:id/attachment',
      '/api/management/leave-requests/:id/attachment',
    ],
    requireRole(['SUPER_ADMIN', 'HR', 'TOP_MANAGEMENT', 'TEAM_LEADER', 'EMPLOYEE']),
    async (req: Request, res: Response) => {
      try {
        const id = Number(req.params.id);
        if (isNaN(id)) {
          return res.status(400).json({ error: 'Invalid leave request ID' });
        }

        const attachment = await LeaveRequestService.getAuthorizedAttachment(id, req.user!);
        if (!AttachmentService.isInlineViewableMime(attachment.mimeType)) {
          return res.status(400).json({
            error: `Unsupported attachment MIME type '${attachment.mimeType}'`,
          });
        }

        const rawBuffer = Buffer.isBuffer(attachment.buffer)
          ? attachment.buffer
          : Buffer.from(attachment.buffer);

        const mode = String(req.query.mode || '').toLowerCase();
        const isDownload =
          mode === 'download' ||
          req.query.download === '1' ||
          req.query.download === 'true' ||
          !attachment.isInlineViewable;

        const disposition = isDownload ? 'attachment' : 'inline';
        const safeFileName = (attachment.fileName || `attachment-${id}.pdf`).replace(
          /[^a-zA-Z0-9._-]/g,
          '_'
        );

        res.status(200);
        res.setHeader('Content-Type', attachment.mimeType);
        res.setHeader('Content-Length', String(rawBuffer.byteLength));
        res.setHeader('Content-Disposition', `${disposition}; filename="${safeFileName}"`);
        res.setHeader('Cache-Control', 'private, no-store');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.end(rawBuffer);
      } catch (err: any) {
        if (err.message?.includes('Forbidden')) {
          return res.status(403).json({ error: err.message });
        }
        if (err instanceof ValidationError) {
          if (err.message.includes('not found') || err.message.includes('No attachment')) {
            return res.status(404).json({ error: err.message });
          }
          return res.status(400).json({ error: err.message, fieldErrors: err.fieldErrors });
        }
        res.status(500).json({ error: 'Unable to open attachment. Please try downloading the file.' });
      }
    }
  );

  // 10e. Prevent removing attachments from already-submitted leave requests
  app.delete(
    '/api/leave-requests/:id/attachment',
    requireRole(['SUPER_ADMIN', 'HR', 'TOP_MANAGEMENT', 'TEAM_LEADER', 'EMPLOYEE']),
    async (req: Request, res: Response) => {
      try {
        const id = Number(req.params.id);
        if (isNaN(id) || id <= 0) {
          return res.status(400).json({ error: 'Invalid leave request ID' });
        }
        await LeaveRequestService.removeAttachmentFromSubmittedRequest(id, req.user!);
      } catch (err: any) {
        if (err.message?.includes('Forbidden')) {
          return res.status(403).json({ error: err.message });
        }
        if (err instanceof ValidationError) {
          return res.status(404).json({ error: err.message });
        }
        return res.status(500).json({ error: err.message });
      }
    }
  );

  // 10e. Super Admin Edit Leave Request (Administrative Update with Audit Trail)
  app.put(
    '/api/leave-requests/:id',
    requireRole(['SUPER_ADMIN']),
    async (req: Request, res: Response) => {
      try {
        const id = Number(req.params.id);
        if (isNaN(id) || id <= 0) {
          return res.status(400).json({ error: 'Invalid leave request ID' });
        }
        const auditMeta = {
          ipAddress: (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress,
          userAgent: req.headers['user-agent'],
        };
        const updated = await LeaveRequestService.adminEditLeaveRequest(
          id,
          req.body || {},
          req.user!,
          auditMeta
        );
        res.json({ success: true, leaveRequest: updated });
      } catch (err: any) {
        if (err instanceof ValidationError) {
          return res.status(400).json({ error: err.message, fieldErrors: err.fieldErrors });
        }
        res.status(err.message?.includes('Forbidden') ? 403 : 500).json({ error: err.message });
      }
    }
  );

  // 10f. Super Admin Delete Leave Request (Administrative Deletion with Balance Reversal)
  app.delete(
    '/api/leave-requests/:id',
    requireRole(['SUPER_ADMIN']),
    async (req: Request, res: Response) => {
      try {
        const id = Number(req.params.id);
        if (isNaN(id) || id <= 0) {
          return res.status(400).json({ error: 'Invalid leave request ID' });
        }
        const reason = String(req.body?.reason || req.query?.reason || '').trim();
        const result = await LeaveRequestService.deleteLeaveRequest(id, req.user!, reason);
        res.json(result);
      } catch (err: any) {
        if (err instanceof ValidationError) {
          return res.status(404).json({ error: err.message });
        }
        res.status(err.message?.includes('Forbidden') ? 403 : 500).json({ error: err.message });
      }
    }
  );

  // 11. Leave Requests Submission Endpoint
  app.post(
    ['/api/leave-requests', '/api/leave-requests/submit', '/api/leave-requests/apply'],
    requireRole(['SUPER_ADMIN', 'HR', 'TOP_MANAGEMENT', 'TEAM_LEADER', 'EMPLOYEE']),
    async (req: Request, res: Response) => {
      try {
        const auditMeta = {
          ipAddress: (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress,
          userAgent: req.headers['user-agent'],
        };
        const rawBody = req.body || {};
        const normalizedBody = {
          ...rawBody,
          leaveTypeId: Number(rawBody.leaveTypeId ?? rawBody.leaveType ?? 1),
          dayType: rawBody.dayType || rawBody.durationUnit || 'FULL_DAY',
          halfDayPeriod: rawBody.halfDayPeriod ?? rawBody.halfDaySession ?? null,
        };
        const created = await LeaveRequestService.submitLeaveRequest(normalizedBody, req.user!, auditMeta);
        res.status(201).json({ success: true, leaveRequest: created });
      } catch (err: any) {
        if (err instanceof ValidationError) {
          return res.status(400).json({ error: err.message, fieldErrors: err.fieldErrors });
        }
        if (err.message?.includes('Forbidden')) {
          return res.status(403).json({ error: err.message });
        }
        res.status(500).json({ error: err.message });
      }
    }
  );

  // 12. My Leave Requests Endpoint (Enforcing ownership or SUPER_ADMIN/HR/TOP_MANAGEMENT query)
  app.get(
    '/api/leave-requests/my',
    requireRole(['SUPER_ADMIN', 'HR', 'TOP_MANAGEMENT', 'TEAM_LEADER', 'EMPLOYEE']),
    async (req: Request, res: Response) => {
      try {
        const requestedEmpId = parseIdOrCode(req.query.employeeId ?? req.query.employeeCode);
        const selfEmpId = req.user?.employeeCode || req.user?.employeeId || 101;
        let targetEmpId: number | string = selfEmpId;
        if (requestedEmpId !== undefined) {
          if (
            req.user?.role !== 'SUPER_ADMIN' &&
            !isSameEmployeeActor(req.user, requestedEmpId) &&
            !(await UserService.hasPermission(req.user!, 'LEAVE_VIEW_ALL')) &&
            !(await UserService.hasPermission(req.user!, 'EMPLOYEE_VIEW'))
          ) {
            return res.status(403).json({ error: 'Forbidden: You can only view your own leave requests' });
          }
          targetEmpId = requestedEmpId;
        }
        const requests = await LeaveRequestService.getEmployeeRequests(targetEmpId);
        res.json({ leaveRequests: requests });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    }
  );

  // 13. Single Leave Request Details Endpoint (Enforcing ownership)
  app.get(
    '/api/leave-requests/:id',
    requireRole(['SUPER_ADMIN', 'HR', 'TOP_MANAGEMENT', 'TEAM_LEADER', 'EMPLOYEE']),
    async (req: Request, res: Response) => {
      try {
        const id = Number(req.params.id);
        if (isNaN(id)) return res.status(400).json({ error: 'Invalid leave request ID' });

        const result = await LeaveRequestService.getLeaveRequestById(id, req.user!);
        if (!result) {
          return res.status(404).json({ error: `Leave request with ID ${id} not found` });
        }
        if (await denySuperAdminEmployeeTarget(result.request?.employeeId, req, res)) return;
        res.json({ leaveRequest: result.request, events: result.events });
      } catch (err: any) {
        if (err.message?.includes('Forbidden')) {
          return res.status(403).json({ error: err.message });
        }
        res.status(500).json({ error: err.message });
      }
    }
  );

  // 14. Cancel Leave Request Endpoint
  app.post(
    '/api/leave-requests/:id/cancel',
    requireRole(['SUPER_ADMIN', 'HR', 'TOP_MANAGEMENT', 'TEAM_LEADER', 'EMPLOYEE']),
    async (req: Request, res: Response) => {
      try {
        const id = Number(req.params.id);
        if (isNaN(id)) return res.status(400).json({ error: 'Invalid leave request ID' });

        const auditMeta = {
          ipAddress: (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress,
          userAgent: req.headers['user-agent'],
        };
        const cancelled = await LeaveRequestService.cancelLeaveRequest(
          id,
          req.body.cancellationReason || req.body.reason,
          req.user!,
          auditMeta
        );
        res.json({ success: true, leaveRequest: cancelled });
      } catch (err: any) {
        if (err instanceof ValidationError) {
          return res.status(400).json({ error: err.message, fieldErrors: err.fieldErrors });
        }
        if (err.message?.includes('Forbidden')) {
          return res.status(403).json({ error: err.message });
        }
        res.status(500).json({ error: err.message });
      }
    }
  );

  // 14a. Team Leader Leave Requests Queue (Stage 1)
  app.get(
    ['/api/team-leader/leave-requests', '/api/approvals/team-leader/requests'],
    requireRole(['SUPER_ADMIN', 'HR', 'TOP_MANAGEMENT', 'TEAM_LEADER', 'EMPLOYEE']),
    async (req: Request, res: Response) => {
      try {
        const status = req.query.status as string | undefined;
        const search = req.query.search as string | undefined;
        const rawList = await ApprovalService.getRequestsForTeamLeader({ status, search }, req.user!);
        const list = await excludeSuperAdminRequests(rawList, req.user?.role);
        res.json({ leaveRequests: list, requests: list });
      } catch (err: any) {
        if (err.message?.includes('Forbidden')) return res.status(403).json({ error: err.message });
        res.status(500).json({ error: err.message });
      }
    }
  );

  // 14b. Team Leader Leave Request Details
  app.get(
    '/api/team-leader/leave-requests/:id',
    requireRole(['SUPER_ADMIN', 'HR', 'TOP_MANAGEMENT', 'TEAM_LEADER', 'EMPLOYEE']),
    async (req: Request, res: Response) => {
      try {
        const id = Number(req.params.id);
        if (isNaN(id)) return res.status(400).json({ error: 'Invalid leave request ID' });
        const details = await ApprovalService.getApprovalDetails(id, req.user!);
        if (!details) return res.status(404).json({ error: 'Leave request not found' });
        res.json(details);
      } catch (err: any) {
        if (err.message?.includes('Forbidden')) return res.status(403).json({ error: err.message });
        res.status(500).json({ error: err.message });
      }
    }
  );

  // 14c. Team Leader Decision Endpoint (Stage 1)
  app.post(
    ['/api/team-leader/leave-requests/:id/decision', '/api/approvals/team-leader/:id/decision'],
    requireRole(['SUPER_ADMIN', 'HR', 'TOP_MANAGEMENT', 'TEAM_LEADER', 'EMPLOYEE']),
    async (req: Request, res: Response) => {
      try {
        const id = Number(req.params.id);
        if (isNaN(id)) return res.status(400).json({ error: 'Invalid leave request ID' });
        const auditMeta = {
          ipAddress: (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress,
          userAgent: req.headers['user-agent'],
        };
        const updated = await ApprovalService.submitTeamLeaderDecision(id, req.body, req.user!, auditMeta);
        res.json({ success: true, leaveRequest: updated, request: updated });
      } catch (err: any) {
        if (err instanceof ValidationError) {
          return res.status(400).json({ error: err.message, fieldErrors: err.fieldErrors });
        }
        if (err.message?.includes('Forbidden')) {
          return res.status(403).json({ error: err.message });
        }
        res.status(500).json({ error: err.message });
      }
    }
  );

  // 14d. HR fallback queue for Stage 1 requests whose Reporting Person is unavailable
  app.get(
    '/api/hr/stage1-fallback-requests',
    requireRole(['SUPER_ADMIN', 'HR']),
    async (req: Request, res: Response) => {
      try {
        const search = req.query.search as string | undefined;
        const list = await ApprovalService.getRequestsForHrStage1Fallback({ search }, req.user!);
        res.json({ leaveRequests: list, requests: list });
      } catch (err: any) {
        if (err.message?.includes('Forbidden')) return res.status(403).json({ error: err.message });
        res.status(500).json({ error: err.message });
      }
    }
  );

  app.post(
    '/api/hr/leave-requests/:id/reporting-person-fallback',
    requireRole(['SUPER_ADMIN', 'HR']),
    async (req: Request, res: Response) => {
      try {
        const id = Number(req.params.id);
        if (isNaN(id)) return res.status(400).json({ error: 'Invalid leave request ID' });
        const auditMeta = {
          ipAddress: (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress,
          userAgent: req.headers['user-agent'],
        };
        const updated = await ApprovalService.submitHrStage1FallbackApproval(id, req.body, req.user!, auditMeta);
        res.json({ success: true, leaveRequest: updated });
      } catch (err: any) {
        if (err instanceof ValidationError) {
          return res.status(400).json({ error: err.message, fieldErrors: err.fieldErrors });
        }
        if (err.message?.includes('Forbidden')) return res.status(403).json({ error: err.message });
        res.status(500).json({ error: err.message });
      }
    }
  );

  // 15. HR Leave Requests Queue
  app.get(
    '/api/hr/leave-requests',
    requireRole(['SUPER_ADMIN', 'HR']),
    async (req: Request, res: Response) => {
      try {
        const status = req.query.status as string | undefined;
        const search = req.query.search as string | undefined;
        const rawList = await ApprovalService.getRequestsForHr({ status, search }, req.user!);
        const list = await excludeSuperAdminRequests(rawList, req.user?.role);
        res.json({ leaveRequests: list });
      } catch (err: any) {
        if (err.message?.includes('Forbidden')) return res.status(403).json({ error: err.message });
        res.status(500).json({ error: err.message });
      }
    }
  );

  // 15b. HR Top Management Leave Overview (Read-Only)
  app.get(
    '/api/hr/top-management-leaves',
    requireRole(['SUPER_ADMIN', 'HR']),
    async (req: Request, res: Response) => {
      try {
        const rawOverview = await LeaveRequestService.getTopManagementLeaveOverview(req.user!);
        const overview = await excludeSuperAdminRequests(rawOverview, req.user?.role);
        res.json({ leaveRequests: overview });
      } catch (err: any) {
        if (err.message?.includes('Forbidden')) return res.status(403).json({ error: err.message });
        res.status(500).json({ error: err.message });
      }
    }
  );

  // 16. HR Leave Request Details
  app.get(
    '/api/hr/leave-requests/:id',
    requireRole(['SUPER_ADMIN', 'HR']),
    async (req: Request, res: Response) => {
      try {
        const id = Number(req.params.id);
        if (isNaN(id)) return res.status(400).json({ error: 'Invalid leave request ID' });
        const details = await ApprovalService.getApprovalDetails(id, req.user!);
        if (!details) return res.status(404).json({ error: 'Leave request not found' });
        res.json(details);
      } catch (err: any) {
        if (err.message?.includes('Forbidden')) return res.status(403).json({ error: err.message });
        res.status(500).json({ error: err.message });
      }
    }
  );

  // 17. HR Decision Endpoint
  app.post(
    '/api/hr/leave-requests/:id/decision',
    requireRole(['SUPER_ADMIN', 'HR']),
    async (req: Request, res: Response) => {
      try {
        const id = Number(req.params.id);
        if (isNaN(id)) return res.status(400).json({ error: 'Invalid leave request ID' });
        const auditMeta = {
          ipAddress: (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress,
          userAgent: req.headers['user-agent'],
        };
        const updated = await ApprovalService.submitHrDecision(id, req.body, req.user!, auditMeta);
        res.json({ success: true, leaveRequest: updated });
      } catch (err: any) {
        if (err instanceof ValidationError) {
          return res.status(400).json({ error: err.message, fieldErrors: err.fieldErrors });
        }
        if (err.message?.includes('Forbidden')) {
          return res.status(403).json({ error: err.message });
        }
        res.status(500).json({ error: err.message });
      }
    }
  );

  // 18. Top Management Leave Requests Queue
  app.get(
    '/api/management/leave-requests',
    requireRole(['SUPER_ADMIN', 'TOP_MANAGEMENT']),
    async (req: Request, res: Response) => {
      try {
        const status = req.query.status as string | undefined;
        const search = req.query.search as string | undefined;
        const rawList = await ApprovalService.getRequestsForManagement({ status, search }, req.user!);
        const list = await excludeSuperAdminRequests(rawList, req.user?.role);
        res.json({ leaveRequests: list });
      } catch (err: any) {
        if (err.message?.includes('Forbidden')) return res.status(403).json({ error: err.message });
        res.status(500).json({ error: err.message });
      }
    }
  );

  // 19. Top Management Leave Request Details
  app.get(
    '/api/management/leave-requests/:id',
    requireRole(['SUPER_ADMIN', 'TOP_MANAGEMENT']),
    async (req: Request, res: Response) => {
      try {
        const id = Number(req.params.id);
        if (isNaN(id)) return res.status(400).json({ error: 'Invalid leave request ID' });
        const details = await ApprovalService.getApprovalDetails(id, req.user!);
        if (!details) return res.status(404).json({ error: 'Leave request not found' });
        res.json(details);
      } catch (err: any) {
        if (err.message?.includes('Forbidden')) return res.status(403).json({ error: err.message });
        res.status(500).json({ error: err.message });
      }
    }
  );

  // 20. Top Management Decision Endpoint
  app.post(
    '/api/management/leave-requests/:id/decision',
    requireRole(['SUPER_ADMIN', 'TOP_MANAGEMENT']),
    async (req: Request, res: Response) => {
      try {
        const id = Number(req.params.id);
        if (isNaN(id)) return res.status(400).json({ error: 'Invalid leave request ID' });
        const auditMeta = {
          ipAddress: (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress,
          userAgent: req.headers['user-agent'],
        };
        const updated = await ApprovalService.submitManagementDecision(id, req.body, req.user!, auditMeta);
        res.json({ success: true, leaveRequest: updated });
      } catch (err: any) {
        if (err instanceof ValidationError) {
          return res.status(400).json({ error: err.message, fieldErrors: err.fieldErrors });
        }
        if (err.message?.includes('Forbidden')) {
          return res.status(403).json({ error: err.message });
        }
        res.status(500).json({ error: err.message });
      }
    }
  );

  // Allow any role with the configured permission to return a request from the HR review queue.
  app.post(
    '/api/hr/leave-requests/:id/return-for-correction',
    async (req: Request, res: Response) => {
      try {
        if (!(await UserService.hasPermission(req.user, 'LEAVE_RETURN_FOR_CORRECTION'))) {
          return res.status(403).json({ error: 'Forbidden: LEAVE_RETURN_FOR_CORRECTION permission is required for your role.' });
        }
        const id = Number(req.params.id);
        if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid leave request ID' });
        const auditMeta = {
          ipAddress: (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress,
          userAgent: req.headers['user-agent'],
        };
        const leaveRequest = await ApprovalService.returnLeaveForReasonCorrection(id, req.body || {}, req.user!, auditMeta);
        res.json({ success: true, leaveRequest });
      } catch (err: any) {
        if (err instanceof ValidationError) return res.status(400).json({ error: err.message });
        if (err.message?.includes('Forbidden')) return res.status(403).json({ error: err.message });
        res.status(500).json({ error: err.message || 'Failed to return leave request' });
      }
    }
  );

  // Return a pending final-stage request to the employee for reason correction.
  app.post(
    '/api/management/leave-requests/:id/return-for-correction',
    async (req: Request, res: Response) => {
      try {
        if (!(await UserService.hasPermission(req.user, 'LEAVE_RETURN_FOR_CORRECTION'))) {
          return res.status(403).json({ error: 'Forbidden: LEAVE_RETURN_FOR_CORRECTION permission is required for your role.' });
        }
        const id = Number(req.params.id);
        if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid leave request ID' });
        const auditMeta = {
          ipAddress: (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress,
          userAgent: req.headers['user-agent'],
        };
        const leaveRequest = await ApprovalService.returnLeaveForReasonCorrection(id, req.body || {}, req.user!, auditMeta);
        res.json({ success: true, leaveRequest });
      } catch (err: any) {
        if (err instanceof ValidationError) return res.status(400).json({ error: err.message });
        if (err.message?.includes('Forbidden')) return res.status(403).json({ error: err.message });
        res.status(500).json({ error: err.message || 'Failed to return leave request' });
      }
    }
  );

  // Employee re-submits the same returned request after correcting its reason.
  app.post(
    '/api/leave-requests/:id/reapply',
    requireRole(['SUPER_ADMIN', 'EMPLOYEE']),
    async (req: Request, res: Response) => {
      try {
        const id = Number(req.params.id);
        if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid leave request ID' });
        const auditMeta = {
          ipAddress: (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress,
          userAgent: req.headers['user-agent'],
        };
        const leaveRequest = await LeaveRequestService.reapplyReturnedLeaveRequest(id, String(req.body?.reason || ''), req.user!, auditMeta);
        res.json({ success: true, leaveRequest });
      } catch (err: any) {
        if (err instanceof ValidationError) return res.status(400).json({ error: err.message, fieldErrors: err.fieldErrors });
        if (err.message?.includes('Forbidden')) return res.status(403).json({ error: err.message });
        res.status(500).json({ error: err.message || 'Failed to re-submit leave request' });
      }
    }
  );

  // 21. Employee Leave History & Profile Statistics
  app.get(
    '/api/employees/:id/leave-history',
    requireRole(['SUPER_ADMIN', 'HR', 'TOP_MANAGEMENT', 'TEAM_LEADER', 'EMPLOYEE']),
    async (req: Request, res: Response) => {
      try {
        const id = parseIdOrCode(req.params.id);
        if (id === undefined) return res.status(400).json({ error: 'Invalid employee ID' });
        const history = await ApprovalService.getEmployeeApprovalHistory(id, req.user!);
        res.json({ history });
      } catch (err: any) {
        if (err.message?.includes('Forbidden')) return res.status(403).json({ error: err.message });
        res.status(500).json({ error: err.message });
      }
    }
  );

  // 21b. Dashboard Live Statistics
  app.get('/api/dashboard/stats', async (req: Request, res: Response) => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const allEmployees = await UserService.getAllEmployees();
      const employeeDirectory = allEmployees.filter((employee: any) => String(employee.role || '').toUpperCase() !== 'SUPER_ADMIN');
      const employeeDirectoryIds = new Set(employeeDirectory.map((employee: any) => Number(employee.id)));
      const storedRequests = await LeaveRequestService.getAllRequests();
      // Super Admin's own leave records must not appear in any other user's dashboard totals or lists.
      const allRequests = req.user?.role === 'SUPER_ADMIN'
        ? storedRequests
        : storedRequests.filter((request: any) => employeeDirectoryIds.has(Number(request.employeeId)));
      const requestedEmployeeId = req.query.employeeId ? Number(req.query.employeeId) : undefined;
      if (requestedEmployeeId !== undefined && (!Number.isInteger(requestedEmployeeId) || requestedEmployeeId <= 0)) {
        return res.status(400).json({ error: 'Invalid employeeId' });
      }
      if (
        requestedEmployeeId !== undefined &&
        req.user?.role !== 'SUPER_ADMIN' &&
        Number(req.user?.employeeId) !== requestedEmployeeId
      ) {
        return res.status(403).json({ error: 'Forbidden: You can only view your own dashboard' });
      }
      const viewingEmployeeAsAdmin = req.user?.role === 'SUPER_ADMIN' && requestedEmployeeId !== undefined;
      const empId = viewingEmployeeAsAdmin ? requestedEmployeeId : (req.user?.employeeId || requestedEmployeeId);
      const dashboardRequests = viewingEmployeeAsAdmin
        ? allRequests.filter((r: any) => Number(r.employeeId) === Number(empId))
        : allRequests;
      const holidays = await WorkingDaysService.getHolidays(undefined, empId);
      const upcomingHolidays = holidays.filter((h) => h.holidayDate >= today).slice(0, 5);

      const onLeaveToday = dashboardRequests.filter(
        (r: any) =>
          r.finalStatus === 'APPROVED' &&
          r.startDate <= today &&
          r.endDate >= today
      );

      const pendingTeamLeaderCount = dashboardRequests.filter(
        (r: any) => (r.teamLeaderDecision || 'PENDING') === 'PENDING' && r.finalStatus === 'PENDING'
      ).length;

      const pendingHrCount = dashboardRequests.filter(
        (r: any) =>
          (r.teamLeaderDecision || 'PENDING') !== 'REJECTED' &&
          r.hrDecision === 'PENDING' &&
          r.finalStatus === 'PENDING'
      ).length;

      const pendingMgmtCount = dashboardRequests.filter(
        (r: any) => r.managementDecision === 'PENDING' && r.finalStatus === 'PENDING'
      ).length;

      const approvedCount = dashboardRequests.filter((r: any) => r.finalStatus === 'APPROVED').length;
      const rejectedCount = dashboardRequests.filter((r: any) => r.finalStatus === 'REJECTED').length;

      const upcomingLeaves = dashboardRequests
        .filter((r: any) => r.finalStatus === 'APPROVED' && r.startDate > today)
        .slice(0, 10);

      // Breakdown by Leave Type
      const typeCountMap: Record<string, number> = {};
      for (const reqItem of dashboardRequests) {
        if (reqItem.finalStatus === 'APPROVED') {
          const key = reqItem.leaveTypeName || reqItem.leaveTypeCode || 'Other';
          typeCountMap[key] = (typeCountMap[key] || 0) + Number(reqItem.totalDays || 1);
        }
      }
      const leaveByType = Object.entries(typeCountMap).map(([name, count]) => ({ name, count }));

      // Breakdown by Department
      const deptCountMap: Record<string, number> = {};
      const empMap = new Map(employeeDirectory.map((e: any) => [e.id, e]));
      for (const reqItem of dashboardRequests) {
        if (reqItem.finalStatus === 'APPROVED') {
          const emp = empMap.get(reqItem.employeeId) as any;
          const dept = emp?.departmentName || 'General';
          deptCountMap[dept] = (deptCountMap[dept] || 0) + Number(reqItem.totalDays || 1);
        }
      }
      const leaveByDepartment = Object.entries(deptCountMap).map(([department, count]) => ({
        department,
        count,
      }));

      // Employee context data if employee role
      let employeeContext: any = null;
      if (req.user) {
        const employeeContextId = empId || req.user.employeeId || 101;
        const myBalances = await LeaveService.getLeaveBalances({ employeeId: employeeContextId }, req.user);
        const myRequests = await LeaveRequestService.getEmployeeRequests(employeeContextId);
        const myUpcoming = myRequests.filter((r: any) => r.finalStatus === 'APPROVED' && r.startDate >= today);
        const todaySchedule = await ShiftService.resolveEmployeeSchedule(employeeContextId, today);
        const unreadCount = viewingEmployeeAsAdmin
          ? await NotificationService.getUnreadCountForEmployee(employeeContextId)
          : await NotificationService.getUnreadCount(req.user);

        employeeContext = {
          balances: myBalances,
          pendingRequests: myRequests.filter((r: any) => r.finalStatus === 'PENDING'),
          approvedLeaves: myRequests.filter((r: any) => r.finalStatus === 'APPROVED'),
          upcomingLeaves: myUpcoming,
          requestHistory: myRequests.map((r: any) => ({
            id: r.id,
            requestNumber: r.requestNumber,
            startDate: r.startDate,
            endDate: r.endDate,
            totalDays: r.totalDays,
            leaveTypeName: r.leaveTypeName || r.leaveTypeCode || 'Leave',
            dayType: r.dayType,
            reason: r.reason,
            applicationTimestamp: r.applicationTimestamp || r.createdAt || null,
            status: r.status,
            finalStatus: r.finalStatus,
            teamLeaderDecision: r.teamLeaderDecision,
            teamLeaderRemarks: r.teamLeaderRemarks,
            hrDecision: r.hrDecision,
            hrRemarks: r.hrRemarks,
            managementDecision: r.managementDecision,
            managementRemarks: r.managementRemarks,
          })).sort((a: any, b: any) => String(b.applicationTimestamp || '').localeCompare(String(a.applicationTimestamp || ''))),
          todaySchedule: {
            shiftCode: todaySchedule.shiftCode || (todaySchedule.isWeeklyOff ? 'WO' : 'GN'),
            shiftName: todaySchedule.shiftName || (todaySchedule.isWeeklyOff ? 'Weekly Off' : 'General Shift'),
            isWeeklyOff: todaySchedule.isWeeklyOff,
            timingSummary: todaySchedule.earliestStartTime && todaySchedule.latestEndTime
              ? `${todaySchedule.earliestStartTime} - ${todaySchedule.latestEndTime}`
              : (todaySchedule.isWeeklyOff ? 'Weekly Off' : 'Standard Timing'),
          },
          unreadCount,
        };
      }

      res.json({
        totalEmployees: employeeDirectory.length,
        onLeaveTodayCount: onLeaveToday.length,
        onLeaveTodayList: onLeaveToday.map((r: any) => ({
          id: r.id,
          employeeId: r.employeeId,
          employeeName: r.employeeName,
          leaveTypeName: r.leaveTypeName,
          startDate: r.startDate,
          endDate: r.endDate,
          totalDays: r.totalDays,
        })),
        pendingTeamLeaderCount,
        pendingHrCount,
        pendingMgmtCount,
        approvedCount,
        rejectedCount,
        upcomingLeaves,
        leaveByType,
        leaveByDepartment,
        upcomingHolidays,
        employeeContext,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 21c. MIS & Reports Data Endpoint
  app.get('/api/reports/data', async (req: Request, res: Response) => {
    try {
      const hasReportsPerm = req.user
        ? (await UserService.hasPermission(req.user, 'reports.view')) ||
          (await UserService.hasPermission(req.user, 'reports.export'))
        : false;
      const canViewEmployees = req.user ? await UserService.hasPermission(req.user, 'EMPLOYEE_VIEW') : false;
      const canViewAllLeaves = req.user ? await UserService.hasPermission(req.user, 'LEAVE_VIEW_ALL') : false;
      if (
        !req.user ||
        req.user.role === 'EMPLOYEE' ||
        (!hasReportsPerm && !canViewEmployees && !canViewAllLeaves)
      ) {
        return res.status(403).json({
          error: 'Forbidden: Reports & MIS is restricted to authorized HR, Top Management, and Super Admin roles.',
        });
      }
      const allEmployees = (canViewEmployees
        ? await UserService.getAllEmployees()
        : (await UserService.getAllEmployees()).filter((e) => e.id === req.user?.employeeId))
        .filter((employee: any) => String(employee.role || '').toUpperCase() !== 'SUPER_ADMIN');
      const storedRequests = await LeaveRequestService.getAllRequests();
      const visibleEmployeeIds = new Set(allEmployees.map((employee: any) => Number(employee.id)));
      // Reports for non-Super Admin roles must never expose Super Admin leave history.
      const allRequests = req.user?.role === 'SUPER_ADMIN'
        ? storedRequests
        : storedRequests.filter((request: any) => visibleEmployeeIds.has(Number(request.employeeId)));
      const allTypes = await LeaveService.getLeaveTypes({ includeInactive: true });
      const holidays = await HolidayService.getHolidays();
      const shifts = await ShiftService.getShifts({ includeInactive: true });
      const overtime = await OvertimeService.getRequests();
      const allBalances = await LeaveService.getLeaveBalances({}, req.user);
      const balances = req.user?.role === 'SUPER_ADMIN'
        ? allBalances
        : allBalances.filter((balance: any) => visibleEmployeeIds.has(Number(balance.employeeId)));

      res.json({
        employees: allEmployees,
        leaveRequests: allRequests,
        leaveTypes: allTypes,
        holidays,
        shifts,
        overtimeRequests: overtime,
        balances,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ----------------------------------------------------
  // STEP 6: Holidays & Working Calendar Management Endpoints
  // ----------------------------------------------------

  // 23. Get Single Holiday
  app.get('/api/holidays/:id', async (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: 'Invalid holiday ID' });
      const item = await HolidayService.getHolidayById(id);
      if (!item) return res.status(404).json({ error: 'Holiday not found' });
      res.json({ holiday: item });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 24. Create Holiday (Admin/HR with HOLIDAY_MANAGE)
  app.post(
    '/api/holidays',
    requireRole(['SUPER_ADMIN', 'HR', 'TOP_MANAGEMENT', 'TEAM_LEADER', 'EMPLOYEE']),
    async (req: Request, res: Response) => {
      try {
        if (!(await UserService.hasPermission(req.user!, 'HOLIDAY_MANAGE'))) {
          return res.status(403).json({
            error: `Forbidden: Role '${req.user?.role}' does not have HOLIDAY_MANAGE permission.`,
          });
        }
        const created = await HolidayService.createHoliday(req.body);
        res.status(201).json({ success: true, holiday: created });
      } catch (err: any) {
        if (err instanceof ValidationError) {
          return res.status(400).json({ error: err.message });
        }
        res.status(500).json({ error: err.message });
      }
    }
  );

  // 25. Update Holiday (Admin/HR with HOLIDAY_MANAGE)
  app.put(
    '/api/holidays/:id',
    requireRole(['SUPER_ADMIN', 'HR', 'TOP_MANAGEMENT', 'TEAM_LEADER', 'EMPLOYEE']),
    async (req: Request, res: Response) => {
      try {
        if (!(await UserService.hasPermission(req.user!, 'HOLIDAY_MANAGE'))) {
          return res.status(403).json({
            error: `Forbidden: Role '${req.user?.role}' does not have HOLIDAY_MANAGE permission.`,
          });
        }
        const id = Number(req.params.id);
        if (isNaN(id)) return res.status(400).json({ error: 'Invalid holiday ID' });
        const updated = await HolidayService.updateHoliday(id, req.body);
        res.json({ success: true, holiday: updated });
      } catch (err: any) {
        if (err instanceof ValidationError) {
          return res.status(400).json({ error: err.message });
        }
        res.status(500).json({ error: err.message });
      }
    }
  );

  // 26. Delete Holiday (Admin/HR with HOLIDAY_MANAGE)
  app.delete(
    '/api/holidays/:id',
    requireRole(['SUPER_ADMIN', 'HR', 'TOP_MANAGEMENT', 'TEAM_LEADER', 'EMPLOYEE']),
    async (req: Request, res: Response) => {
      try {
        if (!(await UserService.hasPermission(req.user!, 'HOLIDAY_MANAGE'))) {
          return res.status(403).json({
            error: `Forbidden: Role '${req.user?.role}' does not have HOLIDAY_MANAGE permission.`,
          });
        }
        const id = Number(req.params.id);
        if (isNaN(id)) return res.status(400).json({ error: 'Invalid holiday ID' });
        await HolidayService.deleteHoliday(id);
        res.json({ success: true });
      } catch (err: any) {
        if (err instanceof ValidationError) {
          return res.status(400).json({ error: err.message });
        }
        res.status(500).json({ error: err.message });
      }
    }
  );

  // 26b. Holiday Lists & Employee Holiday List Assignments
  app.get('/api/holiday-lists', async (req: Request, res: Response) => {
    try {
      const year = req.query.year ? Number(req.query.year) : undefined;
      const includeInactive = req.query.includeInactive === 'true';
      const lists = await HolidayService.getHolidayLists({ year, includeInactive });
      res.json({ success: true, holidayLists: lists });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/holiday-lists', async (req: Request, res: Response) => {
    try {
      if (!(await UserService.hasPermission(req.user!, 'HOLIDAY_MANAGE'))) {
        return res.status(403).json({
          error: `Forbidden: Role '${req.user?.role}' does not have HOLIDAY_MANAGE permission.`,
        });
      }
      const created = await HolidayService.createHolidayList(req.body, req.user!);
      res.status(201).json({ success: true, holidayList: created });
    } catch (err: any) {
      if (err instanceof ValidationError) return res.status(400).json({ error: err.message });
      res.status(400).json({ error: err.message });
    }
  });

  app.put('/api/holiday-lists/:id', async (req: Request, res: Response) => {
    try {
      if (!(await UserService.hasPermission(req.user!, 'HOLIDAY_MANAGE'))) {
        return res.status(403).json({
          error: `Forbidden: Role '${req.user?.role}' does not have HOLIDAY_MANAGE permission.`,
        });
      }
      const id = Number(req.params.id);
      const updated = await HolidayService.updateHolidayList(id, req.body, req.user!);
      res.json({ success: true, holidayList: updated });
    } catch (err: any) {
      if (err instanceof ValidationError) return res.status(400).json({ error: err.message });
      res.status(400).json({ error: err.message });
    }
  });

  app.delete('/api/holiday-lists/:id', async (req: Request, res: Response) => {
    try {
      if (!(await UserService.hasPermission(req.user!, 'HOLIDAY_MANAGE'))) {
        return res.status(403).json({
          error: `Forbidden: Role '${req.user?.role}' does not have HOLIDAY_MANAGE permission.`,
        });
      }
      const id = Number(req.params.id);
      const force = req.query.force === 'true' || req.body?.force === true;
      const result = await HolidayService.deleteHolidayList(id, req.user!, force);
      res.json(result);
    } catch (err: any) {
      if (err instanceof ValidationError) return res.status(400).json({ error: err.message, isDependencyError: true, fieldErrors: err.fieldErrors });
      res.status(400).json({ error: err.message });
    }
  });

  app.get('/api/holiday-assignments', async (req: Request, res: Response) => {
    try {
      let employeeId = parseIdOrCode(req.query.employeeId ?? req.query.employeeCode);
      if (req.user?.role === 'EMPLOYEE' || req.user?.role === 'TEAM_LEADER') {
        const canViewAll =
          (await UserService.hasPermission(req.user!, 'HOLIDAY_MANAGE')) ||
          (await UserService.hasPermission(req.user!, 'EMPLOYEE_VIEW'));
        if (!canViewAll) {
          if (employeeId !== undefined && !isSameEmployeeActor(req.user, employeeId)) {
            return res.status(403).json({ error: 'Forbidden: You can only view your own holiday assignments' });
          }
          employeeId = req.user.employeeCode || req.user.employeeId;
        }
      }
      const assignments = await HolidayService.getEmployeeHolidayAssignments(employeeId);
      res.json({ success: true, assignments });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/employees/:id/holiday-assignments', async (req: Request, res: Response) => {
    try {
      const id = parseIdOrCode(req.params.id)!;
      if (await denySuperAdminEmployeeTarget(id, req, res)) return;
      if (req.user?.role === 'EMPLOYEE' && !isSameEmployeeActor(req.user, id)) {
        return res.status(403).json({ error: 'Forbidden: You can only view your own holiday assignments' });
      }
      const assignments = await HolidayService.getEmployeeHolidayAssignments(id);
      res.json({ success: true, assignments });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/holiday-assignments', async (req: Request, res: Response) => {
    try {
      if (!(await UserService.hasPermission(req.user!, 'HOLIDAY_MANAGE'))) {
        return res.status(403).json({
          error: `Forbidden: Role '${req.user?.role}' does not have HOLIDAY_MANAGE permission.`,
        });
      }
      const created = await HolidayService.assignEmployeeHolidayList(req.body, req.user!);
      res.status(201).json({ success: true, assignment: created });
    } catch (err: any) {
      if (err instanceof ValidationError) return res.status(400).json({ error: err.message });
      res.status(400).json({ error: err.message });
    }
  });

  app.delete('/api/holiday-assignments/:id', async (req: Request, res: Response) => {
    try {
      if (!(await UserService.hasPermission(req.user!, 'HOLIDAY_MANAGE'))) {
        return res.status(403).json({
          error: `Forbidden: Role '${req.user?.role}' does not have HOLIDAY_MANAGE permission.`,
        });
      }
      const id = Number(req.params.id);
      const result = await HolidayService.deleteEmployeeHolidayAssignment(id, req.user!);
      res.json(result);
    } catch (err: any) {
      if (err instanceof ValidationError) return res.status(400).json({ error: err.message });
      res.status(400).json({ error: err.message });
    }
  });

  // 27. Weekly Off Days Config (Get & Update)
  app.get('/api/working-calendar/weekly-offs', async (_req: Request, res: Response) => {
    try {
      const weeklyOffs = await WorkingDaysService.getWeeklyOffs();
      res.json({ weeklyOffs });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put(
    '/api/working-calendar/weekly-offs',
    requireRole(['SUPER_ADMIN', 'HR']),
    async (req: Request, res: Response) => {
      try {
        const days = req.body.weeklyOffs;
        if (!Array.isArray(days)) {
          return res.status(400).json({ error: 'weeklyOffs must be an array of day indices (0=Sun..6=Sat)' });
        }
        const updated = await WorkingDaysService.setWeeklyOffs(days);
        res.json({ success: true, weeklyOffs: updated });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    }
  );

  // ----------------------------------------------------
  // STEP 6: In-App Notifications Endpoints
  // ----------------------------------------------------

  // 28. Get User Notifications
  app.get(
    '/api/notifications',
    requireRole(['SUPER_ADMIN', 'HR', 'TOP_MANAGEMENT', 'TEAM_LEADER', 'EMPLOYEE']),
    async (req: Request, res: Response) => {
      try {
        const unreadOnly = req.query.unreadOnly === 'true';
        const limit = req.query.limit ? Number(req.query.limit) : undefined;
        const result = await NotificationService.getNotificationsForUser(req.user!, {
          unreadOnly,
          limit,
        });
        res.json(result);
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    }
  );

  // 29. Mark Single Notification as Read
  app.post(
    '/api/notifications/:id/read',
    requireRole(['SUPER_ADMIN', 'HR', 'TOP_MANAGEMENT', 'TEAM_LEADER', 'EMPLOYEE']),
    async (req: Request, res: Response) => {
      try {
        const id = Number(req.params.id);
        if (isNaN(id)) return res.status(400).json({ error: 'Invalid notification ID' });
        await NotificationService.markAsRead(id, req.user!);
        res.json({ success: true });
      } catch (err: any) {
        if (err.message?.includes('Forbidden')) {
          return res.status(403).json({ error: err.message });
        }
        res.status(500).json({ error: err.message });
      }
    }
  );

  // 30. Mark All Notifications as Read
  app.post(
    '/api/notifications/read-all',
    requireRole(['SUPER_ADMIN', 'HR', 'TOP_MANAGEMENT', 'TEAM_LEADER', 'EMPLOYEE']),
    async (req: Request, res: Response) => {
      try {
        const count = await NotificationService.markAllAsRead(req.user!);
        res.json({ success: true, count });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    }
  );

  // ----------------------------------------------------
  // STEP 6: Admin System Settings Update Endpoint
  // ----------------------------------------------------

  // 31. Update System Setting
  app.put(
    '/api/settings/:key',
    requireRole(['SUPER_ADMIN']),
    async (req: Request, res: Response) => {
      try {
        const settingKey = req.params.key;
        const { settingValue, description } = req.body || {};
        if (typeof settingValue !== 'string') {
          return res.status(400).json({ error: 'settingValue must be a string' });
        }

        const saved = UserService.updateSystemSetting(settingKey, settingValue, description);

        if (isDbConfigured()) {
          const db = getDb();
          if (db) {
            await db
              .insert(systemSettings)
              .values({
                settingKey: saved.settingKey,
                settingValue: saved.settingValue,
                description: saved.description || null,
              })
              .onConflictDoUpdate({
                target: systemSettings.settingKey,
                set: {
                  settingValue: saved.settingValue,
                  description: saved.description || undefined,
                  updatedAt: new Date(),
                },
              });
          }
        }

        try {
          const { AuditService } = await import('./src/services/auditService.ts');
          await AuditService.logEvent({
            actorId: req.user?.userId || null,
            actorRole: req.user?.role || 'SUPER_ADMIN',
            action: 'SETTING_UPDATED',
            targetEntity: 'system_settings',
            targetId: saved.settingKey,
            metadata: {
              settingKey: saved.settingKey,
              settingValue: saved.settingValue,
              updatedBy: req.user?.username || 'Super Administrator',
              timestamp: new Date().toISOString(),
            },
          });
        } catch (auditErr) {
          console.warn('Failed to audit log SETTING_UPDATED:', auditErr);
        }

        res.json({
          success: true,
          settingKey: saved.settingKey,
          settingValue: saved.settingValue,
          setting: saved,
        });
      } catch (err: any) {
        if (err instanceof ValidationError) {
          return res.status(400).json({ error: err.message });
        }
        res.status(500).json({ error: err.message });
      }
    }
  );

  // 31b. Delete System Setting (SUPER_ADMIN only)
  app.delete(
    '/api/settings/:key',
    requireRole(['SUPER_ADMIN']),
    async (req: Request, res: Response) => {
      try {
        const key = decodeURIComponent(req.params.key);
        const result = await UserService.deleteSystemSetting(key, req.user!);
        res.json(result);
      } catch (err: any) {
        if (err instanceof ValidationError) {
          return res.status(400).json({ error: err.message });
        }
        res.status(err.message?.includes('Forbidden') ? 403 : 500).json({ error: err.message });
      }
    }
  );

  // ----------------------------------------------------
  // STEP 7: Shift & Work Schedule Endpoints
  // ----------------------------------------------------

  // 32. List All Shifts
  app.get('/api/shifts', async (req: Request, res: Response) => {
    try {
      const includeInactive = req.query.includeInactive === 'true';
      const shifts = await ShiftService.getShifts({ includeInactive });
      res.json({ success: true, shifts });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 33. Get Shift by ID
  app.get('/api/shifts/:id', async (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      const shift = await ShiftService.getShiftById(id);
      if (!shift) {
        return res.status(404).json({ error: `Shift with ID ${id} not found` });
      }
      res.json({ success: true, shift });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 34. Create New Shift (SUPER_ADMIN, HR)
  app.post(
    '/api/shifts',
    requireRole(['SUPER_ADMIN', 'HR']),
    async (req: Request, res: Response) => {
      try {
        const created = await ShiftService.createShift(req.body, req.user!);
        res.status(201).json({ success: true, shift: created });
      } catch (err: any) {
        if (err instanceof ValidationError) {
          return res.status(400).json({ error: err.message, fieldErrors: err.fieldErrors });
        }
        res.status(400).json({ error: err.message });
      }
    }
  );

  // 35. Update Shift (SUPER_ADMIN, HR)
  app.put(
    '/api/shifts/:id',
    requireRole(['SUPER_ADMIN', 'HR']),
    async (req: Request, res: Response) => {
      try {
        const id = Number(req.params.id);
        const updated = await ShiftService.updateShift(id, req.body, req.user!);
        res.json({ success: true, shift: updated });
      } catch (err: any) {
        if (err instanceof ValidationError) {
          return res.status(400).json({ error: err.message, fieldErrors: err.fieldErrors });
        }
        res.status(400).json({ error: err.message });
      }
    }
  );

  // 35b. Toggle Shift Status (SUPER_ADMIN, HR)
  app.patch(
    '/api/shifts/:id/status',
    requireRole(['SUPER_ADMIN', 'HR']),
    async (req: Request, res: Response) => {
      try {
        const id = Number(req.params.id);
        const { isActive } = req.body;
        if (typeof isActive !== 'boolean') {
          return res.status(400).json({ error: 'isActive must be a boolean' });
        }
        const updated = await ShiftService.setShiftStatus(id, isActive, req.user!);
        res.json({ success: true, shift: updated });
      } catch (err: any) {
        if (err instanceof ValidationError) {
          return res.status(400).json({ error: err.message });
        }
        res.status(400).json({ error: err.message });
      }
    }
  );

  // 35c. Delete Shift (SUPER_ADMIN, HR, dependency-safe)
  app.delete(
    '/api/shifts/:id',
    requireRole(['SUPER_ADMIN', 'HR']),
    async (req: Request, res: Response) => {
      try {
        const id = Number(req.params.id);
        const force = req.query.force === 'true' || req.body?.force === true;
        const result = await ShiftService.deleteShift(id, req.user!, force);
        res.json(result);
      } catch (err: any) {
        if (err instanceof ValidationError) {
          return res.status(400).json({ error: err.message, isDependencyError: true, fieldErrors: err.fieldErrors });
        }
        res.status(400).json({ error: err.message });
      }
    }
  );

  // 36. List All Employee Shift Assignments (Admin/HR)
  app.get(
    '/api/employee-shifts',
    requireRole(['SUPER_ADMIN', 'HR', 'TOP_MANAGEMENT']),
    async (_req: Request, res: Response) => {
      try {
        const assignments = await ShiftService.getAllAssignments();
        res.json({ success: true, assignments });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    }
  );

  // 37. Get Specific Employee's Shift Assignments
  app.get(
    '/api/employees/:employeeId/shifts',
    requireRole(['SUPER_ADMIN', 'HR', 'TOP_MANAGEMENT', 'TEAM_LEADER', 'EMPLOYEE']),
    async (req: Request, res: Response) => {
      try {
        const employeeId = parseIdOrCode(req.params.employeeId)!;
        // If employee, can only see own shifts
        if (req.user?.role === 'EMPLOYEE' && !isSameEmployeeActor(req.user, employeeId)) {
          return res.status(403).json({ error: 'Forbidden: You can only view your own shifts' });
        }
        const assignments = await ShiftService.getEmployeeAssignments(employeeId);
        res.json({ success: true, assignments });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    }
  );

  // 38. Assign Shift to Employee (SUPER_ADMIN, HR, or role with SHIFT_ASSIGN)
  app.post(
    '/api/employee-shifts',
    requireRole(['SUPER_ADMIN', 'HR', 'TOP_MANAGEMENT', 'TEAM_LEADER', 'EMPLOYEE']),
    async (req: Request, res: Response) => {
      try {
        const created = await ShiftService.assignShiftToEmployee(req.body, req.user!);
        res.status(201).json({ success: true, assignment: created });
      } catch (err: any) {
        if (err.message?.includes('Forbidden')) {
          return res.status(403).json({ error: err.message });
        }
        if (err instanceof ValidationError) {
          return res.status(400).json({ error: err.message, fieldErrors: err.fieldErrors });
        }
        res.status(400).json({ error: err.message });
      }
    }
  );

  // 39. Resolve Daily Schedule for an Employee
  app.get(
    '/api/employees/:employeeId/schedule',
    requireRole(['SUPER_ADMIN', 'HR', 'TOP_MANAGEMENT', 'TEAM_LEADER', 'EMPLOYEE']),
    async (req: Request, res: Response) => {
      try {
        const employeeId = parseIdOrCode(req.params.employeeId)!;
        if (req.user?.role === 'EMPLOYEE' && !isSameEmployeeActor(req.user, employeeId)) {
          return res.status(403).json({ error: 'Forbidden: You can only view your own schedule' });
        }
        const dateStr = (req.query.date as string) || new Date().toISOString().split('T')[0];
        const schedule = await ShiftService.resolveEmployeeSchedule(employeeId, dateStr);
        res.json({ success: true, schedule });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    }
  );

  // 40. Resolve Schedule Range for an Employee
  app.get(
    '/api/employees/:employeeId/schedule-range',
    requireRole(['SUPER_ADMIN', 'HR', 'TOP_MANAGEMENT', 'TEAM_LEADER', 'EMPLOYEE']),
    async (req: Request, res: Response) => {
      try {
        const employeeId = parseIdOrCode(req.params.employeeId)!;
        if (req.user?.role === 'EMPLOYEE' && !isSameEmployeeActor(req.user, employeeId)) {
          return res.status(403).json({ error: 'Forbidden: You can only view your own schedule' });
        }
        const startDate = (req.query.startDate as string) || new Date().toISOString().split('T')[0];
        const endDate = (req.query.endDate as string) || startDate;
        const schedules = await ShiftService.resolveEmployeeScheduleRange(employeeId, startDate, endDate);
        res.json({ success: true, schedules });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    }
  );

  // 41. List Department Shift Assignments (Admin/HR)
  app.get(
    '/api/department-shifts',
    requireRole(['SUPER_ADMIN', 'HR', 'TOP_MANAGEMENT']),
    async (req: Request, res: Response) => {
      try {
        const deptId = parseIdOrCode(req.query.departmentId ?? req.query.departmentCode);
        const assignments = await ShiftService.getDepartmentAssignments(deptId);
        res.json({ success: true, assignments });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    }
  );

  // 42. Assign Shift to Department (Admin/HR)
  app.post(
    '/api/department-shifts',
    requireRole(['SUPER_ADMIN', 'HR']),
    async (req: Request, res: Response) => {
      try {
        const created = await ShiftService.assignShiftToDepartment(req.body, req.user!);
        res.status(201).json({ success: true, assignment: created });
      } catch (err: any) {
        if (err instanceof ValidationError) {
          return res.status(400).json({ error: err.message, fieldErrors: err.fieldErrors });
        }
        res.status(400).json({ error: err.message });
      }
    }
  );

  // 43. Update Employee Shift Assignment (Admin/HR)
  app.put(
    '/api/employee-shifts/:id',
    requireRole(['SUPER_ADMIN', 'HR']),
    async (req: Request, res: Response) => {
      try {
        const id = Number(req.params.id);
        const updated = await ShiftService.updateEmployeeAssignment(id, req.body, req.user!);
        res.json({ success: true, assignment: updated });
      } catch (err: any) {
        if (err instanceof ValidationError) {
          return res.status(400).json({ error: err.message, fieldErrors: err.fieldErrors });
        }
        res.status(400).json({ error: err.message });
      }
    }
  );

  // 44. Delete/Deactivate Employee Shift Assignment (Admin/HR)
  app.delete(
    '/api/employee-shifts/:id',
    requireRole(['SUPER_ADMIN', 'HR']),
    async (req: Request, res: Response) => {
      try {
        const id = Number(req.params.id);
        const deleted = await ShiftService.deleteEmployeeAssignment(id, req.user!);
        res.json({ success: true, deleted });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    }
  );

  // 45. Delete Department Shift Assignment (Admin/HR)
  app.delete(
    '/api/department-shifts/:id',
    requireRole(['SUPER_ADMIN', 'HR']),
    async (req: Request, res: Response) => {
      try {
        const id = Number(req.params.id);
        const deleted = await ShiftService.deleteDepartmentAssignment(id, req.user!);
        res.json({ success: true, deleted });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    }
  );

  // ==============================================================
  // STEP 8: User Management & Employee Administration
  // ==============================================================

  // Super Admin: most recent successful login per user, derived from existing USER_LOGIN audit events.
  app.get(
    '/api/admin/user-last-activity',
    requireRole(['SUPER_ADMIN']),
    async (_req: Request, res: Response) => {
      try {
        const db = getDb();
        const loginEvents = isDbConfigured() && db
          ? await db.select({
              actorId: systemAuditLogs.actorId,
              targetId: systemAuditLogs.targetId,
              metadata: systemAuditLogs.metadata,
              createdAt: systemAuditLogs.createdAt,
            }).from(systemAuditLogs)
              .where(eq(systemAuditLogs.action, 'USER_LOGIN'))
              .orderBy(desc(systemAuditLogs.createdAt))
          : await AuditService.getLogs({ action: 'USER_LOGIN', limit: 5000 });
        const latestByUser: Record<string, string> = {};
        for (const event of loginEvents) {
          const userId = Number(event.actorId ?? event.metadata?.userId ?? event.targetId);
          if (!Number.isFinite(userId) || userId <= 0 || !event.createdAt) continue;
          const timestamp = new Date(event.createdAt).toISOString();
          if (!latestByUser[String(userId)] || timestamp > latestByUser[String(userId)]) {
            latestByUser[String(userId)] = timestamp;
          }
        }
        res.setHeader('Cache-Control', 'no-store');
        res.json({ success: true, lastLoginByUserId: latestByUser });
      } catch (err: any) {
        res.status(500).json({ error: err.message || 'Failed to load user login activity' });
      }
    }
  );

  // 46. List Users (Admin/HR)
  app.get(
    '/api/users',
    requireRole(['SUPER_ADMIN', 'HR', 'TOP_MANAGEMENT']),
    async (req: Request, res: Response) => {
      try {
        const role = req.query.role as string | undefined;
        const isActive = req.query.isActive !== undefined ? req.query.isActive === 'true' : undefined;
        const search = req.query.search as string | undefined;
        const users = await UserService.getUsers({ role, isActive, search });
        const visibleUsers = req.user?.role === 'SUPER_ADMIN'
          ? users
          : users.filter((user: any) => String(user.roleName || user.role || '').toUpperCase() !== 'SUPER_ADMIN');
        res.json({ success: true, users: visibleUsers });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    }
  );

  // 47. Get Current User Profile (Self)
  app.get('/api/users/profile/me', async (req: Request, res: Response) => {
    try {
      if (!req.user || !req.user.userId) {
        return res.status(401).json({ error: 'Unauthorized: No active user session' });
      }
      const user = await UserService.getUserById(req.user.userId);
      if (!user) {
        return res.status(404).json({ error: 'User profile not found' });
      }
      res.json({ success: true, user });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 47b. Get Complete User Profile (SUPER_ADMIN for any user, Self for normal employee, or authorized HR/TM)
  app.get('/api/users/:id/complete-profile', async (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: 'Invalid user ID' });
      const year = req.query.year ? Number(req.query.year) : undefined;
      const profile = await UserService.getCompleteUserProfile({ userId: id }, req.user!, { year });
      // Audit logs and the 360 activity timeline are confidential Super Admin-only data.
      const responseProfile = req.user!.role === 'SUPER_ADMIN'
        ? profile
        : { ...profile, unifiedTimeline: [], auditLogs: [] };
      res.json({ success: true, profile: responseProfile });
    } catch (err: any) {
      if (err.message?.includes('Forbidden') || err.message?.includes('Unauthorized')) {
        return res.status(403).json({ error: err.message });
      }
      if (err instanceof ValidationError) {
        return res.status(404).json({ error: err.message });
      }
      res.status(500).json({ error: err.message });
    }
  });

  // 47c. Operate / Update Complete User Profile (SUPER_ADMIN or authorized actor)
  app.put(['/api/users/:id/complete-profile', '/api/users/:id/profile-operate'], async (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: 'Invalid user ID' });
      const profile = await UserService.operateUserProfile({ userId: id }, req.body, req.user!);
      const responseProfile = req.user!.role === 'SUPER_ADMIN'
        ? profile
        : { ...profile, unifiedTimeline: [], auditLogs: [] };
      res.json({ success: true, profile: responseProfile, user: responseProfile.user, employee: responseProfile.employee });
    } catch (err: any) {
      if (err.message?.includes('Forbidden') || err.message?.includes('Unauthorized')) {
        return res.status(403).json({ error: err.message });
      }
      if (err instanceof ValidationError) {
        return res.status(400).json({ error: err.message, fieldErrors: err.fieldErrors });
      }
      res.status(400).json({ error: err.message });
    }
  });

  // 47d. User Profile Photo Endpoints (Self or SUPER_ADMIN)
  app.get('/api/users/:id/profile-photo', async (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: 'Invalid user ID' });
      const meta = await UserService.getUserProfilePhotoMeta(id);
      const photoPayload = {
        ...meta,
        userId: id,
        hasProfilePhoto: meta.hasProfilePhoto,
        profilePhotoUrl: meta.profilePhotoUrl,
      };
      return res.json({
        success: true,
        ...meta,
        photo: photoPayload,
        profilePhoto: photoPayload,
      });
    } catch (err: any) {
      if (err instanceof ValidationError) {
        return res.status(404).json({ error: err.message });
      }
      return res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/users/:id/profile-photo/image', async (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: 'Invalid user ID' });
      const file = await UserService.getUserProfilePhotoFile(id);
      res.setHeader('Content-Type', file.mimeType);
      res.setHeader('Content-Length', String(file.size));
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader(
        'Content-Security-Policy',
        "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'"
      );
      res.setHeader('Cache-Control', 'no-cache');
      return res.send(file.buffer);
    } catch (err: any) {
      return res.status(404).json({ error: err.message || 'Profile photo not found' });
    }
  });

  const handleUserProfilePhotoUpload = async (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: 'Invalid user ID' });
      if (!req.user) {
        return res.status(401).json({ error: 'Unauthorized: Authentication required' });
      }
      if (req.user.role !== 'SUPER_ADMIN' && Number(req.user.userId) !== id) {
        return res.status(403).json({
          error: 'Forbidden: You can only upload or replace your own profile photo unless authorized as SUPER_ADMIN.',
        });
      }
      const { fileName, fileData, contentBase64, base64Data, data, mimeType } = req.body || {};
      const resolvedFileData = fileData ?? contentBase64 ?? base64Data ?? data;
      const result = await UserService.uploadUserProfilePhoto(
        id,
        { fileName, fileData: resolvedFileData, mimeType },
        req.user
      );
      const photoPayload = {
        ...result.metadata,
        userId: id,
        hasProfilePhoto: true,
        profilePhotoUrl: result.profilePhotoUrl,
      };
      return res.json({
        success: true,
        profilePhotoUrl: result.profilePhotoUrl,
        metadata: result.metadata,
        photo: photoPayload,
        profilePhoto: photoPayload,
        user: result.user,
      });
    } catch (err: any) {
      if (err.message?.includes('Forbidden') || err.message?.includes('Unauthorized')) {
        return res.status(403).json({ error: err.message });
      }
      if (err instanceof ValidationError) {
        return res.status(400).json({ error: err.message, fieldErrors: err.fieldErrors });
      }
      return res.status(400).json({ error: err.message || 'Failed to upload profile photo' });
    }
  };

  app.post('/api/users/:id/profile-photo', handleUserProfilePhotoUpload);
  app.put('/api/users/:id/profile-photo', handleUserProfilePhotoUpload);

  app.delete('/api/users/:id/profile-photo', async (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: 'Invalid user ID' });
      if (!req.user) {
        return res.status(401).json({ error: 'Unauthorized: Authentication required' });
      }
      if (req.user.role !== 'SUPER_ADMIN' && Number(req.user.userId) !== id) {
        return res.status(403).json({
          error: 'Forbidden: You can only remove your own profile photo unless authorized as SUPER_ADMIN.',
        });
      }
      const result = await UserService.removeUserProfilePhoto(id, req.user);
      const photoPayload = {
        userId: id,
        hasProfilePhoto: false,
        profilePhotoUrl: null,
      };
      return res.json({
        success: true,
        profilePhotoUrl: null,
        photo: photoPayload,
        profilePhoto: photoPayload,
        user: result.user,
      });
    } catch (err: any) {
      if (err.message?.includes('Forbidden') || err.message?.includes('Unauthorized')) {
        return res.status(403).json({ error: err.message });
      }
      if (err instanceof ValidationError) {
        return res.status(400).json({ error: err.message });
      }
      return res.status(400).json({ error: err.message || 'Failed to remove profile photo' });
    }
  });

  // 48. Get User By ID (SUPER_ADMIN, Admin/HR or Self)
  app.get('/api/users/:id', async (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      const isSelf = req.user?.userId === id;
      if (req.user?.role !== 'SUPER_ADMIN' && !isSelf) {
        if (req.user?.role === 'EMPLOYEE' || req.user?.role === 'TEAM_LEADER') {
          return res.status(403).json({ error: 'Forbidden: You can only view your own profile' });
        }
        if (!(await UserService.hasPermission(req.user!, 'USER_VIEW')) && !(await UserService.hasPermission(req.user!, 'EMPLOYEE_VIEW'))) {
          return res.status(403).json({ error: 'Forbidden: You do not have permission to view this user profile' });
        }
      }
      const user = await UserService.getUserById(id);
      if (!user || (user.roleName === 'SUPER_ADMIN' && req.user?.role !== 'SUPER_ADMIN')) {
        return res.status(404).json({ error: 'User profile not found.' });
      }
      res.json({ success: true, user });
    } catch (err: any) {
      if (err instanceof ValidationError) {
        return res.status(404).json({ error: err.message });
      }
      res.status(500).json({ error: err.message });
    }
  });

  // 49. Create User (SUPER_ADMIN only)
  app.post(
    '/api/users',
    requireRole(['SUPER_ADMIN']),
    async (req: Request, res: Response) => {
      try {
        const created = await UserService.createUser(req.body, req.user!);
        const emailDelivery = created.credentialEmail ?? null;
        res.status(201).json({
          success: true,
          user: created,
          credentialEmail: emailDelivery,
          emailSent: Boolean(emailDelivery?.sent),
          message: emailDelivery?.sent
            ? `User '${created.username}' created and login credentials emailed to ${emailDelivery.recipientEmail}.`
            : `User '${created.username}' created, but credential email delivery failed: ${emailDelivery?.error || 'Email delivery failed.'}`,
        });
      } catch (err: any) {
        if (err instanceof ValidationError) {
          return res.status(400).json({ error: err.message, fieldErrors: err.fieldErrors });
        }
        res.status(400).json({ error: err.message });
      }
    }
  );

  // 50. Update User (SUPER_ADMIN, HR, or Self basic update enforced by UserService)
  app.put(
    '/api/users/:id',
    requireRole(['SUPER_ADMIN', 'HR', 'TOP_MANAGEMENT', 'TEAM_LEADER', 'EMPLOYEE']),
    async (req: Request, res: Response) => {
      try {
        const id = Number(req.params.id);
        const updated = await UserService.updateUser(id, req.body, req.user!);
        res.json({ success: true, user: updated });
      } catch (err: any) {
        if (err.message?.includes('Forbidden')) {
          return res.status(403).json({ error: err.message });
        }
        if (err instanceof ValidationError) {
          return res.status(400).json({ error: err.message, fieldErrors: err.fieldErrors });
        }
        res.status(400).json({ error: err.message });
      }
    }
  );

  // 51. Delete User (SUPER_ADMIN only, Safe Deletion with Dependency Checks)
  app.delete(
    '/api/users/:id',
    requireRole(['SUPER_ADMIN']),
    async (req: Request, res: Response) => {
      try {
        const id = Number(req.params.id);
        const force = req.query.force === 'true' || req.body?.force === true;
        const deleted = await UserService.deleteUser(id, req.user!, force);
        res.json({ success: true, deleted });
      } catch (err: any) {
        if (err instanceof ValidationError) {
          return res.status(400).json({ error: err.message, isDependencyError: true, fieldErrors: err.fieldErrors });
        }
        res.status(400).json({ error: err.message });
      }
    }
  );

  // 51b. User Permissions Endpoints (SUPER_ADMIN only)
  app.get(
    '/api/users/:id/permissions',
    requireRole(['SUPER_ADMIN']),
    async (req: Request, res: Response) => {
      try {
        const id = Number(req.params.id);
        if (isNaN(id)) return res.status(400).json({ error: 'Invalid user ID' });
        const result = await UserService.getUserPermissions(id);
        res.json({ success: true, ...result });
      } catch (err: any) {
        if (err instanceof ValidationError) {
          return res.status(404).json({ error: err.message });
        }
        res.status(err.message?.includes('Forbidden') ? 403 : 500).json({ error: err.message });
      }
    }
  );

  app.put(
    '/api/users/:id/permissions',
    requireRole(['SUPER_ADMIN']),
    async (req: Request, res: Response) => {
      try {
        const id = Number(req.params.id);
        if (isNaN(id)) return res.status(400).json({ error: 'Invalid user ID' });
        const { permissions } = req.body || {};
        if (!Array.isArray(permissions)) {
          return res.status(400).json({ error: 'permissions must be an array of strings' });
        }
        const result = await UserService.updateUserPermissions(id, permissions, req.user!);
        res.json(result);
      } catch (err: any) {
        if (err instanceof ValidationError) {
          return res.status(400).json({ error: err.message });
        }
        res.status(err.message?.includes('Forbidden') ? 403 : 500).json({ error: err.message });
      }
    }
  );

  // 52a. Change Password (Self or specified userId)
  app.post('/api/users/change-password', async (req: Request, res: Response) => {
    try {
      const id = Number(req.body?.userId || req.user?.userId || 1);
      if (req.user?.userId !== id && req.user?.role !== 'SUPER_ADMIN') {
        return res.status(403).json({ error: 'Forbidden: You can only change your own password' });
      }
      const { currentPassword, newPassword, confirmPassword } = req.body;
      const result = await UserService.changePassword(
        id,
        { currentPassword, newPassword, confirmPassword },
        req.user!
      );
      res.json(result);
    } catch (err: any) {
      if (err instanceof ValidationError) {
        return res.status(400).json({ error: err.message });
      }
      res.status(400).json({ error: err.message });
    }
  });

  // 52. Change Password (Self)
  app.post('/api/users/:id/change-password', async (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      if (req.user?.userId !== id && req.user?.role !== 'SUPER_ADMIN') {
        return res.status(403).json({ error: 'Forbidden: You can only change your own password' });
      }
      const { currentPassword, newPassword, confirmPassword } = req.body;
      const result = await UserService.changePassword(
        id,
        { currentPassword, newPassword, confirmPassword },
        req.user!
      );
      res.json(result);
    } catch (err: any) {
      if (err instanceof ValidationError) {
        return res.status(400).json({ error: err.message });
      }
      res.status(400).json({ error: err.message });
    }
  });

  // 53. Super Admin Password Reset
  app.post(
    '/api/users/:id/reset-password',
    requireRole(['SUPER_ADMIN']),
    async (req: Request, res: Response) => {
      try {
        const id = Number(req.params.id);
        const { newPassword } = req.body;
        const result = await UserService.resetPassword(id, newPassword, req.user!);
        res.json(result);
      } catch (err: any) {
        if (err instanceof ValidationError) {
          return res.status(400).json({ error: err.message });
        }
        res.status(400).json({ error: err.message });
      }
    }
  );

  // 54. Activate / Deactivate User Status (SUPER_ADMIN only)
  app.patch(
    '/api/users/:id/status',
    requireRole(['SUPER_ADMIN']),
    async (req: Request, res: Response) => {
      try {
        const id = Number(req.params.id);
        const { isActive } = req.body;
        if (typeof isActive !== 'boolean') {
          return res.status(400).json({ error: 'isActive must be a boolean' });
        }
        const updated = await UserService.setUserStatus(id, isActive, req.user!);
        res.json({ success: true, user: updated });
      } catch (err: any) {
        res.status(400).json({ error: err.message });
      }
    }
  );

  // 55. List Employees
  app.get(
    '/api/employees',
    requireRole(['SUPER_ADMIN', 'HR', 'TOP_MANAGEMENT', 'TEAM_LEADER']),
    async (req: Request, res: Response) => {
      try {
        if (!(await UserService.hasPermission(req.user!, 'EMPLOYEE_VIEW'))) {
          return res.status(403).json({
            error: `Forbidden: Role '${req.user?.role}' does not have EMPLOYEE_VIEW permission`,
          });
        }
        const filter: any = {};
        if (req.query.search) filter.search = String(req.query.search);
        if (req.query.departmentId) filter.departmentId = parseIdOrCode(req.query.departmentId);
        if (req.query.designationId) filter.designationId = Number(req.query.designationId);
        if (req.query.employmentStatus) filter.employmentStatus = String(req.query.employmentStatus);
        if (req.query.employmentType) filter.employmentType = String(req.query.employmentType);
        if (req.query.reportingManagerId) filter.reportingManagerId = parseIdOrCode(req.query.reportingManagerId);
        if (req.query.isActive !== undefined) filter.isActive = req.query.isActive === 'true';

        const allEmployees = await UserService.getEmployees(filter);
        // SUPER_ADMIN is an administrative account, never an employee-list row—even for itself.
        const employees = allEmployees
          .filter((employee: any) => String(employee.role || '').toUpperCase() !== 'SUPER_ADMIN')
          .sort((a: any, b: any) => {
            const aCode = String(a.employeeCode || '').toUpperCase().match(/^MT(\d+)$/);
            const bCode = String(b.employeeCode || '').toUpperCase().match(/^MT(\d+)$/);
            if (aCode && bCode) return Number(aCode[1]) - Number(bCode[1]);
            if (aCode) return -1;
            if (bCode) return 1;
            return String(a.employeeName || '').localeCompare(String(b.employeeName || ''));
          });
        res.json({ success: true, employees });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    }
  );

  // 56. Get Employee By ID
  app.get('/api/employees/:id', async (req: Request, res: Response) => {
    try {
      const id = parseIdOrCode(req.params.id)!;
      if (await denySuperAdminEmployeeTarget(id, req, res)) return;
      const isSelf = isSameEmployeeActor(req.user, id);
      if (req.user?.role !== 'SUPER_ADMIN') {
        if ((req.user?.role === 'EMPLOYEE' || req.user?.role === 'TEAM_LEADER') && !isSelf) {
          return res.status(403).json({ error: 'Forbidden: You can only view your own employee profile' });
        }
        if (!isSelf && !(await UserService.hasPermission(req.user!, 'EMPLOYEE_VIEW'))) {
          return res.status(403).json({
            error: `Forbidden: Role '${req.user?.role}' does not have EMPLOYEE_VIEW permission`,
          });
        }
      }
      const employee = await UserService.getEmployeeById(id);
      if (!employee) {
        return res.status(404).json({ error: `Employee with ID ${id} not found` });
      }
      res.json({ success: true, employee });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 56b. Get Complete Employee Profile (SUPER_ADMIN for any employee, Self for normal employee, or authorized HR/TM)
  app.get('/api/employees/:id/complete-profile', async (req: Request, res: Response) => {
    try {
      const id = parseIdOrCode(req.params.id);
      if (id === undefined) return res.status(400).json({ error: 'Invalid employee ID' });
      if (await denySuperAdminEmployeeTarget(id, req, res)) return;
      const year = req.query.year ? Number(req.query.year) : undefined;
      const profile = await UserService.getCompleteUserProfile({ employeeId: id }, req.user!, { year });
      // Audit logs and the 360 activity timeline are confidential Super Admin-only data.
      const responseProfile = req.user!.role === 'SUPER_ADMIN'
        ? profile
        : { ...profile, unifiedTimeline: [], auditLogs: [] };
      res.json({ success: true, profile: responseProfile });
    } catch (err: any) {
      if (err.message?.includes('Forbidden') || err.message?.includes('Unauthorized')) {
        return res.status(403).json({ error: err.message });
      }
      if (err instanceof ValidationError) {
        return res.status(404).json({ error: err.message });
      }
      res.status(500).json({ error: err.message });
    }
  });

  // 56c. Operate / Update Complete Employee Profile (SUPER_ADMIN or authorized actor)
  app.put('/api/employees/:id/complete-profile', async (req: Request, res: Response) => {
    try {
      const id = parseIdOrCode(req.params.id);
      if (id === undefined) return res.status(400).json({ error: 'Invalid employee ID' });
      const profile = await UserService.operateUserProfile({ employeeId: id }, req.body, req.user!);
      const responseProfile = req.user!.role === 'SUPER_ADMIN'
        ? profile
        : { ...profile, unifiedTimeline: [], auditLogs: [] };
      res.json({ success: true, profile: responseProfile, user: responseProfile.user, employee: responseProfile.employee });
    } catch (err: any) {
      if (err.message?.includes('Forbidden') || err.message?.includes('Unauthorized')) {
        return res.status(403).json({ error: err.message });
      }
      if (err instanceof ValidationError) {
        return res.status(400).json({ error: err.message, fieldErrors: err.fieldErrors });
      }
      res.status(400).json({ error: err.message });
    }
  });

  // 56d. Super Admin Reset Password by Employee ID
  app.post(
    '/api/employees/:id/reset-password',
    requireRole(['SUPER_ADMIN']),
    async (req: Request, res: Response) => {
      try {
        const empId = parseIdOrCode(req.params.id)!;
        const userDto = await UserService.getUserByEmployeeId(empId);
        const { newPassword } = req.body;
        const result = await UserService.resetPassword(userDto.id, newPassword, req.user!);
        res.json(result);
      } catch (err: any) {
        if (err instanceof ValidationError) {
          return res.status(400).json({ error: err.message });
        }
        res.status(400).json({ error: err.message });
      }
    }
  );

  // 56e. Employee Leave Requests & Balances Context (SUPER_ADMIN, Self, or HR/TM)
  app.get('/api/employees/:id/leave-requests', async (req: Request, res: Response) => {
    try {
      const id = parseIdOrCode(req.params.id)!;
      if (await denySuperAdminEmployeeTarget(id, req, res)) return;
      const isSelf = isSameEmployeeActor(req.user, id);
      if (req.user?.role !== 'SUPER_ADMIN' && !isSelf) {
        if (req.user?.role === 'EMPLOYEE' || req.user?.role === 'TEAM_LEADER') {
          return res.status(403).json({ error: 'Forbidden: You can only view your own leave requests' });
        }
        if (!(await UserService.hasPermission(req.user!, 'LEAVE_VIEW_ALL')) && !(await UserService.hasPermission(req.user!, 'EMPLOYEE_VIEW'))) {
          return res.status(403).json({ error: 'Forbidden: Insufficient permissions to view employee leave requests' });
        }
      }
      const requests = await LeaveRequestService.getEmployeeRequests(id);
      res.json({ success: true, leaveRequests: requests });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/employees/:id/leave-balances', async (req: Request, res: Response) => {
    try {
      const id = parseIdOrCode(req.params.id)!;
      if (await denySuperAdminEmployeeTarget(id, req, res)) return;
      const year = req.query.year ? Number(req.query.year) : new Date().getFullYear();
      const balances = await LeaveService.getLeaveBalances({ employeeId: id, year }, req.user);
      res.json({ success: true, balances });
    } catch (err: any) {
      if (err.message?.includes('Forbidden')) {
        return res.status(403).json({ error: err.message });
      }
      res.status(500).json({ error: err.message });
    }
  });

  // 57. Create Employee (Admin/HR or role with EMPLOYEE_CREATE)
  app.post(
    '/api/employees',
    requireRole(['SUPER_ADMIN', 'HR', 'TOP_MANAGEMENT', 'TEAM_LEADER', 'EMPLOYEE']),
    async (req: Request, res: Response) => {
      try {
        const created = await UserService.createEmployee(req.body, req.user!);
        // Initialize missing balances from active, applicable leave policies for each new employee.
        await LeaveService.initializeEmployeeBalances(created.id, new Date().getFullYear(), req.user!);
        const emailDelivery = created.credentialEmail ?? null;
        res.status(201).json({
          success: true,
          employee: created,
          credentialEmail: emailDelivery,
          emailSent: Boolean(emailDelivery?.sent),
          message: emailDelivery?.sent
            ? `Employee '${created.fullName}' (${created.employeeCode}) created and login credentials emailed to ${emailDelivery.recipientEmail}.`
            : `Employee '${created.fullName}' (${created.employeeCode}) created, but credential email delivery failed: ${emailDelivery?.error || 'Email delivery failed.'}`,
        });
      } catch (err: any) {
        if (err.message?.includes('Forbidden')) {
          return res.status(403).json({ error: err.message });
        }
        if (err instanceof ValidationError) {
          return res.status(400).json({ error: err.message, fieldErrors: err.fieldErrors });
        }
        res.status(400).json({ error: err.message });
      }
    }
  );

  // 57b. Update Employee Details (Admin/HR or self-basic)
  app.put('/api/employees/:id', async (req: Request, res: Response) => {
    try {
      const id = parseIdOrCode(req.params.id)!;
      const updated = await UserService.updateEmployee(id, req.body, req.user!);
      res.json({ success: true, employee: updated });
    } catch (err: any) {
      if (err.message?.includes('Forbidden')) {
        return res.status(403).json({ error: err.message });
      }
      if (err instanceof ValidationError) {
        return res.status(400).json({ error: err.message });
      }
      res.status(400).json({ error: err.message });
    }
  });

  // 57b2. Update Employee HR Approval Workflow Setting (Super Admin Only)
  app.put(
    '/api/employees/:id/hr-approval-workflow',
    requireRole(['SUPER_ADMIN']),
    async (req: Request, res: Response) => {
      try {
        const id = parseIdOrCode(req.params.id)!;
        const { hrApprovalRequired } = req.body;
        if (typeof hrApprovalRequired !== 'boolean') {
          return res.status(400).json({ error: 'hrApprovalRequired must be a boolean (true or false).' });
        }
        const updated = await UserService.setEmployeeHrApprovalRequired(id, hrApprovalRequired, req.user!);
        res.json({
          success: true,
          employee: updated,
          message: `HR Approval Required workflow setting updated to ${hrApprovalRequired ? 'ON (3-Stage)' : 'OFF (2-Stage)'} for employee ${updated.employeeName || updated.employeeCode}.`,
        });
      } catch (err: any) {
        if (err.message?.includes('Forbidden')) {
          return res.status(403).json({ error: err.message });
        }
        if (err instanceof ValidationError) {
          return res.status(400).json({ error: err.message });
        }
        res.status(400).json({ error: err.message });
      }
    }
  );

  // 57c. Toggle Employee Status (Admin/HR)
  app.patch(
    '/api/employees/:id/status',
    requireRole(['SUPER_ADMIN', 'HR']),
    async (req: Request, res: Response) => {
      try {
        const id = parseIdOrCode(req.params.id)!;
        const { isActive } = req.body;
        if (typeof isActive !== 'boolean') {
          return res.status(400).json({ error: 'isActive must be a boolean' });
        }
        const updated = await UserService.setEmployeeStatus(id, isActive, req.user!);
        res.json({ success: true, employee: updated });
      } catch (err: any) {
        if (err instanceof ValidationError) {
          return res.status(400).json({ error: err.message });
        }
        res.status(400).json({ error: err.message });
      }
    }
  );

  // 57d. Delete Employee (SUPER_ADMIN only, dependency-safe)
  app.delete(
    '/api/employees/:id',
    requireRole(['SUPER_ADMIN']),
    async (req: Request, res: Response) => {
      try {
        const id = parseIdOrCode(req.params.id)!;
        const force = req.query.force === 'true' || req.body?.force === true;
        const result = await UserService.deleteEmployee(id, req.user!, force);
        res.json(result);
      } catch (err: any) {
        if (err instanceof ValidationError) {
          return res.status(400).json({ error: err.message, isDependencyError: true, fieldErrors: err.fieldErrors });
        }
        res.status(400).json({ error: err.message });
      }
    }
  );

  // ----------------------------------------------------
  // Department Master Endpoints
  // ----------------------------------------------------

  app.get('/api/departments', async (req: Request, res: Response) => {
    try {
      const includeInactive = req.query.includeInactive === 'true';
      const departments = await UserService.getDepartments({ includeInactive });
      res.json({ success: true, departments });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post(
    '/api/departments',
    requireRole(['SUPER_ADMIN', 'HR']),
    async (req: Request, res: Response) => {
      try {
        const created = await UserService.createDepartment(req.body, req.user!);
        res.status(201).json({ success: true, department: created });
      } catch (err: any) {
        if (err instanceof ValidationError) {
          return res.status(400).json({ error: err.message });
        }
        res.status(400).json({ error: err.message });
      }
    }
  );

  app.put(
    '/api/departments/:id',
    requireRole(['SUPER_ADMIN', 'HR']),
    async (req: Request, res: Response) => {
      try {
        const id = parseIdOrCode(req.params.id)!;
        const updated = await UserService.updateDepartment(id, req.body, req.user!);
        res.json({ success: true, department: updated });
      } catch (err: any) {
        if (err instanceof ValidationError) {
          return res.status(400).json({ error: err.message });
        }
        res.status(400).json({ error: err.message });
      }
    }
  );

  app.patch(
    '/api/departments/:id/status',
    requireRole(['SUPER_ADMIN', 'HR']),
    async (req: Request, res: Response) => {
      try {
        const id = parseIdOrCode(req.params.id)!;
        const { isActive } = req.body;
        if (typeof isActive !== 'boolean') {
          return res.status(400).json({ error: 'isActive must be a boolean' });
        }
        const updated = await UserService.setDepartmentStatus(id, isActive, req.user!);
        res.json({ success: true, department: updated });
      } catch (err: any) {
        if (err instanceof ValidationError) {
          return res.status(400).json({ error: err.message });
        }
        res.status(400).json({ error: err.message });
      }
    }
  );

  app.delete(
    '/api/departments/:id',
    requireRole(['SUPER_ADMIN']),
    async (req: Request, res: Response) => {
      try {
        const id = parseIdOrCode(req.params.id)!;
        const force = req.query.force === 'true' || req.body?.force === true;
        const result = await UserService.deleteDepartment(id, req.user!, force);
        res.json(result);
      } catch (err: any) {
        if (err instanceof ValidationError) {
          return res.status(400).json({ error: err.message, isDependencyError: true, fieldErrors: err.fieldErrors });
        }
        res.status(400).json({ error: err.message });
      }
    }
  );

  // ----------------------------------------------------
  // Date-Effective Team Leader Assignments & 15-Day Rotation Endpoints
  // ----------------------------------------------------

  app.get('/api/team-leader-rotation/summaries', async (req: Request, res: Response) => {
    try {
      const referenceDate = req.query.referenceDate as string | undefined;
      const summaries = await TeamLeaderRotationService.getAllTeamRotationSummaries(referenceDate);
      const allEmployees = await UserService.getEmployees();
      const eligibleTeamLeaders = allEmployees.filter(
        (e) =>
          e.isActive &&
          e.employmentStatus !== 'INACTIVE' &&
          (e.role === 'TEAM_LEADER' || e.operationalRole === 'TEAM_LEADER')
      );
      res.json({
        success: true,
        referenceDate: referenceDate || new Date().toISOString().slice(0, 10),
        summaries,
        eligibleTeamLeaders,
      });
    } catch (err: any) {
      if (err instanceof ValidationError) {
        return res.status(400).json({ error: err.message });
      }
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/team-leader-rotation/teams/:teamId/summary', async (req: Request, res: Response) => {
    try {
      const teamId = parseIdOrCode(req.params.teamId)!;
      const referenceDate = req.query.referenceDate as string | undefined;
      const summary = await TeamLeaderRotationService.getTeamRotationSummary(teamId, referenceDate);
      res.json({ success: true, summary });
    } catch (err: any) {
      if (err instanceof ValidationError) {
        return res.status(400).json({ error: err.message });
      }
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/team-leader-rotation/resolve', async (req: Request, res: Response) => {
    try {
      const targetDate =
        (req.query.targetDate as string) ||
        (req.query.date as string) ||
        new Date().toISOString().slice(0, 10);
      const employeeId = parseIdOrCode(req.query.employeeId ?? req.query.employeeCode);
      const teamId = parseIdOrCode(req.query.teamId ?? req.query.departmentId ?? req.query.departmentCode);

      let resolved = null;
      if (employeeId !== undefined) {
        resolved = await TeamLeaderRotationService.resolveTeamLeaderForEmployee(
          employeeId,
          targetDate
        );
      } else if (teamId !== undefined) {
        resolved = await TeamLeaderRotationService.resolveTeamLeader(teamId, targetDate);
      } else if (req.user?.employeeCode || req.user?.employeeId) {
        resolved = await TeamLeaderRotationService.resolveTeamLeaderForEmployee(
          req.user.employeeCode || req.user.employeeId!,
          targetDate
        );
      }

      res.json({
        success: true,
        targetDate,
        resolvedTeamLeader: resolved,
      });
    } catch (err: any) {
      if (err instanceof ValidationError) {
        return res.status(400).json({ error: err.message });
      }
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/team-leader-rotation/rules', async (req: Request, res: Response) => {
    try {
      const teamId = parseIdOrCode(req.query.teamId ?? req.query.departmentId);
      const activeOnly = req.query.activeOnly === 'true';
      const rules = await TeamLeaderRotationService.getRotationRules({ teamId, activeOnly });
      res.json({ success: true, rules });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/team-leader-rotation/rules', async (req: Request, res: Response) => {
    try {
      const rule = await TeamLeaderRotationService.configureRotationRule(req.body, req.user!);
      res.status(201).json({ success: true, rule });
    } catch (err: any) {
      if (err.message?.includes('Forbidden')) {
        return res.status(403).json({ error: err.message });
      }
      if (err instanceof ValidationError) {
        return res.status(400).json({ error: err.message, fieldErrors: err.fieldErrors });
      }
      res.status(400).json({ error: err.message });
    }
  });

  app.put('/api/team-leader-rotation/rules/:id', async (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      const rule = await TeamLeaderRotationService.updateRotationRule(id, req.body, req.user!);
      res.json({ success: true, rule });
    } catch (err: any) {
      if (err.message?.includes('Forbidden')) {
        return res.status(403).json({ error: err.message });
      }
      if (err instanceof ValidationError) {
        return res.status(400).json({ error: err.message, fieldErrors: err.fieldErrors });
      }
      res.status(400).json({ error: err.message });
    }
  });

  app.get('/api/team-leader-rotation/assignments', async (req: Request, res: Response) => {
    try {
      const teamId = parseIdOrCode(req.query.teamId ?? req.query.departmentId);
      const teamLeaderEmployeeId = parseIdOrCode(req.query.teamLeaderEmployeeId);
      const activeOnly = req.query.activeOnly === 'true';
      const targetDate = req.query.targetDate as string | undefined;
      const assignments = await TeamLeaderRotationService.getAssignments({
        teamId,
        teamLeaderEmployeeId,
        activeOnly,
        targetDate,
      });
      res.json({ success: true, assignments });
    } catch (err: any) {
      if (err instanceof ValidationError) {
        return res.status(400).json({ error: err.message });
      }
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/team-leader-rotation/assignments', async (req: Request, res: Response) => {
    try {
      const assignment = await TeamLeaderRotationService.createAssignment(req.body, req.user!);
      res.status(201).json({ success: true, assignment });
    } catch (err: any) {
      if (err.message?.includes('Forbidden')) {
        return res.status(403).json({ error: err.message });
      }
      if (err instanceof ValidationError) {
        return res.status(400).json({ error: err.message, fieldErrors: err.fieldErrors });
      }
      res.status(400).json({ error: err.message });
    }
  });

  app.put('/api/team-leader-rotation/assignments/:id', async (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      const assignment = await TeamLeaderRotationService.updateAssignment(id, req.body, req.user!);
      res.json({ success: true, assignment });
    } catch (err: any) {
      if (err.message?.includes('Forbidden')) {
        return res.status(403).json({ error: err.message });
      }
      if (err instanceof ValidationError) {
        return res.status(400).json({ error: err.message, fieldErrors: err.fieldErrors });
      }
      res.status(400).json({ error: err.message });
    }
  });

  const handleDeactivateTlAssignment = async (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      const reason = req.body?.reason || req.body?.remarks || undefined;
      const assignment = await TeamLeaderRotationService.deactivateAssignment(
        id,
        reason,
        req.user!
      );
      res.json({ success: true, assignment });
    } catch (err: any) {
      if (err.message?.includes('Forbidden')) {
        return res.status(403).json({ error: err.message });
      }
      if (err instanceof ValidationError) {
        return res.status(400).json({ error: err.message });
      }
      res.status(400).json({ error: err.message });
    }
  };

  app.patch('/api/team-leader-rotation/assignments/:id/deactivate', handleDeactivateTlAssignment);
  app.delete('/api/team-leader-rotation/assignments/:id', handleDeactivateTlAssignment);

  // ----------------------------------------------------
  // Designation Master Endpoints
  // ----------------------------------------------------

  app.get('/api/designations', async (req: Request, res: Response) => {
    try {
      const includeInactive = req.query.includeInactive === 'true';
      const designations = await UserService.getDesignations({ includeInactive });
      res.json({ success: true, designations });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post(
    '/api/designations',
    requireRole(['SUPER_ADMIN', 'HR']),
    async (req: Request, res: Response) => {
      try {
        const created = await UserService.createDesignation(req.body, req.user!);
        res.status(201).json({ success: true, designation: created });
      } catch (err: any) {
        if (err instanceof ValidationError) {
          return res.status(400).json({ error: err.message });
        }
        res.status(400).json({ error: err.message });
      }
    }
  );

  app.put(
    '/api/designations/:id',
    requireRole(['SUPER_ADMIN', 'HR']),
    async (req: Request, res: Response) => {
      try {
        const id = Number(req.params.id);
        const updated = await UserService.updateDesignation(id, req.body, req.user!);
        res.json({ success: true, designation: updated });
      } catch (err: any) {
        if (err instanceof ValidationError) {
          return res.status(400).json({ error: err.message });
        }
        res.status(400).json({ error: err.message });
      }
    }
  );

  app.patch(
    '/api/designations/:id/status',
    requireRole(['SUPER_ADMIN', 'HR']),
    async (req: Request, res: Response) => {
      try {
        const id = Number(req.params.id);
        const { isActive } = req.body;
        if (typeof isActive !== 'boolean') {
          return res.status(400).json({ error: 'isActive must be a boolean' });
        }
        const updated = await UserService.setDesignationStatus(id, isActive, req.user!);
        res.json({ success: true, designation: updated });
      } catch (err: any) {
        if (err instanceof ValidationError) {
          return res.status(400).json({ error: err.message });
        }
        res.status(400).json({ error: err.message });
      }
    }
  );

  app.delete(
    '/api/designations/:id',
    requireRole(['SUPER_ADMIN']),
    async (req: Request, res: Response) => {
      try {
        const id = Number(req.params.id);
        const force = req.query.force === 'true' || req.body?.force === true;
        const result = await UserService.deleteDesignation(id, req.user!, force);
        res.json(result);
      } catch (err: any) {
        if (err instanceof ValidationError) {
          return res.status(400).json({ error: err.message, isDependencyError: true, fieldErrors: err.fieldErrors });
        }
        res.status(400).json({ error: err.message });
      }
    }
  );

  // ----------------------------------------------------
  // Working Days & Office Timing Schedule
  // ----------------------------------------------------

  app.get('/api/working-days/schedule', async (_req: Request, res: Response) => {
    try {
      const schedule = await WorkingDaysService.getWorkingDaysSchedule();
      res.json({ success: true, schedule });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put(
    '/api/working-days/schedule',
    requireRole(['SUPER_ADMIN', 'HR']),
    async (req: Request, res: Response) => {
      try {
        const schedule = req.body.schedule;
        const updated = await WorkingDaysService.updateWorkingDaysSchedule(schedule, req.user!);
        res.json({ success: true, schedule: updated });
      } catch (err: any) {
        if (err instanceof ValidationError) {
          return res.status(400).json({ error: err.message });
        }
        res.status(400).json({ error: err.message });
      }
    }
  );

  // ----------------------------------------------------
  // Employee-Specific Weekly Off Management
  // ----------------------------------------------------

  app.get(
    '/api/weekly-off/assignments',
    requireRole(['SUPER_ADMIN', 'HR', 'TOP_MANAGEMENT']),
    async (_req: Request, res: Response) => {
    try {
      const assignments = await WorkingDaysService.getAllEmployeeWeeklyOffs();
      res.json({ success: true, assignments });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/employees/:id/weekly-off', async (req: Request, res: Response) => {
    try {
      const id = parseIdOrCode(req.params.id)!;
      if (await denySuperAdminEmployeeTarget(id, req, res)) return;
      if (req.user?.role !== 'SUPER_ADMIN' && !isSameEmployeeActor(req.user, id)) {
        if (req.user?.role === 'EMPLOYEE' || req.user?.role === 'TEAM_LEADER') {
          return res.status(403).json({ error: 'Forbidden: You can only view your own weekly off history' });
        }
      }
      const history = await WorkingDaysService.getEmployeeWeeklyOffHistory(id);
      res.json({ success: true, history });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post(
    '/api/weekly-off/assign',
    requireRole(['SUPER_ADMIN', 'HR']),
    async (req: Request, res: Response) => {
      try {
        const assignment = await WorkingDaysService.assignEmployeeWeeklyOff(req.body, req.user!);
        res.status(201).json({ success: true, assignment });
      } catch (err: any) {
        if (err instanceof ValidationError) {
          return res.status(400).json({ error: err.message });
        }
        res.status(400).json({ error: err.message });
      }
    }
  );

  app.delete(
    '/api/weekly-off/:id',
    requireRole(['SUPER_ADMIN', 'HR']),
    async (req: Request, res: Response) => {
      try {
        const id = Number(req.params.id);
        const result = await WorkingDaysService.deleteEmployeeWeeklyOff(id, req.user!);
        res.json(result);
      } catch (err: any) {
        if (err instanceof ValidationError) {
          return res.status(400).json({ error: err.message });
        }
        res.status(400).json({ error: err.message });
      }
    }
  );

  // ----------------------------------------------------
  // Assign Role to User
  // ----------------------------------------------------

  const handleAssignUserRole = async (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      const { role, roleId, roleName } = req.body || {};
      const target = roleId || role || roleName;
      const updated = await UserService.assignUserRole(id, target, req.user!);
      res.json({ success: true, user: updated });
    } catch (err: any) {
      if (err instanceof ValidationError) {
        return res.status(400).json({ error: err.message });
      }
      res.status(400).json({ error: err.message });
    }
  };

  app.post('/api/users/:id/role', requireRole(['SUPER_ADMIN']), handleAssignUserRole);
  app.patch('/api/users/:id/role', requireRole(['SUPER_ADMIN']), handleAssignUserRole);
  app.put('/api/users/:id/role', requireRole(['SUPER_ADMIN']), handleAssignUserRole);

  const handleUnassignUserRole = async (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      const fallbackRole = String(req.body?.fallbackRole || req.body?.role || 'EMPLOYEE');
      const updated = await UserService.unassignUserRole(id, fallbackRole, req.user!);
      res.json({ success: true, user: updated });
    } catch (err: any) {
      if (err instanceof ValidationError) {
        return res.status(400).json({ error: err.message });
      }
      if (err.message?.includes('Forbidden')) {
        return res.status(403).json({ error: err.message });
      }
      res.status(400).json({ error: err.message });
    }
  };

  app.delete('/api/users/:id/role', requireRole(['SUPER_ADMIN']), handleUnassignUserRole);
  app.post('/api/users/:id/unassign-role', requireRole(['SUPER_ADMIN']), handleUnassignUserRole);

  // (Master roles GET endpoint is registered at /api/roles above)

  // ==============================================================
  // Employee Attendance: access is controlled by the ATTENDANCE_MANAGE role permission.
  app.get(
    '/api/attendance',
    async (req: Request, res: Response) => {
      try {
        if (!req.user || !(await UserService.hasPermission(req.user, 'ATTENDANCE_MANAGE'))) return res.status(403).json({ error: 'Forbidden: ATTENDANCE_MANAGE permission is required.' });
        const date = String(req.query.date || new Date().toISOString().slice(0, 10));
        const result = await AttendanceService.list(date, req.user!);
        res.json(result);
      } catch (err: any) {
        if (err instanceof ValidationError) return res.status(400).json({ error: err.message });
        if (err.message?.includes('Forbidden')) return res.status(403).json({ error: err.message });
        res.status(500).json({ error: err.message || 'Unable to load attendance.' });
      }
    }
  );

  app.post(
    '/api/attendance/bulk',
    async (req: Request, res: Response) => {
      try {
        if (!req.user || !(await UserService.hasPermission(req.user, 'ATTENDANCE_MANAGE'))) return res.status(403).json({ error: 'Forbidden: ATTENDANCE_MANAGE permission is required.' });
        const result = await AttendanceService.markBulk(req.body || {}, req.user);
        res.json({ success: true, ...result });
      } catch (err: any) {
        if (err instanceof ValidationError) return res.status(400).json({ error: err.message });
        if (err.message?.includes('Forbidden')) return res.status(403).json({ error: err.message });
        res.status(500).json({ error: err.message || 'Unable to save attendance.' });
      }
    }
  );

  app.post(
    '/api/attendance',
    async (req: Request, res: Response) => {
      try {
        if (!req.user || !(await UserService.hasPermission(req.user, 'ATTENDANCE_MANAGE'))) return res.status(403).json({ error: 'Forbidden: ATTENDANCE_MANAGE permission is required.' });
        const record = await AttendanceService.mark(req.body || {}, req.user);
        res.json({ success: true, record });
      } catch (err: any) {
        if (err instanceof ValidationError) return res.status(400).json({ error: err.message });
        if (err.message?.includes('Forbidden')) return res.status(403).json({ error: err.message });
        res.status(500).json({ error: err.message || 'Unable to record attendance.' });
      }
    }
  );

  // STEP 8: Overtime (OT) Request & Approval Routes
  // ==============================================================

  // 58. List Overtime Requests
  app.get('/api/overtime', async (req: Request, res: Response) => {
    try {
      let employeeId: number | string | undefined;
      if (req.user?.role === 'EMPLOYEE') {
        employeeId = req.user.employeeCode || req.user.employeeId || req.user.userId;
      } else if (req.query.employeeId || req.query.employeeCode) {
        employeeId = parseIdOrCode(req.query.employeeId ?? req.query.employeeCode);
      }

      const status = req.query.status as any;
      const startDate = req.query.startDate as string | undefined;
      const endDate = req.query.endDate as string | undefined;

      const requests = await OvertimeService.getRequests({
        employeeId,
        status,
        startDate,
        endDate,
      });

      res.json({ success: true, requests });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 58b. Overtime Audit History
  app.get('/api/overtime/audit', async (req: Request, res: Response) => {
    try {
      const overtimeId = req.query.overtimeId ? Number(req.query.overtimeId) : undefined;
      const logs = await OvertimeService.getAuditHistory(overtimeId);
      res.json({ success: true, logs });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 59. Get Single Overtime Request
  app.get('/api/overtime/:id', async (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      const request = await OvertimeService.getRequestById(id);
      if (!request) {
        return res.status(404).json({ error: 'Overtime request not found' });
      }
      if (req.user?.role === 'EMPLOYEE' && request.employeeId !== (req.user.employeeId || req.user.userId)) {
        return res.status(403).json({ error: 'Forbidden: You can only view your own overtime request' });
      }
      res.json({ success: true, request });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 60. Submit Overtime Request
  app.post('/api/overtime', async (req: Request, res: Response) => {
    try {
      const canManageOrReview =
        (await UserService.hasPermission(req.user!, 'OVERTIME_MANAGE')) ||
        (await UserService.hasPermission(req.user!, 'OVERTIME_REVIEW'));
      const employeeId =
        req.user?.role === 'EMPLOYEE' && !canManageOrReview
          ? req.user.employeeId || req.user.userId
          : req.body.employeeId || req.user?.employeeId || req.user?.userId;
      const created = await OvertimeService.createRequest(
        {
          ...req.body,
          employeeId,
        },
        req.user!
      );
      res.status(201).json({ success: true, request: created });
    } catch (err: any) {
      if (err.message?.includes('Forbidden')) {
        return res.status(403).json({ error: err.message });
      }
      if (err instanceof ValidationError) {
        return res.status(400).json({ error: err.message, fieldErrors: err.fieldErrors });
      }
      res.status(400).json({ error: err.message });
    }
  });

  // 61. Review Overtime Request (Approve / Reject)
  app.post(
    '/api/overtime/:id/review',
    requireRole(['SUPER_ADMIN', 'HR', 'TOP_MANAGEMENT', 'TEAM_LEADER', 'EMPLOYEE']),
    async (req: Request, res: Response) => {
      try {
        const id = Number(req.params.id);
        const { action, comments } = req.body;
        const reviewed = await OvertimeService.reviewRequest(id, action, comments, req.user!);
        res.json({ success: true, request: reviewed });
      } catch (err: any) {
        if (err.message?.includes('Forbidden')) {
          return res.status(403).json({ error: err.message });
        }
        if (err instanceof ValidationError) {
          return res.status(400).json({ error: err.message });
        }
        res.status(400).json({ error: err.message });
      }
    }
  );

  // 62. Cancel Overtime Request (Employee Self-Service)
  app.post('/api/overtime/:id/cancel', async (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      const cancelled = await OvertimeService.cancelRequest(id, req.user!);
      res.json({ success: true, request: cancelled });
    } catch (err: any) {
      if (err instanceof ValidationError) {
        return res.status(400).json({ error: err.message });
      }
      res.status(400).json({ error: err.message });
    }
  });

  // ==============================================================
  // STEP 8: System Audit Logs
  // ==============================================================

  // 63. Query System Audit Logs (SUPER_ADMIN only)
  app.get(
    '/api/audit-logs',
    requireRole(['SUPER_ADMIN']),
    async (req: Request, res: Response) => {
      try {
        if (!(await UserService.hasPermission(req.user!, 'AUDIT_LOG_VIEW'))) {
          return res.status(403).json({
            error: `Forbidden: Role '${req.user?.role}' does not have AUDIT_LOG_VIEW permission.`,
          });
        }
        const targetEntity = req.query.targetEntity as string | undefined;
        const targetId = req.query.targetId as string | undefined;
        const action = req.query.action as string | undefined;
        const actorRole = req.query.actorRole as string | undefined;
        const employeeId = req.query.employeeId
          ? parseIdOrCode(req.query.employeeId)
          : undefined;
        const employeeCode = req.query.employeeCode as string | undefined;
        const departmentId = req.query.departmentId
          ? parseIdOrCode(req.query.departmentId)
          : undefined;
        const departmentCode = req.query.departmentCode as string | undefined;
        const search = req.query.search as string | undefined;
        const startDate = req.query.startDate as string | undefined;
        const endDate = req.query.endDate as string | undefined;
        const limit = req.query.limit ? Number(req.query.limit) : 100;
        const offset = req.query.offset ? Number(req.query.offset) : 0;

        const logs = await AuditService.getLogs({
          targetEntity,
          targetId,
          action,
          actorRole,
          employeeId,
          employeeCode,
          departmentId,
          departmentCode,
          search,
          startDate,
          endDate,
          limit,
          offset,
        });

        res.json({ success: true, logs });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    }
  );

  // 64. Employee 360° Complete Profile Alias (by numeric employeeId, business employeeCode, or employeeName)
  app.get(['/api/employees/:id/360', '/api/employee-360/:id'], async (req: Request, res: Response) => {
    try {
      const id = parseIdOrCode(req.params.id)!;
      if (await denySuperAdminEmployeeTarget(id, req, res)) return;
      const year = req.query.year ? Number(req.query.year) : undefined;
      const profile = await UserService.getCompleteUserProfile({ employeeId: id }, req.user!, { year });
      res.json({ success: true, profile });
    } catch (err: any) {
      if (err.message?.includes('Forbidden')) {
        return res.status(403).json({ error: err.message });
      }
      if (err instanceof ValidationError) {
        return res.status(404).json({ error: err.message });
      }
      res.status(400).json({ error: err.message });
    }
  });
  // ----------------------------------------------------
  // Ensure no /api/* request ever falls through to Vite or SPA index.html
  // ----------------------------------------------------
  app.use('/api', (req: Request, res: Response) => {
    res.status(404).json({
      error: `API endpoint not found: ${req.method} ${req.originalUrl}`,
    });
  });

  // Global JSON error-handling middleware (prevents Express default HTML <!DOCTYPE html> errors)
  app.use((err: any, req: Request, res: Response, next: NextFunction) => {
    if (res.headersSent) {
      return next(err);
    }
    if (err?.type === 'entity.too.large' || err?.status === 413) {
      return res.status(413).json({
        error: 'Attachment or request payload exceeds maximum allowed size (15 MB).',
      });
    }
    if (err instanceof SyntaxError && 'body' in err) {
      return res.status(400).json({
        error: 'Invalid JSON request payload.',
      });
    }
    if (err instanceof ValidationError) {
      return res.status(400).json({
        error: err.message,
        fieldErrors: err.fieldErrors,
      });
    }
    if (req.originalUrl.startsWith('/api')) {
      return res.status(err?.status || 500).json({
        error: err?.message || 'Internal server error',
      });
    }
    next(err);
  });
}

async function reconcileCurrentYearLeaveBalances(): Promise<void> {
  if (!isDbConfigured()) return;
  const db = getDb();
  if (!db) return;
  const currentYear = new Date().getFullYear();
  const activeEmployees = await db.select({ id: employees.id }).from(employees).where(eq(employees.employmentStatus, 'ACTIVE'));
  for (const employee of activeEmployees) {
    try {
      await LeaveService.initializeEmployeeBalances(employee.id, currentYear);
    } catch (error: any) {
      console.error(`[Leave Balance Reconciliation] Employee ${employee.id}: ${error?.message || error}`);
    }
  }
}
export async function verifyServerDatabaseReadiness(): Promise<void> {
  if (isProductionRuntime()) {
    assertProductionDbConfigured();
    await verifyDatabaseConnectivity();
    await runMigrations();
    await seedDatabase();
    await HolidayService.ensureDefaultHolidayLists();
    await DataImportService.importLocalMetadataToDatabase();
    await UserService.syncFromDatabase();
    await reconcileCurrentYearLeaveBalances();
    await WorkingDaysService.syncEmployeeWeeklyOffsFromDb();
  } else if (isDbConfigured()) {
    await verifyDatabaseConnectivity();
    await seedDatabase();
    await HolidayService.ensureDefaultHolidayLists();
    await DataImportService.importLocalMetadataToDatabase();
    await UserService.syncFromDatabase();
    await reconcileCurrentYearLeaveBalances();
    await WorkingDaysService.syncEmployeeWeeklyOffsFromDb();
  }
}

async function startServer() {
  await verifyServerDatabaseReadiness();

  const app = express();
  app.set('trust proxy', 1);
  const PORT = Number(process.env.PORT) || 3000;

  registerApiRoutes(app);

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Maestro Leave Management] Server running on http://0.0.0.0:${PORT}`);
  });
}

if (!process.argv[1]?.includes('.test.')) {
  startServer().catch((err) => {
    console.error('[Maestro Leave Management] FATAL: Server failed to start:', err);
    if (isProductionRuntime()) {
      process.exit(1);
    }
  });
}
