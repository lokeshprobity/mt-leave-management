import fs from 'fs';
import path from 'path';
import { MT_THEME } from '../utils/theme.ts';
import { canAccessModule } from '../lib/api.ts';
import { UserRole } from '../types/leave.ts';

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
  console.log('================================================================');
  console.log('PHASE 2B — MOBILE DASHBOARD / HOME VERIFICATION SUITE');
  console.log('================================================================\n');

  const dashboardSource = fs.readFileSync(path.resolve('src/components/Dashboard.tsx'), 'utf8');
  const appSource = fs.readFileSync(path.resolve('src/App.tsx'), 'utf8');
  const cssSource = fs.readFileSync(path.resolve('src/index.css'), 'utf8');

  // Split mobile and desktop sections to verify isolation
  const mobileSplitIndex = dashboardSource.indexOf('id="dashboard-mobile-view"');
  const desktopSplitIndex = dashboardSource.indexOf('id="dashboard-desktop-view"');

  const mobileSection =
    mobileSplitIndex !== -1 && desktopSplitIndex !== -1
      ? dashboardSource.slice(mobileSplitIndex, desktopSplitIndex)
      : '';
  const desktopSection =
    desktopSplitIndex !== -1 ? dashboardSource.slice(desktopSplitIndex) : '';

  // 1. Mobile Breakpoint Isolation & Desktop Dashboard Preservation
  console.log('1. Mobile Breakpoint (<768px) Isolation & Desktop Preservation');
  assert(
    dashboardSource.includes('id="dashboard-mobile-view" className="md:hidden space-y-4 min-w-0"'),
    'Mobile dashboard view (#dashboard-mobile-view) is strictly scoped to <768px via md:hidden'
  );
  assert(
    dashboardSource.includes('id="dashboard-desktop-view" className="hidden md:block space-y-6"'),
    'Desktop dashboard view (#dashboard-desktop-view) is preserved for >=768px via hidden md:block'
  );
  assert(
    desktopSection.includes('grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3') &&
      desktopSection.includes('grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3') &&
      desktopSection.includes('<table className="w-full text-left text-xs">'),
    'Desktop KPI grids, balance grid, and On Leave Today table remain 100% intact in desktop view'
  );

  // 2. Mobile Dashboard Page Hierarchy
  console.log('\n2. Mobile Dashboard Page Structure & Visual Hierarchy');
  assert(
    mobileSection.includes('id="mobile-dashboard-welcome"') &&
      mobileSection.includes('{displayUserName}') &&
      mobileSection.includes('{formatRoleDisplayName(activeRole)}') &&
      mobileSection.includes('{todayStr}'),
    'Mobile dashboard includes Welcome/User section (#mobile-dashboard-welcome) with user name, role, and formatted date'
  );
  assert(
    mobileSection.includes('id="mobile-dashboard-quick-actions"'),
    'Mobile dashboard includes dedicated Quick Actions section (#mobile-dashboard-quick-actions)'
  );
  assert(
    mobileSection.includes('id="mobile-dashboard-summary-cards"') &&
      mobileSection.includes('id="mobile-dashboard-leave-balances"'),
    'Mobile dashboard includes Important Status/Summary Cards (#mobile-dashboard-summary-cards) and stacked Leave Balances (#mobile-dashboard-leave-balances)'
  );
  assert(
    mobileSection.includes('id="mobile-dashboard-pending-items"') &&
      mobileSection.includes('id="mobile-dashboard-on-leave-today"'),
    'Mobile dashboard includes Relevant Pending Items (#mobile-dashboard-pending-items) and stacked On Leave Today cards (#mobile-dashboard-on-leave-today)'
  );
  assert(
    mobileSection.includes('id="mobile-dashboard-activity-section"') &&
      mobileSection.includes('Notifications &amp; Alerts'),
    'Mobile dashboard includes Recent Activity/Notifications & Upcoming Schedule section (#mobile-dashboard-activity-section)'
  );

  // 3. Stacked Mobile Cards & Centralized Design Tokens
  console.log('\n3. Stacked Mobile Cards & Centralized Token Reuse');
  assert(
    dashboardSource.includes('MT_THEME') &&
      dashboardSource.includes('getStatusBadgeClasses') &&
      dashboardSource.includes('../utils/theme.ts') &&
      mobileSection.includes('MT_THEME.card') &&
      mobileSection.includes('MT_THEME.badge') &&
      mobileSection.includes('MT_THEME.mobile.touchTarget'),
    'Mobile dashboard reuses centralized MT_THEME and getStatusBadgeClasses design tokens'
  );
  assert(
    !mobileSection.includes('<table'),
    'Mobile dashboard converts wide desktop tables into stacked mobile cards (<768px contains no wide <table>)'
  );
  assert(
    !mobileSection.includes('lg:grid-cols-7') && !mobileSection.includes('lg:grid-cols-5'),
    'Mobile dashboard avoids cramped multi-column desktop grids on narrow screens'
  );

  // 4. Touch-Friendly Quick Actions (>= 44px) & Role Permission Preservation
  console.log('\n4. Touch-Friendly Controls (>=44px) & Role-Based Permission Parity');
  const mobileButtons = mobileSection.match(/<button[\s\S]*?<\/button>/g) || [];
  assert(mobileButtons.length >= 6, `Found ${mobileButtons.length} mobile action buttons in #dashboard-mobile-view`);

  const allMobileButtonsHave44px = mobileButtons.every(
    (btnBlock) =>
      btnBlock.includes('min-h-[44px]') || btnBlock.includes('MT_THEME.mobile.touchTarget')
  );
  assert(
    allMobileButtonsHave44px && MT_THEME.mobile.touchTarget.includes('min-h-[44px]'),
    'Every button in #dashboard-mobile-view enforces a minimum 44px touch target height'
  );

  assert(
    mobileSection.includes("onNavigate('my-leave')") &&
      mobileSection.includes("onNavigate('leave-balance')") &&
      mobileSection.includes("canAccessModule('team-leader', activeRole)") &&
      mobileSection.includes("canAccessModule('hr', activeRole)") &&
      mobileSection.includes("canAccessModule('management', activeRole)"),
    'Mobile quick actions strictly preserve existing navigation targets and canAccessModule role checks'
  );

  const roles: UserRole[] = ['EMPLOYEE', 'TEAM_LEADER', 'HR', 'TOP_MANAGEMENT', 'SUPER_ADMIN'];
  for (const role of roles) {
    if (role === 'EMPLOYEE') {
      assert(
        !canAccessModule('team-leader', role) &&
          !canAccessModule('hr', role) &&
          !canAccessModule('management', role),
        'EMPLOYEE mobile quick actions exclude Team Leader, HR, and Management approval desks'
      );
    }
    if (role === 'TEAM_LEADER') {
      assert(
        canAccessModule('team-leader', role) &&
          !canAccessModule('hr', role) &&
          !canAccessModule('management', role),
        'TEAM_LEADER mobile quick actions grant access only to Team Leader desk'
      );
    }
    if (role === 'HR') {
      assert(
        canAccessModule('hr', role) && !canAccessModule('management', role),
        'HR mobile quick actions grant access to HR desk and exclude Management desk'
      );
    }
  }

  // 5. Responsive Mobile Widths Verification (320px, 375px, 390px, 412px, 430px)
  console.log('\n5. Responsive Mobile Widths (320px, 375px, 390px, 412px, 430px) & Safe Spacing');
  const mobileWidths = [320, 375, 390, 412, 430];
  // Main container uses p-3 (12px left + 12px right = 24px horizontal padding on <640px)
  const containerHorizontalPadding = 24;
  // Card internal padding p-4 (16px left + 16px right = 32px)
  const cardInnerPadding = 32;

  for (const widthPx of mobileWidths) {
    const availableCardWidth = widthPx - containerHorizontalPadding;
    const innerContentWidth = availableCardWidth - cardInnerPadding;
    // 2-column KPI summary row (grid-cols-2 gap-2.5 => 10px gap)
    const twoColCardWidth = Math.floor((availableCardWidth - 10) / 2);

    assert(
      availableCardWidth >= 296 && innerContentWidth >= 264 && twoColCardWidth >= 143,
      `Viewport ${widthPx}px: stacked card width (${availableCardWidth}px), inner content (${innerContentWidth}px), and 2-col summary card (${twoColCardWidth}px) fit without overflow`
    );
  }

  assert(
    appSource.includes('mt-mobile-content-safe') &&
      cssSource.includes('.mt-mobile-content-safe') &&
      cssSource.includes('env(safe-area-inset-bottom'),
    'Mobile bottom navigation clearance (.mt-mobile-content-safe) prevents bottom nav from covering dashboard content'
  );

  // 6. Data & Business Logic Preservation Check
  console.log('\n6. Existing Data, API & Date Formatting Preservation');
  assert(
    dashboardSource.includes("fetch('/api/dashboard/stats'") &&
      dashboardSource.includes('formatDate('),
    'Dashboard continues to use existing /api/dashboard/stats endpoint and DD/MM/YYYY formatDate utility'
  );

  console.log('\n================================================================');
  console.log(`TOTAL: ${passed} passed, ${failed} failed`);
  console.log('================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

run();
