import React, { useState, useEffect, useMemo } from 'react';
import {
  Wallet,
  Filter,
  RefreshCw,
  Search,
  User,
  Users,
  Calendar,
  AlertCircle,
  CheckCircle2,
  PieChart,
  Building,
  ArrowRight,
  Clock,
  History,
  ChevronRight,
  Sparkles,
  Shield,
  Layers,
  Sliders,
  Trash2,
  X,
  Plus,
  Minus,
  Lock,
} from 'lucide-react';
import { getAuthHeaders, getActiveRole, apiFetch, hasClientPermission } from '../lib/api.ts';
import { formatDate } from '../utils/dateFormat.ts';
import { MT_COLOR_CARDS, getLeaveTypeBadgeClasses } from '../utils/theme.ts';
import { Employee360Link } from './Employee360Trigger.tsx';

export interface LeaveBalanceItem {
  id: number;
  employeeId: number;
  leaveTypeId: number;
  leaveTypeCode?: string;
  leaveTypeName?: string;
  year: number;
  allocated: string;
  used: string;
  available: string;
  carriedForward?: string;
  openingBalance?: string;
  adjustments?: string;
  reserved?: string;
  employeeName?: string;
  employeeCode?: string;
  departmentName?: string;
  departmentCode?: string;
}

export interface EmployeeSummaryItem {
  id: number;
  employeeCode: string;
  employeeName: string;
  fullName?: string;
  departmentName?: string;
  departmentCode?: string;
  designationName?: string;
  officialEmail?: string;
}

export interface LeaveTypeItem {
  id: number;
  code: string;
  name: string;
  description?: string;
}

export interface TransactionItem {
  id: number;
  leaveBalanceId: number;
  transactionType: string;
  quantity?: string;
  amount?: string;
  balanceBefore?: string;
  balanceAfter?: string;
  remarks?: string;
  reason?: string;
  referenceType?: string;
  referenceId?: string | number;
  createdAt: string;
  leaveTypeCode?: string;
  leaveTypeName?: string;
}

export function AdminLeaveBalance() {
  const activeRole = getActiveRole();
  const isSuperAdmin = activeRole === 'SUPER_ADMIN';
  const isAuthorized = activeRole === 'SUPER_ADMIN' || activeRole === 'HR';
  const canAdjustLeaveBalance = isSuperAdmin || hasClientPermission('LEAVE_BALANCE_ADJUST');

  // Navigation tab: 'all' = All Employees summary, 'individual' = Particular Employee drilldown
  const [activeTab, setActiveTab] = useState<'all' | 'individual'>('all');

  // Core Data
  const [balances, setBalances] = useState<LeaveBalanceItem[]>([]);
  const [employees, setEmployees] = useState<EmployeeSummaryItem[]>([]);
  const [leaveTypes, setLeaveTypes] = useState<LeaveTypeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState<number>(currentYear);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDept, setSelectedDept] = useState('ALL');

  // Allow selecting historical and future leave years without a hard-coded 2036 limit.
  const availableYears = useMemo(() => {
    const startYear = 1900;
    const endYear = 2100;
    const list: number[] = [];
    for (let y = startYear; y <= endYear; y++) {
      list.push(y);
    }
    if (!list.includes(selectedYear)) {
      list.push(selectedYear);
      list.sort((a, b) => a - b);
    }
    return list;
  }, [selectedYear]);

  // Manual Balance Adjustment Modal State
  const [isAdjustModalOpen, setIsAdjustModalOpen] = useState(false);
  const [adjustEmpId, setAdjustEmpId] = useState<number | string>('');
  const [adjustYear, setAdjustYear] = useState<number>(selectedYear);
  const [adjustLeaveTypeId, setAdjustLeaveTypeId] = useState<number>(1);
  const [adjustType, setAdjustType] = useState<'CREDIT' | 'DEBIT' | 'SET' | 'SET_OPENING'>('CREDIT');
  const [adjustQuantity, setAdjustQuantity] = useState<string>('0');
  const [adjustReason, setAdjustReason] = useState<string>('');
  const [adjustSaving, setAdjustSaving] = useState(false);
  const [adjustError, setAdjustError] = useState<string | null>(null);
  const [adjustSuccessMsg, setAdjustSuccessMsg] = useState<string | null>(null);

  // Record Deletion Confirmation State (Super Admin)
  const [confirmDeleteBal, setConfirmDeleteBal] = useState<LeaveBalanceItem | null>(null);
  const [deletingBal, setDeletingBal] = useState(false);
  const [deleteBalError, setDeleteBalError] = useState<string | null>(null);

  const [confirmDeleteTx, setConfirmDeleteTx] = useState<TransactionItem | null>(null);
  const [deletingTx, setDeletingTx] = useState(false);
  const [deleteTxError, setDeleteTxError] = useState<string | null>(null);

  // Individual Employee View State
  const [individualEmpId, setIndividualEmpId] = useState<number | string>('');
  const [individualBalances, setIndividualBalances] = useState<LeaveBalanceItem[]>([]);
  const [loadingIndividual, setLoadingIndividual] = useState(false);
  const [individualError, setIndividualError] = useState<string | null>(null);
  const [transactions, setTransactions] = useState<TransactionItem[]>([]);
  const [loadingTransactions, setLoadingTransactions] = useState(false);
  const [showLedger, setShowLedger] = useState(false);

  // Load All Employees & Balance Data
  const loadMasterData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [balRes, empRes, ltRes] = await Promise.all([
        apiFetch(`/api/leave-balances?year=${selectedYear}`),
        apiFetch('/api/employees'),
        apiFetch('/api/leave-types'),
      ]);

      if (!balRes.ok) {
        const d = await balRes.json();
        throw new Error(d.error || 'Failed to load leave balances');
      }
      if (!empRes.ok) {
        const d = await empRes.json();
        throw new Error(d.error || 'Failed to load employees list');
      }

      const balData = await balRes.json();
      const empData = await empRes.json();
      const ltData = ltRes.ok ? await ltRes.json() : { leaveTypes: [] };

      const loadedEmployees: EmployeeSummaryItem[] = (empData.employees || []).filter(
        (employee: any) => String(employee.role || '').toUpperCase() !== 'SUPER_ADMIN'
      );
      const visibleEmployeeIds = new Set(loadedEmployees.map((employee) => Number(employee.id)));
      // The balance API may return all balances to an administrator; only include real employees here.
      const loadedBalances: LeaveBalanceItem[] = (balData.balances || []).filter(
        (balance: LeaveBalanceItem) => visibleEmployeeIds.has(Number(balance.employeeId))
      );
      const loadedTypes: LeaveTypeItem[] = ltData.leaveTypes || [];

      setBalances(loadedBalances);
      setEmployees(loadedEmployees);
      setLeaveTypes(loadedTypes);

      // Never keep a hidden Super Admin account selected in the employee drilldown.
      if (
        loadedEmployees.length > 0 &&
        (!individualEmpId || !loadedEmployees.some((employee) => String(employee.id) === String(individualEmpId)))
      ) {
        setIndividualEmpId(loadedEmployees[0].id);
      } else if (loadedEmployees.length === 0) {
        setIndividualEmpId('');
      }
    } catch (err: any) {
      setError(err.message || 'Error fetching balance records');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMasterData();
  }, [selectedYear]);

  // Load Selected Individual Employee's specific records
  const loadIndividualEmployeeData = async (targetEmpId: number | string) => {
    if (!targetEmpId) {
      setIndividualBalances([]);
      return;
    }
    setLoadingIndividual(true);
    setIndividualError(null);
    try {
      // Authoritatively fetch balances specifically for the chosen employee
      const res = await apiFetch(`/api/employees/${targetEmpId}/leave-balances?year=${selectedYear}`);
      if (res.ok) {
        const data = await res.json();
        setIndividualBalances(data.balances || []);
      } else {
        // Fallback to query param on /api/leave-balances
        const altRes = await apiFetch(`/api/leave-balances?employeeId=${targetEmpId}&year=${selectedYear}`);
        if (altRes.ok) {
          const altData = await altRes.json();
          setIndividualBalances(altData.balances || []);
        } else {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || 'Failed to load individual employee leave balances');
        }
      }

      // Fetch transaction ledger for this employee
      setLoadingTransactions(true);
      try {
        const txRes = await apiFetch(`/api/leave-balance-transactions?employeeId=${targetEmpId}`);
        if (txRes.ok) {
          const txData = await txRes.json();
          setTransactions(txData.transactions || []);
        }
      } catch {
        // Ledger is optional enhancement
      } finally {
        setLoadingTransactions(false);
      }
    } catch (err: any) {
      setIndividualError(err.message || 'Error loading employee balance details');
    } finally {
      setLoadingIndividual(false);
    }
  };

  useEffect(() => {
    if (individualEmpId) {
      loadIndividualEmployeeData(individualEmpId);
    }
  }, [individualEmpId, selectedYear]);

  // Helpers
  const handleOpenAdjustModal = (empId?: number | string, year?: number, typeId?: number) => {
    setAdjustError(null);
    setAdjustSuccessMsg(null);
    const targetEmp = empId ?? individualEmpId ?? (employees[0]?.id || '');
    setAdjustEmpId(targetEmp);
    setAdjustYear(year ?? selectedYear);
    setAdjustLeaveTypeId(typeId ?? (leaveTypes[0]?.id || 1));
    setAdjustType('CREDIT');
    setAdjustQuantity('0');
    setAdjustReason('');
    setIsAdjustModalOpen(true);
  };

  // Target balance record for the adjustment modal preview
  const currentAdjustBalance = useMemo(() => {
    const targetNumeric = Number(adjustEmpId);
    const targetTypeNumeric = Number(adjustLeaveTypeId);
    const targetYr = Number(adjustYear);
    return (
      individualBalances.find(
        (b) => b.employeeId === targetNumeric && b.leaveTypeId === targetTypeNumeric && b.year === targetYr
      ) ||
      balances.find(
        (b) => b.employeeId === targetNumeric && b.leaveTypeId === targetTypeNumeric && b.year === targetYr
      ) ||
      null
    );
  }, [balances, individualBalances, adjustEmpId, adjustLeaveTypeId, adjustYear]);

  const currentAdjustStats = useMemo(() => {
    const alloc = parseFloat(currentAdjustBalance?.allocated || '0') || 0;
    const used = parseFloat(currentAdjustBalance?.used || '0') || 0;
    const remaining =
      currentAdjustBalance?.available !== undefined && currentAdjustBalance?.available !== null
        ? parseFloat(currentAdjustBalance.available)
        : Math.max(0, alloc - used);

    const qty = parseFloat(adjustQuantity) || 0;
    const targetTypeNumeric = Number(adjustLeaveTypeId);
    const selectedLeaveType = leaveTypes.find((type) => Number(type.id) === targetTypeNumeric);
    const isCasualLeave = String(selectedLeaveType?.code || '').toUpperCase() === 'CL';
    let delta = 0;
    let newAlloc = alloc;
    let newUsed = used;

    if (adjustType === 'SET_OPENING') {
      const opening = parseFloat(currentAdjustBalance?.openingBalance || '0') || 0;
      delta = qty - opening;
      newAlloc = alloc;
    } else if (adjustType === 'CREDIT') {
      delta = qty;
      newAlloc = alloc + qty;
    } else if (adjustType === 'DEBIT') {
      delta = -qty;
      if (isCasualLeave) {
        // CL debit is consumption, not an entitlement reduction.
        newAlloc = alloc;
        newUsed = used + qty;
      } else {
        newAlloc = Math.max(0, alloc - qty);
      }
    } else {
      // SET
      newAlloc = qty;
      delta = newAlloc - alloc;
    }

    const newRemaining = remaining + delta;

    return {
      currentAllocated: alloc,
      currentUsed: used,
      currentRemaining: remaining,
      delta,
      newAllocated: newAlloc,
      newUsed,
      newRemaining,
      isNegative: newRemaining < 0,
      isCasualLeave,
    };
  }, [currentAdjustBalance, adjustQuantity, adjustType, leaveTypes]);

  const handleSaveAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdjustError(null);
    setAdjustSuccessMsg(null);

    if (!adjustEmpId) {
      setAdjustError('Please select an employee.');
      return;
    }
    const quantityText = adjustQuantity.trim();
    const qty = Number(quantityText);
    if (!/^\\d+(?:\\.\\d+)?$/.test(quantityText) || !Number.isFinite(qty) || qty < 0 || (qty === 0 && adjustType !== 'SET' && adjustType !== 'SET_OPENING')) {
      setAdjustError('Please enter a valid quantity. Allocation can be set to 0; credit and debit adjustments must be greater than 0.');
      return;
    }
    if (!adjustReason.trim()) {
      setAdjustError('An adjustment reason is mandatory for auditable compliance.');
      return;
    }
    if (currentAdjustStats.isNegative) {
      setAdjustError(
        `Adjustment would cause a negative remaining balance (${currentAdjustStats.newRemaining.toFixed(1)} Days). Negative balances are not permitted.`
      );
      return;
    }

    setAdjustSaving(true);
    try {
      const payload = {
        employeeId: adjustEmpId,
        leaveTypeId: adjustLeaveTypeId,
        year: adjustYear,
        // Send the selected operation and entered quantity directly.
        // Deriving CREDIT/DEBIT from the preview delta breaks explicit DEBIT/SET semantics.
        adjustmentType: adjustType,
        quantity: qty,
        remarks: adjustReason.trim(),
      };

      const res = await apiFetch('/api/leave-balances/adjust', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to apply balance adjustment');
      }

      setAdjustSuccessMsg(
        `Successfully updated balance! Allocated: ${currentAdjustStats.newAllocated.toFixed(1)} Days, Used: ${currentAdjustStats.newUsed.toFixed(1)} Days, Remaining: ${currentAdjustStats.newRemaining.toFixed(1)} Days.`
      );

      // Refresh master data and individual employee view
      await loadMasterData();
      if (individualEmpId) {
        await loadIndividualEmployeeData(individualEmpId);
      }

      setTimeout(() => {
        setIsAdjustModalOpen(false);
      }, 1200);
    } catch (err: any) {
      setAdjustError(err.message || 'Error processing adjustment');
    } finally {
      setAdjustSaving(false);
    }
  };

  const handleDeleteBalance = async (force: boolean = false) => {
    if (!confirmDeleteBal) return;
    setDeletingBal(true);
    setDeleteBalError(null);
    try {
      const res = await apiFetch(`/api/leave-balances/${confirmDeleteBal.id}${force ? '?force=true' : ''}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to delete leave balance record');
      }
      setConfirmDeleteBal(null);
      await loadMasterData();
      if (individualEmpId) {
        await loadIndividualEmployeeData(individualEmpId);
      }
    } catch (err: any) {
      setDeleteBalError(err.message || 'Unable to delete leave balance.');
    } finally {
      setDeletingBal(false);
    }
  };

  const handleDeleteTransaction = async () => {
    if (!confirmDeleteTx) return;
    setDeletingTx(true);
    setDeleteTxError(null);
    try {
      const res = await apiFetch(`/api/leave-balance-transactions/${confirmDeleteTx.id}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to delete transaction record');
      }
      setConfirmDeleteTx(null);
      await loadMasterData();
      if (individualEmpId) {
        await loadIndividualEmployeeData(individualEmpId);
      }
    } catch (err: any) {
      setDeleteTxError(err.message || 'Unable to delete transaction.');
    } finally {
      setDeletingTx(false);
    }
  };

  const getEmpDisplayName = (emp?: EmployeeSummaryItem | null) => {
    if (!emp) return 'Employee';
    return emp.fullName || emp.employeeName || `EMP #${emp.id}`;
  };

  // Distinct department names for filter
  const departmentsList = useMemo(() => {
    const set = new Set<string>();
    employees.forEach((e) => {
      if (e.departmentName) set.add(e.departmentName);
    });
    return Array.from(set).sort();
  }, [employees]);

  // Computed leave type balance helper for an employee
  const getEmployeeTypeStats = (empId: number, targetTypeCode: string) => {
    const codeUpper = targetTypeCode.toUpperCase();
    const bal = balances.find((b) => {
      if (b.employeeId !== empId) return false;
      const bCode = (b.leaveTypeCode || '').toUpperCase();
      const bName = (b.leaveTypeName || '').toUpperCase();
      if (codeUpper === 'CL') {
        return bCode === 'CL' || bName.includes('CASUAL');
      }
      if (codeUpper === 'SL') {
        return bCode === 'SL' || bName.includes('SICK');
      }
      if (codeUpper === 'EL') {
        return bCode === 'EL' || bName.includes('EARNED');
      }
      return bCode === codeUpper;
    });

    if (!bal) {
      return { allocated: 0, used: 0, remaining: 0, exists: false };
    }

    const alloc = parseFloat(bal.allocated || '0') || 0;
    const used = parseFloat(bal.used || '0') || 0;
    // Authoritative remaining from backend available, with fallback to (alloc - used)
    const remaining =
      bal.available !== undefined && bal.available !== null && bal.available !== ''
        ? parseFloat(bal.available)
        : Math.max(0, alloc - used);

    return {
      allocated: alloc,
      used,
      remaining,
      exists: true,
      raw: bal,
    };
  };

  // Other leave types for an employee (excluding CL, SL, EL)
  const getEmployeeOtherTypes = (empId: number) => {
    return balances.filter((b) => {
      if (b.employeeId !== empId) return false;
      const bCode = (b.leaveTypeCode || '').toUpperCase();
      const bName = (b.leaveTypeName || '').toUpperCase();
      const isCL = bCode === 'CL' || bName.includes('CASUAL');
      const isSL = bCode === 'SL' || bName.includes('SICK');
      const isEL = bCode === 'EL' || bName.includes('EARNED');
      return !isCL && !isSL && !isEL;
    });
  };

  // Filtered employees for All Employees table
  const filteredEmployees = useMemo(() => {
    return employees.filter((emp) => {
      const q = searchTerm.trim().toLowerCase();
      const matchesSearch =
        !q ||
        (emp.employeeCode && emp.employeeCode.toLowerCase().includes(q)) ||
        getEmpDisplayName(emp).toLowerCase().includes(q) ||
        (emp.departmentName && emp.departmentName.toLowerCase().includes(q));

      const matchesDept =
        selectedDept === 'ALL' ||
        (emp.departmentName && emp.departmentName === selectedDept);

      return matchesSearch && matchesDept;
    });
  }, [employees, searchTerm, selectedDept]);

  // Overall statistics for All Employees
  const overallTotals = useMemo(() => {
    let totalAlloc = 0;
    let totalUsed = 0;
    let totalAvail = 0;
    balances.forEach((b) => {
      totalAlloc += parseFloat(b.allocated || '0') || 0;
      totalUsed += parseFloat(b.used || '0') || 0;
      totalAvail += parseFloat(b.available || '0') || 0;
    });
    return {
      allocated: totalAlloc,
      used: totalUsed,
      remaining: totalAvail,
    };
  }, [balances]);

  // Selected Employee Details for Individual view
  const currentSelectedEmployee = useMemo(() => {
    return employees.find((e) => e.id === Number(individualEmpId)) || null;
  }, [employees, individualEmpId]);

  // Switch to Individual view for a particular employee
  const handleDrilldownEmployee = (empId: number) => {
    setIndividualEmpId(empId);
    setActiveTab('individual');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (!isAuthorized) {
    return (
      <div className="p-8 bg-rose-50 border border-rose-200 rounded-2xl text-center space-y-3">
        <div className="w-12 h-12 bg-rose-100 rounded-full flex items-center justify-center mx-auto text-rose-700">
          <Shield className="w-6 h-6" />
        </div>
        <h2 className="text-base font-bold text-rose-900">Access Restricted</h2>
        <p className="text-xs text-rose-700 max-w-md mx-auto">
          The Employee Leave Balance Dashboard is restricted to <strong>Super Admin</strong> and <strong>HR</strong>.
          Your current operational role ({activeRole}) does not have permission to view company-wide balances.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 1. Header Bar with MT Theme */}
      <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${MT_COLOR_CARDS.sky} p-6 border-b border-sky-200/80`}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-sky-100 border border-sky-300 flex items-center justify-center shrink-0 shadow-xs">
            <Wallet className="w-5 h-5 text-sky-700" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-neutral-900 tracking-tight">
                Employee Leave Balance Dashboard
              </h1>
              <span className="text-[11px] font-semibold px-2 py-0.5 bg-sky-200/80 text-sky-900 rounded-full">
                Year {selectedYear}
              </span>
            </div>
            <p className="text-xs text-slate-700 mt-0.5">
              Authoritative overview of leave entitlements, consumed quotas, and remaining balances across the organization.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
          {/* Action: Add / Adjust Balance */}
          {canAdjustLeaveBalance ? (
            <button
              onClick={() => handleOpenAdjustModal()}
              id="btn-adjust-leave-balance"
              className="flex items-center gap-1.5 px-3 py-1.5 bg-red-700 hover:bg-red-800 active:bg-red-900 text-white rounded-lg text-xs font-bold shadow-xs cursor-pointer transition-colors"
              title="Add or adjust employee leave balance"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add / Adjust Leave Balance</span>
            </button>
          ) : (
            <div
              id="btn-adjust-leave-balance"
              className="flex items-center gap-1.5 px-3 py-1.5 bg-neutral-100 text-neutral-400 border border-neutral-200 rounded-lg text-xs font-medium cursor-not-allowed"
              title="Permission Required: 'Leave Balance Add / Adjust' (LEAVE_BALANCE_ADJUST) permission required."
            >
              <Lock className="w-3.5 h-3.5" />
              <span>Add / Adjust Leave Balance (Restricted)</span>
            </div>
          )}

          {isSuperAdmin && (
            <button
              type="button"
              id="btn-set-total-leave-allocation"
              onClick={() => {
                handleOpenAdjustModal();
                setAdjustType('SET');
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-700 hover:bg-violet-800 active:bg-violet-900 text-white rounded-lg text-xs font-bold shadow-xs cursor-pointer transition-colors"
              title="Set an employee's total annual leave allocation"
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>SET TOTAL ALLOCATION</span>
            </button>
          )}

          {/* Dynamic Year selector extending into future */}
          <div className="flex items-center gap-1 bg-white px-2 py-1 rounded-lg border border-neutral-300 shadow-xs">
            <Calendar className="w-3.5 h-3.5 text-neutral-500" />
            <button
              onClick={() => setSelectedYear((y) => y - 1)}
              className="p-1 hover:bg-neutral-100 rounded text-neutral-600 cursor-pointer"
              title="Previous Year"
            >
              <Minus className="w-3 h-3" />
            </button>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              className="text-xs font-semibold text-neutral-800 bg-transparent focus:outline-none cursor-pointer px-1"
            >
              {availableYears.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
            <button
              onClick={() => setSelectedYear((y) => y + 1)}
              className="p-1 hover:bg-neutral-100 rounded text-neutral-600 cursor-pointer"
              title="Next Year"
            >
              <Plus className="w-3 h-3" />
            </button>
          </div>

          <button
            onClick={() => {
              loadMasterData();
              if (individualEmpId) loadIndividualEmployeeData(individualEmpId);
            }}
            className="p-2 bg-white hover:bg-neutral-50 border border-neutral-300 rounded-lg text-neutral-700 cursor-pointer shadow-xs transition-colors"
            title="Refresh All Balances"
          >
            <RefreshCw className={`w-4 h-4 ${loading || loadingIndividual ? 'animate-spin text-red-700' : ''}`} />
          </button>
        </div>
      </div>

      {/* 2. Top Navigation Tabs: All Employees vs. Individual Employee */}
      <div className="flex border-b border-neutral-200 bg-white px-4 pt-2 rounded-t-xl gap-2 shadow-xs">
        <button
          onClick={() => setActiveTab('all')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold border-b-2 transition-all cursor-pointer ${
            activeTab === 'all'
              ? 'border-red-700 text-red-700 bg-red-50/50 rounded-t-lg'
              : 'border-transparent text-neutral-600 hover:text-neutral-900 hover:border-neutral-300'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>All Employees ({employees.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('individual')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold border-b-2 transition-all cursor-pointer ${
            activeTab === 'individual'
              ? 'border-red-700 text-red-700 bg-red-50/50 rounded-t-lg'
              : 'border-transparent text-neutral-600 hover:text-neutral-900 hover:border-neutral-300'
          }`}
        >
          <User className="w-4 h-4" />
          <span>
            Individual Employee
            {currentSelectedEmployee && (
              <span className="ml-1 text-[11px] font-normal text-neutral-500">
                ({currentSelectedEmployee.employeeCode})
              </span>
            )}
          </span>
        </button>
      </div>

      {/* Global Error Banner */}
      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 font-medium flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* ========================================================================= */}
      {/* VIEW A: ALL EMPLOYEES DASHBOARD */}
      {/* ========================================================================= */}
      {activeTab === 'all' && (
        <div className="space-y-5">
          {/* KPI Summary Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <div className={`${MT_COLOR_CARDS.sky} p-4`}>
              <span className="text-[11px] font-bold uppercase tracking-wider text-sky-900 block">
                Total Entitled / Allocated
              </span>
              <span className="text-2xl font-black text-neutral-900 mt-1 block">
                {overallTotals.allocated.toFixed(1)} Days
              </span>
              <span className="text-[11px] text-sky-800 mt-0.5 block">
                Across {employees.length} employees ({selectedYear})
              </span>
            </div>

            <div className={`${MT_COLOR_CARDS.amber} p-4`}>
              <span className="text-[11px] font-bold uppercase tracking-wider text-amber-900 block">
                Total Consumed / Used
              </span>
              <span className="text-2xl font-black text-neutral-900 mt-1 block">
                {overallTotals.used.toFixed(1)} Days
              </span>
              <span className="text-[11px] text-amber-800 mt-0.5 block">
                Approved leaves deducted
              </span>
            </div>

            <div className={`${MT_COLOR_CARDS.emerald} p-4`}>
              <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-900 block">
                Total Remaining / Available
              </span>
              <span className="text-2xl font-black text-emerald-800 mt-1 block">
                {overallTotals.remaining.toFixed(1)} Days
              </span>
              <span className="text-[11px] text-emerald-800 mt-0.5 block">
                Active available balance
              </span>
            </div>

            <div className={`${MT_COLOR_CARDS.purple} p-4`}>
              <span className="text-[11px] font-bold uppercase tracking-wider text-purple-900 block">
                Active Staff Headcount
              </span>
              <span className="text-2xl font-black text-neutral-900 mt-1 block">
                {employees.length}
              </span>
              <span className="text-[11px] text-purple-800 mt-0.5 block">
                In Maestro Leave Roster
              </span>
            </div>
          </div>

          {/* Search & Department Filters Bar */}
          <div className={`flex flex-wrap items-center justify-between gap-3 ${MT_COLOR_CARDS.slate} p-4`}>
            <div className="flex flex-wrap items-center gap-3 flex-1 min-w-[260px]">
              {/* Search Box */}
              <div className="relative flex-1 min-w-[200px] max-w-md">
                <Search className="w-4 h-4 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search by Employee Code, Name, or Department..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg border border-neutral-300 bg-white focus:outline-none focus:ring-1 focus:ring-red-700/20 focus:border-red-700"
                />
              </div>

              {/* Department Filter */}
              <div className="flex items-center gap-1.5 text-xs">
                <Filter className="w-3.5 h-3.5 text-neutral-500" />
                <span className="text-neutral-600 font-medium">Department:</span>
                <select
                  value={selectedDept}
                  onChange={(e) => setSelectedDept(e.target.value)}
                  className="px-2.5 py-1.5 rounded-lg border border-neutral-300 text-xs text-neutral-800 bg-white focus:outline-none cursor-pointer"
                >
                  <option value="ALL">All Departments ({departmentsList.length})</option>
                  {departmentsList.map((dept) => (
                    <option key={dept} value={dept}>
                      {dept}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="text-[11px] text-neutral-500 font-medium">
              Showing {filteredEmployees.length} of {employees.length} employee(s)
            </div>
          </div>

          {/* All Employees Table */}
          <div className="bg-white rounded-xl border border-neutral-200 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  {/* Primary Header Row */}
                  <tr className="bg-neutral-100 text-neutral-800 font-bold border-b border-neutral-300">
                    <th className="px-3.5 py-3 border-r border-neutral-200 w-28">Emp Code</th>
                    <th className="px-3.5 py-3 border-r border-neutral-200 min-w-[140px]">Employee Name</th>
                    <th className="px-3.5 py-3 border-r border-neutral-200 min-w-[120px]">Department</th>

                    {/* CL Group */}
                    <th colSpan={3} className="px-3 py-2 text-center border-r border-neutral-200 bg-sky-50 text-sky-950 font-extrabold">
                      Casual Leave (CL)
                    </th>

                    {/* SL Group */}
                    <th colSpan={3} className="px-3 py-2 text-center border-r border-neutral-200 bg-amber-50 text-amber-950 font-extrabold">
                      Sick Leave (SL)
                    </th>

                    {/* EL Group */}
                    <th colSpan={3} className="px-3 py-2 text-center border-r border-neutral-200 bg-emerald-50 text-emerald-950 font-extrabold">
                      Earned Leave (EL)
                    </th>

                    {/* Other Leaves */}
                    <th className="px-3.5 py-3 border-r border-neutral-200 min-w-[130px] text-center">Other Leaves</th>

                    {/* Actions */}
                    <th className="px-3 py-3 text-center min-w-[90px]">Actions</th>
                  </tr>

                  {/* Secondary Sub-Header Row for Allocated / Used / Remaining */}
                  <tr className="bg-neutral-50 text-[11px] text-neutral-600 font-semibold border-b border-neutral-200">
                    <th className="px-3.5 py-1.5 border-r border-neutral-200"></th>
                    <th className="px-3.5 py-1.5 border-r border-neutral-200"></th>
                    <th className="px-3.5 py-1.5 border-r border-neutral-200"></th>

                    {/* CL Sub-columns */}
                    <th className="px-2 py-1.5 text-center text-sky-900 bg-sky-50/70 border-r border-sky-100 w-16">Alloc</th>
                    <th className="px-2 py-1.5 text-center text-sky-900 bg-sky-50/70 border-r border-sky-100 w-16">Used</th>
                    <th className="px-2 py-1.5 text-center text-sky-950 font-bold bg-sky-100/70 border-r border-neutral-200 w-16">Rem</th>

                    {/* SL Sub-columns */}
                    <th className="px-2 py-1.5 text-center text-amber-900 bg-amber-50/70 border-r border-amber-100 w-16">Alloc</th>
                    <th className="px-2 py-1.5 text-center text-amber-900 bg-amber-50/70 border-r border-amber-100 w-16">Used</th>
                    <th className="px-2 py-1.5 text-center text-amber-950 font-bold bg-amber-100/70 border-r border-neutral-200 w-16">Rem</th>

                    {/* EL Sub-columns */}
                    <th className="px-2 py-1.5 text-center text-emerald-900 bg-emerald-50/70 border-r border-emerald-100 w-16">Alloc</th>
                    <th className="px-2 py-1.5 text-center text-emerald-900 bg-emerald-50/70 border-r border-emerald-100 w-16">Used</th>
                    <th className="px-2 py-1.5 text-center text-emerald-950 font-bold bg-emerald-100/70 border-r border-neutral-200 w-16">Rem</th>

                    <th className="px-3.5 py-1.5 border-r border-neutral-200"></th>
                    <th className="px-3 py-1.5"></th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-neutral-200">
                  {loading ? (
                    <tr>
                      <td colSpan={14} className="px-4 py-12 text-center text-neutral-500">
                        <div className="flex flex-col items-center justify-center gap-2">
                          <RefreshCw className="w-6 h-6 animate-spin text-red-700" />
                          <span className="text-xs font-semibold">Loading employee leave balances...</span>
                        </div>
                      </td>
                    </tr>
                  ) : filteredEmployees.length === 0 ? (
                    <tr>
                      <td colSpan={14} className="px-4 py-12 text-center text-neutral-500">
                        <div className="flex flex-col items-center justify-center gap-1.5">
                          <Users className="w-8 h-8 text-neutral-300" />
                          <span className="text-xs font-bold text-neutral-700">No employees found</span>
                          <span className="text-[11px] text-neutral-500">
                            No records match query "{searchTerm}" in department "{selectedDept}"
                          </span>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    filteredEmployees.map((emp) => {
                      const cl = getEmployeeTypeStats(emp.id, 'CL');
                      const sl = getEmployeeTypeStats(emp.id, 'SL');
                      const el = getEmployeeTypeStats(emp.id, 'EL');
                      const otherBals = getEmployeeOtherTypes(emp.id);

                      return (
                        <tr
                          key={emp.id}
                          className="hover:bg-neutral-50/80 transition-colors cursor-pointer group"
                          onClick={() => handleDrilldownEmployee(emp.id)}
                        >
                          {/* Code */}
                          <td className="px-3.5 py-3 border-r border-neutral-200 font-mono font-bold text-neutral-800 whitespace-nowrap">
                            <Employee360Link
                              employeeId={emp.id}
                              employeeCode={emp.employeeCode}
                              employeeName={getEmpDisplayName(emp)}
                              variant="badge"
                            >
                              {emp.employeeCode || `EMP-${emp.id}`}
                            </Employee360Link>
                          </td>

                          {/* Name */}
                          <td className="px-3.5 py-3 border-r border-neutral-200 font-semibold text-neutral-900">
                            <div>{getEmpDisplayName(emp)}</div>
                            {emp.designationName && (
                              <div className="text-[11px] font-normal text-neutral-500 mt-0.5">
                                {emp.designationName}
                              </div>
                            )}
                          </td>

                          {/* Department */}
                          <td className="px-3.5 py-3 border-r border-neutral-200 text-neutral-600 font-medium">
                            {emp.departmentName || 'General Operations'}
                          </td>

                          {/* CL: Alloc, Used, Rem */}
                          <td className="px-2 py-3 text-center border-r border-sky-100 bg-sky-50/30 text-neutral-700">
                            {cl.allocated.toFixed(1)}
                          </td>
                          <td className="px-2 py-3 text-center border-r border-sky-100 bg-sky-50/30 text-amber-800 font-medium">
                            {cl.used.toFixed(1)}
                          </td>
                          <td className="px-2 py-3 text-center border-r border-neutral-200 bg-sky-50/60 font-bold text-sky-900">
                            {cl.remaining.toFixed(1)}
                          </td>

                          {/* SL: Alloc, Used, Rem */}
                          <td className="px-2 py-3 text-center border-r border-amber-100 bg-amber-50/30 text-neutral-700">
                            {sl.allocated.toFixed(1)}
                          </td>
                          <td className="px-2 py-3 text-center border-r border-amber-100 bg-amber-50/30 text-amber-800 font-medium">
                            {sl.used.toFixed(1)}
                          </td>
                          <td className="px-2 py-3 text-center border-r border-neutral-200 bg-amber-50/60 font-bold text-amber-900">
                            {sl.remaining.toFixed(1)}
                          </td>

                          {/* EL: Alloc, Used, Rem */}
                          <td className="px-2 py-3 text-center border-r border-emerald-100 bg-emerald-50/30 text-neutral-700">
                            {el.allocated.toFixed(1)}
                          </td>
                          <td className="px-2 py-3 text-center border-r border-emerald-100 bg-emerald-50/30 text-amber-800 font-medium">
                            {el.used.toFixed(1)}
                          </td>
                          <td className="px-2 py-3 text-center border-r border-neutral-200 bg-emerald-50/60 font-bold text-emerald-900">
                            {el.remaining.toFixed(1)}
                          </td>

                          {/* Other Leaves */}
                          <td className="px-3.5 py-3 border-r border-neutral-200 text-center">
                            {otherBals.length > 0 ? (
                              <div className="flex flex-wrap justify-center gap-1">
                                {otherBals.map((ob) => (
                                  <span
                                    key={ob.id}
                                    title={`${ob.leaveTypeName || ob.leaveTypeCode}: ${ob.allocated} alloc / ${ob.used} used / ${ob.available} rem`}
                                    className="px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-neutral-100 text-neutral-800 border border-neutral-300"
                                  >
                                    {ob.leaveTypeCode || 'OT'}: {parseFloat(ob.available || '0').toFixed(0)} Days
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <span className="text-neutral-500 text-[11px]">—</span>
                            )}
                          </td>

                          {/* Action Button */}
                          <td className="px-3 py-3 text-center whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center justify-center gap-1.5">
                              <button
                                onClick={() => handleDrilldownEmployee(emp.id)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold text-red-700 hover:text-white bg-red-50 hover:bg-red-700 border border-red-200 hover:border-red-700 rounded-lg transition-colors cursor-pointer shadow-2xs"
                              >
                                <span>View</span>
                                <ChevronRight className="w-3.5 h-3.5" />
                              </button>
                              {canAdjustLeaveBalance ? (
                                <button
                                  onClick={() => handleOpenAdjustModal(emp.id)}
                                  title="Adjust this employee's leave balance"
                                  className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold text-neutral-700 hover:text-red-700 bg-neutral-100 hover:bg-neutral-200 border border-neutral-300 rounded-lg transition-colors cursor-pointer"
                                >
                                  <Sliders className="w-3 h-3" />
                                  <span>Adjust</span>
                                </button>
                              ) : (
                                <span
                                  className="inline-flex items-center gap-1 px-2 py-1 text-[10px] text-neutral-400 bg-neutral-50 border border-neutral-200 rounded-lg cursor-not-allowed"
                                  title="Permission Required: 'Leave Balance Add / Adjust' permission required."
                                >
                                  <Lock className="w-2.5 h-2.5" />
                                  <span>Adjust</span>
                                </span>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* VIEW B: INDIVIDUAL EMPLOYEE DRILLDOWN */}
      {/* ========================================================================= */}
      {activeTab === 'individual' && (
        <div className="space-y-6">
          {/* Employee Selector Bar */}
          <div className="bg-white p-4 rounded-xl border border-neutral-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex-1 max-w-xl">
              <label className="block text-xs font-bold text-neutral-800 mb-1.5">
                Select Particular Employee:
              </label>
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <User className="w-4 h-4 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <select
                    value={individualEmpId}
                    onChange={(e) => setIndividualEmpId(Number(e.target.value))}
                    className="w-full pl-9 pr-8 py-2 text-xs font-semibold text-neutral-900 bg-white border border-neutral-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-red-700/20 focus:border-red-700 cursor-pointer shadow-xs"
                  >
                    {employees.map((emp) => (
                      <option key={emp.id} value={emp.id}>
                        {emp.employeeCode} — {getEmpDisplayName(emp)} ({emp.departmentName || 'General'})
                      </option>
                    ))}
                  </select>
                </div>

                {individualEmpId && (
                  <Employee360Link
                    employeeId={individualEmpId}
                    variant="button"
                    showIcon
                  >
                    360° Profile
                  </Employee360Link>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2">
              {canAdjustLeaveBalance ? (
                <button
                  onClick={() => handleOpenAdjustModal(individualEmpId)}
                  className="text-xs font-bold bg-red-700 hover:bg-red-800 text-white flex items-center gap-1.5 py-1.5 px-3 rounded-lg cursor-pointer shadow-xs transition-colors"
                  title="Add or adjust balance for this employee"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add / Adjust Balance</span>
                </button>
              ) : (
                <div
                  className="text-xs font-medium bg-neutral-100 text-neutral-400 border border-neutral-200 flex items-center gap-1.5 py-1.5 px-3 rounded-lg cursor-not-allowed"
                  title="Permission Required: 'Leave Balance Add / Adjust' (LEAVE_BALANCE_ADJUST) permission required."
                >
                  <Lock className="w-3.5 h-3.5" />
                  <span>Add / Adjust Balance (Restricted)</span>
                </div>
              )}
              <button
                onClick={() => setActiveTab('all')}
                className="text-xs font-semibold text-neutral-600 hover:text-neutral-900 flex items-center gap-1.5 py-1.5 px-3 rounded-lg border border-neutral-200 hover:bg-neutral-50 cursor-pointer"
              >
                <span>Back to All Employees</span>
              </button>
            </div>
          </div>

          {/* Individual Error */}
          {individualError && (
            <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 font-medium flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{individualError}</span>
            </div>
          )}

          {/* Selected Employee Profile Header Card */}
          {currentSelectedEmployee && (
            <div className={`${MT_COLOR_CARDS.slate} p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4`}>
              <div className="flex items-center gap-3.5">
                <div className="w-12 h-12 rounded-xl bg-white border border-neutral-300 flex items-center justify-center font-bold text-neutral-800 text-lg shadow-xs">
                  {currentSelectedEmployee.employeeCode?.slice(-3) || 'EMP'}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-bold text-neutral-900">
                      {getEmpDisplayName(currentSelectedEmployee)}
                    </h2>
                    <span className="font-mono text-xs font-bold px-2 py-0.5 bg-neutral-200 text-neutral-800 rounded">
                      {currentSelectedEmployee.employeeCode}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-600 mt-1">
                    <span className="flex items-center gap-1">
                      <Building className="w-3.5 h-3.5 text-neutral-500" />
                      {currentSelectedEmployee.departmentName || 'General Operations'}
                    </span>
                    {currentSelectedEmployee.designationName && (
                      <>
                        <span className="text-neutral-300">•</span>
                        <span>{currentSelectedEmployee.designationName}</span>
                      </>
                    )}
                    {currentSelectedEmployee.officialEmail && (
                      <>
                        <span className="text-neutral-300">•</span>
                        <span className="text-neutral-500 font-mono">{currentSelectedEmployee.officialEmail}</span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              <div className="text-right">
                <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-500 block">
                  Applicable Leave Year
                </span>
                <span className="text-xl font-black text-neutral-900 block mt-0.5">
                  {selectedYear}
                </span>
              </div>
            </div>
          )}

          {/* Selected Employee Summary KPIs */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
            <div className={`${MT_COLOR_CARDS.sky} p-4`}>
              <span className="text-[11px] font-bold uppercase tracking-wider text-sky-900 block">
                Total Entitled / Allocated
              </span>
              <span className="text-2xl font-black text-neutral-900 mt-1 block">
                {individualBalances
                  .reduce((sum, b) => sum + (parseFloat(b.allocated || '0') || 0), 0)
                  .toFixed(1)} Days
              </span>
              <span className="text-[11px] text-sky-800 mt-0.5 block">
                Official quota for {selectedYear}
              </span>
            </div>

            <div className={`${MT_COLOR_CARDS.amber} p-4`}>
              <span className="text-[11px] font-bold uppercase tracking-wider text-amber-900 block">
                Total Approved / Used
              </span>
              <span className="text-2xl font-black text-neutral-900 mt-1 block">
                {individualBalances
                  .reduce((sum, b) => sum + (parseFloat(b.used || '0') || 0), 0)
                  .toFixed(1)} Days
              </span>
              <span className="text-[11px] text-amber-800 mt-0.5 block">
                Days consumed to date
              </span>
            </div>

            <div className={`${MT_COLOR_CARDS.emerald} p-4`}>
              <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-900 block">
                Net Remaining / Available
              </span>
              <span className="text-2xl font-black text-emerald-800 mt-1 block">
                {individualBalances
                  .reduce((sum, b) => sum + (parseFloat(b.available || '0') || 0), 0)
                  .toFixed(1)} Days
              </span>
              <span className="text-[11px] text-emerald-800 mt-0.5 block">
                Ready for leave applications
              </span>
            </div>
          </div>

          {/* Detailed Leave-Type-Wise Balances Table */}
          <div className="bg-white rounded-xl border border-neutral-200 shadow-xs overflow-hidden">
            <div className="px-5 py-3.5 bg-neutral-50 border-b border-neutral-200 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-neutral-900">
                  Detailed Leave Type Balances — {selectedYear}
                </h3>
                <p className="text-[11px] text-neutral-500 mt-0.5">
                  Breakdown by leave policy category. (Calculated: Allocated - Used = Remaining)
                </p>
              </div>

              <div className="text-xs text-neutral-500 font-medium">
                {individualBalances.length} category record(s)
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-neutral-100 text-neutral-700 font-bold border-b border-neutral-200">
                    <th className="px-4 py-3 min-w-[180px]">Leave Type</th>
                    <th className="px-4 py-3 text-center w-24">Leave Year</th>
                    <th className="px-4 py-3 text-right w-36">Allocated / Entitled</th>
                    <th className="px-4 py-3 text-right w-28">Used</th>
                    <th className="px-4 py-3 text-right w-32">Remaining</th>
                    <th className="px-4 py-3 text-center min-w-[150px]">Balance Gauge</th>
                    {isSuperAdmin && <th className="px-4 py-3 text-right w-20">Actions</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-200">
                  {loadingIndividual ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-10 text-center text-neutral-500">
                        <RefreshCw className="w-5 h-5 animate-spin mx-auto text-red-700 mb-2" />
                        <span>Loading employee balances...</span>
                      </td>
                    </tr>
                  ) : individualBalances.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-12 text-center text-neutral-500">
                        <div className="flex flex-col items-center justify-center gap-1.5">
                          <PieChart className="w-8 h-8 text-neutral-300" />
                          <span className="text-xs font-bold text-neutral-700">No balance records found</span>
                          <span className="text-[11px] text-neutral-500">
                            No active leave balances initialized for this employee in {selectedYear}.
                          </span>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    individualBalances.map((b) => {
                      const alloc = parseFloat(b.allocated || '0') || 0;
                      const used = parseFloat(b.used || '0') || 0;
                      const remaining =
                        b.available !== undefined && b.available !== null && b.available !== ''
                          ? parseFloat(b.available)
                          : Math.max(0, alloc - used);

                      const code = (b.leaveTypeCode || `LT-${b.leaveTypeId}`).toUpperCase();
                      const name = b.leaveTypeName || 'Leave';
                      const ratio = alloc > 0 ? Math.min(100, Math.round((used / alloc) * 100)) : 0;

                      return (
                        <tr key={b.id} className="hover:bg-neutral-50/60 transition-colors">
                          {/* Leave Type */}
                          <td className="px-4 py-3.5">
                            <div className="flex items-center gap-2">
                              <span
                                className={`px-2 py-0.5 rounded font-mono font-bold text-[11px] ${getLeaveTypeBadgeClasses(
                                  b.leaveTypeCode || b.leaveTypeName
                                )}`}
                              >
                                {code}
                              </span>
                              <span className="font-semibold text-neutral-900">{name}</span>
                            </div>
                          </td>

                          {/* Year */}
                          <td className="px-4 py-3.5 text-center font-mono font-semibold text-neutral-600">
                            {b.year}
                          </td>

                          {/* Allocated — Super Admin can edit the entitlement directly here */}
                          <td className="px-4 py-3.5 text-right font-semibold text-neutral-800">
                            <div className="inline-flex items-center justify-end gap-2">
                              <span className="text-sm font-bold">{alloc.toFixed(1)}</span>
                              <span className="text-[11px] text-neutral-500">Days</span>
                              {isSuperAdmin && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    handleOpenAdjustModal(b.employeeId, b.year, b.leaveTypeId);
                                    setAdjustType('SET');
                                    setAdjustQuantity(String(alloc));
                                  }}
                                  className="inline-flex items-center gap-1 rounded-md border border-violet-200 bg-violet-50 px-2 py-1 text-[10px] font-bold text-violet-800 hover:bg-violet-100"
                                  title={`Edit annual allocation for ${name} — ${code}`}
                                  aria-label={`Edit allocation for ${name} ${code}`}
                                >
                                  Edit
                                </button>
                              )}
                            </div>
                          </td>

                          {/* Used */}
                          <td className="px-4 py-3.5 text-right font-semibold text-amber-800">
                            <span className="text-sm font-bold">{used.toFixed(1)}</span>
                            <span className="text-[11px] text-amber-600/70 ml-1">Days</span>
                          </td>

                          {/* Remaining */}
                          <td className="px-4 py-3.5 text-right font-black">
                            <span
                              className={`text-sm ${
                                remaining > 0 ? 'text-emerald-800' : 'text-neutral-500'
                              }`}
                            >
                              {remaining.toFixed(1)}
                            </span>
                            <span className="text-[11px] text-neutral-500 ml-1">Days</span>
                          </td>

                          {/* Gauge */}
                          <td className="px-4 py-3.5">
                            <div className="w-full max-w-xs mx-auto">
                              <div className="flex justify-between text-[10px] text-neutral-500 mb-1">
                                <span>{used.toFixed(1)} Days used</span>
                                <span className="font-semibold">{remaining.toFixed(1)} Days left</span>
                              </div>
                              <div className="w-full h-2 bg-neutral-100 rounded-full overflow-hidden border border-neutral-200">
                                <div
                                  className={`h-full rounded-full transition-all ${
                                    ratio > 80
                                      ? 'bg-rose-500'
                                      : ratio > 50
                                      ? 'bg-amber-500'
                                      : 'bg-emerald-500'
                                  }`}
                                  style={{ width: `${ratio}%` }}
                                />
                              </div>
                            </div>
                          </td>

                          {/* Administrative Delete Control for SUPER_ADMIN */}
                          {isSuperAdmin && (
                            <td className="px-4 py-3.5 text-right whitespace-nowrap">
                              <button
                                type="button"
                                id={`btn-delete-leave-bal-${b.id}`}
                                onClick={() => setConfirmDeleteBal(b)}
                                className="p-1.5 text-neutral-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                                title="Delete Leave Balance Record (SUPER_ADMIN)"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          )}
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Toggleable Transaction Ledger for Selected Employee */}
          <div className="bg-white rounded-xl border border-neutral-200 shadow-xs overflow-hidden">
            <div className="px-5 py-3.5 bg-neutral-50 border-b border-neutral-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <History className="w-4 h-4 text-neutral-600" />
                <h3 className="text-xs font-bold text-neutral-900">
                  Transaction & Movement Audit Ledger
                </h3>
              </div>

              <button
                onClick={() => setShowLedger(!showLedger)}
                className="text-xs font-semibold text-red-700 hover:text-red-800 cursor-pointer"
              >
                {showLedger ? 'Hide Ledger' : `Show Ledger (${transactions.length} entries)`}
              </button>
            </div>

            {showLedger && (
              <div className="overflow-auto overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-neutral-100 text-neutral-700 font-bold border-b border-neutral-200">
                      <th className="px-4 py-2.5">Date</th>
                      <th className="px-4 py-2.5">Type</th>
                      <th className="px-4 py-2.5 text-right">Quantity</th>
                      <th className="px-4 py-2.5">Remarks / Reason</th>
                      <th className="px-4 py-2.5">Reference</th>
                      {isSuperAdmin && <th className="px-4 py-2.5 text-right w-16">Action</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-200">
                    {loadingTransactions ? (
                      <tr>
                        <td colSpan={isSuperAdmin ? 6 : 5} className="px-4 py-6 text-center text-neutral-500">
                          <RefreshCw className="w-4 h-4 animate-spin mx-auto text-red-700" />
                        </td>
                      </tr>
                    ) : transactions.length === 0 ? (
                      <tr>
                        <td colSpan={isSuperAdmin ? 6 : 5} className="px-4 py-6 text-center text-neutral-500">
                          No transaction history recorded yet for this employee.
                        </td>
                      </tr>
                    ) : (
                      transactions.map((tx) => (
                        <tr key={tx.id} className="hover:bg-neutral-50">
                          <td className="px-4 py-2.5 font-mono text-neutral-600">
                            {formatDate(tx.createdAt)}
                          </td>
                          <td className="px-4 py-2.5">
                            <span className="font-semibold text-neutral-800">
                              {tx.transactionType}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono font-bold text-neutral-900">
                            {tx.quantity || tx.amount ? `${tx.quantity || tx.amount} Days` : '—'}
                          </td>
                          <td className="px-4 py-2.5 text-neutral-600">
                            {tx.remarks || tx.reason || 'Standard transaction'}
                          </td>
                          <td className="px-4 py-2.5 font-mono text-[11px] text-neutral-500">
                            {tx.referenceType || 'SYSTEM'} {tx.referenceId ? `#${tx.referenceId}` : ''}
                          </td>
                          {isSuperAdmin && (
                            <td className="px-4 py-2.5 text-right whitespace-nowrap">
                              <button
                                type="button"
                                id={`btn-delete-tx-${tx.id}`}
                                onClick={() => setConfirmDeleteTx(tx)}
                                className="p-1 text-neutral-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors cursor-pointer"
                                title="Delete Transaction (SUPER_ADMIN)"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </td>
                          )}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MANUAL LEAVE BALANCE ADJUSTMENT / OPENING BALANCE MODAL (SUPER ADMIN & HR) */}
      {/* ========================================================================= */}
      {isAdjustModalOpen && (
        <div
          id="modal-adjust-leave-balance"
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/50 backdrop-blur-xs overflow-y-auto"
        >
          <div className="bg-white rounded-2xl max-w-lg w-full p-5 sm:p-6 shadow-2xl border border-neutral-200 border-t-4 border-t-red-700 space-y-4 my-8">
            <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
              <div className="flex items-center gap-2">
                <Sliders className="w-5 h-5 text-red-700" />
                <div>
                  <h3 className="text-base font-bold text-neutral-900">
                    Add / Adjust Leave Balance
                  </h3>
                  <p className="text-[11px] text-neutral-500">
                    Add previous/opening balance or make auditable balance corrections
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsAdjustModalOpen(false)}
                className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {adjustError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <span>{adjustError}</span>
              </div>
            )}

            {adjustSuccessMsg && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span>{adjustSuccessMsg}</span>
              </div>
            )}

            <form onSubmit={handleSaveAdjustment} className="space-y-4">
              {/* 1. Select Employee */}
              <div>
                <label className="block text-xs font-bold text-neutral-700 mb-1">
                  1. Select Employee <span className="text-rose-600">*</span>
                </label>
                <select
                  id="adjust-select-employee"
                  value={adjustEmpId}
                  onChange={(e) => setAdjustEmpId(Number(e.target.value))}
                  className="w-full text-xs p-2.5 bg-white rounded-lg border border-neutral-300 focus:outline-none focus:ring-1 focus:ring-red-700 focus:border-red-700 cursor-pointer"
                >
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.employeeCode} — {getEmpDisplayName(emp)} ({emp.departmentName || 'General'})
                    </option>
                  ))}
                </select>
              </div>

              {/* 2. Select Leave Year & 3. Select Leave Type */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-neutral-700 mb-1">
                    2. Leave Year <span className="text-rose-600">*</span>
                  </label>
                  <select
                    id="adjust-select-year"
                    value={adjustYear}
                    onChange={(e) => setAdjustYear(Number(e.target.value))}
                    className="w-full text-xs p-2.5 bg-white rounded-lg border border-neutral-300 focus:outline-none focus:ring-1 focus:ring-red-700 focus:border-red-700 cursor-pointer font-semibold"
                  >
                    {availableYears.map((y) => (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-neutral-700 mb-1">
                    3. Leave Type <span className="text-rose-600">*</span>
                  </label>
                  <select
                    id="adjust-select-leave-type"
                    value={adjustLeaveTypeId}
                    onChange={(e) => setAdjustLeaveTypeId(Number(e.target.value))}
                    className="w-full text-xs p-2.5 bg-white rounded-lg border border-neutral-300 focus:outline-none focus:ring-1 focus:ring-red-700 focus:border-red-700 cursor-pointer font-semibold"
                  >
                    {leaveTypes.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.code} — {t.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* 4. Show Current Balance */}
              <div className="p-3 bg-neutral-50 rounded-xl border border-neutral-200">
                <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 block mb-1.5">
                  4. Current Balance Status
                </span>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="p-2 bg-white rounded-lg border border-neutral-200">
                    <span className="text-[10px] text-neutral-500 block">Allocated</span>
                    <span className="text-xs font-bold text-neutral-800">
                      {currentAdjustStats.currentAllocated.toFixed(1)} Days
                    </span>
                  </div>
                  <div className="p-2 bg-white rounded-lg border border-neutral-200">
                    <span className="text-[10px] text-amber-600 block">Used</span>
                    <span className="text-xs font-bold text-amber-800">
                      {currentAdjustStats.currentUsed.toFixed(1)} Days
                    </span>
                  </div>
                  <div className="p-2 bg-emerald-50 rounded-lg border border-emerald-200">
                    <span className="text-[10px] text-emerald-700 block">Remaining</span>
                    <span className="text-xs font-black text-emerald-800">
                      {currentAdjustStats.currentRemaining.toFixed(1)} Days
                    </span>
                  </div>
                </div>
              </div>

              {/* 5. Adjustment Direction: Addition vs. Deduction */}
              <div>
                <label className="block text-xs font-bold text-neutral-700 mb-1.5">
                  5. Adjustment Direction <span className="text-rose-600">*</span>
                </label>
                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setAdjustType('CREDIT')}
                    className={`p-2.5 rounded-lg border text-left transition-all cursor-pointer ${
                      adjustType === 'CREDIT'
                        ? 'border-emerald-600 bg-emerald-50 text-emerald-900 font-bold shadow-2xs'
                        : 'border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-800">
                      <Plus className="w-3.5 h-3.5" />
                      <span>ADDITION (Credit)</span>
                    </div>
                    <div className="text-[10px] text-neutral-500 mt-0.5">
                      Add previous / opening balance
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setAdjustType('DEBIT')}
                    className={`p-2.5 rounded-lg border text-left transition-all cursor-pointer ${
                      adjustType === 'DEBIT'
                        ? 'border-rose-600 bg-rose-50 text-rose-900 font-bold shadow-2xs'
                        : 'border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 text-xs font-bold text-rose-800">
                      <Minus className="w-3.5 h-3.5" />
                      <span>DEDUCTION (Debit)</span>
                    </div>
                    <div className="text-[10px] text-neutral-500 mt-0.5">
                      {Number(adjustLeaveTypeId) === Number(leaveTypes.find((type) => type.code.toUpperCase() === 'CL')?.id)
                        ? 'Record consumed CL as Used; annual allocation stays unchanged'
                        : 'Deduct / correct excess entitlement'}
                    </div>
                  </button>
                </div>
              </div>

              {isSuperAdmin && (
                <div>
                  <label className="block text-xs font-bold text-neutral-700 mb-1.5">Annual Leave Allocation Control (Super Admin)</label>
                  <button
                    type="button"
                    onClick={() => setAdjustType('SET')}
                    className={`w-full p-2.5 rounded-lg border text-left transition-all cursor-pointer ${adjustType === 'SET' ? 'border-violet-600 bg-violet-50 text-violet-900 font-bold shadow-2xs' : 'border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50'}`}
                  >
                    <div className="text-xs font-bold">SET TOTAL ALLOCATION</div>
                    <div className="text-[10px] text-neutral-500 mt-0.5">Set the employee's annual entitlement directly (e.g. CL 12 days); used and remaining will be recalculated.</div>
                  </button>
                </div>
              )}

              {/* 6. Adjustment Amount */}
              <div>
                <label className="block text-xs font-bold text-neutral-700 mb-1">
                  6. New Allocation / Adjustment Amount (in Days) <span className="text-rose-600">*</span>
                </label>
                <div className="relative">
                  <input
                    id="adjust-input-quantity"
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    pattern="[0-9]+(\\.[0-9]+)?"
                    required
                    value={adjustQuantity}
                    onChange={(e) => {
                      const raw = e.target.value.replace(/[^0-9.]/g, '');
                      const dotIndex = raw.indexOf('.');
                      const numericOnly = dotIndex === -1
                        ? raw
                        : raw.slice(0, dotIndex + 1) + raw.slice(dotIndex + 1).replace(/\\./g, '');
                      setAdjustQuantity(numericOnly);
                    }}
                    placeholder={adjustType === 'SET' || adjustType === 'SET_OPENING' ? "e.g. 0, 4, or 12" : "e.g. 4 or 0.5"}
                    className="w-full text-xs font-mono font-bold p-2.5 bg-white rounded-lg border border-neutral-300 focus:outline-none focus:ring-1 focus:ring-red-700 focus:border-red-700"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-neutral-400 font-semibold pointer-events-none">
                    Days
                  </span>
                </div>
              </div>

              {/* 7. Reason (Mandatory) */}
              <div>
                <label className="block text-xs font-bold text-neutral-700 mb-1">
                  7. Reason for Adjustment / Previous Balance <span className="text-rose-600">*</span>
                </label>
                <textarea
                  id="adjust-input-reason"
                  required
                  rows={2}
                  value={adjustReason}
                  onChange={(e) => setAdjustReason(e.target.value)}
                  placeholder="e.g. Previous year opening balance carry-over, manual credit, corrected balance calculation"
                  className="w-full text-xs p-2.5 bg-white rounded-lg border border-neutral-300 focus:outline-none focus:ring-1 focus:ring-red-700 focus:border-red-700"
                />
              </div>

              {/* Live Preview Box */}
              <div className="p-3 bg-red-50/50 rounded-xl border border-red-100 text-xs">
                <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-600 block mb-1">
                  Preview After Saving:
                </span>
                <div className="flex items-center justify-between text-neutral-700">
                  <span>New Entitlement / Allocated:</span>
                  <span className="font-bold font-mono text-neutral-900">
                    {currentAdjustStats.newAllocated.toFixed(1)} Days
                  </span>
                </div>
                {currentAdjustStats.isCasualLeave && (
                  <div className="flex items-center justify-between text-neutral-700 mt-1">
                    <span>New Used:</span>
                    <span className="font-bold font-mono text-amber-800">
                      {currentAdjustStats.newUsed.toFixed(1)} Days
                    </span>
                  </div>
                )}
                <div className="flex items-center justify-between text-neutral-700 mt-1">
                  <span>New Remaining Balance:</span>
                  <span
                    className={`font-black font-mono ${
                      currentAdjustStats.newRemaining < 0 ? 'text-rose-600' : 'text-emerald-700'
                    }`}
                  >
                    {currentAdjustStats.newRemaining.toFixed(1)} Days
                  </span>
                </div>
              </div>

              {/* Form Buttons */}
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-neutral-100">
                <button
                  type="button"
                  onClick={() => setIsAdjustModalOpen(false)}
                  className="px-4 py-2 border border-neutral-300 rounded-lg text-xs font-semibold text-neutral-700 hover:bg-neutral-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  id="btn-save-adjust-balance"
                  disabled={adjustSaving || currentAdjustStats.isNegative}
                  className="flex items-center gap-1.5 px-4 py-2 bg-red-700 hover:bg-red-800 disabled:opacity-50 text-white rounded-lg text-xs font-bold shadow-xs cursor-pointer transition-colors"
                >
                  {adjustSaving ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Save Balance Adjustment</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Leave Balance Modal (SUPER_ADMIN) */}
      {confirmDeleteBal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
          <div className="bg-white rounded-xl max-w-sm w-full p-6 shadow-xl border border-neutral-200 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-neutral-900">Delete Leave Balance Record</h3>
                <p className="text-xs text-neutral-500 mt-0.5">
                  Are you sure you want to delete {confirmDeleteBal.leaveTypeName || confirmDeleteBal.leaveTypeCode} balance for year {confirmDeleteBal.year}?
                </p>
              </div>
            </div>

            {deleteBalError && (
              <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs">
                <p className="font-semibold">{deleteBalError}</p>
                <p className="mt-1 text-[11px] text-rose-700">
                  As SUPER_ADMIN, you can force delete this balance record. All related leave requests and transactions will be safely removed.
                </p>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setConfirmDeleteBal(null);
                  setDeleteBalError(null);
                }}
                disabled={deletingBal}
                className="px-3 py-1.5 border border-neutral-200 text-neutral-700 text-xs rounded-lg hover:bg-neutral-50 font-medium cursor-pointer"
              >
                Cancel
              </button>
              {deleteBalError ? (
                <button
                  type="button"
                  id="btn-force-delete-balance"
                  onClick={() => handleDeleteBalance(true)}
                  disabled={deletingBal}
                  className="px-3.5 py-1.5 bg-rose-700 text-white text-xs rounded-lg hover:bg-rose-800 font-semibold cursor-pointer"
                >
                  {deletingBal ? 'Deleting...' : 'Force Delete Balance'}
                </button>
              ) : (
                <button
                  type="button"
                  id="btn-confirm-delete-balance"
                  onClick={() => handleDeleteBalance(false)}
                  disabled={deletingBal}
                  className="px-3.5 py-1.5 bg-rose-600 text-white text-xs rounded-lg hover:bg-rose-700 font-medium cursor-pointer"
                >
                  {deletingBal ? 'Deleting...' : 'Confirm Delete'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Delete Transaction Modal (SUPER_ADMIN) */}
      {confirmDeleteTx && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
          <div className="bg-white rounded-xl max-w-sm w-full p-6 shadow-xl border border-neutral-200 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-neutral-900">Delete Transaction Record</h3>
                <p className="text-xs text-neutral-500 mt-0.5">
                  Are you sure you want to permanently delete transaction #{confirmDeleteTx.id} ({confirmDeleteTx.transactionType}: {confirmDeleteTx.quantity || confirmDeleteTx.amount} Days)?
                </p>
              </div>
            </div>

            {deleteTxError && (
              <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs">
                {deleteTxError}
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setConfirmDeleteTx(null);
                  setDeleteTxError(null);
                }}
                disabled={deletingTx}
                className="px-3 py-1.5 border border-neutral-200 text-neutral-700 text-xs rounded-lg hover:bg-neutral-50 font-medium cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                id="btn-confirm-delete-tx"
                onClick={handleDeleteTransaction}
                disabled={deletingTx}
                className="px-3.5 py-1.5 bg-rose-600 text-white text-xs rounded-lg hover:bg-rose-700 font-medium cursor-pointer"
              >
                {deletingTx ? 'Deleting...' : 'Confirm Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
