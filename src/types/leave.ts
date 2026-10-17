export type SystemUserRole = 'SUPER_ADMIN' | 'HR' | 'TOP_MANAGEMENT' | 'TEAM_LEADER' | 'EMPLOYEE';
export type UserRole = SystemUserRole | (string & {});
export type OperationalRole = 'EMPLOYEE' | 'TEAM_LEADER' | 'HR' | 'TOP_MANAGEMENT';

export interface CreateRoleInput {
  name?: string;
  code?: string;
  roleCode?: string;
  key?: string;
  displayName?: string;
  description?: string | null;
  permissions?: string[];
  isActive?: boolean;
}

export interface UpdateRoleInput {
  name?: string;
  code?: string;
  roleCode?: string;
  key?: string;
  displayName?: string;
  description?: string | null;
  permissions?: string[];
  isActive?: boolean;
}

export interface AuthContext {
  userId?: number;
  employeeId?: number;
  employeeCode?: string;
  departmentId?: number | null;
  departmentCode?: string | null;
  username: string;
  role: UserRole;
  operationalRole?: OperationalRole | null;
  permissions?: string[];
}

export interface LeaveTypeDto {
  id: number;
  code: string;
  name: string;
  description: string | null;
  isPaid: boolean;
  requiresDocument: boolean;
  supportsHalfDay: boolean;
  isActive: boolean;
  displayOrder: number;
  createdAt: string | Date;
  updatedAt: string | Date;
}

export interface CreateLeaveTypeInput {
  code: string;
  name: string;
  description?: string | null;
  isPaid?: boolean;
  requiresDocument?: boolean;
  supportsHalfDay?: boolean;
  isActive?: boolean;
  displayOrder?: number;
}

export interface UpdateLeaveTypeInput {
  name?: string;
  description?: string | null;
  isPaid?: boolean;
  requiresDocument?: boolean;
  supportsHalfDay?: boolean;
  isActive?: boolean;
  displayOrder?: number;
}

export interface LeavePolicyDto {
  id: number;
  leaveTypeId: number;
  leaveTypeCode?: string;
  leaveTypeName?: string;
  policyName: string;
  description?: string | null;
  annualAllocation: string | number;
  allocationFrequency: string;
  carryForwardAllowed: boolean;
  carryForwardLimit: string | number;
  expiryEnabled: boolean;
  expiryPeriod: string | null;
  maximumConsecutiveDays: number;
  minimumNoticeDays: number;
  sameDayAllowed: boolean;
  lateRequestAllowed: boolean;
  postStartRequestAllowed: boolean;
  emergencyExceptionAllowed: boolean;
  negativeBalanceAllowed: boolean;
  documentRequired: boolean;
  documentRequiredAfterDays?: number | null;
  halfDayAllowed: boolean;
  isActive: boolean;
  effectiveFrom: string | Date | null;
  effectiveTo: string | Date | null;
  applicableDepartmentId?: number | null;
  applicableDesignationId?: number | null;
  applicableEmploymentStatus?: string | null;
  minServiceMonths?: number;
  createdAt: string | Date;
  updatedAt: string | Date;
}

export interface CreateLeavePolicyInput {
  leaveTypeId: number;
  policyName: string;
  description?: string | null;
  annualAllocation: number | string;
  allocationFrequency?: string;
  carryForwardAllowed?: boolean;
  carryForwardLimit?: number | string;
  expiryEnabled?: boolean;
  expiryPeriod?: string | null;
  maximumConsecutiveDays?: number;
  minimumNoticeDays?: number;
  sameDayAllowed?: boolean;
  lateRequestAllowed?: boolean;
  postStartRequestAllowed?: boolean;
  emergencyExceptionAllowed?: boolean;
  negativeBalanceAllowed?: boolean;
  documentRequired?: boolean;
  documentRequiredAfterDays?: number | null;
  halfDayAllowed?: boolean;
  isActive?: boolean;
  effectiveFrom?: string | Date | null;
  effectiveTo?: string | Date | null;
  applicableDepartmentId?: number | null;
  applicableDesignationId?: number | null;
  applicableEmploymentStatus?: string | null;
  minServiceMonths?: number;
}

export interface UpdateLeavePolicyInput extends Partial<CreateLeavePolicyInput> {}

export interface LeaveBalanceDto {
  id: number;
  employeeId: number;
  employeeName?: string;
  employeeCode?: string;
  departmentId?: number | null;
  departmentCode?: string | null;
  departmentName?: string | null;
  leaveTypeId: number;
  leaveTypeCode?: string;
  leaveTypeName?: string;
  openingBalance: string | number;
  allocated: string | number;
  carryForward: string | number;
  adjustments: string | number;
  used: string | number;
  reserved: string | number;
  available: string | number;
  year: number;
  createdAt: string | Date;
  updatedAt: string | Date;
}

export interface LeaveBalanceTransactionDto {
  id: number;
  employeeId: number;
  leaveTypeId: number;
  leaveTypeCode?: string | null;
  leaveTypeName?: string | null;
  leaveBalanceId: number;
  transactionType:
    | 'OPENING'
    | 'ALLOCATION'
    | 'CARRY_FORWARD'
    | 'ADJUSTMENT'
    | 'USED'
    | 'REVERSAL'
    | 'RESERVATION'
    | 'RESERVATION_RELEASE';
  quantity: string | number;
  referenceType?: string | null;
  referenceId?: string | null;
  remarks?: string | null;
  createdBy?: number | null;
  createdAt: string | Date;
}

export type ApprovalDecision = 'PENDING' | 'APPROVED' | 'REJECTED' | 'NOT_REQUIRED' | 'SKIPPED';
export type FinalLeaveStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
export type LeaveRequestStatus = FinalLeaveStatus;
export type DayType = 'FULL_DAY' | 'HALF_DAY';
export type HalfDayPeriod = 'FIRST_HALF' | 'SECOND_HALF';
export type ReasonCategory =
  | 'MEDICAL_EMERGENCY'
  | 'FAMILY_EMERGENCY'
  | 'ACCIDENT_OR_TRAVEL_EMERGENCY'
  | 'OTHER';
export type RequestClassification =
  | 'NORMAL_LEAVE_REQUEST'
  | 'LATE_LEAVE_REQUEST'
  | 'POST_START_LEAVE_REQUEST';

export interface LeaveRequestDto {
  id: number;
  requestNumber: string;
  employeeId: number;
  employeeName?: string;
  employeeCode?: string;
  applicantRole?: UserRole;
  applicantOperationalRole?: OperationalRole;
  leaveTypeId: number;
  leaveTypeCode?: string;
  leaveTypeName?: string;
  isPaid?: boolean;
  startDate: string; // 'YYYY-MM-DD'
  endDate: string; // 'YYYY-MM-DD'
  totalDays: string | number;
  dayType: DayType;
  halfDayPeriod?: HalfDayPeriod | null;
  reasonCategory?: ReasonCategory | string | null;
  reason: string;
  requestClassification: RequestClassification;
  applicationTimestamp: string | Date;
  status: LeaveRequestStatus;
  teamLeaderDecision?: ApprovalDecision;
  teamLeaderDecidedBy?: number | null;
  teamLeaderDecidedByName?: string | null;
  teamLeaderDecidedAt?: string | Date | null;
  teamLeaderRemarks?: string | null;
  hrDecision: ApprovalDecision;
  hrDecidedBy?: number | null;
  hrDecidedByName?: string | null;
  hrDecidedAt?: string | Date | null;
  hrRemarks?: string | null;
  managementDecision: ApprovalDecision;
  managementDecidedBy?: number | null;
  managementDecidedByName?: string | null;
  managementDecidedAt?: string | Date | null;
  managementRemarks?: string | null;
  finalStatus: FinalLeaveStatus;
  approvalStageLabel?: string;
  currentApprovalStage?: string;
  reportingManagerId?: number | null;
  reportingManagerUserId?: number | null;
  reportingManagerName?: string | null;
  teamId?: number | null;
  teamName?: string | null;
  assignedTeamLeaderId?: number | null;
  assignedTeamLeaderUserId?: number | null;
  assignedTeamLeaderName?: string | null;
  teamLeaderResolutionSource?: string | null;
  teamLeaderEffectiveFrom?: string | null;
  teamLeaderEffectiveTo?: string | null;
  teamLeaderPeriodLabel?: string | null;
  departmentId?: number | null;
  departmentCode?: string | null;
  departmentName?: string | null;
  balancePosted?: boolean;
  attachmentRequired: boolean;
  attachmentPath?: string | null;
  attachmentName?: string | null;
  attachmentSize?: number | null;
  attachmentMime?: string | null;
  hasAttachment?: boolean;
  attachmentUrl?: string | null;
  cancellationReason?: string | null;
  cancellationTimestamp?: string | Date | null;
  noticeMinutes?: number | null;
  createdAt: string | Date;
  updatedAt: string | Date;
}

export interface CreateLeaveRequestInput {
  employeeId?: number | string;
  employeeCode?: string;
  leaveTypeId: number;
  isPaid?: boolean;
  startDate: string; // 'YYYY-MM-DD'
  endDate: string; // 'YYYY-MM-DD'
  dayType: DayType;
  halfDayPeriod?: HalfDayPeriod | null;
  reasonCategory?: ReasonCategory | string | null;
  reason: string;
  emergencyException?: boolean;
  isEmergency?: boolean;
  attachmentPath?: string | null;
  attachmentName?: string | null;
  attachmentSize?: number | null;
  attachmentMime?: string | null;
  applicationTimestampOverride?: string | Date; // Useful for deterministic testing of boundaries
}

export type LeaveRequestEventType =
  | 'SUBMITTED'
  | 'CANCELLED'
  | 'TEAM_LEADER_APPROVED'
  | 'TEAM_LEADER_REJECTED'
  | 'HR_APPROVED'
  | 'HR_REJECTED'
  | 'MANAGEMENT_APPROVED'
  | 'MANAGEMENT_REJECTED'
  | 'FINAL_STATUS_CHANGED';

export interface LeaveRequestEventDto {
  id: number;
  leaveRequestId: number;
  eventType: LeaveRequestEventType | string;
  action?: string | null;
  previousDecision?: string | null;
  newDecision?: string | null;
  previousStatus?: string | null;
  newStatus?: string | null;
  actorId?: number | null;
  actorUserId?: number | null;
  actorEmployeeCode?: string | null;
  actorRole: string;
  actorName?: string | null;
  remarks?: string | null;
  comments?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  createdAt: string | Date;
}

export interface ApprovalDecisionInput {
  decision: 'APPROVED' | 'REJECTED';
  comments?: string;
  remarks?: string;
}

export interface EmployeeLeaveHistoryDto {
  employeeId: number;
  employeeName?: string;
  employeeCode?: string;
  departmentId?: number | null;
  departmentCode?: string | null;
  departmentName?: string;
  designationTitle?: string;
  totalRequests: number;
  approvedRequests: number;
  rejectedRequests: number;
  cancelledRequests: number;
  pendingRequests: number;
  lateRequests: number;
  postStartRequests: number;
  emergencyRequests: number;
  balances: LeaveBalanceDto[];
  recentRequests: LeaveRequestDto[];
}

export interface HolidayListDto {
  id: number;
  listCode: string;
  listName: string;
  code?: string;
  name?: string;
  year: number;
  departmentId?: number | null;
  departmentCode?: string | null;
  departmentName?: string | null;
  isDefault: boolean;
  isActive: boolean;
  description?: string | null;
  holidayCount?: number;
  holidays?: HolidayDto[];
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

export interface CreateHolidayListInput {
  listCode: string;
  listName: string;
  year?: number;
  departmentId?: number | string | null;
  departmentCode?: string | null;
  isDefault?: boolean;
  isActive?: boolean;
  description?: string | null;
}

export interface EmployeeHolidayAssignmentDto {
  id: number;
  employeeId: number;
  employeeName?: string;
  employeeCode?: string;
  holidayListId: number;
  holidayListCode?: string;
  holidayListName?: string;
  effectiveFrom: string; // 'YYYY-MM-DD'
  effectiveTo?: string | null; // 'YYYY-MM-DD' or null
  assignedBy?: number | null;
  remarks?: string | null;
  isActive: boolean;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

export interface AssignEmployeeHolidayListInput {
  employeeId: number | string;
  employeeCode?: string;
  holidayListId: number;
  effectiveFrom: string;
  effectiveTo?: string | null;
  remarks?: string | null;
}

export interface HolidayDto {
  id: number;
  holidayDate: string; // 'YYYY-MM-DD'
  holidayName: string;
  description?: string | null;
  holidayListId?: number | null;
  holidayListCode?: string | null;
  holidayListName?: string | null;
  departmentId?: number | null;
  departmentCode?: string | null;
  departmentName?: string | null;
  isHalfDay?: boolean;
  isOptional: boolean;
  isActive: boolean;
  year: number;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

export type NotificationType =
  | 'LEAVE_SUBMITTED'
  | 'TEAM_LEADER_DECIDED'
  | 'HR_DECIDED'
  | 'MANAGEMENT_DECIDED'
  | 'FINAL_APPROVED'
  | 'FINAL_REJECTED'
  | 'LEAVE_CANCELLED'
  | 'SHIFT_ASSIGNED'
  | 'SHIFT_CHANGED'
  | 'OVERTIME_ADDED'
  | 'OVERTIME_MODIFIED'
  | 'OVERTIME_APPROVED'
  | 'OVERTIME_REJECTED'
  | 'OVERTIME_CANCELLED'
  | 'TEAM_LEADER_ASSIGNED'
  | 'TEAM_LEADER_ROTATION_UPDATED';

export interface NotificationDto {
  id: number;
  recipientUserId: number;
  recipientEmployeeId?: number | null;
  recipientEmployeeCode?: string | null;
  recipientRole: UserRole;
  type: NotificationType;
  title: string;
  message: string;
  relatedLeaveRequestId?: number | null;
  eventKey?: string | null;
  isRead: boolean;
  readAt?: string | Date | null;
  createdAt: string | Date;
}

export interface WorkingDaysCalculationResult {
  totalDays: number;
  totalWorkingHours?: number;
  workingDays: string[];
  weeklyOffDays: string[];
  holidayDays: Array<{ date: string; name: string }>;
  isStartDayWorking: boolean;
  notes?: string[];
}

export interface LeaveCalculationPreview {
  leaveTypeId: number;
  leaveTypeCode?: string;
  leaveTypeName?: string;
  startDate: string;
  endDate: string;
  dayType: DayType;
  halfDayPeriod?: HalfDayPeriod | null;
  totalWorkingDays: number;
  workingDays: string[];
  weeklyOffDays: string[];
  holidayDays: Array<{ date: string; name: string }>;
  currentAvailableBalance: number;
  balanceAfterApproval: number;
  classification: RequestClassification;
  noticeMinutes: number;
  noticeDays: number;
  isLate: boolean;
  isPostStart: boolean;
  isSameDay: boolean;
  isEmergency?: boolean;
  isBeforeNormalFullDayCutoff?: boolean;
  isBeforeShiftStart?: boolean;
  normalFullDayCutoffDateStr?: string;
  normalFullDayCutoffTimeUsed?: string;
  shiftStartTimeUsed?: string;
  shiftCutoffTimeUsed?: string;
  requiresDocument: boolean;
  documentProvided: boolean;
  isValid: boolean;
  applicableShiftSummary?: string;
  resolvedTeamLeaderId?: number | null;
  resolvedTeamLeaderName?: string | null;
  resolvedTeamLeaderSource?: string | null;
  resolvedTeamName?: string | null;
  resolvedTeamLeaderPeriodLabel?: string | null;
  validationErrors: string[];
  warnings: string[];
}

/**
 * ================================================================
 * STEP 7: Shift & Work Schedule Types
 * ================================================================
 */

export interface ShiftSegmentDto {
  id?: number;
  shiftId?: number;
  segmentSequence: number;
  startTime: string; // "HH:mm" e.g. "08:30", "20:30", "05:30"
  endTime: string; // "HH:mm" e.g. "17:30", "08:30", "23:00"
  crossesMidnight: boolean;
  breakMinutes: number;
  isActive: boolean;
  durationHours?: number; // Calculated duration in hours (decimal)
}

export type ShiftType = 'DAY' | 'NIGHT' | 'SPLIT';

export interface ShiftDto {
  id: number;
  shiftCode: string;
  shiftName: string;
  shiftType?: ShiftType | string;
  category?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  totalWorkingHours?: number;
  breakMinutes?: number;
  weeklyOff?: string | null;
  effectiveFrom?: string | null;
  effectiveTo?: string | null;
  description: string | null;
  timingConfigured: boolean;
  isActive: boolean;
  segments: ShiftSegmentDto[];
  totalScheduledHours?: number;
  createdAt: string | Date;
  updatedAt: string | Date;
}

export interface CreateShiftSegmentInput {
  segmentSequence?: number;
  startTime: string;
  endTime: string;
  crossesMidnight?: boolean;
  breakMinutes?: number;
  isActive?: boolean;
}

export interface CreateShiftInput {
  shiftCode: string;
  shiftName: string;
  shiftType?: ShiftType | string;
  category?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  totalWorkingHours?: number | null;
  breakMinutes?: number | null;
  weeklyOff?: string | null;
  effectiveFrom?: string | null;
  effectiveTo?: string | null;
  description?: string | null;
  timingConfigured?: boolean;
  isActive?: boolean;
  segments?: CreateShiftSegmentInput[];
}

export interface UpdateShiftInput {
  shiftCode?: string;
  shiftName?: string;
  shiftType?: ShiftType | string;
  category?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  totalWorkingHours?: number | null;
  breakMinutes?: number | null;
  weeklyOff?: string | null;
  effectiveFrom?: string | null;
  effectiveTo?: string | null;
  description?: string | null;
  timingConfigured?: boolean;
  isActive?: boolean;
  segments?: CreateShiftSegmentInput[];
}

export type AssignmentReason =
  | 'TEMPORARY_SHIFT_CHANGE'
  | 'DEPARTMENT_REQUIREMENT'
  | 'EMPLOYEE_REQUEST'
  | 'BUSINESS_REQUIREMENT'
  | 'REPLACEMENT'
  | 'EMERGENCY'
  | 'OTHER';

export interface EmployeeShiftAssignmentDto {
  id: number;
  employeeId: number;
  employeeName?: string;
  employeeCode?: string;
  departmentId?: number | null;
  departmentCode?: string | null;
  departmentName?: string | null;
  shiftId: number;
  shiftCode?: string;
  shiftName?: string;
  effectiveFrom: string; // "YYYY-MM-DD"
  effectiveTo: string | null; // "YYYY-MM-DD" or null
  workDaysOfWeek: string | null; // e.g. "1,2,3,4,5"
  assignmentReason?: string | null;
  remarks?: string | null;
  customSegments?: ShiftSegmentDto[] | null;
  totalCustomHours?: number | null;
  totalScheduledHours?: number | null;
  isActive: boolean;
  createdBy?: number | null;
  updatedBy?: number | null;
  shift?: ShiftDto;
  createdAt: string | Date;
  updatedAt: string | Date;
}

export interface CreateEmployeeShiftAssignmentInput {
  employeeId: number | string;
  employeeCode?: string;
  shiftId?: number;
  effectiveFrom: string;
  effectiveTo?: string | null;
  workDaysOfWeek?: string | null;
  assignmentReason?: AssignmentReason | string | null;
  remarks?: string | null;
  customSegments?: CreateShiftSegmentInput[] | null;
  segments?: CreateShiftSegmentInput[] | null;
  isActive?: boolean;
}

export interface UpdateEmployeeShiftAssignmentInput {
  shiftId?: number;
  effectiveFrom?: string;
  effectiveTo?: string | null;
  workDaysOfWeek?: string | null;
  assignmentReason?: AssignmentReason | string | null;
  remarks?: string | null;
  customSegments?: CreateShiftSegmentInput[] | null;
  segments?: CreateShiftSegmentInput[] | null;
  isActive?: boolean;
}

export interface DepartmentShiftAssignmentDto {
  id: number;
  departmentId: number;
  departmentCode?: string;
  departmentName?: string;
  shiftId: number;
  shiftCode?: string;
  shiftName?: string;
  effectiveFrom: string; // "YYYY-MM-DD"
  effectiveTo: string | null; // "YYYY-MM-DD" or null
  workDaysOfWeek: string | null; // e.g. "1,2,3,4,5"
  isActive: boolean;
  shift?: ShiftDto;
  createdAt: string | Date;
  updatedAt: string | Date;
}

export interface CreateDepartmentShiftAssignmentInput {
  departmentId: number | string;
  departmentCode?: string;
  shiftId: number;
  effectiveFrom: string;
  effectiveTo?: string | null;
  workDaysOfWeek?: string | null;
  isActive?: boolean;
}

export interface ResolvedDailySchedule {
  date: string; // "YYYY-MM-DD"
  isWorkingDay: boolean;
  isWeeklyOff: boolean;
  isHoliday: boolean;
  isHalfDayHoliday?: boolean;
  isDepartmentHoliday?: boolean;
  holidayName?: string;
  holidayDepartmentId?: number | null;
  holidayDepartmentCode?: string | null;
  holidayDepartmentName?: string | null;
  scheduleSource: 'EMPLOYEE_SHIFT' | 'DEPARTMENT_SHIFT' | 'COMPANY_DEFAULT' | 'OFF';
  shiftId?: number;
  shiftCode?: string;
  shiftName?: string;
  segments: Array<{
    segmentSequence: number;
    startTime: string;
    endTime: string;
    crossesMidnight: boolean;
    breakMinutes: number;
    durationHours: number;
    nextDayIndicator: boolean;
  }>;
  totalScheduledHours: number;
  totalWorkingHours?: number;
  breakMinutes?: number;
  earliestStartTime?: string; // e.g. "05:30"
  latestEndTime?: string; // e.g. "23:00"
}

// ----------------------------------------------------
// STEP 8A: USER & EMPLOYEE ADMINISTRATION TYPES
// ----------------------------------------------------

export type EmploymentType =
  | 'FULL_TIME'
  | 'PART_TIME'
  | 'CONTRACT'
  | 'PROBATION'
  | 'INTERN';

export type EmploymentStatus =
  | 'ACTIVE'
  | 'SUSPENDED'
  | 'ON_LEAVE'
  | 'PROBATION'
  | 'RESIGNED'
  | 'TERMINATED'
  | 'INACTIVE'
  | 'DEACTIVATED';

export interface DepartmentDto {
  id: number;
  departmentCode?: string;
  name: string;
  code: string;
  description?: string | null;
  headEmployeeId?: number | null;
  isActive: boolean;
  createdAt: string | Date;
  updatedAt: string | Date;
}

export interface CreateDepartmentInput {
  name: string;
  code?: string;
  departmentId?: string;
  departmentCode?: string;
  description?: string;
  isActive?: boolean;
}

export interface UpdateDepartmentInput {
  name?: string;
  code?: string;
  departmentId?: string;
  departmentCode?: string;
  description?: string;
  isActive?: boolean;
}

export interface DesignationDto {
  id: number;
  name: string;
  code: string;
  description?: string | null;
  isActive: boolean;
  createdAt: string | Date;
  updatedAt: string | Date;
}

export interface CreateDesignationInput {
  name: string;
  code: string;
  description?: string;
  isActive?: boolean;
}

export interface UpdateDesignationInput {
  name?: string;
  code?: string;
  description?: string;
  isActive?: boolean;
}

export interface BranchDto {
  id: number;
  name: string;
  code: string;
  description?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  pincode?: string | null;
  country?: string | null;
  contactNumber?: string | null;
  contactEmail?: string | null;
  contactPerson?: string | null;
  isActive: boolean;
  createdAt: string | Date;
  updatedAt: string | Date;
}

export interface CreateBranchInput {
  name: string;
  code: string;
  description?: string;
  address?: string;
  city?: string;
  state?: string;
  pincode?: string;
  country?: string;
  contactNumber?: string;
  contactEmail?: string;
  contactPerson?: string;
  isActive?: boolean;
}

export interface UpdateBranchInput {
  name?: string;
  code?: string;
  description?: string;
  address?: string;
  city?: string;
  state?: string;
  pincode?: string;
  country?: string;
  contactNumber?: string;
  contactEmail?: string;
  contactPerson?: string;
  isActive?: boolean;
}

export interface UpdateDesignationInput {
  name?: string;
  code?: string;
  description?: string;
  isActive?: boolean;
}

export interface RoleDto {
  id: number;
  name: UserRole;
  code?: string;
  displayName?: string;
  description?: string | null;
  isActive: boolean;
  isSystem?: boolean;
  userCount: number;
  activeUserCount?: number;
  permissions: string[];
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

export interface EmployeeDto {
  id: number;
  userId?: number | null;
  username?: string | null;
  employeeCode: string;
  fullName: string;
  employeeName: string;
  officialEmail: string;
  email: string;
  mobile?: string | null;
  departmentId?: number | null;
  departmentCode?: string | null;
  departmentName?: string | null;
  teamId?: number | null;
  teamCode?: string | null;
  teamName?: string | null;
  designationId?: number | null;
  designationName?: string | null;
  reportingManagerId?: number | null;
  reportingManagerCode?: string | null;
  reportingManagerName?: string | null;
  employmentType: EmploymentType | string;
  employmentStatus: EmploymentStatus | string;
  joiningDate?: string | null;
  officeLocation?: string | null;
  role?: UserRole | null;
  operationalRole?: OperationalRole | null;
  weeklyOff?: string | null;
  currentShiftId?: number | null;
  currentShiftCode?: string | null;
  currentShiftName?: string | null;
  currentHolidayListId?: number | null;
  currentHolidayListCode?: string | null;
  currentHolidayListName?: string | null;
  profilePhotoUrl?: string | null;
  hasProfilePhoto?: boolean;
  profilePhotoMimeType?: string | null;
  profilePhotoUpdatedAt?: string | null;
  mustChangePassword?: boolean;
  credentialEmail?: CredentialEmailDeliveryDto | null;
  effectiveFrom?: string | null;
  remarks?: string | null;
  isActive: boolean;
  createdAt: string | Date;
  updatedAt: string | Date;
}

export interface CredentialEmailDeliveryDto {
  sent: boolean;
  status: 'SENT' | 'FAILED';
  recipientEmail: string;
  subject?: string;
  sentAt: string | null;
  messageId?: string | null;
  error: string | null;
}

export interface CreateEmployeeInput {
  employeeCode?: string;
  employeeId?: string;
  employeeName: string;
  officialEmail: string;
  recipientEmail?: string;
  mobile?: string;
  departmentId?: number | string;
  departmentCode?: string;
  teamId?: number | string;
  designationId?: number;
  reportingManagerId?: number | string;
  employmentType?: EmploymentType | string;
  employmentStatus?: EmploymentStatus | string;
  joiningDate?: string;
  officeLocation?: string;
  userId?: number;
  initialRole?: UserRole;
  operationalRole?: OperationalRole | null;
  initialPassword?: string;
  createUserAccount?: boolean;
  simulateEmailFailure?: boolean;
  shiftId?: number;
  holidayListId?: number;
  weeklyOffDays?: number[]; // e.g. [0] or [0, 6] or [5]
  effectiveFrom?: string;
  remarks?: string;
}

export interface UpdateEmployeeInput {
  username?: string;
  employeeCode?: string;
  employeeId?: string;
  employeeName?: string;
  fullName?: string;
  officialEmail?: string;
  email?: string;
  mobile?: string | null;
  departmentId?: number | string | null;
  departmentCode?: string | null;
  teamId?: number | string | null;
  designationId?: number | null;
  reportingManagerId?: number | string | null;
  employmentType?: EmploymentType | string;
  employmentStatus?: EmploymentStatus | string;
  joiningDate?: string | null;
  officeLocation?: string | null;
  userId?: number | null;
  roleId?: number;
  role?: UserRole;
  operationalRole?: OperationalRole | null;
  shiftId?: number | null;
  holidayListId?: number | null;
  weeklyOffDays?: number[];
  effectiveFrom?: string;
  effectiveTo?: string | null;
  remarks?: string | null;
  reason?: string | null;
  isActive?: boolean;
}

export interface WorkingDayConfigItem {
  dayOfWeek: number; // 0=Sun, 1=Mon, ..., 6=Sat
  dayName: string; // 'Sunday', 'Monday', ...
  isWorkingDay: boolean;
  officeStartTime: string; // "09:00"
  officeEndTime: string; // "18:00"
  startTime?: string; // "09:00"
  endTime?: string; // "18:00"
  graceMinutes: number; // e.g. 15
  effectiveFrom?: string;
  effectiveTo?: string;
  remarks?: string;
}

export interface EmployeeWeeklyOffDto {
  id: number;
  employeeId: number;
  employeeName?: string;
  employeeCode?: string;
  weeklyOffDays: number[]; // e.g. [0] or [5] or [0, 6]
  weeklyOffDaysFormatted: string; // "Sunday", "Friday", "Saturday, Sunday"
  effectiveFrom: string;
  effectiveTo?: string | null;
  remarks?: string | null;
  createdAt: string | Date;
}

export interface AssignWeeklyOffInput {
  employeeId: number | string;
  weeklyOffDays: number[]; // 0=Sun..6=Sat
  effectiveFrom: string;
  effectiveTo?: string | null;
  remarks?: string;
}

export interface UserDto {
  id: number;
  username: string;
  email: string;
  roleId: number;
  roleName: UserRole;
  role?: UserRole;
  operationalRole?: OperationalRole | null;
  permissions?: string[];
  fullName?: string;
  isActive: boolean;
  employeeId?: number | null;
  employeeCode?: string | null;
  employeeName?: string | null;
  employee?: any;
  mobile?: string | null;
  departmentId?: number | null;
  departmentCode?: string | null;
  departmentName?: string | null;
  teamId?: number | null;
  teamCode?: string | null;
  teamName?: string | null;
  designationId?: number | null;
  designationName?: string | null;
  reportingManagerId?: number | null;
  reportingManagerCode?: string | null;
  reportingManagerName?: string | null;
  joiningDate?: string | null;
  officeLocation?: string | null;
  remarks?: string | null;
  employmentType?: EmploymentType | string;
  employmentStatus?: EmploymentStatus | string;
  currentShift?: ShiftDto | null;
  currentShiftId?: number | null;
  currentShiftCode?: string | null;
  currentShiftName?: string | null;
  currentHolidayList?: {
    id: number;
    code: string;
    name: string;
    year: number;
    source?: string;
  } | null;
  currentHolidayListId?: number | null;
  currentHolidayListCode?: string | null;
  currentHolidayListName?: string | null;
  profilePhotoUrl?: string | null;
  hasProfilePhoto?: boolean;
  profilePhotoMimeType?: string | null;
  profilePhotoUpdatedAt?: string | null;
  mustChangePassword?: boolean;
  credentialEmail?: CredentialEmailDeliveryDto | null;
  createdAt: string | Date;
  updatedAt: string | Date;
}

export interface ProfilePhotoMetadataDto {
  userId: number;
  storagePath: string;
  fileName: string;
  originalName: string;
  mimeType: string;
  fileSizeBytes: number;
  updatedAt: string;
  updatedBy?: number | null;
}

export interface CompanyBrandingDto {
  applicationName: string;
  hasCustomLogo: boolean;
  logoUrl: string | null;
  fileName?: string | null;
  originalName?: string | null;
  mimeType?: string | null;
  fileSizeBytes?: number | null;
  updatedAt?: string | null;
  updatedBy?: number | null;
}

export interface CreateUserInput {
  username: string;
  email: string;
  recipientEmail?: string;
  password?: string;
  fullName?: string;
  designation?: string;
  roleId?: number;
  role?: UserRole;
  operationalRole?: OperationalRole | null;
  employeeId?: number | string | null;
  employeeCode?: string;
  employeeName?: string;
  mobile?: string;
  departmentId?: number | string | null;
  departmentCode?: string | null;
  teamId?: number | string | null;
  designationId?: number | null;
  reportingManagerId?: number | string | null;
  joiningDate?: string;
  officeLocation?: string;
  employmentType?: EmploymentType | string;
  employmentStatus?: EmploymentStatus | string;
  isActive?: boolean;
  initialShiftId?: number | null;
  initialHolidayListId?: number | null;
  simulateEmailFailure?: boolean;
}

export interface UpdateUserInput {
  username?: string;
  email?: string;
  officialEmail?: string;
  fullName?: string;
  designation?: string;
  roleId?: number;
  role?: UserRole;
  operationalRole?: OperationalRole | null;
  employeeId?: number | string | null;
  employeeCode?: string;
  employeeName?: string;
  mobile?: string | null;
  departmentId?: number | string | null;
  departmentCode?: string | null;
  teamId?: number | string | null;
  designationId?: number | null;
  reportingManagerId?: number | string | null;
  joiningDate?: string | null;
  officeLocation?: string | null;
  employmentType?: EmploymentType | string;
  employmentStatus?: EmploymentStatus | string;
  shiftId?: number | null;
  holidayListId?: number | null;
  weeklyOffDays?: number[];
  effectiveFrom?: string;
  effectiveTo?: string | null;
  remarks?: string | null;
  reason?: string | null;
  isActive?: boolean;
}

export interface UnifiedEmployeeTimelineItemDto {
  id: string;
  timestamp: string;
  category:
    | 'LEAVE'
    | 'APPROVAL'
    | 'OVERTIME'
    | 'SHIFT'
    | 'HOLIDAY'
    | 'WEEKLY_OFF'
    | 'BALANCE'
    | 'PROFILE'
    | 'TEAM_LEADERSHIP'
    | 'AUDIT';
  action: string;
  title: string;
  summary: string;
  employeeCode: string | null;
  employeeName: string | null;
  departmentCode: string | null;
  departmentName: string | null;
  actorId: number | null;
  actorName: string | null;
  actorEmployeeCode: string | null;
  actorRole: string | null;
  previousStatus: string | null;
  newStatus: string | null;
  reasonOrComment: string | null;
  whatHappenedNext: string | null;
  targetEntity: string;
  targetId: string | null;
  metadata?: any;
}

export interface CompleteUserProfileDto {
  user: UserDto;
  employee: EmployeeDto | null;
  employeeCode?: string | null;
  departmentCode?: string | null;
  linkedAccountStatus?: 'LINKED_USER_ACCOUNT' | 'STANDALONE_EMPLOYEE';
  leaveBalances: LeaveBalanceDto[];
  leaveRequests: LeaveRequestDto[];
  leaveRequestEvents?: LeaveRequestEventDto[];
  leaveBalanceTransactions?: LeaveBalanceTransactionDto[];
  currentShiftAssignment: EmployeeShiftAssignmentDto | null;
  shiftHistory: EmployeeShiftAssignmentDto[];
  effectiveHolidayCalendar: {
    source: 'EMPLOYEE' | 'DEPARTMENT' | 'DEFAULT' | 'NONE';
    assignment: EmployeeHolidayAssignmentDto | null;
    holidayList: (HolidayListDto & { holidays: HolidayDto[] }) | null;
  };
  holidayAssignments: EmployeeHolidayAssignmentDto[];
  weeklyOffConfig: {
    source: 'EMPLOYEE' | 'DEFAULT';
    weeklyOffDays: string[];
    assignments: EmployeeWeeklyOffDto[];
  } | null;
  overtimeAssignments: OvertimeRequestDto[];
  overtimeRecords?: Array<
    OvertimeRequestDto & {
      approvedHours?: number;
      approverName?: string | null;
    }
  >;
  overtimeSummary?: {
    approvedHours: number;
    totalRequestedHours: number;
    pendingHours: number;
    totalRequests: number;
  };
  teamLeadershipSummary?: {
    currentTeamLeader: ResolvedTeamLeaderDto | null;
    isCurrentTeamLeader?: boolean;
    assignmentsAsLeader: TeamLeaderAssignmentDto[];
    rotationRulesAsLeader: TeamLeaderRotationRuleDto[];
    leadershipAssignments?: Array<
      TeamLeaderAssignmentDto & {
        selectionMode?: string;
        rotationStatus?: string;
      }
    >;
  } | null;
  notifications?: NotificationDto[];
  unifiedTimeline?: UnifiedEmployeeTimelineItemDto[];
  auditLogs: SystemAuditLogDto[];
}

export interface ChangePasswordInput {
  currentPassword: string;
  newPassword: string;
}

export interface ResetPasswordInput {
  newPassword?: string;
}

export interface SystemAuditLogDto {
  id: number;
  actorId?: number | null;
  actorUserId?: number | null;
  actorRole?: string | null;
  actorName?: string | null;
  actorEmployeeCode?: string | null;
  action: string;
  targetEntity: string;
  targetId?: string | null;
  targetEmployeeId?: number | string | null;
  targetEmployeeCode?: string | null;
  targetEmployeeName?: string | null;
  employeeCode?: string | null;
  employeeName?: string | null;
  departmentCode?: string | null;
  departmentName?: string | null;
  previousStatus?: string | null;
  newStatus?: string | null;
  reason?: string | null;
  nextStep?: string | null;
  metadata?: Record<string, any> | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  createdAt: string | Date;
}

export type AuditLogDto = SystemAuditLogDto;

export interface CreateAuditLogInput {
  actorId?: number | null;
  actorRole?: string | null;
  action: string;
  targetEntity: string;
  targetId?: string | null;
  metadata?: Record<string, any> | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export type OvertimeStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';

export interface OvertimeRequestDto {
  id: number;
  employeeId: number;
  employeeName?: string;
  employeeCode?: string;
  departmentId?: number | null;
  departmentCode?: string | null;
  departmentName?: string | null;
  date: string; // YYYY-MM-DD
  endDate?: string | null; // YYYY-MM-DD
  overtimeDate?: string;
  startTime?: string | null; // HH:mm
  endTime?: string | null; // HH:mm
  hours: number;
  requestedHours?: number;
  totalHours?: number;
  shiftId?: number | null;
  shiftCode?: string | null;
  shiftName?: string | null;
  reason: string;
  status: OvertimeStatus;
  assignedBy?: number | null;
  approvedBy?: number | null;
  approvedByName?: string | null;
  approvedAt?: string | Date | null;
  reviewedBy?: number | null;
  reviewedAt?: string | Date | null;
  remarks?: string | null;
  reviewComments?: string | null;
  createdAt: string | Date;
  updatedAt: string | Date;
}

export interface CreateOvertimeRequestInput {
  employeeId: number | string;
  employeeCode?: string;
  date?: string;
  overtimeDate?: string;
  endDate?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  hours?: number;
  shiftId?: number | null;
  reason: string;
  status?: OvertimeStatus;
  remarks?: string | null;
}

export interface ReviewOvertimeInput {
  status?: 'APPROVED' | 'REJECTED';
  action?: 'APPROVE' | 'REJECT';
  remarks?: string | null;
  comments?: string | null;
}

// ----------------------------------------------------
// TEAM LEADER DATE-EFFECTIVE ASSIGNMENT & 15-DAY ROTATION TYPES
// ----------------------------------------------------

export type TeamLeaderRotationType = 'FIRST_HALF_SECOND_HALF' | 'CUSTOM';

export type TeamLeaderAssignmentType =
  | 'STANDARD'
  | 'OVERRIDE'
  | 'ROTATION_OVERRIDE'
  | 'TEMPORARY_REPLACEMENT'
  | 'ROTATION_GENERATED'
  | 'LEAVE_COVER';

export type TeamLeaderAssignmentStatus = 'ACTIVE' | 'INACTIVE' | 'HISTORICAL';

export type TeamLeaderResolutionSource =
  | 'OVERRIDE_ASSIGNMENT'
  | 'DATE_ASSIGNMENT_OVERRIDE'
  | 'DATE_ASSIGNMENT'
  | 'ROTATION_RULE'
  | 'ROTATION_FIRST_HALF'
  | 'ROTATION_SECOND_HALF'
  | 'REPORTING_MANAGER_FALLBACK'
  | 'REPORTING_MANAGER';

export interface TeamLeaderAssignmentDto {
  id: number;
  assignmentId?: number;
  teamId: number;
  teamName: string;
  teamCode?: string | null;
  teamLeaderUserId: number;
  teamLeaderEmployeeId: number;
  teamLeaderEmployeeCode?: string | null;
  teamLeaderCode?: string | null;
  teamLeaderName: string;
  teamLeaderEmail?: string | null;
  effectiveFrom: string; // 'YYYY-MM-DD'
  effectiveTo: string; // 'YYYY-MM-DD'
  assignmentType: TeamLeaderAssignmentType;
  rotationRuleId?: number | null;
  isOverride?: boolean;
  status: TeamLeaderAssignmentStatus;
  isActive: boolean;
  reason?: string | null;
  remarks?: string | null;
  createdBy?: number | null;
  createdByName?: string | null;
  createdAt: string | Date;
  updatedBy?: number | null;
  updatedByName?: string | null;
  updatedAt: string | Date;
}

export interface CreateTeamLeaderAssignmentInput {
  teamId: number | string;
  teamCode?: string | null;
  departmentCode?: string | null;
  teamLeaderEmployeeId?: number | string | null;
  teamLeaderUserId?: number | null;
  effectiveFrom: string; // 'YYYY-MM-DD'
  effectiveTo: string; // 'YYYY-MM-DD'
  assignmentType?: TeamLeaderAssignmentType;
  rotationRuleId?: number | null;
  isOverride?: boolean;
  isActive?: boolean;
  reason?: string | null;
  remarks?: string | null;
}

export interface UpdateTeamLeaderAssignmentInput {
  teamId?: number | string;
  teamLeaderEmployeeId?: number | string | null;
  teamLeaderUserId?: number | null;
  effectiveFrom?: string;
  effectiveTo?: string;
  assignmentType?: TeamLeaderAssignmentType;
  isOverride?: boolean;
  status?: TeamLeaderAssignmentStatus;
  isActive?: boolean;
  reason?: string | null;
  remarks?: string | null;
}

export interface TeamLeaderRotationRuleDto {
  id: number;
  teamId: number;
  teamName: string;
  teamCode?: string | null;
  departmentCode?: string | null;
  rotationType: TeamLeaderRotationType;
  firstHalfStartDay: number;
  firstHalfEndDay: number;
  firstHalfLeaderUserId: number;
  firstHalfLeaderEmployeeId: number;
  firstHalfLeaderId?: number;
  firstHalfLeaderEmployeeCode?: string | null;
  firstHalfLeaderCode?: string | null;
  firstHalfLeaderName: string;
  firstHalfLeaderEmail?: string | null;
  secondHalfStartDay: number;
  secondHalfLeaderUserId: number;
  secondHalfLeaderEmployeeId: number;
  secondHalfLeaderId?: number;
  secondHalfLeaderEmployeeCode?: string | null;
  secondHalfLeaderCode?: string | null;
  secondHalfLeaderName: string;
  secondHalfLeaderEmail?: string | null;
  effectiveFrom: string; // 'YYYY-MM-DD'
  effectiveTo: string | null; // 'YYYY-MM-DD' or null for ongoing
  status: 'ACTIVE' | 'INACTIVE';
  isActive: boolean;
  remarks?: string | null;
  createdBy?: number | null;
  createdByName?: string | null;
  createdAt: string | Date;
  updatedBy?: number | null;
  updatedByName?: string | null;
  updatedAt: string | Date;
}

export interface CreateTeamLeaderRotationRuleInput {
  teamId: number | string;
  teamCode?: string | null;
  departmentCode?: string | null;
  rotationType?: TeamLeaderRotationType;
  firstHalfLeaderEmployeeId?: number | string | null;
  firstHalfLeaderUserId?: number | null;
  firstHalfLeaderId?: number | string | null;
  secondHalfLeaderEmployeeId?: number | string | null;
  secondHalfLeaderUserId?: number | null;
  secondHalfLeaderId?: number | string | null;
  effectiveFrom?: string;
  effectiveTo?: string | null;
  isActive?: boolean;
  remarks?: string | null;
  replaceExistingActive?: boolean;
}

export type CreateTeamLeaderRotationInput = CreateTeamLeaderRotationRuleInput;

export interface UpdateTeamLeaderRotationRuleInput {
  rotationType?: TeamLeaderRotationType;
  firstHalfLeaderEmployeeId?: number | string | null;
  firstHalfLeaderUserId?: number | null;
  firstHalfLeaderId?: number | string | null;
  secondHalfLeaderEmployeeId?: number | string | null;
  secondHalfLeaderUserId?: number | null;
  secondHalfLeaderId?: number | string | null;
  effectiveFrom?: string;
  effectiveTo?: string | null;
  status?: 'ACTIVE' | 'INACTIVE';
  isActive?: boolean;
  remarks?: string | null;
}

export type UpdateTeamLeaderRotationInput = UpdateTeamLeaderRotationRuleInput;

export interface ResolvedTeamLeaderDto {
  teamId: number;
  teamName: string;
  teamCode?: string | null;
  departmentCode?: string | null;
  targetDate: string; // 'YYYY-MM-DD'
  teamLeaderUserId: number;
  teamLeaderEmployeeId: number;
  teamLeaderEmployeeCode: string | null;
  teamLeaderCode?: string | null;
  teamLeaderName: string;
  teamLeaderEmail: string;
  teamLeaderRole?: UserRole;
  isActive?: boolean;
  source: TeamLeaderResolutionSource;
  resolutionSource?: TeamLeaderResolutionSource;
  assignmentId: number | null;
  rotationRuleId: number | null;
  effectiveFrom: string; // 'YYYY-MM-DD'
  effectiveTo: string; // 'YYYY-MM-DD'
  periodLabel: string; // e.g. '01–15 Sep' or '16–30 Sep'
}

export interface TeamRotationSummaryDto {
  teamId: number;
  teamName: string;
  teamCode: string;
  referenceDate: string;
  currentTeamLeader: ResolvedTeamLeaderDto | null;
  upcomingTeamLeader: ResolvedTeamLeaderDto | null;
  activeRotationRule: TeamLeaderRotationRuleDto | null;
  activeAssignments: TeamLeaderAssignmentDto[];
  historicalAssignments: TeamLeaderAssignmentDto[];
  assignments?: TeamLeaderAssignmentDto[];
}

