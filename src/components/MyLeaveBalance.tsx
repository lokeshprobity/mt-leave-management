import React, { useState, useEffect } from 'react';
import { RefreshCw, AlertCircle, CheckCircle2, Sparkles, PieChart, Info } from 'lucide-react';
import { LeaveBalanceDto, LeaveTypeDto } from '../types/leave.ts';
import { apiFetch, getActiveRole, getActiveEmployeeId } from '../lib/api.ts';
import {
  MT_THEME,
  MT_COLOR_CARDS,
  getLeaveTypeBadgeClasses,
  getLeaveTypeCardClasses,
  getLeaveTypeBarColor,
} from '../utils/theme.ts';

interface MyLeaveBalanceProps {
  targetEmployeeId?: number;
  viewAsEmployee?: boolean;
}

export function MyLeaveBalance({ targetEmployeeId, viewAsEmployee = false }: MyLeaveBalanceProps = {}) {
  const [balances, setBalances] = useState<LeaveBalanceDto[]>([]);
  const [leaveTypes, setLeaveTypes] = useState<LeaveTypeDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [initializing, setInitializing] = useState(false);

  const activeRole = getActiveRole();
  const currentYear = new Date().getFullYear();
  const employeeId = targetEmployeeId ?? getActiveEmployeeId();
  const canManageBalances = activeRole === 'SUPER_ADMIN' && !viewAsEmployee;

  const loadBalances = async () => {
    setLoading(true);
    setError(null);
    try {
      // 1. Fetch Leave Types
      const ltRes = await apiFetch('/api/leave-types');
      const ltData = await ltRes.json();
      const types = ltData.leaveTypes || [];
      setLeaveTypes(types);

      // 2. Fetch Balances
      const res = await apiFetch(`/api/leave-balances?employeeId=${employeeId}&year=${currentYear}`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to fetch leave balances');
      }
      const data = await res.json();
      setBalances(data.balances || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBalances();
  }, [activeRole, employeeId, targetEmployeeId, viewAsEmployee]);

  // Allows Super Admin to initialize baseline balance records for this employee
  const handleInitializeBalances = async () => {
    if (activeRole !== 'SUPER_ADMIN') {
      setError('Only Super Admin can initialize employee leave balances.');
      return;
    }

    setInitializing(true);
    setError(null);
    try {
      let createdCount = 0;
      for (const lt of leaveTypes) {
        const existing = balances.find((b) => b.leaveTypeId === lt.id && b.year === currentYear);
        if (!existing) {
          const res = await apiFetch('/api/leave-balances', {
            method: 'POST',
            body: JSON.stringify({
              employeeId,
              leaveTypeId: lt.id,
              year: currentYear,
              openingBalance: 0,
              allocated: lt.code === 'CL' ? 12 : lt.code === 'SL' ? 10 : lt.code === 'EL' ? 15 : 0,
              carryForward: 0,
              adjustments: 0,
              used: 0,
              reserved: 0,
            }),
          });
          if (res.ok) createdCount++;
        }
      }
      setActionMsg(`Initialized ${createdCount} baseline balance records for Employee #${employeeId}`);
      setTimeout(() => setActionMsg(null), 3500);
      loadBalances();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setInitializing(false);
    }
  };

  const getLeaveTypeLabel = (leaveTypeId: number) => {
    const found = leaveTypes.find((lt) => lt.id === leaveTypeId);
    return found ? `${found.code} — ${found.name}` : `Leave Type #${leaveTypeId}`;
  };

  const getLeaveTypeObj = (leaveTypeId: number) => {
    return leaveTypes.find((lt) => lt.id === leaveTypeId);
  };

  const totalAllocatedDays = balances.reduce((acc, b) => acc + Number(b.allocated || 0), 0);
  const totalAvailableDays = balances.reduce((acc, b) => acc + Number(b.available || 0), 0);
  const totalUsedDays = balances.reduce((acc, b) => acc + Number(b.used || 0), 0);
  const totalCarryForwardDays = balances.reduce((acc, b) => acc + Number(b.carryForward || 0), 0);

  return (
    <div className="space-y-4 md:space-y-6 min-w-0">
      {/* =====================================================================
          MOBILE LEAVE BALANCE VIEW (<768px ONLY — PURPOSE-BUILT APP CARDS)
         ===================================================================== */}
      <div id="leave-balance-mobile-view" className="md:hidden space-y-4 min-w-0">
        {/* 1. Mobile Header & Entitlement Summary Hero */}
        <section
          id="mobile-balance-header"
          className={`${MT_COLOR_CARDS.slate} p-4 space-y-3.5 min-w-0 overflow-hidden`}
        >
          <div className="flex items-start justify-between gap-2.5 min-w-0">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <PieChart className="w-4 h-4 text-sky-700 shrink-0" />
                <h2 className="text-base font-bold text-neutral-900 truncate">
                  My Leave Balance
                </h2>
              </div>
              <p className="text-xs text-neutral-600 mt-1 leading-relaxed">
                Employee <span className="font-mono font-semibold text-neutral-800">#{employeeId}</span> &bull; Leave Year{' '}
                <span className="font-semibold text-sky-700">{currentYear}</span>
              </p>
            </div>

            <button
              id="mobile-refresh-balances-btn"
              type="button"
              onClick={loadBalances}
              title="Refresh balance"
              aria-label="Refresh balance"
              className={`${MT_THEME.mobile.touchTarget} px-3 rounded-xl border border-slate-300 bg-white text-neutral-700 hover:border-sky-300 hover:text-sky-700 active:bg-sky-50 text-xs font-semibold gap-1.5 shrink-0 cursor-pointer`}
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
          </div>

          {/* 4-Card Mobile Entitlement KPI Grid (Allocated=Sky, Used=Amber, Available=Emerald, Carry Forward=Indigo) */}
          <div className="grid grid-cols-2 gap-2.5 pt-1">
            <div className={`${MT_COLOR_CARDS.sky} p-3 min-w-0`}>
              <span className="text-[10px] font-bold uppercase tracking-wider text-sky-800 block truncate">
                Allocated
              </span>
              <span className="text-lg font-bold font-mono text-sky-900 mt-0.5 block">
                {totalAllocatedDays.toFixed(1)} Days
              </span>
            </div>
            <div className={`${MT_COLOR_CARDS.amber} p-3 min-w-0`}>
              <span className="text-[10px] font-bold uppercase tracking-wider text-amber-800 block truncate">
                Used
              </span>
              <span className="text-lg font-bold font-mono text-amber-900 mt-0.5 block">
                {totalUsedDays.toFixed(1)} Days
              </span>
            </div>
            <div className={`${MT_COLOR_CARDS.emerald} p-3 min-w-0`}>
              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800 block truncate">
                Available
              </span>
              <span className="text-lg font-bold font-mono text-emerald-900 mt-0.5 block">
                {totalAvailableDays.toFixed(1)} Days
              </span>
            </div>
            <div className={`${MT_COLOR_CARDS.indigo} p-3 min-w-0`}>
              <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-800 block truncate">
                Carry Forward
              </span>
              <span className="text-lg font-bold font-mono text-indigo-900 mt-0.5 block">
                {totalCarryForwardDays.toFixed(1)} Days
              </span>
            </div>
          </div>

          {activeRole === 'SUPER_ADMIN' && balances.length === 0 && leaveTypes.length > 0 && (
            <button
              id="mobile-init-balances-btn"
              type="button"
              onClick={handleInitializeBalances}
              disabled={initializing}
              className={`w-full min-h-[44px] px-4 py-2.5 rounded-xl ${MT_THEME.button.primary} text-xs font-semibold flex items-center justify-center gap-2`}
            >
              <Sparkles className="w-4 h-4 shrink-0" />
              <span>{initializing ? 'Initializing...' : 'Initialize Sample Balances'}</span>
            </button>
          )}
        </section>

        {/* Mobile Alerts */}
        {error && (
          <div className={`p-3.5 rounded-xl ${MT_THEME.alert.danger} text-xs flex items-center gap-2`}>
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
            <span className="break-words">{error}</span>
          </div>
        )}
        {actionMsg && (
          <div className={`p-3.5 rounded-xl ${MT_THEME.alert.success} text-xs flex items-center gap-2`}>
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
            <span className="break-words">{actionMsg}</span>
          </div>
        )}

        {/* 2. Stacked Mobile Leave Quota Cards */}
        <section id="mobile-leave-balance-cards" className="space-y-3 min-w-0">
          {loading ? (
            <div className={`${MT_THEME.card} p-8 text-center text-neutral-500 text-xs`}>
              <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-red-700" />
              <span>Loading balance ledger...</span>
            </div>
          ) : balances.length === 0 ? (
            <div className={`${MT_THEME.card} p-8 text-center space-y-3`}>
              <p className="font-semibold text-sm text-neutral-800">
                No balance records found for {currentYear}.
              </p>
              <p className="text-xs text-neutral-500 leading-relaxed">
                Balance ledger records are populated from administrative allocation and policy baselines.
              </p>
              {canManageBalances && (
                <button
                  type="button"
                  onClick={handleInitializeBalances}
                  disabled={initializing}
                  className={`w-full min-h-[44px] px-4 py-2.5 rounded-xl ${MT_THEME.button.primary} text-xs font-semibold flex items-center justify-center gap-2`}
                >
                  <Sparkles className="w-4 h-4 shrink-0" />
                  <span>Initialize Baseline Balances</span>
                </button>
              )}
            </div>
          ) : (
            balances.map((b) => {
              const availNum = Number(b.available);
              const usedNum = Number(b.used);
              const reservedNum = Number(b.reserved);
              const totalCredits =
                Number(b.openingBalance) +
                Number(b.allocated) +
                Number(b.carryForward) +
                Number(b.adjustments);
              const consumedPct =
                totalCredits > 0
                  ? Math.min(100, Math.max(0, Math.round(((usedNum + reservedNum) / totalCredits) * 100)))
                  : 0;
              const ltObj = getLeaveTypeObj(b.leaveTypeId);

              return (
                <article
                  key={b.id}
                  id={`mobile-balance-card-${b.id}`}
                  className={`${getLeaveTypeCardClasses(ltObj?.code || ltObj?.name)} p-4 space-y-3 min-w-0 overflow-hidden`}
                >
                  {/* Top Row: Leave Type Name + Available Quota Pill */}
                  <div className="flex items-start justify-between gap-2.5 pb-2.5 border-b border-black/10">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span
                          className={`px-2 py-0.5 rounded text-xs font-mono font-bold ${getLeaveTypeBadgeClasses(
                            ltObj?.code || ltObj?.name
                          )}`}
                        >
                          {ltObj?.code || `LT-${b.leaveTypeId}`}
                        </span>
                        <span className="text-sm font-bold text-neutral-900 truncate">
                          {ltObj?.name || getLeaveTypeLabel(b.leaveTypeId)}
                        </span>
                      </div>
                      <span className="text-[11px] text-neutral-500 mt-0.5 block">
                        {ltObj?.isPaid === false ? 'Unpaid Leave Quota' : 'Paid Annual Entitlement'} &bull; {b.year}
                      </span>
                    </div>

                    <div className="text-right shrink-0">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 block">
                        Available
                      </span>
                      <span
                        className={`inline-block mt-0.5 px-2.5 py-0.5 rounded-lg font-mono text-sm font-bold ${
                          availNum > 0
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : availNum === 0
                              ? 'bg-neutral-100 text-neutral-600 border border-neutral-200'
                              : 'bg-rose-50 text-rose-700 border border-rose-200'
                        }`}
                      >
                        {availNum.toFixed(1)} Days
                      </span>
                    </div>
                  </div>

                  {/* Utilization Bar */}
                  {totalCredits > 0 && (
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-[11px] text-neutral-500">
                        <span>Quota Utilization ({usedNum.toFixed(1)} Days used, {reservedNum.toFixed(1)} Days reserved)</span>
                        <span className="font-mono font-semibold text-neutral-700">{consumedPct}%</span>
                      </div>
                      <div className={MT_THEME.chart.track}>
                        <div
                          className={`h-full rounded-full ${getLeaveTypeBarColor(
                            ltObj?.code || ltObj?.name
                          )} transition-all`}
                          style={{ width: `${consumedPct}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {/* 6-Field Ledger Breakdown Grid (No Horizontal Scroll Needed) */}
                  <div className="grid grid-cols-3 gap-2 pt-1 text-xs">
                    <div className="p-2 rounded-lg bg-neutral-50 border border-neutral-200/70">
                      <span className="text-[10px] text-neutral-500 block">Opening</span>
                      <span className="font-mono font-semibold text-neutral-800">
                        {Number(b.openingBalance).toFixed(1)}
                      </span>
                    </div>
                    <div className="p-2 rounded-lg bg-neutral-50 border border-neutral-200/70">
                      <span className="text-[10px] text-neutral-500 block">Allocated</span>
                      <span className="font-mono font-semibold text-neutral-800">
                        {Number(b.allocated).toFixed(1)}
                      </span>
                    </div>
                    <div className="p-2 rounded-lg bg-neutral-50 border border-neutral-200/70">
                      <span className="text-[10px] text-neutral-500 block">Carry Fwd</span>
                      <span className="font-mono font-semibold text-neutral-800">
                        {Number(b.carryForward).toFixed(1)}
                      </span>
                    </div>
                    <div className="p-2 rounded-lg bg-neutral-50 border border-neutral-200/70">
                      <span className="text-[10px] text-neutral-500 block">Adjustments</span>
                      <span className="font-mono font-semibold text-neutral-800">
                        {Number(b.adjustments).toFixed(1)}
                      </span>
                    </div>
                    <div className="p-2 rounded-lg bg-rose-50/50 border border-rose-200/70">
                      <span className="text-[10px] text-rose-700 block">Used</span>
                      <span className="font-mono font-bold text-rose-700">
                        {usedNum.toFixed(1)}
                      </span>
                    </div>
                    <div className="p-2 rounded-lg bg-amber-50/50 border border-amber-200/70">
                      <span className="text-[10px] text-amber-700 block">Reserved</span>
                      <span className="font-mono font-bold text-amber-700">
                        {reservedNum.toFixed(1)}
                      </span>
                    </div>
                  </div>
                </article>
              );
            })
          )}
        </section>

        {/* 3. Mobile Calculation Formula Card */}
        <div className={`p-3.5 rounded-xl ${MT_THEME.alert.info} text-[11px] flex items-start gap-2.5`}>
          <Info className="w-4 h-4 text-sky-600 shrink-0 mt-0.5" />
          <div className="leading-relaxed">
            <span className="font-bold block">Ledger Calculation Model</span>
            <span>Available = Opening + Allocated + Carry Forward + Adjustments &minus; Used &minus; Reserved</span>
          </div>
        </div>
      </div>

      {/* =====================================================================
          DESKTOP LEAVE BALANCE VIEW (>=768px PRESERVED UNCHANGED)
         ===================================================================== */}
      <div id="leave-balance-desktop-view" className="hidden md:block space-y-6">
        {/* Header and Controls */}
        <div className={`${MT_COLOR_CARDS.slate} p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4`}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-sky-100 border border-sky-300 flex items-center justify-center shrink-0">
              <PieChart className="w-5 h-5 text-sky-700" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-neutral-900">My Leave Balance</h3>
              <p className="text-xs text-neutral-600 mt-0.5">
                Annual entitlements, accrued quotas, and current available days for Employee #{employeeId} ({currentYear})
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              id="refresh-balances-btn"
              onClick={loadBalances}
              className="p-2.5 bg-white text-neutral-700 hover:text-sky-700 border border-slate-300 rounded-lg hover:bg-sky-50 hover:border-sky-300 transition-colors cursor-pointer"
              title="Refresh balance"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-sky-700' : ''}`} />
            </button>

            {activeRole === 'SUPER_ADMIN' && balances.length === 0 && leaveTypes.length > 0 && (
              <button
                id="init-balances-btn"
                onClick={handleInitializeBalances}
                disabled={initializing}
                className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold bg-red-700 text-white rounded-lg hover:bg-red-800 transition-colors cursor-pointer"
              >
                <Sparkles className="w-4 h-4" />
                <span>{initializing ? 'Initializing...' : 'Initialize Sample Balances'}</span>
              </button>
            )}
          </div>
        </div>

        {/* Desktop 4-Column Entitlement KPI Summary (Allocated=Sky, Used=Amber, Available=Emerald, Carry Forward=Indigo) */}
        <div className="grid grid-cols-4 gap-4">
          <div className={`${MT_COLOR_CARDS.sky} p-4 flex items-center justify-between`}>
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-sky-800 block">
                Total Allocated
              </span>
              <span className="text-2xl font-bold font-mono text-sky-900 mt-1 block">
                {totalAllocatedDays.toFixed(1)} Days
              </span>
            </div>
            <span className={`px-2.5 py-1 rounded text-xs font-semibold ${MT_THEME.badge.info}`}>Allocated</span>
          </div>
          <div className={`${MT_COLOR_CARDS.amber} p-4 flex items-center justify-between`}>
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-amber-800 block">
                Total Used Days
              </span>
              <span className="text-2xl font-bold font-mono text-amber-900 mt-1 block">
                {totalUsedDays.toFixed(1)} Days
              </span>
            </div>
            <span className={`px-2.5 py-1 rounded text-xs font-semibold ${MT_THEME.badge.warning}`}>Used</span>
          </div>
          <div className={`${MT_COLOR_CARDS.emerald} p-4 flex items-center justify-between`}>
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-800 block">
                Total Available Quota
              </span>
              <span className="text-2xl font-bold font-mono text-emerald-900 mt-1 block">
                {totalAvailableDays.toFixed(1)} Days
              </span>
            </div>
            <span className={`px-2.5 py-1 rounded text-xs font-semibold ${MT_THEME.badge.success}`}>Available</span>
          </div>
          <div className={`${MT_COLOR_CARDS.indigo} p-4 flex items-center justify-between`}>
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-800 block">
                Carry Forward
              </span>
              <span className="text-2xl font-bold font-mono text-indigo-900 mt-1 block">
                {totalCarryForwardDays.toFixed(1)} Days
              </span>
            </div>
            <span className="px-2.5 py-1 rounded text-xs font-semibold bg-indigo-100 text-indigo-900 border border-indigo-300">Carry Fwd</span>
          </div>
        </div>

        {/* Desktop Individual Leave-Type Coloured Cards */}
        {balances.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {balances.map((b) => {
              const ltObj = getLeaveTypeObj(b.leaveTypeId);
              const availNum = Number(b.available);
              return (
                <div
                  key={`desktop-card-${b.id}`}
                  className={`${getLeaveTypeCardClasses(ltObj?.code || ltObj?.name)} p-4 space-y-2.5`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span
                        className={`px-2 py-0.5 rounded text-xs font-mono font-bold ${getLeaveTypeBadgeClasses(
                          ltObj?.code || ltObj?.name
                        )}`}
                      >
                        {ltObj?.code || `LT-${b.leaveTypeId}`}
                      </span>
                      <span className="text-sm font-bold text-neutral-900">
                        {ltObj?.name || getLeaveTypeLabel(b.leaveTypeId)}
                      </span>
                    </div>
                    <span className="font-mono text-base font-bold text-neutral-900">
                      {availNum.toFixed(1)} Days avail
                    </span>
                  </div>
                  <div className="grid grid-cols-4 gap-2 pt-2 border-t border-black/10 text-[11px]">
                    <div>
                      <span className="text-neutral-600 block">Alloc</span>
                      <span className="font-mono font-bold text-neutral-900">{Number(b.allocated).toFixed(1)}</span>
                    </div>
                    <div>
                      <span className="text-neutral-600 block">Used</span>
                      <span className="font-mono font-bold text-neutral-900">{Number(b.used).toFixed(1)}</span>
                    </div>
                    <div>
                      <span className="text-neutral-600 block">Carry</span>
                      <span className="font-mono font-bold text-neutral-900">{Number(b.carryForward).toFixed(1)}</span>
                    </div>
                    <div>
                      <span className="text-neutral-600 block">Avail</span>
                      <span className="font-mono font-bold text-emerald-800">{availNum.toFixed(1)}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Notifications */}
        {error && (
          <div className={`p-3.5 ${MT_COLOR_CARDS.rose} text-xs text-rose-800 flex items-center gap-2`}>
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
            <span>{error}</span>
          </div>
        )}
        {actionMsg && (
          <div className={`p-3.5 ${MT_COLOR_CARDS.emerald} text-xs text-emerald-800 flex items-center gap-2`}>
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
            <span>{actionMsg}</span>
          </div>
        )}

        {/* Leave Balance Table */}
        <div className={`${MT_COLOR_CARDS.slate} overflow-hidden`}>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-neutral-50/75 border-b border-neutral-200 text-neutral-600 uppercase tracking-wider font-semibold">
                <tr>
                  <th className="px-4 py-3">Leave Type</th>
                  <th className="px-4 py-3 text-right">Opening</th>
                  <th className="px-4 py-3 text-right">Allocated</th>
                  <th className="px-4 py-3 text-right">Carry Forward</th>
                  <th className="px-4 py-3 text-right">Adjustments</th>
                  <th className="px-4 py-3 text-right">Used</th>
                  <th className="px-4 py-3 text-right">Reserved</th>
                  <th className="px-4 py-3 text-right bg-neutral-100/50 text-neutral-900">Available</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 text-neutral-800">
                {loading ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-neutral-500">
                      Loading balance ledger...
                    </td>
                  </tr>
                ) : balances.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-10 text-center text-neutral-500">
                      <p className="font-medium text-neutral-700">No balance records found for {currentYear}.</p>
                      <p className="text-xs text-neutral-500 mt-1 max-w-sm mx-auto">
                        Balance ledger records are populated from administrative allocation and policy baselines.
                      </p>
                      {activeRole === 'SUPER_ADMIN' && (
                        <button
                          onClick={handleInitializeBalances}
                          className="mt-3 px-3.5 py-1.5 text-xs font-semibold bg-red-700 text-white rounded-lg hover:bg-red-800 cursor-pointer"
                        >
                          Initialize Baseline Balances
                        </button>
                      )}
                    </td>
                  </tr>
                ) : (
                  balances.map((b) => {
                    const availNum = Number(b.available);
                    const ltObj = getLeaveTypeObj(b.leaveTypeId);
                    return (
                      <tr key={b.id} className="hover:bg-neutral-50/50 transition-colors font-medium">
                        <td className="px-4 py-3.5 text-neutral-900 font-semibold">
                          <div className="flex items-center gap-2">
                            <span
                              className={`px-2 py-0.5 rounded text-xs font-mono font-bold ${getLeaveTypeBadgeClasses(
                                ltObj?.code || ltObj?.name
                              )}`}
                            >
                              {ltObj?.code || `LT-${b.leaveTypeId}`}
                            </span>
                            <span>{ltObj?.name || getLeaveTypeLabel(b.leaveTypeId)}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3.5 text-right font-mono text-neutral-600">
                          {Number(b.openingBalance).toFixed(1)}
                        </td>
                        <td className="px-4 py-3.5 text-right font-mono text-neutral-600">
                          {Number(b.allocated).toFixed(1)}
                        </td>
                        <td className="px-4 py-3.5 text-right font-mono text-neutral-600">
                          {Number(b.carryForward).toFixed(1)}
                        </td>
                        <td className="px-4 py-3.5 text-right font-mono text-neutral-600">
                          {Number(b.adjustments).toFixed(1)}
                        </td>
                        <td className="px-4 py-3.5 text-right font-mono text-rose-600">
                          {Number(b.used).toFixed(1)}
                        </td>
                        <td className="px-4 py-3.5 text-right font-mono text-amber-600">
                          {Number(b.reserved).toFixed(1)}
                        </td>
                        <td className="px-4 py-3.5 text-right font-mono font-bold bg-neutral-50/50">
                          <span
                            className={`inline-block px-2.5 py-0.5 rounded text-xs ${
                              availNum > 0
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : availNum === 0
                                ? 'bg-neutral-100 text-neutral-600 border border-neutral-200'
                                : 'bg-rose-50 text-rose-700 border border-rose-200'
                            }`}
                          >
                            {availNum.toFixed(1)}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Calculation Formula Footer Note */}
          <div className="p-3.5 bg-neutral-50/75 border-t border-neutral-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-[11px] text-neutral-500">
            <div>
              <span className="font-semibold text-neutral-700">Calculation Model: </span>
              <span>Available = Opening + Allocated + Carry Forward + Adjustments - Used - Reserved</span>
            </div>
            <div className="text-neutral-500">
              Audit Ledger: Zero automatic transactions posted until Step 4
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
