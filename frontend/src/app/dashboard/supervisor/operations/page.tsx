'use client';

import React, { useState, useEffect, useRef } from 'react';
import { apiRequest } from '../../../../utils/api';
import { getSocket } from '../../../../utils/socket';

interface FlaggedTarget {
  targetId: string;
  binId: string;
  collectionPointName: string;
  verificationLevel: 'VERIFIED' | 'PARTIALLY_VERIFIED' | 'UNVERIFIED' | 'FLAGGED';
  distanceFromTarget: number | null;
}

interface ActiveOperation {
  id: string;
  teamName: string;
  teamCode: string;
  zoneName: string;
  areaName: string;
  shiftName: string;
  wasteType: string;
  status: 'CREATED' | 'ASSIGNED' | 'ACCEPTED' | 'STARTED' | 'IN_PROGRESS' | 'PAUSED' | 'COMPLETED' | 'MISSED' | 'CANCELLED';
  expected: number;
  pending: number;
  collected: number;
  missed: number;
  skipped: number;
  progress: number;
  flaggedTargets: FlaggedTarget[];
}

interface TargetDetail {
  id: string;
  collectionPointName: string;
  binId: string;
  binType: string;
  binFillLevel: number;
  status: string;
  addedReason: string;
  priority: string;
  collectedAt: string | null;
  collectedById: string | null;
  evidenceId: string | null;
  reasonCode: string | null;
  notes: string | null;
}

export default function SupervisorOperationsPage() {
  const [ops, setOps] = useState<ActiveOperation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Selected assignment for targets viewer
  const [selectedAssignId, setSelectedAssignId] = useState<string | null>(null);
  const [assignTargets, setAssignTargets] = useState<TargetDetail[]>([]);
  const [loadingTargets, setLoadingTargets] = useState(false);

  // Correction Modal state
  const [correctionTarget, setCorrectionTarget] = useState<TargetDetail | null>(null);
  const [correctedStatus, setCorrectedStatus] = useState<'COLLECTED' | 'MISSED' | 'SKIPPED'>('COLLECTED');
  const [correctionReason, setCorrectionReason] = useState('');
  const [submittingCorrection, setSubmittingCorrection] = useState(false);

  const fetchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    fetchActiveOperations();
    
    const socket = getSocket('realtime');
    const queueFetch = () => {
      if (fetchTimeoutRef.current) clearTimeout(fetchTimeoutRef.current);
      fetchTimeoutRef.current = setTimeout(() => fetchActiveOperations(), 500);
    };

    socket.on('assignmentCreated', queueFetch);
    socket.on('assignmentUpdated', queueFetch);
    socket.on('assignmentAccepted', queueFetch);
    socket.on('assignmentRejected', queueFetch);
    socket.on('assignmentStarted', queueFetch);
    socket.on('assignmentCompleted', queueFetch);
    socket.on('notificationCreated', queueFetch);

    return () => {
      if (fetchTimeoutRef.current) clearTimeout(fetchTimeoutRef.current);
      socket.off('assignmentCreated', queueFetch);
      socket.off('assignmentUpdated', queueFetch);
      socket.off('assignmentAccepted', queueFetch);
      socket.off('assignmentRejected', queueFetch);
      socket.off('assignmentStarted', queueFetch);
      socket.off('assignmentCompleted', queueFetch);
      socket.off('notificationCreated', queueFetch);
      socket.disconnect();
    };
  }, []);

  async function fetchActiveOperations() {
    try {
      const res = await apiRequest('/assignments/active-ops');
      if (res.ok) {
        setOps(await res.json());
      } else {
        setErrorMsg('Failed to load active operations.');
      }
    } catch {
      setErrorMsg('Network error.');
    } finally {
      setIsLoading(false);
    }
  }

  async function handleViewTargets(assignId: string) {
    setSelectedAssignId(assignId);
    setLoadingTargets(true);
    setAssignTargets([]);
    try {
      // Re-use list assignments target resolver by matching our assignment ID
      const res = await apiRequest('/assignments');
      if (res.ok) {
        const list = await res.json();
        const found = list.find((a: any) => a.id === assignId);
        if (found) {
          setAssignTargets(found.targets || []);
        }
      }
    } catch {
      setErrorMsg('Failed to fetch target details.');
    } finally {
      setLoadingTargets(false);
    }
  }

  async function handleSubmitCorrection() {
    if (!correctionTarget || !selectedAssignId) return;
    if (!correctionReason.trim()) {
      alert('Please enter a reason for applying correction.');
      return;
    }

    setSubmittingCorrection(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      const res = await apiRequest(`/assignments/${selectedAssignId}/targets/${correctionTarget.id}/correct`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          correctedStatus,
          correctionReason,
        }),
      });

      if (res.ok) {
        setSuccessMsg('Target correction applied successfully.');
        setCorrectionTarget(null);
        setCorrectionReason('');
        // Reload page states
        fetchActiveOperations();
        handleViewTargets(selectedAssignId);
      } else {
        const err = await res.json();
        setErrorMsg(err.message || 'Failed to apply correction.');
      }
    } catch {
      setErrorMsg('Network error.');
    } finally {
      setSubmittingCorrection(false);
    }
  }

  return (
    <div className="space-y-8 pb-24">
      {/* Header */}
      <div className="p-6 rounded-2xl border border-slate-800 bg-gradient-to-br from-slate-900/80 to-indigo-950/20 backdrop-blur">
        <div className="text-xs text-indigo-400 font-semibold uppercase tracking-widest mb-1">Supervisor Control</div>
        <h1 className="text-2xl font-bold text-slate-100 font-display">Real-Time Operations Dashboard</h1>
        <p className="text-sm text-slate-400 mt-1">Monitor active collection shifts, inspect GPS discrepancies, and apply corrections.</p>
      </div>

      {errorMsg && (
        <div className="p-4 rounded-xl border border-red-500/30 bg-red-950/20 text-red-300 text-sm">{errorMsg}</div>
      )}
      {successMsg && (
        <div className="p-4 rounded-xl border border-emerald-500/30 bg-emerald-950/20 text-emerald-300 text-sm">{successMsg}</div>
      )}

      {/* Main Stats Summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { label: 'Pending / Assigned', val: ops.filter(o => o.status === 'CREATED' || o.status === 'ASSIGNED' || o.status === 'ACCEPTED').length, col: 'text-yellow-400' },
          { label: 'Active Shifts', val: ops.filter(o => o.status === 'IN_PROGRESS').length, col: 'text-blue-400' },
          { label: 'Completed Shifts', val: ops.filter(o => o.status === 'COMPLETED').length, col: 'text-emerald-400' },
          { label: 'Total Bins Serviced', val: ops.reduce((s, o) => s + o.collected, 0), col: 'text-indigo-400' },
          { label: 'Flagged Mismatches', val: ops.reduce((s, o) => s + o.flaggedTargets.length, 0), col: 'text-red-400' },
        ].map((s) => (
          <div key={s.label} className="p-5 rounded-2xl border border-slate-800 bg-slate-900/40 backdrop-blur">
            <div className={`text-3xl font-bold ${s.col}`}>{s.val}</div>
            <div className="text-xs text-slate-500 mt-1.5 uppercase tracking-wider font-semibold">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left column: Active Shifts list */}
        <div className="lg:col-span-2 space-y-4">
          <h2 className="text-lg font-bold text-slate-200">Active Work Assignments</h2>

          {isLoading ? (
            <div className="p-12 text-center border border-slate-800 rounded-2xl bg-slate-900/20">
              <div className="h-6 w-6 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <p className="text-slate-500 text-xs">Loading operational feeds...</p>
            </div>
          ) : ops.length === 0 ? (
            <div className="p-12 text-center border border-slate-800 rounded-2xl bg-slate-900/20">
              <p className="text-slate-400 text-sm">No assignments active today.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {ops.map((op) => (
                <div
                  key={op.id}
                  onClick={() => handleViewTargets(op.id)}
                  className={`p-5 rounded-2xl border transition cursor-pointer flex flex-col gap-4 ${
                    selectedAssignId === op.id
                      ? 'border-indigo-500/50 bg-indigo-950/10'
                      : 'border-slate-800 bg-slate-900/30 hover:border-slate-700'
                  }`}
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <span className="px-2 py-0.5 border border-slate-700 bg-slate-800 text-[10px] font-bold rounded text-slate-300 uppercase">
                        {op.wasteType} Collection
                      </span>
                      <h3 className="text-sm font-semibold text-slate-200 mt-2">
                        {op.zoneName} · {op.areaName}
                      </h3>
                      <div className="text-xs text-slate-500 mt-1">
                        🚚 Team: {op.teamName} ({op.teamCode}) · {op.shiftName}
                      </div>
                    </div>

                    <span className={`px-2 py-0.5 rounded text-xs font-semibold uppercase ${
                      op.status === 'COMPLETED' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                      op.status === 'IN_PROGRESS' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' :
                      'bg-slate-800 text-slate-400 border border-slate-700'
                    }`}>
                      {op.status}
                    </span>
                  </div>

                  {/* Progress bar */}
                  <div>
                    <div className="flex justify-between text-xs text-slate-500 mb-1.5">
                      <span>Shift progress</span>
                      <span>{Math.round(op.progress)}% ({op.collected}/{op.expected} bins)</span>
                    </div>
                    <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-indigo-500 rounded-full transition-all duration-500"
                        style={{ width: `${op.progress}%` }}
                      />
                    </div>
                  </div>

                  <div className="flex justify-between items-center text-xs text-slate-500">
                    <div className="flex gap-4">
                      <span>Collected: <strong className="text-slate-300">{op.collected}</strong></span>
                      <span>Missed: <strong className="text-slate-300">{op.missed}</strong></span>
                      <span>Skipped: <strong className="text-slate-300">{op.skipped}</strong></span>
                    </div>
                    
                    {op.flaggedTargets.length > 0 && (
                      <span className="text-red-400 font-semibold animate-pulse">
                        ⚠️ {op.flaggedTargets.length} GPS Mismatches
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right column: Selected Assignment Target Details */}
        <div className="space-y-4">
          <h2 className="text-lg font-bold text-slate-200">Shifts Details Inspector</h2>

          {!selectedAssignId ? (
            <div className="p-8 text-center border border-slate-800 rounded-2xl bg-slate-900/20">
              <div className="text-3xl mb-2">🔍</div>
              <p className="text-slate-500 text-xs">Select an active daily assignment from the left list to inspect detailed target points.</p>
            </div>
          ) : loadingTargets ? (
            <div className="p-12 text-center border border-slate-800 rounded-2xl bg-slate-900/20">
              <div className="h-5 w-5 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <p className="text-slate-500 text-xs">Inspecting targets...</p>
            </div>
          ) : (
            <div className="space-y-4 max-h-[600px] overflow-y-auto pr-2">
              <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/40">
                <h4 className="text-xs text-slate-400 uppercase tracking-wider font-bold">Route Target Points</h4>
                <p className="text-xs text-slate-500 mt-1">Verify execution timestamps, scanned flags, and trigger overrides.</p>
              </div>

              {assignTargets.map((t) => {
                const isFlagged = ops
                  .find(o => o.id === selectedAssignId)
                  ?.flaggedTargets.some(ft => ft.targetId === t.id);

                return (
                  <div key={t.id} className={`p-4 rounded-xl border bg-slate-900/40 space-y-3 ${
                    isFlagged ? 'border-red-500/30' : 'border-slate-800'
                  }`}>
                    <div className="flex justify-between items-start gap-2">
                      <div>
                        <h4 className="text-xs font-semibold text-slate-200">{t.collectionPointName}</h4>
                        <p className="text-[10px] text-slate-500 mt-0.5">Bin: {t.binId} ({t.binType})</p>
                      </div>

                      <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${
                        t.status === 'COLLECTED' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                        t.status === 'MISSED' ? 'bg-red-500/10 text-red-400 border border-red-500/20' :
                        t.status === 'SKIPPED' ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20' :
                        'bg-slate-800 text-slate-400 border border-slate-700'
                      }`}>
                        {t.status}
                      </span>
                    </div>

                    {isFlagged && (
                      <div className="px-2.5 py-1.5 rounded-lg border border-red-500/20 bg-red-950/10 text-[10px] text-red-400 font-semibold flex items-center gap-1.5">
                        🚨 Warning: Location Mismatch (GPS distance exceeds policy limit)
                      </div>
                    )}

                    {t.status !== 'PENDING' && (
                      <div className="text-[10px] text-slate-500 space-y-0.5 bg-slate-950/20 p-2 rounded">
                        {t.collectedAt && <p>⏱️ Checked: {new Date(t.collectedAt).toLocaleTimeString('en-US')}</p>}
                        {t.reasonCode && <p>❓ Reason: {t.reasonCode}</p>}
                        {t.notes && <p>✍️ Notes: "{t.notes}"</p>}
                        {t.evidenceId && (
                          <div className="mt-2">
                            <a
                              href={`/api/v1/assignments/evidence/${t.evidenceId}`}
                              target="_blank"
                              rel="noreferrer"
                              className="text-indigo-400 hover:text-indigo-300 font-semibold"
                            >
                              🖼️ View Evidence Photo
                            </a>
                          </div>
                        )}
                      </div>
                    )}

                    <div className="flex gap-2 justify-end pt-2 border-t border-slate-800/40">
                      <button
                        onClick={() => {
                          setCorrectionTarget(t);
                          setCorrectedStatus(t.status === 'COLLECTED' ? 'MISSED' : 'COLLECTED');
                        }}
                        className="px-2.5 py-1 border border-indigo-500/30 hover:bg-indigo-500/10 text-indigo-400 rounded text-[10px] font-semibold transition"
                      >
                        Correct Status
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ─── CORRECTION MODAL ──────────────────────────────────────────────── */}
      {correctionTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 space-y-6 shadow-2xl">
            <div>
              <h2 className="text-lg font-bold text-slate-100">Apply Controlled Correction</h2>
              <p className="text-xs text-slate-400 mt-1">Supervisor Override for point: {correctionTarget.collectionPointName}</p>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Corrected Status</label>
                <select
                  value={correctedStatus}
                  onChange={(e) => setCorrectedStatus(e.target.value as any)}
                  className="w-full px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
                >
                  <option value="COLLECTED">COLLECTED (Triggers verified emptying)</option>
                  <option value="MISSED">MISSED</option>
                  <option value="SKIPPED">SKIPPED</option>
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Correction Reason / Audit Note</label>
                <textarea
                  value={correctionReason}
                  onChange={(e) => setCorrectionReason(e.target.value)}
                  placeholder="Explain why correction is required (required for audit logging)..."
                  className="w-full h-24 px-4 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-200 focus:outline-none focus:border-indigo-500 resize-none"
                />
              </div>
            </div>

            <div className="flex gap-3 justify-end pt-4 border-t border-slate-800">
              <button
                onClick={() => setCorrectionTarget(null)}
                className="px-4 py-2 border border-slate-800 hover:border-slate-700 text-slate-400 rounded-xl text-xs font-semibold transition"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmitCorrection}
                disabled={submittingCorrection}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold shadow transition"
              >
                {submittingCorrection ? 'Applying...' : 'Apply Override'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
