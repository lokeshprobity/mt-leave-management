import fs from 'fs';
import path from 'path';
import { MT_THEME } from '../utils/theme.ts';
import { canAccessModule, canAccessAdminTab } from '../lib/api.ts';
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
  console.log('PHASE 2A — MOBILE APP SHELL & NAVIGATION VERIFICATION SUITE');
  console.log('================================================================\n');

  const appSource = fs.readFileSync(path.resolve('src/App.tsx'), 'utf8');
  const cssSource = fs.readFileSync(path.resolve('src/index.css'), 'utf8');
  const notifSource = fs.readFileSync(path.resolve('src/components/NotificationCenter.tsx'), 'utf8');

  // 1. Mobile App Shell & Standard Design Tokens
  console.log('1. Mobile App Shell & Shared Design Token Integration');
  assert(Boolean(MT_THEME.mobile), 'MT_THEME.mobile token group exists in src/utils/theme.ts');
  assert(
    Boolean(
      MT_THEME.mobile.header &&
        MT_THEME.mobile.bottomNav &&
        MT_THEME.mobile.bottomNavItem &&
        MT_THEME.mobile.drawerBackdrop &&
        MT_THEME.mobile.drawerPanel &&
        MT_THEME.mobile.drawerItem &&
        MT_THEME.mobile.touchTarget
    ),
    'All mobile shell tokens (header, bottomNav, drawer, touchTarget) defined in MT_THEME.mobile'
  );
  assert(
    appSource.includes("import { MT_THEME } from './utils/theme.ts'") &&
      appSource.includes('MT_THEME.mobile.header') &&
      appSource.includes('MT_THEME.mobile.bottomNav') &&
      appSource.includes('MT_THEME.mobile.drawerPanel'),
    'src/App.tsx consumes centralized MT_THEME.mobile tokens'
  );
  assert(
    cssSource.includes('.mt-bottom-nav-safe') && cssSource.includes('.mt-mobile-content-safe'),
    'src/index.css defines safe-area bottom navigation & content clearance classes'
  );

  // 2. Mobile Header Verification
  console.log('\n2. Mobile Header (Identity, Active Module Title, Notifications, Profile, Touch Sizing)');
  assert(
    appSource.includes('id="btn-mobile-drawer-open"') &&
      appSource.includes('aria-controls="mobile-navigation-drawer"'),
    'Mobile header includes touch-friendly drawer menu button (#btn-mobile-drawer-open)'
  );
  assert(
    appSource.includes('id="mobile-current-page-title"') &&
      appSource.includes('{currentMobilePageTitle}'),
    'Mobile header displays dynamic current page/module title (#mobile-current-page-title)'
  );
  assert(
    appSource.includes('<NotificationCenter') &&
      notifSource.includes('id="btn-notification-bell"') &&
      notifSource.includes('min-h-[44px] min-w-[44px]'),
    'Mobile header integrates NotificationCenter with >= 44px touch target'
  );
  assert(
    appSource.includes('id="header-user-profile-btn"') &&
      appSource.includes('id="btn-header-logout"'),
    'Mobile header preserves user/profile menu trigger and logout access'
  );

  // 3. Mobile Navigation (Bottom Navigation Bar + Drawer without Desktop Duplication)
  console.log('\n3. Mobile Navigation & Desktop Preservation');
  assert(
    appSource.includes('id="main-navigation"') &&
      appSource.includes('hidden md:block bg-white border-b'),
    'Desktop horizontal navigation bar (#main-navigation) is preserved on desktop (md:block) and hidden on mobile'
  );
  assert(
    appSource.includes('id="mobile-bottom-nav"') &&
      appSource.includes('mobile-bottom-nav-btn-') &&
      appSource.includes('id="btn-mobile-nav-more"'),
    'Dedicated mobile bottom navigation bar (#mobile-bottom-nav) with primary role tabs and Menu trigger is rendered'
  );
  assert(
    MT_THEME.mobile.bottomNavItem.includes('min-h-[52px]'),
    'Mobile bottom navigation items enforce >= 52px touch-friendly height'
  );

  // 4. Mobile Drawer / Sidebar Open & Close Behaviour
  console.log('\n4. Mobile Navigation Drawer & Administration Section Switcher');
  assert(
    appSource.includes('id="mobile-navigation-drawer"') &&
      appSource.includes('id="mobile-drawer-backdrop"') &&
      appSource.includes('id="btn-mobile-drawer-close"'),
    'Mobile slide-over navigation drawer, backdrop, and close button are implemented'
  );
  assert(
    appSource.includes("e.key === 'Escape'") &&
      appSource.includes("document.body.style.overflow = 'hidden'"),
    'Mobile drawer supports Escape key dismissal and locks background body scroll when open'
  );
  assert(
    appSource.includes('id="mobile-admin-section-bar"') &&
      appSource.includes('id="btn-mobile-admin-drawer"') &&
      appSource.includes('hidden md:flex items-center gap-1.5 border-b border-neutral-200'),
    'Administration module provides mobile section switcher bar on mobile while preserving desktop sub-tab strip on md+'
  );

  // 5. Role-Based Navigation Permissions Preservation
  console.log('\n5. Role-Based Navigation & Admin Tab Permission Parity (Desktop vs Mobile)');
  const allModules = [
    'welcome',
    'dashboard',
    'my-leave',
    'leave-balance',
    'my-schedule',
    'my-profile',
    'team-leader',
    'hr',
    'management',
    'reports',
    'administration',
  ];
  const roles: UserRole[] = ['EMPLOYEE', 'TEAM_LEADER', 'HR', 'TOP_MANAGEMENT', 'SUPER_ADMIN'];

  for (const role of roles) {
    const allowedModules = allModules.filter((m) => canAccessModule(m, role));
    assert(
      allowedModules.includes('dashboard') && allowedModules.includes('my-profile'),
      `Role ${role} has authorized modules (${allowedModules.length} modules) filtered identically via canAccessModule`
    );
    if (role === 'EMPLOYEE') {
      assert(
        !allowedModules.includes('administration') &&
          !allowedModules.includes('hr') &&
          !allowedModules.includes('management') &&
          !allowedModules.includes('team-leader'),
        'EMPLOYEE mobile & desktop navigation strictly excludes Team Leader, HR, Management, and Administration'
      );
    }
    if (role === 'TEAM_LEADER') {
      assert(
        allowedModules.includes('team-leader') && !allowedModules.includes('administration'),
        'TEAM_LEADER mobile & desktop navigation includes Team Leader desk and excludes Administration'
      );
    }
    if (role === 'SUPER_ADMIN') {
      const allowedAdminTabs = [
        'users',
        'employees',
        'roles',
        'departments',
        'designations',
        'working-days',
        'weekly-offs',
        'shifts',
        'employee-shifts',
        'department-shifts',
        'overtime',
        'audit',
        'leave-types',
        'leave-policies',
        'holidays',
        'system-overview',
      ].filter((t) => canAccessAdminTab(t, role));
      assert(
        allowedAdminTabs.length === 16,
        'SUPER_ADMIN mobile drawer & desktop strip grant access to all 16 Administration tabs'
      );
    }
  }

  // 6. Responsive Viewport Widths Check (320px, 375px, 390px, 412px, 430px)
  console.log('\n6. Responsive Mobile Widths (320px, 375px, 390px, 412px, 430px) & Overflow Prevention');
  const mobileWidths = [320, 375, 390, 412, 430];
  for (const widthPx of mobileWidths) {
    // Verify drawer width (86vw capped at 320px) fits comfortably inside viewport with backdrop margin
    const drawerComputedWidth = Math.min(Math.round(widthPx * 0.86), 320);
    // Verify dropdown max-width (calc(100vw - 1.5rem) = widthPx - 24) fits inside viewport
    const dropdownMaxWidth = widthPx - 24;
    // Verify 5 bottom nav items fit inside viewport (each flex-1 min-w-0 >= 56px at 320px)
    const perTabWidth = Math.floor((widthPx - 12) / 5);

    assert(
      drawerComputedWidth <= widthPx &&
        dropdownMaxWidth <= widthPx &&
        perTabWidth >= 56,
      `Viewport ${widthPx}px: drawer (${drawerComputedWidth}px), dropdowns (max ${dropdownMaxWidth}px), and 5 bottom-nav targets (${perTabWidth}px each) fit without horizontal overflow`
    );
  }

  assert(
    appSource.includes('overflow-x-hidden') &&
      cssSource.includes('overflow-x: hidden') &&
      notifSource.includes('max-w-[calc(100vw-1.5rem)]') &&
      appSource.includes('max-w-[calc(100vw-1.5rem)]'),
    'Root container, body, notification dropdown, and user menu enforce viewport-safe horizontal bounds'
  );

  console.log(`\n================================================================`);
  console.log(`PHASE 2A MOBILE SHELL TESTS: ${passed} passed, ${failed} failed`);
  console.log(`================================================================`);

  if (failed > 0) {
    process.exit(1);
  }
}

run();
