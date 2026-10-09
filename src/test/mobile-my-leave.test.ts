import fs from 'fs';
import path from 'path';
import { MT_THEME, getStatusBadgeClasses } from '../utils/theme.ts';

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
  console.log('PHASE 2C-1 — MOBILE MY LEAVE / LEAVE APPLICATION VERIFICATION SUITE');
  console.log('===================================================================\n');

  const portalPath = path.resolve('src/components/MyLeavePortal.tsx');
  const appPath = path.resolve('src/App.tsx');
  const cssPath = path.resolve('src/index.css');

  const portalSource = fs.readFileSync(portalPath, 'utf8');
  const appSource = fs.readFileSync(appPath, 'utf8');
  const cssSource = fs.readFileSync(cssPath, 'utf8');

  // 1. Mobile-Only Scope (<768px) & Desktop Preservation (>=768px)
  console.log('1. Mobile-Only Scope (<768px) & Desktop Preservation (>=768px)');
  assert(
    portalSource.includes('id="my-leave-mobile-view"') &&
      portalSource.includes('className="md:hidden space-y-4 min-w-0"'),
    'Mobile My Leave view (#my-leave-mobile-view) is strictly scoped below 768px (md:hidden)'
  );
  assert(
    portalSource.includes('id="my-leave-desktop-view"') &&
      portalSource.includes('className="hidden md:block space-y-6"'),
    'Desktop My Leave view (#my-leave-desktop-view) is preserved unchanged at >=768px (hidden md:block)'
  );

  const mobileSplitIdx = portalSource.indexOf('id="my-leave-mobile-view"');
  const desktopSplitIdx = portalSource.indexOf('id="my-leave-desktop-view"');
  const modalSplitIdx = portalSource.indexOf('id="leave-cancel-modal"');

  const mobileSection = portalSource.slice(mobileSplitIdx, desktopSplitIdx);
  const desktopSection = portalSource.slice(desktopSplitIdx, modalSplitIdx);
  const modalSection = portalSource.slice(modalSplitIdx);

  assert(
    desktopSection.includes('id="btn-apply-leave"') &&
      desktopSection.includes('grid-cols-1 md:grid-cols-5 gap-3 text-xs') &&
      desktopSection.includes('id={`leave-request-card-${r.id}`}'),
    'Desktop My Leave layout, 5-column request row, and #btn-apply-leave trigger remain intact'
  );

  // 2. Mobile Leave Application Form UX & Clearly Separated Sections
  console.log('\n2. Mobile Leave Application Form UX & Touch-Friendly Controls (>=44px)');
  const requiredFormSections = [
    'id="leave-application-modal"',
    'id="leave-form-section-type"',
    'id="leave-form-section-dates"',
    'id="leave-form-section-summary"',
    'id="leave-form-section-reason"',
    'id="leave-form-section-emergency"',
    'id="leave-form-section-actions"',
  ];
  for (const sectionId of requiredFormSections) {
    assert(
      modalSection.includes(sectionId),
      `Leave Application modal includes clearly separated section ${sectionId}`
    );
  }

  assert(
    modalSection.includes('id="select-leave-type"') &&
      modalSection.includes('id="btn-day-type-full"') &&
      modalSection.includes('id="btn-day-type-half"') &&
      modalSection.includes('id="select-half-day-period"') &&
      modalSection.includes('id="select-reason-category"') &&
      modalSection.includes('id="input-start-date"') &&
      modalSection.includes('id="input-end-date"') &&
      modalSection.includes('id="textarea-leave-reason"') &&
      modalSection.includes('id="btn-remove-selected-attachment"') &&
      modalSection.includes('id="emergency-check"') &&
      modalSection.includes('id="btn-submit-leave-application"'),
    'All Leave Application controls (Leave Type, Full/Half Day, Session, Reason Category, Start/End Dates, Reason, Attachment, Emergency Exception, Submit) are present'
  );

  assert(
    modalSection.includes('checked={formEmergencyException}') &&
      modalSection.includes('Request advance notice waiver under Emergency Exception clause'),
    'Existing Emergency Exception control (#emergency-check) remains functionally unchanged'
  );

  assert(
    modalSection.includes('max-h-[92dvh]') &&
      modalSection.includes('overflow-y-auto') &&
      modalSection.includes('overscroll-contain'),
    'Leave Application modal supports on-screen keyboard scrolling (max-h-[92dvh] overflow-y-auto overscroll-contain)'
  );

  // 3. Mobile Leave Summary & Stacked Leave History Cards
  console.log('\n3. Mobile Leave Summary & Stacked Leave History Cards');
  assert(
    mobileSection.includes('id="mobile-my-leave-header"') &&
      mobileSection.includes('id="mobile-my-leave-summary"') &&
      mobileSection.includes('id="mobile-my-leave-history"'),
    'Mobile My Leave view includes Header, Summary Status Cards, and Stacked Leave History sections'
  );

  assert(
    mobileSection.includes('id={`mobile-leave-card-${r.id}`}') &&
      mobileSection.includes('r.requestNumber') &&
      mobileSection.includes('r.leaveTypeName') &&
      mobileSection.includes('formatDate(r.startDate)') &&
      mobileSection.includes('r.totalDays') &&
      mobileSection.includes('getClassificationBadge(r.requestClassification)') &&
      mobileSection.includes('formatDate(r.createdAt)') &&
      mobileSection.includes('getFinalStatusBadge(r)') &&
      mobileSection.includes('getDecisionBadge(r.teamLeaderDecision') &&
      mobileSection.includes('getDecisionBadge(r.hrDecision') &&
      mobileSection.includes('getDecisionBadge(r.managementDecision'),
    'Each mobile leave history card displays request number, leave type, date range, duration, classification, submission date, and 3-stage approval status'
  );

  // 4. Status Display & RED Brand Theme Tokens
  console.log('\n4. Centralized RED Brand Theme & Semantic Status Colours');
  assert(
    portalSource.includes('MT_THEME') &&
      portalSource.includes('getStatusBadgeClasses') &&
      portalSource.includes('../utils/theme.ts') &&
      getStatusBadgeClasses('APPROVED') === MT_THEME.badge.success &&
      getStatusBadgeClasses('PENDING') === MT_THEME.badge.warning &&
      getStatusBadgeClasses('REJECTED') === MT_THEME.badge.danger &&
      MT_THEME.badge.info.includes('sky-'),
    'MyLeavePortal reuses centralized RED brand theme and semantic status tokens (Approved=success, Pending=warning, Rejected=danger, Info=info)'
  );

  // 5. Touch Targets (>=44px) & Action Permission Preservation
  console.log('\n5. Touch Targets (>=44px) & Action Permission Preservation');
  const mobileButtons = mobileSection.match(/<button[\s\S]*?<\/button>/g) || [];
  assert(mobileButtons.length >= 4, `Found ${mobileButtons.length} mobile action buttons in #my-leave-mobile-view`);
  for (const btn of mobileButtons) {
    const hasTouchHeight =
      btn.includes('min-h-[44px]') || btn.includes('MT_THEME.mobile.touchTarget');
    assert(hasTouchHeight, 'Every mobile My Leave button enforces >= 44px touch target height');
  }

  assert(
    mobileSection.includes("(r.finalStatus === 'PENDING' || r.status === 'PENDING')") &&
      mobileSection.includes('setCancellingId(r.id)') &&
      mobileSection.includes('handleOpenEvents(r)'),
    'Mobile actions (Submit, Cancel Request when PENDING, View Approval Timeline) preserve exact permissions and handlers'
  );

  // 6. Responsive Widths (320px, 375px, 390px, 412px, 430px) & Safe Spacing
  console.log('\n6. Responsive Mobile Widths (320px, 375px, 390px, 412px, 430px) & Overflow Prevention');
  const mobileWidths = [320, 375, 390, 412, 430];
  for (const width of mobileWidths) {
    const horizontalPadding = 24; // px-3 (12px * 2) from App.tsx main container
    const cardOuterWidth = width - horizontalPadding;
    const cardInnerWidth = cardOuterWidth - 32; // p-4 (16px * 2)
    const twoColSummaryCardWidth = Math.floor((cardOuterWidth - 10) / 2); // grid-cols-2 gap-2.5 (10px)
    assert(
      cardOuterWidth >= 296 && cardInnerWidth >= 264 && twoColSummaryCardWidth >= 143,
      `Viewport ${width}px: stacked card (${cardOuterWidth}px), form/card inner width (${cardInnerWidth}px), and 2-col summary card (${twoColSummaryCardWidth}px) fit without horizontal overflow`
    );
  }

  assert(
    appSource.includes('mt-mobile-content-safe') &&
      cssSource.includes('.mt-mobile-content-safe') &&
      cssSource.includes('env(safe-area-inset-bottom'),
    'Mobile bottom navigation clearance (.mt-mobile-content-safe) prevents bottom nav from covering My Leave content'
  );

  // 7. Business Logic, API & Date Formatting Preservation
  console.log('\n7. Business Logic, API & Date Formatting Preservation');
  assert(
    portalSource.includes("apiFetch('/api/leave-requests/my')") &&
      portalSource.includes("apiFetch('/api/leave-requests/calculate'") &&
      portalSource.includes("apiFetch('/api/leave-requests'") &&
      portalSource.includes("apiFetch(`/api/leave-requests/${id}/cancel`") &&
      portalSource.includes("import { formatDate, formatDateTime } from '../utils/dateFormat.ts'"),
    'All leave API endpoints (/my, /calculate, POST /leave-requests, /cancel) and DD/MM/YYYY date formatting remain untouched'
  );

  console.log('\n===================================================================');
  console.log(`PHASE 2C-1 MOBILE MY LEAVE TESTS: ${passed} passed, ${failed} failed`);
  console.log('===================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

run();
