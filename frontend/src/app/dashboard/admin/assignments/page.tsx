'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { apiRequest } from '../../../../utils/api';

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
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  generationSource: string;
  team?: { name: string };
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
  PENDING:     'bg-yellow-500/10 text-yellow-300 border-yellow-500/20',
  IN_PROGRESS: 'bg-blue-500/10 text-blue-300 border-blue-500/20',
  COMPLETED:   'bg-emerald-500/10 text-emerald-300 border-emerald-500/20',
  CANCELLED:   'bg-red-500/10 text-red-300 border-red-500/20',
};

const WASTE_COLORS: Record<string, string> = {
  DRY:    'bg-amber-500/10 text-amber-300 border-amber-500/20',
  WET:    'bg-green-500/10 text-green-300 border-green-500/20',
  E_WASTE:'bg-purple-500/10 text-purple-300 border-purple-500/20',
  OTHER:  'bg-slate-500/10 text-slate-300 border-slate-500/20',
};

/* ─────────────────────────── component ─────────────────────────── */
export default function AssignmentsManagementPage() {
  const [activeTab, setActiveTab] = useState<'generate' | 'assignments' | 'responsibilities'>('generate');

  // Generate tab
  const [genDate, setGenDate] = useState(new Date().toISOString().split('T')[0]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [genResult, setGenResult] = useState<GenerationResult | null>(null);

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
    const [teamRes, zoneRes] = await Promise.all([
      apiRequest('/teams'),
      apiRequest('/zones'),
    ]);
    if (teamRes.ok) setTeams(await teamRes.json());
    if (zoneRes.ok) setZones(await zoneRes.json());
  }, []);

  useEffect(() => {
    if (activeTab === 'assignments') fetchAssignments(filterDate);
    if (activeTab === 'responsibilities') { fetchResponsibilities(); fetchTeamsAndZones(); }
  }, [activeTab, filterDate, fetchAssignments, fetchResponsibilities, fetchTeamsAndZones]);

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
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-100">Daily Assignments</h1>
        <p className="text-sm text-slate-400 mt-1">Generate, review and manage daily collection work assignments</p>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-800">
        {([
          { key: 'generate', label: 'Generate Assignments' },
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
      {errorMsg && <div className="p-4 rounded-xl border border-red-500/30 bg-red-950/20 text-red-300 text-sm">{errorMsg}</div>}
      {successMsg && <div className="p-4 rounded-xl border border-emerald-500/30 bg-emerald-950/20 text-emerald-300 text-sm">{successMsg}</div>}

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
                <p className="text-xs text-slate-400 mt-0.5">
                  Resolves today's schedules, maps shifts, validates coverage and snapshots targets atomically
                </p>
              </div>
            </div>

            {/* How it works */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {[
                { icon: '📅', label: 'Resolve Schedules', desc: 'Find all areas with active schedules (respecting exceptions) for the target date' },
                { icon: '🗺️', label: 'Map Service Zones', desc: 'Find eligible service zones with team responsibilities and shift coverage' },
                { icon: '📸', label: 'Snapshot Targets', desc: 'Atomically snapshot all eligible bins into DailyAssignmentTarget records' },
              ].map(step => (
                <div key={step.label} className="p-4 rounded-xl border border-slate-800 bg-slate-900/60">
                  <div className="text-xl mb-2">{step.icon}</div>
                  <div className="text-xs font-semibold text-slate-300 mb-1">{step.label}</div>
                  <div className="text-xs text-slate-500">{step.desc}</div>
                </div>
              ))}
            </div>

            <div className="flex items-end gap-4">
              <div className="flex-1">
                <label className="block text-xs text-slate-400 mb-1">Target Date</label>
                <input type="date" value={genDate} onChange={e => setGenDate(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-slate-100 text-sm focus:outline-none focus:border-emerald-500/50" />
              </div>
              <button type="submit" disabled={isGenerating}
                className="px-6 py-2.5 rounded-xl text-sm font-semibold bg-gradient-to-r from-emerald-500 to-teal-400 text-slate-950 hover:opacity-90 active:scale-95 transition disabled:opacity-50 shadow-lg shadow-emerald-500/20 min-w-[140px]">
                {isGenerating ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="h-4 w-4 border-2 border-slate-950/40 border-t-slate-950 rounded-full animate-spin" />
                    Generating...
                  </span>
                ) : 'Generate Now'}
              </button>
            </div>
          </form>

          {/* Generation Results */}
          {genResult && (
            <div className="space-y-4">
              {/* Stats row */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { label: 'Generated', value: genResult.generated, color: 'text-emerald-400' },
                  { label: 'Skipped', value: genResult.skipped, color: 'text-yellow-400' },
                  { label: 'Warnings', value: genResult.coverageWarnings.length, color: 'text-orange-400' },
                  { label: 'Total Targets', value: genResult.assignments.reduce((s, a) => s + (a._count?.targets ?? a.targets?.length ?? 0), 0), color: 'text-cyan-400' },
                ].map(stat => (
                  <div key={stat.label} className="p-4 rounded-xl border border-slate-800 bg-slate-900/40 text-center">
                    <div className={`text-3xl font-bold ${stat.color}`}>{stat.value}</div>
                    <div className="text-xs text-slate-500 mt-1">{stat.label}</div>
                  </div>
                ))}
              </div>

              {/* Coverage warnings */}
              {genResult.coverageWarnings.length > 0 && (
                <div className="p-5 rounded-xl border border-orange-500/30 bg-orange-950/10 space-y-2">
                  <div className="flex items-center gap-2 text-orange-300 font-semibold text-sm">
                    ⚠️ Coverage Warnings ({genResult.coverageWarnings.length})
                  </div>
                  <ul className="space-y-1">
                    {genResult.coverageWarnings.map((w, i) => (
                      <li key={i} className="text-xs text-orange-300/70 pl-4">• {w}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Generated assignments preview */}
              {genResult.assignments.length > 0 && (
                <div className="rounded-2xl border border-slate-800 bg-slate-900/40 overflow-hidden">
                  <div className="px-6 py-4 border-b border-slate-800 text-sm font-semibold text-slate-200">
                    Generated Assignments
                  </div>
                  <div className="divide-y divide-slate-800/50">
                    {genResult.assignments.map(a => (
                      <div key={a.id} className="px-6 py-4 flex items-center gap-4">
                        <span className={`px-2 py-0.5 rounded-md text-xs font-medium border ${WASTE_COLORS[a.wasteType] || WASTE_COLORS.OTHER}`}>
                          {a.wasteType}
                        </span>
                        <div className="flex-1">
                          <div className="text-sm text-slate-200">
                            {a.team?.name ?? '—'} → {a.serviceZone?.name ?? '—'}
                          </div>
                          <div className="text-xs text-slate-500 mt-0.5">
                            {a.shift?.name} · {a.shift?.startTime}–{a.shift?.endTime} · {a._count?.targets ?? a.targets?.length ?? 0} targets
                          </div>
                        </div>
                        <span className={`px-2 py-0.5 rounded-md text-xs font-medium border ${STATUS_STYLES[a.status]}`}>
                          {a.status}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ────── TAB: Assignments ────── */}
      {activeTab === 'assignments' && (
        <div className="space-y-6">
          {/* Date filter */}
          <div className="flex items-center gap-3">
            <label className="text-xs text-slate-400">View date:</label>
            <input type="date" value={filterDate} onChange={e => setFilterDate(e.target.value)}
              className="px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 text-sm focus:outline-none focus:border-emerald-500/50" />
            <button onClick={() => fetchAssignments(filterDate)}
              className="px-4 py-1.5 rounded-lg text-xs font-medium border border-slate-700 hover:border-emerald-500/40 hover:text-emerald-400 transition">
              Refresh
            </button>
          </div>

          {isLoadingAssignments ? (
            <div className="p-12 text-center text-slate-500 text-sm">Loading assignments...</div>
          ) : assignments.length === 0 ? (
            <div className="p-12 text-center rounded-2xl border border-slate-800 bg-slate-900/40">
              <div className="text-4xl mb-3">📋</div>
              <p className="text-slate-400 text-sm">No assignments found for {filterDate}. Run generation above.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {assignments.map(a => (
                <div key={a.id} className="rounded-2xl border border-slate-800 bg-slate-900/40 overflow-hidden">
                  <div className="px-6 py-4 flex items-center gap-4">
                    {/* Waste type badge */}
                    <span className={`px-2.5 py-1 rounded-lg text-xs font-bold border ${WASTE_COLORS[a.wasteType] || WASTE_COLORS.OTHER}`}>
                      {a.wasteType}
                    </span>

                    {/* Main info */}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-slate-200">
                        {a.team?.name ?? 'Unassigned Team'} → {a.serviceZone?.name ?? '—'}
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        {new Date(a.assignmentDate).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' })}
                        {a.shift && ` · ${a.shift.name} (${a.shift.startTime}–${a.shift.endTime})`}
                      </div>
                    </div>

                    {/* Targets count */}
                    <div className="text-right">
                      <div className="text-lg font-bold text-slate-200">{a._count?.targets ?? 0}</div>
                      <div className="text-xs text-slate-500">targets</div>
                    </div>

                    {/* Status */}
                    <span className={`px-2 py-0.5 rounded-md text-xs font-medium border ${STATUS_STYLES[a.status]}`}>
                      {a.status}
                    </span>

                    {/* Expand */}
                    <button
                      onClick={() => setExpandedAssignment(expandedAssignment === a.id ? null : a.id)}
                      className="p-1.5 rounded-lg border border-slate-700 hover:border-slate-600 transition text-slate-400 text-xs"
                    >
                      {expandedAssignment === a.id ? '▲' : '▼'}
                    </button>
                  </div>

                  {/* Expanded targets */}
                  {expandedAssignment === a.id && (
                    <div className="border-t border-slate-800 px-6 py-4">
                      {!a.targets || a.targets.length === 0 ? (
                        <p className="text-xs text-slate-500">No targets loaded. Fetch with targets included.</p>
                      ) : (
                        <div className="space-y-1">
                          <p className="text-xs text-slate-500 mb-2">Collection point targets:</p>
                          {a.targets.map(t => (
                            <div key={t.id} className="flex items-center justify-between py-1.5 px-3 rounded-lg bg-slate-800/40 text-sm">
                              <span className="text-slate-300">{t.collectionPoint?.address || t.collectionPointId}</span>
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
              className="px-4 py-2 rounded-xl text-sm font-semibold bg-gradient-to-r from-emerald-500 to-teal-400 text-slate-950 hover:opacity-90 active:scale-95 transition shadow-lg shadow-emerald-500/20">
              {showRespForm ? 'Cancel' : '+ Add Responsibility'}
            </button>
          </div>

          {/* Form */}
          {showRespForm && (
            <form onSubmit={handleCreateResponsibility}
              className="p-6 rounded-2xl border border-slate-800 bg-slate-900/60 backdrop-blur space-y-4">
              <h2 className="text-base font-semibold text-slate-200">Assign Team Responsibility</h2>
              <p className="text-xs text-slate-500">
                A responsibility links a team to a service zone for specific waste types. The assignment engine uses this to build daily plans.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Team</label>
                  <select value={respTeamId} onChange={e => setRespTeamId(e.target.value)} required
                    className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 text-sm focus:outline-none focus:border-emerald-500/50">
                    <option value="">— Select team —</option>
                    {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Service Zone</label>
                  <select value={respZoneId} onChange={e => setRespZoneId(e.target.value)} required
                    className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 text-sm focus:outline-none focus:border-emerald-500/50">
                    <option value="">— Select zone —</option>
                    {zones.map(z => <option key={z.id} value={z.id}>{z.name}{z.area ? ` (${z.area.name})` : ''}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Effective From</label>
                  <input type="date" value={respEffFrom} onChange={e => setRespEffFrom(e.target.value)} required
                    className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 text-sm focus:outline-none focus:border-emerald-500/50" />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Effective Until (optional)</label>
                  <input type="date" value={respEffUntil} onChange={e => setRespEffUntil(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 text-sm focus:outline-none focus:border-emerald-500/50" />
                </div>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-2">Waste Types</label>
                <div className="flex flex-wrap gap-2">
                  {WASTE_TYPES.map(wt => (
                    <button key={wt} type="button" onClick={() => toggleWasteType(wt)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
                        respWasteTypes.includes(wt)
                          ? `${WASTE_COLORS[wt]} font-semibold`
                          : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-600'
                      }`}>
                      {wt}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex justify-end">
                <button type="submit" disabled={isSubmitting || respWasteTypes.length === 0}
                  className="px-5 py-2 rounded-xl text-sm font-semibold bg-gradient-to-r from-emerald-500 to-teal-400 text-slate-950 hover:opacity-90 transition disabled:opacity-50">
                  {isSubmitting ? 'Creating...' : 'Create Responsibility'}
                </button>
              </div>
            </form>
          )}

          {/* Responsibilities list */}
          {isLoadingResp ? (
            <div className="p-12 text-center text-slate-500 text-sm">Loading responsibilities...</div>
          ) : responsibilities.length === 0 ? (
            <div className="p-12 text-center rounded-2xl border border-slate-800 bg-slate-900/40">
              <div className="text-4xl mb-3">🔗</div>
              <p className="text-slate-400 text-sm">
                No team responsibilities defined. Add one to enable daily assignment generation.
              </p>
            </div>
          ) : (
            <div className="rounded-2xl border border-slate-800 bg-slate-900/40 overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-800 text-sm font-semibold text-slate-200">
                Team Responsibilities ({responsibilities.length})
              </div>
              <div className="divide-y divide-slate-800/50">
                {responsibilities.map(r => (
                  <div key={r.id} className="px-6 py-4 flex items-center gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-slate-200">
                        {r.team?.name ?? r.teamId} → {r.serviceZone?.name ?? r.serviceZoneId}
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        {r.serviceZone?.area?.name && `Area: ${r.serviceZone.area.name} · `}
                        From {new Date(r.effectiveFrom).toLocaleDateString()}
                        {r.effectiveUntil ? ` until ${new Date(r.effectiveUntil).toLocaleDateString()}` : ' (ongoing)'}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1 justify-end">
                      {r.wasteTypes.map(wt => (
                        <span key={wt} className={`px-2 py-0.5 rounded text-xs font-medium border ${WASTE_COLORS[wt] || WASTE_COLORS.OTHER}`}>
                          {wt}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
