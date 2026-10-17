import { relations } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

/**
 * 1. roles
 * System access roles: EMPLOYEE, HR, TOP_MANAGEMENT, SUPER_ADMIN
 */
export const roles = pgTable(
  'roles',
  {
    id: serial('id').primaryKey(),
    name: text('name').notNull().unique(),
    code: text('code'),
    displayName: text('display_name'),
    description: text('description'),
    permissions: jsonb('permissions').$type<string[]>().default([]).notNull(),
    isSystem: boolean('is_system').default(false).notNull(),
    isActive: boolean('is_active').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('roles_name_idx').on(table.name),
  ]
);

/**
 * 2. users
 * System authentication accounts
 */
export const users = pgTable(
  'users',
  {
    id: serial('id').primaryKey(),
    username: text('username').notNull().unique(),
    email: text('email').notNull().unique(),
    passwordHash: text('password_hash').notNull(),
    roleId: integer('role_id')
      .references(() => roles.id, { onDelete: 'restrict' })
      .notNull(),
    operationalRole: text('operational_role'),
    mustChangePassword: boolean('must_change_password').default(false).notNull(),
    profilePhoto: jsonb('profile_photo').$type<Record<string, any> | null>(),
    credentialEmail: jsonb('credential_email').$type<Record<string, any> | null>(),
    isActive: boolean('is_active').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('users_username_idx').on(table.username),
    uniqueIndex('users_email_idx').on(table.email),
    index('users_role_id_idx').on(table.roleId),
  ]
);

/**
 * 3. departments
 * Organization departments (e.g. Engineering, Sales, Operations)
 */
export const departments = pgTable(
  'departments',
  {
    id: serial('id').primaryKey(),
    name: text('name').notNull(),
    code: text('code').notNull().unique(),
    description: text('description'),
    headEmployeeId: integer('head_employee_id'),
    isActive: boolean('is_active').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('departments_code_idx').on(table.code),
    index('departments_is_active_idx').on(table.isActive),
  ]
);

/**
 * 4. designations
 * Organization job designations / titles
 */
export const designations = pgTable(
  'designations',
  {
    id: serial('id').primaryKey(),
    name: text('name').notNull(),
    code: text('code').notNull().unique(),
    description: text('description'),
    isActive: boolean('is_active').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('designations_code_idx').on(table.code),
    index('designations_is_active_idx').on(table.isActive),
  ]
);

/**
 * 4b. branches
 * Organization office branches / locations
 */
export const branches = pgTable(
  'branches',
  {
    id: serial('id').primaryKey(),
    name: text('name').notNull(),
    code: text('code').notNull().unique(),
    description: text('description'),
    address: text('address'),
    city: text('city'),
    state: text('state'),
    pincode: text('pincode'),
    country: text('country').default('India'),
    contactNumber: text('contact_number'),
    contactEmail: text('contact_email'),
    contactPerson: text('contact_person'),
    isActive: boolean('is_active').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('branches_code_idx').on(table.code),
    index('branches_is_active_idx').on(table.isActive),
  ]
);

/**
 * 5. employees
 * Master employee profiles linked to organization structure and user account
 */
export const employees = pgTable(
  'employees',
  {
    id: serial('id').primaryKey(),
    employeeCode: text('employee_code').notNull().unique(),
    employeeName: text('employee_name').notNull(),
    officialEmail: text('official_email').notNull().unique(),
    mobile: text('mobile'),
    departmentId: integer('department_id')
      .references(() => departments.id, { onDelete: 'set null' }),
    designationId: integer('designation_id')
      .references(() => designations.id, { onDelete: 'set null' }),
    joiningDate: timestamp('joining_date', { withTimezone: true }),
    reportingManagerId: integer('reporting_manager_id')
      .references((): any => employees.id, { onDelete: 'set null' }),
    employmentType: text('employment_type').default('FULL_TIME').notNull(),
    employmentStatus: text('employment_status').default('ACTIVE').notNull(),
    officeLocation: text('office_location'),
    remarks: text('remarks'),
    hrApprovalRequired: boolean('hr_approval_required').default(true).notNull(),
    userId: integer('user_id')
      .references(() => users.id, { onDelete: 'set null' })
      .unique(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('employees_code_idx').on(table.employeeCode),
    uniqueIndex('employees_email_idx').on(table.officialEmail),
    index('employees_dept_idx').on(table.departmentId),
    index('employees_desig_idx').on(table.designationId),
    index('employees_user_idx').on(table.userId),
    index('employees_status_idx').on(table.employmentStatus),
  ]
);

/**
 * 6. system_settings
 * Configurable system settings (e.g., office timings, cutoffs, timezone)
 */
export const systemSettings = pgTable(
  'system_settings',
  {
    id: serial('id').primaryKey(),
    settingKey: text('setting_key').notNull().unique(),
    settingValue: text('setting_value').notNull(),
    description: text('description'),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('system_settings_key_idx').on(table.settingKey),
  ]
);

// Relationships
export const rolesRelations = relations(roles, ({ many }) => ({
  users: many(users),
}));

export const usersRelations = relations(users, ({ one }) => ({
  role: one(roles, {
    fields: [users.roleId],
    references: [roles.id],
  }),
  employee: one(employees, {
    fields: [users.id],
    references: [employees.userId],
  }),
}));

export const departmentsRelations = relations(departments, ({ many }) => ({
  employees: many(employees),
}));

export const designationsRelations = relations(designations, ({ many }) => ({
  employees: many(employees),
}));

export const employeesRelations = relations(employees, ({ one }) => ({
  user: one(users, {
    fields: [employees.userId],
    references: [users.id],
  }),
  department: one(departments, {
    fields: [employees.departmentId],
    references: [departments.id],
  }),
  designation: one(designations, {
    fields: [employees.designationId],
    references: [designations.id],
  }),
}));

/**
 * 7. leave_types
 * Master definitions of leave categories (e.g. CL, SL, EL, EMERGENCY, LWP)
 */
export const leaveTypes = pgTable(
  'leave_types',
  {
    id: serial('id').primaryKey(),
    code: text('code').notNull().unique(),
    name: text('name').notNull(),
    description: text('description'),
    isPaid: boolean('is_paid').default(true).notNull(),
    requiresDocument: boolean('requires_document').default(false).notNull(),
    supportsHalfDay: boolean('supports_half_day').default(true).notNull(),
    isActive: boolean('is_active').default(true).notNull(),
    displayOrder: integer('display_order').default(0).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('leave_types_code_idx').on(table.code),
    index('leave_types_is_active_idx').on(table.isActive),
    index('leave_types_display_order_idx').on(table.displayOrder),
  ]
);

/**
 * 8. leave_policies
 * Configurable rule sets for each leave type
 */
export const leavePolicies = pgTable(
  'leave_policies',
  {
    id: serial('id').primaryKey(),
    leaveTypeId: integer('leave_type_id')
      .references(() => leaveTypes.id, { onDelete: 'cascade' })
      .notNull(),
    policyName: text('policy_name').notNull(),
    annualAllocation: numeric('annual_allocation', { precision: 6, scale: 2 })
      .default('0.00')
      .notNull(),
    allocationFrequency: text('allocation_frequency').default('ANNUAL').notNull(),
    carryForwardAllowed: boolean('carry_forward_allowed').default(false).notNull(),
    carryForwardLimit: numeric('carry_forward_limit', { precision: 6, scale: 2 })
      .default('0.00')
      .notNull(),
    expiryEnabled: boolean('expiry_enabled').default(false).notNull(),
    expiryPeriod: text('expiry_period'),
    maximumConsecutiveDays: integer('maximum_consecutive_days').default(0).notNull(),
    minimumNoticeDays: integer('minimum_notice_days').default(0).notNull(),
    sameDayAllowed: boolean('same_day_allowed').default(true).notNull(),
    lateRequestAllowed: boolean('late_request_allowed').default(false).notNull(),
    postStartRequestAllowed: boolean('post_start_request_allowed').default(false).notNull(),
    emergencyExceptionAllowed: boolean('emergency_exception_allowed').default(false).notNull(),
    negativeBalanceAllowed: boolean('negative_balance_allowed').default(false).notNull(),
    documentRequired: boolean('document_required').default(false).notNull(),
    documentRequiredAfterDays: integer('document_required_after_days'),
    description: text('description'),
    halfDayAllowed: boolean('half_day_allowed').default(true).notNull(),
    isActive: boolean('is_active').default(true).notNull(),
    effectiveFrom: timestamp('effective_from', { withTimezone: true }),
    effectiveTo: timestamp('effective_to', { withTimezone: true }),
    // Eligibility Foundation for future scoping:
    applicableDepartmentId: integer('applicable_department_id')
      .references(() => departments.id, { onDelete: 'set null' }),
    applicableDesignationId: integer('applicable_designation_id')
      .references(() => designations.id, { onDelete: 'set null' }),
    applicableEmploymentStatus: text('applicable_employment_status'),
    minServiceMonths: integer('min_service_months').default(0).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('leave_policies_leave_type_idx').on(table.leaveTypeId),
    index('leave_policies_is_active_idx').on(table.isActive),
    index('leave_policies_dept_idx').on(table.applicableDepartmentId),
    index('leave_policies_desig_idx').on(table.applicableDesignationId),
  ]
);

/**
 * 9. leave_balances
 * Employee leave balances per leave type per year
 */
export const leaveBalances = pgTable(
  'leave_balances',
  {
    id: serial('id').primaryKey(),
    employeeId: integer('employee_id')
      .references(() => employees.id, { onDelete: 'cascade' })
      .notNull(),
    leaveTypeId: integer('leave_type_id')
      .references(() => leaveTypes.id, { onDelete: 'restrict' })
      .notNull(),
    departmentId: integer('department_id')
      .references(() => departments.id, { onDelete: 'set null' }),
    departmentCode: text('department_code'),
    departmentName: text('department_name'),
    openingBalance: numeric('opening_balance', { precision: 6, scale: 2 })
      .default('0.00')
      .notNull(),
    allocated: numeric('allocated', { precision: 6, scale: 2 })
      .default('0.00')
      .notNull(),
    carryForward: numeric('carry_forward', { precision: 6, scale: 2 })
      .default('0.00')
      .notNull(),
    adjustments: numeric('adjustments', { precision: 6, scale: 2 })
      .default('0.00')
      .notNull(),
    used: numeric('used', { precision: 6, scale: 2 })
      .default('0.00')
      .notNull(),
    reserved: numeric('reserved', { precision: 6, scale: 2 })
      .default('0.00')
      .notNull(),
    available: numeric('available', { precision: 6, scale: 2 })
      .default('0.00')
      .notNull(),
    year: integer('year').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('employee_leave_type_year_idx').on(
      table.employeeId,
      table.leaveTypeId,
      table.year
    ),
    index('leave_balances_employee_idx').on(table.employeeId),
    index('leave_balances_leave_type_idx').on(table.leaveTypeId),
    index('leave_balances_dept_idx').on(table.departmentId),
    index('leave_balances_year_idx').on(table.year),
  ]
);

/**
 * 10. leave_balance_transactions
 * Immutable audit ledger of all balance movements and adjustments
 */
export const leaveBalanceTransactions = pgTable(
  'leave_balance_transactions',
  {
    id: serial('id').primaryKey(),
    employeeId: integer('employee_id')
      .references(() => employees.id, { onDelete: 'cascade' })
      .notNull(),
    leaveTypeId: integer('leave_type_id')
      .references(() => leaveTypes.id, { onDelete: 'restrict' })
      .notNull(),
    leaveBalanceId: integer('leave_balance_id')
      .references(() => leaveBalances.id, { onDelete: 'cascade' })
      .notNull(),
    leaveTypeCode: text('leave_type_code'),
    leaveTypeName: text('leave_type_name'),
    transactionType: text('transaction_type').notNull(), // 'OPENING', 'ALLOCATION', 'CARRY_FORWARD', 'ADJUSTMENT', 'USED', 'REVERSAL', 'RESERVATION', 'RESERVATION_RELEASE'
    quantity: numeric('quantity', { precision: 6, scale: 2 }).notNull(),
    referenceType: text('reference_type'),
    referenceId: text('reference_id'),
    remarks: text('remarks'),
    createdBy: integer('created_by')
      .references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('lbt_employee_idx').on(table.employeeId),
    index('lbt_leave_type_idx').on(table.leaveTypeId),
    index('lbt_balance_idx').on(table.leaveBalanceId),
    index('lbt_transaction_type_idx').on(table.transactionType),
    index('lbt_created_at_idx').on(table.createdAt),
  ]
);

/**
 * 11. holidays, holiday_lists & employee_holiday_assignments
 * Master list of official organization holidays (list-wise, department-wise, or company-wide)
 */
export const holidayLists = pgTable(
  'holiday_lists',
  {
    id: serial('id').primaryKey(),
    listCode: text('list_code').notNull().unique(),
    listName: text('list_name').notNull(),
    year: integer('year').default(2026).notNull(),
    departmentId: integer('department_id').references(() => departments.id, { onDelete: 'set null' }),
    isDefault: boolean('is_default').default(false).notNull(),
    isActive: boolean('is_active').default(true).notNull(),
    description: text('description'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('holiday_lists_code_idx').on(table.listCode),
    index('holiday_lists_year_idx').on(table.year),
  ]
);

export const employeeHolidayAssignments = pgTable(
  'employee_holiday_assignments',
  {
    id: serial('id').primaryKey(),
    employeeId: integer('employee_id')
      .references(() => employees.id, { onDelete: 'cascade' })
      .notNull(),
    holidayListId: integer('holiday_list_id')
      .references(() => holidayLists.id, { onDelete: 'restrict' })
      .notNull(),
    effectiveFrom: text('effective_from').notNull(), // 'YYYY-MM-DD'
    effectiveTo: text('effective_to'), // 'YYYY-MM-DD' or null
    assignedBy: integer('assigned_by').references(() => users.id, { onDelete: 'set null' }),
    remarks: text('remarks'),
    isActive: boolean('is_active').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('emp_holiday_assign_emp_idx').on(table.employeeId),
    index('emp_holiday_assign_list_idx').on(table.holidayListId),
    index('emp_holiday_assign_dates_idx').on(table.employeeId, table.effectiveFrom, table.effectiveTo),
  ]
);

export const holidays = pgTable(
  'holidays',
  {
    id: serial('id').primaryKey(),
    holidayDate: text('holiday_date').notNull(), // 'YYYY-MM-DD'
    holidayName: text('holiday_name').notNull(),
    description: text('description'),
    holidayListId: integer('holiday_list_id')
      .references(() => holidayLists.id, { onDelete: 'set null' }),
    departmentId: integer('department_id')
      .references(() => departments.id, { onDelete: 'cascade' }),
    departmentName: text('department_name'),
    isHalfDay: boolean('is_half_day').default(false).notNull(),
    isOptional: boolean('is_optional').default(false).notNull(),
    isActive: boolean('is_active').default(true).notNull(),
    year: integer('year').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('holidays_date_idx').on(table.holidayDate),
    index('holidays_dept_date_idx').on(table.departmentId, table.holidayDate),
    index('holidays_list_idx').on(table.holidayListId),
    index('holidays_year_idx').on(table.year),
    index('holidays_is_active_idx').on(table.isActive),
  ]
);

export const holidaysRelations = relations(holidays, ({ one }) => ({
  department: one(departments, {
    fields: [holidays.departmentId],
    references: [departments.id],
  }),
}));

/**
 * 12. leave_requests
 * Core employee leave applications
 */
export const leaveRequests = pgTable(
  'leave_requests',
  {
    id: serial('id').primaryKey(),
    requestNumber: text('request_number').notNull().unique(), // e.g. MTL-2026-000001
    employeeId: integer('employee_id')
      .references(() => employees.id, { onDelete: 'cascade' })
      .notNull(),
    leaveTypeId: integer('leave_type_id')
      .references(() => leaveTypes.id, { onDelete: 'restrict' })
      .notNull(),
    isPaid: boolean('is_paid').default(true).notNull(),
    startDate: text('start_date').notNull(), // 'YYYY-MM-DD'
    endDate: text('end_date').notNull(), // 'YYYY-MM-DD'
    totalDays: numeric('total_days', { precision: 6, scale: 2 }).notNull(),
    dayType: text('day_type').notNull(), // 'FULL_DAY' | 'HALF_DAY'
    halfDayPeriod: text('half_day_period'), // 'FIRST_HALF' | 'SECOND_HALF' | null
    reasonCategory: text('reason_category'), // 'MEDICAL_EMERGENCY' | 'FAMILY_EMERGENCY' | 'ACCIDENT_OR_TRAVEL_EMERGENCY' | 'OTHER'
    reason: text('reason').notNull(),
    requestClassification: text('request_classification').notNull(), // 'NORMAL_LEAVE_REQUEST' | 'LATE_LEAVE_REQUEST' | 'POST_START_LEAVE_REQUEST'
    applicationTimestamp: timestamp('application_timestamp', { withTimezone: true })
      .defaultNow()
      .notNull(),
    status: text('status').default('PENDING').notNull(), // 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED'
    applicantRole: text('applicant_role'),
    applicantOperationalRole: text('applicant_operational_role'),
    departmentId: integer('department_id')
      .references(() => departments.id, { onDelete: 'set null' }),
    departmentCode: text('department_code'),
    departmentName: text('department_name'),
    teamId: integer('team_id').references(() => departments.id, { onDelete: 'set null' }),
    teamName: text('team_name'),
    assignedTeamLeaderId: integer('assigned_team_leader_id').references(() => employees.id, { onDelete: 'set null' }),
    assignedTeamLeaderUserId: integer('assigned_team_leader_user_id').references(() => users.id, { onDelete: 'set null' }),
    assignedTeamLeaderName: text('assigned_team_leader_name'),
    teamLeaderResolutionSource: text('team_leader_resolution_source'),
    teamLeaderEffectiveFrom: text('team_leader_effective_from'),
    teamLeaderEffectiveTo: text('team_leader_effective_to'),
    teamLeaderPeriodLabel: text('team_leader_period_label'),
    teamLeaderDecision: text('team_leader_decision').default('PENDING').notNull(), // 'PENDING' | 'APPROVED' | 'REJECTED' | 'NOT_REQUIRED'
    teamLeaderDecidedBy: integer('team_leader_decided_by').references(() => users.id, { onDelete: 'set null' }),
    teamLeaderDecidedByName: text('team_leader_decided_by_name'),
    teamLeaderDecidedAt: timestamp('team_leader_decided_at', { withTimezone: true }),
    teamLeaderRemarks: text('team_leader_remarks'),
    hrDecision: text('hr_decision').default('PENDING').notNull(), // 'PENDING' | 'APPROVED' | 'REJECTED' | 'NOT_REQUIRED'
    hrDecidedBy: integer('hr_decided_by').references(() => users.id, { onDelete: 'set null' }),
    hrDecidedByName: text('hr_decided_by_name'),
    hrDecidedAt: timestamp('hr_decided_at', { withTimezone: true }),
    hrRemarks: text('hr_remarks'),
    managementDecision: text('management_decision').default('PENDING').notNull(), // 'PENDING' | 'APPROVED' | 'REJECTED'
    managementDecidedBy: integer('management_decided_by').references(() => users.id, { onDelete: 'set null' }),
    managementDecidedByName: text('management_decided_by_name'),
    managementDecidedAt: timestamp('management_decided_at', { withTimezone: true }),
    managementRemarks: text('management_remarks'),
    reportingManagerId: integer('reporting_manager_id')
      .references(() => employees.id, { onDelete: 'set null' }),
    reportingManagerUserId: integer('reporting_manager_user_id')
      .references(() => users.id, { onDelete: 'set null' }),
    reportingManagerName: text('reporting_manager_name'),
    currentApprovalStage: text('current_approval_stage')
      .default('STAGE_1_TEAM_LEADER')
      .notNull(),
    approvalStageLabel: text('approval_stage_label'),
    isEscalated: boolean('is_escalated').default(false).notNull(),
    escalationRequired: boolean('escalation_required').default(false).notNull(),
    escalationReason: text('escalation_reason'),
    autoEscalated: boolean('auto_escalated').default(false).notNull(),
    escalatedAt: timestamp('escalated_at', { withTimezone: true }),
    escalatedBy: integer('escalated_by')
      .references(() => users.id, { onDelete: 'set null' }),
    finalStatus: text('final_status').default('PENDING').notNull(), // 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED'
    balancePosted: boolean('balance_posted').default(false).notNull(),
    attachmentRequired: boolean('attachment_required').default(false).notNull(),
    attachmentPath: text('attachment_path'),
    attachmentName: text('attachment_name'),
    attachmentSize: integer('attachment_size'),
    attachmentMime: text('attachment_mime'),
    hasAttachment: boolean('has_attachment').default(false).notNull(),
    attachmentUrl: text('attachment_url'),
    cancellationReason: text('cancellation_reason'),
    cancellationTimestamp: timestamp('cancellation_timestamp', { withTimezone: true }),
    noticeMinutes: integer('notice_minutes'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('leave_requests_number_idx').on(table.requestNumber),
    index('leave_requests_employee_idx').on(table.employeeId),
    index('leave_requests_leave_type_idx').on(table.leaveTypeId),
    index('leave_requests_status_idx').on(table.status),
    index('leave_requests_team_leader_decision_idx').on(table.teamLeaderDecision),
    index('leave_requests_hr_decision_idx').on(table.hrDecision),
    index('leave_requests_management_decision_idx').on(table.managementDecision),
    index('leave_requests_final_status_idx').on(table.finalStatus),
    index('leave_requests_current_stage_idx').on(table.currentApprovalStage),
    index('leave_requests_dept_idx').on(table.departmentId),
    index('leave_requests_team_idx').on(table.teamId),
    index('leave_requests_assigned_tl_idx').on(table.assignedTeamLeaderId),
    index('leave_requests_escalation_idx').on(table.isEscalated),
    index('leave_requests_dates_idx').on(table.startDate, table.endDate),
    index('leave_requests_created_at_idx').on(table.createdAt),
  ]
);

/**
 * 13. leave_request_events
 * Immutable audit trail of leave request events and status modifications
 */
export const leaveRequestEvents = pgTable(
  'leave_request_events',
  {
    id: serial('id').primaryKey(),
    leaveRequestId: integer('leave_request_id')
      .references(() => leaveRequests.id, { onDelete: 'cascade' })
      .notNull(),
    eventType: text('event_type').notNull(), // 'SUBMITTED' | 'CANCELLED' | 'TEAM_LEADER_APPROVED' | 'TEAM_LEADER_REJECTED' | 'HR_APPROVED' | 'HR_REJECTED' | 'MANAGEMENT_APPROVED' | 'MANAGEMENT_REJECTED' | 'FINAL_STATUS_CHANGED'
    action: text('action'),
    previousDecision: text('previous_decision'),
    newDecision: text('new_decision'),
    previousStatus: text('previous_status'),
    newStatus: text('new_status'),
    actorId: integer('actor_id').references(() => users.id, { onDelete: 'set null' }),
    actorUserId: integer('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
    actorEmployeeCode: text('actor_employee_code'),
    actorRole: text('actor_role').notNull(),
    actorName: text('actor_name'),
    remarks: text('remarks'),
    comments: text('comments'),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('lre_request_id_idx').on(table.leaveRequestId),
    index('lre_event_type_idx').on(table.eventType),
    index('lre_actor_idx').on(table.actorId),
    index('lre_created_at_idx').on(table.createdAt),
  ]
);

// Relations for Leave Modules
export const leaveTypesRelations = relations(leaveTypes, ({ many }) => ({
  policies: many(leavePolicies),
  balances: many(leaveBalances),
  transactions: many(leaveBalanceTransactions),
  requests: many(leaveRequests),
}));

export const leavePoliciesRelations = relations(leavePolicies, ({ one }) => ({
  leaveType: one(leaveTypes, {
    fields: [leavePolicies.leaveTypeId],
    references: [leaveTypes.id],
  }),
  department: one(departments, {
    fields: [leavePolicies.applicableDepartmentId],
    references: [departments.id],
  }),
  designation: one(designations, {
    fields: [leavePolicies.applicableDesignationId],
    references: [designations.id],
  }),
}));

export const leaveBalancesRelations = relations(leaveBalances, ({ one, many }) => ({
  employee: one(employees, {
    fields: [leaveBalances.employeeId],
    references: [employees.id],
  }),
  leaveType: one(leaveTypes, {
    fields: [leaveBalances.leaveTypeId],
    references: [leaveTypes.id],
  }),
  department: one(departments, {
    fields: [leaveBalances.departmentId],
    references: [departments.id],
  }),
  transactions: many(leaveBalanceTransactions),
}));

export const leaveBalanceTransactionsRelations = relations(
  leaveBalanceTransactions,
  ({ one }) => ({
    employee: one(employees, {
      fields: [leaveBalanceTransactions.employeeId],
      references: [employees.id],
    }),
    leaveType: one(leaveTypes, {
      fields: [leaveBalanceTransactions.leaveTypeId],
      references: [leaveTypes.id],
    }),
    leaveBalance: one(leaveBalances, {
      fields: [leaveBalanceTransactions.leaveBalanceId],
      references: [leaveBalances.id],
    }),
    creator: one(users, {
      fields: [leaveBalanceTransactions.createdBy],
      references: [users.id],
    }),
  })
);

export const leaveRequestsRelations = relations(leaveRequests, ({ one, many }) => ({
  employee: one(employees, {
    fields: [leaveRequests.employeeId],
    references: [employees.id],
  }),
  leaveType: one(leaveTypes, {
    fields: [leaveRequests.leaveTypeId],
    references: [leaveTypes.id],
  }),
  department: one(departments, {
    fields: [leaveRequests.departmentId],
    references: [departments.id],
  }),
  team: one(departments, {
    fields: [leaveRequests.teamId],
    references: [departments.id],
  }),
  assignedTeamLeader: one(employees, {
    fields: [leaveRequests.assignedTeamLeaderId],
    references: [employees.id],
  }),
  reportingManager: one(employees, {
    fields: [leaveRequests.reportingManagerId],
    references: [employees.id],
  }),
  teamLeaderDecidedByUser: one(users, {
    fields: [leaveRequests.teamLeaderDecidedBy],
    references: [users.id],
  }),
  hrDecidedByUser: one(users, {
    fields: [leaveRequests.hrDecidedBy],
    references: [users.id],
  }),
  managementDecidedByUser: one(users, {
    fields: [leaveRequests.managementDecidedBy],
    references: [users.id],
  }),
  escalatedByUser: one(users, {
    fields: [leaveRequests.escalatedBy],
    references: [users.id],
  }),
  events: many(leaveRequestEvents),
}));

export const leaveRequestEventsRelations = relations(leaveRequestEvents, ({ one }) => ({
  leaveRequest: one(leaveRequests, {
    fields: [leaveRequestEvents.leaveRequestId],
    references: [leaveRequests.id],
  }),
  actor: one(users, {
    fields: [leaveRequestEvents.actorId],
    references: [users.id],
  }),
  actorUser: one(users, {
    fields: [leaveRequestEvents.actorUserId],
    references: [users.id],
  }),
}));

/**
 * 14. notifications
 * Database-backed in-app notifications
 */
export const notifications = pgTable(
  'notifications',
  {
    id: serial('id').primaryKey(),
    recipientUserId: integer('recipient_user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    recipientRole: text('recipient_role').notNull(), // 'EMPLOYEE' | 'HR' | 'TOP_MANAGEMENT' | 'SUPER_ADMIN'
    type: text('type').notNull(), // 'LEAVE_SUBMITTED' | 'HR_DECIDED' | 'MANAGEMENT_DECIDED' | 'FINAL_APPROVED' | 'FINAL_REJECTED' | 'LEAVE_CANCELLED'
    title: text('title').notNull(),
    message: text('message').notNull(),
    relatedLeaveRequestId: integer('related_leave_request_id')
      .references(() => leaveRequests.id, { onDelete: 'cascade' }),
    eventKey: text('event_key'), // Unique idempotent key, e.g. "LEAVE_SUBMITTED_100_HR"
    isRead: boolean('is_read').default(false).notNull(),
    readAt: timestamp('read_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('notifications_recipient_idx').on(table.recipientUserId),
    index('notifications_role_idx').on(table.recipientRole),
    index('notifications_req_idx').on(table.relatedLeaveRequestId),
    index('notifications_is_read_idx').on(table.isRead),
    uniqueIndex('notifications_event_key_idx').on(table.eventKey),
  ]
);

export const notificationsRelations = relations(notifications, ({ one }) => ({
  recipient: one(users, {
    fields: [notifications.recipientUserId],
    references: [users.id],
  }),
  relatedLeaveRequest: one(leaveRequests, {
    fields: [notifications.relatedLeaveRequestId],
    references: [leaveRequests.id],
  }),
}));

/**
 * 15. shifts
 * Shift master table (e.g. DAY_SHIFT, NIGHT_SHIFT, SPLIT_SHIFT)
 */
export const shifts = pgTable(
  'shifts',
  {
    id: serial('id').primaryKey(),
    shiftCode: text('shift_code').notNull().unique(),
    shiftName: text('shift_name').notNull(),
    shiftType: text('shift_type').default('DAY').notNull(), // 'DAY' | 'NIGHT' | 'SPLIT'
    category: text('category'),
    startTime: text('start_time'), // "HH:mm"
    endTime: text('end_time'), // "HH:mm"
    totalWorkingHours: numeric('total_working_hours', { precision: 5, scale: 2 }),
    breakMinutes: integer('break_minutes').default(0).notNull(),
    weeklyOff: text('weekly_off').default('Sunday'),
    effectiveFrom: text('effective_from'), // "YYYY-MM-DD"
    effectiveTo: text('effective_to'), // "YYYY-MM-DD" or null
    description: text('description'),
    timingConfigured: boolean('timing_configured').default(true).notNull(),
    isActive: boolean('is_active').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('shifts_shift_code_idx').on(table.shiftCode),
    index('shifts_is_active_idx').on(table.isActive),
  ]
);

/**
 * 16. shift_segments
 * Normalized segments for shifts (e.g. single 08:30-17:30, night 20:30-08:30 next day, or split 05:30-08:30 & 17:00-23:00)
 */
export const shiftSegments = pgTable(
  'shift_segments',
  {
    id: serial('id').primaryKey(),
    shiftId: integer('shift_id')
      .references(() => shifts.id, { onDelete: 'cascade' })
      .notNull(),
    segmentSequence: integer('segment_sequence').default(1).notNull(),
    startTime: text('start_time').notNull(), // "HH:mm" (e.g. "08:30", "20:30", "05:30")
    endTime: text('end_time').notNull(), // "HH:mm" (e.g. "17:30", "08:30", "23:00")
    crossesMidnight: boolean('crosses_midnight').default(false).notNull(),
    breakMinutes: integer('break_minutes').default(0).notNull(),
    isActive: boolean('is_active').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('shift_segments_shift_id_idx').on(table.shiftId),
    index('shift_segments_seq_idx').on(table.shiftId, table.segmentSequence),
    index('shift_segments_is_active_idx').on(table.isActive),
  ]
);

/**
 * 17. employee_shift_assignments
 * Date-effective employee-specific shift assignments with optional day-of-week schedule override
 */
export const employeeShiftAssignments = pgTable(
  'employee_shift_assignments',
  {
    id: serial('id').primaryKey(),
    employeeId: integer('employee_id')
      .references(() => employees.id, { onDelete: 'cascade' })
      .notNull(),
    shiftId: integer('shift_id')
      .references(() => shifts.id, { onDelete: 'restrict' })
      .notNull(),
    effectiveFrom: text('effective_from').notNull(), // "YYYY-MM-DD"
    effectiveTo: text('effective_to'), // "YYYY-MM-DD" or null for open-ended
    workDaysOfWeek: text('work_days_of_week'), // Comma-separated day numbers e.g. "1,2,3,4,5"
    assignmentReason: text('assignment_reason'), // TEMPORARY_SHIFT_CHANGE, DEPARTMENT_REQUIREMENT, etc.
    remarks: text('remarks'),
    customSegments: jsonb('custom_segments'), // Optional per-employee/per-date custom work segments
    isActive: boolean('is_active').default(true).notNull(),
    createdBy: integer('created_by').references(() => users.id, { onDelete: 'set null' }),
    updatedBy: integer('updated_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('emp_shift_assign_emp_idx').on(table.employeeId),
    index('emp_shift_assign_shift_idx').on(table.shiftId),
    index('emp_shift_assign_active_idx').on(table.isActive),
    index('emp_shift_assign_dates_idx').on(table.employeeId, table.effectiveFrom, table.effectiveTo),
  ]
);

export const shiftsRelations = relations(shifts, ({ many }) => ({
  segments: many(shiftSegments),
  assignments: many(employeeShiftAssignments),
}));

export const shiftSegmentsRelations = relations(shiftSegments, ({ one }) => ({
  shift: one(shifts, {
    fields: [shiftSegments.shiftId],
    references: [shifts.id],
  }),
}));

export const employeeShiftAssignmentsRelations = relations(employeeShiftAssignments, ({ one }) => ({
  employee: one(employees, {
    fields: [employeeShiftAssignments.employeeId],
    references: [employees.id],
  }),
  shift: one(shifts, {
    fields: [employeeShiftAssignments.shiftId],
    references: [shifts.id],
  }),
  creator: one(users, {
    fields: [employeeShiftAssignments.createdBy],
    references: [users.id],
  }),
  updater: one(users, {
    fields: [employeeShiftAssignments.updatedBy],
    references: [users.id],
  }),
}));

/**
 * 18. department_shift_assignments
 * Date-effective department-level shift assignments
 */
export const departmentShiftAssignments = pgTable(
  'department_shift_assignments',
  {
    id: serial('id').primaryKey(),
    departmentId: integer('department_id')
      .references(() => departments.id, { onDelete: 'cascade' })
      .notNull(),
    shiftId: integer('shift_id')
      .references(() => shifts.id, { onDelete: 'restrict' })
      .notNull(),
    effectiveFrom: text('effective_from').notNull(), // "YYYY-MM-DD"
    effectiveTo: text('effective_to'), // "YYYY-MM-DD" or null for open-ended
    workDaysOfWeek: text('work_days_of_week'), // Comma-separated day numbers e.g. "1,2,3,4,5"
    isActive: boolean('is_active').default(true).notNull(),
    createdBy: integer('created_by').references(() => users.id, { onDelete: 'set null' }),
    updatedBy: integer('updated_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('dept_shift_assign_dept_idx').on(table.departmentId),
    index('dept_shift_assign_shift_idx').on(table.shiftId),
    index('dept_shift_assign_active_idx').on(table.isActive),
    index('dept_shift_assign_dates_idx').on(table.departmentId, table.effectiveFrom, table.effectiveTo),
  ]
);

export const departmentShiftAssignmentsRelations = relations(departmentShiftAssignments, ({ one }) => ({
  department: one(departments, {
    fields: [departmentShiftAssignments.departmentId],
    references: [departments.id],
  }),
  shift: one(shifts, {
    fields: [departmentShiftAssignments.shiftId],
    references: [shifts.id],
  }),
  creator: one(users, {
    fields: [departmentShiftAssignments.createdBy],
    references: [users.id],
  }),
  updater: one(users, {
    fields: [departmentShiftAssignments.updatedBy],
    references: [users.id],
  }),
}));

/**
 * 19. system_audit_logs
 * General system audit logs for user administration, credential events, and shift changes
 */
export const systemAuditLogs = pgTable(
  'system_audit_logs',
  {
    id: serial('id').primaryKey(),
    actorId: integer('actor_id').references(() => users.id, { onDelete: 'set null' }),
    actorRole: text('actor_role'),
    action: text('action').notNull(),
    targetEntity: text('target_entity').notNull(),
    targetId: text('target_id'),
    metadata: jsonb('metadata'),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('audit_actor_idx').on(table.actorId),
    index('audit_action_idx').on(table.action),
    index('audit_target_idx').on(table.targetEntity, table.targetId),
    index('audit_created_idx').on(table.createdAt),
  ]
);

export const systemAuditLogsRelations = relations(systemAuditLogs, ({ one }) => ({
  actor: one(users, {
    fields: [systemAuditLogs.actorId],
    references: [users.id],
  }),
}));

/**
 * 20. overtime_requests
 * Operational overtime requests and approvals
 */
export const overtimeRequests = pgTable(
  'overtime_requests',
  {
    id: serial('id').primaryKey(),
    employeeId: integer('employee_id')
      .references(() => employees.id, { onDelete: 'cascade' })
      .notNull(),
    date: text('date').notNull(), // "YYYY-MM-DD"
    endDate: text('end_date'), // Optional end date "YYYY-MM-DD" for date range scheduling
    startTime: text('start_time'), // Optional "HH:mm"
    endTime: text('end_time'), // Optional "HH:mm"
    hours: numeric('hours', { precision: 5, scale: 2 }).notNull(),
    shiftId: integer('shift_id').references(() => shifts.id, { onDelete: 'set null' }),
    reason: text('reason').notNull(),
    status: text('status').default('PENDING').notNull(), // 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED'
    assignedBy: integer('assigned_by').references(() => users.id, { onDelete: 'set null' }),
    approvedBy: integer('approved_by').references(() => users.id, { onDelete: 'set null' }),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    remarks: text('remarks'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('ot_emp_idx').on(table.employeeId),
    index('ot_date_idx').on(table.date),
    index('ot_status_idx').on(table.status),
  ]
);

export const overtimeRequestsRelations = relations(overtimeRequests, ({ one }) => ({
  employee: one(employees, {
    fields: [overtimeRequests.employeeId],
    references: [employees.id],
  }),
  approver: one(users, {
    fields: [overtimeRequests.approvedBy],
    references: [users.id],
  }),
  shift: one(shifts, {
    fields: [overtimeRequests.shiftId],
    references: [shifts.id],
  }),
}));

/**
 * 21. team_leader_rotations
 * Reusable 15-day (First Half: Day 1-15 / Second Half: Day 16-Month End) Team Leader rotation rules per team
 */
export const teamLeaderRotations = pgTable(
  'team_leader_rotations',
  {
    id: serial('id').primaryKey(),
    teamId: integer('team_id')
      .references(() => departments.id, { onDelete: 'cascade' })
      .notNull(),
    rotationType: text('rotation_type').default('FIRST_HALF_SECOND_HALF').notNull(),
    firstHalfLeaderId: integer('first_half_leader_id')
      .references(() => employees.id, { onDelete: 'restrict' })
      .notNull(),
    firstHalfLeaderUserId: integer('first_half_leader_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    secondHalfLeaderId: integer('second_half_leader_id')
      .references(() => employees.id, { onDelete: 'restrict' })
      .notNull(),
    secondHalfLeaderUserId: integer('second_half_leader_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    effectiveFrom: text('effective_from').notNull(), // 'YYYY-MM-DD'
    effectiveTo: text('effective_to'), // 'YYYY-MM-DD' or null
    isActive: boolean('is_active').default(true).notNull(),
    remarks: text('remarks'),
    createdBy: integer('created_by').references(() => users.id, { onDelete: 'set null' }),
    updatedBy: integer('updated_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('tl_rot_team_idx').on(table.teamId),
    index('tl_rot_active_idx').on(table.isActive),
    index('tl_rot_dates_idx').on(table.teamId, table.effectiveFrom, table.effectiveTo),
  ]
);

/**
 * 22. team_leader_assignments
 * Date-effective Team Leader assignments & temporary overrides with full historical preservation
 */
export const teamLeaderAssignments = pgTable(
  'team_leader_assignments',
  {
    id: serial('id').primaryKey(),
    teamId: integer('team_id')
      .references(() => departments.id, { onDelete: 'cascade' })
      .notNull(),
    teamLeaderEmployeeId: integer('team_leader_employee_id')
      .references(() => employees.id, { onDelete: 'restrict' })
      .notNull(),
    teamLeaderUserId: integer('team_leader_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    effectiveFrom: text('effective_from').notNull(), // 'YYYY-MM-DD'
    effectiveTo: text('effective_to').notNull(), // 'YYYY-MM-DD'
    assignmentType: text('assignment_type').default('STANDARD').notNull(), // 'STANDARD' | 'ROTATION_OVERRIDE' | 'TEMPORARY_REPLACEMENT' | 'LEAVE_COVER'
    isOverride: boolean('is_override').default(false).notNull(),
    status: text('status').default('ACTIVE').notNull(), // 'ACTIVE' | 'INACTIVE' | 'HISTORICAL'
    isActive: boolean('is_active').default(true).notNull(),
    remarks: text('remarks'),
    createdBy: integer('created_by').references(() => users.id, { onDelete: 'set null' }),
    updatedBy: integer('updated_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('tl_assign_team_idx').on(table.teamId),
    index('tl_assign_leader_idx').on(table.teamLeaderEmployeeId),
    index('tl_assign_active_idx').on(table.isActive),
    index('tl_assign_dates_idx').on(table.teamId, table.effectiveFrom, table.effectiveTo),
  ]
);

/**
 * 23. password_reset_tokens
 * Cryptographically hashed (SHA-256) single-use password reset tokens with 15-minute expiry
 */
export const passwordResetTokens = pgTable(
  'password_reset_tokens',
  {
    id: serial('id').primaryKey(),
    tokenHash: text('token_hash').notNull().unique(),
    userId: integer('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    username: text('username').notNull(),
    email: text('email').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    invalidatedAt: timestamp('invalidated_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('password_reset_tokens_hash_idx').on(table.tokenHash),
    index('password_reset_tokens_user_idx').on(table.userId),
    index('password_reset_tokens_expires_idx').on(table.expiresAt),
  ]
);

/**
 * 24. employee_weekly_off_assignments
 * Date-effective employee weekly-off schedules and assignment history
 */
export const employeeWeeklyOffAssignments = pgTable(
  'employee_weekly_off_assignments',
  {
    id: serial('id').primaryKey(),
    employeeId: integer('employee_id')
      .references(() => employees.id, { onDelete: 'cascade' })
      .notNull(),
    weeklyOffDays: jsonb('weekly_off_days').$type<number[]>().default([0]).notNull(),
    effectiveFrom: text('effective_from').notNull(), // 'YYYY-MM-DD'
    effectiveTo: text('effective_to'), // 'YYYY-MM-DD' or null
    remarks: text('remarks'),
    createdBy: integer('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('emp_weekly_off_emp_idx').on(table.employeeId),
    index('emp_weekly_off_dates_idx').on(table.employeeId, table.effectiveFrom, table.effectiveTo),
  ]
);

/**
 * 25. stored_attachments
 * Persistent storage for validated leave document attachments, user avatars, and company branding images
 */
export const storedAttachments = pgTable(
  'stored_attachments',
  {
    id: serial('id').primaryKey(),
    storagePath: text('storage_path').notNull().unique(),
    fileName: text('file_name').notNull().unique(),
    originalName: text('original_name').notNull(),
    mimeType: text('mime_type').notNull(),
    fileSizeBytes: integer('file_size_bytes').notNull(),
    subDir: text('sub_dir').default('attachments').notNull(),
    fileDataBase64: text('file_data_base64').notNull(),
    uploadedBy: integer('uploaded_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('stored_attachments_path_idx').on(table.storagePath),
    uniqueIndex('stored_attachments_filename_idx').on(table.fileName),
  ]
);


