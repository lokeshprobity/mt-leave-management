import React, { useState } from 'react';
import { Download, Smartphone, X } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall.ts';

interface PWAInstallButtonProps {
  variant?: 'header' | 'drawer';
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({ variant = 'header' }) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);
  const [showBrowserGuide, setShowBrowserGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  if (isInstallable) {
    return (
      <button
        id={`btn-pwa-install-${variant}`}
        type="button"
        onClick={install}
        className={
          variant === 'drawer'
            ? 'w-full min-h-[44px] px-3.5 py-2.5 rounded-xl bg-red-50 border border-red-200 text-red-800 hover:bg-red-100 text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer transition-colors'
            : 'min-h-[44px] inline-flex items-center justify-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-semibold bg-neutral-800 text-white border border-neutral-700 hover:bg-neutral-700 hover:border-red-500 transition-colors cursor-pointer shrink-0'
        }
        title="Install MT Leave App"
      >
        <Download className="w-4 h-4 shrink-0 text-red-400" />
        <span className={variant === 'drawer' ? 'inline' : 'hidden sm:inline'}>Install App</span>
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          id={`btn-pwa-ios-guide-${variant}`}
          type="button"
          onClick={() => setShowIOSGuide(true)}
          className={
            variant === 'drawer'
              ? 'w-full min-h-[44px] px-3.5 py-2.5 rounded-xl bg-red-50 border border-red-200 text-red-800 hover:bg-red-100 text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer transition-colors'
              : 'min-h-[44px] inline-flex items-center justify-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-semibold bg-neutral-800 text-white border border-neutral-700 hover:bg-neutral-700 hover:border-red-500 transition-colors cursor-pointer shrink-0'
          }
          title="Install MT Leave on iPhone / iPad"
        >
          <Smartphone className="w-4 h-4 shrink-0 text-red-400" />
          <span className={variant === 'drawer' ? 'inline' : 'hidden sm:inline'}>Install App</span>
        </button>

        {showIOSGuide && (
          <div
            id="pwa-ios-install-modal"
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-neutral-900/60 p-3 sm:p-4"
            role="dialog"
            aria-modal="true"
            aria-label="Install MT Leave on iPhone or iPad"
          >
            <div className="w-full max-w-sm rounded-2xl bg-white border border-neutral-300 border-t-[5px] border-t-red-700 p-5 shadow-xl space-y-4 text-neutral-900">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <img
                    src="/apple-touch-icon.png"
                    alt="MT Leave App Icon"
                    className="w-9 h-9 rounded-lg border border-neutral-200 object-contain bg-white p-0.5"
                  />
                  <div>
                    <h3 className="text-sm font-bold text-neutral-900">Install MT Leave</h3>
                    <p className="text-[11px] text-neutral-600">Add to your iPhone / iPad Home Screen</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowIOSGuide(false)}
                  aria-label="Close install instructions"
                  className="min-h-[40px] min-w-[40px] rounded-xl inline-flex items-center justify-center text-neutral-500 hover:text-neutral-800 hover:bg-neutral-100 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="text-xs text-neutral-700 space-y-2 bg-slate-50 border border-slate-200 rounded-xl p-3.5">
                <p>
                  1. Tap the <strong>Share</strong> button in your Safari toolbar.
                </p>
                <p>
                  2. Scroll down and tap <strong>Add to Home Screen</strong>.
                </p>
                <p>
                  3. Tap <strong>Add</strong> to launch <strong>MT Leave</strong> in full-screen app mode.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="w-full min-h-[44px] rounded-xl bg-red-700 hover:bg-red-800 text-white text-xs font-semibold py-2.5 cursor-pointer transition-colors"
              >
                Got It
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return (
    <>
      <button
        id={`btn-pwa-install-guide-${variant}`}
        type="button"
        onClick={() => setShowBrowserGuide(true)}
        className={
          variant === 'drawer'
            ? 'w-full min-h-[44px] px-3.5 py-2.5 rounded-xl bg-red-50 border border-red-200 text-red-800 hover:bg-red-100 text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer transition-colors'
            : 'min-h-[44px] inline-flex items-center justify-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-semibold bg-neutral-800 text-white border border-neutral-700 hover:bg-neutral-700 hover:border-red-500 transition-colors cursor-pointer shrink-0'
        }
        title="How to install MT Leave App"
      >
        <Download className="w-4 h-4 shrink-0 text-red-400" />
        <span className={variant === 'drawer' ? 'inline' : 'hidden sm:inline'}>Install App</span>
      </button>

      {showBrowserGuide && (
        <div
          id="pwa-browser-install-modal"
          className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-neutral-900/60 p-3 sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Install MT Leave app"
        >
          <div className="w-full max-w-sm rounded-2xl bg-white border border-neutral-300 border-t-[5px] border-t-red-700 p-5 shadow-xl space-y-4 text-neutral-900">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <img
                  src="/pwa-192x192.png"
                  alt="MT Leave App Icon"
                  className="w-10 h-10 rounded-lg border border-neutral-200 object-contain bg-white p-0.5"
                />
                <div>
                  <h3 className="text-sm font-bold text-neutral-900">Install MT Leave</h3>
                  <p className="text-[11px] text-neutral-600">Add the app to your device</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowBrowserGuide(false)}
                aria-label="Close install instructions"
                className="min-h-[40px] min-w-[40px] rounded-xl inline-flex items-center justify-center text-neutral-500 hover:text-neutral-800 hover:bg-neutral-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="text-xs text-neutral-700 space-y-2 bg-slate-50 border border-slate-200 rounded-xl p-3.5">
              <p><strong>Windows — Chrome:</strong> Open the browser menu (⋮) and look for “Install MT Leave” or “Save and share” → “Install page as app”.</p>
              <p><strong>Windows — Edge:</strong> Open the menu (⋯) → Apps → “Install this site as an app”.</p>
              <p><strong>Android — Chrome:</strong> Open the menu (⋮) → “Install app” or “Add to Home screen”.</p>
              <p>If the browser menu has no install option, update/reload this site in Chrome or Edge. The browser may not yet consider the site installable; the instructions alone cannot override that browser requirement.</p>
            </div>

            <button
              type="button"
              onClick={() => setShowBrowserGuide(false)}
              className="w-full min-h-[44px] rounded-xl bg-red-700 hover:bg-red-800 text-white text-xs font-semibold py-2.5 cursor-pointer transition-colors"
            >
              Got It
            </button>
          </div>
        </div>
      )}
    </>
  );
};
