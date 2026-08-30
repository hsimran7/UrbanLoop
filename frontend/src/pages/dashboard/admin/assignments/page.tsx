import React, { useState, useEffect, useCallback } from 'react';
import { apiRequest } from '../../../../utils/api';
import { CascadingLocationFilter } from '../../../../components/ui/CascadingLocationFilter';
import { getSocket } from '../../../../utils/socket';

/* ─────────────────────────── types ─────────────────────────── */
interface Team {
  id: string;
  name: string;
}

interface ServiceZone {
  id: string;
  name: string;
  areaId: string;
  area?: { name: string };
}

interface Responsibility {
  id: string;
  teamId: string;
  serviceZoneId: string;
  wasteTypes: string[];
  effectiveFrom: string;
  effectiveUntil: string | null;
  team?: { name: string };
  serviceZone?: { name: string; area?: { name: string } };
}

interface AssignmentTarget {
  id: string;
  collectionPointId: string;
  eligibleBinCount: number;
  collectionPoint?: { address: string };
}

interface DailyAssignment {
  id: string;
  assignmentDate: string;
  wasteType: string;
  status: string;
  generationSource: string;
  team?: { name: string };
  primaryWorker?: { user?: { name: string } };
  driver?: { user?: { name: string } };
  serviceZone?: { name: string };
  shift?: { name: string; startTime: string; endTime: string };
  targets?: AssignmentTarget[];
  _count?: { targets: number };
}

interface GenerationResult {
  generated: number;
  skipped: number;
  coverageWarnings: string[];
  assignments: DailyAssignment[];
}

const STATUS_STYLES: Record<string, string> = {
  CREATED:     'bg-slate-50 text-slate-700 border-slate-200',
  ASSIGNED:    'bg-amber-50 text-amber-700 border-amber-200',
  ACCEPTED:    'bg-teal-50 text-teal-700 border-teal-200',
  STARTED:     'bg-blue-50 text-blue-700 border-blue-200',
  IN_PROGRESS: 'bg-blue-50 text-blue-700 border-blue-200',
  PAUSED:      'bg-orange-50 text-orange-700 border-orange-200',
  COMPLETED:   'bg-emerald-50 text-emerald-700 border-emerald-200',
  MISSED:      'bg-red-50 text-red-700 border-red-200',
  CANCELLED:   'bg-red-50 text-red-700 border-red-200',
};

const WASTE_COLORS: Record<string, string> = {
  DRY:    'bg-amber-50 text-amber-700 border-amber-200',
  WET:    'bg-emerald-50 text-emerald-700 border-emerald-200',
  E_WASTE:'bg-purple-50 text-purple-700 border-purple-200',
  OTHER:  'bg-slate-50 text-slate-700 border-slate-200',
};

function formatTime12h(timeStr: string) {
  if (!timeStr) return '';
  const parts = timeStr.split(':');
  if (parts.length < 2) return timeStr;
  const hour = parseInt(parts[0], 10);
  const min = parts[1];
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 || 12;
  const padHour = displayHour.toString().padStart(2, '0');
  return `${padHour}:${min} ${ampm}`;
}

/* ─────────────────────────── component ─────────────────────────── */
export default function AssignmentsManagementPage() {
  const [activeTab, setActiveTab] = useState<'generate' | 'manual_planner' | 'assignments' | 'responsibilities'>('generate');

  // Generate tab
  const [genDate, setGenDate] = useState(new Date().toISOString().split('T')[0]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [genResult, setGenResult] = useState<GenerationResult | null>(null);

  // Manual Planner form state
  const [plannerShifts, setPlannerShifts] = useState<any[]>([]);
  const [plannerVehicles, setPlannerVehicles] = useState<any[]>([]);
  const [plannerWorkers, setPlannerWorkers] = useState<any[]>([]);
  
  const [manualDate, setManualDate] = useState(new Date().toISOString().split('T')[0]);
  const [manualWorkerId, setManualWorkerId] = useState('');
  const [manualPartnerId, setManualPartnerId] = useState('');
  const [manualDriverId, setManualDriverId] = useState('');
  const [manualVehicleId, setManualVehicleId] = useState('');
  
  // Geographical hierarchy IDs (from cascading dropdowns)
  const [manualStateId, setManualStateId] = useState('');
  const [manualDistrictId, setManualDistrictId] = useState('');
  const [manualCityId, setManualCityId] = useState('');
  const [manualWardId, setManualWardId] = useState('');
  const [manualAreaId, setManualAreaId] = useState('');
  const [manualZoneId, setManualZoneId] = useState('');
  // Display names for validation summary
  const [manualStateName, setManualStateName] = useState('');
  const [manualDistrictName, setManualDistrictName] = useState('');
  const [manualCityName, setManualCityName] = useState('');
  const [manualWardName, setManualWardName] = useState('');
  const [manualAreaName, setManualAreaName] = useState('');
  
  const [manualWasteType, setManualWasteType] = useState('DRY');
  const [manualShiftId, setManualShiftId] = useState('');
  const [manualStartTime, setManualStartTime] = useState('');
  const [manualEndTime, setManualEndTime] = useState('');
  const [manualPriority, setManualPriority] = useState('NORMAL');
  const [manualEstBinCount, setManualEstBinCount] = useState('');
  const [manualEstDuration, setManualEstDuration] = useState('');
  const [manualNotes, setManualNotes] = useState('');

  // Assignments tab
  const [assignments, setAssignments] = useState<DailyAssignment[]>([]);
  const [filterDate, setFilterDate] = useState(new Date().toISOString().split('T')[0]);
  const [expandedAssignment, setExpandedAssignment] = useState<string | null>(null);
  const [isLoadingAssignments, setIsLoadingAssignments] = useState(false);

  // Responsibilities tab
  const [responsibilities, setResponsibilities] = useState<Responsibility[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [zones, setZones] = useState<ServiceZone[]>([]);
  const [showRespForm, setShowRespForm] = useState(false);

  // Responsibility form
  const [respTeamId, setRespTeamId] = useState('');
  const [respZoneId, setRespZoneId] = useState('');
  const [respWasteTypes, setRespWasteTypes] = useState<string[]>(['DRY']);
  const [respEffUntil, setRespEffUntil] = useState('');

  // Shared
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingResp, setIsLoadingResp] = useState(false);
  const respEffFrom = new Date().toISOString();

  /* ── data loading ── */
  const fetchAssignments = useCallback(async (date: string) => {
    setIsLoadingAssignments(true);
    try {
      const query = date ? `?date=${date}` : '';
      const res = await apiRequest(`/assignments${query}`);
      if (res.ok) setAssignments(await res.json());
    } catch { /* silently fail */ }
    finally { setIsLoadingAssignments(false); }
  }, []);

  const fetchResponsibilities = useCallback(async () => {
    setIsLoadingResp(true);
    try {
      const res = await apiRequest('/assignments/responsibilities');
      if (res.ok) setResponsibilities(await res.json());
    } catch { /* silently fail */ }
    finally { setIsLoadingResp(false); }
  }, []);

  const fetchTeamsAndZones = useCallback(async () => {
    try {
      const [teamRes, zoneRes] = await Promise.all([
        apiRequest('/teams'),
        apiRequest('/zones'),
      ]);
      if (teamRes.ok) setTeams(await teamRes.json());
      if (zoneRes.ok) setZones(await zoneRes.json());
    } catch (e) {
      console.error('Error fetching teams and zones:', e);
    }
  }, []);

  async function fetchPlannerMetadata() {
    try {
      const [shiftRes, vehRes, workerRes] = await Promise.all([
        apiRequest('/shifts'),
        apiRequest('/fleet/vehicles'),
        apiRequest('/workforce/workers'),
      ]);

      if (shiftRes.ok) setPlannerShifts(await shiftRes.json());
      if (vehRes.ok) {
        const vehs = await vehRes.json();
        setPlannerVehicles(vehs.filter((v: any) => v.status === 'AVAILABLE' || v.status === 'IN_SERVICE' || v.status === 'ACTIVE'));
      }
      if (workerRes.ok) {
        const allUsers = await workerRes.json();
        setPlannerWorkers(allUsers.filter((u: any) => u.status !== 'SUSPENDED' && u.status !== 'REJECTED'));
      }
    } catch (e) {
      console.error('Error fetching planner metadata:', e);
    }
  }

  useEffect(() => {
    if (activeTab === 'assignments') fetchAssignments(filterDate);
    if (activeTab === 'responsibilities') { fetchResponsibilities(); fetchTeamsAndZones(); }
    if (activeTab === 'manual_planner') { fetchPlannerMetadata(); }
  }, [activeTab, filterDate, fetchAssignments, fetchResponsibilities, fetchTeamsAndZones]);

  useEffect(() => {
    const socket = getSocket('realtime');
    
    socket.on('assignmentUpdated', () => {
      fetchPlannerMetadata();
      if (activeTab === 'assignments') fetchAssignments(filterDate);
    });

    socket.on('workerShiftStarted', () => {
      fetchPlannerMetadata();
      if (activeTab === 'assignments') fetchAssignments(filterDate);
    });

    socket.on('WORKER_ACTIVATED', () => {
      fetchPlannerMetadata();
    });

    socket.on('accountDeactivated', () => {
      fetchPlannerMetadata();
    });

    socket.on('NEW_CITIZEN_REGISTRATION', () => {
      fetchPlannerMetadata();
    });

    socket.on('taskCompleted', () => {
      if (activeTab === 'assignments') fetchAssignments(filterDate);
    });

    socket.on('TASK_STATUS_UPDATED', () => {
      if (activeTab === 'assignments') fetchAssignments(filterDate);
    });

    return () => {
      socket.off('assignmentUpdated');
      socket.off('workerShiftStarted');
      socket.off('WORKER_ACTIVATED');
      socket.off('accountDeactivated');
      socket.off('NEW_CITIZEN_REGISTRATION');
      socket.off('taskCompleted');
      socket.off('TASK_STATUS_UPDATED');
    };
  }, [activeTab, filterDate, fetchAssignments]);

  /* ── generate ── */
  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    setIsGenerating(true);
    setGenResult(null);
    setErrorMsg(''); setSuccessMsg('');
    try {
      const res = await apiRequest('/assignments/generate', {
        method: 'POST',
        body: JSON.stringify({ date: genDate }),
      });
      const data = await res.json();
      if (res.ok) {
        setGenResult(data);
        setSuccessMsg(`Generated ${data.generated} assignment(s) for ${genDate}.`);
      } else {
        setErrorMsg(data.message || 'Generation failed.');
      }
    } catch {
      setErrorMsg('Network error. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  }

  /* ── manual planner ── */
  async function handleCreateManualAssignment(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    // Validate all required geographic fields
    const missingFields = [];
    if (!manualStateId) missingFields.push('State');
    if (!manualDistrictId) missingFields.push('District');
    if (!manualCityId) missingFields.push('City');
    if (!manualWardId) missingFields.push('Ward');
    if (!manualAreaId) missingFields.push('Area');
    if (!manualShiftId) missingFields.push('Shift');
    if (!manualWorkerId) missingFields.push('Worker');
    if (!manualDate) missingFields.push('Date');
    if (missingFields.length > 0) {
      setErrorMsg(`Please fill all required fields: ${missingFields.join(', ')}.`);
      return;
    }

    setIsSubmitting(true);

    const payload = {
      date: manualDate,
      assignmentDate: manualDate,
      workerId: manualWorkerId,
      partnerWorkerId: manualPartnerId || undefined,
      driverId: manualDriverId || undefined,
      vehicleId: manualVehicleId || undefined,
      stateId: manualStateId,
      districtId: manualDistrictId,
      cityId: manualCityId,
      wardId: manualWardId,
      areaId: manualAreaId,
      zoneId: manualZoneId || undefined,
      wasteType: manualWasteType,
      shiftId: manualShiftId,
      startTime: manualStartTime || undefined,
      endTime: manualEndTime || undefined,
      priority: manualPriority,
      estimatedBinCount: manualEstBinCount || undefined,
      estimatedDuration: manualEstDuration || undefined,
      notes: manualNotes || undefined,
    };

    try {
      const res = await apiRequest('/assignments/manual-planner', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const data = await res.json();
        const houseCount = data.assignment?.targets?.length ?? data.targetCount ?? 0;
        setSuccessMsg(`✅ Work assigned to ${manualStateName} → ${manualDistrictName} → ${manualCityName} → ${manualWardName} → ${manualAreaName}. ${houseCount > 0 ? `${houseCount} collection points queued.` : ''} Worker dashboard updated in real-time.`);
        // Reset form
        setManualWorkerId(''); setManualPartnerId(''); setManualDriverId(''); setManualVehicleId('');
        setManualStateId(''); setManualDistrictId(''); setManualCityId('');
        setManualWardId(''); setManualAreaId(''); setManualZoneId('');
        setManualStateName(''); setManualDistrictName(''); setManualCityName('');
        setManualWardName(''); setManualAreaName('');
        setManualShiftId(''); setManualNotes(''); setManualEstBinCount(''); setManualEstDuration('');
        fetchAssignments(filterDate);
      } else {
        const err = await res.json();
        setErrorMsg(err.message || 'Validation error creating assignment.');
      }
    } catch {
      setErrorMsg('Network connectivity issue.');
    } finally {
      setIsSubmitting(false);
    }
  }

  /* ── responsibilities ── */
  async function handleCreateResponsibility(e: React.FormEvent) {
    e.preventDefault();
    setIsSubmitting(true);
    setErrorMsg(''); setSuccessMsg('');
    try {
      const res = await apiRequest('/assignments/responsibilities', {
        method: 'POST',
        body: JSON.stringify({
          teamId: respTeamId,
          serviceZoneId: respZoneId,
          wasteTypes: respWasteTypes,
          effectiveFrom: respEffFrom,
          effectiveUntil: respEffUntil || null,
        }),
      });
      if (res.ok) {
        setSuccessMsg('Team responsibility created.');
        setShowRespForm(false);
        setRespTeamId(''); setRespZoneId(''); setRespWasteTypes(['DRY']); setRespEffUntil('');
        fetchResponsibilities();
      } else {
        const data = await res.json();
        setErrorMsg(data.message || 'Failed to create responsibility.');
      }
    } catch {
      setErrorMsg('Network error. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  /* ─────────────── render ─────────────── */
  return (
    <div className="space-y-8 pb-24">
      {/* Header */}
      <div className="glass-card p-8">
        <h1 className="text-3xl font-extrabold text-slate-800 tracking-tight">Daily Assignments Control</h1>
        <p className="text-sm text-slate-650 mt-2 font-medium">Generate schedules, plan collection runs, and assign vehicles/workforces dynamically.</p>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-surface-border">
        {([
          { key: 'generate', label: 'Generate Assignments' },
          { key: 'manual_planner', label: 'Manual Planner Form' },
          { key: 'assignments', label: 'Assignment Viewer' },
          { key: 'responsibilities', label: 'Team Responsibilities' },
        ] as const).map(tab => (
          <button key={tab.key} onClick={() => { setActiveTab(tab.key); setErrorMsg(''); setSuccessMsg(''); }}
            className={`px-5 py-2.5 text-sm font-bold transition border-b-2 -mb-px ${
              activeTab === tab.key
                ? 'border-nature-accent text-nature-earth'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Feedback */}
      {errorMsg && <div className="p-4 rounded-xl border border-red-200 bg-red-50 text-red-700 text-sm font-medium">{errorMsg}</div>}
      {successMsg && <div className="p-4 rounded-xl border border-nature-accent bg-nature-white/80 text-slate-855 text-sm font-medium">{successMsg}</div>}

      {/* ────── TAB: Generate ────── */}
      {activeTab === 'generate' && (
        <div className="space-y-6">
          {/* Generate Card */}
          <form onSubmit={handleGenerate}
            className="p-8 rounded-2xl border border-slate-800 bg-gradient-to-br from-slate-900/80 to-slate-900/40 backdrop-blur space-y-6">
            <div className="flex items-center gap-4">
              <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-teal-500/10 border border-emerald-500/20 flex items-center justify-center text-2xl">
                ⚙️
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-100">Assignment Generation Engine</h2>
                <p className="text-xs text-slate-450 mt-0.5">
                  Resolves today's schedules, maps shifts, validates coverage and snapshots targets atomically
                </p>
              </div>
            </div>

            <div className="flex items-end gap-4">
              <div className="flex-1">
                <label className="block text-xs text-slate-400 mb-1">Target Date</label>
                <input type="date" value={genDate} onChange={e => setGenDate(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-850 text-slate-100 text-xs focus:outline-none focus:border-emerald-500/50" />
              </div>
              <button type="submit" disabled={isGenerating}
                className="px-6 py-2.5 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-slate-100 transition disabled:opacity-50 min-w-[140px]">
                {isGenerating ? 'Generating...' : 'Generate Now'}
              </button>
            </div>
          </form>

          {genResult && (
            <div className="space-y-4">
              {/* Stats row */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                {[
                  { label: 'Generated', value: genResult.generated, color: 'text-emerald-700' },
                  { label: 'Skipped', value: genResult.skipped, color: 'text-amber-700' },
                  { label: 'Warnings', value: genResult.coverageWarnings?.length || 0, color: 'text-rose-700' },
                ].map(stat => (
                  <div key={stat.label} className="glass-card p-5 text-center !rounded-[16px]">
                    <div className={`text-3xl font-extrabold ${stat.color}`}>{stat.value}</div>
                    <div className="text-xs text-slate-500 mt-1 font-semibold uppercase tracking-wider">{stat.label}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ────── TAB: Manual Planner ────── */}
      {activeTab === 'manual_planner' && (
        <form onSubmit={handleCreateManualAssignment} className="p-6 md:p-8 rounded-2xl border border-emerald-900/30 bg-slate-900/80 backdrop-blur-md shadow-2xl shadow-emerald-950/20 space-y-6 text-xs text-slate-200 transition-all">
          <div className="border-b border-emerald-900/30 pb-4">
            <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
              <span className="text-emerald-400 text-lg">📝</span> Manual Assignment Panel
            </h3>
            <p className="text-xs text-slate-400 mt-1">Select location, shift, assigned worker, vehicle and date to create a new manual collection route.</p>
          </div>

          {/* ── Live Workforce Counter Stats ── */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 border border-emerald-900/30 p-4 rounded-2xl bg-slate-950/50">
            <div className="text-center p-2">
              <div className="text-2xl font-extrabold text-emerald-400">{plannerWorkers.length}</div>
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-0.5">Total Workers</div>
            </div>
            <div className="text-center p-2 sm:border-x border-emerald-900/30">
              <div className="text-2xl font-extrabold text-teal-400">
                {plannerWorkers.filter(w => w.status === 'ACTIVE' || w.employmentStatus === 'ACTIVE').length}
              </div>
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-0.5">Active Workers</div>
            </div>
            <div className="text-center p-2">
              <div className="text-2xl font-extrabold text-amber-400">
                {plannerWorkers.filter(w => w.status !== 'ACTIVE' && w.employmentStatus !== 'ACTIVE').length}
              </div>
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-0.5">Pending / Inactive</div>
            </div>
          </div>

          {/* ── Section 1: Geographical Hierarchy ── */}
          <div className="border border-emerald-900/30 p-5 rounded-2xl bg-slate-950/40 space-y-4">
            <h4 className="text-xs font-bold text-emerald-400 border-b border-emerald-900/30 pb-2.5 flex items-center gap-2 tracking-wide uppercase">
              <span>📍</span> 1. Geography & Location
            </h4>
            <CascadingLocationFilter
              layout="grid"
              required={true}
              onLocationChange={(loc) => {
                setManualStateId(loc.stateId || '');
                setManualStateName(loc.stateName || '');
                setManualDistrictId(loc.districtId || '');
                setManualDistrictName(loc.districtName || '');
                setManualCityId(loc.cityId || '');
                setManualCityName(loc.cityName || '');
                setManualWardId(loc.wardId || '');
                setManualWardName(loc.wardName || '');
                setManualAreaId(loc.areaId || '');
                setManualAreaName(loc.areaName || '');
              }}
            />
            {manualAreaId && (
              <div className="mt-3 px-4 py-2.5 bg-emerald-950/40 border border-emerald-800/40 rounded-xl text-xs text-emerald-300 flex items-center gap-2">
                <span className="font-semibold text-emerald-400">Selected Location:</span>
                <span>{[manualStateName, manualDistrictName, manualCityName, manualWardName, manualAreaName].filter(Boolean).join(' → ')}</span>
              </div>
            )}
          </div>

          {/* ── Section 2: Primary Operations & Assignment ── */}
          <div className="border border-emerald-900/30 p-5 rounded-2xl bg-slate-950/40 space-y-4">
            <h4 className="text-xs font-bold text-emerald-400 border-b border-emerald-900/30 pb-2.5 flex items-center gap-2 tracking-wide uppercase">
              <span>👷</span> 2. Shift, Worker & Date Assignment
            </h4>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4.5">
              {/* Shift */}
              <div>
                <label className="block text-xs font-semibold text-emerald-300/90 tracking-wide mb-1.5 uppercase">Shift *</label>
                <select value={manualShiftId} onChange={e => {
                  setManualShiftId(e.target.value);
                  const sh = plannerShifts.find(s => s.id === e.target.value);
                  if (sh) { setManualStartTime(sh.startTime); setManualEndTime(sh.endTime); }
                }} className="w-full h-11 px-3.5 py-2.5 bg-slate-950/90 border border-slate-800 hover:border-emerald-700/60 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 rounded-xl text-xs font-medium text-slate-100 transition-all outline-none cursor-pointer appearance-none bg-[url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2216%22%20height%3D%2216%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%2310b981%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpath%20d%3D%22m6%209%206%206%206-6%22%2F%3E%3C%2Fsvg%3E')] bg-[length:16px_16px] bg-[right_12px_center] bg-no-repeat pr-10">
                  <option value="" className="bg-slate-900 text-slate-100">Select Shift</option>
                  {plannerShifts.map(s => (
                    <option key={s.id || s._id} value={s.id || s._id} className="bg-slate-900 text-slate-100">
                      {s.name.replace(/\s+Shift$/i, '')} ({formatTime12h(s.startTime)} – {formatTime12h(s.endTime)})
                    </option>
                  ))}
                </select>
              </div>

              {/* Worker */}
              <div>
                <label className="block text-xs font-semibold text-emerald-300/90 tracking-wide mb-1.5 uppercase">Workers *</label>
                <select value={manualWorkerId} onChange={e => setManualWorkerId(e.target.value)} onFocus={() => fetchPlannerMetadata()}
                  className="w-full h-11 px-3.5 py-2.5 bg-slate-950/90 border border-slate-800 hover:border-emerald-700/60 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 rounded-xl text-xs font-medium text-slate-100 transition-all outline-none cursor-pointer appearance-none bg-[url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2216%22%20height%3D%2216%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%2310b981%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpath%20d%3D%22m6%209%206%206%206-6%22%2F%3E%3C%2Fsvg%3E')] bg-[length:16px_16px] bg-[right_12px_center] bg-no-repeat pr-10">
                  <option value="" className="bg-slate-900 text-slate-100">Select Worker</option>
                  {plannerWorkers.map(w => (
                    <option key={w.id || w._id} value={w.id || w._id} className="bg-slate-900 text-slate-100">{w.name ? `${w.name} (${w.email})` : w.email} {w.employeeCode ? `[${w.employeeCode}]` : ''}</option>
                  ))}
                </select>
              </div>

              {/* Date */}
              <div>
                <label className="block text-xs font-semibold text-emerald-300/90 tracking-wide mb-1.5 uppercase">Date *</label>
                <input type="date" value={manualDate} onChange={e => setManualDate(e.target.value)}
                  className="w-full h-11 px-3.5 py-2.5 bg-slate-950/90 border border-slate-800 hover:border-emerald-700/60 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 rounded-xl text-xs font-medium text-slate-100 transition-all outline-none" />
              </div>

              {/* Vehicle */}
              <div>
                <label className="block text-xs font-semibold text-emerald-300/90 tracking-wide mb-1.5 uppercase">Vehicle</label>
                <select value={manualVehicleId} onChange={e => setManualVehicleId(e.target.value)}
                  className="w-full h-11 px-3.5 py-2.5 bg-slate-950/90 border border-slate-800 hover:border-emerald-700/60 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 rounded-xl text-xs font-medium text-slate-100 transition-all outline-none cursor-pointer appearance-none bg-[url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2216%22%20height%3D%2216%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%2310b981%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpath%20d%3D%22m6%209%206%206%206-6%22%2F%3E%3C%2Fsvg%3E')] bg-[length:16px_16px] bg-[right_12px_center] bg-no-repeat pr-10">
                  <option value="" className="bg-slate-900 text-slate-100">Select Vehicle</option>
                  {plannerVehicles.map(v => (
                    <option key={v.id} value={v.id} className="bg-slate-900 text-slate-100">{v.vehicleCode} ({v.capacityKg} kg)</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* ── Section 3: Additional Details ── */}
          <div className="border border-emerald-900/30 p-5 rounded-2xl bg-slate-950/40 space-y-4">
            <h4 className="text-xs font-bold text-emerald-400 border-b border-emerald-900/30 pb-2.5 flex items-center gap-2 tracking-wide uppercase">
              <span>⚙️</span> 3. Additional Assignment Details
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4.5">
              <div>
                <label className="block text-xs font-semibold text-emerald-300/90 tracking-wide mb-1.5 uppercase">Partner Worker</label>
                <select value={manualPartnerId} onChange={e => setManualPartnerId(e.target.value)}
                  className="w-full h-11 px-3.5 py-2.5 bg-slate-950/90 border border-slate-800 hover:border-emerald-700/60 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 rounded-xl text-xs font-medium text-slate-100 transition-all outline-none cursor-pointer appearance-none bg-[url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2216%22%20height%3D%2216%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%2310b981%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpath%20d%3D%22m6%209%206%206%206-6%22%2F%3E%3C%2Fsvg%3E')] bg-[length:16px_16px] bg-[right_12px_center] bg-no-repeat pr-10">
                  <option value="" className="bg-slate-900 text-slate-100">None</option>
                  {plannerWorkers.map(w => (
                    <option key={w.id} value={w.id} className="bg-slate-900 text-slate-100">{w.name || w.user?.name || w.employeeCode}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-emerald-300/90 tracking-wide mb-1.5 uppercase">Waste Category</label>
                <select value={manualWasteType} onChange={e => setManualWasteType(e.target.value)}
                  className="w-full h-11 px-3.5 py-2.5 bg-slate-950/90 border border-slate-800 hover:border-emerald-700/60 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 rounded-xl text-xs font-medium text-slate-100 transition-all outline-none cursor-pointer appearance-none bg-[url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2216%22%20height%3D%2216%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%2310b981%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpath%20d%3D%22m6%209%206%206%206-6%22%2F%3E%3C%2Fsvg%3E')] bg-[length:16px_16px] bg-[right_12px_center] bg-no-repeat pr-10">
                  {['DRY', 'WET', 'MIXED', 'PLASTIC', 'GLASS', 'PAPER', 'E_WASTE', 'HAZARDOUS'].map(w => (
                    <option key={w} value={w} className="bg-slate-900 text-slate-100">{w}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-emerald-300/90 tracking-wide mb-1.5 uppercase">Priority</label>
                <select value={manualPriority} onChange={e => setManualPriority(e.target.value)}
                  className="w-full h-11 px-3.5 py-2.5 bg-slate-950/90 border border-slate-800 hover:border-emerald-700/60 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 rounded-xl text-xs font-medium text-slate-100 transition-all outline-none cursor-pointer appearance-none bg-[url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2216%22%20height%3D%2216%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%2310b981%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpath%20d%3D%22m6%209%206%206%206-6%22%2F%3E%3C%2Fsvg%3E')] bg-[length:16px_16px] bg-[right_12px_center] bg-no-repeat pr-10">
                  {['LOW', 'NORMAL', 'HIGH', 'URGENT', 'CRITICAL'].map(p => (
                    <option key={p} value={p} className="bg-slate-900 text-slate-100">{p}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-emerald-300/90 tracking-wide mb-1.5 uppercase">Est. Bin Count</label>
                <input type="number" placeholder="Auto" value={manualEstBinCount} onChange={e => setManualEstBinCount(e.target.value)}
                  className="w-full h-11 px-3.5 py-2.5 bg-slate-950/90 border border-slate-800 hover:border-emerald-700/60 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 rounded-xl text-xs font-medium text-slate-100 transition-all outline-none" />
              </div>

              <div>
                <label className="block text-xs font-semibold text-emerald-300/90 tracking-wide mb-1.5 uppercase">Est. Duration (mins)</label>
                <input type="number" placeholder="Auto" value={manualEstDuration} onChange={e => setManualEstDuration(e.target.value)}
                  className="w-full h-11 px-3.5 py-2.5 bg-slate-950/90 border border-slate-800 hover:border-emerald-700/60 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 rounded-xl text-xs font-medium text-slate-100 transition-all outline-none" />
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-emerald-300/90 tracking-wide mb-1.5 uppercase">Notes / Instructions</label>
                <input type="text" placeholder="e.g. Heavy traffic route" value={manualNotes} onChange={e => setManualNotes(e.target.value)}
                  className="w-full h-11 px-3.5 py-2.5 bg-slate-950/90 border border-slate-800 hover:border-emerald-700/60 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 rounded-xl text-xs font-medium text-slate-100 transition-all outline-none" />
              </div>
            </div>
          </div>

          {/* Validation summary */}
          {(!manualStateId || !manualDistrictId || !manualCityId || !manualWardId || !manualAreaId) && (
            <div className="text-xs text-amber-400 bg-amber-950/30 border border-amber-800/40 rounded-xl px-4 py-3 flex items-center gap-2">
              <span>⚠️</span>
              <span>Please select all 5 geographical levels (State → District → City → Ward → Area) before assigning work.</span>
            </div>
          )}

          <div className="flex justify-end pt-2">
            <button type="submit" disabled={isSubmitting || !manualAreaId || !manualShiftId || !manualWorkerId || !manualDate}
              className="w-full md:w-auto h-12 px-8 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 active:scale-[0.99] text-white font-bold tracking-wider rounded-xl shadow-lg shadow-emerald-950/40 transition-all flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed disabled:transform-none cursor-pointer text-xs uppercase">
              {isSubmitting ? 'Creating Assignment...' : 'ASSIGN WORK'}
            </button>
          </div>
        </form>
      )}

      {/* ────── TAB: Assignments ────── */}
      {activeTab === 'assignments' && (
        <div className="space-y-6">
          <div className="flex items-center gap-3 text-xs">
            <label className="text-slate-600 font-bold uppercase">View date:</label>
            <input type="date" value={filterDate} onChange={e => setFilterDate(e.target.value)} className="input-field !py-1 px-3 !w-auto" />
            <button onClick={() => fetchAssignments(filterDate)} className="px-4 py-2 bg-nature-lightBg border border-surface-border text-slate-650 hover:bg-nature-white rounded-xl text-xs font-bold transition shadow-sm">
              Refresh
            </button>
          </div>

          {isLoadingAssignments ? (
            <div className="glass-card p-12 text-center text-slate-500 text-sm font-medium">Loading assignments...</div>
          ) : assignments.length === 0 ? (
            <div className="glass-card p-12 text-center">
              <p className="text-slate-500 font-semibold">No assignments found for {filterDate}. Please run the planner above.</p>
            </div>
          ) : (
            <div className="space-y-3 text-xs">
              {assignments.map(a => (
                <div key={a.id} className="glass-card !p-0 overflow-hidden">
                  <div className="px-6 py-4 flex items-center gap-4 flex-wrap sm:flex-nowrap">
                    <span className={`px-2.5 py-1 rounded-lg text-xs font-bold border ${WASTE_COLORS[a.wasteType] || WASTE_COLORS.OTHER}`}>
                      {a.wasteType}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-base font-bold text-slate-800">
                        {a.team?.name || a.primaryWorker?.user?.name || a.driver?.user?.name || 'Unassigned'} • {a.serviceZone?.name ?? '-'}
                      </div>
                      <div className="text-[11px] text-slate-500 mt-1 font-semibold">
                        {new Date(a.assignmentDate).toLocaleDateString()}
                        {a.shift && ` · ${a.shift.name} (${a.shift.startTime}–${a.shift.endTime})`}
                      </div>
                    </div>

                    <span className={`px-2.5 py-1 rounded-lg text-xs font-bold border ${STATUS_STYLES[a.status]}`}>
                      {a.status}
                    </span>

                    <button
                      onClick={() => setExpandedAssignment(expandedAssignment === a.id ? null : a.id)}
                      className="px-3 py-1.5 rounded-lg border border-surface-border text-slate-500 text-xs font-bold hover:bg-nature-lightBg"
                    >
                      {expandedAssignment === a.id ? 'Hide stops' : 'Show stops'}
                    </button>
                  </div>

                  {expandedAssignment === a.id && (
                    <div className="border-t border-surface-border bg-nature-lightBg/30 px-6 py-4">
                      {!a.targets || a.targets.length === 0 ? (
                        <p className="text-slate-500 text-xs font-medium">No collection stops snapshotted.</p>
                      ) : (
                        <div className="space-y-2">
                          {a.targets.map(t => (
                            <div key={t.id} className="flex items-center justify-between py-2.5 px-4 rounded-xl bg-nature-white border border-surface-border text-slate-700 shadow-sm font-semibold">
                              <span>{t.collectionPoint?.address || 'Anonymous Point'}</span>
                              <span className="text-xs text-nature-earth font-bold">{t.eligibleBinCount} bin(s)</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ────── TAB: Responsibilities ────── */}
      {activeTab === 'responsibilities' && (
        <div className="space-y-6">
          <div className="flex justify-end">
            <button onClick={() => { setShowRespForm(!showRespForm); setErrorMsg(''); setSuccessMsg(''); }} className="btn-primary">
              {showRespForm ? 'Cancel' : '+ Add Responsibility'}
            </button>
          </div>

          {showRespForm && (
            <form onSubmit={handleCreateResponsibility} className="glass-card p-6 space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-500 font-bold uppercase tracking-wider mb-1">Team</label>
                  <select value={respTeamId} onChange={e => setRespTeamId(e.target.value)} required className="input-field">
                    <option value="">Select Team</option>
                    {teams.map(t => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-slate-500 font-bold uppercase tracking-wider mb-1">Service Zone</label>
                  <select value={respZoneId} onChange={e => setRespZoneId(e.target.value)} required className="input-field">
                    <option value="">Select Zone</option>
                    {zones.map(z => (
                      <option key={z.id} value={z.id}>{z.name} ({z.area?.name || 'No Area'})</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex justify-end pt-2">
                <button type="submit" className="btn-primary w-full sm:w-auto">
                  Save Responsibility
                </button>
              </div>
            </form>
          )}

          <div className="space-y-2.5 text-xs">
            {responsibilities.map(r => (
              <div key={r.id} className="glass-card flex justify-between items-center py-4 px-6 shadow-sm">
                <div>
                  <span className="font-extrabold text-slate-800 text-base block">{r.team?.name}</span>
                  <span className="text-xs text-slate-500 font-medium">Zone: {r.serviceZone?.name} ({r.serviceZone?.area?.name})</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
