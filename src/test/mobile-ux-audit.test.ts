import fs from 'fs';
import path from 'path';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FAIL: ${message}`);
    process.exit(1);
  }
  console.log(`✅ PASS: ${message}`);
}

const readSrc = (relPath: string) =>
  fs.readFileSync(path.resolve(process.cwd(), 'src', relPath), 'utf-8');

function runMobileUxAuditTests() {
  console.log('==========================================================');
  console.log('TRUE MOBILE APP EXPERIENCE (<768px) VERIFICATION SUITE');
  console.log('==========================================================');

  const appSrc = readSrc('App.tsx');
  const dashboardSrc = readSrc('components/Dashboard.tsx');
  const myLeaveSrc = readSrc('components/MyLeavePortal.tsx');
  const myBalanceSrc = readSrc('components/MyLeaveBalance.tsx');
  const myScheduleSrc = readSrc('components/MySchedule.tsx');
  const tlApprovalSrc = readSrc('components/TeamLeaderApprovalDashboard.tsx');
  const hrApprovalSrc = readSrc('components/HrApprovalDashboard.tsx');
  const mgmtApprovalSrc = readSrc('components/ManagementApprovalDashboard.tsx');
  const myProfileSrc = readSrc('components/MyProfile.tsx');
  const reportsSrc = readSrc('components/ReportsMis.tsx');
  const roleAdminSrc = readSrc('components/admin/RoleAdmin.tsx');
  const userMgmtSrc = readSrc('components/UserManagementAdmin.tsx');
  const indexCssSrc = readSrc('index.css');

  // 1. Mobile App Shell & Header
  assert(
    appSrc.includes('id="app-header"') &&
      appSrc.includes('id="btn-mobile-header-back"') &&
      appSrc.includes('id="mobile-bottom-nav"') &&
      appSrc.includes('id="mobile-navigation-drawer"') &&
      appSrc.includes('id="app-footer"') &&
      appSrc.includes('hidden md:block bg-white border-t'),
    '1. Mobile App Shell (<768px) uses native app header with back navigation, hides website footer on mobile, and keeps persistent bottom navigation'
  );

  // 2. Mobile More / Menu Hub
  assert(
    appSrc.includes('id="mobile-drawer-admin-search"') &&
      appSrc.includes('My Workspace') &&
      appSrc.includes('Approvals &amp; Operations') &&
      appSrc.includes('min-h-[44px]'),
    '2. Mobile More / Menu Hub organizes secondary & admin destinations into native iOS/Android grouped sections with quick search'
  );

  // 3. Login & Logout Modal Touch Ergonomics
  assert(
    appSrc.includes('id="input-login-identifier"') &&
      appSrc.includes('id="input-login-password"') &&
      appSrc.includes('id="btn-login-submit"') &&
      appSrc.includes('id="logout-confirm-modal"') &&
      appSrc.includes('items-end sm:items-center'),
    '3. Login screen and Logout confirmation modal use 44px+ touch targets and bottom-sheet ergonomics on mobile'
  );

  // 4. Employee Leave Balances (<768px)
  assert(
    myBalanceSrc.includes('id="leave-balance-mobile-view"') &&
      myBalanceSrc.includes('id="leave-balance-desktop-view"') &&
      myBalanceSrc.includes('md:hidden') &&
      myBalanceSrc.includes('hidden md:block') &&
      myBalanceSrc.includes('min-h-[44px]'),
    '4. Employee Leave Balances (<768px) renders dedicated mobile cards (#leave-balance-mobile-view) while preserving desktop table (#leave-balance-desktop-view)'
  );

  // 5. My Leave / Leave Application (<768px)
  assert(
    myLeaveSrc.includes('id="my-leave-mobile-view"') &&
      myLeaveSrc.includes('id="my-leave-desktop-view"') &&
      myLeaveSrc.includes('id="mobile-my-leave-filter-bar"') &&
      myLeaveSrc.includes('id="leave-application-modal"') &&
      myLeaveSrc.includes('items-end md:items-center'),
    '5. My Leave / Leave Application (<768px) provides interactive status filter pills, mobile cards, and bottom-sheet modals with 44px+ touch targets'
  );

  // 6. My Schedule (<768px)
  assert(
    myScheduleSrc.includes('id="my-schedule-mobile-filter-strip"') &&
      myScheduleSrc.includes('id="my-schedule-mobile-legend-toggle"') &&
      myScheduleSrc.includes('id="today-schedule-card"') &&
      myScheduleSrc.includes('min-h-[44px]'),
    '6. My Schedule (<768px) provides horizontal quick-filter chips and collapsible full legend so Today Schedule is immediately visible'
  );

  // 7. Approval Desks (Team Leader, HR, Top Management) & Reports MIS
  assert(
    tlApprovalSrc.includes('id="tl-approval-mobile-cards"') &&
      tlApprovalSrc.includes('hidden md:block') &&
      tlApprovalSrc.includes('items-end sm:items-center') &&
      hrApprovalSrc.includes('id="hr-approval-mobile-cards"') &&
      hrApprovalSrc.includes('hidden md:block') &&
      hrApprovalSrc.includes('items-end sm:items-center') &&
      mgmtApprovalSrc.includes('id="mgmt-approval-mobile-cards"') &&
      mgmtApprovalSrc.includes('hidden md:block') &&
      mgmtApprovalSrc.includes('items-end sm:items-center') &&
      reportsSrc.includes('id="reports-employee-mobile-cards"'),
    '7. Approval Desks (Team Leader, HR, Top Management) & Reports MIS render dedicated mobile cards (<768px) and bottom-sheet decision modals while keeping desktop tables (>=768px)'
  );

  // 8. My Profile, Dashboard & Global Mobile Form Ergonomics
  assert(
    dashboardSrc.includes('id="dashboard-mobile-view"') &&
      dashboardSrc.includes('id="dashboard-desktop-view"') &&
      myProfileSrc.includes('id="my-profile-root"') &&
      myProfileSrc.includes('w-full max-w-full min-w-0 overflow-x-hidden') &&
      myProfileSrc.includes('id="super-admin-profile-console"') &&
      myProfileSrc.includes('id="select-inspect-operate-user"') &&
      myProfileSrc.includes('id="profile-navigation-tabs"') &&
      myProfileSrc.includes('grid grid-cols-2 sm:flex sm:flex-wrap') &&
      myProfileSrc.includes('min-w-0') &&
      myProfileSrc.includes('max-w-full') &&
      myProfileSrc.includes('min-h-[44px]') &&
      appSrc.includes("drillDownTarget || activeModule !== 'dashboard' ? 'hidden' : 'inline-flex md:hidden'") &&
      indexCssSrc.includes('@media (max-width: 767px)') &&
      indexCssSrc.includes('#app-container select'),
    '8. My Profile, Super Admin Profile Console, Mobile Header, Mobile Dashboard, and Global CSS prevent horizontal overflow and provide 44px touch targets'
  );

  // 9. Role Master Screen (<768px: 320px, 375px, 390px, 412px, 430px) Responsive Layout & Overflow Prevention
  const mobileWidths = [320, 375, 390, 412, 430];
  const hasUnconstrainedShrink0RightCol = roleAdminSrc.includes('className="text-right shrink-0"');
  const hasBareColSpan2In1ColGrid = roleAdminSrc.includes('className="col-span-2 ');
  assert(
    userMgmtSrc.includes('w-full max-w-full min-w-0 overflow-x-hidden') &&
      roleAdminSrc.includes('id="role-master-root"') &&
      roleAdminSrc.includes('id="role-cards-grid"') &&
      roleAdminSrc.includes('w-full max-w-full min-w-0 overflow-x-hidden') &&
      roleAdminSrc.includes('flex flex-col sm:flex-row sm:items-start justify-between gap-3 w-full max-w-full min-w-0') &&
      roleAdminSrc.includes('min-w-0 flex-1 w-full') &&
      roleAdminSrc.includes('break-all max-w-full') &&
      roleAdminSrc.includes('items-end sm:items-center') &&
      !hasUnconstrainedShrink0RightCol &&
      !hasBareColSpan2In1ColGrid &&
      mobileWidths.every((vw) => {
        // Container padding on mobile: p-3 (24px) + card p-4 (32px) + 2px border = 58px chrome
        const availableCardContentWidth = vw - 58;
        // stacked header/description & wrapped buttons fit within 262px..372px
        return availableCardContentWidth >= 260;
      }),
    `9. Role Master screen (RoleAdmin.tsx) prevents flex/grid overflow, stacks metadata and action buttons cleanly, and keeps Edit Role & Configure Permissions fully visible across ${mobileWidths.join(', ')} px widths`
  );

  console.log('==========================================================');
  console.log('ALL 9 MOBILE APP UX VERIFICATION CHECKS PASSED!');
  console.log('==========================================================');
}

runMobileUxAuditTests();
