import fs from 'fs';
import path from 'path';
import {
  MT_COLOR_TOKENS,
  MT_THEME,
  getStatusBadgeClasses,
  resolveLeaveTypeColorKey,
  getLeaveTypeBadgeClasses,
  getLeaveTypeBarColor,
} from '../utils/theme.ts';
import { SCHEDULE_CATEGORY_STYLES } from '../components/MySchedule.tsx';

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string, details?: unknown) {
  if (condition) {
    console.log(`  [PASS] ${message}`);
    passed++;
  } else {
    console.error(`  [FAIL] ${message}`, details ?? '');
    failed++;
  }
}

function run() {
  console.log('===================================================================');
  console.log('PHASE 2 — PROFESSIONAL CORPORATE COLOUR SYSTEM VERIFICATION SUITE');
  console.log('===================================================================\n');

  // 1. Verify CSS Custom Properties & Tailwind @theme tokens in src/index.css
  console.log('1. CSS Custom Properties & Tailwind @theme Tokens (src/index.css)');
  const cssContent = fs.readFileSync(path.resolve('src/index.css'), 'utf8');

  const requiredCssVariables = [
    '--mt-color-primary',
    '--mt-color-primary-hover',
    '--mt-color-primary-active',
    '--mt-color-primary-subtle',
    '--mt-color-primary-border',
    '--mt-color-secondary',
    '--mt-color-secondary-hover',
    '--mt-color-accent',
    '--mt-color-accent-hover',
    '--mt-color-structural',
    '--mt-color-neutral-50',
    '--mt-color-neutral-100',
    '--mt-color-neutral-200',
    '--mt-color-neutral-500',
    '--mt-color-neutral-700',
    '--mt-color-neutral-900',
    '--mt-color-bg-page',
    '--mt-color-bg-surface',
    '--mt-color-border',
    '--mt-color-divider',
    '--mt-color-text-primary',
    '--mt-color-text-secondary',
    '--mt-color-text-muted',
    '--mt-color-success',
    '--mt-color-warning',
    '--mt-color-danger',
    '--mt-color-error',
    '--mt-color-info',
    '--mt-status-pending',
    '--mt-status-approved',
    '--mt-status-rejected',
    '--mt-status-cancelled',
    '--mt-status-completed',
    '--mt-leave-cl',
    '--mt-leave-sl',
    '--mt-leave-el',
    '--mt-leave-emergency',
    '--mt-leave-lwp',
    '--mt-color-disabled-bg',
    '--mt-color-disabled-text',
    '--mt-color-focus-ring',
  ];

  for (const cssVar of requiredCssVariables) {
    assert(cssContent.includes(cssVar), `src/index.css defines standard token ${cssVar}`);
  }
  assert(
    cssContent.includes('--mt-color-primary: #c8102e') &&
      cssContent.includes('--mt-color-primary-hover: #991b1b') &&
      cssContent.includes('--mt-color-primary-active: #7f1d1d'),
    'src/index.css defines Professional RED (#c8102e / #991b1b / #7f1d1d) as primary brand identity'
  );
  assert(cssContent.includes('@theme'), 'src/index.css registers Tailwind v4 @theme colour tokens');

  // 2. Verify centralized TypeScript Design Token System in src/utils/theme.ts
  console.log('\n2. Centralized TypeScript Design Token System (src/utils/theme.ts)');
  assert(
    MT_COLOR_TOKENS.primary.DEFAULT === '#c8102e' &&
      MT_COLOR_TOKENS.primary.hover === '#991b1b' &&
      MT_COLOR_TOKENS.primary.active === '#7f1d1d',
    'Primary & Primary hover/active tokens use Professional RED brand identity'
  );
  assert(
    Boolean(MT_COLOR_TOKENS.primary.subtle && MT_COLOR_TOKENS.primary.border),
    'Soft/light red background and border tokens defined for highlighted brand states'
  );
  assert(
    Boolean(MT_COLOR_TOKENS.structural.DEFAULT && MT_COLOR_TOKENS.structural.hover),
    'Deep charcoal structural navigation/text tokens defined'
  );
  assert(Boolean(MT_COLOR_TOKENS.secondary.DEFAULT && MT_COLOR_TOKENS.secondary.hover), 'Secondary tokens defined');
  assert(Boolean(MT_COLOR_TOKENS.accent.DEFAULT && MT_COLOR_TOKENS.accent.hover), 'Accent tokens defined');
  assert(
    Boolean(
      MT_COLOR_TOKENS.neutral[50] &&
        MT_COLOR_TOKENS.neutral[200] &&
        MT_COLOR_TOKENS.neutral[500] &&
        MT_COLOR_TOKENS.neutral[900]
    ),
    'Corporate Neutral scale (50–900) tokens defined'
  );
  assert(Boolean(MT_COLOR_TOKENS.background.page && MT_COLOR_TOKENS.background.surface), 'Page & Card/Surface background tokens defined');
  assert(Boolean(MT_COLOR_TOKENS.border.DEFAULT && MT_COLOR_TOKENS.border.divider), 'Border & Divider tokens defined');
  assert(Boolean(MT_COLOR_TOKENS.text.primary && MT_COLOR_TOKENS.text.secondary && MT_COLOR_TOKENS.text.muted), 'Primary & Secondary/Muted text tokens defined');
  assert(
    Boolean(
      MT_COLOR_TOKENS.status.success.DEFAULT &&
        MT_COLOR_TOKENS.status.warning.DEFAULT &&
        MT_COLOR_TOKENS.status.danger.DEFAULT &&
        MT_COLOR_TOKENS.status.error.DEFAULT &&
        MT_COLOR_TOKENS.status.info.DEFAULT
    ),
    'Success, Warning, Error/Danger, and Info semantic tokens defined'
  );
  assert(Boolean(MT_COLOR_TOKENS.disabled.bg && MT_COLOR_TOKENS.disabled.text), 'Disabled state tokens defined');
  assert(Boolean(MT_COLOR_TOKENS.focus.ring && MT_COLOR_TOKENS.focus.ringAccent), 'Focus state tokens defined');

  // 3. Verify Workflow Status Tokens (Pending, Approved, Rejected, Cancelled, Completed)
  console.log('\n3. Workflow Status Semantic Tokens (Pending, Approved, Rejected, Cancelled, Completed)');
  assert(
    Boolean(
      MT_COLOR_TOKENS.workflowStatus.pending.DEFAULT &&
        MT_COLOR_TOKENS.workflowStatus.approved.DEFAULT &&
        MT_COLOR_TOKENS.workflowStatus.rejected.DEFAULT &&
        MT_COLOR_TOKENS.workflowStatus.cancelled.DEFAULT &&
        MT_COLOR_TOKENS.workflowStatus.completed.DEFAULT
    ),
    'MT_COLOR_TOKENS.workflowStatus defines Pending, Approved, Rejected, Cancelled, and Completed'
  );
  assert(getStatusBadgeClasses('PENDING') === MT_THEME.badge.pending, 'PENDING maps to standard pending badge (Amber)');
  assert(getStatusBadgeClasses('APPROVED') === MT_THEME.badge.approved, 'APPROVED maps to standard approved badge (Emerald)');
  assert(getStatusBadgeClasses('REJECTED') === MT_THEME.badge.rejected, 'REJECTED maps to standard rejected badge (Rose)');
  assert(getStatusBadgeClasses('CANCELLED') === MT_THEME.badge.cancelled, 'CANCELLED maps to standard cancelled badge (Neutral)');
  assert(getStatusBadgeClasses('COMPLETED') === MT_THEME.badge.completed, 'COMPLETED maps to standard completed badge (Teal)');
  assert(getStatusBadgeClasses('INFO') === MT_THEME.badge.info, 'INFO maps to standard info badge (Sky)');
  assert(getStatusBadgeClasses('ERROR') === MT_THEME.badge.error, 'ERROR maps to standard error badge (Rose)');
  assert(
    getStatusBadgeClasses('COMPLETED') !== getStatusBadgeClasses('APPROVED') &&
      getStatusBadgeClasses('CANCELLED') !== getStatusBadgeClasses('REJECTED'),
    'Completed and Cancelled have distinct semantic badge styles from Approved and Rejected'
  );

  // 4. Verify Leave Type Semantic Tokens (CL, SL, EL, Emergency, LWP)
  console.log('\n4. Leave Type Semantic Tokens & Helpers (CL, SL, EL, Emergency, LWP)');
  assert(
    Boolean(
      MT_COLOR_TOKENS.leaveType.CL.DEFAULT &&
        MT_COLOR_TOKENS.leaveType.SL.DEFAULT &&
        MT_COLOR_TOKENS.leaveType.EL.DEFAULT &&
        MT_COLOR_TOKENS.leaveType.EMERGENCY.DEFAULT &&
        MT_COLOR_TOKENS.leaveType.LWP.DEFAULT
    ),
    'MT_COLOR_TOKENS.leaveType defines CL, SL, EL, EMERGENCY, and LWP'
  );
  assert(resolveLeaveTypeColorKey('CL') === 'CL' && resolveLeaveTypeColorKey('Casual Leave') === 'CL', 'CL & Casual Leave resolve to CL semantic key');
  assert(resolveLeaveTypeColorKey('SL') === 'SL' && resolveLeaveTypeColorKey('Sick Leave') === 'SL', 'SL & Sick Leave resolve to SL semantic key');
  assert(resolveLeaveTypeColorKey('EL') === 'EL' && resolveLeaveTypeColorKey('Earned Leave') === 'EL', 'EL & Earned Leave resolve to EL semantic key');
  assert(resolveLeaveTypeColorKey('EMERGENCY') === 'EMERGENCY' && resolveLeaveTypeColorKey('Emergency Leave') === 'EMERGENCY', 'EMERGENCY & Emergency Leave resolve to EMERGENCY semantic key');
  assert(resolveLeaveTypeColorKey('LWP') === 'LWP' && resolveLeaveTypeColorKey('Leave Without Pay') === 'LWP', 'LWP & Leave Without Pay resolve to LWP semantic key');

  assert(getLeaveTypeBadgeClasses('CL').includes('sky'), 'CL badge uses Corporate Sky Blue');
  assert(getLeaveTypeBadgeClasses('SL').includes('amber'), 'SL badge uses Corporate Amber');
  assert(getLeaveTypeBadgeClasses('EL').includes('emerald'), 'EL badge uses Corporate Emerald');
  assert(getLeaveTypeBadgeClasses('EMERGENCY').includes('rose'), 'Emergency badge uses Corporate Rose');
  assert(getLeaveTypeBadgeClasses('LWP').includes('purple'), 'LWP badge uses Corporate Purple');

  assert(getLeaveTypeBarColor('CL') === 'bg-sky-600', 'CL chart bar uses bg-sky-600');
  assert(getLeaveTypeBarColor('SL') === 'bg-amber-500', 'SL chart bar uses bg-amber-500');
  assert(getLeaveTypeBarColor('EL') === 'bg-emerald-600', 'EL chart bar uses bg-emerald-600');
  assert(getLeaveTypeBarColor('EMERGENCY') === 'bg-rose-600', 'Emergency chart bar uses bg-rose-600');
  assert(getLeaveTypeBarColor('LWP') === 'bg-purple-600', 'LWP chart bar uses bg-purple-600');

  // Verify semantic class presets use red brand identity
  assert(MT_THEME.button.primary.includes('bg-red-700') && MT_THEME.button.primary.includes('hover:bg-red-800'), 'MT_THEME.button.primary uses Professional RED (bg-red-700 / hover:bg-red-800)');
  assert(MT_THEME.navTabActive.includes('border-red-700') && MT_THEME.navTabActive.includes('text-red-700'), 'MT_THEME.navTabActive uses RED brand underline and text');
  assert(MT_THEME.mobile.bottomNavItemActive.includes('text-red-700') && MT_THEME.mobile.bottomNavItemActive.includes('bg-red-50'), 'MT_THEME.mobile.bottomNavItemActive uses RED brand highlight');
  assert(MT_THEME.mobile.drawerItemActive.includes('bg-red-700') && MT_THEME.mobile.drawerItemActive.includes('text-white'), 'MT_THEME.mobile.drawerItemActive uses RED brand background');

  // 5. Verify existing schedule category colour-coding is preserved
  console.log('\n5. Schedule Category Colour System Preservation');
  assert(Object.keys(SCHEDULE_CATEGORY_STYLES).length === 9, 'All 9 schedule categories preserved in MySchedule.tsx');

  // 6. Verify centralized Leave Type & Workflow Status helper adoption across core modules
  console.log('\n6. Cross-Module Adoption of Semantic Leave Type & Status Helpers');
  const leaveTypeConsumerFiles = [
    'src/components/Dashboard.tsx',
    'src/components/MyLeavePortal.tsx',
    'src/components/MyLeaveBalance.tsx',
    'src/components/TeamLeaderApprovalDashboard.tsx',
    'src/components/HrApprovalDashboard.tsx',
    'src/components/ManagementApprovalDashboard.tsx',
    'src/components/LeaveTypesAdmin.tsx',
    'src/components/LeavePoliciesAdmin.tsx',
    'src/components/AdminLeaveBalance.tsx',
    'src/components/ReportsMis.tsx',
    'src/components/MyProfile.tsx',
  ];

  for (const relPath of leaveTypeConsumerFiles) {
    const content = fs.readFileSync(path.resolve(relPath), 'utf8');
    assert(
      content.includes('getLeaveTypeBadgeClasses'),
      `${relPath} applies centralized getLeaveTypeBadgeClasses for CL, SL, EL, Emergency, and LWP`
    );
  }

  // 7. Verify Phase 3 Multi-Colour Semantic Card Architecture & Palette Consistency
  console.log('\n7. Cross-Module Semantic Coloured Card & Brand Palette Check');
  const uiFiles = [
    'src/App.tsx',
    'src/components/Dashboard.tsx',
    'src/components/MyLeavePortal.tsx',
    'src/components/MyLeaveBalance.tsx',
    'src/components/TeamLeaderApprovalDashboard.tsx',
    'src/components/HrApprovalDashboard.tsx',
    'src/components/ManagementApprovalDashboard.tsx',
    'src/components/MyProfile.tsx',
    'src/components/Employee360Trigger.tsx',
    'src/components/UserManagementAdmin.tsx',
    'src/components/LeaveTypesAdmin.tsx',
    'src/components/LeavePoliciesAdmin.tsx',
    'src/components/AdminLeaveBalance.tsx',
    'src/components/AdminSettingsModal.tsx',
    'src/components/AdminSystemSettings.tsx',
    'src/components/HolidayCalendarAdmin.tsx',
    'src/components/ShiftScheduleAdmin.tsx',
    'src/components/OvertimeAdmin.tsx',
    'src/components/ReportsMis.tsx',
    'src/components/NotificationCenter.tsx',
    'src/components/SystemAuditAdmin.tsx',
    'src/components/RoleSwitcher.tsx',
    'src/components/LeaveAttachmentBox.tsx',
    'src/components/admin/DepartmentAdmin.tsx',
    'src/components/admin/DesignationAdmin.tsx',
    'src/components/admin/EmployeeAdmin.tsx',
    'src/components/admin/RoleAdmin.tsx',
    'src/components/admin/WorkingDaysAdmin.tsx',
  ];

  // Phase 3 uses sky, emerald, amber, purple, rose, slate, teal, stone, indigo, red, neutral
  const nonStandardRegex = /\b(bg|text|border|ring|divide|placeholder)-(blue|gray|zinc|green|yellow)-\d{2,3}\b/;

  for (const relPath of uiFiles) {
    const content = fs.readFileSync(path.resolve(relPath), 'utf8');
    const match = content.match(nonStandardRegex);
    assert(
      !match,
      `${relPath} uses approved My Schedule & Enterprise semantic colour families (no random blue/gray/zinc/green/yellow drift)`,
      match ? `Found: ${match[0]}` : undefined
    );
    if (
      relPath !== 'src/components/RoleSwitcher.tsx' &&
      relPath !== 'src/components/Employee360Trigger.tsx'
    ) {
      assert(
        /\b(bg|text|border|ring)-red-\d{2,3}\b/.test(content),
        `${relPath} visibly applies Professional RED brand tokens for primary actions/accents`
      );
    }
    const paleGreyMatch = content.match(/(?<![:\w-])text-neutral-400\b/);
    assert(
      !paleGreyMatch,
      `${relPath} does not use pale grey text-neutral-400 for body/supporting text (uses #111827 / #374151 / #6B7280 hierarchy)`,
      paleGreyMatch ? `Found: ${paleGreyMatch[0]}` : undefined
    );
  }

  // Verify Phase 3 Coloured Card Top Strips (border-t-[5px] or MT_COLOR_CARDS / getLeaveTypeCardClasses / getStatusCardClasses)
  const cardScreens = [
    'src/components/Dashboard.tsx',
    'src/components/MyLeavePortal.tsx',
    'src/components/MyLeaveBalance.tsx',
    'src/components/TeamLeaderApprovalDashboard.tsx',
    'src/components/HrApprovalDashboard.tsx',
    'src/components/ManagementApprovalDashboard.tsx',
    'src/components/ShiftScheduleAdmin.tsx',
    'src/components/HolidayCalendarAdmin.tsx',
    'src/components/OvertimeAdmin.tsx',
    'src/components/MyProfile.tsx',
    'src/components/AdminLeaveBalance.tsx',
    'src/components/ReportsMis.tsx',
    'src/components/AdminSystemSettings.tsx',
    'src/components/NotificationCenter.tsx',
    'src/components/UserManagementAdmin.tsx',
    'src/components/LeaveTypesAdmin.tsx',
    'src/components/LeavePoliciesAdmin.tsx',
    'src/components/SystemAuditAdmin.tsx',
    'src/components/admin/RoleAdmin.tsx',
    'src/components/admin/EmployeeAdmin.tsx',
    'src/components/admin/DepartmentAdmin.tsx',
    'src/components/admin/DesignationAdmin.tsx',
    'src/components/admin/WorkingDaysAdmin.tsx',
  ];

  for (const relPath of cardScreens) {
    const content = fs.readFileSync(path.resolve(relPath), 'utf8');
    const hasThickTopStripOrCardHelper =
      content.includes('border-t-[5px]') ||
      content.includes('MT_COLOR_CARDS') ||
      content.includes('getLeaveTypeCardClasses') ||
      content.includes('getStatusCardClasses');
    assert(
      hasThickTopStripOrCardHelper,
      `${relPath} implements Phase 3 coloured card backgrounds + 5px top strips`
    );
  }

  // 8. Verify Mandatory 20-Point Enterprise Colour Specification Hex Values
  console.log('\n8. Mandatory Enterprise Colour Specification Exact Token Audit');
  assert(
    MT_COLOR_TOKENS.background.page.toLowerCase() === '#ffffff' &&
      MT_COLOR_TOKENS.background.canvas.toLowerCase() === '#ffffff' &&
      MT_COLOR_TOKENS.background.surface.toLowerCase() === '#ffffff' &&
      MT_COLOR_TOKENS.background.modal.toLowerCase() === '#ffffff',
    'Global application base (page, canvas, cards/surface, modal) is pure WHITE (#FFFFFF)'
  );
  assert(
    MT_COLOR_TOKENS.text.primary.toLowerCase() === '#111827' &&
      MT_COLOR_TOKENS.text.secondary.toLowerCase() === '#374151' &&
      MT_COLOR_TOKENS.text.muted.toLowerCase() === '#6b7280',
    'Text hierarchy matches #111827 (Primary), #374151 (Secondary), and #6B7280 (Muted)'
  );
  assert(
    MT_COLOR_TOKENS.primary.DEFAULT.toLowerCase() === '#c8102e' &&
      MT_COLOR_TOKENS.structural.DEFAULT.toLowerCase() === '#0f172a',
    'Corporate brand colours match Corporate Red (#C8102E) and Deep Navy/Charcoal (#0F172A)'
  );
  assert(
    MT_COLOR_TOKENS.border.DEFAULT.toLowerCase() === '#d1d5db' &&
      MT_COLOR_TOKENS.border.strong.toLowerCase() === '#9ca3af' &&
      MT_COLOR_TOKENS.border.corporate.toLowerCase() === '#c8102e',
    'Borders match Default (#D1D5DB), Strong (#9CA3AF), and Corporate/Active (#C8102E)'
  );
  assert(
    MT_COLOR_TOKENS.status.success.DEFAULT.toLowerCase() === '#16a34a' &&
      MT_COLOR_TOKENS.status.success.bg.toLowerCase() === '#f0fdf4' &&
      MT_COLOR_TOKENS.status.success.text.toLowerCase() === '#166534' &&
      MT_COLOR_TOKENS.status.warning.DEFAULT.toLowerCase() === '#d97706' &&
      MT_COLOR_TOKENS.status.warning.bg.toLowerCase() === '#fffbeb' &&
      MT_COLOR_TOKENS.status.warning.text.toLowerCase() === '#92400e' &&
      MT_COLOR_TOKENS.status.error.DEFAULT.toLowerCase() === '#dc2626' &&
      MT_COLOR_TOKENS.status.error.bg.toLowerCase() === '#fef2f2' &&
      MT_COLOR_TOKENS.status.error.text.toLowerCase() === '#991b1b' &&
      MT_COLOR_TOKENS.status.info.DEFAULT.toLowerCase() === '#2563eb' &&
      MT_COLOR_TOKENS.status.info.bg.toLowerCase() === '#eff6ff' &&
      MT_COLOR_TOKENS.status.info.text.toLowerCase() === '#1e40af',
    'Status/Alert colour system matches exact SUCCESS, WARNING, ERROR/REJECTED, and INFO specifications'
  );

  console.log(`\n===================================================================`);
  console.log(`PHASE 2 CORPORATE COLOUR SYSTEM TESTS: ${passed} passed, ${failed} failed`);
  console.log(`===================================================================`);

  if (failed > 0) {
    process.exit(1);
  }
}

run();
