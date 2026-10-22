import { eq, and } from 'drizzle-orm';
import { getDb, isDbConfigured } from '../db/index.ts';
import {
  leaveTypes,
  leavePolicies,
  leaveBalances,
  leaveBalanceTransactions,
  leaveRequests,
} from '../db/schema.ts';
import { INITIAL_LEAVE_TYPES } from '../db/seed.ts';
import { AuditService } from './auditService.ts';
import { UserService } from './userService.ts';
import {
  AuthContext,
  CreateLeavePolicyInput,
  CreateLeaveTypeInput,
  LeaveBalanceDto,
  LeaveBalanceTransactionDto,
  LeavePolicyDto,
  LeaveTypeDto,
  UpdateLeavePolicyInput,
  UpdateLeaveTypeInput,
} from '../types/leave.ts';
import { validateLeavePolicy, validateLeaveType, ValidationError } from './validation.ts';

// In-memory master store fallback when PostgreSQL database is not connected
const buildInitialTypes = (): LeaveTypeDto[] =>
  INITIAL_LEAVE_TYPES.map((item, idx) => ({
    id: idx + 1,
    code: item.code,
    name: item.name,
    description: item.description,
    isPaid: item.isPaid,
    requiresDocument: item.requiresDocument,
    supportsHalfDay: item.supportsHalfDay,
    isActive: item.isActive,
    displayOrder: item.displayOrder,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }));

const buildInitialPolicies = (): LeavePolicyDto[] => [
  {
    id: 1,
    policyName: 'Standard Casual Leave Policy',
    description: 'General casual leave policy for employees',
    leaveTypeId: 1,
    leaveTypeCode: 'CL',
    leaveTypeName: 'Casual Leave',
    annualAllocation: 12,
    allocationFrequency: 'ANNUAL',
    carryForwardAllowed: false,
    carryForwardLimit: 0,
    expiryEnabled: false,
    expiryPeriod: null,
    halfDayAllowed: true,
    sameDayAllowed: true,
    minimumNoticeDays: 1,
    maximumConsecutiveDays: 3,
    lateRequestAllowed: true,
    postStartRequestAllowed: false,
    emergencyExceptionAllowed: true,
    documentRequired: false,
    documentRequiredAfterDays: 0,
    negativeBalanceAllowed: false,
    isActive: true,
    effectiveFrom: null,
    effectiveTo: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 2,
    policyName: 'Standard Sick Leave Policy',
    description: 'Medical and sickness leave policy',
    leaveTypeId: 2,
    leaveTypeCode: 'SL',
    leaveTypeName: 'Sick Leave',
    annualAllocation: 0,
    allocationFrequency: 'ANNUAL',
    carryForwardAllowed: false,
    carryForwardLimit: 0,
    expiryEnabled: false,
    expiryPeriod: null,
    halfDayAllowed: true,
    sameDayAllowed: true,
    minimumNoticeDays: 0,
    maximumConsecutiveDays: 14,
    lateRequestAllowed: true,
    postStartRequestAllowed: true,
    emergencyExceptionAllowed: true,
    documentRequired: true,
    documentRequiredAfterDays: 2,
    negativeBalanceAllowed: false,
    isActive: true,
    effectiveFrom: null,
    effectiveTo: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 3,
    policyName: 'Standard Earned Leave Policy',
    description: 'Privilege and earned leave policy',
    leaveTypeId: 3,
    leaveTypeCode: 'EL',
    leaveTypeName: 'Earned Leave',
    annualAllocation: 0,
    allocationFrequency: 'ANNUAL',
    carryForwardAllowed: false,
    carryForwardLimit: 0,
    expiryEnabled: false,
    expiryPeriod: null,
    halfDayAllowed: false,
    sameDayAllowed: false,
    minimumNoticeDays: 7,
    maximumConsecutiveDays: 14,
    lateRequestAllowed: false,
    postStartRequestAllowed: false,
    emergencyExceptionAllowed: false,
    documentRequired: false,
    documentRequiredAfterDays: 0,
    negativeBalanceAllowed: false,
    isActive: true,
    effectiveFrom: null,
    effectiveTo: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 4,
    policyName: 'Standard Emergency Leave Policy',
    description: 'Urgent and unforeseen emergency leave policy',
    leaveTypeId: 4,
    leaveTypeCode: 'EMERGENCY',
    leaveTypeName: 'Emergency Leave',
    annualAllocation: 0,
    allocationFrequency: 'ANNUAL',
    carryForwardAllowed: false,
    carryForwardLimit: 0,
    expiryEnabled: false,
    expiryPeriod: null,
    halfDayAllowed: true,
    sameDayAllowed: true,
    minimumNoticeDays: 0,
    maximumConsecutiveDays: 5,
    lateRequestAllowed: true,
    postStartRequestAllowed: true,
    emergencyExceptionAllowed: true,
    documentRequired: false,
    documentRequiredAfterDays: 0,
    negativeBalanceAllowed: false,
    isActive: true,
    effectiveFrom: null,
    effectiveTo: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 5,
    policyName: 'Standard Leave Without Pay Policy',
    description: 'Unpaid leave policy when paid balances are exhausted',
    leaveTypeId: 5,
    leaveTypeCode: 'LWP',
    leaveTypeName: 'Leave Without Pay',
    annualAllocation: 0,
    allocationFrequency: 'ANNUAL',
    carryForwardAllowed: false,
    carryForwardLimit: 0,
    expiryEnabled: false,
    expiryPeriod: null,
    halfDayAllowed: true,
    sameDayAllowed: true,
    minimumNoticeDays: 0,
    maximumConsecutiveDays: 30,
    lateRequestAllowed: true,
    postStartRequestAllowed: true,
    emergencyExceptionAllowed: true,
    documentRequired: false,
    documentRequiredAfterDays: 0,
    negativeBalanceAllowed: true,
    isActive: true,
    effectiveFrom: null,
    effectiveTo: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

const buildInitialBalances = (): LeaveBalanceDto[] => {
  const targetEmployees = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 101, 102];
  const balances: LeaveBalanceDto[] = [];
  let idCounter = 1;
  const now = new Date().toISOString();

  for (const empId of targetEmployees) {
    balances.push(
      {
        id: idCounter++,
        employeeId: empId,
        leaveTypeId: 1,
        leaveTypeCode: 'CL',
        leaveTypeName: 'Casual Leave',
        openingBalance: 0,
        allocated: 12,
        carryForward: 0,
        adjustments: 0,
        used: 0,
        reserved: 0,
        available: 12,
        year: 2026,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: idCounter++,
        employeeId: empId,
        leaveTypeId: 2,
        leaveTypeCode: 'SL',
        leaveTypeName: 'Sick Leave',
        openingBalance: 0,
        allocated: 0,
        carryForward: 0,
        adjustments: 0,
        used: 0,
        reserved: 0,
        available: 0,
        year: 2026,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: idCounter++,
        employeeId: empId,
        leaveTypeId: 3,
        leaveTypeCode: 'EL',
        leaveTypeName: 'Earned Leave',
        openingBalance: 0,
        allocated: 0,
        carryForward: 0,
        adjustments: 0,
        used: 0,
        reserved: 0,
        available: 0,
        year: 2026,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: idCounter++,
        employeeId: empId,
        leaveTypeId: 4,
        leaveTypeCode: 'EMERGENCY',
        leaveTypeName: 'Emergency Leave',
        openingBalance: 0,
        allocated: 0,
        carryForward: 0,
        adjustments: 0,
        used: 0,
        reserved: 0,
        available: 0,
        year: 2026,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: idCounter++,
        employeeId: empId,
        leaveTypeId: 5,
        leaveTypeCode: 'LWP',
        leaveTypeName: 'Leave Without Pay',
        openingBalance: 0,
        allocated: 0,
        carryForward: 0,
        adjustments: 0,
        used: 0,
        reserved: 0,
        available: 0,
        year: 2026,
        createdAt: now,
        updatedAt: now,
      }
    );
  }

  return balances;
};

let memoryLeaveTypes: LeaveTypeDto[] = buildInitialTypes();
let memoryLeavePolicies: LeavePolicyDto[] = buildInitialPolicies();
let memoryLeaveBalances: LeaveBalanceDto[] = buildInitialBalances();
let memoryTransactions: LeaveBalanceTransactionDto[] = [];

let nextTypeId = 20;
let nextPolicyId = 20;
let nextBalanceId = 100;
let nextTxId = 20;

export class LeaveService {
  /**
   * Resets in-memory stores (useful for test isolation)
   */
  public static resetMemoryStores(blank = false): void {
    memoryLeaveTypes = buildInitialTypes();
    memoryLeavePolicies = blank ? [] : buildInitialPolicies();
    memoryLeaveBalances = blank ? [] : buildInitialBalances();
    memoryTransactions = [];
    nextTypeId = 20;
    nextPolicyId = 20;
    nextBalanceId = 100;
    nextTxId = 20;
  }


  // ==========================================
  // LEAVE TYPES
  // ==========================================

  public static async getLeaveTypes(options: { includeInactive?: boolean } = {}): Promise<LeaveTypeDto[]> {
    if (isDbConfigured()) {
      const db = getDb();
      if (db) {
        let results = await db.select().from(leaveTypes);
        if (!options.includeInactive) {
          results = results.filter((lt) => lt.isActive);
        }
        return results.sort((a, b) => a.displayOrder - b.displayOrder);
      }
    }

    // In-memory fallback
    let list = [...memoryLeaveTypes];
    if (!options.includeInactive) {
      list = list.filter((lt) => lt.isActive);
    }
    return list.sort((a, b) => a.displayOrder - b.displayOrder);
  }

  public static async getLeaveTypeById(id: number): Promise<LeaveTypeDto | null> {
    if (isDbConfigured()) {
      const db = getDb();
      if (db) {
        const found = await db.select().from(leaveTypes).where(eq(leaveTypes.id, id));
        return found[0] || null;
      }
    }

    return memoryLeaveTypes.find((lt) => lt.id === id) || null;
  }

  public static async getLeaveTypeByCode(code: string): Promise<LeaveTypeDto | null> {
    const cleanCode = code.trim().toUpperCase();
    if (isDbConfigured()) {
      const db = getDb();
      if (db) {
        const found = await db.select().from(leaveTypes).where(eq(leaveTypes.code, cleanCode));
        return found[0] || null;
      }
    }

    return memoryLeaveTypes.find((lt) => lt.code.toUpperCase() === cleanCode) || null;
  }

  public static async createLeaveType(
    input: CreateLeaveTypeInput,
    actor: AuthContext
  ): Promise<LeaveTypeDto> {
    if (actor.role !== 'SUPER_ADMIN') {
      throw new Error('Forbidden: Only Super Admin can create leave types');
    }

    validateLeaveType(input);

    const cleanCode = input.code.trim().toUpperCase();
    const existing = await this.getLeaveTypeByCode(cleanCode);
    if (existing) {
      throw new ValidationError(`Leave type code '${cleanCode}' already exists`, {
        code: `Leave type code '${cleanCode}' already exists`,
      });
    }

    const newRecord = {
      code: cleanCode,
      name: input.name.trim(),
      description: input.description?.trim() || null,
      isPaid: input.isPaid ?? true,
      requiresDocument: input.requiresDocument ?? false,
      supportsHalfDay: input.supportsHalfDay ?? true,
      isActive: input.isActive ?? true,
      displayOrder: input.displayOrder ?? (memoryLeaveTypes.length + 1),
    };

    if (isDbConfigured()) {
      const db = getDb();
      if (db) {
        const inserted = await db.insert(leaveTypes).values(newRecord).returning();
        return inserted[0];
      }
    }

    const created: LeaveTypeDto = {
      id: nextTypeId++,
      ...newRecord,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    memoryLeaveTypes.push(created);
    return created;
  }

  public static async updateLeaveType(
    id: number,
    input: UpdateLeaveTypeInput,
    actor: AuthContext
  ): Promise<LeaveTypeDto> {
    if (actor.role !== 'SUPER_ADMIN') {
      throw new Error('Forbidden: Only Super Admin can update leave types');
    }

    validateLeaveType(input, true);

    const existing = await this.getLeaveTypeById(id);
    if (!existing) {
      throw new Error(`Leave type with ID ${id} not found`);
    }

    const updatePayload: Partial<typeof leaveTypes.$inferInsert> = {};
    if (input.name !== undefined) updatePayload.name = input.name.trim();
    if (input.description !== undefined) updatePayload.description = input.description?.trim() || null;
    if (input.isPaid !== undefined) updatePayload.isPaid = input.isPaid;
    if (input.requiresDocument !== undefined) updatePayload.requiresDocument = input.requiresDocument;
    if (input.supportsHalfDay !== undefined) updatePayload.supportsHalfDay = input.supportsHalfDay;
    if (input.isActive !== undefined) updatePayload.isActive = input.isActive;
    if (input.displayOrder !== undefined) updatePayload.displayOrder = input.displayOrder;
    updatePayload.updatedAt = new Date();

    if (isDbConfigured()) {
      const db = getDb();
      if (db) {
        const updated = await db
          .update(leaveTypes)
          .set(updatePayload)
          .where(eq(leaveTypes.id, id))
          .returning();
        return updated[0];
      }
    }

    const memIndex = memoryLeaveTypes.findIndex((lt) => lt.id === id);
    if (memIndex === -1) throw new Error(`Leave type with ID ${id} not found`);

    memoryLeaveTypes[memIndex] = {
      ...memoryLeaveTypes[memIndex],
      ...(updatePayload as any),
      updatedAt: new Date().toISOString(),
    };
    return memoryLeaveTypes[memIndex];
  }

  public static async deleteLeaveType(
    id: number,
    actor: AuthContext,
    force?: boolean
  ): Promise<{ success: boolean; message: string }> {
    if (actor.role !== 'SUPER_ADMIN') {
      throw new Error('Forbidden: Only Super Admin can delete leave types');
    }

    const existing = await this.getLeaveTypeById(id);
    if (!existing) {
      throw new ValidationError(`Leave type with ID ${id} not found`);
    }

    // Check if referenced in leave requests or balances
    if (isDbConfigured()) {
      const db = getDb();
      if (db) {
        const reqRows = await db
          .select()
          .from(leaveRequests)
          .where(eq(leaveRequests.leaveTypeId, id))
          .limit(1);
        if (reqRows.length > 0 && !force) {
          throw new ValidationError(
            `Cannot delete leave type "${existing.name}" (${existing.code}) because existing leave requests reference it. Deleting requires administrative confirmation.`,
            { isDependencyError: true }
          );
        }

        const balRows = await db
          .select()
          .from(leaveBalances)
          .where(eq(leaveBalances.leaveTypeId, id))
          .limit(1);
        if (balRows.length > 0 && !force) {
          throw new ValidationError(
            `Cannot delete leave type "${existing.name}" (${existing.code}) because employee balances reference it. Deleting requires administrative confirmation.`,
            { isDependencyError: true }
          );
        }

        // Safe / Forced delete
        if (force) {
          try {
            await db.delete(leaveRequests).where(eq(leaveRequests.leaveTypeId, id));
            await db.delete(leaveBalances).where(eq(leaveBalances.leaveTypeId, id));
          } catch {}
        }
        await db.delete(leavePolicies).where(eq(leavePolicies.leaveTypeId, id));
        await db.delete(leaveTypes).where(eq(leaveTypes.id, id));
      }
    }

    const memIdx = memoryLeaveTypes.findIndex((t) => t.id === id);
    if (memIdx !== -1) {
      memoryLeaveTypes.splice(memIdx, 1);
    }
    if (force) {
      memoryLeaveBalances = memoryLeaveBalances.filter((b) => b.leaveTypeId !== id);
      memoryLeavePolicies = memoryLeavePolicies.filter((p) => p.leaveTypeId !== id);
    }

    await AuditService.logEvent({
      actorId: actor.userId || null,
      actorRole: actor.role,
      action: 'LEAVE_TYPE_DELETED',
      targetEntity: 'leave_types',
      targetId: String(id),
      metadata: { code: existing.code, name: existing.name, forced: Boolean(force) },
    });

    return { success: true, message: `Leave type "${existing.name}" deleted successfully.` };
  }

  // ==========================================
  // LEAVE POLICIES
  // ==========================================

  public static async getLeavePolicies(options: {
    leaveTypeId?: number;
    includeInactive?: boolean;
  } = {}): Promise<LeavePolicyDto[]> {
    if (isDbConfigured()) {
      const db = getDb();
      if (db) {
        let results = await db.select().from(leavePolicies);
        if (options.leaveTypeId) {
          results = results.filter((lp) => lp.leaveTypeId === options.leaveTypeId);
        }
        if (!options.includeInactive) {
          results = results.filter((lp) => lp.isActive);
        }
        return results;
      }
    }

    let list = [...memoryLeavePolicies];
    if (options.leaveTypeId) {
      list = list.filter((lp) => lp.leaveTypeId === options.leaveTypeId);
    }
    if (!options.includeInactive) {
      list = list.filter((lp) => lp.isActive);
    }
    return list;
  }

  public static async getLeavePolicyById(id: number): Promise<LeavePolicyDto | null> {
    if (isDbConfigured()) {
      const db = getDb();
      if (db) {
        const found = await db.select().from(leavePolicies).where(eq(leavePolicies.id, id));
        return found[0] || null;
      }
    }

    return memoryLeavePolicies.find((lp) => lp.id === id) || null;
  }

  public static async createLeavePolicy(
    input: CreateLeavePolicyInput,
    actor: AuthContext
  ): Promise<LeavePolicyDto> {
    if (actor.role !== 'SUPER_ADMIN') {
      throw new Error('Forbidden: Only Super Admin can configure leave policies');
    }

    validateLeavePolicy(input);

    const lt = await this.getLeaveTypeById(Number(input.leaveTypeId));
    if (!lt) {
      throw new ValidationError(`Associated Leave Type with ID ${input.leaveTypeId} does not exist`, {
        leaveTypeId: `Leave Type with ID ${input.leaveTypeId} does not exist`,
      });
    }

    const newRecord = {
      leaveTypeId: Number(input.leaveTypeId),
      policyName: input.policyName.trim(),
      annualAllocation: String(Number(input.annualAllocation || 0).toFixed(2)),
      allocationFrequency: input.allocationFrequency || 'ANNUAL',
      carryForwardAllowed: input.carryForwardAllowed ?? false,
      carryForwardLimit: String(Number(input.carryForwardLimit || 0).toFixed(2)),
      expiryEnabled: input.expiryEnabled ?? false,
      expiryPeriod: input.expiryPeriod || null,
      maximumConsecutiveDays: Number(input.maximumConsecutiveDays || 0),
      minimumNoticeDays: Number(input.minimumNoticeDays || 0),
      sameDayAllowed: input.sameDayAllowed ?? true,
      lateRequestAllowed: input.lateRequestAllowed ?? false,
      postStartRequestAllowed: input.postStartRequestAllowed ?? false,
      emergencyExceptionAllowed: input.emergencyExceptionAllowed ?? false,
      negativeBalanceAllowed: input.negativeBalanceAllowed ?? false,
      documentRequired: input.documentRequired ?? lt.requiresDocument,
      halfDayAllowed: input.halfDayAllowed ?? lt.supportsHalfDay,
      isActive: input.isActive ?? true,
      effectiveFrom: input.effectiveFrom ? new Date(input.effectiveFrom) : null,
      effectiveTo: input.effectiveTo ? new Date(input.effectiveTo) : null,
      applicableDepartmentId: input.applicableDepartmentId ? Number(input.applicableDepartmentId) : null,
      applicableDesignationId: input.applicableDesignationId ? Number(input.applicableDesignationId) : null,
      applicableEmploymentStatus: input.applicableEmploymentStatus || null,
      minServiceMonths: Number(input.minServiceMonths || 0),
    };

    if (isDbConfigured()) {
      const db = getDb();
      if (db) {
        const inserted = await db.insert(leavePolicies).values(newRecord as any).returning();
        return inserted[0];
      }
    }

    const created: LeavePolicyDto = {
      id: nextPolicyId++,
      ...newRecord,
      leaveTypeCode: lt.code,
      leaveTypeName: lt.name,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    memoryLeavePolicies.push(created);
    return created;
  }

  public static async updateLeavePolicy(
    id: number,
    input: UpdateLeavePolicyInput,
    actor: AuthContext
  ): Promise<LeavePolicyDto> {
    if (actor.role !== 'SUPER_ADMIN') {
      throw new Error('Forbidden: Only Super Admin can update leave policies');
    }

    validateLeavePolicy(input, true);

    const existing = await this.getLeavePolicyById(id);
    if (!existing) {
      throw new Error(`Leave policy with ID ${id} not found`);
    }

    const updatePayload: Record<string, any> = {};
    if (input.policyName !== undefined) updatePayload.policyName = input.policyName.trim();
    if (input.annualAllocation !== undefined)
      updatePayload.annualAllocation = String(Number(input.annualAllocation).toFixed(2));
    if (input.allocationFrequency !== undefined) updatePayload.allocationFrequency = input.allocationFrequency;
    if (input.carryForwardAllowed !== undefined) updatePayload.carryForwardAllowed = input.carryForwardAllowed;
    if (input.carryForwardLimit !== undefined)
      updatePayload.carryForwardLimit = String(Number(input.carryForwardLimit).toFixed(2));
    if (input.expiryEnabled !== undefined) updatePayload.expiryEnabled = input.expiryEnabled;
    if (input.expiryPeriod !== undefined) updatePayload.expiryPeriod = input.expiryPeriod;
    if (input.maximumConsecutiveDays !== undefined)
      updatePayload.maximumConsecutiveDays = Number(input.maximumConsecutiveDays);
    if (input.minimumNoticeDays !== undefined)
      updatePayload.minimumNoticeDays = Number(input.minimumNoticeDays);
    if (input.sameDayAllowed !== undefined) updatePayload.sameDayAllowed = input.sameDayAllowed;
    if (input.lateRequestAllowed !== undefined) updatePayload.lateRequestAllowed = input.lateRequestAllowed;
    if (input.postStartRequestAllowed !== undefined)
      updatePayload.postStartRequestAllowed = input.postStartRequestAllowed;
    if (input.emergencyExceptionAllowed !== undefined)
      updatePayload.emergencyExceptionAllowed = input.emergencyExceptionAllowed;
    if (input.negativeBalanceAllowed !== undefined)
      updatePayload.negativeBalanceAllowed = input.negativeBalanceAllowed;
    if (input.documentRequired !== undefined) updatePayload.documentRequired = input.documentRequired;
    if (input.halfDayAllowed !== undefined) updatePayload.halfDayAllowed = input.halfDayAllowed;
    if (input.isActive !== undefined) updatePayload.isActive = input.isActive;
    if (input.effectiveFrom !== undefined)
      updatePayload.effectiveFrom = input.effectiveFrom ? new Date(input.effectiveFrom) : null;
    if (input.effectiveTo !== undefined)
      updatePayload.effectiveTo = input.effectiveTo ? new Date(input.effectiveTo) : null;
    if (input.applicableDepartmentId !== undefined)
      updatePayload.applicableDepartmentId = input.applicableDepartmentId ? Number(input.applicableDepartmentId) : null;
    if (input.applicableDesignationId !== undefined)
      updatePayload.applicableDesignationId = input.applicableDesignationId ? Number(input.applicableDesignationId) : null;
    if (input.applicableEmploymentStatus !== undefined)
      updatePayload.applicableEmploymentStatus = input.applicableEmploymentStatus;
    if (input.minServiceMonths !== undefined)
      updatePayload.minServiceMonths = Number(input.minServiceMonths);

    updatePayload.updatedAt = new Date();

    if (isDbConfigured()) {
      const db = getDb();
      if (db) {
        const updated = await db
          .update(leavePolicies)
          .set(updatePayload)
          .where(eq(leavePolicies.id, id))
          .returning();
        return updated[0];
      }
    }

    const memIndex = memoryLeavePolicies.findIndex((lp) => lp.id === id);
    if (memIndex === -1) throw new Error(`Leave policy with ID ${id} not found`);

    memoryLeavePolicies[memIndex] = {
      ...memoryLeavePolicies[memIndex],
      ...updatePayload,
      updatedAt: new Date().toISOString(),
    };
    return memoryLeavePolicies[memIndex];
  }

  public static async deleteLeavePolicy(
    id: number,
    actor: AuthContext
  ): Promise<{ success: boolean; message: string }> {
    if (actor.role !== 'SUPER_ADMIN') {
      throw new Error('Forbidden: Only Super Admin can delete leave policies');
    }

    const existing = await this.getLeavePolicyById(id);
    if (!existing) {
      throw new ValidationError(`Leave policy with ID ${id} not found`);
    }

    if (isDbConfigured()) {
      const db = getDb();
      if (db) {
        await db.delete(leavePolicies).where(eq(leavePolicies.id, id));
      }
    }

    const memIdx = memoryLeavePolicies.findIndex((p) => p.id === id);
    if (memIdx !== -1) {
      memoryLeavePolicies.splice(memIdx, 1);
    }

    await AuditService.logEvent({
      actorId: actor.userId || null,
      actorRole: actor.role,
      action: 'LEAVE_POLICY_DELETED',
      targetEntity: 'leave_policies',
      targetId: String(id),
      metadata: { policyName: existing.policyName, leaveTypeId: existing.leaveTypeId },
    });

    return { success: true, message: `Leave policy "${existing.policyName}" deleted successfully.` };
  }

  // ==========================================
  // LEAVE BALANCES
  // ==========================================

  private static enrichLeaveBalanceDto(
    b: LeaveBalanceDto,
    typeMap?: Map<number, LeaveTypeDto>
  ): LeaveBalanceDto {
    const lt = typeMap?.get(b.leaveTypeId) || memoryLeaveTypes.find((t) => t.id === b.leaveTypeId);
    const emp = b.employeeId ? UserService.resolveEmployeeRecordSync(b.employeeId) : null;
    const dept = emp?.departmentId ? UserService.getDepartmentByIdSync(emp.departmentId) : null;
    return {
      ...b,
      employeeCode: emp?.employeeCode || b.employeeCode,
      employeeName: emp ? (emp.employeeName || emp.username) : b.employeeName,
      departmentId: emp?.departmentId ?? b.departmentId ?? null,
      departmentCode: dept?.code ?? b.departmentCode ?? null,
      departmentName: dept?.name ?? b.departmentName ?? null,
      leaveTypeCode: b.leaveTypeCode || lt?.code,
      leaveTypeName: b.leaveTypeName || lt?.name,
    };
  }

  public static async getLeaveBalances(
    filter: { employeeId?: number | string; employeeCode?: string; year?: number } = {},
    actor?: AuthContext
  ): Promise<LeaveBalanceDto[]> {
    const rawFilterEmp = filter.employeeId ?? filter.employeeCode;
    const resolvedFilterEmp =
      rawFilterEmp !== undefined && rawFilterEmp !== null && String(rawFilterEmp).trim() !== ''
        ? UserService.resolveEmployeeRecordSync(rawFilterEmp)
        : null;
    let targetEmployeeId =
      resolvedFilterEmp?.employeeId ??
      (rawFilterEmp !== undefined && !isNaN(Number(rawFilterEmp)) ? Number(rawFilterEmp) : undefined);

    // RBAC: If EMPLOYEE role, restrict to their own employee ID
    if (actor && actor.role === 'EMPLOYEE') {
      const actorEmpRec =
        (actor.employeeId ? UserService.resolveEmployeeRecordSync(actor.employeeId) : null) ||
        (actor.employeeCode ? UserService.resolveEmployeeRecordSync(actor.employeeCode) : null) ||
        (!actor.employeeId && actor.userId ? UserService.getMemoryUserRecordById(actor.userId) : null);
      const selfEmpId = actor.employeeId ?? actorEmpRec?.employeeId ?? 101;
      if (targetEmployeeId && targetEmployeeId !== selfEmpId) {
        throw new Error('Forbidden: Employees can only view their own leave balances');
      }
      targetEmployeeId = selfEmpId;
    }

    const allTypes = await this.getLeaveTypes({ includeInactive: true });
    const typeMap = new Map(allTypes.map((t) => [t.id, t]));

    if (isDbConfigured()) {
      const db = getDb();
      if (db) {
        let results = await db.select().from(leaveBalances);
        if (targetEmployeeId) {
          results = results.filter((b) => b.employeeId === targetEmployeeId);
        }
        if (filter.year) {
          results = results.filter((b) => b.year === filter.year);
        }
        return results.map((b) => this.enrichLeaveBalanceDto(b as any, typeMap));
      }
    }

    let list = [...memoryLeaveBalances];
    if (targetEmployeeId) {
      list = list.filter((b) => b.employeeId === targetEmployeeId);
    }
    if (filter.year) {
      list = list.filter((b) => b.year === filter.year);
    }
    return list.map((b) => this.enrichLeaveBalanceDto(b, typeMap));
  }

  /**
   * Helper to initialize standard balances for a newly created employee
   */
  public static async initializeEmployeeBalances(
    employeeId: number | string,
    year = new Date().getFullYear(),
    _actor: AuthContext = { userId: 1, username: 'superadmin', role: 'SUPER_ADMIN', employeeId: 1 }
  ): Promise<void> {
    const resolvedEmp = UserService.resolveEmployeeRecordSync(employeeId);
    const numericEmpId = resolvedEmp?.employeeId ?? Number(employeeId);
    if (!Number.isFinite(numericEmpId) || numericEmpId <= 0) {
      throw new ValidationError(`Cannot initialize leave balances: employee '${employeeId}' was not found.`);
    }

    const [types, policies, existingBalances, existingTransactions] = await Promise.all([
      this.getLeaveTypes(),
      this.getLeavePolicies(),
      this.getLeaveBalances({ employeeId: numericEmpId, year }),
      isDbConfigured() && getDb()
        ? getDb()!.select().from(leaveBalanceTransactions).where(eq(leaveBalanceTransactions.employeeId, numericEmpId))
        : Promise.resolve([] as any[]),
    ]);
    const balancesWithAllocationTransaction = new Set(
      existingTransactions
        .filter((transaction: any) => transaction.transactionType === 'ALLOCATION' && transaction.leaveBalanceId)
        .map((transaction: any) => Number(transaction.leaveBalanceId))
    );
    const activeTypes = types.filter((type) => type.isActive);
    const now = new Date();
    const joiningDate = resolvedEmp?.joiningDate ? new Date(resolvedEmp.joiningDate) : null;
    const serviceMonths = joiningDate && !Number.isNaN(joiningDate.getTime())
      ? Math.max(0, (now.getFullYear() - joiningDate.getFullYear()) * 12 + now.getMonth() - joiningDate.getMonth())
      : 0;

    for (const type of activeTypes) {
      const existingBalance = existingBalances.find((balance) => Number(balance.leaveTypeId) === Number(type.id));
      if (existingBalance) {
        if (isDbConfigured() && Number(existingBalance.allocated || 0) > 0 && !balancesWithAllocationTransaction.has(Number(existingBalance.id))) {
          const db = getDb();
          if (!db) throw new Error('Database is configured but unavailable while reconciling leave allocation history.');
          await db.insert(leaveBalanceTransactions).values({
            employeeId: numericEmpId,
            leaveTypeId: type.id,
            leaveBalanceId: Number(existingBalance.id),
            leaveTypeCode: type.code,
            leaveTypeName: type.name,
            transactionType: 'ALLOCATION',
            quantity: Number(existingBalance.allocated || 0).toFixed(2),
            referenceType: 'POLICY_ALLOCATION_RECONCILIATION',
            referenceId: `${year}:${type.id}`,
            remarks: 'Allocation ledger entry reconciled from the existing leave balance.',
            createdBy: null,
          });
          balancesWithAllocationTransaction.add(Number(existingBalance.id));
        }
        continue;
      }
      const applicable = policies.filter((policy) => {
        if (!policy.isActive || Number(policy.leaveTypeId) !== Number(type.id)) return false;
        if (policy.effectiveFrom && new Date(policy.effectiveFrom).getTime() > now.getTime()) return false;
        if (policy.effectiveTo && new Date(policy.effectiveTo).getTime() < now.getTime()) return false;
        if (policy.applicableDepartmentId != null && Number(policy.applicableDepartmentId) !== Number(resolvedEmp?.departmentId)) return false;
        if (policy.applicableDesignationId != null && Number(policy.applicableDesignationId) !== Number(resolvedEmp?.designationId)) return false;
        if (policy.applicableEmploymentStatus && String(policy.applicableEmploymentStatus).toUpperCase() !== String(resolvedEmp?.employmentStatus || 'ACTIVE').toUpperCase()) return false;
        if (Number(policy.minServiceMonths || 0) > serviceMonths) return false;
        return true;
      }).sort((a, b) => {
        const score = (p: any) => (p.applicableDepartmentId != null ? 4 : 0) +
          (p.applicableDesignationId != null ? 2 : 0) +
          (p.applicableEmploymentStatus ? 1 : 0) +
          (Number(p.minServiceMonths || 0) > 0 ? 1 : 0);
        return score(b) - score(a);
      });
      const policy = applicable[0];
      if (!policy) continue;
      const allocation = Number(policy.annualAllocation || 0);
      const row = {
        employeeId: numericEmpId,
        leaveTypeId: type.id,
        year,
        openingBalance: '0.00',
        allocated: allocation.toFixed(2),
        carryForward: '0.00',
        adjustments: '0.00',
        used: '0.00',
        reserved: '0.00',
        available: allocation.toFixed(2),
        departmentId: resolvedEmp?.departmentId ?? null,
        departmentCode: resolvedEmp?.departmentCode ?? null,
        departmentName: resolvedEmp?.departmentName ?? null,
      };
      if (isDbConfigured()) {
        const db = getDb();
        if (!db) throw new Error('Database is configured but unavailable while initializing leave balances.');
        const inserted = await db.insert(leaveBalances).values(row).onConflictDoNothing().returning();
        if (inserted.length > 0 && allocation > 0) {
          await db.insert(leaveBalanceTransactions).values({
            employeeId: numericEmpId,
            leaveTypeId: type.id,
            leaveBalanceId: inserted[0].id,
            leaveTypeCode: type.code,
            leaveTypeName: type.name,
            transactionType: 'ALLOCATION',
            quantity: allocation.toFixed(2),
            referenceType: 'POLICY_ALLOCATION',
            referenceId: `${year}:${policy.id}`,
            remarks: `Initial allocation from active leave policy #${policy.id} for ${year}.`,
            createdBy: null,
          });
          balancesWithAllocationTransaction.add(Number(inserted[0].id));
        }
      } else {
        const existingMem = memoryLeaveBalances.find((balance) =>
          balance.employeeId === numericEmpId && balance.leaveTypeId === type.id && balance.year === year
        );
        if (!existingMem) {
          memoryLeaveBalances.push(this.enrichLeaveBalanceDto({
            id: nextBalanceId++,
            ...row,
            leaveTypeCode: type.code,
            leaveTypeName: type.name,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          }));
        }
      }
    }
  }

  /**
   * Helper to initialize or create a balance record (used in testing & foundations)
   */
  public static async createOrInitBalance(
    data: {
      employeeId: number | string;
      employeeCode?: string;
      leaveTypeId: number;
      year: number;
      openingBalance?: number | string;
      allocated?: number | string;
      carryForward?: number | string;
      adjustments?: number | string;
      used?: number | string;
      reserved?: number | string;
    },
    actor: AuthContext
  ): Promise<LeaveBalanceDto> {
    const hasPerm = await UserService.hasPermission(actor, 'LEAVE_BALANCE_ADJUST');
    if (!hasPerm) {
      throw new Error('Forbidden: You do not have permission to add or initialize leave balances (LEAVE_BALANCE_ADJUST required).');
    }

    const rawEmp = data.employeeId ?? data.employeeCode;
    const resolvedEmp = UserService.resolveEmployeeRecordSync(rawEmp);
    const numericEmpId = resolvedEmp?.employeeId ?? Number(rawEmp);

    const opening = Number(data.openingBalance || 0);
    const allocated = Number(data.allocated || 0);
    const carry = Number(data.carryForward || 0);
    const adjustments = Number(data.adjustments || 0);
    const used = Number(data.used || 0);
    const reserved = Number(data.reserved || 0);
    const available = opening + allocated + carry + adjustments - used - reserved;

    // Check unique constraint: (employeeId, leaveTypeId, year)
    if (isDbConfigured()) {
      const db = getDb();
      if (db) {
        const existing = await db
          .select()
          .from(leaveBalances)
          .where(
            and(
              eq(leaveBalances.employeeId, numericEmpId),
              eq(leaveBalances.leaveTypeId, data.leaveTypeId),
              eq(leaveBalances.year, data.year)
            )
          );
        if (existing.length > 0) {
          throw new ValidationError(
            `Leave balance already exists for employee ${numericEmpId}, leave type ${data.leaveTypeId}, year ${data.year}`
          );
        }

        const inserted = await db
          .insert(leaveBalances)
          .values({
            employeeId: numericEmpId,
            leaveTypeId: data.leaveTypeId,
            year: data.year,
            openingBalance: String(opening.toFixed(2)),
            allocated: String(allocated.toFixed(2)),
            carryForward: String(carry.toFixed(2)),
            adjustments: String(adjustments.toFixed(2)),
            used: String(used.toFixed(2)),
            reserved: String(reserved.toFixed(2)),
            available: String(available.toFixed(2)),
          })
          .returning();
        return this.enrichLeaveBalanceDto(inserted[0] as any);
      }
    }

    const existingMem = memoryLeaveBalances.find(
      (b) =>
        b.employeeId === numericEmpId &&
        b.leaveTypeId === data.leaveTypeId &&
        b.year === data.year
    );
    if (existingMem) {
      throw new ValidationError(
        `Leave balance already exists for employee ${numericEmpId}, leave type ${data.leaveTypeId}, year ${data.year}`
      );
    }

    const lt = memoryLeaveTypes.find((t) => t.id === data.leaveTypeId);
    const created: LeaveBalanceDto = this.enrichLeaveBalanceDto({
      id: nextBalanceId++,
      employeeId: numericEmpId,
      leaveTypeId: data.leaveTypeId,
      leaveTypeCode: lt?.code,
      leaveTypeName: lt?.name,
      openingBalance: opening.toFixed(2),
      allocated: allocated.toFixed(2),
      carryForward: carry.toFixed(2),
      adjustments: adjustments.toFixed(2),
      used: used.toFixed(2),
      reserved: reserved.toFixed(2),
      available: available.toFixed(2),
      year: data.year,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    memoryLeaveBalances.push(created);
    return created;
  }

  public static async adjustLeaveBalance(
    input: {
      employeeId: number | string;
      employeeCode?: string;
      leaveTypeId: number;
      year: number;
      adjustmentType: 'CREDIT' | 'DEBIT' | 'SET' | 'SET_OPENING';
      quantity?: number;
      amount?: number;
      remarks?: string;
      reason?: string;
    },
    actor: AuthContext
  ): Promise<LeaveBalanceDto> {
    const hasPerm = await UserService.hasPermission(actor, 'LEAVE_BALANCE_ADJUST');
    if (!hasPerm) {
      throw new Error('Forbidden: You do not have permission to adjust leave balances (LEAVE_BALANCE_ADJUST required).');
    }
    const rawEmp = input.employeeId ?? input.employeeCode;
    const resolvedEmp = UserService.resolveEmployeeRecordSync(rawEmp);
    const numericEmpId = resolvedEmp?.employeeId ?? Number(rawEmp);
    if ((input.adjustmentType === 'SET' || input.adjustmentType === 'SET_OPENING') && actor.role !== 'SUPER_ADMIN') {
      throw new Error('Forbidden: Only Super Admin can set an employee leave allocation.');
    }
    const qty = Number(input.quantity ?? input.amount);
    if (isNaN(qty) || qty < 0 || (qty === 0 && input.adjustmentType !== 'SET' && input.adjustmentType !== 'SET_OPENING')) {
      throw new ValidationError('Quantity must be valid; allocation may be set to zero.');
    }
    const remarkText = (input.remarks ?? input.reason ?? '').trim();
    if (!remarkText) {
      throw new ValidationError('A reason / remark is mandatory for balance adjustments');
    }
    const leaveType = await this.getLeaveTypeById(input.leaveTypeId);
    const isCasualLeave = String(leaveType?.code || '').toUpperCase() === 'CL';
    // For CL, DEBIT means consumed leave: keep annual allocation unchanged and increase used.
    // CREDIT remains an entitlement adjustment; non-CL adjustment behavior remains unchanged.
    const debitAsUsage = isCasualLeave && input.adjustmentType === 'DEBIT';
    let delta = input.adjustmentType === 'CREDIT' || input.adjustmentType === 'SET_OPENING' ? qty : -qty;

    if (isDbConfigured()) {
      const db = getDb();
      if (db) {
        const rows = await db
          .select()
          .from(leaveBalances)
          .where(
            and(
              eq(leaveBalances.employeeId, numericEmpId),
              eq(leaveBalances.leaveTypeId, input.leaveTypeId),
              eq(leaveBalances.year, input.year)
            )
          );

        let balId: number;
        let updatedRow: any;

        if (rows.length > 0) {
          const row = rows[0];
          balId = row.id;
          const oldAlloc = Number(row.allocated || 0);
          const oldOpening = Number(row.openingBalance || 0);
          const oldUsed = Number(row.used || 0);
          if (input.adjustmentType === 'SET') delta = qty - oldAlloc;
          if (input.adjustmentType === 'SET_OPENING') delta = qty - oldOpening;
          const newOpening = input.adjustmentType === 'SET_OPENING' ? qty : oldOpening;
          const newAlloc = debitAsUsage ? oldAlloc : input.adjustmentType === 'SET' ? qty : oldAlloc + delta;
          const newUsed = debitAsUsage ? oldUsed + qty : oldUsed;
          const newAdj = debitAsUsage ? Number(row.adjustments || 0) : Number(row.adjustments || 0) + delta;
          if (debitAsUsage && newUsed + Number(row.reserved || 0) > Number(row.openingBalance || 0) + newAlloc + Number(row.carryForward || 0)) {
            throw new ValidationError('CL debit exceeds the employee’s remaining balance.');
          }
          const newAvail =
            newOpening +
            newAlloc +
            Number(row.carryForward || 0) -
            newUsed -
            Number(row.reserved || 0);

          if (newAvail < 0) {
            throw new ValidationError(
              `Adjustment would cause a negative balance (${newAvail.toFixed(2)} Days). Negative balances are not permitted.`
            );
          }

          const [u] = await db
            .update(leaveBalances)
            .set({
              openingBalance: String(newOpening.toFixed(2)),
              allocated: String(newAlloc.toFixed(2)),
              used: String(newUsed.toFixed(2)),
              adjustments: String(newAdj.toFixed(2)),
              available: String(newAvail.toFixed(2)),
              updatedAt: new Date(),
            })
            .where(eq(leaveBalances.id, row.id))
            .returning();
          updatedRow = u;
        } else {
          // A CL consumption debit must use an existing entitlement/balance record.
          // Never create a negative or zero entitlement to represent consumption.
          if (delta < 0 && input.adjustmentType !== 'SET_OPENING') {
            throw new ValidationError('Cannot deduct from an uninitialized balance record (0 Days).');
          }
          const initialOpening = input.adjustmentType === 'SET_OPENING' ? qty : 0;
          const initialAllocation = input.adjustmentType === 'SET_OPENING' ? 0 : delta;
          const [ins] = await db
            .insert(leaveBalances)
            .values({
              employeeId: numericEmpId,
              leaveTypeId: input.leaveTypeId,
              year: input.year,
              openingBalance: String(initialOpening.toFixed(2)),
              allocated: String(initialAllocation.toFixed(2)),
              carryForward: '0.00',
              adjustments: String((input.adjustmentType === 'SET_OPENING' ? 0 : delta).toFixed(2)),
              used: '0.00',
              reserved: '0.00',
              available: String((initialOpening + initialAllocation).toFixed(2)),
            })
            .returning();
          balId = ins.id;
          updatedRow = ins;
        }

        // Insert immutable ledger transaction
        await db.insert(leaveBalanceTransactions).values({
          employeeId: numericEmpId,
          leaveTypeId: input.leaveTypeId,
          leaveBalanceId: balId,
          transactionType: debitAsUsage ? 'ADJUSTMENT' : 'ADJUSTMENT',
          quantity: String(delta.toFixed(2)),
          referenceType: input.adjustmentType === 'SET_OPENING' ? 'MANUAL_OPENING_BALANCE_SET' : debitAsUsage ? 'MANUAL_CL_CONSUMPTION' : 'MANUAL_ADJUSTMENT',
          referenceId: `ADJ_${Date.now()}`,
          remarks: remarkText,
          createdBy: actor.userId || null,
        });

        await AuditService.logEvent({
          actorId: actor.userId || null,
          actorRole: actor.role,
          action: 'LEAVE_BALANCE_ADJUSTED',
          targetEntity: 'leave_balances',
          targetId: String(balId),
          metadata: {
            employeeId: numericEmpId,
            employeeCode: resolvedEmp?.employeeCode ?? null,
            leaveTypeId: input.leaveTypeId,
            year: input.year,
            adjustmentType: input.adjustmentType,
            quantity: qty,
            delta,
            remarks: remarkText,
            updatedBy: actor.username,
          },
        });

        const allTypes = await this.getLeaveTypes({ includeInactive: true });
        const lt = allTypes.find((t) => t.id === input.leaveTypeId);
        return this.enrichLeaveBalanceDto({
          ...updatedRow,
          leaveTypeCode: lt?.code,
          leaveTypeName: lt?.name,
        });
      }
    }

    // Memory store
    let memBal = memoryLeaveBalances.find(
      (b) =>
        b.employeeId === numericEmpId &&
        b.leaveTypeId === input.leaveTypeId &&
        b.year === input.year
    );

    if (!memBal) {
      if (delta < 0 && input.adjustmentType !== 'SET_OPENING') {
        throw new ValidationError('Cannot deduct from an uninitialized balance record (0 Days).');
      }
      const lt = memoryLeaveTypes.find((t) => t.id === input.leaveTypeId);
      memBal = this.enrichLeaveBalanceDto({
        id: nextBalanceId++,
        employeeId: numericEmpId,
        leaveTypeId: input.leaveTypeId,
        leaveTypeCode: lt?.code,
        leaveTypeName: lt?.name,
        openingBalance: (input.adjustmentType === 'SET_OPENING' ? qty : 0).toFixed(2),
        allocated: (input.adjustmentType === 'SET_OPENING' ? 0 : delta).toFixed(2),
        carryForward: '0.00',
        adjustments: (input.adjustmentType === 'SET_OPENING' ? 0 : delta).toFixed(2),
        used: '0.00',
        reserved: '0.00',
        available: (input.adjustmentType === 'SET_OPENING' ? qty : delta).toFixed(2),
        year: input.year,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      memoryLeaveBalances.push(memBal);
    } else {
      const oldAlloc = Number(memBal.allocated || 0);
      const oldOpening = Number(memBal.openingBalance || 0);
      const oldUsed = Number(memBal.used || 0);
      if (input.adjustmentType === 'SET') delta = qty - oldAlloc;
      if (input.adjustmentType === 'SET_OPENING') delta = qty - oldOpening;
      const newOpening = input.adjustmentType === 'SET_OPENING' ? qty : oldOpening;
      const newAlloc = debitAsUsage ? oldAlloc : input.adjustmentType === 'SET' ? qty : oldAlloc + delta;
      const newUsed = debitAsUsage ? oldUsed + qty : oldUsed;
      const newAdj = debitAsUsage ? Number(memBal.adjustments || 0) : Number(memBal.adjustments || 0) + delta;
      const newEntitlement = Number(memBal.openingBalance || 0) + newAlloc + Number(memBal.carryForward || 0);
      if (debitAsUsage && newUsed + Number(memBal.reserved || 0) > newEntitlement) {
        throw new ValidationError('CL debit exceeds the employee’s remaining balance.');
      }
      const newAvail =
        newOpening +
        newAlloc +
        Number(memBal.carryForward || 0) -
        newUsed -
        Number(memBal.reserved || 0);

      if (newAvail < 0) {
        throw new ValidationError(
          `Adjustment would cause a negative balance (${newAvail.toFixed(2)} Days). Negative balances are not permitted.`
        );
      }

      memBal.openingBalance = newOpening.toFixed(2);
      memBal.allocated = newAlloc.toFixed(2);
      memBal.used = newUsed.toFixed(2);
      memBal.adjustments = newAdj.toFixed(2);
      memBal.available = newAvail.toFixed(2);
      memBal.updatedAt = new Date().toISOString();
    }

    memoryTransactions.push({
      id: nextTxId++,
      employeeId: numericEmpId,
      leaveTypeId: input.leaveTypeId,
      leaveBalanceId: memBal.id,
      transactionType: 'ADJUSTMENT',
      quantity: delta.toFixed(2),
      referenceType: input.adjustmentType === 'SET_OPENING' ? 'MANUAL_OPENING_BALANCE_SET' : debitAsUsage ? 'MANUAL_CL_CONSUMPTION' : 'MANUAL_ADJUSTMENT',
      referenceId: `ADJ_${Date.now()}`,
      remarks: remarkText,
      createdBy: actor.userId || null,
      createdAt: new Date().toISOString(),
    });

    await AuditService.logEvent({
      actorId: actor.userId || null,
      actorRole: actor.role,
      action: 'LEAVE_BALANCE_ADJUSTED',
      targetEntity: 'leave_balances',
      targetId: String(memBal.id),
      metadata: {
        employeeId: numericEmpId,
        employeeCode: resolvedEmp?.employeeCode ?? null,
        leaveTypeId: input.leaveTypeId,
        year: input.year,
        adjustmentType: input.adjustmentType,
        quantity: qty,
        delta,
        remarks: remarkText,
        updatedBy: actor.username,
      },
    });

    return this.enrichLeaveBalanceDto(memBal);
  }

  /**
   * Super Admin deletion of leave balance records (dependency-safe)
   */
  public static async deleteLeaveBalance(
    id: number,
    actor: AuthContext,
    force?: boolean
  ): Promise<{ success: boolean; message: string }> {
    if (actor.role !== 'SUPER_ADMIN') {
      throw new Error('Forbidden: Only Super Admin can delete leave balance records');
    }

    if (isDbConfigured()) {
      const db = getDb();
      if (db) {
        const rows = await db.select().from(leaveBalances).where(eq(leaveBalances.id, id));
        if (rows.length === 0) {
          throw new ValidationError(`Leave balance record #${id} not found`);
        }
        const bal = rows[0];

        // Dependency check: Are there approved leave requests for this employee, leave type and year?
        const depRequests = await db
          .select()
          .from(leaveRequests)
          .where(
            and(
              eq(leaveRequests.employeeId, bal.employeeId),
              eq(leaveRequests.leaveTypeId, bal.leaveTypeId),
              eq(leaveRequests.status, 'APPROVED')
            )
          );

        if (depRequests.length > 0 && !force) {
          throw new ValidationError(
            `Cannot delete leave balance #${id}: Employee has ${depRequests.length} approved leave request(s) linked to this balance. Administrative confirmation is required to proceed.`,
            { isDependencyError: true, depRequestsCount: String(depRequests.length) }
          );
        }

        if (force) {
          try {
            await db
              .delete(leaveRequests)
              .where(
                and(
                  eq(leaveRequests.employeeId, bal.employeeId),
                  eq(leaveRequests.leaveTypeId, bal.leaveTypeId)
                )
              );
          } catch {}
        }

        // Delete child transactions
        await db
          .delete(leaveBalanceTransactions)
          .where(eq(leaveBalanceTransactions.leaveBalanceId, id));

        // Delete balance
        await db.delete(leaveBalances).where(eq(leaveBalances.id, id));

        await AuditService.logEvent({
          actorId: actor.userId || null,
          actorRole: actor.role,
          action: 'LEAVE_BALANCE_DELETED',
          targetEntity: 'leave_balances',
          targetId: String(id),
          metadata: {
            employeeId: bal.employeeId,
            leaveTypeId: bal.leaveTypeId,
            year: bal.year,
            allocated: bal.allocated,
            used: bal.used,
            forced: Boolean(force),
            deletedBy: actor.username,
          },
        });

        return { success: true, message: `Leave balance #${id} deleted successfully.` };
      }
    }

    const idx = memoryLeaveBalances.findIndex((b) => b.id === id);
    if (idx === -1) {
      throw new ValidationError(`Leave balance record #${id} not found`);
    }
    const memBal = memoryLeaveBalances[idx];

    memoryTransactions = memoryTransactions.filter((tx) => tx.leaveBalanceId !== id);
    memoryLeaveBalances.splice(idx, 1);

    await AuditService.logEvent({
      actorId: actor.userId || null,
      actorRole: actor.role,
      action: 'LEAVE_BALANCE_DELETED',
      targetEntity: 'leave_balances',
      targetId: String(id),
      metadata: {
        employeeId: memBal.employeeId,
        leaveTypeId: memBal.leaveTypeId,
        year: memBal.year,
        deletedBy: actor.username,
      },
    });

    return { success: true, message: `Leave balance #${id} deleted successfully.` };
  }

  /**
   * Super Admin deletion of leave balance transaction records
   */
  public static async deleteLeaveBalanceTransaction(
    id: number,
    actor: AuthContext
  ): Promise<{ success: boolean; message: string }> {
    if (actor.role !== 'SUPER_ADMIN') {
      throw new Error('Forbidden: Only Super Admin can delete leave balance transactions');
    }

    if (isDbConfigured()) {
      const db = getDb();
      if (db) {
        const rows = await db.select().from(leaveBalanceTransactions).where(eq(leaveBalanceTransactions.id, id));
        if (rows.length === 0) {
          throw new ValidationError(`Transaction #${id} not found`);
        }
        const tx = rows[0];

        // If it was an adjustment, revert it from the balance
        if (tx.transactionType === 'ADJUSTMENT' && tx.leaveBalanceId) {
          const balRows = await db.select().from(leaveBalances).where(eq(leaveBalances.id, tx.leaveBalanceId));
          if (balRows.length > 0) {
            const bal = balRows[0];
            const qty = Number(tx.quantity || 0);
            const newAdj = Number(bal.adjustments || 0) - qty;
            const newAlloc = Number(bal.allocated || 0) - qty;
            const newAvail = Number(bal.available || 0) - qty;
            await db
              .update(leaveBalances)
              .set({
                allocated: String(newAlloc.toFixed(2)),
                adjustments: String(newAdj.toFixed(2)),
                available: String(newAvail.toFixed(2)),
                updatedAt: new Date(),
              })
              .where(eq(leaveBalances.id, bal.id));
          }
        }

        await db.delete(leaveBalanceTransactions).where(eq(leaveBalanceTransactions.id, id));

        await AuditService.logEvent({
          actorId: actor.userId || null,
          actorRole: actor.role,
          action: 'LEAVE_BALANCE_TRANSACTION_DELETED',
          targetEntity: 'leave_balance_transactions',
          targetId: String(id),
          metadata: {
            employeeId: tx.employeeId,
            leaveBalanceId: tx.leaveBalanceId,
            transactionType: tx.transactionType,
            quantity: tx.quantity,
            deletedBy: actor.username,
          },
        });

        return { success: true, message: `Transaction #${id} deleted successfully.` };
      }
    }

    const idx = memoryTransactions.findIndex((t) => t.id === id);
    if (idx === -1) {
      throw new ValidationError(`Transaction #${id} not found`);
    }
    const memTx = memoryTransactions[idx];

    if (memTx.transactionType === 'ADJUSTMENT' && memTx.leaveBalanceId) {
      const memBal = memoryLeaveBalances.find((b) => b.id === memTx.leaveBalanceId);
      if (memBal) {
        const qty = Number(memTx.quantity || 0);
        memBal.allocated = (Number(memBal.allocated || 0) - qty).toFixed(2);
        memBal.adjustments = (Number(memBal.adjustments || 0) - qty).toFixed(2);
        memBal.available = (Number(memBal.available || 0) - qty).toFixed(2);
      }
    }

    memoryTransactions.splice(idx, 1);

    await AuditService.logEvent({
      actorId: actor.userId || null,
      actorRole: actor.role,
      action: 'LEAVE_BALANCE_TRANSACTION_DELETED',
      targetEntity: 'leave_balance_transactions',
      targetId: String(id),
      metadata: {
        employeeId: memTx.employeeId,
        leaveBalanceId: memTx.leaveBalanceId,
        quantity: memTx.quantity,
        deletedBy: actor.username,
      },
    });

    return { success: true, message: `Transaction #${id} deleted successfully.` };
  }

  // ==========================================
  // LEAVE BALANCE TRANSACTIONS
  // ==========================================

  public static async getLeaveBalanceTransactions(
    filter: { employeeId?: number | string; leaveBalanceId?: number } = {},
    actor?: AuthContext
  ): Promise<LeaveBalanceTransactionDto[]> {
    const resolvedFilterEmp =
      filter.employeeId !== undefined && filter.employeeId !== null && String(filter.employeeId).trim() !== ''
        ? UserService.resolveEmployeeRecordSync(filter.employeeId)
        : null;
    let targetEmployeeId =
      resolvedFilterEmp?.employeeId ??
      (filter.employeeId !== undefined && !isNaN(Number(filter.employeeId))
        ? Number(filter.employeeId)
        : undefined);

    if (actor && actor.role === 'EMPLOYEE') {
      const actorEmpRec =
        (actor.employeeId ? UserService.resolveEmployeeRecordSync(actor.employeeId) : null) ||
        (actor.employeeCode ? UserService.resolveEmployeeRecordSync(actor.employeeCode) : null) ||
        (actor.userId ? UserService.getMemoryUserRecordById(actor.userId) : null);
      const selfEmpId = actorEmpRec?.employeeId ?? actor.employeeId ?? 101;
      if (targetEmployeeId && targetEmployeeId !== selfEmpId) {
        throw new Error('Forbidden: Employees can only view their own transactions');
      }
      targetEmployeeId = selfEmpId;
    }

    if (isDbConfigured()) {
      const db = getDb();
      if (db) {
        let results = await db.select().from(leaveBalanceTransactions);
        if (targetEmployeeId) {
          results = results.filter((tx) => tx.employeeId === targetEmployeeId);
        }
        if (filter.leaveBalanceId) {
          results = results.filter((tx) => tx.leaveBalanceId === filter.leaveBalanceId);
        }
        return results as any;
      }
    }

    let list = [...memoryTransactions];
    if (targetEmployeeId) {
      list = list.filter((tx) => tx.employeeId === targetEmployeeId);
    }
    if (filter.leaveBalanceId) {
      list = list.filter((tx) => tx.leaveBalanceId === filter.leaveBalanceId);
    }
    return list;
  }

  /**
   * Deducts approved leave days from the employee's balance and records transaction
   */
  public static async deductApprovedLeave(
    employeeId: number,
    leaveTypeId: number,
    year: number,
    days: number | string,
    leaveRequestId: number,
    actorId?: number | null,
    dbClient?: any
  ): Promise<void> {
    const qty = Number(days);
    if (isNaN(qty) || qty <= 0) return;

    if (isDbConfigured()) {
      const db = dbClient || getDb();
      if (db) {
        const rows = await db
          .select()
          .from(leaveBalances)
          .where(
            and(
              eq(leaveBalances.employeeId, employeeId),
              eq(leaveBalances.leaveTypeId, leaveTypeId),
              eq(leaveBalances.year, year)
            )
          );

        if (rows.length > 0) {
          const row = rows[0];
          const newUsed = Number(row.used || 0) + qty;
          const newAvail =
            Number(row.openingBalance || 0) +
            Number(row.allocated || 0) +
            Number(row.carryForward || 0) +
            Number(row.adjustments || 0) -
            newUsed -
            Number(row.reserved || 0);

          await db
            .update(leaveBalances)
            .set({
              used: String(newUsed.toFixed(2)),
              available: String(newAvail.toFixed(2)),
              updatedAt: new Date(),
            })
            .where(eq(leaveBalances.id, row.id));

          await db.insert(leaveBalanceTransactions).values({
            employeeId,
            leaveTypeId,
            leaveBalanceId: row.id,
            transactionType: 'USED',
            quantity: String(qty.toFixed(2)),
            referenceType: 'LEAVE_REQUEST',
            referenceId: String(leaveRequestId),
            remarks: 'Leave approved by Top Management and posted to balance',
            createdBy: actorId || null,
          });
          return;
        } else {
          // If no balance row exists yet, initialize it gracefully
          const inserted = await db
            .insert(leaveBalances)
            .values({
              employeeId,
              leaveTypeId,
              year,
              openingBalance: '0.00',
              allocated: '0.00',
              carryForward: '0.00',
              adjustments: '0.00',
              used: String(qty.toFixed(2)),
              reserved: '0.00',
              available: String((-qty).toFixed(2)),
            })
            .returning();

          if (inserted.length > 0) {
            await db.insert(leaveBalanceTransactions).values({
              employeeId,
              leaveTypeId,
              leaveBalanceId: inserted[0].id,
              transactionType: 'USED',
              quantity: String(qty.toFixed(2)),
              referenceType: 'LEAVE_REQUEST',
              referenceId: String(leaveRequestId),
              remarks: 'Leave approved by Top Management and posted to balance',
              createdBy: actorId || null,
            });
          }
          return;
        }
      }
    }

    // Memory store fallback
    let memBal = memoryLeaveBalances.find(
      (b) => b.employeeId === employeeId && b.leaveTypeId === leaveTypeId && b.year === year
    );
    if (!memBal) {
      const lt = memoryLeaveTypes.find((t) => t.id === leaveTypeId);
      memBal = {
        id: nextBalanceId++,
        employeeId,
        leaveTypeId,
        leaveTypeCode: lt?.code,
        leaveTypeName: lt?.name,
        openingBalance: '0.00',
        allocated: '0.00',
        carryForward: '0.00',
        adjustments: '0.00',
        used: '0.00',
        reserved: '0.00',
        available: '0.00',
        year,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      memoryLeaveBalances.push(memBal);
    }

    const newUsed = Number(memBal.used || 0) + qty;
    const newAvail =
      Number(memBal.openingBalance || 0) +
      Number(memBal.allocated || 0) +
      Number(memBal.carryForward || 0) +
      Number(memBal.adjustments || 0) -
      newUsed -
      Number(memBal.reserved || 0);

    memBal.used = newUsed.toFixed(2);
    memBal.available = newAvail.toFixed(2);
    memBal.updatedAt = new Date().toISOString();

    memoryTransactions.push({
      id: nextTxId++,
      employeeId,
      leaveTypeId,
      leaveBalanceId: memBal.id,
      transactionType: 'USED',
      quantity: qty.toFixed(2),
      referenceType: 'LEAVE_REQUEST',
      referenceId: String(leaveRequestId),
      remarks: 'Leave approved by Top Management and posted to balance',
      createdBy: actorId || null,
      createdAt: new Date().toISOString(),
    });
  }

  /**
   * Reverts approved leave days when an approved request is administratively deleted
   */
  public static async revertApprovedLeave(
    employeeId: number,
    leaveTypeId: number,
    year: number,
    days: number | string,
    leaveRequestId: number,
    actorId?: number | null,
    dbClient?: any
  ): Promise<void> {
    const qty = Number(days);
    if (isNaN(qty) || qty <= 0) return;

    if (isDbConfigured()) {
      const db = dbClient || getDb();
      if (db) {
        const rows = await db
          .select()
          .from(leaveBalances)
          .where(
            and(
              eq(leaveBalances.employeeId, employeeId),
              eq(leaveBalances.leaveTypeId, leaveTypeId),
              eq(leaveBalances.year, year)
            )
          );

        if (rows.length > 0) {
          const row = rows[0];
          const newUsed = Math.max(0, Number(row.used || 0) - qty);
          const newAvail =
            Number(row.openingBalance || 0) +
            Number(row.allocated || 0) +
            Number(row.carryForward || 0) +
            Number(row.adjustments || 0) -
            newUsed -
            Number(row.reserved || 0);

          await db
            .update(leaveBalances)
            .set({
              used: String(newUsed.toFixed(2)),
              available: String(newAvail.toFixed(2)),
              updatedAt: new Date(),
            })
            .where(eq(leaveBalances.id, row.id));

          await db.insert(leaveBalanceTransactions).values({
            employeeId,
            leaveTypeId,
            leaveBalanceId: row.id,
            transactionType: 'REVERSAL',
            quantity: String(qty.toFixed(2)),
            referenceType: 'LEAVE_REQUEST_DELETED',
            referenceId: String(leaveRequestId),
            remarks: 'Reversal due to administrative deletion of leave request',
            createdBy: actorId || null,
          });
          return;
        }
      }
    }

    // Memory store fallback
    const memBal = memoryLeaveBalances.find(
      (b) => b.employeeId === employeeId && b.leaveTypeId === leaveTypeId && b.year === year
    );
    if (memBal) {
      const newUsed = Math.max(0, Number(memBal.used || 0) - qty);
      const newAvail =
        Number(memBal.openingBalance || 0) +
        Number(memBal.allocated || 0) +
        Number(memBal.carryForward || 0) +
        Number(memBal.adjustments || 0) -
        newUsed -
        Number(memBal.reserved || 0);

      memBal.used = newUsed.toFixed(2);
      memBal.available = newAvail.toFixed(2);
      memBal.updatedAt = new Date().toISOString();

      memoryTransactions.push({
        id: nextTxId++,
        employeeId,
        leaveTypeId,
        leaveBalanceId: memBal.id,
        transactionType: 'REVERSAL',
        quantity: qty.toFixed(2),
        referenceType: 'LEAVE_REQUEST_DELETED',
        referenceId: String(leaveRequestId),
        remarks: 'Reversal due to administrative deletion of leave request',
        createdBy: actorId || null,
        createdAt: new Date().toISOString(),
      });
    }
  }
}
