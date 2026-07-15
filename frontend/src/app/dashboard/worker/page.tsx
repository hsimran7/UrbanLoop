'use client';

import React, { useState, useEffect } from 'react';
import { apiRequest } from '../../../utils/api';

interface AssignmentTarget {
  id: string;
  collectionPointId: string;
  collectionPointName: string;
  binId: string;
  binType: string;
  binFillLevel: number;
  status: 'PENDING' | 'COLLECTED' | 'MISSED' | 'SKIPPED' | 'CANCELLED';
  addedReason: 'SCHEDULED' | 'NEW_COLLECTION_POINT' | 'MANUAL';
  priority: 'CRITICAL' | 'HIGH' | 'NORMAL';
}

interface TodayAssignment {
  id: string;
  assignmentDate: string;
  wasteType: 'DRY' | 'WET' | 'E_WASTE' | 'OTHER';
  status: 'PLANNED' | 'READY' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  teamName: string;
  teamCode: string;
  zoneName: string;
  zoneCode: string;
  areaName: string;
  shiftName: string;
  shiftTimes: string;
  targets: AssignmentTarget[];
  expected: number;
  collected: number;
  missed: number;
  skipped: number;
}

const WASTE_LABELS: Record<string, { label: string; icon: string; color: string }> = {
  DRY: { label: 'Dry Waste', icon: '📦', color: 'text-amber-400 border-amber-500/30 bg-amber-500/5' },
  WET: { label: 'Wet Waste', icon: '🥬', color: 'text-green-400 border-green-500/30 bg-green-500/5' },
  E_WASTE: { label: 'E-Waste', icon: '💻', color: 'text-purple-400 border-purple-500/30 bg-purple-500/5' },
  OTHER: { label: 'Other', icon: '🗑️', color: 'text-slate-400 border-slate-500/30 bg-slate-500/5' },
};

export default function WorkerPortalPage() {
  const [assignments, setAssignments] = useState<TodayAssignment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Modals / Dialog states
  const [activeTarget, setActiveTarget] = useState<AssignmentTarget | null>(null);
  const [activeAssignmentId, setActiveAssignmentId] = useState<string>('');
  const [showQRModal, setShowQRModal] = useState(false);
  const [showMissModal, setShowMissModal] = useState(false);
  const [showSkipModal, setShowSkipModal] = useState(false);

  // Form states
  const [qrCodeInput, setQrCodeInput] = useState('');
  const [qrVerificationResult, setQrVerificationResult] = useState<any>(null);
  const [qrError, setQrError] = useState('');
  const [isVerifyingQR, setIsVerifyingQR] = useState(false);

  const [missReason, setMissReason] = useState('ACCESS_BLOCKED');
  const [missNotes, setMissNotes] = useState('');
  
  const [skipReason, setSkipReason] = useState('BIN_ALREADY_EMPTY');
  const [skipNotes, setSkipNotes] = useState('');

  // GPS Simulation states
  const [gpsMode, setGpsMode] = useState<'MATCH' | 'MISMATCH' | 'NONE'>('MATCH');
  
  // Image Upload states
  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadedEvidenceId, setUploadedEvidenceId] = useState<string | null>(null);

  const today = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  useEffect(() => {
    fetchTodayAssignments();
  }, []);

  async function fetchTodayAssignments() {
    setIsLoading(true);
    setErrorMsg('');
    try {
      const res = await apiRequest('/assignments/my-today');
      if (res.ok) {
        setAssignments(await res.json());
      } else {
        setErrorMsg("Could not load today's assignments.");
      }
    } catch {
      setErrorMsg('Network error. Please check your connection.');
    } finally {
      setIsLoading(false);
    }
  }

  // ─── Actions ───────────────────────────────────────────────────────────────

  async function handleStartWork(assignmentId: string) {
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const res = await apiRequest(`/assignments/${assignmentId}/start`, {
        method: 'POST',
      });
      if (res.ok) {
        setSuccessMsg('Work plan started successfully. Stay safe!');
        fetchTodayAssignments();
      } else {
        const err = await res.json();
        setErrorMsg(err.message || 'Failed to start assignment.');
      }
    } catch {
      setErrorMsg('Network error.');
    }
  }

  async function handleVerifyQR() {
    if (!qrCodeInput.trim()) {
      setQrError('Please enter or select a QR Code.');
      return;
    }
    setQrError('');
    setIsVerifyingQR(true);
    setQrVerificationResult(null);

    try {
      const res = await apiRequest(`/assignments/${activeAssignmentId}/verify-bin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ qrCodeId: qrCodeInput.trim() }),
      });

      if (res.ok) {
        setQrVerificationResult(await res.json());
      } else {
        const err = await res.json();
        setQrError(err.message || 'QR Verification failed.');
      }
    } catch {
      setQrError('Network error during verification.');
    } finally {
      setIsVerifyingQR(false);
    }
  }

  async function handleUploadEvidence(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingImage(true);
    setErrorMsg('');
    const formData = new FormData();
    formData.append('file', file);

    try {
      // Direct raw fetch for multipart/form-data to avoid apiRequest JSON header issues
      const res = await fetch('/api/v1/assignments/evidence/upload', {
        method: 'POST',
        body: formData,
      });

      if (res.ok) {
        const data = await res.json();
        setUploadedEvidenceId(data.id);
        setSuccessMsg('Evidence photo uploaded successfully!');
      } else {
        const err = await res.json();
        setErrorMsg(err.message || 'Evidence upload failed.');
      }
    } catch {
      setErrorMsg('Network error uploading file.');
    } finally {
      setUploadingImage(false);
    }
  }

  function getMockGPS(mode: 'MATCH' | 'MISMATCH' | 'NONE', target: AssignmentTarget) {
    if (mode === 'NONE') return {};
    
    // Downtown CP coordinates: 12.971598, 77.594562 (seeding pattern)
    // MATCH: within 10 meters of seed coordinates
    if (mode === 'MATCH') {
      return {
        latitude: 12.971590,
        longitude: 77.594560,
        locationAccuracy: 10,
      };
    }
    // MISMATCH: far away (outside Bengaluru coordinates, e.g. New Delhi)
    return {
      latitude: 28.6139,
      longitude: 77.2090,
      locationAccuracy: 25,
    };
  }

  async function handleCollectTarget() {
    if (!activeTarget || !qrVerificationResult) return;
    setErrorMsg('');
    setSuccessMsg('');

    const gps = getMockGPS(gpsMode, activeTarget);
    const clientEventId = `evt-col-${activeTarget.id}-${Date.now()}`;

    try {
      const res = await apiRequest(`/assignments/${activeAssignmentId}/targets/${activeTarget.id}/collect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          qrCodeId: qrVerificationResult.qrCodeId,
          clientEventId,
          evidenceId: uploadedEvidenceId || undefined,
          ...gps,
        }),
      });

      if (res.ok) {
        setSuccessMsg('Target marked as collected successfully.');
        setShowQRModal(false);
        resetExecutionStates();
        fetchTodayAssignments();
      } else {
        const err = await res.json();
        setErrorMsg(err.message || 'Failed to record collection.');
      }
    } catch {
      setErrorMsg('Network error.');
    }
  }

  async function handleMissTarget() {
    if (!activeTarget) return;
    setErrorMsg('');
    setSuccessMsg('');

    const gps = getMockGPS(gpsMode, activeTarget);
    const clientEventId = `evt-miss-${activeTarget.id}-${Date.now()}`;

    try {
      const res = await apiRequest(`/assignments/${activeAssignmentId}/targets/${activeTarget.id}/miss`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reasonCode: missReason,
          clientEventId,
          evidenceId: uploadedEvidenceId || undefined,
          notes: missNotes || undefined,
          ...gps,
        }),
      });

      if (res.ok) {
        setSuccessMsg('Target marked as missed.');
        setShowMissModal(false);
        resetExecutionStates();
        fetchTodayAssignments();
      } else {
        const err = await res.json();
        setErrorMsg(err.message || 'Failed to record miss.');
      }
    } catch {
      setErrorMsg('Network error.');
    }
  }

  async function handleSkipTarget() {
    if (!activeTarget) return;
    setErrorMsg('');
    setSuccessMsg('');

    const gps = getMockGPS(gpsMode, activeTarget);
    const clientEventId = `evt-skip-${activeTarget.id}-${Date.now()}`;

    try {
      const res = await apiRequest(`/assignments/${activeAssignmentId}/targets/${activeTarget.id}/skip`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reasonCode: skipReason,
          clientEventId,
          evidenceId: uploadedEvidenceId || undefined,
          notes: skipNotes || undefined,
          ...gps,
        }),
      });

      if (res.ok) {
        setSuccessMsg('Target marked as skipped.');
        setShowSkipModal(false);
        resetExecutionStates();
        fetchTodayAssignments();
      } else {
        const err = await res.json();
        setErrorMsg(err.message || 'Failed to record skip.');
      }
    } catch {
      setErrorMsg('Network error.');
    }
  }

  async function handleCompleteWork(assignmentId: string) {
    if (!confirm('Are you sure you have completed all collection points for this shift? This will lock execution.')) return;
    setErrorMsg('');
    setSuccessMsg('');

    try {
      const res = await apiRequest(`/assignments/${assignmentId}/complete`, {
        method: 'POST',
      });
      if (res.ok) {
        const summary = await res.json();
        setSuccessMsg(`Shift completed! Expected: ${summary.expected}, Collected: ${summary.collected}, Missed: ${summary.missed}, Skipped: ${summary.skipped}. Completion Rate: ${Math.round(summary.completionRate)}%`);
        fetchTodayAssignments();
      } else {
        const err = await res.json();
        setErrorMsg(err.message || 'Failed to complete assignment.');
      }
    } catch {
      setErrorMsg('Network error.');
    }
  }

  function resetExecutionStates() {
    setActiveTarget(null);
    setQrCodeInput('');
    setQrVerificationResult(null);
    setQrError('');
    setMissReason('ACCESS_BLOCKED');
    setMissNotes('');
    setSkipReason('BIN_ALREADY_EMPTY');
    setSkipNotes('');
    setUploadedEvidenceId(null);
    setGpsMode('MATCH');
  }

  const totalTargets = assignments.reduce((s, a) => s + (a.targets?.length ?? 0), 0);
  const completedTargets = assignments.reduce((s, a) =>
    s + (a.targets?.filter(t => t.status !== 'PENDING').length ?? 0), 0);
  const progressPct = totalTargets > 0 ? Math.round((completedTargets / totalTargets) * 100) : 0;

  return (
    <div className="space-y-8 max-w-3xl pb-24">
      {/* Welcome Header */}
      <div className="p-6 rounded-2xl border border-slate-800 bg-gradient-to-br from-slate-900/80 to-emerald-950/20 backdrop-blur">
        <div className="text-xs text-emerald-400 font-semibold uppercase tracking-widest mb-1">Worker Portal</div>
        <h1 className="text-2xl font-bold text-slate-100">Today's Work Plan</h1>
        <p className="text-sm text-slate-400 mt-1">{today}</p>
      </div>

      {/* Messages */}
      {errorMsg && (
        <div className="p-4 rounded-xl border border-red-500/30 bg-red-950/20 text-red-300 text-sm">{errorMsg}</div>
      )}
      {successMsg && (
        <div className="p-4 rounded-xl border border-emerald-500/30 bg-emerald-950/20 text-emerald-300 text-sm">{successMsg}</div>
      )}

      {isLoading ? (
        <div className="p-16 text-center">
          <div className="h-8 w-8 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-500 text-sm">Fetching your assignments...</p>
        </div>
      ) : assignments.length === 0 ? (
        <div className="p-16 text-center rounded-2xl border border-slate-800 bg-slate-900/40">
          <div className="text-5xl mb-4">🌿</div>
          <h2 className="text-slate-200 font-semibold mb-2">No assignments today</h2>
          <p className="text-slate-500 text-sm">You have no scheduled collection work for today. Check back after your supervisor generates the plan.</p>
        </div>
      ) : (
        <>
          {/* Progress summary */}
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: 'Assignments', value: assignments.length, color: 'text-cyan-400' },
              { label: 'Total Bins', value: totalTargets, color: 'text-emerald-400' },
              { label: 'Progress', value: `${progressPct}%`, color: 'text-teal-400' },
            ].map(s => (
              <div key={s.label} className="p-4 rounded-2xl border border-slate-800 bg-slate-900/40 text-center">
                <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
                <div className="text-xs text-slate-500 mt-1">{s.label}</div>
              </div>
            ))}
          </div>

          {/* Progress bar */}
          {totalTargets > 0 && (
            <div>
              <div className="flex justify-between text-xs text-slate-500 mb-2">
                <span>Completed collection points</span>
                <span>{completedTargets}/{totalTargets} targets</span>
              </div>
              <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-700"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>
          )}

          {/* Assignment Cards */}
          <div className="space-y-6">
            {assignments.map((a, idx) => {
              const waste = WASTE_LABELS[a.wasteType] || WASTE_LABELS.OTHER;
              const expanded = expandedId === a.id;
              const aTargets = a.targets ?? [];
              const completedCount = aTargets.filter(t => t.status !== 'PENDING').length;
              const pendingCount = aTargets.filter(t => t.status === 'PENDING').length;

              return (
                <div key={a.id} className={`rounded-2xl border bg-slate-900/40 overflow-hidden transition ${
                  a.status === 'COMPLETED' ? 'border-emerald-500/20 opacity-75' : 'border-slate-800'
                }`}>
                  {/* Card Header */}
                  <div className="p-5 flex items-start gap-4 flex-wrap sm:flex-nowrap">
                    {/* Index + Icon */}
                    <div className="shrink-0 flex flex-col items-center gap-1">
                      <div className="h-10 w-10 rounded-xl bg-slate-800 flex items-center justify-center text-xl">
                        {waste.icon}
                      </div>
                      <div className="text-xs text-slate-600 font-mono">#{idx + 1}</div>
                    </div>

                    {/* Main info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`px-2 py-0.5 rounded-md text-xs font-bold border ${waste.color}`}>
                          {waste.label}
                        </span>
                        <span className={`px-2 py-0.5 rounded-md text-xs font-medium border ${
                          a.status === 'COMPLETED' ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20' :
                          a.status === 'IN_PROGRESS' ? 'bg-blue-500/10 text-blue-300 border-blue-500/20' :
                          'bg-yellow-500/10 text-yellow-300 border-yellow-500/20'
                        }`}>
                          {a.status.replace('_', ' ')}
                        </span>
                      </div>

                      <div className="text-sm font-semibold text-slate-200 mt-2">
                        {a.zoneName}
                        <span className="ml-1 text-slate-500 font-normal text-xs">· {a.areaName}</span>
                      </div>

                      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1.5 text-xs text-slate-500">
                        <span>🚛 Team: {a.teamName} ({a.teamCode})</span>
                        <span>🕐 Shift: {a.shiftName} ({a.shiftTimes})</span>
                        <span>📍 {aTargets.length} target bins</span>
                      </div>
                    </div>

                    {/* Start / Complete Actions */}
                    <div className="shrink-0 flex flex-col gap-2 w-full sm:w-auto mt-4 sm:mt-0">
                      {(a.status === 'PLANNED' || a.status === 'READY') && (
                        <button
                          onClick={() => handleStartWork(a.id)}
                          className="w-full sm:w-auto px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold shadow transition"
                        >
                          Start Shift
                        </button>
                      )}

                      {a.status === 'IN_PROGRESS' && (
                        <>
                          <button
                            onClick={() => setExpandedId(expanded ? null : a.id)}
                            className="w-full sm:w-auto px-4 py-2 border border-slate-700 hover:border-emerald-500/40 text-slate-300 hover:text-emerald-400 rounded-xl text-xs font-semibold transition"
                          >
                            {expanded ? 'Hide Bins' : 'View Target Bins'}
                          </button>
                          {pendingCount === 0 && (
                            <button
                              onClick={() => handleCompleteWork(a.id)}
                              className="w-full sm:w-auto px-4 py-2 bg-teal-600 hover:bg-teal-500 text-white rounded-xl text-xs font-semibold shadow transition"
                            >
                              Complete Shift
                            </button>
                          )}
                        </>
                      )}

                      {a.status === 'COMPLETED' && (
                        <span className="text-emerald-400 text-xs font-semibold flex items-center gap-1 sm:justify-end">
                          ✓ Completed ({a.collected} Collected, {a.missed} Missed)
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Expanded: target route */}
                  {expanded && a.status === 'IN_PROGRESS' && aTargets.length > 0 && (
                    <div className="border-t border-slate-800 px-5 py-4 space-y-3 bg-slate-950/20">
                      <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider">Bins Route Sequence</p>
                      
                      {aTargets.map((t, ti) => {
                        const statusColors = {
                          PENDING: 'border-slate-800 bg-slate-900/20 text-slate-400',
                          COLLECTED: 'border-emerald-500/20 bg-emerald-950/10 text-emerald-400',
                          MISSED: 'border-red-500/20 bg-red-950/10 text-red-400',
                          SKIPPED: 'border-cyan-500/20 bg-cyan-950/10 text-cyan-400',
                          CANCELLED: 'border-slate-700 bg-slate-900/50 text-slate-500 opacity-60LineThrough',
                        };

                        const priorityColors = {
                          CRITICAL: 'bg-red-500/10 text-red-400 border-red-500/20',
                          HIGH: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
                          NORMAL: 'bg-slate-800 text-slate-400 border-slate-700',
                        };

                        return (
                          <div
                            key={t.id}
                            className={`flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 rounded-xl border transition ${statusColors[t.status]}`}
                          >
                            <div className="flex items-start gap-3">
                              {/* Sequence index */}
                              <div className="h-7 w-7 rounded-full bg-slate-800 flex items-center justify-center text-xs font-bold text-slate-300 mt-0.5">
                                {ti + 1}
                              </div>

                              <div>
                                <div className="text-sm font-semibold text-slate-200">
                                  {t.collectionPointName}
                                </div>
                                <div className="text-xs text-slate-500 mt-0.5 font-mono">
                                  Bin ID: {t.binId} · Type: {t.binType} ({t.binFillLevel}%)
                                </div>
                                
                                <div className="flex gap-2 mt-2">
                                  {t.addedReason === 'NEW_COLLECTION_POINT' && (
                                    <span className="px-1.5 py-0.5 bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded text-[10px] font-bold uppercase tracking-wider">
                                      ✨ NewCP
                                    </span>
                                  )}
                                  <span className={`px-1.5 py-0.5 border rounded text-[10px] font-bold uppercase tracking-wider ${priorityColors[t.priority]}`}>
                                    {t.priority}
                                  </span>
                                </div>
                              </div>
                            </div>

                            {/* Target status / action controls */}
                            <div className="flex items-center gap-2 self-end md:self-auto">
                              {t.status === 'PENDING' ? (
                                <>
                                  <button
                                    onClick={() => {
                                      setActiveTarget(t);
                                      setActiveAssignmentId(a.id);
                                      // Pre-fill target bin QR for easy simulator scanning
                                      setQrCodeInput(t.binId); 
                                      setShowQRModal(true);
                                    }}
                                    className="px-3 py-1.5 bg-emerald-600/20 border border-emerald-500/30 hover:bg-emerald-600/40 text-emerald-300 rounded-lg text-xs font-medium transition"
                                  >
                                    Scan & Collect
                                  </button>
                                  <button
                                    onClick={() => {
                                      setActiveTarget(t);
                                      setActiveAssignmentId(a.id);
                                      setShowMissModal(true);
                                    }}
                                    className="px-3 py-1.5 bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 text-red-300 rounded-lg text-xs font-medium transition"
                                  >
                                    Miss
                                  </button>
                                  <button
                                    onClick={() => {
                                      setActiveTarget(t);
                                      setActiveAssignmentId(a.id);
                                      setShowSkipModal(true);
                                    }}
                                    className="px-3 py-1.5 bg-cyan-500/10 border border-cyan-500/20 hover:bg-cyan-500/20 text-cyan-300 rounded-lg text-xs font-medium transition"
                                  >
                                    Skip
                                  </button>
                                </>
                              ) : (
                                <span className="text-xs font-semibold px-2.5 py-1 bg-slate-800 rounded-lg border border-slate-700">
                                  {t.status}
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Refresh button */}
          <div className="flex justify-center">
            <button
              onClick={fetchTodayAssignments}
              className="px-5 py-2 rounded-xl text-sm font-medium border border-slate-700 hover:border-emerald-500/40 hover:text-emerald-400 transition"
            >
              ↻ Refresh Plan
            </button>
          </div>
        </>
      )}

      {/* ─── MODAL 1: QR & Collect simulation ─────────────────────────────────── */}
      {showQRModal && activeTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 space-y-6 shadow-2xl">
            <div>
              <h2 className="text-lg font-bold text-slate-100">Scan & Collect Bin</h2>
              <p className="text-xs text-slate-400 mt-1">Simulating QR Scanner for CP target: {activeTarget.collectionPointName}</p>
            </div>

            <div className="space-y-4">
              {/* QR Scan Input */}
              <div className="space-y-2">
                <label className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Mock QR Code ID</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={qrCodeInput}
                    onChange={(e) => setQrCodeInput(e.target.value)}
                    placeholder="Enter QR ID, e.g. UL-BIN-DRY-..."
                    className="flex-1 px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-200 focus:outline-none focus:border-emerald-500"
                  />
                  <button
                    onClick={handleVerifyQR}
                    disabled={isVerifyingQR}
                    className="px-4 bg-slate-800 border border-slate-700 hover:border-emerald-500/40 text-emerald-400 rounded-xl text-xs font-semibold transition"
                  >
                    {isVerifyingQR ? 'Verifying...' : 'Scan QR'}
                  </button>
                </div>
                <p className="text-[10px] text-slate-500">Note: E2E code resolution requires providing the valid QR mapped to the target bin.</p>
                {qrError && <p className="text-xs text-red-400">{qrError}</p>}
              </div>

              {/* Verified Status */}
              {qrVerificationResult && (
                <div className="p-4 rounded-xl border border-emerald-500/20 bg-emerald-950/10 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-emerald-400 font-bold uppercase tracking-wider flex items-center gap-1">
                      ✓ Verified Bin Mapped
                    </span>
                    <span className="text-slate-500">Fill: {qrVerificationResult.fillLevel}%</span>
                  </div>
                  <div className="text-xs text-slate-300">
                    <p>Bin Type: {qrVerificationResult.type}</p>
                    <p className="mt-1 text-slate-400">Point Coordinates: {qrVerificationResult.collectionPoint.latitude}, {qrVerificationResult.collectionPoint.longitude}</p>
                  </div>
                </div>
              )}

              {/* Evidence Upload */}
              {qrVerificationResult && (
                <div className="space-y-2">
                  <label className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Photo Evidence (Image files only)</label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleUploadEvidence}
                    className="w-full text-xs text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border file:border-slate-800 file:text-xs file:font-semibold file:bg-slate-950 file:text-slate-300 hover:file:border-emerald-500/40 transition"
                  />
                  {uploadingImage && <p className="text-[10px] text-cyan-400">Uploading photo...</p>}
                  {uploadedEvidenceId && <p className="text-[10px] text-emerald-400">Photo successfully uploaded and attached.</p>}
                </div>
              )}

              {/* GPS Mode Selector */}
              {qrVerificationResult && (
                <div className="space-y-2">
                  <label className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Simulate GPS Distance Policy</label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { mode: 'MATCH', label: 'Close Match (<=100m)', desc: 'Verified' },
                      { mode: 'MISMATCH', label: 'Far Away (>300m)', desc: 'Flagged' },
                      { mode: 'NONE', label: 'No GPS Signal', desc: 'Unverified' },
                    ].map((g) => (
                      <button
                        key={g.mode}
                        onClick={() => setGpsMode(g.mode as any)}
                        className={`p-2.5 rounded-xl border text-center transition flex flex-col items-center justify-center gap-1 ${
                          gpsMode === g.mode
                            ? 'border-emerald-500 bg-emerald-950/20 text-emerald-300'
                            : 'border-slate-800 bg-slate-950/40 text-slate-400 hover:border-slate-700'
                        }`}
                      >
                        <span className="text-[10px] font-bold">{g.label}</span>
                        <span className="text-[8px] opacity-75">{g.desc}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-3 justify-end pt-4 border-t border-slate-800">
              <button
                onClick={() => {
                  setShowQRModal(false);
                  resetExecutionStates();
                }}
                className="px-4 py-2 border border-slate-800 hover:border-slate-700 text-slate-400 rounded-xl text-xs font-semibold transition"
              >
                Cancel
              </button>
              <button
                onClick={handleCollectTarget}
                disabled={!qrVerificationResult}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-xl text-xs font-semibold shadow transition"
              >
                Confirm Collection
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL 2: Report Missed ────────────────────────────────────────── */}
      {showMissModal && activeTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 space-y-6 shadow-2xl">
            <div>
              <h2 className="text-lg font-bold text-slate-100">Report Missed Collection Point</h2>
              <p className="text-xs text-slate-400 mt-1">Record why collection could not be completed for {activeTarget.collectionPointName}</p>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Miss Reason</label>
                <select
                  value={missReason}
                  onChange={(e) => setMissReason(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-200 focus:outline-none focus:border-emerald-500"
                >
                  <option value="ACCESS_BLOCKED">Access Blocked (Locked gate, vehicle block)</option>
                  <option value="BIN_NOT_FOUND">Bin Not Found</option>
                  <option value="PROPERTY_INACCESSIBLE">Property Inaccessible</option>
                  <option value="SAFETY_RISK">Safety Risk (Aggressive animals, safety hazards)</option>
                  <option value="VEHICLE_CAPACITY">Vehicle Capacity Exceeded</option>
                  <option value="OTHER">Other Reason</option>
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Detailed Notes</label>
                <textarea
                  value={missNotes}
                  onChange={(e) => setMissNotes(e.target.value)}
                  placeholder="Explain the issue..."
                  className="w-full h-24 px-4 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-200 focus:outline-none focus:border-emerald-500 resize-none"
                />
              </div>

              {/* Photo Evidence Optional */}
              <div className="space-y-2">
                <label className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Photo Evidence (Optional)</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleUploadEvidence}
                  className="w-full text-xs text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border file:border-slate-800 file:text-xs file:font-semibold file:bg-slate-950 file:text-slate-300 hover:file:border-emerald-500/40 transition"
                />
                {uploadedEvidenceId && <p className="text-[10px] text-emerald-400">Photo attached successfully.</p>}
              </div>
            </div>

            <div className="flex gap-3 justify-end pt-4 border-t border-slate-800">
              <button
                onClick={() => {
                  setShowMissModal(false);
                  resetExecutionStates();
                }}
                className="px-4 py-2 border border-slate-800 hover:border-slate-700 text-slate-400 rounded-xl text-xs font-semibold transition"
              >
                Cancel
              </button>
              <button
                onClick={handleMissTarget}
                className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-xl text-xs font-semibold shadow transition"
              >
                Record Missed
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL 3: Skip Target ─────────────────────────────────────────── */}
      {showSkipModal && activeTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 space-y-6 shadow-2xl">
            <div>
              <h2 className="text-lg font-bold text-slate-100">Skip Target Point</h2>
              <p className="text-xs text-slate-400 mt-1">Intentional skip with authorized reasoning for {activeTarget.collectionPointName}</p>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Skip Reason</label>
                <select
                  value={skipReason}
                  onChange={(e) => setSkipReason(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-200 focus:outline-none focus:border-emerald-500"
                >
                  <option value="BIN_ALREADY_EMPTY">Bin Already Empty</option>
                  <option value="SERVICE_NOT_REQUIRED">Service Not Required Today</option>
                  <option value="DUPLICATE_TARGET">Duplicate Target</option>
                  <option value="ADMINISTRATIVE_INSTRUCTION">Administrative Instruction (Supervisor Override)</option>
                  <option value="OTHER">Other Reason</option>
                </select>
                {skipReason === 'ADMINISTRATIVE_INSTRUCTION' && (
                  <p className="text-[10px] text-amber-400">⚠️ Skip by Administrative Instruction requires supervisor credentials to confirm.</p>
                )}
              </div>

              <div className="space-y-2">
                <label className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Detailed Notes</label>
                <textarea
                  value={skipNotes}
                  onChange={(e) => setSkipNotes(e.target.value)}
                  placeholder="Explain why this point was skipped..."
                  className="w-full h-24 px-4 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-200 focus:outline-none focus:border-emerald-500 resize-none"
                />
              </div>
            </div>

            <div className="flex gap-3 justify-end pt-4 border-t border-slate-800">
              <button
                onClick={() => {
                  setShowSkipModal(false);
                  resetExecutionStates();
                }}
                className="px-4 py-2 border border-slate-800 hover:border-slate-700 text-slate-400 rounded-xl text-xs font-semibold transition"
              >
                Cancel
              </button>
              <button
                onClick={handleSkipTarget}
                className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl text-xs font-semibold shadow transition"
              >
                Confirm Skip
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
