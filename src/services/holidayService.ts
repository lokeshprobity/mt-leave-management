import fs from 'fs';
import path from 'path';
import { eq, desc, and, isNull, or } from 'drizzle-orm';
import { getDb, isDbConfigured } from '../db/index.ts';
import {
  holidays,
  holidayLists,
  employeeHolidayAssignments,
  departments,
  systemSettings,
} from '../db/schema.ts';
import {
  HolidayDto,
  HolidayListDto,
  CreateHolidayListInput,
  EmployeeHolidayAssignmentDto,
  AssignEmployeeHolidayListInput,
  AuthContext,
} from '../types/leave.ts';
import { ValidationError } from './validation.ts';
import { AuditService } from './auditService.ts';

export interface CreateHolidayInput {
  holidayDate: string; // 'YYYY-MM-DD'
  holidayName: string;
  description?: string | null;
  holidayListId?: number | null;
  departmentId?: number | string | null;
  departmentCode?: string | null;
  departmentName?: string | null;
  isHalfDay?: boolean;
  isOptional?: boolean;
  isActive?: boolean;
  year?: number;
}

export interface UpdateHolidayInput {
  holidayDate?: string;
  holidayName?: string;
  description?: string | null;
  holidayListId?: number | null;
  departmentId?: number | string | null;
  departmentCode?: string | null;
  departmentName?: string | null;
  isHalfDay?: boolean;
  isOptional?: boolean;
  isActive?: boolean;
  year?: number;
}

export interface HolidayFilter {
  year?: number;
  month?: number;
  holidayListId?: number | null;
  departmentId?: number | string | null;
  strictDepartmentId?: number | string | null;
  isActive?: boolean;
  isOptional?: boolean;
  search?: string;
}

function createDefaultHolidayLists(): HolidayListDto[] {
  return [
    {
      id: 1,
      listCode: 'HL_GENERAL_2026',
      listName: 'General Organization Holiday List 2026',
      year: 2026,
      departmentId: null,
      departmentName: 'All Departments',
      isDefault: true,
      isActive: true,
      description: 'Default company-wide public and gazetted holidays',
      createdAt: new Date('2026-01-01T00:00:00Z'),
    },
    {
      id: 2,
      listCode: 'HL_MAESTRO_IMPORT_2026',
      listName: 'Maestro_Import Holiday List 2026',
      year: 2026,
      departmentId: 5,
      departmentName: 'Maestro_Import',
      isDefault: false,
      isActive: true,
      description: 'Holiday calendar for Maestro_Import port operations',
      createdAt: new Date('2026-01-01T00:00:00Z'),
    },
    {
      id: 3,
      listCode: 'HL_AR_TRANS_2026',
      listName: 'A R Transportation Holiday List 2026',
      year: 2026,
      departmentId: 6,
      departmentName: 'A R Transportation',
      isDefault: false,
      isActive: true,
      description: 'Holiday calendar for A R Transportation fleet operations',
      createdAt: new Date('2026-01-01T00:00:00Z'),
    },
    {
      id: 4,
      listCode: 'HL_MAESTRO_CFS_2026',
      listName: 'Maestro CFS Holiday List 2026',
      year: 2026,
      departmentId: 7,
      departmentName: 'Maestro CFS',
      isDefault: false,
      isActive: true,
      description: 'Holiday calendar for Maestro CFS terminal operations',
      createdAt: new Date('2026-01-01T00:00:00Z'),
    },
  ];
}

let memoryHolidayLists: HolidayListDto[] = createDefaultHolidayLists();
let memoryEmployeeHolidayAssignments: EmployeeHolidayAssignmentDto[] = [];
let nextHolidayListId = 10;
let nextEmpHolidayAssignId = 10;

// In-memory backing store for non-DB / local environments and testing
let memoryHolidays: HolidayDto[] = [
  {
    id: 1,
    holidayDate: '2026-01-26',
    holidayName: 'Republic Day',
    description: 'National Holiday',
    departmentId: null,
    departmentName: 'All Departments',
    isHalfDay: false,
    isOptional: false,
    isActive: true,
    year: 2026,
    createdAt: new Date('2026-01-01T00:00:00Z'),
  },
  {
    id: 2,
    holidayDate: '2026-08-15',
    holidayName: 'Independence Day',
    description: 'National Holiday',
    departmentId: null,
    departmentName: 'All Departments',
    isHalfDay: false,
    isOptional: false,
    isActive: true,
    year: 2026,
    createdAt: new Date('2026-01-01T00:00:00Z'),
  },
  {
    id: 3,
    holidayDate: '2026-10-02',
    holidayName: 'Gandhi Jayanti',
    description: 'National Holiday',
    departmentId: null,
    departmentName: 'All Departments',
    isHalfDay: false,
    isOptional: false,
    isActive: true,
    year: 2026,
    createdAt: new Date('2026-01-01T00:00:00Z'),
  },
  {
    id: 4,
    holidayDate: '2026-12-25',
    holidayName: 'Christmas Day',
    description: 'Public Holiday',
    departmentId: null,
    departmentName: 'All Departments',
    isHalfDay: false,
    isOptional: false,
    isActive: true,
    year: 2026,
    createdAt: new Date('2026-01-01T00:00:00Z'),
  },
  // Example department-specific holidays:
  // Maestro_Import (deptId: 5)
  {
    id: 5,
    holidayDate: '2026-05-01',
    holidayName: 'Maestro Port Operations Day',
    description: 'Special Department Holiday for Maestro Import',
    departmentId: 5,
    departmentName: 'Maestro_Import',
    isHalfDay: false,
    isOptional: false,
    isActive: true,
    year: 2026,
    createdAt: new Date('2026-01-01T00:00:00Z'),
  },
  // A R Transportation (deptId: 6)
  {
    id: 6,
    holidayDate: '2026-09-17',
    holidayName: 'Transport Fleet Maintenance Holiday',
    description: 'Annual fleet maintenance day for A R Transportation',
    departmentId: 6,
    departmentName: 'A R Transportation',
    isHalfDay: false,
    isOptional: false,
    isActive: true,
    year: 2026,
    createdAt: new Date('2026-01-01T00:00:00Z'),
  },
  // Maestro CFS (deptId: 7)
  {
    id: 7,
    holidayDate: '2026-11-01',
    holidayName: 'CFS Terminal Foundation Day',
    description: 'Maestro CFS Terminal operational holiday',
    departmentId: 7,
    departmentName: 'Maestro CFS',
    isHalfDay: false,
    isOptional: false,
    isActive: true,
    year: 2026,
    createdAt: new Date('2026-01-01T00:00:00Z'),
  },
];

let nextHolidayId = 20;

const IS_TEST_PROCESS = Boolean(
  process.argv[1]?.includes('.test.') || process.argv[1]?.includes('.runner.')
);
const HOLIDAYS_STORAGE_FILE = path.resolve(
  'uploads',
  'metadata',
  IS_TEST_PROCESS ? 'holidays_and_lists.test.json' : 'holidays_and_lists.json'
);

function createDefaultHolidays(): HolidayDto[] {
  return [
    {
      id: 1,
      holidayDate: '2026-01-26',
      holidayName: 'Republic Day',
      description: 'National Holiday',
      departmentId: null,
      departmentName: 'All Departments',
      isHalfDay: false,
      isOptional: false,
      isActive: true,
      year: 2026,
      createdAt: new Date('2026-01-01T00:00:00Z'),
    },
    {
      id: 2,
      holidayDate: '2026-08-15',
      holidayName: 'Independence Day',
      description: 'National Holiday',
      departmentId: null,
      departmentName: 'All Departments',
      isHalfDay: false,
      isOptional: false,
      isActive: true,
      year: 2026,
      createdAt: new Date('2026-01-01T00:00:00Z'),
    },
    {
      id: 3,
      holidayDate: '2026-10-02',
      holidayName: 'Gandhi Jayanti',
      description: 'National Holiday',
      departmentId: null,
      departmentName: 'All Departments',
      isHalfDay: false,
      isOptional: false,
      isActive: true,
      year: 2026,
      createdAt: new Date('2026-01-01T00:00:00Z'),
    },
    {
      id: 4,
      holidayDate: '2026-12-25',
      holidayName: 'Christmas Day',
      description: 'Public Holiday',
      departmentId: null,
      departmentName: 'All Departments',
      isHalfDay: false,
      isOptional: false,
      isActive: true,
      year: 2026,
      createdAt: new Date('2026-01-01T00:00:00Z'),
    },
    {
      id: 5,
      holidayDate: '2026-05-01',
      holidayName: 'Maestro Port Operations Day',
      description: 'Special Department Holiday for Maestro Import',
      departmentId: 5,
      departmentName: 'Maestro_Import',
      isHalfDay: false,
      isOptional: false,
      isActive: true,
      year: 2026,
      createdAt: new Date('2026-01-01T00:00:00Z'),
    },
    {
      id: 6,
      holidayDate: '2026-09-17',
      holidayName: 'Transport Fleet Maintenance Holiday',
      description: 'Annual fleet maintenance day for A R Transportation',
      departmentId: 6,
      departmentName: 'A R Transportation',
      isHalfDay: false,
      isOptional: false,
      isActive: true,
      year: 2026,
      createdAt: new Date('2026-01-01T00:00:00Z'),
    },
    {
      id: 7,
      holidayDate: '2026-11-01',
      holidayName: 'CFS Terminal Foundation Day',
      description: 'Maestro CFS Terminal operational holiday',
      holidayListId: 4,
      holidayListCode: 'HL_MAESTRO_CFS_2026',
      holidayListName: 'Maestro CFS Holiday List 2026',
      departmentId: 7,
      departmentName: 'Maestro CFS',
      isHalfDay: false,
      isOptional: false,
      isActive: true,
      year: 2026,
      createdAt: new Date('2026-01-01T00:00:00Z'),
    },
  ];
}

function saveHolidaysToDisk(): void {
  try {
    const dir = path.dirname(HOLIDAYS_STORAGE_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(
      HOLIDAYS_STORAGE_FILE,
      JSON.stringify(
        {
          holidays: memoryHolidays,
          holidayLists: memoryHolidayLists,
          employeeHolidayAssignments: memoryEmployeeHolidayAssignments,
          nextHolidayId,
          nextHolidayListId,
          nextEmpHolidayAssignId,
        },
        null,
        2
      ),
      'utf8'
    );
  } catch {}
}

function loadHolidaysFromDisk(): void {
  try {
    if (fs.existsSync(HOLIDAYS_STORAGE_FILE)) {
      const raw = fs.readFileSync(HOLIDAYS_STORAGE_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed.holidays) && parsed.holidays.length > 0) {
        memoryHolidays = parsed.holidays;
        const maxId = memoryHolidays.reduce((acc, item) => Math.max(acc, Number(item.id) || 0), 0);
        nextHolidayId = Math.max(nextHolidayId, Number(parsed.nextHolidayId) || 20, maxId + 1);
      }
      if (Array.isArray(parsed.holidayLists) && parsed.holidayLists.length > 0) {
        memoryHolidayLists = parsed.holidayLists;
        const maxListId = memoryHolidayLists.reduce((acc, item) => Math.max(acc, Number(item.id) || 0), 0);
        nextHolidayListId = Math.max(nextHolidayListId, Number(parsed.nextHolidayListId) || 10, maxListId + 1);
      }
      if (Array.isArray(parsed.employeeHolidayAssignments)) {
        memoryEmployeeHolidayAssignments = parsed.employeeHolidayAssignments;
        const maxAssignId = memoryEmployeeHolidayAssignments.reduce((acc, item) => Math.max(acc, Number(item.id) || 0), 0);
        nextEmpHolidayAssignId = Math.max(
          nextEmpHolidayAssignId,
          Number(parsed.nextEmpHolidayAssignId) || 10,
          maxAssignId + 1
        );
      }
    }
  } catch {}
}

loadHolidaysFromDisk();

export class HolidayService {
  public static resetMemoryHolidays(options?: { preservePersistedDisk?: boolean }): void {
    memoryHolidays = createDefaultHolidays();
    memoryHolidayLists = createDefaultHolidayLists();
    memoryEmployeeHolidayAssignments = [];
    nextHolidayId = 20;
    nextHolidayListId = 10;
    nextEmpHolidayAssignId = 10;
    if (options?.preservePersistedDisk) {
      loadHolidaysFromDisk();
    } else {
      saveHolidaysToDisk();
    }
  }

  public static simulateServerRestart(): void {
    memoryHolidays = [];
    memoryHolidayLists = [];
    memoryEmployeeHolidayAssignments = [];
    loadHolidaysFromDisk();
    if (memoryHolidays.length === 0) {
      memoryHolidays = createDefaultHolidays();
    }
    if (memoryHolidayLists.length === 0) {
      memoryHolidayLists = createDefaultHolidayLists();
    }
  }

  public static setMemoryHolidays(items: HolidayDto[]): void {
    memoryHolidays = [...items];
    saveHolidaysToDisk();
  }

  public static getMemoryHolidays(): HolidayDto[] {
    return memoryHolidays;
  }

  /**
   * Validate date format 'YYYY-MM-DD'
   */
  public static validateDateString(dateStr: string): { year: number; month: number; day: number } {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      throw new ValidationError(`Invalid date format '${dateStr}'. Expected YYYY-MM-DD.`);
    }
    const [y, m, d] = dateStr.split('-').map(Number);
    const dateObj = new Date(Date.UTC(y, m - 1, d));
    if (
      dateObj.getUTCFullYear() !== y ||
      dateObj.getUTCMonth() !== m - 1 ||
      dateObj.getUTCDate() !== d
    ) {
      throw new ValidationError(`Invalid calendar date '${dateStr}'.`);
    }
    return { year: y, month: m, day: d };
  }

  /**
   * Helper to resolve department ID, code, and name
   */
  public static async resolveDepartmentMeta(
    deptInput?: number | string | null
  ): Promise<{ id: number | null; code: string | null; name: string | null }> {
    if (deptInput === undefined || deptInput === null || deptInput === '') {
      return { id: null, code: null, name: null };
    }
    try {
      const { UserService } = await import('./userService.ts');
      const d = UserService.resolveDepartmentRecordSync(deptInput);
      if (d) {
        return { id: d.id, code: d.code, name: d.name };
      }
      const asNum = Number(deptInput);
      if (!isNaN(asNum) && asNum > 0) {
        const depts = await UserService.getDepartments({ includeInactive: true });
        const found = depts.find((x) => x.id === asNum);
        return { id: asNum, code: found?.code ?? null, name: found?.name ?? null };
      }
      return { id: null, code: null, name: null };
    } catch {
      const asNum = Number(deptInput);
      return { id: !isNaN(asNum) && asNum > 0 ? asNum : null, code: null, name: null };
    }
  }

  public static async resolveDepartmentName(deptId?: number | string | null): Promise<string | null> {
    const meta = await this.resolveDepartmentMeta(deptId);
    return meta.name;
  }

  /**
   * List all holidays with optional filters (year, month, active, optional, search, department)
   */
  public static async getHolidays(filters?: HolidayFilter): Promise<HolidayDto[]> {
    let result: HolidayDto[] = [];

    if (isDbConfigured()) {
      const db = getDb();
      if (db) {
        try {
          const dbRows = await db
            .select()
            .from(holidays)
            .orderBy(holidays.holidayDate);
          result = dbRows.map((r) => ({
            id: r.id,
            holidayDate: r.holidayDate,
            holidayName: r.holidayName,
            description: r.description || null,
            departmentId: r.departmentId ?? null,
            departmentName: r.departmentName || (r.departmentId ? `Department #${r.departmentId}` : 'All Departments'),
            isHalfDay: r.isHalfDay ?? false,
            isOptional: r.isOptional,
            isActive: r.isActive,
            year: r.year,
            createdAt: r.createdAt,
            updatedAt: r.updatedAt,
          }));
        } catch (e) {
          console.warn('Failed to load holidays from db, using memory fallback:', e);
          result = [...memoryHolidays];
        }
      } else {
        result = [...memoryHolidays];
      }
    } else {
      result = [...memoryHolidays];
    }

    if (filters) {
      if (filters.year !== undefined && !isNaN(filters.year)) {
        result = result.filter((h) => h.year === Number(filters.year));
      }
      if (filters.month !== undefined && !isNaN(filters.month)) {
        result = result.filter((h) => {
          const m = parseInt(h.holidayDate.split('-')[1], 10);
          return m === Number(filters.month);
        });
      }
      if (filters.isActive !== undefined) {
        result = result.filter((h) => h.isActive === filters.isActive);
      }
      if (filters.isOptional !== undefined) {
        result = result.filter((h) => h.isOptional === filters.isOptional);
      }
      if (filters.holidayListId !== undefined && filters.holidayListId !== null) {
        const targetListId = Number(filters.holidayListId);
        const listObj = memoryHolidayLists.find((l) => l.id === targetListId);
        result = result.filter(
          (h) =>
            h.holidayListId === targetListId ||
            (listObj?.departmentId && h.departmentId === listObj.departmentId && !h.holidayListId) ||
            (listObj?.isDefault && !h.holidayListId && !h.departmentId)
        );
      }
      if (filters.strictDepartmentId !== undefined) {
        if (filters.strictDepartmentId === null || filters.strictDepartmentId === 0 || filters.strictDepartmentId === '') {
          result = result.filter((h) => h.departmentId === null || h.departmentId === undefined);
        } else {
          const strictMeta = await this.resolveDepartmentMeta(filters.strictDepartmentId);
          const strictId = strictMeta.id ?? Number(filters.strictDepartmentId);
          const deptListIds = new Set(
            memoryHolidayLists
              .filter((l) => l.departmentId === strictId && l.isActive)
              .map((l) => l.id)
          );
          result = result.filter(
            (h) => h.departmentId === strictId || (h.holidayListId !== null && h.holidayListId !== undefined && deptListIds.has(h.holidayListId))
          );
        }
      } else if (filters.departmentId !== undefined) {
        const deptMeta = filters.departmentId ? await this.resolveDepartmentMeta(filters.departmentId) : { id: null, code: null, name: null };
        const targetDeptId = deptMeta.id ?? (filters.departmentId ? Number(filters.departmentId) : null);
        if (targetDeptId === null || isNaN(targetDeptId)) {
          // General / all departments
          result = result.filter((h) => h.departmentId === null || h.departmentId === undefined);
        } else {
          // Applicable to this department: department-specific holidays (direct or via department holiday list) + all-department holidays
          const deptListIds = new Set(
            memoryHolidayLists
              .filter((l) => l.departmentId === targetDeptId && l.isActive)
              .map((l) => l.id)
          );
          const deptSpecific = result.filter(
            (h) =>
              h.departmentId === targetDeptId ||
              (h.holidayListId !== null && h.holidayListId !== undefined && deptListIds.has(h.holidayListId))
          );
          const deptDates = new Set(deptSpecific.map((h) => h.holidayDate));
          const allDeptHolidays = result.filter(
            (h) =>
              (h.departmentId === null || h.departmentId === undefined) &&
              (!h.holidayListId || h.holidayListId === 1) &&
              !deptDates.has(h.holidayDate)
          );
          result = [...deptSpecific, ...allDeptHolidays];
        }
      }

      if (filters.search && filters.search.trim().length > 0) {
        const query = filters.search.trim().toLowerCase();
        result = result.filter(
          (h) =>
            h.holidayName.toLowerCase().includes(query) ||
            h.holidayDate.includes(query) ||
            (h.description && h.description.toLowerCase().includes(query)) ||
            (h.departmentName && h.departmentName.toLowerCase().includes(query)) ||
            (h.departmentCode && h.departmentCode.toLowerCase().includes(query))
        );
      }
    }

    try {
      const { UserService } = await import('./userService.ts');
      result = result.map((h) => {
        if (h.departmentId) {
          const dept = UserService.getDepartmentByIdSync(h.departmentId);
          if (dept) {
            return {
              ...h,
              departmentCode: dept.code,
              departmentName: h.departmentName && h.departmentName !== 'All Departments' ? h.departmentName : dept.name,
            };
          }
        }
        return h;
      });
    } catch {}

    // Sort by holidayDate ascending
    return result.sort((a, b) => a.holidayDate.localeCompare(b.holidayDate));
  }

  /**
   * Get single holiday by ID
   */
  public static async getHolidayById(id: number): Promise<HolidayDto | null> {
    if (isDbConfigured()) {
      const db = getDb();
      if (db) {
        try {
          const rows = await db.select().from(holidays).where(eq(holidays.id, id));
          if (rows.length > 0) {
            const r = rows[0];
            return {
              id: r.id,
              holidayDate: r.holidayDate,
              holidayName: r.holidayName,
              description: r.description || null,
              departmentId: r.departmentId ?? null,
              departmentName: r.departmentName || (r.departmentId ? `Department #${r.departmentId}` : 'All Departments'),
              isHalfDay: r.isHalfDay ?? false,
              isOptional: r.isOptional,
              isActive: r.isActive,
              year: r.year,
              createdAt: r.createdAt,
              updatedAt: r.updatedAt,
            };
          }
          return null;
        } catch {}
      }
    }
    const mem = memoryHolidays.find((h) => h.id === id);
    return mem ? { ...mem } : null;
  }

  /**
   * Retrieve holidays applicable to a specific employee based on their department
   */
  public static async getHolidaysForEmployee(employeeId: number | string, year?: number): Promise<HolidayDto[]> {
    let numericEmpId = Number(employeeId);
    let empDeptId: number | null = null;
    try {
      const { UserService } = await import('./userService.ts');
      const empRec = UserService.resolveEmployeeRecordSync(employeeId);
      if (empRec) {
        if (empRec.employeeId) numericEmpId = empRec.employeeId;
        if (empRec.departmentId) empDeptId = empRec.departmentId;
      }
    } catch {}

    const assignments = await this.getEmployeeHolidayAssignments(numericEmpId);
    const activeAssign = assignments.find((a) => a.isActive);
    if (activeAssign) {
      return this.getHolidays({
        year,
        holidayListId: activeAssign.holidayListId,
        isActive: true,
      });
    }

    let deptId: number | null = null;
    try {
      const { ShiftService } = await import('./shiftService.ts');
      const dept = ShiftService.getEmployeeDepartment(numericEmpId);
      if (dept) deptId = dept;
    } catch {}

    if (!deptId && empDeptId) {
      deptId = empDeptId;
    }

    if (!deptId) {
      try {
        const { UserService } = await import('./userService.ts');
        const emp = await UserService.getEmployeeById(employeeId);
        if (emp && emp.departmentId) {
          deptId = emp.departmentId;
        }
      } catch {}
    }

    return this.getHolidays({
      year,
      departmentId: deptId ?? undefined,
      isActive: true,
    });
  }

  /**
   * Retrieve holidays for a specific department
   */
  public static async getDepartmentHolidays(departmentId: number | string, year?: number): Promise<HolidayDto[]> {
    return this.getHolidays({
      year,
      departmentId,
      isActive: true,
    });
  }

  /**
   * Create a new holiday with department support and duplicate prevention
   */
  public static async createHoliday(input: CreateHolidayInput): Promise<HolidayDto> {
    if (!input.holidayDate || !input.holidayDate.trim()) {
      throw new ValidationError('Holiday date is required');
    }
    if (!input.holidayName || !input.holidayName.trim()) {
      throw new ValidationError('Holiday name is required');
    }

    const { year } = this.validateDateString(input.holidayDate.trim());
    const holidayDate = input.holidayDate.trim();
    const holidayName = input.holidayName.trim();
    const resolvedYear = input.year || year;
    const isOptional = Boolean(input.isOptional);
    const isHalfDay = Boolean(input.isHalfDay);
    const isActive = input.isActive !== undefined ? Boolean(input.isActive) : true;
    const description = input.description ? input.description.trim() : null;
    const holidayListId = input.holidayListId ? Number(input.holidayListId) : null;
    const listObj = holidayListId ? memoryHolidayLists.find((l) => l.id === holidayListId) : null;
    const rawDeptInput = input.departmentCode ?? input.departmentId ?? listObj?.departmentId ?? null;
    const deptMeta = rawDeptInput ? await this.resolveDepartmentMeta(rawDeptInput) : { id: null, code: null, name: null };
    const departmentId = deptMeta.id ?? (rawDeptInput && !isNaN(Number(rawDeptInput)) ? Number(rawDeptInput) : null);
    const departmentCode = deptMeta.code ?? null;
    let departmentName = input.departmentName || deptMeta.name || null;
    if (departmentId && !departmentName) {
      departmentName = await this.resolveDepartmentName(departmentId);
    }
    if (!departmentId) {
      departmentName = 'All Departments';
    }

    // Check duplicate: a holiday is duplicate if for the SAME date and SAME department
    // If departmentId is null, check if company-wide holiday exists on that date
    if (isDbConfigured()) {
      const db = getDb();
      if (db) {
        const existing =
          departmentId !== null
            ? await db
                .select()
                .from(holidays)
                .where(
                  and(
                    eq(holidays.holidayDate, holidayDate),
                    eq(holidays.departmentId, departmentId)
                  )
                )
            : await db
                .select()
                .from(holidays)
                .where(
                  and(
                    eq(holidays.holidayDate, holidayDate),
                    isNull(holidays.departmentId)
                  )
                );

        if (existing.length > 0) {
          throw new ValidationError(
            `A holiday is already configured for date '${holidayDate}'${departmentId ? ` for this department` : ''} (${existing[0].holidayName})`
          );
        }

        const inserted = await db
          .insert(holidays)
          .values({
            holidayDate,
            holidayName,
            description,
            departmentId,
            departmentName,
            isHalfDay,
            isOptional,
            isActive,
            year: resolvedYear,
          })
          .returning();

        const r = inserted[0];
        const newDto: HolidayDto = {
          id: r.id,
          holidayDate: r.holidayDate,
          holidayName: r.holidayName,
          description: r.description || null,
          departmentId: r.departmentId ?? null,
          departmentName: r.departmentName || departmentName,
          isHalfDay: r.isHalfDay ?? false,
          isOptional: r.isOptional,
          isActive: r.isActive,
          year: r.year,
          createdAt: r.createdAt,
          updatedAt: r.updatedAt,
        };
        memoryHolidays.push(newDto);
        saveHolidaysToDisk();
        return newDto;
      }
    }

    // Memory duplicate check
    const memDup = memoryHolidays.find((h) => {
      if (h.holidayDate !== holidayDate) return false;
      if (holidayListId !== null && h.holidayListId !== undefined && h.holidayListId !== null) {
        return h.holidayListId === holidayListId;
      }
      if (departmentId !== null) {
        return h.departmentId === departmentId;
      }
      return (h.departmentId === null || h.departmentId === undefined) && !h.holidayListId;
    });

    if (memDup) {
      throw new ValidationError(
        `A holiday is already configured for date '${holidayDate}'${departmentId ? ` for this department` : ''} (${memDup.holidayName})`
      );
    }

    const newDto: HolidayDto = {
      id: nextHolidayId++,
      holidayDate,
      holidayName,
      description,
      holidayListId,
      holidayListCode: listObj?.listCode || null,
      holidayListName: listObj?.listName || null,
      departmentId,
      departmentCode,
      departmentName,
      isHalfDay,
      isOptional,
      isActive,
      year: resolvedYear,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    memoryHolidays.push(newDto);
    saveHolidaysToDisk();
    return newDto;
  }

  /**
   * Update an existing holiday
   */
  public static async updateHoliday(id: number, input: UpdateHolidayInput): Promise<HolidayDto> {
    const existing = await this.getHolidayById(id);
    if (!existing) {
      throw new ValidationError(`Holiday with ID ${id} not found`);
    }

    let holidayDate = existing.holidayDate;
    let resolvedYear = existing.year;
    const departmentId =
      input.departmentId !== undefined
        ? input.departmentId
          ? Number(input.departmentId)
          : null
        : existing.departmentId ?? null;

    let departmentName = input.departmentName;
    if (departmentId && !departmentName) {
      departmentName = await this.resolveDepartmentName(departmentId);
    }
    if (!departmentId) {
      departmentName = 'All Departments';
    }

    if (input.holidayDate && input.holidayDate.trim()) {
      const trimmed = input.holidayDate.trim();
      const { year } = this.validateDateString(trimmed);
      holidayDate = trimmed;
      resolvedYear = input.year || year;
    }

    // Duplicate check for update
    if (isDbConfigured()) {
      const db = getDb();
      if (db) {
        const dupRows =
          departmentId !== null
            ? await db
                .select()
                .from(holidays)
                .where(
                  and(
                    eq(holidays.holidayDate, holidayDate),
                    eq(holidays.departmentId, departmentId)
                  )
                )
            : await db
                .select()
                .from(holidays)
                .where(
                  and(
                    eq(holidays.holidayDate, holidayDate),
                    isNull(holidays.departmentId)
                  )
                );

        if (dupRows.length > 0 && dupRows[0].id !== id) {
          throw new ValidationError(
            `A holiday is already configured for date '${holidayDate}'${departmentId ? ` for this department` : ''} (${dupRows[0].holidayName})`
          );
        }
      }
    }

    const memDup = memoryHolidays.find((h) => {
      if (h.id === id || h.holidayDate !== holidayDate) return false;
      if (departmentId !== null) return h.departmentId === departmentId;
      return h.departmentId === null || h.departmentId === undefined;
    });

    if (memDup) {
      throw new ValidationError(
        `A holiday is already configured for date '${holidayDate}'${departmentId ? ` for this department` : ''} (${memDup.holidayName})`
      );
    }

    const holidayName =
      input.holidayName !== undefined ? input.holidayName.trim() : existing.holidayName;
    if (!holidayName) {
      throw new ValidationError('Holiday name cannot be empty');
    }

    const description =
      input.description !== undefined
        ? input.description
          ? input.description.trim()
          : null
        : existing.description;
    const isHalfDay =
      input.isHalfDay !== undefined ? Boolean(input.isHalfDay) : Boolean(existing.isHalfDay);
    const isOptional =
      input.isOptional !== undefined ? Boolean(input.isOptional) : existing.isOptional;
    const isActive =
      input.isActive !== undefined ? Boolean(input.isActive) : existing.isActive;
    const now = new Date();

    if (isDbConfigured()) {
      const db = getDb();
      if (db) {
        const updated = await db
          .update(holidays)
          .set({
            holidayDate,
            holidayName,
            description,
            departmentId,
            departmentName,
            isHalfDay,
            isOptional,
            isActive,
            year: resolvedYear,
            updatedAt: now,
          })
          .where(eq(holidays.id, id))
          .returning();

        if (updated.length > 0) {
          const r = updated[0];
          const dto: HolidayDto = {
            id: r.id,
            holidayDate: r.holidayDate,
            holidayName: r.holidayName,
            description: r.description || null,
            departmentId: r.departmentId ?? null,
            departmentName: r.departmentName || departmentName,
            isHalfDay: r.isHalfDay ?? false,
            isOptional: r.isOptional,
            isActive: r.isActive,
            year: r.year,
            createdAt: r.createdAt,
            updatedAt: r.updatedAt,
          };
          const memIdx = memoryHolidays.findIndex((h) => h.id === id);
          if (memIdx >= 0) memoryHolidays[memIdx] = dto;
          saveHolidaysToDisk();
          return dto;
        }
      }
    }

    const updatedDto: HolidayDto = {
      ...existing,
      holidayDate,
      holidayName,
      description,
      departmentId,
      departmentName,
      isHalfDay,
      isOptional,
      isActive,
      year: resolvedYear,
      updatedAt: now,
    };
    const memIdx = memoryHolidays.findIndex((h) => h.id === id);
    if (memIdx >= 0) memoryHolidays[memIdx] = updatedDto;
    saveHolidaysToDisk();
    return updatedDto;
  }

  /**
   * Delete a holiday
   */
  public static async deleteHoliday(id: number, actor?: AuthContext): Promise<boolean> {
    const existing = await this.getHolidayById(id);
    if (!existing) {
      throw new ValidationError(`Holiday with ID ${id} not found`);
    }

    if (isDbConfigured()) {
      const db = getDb();
      if (db) {
        await db.delete(holidays).where(eq(holidays.id, id));
      }
    }
    memoryHolidays = memoryHolidays.filter((h) => h.id !== id);
    saveHolidaysToDisk();

    await AuditService.logEvent({
      actorId: actor?.userId || null,
      actorRole: actor?.role || 'SUPER_ADMIN',
      action: 'HOLIDAY_DELETED',
      targetEntity: 'holidays',
      targetId: String(id),
      metadata: {
        holidayName: existing.holidayName,
        holidayDate: existing.holidayDate,
        year: existing.year,
        holidayListId: existing.holidayListId,
      },
    });

    return true;
  }

  // ============================================================================
  // HOLIDAY LISTS & EFFECTIVE-DATED EMPLOYEE ASSIGNMENTS
  // ============================================================================

  public static async ensureDefaultHolidayLists(): Promise<void> {
    if (!isDbConfigured()) return;
    const db = getDb();
    if (!db) throw new Error('Database is configured but unavailable while initializing holiday lists.');

    const departmentRows = await db.select().from(departments);
    const departmentCodeByList: Record<string, string> = {
      HL_MAESTRO_IMPORT_2026: 'MT_IMP',
      HL_AR_TRANS_2026: 'AR_TNSPRT_USA',
      HL_MAESTRO_CFS_2026: 'MT_CSF_USA',
    };

    for (const list of createDefaultHolidayLists()) {
      const [existing] = await db
        .select()
        .from(holidayLists)
        .where(eq(holidayLists.listCode, list.listCode))
        .limit(1);
      if (existing) continue;

      const departmentCode = departmentCodeByList[list.listCode];
      const department = departmentCode
        ? departmentRows.find((row) => String(row.code).toUpperCase() === departmentCode)
        : null;
      if (departmentCode && !department) {
        throw new Error(`Cannot initialize holiday list '${list.listCode}': department code '${departmentCode}' was not found.`);
      }

      await db
        .insert(holidayLists)
        .values({
          listCode: list.listCode,
          listName: list.listName,
          year: list.year,
          departmentId: department?.id ?? null,
          isDefault: list.isDefault,
          isActive: list.isActive,
          description: list.description ?? null,
        })
        .onConflictDoNothing({ target: holidayLists.listCode });
    }
  }

  public static async getHolidayLists(options?: {
    year?: number;
    includeInactive?: boolean;
  }): Promise<HolidayListDto[]> {
    let lists = [...memoryHolidayLists];
    if (isDbConfigured()) {
      const db = getDb();
      if (db) {
        try {
          const rows = await db.select().from(holidayLists).orderBy(holidayLists.id);
          if (rows.length > 0) {
            lists = await Promise.all(
              rows.map(async (r) => ({
                id: r.id,
                listCode: r.listCode,
                listName: r.listName,
                year: r.year,
                departmentId: r.departmentId ?? null,
                departmentName: r.departmentId
                  ? await this.resolveDepartmentName(r.departmentId)
                  : 'All Departments',
                isDefault: r.isDefault,
                isActive: r.isActive,
                description: r.description,
                createdAt: r.createdAt,
                updatedAt: r.updatedAt,
              }))
            );
          }
        } catch {}
      }
    }

    if (options?.year) {
      lists = lists.filter((l) => l.year === Number(options.year));
    }
    if (!options?.includeInactive) {
      lists = lists.filter((l) => l.isActive);
    }

    const allHols = await this.getHolidays({ isActive: true });
    return lists.map((l) => ({
      ...l,
      holidayCount: allHols.filter(
        (h) =>
          h.holidayListId === l.id ||
          (l.departmentId && h.departmentId === l.departmentId && !h.holidayListId) ||
          (l.isDefault && !h.holidayListId && !h.departmentId)
      ).length,
    }));
  }

  public static async createHolidayList(
    input: CreateHolidayListInput,
    actor?: AuthContext
  ): Promise<HolidayListDto> {
    const listCode = (input.listCode || '').trim().toUpperCase();
    const listName = (input.listName || '').trim();
    if (!listCode) throw new ValidationError('Holiday list code is required.');
    if (!listName) throw new ValidationError('Holiday list name is required.');

    if (memoryHolidayLists.some((l) => l.listCode.toUpperCase() === listCode)) {
      throw new ValidationError(`Holiday list code '${listCode}' already exists.`);
    }

    const year = input.year ? Number(input.year) : 2026;
    const rawDeptInput = input.departmentCode ?? input.departmentId ?? null;
    const deptMeta = rawDeptInput ? await this.resolveDepartmentMeta(rawDeptInput) : { id: null, code: null, name: null };
    const departmentId = deptMeta.id ?? (rawDeptInput && !isNaN(Number(rawDeptInput)) ? Number(rawDeptInput) : null);
    const departmentCode = deptMeta.code ?? null;
    const departmentName = departmentId
      ? deptMeta.name || (await this.resolveDepartmentName(departmentId))
      : 'All Departments';
    const isDefault = Boolean(input.isDefault);
    const isActive = input.isActive !== undefined ? Boolean(input.isActive) : true;
    const description = input.description ? input.description.trim() : null;

    if (isDefault) {
      memoryHolidayLists.forEach((l) => {
        if (l.year === year) l.isDefault = false;
      });
    }

    let created: HolidayListDto = {
      id: nextHolidayListId++,
      listCode,
      listName,
      year,
      departmentId,
      departmentCode,
      departmentName,
      isDefault,
      isActive,
      description,
      holidayCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    if (isDbConfigured()) {
      const db = getDb();
      if (!db) throw new Error('Database is configured but unavailable while creating a holiday list.');
      const rows = await db
        .insert(holidayLists)
        .values({
          listCode,
          listName,
          year,
          departmentId,
          isDefault,
          isActive,
          description,
        })
        .returning();
      if (!rows[0]) throw new Error('Holiday list was not persisted to the database.');
      created = {
        ...created,
        id: rows[0].id,
      };
    }

    memoryHolidayLists.push(created);
    saveHolidaysToDisk();

    await AuditService.logEvent({
      actorId: actor?.userId || null,
      actorRole: actor?.role || 'SUPER_ADMIN',
      action: 'HOLIDAY_LIST_CREATED',
      targetEntity: 'holiday_lists',
      targetId: String(created.id),
      metadata: { listCode, listName, year, departmentId, isDefault },
    });

    return created;
  }

  public static async updateHolidayList(
    id: number,
    input: Partial<CreateHolidayListInput>,
    actor?: AuthContext
  ): Promise<HolidayListDto> {
    const idx = memoryHolidayLists.findIndex((l) => l.id === Number(id));
    if (idx < 0) {
      throw new ValidationError(`Holiday list #${id} not found.`);
    }
    const existing = memoryHolidayLists[idx];
    const listCode = input.listCode !== undefined ? input.listCode.trim().toUpperCase() : existing.listCode;
    const listName = input.listName !== undefined ? input.listName.trim() : existing.listName;
    if (!listCode) throw new ValidationError('Holiday list code is required.');
    if (!listName) throw new ValidationError('Holiday list name is required.');

    if (
      memoryHolidayLists.some(
        (l) => l.id !== Number(id) && l.listCode.toUpperCase() === listCode
      )
    ) {
      throw new ValidationError(`Holiday list code '${listCode}' already exists.`);
    }

    const year = input.year !== undefined ? Number(input.year) : existing.year;
    const departmentId =
      input.departmentId !== undefined
        ? input.departmentId
          ? Number(input.departmentId)
          : null
        : existing.departmentId ?? null;
    const departmentName = departmentId
      ? await this.resolveDepartmentName(departmentId)
      : 'All Departments';
    const isDefault = input.isDefault !== undefined ? Boolean(input.isDefault) : existing.isDefault;
    const isActive = input.isActive !== undefined ? Boolean(input.isActive) : existing.isActive;
    const description =
      input.description !== undefined ? input.description?.trim() || null : existing.description;

    if (isDefault) {
      memoryHolidayLists.forEach((l) => {
        if (l.year === year && l.id !== Number(id)) l.isDefault = false;
      });
    }

    const updated: HolidayListDto = {
      ...existing,
      listCode,
      listName,
      year,
      departmentId,
      departmentName,
      isDefault,
      isActive,
      description,
      updatedAt: new Date(),
    };
    memoryHolidayLists[idx] = updated;
    saveHolidaysToDisk();

    if (isDbConfigured()) {
      const db = getDb();
      if (db) {
        try {
          await db
            .update(holidayLists)
            .set({
              listCode,
              listName,
              year,
              departmentId,
              isDefault,
              isActive,
              description,
              updatedAt: new Date(),
            })
            .where(eq(holidayLists.id, Number(id)));
        } catch {}
      }
    }

    await AuditService.logEvent({
      actorId: actor?.userId || null,
      actorRole: actor?.role || 'SUPER_ADMIN',
      action: 'HOLIDAY_LIST_UPDATED',
      targetEntity: 'holiday_lists',
      targetId: String(id),
      metadata: { listCode, listName, year, departmentId, isDefault, isActive },
    });

    return updated;
  }

  public static async deleteHolidayList(
    id: number,
    actor?: AuthContext,
    force?: boolean
  ): Promise<{ success: boolean; message: string }> {
    const idx = memoryHolidayLists.findIndex((l) => l.id === Number(id));
    if (idx < 0) {
      throw new ValidationError(`Holiday list #${id} not found.`);
    }
    const existing = memoryHolidayLists[idx];
    if (existing.isDefault && !force) {
      throw new ValidationError('Default company holiday list cannot be deleted without administrative confirmation.', { isDependencyError: true });
    }

    // Check assignments
    const assignedCount = memoryEmployeeHolidayAssignments.filter((a) => a.holidayListId === Number(id)).length;
    if (assignedCount > 0 && !force) {
      throw new ValidationError(
        `Cannot delete holiday list '${existing.listName}': Assigned to ${assignedCount} employee(s). Deleting requires administrative confirmation.`,
        { isDependencyError: true, assignedCount: String(assignedCount) }
      );
    }

    if (force && actor?.role === 'SUPER_ADMIN') {
      memoryEmployeeHolidayAssignments = memoryEmployeeHolidayAssignments.filter((a) => a.holidayListId !== Number(id));
      memoryHolidays = memoryHolidays.filter((h) => h.holidayListId !== Number(id));
    }

    memoryHolidayLists.splice(idx, 1);
    saveHolidaysToDisk();

    if (isDbConfigured()) {
      const db = getDb();
      if (db) {
        try {
          if (force && actor?.role === 'SUPER_ADMIN') {
            await db.delete(employeeHolidayAssignments).where(eq(employeeHolidayAssignments.holidayListId, Number(id)));
            await db.delete(holidays).where(eq(holidays.holidayListId, Number(id)));
          }
          await db.delete(holidayLists).where(eq(holidayLists.id, Number(id)));
        } catch {}
      }
    }

    await AuditService.logEvent({
      actorId: actor?.userId || null,
      actorRole: actor?.role || 'SUPER_ADMIN',
      action: 'HOLIDAY_LIST_DELETED',
      targetEntity: 'holiday_lists',
      targetId: String(id),
      metadata: { listCode: existing.listCode, listName: existing.listName, forced: Boolean(force) },
    });

    return { success: true, message: `Holiday list '${existing.listName}' deleted successfully.` };
  }

  public static async assignEmployeeHolidayList(
    input: AssignEmployeeHolidayListInput,
    actor?: AuthContext
  ): Promise<EmployeeHolidayAssignmentDto> {
    return this.assignHolidayListToEmployee(input, actor);
  }

  public static async deleteEmployeeHolidayAssignment(
    id: number,
    actor?: AuthContext
  ): Promise<{ success: boolean }> {
    await this.removeEmployeeHolidayAssignment(id, actor);
    return { success: true };
  }

  public static async getEmployeeHolidayAssignments(
    employeeId?: number | string,
    options?: { skipEmployeeLookup?: boolean }
  ): Promise<EmployeeHolidayAssignmentDto[]> {
    let targetEmpId: number | undefined = undefined;
    if (employeeId !== undefined && employeeId !== null && employeeId !== '') {
      const asNum = Number(employeeId);
      if (!isNaN(asNum) && /^\d+$/.test(String(employeeId).trim())) {
        targetEmpId = asNum;
      } else {
        try {
          const { UserService } = await import('./userService.ts');
          const resolved = UserService.resolveEmployeeRecordSync(employeeId);
          targetEmpId = resolved?.employeeId ?? Number(employeeId);
        } catch {
          targetEmpId = Number(employeeId);
        }
      }
    }

    let list = [...memoryEmployeeHolidayAssignments];
    if (isDbConfigured()) {
      const db = getDb();
      if (db) {
        try {
          const rows = await db
            .select()
            .from(employeeHolidayAssignments)
            .orderBy(desc(employeeHolidayAssignments.effectiveFrom));
          if (rows.length > 0) {
            list = rows.map((r) => {
              const hl = memoryHolidayLists.find((l) => l.id === r.holidayListId);
              return {
                id: r.id,
                employeeId: r.employeeId,
                holidayListId: r.holidayListId,
                holidayListCode: hl?.listCode,
                holidayListName: hl?.listName,
                effectiveFrom: r.effectiveFrom,
                effectiveTo: r.effectiveTo,
                assignedBy: r.assignedBy,
                remarks: r.remarks,
                isActive: r.isActive,
                createdAt: r.createdAt,
                updatedAt: r.updatedAt,
              };
            });
          }
        } catch {}
      }
    }

    if (targetEmpId !== undefined) {
      list = list.filter((a) => a.employeeId === targetEmpId);
    }

    if (options?.skipEmployeeLookup) {
      return list.map((a) => {
        const hl = memoryHolidayLists.find((l) => l.id === a.holidayListId);
        return {
          ...a,
          holidayListCode: hl?.listCode || a.holidayListCode,
          holidayListName: hl?.listName || a.holidayListName,
        };
      });
    }

    try {
      const { UserService } = await import('./userService.ts');
      const emps = await UserService.getAllEmployees();
      const empMap = new Map(emps.map((e) => [e.id, e]));
      return list.map((a) => {
        const emp = empMap.get(a.employeeId);
        const hl = memoryHolidayLists.find((l) => l.id === a.holidayListId);
        return {
          ...a,
          employeeName: emp?.employeeName || a.employeeName || `Employee #${a.employeeId}`,
          employeeCode: emp?.employeeCode || a.employeeCode || `EMP${a.employeeId}`,
          holidayListCode: hl?.listCode || a.holidayListCode,
          holidayListName: hl?.listName || a.holidayListName,
        };
      });
    } catch {
      return list;
    }
  }

  public static async assignHolidayListToEmployee(
    input: AssignEmployeeHolidayListInput,
    actor?: AuthContext
  ): Promise<EmployeeHolidayAssignmentDto> {
    const rawEmpRef = input.employeeId ?? input.employeeCode;
    if (!rawEmpRef) throw new ValidationError('Employee ID is required.');
    if (!input.holidayListId) throw new ValidationError('Holiday List ID is required.');
    if (!input.effectiveFrom) throw new ValidationError('Effective From date is required.');

    let resolvedEmpId = Number(rawEmpRef);
    let resolvedEmpCode: string | undefined = input.employeeCode;
    let resolvedEmpName: string | undefined = undefined;
    try {
      const { UserService } = await import('./userService.ts');
      const empRec = UserService.resolveEmployeeRecordSync(rawEmpRef);
      if (empRec) {
        if (empRec.employeeId) resolvedEmpId = empRec.employeeId;
        if (empRec.employeeCode) resolvedEmpCode = empRec.employeeCode;
        if (empRec.employeeName) resolvedEmpName = empRec.employeeName;
      }
    } catch {}

    this.validateDateString(input.effectiveFrom.trim());
    const effectiveFrom = input.effectiveFrom.trim();
    let effectiveTo: string | null = null;
    if (input.effectiveTo && input.effectiveTo.trim()) {
      this.validateDateString(input.effectiveTo.trim());
      effectiveTo = input.effectiveTo.trim();
      if (effectiveTo < effectiveFrom) {
        throw new ValidationError('Effective To date cannot be earlier than Effective From date.');
      }
    }

    const lists = await this.getHolidayLists({ includeInactive: true });
    const targetList = lists.find((l) => l.id === Number(input.holidayListId));
    if (!targetList) {
      throw new ValidationError(`Holiday list with ID ${input.holidayListId} not found.`);
    }
    if (!targetList.isActive) {
      throw new ValidationError(`Holiday list '${targetList.listName}' is inactive and cannot be assigned.`);
    }

    // Check overlapping assignments for this employee
    const existing = memoryEmployeeHolidayAssignments
      .filter((a) => a.employeeId === resolvedEmpId && a.isActive)
      .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom));
    const priorAssignment = existing.length > 0 ? existing[0] : null;
    const beforeListName = priorAssignment
      ? priorAssignment.holidayListName || priorAssignment.holidayListCode || String(priorAssignment.holidayListId)
      : 'Company Default';
    const beforeListCode = priorAssignment?.holidayListCode || 'DEFAULT';

    for (const ex of existing) {
      // Auto-close open-ended prior assignment if new assignment starts strictly after it
      if (!ex.effectiveTo && ex.effectiveFrom < effectiveFrom) {
        const [y, m, d] = effectiveFrom.split('-').map(Number);
        const prevDay = new Date(Date.UTC(y, m - 1, d - 1)).toISOString().split('T')[0];
        ex.effectiveTo = prevDay;
        continue;
      }
      // If replacing an open-ended assignment on the exact same start date with another open-ended assignment, preserve old record in history
      if (!ex.effectiveTo && !effectiveTo && ex.effectiveFrom === effectiveFrom) {
        ex.isActive = false;
        ex.effectiveTo = effectiveFrom;
        continue;
      }
      const exEnd = ex.effectiveTo || '9999-12-31';
      const newEnd = effectiveTo || '9999-12-31';
      if (effectiveFrom <= exEnd && newEnd >= ex.effectiveFrom) {
        throw new ValidationError(
          `Overlapping holiday list assignment detected for employee #${resolvedEmpId} (${ex.effectiveFrom} to ${ex.effectiveTo || 'open-ended'}).`
        );
      }
    }

    let created: EmployeeHolidayAssignmentDto = {
      id: nextEmpHolidayAssignId++,
      employeeId: resolvedEmpId,
      employeeCode: resolvedEmpCode,
      employeeName: resolvedEmpName,
      holidayListId: Number(input.holidayListId),
      holidayListCode: targetList.listCode,
      holidayListName: targetList.listName,
      effectiveFrom,
      effectiveTo,
      assignedBy: actor?.userId || null,
      remarks: input.remarks?.trim() || null,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    if (isDbConfigured()) {
      const db = getDb();
      if (!db) throw new Error('Database is configured but unavailable while assigning a holiday list.');
      const rows = await db
        .insert(employeeHolidayAssignments)
        .values({
          employeeId: resolvedEmpId,
          holidayListId: Number(input.holidayListId),
          effectiveFrom,
          effectiveTo,
          assignedBy: actor?.userId || null,
          remarks: created.remarks,
          isActive: true,
        })
        .returning();
      if (!rows[0]) throw new Error('Holiday list assignment was not persisted to the database.');
      created.id = rows[0].id;
    }

    memoryEmployeeHolidayAssignments.push(created);
    saveHolidaysToDisk();

    await AuditService.logEvent({
      actorId: actor?.userId || null,
      actorRole: actor?.role || 'SUPER_ADMIN',
      action: 'EMPLOYEE_HOLIDAY_LIST_ASSIGNED',
      targetEntity: 'employee_holiday_assignments',
      targetId: String(created.id),
      metadata: {
        employeeId: created.employeeId,
        employeeCode: resolvedEmpCode ?? null,
        before: beforeListName,
        after: targetList.listName,
        beforeCode: beforeListCode,
        afterCode: targetList.listCode,
        holidayListId: created.holidayListId,
        holidayListCode: targetList.listCode,
        holidayListName: targetList.listName,
        effectiveFrom,
        effectiveTo,
        remarks: created.remarks,
      },
    });

    const enriched = await this.getEmployeeHolidayAssignments(created.employeeId);
    return enriched.find((a) => a.id === created.id) || created;
  }

  public static async removeEmployeeHolidayAssignment(
    id: number,
    actor?: AuthContext
  ): Promise<boolean> {
    const idx = memoryEmployeeHolidayAssignments.findIndex((a) => a.id === Number(id));
    if (idx < 0) {
      throw new ValidationError(`Employee holiday assignment #${id} not found.`);
    }
    const removed = memoryEmployeeHolidayAssignments[idx];
    memoryEmployeeHolidayAssignments.splice(idx, 1);
    saveHolidaysToDisk();

    if (isDbConfigured()) {
      const db = getDb();
      if (db) {
        try {
          await db
            .delete(employeeHolidayAssignments)
            .where(eq(employeeHolidayAssignments.id, Number(id)));
        } catch {}
      }
    }

    await AuditService.logEvent({
      actorId: actor?.userId || null,
      actorRole: actor?.role || 'SUPER_ADMIN',
      action: 'EMPLOYEE_HOLIDAY_LIST_REMOVED',
      targetEntity: 'employee_holiday_assignments',
      targetId: String(id),
      metadata: {
        employeeId: removed.employeeId,
        holidayListId: removed.holidayListId,
      },
    });

    return true;
  }

  /**
   * Resolves the effective HolidayListDto for a given employee on a specific date
   */
  public static async resolveEmployeeHolidayListForDate(
    employeeId: number | string,
    dateStr: string
  ): Promise<HolidayListDto | null> {
    const assignments = await this.getEmployeeHolidayAssignments(employeeId, { skipEmployeeLookup: true });
    const matching = assignments.find(
      (a) =>
        a.isActive &&
        a.effectiveFrom <= dateStr &&
        (!a.effectiveTo || a.effectiveTo >= dateStr)
    );
    if (!matching) return null;
    const lists = await this.getHolidayLists({ includeInactive: true });
    return lists.find((l) => l.id === matching.holidayListId && l.isActive) || null;
  }

  public static resolveHolidayListSummaryForEmployee(
    employeeId: number | string,
    departmentId: number | string | null,
    dateStr: string
  ): {
    source: 'EMPLOYEE' | 'DEPARTMENT' | 'DEFAULT' | 'NONE';
    assignment: EmployeeHolidayAssignmentDto | null;
    holidayList: HolidayListDto | null;
  } {
    let resolvedEmpId = Number(employeeId);
    let resolvedDeptId: number | null =
      departmentId !== null && departmentId !== undefined && !isNaN(Number(departmentId))
        ? Number(departmentId)
        : null;
    try {
      // Optional synchronous resolution if UserService is loaded
      const empAssignments = memoryEmployeeHolidayAssignments.filter(
        (a) => a.employeeId === resolvedEmpId && a.isActive
      );
      if (empAssignments.length === 0 && isNaN(resolvedEmpId)) {
        // Fallback when string code passed
      }
    } catch {}

    const empAssignments = memoryEmployeeHolidayAssignments.filter(
      (a) => a.employeeId === Number(resolvedEmpId) && a.isActive
    );
    const matching =
      empAssignments.find(
        (a) => a.effectiveFrom <= dateStr && (!a.effectiveTo || a.effectiveTo >= dateStr)
      ) ||
      empAssignments[0] ||
      null;

    let matchedList: HolidayListDto | null = null;
    let source: 'EMPLOYEE' | 'DEPARTMENT' | 'DEFAULT' | 'NONE' = 'NONE';

    if (matching) {
      matchedList = memoryHolidayLists.find((l) => l.id === matching.holidayListId && l.isActive) || null;
      if (matchedList) source = 'EMPLOYEE';
    }

    if (!matchedList && resolvedDeptId) {
      matchedList = memoryHolidayLists.find((l) => l.departmentId === Number(resolvedDeptId) && l.isActive) || null;
      if (matchedList) source = 'DEPARTMENT';
    }

    if (!matchedList) {
      matchedList =
        memoryHolidayLists.find((l) => l.isDefault && l.isActive) ||
        memoryHolidayLists.find((l) => l.isActive) ||
        null;
      if (matchedList) source = 'DEFAULT';
    }

    return {
      source,
      assignment: matching,
      holidayList: matchedList
        ? {
            ...matchedList,
            code: matchedList.listCode,
            name: matchedList.listName,
          }
        : null,
    };
  }

  public static async resolveHolidayListForEmployee(
    employeeId: number | string,
    departmentId: number | string | null,
    dateStr: string
  ): Promise<{
    source: 'EMPLOYEE' | 'DEPARTMENT' | 'DEFAULT' | 'NONE';
    assignment: EmployeeHolidayAssignmentDto | null;
    holidayList: (HolidayListDto & { holidays: HolidayDto[] }) | null;
  }> {
    let resolvedEmpId = Number(employeeId);
    let resolvedDeptId: number | null = null;
    try {
      const { UserService } = await import('./userService.ts');
      const empRec = UserService.resolveEmployeeRecordSync(employeeId);
      if (empRec?.employeeId) resolvedEmpId = empRec.employeeId;
      if (departmentId !== null && departmentId !== undefined && departmentId !== '') {
        const deptRec = UserService.resolveDepartmentRecordSync(departmentId);
        resolvedDeptId = deptRec ? deptRec.id : Number(departmentId);
      } else if (empRec?.departmentId) {
        resolvedDeptId = empRec.departmentId;
      }
    } catch {
      resolvedDeptId = departmentId ? Number(departmentId) : null;
    }

    const summary = this.resolveHolidayListSummaryForEmployee(resolvedEmpId, resolvedDeptId, dateStr);
    if (!summary.holidayList) {
      return { source: 'NONE', assignment: null, holidayList: null };
    }

    const listHolidays = await this.getHolidays({ holidayListId: summary.holidayList.id, isActive: true });
    return {
      source: summary.source,
      assignment: summary.assignment,
      holidayList: {
        ...summary.holidayList,
        code: summary.holidayList.listCode,
        name: summary.holidayList.listName,
        holidays: listHolidays,
      },
    };
  }

  /**
   * Resolves whether a given date is an active holiday for a specific employee (or department),
   * honoring effective-dated EmployeeHolidayAssignments first, then department/company holidays.
   */
  public static async resolveHolidayForEmployeeOnDate(
    dateStr: string,
    options?: { employeeId?: number | string | null; departmentId?: number | string | null }
  ): Promise<HolidayDto | null> {
    const allActive = await this.getHolidays({ isActive: true });
    const onDate = allActive.filter((h) => h.holidayDate === dateStr && !h.isOptional);
    if (onDate.length === 0) return null;

    let resolvedEmpId: number | null = null;
    let resolvedDeptId: number | null = null;
    try {
      const { UserService } = await import('./userService.ts');
      if (options?.employeeId) {
        const empRec = UserService.resolveEmployeeRecordSync(options.employeeId);
        resolvedEmpId = empRec?.employeeId ?? Number(options.employeeId);
        if (!options.departmentId && empRec?.departmentId) {
          resolvedDeptId = empRec.departmentId;
        }
      }
      if (options?.departmentId) {
        const deptRec = UserService.resolveDepartmentRecordSync(options.departmentId);
        resolvedDeptId = deptRec ? deptRec.id : Number(options.departmentId);
      }
    } catch {
      if (options?.employeeId) resolvedEmpId = Number(options.employeeId);
      if (options?.departmentId) resolvedDeptId = Number(options.departmentId);
    }

    if (resolvedEmpId) {
      const assignedList = await this.resolveEmployeeHolidayListForDate(
        resolvedEmpId,
        dateStr
      );
      if (assignedList) {
        // Check holiday explicitly linked to this list, or linked to the list's department, or company-wide default
        const listSpecific = onDate.find(
          (h) =>
            h.holidayListId === assignedList.id ||
            (assignedList.departmentId &&
              h.departmentId === assignedList.departmentId &&
              !h.holidayListId)
        );
        if (listSpecific) return listSpecific;
        const globalDefault = onDate.find(
          (h) =>
            (h.departmentId === null || h.departmentId === undefined) &&
            (!h.holidayListId || h.holidayListId === 1)
        );
        return globalDefault || null;
      }
    }

    const targetDeptId = resolvedDeptId;
    if (targetDeptId !== null && !isNaN(targetDeptId)) {
      const deptSpecific = onDate.find((h) => h.departmentId === Number(targetDeptId) && !h.holidayListId);
      if (deptSpecific) return deptSpecific;
      const deptList = memoryHolidayLists.find(
        (l) => l.departmentId === Number(targetDeptId) && l.isActive
      );
      if (deptList) {
        const byList = onDate.find((h) => h.holidayListId === deptList.id);
        if (byList) return byList;
      }
    }

    const globalHol = onDate.find(
      (h) =>
        (h.departmentId === null || h.departmentId === undefined) &&
        (!h.holidayListId || h.holidayListId === 1)
    );
    return globalHol || null;
  }
}
