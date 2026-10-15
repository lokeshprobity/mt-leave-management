import { useState } from 'react';
import { CalendarDays, LayoutDashboard, X } from 'lucide-react';
import { Dashboard } from '../Dashboard.tsx';
import { MyLeavePortal } from '../MyLeavePortal.tsx';

interface EmployeeDashboardAccessProps {
  employeeId: number;
  employeeName: string;
  employeeCode?: string;
  onClose: () => void;
}

/**
 * Super Admin's scoped employee view. The signed-in Super Admin session is
 * preserved; target employee access is passed explicitly to authorized APIs.
 */
export function EmployeeDashboardAccess({
  employeeId,
  employeeName,
  employeeCode,
  onClose,
}: EmployeeDashboardAccessProps) {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'leave'>('dashboard');

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
              <p className="text-[11px] text-neutral-500">{employeeCode ? `Employee Code: ${employeeCode} • ` : ''}Viewing the employee dashboard without changing your login</p>
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

        <nav className="shrink-0 bg-white border-b border-neutral-200 px-4 sm:px-6 flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('dashboard')}
            className={`inline-flex items-center gap-2 px-3 py-3 text-xs font-semibold border-b-2 cursor-pointer ${activeTab === 'dashboard' ? 'border-red-700 text-red-700' : 'border-transparent text-neutral-500 hover:text-neutral-900'}`}
          >
            <LayoutDashboard className="w-4 h-4" /> Employee Dashboard
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('leave')}
            className={`inline-flex items-center gap-2 px-3 py-3 text-xs font-semibold border-b-2 cursor-pointer ${activeTab === 'leave' ? 'border-red-700 text-red-700' : 'border-transparent text-neutral-500 hover:text-neutral-900'}`}
          >
            <CalendarDays className="w-4 h-4" /> Process Leave
          </button>
        </nav>

        <main className="flex-1 overflow-y-auto p-3 sm:p-6">
          {activeTab === 'dashboard' ? (
            <Dashboard
              key={`employee-view-dashboard-${employeeId}`}
              employeeId={employeeId}
              employeeName={employeeName}
              viewAsEmployee
              onNavigate={(module) => {
                if (module === 'my-leave') setActiveTab('leave');
              }}
            />
          ) : (
            <div className="space-y-4">
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
                <p className="text-xs font-semibold text-amber-900">Processing leave for {employeeName}</p>
                <p className="text-[11px] text-amber-800 mt-1">Requests are submitted against this employee's record. Your Super Admin login and permissions remain unchanged.</p>
              </div>
              <MyLeavePortal
                key={`employee-view-leave-${employeeId}`}
                targetEmployeeId={employeeId}
                targetEmployeeName={employeeName}
              />
            </div>
          )}
        </main>
      </section>
    </div>
  );
}
