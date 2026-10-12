import React, { useState, useEffect } from 'react';
import {
  Sliders,
  Save,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Trash2,
} from 'lucide-react';
import { getAuthHeaders, getActiveRole } from '../lib/api.ts';
import { MT_COLOR_CARDS } from '../utils/theme.ts';

interface SettingItem {
  id: number;
  settingKey: string;
  settingValue: string;
  description?: string;
  updatedAt?: string;
}

export function AdminSystemSettings() {
  const activeRole = getActiveRole();
  const isSuperAdmin = activeRole === 'SUPER_ADMIN';

  const [settings, setSettings] = useState<SettingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [editedValues, setEditedValues] = useState<Record<string, string>>({});

  const [confirmDeleteSetting, setConfirmDeleteSetting] = useState<SettingItem | null>(null);
  const [deletingSetting, setDeletingSetting] = useState(false);
  const [deleteSettingError, setDeleteSettingError] = useState<string | null>(null);

  const loadSettings = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/settings', {
        headers: getAuthHeaders(),
      });
      if (!res.ok) throw new Error('Failed to load settings');
      const data = await res.json();
      const list = data.settings || [];
      setSettings(list);
      const valMap: Record<string, string> = {};
      list.forEach((s: SettingItem) => {
        valMap[s.settingKey] = s.settingValue ?? '';
      });
      setEditedValues(valMap);
    } catch (err: any) {
      setError(err.message || 'Error loading system settings');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSettings();
  }, []);

  const handleSave = async (key: string) => {
    setSavingKey(key);
    setError(null);
    try {
      const val = editedValues[key];
      const res = await fetch(`/api/settings/${encodeURIComponent(key)}`, {
        method: 'PUT',
        headers: {
          ...getAuthHeaders(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ settingValue: val }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update setting');
      setSuccessMsg(`Setting '${key}' successfully updated.`);
      setTimeout(() => setSuccessMsg(null), 3000);
      loadSettings();
    } catch (err: any) {
      setError(err.message || 'Error updating setting');
    } finally {
      setSavingKey(null);
    }
  };

  const handleDeleteSetting = async () => {
    if (!confirmDeleteSetting) return;
    setDeletingSetting(true);
    setDeleteSettingError(null);
    try {
      const res = await fetch(`/api/settings/${encodeURIComponent(confirmDeleteSetting.settingKey)}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete setting');
      setSuccessMsg(`Setting '${confirmDeleteSetting.settingKey}' deleted/reset successfully.`);
      setTimeout(() => setSuccessMsg(null), 3000);
      setConfirmDeleteSetting(null);
      loadSettings();
    } catch (err: any) {
      setDeleteSettingError(err.message || 'Error deleting setting');
    } finally {
      setDeletingSetting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${MT_COLOR_CARDS.slate} p-6`}>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-slate-200 border border-slate-300 flex items-center justify-center shrink-0">
            <Sliders className="w-5 h-5 text-slate-800" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-neutral-900">
              <span>Leave Workflow Settings & System Rules</span>
            </h1>
            <p className="text-xs text-slate-700 mt-0.5">
              Configure leave approval workflow routing (HR Approval Required: ON/OFF), global cutoff rules, and administrative policy parameters.
            </p>
          </div>
        </div>
        <button
          onClick={loadSettings}
          className="flex items-center gap-1.5 px-3.5 py-2 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-800 hover:bg-slate-100 transition-colors cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-slate-700' : 'text-slate-700'}`} />
          <span>Refresh</span>
        </button>
      </div>

      {successMsg && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 font-medium flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          <span>{successMsg}</span>
        </div>
      )}

      {error && (
        <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 font-medium flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-rose-600" />
          <span>{error}</span>
        </div>
      )}

      {/* HR Approval Workflow Mode Highlight Card */}
      {(() => {
        const hrSetting = settings.find((s) => s.settingKey === 'hr_approval_required');
        const currentVal = editedValues['hr_approval_required'] ?? hrSetting?.settingValue ?? 'true';
        const isHrOn = currentVal === 'true' || currentVal === 'on' || currentVal === '1';

        return (
          <div
            id="hr-workflow-mode-card"
            className="p-5 rounded-2xl bg-gradient-to-r from-slate-900 via-neutral-900 to-indigo-950 text-white shadow-md border border-neutral-800 space-y-4"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-red-600 text-white">
                    Core Rule Engine
                  </span>
                  <span className="text-xs font-mono text-neutral-300">setting: hr_approval_required</span>
                </div>
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <span>HR Approval Required Workflow:</span>
                  <span className={isHrOn ? 'text-emerald-400 font-extrabold' : 'text-amber-400 font-extrabold'}>
                    {isHrOn ? 'ON (3-Stage Workflow)' : 'OFF (2-Stage Workflow)'}
                  </span>
                </h2>
                <p className="text-xs text-neutral-300 max-w-2xl leading-relaxed">
                  {isHrOn
                    ? 'Active 3-Stage Workflow: Employee submits leave → Assigned Team Leader reviews → HR conducts verification/policy check → Top Management grants final decision. Deductions occur only after Top Management final authorization.'
                    : 'Active 2-Stage Workflow: Employee submits leave → Assigned Team Leader reviews → Request routes DIRECTLY to Top Management for final decision. The HR review stage is bypassed entirely.'}
                </p>
              </div>

              <div className="flex items-center gap-3 shrink-0">
                <button
                  id="btn-toggle-hr-workflow"
                  type="button"
                  disabled={savingKey === 'hr_approval_required' || !isSuperAdmin}
                  onClick={() => {
                    const nextVal = isHrOn ? 'false' : 'true';
                    setEditedValues((prev) => ({ ...prev, hr_approval_required: nextVal }));
                    // Directly save for immediate user feedback
                    (async () => {
                      setSavingKey('hr_approval_required');
                      setError(null);
                      try {
                        const res = await fetch(`/api/settings/hr_approval_required`, {
                          method: 'PUT',
                          headers: {
                            ...getAuthHeaders(),
                            'Content-Type': 'application/json',
                          },
                          body: JSON.stringify({ settingValue: nextVal }),
                        });
                        const data = await res.json();
                        if (!res.ok) throw new Error(data.error || 'Failed to update setting');
                        setSuccessMsg(`HR Approval Required successfully switched to ${nextVal === 'true' ? 'ON' : 'OFF'}.`);
                        setTimeout(() => setSuccessMsg(null), 4000);
                        loadSettings();
                      } catch (err: any) {
                        setError(err.message || 'Error updating setting');
                      } finally {
                        setSavingKey(null);
                      }
                    })();
                  }}
                  className={`px-4 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 transition-all cursor-pointer shadow-sm ${
                    isHrOn
                      ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                      : 'bg-amber-600 hover:bg-amber-700 text-white'
                  } ${savingKey === 'hr_approval_required' ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <Sliders className="w-4 h-4" />
                  <span>
                    {savingKey === 'hr_approval_required'
                      ? 'Saving Change...'
                      : isHrOn
                      ? 'Switch to OFF (2-Stage)'
                      : 'Switch to ON (3-Stage)'}
                  </span>
                </button>
              </div>
            </div>

            <div className="pt-3 border-t border-white/10 text-[11px] text-neutral-300 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span>Changes persist in PostgreSQL &amp; memory cache &bull; Full audit logged as SETTING_UPDATED</span>
              </div>
              <div className="font-mono text-neutral-400">
                Super Admin Authorized Control
              </div>
            </div>
          </div>
        );
      })()}

      <div className="pt-2">
        <h3 className="text-sm font-bold text-neutral-800">All System &amp; Timing Configuration Parameters</h3>
        <p className="text-xs text-neutral-500">Fine-tune organizational cutoff times, working schedules, and policy keys.</p>
      </div>

      {/* Settings Grid / List */}
      <div className="grid grid-cols-1 gap-3.5">
        {settings.length > 0 ? (
          settings.map((item, idx) => {
            const cardPalette = [
              MT_COLOR_CARDS.sky,
              MT_COLOR_CARDS.teal,
              MT_COLOR_CARDS.indigo,
              MT_COLOR_CARDS.emerald,
              MT_COLOR_CARDS.amber,
              MT_COLOR_CARDS.purple,
            ][idx % 6];
            return (
              <div key={item.settingKey} className={`${cardPalette} p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4`}>
                <div className="space-y-1 max-w-xl">
                  <span className="font-mono font-bold text-xs text-neutral-900 px-2 py-0.5 rounded bg-white/90 border border-slate-300 inline-block">
                    {item.settingKey}
                  </span>
                  <p className="text-xs text-slate-700">
                    {item.description || 'System configuration parameter'}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  {item.settingKey === 'hr_approval_required' ? (
                    <div className="flex items-center gap-2">
                      <select
                        id="select-setting-hr-approval-required"
                        value={editedValues[item.settingKey] ?? item.settingValue}
                        onChange={(e) =>
                          setEditedValues((prev) => ({ ...prev, [item.settingKey]: e.target.value }))
                        }
                        className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-bold text-neutral-900 bg-white shadow-2xs"
                      >
                        <option value="true">ON (3-Stage Workflow: Applicant → Team Leader → HR → Top Management)</option>
                        <option value="false">OFF (2-Stage Workflow: Applicant → Team Leader → Top Management)</option>
                      </select>
                    </div>
                  ) : item.settingValue === 'true' || item.settingValue === 'false' ? (
                    <select
                      value={editedValues[item.settingKey] ?? item.settingValue}
                      onChange={(e) =>
                        setEditedValues((prev) => ({ ...prev, [item.settingKey]: e.target.value }))
                      }
                      className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold text-neutral-900 bg-white"
                    >
                      <option value="true">Enabled (true)</option>
                      <option value="false">Disabled (false)</option>
                    </select>
                  ) : (
                    <input
                      type="text"
                      value={editedValues[item.settingKey] ?? item.settingValue}
                      onChange={(e) =>
                        setEditedValues((prev) => ({ ...prev, [item.settingKey]: e.target.value }))
                      }
                      className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold text-neutral-900 bg-white w-48 sm:w-64 focus:outline-none focus:ring-1 focus:ring-red-700"
                    />
                  )}

                  <button
                    id={`btn-save-setting-${item.settingKey}`}
                    onClick={() => handleSave(item.settingKey)}
                    disabled={savingKey === item.settingKey}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-red-700 hover:bg-red-800 text-white rounded-lg text-xs font-semibold disabled:opacity-50 cursor-pointer shadow-xs"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>{savingKey === item.settingKey ? 'Saving...' : 'Save'}</span>
                  </button>

                  {isSuperAdmin && (
                    <button
                      id={`btn-delete-setting-${item.settingKey}`}
                      type="button"
                      onClick={() => setConfirmDeleteSetting(item)}
                      className="p-2 text-neutral-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer border border-transparent hover:border-rose-200"
                      title="Delete / Reset Setting (SUPER_ADMIN)"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            );
          })
        ) : (
          <div className={`${MT_COLOR_CARDS.slate} p-8 text-center text-xs text-slate-600`}>
            {loading ? 'Loading system configuration...' : 'No system settings found.'}
          </div>
        )}
      </div>

      {/* Delete/Reset Setting Modal (SUPER_ADMIN) */}
      {confirmDeleteSetting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
          <div className="bg-white rounded-xl max-w-sm w-full p-6 shadow-xl border border-neutral-200 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-neutral-900">Delete / Reset Setting</h3>
                <p className="text-xs text-neutral-500 mt-0.5 font-mono break-all">
                  {confirmDeleteSetting.settingKey}
                </p>
              </div>
            </div>

            <p className="text-xs text-neutral-600 bg-neutral-50 p-2.5 rounded-lg border border-neutral-200">
              Are you sure you want to delete this setting? This will remove custom overrides, revert to the system default, and log a <span className="font-mono">SETTING_DELETED</span> audit record.
            </p>

            {deleteSettingError && (
              <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs">
                {deleteSettingError}
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setConfirmDeleteSetting(null);
                  setDeleteSettingError(null);
                }}
                disabled={deletingSetting}
                className="px-3 py-1.5 border border-neutral-200 text-neutral-700 text-xs rounded-lg hover:bg-neutral-50 font-medium cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                id="btn-confirm-delete-setting"
                onClick={handleDeleteSetting}
                disabled={deletingSetting}
                className="px-3.5 py-1.5 bg-rose-600 text-white text-xs rounded-lg hover:bg-rose-700 font-medium cursor-pointer"
              >
                {deletingSetting ? 'Deleting...' : 'Confirm Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
