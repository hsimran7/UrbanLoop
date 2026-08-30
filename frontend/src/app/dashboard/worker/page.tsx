'use client';

import React, { useState, useEffect, useRef } from 'react';
import { apiRequest } from '../../../utils/api';
import { getSocket } from '../../../utils/socket';

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
  status: 'CREATED' | 'ASSIGNED' | 'PLANNED' | 'READY' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
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
  const [notifications, setNotifications] = useState<any[]>([]);
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

  const fetchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    fetchTodayAssignments();
    fetchNotifications();

    const socket = getSocket('realtime');
    
    // Debounced fetch to avoid multiple rapid refreshes
    const queueFetch = () => {
      if (fetchTimeoutRef.current) clearTimeout(fetchTimeoutRef.current);
      fetchTimeoutRef.current = setTimeout(() => fetchTodayAssignments(), 500);
    };
    const queueNotifFetch = () => fetchNotifications();

    socket.on('assignmentCreated', queueFetch);
    socket.on('assignmentUpdated', queueFetch);
    socket.on('assignmentAccepted', queueFetch);
    socket.on('assignmentRejected', queueFetch);
    socket.on('notificationCreated', () => { queueFetch(); queueNotifFetch(); });
    socket.on('notification', queueNotifFetch);
    socket.on('targetCollected', queueFetch);
    socket.on('targetMissed', queueFetch);
    socket.on('targetSkipped', queueFetch);

    // ── Real-Time Task Assignment Feature ──
    socket.on('TASK_ASSIGNED', (newTask: TodayAssignment) => {
      console.log('[WORKER SOCKET] TASK_ASSIGNED RECEIVED', newTask);
      setAssignments(prev => {
        if (prev.some(a => a.id === newTask.id)) return prev;
        return [newTask, ...prev];
      });
      // Also fetch notifications just in case there's an associated notification
      queueNotifFetch();
    });

    socket.on('TASK_STATUS_UPDATED', (data: any) => {
      console.log('[WORKER SOCKET] TASK_STATUS_UPDATED RECEIVED', data);
      if (data.assignmentId && data.status) {
        setAssignments(prev => prev.map(a => a.id === data.assignmentId ? { ...a, status: data.status } : a));
      }
      if (data.status === 'COMPLETED' || data.status === 'CANCELLED') {
         fetchTodayAssignments();
         fetchWorkHistory();
      } else {
         fetchTodayAssignments();
      }
    });

    return () => {
      if (fetchTimeoutRef.current) clearTimeout(fetchTimeoutRef.current);
      socket.off('assignmentCreated', queueFetch);
      socket.off('assignmentUpdated', queueFetch);
      socket.off('assignmentAccepted', queueFetch);
      socket.off('assignmentRejected', queueFetch);
      socket.off('notificationCreated');
      socket.off('notification', queueNotifFetch);
      socket.off('targetCollected', queueFetch);
      socket.off('targetMissed', queueFetch);
      socket.off('targetSkipped', queueFetch);
      socket.off('TASK_ASSIGNED');
      socket.off('TASK_STATUS_UPDATED');
      socket.disconnect();
    };
  }, []);

  async function fetchNotifications() {
    try {
      const res = await apiRequest('/assignments/my-notifications');
      if (res.ok) setNotifications(await res.json());
    } catch { /* silent */ }
  }

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

  async function handleAcceptWork(assignmentId: string) {
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const res = await apiRequest(`/assignments/${assignmentId}/accept`, { method: 'POST' });
      if (res.ok) {
        setSuccessMsg('Assignment accepted!');
        fetchTodayAssignments();
      } else {
        const err = await res.json();
        setErrorMsg(err.message || 'Failed to accept assignment.');
      }
    } catch {
      setErrorMsg('Network error.');
    }
  }

  async function handleRejectWork(assignmentId: string) {
    const reason = prompt('Please provide a reason for rejecting this assignment:');
    if (!reason) return;

    setErrorMsg('');
    try {
      const res = await apiRequest(`/assignments/${assignmentId}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason })
      });
      if (res.ok) {
        setSuccessMsg('Assignment rejected.');
        fetchTodayAssignments();
      } else {
        const err = await res.json();
        setErrorMsg(err.message || 'Failed to reject assignment.');
      }
    } catch {
      setErrorMsg('Network error.');
    }
  }

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

  const categorizeAssignments = () => {
    const todayItems: TodayAssignment[] = [];
    const upcoming: TodayAssignment[] = [];
    const completed: TodayAssignment[] = [];

    assignments.forEach(a => {
      if (a.status === 'COMPLETED' || a.status === 'CANCELLED') {
        completed.push(a);
      } else {
        // Any active task assigned to this worker MUST be displayed on the dashboard!
        todayItems.push(a);
      }
    });
    return { todayItems, upcoming, completed };
  };

  const renderAssignmentCard = (a: TodayAssignment, idx: number) => {
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
              <span>📍 {aTargets.length} collection points</span>
            </div>
          </div>

          {/* Actions */}
          <div className="shrink-0 flex flex-col gap-2 min-w-[140px]">
            {/* New assignment — show accept/reject */}
            {(a.status === 'CREATED' || a.status === 'ASSIGNED') && (
              <>
                <button
                  onClick={() => handleAcceptWork(a.id)}
                  className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-sm font-semibold transition shadow-lg shadow-blue-500/20"
                >
                  ✓ Accept
                </button>
                <button
                  onClick={() => handleRejectWork(a.id)}
                  className="w-full px-3 py-1.5 bg-slate-800 hover:bg-red-500/20 text-slate-300 hover:text-red-400 border border-slate-700 hover:border-red-500/40 rounded-xl text-xs font-medium transition"
                >
                  Reject
                </button>
              </>
            )}

            {/* Accepted — ready to start */}
            {a.status === 'ACCEPTED' && (
              <button
                onClick={() => handleStartWork(a.id)}
                className="w-full px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-sm font-semibold transition shadow-lg shadow-emerald-500/20"
              >
                🚀 Start Shift
              </button>
            )}

            {/* Legacy statuses that also allow start */}
            {(a.status === 'PLANNED' || a.status === 'READY') && (
              <button
                onClick={() => handleStartWork(a.id)}
                className="w-full px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-sm font-semibold transition shadow-lg shadow-emerald-500/20"
              >
                Start Shift
              </button>
            )}

            {a.status === 'IN_PROGRESS' ? (
              <>
                {pendingCount === 0 && aTargets.length > 0 ? (
                  <button
                    onClick={() => handleCompleteWork(a.id)}
                    className="w-full px-4 py-2 bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-400 hover:to-cyan-400 text-white rounded-xl text-sm font-bold shadow-lg shadow-cyan-500/20 transition"
                  >
                    Complete Shift
                  </button>
                ) : (
                  <div className="text-right text-xs text-slate-400">
                    <span className="font-semibold text-emerald-400">{completedCount}</span> / {aTargets.length} done
                  </div>
                )}
                <button
                  onClick={() => setExpandedId(expanded ? null : a.id)}
                  className="w-full px-4 py-1.5 border border-slate-700 hover:bg-slate-800 text-slate-300 rounded-lg text-xs font-medium transition mt-1"
                >
                  {expanded ? 'Hide Points ↑' : 'Show Points ↓'}
                </button>
              </>
            ) : null}

            {a.status === 'COMPLETED' ? (
              <div className="text-right px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold">
                Shift Completed
              </div>
            ) : null}
          </div>
        </div>

        {/* Collection Points List (Expanded) */}
        {expanded && a.status === 'IN_PROGRESS' && (
          <div className="border-t border-slate-800 bg-slate-950 p-4">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3 px-2">Collection Route</h3>
            <div className="space-y-3">
              {aTargets.map((t, tIdx) => {
                const isPending = t.status === 'PENDING';
                
                return (
                  <div key={t.id} className={`p-4 rounded-xl border ${
                    isPending ? 'border-slate-800 bg-slate-900' :
                    t.status === 'COLLECTED' ? 'border-emerald-500/30 bg-emerald-950/20' :
                    t.status === 'MISSED' ? 'border-red-500/30 bg-red-950/20' :
                    'border-cyan-500/30 bg-cyan-950/20'
                  }`}>
                    <div className="flex justify-between items-start gap-4">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-bold text-slate-500">#{tIdx + 1}</span>
                          <span className="text-sm font-semibold text-slate-200">{t.collectionPointName}</span>
                          {t.priority !== 'NORMAL' && (
                            <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${
                              t.priority === 'CRITICAL' ? 'bg-red-500/20 text-red-400' : 'bg-orange-500/20 text-orange-400'
                            }`}>{t.priority}</span>
                          )}
                        </div>
                        <div className="text-xs text-slate-400">
                          Bin: <span className="font-mono text-slate-300">{t.binId}</span> · Fill: {t.binFillLevel}%
                        </div>
                      </div>

                      <div className="shrink-0 flex gap-2">
                        {isPending ? (
                          <>
                            <button
                              onClick={() => {
                                setActiveTarget(t);
                                setActiveAssignmentId(a.id);
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
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  };

  const { todayItems, upcoming: upcomingList, completed: completedList } = categorizeAssignments();
  const unreadNotifications = notifications.filter(n => !n.isRead);

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
          {/* Live Notifications Panel */}
          {unreadNotifications.length > 0 && (
            <div className="space-y-2">
              <h2 className="text-sm font-bold text-blue-400 uppercase tracking-widest flex items-center gap-2">
                <span className="animate-pulse h-2 w-2 rounded-full bg-blue-400 inline-block"></span>
                Notifications ({unreadNotifications.length} unread)
              </h2>
              <div className="space-y-2">
                {unreadNotifications.slice(0, 5).map((n: any) => (
                  <div key={n.id} className="flex items-start gap-3 p-3 rounded-xl border border-blue-500/20 bg-blue-950/10">
                    <div className="mt-1 h-2 w-2 rounded-full bg-blue-400 shrink-0"></div>
                    <div>
                      <div className="text-xs font-semibold text-blue-300">{n.title}</div>
                      <div className="text-xs text-slate-400 mt-0.5">{n.body}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

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

          {/* Categorized Assignment Cards */}
          <div className="space-y-10">
            {todayItems.length > 0 && (
              <div>
                <h2 className="text-sm font-bold text-emerald-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                  <span>📅</span> Today's Assignments
                </h2>
                <div className="space-y-6">
                  {todayItems.map((a, idx) => renderAssignmentCard(a, idx))}
                </div>
              </div>
            )}

            {upcomingList.length > 0 && (
              <div>
                <h2 className="text-sm font-bold text-blue-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                  <span>🔜</span> Upcoming Assignments
                </h2>
                <div className="space-y-6">
                  {upcomingList.map((a, idx) => renderAssignmentCard(a, idx))}
                </div>
              </div>
            )}

            {completedList.length > 0 && (
              <div>
                <h2 className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                  <span>✅</span> Completed Assignments
                </h2>
                <div className="space-y-6 opacity-80">
                  {completedList.map((a, idx) => renderAssignmentCard(a, idx))}
                </div>
              </div>
            )}
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
