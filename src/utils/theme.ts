/**
 * MT Leave Management — Centralized Corporate Design & Semantic Colour System
 *
 * MASTER COLOUR REFERENCE: "My Schedule" (`SCHEDULE_CATEGORY_STYLES`)
 *
 * Every module across the application (Dashboard, My Leave, Leave Balance,
 * My Schedule, Team Leader / HR / Top Management Approvals, Administration,
 * User/Employee/Role/Department/Designation/Shift/Holiday Masters, Overtime,
 * Reports & MIS, System Settings, Navigation, Modals, Tables, Badges, and Alerts)
 * MUST consume this single centralized semantic colour system so that the same
 * operational meaning always uses the exact same colour treatment everywhere.
 *
 * 1. Global Application Base:
 *    - Primary page background: WHITE (#ffffff)
 *    - Main content areas: WHITE (#ffffff)
 *    - Cards / panels: WHITE (#ffffff)
 *    - Modal / dialog surface: WHITE (#ffffff)
 *    - Primary font / headings / important values: BLACK / Near-Black (#111827)
 *    - Secondary text: Dark Slate / Charcoal (#374151)
 *    - Muted text: #6b7280
 *
 * 2. Corporate Brand Colours:
 *    - Primary Corporate Red: #c8102e (Hover: #991b1b, Active: #7f1d1d)
 *    - Dark Corporate Structural Colour: Deep Navy / Charcoal (#0f172a)
 *
 * 3. Borders / Dividers:
 *    - Default border: #d1d5db
 *    - Strong border: #9ca3af
 *    - Corporate / active border: #c8102e
 *
 * 4. Status / Alert Colour System:
 *    - SUCCESS: Main #16a34a, Light bg #f0fdf4, Text #166534
 *    - WARNING: Main #d97706, Light bg #fffbeb, Text #92400e
 *    - ERROR / REJECTED: Main #dc2626, Light bg #fef2f2, Text #991b1b
 *    - INFO: Main #2563eb, Light bg #eff6ff, Text #1e40af
 *
 * 5. Master Schedule State Mapping (from My Schedule — DO NOT OVERRIDE):
 *    - WORKING_DAY: Emerald (`bg-emerald-50/70`, `border-emerald-200`, badge `bg-emerald-100 text-emerald-900 border-emerald-300`)
 *    - WEEKLY_OFF: Slate (`bg-slate-100`, `border-slate-300`, badge `bg-slate-200 text-slate-800 border-slate-400`)
 *    - PUBLIC_HOLIDAY: Amber (`bg-amber-50`, `border-amber-300`, badge `bg-amber-100 text-amber-900 border-amber-400`)
 *    - DEPARTMENT_HOLIDAY: Purple (`bg-purple-50`, `border-purple-300`, badge `bg-purple-100 text-purple-900 border-purple-400`)
 *    - APPROVED_LEAVE: Sky (`bg-sky-50`, `border-sky-300`, badge `bg-sky-100 text-sky-900 border-sky-400`)
 *    - PENDING_LEAVE: Orange (`bg-orange-50`, `border-orange-300`, badge `bg-orange-100 text-orange-900 border-orange-400`)
 *    - REJECTED_LEAVE: Rose (`bg-rose-50`, `border-rose-300`, badge `bg-rose-100 text-rose-900 border-rose-400`)
 *    - CANCELLED_LEAVE: Stone (`bg-stone-100`, `border-stone-300`, badge `bg-stone-200 text-stone-700 border-stone-400`)
 *    - HALF_DAY_LEAVE: Teal (`bg-teal-50`, `border-teal-300`, badge `bg-teal-100 text-teal-900 border-teal-400`)
 *
 * 6. Leave Type Semantic Mapping:
 *    - CL (Casual Leave) -> Sky (`bg-sky-100 text-sky-900 border border-sky-400`, bar `bg-sky-600`)
 *    - SL (Sick Leave) -> Amber (`bg-amber-100 text-amber-900 border border-amber-400`, bar `bg-amber-500`)
 *    - EL (Earned Leave) -> Emerald (`bg-emerald-100 text-emerald-900 border border-emerald-300`, bar `bg-emerald-600`)
 *    - EMERGENCY (Emergency Leave) -> Rose (`bg-rose-100 text-rose-900 border border-rose-400`, bar `bg-rose-600`)
 *    - LWP (Leave Without Pay) -> Purple (`bg-purple-100 text-purple-900 border border-purple-400`, bar `bg-purple-600`)
 */

export type ScheduleVisualCategory =
  | 'WORKING_DAY'
  | 'WEEKLY_OFF'
  | 'PUBLIC_HOLIDAY'
  | 'DEPARTMENT_HOLIDAY'
  | 'APPROVED_LEAVE'
  | 'PENDING_LEAVE'
  | 'REJECTED_LEAVE'
  | 'CANCELLED_LEAVE'
  | 'HALF_DAY_LEAVE';

export type LeaveTypeColorKey = 'CL' | 'SL' | 'EL' | 'EMERGENCY' | 'LWP' | 'HALF_DAY' | 'DEFAULT';

export interface ScheduleCategoryStyle {
  category: ScheduleVisualCategory;
  label: string;
  shortCode: string;
  description: string;
  containerClass: string;
  swatchClass: string;
  dayBadgeClass: string;
  badgeClass: string;
  titleClass: string;
  subtextClass: string;
  hoursBadgeClass: string;
  dotClass: string;
}

/**
 * Authoritative Master Visual & Semantic Colour Dictionary from My Schedule.
 * Preserved 100% unchanged as the reference for schedule/state colours.
 */
export const SCHEDULE_CATEGORY_STYLES: Record<ScheduleVisualCategory, ScheduleCategoryStyle> = {
  WORKING_DAY: {
    category: 'WORKING_DAY',
    label: 'Working Day / Shift',
    shortCode: 'SHIFT',
    description: 'Regular working day with scheduled shift segments',
    containerClass: 'bg-emerald-50/70 border-emerald-200 border-t-5 border-t-emerald-600 text-emerald-950',
    swatchClass: 'bg-emerald-100 border-emerald-400',
    dayBadgeClass: 'bg-emerald-100 text-emerald-900 border-emerald-300',
    badgeClass: 'bg-emerald-100 text-emerald-900 border-emerald-300',
    titleClass: 'text-emerald-950',
    subtextClass: 'text-emerald-800',
    hoursBadgeClass: 'bg-white/90 text-emerald-900 border-emerald-300',
    dotClass: 'bg-emerald-500',
  },
  WEEKLY_OFF: {
    category: 'WEEKLY_OFF',
    label: 'Weekly Off',
    shortCode: 'WO',
    description: 'Assigned weekly rest day (individual or company schedule)',
    containerClass: 'bg-slate-100 border-slate-300 border-t-5 border-t-slate-600 text-slate-900',
    swatchClass: 'bg-slate-200 border-slate-400',
    dayBadgeClass: 'bg-slate-200 text-slate-800 border-slate-300',
    badgeClass: 'bg-slate-200 text-slate-800 border-slate-400',
    titleClass: 'text-slate-900',
    subtextClass: 'text-slate-700',
    hoursBadgeClass: 'bg-slate-200/80 text-slate-800 border-slate-300',
    dotClass: 'bg-slate-500',
  },
  PUBLIC_HOLIDAY: {
    category: 'PUBLIC_HOLIDAY',
    label: 'Public Holiday',
    shortCode: 'PH',
    description: 'Company-wide public / gazetted holiday',
    containerClass: 'bg-amber-50 border-amber-300 border-t-5 border-t-amber-500 text-amber-950',
    swatchClass: 'bg-amber-100 border-amber-400',
    dayBadgeClass: 'bg-amber-100 text-amber-900 border-amber-300',
    badgeClass: 'bg-amber-100 text-amber-900 border-amber-400',
    titleClass: 'text-amber-950',
    subtextClass: 'text-amber-800',
    hoursBadgeClass: 'bg-amber-100/80 text-amber-900 border-amber-300',
    dotClass: 'bg-amber-500',
  },
  DEPARTMENT_HOLIDAY: {
    category: 'DEPARTMENT_HOLIDAY',
    label: 'Department Holiday',
    shortCode: 'DH',
    description: 'Department-specific holiday from assigned calendar',
    containerClass: 'bg-purple-50 border-purple-300 border-t-5 border-t-purple-600 text-purple-950',
    swatchClass: 'bg-purple-100 border-purple-400',
    dayBadgeClass: 'bg-purple-100 text-purple-900 border-purple-300',
    badgeClass: 'bg-purple-100 text-purple-900 border-purple-400',
    titleClass: 'text-purple-950',
    subtextClass: 'text-purple-800',
    hoursBadgeClass: 'bg-purple-100/80 text-purple-900 border-purple-300',
    dotClass: 'bg-purple-500',
  },
  APPROVED_LEAVE: {
    category: 'APPROVED_LEAVE',
    label: 'Approved Leave',
    shortCode: 'AL',
    description: 'Final approved full-day leave absence',
    containerClass: 'bg-sky-50 border-sky-300 border-t-5 border-t-sky-600 text-sky-950',
    swatchClass: 'bg-sky-100 border-sky-400',
    dayBadgeClass: 'bg-sky-100 text-sky-900 border-sky-300',
    badgeClass: 'bg-sky-100 text-sky-900 border-sky-400',
    titleClass: 'text-sky-950',
    subtextClass: 'text-sky-800',
    hoursBadgeClass: 'bg-sky-100/80 text-sky-900 border-sky-300',
    dotClass: 'bg-sky-500',
  },
  PENDING_LEAVE: {
    category: 'PENDING_LEAVE',
    label: 'Pending Leave',
    shortCode: 'PL',
    description: 'Leave request awaiting approval decision',
    containerClass: 'bg-orange-50 border-orange-300 border-t-5 border-t-orange-500 text-orange-950',
    swatchClass: 'bg-orange-100 border-orange-400',
    dayBadgeClass: 'bg-orange-100 text-orange-900 border-orange-300',
    badgeClass: 'bg-orange-100 text-orange-900 border-orange-400',
    titleClass: 'text-orange-950',
    subtextClass: 'text-orange-800',
    hoursBadgeClass: 'bg-orange-100/80 text-orange-900 border-orange-300',
    dotClass: 'bg-orange-500',
  },
  REJECTED_LEAVE: {
    category: 'REJECTED_LEAVE',
    label: 'Rejected Leave',
    shortCode: 'RL',
    description: 'Rejected leave request (not approved; shift remains active)',
    containerClass: 'bg-rose-50 border-rose-300 border-t-5 border-t-rose-600 text-rose-950',
    swatchClass: 'bg-rose-100 border-rose-400',
    dayBadgeClass: 'bg-rose-100 text-rose-900 border-rose-300',
    badgeClass: 'bg-rose-100 text-rose-900 border-rose-400',
    titleClass: 'text-rose-950',
    subtextClass: 'text-rose-800',
    hoursBadgeClass: 'bg-rose-100/80 text-rose-900 border-rose-300',
    dotClass: 'bg-rose-500',
  },
  CANCELLED_LEAVE: {
    category: 'CANCELLED_LEAVE',
    label: 'Cancelled Leave',
    shortCode: 'CL',
    description: 'Cancelled / withdrawn leave request (shift remains active)',
    containerClass: 'bg-stone-100 border-stone-300 border-t-5 border-t-stone-500 text-stone-800',
    swatchClass: 'bg-stone-200 border-stone-400',
    dayBadgeClass: 'bg-stone-200 text-stone-800 border-stone-300',
    badgeClass: 'bg-stone-200 text-stone-700 border-stone-400',
    titleClass: 'text-stone-800',
    subtextClass: 'text-stone-700',
    hoursBadgeClass: 'bg-stone-200/80 text-stone-800 border-stone-300',
    dotClass: 'bg-stone-500',
  },
  HALF_DAY_LEAVE: {
    category: 'HALF_DAY_LEAVE',
    label: 'Half-Day Leave',
    shortCode: 'HDL',
    description: 'Partial-day leave (0.5d leave + 0.5d scheduled shift)',
    containerClass: 'bg-teal-50 border-teal-300 border-t-5 border-t-teal-600 text-teal-950',
    swatchClass: 'bg-teal-100 border-teal-400',
    dayBadgeClass: 'bg-teal-100 text-teal-900 border-teal-300',
    badgeClass: 'bg-teal-100 text-teal-900 border-teal-400',
    titleClass: 'text-teal-950',
    subtextClass: 'text-teal-800',
    hoursBadgeClass: 'bg-teal-100/80 text-teal-900 border-teal-300',
    dotClass: 'bg-teal-500',
  },
};

/**
 * Reusable Purpose-Specific Coloured Cards (Tinted Background + Matching Border + 5px Top Strip)
 * Directly reproduces the My Schedule visual card language across the entire application.
 */
export const MT_COLOR_CARDS = {
  sky: 'rounded-xl bg-sky-50/85 border border-sky-200 border-t-5 border-t-sky-600 shadow-xs text-neutral-900',
  emerald: 'rounded-xl bg-emerald-50/85 border border-emerald-200 border-t-5 border-t-emerald-600 shadow-xs text-neutral-900',
  amber: 'rounded-xl bg-amber-50/85 border border-amber-200 border-t-5 border-t-amber-500 shadow-xs text-neutral-900',
  orange: 'rounded-xl bg-orange-50/85 border border-orange-200 border-t-5 border-t-orange-500 shadow-xs text-neutral-900',
  purple: 'rounded-xl bg-purple-50/85 border border-purple-200 border-t-5 border-t-purple-600 shadow-xs text-neutral-900',
  rose: 'rounded-xl bg-rose-50/85 border border-rose-200 border-t-5 border-t-rose-600 shadow-xs text-neutral-900',
  teal: 'rounded-xl bg-teal-50/85 border border-teal-200 border-t-5 border-t-teal-600 shadow-xs text-neutral-900',
  cyan: 'rounded-xl bg-cyan-50/85 border border-cyan-200 border-t-5 border-t-cyan-600 shadow-xs text-neutral-900',
  indigo: 'rounded-xl bg-indigo-50/85 border border-indigo-200 border-t-5 border-t-indigo-600 shadow-xs text-neutral-900',
  slate: 'rounded-xl bg-slate-50/95 border border-slate-200 border-t-5 border-t-slate-600 shadow-xs text-neutral-900',
  stone: 'rounded-xl bg-stone-100/90 border border-stone-300 border-t-5 border-t-stone-500 shadow-xs text-neutral-900',
  red: 'rounded-xl bg-red-50/80 border border-red-200 border-t-5 border-t-red-600 shadow-xs text-neutral-900',
} as const;

export const SCHEDULE_LEGEND_ITEMS: ScheduleCategoryStyle[] = [
  SCHEDULE_CATEGORY_STYLES.WORKING_DAY,
  SCHEDULE_CATEGORY_STYLES.WEEKLY_OFF,
  SCHEDULE_CATEGORY_STYLES.PUBLIC_HOLIDAY,
  SCHEDULE_CATEGORY_STYLES.DEPARTMENT_HOLIDAY,
  SCHEDULE_CATEGORY_STYLES.APPROVED_LEAVE,
  SCHEDULE_CATEGORY_STYLES.PENDING_LEAVE,
  SCHEDULE_CATEGORY_STYLES.REJECTED_LEAVE,
  SCHEDULE_CATEGORY_STYLES.CANCELLED_LEAVE,
  SCHEDULE_CATEGORY_STYLES.HALF_DAY_LEAVE,
];

/**
 * Authoritative Enterprise Colour Token Specification (`MT_COLOR_TOKENS`)
 */
export const MT_COLOR_TOKENS = {
  primary: {
    DEFAULT: '#c8102e',
    hover: '#991b1b',
    active: '#7f1d1d',
    subtle: '#fef2f2',
    muted: '#fee2e2',
    border: '#c8102e',
    borderSubtle: '#fecaca',
    foreground: '#ffffff',
  },
  structural: {
    DEFAULT: '#0f172a',
    hover: '#1e293b',
    foreground: '#ffffff',
  },
  secondary: {
    DEFAULT: '#ffffff',
    hover: '#f9fafb',
    active: '#f3f4f6',
    foreground: '#111827',
    border: '#d1d5db',
  },
  accent: {
    DEFAULT: '#c8102e',
    hover: '#991b1b',
    active: '#7f1d1d',
    subtle: '#fef2f2',
    border: '#fecaca',
    foreground: '#991b1b',
  },
  neutral: {
    50: '#f9fafb',
    100: '#f3f4f6',
    200: '#e5e7eb',
    300: '#d1d5db',
    400: '#9ca3af',
    500: '#6b7280',
    600: '#4b5563',
    700: '#374151',
    800: '#1f2937',
    900: '#111827',
  },
  background: {
    page: '#ffffff',
    canvas: '#ffffff',
    surface: '#ffffff',
    surfaceMuted: '#f9fafb',
    surfaceSubtle: '#fef2f2',
    surfaceElevated: '#ffffff',
    modal: '#ffffff',
  },
  border: {
    DEFAULT: '#d1d5db',
    subtle: '#e5e7eb',
    strong: '#9ca3af',
    corporate: '#c8102e',
    brand: '#c8102e',
    divider: '#d1d5db',
  },
  text: {
    primary: '#111827',
    heading: '#111827',
    value: '#111827',
    secondary: '#374151',
    muted: '#6b7280',
    placeholder: '#9ca3af',
    brand: '#c8102e',
    inverse: '#ffffff',
  },
  status: {
    success: {
      DEFAULT: '#16a34a',
      hover: '#15803d',
      bg: '#f0fdf4',
      badgeBg: '#dcfce7',
      border: '#bbf7d0',
      text: '#166534',
      textStrong: '#14532d',
    },
    warning: {
      DEFAULT: '#d97706',
      hover: '#b45309',
      bg: '#fffbeb',
      badgeBg: '#fef3c7',
      border: '#fde68a',
      text: '#92400e',
      textStrong: '#78350f',
    },
    danger: {
      DEFAULT: '#dc2626',
      hover: '#b91c1c',
      bg: '#fef2f2',
      badgeBg: '#fee2e2',
      border: '#fecaca',
      text: '#991b1b',
      textStrong: '#7f1d1d',
    },
    error: {
      DEFAULT: '#dc2626',
      hover: '#b91c1c',
      bg: '#fef2f2',
      badgeBg: '#fee2e2',
      border: '#fecaca',
      text: '#991b1b',
      textStrong: '#7f1d1d',
    },
    info: {
      DEFAULT: '#2563eb',
      hover: '#1d4ed8',
      bg: '#eff6ff',
      badgeBg: '#dbeafe',
      border: '#bfdbfe',
      text: '#1e40af',
      textStrong: '#1e3a8a',
    },
  },
  workflowStatus: {
    pending: {
      DEFAULT: '#d97706',
      bg: '#fffbeb',
      border: '#fde68a',
      text: '#92400e',
    },
    approved: {
      DEFAULT: '#16a34a',
      bg: '#f0fdf4',
      border: '#bbf7d0',
      text: '#166534',
    },
    rejected: {
      DEFAULT: '#dc2626',
      bg: '#fef2f2',
      border: '#fecaca',
      text: '#991b1b',
    },
    cancelled: {
      DEFAULT: '#6b7280',
      bg: '#f5f5f4',
      border: '#d6d3d1',
      text: '#44403c',
    },
    completed: {
      DEFAULT: '#0d9488',
      bg: '#f0fdfa',
      border: '#99f6e4',
      text: '#134e4a',
    },
  },
  leaveType: {
    CL: {
      DEFAULT: '#0284c7',
      bg: '#e0f2fe',
      border: '#38bdf8',
      text: '#0c4a6e',
      bar: '#0284c7',
    },
    SL: {
      DEFAULT: '#d97706',
      bg: '#fef3c7',
      border: '#fbbf24',
      text: '#78350f',
      bar: '#f59e0b',
    },
    EL: {
      DEFAULT: '#16a34a',
      bg: '#d1fae5',
      border: '#6ee7b7',
      text: '#064e3b',
      bar: '#059669',
    },
    EMERGENCY: {
      DEFAULT: '#dc2626',
      bg: '#ffe4e6',
      border: '#fb7185',
      text: '#881337',
      bar: '#e11d48',
    },
    LWP: {
      DEFAULT: '#9333ea',
      bg: '#f3e8ff',
      border: '#c084fc',
      text: '#581c87',
      bar: '#9333ea',
    },
    HALF_DAY: {
      DEFAULT: '#0d9488',
      bg: '#ccfbf1',
      border: '#2dd4bf',
      text: '#134e4a',
      bar: '#0d9488',
    },
    DEFAULT: {
      DEFAULT: '#0d9488',
      bg: '#ccfbf1',
      border: '#2dd4bf',
      text: '#134e4a',
      bar: '#0d9488',
    },
  },
  disabled: {
    bg: '#f3f4f6',
    text: '#6b7280',
    border: '#d1d5db',
    opacity: '0.55',
  },
  focus: {
    ring: '#c8102e',
    ringAccent: '#991b1b',
    border: '#c8102e',
  },
} as const;

export const MT_COLOR_PALETTE = {
  primary: {
    50: '#fef2f2',
    100: '#fee2e2',
    200: '#fecaca',
    300: '#fca5a5',
    400: '#f87171',
    500: '#ef4444',
    600: '#dc2626',
    700: '#c8102e',
    800: '#991b1b',
    900: '#7f1d1d',
    950: '#450a0a',
  },
  secondary: {
    50: '#f9fafb',
    100: '#f3f4f6',
    200: '#e5e7eb',
    300: '#d1d5db',
    400: '#9ca3af',
    500: '#6b7280',
    600: '#4b5563',
    700: '#374151',
    800: '#1f2937',
    900: '#0f172a',
  },
  neutral: {
    50: '#f9fafb',
    100: '#f3f4f6',
    200: '#e5e7eb',
    300: '#d1d5db',
    400: '#9ca3af',
    500: '#6b7280',
    600: '#4b5563',
    700: '#374151',
    800: '#1f2937',
    900: '#111827',
    950: '#030712',
  },
  surface: {
    canvas: '#ffffff',
    base: '#ffffff',
    subtle: '#f9fafb',
    muted: '#f3f4f6',
    elevated: '#ffffff',
    brandTint: '#fef2f2',
    darkHeader: '#0f172a',
  },
  border: {
    subtle: '#e5e7eb',
    default: '#d1d5db',
    strong: '#9ca3af',
    brand: '#c8102e',
    focus: '#c8102e',
  },
  text: {
    primary: '#111827',
    secondary: '#374151',
    muted: '#6b7280',
    subtle: '#9ca3af',
    inverse: '#ffffff',
    brand: '#c8102e',
  },
  semantic: {
    workingDay: {
      bg: '#ecfdf5',
      border: '#a7f3d0',
      badgeBg: '#d1fae5',
      badgeBorder: '#6ee7b7',
      text: '#064e3b',
      icon: '#16a34a',
    },
    success: {
      bg: '#f0fdf4',
      border: '#bbf7d0',
      text: '#166534',
      icon: '#16a34a',
      solid: '#16a34a',
    },
    weeklyOff: {
      bg: '#f1f5f9',
      border: '#cbd5e1',
      badgeBg: '#e2e8f0',
      badgeBorder: '#94a3b8',
      text: '#1e293b',
      icon: '#475569',
    },
    publicHoliday: {
      bg: '#fffbeb',
      border: '#fcd34d',
      badgeBg: '#fef3c7',
      badgeBorder: '#fbbf24',
      text: '#92400e',
      icon: '#d97706',
    },
    warning: {
      bg: '#fffbeb',
      border: '#fde68a',
      text: '#92400e',
      icon: '#d97706',
      solid: '#d97706',
    },
    departmentHoliday: {
      bg: '#faf5ff',
      border: '#d8b4fe',
      badgeBg: '#f3e8ff',
      badgeBorder: '#c084fc',
      text: '#581c87',
      icon: '#9333ea',
    },
    approvedLeave: {
      bg: '#f0f9ff',
      border: '#7dd3fc',
      badgeBg: '#e0f2fe',
      badgeBorder: '#38bdf8',
      text: '#0c4a6e',
      icon: '#0284c7',
    },
    info: {
      bg: '#eff6ff',
      border: '#bfdbfe',
      text: '#1e40af',
      icon: '#2563eb',
      solid: '#2563eb',
    },
    pendingLeave: {
      bg: '#fff7ed',
      border: '#fdba74',
      badgeBg: '#ffedd5',
      badgeBorder: '#fb923c',
      text: '#7c2d12',
      icon: '#ea580c',
    },
    rejectedLeave: {
      bg: '#fef2f2',
      border: '#fecaca',
      badgeBg: '#ffe4e6',
      badgeBorder: '#fb7185',
      text: '#991b1b',
      icon: '#dc2626',
    },
    danger: {
      bg: '#fef2f2',
      border: '#fecaca',
      text: '#991b1b',
      icon: '#dc2626',
      solid: '#dc2626',
    },
    error: {
      bg: '#fef2f2',
      border: '#fecaca',
      text: '#991b1b',
      icon: '#dc2626',
      solid: '#dc2626',
    },
    cancelledLeave: {
      bg: '#f5f5f4',
      border: '#d6d3d1',
      badgeBg: '#e7e5e4',
      badgeBorder: '#a8a29e',
      text: '#44403c',
      icon: '#57534e',
    },
    halfDayLeave: {
      bg: '#f0fdfa',
      border: '#5eead4',
      badgeBg: '#ccfbf1',
      badgeBorder: '#2dd4bf',
      text: '#134e4a',
      icon: '#0d9488',
    },
    completed: {
      bg: '#f0fdfa',
      border: '#5eead4',
      text: '#134e4a',
      icon: '#0d9488',
      solid: '#0d9488',
    },
  },
  leaveTypes: MT_COLOR_TOKENS.leaveType,
} as const;

export const MT_THEME = {
  // Master Schedule Category Dictionary
  schedule: SCHEDULE_CATEGORY_STYLES,

  // Surfaces & Backgrounds (Layered Slate Canvas + Tinted Semantic Cards)
  pageBg: 'bg-slate-100/80 text-neutral-900',
  coloredCard: MT_COLOR_CARDS,
  surface: {
    canvas: 'bg-white',
    base: 'bg-white',
    subtle: 'bg-neutral-50',
    muted: 'bg-neutral-100',
    elevated: 'bg-white shadow-xs',
    brandSubtle: 'bg-red-50/50',
    darkBanner: 'bg-neutral-900 text-white',
    workingDay: SCHEDULE_CATEGORY_STYLES.WORKING_DAY.containerClass,
    weeklyOff: SCHEDULE_CATEGORY_STYLES.WEEKLY_OFF.containerClass,
    publicHoliday: SCHEDULE_CATEGORY_STYLES.PUBLIC_HOLIDAY.containerClass,
    departmentHoliday: SCHEDULE_CATEGORY_STYLES.DEPARTMENT_HOLIDAY.containerClass,
    approvedLeave: SCHEDULE_CATEGORY_STYLES.APPROVED_LEAVE.containerClass,
    pendingLeave: SCHEDULE_CATEGORY_STYLES.PENDING_LEAVE.containerClass,
    rejectedLeave: SCHEDULE_CATEGORY_STYLES.REJECTED_LEAVE.containerClass,
    cancelledLeave: SCHEDULE_CATEGORY_STYLES.CANCELLED_LEAVE.containerClass,
    halfDayLeave: SCHEDULE_CATEGORY_STYLES.HALF_DAY_LEAVE.containerClass,
  },

  // Borders (#d1d5db default, #9ca3af strong, #c8102e corporate)
  border: {
    subtle: 'border-neutral-200',
    default: 'border-neutral-300',
    strong: 'border-neutral-400',
    brand: 'border-red-200',
    brandStrong: 'border-red-700',
  },

  // Typography & Text Hierarchy (#111827 primary, #374151 secondary, #6b7280 muted)
  text: {
    primary: 'text-neutral-900',
    secondary: 'text-neutral-700',
    muted: 'text-neutral-500',
    subtle: 'text-neutral-500',
    brand: 'text-red-700',
    brandHover: 'hover:text-red-800',
    workingDay: 'text-emerald-900',
    weeklyOff: 'text-slate-800',
    publicHoliday: 'text-amber-900',
    departmentHoliday: 'text-purple-900',
    approvedLeave: 'text-sky-900',
    pendingLeave: 'text-orange-900',
    rejectedLeave: 'text-rose-900',
    cancelledLeave: 'text-stone-800',
    halfDayLeave: 'text-teal-900',
    success: 'text-emerald-800',
    warning: 'text-amber-800',
    danger: 'text-rose-800',
    error: 'text-rose-800',
    info: 'text-sky-800',
  },

  // Cards & Panels (Tinted surface, matching border, 5px thick top colour strip)
  card: 'bg-slate-50/90 rounded-xl border border-slate-200 border-t-5 border-t-slate-600 shadow-xs',
  cardBrand: 'bg-red-50/75 rounded-xl border border-red-200 border-t-5 border-t-red-700 shadow-xs',
  cardInteractive:
    'bg-sky-50/70 rounded-xl border border-sky-200 border-t-5 border-t-sky-600 shadow-xs hover:border-sky-400 hover:shadow-sm transition-all',
  cardHeader: 'px-5 py-4 border-b border-slate-200 bg-slate-100/70',
  sectionSubtle: 'bg-slate-50 rounded-xl border border-slate-200 border-t-5 border-t-slate-500',

  // Primary Brand & Action Buttons
  button: {
    primary:
      'bg-red-700 text-white hover:bg-red-800 active:bg-red-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-700/30 disabled:bg-neutral-200 disabled:text-neutral-500 disabled:border-neutral-300 disabled:opacity-60 disabled:cursor-not-allowed transition-colors cursor-pointer shadow-2xs',
    secondary:
      'bg-white text-neutral-900 border border-neutral-300 hover:bg-neutral-50 hover:text-red-700 hover:border-red-700 active:bg-red-50/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-700/20 disabled:bg-neutral-100 disabled:text-neutral-500 disabled:border-neutral-300 disabled:opacity-60 disabled:cursor-not-allowed transition-colors cursor-pointer',
    brandSoft:
      'bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 active:bg-red-200/70 disabled:bg-neutral-100 disabled:text-neutral-500 disabled:opacity-60 disabled:cursor-not-allowed transition-colors cursor-pointer',
    success:
      'bg-emerald-600 text-white hover:bg-emerald-700 active:bg-emerald-800 disabled:bg-neutral-200 disabled:text-neutral-500 disabled:opacity-60 disabled:cursor-not-allowed transition-colors cursor-pointer',
    warning:
      'bg-amber-600 text-white hover:bg-amber-700 active:bg-amber-800 disabled:bg-neutral-200 disabled:text-neutral-500 disabled:opacity-60 disabled:cursor-not-allowed transition-colors cursor-pointer',
    danger:
      'bg-rose-600 text-white hover:bg-rose-700 active:bg-rose-800 disabled:bg-neutral-200 disabled:text-neutral-500 disabled:opacity-60 disabled:cursor-not-allowed transition-colors cursor-pointer',
    error:
      'bg-rose-600 text-white hover:bg-rose-700 active:bg-rose-800 disabled:bg-neutral-200 disabled:text-neutral-500 disabled:opacity-60 disabled:cursor-not-allowed transition-colors cursor-pointer',
    dangerSoft:
      'bg-rose-50 text-rose-800 border border-rose-300 hover:bg-rose-100 disabled:bg-neutral-100 disabled:text-neutral-500 disabled:opacity-60 disabled:cursor-not-allowed transition-colors cursor-pointer',
    ghost:
      'text-neutral-700 hover:text-red-700 hover:bg-red-50/60 disabled:text-neutral-400 disabled:opacity-60 disabled:cursor-not-allowed transition-colors cursor-pointer',
  },

  // Navigation & Tabs (Desktop + Mobile)
  navTabActive: 'border-red-700 text-red-700 bg-red-50/70 font-semibold',
  navTabInactive:
    'border-transparent text-neutral-700 hover:text-red-700 hover:bg-red-50/40 hover:border-red-300',
  pillTabActive: 'bg-red-700 text-white shadow-2xs font-semibold',
  pillTabInactive:
    'bg-white text-neutral-700 border border-neutral-300 hover:bg-red-50/50 hover:text-red-700 hover:border-red-300',

  // Form Controls (White background, Black/Dark text, Neutral border #D1D5DB, Corporate Red focus)
  input:
    'w-full px-3 py-2 text-xs rounded-lg border border-neutral-300 bg-white text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-red-700/20 focus:border-red-700 disabled:bg-neutral-100 disabled:text-neutral-500 disabled:cursor-not-allowed transition-colors',
  select:
    'px-3 py-2 text-xs rounded-lg border border-neutral-300 bg-white text-neutral-900 focus:outline-none focus:ring-2 focus:ring-red-700/20 focus:border-red-700 disabled:bg-neutral-100 disabled:text-neutral-500 disabled:cursor-not-allowed transition-colors',

  // Tables (White background, Black primary text, subtle header, neutral border)
  table: {
    wrapper: 'bg-white rounded-xl border border-neutral-300 shadow-xs overflow-hidden',
    thead:
      'bg-neutral-50 border-b border-neutral-300 text-[11px] font-bold text-neutral-900 uppercase tracking-wider',
    tbody: 'divide-y divide-neutral-200 text-xs text-neutral-900',
    trHover: 'hover:bg-neutral-50 transition-colors',
  },

  // Semantic Status Badges
  badge: {
    workingDay: SCHEDULE_CATEGORY_STYLES.WORKING_DAY.badgeClass,
    weeklyOff: SCHEDULE_CATEGORY_STYLES.WEEKLY_OFF.badgeClass,
    publicHoliday: SCHEDULE_CATEGORY_STYLES.PUBLIC_HOLIDAY.badgeClass,
    departmentHoliday: SCHEDULE_CATEGORY_STYLES.DEPARTMENT_HOLIDAY.badgeClass,
    approvedLeave: SCHEDULE_CATEGORY_STYLES.APPROVED_LEAVE.badgeClass,
    pendingLeave: SCHEDULE_CATEGORY_STYLES.PENDING_LEAVE.badgeClass,
    rejectedLeave: SCHEDULE_CATEGORY_STYLES.REJECTED_LEAVE.badgeClass,
    cancelledLeave: SCHEDULE_CATEGORY_STYLES.CANCELLED_LEAVE.badgeClass,
    halfDayLeave: SCHEDULE_CATEGORY_STYLES.HALF_DAY_LEAVE.badgeClass,

    // General Semantic Aliases
    success: 'bg-emerald-100 text-emerald-900 border border-emerald-300',
    successStrong: 'bg-emerald-100 text-emerald-950 border border-emerald-400',
    warning: 'bg-amber-100 text-amber-900 border border-amber-400',
    warningStrong: 'bg-amber-100 text-amber-950 border border-amber-400',
    danger: 'bg-rose-100 text-rose-900 border border-rose-400',
    dangerStrong: 'bg-rose-100 text-rose-950 border border-rose-400',
    error: 'bg-rose-100 text-rose-900 border border-rose-400',
    errorStrong: 'bg-rose-100 text-rose-950 border border-rose-400',
    info: 'bg-sky-100 text-sky-900 border border-sky-400',
    infoStrong: 'bg-sky-100 text-sky-950 border border-sky-400',
    neutral: 'bg-neutral-100 text-neutral-800 border border-neutral-300',
    neutralStrong: 'bg-neutral-200 text-neutral-900 border border-neutral-400',
    brand: 'bg-red-50 text-red-700 border border-red-200',
    brandSolid: 'bg-red-700 text-white border border-red-700',

    // Explicit Workflow Status Aliases
    active: 'bg-emerald-100 text-emerald-900 border border-emerald-300',
    inactive: 'bg-neutral-100 text-neutral-800 border border-neutral-300',
    pending: 'bg-amber-100 text-amber-900 border border-amber-400',
    approved: 'bg-emerald-100 text-emerald-900 border border-emerald-300',
    rejected: 'bg-rose-100 text-rose-900 border border-rose-400',
    cancelled: 'bg-stone-200 text-stone-700 border border-stone-400',
    completed: 'bg-teal-100 text-teal-900 border border-teal-400',
  },

  // Leave Type Badges (Aligned with My Schedule semantic tints)
  leaveType: {
    CL: 'bg-sky-100 text-sky-900 border border-sky-400',
    SL: 'bg-amber-100 text-amber-900 border border-amber-400',
    EL: 'bg-emerald-100 text-emerald-900 border border-emerald-300',
    EMERGENCY: 'bg-rose-100 text-rose-900 border border-rose-400',
    LWP: 'bg-purple-100 text-purple-900 border border-purple-400',
    HALF_DAY: 'bg-teal-100 text-teal-900 border border-teal-400',
    DEFAULT: 'bg-teal-100 text-teal-900 border border-teal-400',
    bar: {
      CL: 'bg-sky-600',
      SL: 'bg-amber-500',
      EL: 'bg-emerald-600',
      EMERGENCY: 'bg-rose-600',
      LWP: 'bg-purple-600',
      HALF_DAY: 'bg-teal-600',
      DEFAULT: 'bg-teal-600',
    },
  },

  chart: {
    track: 'w-full h-2 bg-neutral-200/70 rounded-full overflow-hidden',
  },

  alert: {
    workingDay: 'bg-emerald-50/70 border border-emerald-200 text-emerald-950',
    weeklyOff: 'bg-slate-100 border border-slate-300 text-slate-900',
    publicHoliday: 'bg-amber-50 border border-amber-300 text-amber-950',
    departmentHoliday: 'bg-purple-50 border border-purple-300 text-purple-950',
    approvedLeave: 'bg-sky-50 border border-sky-300 text-sky-950',
    pendingLeave: 'bg-orange-50 border border-orange-300 text-orange-950',
    rejectedLeave: 'bg-rose-50 border border-rose-300 text-rose-950',
    cancelledLeave: 'bg-stone-100 border border-stone-300 text-stone-800',
    halfDayLeave: 'bg-teal-50 border border-teal-300 text-teal-950',
    success: 'bg-emerald-50 border border-emerald-300 text-emerald-900',
    warning: 'bg-amber-50 border border-amber-300 text-amber-900',
    danger: 'bg-rose-50 border border-rose-300 text-rose-900',
    error: 'bg-rose-50 border border-rose-300 text-rose-900',
    info: 'bg-sky-50 border border-sky-300 text-sky-900',
    neutral: 'bg-neutral-50 border border-neutral-300 text-neutral-900',
    brand: 'bg-red-50 border border-red-200 text-red-900',
  },

  // Mobile & Desktop Shell Navigation Tokens
  // Header uses Deep Navy/Charcoal (#0F172A) with Corporate Red (#C8102E) bottom border
  mobile: {
    header:
      'sticky top-0 z-30 bg-neutral-900 text-white border-b-2 border-red-700 px-3 sm:px-4 md:px-8 h-14 md:h-16 flex items-center justify-between gap-2 shadow-sm',
    bottomNav:
      'md:hidden fixed bottom-0 inset-x-0 z-40 bg-white border-t border-neutral-300 px-1.5 py-1 flex items-center justify-around shadow-[0_-2px_10px_rgba(0,0,0,0.06)] pb-safe',
    bottomNavItem:
      'flex flex-col items-center justify-center gap-0.5 min-h-[52px] min-w-[56px] flex-1 py-1 px-1 rounded-xl text-[10px] font-semibold transition-colors cursor-pointer select-none',
    bottomNavItemActive: 'text-red-700 bg-red-50 font-bold',
    bottomNavItemInactive: 'text-neutral-700 hover:text-red-700 active:bg-red-50/50',
    drawerBackdrop:
      'fixed inset-0 z-50 bg-black/40 backdrop-blur-xs md:hidden animate-in fade-in duration-150',
    drawerPanel:
      'fixed inset-y-0 left-0 z-50 w-[84vw] max-w-xs bg-white shadow-2xl border-r border-neutral-300 flex flex-col md:hidden overflow-y-auto',
    drawerItem:
      'w-full min-h-[44px] px-3.5 py-2.5 rounded-xl flex items-center justify-between gap-2.5 text-xs font-semibold transition-colors cursor-pointer',
    drawerItemActive: 'bg-red-700 text-white shadow-2xs',
    drawerItemInactive: 'text-neutral-700 hover:bg-red-50 hover:text-red-700 active:bg-red-100/60',
    touchTarget: 'min-h-[44px] min-w-[44px] inline-flex items-center justify-center',
    touchButton: 'min-h-[44px] px-4 py-2.5 text-xs font-semibold rounded-xl',
    cardList: 'grid grid-cols-1 gap-3 md:hidden',
    cardItem: 'bg-white rounded-xl border border-neutral-300 p-3.5 shadow-2xs space-y-2.5',
    stickyFooterAction:
      'sticky bottom-0 inset-x-0 bg-white border-t border-neutral-300 p-3 mt-4 -mx-4 -mb-4 sm:static sm:bg-transparent sm:border-0 sm:p-0 sm:m-0',
  },
} as const;

export function getScheduleCategoryStyle(category: ScheduleVisualCategory): ScheduleCategoryStyle {
  return SCHEDULE_CATEGORY_STYLES[category] || SCHEDULE_CATEGORY_STYLES.WORKING_DAY;
}

/**
 * Returns the exact My Schedule semantic style for Public vs Department holidays.
 */
export function getHolidayCategoryStyle(
  scopeOrType?: string | null,
  departmentId?: number | string | null
): ScheduleCategoryStyle {
  const s = (scopeOrType || '').toUpperCase().trim();
  if (
    departmentId ||
    s === 'DEPARTMENT' ||
    s === 'DEPARTMENT_HOLIDAY' ||
    s === 'DEPT' ||
    s.includes('DEPARTMENT')
  ) {
    return SCHEDULE_CATEGORY_STYLES.DEPARTMENT_HOLIDAY;
  }
  return SCHEDULE_CATEGORY_STYLES.PUBLIC_HOLIDAY;
}

/**
 * Resolves a leave type code or name to its canonical LeaveTypeColorKey.
 */
export function resolveLeaveTypeColorKey(codeOrName?: string | null): LeaveTypeColorKey {
  const raw = (codeOrName || '').toUpperCase().trim();
  if (raw === 'CL' || raw.includes('CASUAL')) {
    return 'CL';
  }
  if (raw === 'SL' || raw.includes('SICK') || raw.includes('MEDICAL')) {
    return 'SL';
  }
  if (raw === 'EL' || raw === 'PL' || raw.includes('EARNED') || raw.includes('PRIVILEGE') || raw.includes('ANNUAL')) {
    return 'EL';
  }
  if (raw === 'EMERGENCY' || raw === 'EML' || raw.includes('EMERGENCY')) {
    return 'EMERGENCY';
  }
  if (raw === 'LWP' || raw === 'LOP' || raw.includes('WITHOUT PAY') || raw.includes('UNPAID')) {
    return 'LWP';
  }
  if (raw === 'HDL' || raw === 'HALF_DAY' || raw.includes('HALF')) {
    return 'HALF_DAY';
  }
  return 'DEFAULT';
}

/**
 * Helper to return standardized badge classes for any status or schedule state across the app:
 * - Approved / Active / Working Day / Paid / Success -> Green (`MT_THEME.badge.approved` / `MT_THEME.badge.success`)
 * - Pending / Warning / Public Holiday -> Amber (`MT_THEME.badge.pending` / `MT_THEME.badge.warning`)
 * - Rejected / Error / Danger -> Red (`MT_THEME.badge.rejected` / `MT_THEME.badge.danger`)
 * - Info / Schedule Approved Leave -> Blue/Sky (`MT_THEME.badge.info`)
 * - Cancelled / Withdrawn -> Stone (`MT_THEME.badge.cancelled`)
 * - Completed / Half-Day -> Teal (`MT_THEME.badge.completed`)
 * - Department Holiday / Overnight -> Purple (`MT_THEME.badge.departmentHoliday`)
 * - Weekly Off / Inactive -> Neutral/Slate (`MT_THEME.badge.inactive`)
 */
export function getStatusBadgeClasses(status?: string | null): string {
  const s = (status || '').toUpperCase().trim();

  // Explicit My Schedule category keys
  if (s === 'APPROVED_LEAVE') {
    return MT_THEME.badge.approvedLeave;
  }
  if (s === 'PENDING_LEAVE') {
    return MT_THEME.badge.pendingLeave;
  }
  if (s === 'REJECTED_LEAVE') {
    return MT_THEME.badge.rejectedLeave;
  }
  if (s === 'CANCELLED_LEAVE') {
    return MT_THEME.badge.cancelledLeave;
  }
  if (s === 'WEEKLY_OFF' || s === 'WO') {
    return MT_THEME.badge.weeklyOff;
  }

  // Approved & Active / Success states -> Green
  if (
    s === 'APPROVED' ||
    s === 'FINAL_APPROVED' ||
    s === 'TEAM_LEADER_APPROVED' ||
    s === 'TL_APPROVED' ||
    s === 'HR_APPROVED' ||
    s === 'MANAGEMENT_APPROVED' ||
    s === 'AUTHORIZED' ||
    s === 'WORKING_DAY' ||
    s === 'SHIFT' ||
    s === 'ACTIVE' ||
    s === 'READY' ||
    s === 'CONFIGURED' ||
    s === 'ENABLED' ||
    s === 'PAID' ||
    s === 'SUCCESS' ||
    s === 'CONNECTED' ||
    s === 'OPEN' ||
    s === 'AVAILABLE'
  ) {
    return MT_THEME.badge.approved;
  }

  // Info state -> Blue/Sky
  if (s === 'INFO' || s === 'INFORMATION') {
    return MT_THEME.badge.info;
  }

  // Completed / Half-Day -> Teal
  if (
    s === 'HALF_DAY_LEAVE' ||
    s === 'HALF_DAY' ||
    s === 'FIRST_HALF' ||
    s === 'SECOND_HALF' ||
    s === 'COMPLETED' ||
    s === 'SETTLED' ||
    s === 'PARTIAL'
  ) {
    return MT_THEME.badge.completed;
  }

  // Department Holiday / Overnight -> Purple
  if (
    s === 'DEPARTMENT_HOLIDAY' ||
    s === 'DEPT_HOLIDAY' ||
    s === 'DEPARTMENT' ||
    s === 'OVERNIGHT'
  ) {
    return MT_THEME.badge.departmentHoliday;
  }

  // Pending / Warning / Public Holiday -> Amber
  if (
    s === 'PENDING' ||
    s === 'IN_REVIEW' ||
    s === 'SUBMITTED' ||
    s === 'AWAITING_APPROVAL' ||
    s === 'TEAM_LEADER_PENDING' ||
    s === 'TL_PENDING' ||
    s === 'HR_PENDING' ||
    s === 'MANAGEMENT_PENDING' ||
    s.includes('PENDING') ||
    s === 'PUBLIC_HOLIDAY' ||
    s === 'COMPANY_HOLIDAY' ||
    s === 'HOLIDAY' ||
    s === 'PUBLIC' ||
    s === 'WARNING' ||
    s === 'UNCONFIGURED' ||
    s === 'EXPIRING'
  ) {
    return MT_THEME.badge.pending;
  }

  // Rejected / Error / Danger -> Red
  if (
    s === 'REJECTED' ||
    s === 'TEAM_LEADER_REJECTED' ||
    s === 'TL_REJECTED' ||
    s === 'HR_REJECTED' ||
    s === 'MANAGEMENT_REJECTED' ||
    s === 'EXPIRED' ||
    s === 'LOCKED' ||
    s === 'ERROR' ||
    s === 'DANGER' ||
    s.includes('REJECTED')
  ) {
    return MT_THEME.badge.rejected;
  }

  // Cancelled / Withdrawn -> Stone
  if (
    s === 'CANCELLED' ||
    s === 'CANCELED' ||
    s === 'WITHDRAWN' ||
    s === 'ARCHIVED' ||
    s.includes('CANCEL')
  ) {
    return MT_THEME.badge.cancelled;
  }

  // Inactive / Unassigned / Draft -> Neutral
  if (
    s === 'INACTIVE' ||
    s === 'DISABLED' ||
    s === 'UNASSIGNED' ||
    s === 'NOT_REQUIRED' ||
    s === 'SKIPPED' ||
    s === 'CLOSED' ||
    s === 'DRAFT'
  ) {
    return MT_THEME.badge.inactive;
  }

  return MT_THEME.badge.neutral;
}

/**
 * Helper to return standardized container classes (matching My Schedule cards/cells)
 * for any status or schedule category.
 */
export function getStatusContainerClasses(status?: string | null): string {
  const s = (status || '').toUpperCase().trim();
  if (s === 'WORKING_DAY' || s === 'SHIFT' || s === 'ACTIVE' || s === 'READY') {
    return SCHEDULE_CATEGORY_STYLES.WORKING_DAY.containerClass;
  }
  if (s === 'APPROVED' || s === 'APPROVED_LEAVE' || s === 'FINAL_APPROVED') {
    return SCHEDULE_CATEGORY_STYLES.APPROVED_LEAVE.containerClass;
  }
  if (s === 'HALF_DAY_LEAVE' || s === 'HALF_DAY' || s === 'COMPLETED') {
    return SCHEDULE_CATEGORY_STYLES.HALF_DAY_LEAVE.containerClass;
  }
  if (s === 'DEPARTMENT_HOLIDAY' || s === 'DEPT_HOLIDAY' || s === 'DEPARTMENT') {
    return SCHEDULE_CATEGORY_STYLES.DEPARTMENT_HOLIDAY.containerClass;
  }
  if (s === 'PUBLIC_HOLIDAY' || s === 'COMPANY_HOLIDAY' || s === 'HOLIDAY') {
    return SCHEDULE_CATEGORY_STYLES.PUBLIC_HOLIDAY.containerClass;
  }
  if (s === 'PENDING' || s === 'PENDING_LEAVE' || s.includes('PENDING')) {
    return SCHEDULE_CATEGORY_STYLES.PENDING_LEAVE.containerClass;
  }
  if (s === 'REJECTED' || s === 'REJECTED_LEAVE' || s.includes('REJECTED')) {
    return SCHEDULE_CATEGORY_STYLES.REJECTED_LEAVE.containerClass;
  }
  if (s === 'CANCELLED' || s === 'CANCELLED_LEAVE' || s.includes('CANCEL')) {
    return SCHEDULE_CATEGORY_STYLES.CANCELLED_LEAVE.containerClass;
  }
  return SCHEDULE_CATEGORY_STYLES.WEEKLY_OFF.containerClass;
}

/**
 * Helper to return standardized leave-type badge classes for CL, SL, EL, Emergency, LWP, Half-Day.
 */
export function getLeaveTypeBadgeClasses(codeOrName?: string | null): string {
  const key = resolveLeaveTypeColorKey(codeOrName);
  return MT_THEME.leaveType[key];
}

/**
 * Helper to return chart bar fill classes for leave types (CL, SL, EL, Emergency, LWP).
 */
export function getLeaveTypeBarColor(codeOrName?: string | null): string {
  const key = resolveLeaveTypeColorKey(codeOrName);
  return MT_THEME.leaveType.bar[key];
}

/**
 * Helper to return full coloured card classes (tinted background + matching border + 5px top strip)
 * for any leave type (CL -> Sky, SL -> Amber, EL -> Emerald, Emergency -> Rose, LWP -> Purple, Half-Day -> Teal).
 */
export function getLeaveTypeCardClasses(codeOrName?: string | null): string {
  const key = resolveLeaveTypeColorKey(codeOrName);
  switch (key) {
    case 'CL':
      return MT_COLOR_CARDS.sky;
    case 'SL':
      return MT_COLOR_CARDS.amber;
    case 'EL':
      return MT_COLOR_CARDS.emerald;
    case 'EMERGENCY':
      return MT_COLOR_CARDS.rose;
    case 'LWP':
      return MT_COLOR_CARDS.purple;
    case 'HALF_DAY':
    default:
      return MT_COLOR_CARDS.teal;
  }
}

/**
 * Helper to return full coloured card classes (tinted background + matching border + 5px top strip)
 * for any workflow status or schedule state.
 */
export function getStatusCardClasses(status?: string | null): string {
  const s = (status || '').toUpperCase().trim();
  if (s === 'APPROVED_LEAVE') {
    return MT_COLOR_CARDS.sky;
  }
  if (s === 'HALF_DAY' || s === 'HALF_DAY_LEAVE' || s === 'COMPLETED') {
    return MT_COLOR_CARDS.teal;
  }
  if (
    s === 'APPROVED' ||
    s === 'FINAL_APPROVED' ||
    s === 'TEAM_LEADER_APPROVED' ||
    s === 'HR_APPROVED' ||
    s === 'MANAGEMENT_APPROVED' ||
    s === 'ACTIVE' ||
    s === 'WORKING_DAY' ||
    s === 'SUCCESS'
  ) {
    return MT_COLOR_CARDS.emerald;
  }
  if (s === 'PENDING' || s === 'PENDING_LEAVE' || s.includes('PENDING') || s === 'WARNING') {
    return MT_COLOR_CARDS.amber;
  }
  if (s === 'REJECTED' || s === 'REJECTED_LEAVE' || s.includes('REJECTED') || s === 'ERROR' || s === 'DANGER') {
    return MT_COLOR_CARDS.rose;
  }
  if (s === 'CANCELLED' || s === 'CANCELLED_LEAVE' || s === 'WITHDRAWN' || s.includes('CANCEL')) {
    return MT_COLOR_CARDS.stone;
  }
  if (s === 'OVERTIME' || s === 'DEPARTMENT_HOLIDAY') {
    return MT_COLOR_CARDS.purple;
  }
  return MT_COLOR_CARDS.slate;
}
