'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { apiRequest } from '../../../../utils/api';
import { SearchableSelect } from '../../../../components/ui/SearchableSelect';
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

const WASTE_TYPES = ['DRY', 'WET', 'E_WASTE', 'OTHER'];

const STATUS_STYLES: Record<string, string> = {
  CREATED:     'bg-slate-500/10 text-slate-300 border-slate-500/20',
  ASSIGNED:    'bg-yellow-500/10 text-yellow-300 border-yellow-500/20',
  ACCEPTED:    'bg-teal-500/10 text-teal-300 border-teal-500/20',
  STARTED:     'bg-indigo-500/10 text-indigo-300 border-indigo-500/20',
  IN_PROGRESS: 'bg-blue-500/10 text-blue-300 border-blue-500/20',
  PAUSED:      'bg-orange-500/10 text-orange-300 border-orange-500/20',
  COMPLETED:   'bg-emerald-500/10 text-emerald-300 border-emerald-500/20',
  MISSED:      'bg-red-500/10 text-red-300 border-red-500/20',
  CANCELLED:   'bg-red-500/10 text-red-300 border-red-500/20',
};

const WASTE_COLORS: Record<string, string> = {
  DRY:    'bg-amber-500/10 text-amber-300 border-amber-500/20',
  WET:    'bg-green-500/10 text-green-300 border-green-500/20',
  E_WASTE:'bg-purple-500/10 text-purple-300 border-purple-500/20',
  OTHER:  'bg-slate-500/10 text-slate-300 border-slate-500/20',
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
  const [plannerCities, setPlannerCities] = useState<any[]>([]);
  const [plannerWards, setPlannerWards] = useState<any[]>([]);
  const [plannerAreas, setPlannerAreas] = useState<any[]>([]);
  const [plannerZones, setPlannerZones] = useState<any[]>([]);
  
  const [manualDate, setManualDate] = useState(new Date().toISOString().split('T')[0]);
  const [manualWorkerId, setManualWorkerId] = useState('');
  const [manualPartnerId, setManualPartnerId] = useState('');
  const [manualDriverId, setManualDriverId] = useState('');
  const [manualVehicleId, setManualVehicleId] = useState('');
  
  const [manualCityId, setManualCityId] = useState('');
  const [manualWardId, setManualWardId] = useState('');
  const [manualAreaId, setManualAreaId] = useState('');
  const [manualZoneId, setManualZoneId] = useState('');
  
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
  const [isLoadingResp, setIsLoadingResp] = useState(false);
  const [showRespForm, setShowRespForm] = useState(false);

  // Responsibility form
  const [respTeamId, setRespTeamId] = useState('');
  const [respZoneId, setRespZoneId] = useState('');
  const [respWasteTypes, setRespWasteTypes] = useState<string[]>(['DRY']);
  const [respEffFrom, setRespEffFrom] = useState(new Date().toISOString().split('T')[0]);
  const [respEffUntil, setRespEffUntil] = useState('');

  // Shared
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

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
      const [shiftRes, vehRes, workerRes, cityRes] = await Promise.all([
        apiRequest('/shifts'),
        apiRequest('/fleet/vehicles'),
        apiRequest('/workforce/workers'),
        apiRequest('/geo/cities'),
      ]);

      if (shiftRes.ok) setPlannerShifts(await shiftRes.json());
      if (vehRes.ok) {
        const vehs = await vehRes.json();
        setPlannerVehicles(vehs.filter((v: any) => v.status === 'AVAILABLE' || v.status === 'IN_SERVICE'));
      }
      if (workerRes.ok) {
        const allUsers = await workerRes.json();
        setPlannerWorkers(allUsers.filter((u: any) => u.status !== 'SUSPENDED' && u.status !== 'REJECTED'));
      }
      if (cityRes.ok) setPlannerCities(await cityRes.json());
    } catch (e) {
      console.error('Error fetching planner metadata:', e);
    }
  }

  useEffect(() => {
    if (manualCityId) {
      apiRequest(`/geo/cities/${manualCityId}/wards`).then(r => r.ok ? r.json() : []).then(setPlannerWards).catch(() => setPlannerWards([]));
    } else {
      setPlannerWards([]);
    }
  }, [manualCityId]);

  useEffect(() => {
    if (manualWardId) {
      apiRequest(`/geo/wards/${manualWardId}/areas`).then(r => r.ok ? r.json() : []).then(setPlannerAreas).catch(() => setPlannerAreas([]));
    } else {
      setPlannerAreas([]);
    }
  }, [manualWardId]);

  useEffect(() => {
    if (manualAreaId) {
      apiRequest('/zones').then(r => r.ok ? r.json() : []).then(z => {
        setPlannerZones(z.filter((zone: any) => zone.areaId === manualAreaId));
      }).catch(() => setPlannerZones([]));
    } else {
      setPlannerZones([]);
    }
  }, [manualAreaId]);

  useEffect(() => {
    if (activeTab === 'assignments') fetchAssignments(filterDate);
    if (activeTab === 'responsibilities') { fetchResponsibilities(); fetchTeamsAndZones(); }
    if (activeTab === 'manual_planner') { fetchPlannerMetadata(); }
  }, [activeTab, filterDate, fetchAssignments, fetchResponsibilities, fetchTeamsAndZones]);

  useEffect(() => {
    const socket = getSocket('realtime');
    
    socket.on('assignmentUpdated', () => {
      if (activeTab === 'assignments') fetchAssignments(filterDate);
    });

    socket.on('workerShiftStarted', () => {
      if (activeTab === 'assignments') fetchAssignments(filterDate);
    });

    socket.on('taskCompleted', () => {
      if (activeTab === 'assignments') fetchAssignments(filterDate);
    });

    return () => {
      socket.off('assignmentUpdated');
      socket.off('workerShiftStarted');
      socket.off('taskCompleted');
      socket.disconnect();
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
    setIsSubmitting(true);

    const payload = {
      assignmentDate: manualDate,
      workerId: manualWorkerId,
      partnerWorkerId: manualPartnerId,
      driverId: manualDriverId,
      vehicleId: manualVehicleId,
      areaId: manualAreaId,
      wardId: manualWardId,
      zoneId: manualZoneId,
      wasteType: manualWasteType,
      shiftId: manualShiftId,
      startTime: manualStartTime,
      endTime: manualEndTime,
      priority: manualPriority,
      estimatedBinCount: manualEstBinCount,
      estimatedDuration: manualEstDuration,
      notes: manualNotes,
    };

    try {
      const res = await apiRequest('/assignments/manual-planner', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        setSuccessMsg('Advanced Collection Assignment successfully created and synced to Worker Dashboards.');
        setManualWorkerId(''); setManualPartnerId(''); setManualDriverId(''); setManualVehicleId('');
        setManualCityId(''); setManualWardId(''); setManualAreaId(''); setManualZoneId('');
        setManualNotes(''); setManualEstBinCount(''); setManualEstDuration('');
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
  function toggleWasteType(wt: string) {
    setRespWasteTypes(prev => prev.includes(wt) ? prev.filter(w => w !== wt) : [...prev, wt]);
  }

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
    <div className="space-y-8 pb-24 text-slate-100">
      {/* Header */}
      <div className="p-6 rounded-2xl border border-slate-800 bg-gradient-to-br from-slate-900/80 to-indigo-950/20 backdrop-blur">
        <h1 className="text-2xl font-bold text-slate-100">Daily Assignments Control</h1>
        <p className="text-sm text-slate-400 mt-1">Generate schedules, plan collection runs, and assign vehicles/workforces dynamically.</p>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-800">
        {([
          { key: 'generate', label: 'Generate Assignments' },
          { key: 'manual_planner', label: 'Manual Planner Form' },
          { key: 'assignments', label: 'Assignment Viewer' },
          { key: 'responsibilities', label: 'Team Responsibilities' },
        ] as const).map(tab => (
          <button key={tab.key} onClick={() => { setActiveTab(tab.key); setErrorMsg(''); setSuccessMsg(''); }}
            className={`px-5 py-2.5 text-sm font-medium transition border-b-2 -mb-px ${
              activeTab === tab.key
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Feedback */}
      {errorMsg && <div className="p-4 rounded-xl border border-red-500/30 bg-red-950/20 text-red-300 text-xs">{errorMsg}</div>}
      {successMsg && <div className="p-4 rounded-xl border border-emerald-500/30 bg-emerald-950/20 text-emerald-350 text-xs">{successMsg}</div>}

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
                  { label: 'Generated', value: genResult.generated, color: 'text-emerald-400' },
                  { label: 'Skipped', value: genResult.skipped, color: 'text-yellow-400' },
                  { label: 'Warnings', value: genResult.coverageWarnings?.length || 0, color: 'text-orange-400' },
                ].map(stat => (
      {/* ────── TAB: Manual Planner ────── */}
      {activeTab === 'manual_planner' && (
        <form onSubmit={handleCreateManualAssignment} className="p-6 md:p-8 rounded-2xl border border-emerald-900/30 bg-slate-900/80 backdrop-blur-md shadow-2xl shadow-emerald-950/20 space-y-6 text-xs text-slate-200 transition-all">
          <div className="border-b border-emerald-900/30 pb-4">
            <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
              <span className="text-emerald-400 text-lg">📝</span> Manual Assignment Panel
            </h3>
            <p className="text-xs text-slate-400 mt-1">Assign vehicles, drivers, collection shifts and wards manually while verifying workforce restrictions.</p>
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
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            
            {/* Workforce Selection */}
            <div className="space-y-4 border border-emerald-900/30 p-5 rounded-2xl bg-slate-950/40">
              <h4 className="text-xs font-bold text-emerald-400 border-b border-emerald-900/30 pb-2.5 flex items-center gap-2 tracking-wide uppercase">Workforce</h4>
              <div>
                <label className="block text-xs font-semibold text-emerald-300/90 tracking-wide mb-1.5 uppercase">Primary Worker *</label>
                <select value={manualWorkerId} onChange={e => setManualWorkerId(e.target.value)} onFocus={() => fetchPlannerMetadata()} required
                  className="w-full h-11 px-3.5 py-2.5 bg-slate-950/90 border border-slate-800 hover:border-emerald-700/60 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 rounded-xl text-xs font-medium text-slate-100 transition-all outline-none cursor-pointer appearance-none bg-[url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2216%22%20height%3D%2216%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%2310b981%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpath%20d%3D%22m6%209%206%206%206-6%22%2F%3E%3C%2Fsvg%3E')] bg-[length:16px_16px] bg-[right_12px_center] bg-no-repeat pr-10">
                  <option value="" className="bg-slate-900 text-slate-100">Select Worker</option>
                  {plannerWorkers.map(w => (
                    <option key={w.id || w._id} value={w.id || w._id} className="bg-slate-900 text-slate-100">{w.name ? `${w.name} (${w.email})` : w.email} {w.employeeCode ? `[${w.employeeCode}]` : ''}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-emerald-300/90 tracking-wide mb-1.5 uppercase">Partner Worker (Optional)</label>
                <select value={manualPartnerId} onChange={e => setManualPartnerId(e.target.value)} onFocus={() => fetchPlannerMetadata()}
                  className="w-full h-11 px-3.5 py-2.5 bg-slate-950/90 border border-slate-800 hover:border-emerald-700/60 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 rounded-xl text-xs font-medium text-slate-100 transition-all outline-none cursor-pointer appearance-none bg-[url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2216%22%20height%3D%2216%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%2310b981%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpath%20d%3D%22m6%209%206%206%206-6%22%2F%3E%3C%2Fsvg%3E')] bg-[length:16px_16px] bg-[right_12px_center] bg-no-repeat pr-10">
                  <option value="" className="bg-slate-900 text-slate-100">Select Partner</option>
                  {plannerWorkers.map(w => (
                    <option key={w.id || w._id} value={w.id || w._id} className="bg-slate-900 text-slate-100">{w.name ? `${w.name} (${w.email})` : w.email} {w.employeeCode ? `[${w.employeeCode}]` : ''}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-emerald-300/90 tracking-wide mb-1.5 uppercase">Driver Selection</label>
                <select value={manualDriverId} onChange={e => setManualDriverId(e.target.value)} onFocus={() => fetchPlannerMetadata()} required
                  className="w-full h-11 px-3.5 py-2.5 bg-slate-950/90 border border-slate-800 hover:border-emerald-700/60 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 rounded-xl text-xs font-medium text-slate-100 transition-all outline-none cursor-pointer appearance-none bg-[url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2216%22%20height%3D%2216%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%2310b981%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpath%20d%3D%22m6%209%206%206%206-6%22%2F%3E%3C%2Fsvg%3E')] bg-[length:16px_16px] bg-[right_12px_center] bg-no-repeat pr-10">
                  <option value="" className="bg-slate-900 text-slate-100">Select Driver</option>
                  {plannerWorkers.map(w => (
                    <option key={w.id || w._id} value={w.id || w._id} className="bg-slate-900 text-slate-100">{w.name ? `${w.name} (${w.email})` : w.email} {w.employeeCode ? `[${w.employeeCode}]` : ''}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Geography Selection */}
            <div className="space-y-4 border border-emerald-900/30 p-5 rounded-2xl bg-slate-950/40">
              <h4 className="text-xs font-bold text-emerald-400 border-b border-emerald-900/30 pb-2.5 flex items-center gap-2 tracking-wide uppercase">Geography</h4>
              <CascadingLocationFilter
                layout="vertical"
                onLocationChange={(loc) => {
                  setManualCityId(loc.cityId || '');
                  setManualWardId(loc.wardId || '');
                  setManualAreaId(loc.areaId || '');
                  setManualZoneId(loc.zoneId || '');
                }}
              />
            </div>

            {/* Logistics Selection */}
            <div className="space-y-4 border border-emerald-900/30 p-5 rounded-2xl bg-slate-950/40">
              <h4 className="text-xs font-bold text-emerald-400 border-b border-emerald-900/30 pb-2.5 flex items-center gap-2 tracking-wide uppercase">Logistics</h4>
              <div>
                <label className="block text-xs font-semibold text-emerald-300/90 tracking-wide mb-1.5 uppercase">Waste Category</label>
                <select value={manualWasteType} onChange={e => setManualWasteType(e.target.value)} required
                  className="w-full h-11 px-3.5 py-2.5 bg-slate-950/90 border border-slate-800 hover:border-emerald-700/60 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 rounded-xl text-xs font-medium text-slate-100 transition-all outline-none cursor-pointer appearance-none bg-[url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2216%22%20height%3D%2216%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%2310b981%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpath%20d%3D%22m6%209%206%206%206-6%22%2F%3E%3C%2Fsvg%3E')] bg-[length:16px_16px] bg-[right_12px_center] bg-no-repeat pr-10">
                  {['DRY', 'WET', 'MIXED', 'PLASTIC', 'GLASS', 'PAPER', 'E_WASTE', 'HAZARDOUS'].map(w => <option key={w} value={w} className="bg-slate-900 text-slate-100">{w}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-emerald-300/90 tracking-wide mb-1.5 uppercase">Vehicle Assignment</label>
                <select value={manualVehicleId} onChange={e => setManualVehicleId(e.target.value)} required
                  className="w-full h-11 px-3.5 py-2.5 bg-slate-950/90 border border-slate-800 hover:border-emerald-700/60 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 rounded-xl text-xs font-medium text-slate-100 transition-all outline-none cursor-pointer appearance-none bg-[url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2216%22%20height%3D%2216%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%2310b981%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpath%20d%3D%22m6%209%206%206%206-6%22%2F%3E%3C%2Fsvg%3E')] bg-[length:16px_16px] bg-[right_12px_center] bg-no-repeat pr-10">
                  <option value="" className="bg-slate-900 text-slate-100">Select Vehicle</option>
                  {plannerVehicles.map(v => (
                    <option key={v.id} value={v.id} className="bg-slate-900 text-slate-100">{v.vehicleCode} - {v.status} ({v.capacityKg} kg)</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-emerald-300/90 tracking-wide mb-1.5 uppercase">Schedule Date</label>
                <input type="date" value={manualDate} onChange={e => setManualDate(e.target.value)} required
                  className="w-full h-11 px-3.5 py-2.5 bg-slate-950/90 border border-slate-800 hover:border-emerald-700/60 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 rounded-xl text-xs font-medium text-slate-100 transition-all outline-none" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-emerald-300/90 tracking-wide mb-1.5 uppercase">Priority</label>
                <select value={manualPriority} onChange={e => setManualPriority(e.target.value)} required
                  className="w-full h-11 px-3.5 py-2.5 bg-slate-950/90 border border-slate-800 hover:border-emerald-700/60 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 rounded-xl text-xs font-medium text-slate-100 transition-all outline-none cursor-pointer appearance-none bg-[url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2216%22%20height%3D%2216%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%2310b981%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpath%20d%3D%22m6%209%206%206%206-6%22%2F%3E%3C%2Fsvg%3E')] bg-[length:16px_16px] bg-[right_12px_center] bg-no-repeat pr-10">
                  {['LOW', 'NORMAL', 'HIGH', 'URGENT', 'CRITICAL'].map(p => <option key={p} value={p} className="bg-slate-900 text-slate-100">{p}</option>)}
                </select>
              </div>
            </div>
            
            {/* Extended Operations */}
            <div className="md:col-span-3 grid grid-cols-1 md:grid-cols-4 gap-4 border border-emerald-900/30 p-5 rounded-2xl bg-slate-950/40">
              <div>
                <label className="block text-xs font-semibold text-emerald-300/90 tracking-wide mb-1.5 uppercase">Shift Selection</label>
                <select value={manualShiftId} onChange={e => {
                  setManualShiftId(e.target.value);
                  const sh = plannerShifts.find(s => s.id === e.target.value);
                  if (sh) { setManualStartTime(sh.startTime); setManualEndTime(sh.endTime); }
                }} required className="w-full h-11 px-3.5 py-2.5 bg-slate-950/90 border border-slate-800 hover:border-emerald-700/60 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 rounded-xl text-xs font-medium text-slate-100 transition-all outline-none cursor-pointer appearance-none bg-[url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2216%22%20height%3D%2216%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%2310b981%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpath%20d%3D%22m6%209%206%206%206-6%22%2F%3E%3C%2Fsvg%3E')] bg-[length:16px_16px] bg-[right_12px_center] bg-no-repeat pr-10">
                  <option value="" className="bg-slate-900 text-slate-100">Select Shift</option>
                  {plannerShifts.map(s => <option key={s.id} value={s.id} className="bg-slate-900 text-slate-100">{s.name} ({s.startTime}–{s.endTime})</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-emerald-300/90 tracking-wide mb-1.5 uppercase">Custom Start Time</label>
                <input type="time" value={manualStartTime} onChange={e => setManualStartTime(e.target.value)}
                  className="w-full h-11 px-3.5 py-2.5 bg-slate-950/90 border border-slate-800 hover:border-emerald-700/60 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 rounded-xl text-xs font-medium text-slate-100 transition-all outline-none" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-emerald-300/90 tracking-wide mb-1.5 uppercase">Custom End Time</label>
                <input type="time" value={manualEndTime} onChange={e => setManualEndTime(e.target.value)}
                  className="w-full h-11 px-3.5 py-2.5 bg-slate-950/90 border border-slate-800 hover:border-emerald-700/60 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 rounded-xl text-xs font-medium text-slate-100 transition-all outline-none" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-emerald-300/90 tracking-wide mb-1.5 uppercase">Est. Bin Count</label>
                <input type="number" placeholder="Optional" value={manualEstBinCount} onChange={e => setManualEstBinCount(e.target.value)}
                  className="w-full h-11 px-3.5 py-2.5 bg-slate-950/90 border border-slate-800 hover:border-emerald-700/60 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 rounded-xl text-xs font-medium text-slate-100 transition-all outline-none" />
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-emerald-300/90 tracking-wide mb-1.5 uppercase">Est. Duration (mins)</label>
                <input type="number" placeholder="Optional" value={manualEstDuration} onChange={e => setManualEstDuration(e.target.value)}
                  className="w-full h-11 px-3.5 py-2.5 bg-slate-950/90 border border-slate-800 hover:border-emerald-700/60 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 rounded-xl text-xs font-medium text-slate-100 transition-all outline-none" />
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-emerald-300/90 tracking-wide mb-1.5 uppercase">Notes / Instructions</label>
                <input type="text" placeholder="e.g. Heavy traffic route" value={manualNotes} onChange={e => setManualNotes(e.target.value)}
                  className="w-full h-11 px-3.5 py-2.5 bg-slate-950/90 border border-slate-800 hover:border-emerald-700/60 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 rounded-xl text-xs font-medium text-slate-100 transition-all outline-none" />
              </div>
            </div>

          </div>

          <div className="flex justify-end pt-3">
            <button type="submit" disabled={isSubmitting}
              className="w-full md:w-auto h-12 px-8 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 active:scale-[0.99] text-white font-bold tracking-wider rounded-xl shadow-lg shadow-emerald-950/40 transition-all flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed disabled:transform-none cursor-pointer text-xs uppercase">
              {isSubmitting ? 'Validating & Planning...' : 'Save Manual Assignment'}
            </button>
          </div>
        </form>
      )}

      {/* ────── TAB: Assignments ────── */}
      {activeTab === 'assignments' && (
        <div className="space-y-6">
          <div className="flex items-center gap-3 text-xs">
            <label className="text-slate-400">View date:</label>
            <input type="date" value={filterDate} onChange={e => setFilterDate(e.target.value)}
              className="px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-850 text-slate-100 focus:outline-none" />
            <button onClick={() => fetchAssignments(filterDate)}
              className="px-4 py-1.5 rounded-lg border border-slate-800 hover:text-emerald-450 transition">
              Refresh
            </button>
          </div>

          {isLoadingAssignments ? (
            <div className="p-12 text-center text-slate-500 text-sm">Loading assignments...</div>
          ) : assignments.length === 0 ? (
            <div className="p-12 text-center rounded-2xl border border-slate-800 bg-slate-900/40 text-xs">
              <p className="text-slate-400">No assignments found for {filterDate}. Please run the planner above.</p>
            </div>
          ) : (
            <div className="space-y-3 text-xs">
              {assignments.map(a => (
                <div key={a.id} className="rounded-2xl border border-slate-850 bg-slate-900/40 overflow-hidden">
                  <div className="px-6 py-4 flex items-center gap-4">
                    <span className={`px-2.5 py-1 rounded-lg text-xs font-bold border ${WASTE_COLORS[a.wasteType] || WASTE_COLORS.OTHER}`}>
                      {a.wasteType}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-slate-250">
                        {a.team?.name || a.primaryWorker?.user?.name || a.driver?.user?.name || 'Unassigned'} • {a.serviceZone?.name ?? '-'}
                      </div>
                      <div className="text-[10px] text-slate-500 mt-0.5">
                        {new Date(a.assignmentDate).toLocaleDateString()}
                        {a.shift && ` · ${a.shift.name} (${a.shift.startTime}–${a.shift.endTime})`}
                      </div>
                    </div>

                    <span className={`px-2 py-0.5 rounded-md text-xs font-medium border ${STATUS_STYLES[a.status]}`}>
                      {a.status}
                    </span>

                    <button
                      onClick={() => setExpandedAssignment(expandedAssignment === a.id ? null : a.id)}
                      className="p-1.5 rounded-lg border border-slate-700 text-slate-400 text-xs"
                    >
                      {expandedAssignment === a.id ? '▲' : '▼'}
                    </button>
                  </div>

                  {expandedAssignment === a.id && (
                    <div className="border-t border-slate-850 px-6 py-4">
                      {!a.targets || a.targets.length === 0 ? (
                        <p className="text-slate-500 text-[10px]">No collection stops snapshotted.</p>
                      ) : (
                        <div className="space-y-1.5">
                          {a.targets.map(t => (
                            <div key={t.id} className="flex items-center justify-between py-1.5 px-3 rounded bg-slate-950/20 border border-slate-900 text-slate-300">
                              <span>{t.collectionPoint?.address || 'Anonymous Point'}</span>
                              <span className="text-xs text-emerald-400">{t.eligibleBinCount} bin(s)</span>
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
            <button onClick={() => { setShowRespForm(!showRespForm); setErrorMsg(''); setSuccessMsg(''); }}
              className="px-4 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-slate-100 transition">
              {showRespForm ? 'Cancel' : '+ Add Responsibility'}
            </button>
          </div>

          {showRespForm && (
            <form onSubmit={handleCreateResponsibility} className="p-6 rounded-xl border border-slate-850 bg-slate-900/20 space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-400 mb-1">Team</label>
                  <select value={respTeamId} onChange={e => setRespTeamId(e.target.value)} required
                    className="w-full p-2 bg-slate-950 border border-slate-850 rounded text-slate-200">
                    <option value="">Select Team</option>
                    {teams.map(t => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Service Zone</label>
                  <select value={respZoneId} onChange={e => setRespZoneId(e.target.value)} required
                    className="w-full p-2 bg-slate-950 border border-slate-850 rounded text-slate-200">
                    <option value="">Select Zone</option>
                    {zones.map(z => (
                      <option key={z.id} value={z.id}>{z.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              <button type="submit" className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-slate-100 font-bold rounded">
                Save Responsibility
              </button>
            </form>
          )}

          <div className="space-y-2 text-xs">
            {responsibilities.map(r => (
              <div key={r.id} className="p-4 rounded-xl border border-slate-850 bg-slate-950/20 flex justify-between items-center">
                <div>
                  <span className="font-bold text-slate-200 block">{r.team?.name}</span>
                  <span className="text-[10px] text-slate-500">Zone: {r.serviceZone?.name}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
