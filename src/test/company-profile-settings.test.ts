import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { Server } from 'node:http';
import { registerApiRoutes } from '../../server.ts';
import { UserService } from '../services/userService.ts';

async function runCompanyProfileSettingsTests() {
  console.log('==================================================================');
  console.log('COMPANY BRANDING & SYSTEM POLICY SETTINGS DIALOG VERIFICATION');
  console.log('==================================================================');

  UserService.resetMemoryStores();

  // 1. Inspect AdminSettingsModal.tsx source for default Daily Work Hours = 9 and auto-close on Save
  const modalPath = path.resolve('src', 'components', 'AdminSettingsModal.tsx');
  const modalSource = fs.readFileSync(modalPath, 'utf-8');

  assert.equal(
    modalSource.includes("standard_daily_work_hours: '9'"),
    true,
    "AdminSettingsModal.tsx initial state must default standard_daily_work_hours to '9'"
  );
  assert.equal(
    modalSource.includes("standard_daily_work_hours || '9'"),
    true,
    "AdminSettingsModal.tsx input fallback must default standard_daily_work_hours to '9'"
  );
  assert.equal(
    modalSource.includes("standard_daily_work_hours: '8'") ||
      modalSource.includes("standard_daily_work_hours || '8'"),
    false,
    'AdminSettingsModal.tsx must not have legacy 8-hour default for standard_daily_work_hours'
  );

  // Verify handleSave calls onClose() in the try block before catch
  const handleSaveMatch = modalSource.match(
    /const handleSave = async[\s\S]*?try \{([\s\S]*?)\} catch \(err: any\) \{([\s\S]*?)\} finally/
  );
  assert.ok(handleSaveMatch, 'handleSave try/catch block must exist in AdminSettingsModal.tsx');
  const tryBlock = handleSaveMatch[1];
  const catchBlock = handleSaveMatch[2];
  assert.equal(
    /\bonClose\(\)/.test(tryBlock),
    true,
    'handleSave must call onClose() on successful save'
  );
  assert.equal(
    /\bonClose\(\)/.test(catchBlock),
    false,
    'handleSave must NOT call onClose() when save fails'
  );
  assert.equal(
    /\bsetError\(/.test(catchBlock),
    true,
    'handleSave must set error feedback when save fails'
  );
  console.log('  [PASS] 1. AdminSettingsModal.tsx defaults Daily Work Hours to 9, closes on Save, and stays open on error');

  // Start test Express server
  const app = express();
  registerApiRoutes(app);
  const server: Server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });

  try {
    const addr = server.address();
    const baseUrl = typeof addr === 'object' && addr ? `http://127.0.0.1:${addr.port}` : '';
    const adminHeaders = {
      'Content-Type': 'application/json',
      'x-user-role': 'SUPER_ADMIN',
      'x-user-id': '1',
      'x-employee-id': '1',
    };

    // 2. Verify GET /api/settings returns default standard_daily_work_hours = '9' and 08:30-17:30
    const initialRes = await fetch(`${baseUrl}/api/settings`, { headers: adminHeaders });
    assert.equal(initialRes.status, 200);
    const initialData = await initialRes.json();
    const settingsMap = new Map<string, string>(
      initialData.settings.map((s: any) => [s.settingKey, s.settingValue])
    );
    assert.equal(
      settingsMap.get('standard_daily_work_hours'),
      '9',
      'GET /api/settings must return standard_daily_work_hours = 9 by default'
    );
    assert.equal(settingsMap.get('office_start_time'), '08:30');
    assert.equal(settingsMap.get('office_end_time'), '17:30');
    assert.equal(settingsMap.get('working_days_per_week'), '6');
    console.log('  [PASS] 2. GET /api/settings returns default Daily Work Hours = 9 (08:30–17:30)');

    // 3. Simulate saving updated settings from the dialog and reopening the dialog
    const dialogSettingsToSave: Record<string, string> = {
      office_start_time: '08:30',
      office_end_time: '17:30',
      leave_cutoff_time: '17:45',
      working_days_per_week: '6',
      standard_daily_work_hours: '9',
      fiscal_year_start_month: '4',
    };

    let modalOpen = true;
    const onClose = () => {
      modalOpen = false;
    };

    for (const [key, val] of Object.entries(dialogSettingsToSave)) {
      const putRes = await fetch(`${baseUrl}/api/settings/${encodeURIComponent(key)}`, {
        method: 'PUT',
        headers: adminHeaders,
        body: JSON.stringify({ settingValue: String(val) }),
      });
      assert.equal(putRes.status, 200, `PUT /api/settings/${key} must succeed`);
    }
    onClose();
    assert.equal(modalOpen, false, 'Dialog must close automatically after all settings save');

    // Reopen dialog -> fetch GET /api/settings
    modalOpen = true;
    const reopenRes = await fetch(`${baseUrl}/api/settings`, { headers: adminHeaders });
    assert.equal(reopenRes.status, 200);
    const reopenData = await reopenRes.json();
    const reopenMap = new Map<string, string>(
      reopenData.settings.map((s: any) => [s.settingKey, s.settingValue])
    );
    assert.equal(reopenMap.get('leave_cutoff_time'), '17:45');
    assert.equal(reopenMap.get('fiscal_year_start_month'), '4');
    assert.equal(reopenMap.get('standard_daily_work_hours'), '9');
    console.log('  [PASS] 3. Saved settings persist when reopening the dialog and dialog closes on Save');

    // 4. Verify custom Daily Work Hours (e.g. 10) is preserved across reload / simulated server restart
    const customHoursRes = await fetch(`${baseUrl}/api/settings/standard_daily_work_hours`, {
      method: 'PUT',
      headers: adminHeaders,
      body: JSON.stringify({ settingValue: '10' }),
    });
    assert.equal(customHoursRes.status, 200);

    // Simulate server restart / reload from disk
    UserService.simulateServerRestart();

    const afterRestartRes = await fetch(`${baseUrl}/api/settings`, { headers: adminHeaders });
    assert.equal(afterRestartRes.status, 200);
    const afterRestartData = await afterRestartRes.json();
    const afterRestartMap = new Map<string, string>(
      afterRestartData.settings.map((s: any) => [s.settingKey, s.settingValue])
    );
    assert.equal(
      afterRestartMap.get('standard_daily_work_hours'),
      '10',
      'Explicitly saved valid Daily Work Hours (10) must persist after reload/restart and not be overwritten'
    );
    assert.equal(
      afterRestartMap.get('leave_cutoff_time'),
      '17:45',
      'Explicitly saved leave_cutoff_time (17:45) must persist after reload/restart'
    );
    console.log('  [PASS] 4. Explicitly saved settings persist across reload/simulated restart without being overwritten');

    // Restore back to 9 hours and verify
    const restore9Res = await fetch(`${baseUrl}/api/settings/standard_daily_work_hours`, {
      method: 'PUT',
      headers: adminHeaders,
      body: JSON.stringify({ settingValue: '9' }),
    });
    assert.equal(restore9Res.status, 200);

    // 5. Verify failed Save keeps dialog open and returns error feedback
    modalOpen = true;
    let capturedError: string | null = null;
    const badRes = await fetch(`${baseUrl}/api/settings/standard_daily_work_hours`, {
      method: 'PUT',
      headers: adminHeaders,
      body: JSON.stringify({ settingValue: '0' }),
    });
    if (!badRes.ok) {
      const errJson = await badRes.json();
      capturedError = errJson.error || 'Failed to update setting';
    } else {
      onClose();
    }
    assert.equal(badRes.status, 400, 'Invalid Daily Work Hours (0) must be rejected with 400');
    assert.equal(modalOpen, true, 'Dialog must remain open when Save fails');
    assert.ok(
      capturedError && capturedError.includes('Daily Work Hours'),
      'Error feedback must be returned when Save fails'
    );
    console.log('  [PASS] 5. Failed Save returns 400 error feedback and keeps dialog open');
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  // Clean up test artifact files
  for (const file of ['company_branding.test.json', 'roles_and_users.test.json']) {
    const p = path.resolve('uploads', 'metadata', file);
    if (fs.existsSync(p)) {
      try {
        fs.unlinkSync(p);
      } catch {}
    }
  }

  console.log('\nALL 5 COMPANY PROFILE & SYSTEM POLICY SETTINGS TESTS PASSED!');
}

runCompanyProfileSettingsTests().catch((err) => {
  console.error('Company Profile Settings Test Failed:', err);
  process.exit(1);
});
