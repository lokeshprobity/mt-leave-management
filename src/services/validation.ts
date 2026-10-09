import { CreateLeavePolicyInput, CreateLeaveTypeInput, UpdateLeavePolicyInput, UpdateLeaveTypeInput } from '../types/leave.ts';

export class ValidationError extends Error {
  public fieldErrors: Record<string, string>;

  constructor(message: string, fieldErrors: Record<string, string> = {}) {
    super(message);
    this.name = 'ValidationError';
    this.fieldErrors = fieldErrors;
  }
}

/**
 * Validates Leave Type inputs
 */
export function validateLeaveType(
  input: CreateLeaveTypeInput | UpdateLeaveTypeInput,
  isUpdate = false
): void {
  const errors: Record<string, string> = {};

  if (!isUpdate) {
    const createInput = input as CreateLeaveTypeInput;
    if (!createInput.code || typeof createInput.code !== 'string' || !createInput.code.trim()) {
      errors.code = 'Leave type code is required';
    } else {
      const trimmed = createInput.code.trim().toUpperCase();
      if (!/^[A-Z0-9_-]{2,20}$/.test(trimmed)) {
        errors.code =
          'Leave type code must be 2 to 20 alphanumeric characters or underscores (e.g. CL, SL, EL)';
      }
    }
  }

  if (isUpdate) {
    const updateInput = input as UpdateLeaveTypeInput;
    if (updateInput.name !== undefined && (!updateInput.name || !updateInput.name.trim())) {
      errors.name = 'Leave type name cannot be empty';
    }
    if (updateInput.displayOrder !== undefined && updateInput.displayOrder < 0) {
      errors.displayOrder = 'Display order cannot be negative';
    }
  } else {
    const createInput = input as CreateLeaveTypeInput;
    if (!createInput.name || typeof createInput.name !== 'string' || !createInput.name.trim()) {
      errors.name = 'Leave type name is required';
    }
    if (createInput.displayOrder !== undefined && createInput.displayOrder < 0) {
      errors.displayOrder = 'Display order cannot be negative';
    }
  }

  if (Object.keys(errors).length > 0) {
    throw new ValidationError('Validation failed for leave type', errors);
  }
}

/**
 * Validates Leave Policy inputs
 */
export function validateLeavePolicy(
  input: CreateLeavePolicyInput | UpdateLeavePolicyInput,
  isUpdate = false
): void {
  const errors: Record<string, string> = {};

  if (!isUpdate) {
    const createInput = input as CreateLeavePolicyInput;
    if (!createInput.leaveTypeId || isNaN(Number(createInput.leaveTypeId))) {
      errors.leaveTypeId = 'Valid leave type ID is required';
    }
    if (!createInput.policyName || typeof createInput.policyName !== 'string' || !createInput.policyName.trim()) {
      errors.policyName = 'Policy name is required';
    }
  }

  // Annual Allocation Check
  if (input.annualAllocation !== undefined) {
    const alloc = Number(input.annualAllocation);
    if (isNaN(alloc) || alloc < 0) {
      errors.annualAllocation = 'Annual allocation cannot be negative';
    }
  }

  // Carry Forward Limit Check
  if (input.carryForwardLimit !== undefined) {
    const limit = Number(input.carryForwardLimit);
    if (isNaN(limit) || limit < 0) {
      errors.carryForwardLimit = 'Carry-forward limit cannot be negative';
    }
  }

  // Maximum Consecutive Days Check
  if (input.maximumConsecutiveDays !== undefined) {
    const maxDays = Number(input.maximumConsecutiveDays);
    if (isNaN(maxDays) || maxDays < 0) {
      errors.maximumConsecutiveDays = 'Maximum consecutive days cannot be negative';
    }
  }

  // Minimum Notice Days Check
  if (input.minimumNoticeDays !== undefined) {
    const minNotice = Number(input.minimumNoticeDays);
    if (isNaN(minNotice) || minNotice < 0) {
      errors.minimumNoticeDays = 'Minimum notice days cannot be negative';
    }
  }

  // Effective Date Range Validation
  const effectiveFrom = input.effectiveFrom ? new Date(input.effectiveFrom) : null;
  const effectiveTo = input.effectiveTo ? new Date(input.effectiveTo) : null;

  if (effectiveFrom && isNaN(effectiveFrom.getTime())) {
    errors.effectiveFrom = 'Invalid effective from date format';
  }
  if (effectiveTo && isNaN(effectiveTo.getTime())) {
    errors.effectiveTo = 'Invalid effective to date format';
  }
  if (effectiveFrom && effectiveTo && effectiveFrom.getTime() > effectiveTo.getTime()) {
    errors.effectiveDateRange = 'Effective from date must be earlier than or equal to effective to date';
  }

  if (Object.keys(errors).length > 0) {
    throw new ValidationError('Validation failed for leave policy', errors);
  }
}

/**
 * Validates Leave Balance inputs
 */
export function validateLeaveBalance(input: {
  employeeId: number;
  leaveTypeId: number;
  year: number;
  openingBalance?: number | string;
  allocated?: number | string;
  carryForward?: number | string;
  adjustments?: number | string;
  used?: number | string;
  reserved?: number | string;
  available?: number | string;
  allowNegativeBalance?: boolean;
}): void {
  const errors: Record<string, string> = {};

  if (!input.employeeId || isNaN(Number(input.employeeId))) {
    errors.employeeId = 'Valid employee ID is required';
  }
  if (!input.leaveTypeId || isNaN(Number(input.leaveTypeId))) {
    errors.leaveTypeId = 'Valid leave type ID is required';
  }
  if (!input.year || isNaN(Number(input.year)) || input.year < 2000 || input.year > 2100) {
    errors.year = 'Valid 4-digit year is required (2000-2100)';
  }

  const checkNonNegative = (val: number | string | undefined, fieldName: string) => {
    if (val !== undefined) {
      const num = Number(val);
      if (isNaN(num)) {
        errors[fieldName] = `${fieldName} must be a valid number`;
      } else if (num < 0 && !input.allowNegativeBalance) {
        errors[fieldName] = `${fieldName} cannot be negative unless negative balance is explicitly allowed by policy`;
      }
    }
  };

  checkNonNegative(input.openingBalance, 'openingBalance');
  checkNonNegative(input.allocated, 'allocated');
  checkNonNegative(input.carryForward, 'carryForward');
  checkNonNegative(input.used, 'used');
  checkNonNegative(input.reserved, 'reserved');

  if (Object.keys(errors).length > 0) {
    throw new ValidationError('Validation failed for leave balance', errors);
  }
}
