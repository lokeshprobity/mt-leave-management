import React, { useState, useEffect } from 'react';
import {
  Building,
  Plus,
  Edit2,
  Trash2,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Power,
  X,
  Search,
  Users,
  Calendar,
  Clock,
  ShieldCheck,
  History,
  ArrowRight,
  Repeat,
} from 'lucide-react';
import {
  DepartmentDto,
  EmployeeDto,
  TeamLeaderAssignmentDto,
  TeamLeaderAssignmentType,
  TeamRotationSummaryDto,
} from '../../types/leave.ts';
import { getActiveRole, apiFetch } from '../../lib/api.ts';
import { formatDate } from '../../utils/dateFormat.ts';
import { Employee360Link } from '../Employee360Trigger.tsx';

export function DepartmentAdmin() {
  const [departments, setDepartments] = useState<DepartmentDto[]>([]);
  const [rotationSummaries, setRotationSummaries] = useState<TeamRotationSummaryDto[]>([]);
  const [eligibleLeaders, setEligibleLeaders] = useState<EmployeeDto[]>([]);
  const [referenceDate, setReferenceDate] = useState<string>(
    new Date().toISOString().slice(0, 10)
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  // Department Master Modals
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingDept, setEditingDept] = useState<DepartmentDto | null>(null);
  const [confirmDeleteDept, setConfirmDeleteDept] = useState<DepartmentDto | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    code: '',
    description: '',
    isActive: true,
  });

  // 15-Day Rotation Rule Modal
  const [isRotationModalOpen, setIsRotationModalOpen] = useState(false);
  const [rotationForm, setRotationForm] = useState<{
    teamId: number | string;
    firstHalfLeaderEmployeeId: number | string;
    secondHalfLeaderEmployeeId: number | string;
    effectiveFrom: string;
    effectiveTo: string;
    remarks: string;
  }>({
    teamId: '',
    firstHalfLeaderEmployeeId: '',
    secondHalfLeaderEmployeeId: '',
    effectiveFrom: '2026-01-01',
    effectiveTo: '',
    remarks: '15-day Team Leader rotation (01–15 / 16–Month End)',
  });
  const [savingRotation, setSavingRotation] = useState(false);

  // Date-Effective Assignment / Override Modal
  const [isAssignmentModalOpen, setIsAssignmentModalOpen] = useState(false);
  const [editingAssignment, setEditingAssignment] = useState<TeamLeaderAssignmentDto | null>(null);
  const [assignmentForm, setAssignmentForm] = useState<{
    teamId: number | string;
    teamLeaderEmployeeId: number | string;
    effectiveFrom: string;
    effectiveTo: string;
    assignmentType: TeamLeaderAssignmentType;
    reason: string;
  }>({
    teamId: '',
    teamLeaderEmployeeId: '',
    effectiveFrom: new Date().toISOString().slice(0, 10),
    effectiveTo: new Date().toISOString().slice(0, 10),
    assignmentType: 'STANDARD',
    reason: '',
  });
  const [savingAssignment, setSavingAssignment] = useState(false);

  // Team History Filter
  const [selectedHistoryTeamId, setSelectedHistoryTeamId] = useState<number | 'ALL'>('ALL');

  const activeRole = getActiveRole();
  const canManage = activeRole === 'SUPER_ADMIN' || activeRole === 'HR';

  const getArTeam = () =>
    departments.find(
      (d) =>
        /AR_TNSPRT_USA|AR_TRANS/i.test(d.code || '') ||
        /A\s*R\s*Transport/i.test(d.name || '')
    );

  const getPreferredLeader = (leaderName: 'anil' | 'akash') =>
    eligibleLeaders.find(
      (employee) =>
        (leaderName === 'anil' && /MT021/i.test(employee.employeeCode || '')) ||
        (leaderName === 'akash' && /MT022/i.test(employee.employeeCode || '')) ||
        new RegExp(leaderName, 'i').test(employee.employeeName || '')
    );

  const getDefaultRotationTeamId = () =>
    getArTeam()?.id || departments.find((d) => d.isActive)?.id || '';

  const loadData = async (refDateOverride?: string) => {
    setLoading(true);
    setError(null);
    const targetRef = refDateOverride || referenceDate;
    try {
      const [deptRes, rotRes] = await Promise.all([
        apiFetch('/api/departments?includeInactive=true'),
        apiFetch(
          `/api/team-leader-rotation/summaries?referenceDate=${encodeURIComponent(targetRef)}`
        ),
      ]);
      const deptData = await deptRes.json();
      if (!deptRes.ok) throw new Error(deptData.error || 'Failed to load departments');
      setDepartments(deptData.departments || []);

      if (rotRes.ok) {
        const rotData = await rotRes.json();
        setRotationSummaries(rotData.summaries || []);
        setEligibleLeaders(rotData.eligibleTeamLeaders || []);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const openAdd = () => {
    setEditingDept(null);
    setFormData({ name: '', code: '', description: '', isActive: true });
    setIsModalOpen(true);
  };

  const openEdit = (d: DepartmentDto) => {
    setEditingDept(d);
    setFormData({
      name: d.name,
      code: d.code,
      description: d.description || '',
      isActive: d.isActive,
    });
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    try {
      const url = editingDept ? `/api/departments/${editingDept.id}` : '/api/departments';
      const method = editingDept ? 'PUT' : 'POST';

      const res = await apiFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save department');

      setSuccessMsg(
        editingDept
          ? `Department '${data.department.name}' updated successfully.`
          : `Department '${data.department.name}' created successfully.`
      );
      setIsModalOpen(false);
      loadData();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleToggleStatus = async (d: DepartmentDto) => {
    setError(null);
    setSuccessMsg(null);
    const newStatus = !d.isActive;

    try {
      const res = await apiFetch(`/api/departments/${d.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: newStatus }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update department status');

      setSuccessMsg(`Department '${d.name}' marked ${newStatus ? 'Active' : 'Inactive'}.`);
      loadData();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleDelete = async (d: DepartmentDto) => {
    if (activeRole !== 'SUPER_ADMIN') return;
    setError(null);
    setSuccessMsg(null);
    setDeleting(true);

    try {
      const res = await apiFetch(`/api/departments/${d.id}`, {
        method: 'DELETE',
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete department');

      setSuccessMsg(data.message || `Department '${d.name}' deleted successfully.`);
      setConfirmDeleteDept(null);
      loadData();
    } catch (err: any) {
      setError(err.message);
      setConfirmDeleteDept(null);
    } finally {
      setDeleting(false);
    }
  };

  // Rotation Rule Handlers
  const openConfigureRotation = (summary?: TeamRotationSummaryDto) => {
    const defaultTeamId = summary?.teamId || getDefaultRotationTeamId();
    const rule = summary?.activeRotationRule;
    const firstLeader =
      rule?.firstHalfLeaderEmployeeId ||
      getPreferredLeader('anil')?.id ||
      eligibleLeaders[0]?.id ||
      '';
    const secondLeader =
      rule?.secondHalfLeaderEmployeeId ||
      getPreferredLeader('akash')?.id ||
      eligibleLeaders[1]?.id ||
      eligibleLeaders[0]?.id ||
      '';

    setRotationForm({
      teamId: defaultTeamId,
      firstHalfLeaderEmployeeId: firstLeader,
      secondHalfLeaderEmployeeId: secondLeader,
      effectiveFrom: rule?.effectiveFrom || '2026-01-01',
      effectiveTo: rule?.effectiveTo || '',
      remarks:
        rule?.remarks ||
        '15-day Team Leader rotation: Day 1–15 First Half, Day 16–Month End Second Half',
    });
    setIsRotationModalOpen(true);
  };

  const handleSaveRotationRule = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    setSavingRotation(true);
    try {
      const res = await apiFetch('/api/team-leader-rotation/rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          teamId: isNaN(Number(rotationForm.teamId)) ? rotationForm.teamId : Number(rotationForm.teamId),
          rotationType: 'FIRST_HALF_SECOND_HALF',
          firstHalfLeaderEmployeeId: isNaN(Number(rotationForm.firstHalfLeaderEmployeeId))
            ? rotationForm.firstHalfLeaderEmployeeId
            : Number(rotationForm.firstHalfLeaderEmployeeId),
          secondHalfLeaderEmployeeId: isNaN(Number(rotationForm.secondHalfLeaderEmployeeId))
            ? rotationForm.secondHalfLeaderEmployeeId
            : Number(rotationForm.secondHalfLeaderEmployeeId),
          effectiveFrom: rotationForm.effectiveFrom,
          effectiveTo: rotationForm.effectiveTo.trim() || null,
          remarks: rotationForm.remarks.trim() || null,
          replaceExistingActive: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to configure 15-day rotation rule');

      setSuccessMsg(
        `15-day Team Leader rotation configured for '${data.rule.teamName}': Day 1–15 → ${data.rule.firstHalfLeaderName}, Day 16–Month End → ${data.rule.secondHalfLeaderName}.`
      );
      setIsRotationModalOpen(false);
      loadData();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSavingRotation(false);
    }
  };

  // Date-Effective Assignment Handlers
  const openAddAssignment = (teamId?: number) => {
    setEditingAssignment(null);
    setAssignmentForm({
      teamId: teamId || getDefaultRotationTeamId(),
      teamLeaderEmployeeId:
        getPreferredLeader('anil')?.id || eligibleLeaders[0]?.id || '',
      effectiveFrom: referenceDate,
      effectiveTo: referenceDate,
      assignmentType: 'STANDARD',
      reason: '',
    });
    setIsAssignmentModalOpen(true);
  };

  const openEditAssignment = (assign: TeamLeaderAssignmentDto) => {
    setEditingAssignment(assign);
    setAssignmentForm({
      teamId: assign.teamId,
      teamLeaderEmployeeId: assign.teamLeaderEmployeeId,
      effectiveFrom: assign.effectiveFrom,
      effectiveTo: assign.effectiveTo,
      assignmentType: assign.assignmentType,
      reason: assign.reason || assign.remarks || '',
    });
    setIsAssignmentModalOpen(true);
  };

  const handleSaveAssignment = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    setSavingAssignment(true);
    try {
      const url = editingAssignment
        ? `/api/team-leader-rotation/assignments/${editingAssignment.id}`
        : '/api/team-leader-rotation/assignments';
      const method = editingAssignment ? 'PUT' : 'POST';

      const res = await apiFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          teamId: isNaN(Number(assignmentForm.teamId)) ? assignmentForm.teamId : Number(assignmentForm.teamId),
          teamLeaderEmployeeId: isNaN(Number(assignmentForm.teamLeaderEmployeeId))
            ? assignmentForm.teamLeaderEmployeeId
            : Number(assignmentForm.teamLeaderEmployeeId),
          effectiveFrom: assignmentForm.effectiveFrom,
          effectiveTo: assignmentForm.effectiveTo,
          assignmentType: assignmentForm.assignmentType,
          reason: assignmentForm.reason.trim() || null,
          remarks: assignmentForm.reason.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save Team Leader assignment');

      setSuccessMsg(
        editingAssignment
          ? `Team Leader assignment #${data.assignment.id} updated.`
          : `Team Leader '${data.assignment.teamLeaderName}' assigned to '${data.assignment.teamName}' (${formatDate(data.assignment.effectiveFrom)} to ${formatDate(data.assignment.effectiveTo)}).`
      );
      setIsAssignmentModalOpen(false);
      loadData();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSavingAssignment(false);
    }
  };

  const handleDeactivateAssignment = async (assign: TeamLeaderAssignmentDto) => {
    setError(null);
    setSuccessMsg(null);
    try {
      const res = await apiFetch(
        `/api/team-leader-rotation/assignments/${assign.id}/deactivate`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            reason: 'Deactivated via Team Leader Rotation Admin UI',
          }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to deactivate assignment');
      setSuccessMsg(
        `Assignment for ${assign.teamLeaderName} (${formatDate(assign.effectiveFrom)} to ${formatDate(assign.effectiveTo)}) marked Inactive (preserved in history).`
      );
      loadData();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const filtered = departments.filter((d) => {
    const q = search.toLowerCase();
    return (
      d.name.toLowerCase().includes(q) ||
      d.code.toLowerCase().includes(q) ||
      (d.description && d.description.toLowerCase().includes(q))
    );
  });

  const allAssignments = rotationSummaries
    .flatMap((s) => [...(s.activeAssignments || []), ...(s.historicalAssignments || [])])
    .filter((a) => selectedHistoryTeamId === 'ALL' || a.teamId === selectedHistoryTeamId)
    .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom) || b.id - a.id);

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="rounded-xl border border-teal-300 border-t-[5px] border-t-teal-600 bg-teal-50/75 p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-slate-900 font-bold text-base">
            <Building className="w-5 h-5 text-teal-700" />
            <span>Department Master &amp; Team Leader Rotation</span>
          </div>
          <p className="text-xs text-slate-600 mt-0.5">
            Manage organizational divisions, 15-day Team Leader rotations (Day 1–15 / Day 16–Month End), and date-effective Team Leader assignments.
          </p>
        </div>

        {canManage && (
          <div className="flex items-center gap-2 flex-wrap">
            <button
              id="btn-configure-rotation"
              onClick={() => openConfigureRotation()}
              className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 bg-white border border-neutral-300 text-neutral-800 rounded-lg text-xs font-semibold hover:bg-neutral-50 transition-colors shadow-2xs cursor-pointer whitespace-nowrap"
            >
              <Repeat className="w-3.5 h-3.5 text-neutral-700" />
              <span>Configure 15-Day Rotation</span>
            </button>
            <button
              id="btn-add-tl-assignment"
              onClick={() => openAddAssignment()}
              className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 bg-white border border-neutral-300 text-neutral-800 rounded-lg text-xs font-semibold hover:bg-neutral-50 transition-colors shadow-2xs cursor-pointer whitespace-nowrap"
            >
              <Calendar className="w-3.5 h-3.5 text-neutral-700" />
              <span>Assign / Override Team Leader</span>
            </button>
            <button
              id="btn-add-department"
              onClick={openAdd}
              className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-red-700 text-white rounded-lg text-xs font-semibold hover:bg-red-800 transition-colors shadow-xs cursor-pointer whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              <span>Add Department</span>
            </button>
          </div>
        )}
      </div>

      {error && (
        <div className="p-4 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2.5">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <div className="flex-1 font-medium">{error}</div>
        </div>
      )}

      {successMsg && (
        <div className="p-4 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-start gap-2.5">
          <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
          <div className="flex-1 font-medium">{successMsg}</div>
        </div>
      )}

      {/* ============================================================
          SECTION 1: TEAM LEADER 15-DAY ROTATION & CURRENT/UPCOMING VIEW
         ============================================================ */}
      <div className="rounded-xl border border-sky-300 border-t-[5px] border-t-sky-600 bg-sky-50/60 p-5 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-sky-200 pb-3.5">
          <div>
            <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
              <Users className="w-4 h-4 text-sky-700" />
              <span>Date-Effective Team Leader Resolution &amp; 15-Day Rotation Status</span>
            </div>
            <p className="text-xs text-slate-600 mt-0.5">
              Leave applications automatically route to the Team Leader active on the leave start date.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-neutral-600 whitespace-nowrap">
              Preview Date:
            </label>
            <input
              id="input-rotation-reference-date"
              type="date"
              value={referenceDate}
              onChange={(e) => {
                setReferenceDate(e.target.value);
                if (e.target.value) {
                  loadData(e.target.value);
                }
              }}
              className="px-2.5 py-1.5 text-xs bg-neutral-50 border border-neutral-200 rounded-lg font-mono text-neutral-800"
            />
          </div>
        </div>

        {/* Team Cards Showing Current & Upcoming Team Leader */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {rotationSummaries
            .filter(
              (s) =>
                s.activeRotationRule ||
                (s.activeAssignments && s.activeAssignments.length > 0) ||
                s.currentTeamLeader ||
                s.teamName === 'Import Team'
            )
            .map((summary) => (
              <div
                key={summary.teamId}
                id={`team-rotation-card-${summary.teamId}`}
                className="rounded-xl border border-teal-300 border-t-[5px] border-t-teal-600 bg-teal-50/80 p-4 space-y-3 flex flex-col justify-between shadow-2xs"
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <span className="text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded bg-neutral-200/80 text-neutral-800">
                        {summary.teamCode}
                      </span>
                      <h4 className="text-sm font-semibold text-neutral-900 mt-1">
                        Team: {summary.teamName}
                      </h4>
                    </div>
                    {summary.activeRotationRule ? (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-sky-50 text-sky-700 border border-sky-200">
                        15-Day Rotation
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-neutral-100 text-neutral-600 border border-neutral-200">
                        Date Assignment
                      </span>
                    )}
                  </div>

                  {/* Current & Upcoming Team Leader Display */}
                  <div className="grid grid-cols-2 gap-2.5">
                    <div className="p-2.5 rounded-lg bg-white border border-emerald-200/90 shadow-2xs">
                      <div className="text-[10px] font-semibold uppercase tracking-wider text-emerald-700 flex items-center gap-1">
                        <ShieldCheck className="w-3 h-3" />
                        <span>Current Team Leader</span>
                      </div>
                      {summary.currentTeamLeader ? (
                        <>
                          <div className="text-xs font-bold text-neutral-900 mt-1">
                            <Employee360Link
                              employeeId={summary.currentTeamLeader.teamLeaderEmployeeId}
                              employeeCode={summary.currentTeamLeader.teamLeaderEmployeeCode}
                              employeeName={summary.currentTeamLeader.teamLeaderName}
                            >
                              {summary.currentTeamLeader.teamLeaderName}
                            </Employee360Link>
                          </div>
                          <div className="text-[11px] font-medium text-neutral-600 mt-0.5">
                            {summary.currentTeamLeader.periodLabel}
                          </div>
                        </>
                      ) : (
                        <div className="text-xs text-neutral-500 mt-1">Not assigned</div>
                      )}
                    </div>

                    <div className="p-2.5 rounded-lg bg-white border border-neutral-200 shadow-2xs">
                      <div className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        <span>Upcoming Team Leader</span>
                      </div>
                      {summary.upcomingTeamLeader ? (
                        <>
                          <div className="text-xs font-bold text-neutral-900 mt-1">
                            <Employee360Link
                              employeeId={summary.upcomingTeamLeader.teamLeaderEmployeeId}
                              employeeCode={summary.upcomingTeamLeader.teamLeaderEmployeeCode}
                              employeeName={summary.upcomingTeamLeader.teamLeaderName}
                            >
                              {summary.upcomingTeamLeader.teamLeaderName}
                            </Employee360Link>
                          </div>
                          <div className="text-[11px] font-medium text-neutral-600 mt-0.5">
                            {summary.upcomingTeamLeader.periodLabel}
                          </div>
                        </>
                      ) : (
                        <div className="text-xs text-neutral-500 mt-1">Not scheduled</div>
                      )}
                    </div>
                  </div>

                  {summary.activeRotationRule && (
                    <div className="text-[11px] text-neutral-600 bg-white px-3 py-2 rounded-lg border border-neutral-200/80 space-y-0.5">
                      <div className="font-semibold text-neutral-800">
                        Active Rule (FIRST_HALF_SECOND_HALF):
                      </div>
                      <div>
                        Day 1–15:{' '}
                        <Employee360Link
                          employeeId={summary.activeRotationRule.firstHalfLeaderEmployeeId}
                          employeeName={summary.activeRotationRule.firstHalfLeaderName}
                        >
                          {summary.activeRotationRule.firstHalfLeaderName}
                        </Employee360Link>
                      </div>
                      <div>
                        Day 16–Month End:{' '}
                        <Employee360Link
                          employeeId={summary.activeRotationRule.secondHalfLeaderEmployeeId}
                          employeeName={summary.activeRotationRule.secondHalfLeaderName}
                        >
                          {summary.activeRotationRule.secondHalfLeaderName}
                        </Employee360Link>
                      </div>
                    </div>
                  )}
                </div>

                {canManage && (
                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-neutral-200/60">
                    <button
                      type="button"
                      onClick={() => openConfigureRotation(summary)}
                      className="px-2.5 py-1 text-[11px] font-semibold text-neutral-700 bg-white border border-neutral-200 rounded hover:bg-neutral-100 cursor-pointer"
                    >
                      Edit Rotation
                    </button>
                    <button
                      type="button"
                      onClick={() => openAddAssignment(summary.teamId)}
                      className="px-2.5 py-1 text-[11px] font-semibold text-neutral-900 bg-neutral-200/70 rounded hover:bg-neutral-300/70 cursor-pointer"
                    >
                      + Override / Assign
                    </button>
                  </div>
                )}
              </div>
            ))}
        </div>

        {/* Historical & Active Date-Effective Assignments Table */}
        <div className="pt-3 border-t border-neutral-100 space-y-2.5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-neutral-800">
              <History className="w-3.5 h-3.5 text-neutral-600" />
              <span>Date-Effective Team Leader Assignments &amp; Historical Log</span>
            </div>
            <div className="flex items-center gap-2">
              <select
                value={selectedHistoryTeamId}
                onChange={(e) =>
                  setSelectedHistoryTeamId(
                    e.target.value === 'ALL' ? 'ALL' : Number(e.target.value)
                  )
                }
                className="text-xs px-2.5 py-1 rounded-lg border border-neutral-200 bg-neutral-50"
              >
                <option value="ALL">All Teams</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} ({d.code})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="overflow-x-auto border border-neutral-200/80 rounded-lg">
            <table className="w-full text-left text-xs">
              <thead className="bg-neutral-50 text-neutral-500 font-semibold border-b border-neutral-200/80">
                <tr>
                  <th className="py-2.5 px-3">ID</th>
                  <th className="py-2.5 px-3">Team</th>
                  <th className="py-2.5 px-3">Team Leader</th>
                  <th className="py-2.5 px-3">Effective From → To</th>
                  <th className="py-2.5 px-3">Type</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3">Reason / Remarks</th>
                  {canManage && <th className="py-2.5 px-3 text-right">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {allAssignments.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center py-5 text-neutral-500">
                      No explicit date-range assignments or overrides recorded yet. Recurring 15-day rotation rules resolve automatically.
                    </td>
                  </tr>
                ) : (
                  allAssignments.map((a) => (
                    <tr key={a.id} className="hover:bg-neutral-50/80">
                      <td className="py-2.5 px-3 font-mono text-neutral-500">#{a.id}</td>
                      <td className="py-2.5 px-3 font-semibold text-neutral-900">{a.teamName}</td>
                      <td className="py-2.5 px-3 font-semibold text-neutral-800">
                        <div>
                          <Employee360Link
                            employeeId={a.teamLeaderEmployeeId}
                            employeeCode={a.teamLeaderEmployeeCode}
                            employeeName={a.teamLeaderName}
                          >
                            {a.teamLeaderName}
                          </Employee360Link>
                        </div>
                        {a.teamLeaderEmployeeCode && (
                          <div className="mt-0.5">
                            <Employee360Link
                              employeeId={a.teamLeaderEmployeeId}
                              employeeCode={a.teamLeaderEmployeeCode}
                              employeeName={a.teamLeaderName}
                              variant="badge"
                            >
                              {a.teamLeaderEmployeeCode}
                            </Employee360Link>
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-[11px] text-neutral-700">
                        {formatDate(a.effectiveFrom)} <ArrowRight className="w-3 h-3 inline mx-0.5" />{' '}
                        {formatDate(a.effectiveTo)}
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-neutral-100 text-neutral-700 border border-neutral-200">
                          {a.assignmentType}
                        </span>
                      </td>
                      <td className="py-2.5 px-3">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                            a.isActive && a.status === 'ACTIVE'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-neutral-100 text-neutral-500 border border-neutral-200'
                          }`}
                        >
                          {a.status}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-neutral-500 max-w-xs truncate">
                        {a.reason || a.remarks || '—'}
                      </td>
                      {canManage && (
                        <td className="py-2.5 px-3 text-right">
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => openEditAssignment(a)}
                              title="Edit Assignment"
                              className="p-1 text-neutral-500 hover:text-neutral-900 rounded hover:bg-neutral-100 cursor-pointer"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            {a.isActive && (
                              <button
                                type="button"
                                onClick={() => handleDeactivateAssignment(a)}
                                title="Deactivate Assignment (Preserve History)"
                                className="p-1 text-amber-600 hover:text-amber-800 rounded hover:bg-amber-50 cursor-pointer"
                              >
                                <Power className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ============================================================
          SECTION 2: DEPARTMENT MASTER TABLE
         ============================================================ */}
      <div className="bg-white rounded-xl border border-neutral-200/80 p-4 shadow-xs flex items-center justify-between gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="w-4 h-4 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            id="input-search-department"
            type="text"
            placeholder="Search departments..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-neutral-50 border border-neutral-200 rounded-lg focus:outline-none focus:border-red-700"
          />
        </div>

        <button
          onClick={() => loadData()}
          title="Refresh"
          className="p-2 border border-neutral-200 rounded-lg text-neutral-600 hover:text-neutral-900 hover:bg-neutral-50 cursor-pointer"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      <div className="bg-white rounded-xl border border-teal-300 border-t-[5px] border-t-teal-600 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
          <thead className="bg-teal-50/80 text-slate-800 font-bold border-b border-teal-200">
            <tr>
              <th className="py-3 px-4">Code</th>
              <th className="py-3 px-4">Department / Team Name</th>
              <th className="py-3 px-4">Description</th>
              <th className="py-3 px-4">Status</th>
              {canManage && <th className="py-3 px-4 text-right">Actions</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {loading ? (
              <tr>
                <td colSpan={5} className="text-center py-8 text-neutral-500">
                  Loading departments...
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="text-center py-8 text-neutral-500">
                  No departments found.
                </td>
              </tr>
            ) : (
              filtered.map((d) => (
                <tr key={d.id} className="hover:bg-neutral-50/80 transition-colors">
                  <td className="py-3 px-4 font-mono font-bold text-neutral-900">{d.code}</td>
                  <td className="py-3 px-4 font-semibold text-neutral-900">{d.name}</td>
                  <td className="py-3 px-4 text-neutral-500">{d.description || '—'}</td>
                  <td className="py-3 px-4">
                    <span
                      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium ${
                        d.isActive
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : 'bg-neutral-100 text-neutral-600 border border-neutral-200'
                      }`}
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${
                          d.isActive ? 'bg-emerald-500' : 'bg-neutral-400'
                        }`}
                      />
                      {d.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  {canManage && (
                    <td className="py-3 px-4 text-right">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          onClick={() => openEdit(d)}
                          title="Edit Department"
                          className="p-1 text-neutral-500 hover:text-neutral-800 rounded hover:bg-neutral-100 cursor-pointer"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleToggleStatus(d)}
                          title={d.isActive ? 'Deactivate' : 'Activate'}
                          className={`p-1 rounded hover:bg-neutral-100 cursor-pointer ${
                            d.isActive
                              ? 'text-amber-600 hover:text-amber-700'
                              : 'text-emerald-600 hover:text-emerald-700'
                          }`}
                        >
                          <Power className="w-3.5 h-3.5" />
                        </button>
                        {activeRole === 'SUPER_ADMIN' && (
                          <button
                          onClick={() => setConfirmDeleteDept(d)}
                          title="Safe Delete Department"
                          className="p-1 text-rose-500 hover:text-rose-700 rounded hover:bg-rose-50 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
        </div>
      </div>

      {/* Department Create/Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl border border-neutral-200">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
              <h3 className="font-semibold text-neutral-900 text-sm flex items-center gap-2">
                <Building className="w-4 h-4 text-neutral-700" />
                <span>{editingDept ? 'Edit Department' : 'Create Department'}</span>
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-neutral-500 hover:text-neutral-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4 mt-4 text-xs">
              <div>
                <label className="block text-neutral-700 font-medium mb-1">
                  Department Name <span className="text-rose-500">*</span>
                </label>
                <input
                  id="input-dept-name"
                  type="text"
                  required
                  placeholder="e.g. Finance & Accounts"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-1.5 border border-neutral-200 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-neutral-700 font-medium mb-1">
                  Department Code <span className="text-rose-500">*</span>
                </label>
                <input
                  id="input-dept-code"
                  type="text"
                  required
                  placeholder="e.g. FIN"
                  value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                  className="w-full px-3 py-1.5 border border-neutral-200 rounded-lg uppercase font-mono"
                />
              </div>

              <div>
                <label className="block text-neutral-700 font-medium mb-1">Description</label>
                <textarea
                  rows={2}
                  placeholder="Brief purpose or scope..."
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-3 py-1.5 border border-neutral-200 rounded-lg"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-neutral-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-3.5 py-1.5 border border-neutral-200 text-neutral-600 rounded-lg hover:bg-neutral-50 cursor-pointer font-medium"
                >
                  Cancel
                </button>
                <button
                  id="btn-submit-department"
                  type="submit"
                  className="px-4 py-1.5 bg-red-700 text-white rounded-lg hover:bg-red-800 cursor-pointer font-medium"
                >
                  {editingDept ? 'Update Department' : 'Create Department'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 15-Day Rotation Rule Modal */}
      {isRotationModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl border border-neutral-200">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
              <h3 className="font-semibold text-neutral-900 text-sm flex items-center gap-2">
                <Repeat className="w-4 h-4 text-neutral-700" />
                <span>Configure 15-Day Team Leader Rotation</span>
              </h3>
              <button
                onClick={() => setIsRotationModalOpen(false)}
                className="text-neutral-500 hover:text-neutral-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveRotationRule} className="space-y-4 mt-4 text-xs">
              <div>
                <label className="block text-neutral-700 font-medium mb-1">
                  Team / Department <span className="text-rose-500">*</span>
                </label>
                <select
                  id="select-rotation-team"
                  value={rotationForm.teamId}
                  onChange={(e) =>
                    setRotationForm({ ...rotationForm, teamId: Number(e.target.value) })
                  }
                  className="w-full px-3 py-2 border border-neutral-200 rounded-lg bg-white"
                >
                  {departments
                    .filter((d) => d.isActive)
                    .map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name} ({d.code})
                      </option>
                    ))}
                </select>
              </div>

              <div className="p-3 rounded-lg bg-neutral-50 border border-neutral-200 space-y-3">
                <div className="font-semibold text-neutral-800">
                  Rotation Type: FIRST_HALF_SECOND_HALF
                </div>
                <div>
                  <label className="block text-neutral-700 font-medium mb-1">
                    First Half (Day 1 – Day 15) Team Leader <span className="text-rose-500">*</span>
                  </label>
                  <select
                    id="select-first-half-leader"
                    value={rotationForm.firstHalfLeaderEmployeeId}
                    onChange={(e) =>
                      setRotationForm({
                        ...rotationForm,
                        firstHalfLeaderEmployeeId: e.target.value,
                      })
                    }
                    className="w-full px-3 py-2 border border-neutral-200 rounded-lg bg-white"
                  >
                    {eligibleLeaders.map((tl) => (
                      <option key={tl.id} value={tl.id}>
                        {tl.employeeCode} — {tl.employeeName} — {tl.departmentName || 'General'}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-neutral-700 font-medium mb-1">
                    Second Half (Day 16 – Month End: 28/29/30/31) Team Leader{' '}
                    <span className="text-rose-500">*</span>
                  </label>
                  <select
                    id="select-second-half-leader"
                    value={rotationForm.secondHalfLeaderEmployeeId}
                    onChange={(e) =>
                      setRotationForm({
                        ...rotationForm,
                        secondHalfLeaderEmployeeId: e.target.value,
                      })
                    }
                    className="w-full px-3 py-2 border border-neutral-200 rounded-lg bg-white"
                  >
                    {eligibleLeaders.map((tl) => (
                      <option key={tl.id} value={tl.id}>
                        {tl.employeeCode} — {tl.employeeName} — {tl.departmentName || 'General'}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-neutral-700 font-medium mb-1">
                    Effective From <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={rotationForm.effectiveFrom}
                    onChange={(e) =>
                      setRotationForm({ ...rotationForm, effectiveFrom: e.target.value })
                    }
                    className="w-full px-3 py-1.5 border border-neutral-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-neutral-700 font-medium mb-1">
                    Effective To (Optional)
                  </label>
                  <input
                    type="date"
                    value={rotationForm.effectiveTo}
                    onChange={(e) =>
                      setRotationForm({ ...rotationForm, effectiveTo: e.target.value })
                    }
                    className="w-full px-3 py-1.5 border border-neutral-200 rounded-lg"
                  />
                </div>
              </div>

              <div>
                <label className="block text-neutral-700 font-medium mb-1">Remarks</label>
                <input
                  type="text"
                  value={rotationForm.remarks}
                  onChange={(e) => setRotationForm({ ...rotationForm, remarks: e.target.value })}
                  className="w-full px-3 py-1.5 border border-neutral-200 rounded-lg"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-neutral-100">
                <button
                  type="button"
                  onClick={() => setIsRotationModalOpen(false)}
                  className="px-3.5 py-1.5 border border-neutral-200 text-neutral-600 rounded-lg hover:bg-neutral-50 cursor-pointer font-medium"
                >
                  Cancel
                </button>
                <button
                  id="btn-save-rotation-rule"
                  type="submit"
                  disabled={savingRotation}
                  className="px-4 py-1.5 bg-red-700 text-white rounded-lg hover:bg-red-800 cursor-pointer font-medium disabled:opacity-50"
                >
                  {savingRotation ? 'Saving...' : 'Save 15-Day Rotation'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Date-Effective Assignment / Override Modal */}
      {isAssignmentModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl border border-neutral-200">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
              <h3 className="font-semibold text-neutral-900 text-sm flex items-center gap-2">
                <Calendar className="w-4 h-4 text-neutral-700" />
                <span>
                  {editingAssignment
                    ? 'Edit Team Leader Assignment'
                    : 'Create Date-Effective Team Leader Assignment'}
                </span>
              </h3>
              <button
                onClick={() => setIsAssignmentModalOpen(false)}
                className="text-neutral-500 hover:text-neutral-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveAssignment} className="space-y-4 mt-4 text-xs">
              <div>
                <label className="block text-neutral-700 font-medium mb-1">
                  Team / Department <span className="text-rose-500">*</span>
                </label>
                <select
                  id="select-assignment-team"
                  disabled={Boolean(editingAssignment)}
                  value={assignmentForm.teamId}
                  onChange={(e) =>
                    setAssignmentForm({ ...assignmentForm, teamId: Number(e.target.value) })
                  }
                  className="w-full px-3 py-2 border border-neutral-200 rounded-lg bg-white disabled:bg-neutral-100"
                >
                  {departments
                    .filter((d) => d.isActive)
                    .map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name} ({d.code})
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label className="block text-neutral-700 font-medium mb-1">
                  Team Leader (Eligible TEAM_LEADER Role) <span className="text-rose-500">*</span>
                </label>
                <select
                  id="select-assignment-leader"
                  value={assignmentForm.teamLeaderEmployeeId}
                  onChange={(e) =>
                    setAssignmentForm({
                      ...assignmentForm,
                      teamLeaderEmployeeId: e.target.value,
                    })
                  }
                  className="w-full px-3 py-2 border border-neutral-200 rounded-lg bg-white"
                >
                  {eligibleLeaders.map((tl) => (
                    <option key={tl.id} value={tl.id}>
                      {tl.employeeCode} — {tl.employeeName} — {tl.departmentName || 'General'}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-neutral-700 font-medium mb-1">
                  Assignment Mode <span className="text-rose-500">*</span>
                </label>
                <select
                  id="select-assignment-type"
                  value={assignmentForm.assignmentType}
                  onChange={(e) =>
                    setAssignmentForm({
                      ...assignmentForm,
                      assignmentType: e.target.value as TeamLeaderAssignmentType,
                    })
                  }
                  className="w-full px-3 py-2 border border-neutral-200 rounded-lg bg-white"
                >
                  <option value="STANDARD">Standard Date-Range Assignment</option>
                  <option value="OVERRIDE">One-Time Exception / Override</option>
                  <option value="TEMPORARY_REPLACEMENT">
                    Temporary Replacement (Team Leader on Leave)
                  </option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-neutral-700 font-medium mb-1">
                    Effective From <span className="text-rose-500">*</span>
                  </label>
                  <input
                    id="input-assignment-from"
                    type="date"
                    required
                    value={assignmentForm.effectiveFrom}
                    onChange={(e) =>
                      setAssignmentForm({ ...assignmentForm, effectiveFrom: e.target.value })
                    }
                    className="w-full px-3 py-1.5 border border-neutral-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-neutral-700 font-medium mb-1">
                    Effective To <span className="text-rose-500">*</span>
                  </label>
                  <input
                    id="input-assignment-to"
                    type="date"
                    required
                    value={assignmentForm.effectiveTo}
                    onChange={(e) =>
                      setAssignmentForm({ ...assignmentForm, effectiveTo: e.target.value })
                    }
                    className="w-full px-3 py-1.5 border border-neutral-200 rounded-lg"
                  />
                </div>
              </div>

              <div>
                <label className="block text-neutral-700 font-medium mb-1">
                  Reason / Audit Context
                </label>
                <input
                  id="input-assignment-reason"
                  type="text"
                  placeholder="e.g. Temporary replacement while ANIL is on leave"
                  value={assignmentForm.reason}
                  onChange={(e) =>
                    setAssignmentForm({ ...assignmentForm, reason: e.target.value })
                  }
                  className="w-full px-3 py-1.5 border border-neutral-200 rounded-lg"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-neutral-100">
                <button
                  type="button"
                  onClick={() => setIsAssignmentModalOpen(false)}
                  className="px-3.5 py-1.5 border border-neutral-200 text-neutral-600 rounded-lg hover:bg-neutral-50 cursor-pointer font-medium"
                >
                  Cancel
                </button>
                <button
                  id="btn-save-tl-assignment"
                  type="submit"
                  disabled={savingAssignment}
                  className="px-4 py-1.5 bg-red-700 text-white rounded-lg hover:bg-red-800 cursor-pointer font-medium disabled:opacity-50"
                >
                  {savingAssignment
                    ? 'Saving...'
                    : editingAssignment
                      ? 'Update Assignment'
                      : 'Create Assignment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {activeRole === 'SUPER_ADMIN' && confirmDeleteDept && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl max-w-sm w-full p-6 shadow-xl border border-neutral-200 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-neutral-900">Delete Department</h3>
                <p className="text-xs text-neutral-500 mt-0.5">
                  Are you sure you want to delete{' '}
                  <span className="font-semibold text-neutral-800">
                    '{confirmDeleteDept.name}' ({confirmDeleteDept.code})
                  </span>
                  ?
                </p>
              </div>
            </div>
            <p className="text-xs text-neutral-600 bg-neutral-50 p-2.5 rounded-lg border border-neutral-200">
              Department deletion is dependency-safe. If employees or rosters reference this department, deletion will be blocked safely.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setConfirmDeleteDept(null)}
                disabled={deleting}
                className="px-3 py-1.5 border border-neutral-200 text-neutral-700 text-xs rounded-lg hover:bg-neutral-50 cursor-pointer font-medium"
              >
                Cancel
              </button>
              <button
                type="button"
                id="btn-confirm-delete-dept"
                onClick={() => handleDelete(confirmDeleteDept)}
                disabled={deleting}
                className="px-3.5 py-1.5 bg-rose-600 text-white text-xs rounded-lg hover:bg-rose-700 cursor-pointer font-medium flex items-center gap-1.5"
              >
                {deleting ? 'Deleting...' : 'Confirm Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
