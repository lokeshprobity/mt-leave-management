import React, { useState, useEffect } from 'react';
import {
  Settings,
  X,
  Save,
  CheckCircle,
  AlertCircle,
  ShieldAlert,
  Upload,
  Trash2,
  Image as ImageIcon,
} from 'lucide-react';
import { apiFetch, getActiveRole } from '../lib/api.ts';
import { CompanyBrandingDto } from '../types/leave.ts';

interface AdminSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onBrandingChanged?: (branding: CompanyBrandingDto) => void;
}

export function AdminSettingsModal({
  isOpen,
  onClose,
  onBrandingChanged,
}: AdminSettingsModalProps) {
  const [settings, setSettings] = useState<Record<string, string>>({
    office_start_time: '08:30',
    office_end_time: '17:30',
    leave_cutoff_time: '18:00',
    working_days_per_week: '6',
    standard_daily_work_hours: '9',
    fiscal_year_start_month: '1',
  });
  const [branding, setBranding] = useState<CompanyBrandingDto>({
    applicationName: 'Maestro Leave Management',
    hasCustomLogo: false,
    logoUrl: null,
  });
  const [pendingLogoFile, setPendingLogoFile] = useState<{
    fileName: string;
    mimeType: string;
    fileData: string;
    sizeBytes: number;
  } | null>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const activeRole = getActiveRole();
  const isAdmin = activeRole === 'SUPER_ADMIN';

  useEffect(() => {
    if (isOpen) {
      setPendingLogoFile(null);
      setError(null);
      setSuccessMsg(null);
      loadSettings();
    }
  }, [isOpen]);

  const loadSettings = async () => {
    setLoading(true);
    setError(null);
    try {
      const [settingsRes, brandingRes] = await Promise.all([
        apiFetch('/api/settings'),
        apiFetch('/api/company-logo'),
      ]);
      if (settingsRes.ok) {
        const data = await settingsRes.json();
        const map: Record<string, string> = {};
        if (Array.isArray(data.settings)) {
          for (const item of data.settings) {
            map[item.settingKey] = item.settingValue;
          }
        }
        setSettings((prev) => ({ ...prev, ...map }));
        if (data.branding) {
          setBranding(data.branding);
        }
      }
      if (brandingRes.ok) {
        const bData = await brandingRes.json();
        if (bData.branding) {
          setBranding(bData.branding);
        }
      }
    } catch (err: any) {
      setError('Could not load current settings.');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectLogoFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    setSuccessMsg(null);
    const file = e.target.files?.[0];
    if (!file) return;

    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type.toLowerCase())) {
      setError('Invalid file format. Only JPEG, PNG, and WEBP images are permitted.');
      e.target.value = '';
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setError('Logo file exceeds the maximum allowed size of 5.0 MB.');
      e.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setPendingLogoFile({
          fileName: file.name,
          mimeType: file.type,
          fileData: reader.result,
          sizeBytes: file.size,
        });
      }
    };
    reader.readAsDataURL(file);
  };

  const handleUploadCompanyLogo = async () => {
    if (!isAdmin || !pendingLogoFile) return;
    setUploadingLogo(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const res = await apiFetch('/api/company-logo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: pendingLogoFile.fileName,
          mimeType: pendingLogoFile.mimeType,
          fileData: pendingLogoFile.fileData,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to upload company logo');
      }
      setBranding(data.branding);
      setPendingLogoFile(null);
      onBrandingChanged?.(data.branding);
      window.dispatchEvent(
        new CustomEvent('maestro-company-branding-updated', { detail: data.branding })
      );
      setSuccessMsg('Company logo uploaded and applied across Maestro Leave Management.');
    } catch (err: any) {
      setError(err.message || 'Failed to upload company logo');
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleRemoveCompanyLogo = async () => {
    if (!isAdmin) return;
    setUploadingLogo(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const res = await apiFetch('/api/company-logo', {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to remove company logo');
      }
      setBranding(data.branding);
      setPendingLogoFile(null);
      onBrandingChanged?.(data.branding);
      window.dispatchEvent(
        new CustomEvent('maestro-company-branding-updated', { detail: data.branding })
      );
      setSuccessMsg('Company logo removed and default Maestro branding restored.');
    } catch (err: any) {
      setError(err.message || 'Failed to remove company logo');
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) return;
    setSaving(true);
    setError(null);
    setSuccessMsg(null);
    try {
      for (const [key, val] of Object.entries(settings)) {
        const res = await apiFetch(`/api/settings/${encodeURIComponent(key)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ settingValue: String(val) }),
        });
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || `Failed to update setting: ${key}`);
        }
      }
      setSuccessMsg('System configuration settings saved successfully.');
      onClose();
    } catch (err: any) {
      setError(err.message || 'Error saving settings');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in">
      <div
        id="admin-settings-dialog"
        className="bg-white rounded-xl shadow-xl max-w-xl w-full border border-neutral-200 overflow-hidden max-h-[90vh] flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-100 bg-neutral-50/80 shrink-0">
          <div className="flex items-center gap-2">
            <Settings className="w-4 h-4 text-neutral-700" />
            <h3 className="text-sm font-bold text-neutral-900">
              Company Branding &amp; System Policy Settings
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-neutral-500 hover:text-neutral-700 rounded cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSave} className="p-5 space-y-5 text-xs overflow-y-auto">
          {successMsg && (
            <div className="p-2.5 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg flex items-center gap-2 font-medium">
              <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}
          {error && (
            <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg flex items-center gap-2 font-medium">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{error}</span>
            </div>
          )}
          {!isAdmin && (
            <div className="p-2.5 bg-amber-50 border border-amber-200 text-amber-800 rounded-lg flex items-center gap-2 font-medium">
              <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0" />
              <span>Read-only view. Only SUPER_ADMIN can modify company branding or system parameters.</span>
            </div>
          )}

          {/* Company Branding & Logo Section */}
          <div
            id="company-branding-section"
            className="p-4 rounded-xl bg-neutral-50 border border-neutral-200 space-y-3"
          >
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-bold text-neutral-900 text-xs flex items-center gap-1.5">
                  <ImageIcon className="w-3.5 h-3.5 text-neutral-700" />
                  <span>Company Branding &amp; Logo</span>
                </h4>
                <p className="text-[11px] text-neutral-500 mt-0.5">
                  Displayed globally in the application header for all users (JPEG, PNG, WEBP up to 5 MB).
                </p>
              </div>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-neutral-200/80 text-neutral-700">
                {branding.hasCustomLogo ? 'Custom Logo Active' : 'Default Branding'}
              </span>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-1">
              <div className="flex items-center gap-3">
                {pendingLogoFile ? (
                  <img
                    id="company-logo-preview"
                    src={pendingLogoFile.fileData}
                    alt="Company Logo Preview"
                    className="w-12 h-12 rounded-lg object-contain bg-white border border-red-300 p-1 shadow-2xs"
                  />
                ) : branding.hasCustomLogo && branding.logoUrl ? (
                  <img
                    id="company-logo-current"
                    src={branding.logoUrl}
                    alt="Maestro Company Logo"
                    className="w-12 h-12 rounded-lg object-contain bg-white border border-neutral-200 p-1 shadow-2xs"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-lg bg-red-700 text-white flex items-center justify-center font-bold text-base shadow-2xs">
                    M
                  </div>
                )}
                <div>
                  <div className="font-semibold text-neutral-900">Maestro Leave Management</div>
                  {pendingLogoFile ? (
                    <div className="text-[11px] text-red-700 font-medium">
                      Previewing: {pendingLogoFile.fileName} ({Math.round(pendingLogoFile.sizeBytes / 1024)} KB)
                    </div>
                  ) : branding.hasCustomLogo ? (
                    <div className="text-[11px] text-neutral-500">
                      {branding.originalName || branding.fileName} &bull; {branding.mimeType}
                    </div>
                  ) : (
                    <div className="text-[11px] text-neutral-500">
                      Standard Maestro monogram emblem
                    </div>
                  )}
                </div>
              </div>

              {isAdmin && (
                <div className="flex flex-wrap items-center gap-2">
                  <label
                    htmlFor="input-company-logo-file"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-neutral-300 text-neutral-800 font-semibold hover:bg-neutral-100 cursor-pointer shadow-2xs"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>{branding.hasCustomLogo ? 'Replace Logo' : 'Choose Logo'}</span>
                  </label>
                  <input
                    id="input-company-logo-file"
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={handleSelectLogoFile}
                    className="hidden"
                  />

                  {pendingLogoFile && (
                    <button
                      id="btn-upload-company-logo"
                      type="button"
                      disabled={uploadingLogo}
                      onClick={handleUploadCompanyLogo}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-700 text-white font-semibold hover:bg-red-800 disabled:opacity-50 cursor-pointer shadow-2xs"
                    >
                      <Save className="w-3.5 h-3.5" />
                      <span>{uploadingLogo ? 'Uploading...' : 'Save Logo'}</span>
                    </button>
                  )}

                  {branding.hasCustomLogo && (
                    <button
                      id="btn-remove-company-logo"
                      type="button"
                      disabled={uploadingLogo}
                      onClick={handleRemoveCompanyLogo}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 font-semibold hover:bg-rose-100 disabled:opacity-50 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Remove</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          {loading ? (
            <div className="py-8 text-center text-neutral-500">Loading system parameters...</div>
          ) : (
            <div className="space-y-3.5">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-neutral-700 mb-1">
                    Office Start Time
                  </label>
                  <div className="relative">
                    <input
                      id="input-setting-office-start"
                      type="time"
                      disabled={!isAdmin}
                      value={settings.office_start_time || '08:30'}
                      onChange={(e) =>
                        setSettings({ ...settings, office_start_time: e.target.value })
                      }
                      className="w-full px-3 py-2 border border-neutral-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-red-700/20 focus:border-red-700 disabled:bg-neutral-50 disabled:text-neutral-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block font-semibold text-neutral-700 mb-1">
                    Office End Time
                  </label>
                  <div className="relative">
                    <input
                      id="input-setting-office-end"
                      type="time"
                      disabled={!isAdmin}
                      value={settings.office_end_time || '17:30'}
                      onChange={(e) =>
                        setSettings({ ...settings, office_end_time: e.target.value })
                      }
                      className="w-full px-3 py-2 border border-neutral-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-red-700/20 focus:border-red-700 disabled:bg-neutral-50 disabled:text-neutral-500"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-neutral-700 mb-1">
                  Daily Leave Request Cutoff Time
                </label>
                <input
                  id="input-setting-cutoff-time"
                  type="time"
                  disabled={!isAdmin}
                  value={settings.leave_cutoff_time || '18:00'}
                  onChange={(e) =>
                    setSettings({ ...settings, leave_cutoff_time: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-neutral-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-red-700/20 focus:border-red-700 disabled:bg-neutral-50 disabled:text-neutral-500"
                />
                <p className="text-[11px] text-neutral-500 mt-0.5">
                  Leave requests submitted after this cutoff trigger immediate classification rules.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-neutral-700 mb-1">
                    Working Days / Week
                  </label>
                  <input
                    id="input-setting-working-days"
                    type="number"
                    min="1"
                    max="7"
                    disabled={!isAdmin}
                    value={settings.working_days_per_week || '6'}
                    onChange={(e) =>
                      setSettings({ ...settings, working_days_per_week: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-neutral-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-red-700/20 focus:border-red-700 disabled:bg-neutral-50 disabled:text-neutral-500"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-neutral-700 mb-1">
                    Daily Work Hours
                  </label>
                  <input
                    id="input-setting-work-hours"
                    type="number"
                    min="1"
                    max="24"
                    disabled={!isAdmin}
                    value={settings.standard_daily_work_hours || '9'}
                    onChange={(e) =>
                      setSettings({ ...settings, standard_daily_work_hours: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-neutral-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-red-700/20 focus:border-red-700 disabled:bg-neutral-50 disabled:text-neutral-500"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Footer */}
          <div className="pt-3 border-t border-neutral-100 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-neutral-200 text-neutral-700 font-semibold rounded-lg hover:bg-neutral-50 cursor-pointer"
            >
              Close
            </button>
            {isAdmin && (
              <button
                id="btn-save-settings"
                type="submit"
                disabled={saving}
                className="px-4 py-2 bg-red-700 text-white font-semibold rounded-lg hover:bg-red-800 disabled:opacity-50 flex items-center gap-1.5 shadow-2xs cursor-pointer"
              >
                <Save className="w-3.5 h-3.5" />
                <span>{saving ? 'Saving...' : 'Save Changes'}</span>
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
