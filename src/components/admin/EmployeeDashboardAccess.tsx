import { useState } from 'react';
import {
  CalendarDays,
  LayoutDashboard,
  UserRound,
  Wallet,
  Clock,
  X,
} from 'lucide-react';
import { Dashboard } from '../Dashboard.tsx';
import { MyLeavePortal } from '../MyLeavePortal.tsx';
import { MyLeaveBalance } from '../MyLeaveBalance.tsx';
import { MySchedule } from '../MySchedule.tsx';
import { MyProfile } from '../MyProfile.tsx';

interface EmployeeDashboardAccessProps {
  employeeId: number;
  employeeName: string;
  employeeCode?: string;
  onClose: () => void;
}

type EmployeeViewTab = 'dashboard' | 'leave' | 'balance' | 'schedule' | 'profile';

/**
 * Super Admin's scoped employee self-service view.
 * The signed-in Super Admin session is preserved; target employee identity is
 * passed to existing modules explicitly rather than switching the login role.
 */
export function EmployeeDashboardAccess({
  employeeId,
  employeeName,
  employeeCode,
  onClose,
}: EmployeeDashboardAccessProps) {
  const [activeTab, setActiveTab] = useState<EmployeeViewTab>('dashboard');

  const tabs: { id: EmployeeViewTab; label: string; icon: typeof LayoutDashboard }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'leave', label: 'My Leave', icon: CalendarDays },
    { id: 'balance', label: 'Leave Balance', icon: Wallet },
    { id: 'schedule', label: 'My Schedule', icon: Clock },
    { id: 'profile', label: 'My Profile', icon: UserRound },
  ];

  const openModule = (module: string) => {
    if (module === 'my-leave') setActiveTab('leave');
    else if (module === 'leave-balance') setActiveTab('balance');
    else if (module === 'my-schedule') setActiveTab('schedule');
    else if (module === 'my-profile') setActiveTab('profile');
    else if (module === 'dashboard' || module === 'welcome') setActiveTab('dashboard');
  };

  return (
    <div className="fixed inset-0 z-[100] bg-neutral-950/60 backdrop-blur-[2px] p-0 sm:p-5 flex items-stretch sm:items-center justify-center">
      <section
        role="dialog"
        aria-modal="true"
        aria-label={`Employee dashboard for ${employeeName}`}
        className="w-full max-w-7xl h-full sm:h-[94vh] bg-neutral-50 sm:rounded-2xl shadow-2xl border border-neutral-200 overflow-hidden flex flex-col"
      >
        <header className="shrink-0 bg-white border-b border-neutral-200 px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-red-50 text-red-700 flex items-center justify-center shrink-0">
              <LayoutDashboard className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-[0.14em] font-bold text-red-700">Super Admin • Employee View</p>
              <h2 className="text-sm sm:text-base font-bold text-neutral-900 truncate">{employeeName}</h2>
              <p className="text-[11px] text-neutral-500">{employeeCode ? `Employee Code: ${employeeCode} • ` : ''}Employee self-service view • Super Admin session preserved</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-2 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-xs font-semibold text-neutral-700 hover:bg-neutral-100 cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
            <span className="hidden sm:inline">Close View</span>
          </button>
        </header>

        <nav aria-label="Employee self-service navigation" className="shrink-0 bg-white border-b border-neutral-200 px-2 sm:px-6 flex items-center gap-1 overflow-x-auto">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              aria-current={activeTab === id ? 'page' : undefined}
              onClick={() => setActiveTab(id)}
              className={`inline-flex items-center gap-2 px-3 py-3 text-xs font-semibold border-b-2 whitespace-nowrap cursor-pointer ${activeTab === id ? 'border-red-700 text-red-700' : 'border-transparent text-neutral-500 hover:text-neutral-900'}`}
            >
              <Icon className="w-4 h-4" /> {label}
            </button>
          ))}
        </nav>

        <main className="flex-1 overflow-y-auto p-3 sm:p-6">
          {activeTab === 'dashboard' && (
            <Dashboard
              key={`employee-view-dashboard-${employeeId}`}
              employeeId={employeeId}
              employeeName={employeeName}
              viewAsEmployee
              onNavigate={openModule}
            />
          )}
          {activeTab === 'leave' && (
            <div className="space-y-4">
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
                <p className="text-xs font-semibold text-amber-900">My Leave — {employeeName}</p>
                <p className="text-[11px] text-amber-800 mt-1">Applications and actions are scoped to this employee. Your Super Admin login remains unchanged.</p>
              </div>
              <MyLeavePortal
                key={`employee-view-leave-${employeeId}`}
                targetEmployeeId={employeeId}
                targetEmployeeName={employeeName}
              />
            </div>
          )}
          {activeTab === 'balance' && (
            <MyLeaveBalance
              key={`employee-view-balance-${employeeId}`}
              targetEmployeeId={employeeId}
              viewAsEmployee
            />
          )}
          {activeTab === 'schedule' && (
            <MySchedule key={`employee-view-schedule-${employeeId}`} targetEmployeeId={employeeId} />
          )}
          {activeTab === 'profile' && (
            <MyProfile
              key={`employee-view-profile-${employeeId}`}
              currentEmployeeId={employeeId}
              targetEmployeeId={employeeId}
              viewAsEmployee
            />
          )}
        </main>
      </section>
    </div>
  );
}
