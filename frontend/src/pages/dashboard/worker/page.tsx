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
  status: 'CREATED' | 'ASSIGNED' | 'ACCEPTED' | 'PLANNED' | 'READY' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED' | 'REJECTED' | 'MISSED';
  teamName: string;
  teamCode: string;
  zoneName: string;
  zoneCode: string;
  areaName: string;
  wardName?: string;
  cityName?: string;
  vehicle?: any;
  shiftName: string;
  shiftTimes: string;
  targets: AssignmentTarget[];
  expected: number;
  collected: number;
  missed: number;
  skipped: number;
  acceptedAt?: string;
  startedAt?: string;
  completedAt?: string;
}

const WASTE_LABELS: Record<string, { label: string; icon: string; color: string }> = {
  DRY: { label: 'Dry Waste', icon: '📦', color: 'text-amber-700 border-amber-200 bg-amber-50' },
  WET: { label: 'Wet Waste', icon: '🥬', color: 'text-emerald-700 border-emerald-200 bg-emerald-50' },
  E_WASTE: { label: 'E-Waste', icon: '💻', color: 'text-purple-700 border-purple-200 bg-purple-50' },
  OTHER: { label: 'Other', icon: '🗑️', color: 'text-slate-600 border-slate-200 bg-slate-50' },
};

export default function WorkerPortalPage() {
  const [assignments, setAssignments] = useState<TodayAssignment[]>([]);
  const [history, setHistory] = useState<TodayAssignment[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [liveToast, setLiveToast] = useState<any>(null);
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

  const fetchTimeoutRef = useRef<any>(null);

  useEffect(() => {
    fetchTodayAssignments();
    fetchWorkHistory();
    fetchNotifications();

    const socket = getSocket('realtime');
    
    // Debounced fetch to avoid multiple rapid refreshes
    const queueFetch = () => {
      if (fetchTimeoutRef.current) clearTimeout(fetchTimeoutRef.current);
      fetchTimeoutRef.current = setTimeout(() => fetchTodayAssignments(), 500);
    };
    const queueNotifFetch = () => fetchNotifications();

    socket.on('connect', () => {
      console.log('Worker reconnected, syncing assignments...');
      queueFetch();
      queueNotifFetch();
    });

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
        const idx = prev.findIndex(a => a.id === newTask.id);
        if (idx !== -1) {
          const nextState = [...prev];
          nextState[idx] = newTask;
          return nextState;
        }
        return [newTask, ...prev];
      });
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

    socket.on('NOTIFICATION', (notif: any) => {
      setLiveToast(notif);
      setNotifications(prev => {
        if (prev.some(n => n.id === notif.id)) return prev;
        return [notif, ...prev];
      });
      setTimeout(() => setLiveToast(null), 8000); // auto-hide after 8s
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
      socket.off('NOTIFICATION');
      socket.disconnect();
    };
  }, []);

  async function handleNotificationClick(notif: any) {
    if (!notif.isRead) {
      try {
        await apiRequest(`/assignments/my-notifications/${notif.id || notif._id}/read`, { method: 'POST' });
        setNotifications(prev => prev.map(n => n.id === (notif.id || notif._id) ? { ...n, isRead: true } : n));
      } catch { /* silent */ }
    }
    
    // Navigate to assignment
    const targetId = notif.assignmentId || notif.metadata?.assignmentId;
    if (targetId) {
      setExpandedId(targetId);
      setTimeout(() => {
        const element = document.getElementById(`assignment-${targetId}`);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
          // Highlight effect
          element.classList.add('ring-2', 'ring-emerald-500', 'ring-offset-2', 'ring-offset-slate-900');
          setTimeout(() => {
            element.classList.remove('ring-2', 'ring-emerald-500', 'ring-offset-2', 'ring-offset-slate-900');
          }, 2000);
        }
      }, 100);
    }
    setLiveToast(null);
  }

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

  async function fetchWorkHistory() {
    try {
      const res = await apiRequest('/assignments/worker/history?limit=20');
      if (res.ok) {
        const data = await res.json();
        setHistory(data.data || []);
      }
    } catch { /* silent for history */ }
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

  function getMockGPS(mode: 'MATCH' | 'MISMATCH' | 'NONE', _target: AssignmentTarget) {
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
    const isExpanded = expandedId === a.id;
    const expanded = isExpanded;
    const isCompleted = a.status === 'COMPLETED';
    const waste = WASTE_LABELS[a.wasteType] || WASTE_LABELS.OTHER;
    const aTargets = a.targets ?? [];
    const completedCount = aTargets.filter(t => t.status !== 'PENDING').length;
    const pendingCount = aTargets.filter(t => t.status === 'PENDING').length;

    return (
      <div key={a.id} id={`assignment-${a.id}`} className={`glass-card overflow-hidden ${
        isCompleted ? 'opacity-75' : ''
      }`}>
        {/* Card Header */}
        <div 
          onClick={() => setExpandedId(isExpanded ? null : a.id)}
          className="p-5 flex items-start gap-4 flex-wrap sm:flex-nowrap cursor-pointer hover:bg-nature-white/50 transition-colors"
        >
          {/* Index + Icon */}
          <div className="shrink-0 flex flex-col items-center gap-1">
            <div className="h-12 w-12 rounded-[16px] bg-nature-lightBg flex items-center justify-center text-2xl shadow-sm">
              {waste.icon}
            </div>
            <div className="text-xs text-slate-500 font-mono font-medium">#{idx + 1}</div>
          </div>

          {/* Main info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`px-2 py-0.5 rounded-md text-xs font-bold border ${waste.color}`}>
                {waste.label}
              </span>
              <span className={`px-2 py-0.5 rounded-md text-xs font-medium border ${
                a.status === 'COMPLETED' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                a.status === 'IN_PROGRESS' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                'bg-amber-50 text-amber-700 border-amber-200'
              }`}>
                {a.status.replace('_', ' ')}
              </span>
            </div>

            <div className="text-base font-bold text-slate-800 mt-2">
              {a.cityName ? `${a.cityName} · ` : ''}{a.wardName ? `${a.wardName} · ` : ''}{a.areaName || a.zoneName || 'Not specified'}
            </div>

            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1.5 text-xs text-slate-600 font-medium">
              <span className="flex items-center gap-1">🚛 Team: {a.teamName || 'Manual'}</span>
              <span className="flex items-center gap-1">🕐 Shift: {a.shiftName || 'Not specified'}</span>
              <span className="flex items-center gap-1">📍 {aTargets?.length || 0} houses</span>
              <span className="flex items-center gap-1">🚚 Vehicle: {a.vehicle?.registrationNumber || 'No vehicle assigned'}</span>
            </div>
          </div>

          {/* Actions */}
          <div className="shrink-0 flex flex-col gap-2 min-w-[140px] pt-1">
            {/* New assignment — show accept/reject */}
            {(a.status === 'CREATED' || a.status === 'ASSIGNED') && (
              <>
                <button
                  onClick={(e) => { e.stopPropagation(); handleAcceptWork(a.id); }}
                  className="w-full btn-primary shadow-sm"
                >
                  Accept
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); handleRejectWork(a.id); }}
                  className="w-full btn-secondary text-xs py-1.5"
                >
                  Reject
                </button>
              </>
            )}

            {/* Accepted — ready to start */}
            {a.status === 'ACCEPTED' && (
              <button
                onClick={(e) => { e.stopPropagation(); handleStartWork(a.id); }}
                className="w-full btn-primary shadow-sm"
              >
                Start Shift
              </button>
            )}

            {/* Legacy statuses that also allow start */}
            {(a.status === 'PLANNED' || a.status === 'READY') && (
              <button
                onClick={(e) => { e.stopPropagation(); handleStartWork(a.id); }}
                className="w-full btn-primary shadow-sm"
              >
                Start Shift
              </button>
            )}

            {a.status === 'IN_PROGRESS' ? (
              <>
                {pendingCount === 0 && aTargets.length > 0 ? (
                  <button
                    onClick={(e) => { e.stopPropagation(); handleCompleteWork(a.id); }}
                    className="w-full btn-primary shadow-sm bg-blue-100 text-blue-800 border-blue-200 hover:bg-blue-200"
                  >
                    Complete
                  </button>
                ) : (
                  <div className="text-right text-xs text-slate-500">
                    <span className="font-bold text-nature-accent">{completedCount}</span> / {aTargets.length} done
                  </div>
                )}
                <button
                  onClick={(e) => { e.stopPropagation(); setExpandedId(expanded ? null : a.id); }}
                  className="w-full px-4 py-1.5 border border-surface-border hover:bg-nature-lightBg text-slate-600 rounded-lg text-xs font-medium transition mt-1"
                >
                  {expanded ? 'Hide Points ↑' : 'Show Points ↓'}
                </button>
              </>
            ) : null}

            {a.status === 'COMPLETED' ? (
              <div className="text-center px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold">
                Completed
              </div>
            ) : null}
          </div>
        </div>

        {/* Collection Points List (Expanded) */}
        {expanded && a.status === 'IN_PROGRESS' && (
          <div className="border-t border-surface-border bg-nature-lightBg/30 p-4">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3 px-2">Collection Route</h3>
            <div className="space-y-3">
              {aTargets.map((t, tIdx) => {
                const isPending = t.status === 'PENDING';
                
                return (
                  <div key={t.id} className={`p-4 rounded-xl border bg-nature-white ${
                    isPending ? 'border-surface-border shadow-sm' :
                    t.status === 'COLLECTED' ? 'border-emerald-200 bg-emerald-50/50' :
                    t.status === 'MISSED' ? 'border-red-200 bg-red-50/50' :
                    'border-amber-200 bg-amber-50/50'
                  }`}>
                    <div className="flex justify-between items-start gap-4">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-bold text-slate-400">#{tIdx + 1}</span>
                          <span className="text-sm font-bold text-slate-800">{t.collectionPointName}</span>
                          {t.priority !== 'NORMAL' && (
                            <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${
                              t.priority === 'CRITICAL' ? 'bg-red-100 text-red-700' : 'bg-orange-100 text-orange-700'
                            }`}>{t.priority}</span>
                          )}
                        </div>
                        <div className="text-xs text-slate-500">
                          Bin: <span className="font-mono text-slate-600">{t.binId}</span> · Fill: {t.binFillLevel}%
                        </div>
                      </div>

                      <div className="shrink-0 flex gap-2">
                        {isPending ? (
                          <>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setActiveTarget(t);
                                setActiveAssignmentId(a.id);
                                setQrCodeInput(t.binId); 
                                setShowQRModal(true);
                              }}
                              className="px-3 py-1.5 bg-nature-accent/10 border border-nature-accent hover:bg-nature-accent hover:text-slate-900 text-nature-earth rounded-lg text-xs font-semibold transition"
                            >
                              Scan & Collect
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setActiveTarget(t);
                                setActiveAssignmentId(a.id);
                                setShowMissModal(true);
                              }}
                              className="px-3 py-1.5 bg-red-50 border border-red-200 hover:bg-red-100 text-red-700 rounded-lg text-xs font-semibold transition"
                            >
                              Miss
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setActiveTarget(t);
                                setActiveAssignmentId(a.id);
                                setShowSkipModal(true);
                              }}
                              className="px-3 py-1.5 bg-amber-50 border border-amber-200 hover:bg-amber-100 text-amber-700 rounded-lg text-xs font-semibold transition"
                            >
                              Skip
                            </button>
                          </>
                        ) : (
                          <span className={`text-xs font-semibold px-2.5 py-1 rounded-lg border ${
                            t.status === 'COLLECTED' ? 'bg-emerald-100 text-emerald-800 border-emerald-200' :
                            t.status === 'MISSED' ? 'bg-red-100 text-red-800 border-red-200' :
                            'bg-amber-100 text-amber-800 border-amber-200'
                          }`}>
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
      
      {/* Live Toast Notification */}
      {liveToast && (
        <div 
          onClick={() => handleNotificationClick(liveToast)}
          className="fixed top-20 right-6 z-50 p-4 rounded-xl shadow-2xl shadow-indigo-900/40 bg-indigo-950/95 border border-indigo-500/50 cursor-pointer hover:bg-indigo-900 transition-all max-w-sm animate-in slide-in-from-right-8 fade-in duration-300"
        >
          <div className="flex items-start gap-3">
            <div className="text-2xl mt-0.5">🔔</div>
            <div>
              <div className="text-sm font-bold text-white">{liveToast.title || 'New Notification'}</div>
              <div className="text-xs text-indigo-200 mt-1 whitespace-pre-line">{liveToast.body}</div>
            </div>
            <button 
              onClick={(e) => { e.stopPropagation(); setLiveToast(null); }}
              className="ml-auto text-indigo-400 hover:text-white"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Welcome Header */}
      <div className="glass-card p-8">
        <div className="text-xs text-nature-earth font-bold uppercase tracking-widest mb-1 flex items-center gap-2">
          <span>🌿</span> Worker Portal
        </div>
        <h1 className="text-3xl font-extrabold text-slate-800 tracking-tight">Today's Work Plan</h1>
        <p className="text-sm text-slate-600 mt-2 font-medium">{today}</p>
      </div>

      {/* Messages */}
      {errorMsg && (
        <div className="p-4 rounded-xl border border-red-200 bg-red-50 text-red-700 text-sm font-medium">{errorMsg}</div>
      )}
      {successMsg && (
        <div className="p-4 rounded-xl border border-nature-accent bg-nature-white/80 text-slate-800 text-sm font-medium">{successMsg}</div>
      )}

      {isLoading ? (
        <div className="glass-card p-16 text-center">
          <div className="h-8 w-8 border-2 border-nature-accent border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-600 text-sm font-medium">Fetching your assignments...</p>
        </div>
      ) : assignments.length === 0 ? (
        <div className="glass-card p-16 text-center">
          <div className="text-5xl mb-4">🌱</div>
          <h2 className="text-slate-800 font-bold mb-2 text-xl">No assignments today</h2>
          <p className="text-slate-600 text-sm">You have no scheduled collection work for today. Check back after your supervisor generates the plan.</p>
        </div>
      ) : (
        <>
          {/* Live Notifications Panel */}
          {unreadNotifications.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-bold text-slate-700 uppercase tracking-widest flex items-center gap-2">
                <span className="animate-pulse h-2 w-2 rounded-full bg-nature-earth inline-block"></span>
                Notifications ({unreadNotifications.length} unread)
              </h2>
              <div className="space-y-2">
                {unreadNotifications.slice(0, 5).map((n: any) => (
                  <div 
                    key={n.id || n._id} 
                    onClick={() => handleNotificationClick(n)}
                    className="flex items-start gap-3 p-4 glass-card cursor-pointer !rounded-xl"
                  >
                    <div className="mt-1 h-2 w-2 rounded-full bg-nature-earth shrink-0"></div>
                    <div>
                      <div className="text-sm font-bold text-slate-800">{n.title}</div>
                      <div className="text-xs text-slate-600 mt-0.5 whitespace-pre-line leading-relaxed">{n.body}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Progress summary */}
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: 'Assignments', value: assignments.length, color: 'text-slate-800' },
              { label: 'Total Houses', value: totalTargets, color: 'text-nature-earth' },
              { label: 'Progress', value: `${progressPct}%`, color: 'text-nature-accent' },
            ].map(s => (
              <div key={s.label} className="glass-card p-5 text-center !rounded-[16px]">
                <div className={`text-3xl font-extrabold ${s.color}`}>{s.value}</div>
                <div className="text-xs text-slate-500 mt-1 font-semibold uppercase tracking-wider">{s.label}</div>
              </div>
            ))}
          </div>

          {/* Progress bar */}
          {totalTargets > 0 && (
            <div className="glass-card p-5">
              <div className="flex justify-between text-xs text-slate-600 font-bold mb-3 uppercase tracking-wider">
                <span>Completed Route</span>
                <span>{completedTargets}/{totalTargets} targets</span>
              </div>
              <div className="h-3 rounded-full bg-surface-border overflow-hidden">
                <div
                  className="h-full rounded-full bg-nature-accent transition-all duration-700"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>
          )}

          {/* Categorized Assignment Cards */}
          <div className="space-y-10">
            {todayItems.length > 0 && (
              <div>
                <h2 className="text-sm font-bold text-slate-700 uppercase tracking-widest mb-4 flex items-center gap-2">
                  <span>📋</span> Active Work
                </h2>
                <div className="space-y-4">
                  {todayItems.map((a, idx) => renderAssignmentCard(a, idx))}
                </div>
              </div>
            )}

            {upcomingList.length > 0 && (
              <div>
                <h2 className="text-sm font-bold text-slate-600 uppercase tracking-widest mb-4 flex items-center gap-2">
                  <span>🔜</span> Upcoming Work
                </h2>
                <div className="space-y-4">
                  {upcomingList.map((a, idx) => renderAssignmentCard(a, idx))}
                </div>
              </div>
            )}

            {completedList.length > 0 && (
              <div>
                <h2 className="text-sm font-bold text-slate-500 uppercase tracking-widest mb-4 flex items-center gap-2">
                  <span>✅</span> Completed Work
                </h2>
                <div className="space-y-4 opacity-75">
                  {completedList.map((a, idx) => renderAssignmentCard(a, idx))}
                </div>
              </div>
            )}
          </div>

          {/* Work History Section */}
          <div className="mt-16 border-t border-surface-border pt-10 space-y-6">
            <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
              <span>🕒</span> Work History
            </h2>
            
            {history.length === 0 ? (
              <div className="glass-card p-8 text-center text-slate-500 text-sm font-medium">
                No historical assignments found.
              </div>
            ) : (
              <div className="space-y-3">
                {history.map((h, idx) => (
                  <div key={h.id || idx} className="glass-card p-5 !rounded-xl flex flex-wrap sm:flex-nowrap items-center justify-between gap-4">
                    <div>
                      <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                        {new Date(h.completedAt || h.assignmentDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </div>
                      <div className="text-base font-bold text-slate-800">
                        {h.cityName ? `${h.cityName} | ` : ''}{h.wardName ? `${h.wardName} | ` : ''}{h.areaName || 'Not specified'}
                      </div>
                      <div className="text-sm text-slate-600 mt-1 font-medium">
                        Shift: {h.shiftName || 'Not specified'} | Houses: {h.expected || 0}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={`text-xs font-bold px-3 py-1.5 inline-block rounded-lg border ${
                        h.status === 'COMPLETED' ? 'text-emerald-700 border-emerald-200 bg-emerald-50' :
                        h.status === 'CANCELLED' ? 'text-red-700 border-red-200 bg-red-50' :
                        'text-slate-600 border-slate-200 bg-slate-50'
                      }`}>
                        {h.status}
                      </div>
                      {h.completedAt && (
                        <div className="text-xs text-slate-500 mt-2 font-medium">
                          Completed: {new Date(h.completedAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

        </>
      )}

      {/* ─── MODAL 1: QR & Collect simulation ─────────────────────────────────── */}
      {showQRModal && activeTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-[24px] border border-surface-border bg-nature-white p-8 space-y-6 shadow-glass-hover">
            <div>
              <h2 className="text-xl font-bold text-slate-800 tracking-tight">Scan & Collect</h2>
              <p className="text-sm text-slate-500 mt-1 font-medium">Point: {activeTarget.collectionPointName}</p>
            </div>

            <div className="space-y-4">
              {/* QR Scan Input */}
              <div className="space-y-2">
                <label className="text-xs text-slate-500 font-bold uppercase tracking-wider">Mock QR Code ID</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={qrCodeInput}
                    onChange={(e) => setQrCodeInput(e.target.value)}
                    placeholder="Enter QR ID, e.g. UL-BIN-DRY-..."
                    className="input-field"
                  />
                  <button
                    onClick={handleVerifyQR}
                    disabled={isVerifyingQR}
                    className="px-4 bg-nature-lightBg border border-nature-neutral/40 hover:border-nature-accent text-slate-700 rounded-[16px] text-sm font-semibold transition"
                  >
                    {isVerifyingQR ? '...' : 'Scan'}
                  </button>
                </div>
                <p className="text-[10px] text-slate-400 font-medium">Valid QR required for E2E resolution.</p>
                {qrError && <p className="text-xs text-red-600 font-medium">{qrError}</p>}
              </div>

              {/* Verified Status */}
              {qrVerificationResult && (
                <div className="p-4 rounded-2xl border border-nature-accent/50 bg-nature-accent/10 space-y-2">
                  <div className="flex items-center justify-between text-xs font-bold text-slate-800">
                    <span className="flex items-center gap-1">✓ Verified Bin Mapped</span>
                    <span>Fill: {qrVerificationResult.fillLevel}%</span>
                  </div>
                  <div className="text-xs text-slate-600 font-medium">
                    <p>Type: {qrVerificationResult.type}</p>
                    <p className="mt-1 text-slate-500">Coords: {qrVerificationResult.collectionPoint.latitude}, {qrVerificationResult.collectionPoint.longitude}</p>
                  </div>
                </div>
              )}

              {/* Evidence Upload */}
              {qrVerificationResult && (
                <div className="space-y-2">
                  <label className="text-xs text-slate-500 font-bold uppercase tracking-wider">Photo Evidence (Optional)</label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleUploadEvidence}
                    className="w-full text-sm text-slate-600 file:mr-4 file:py-2 file:px-4 file:rounded-[12px] file:border-0 file:text-sm file:font-semibold file:bg-nature-lightBg file:text-slate-700 hover:file:bg-nature-accent/20 transition"
                  />
                  {uploadingImage && <p className="text-xs text-blue-600 font-medium">Uploading photo...</p>}
                  {uploadedEvidenceId && <p className="text-xs text-emerald-600 font-medium">Photo attached successfully.</p>}
                </div>
              )}

              {/* GPS Mode Selector */}
              {qrVerificationResult && (
                <div className="space-y-2">
                  <label className="text-xs text-slate-500 font-bold uppercase tracking-wider">GPS Simulation</label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { mode: 'MATCH', label: 'Match', desc: '<100m' },
                      { mode: 'MISMATCH', label: 'Far', desc: '>300m' },
                      { mode: 'NONE', label: 'None', desc: 'No Signal' },
                    ].map((g) => (
                      <button
                        key={g.mode}
                        onClick={() => setGpsMode(g.mode as any)}
                        className={`p-3 rounded-2xl border text-center transition flex flex-col items-center justify-center gap-1 ${
                          gpsMode === g.mode
                            ? 'border-nature-accent bg-nature-accent/10 text-slate-800'
                            : 'border-surface-border bg-nature-lightBg text-slate-500 hover:border-nature-neutral'
                        }`}
                      >
                        <span className="text-xs font-bold">{g.label}</span>
                        <span className="text-[10px] font-medium">{g.desc}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-3 justify-end pt-6 border-t border-surface-border">
              <button
                onClick={() => { setShowQRModal(false); resetExecutionStates(); }}
                className="btn-secondary"
              >
                Cancel
              </button>
              <button
                onClick={handleCollectTarget}
                disabled={!qrVerificationResult}
                className="btn-primary disabled:opacity-50"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL 2: Report Missed ────────────────────────────────────────── */}
      {showMissModal && activeTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-[24px] border border-surface-border bg-nature-white p-8 space-y-6 shadow-glass-hover">
            <div>
              <h2 className="text-xl font-bold text-slate-800 tracking-tight">Report Missed</h2>
              <p className="text-sm text-slate-500 mt-1 font-medium">{activeTarget.collectionPointName}</p>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs text-slate-500 font-bold uppercase tracking-wider">Reason</label>
                <select
                  value={missReason}
                  onChange={(e) => setMissReason(e.target.value)}
                  className="input-field"
                >
                  <option value="ACCESS_BLOCKED">Access Blocked</option>
                  <option value="BIN_NOT_FOUND">Bin Not Found</option>
                  <option value="PROPERTY_INACCESSIBLE">Property Inaccessible</option>
                  <option value="SAFETY_RISK">Safety Risk</option>
                  <option value="VEHICLE_CAPACITY">Vehicle Full</option>
                  <option value="OTHER">Other</option>
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-xs text-slate-500 font-bold uppercase tracking-wider">Notes</label>
                <textarea
                  value={missNotes}
                  onChange={(e) => setMissNotes(e.target.value)}
                  placeholder="Explain the issue..."
                  className="input-field h-24 resize-none"
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs text-slate-500 font-bold uppercase tracking-wider">Photo Evidence</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleUploadEvidence}
                  className="w-full text-sm text-slate-600 file:mr-4 file:py-2 file:px-4 file:rounded-[12px] file:border-0 file:text-sm file:font-semibold file:bg-nature-lightBg file:text-slate-700 hover:file:bg-nature-accent/20 transition"
                />
                {uploadedEvidenceId && <p className="text-xs text-emerald-600 font-medium">Photo attached.</p>}
              </div>
            </div>

            <div className="flex gap-3 justify-end pt-6 border-t border-surface-border">
              <button
                onClick={() => { setShowMissModal(false); resetExecutionStates(); }}
                className="btn-secondary"
              >
                Cancel
              </button>
              <button
                onClick={handleMissTarget}
                className="btn-danger"
              >
                Record Missed
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL 3: Skip Target ─────────────────────────────────────────── */}
      {showSkipModal && activeTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-[24px] border border-surface-border bg-nature-white p-8 space-y-6 shadow-glass-hover">
            <div>
              <h2 className="text-xl font-bold text-slate-800 tracking-tight">Skip Target</h2>
              <p className="text-sm text-slate-500 mt-1 font-medium">{activeTarget.collectionPointName}</p>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs text-slate-500 font-bold uppercase tracking-wider">Reason</label>
                <select
                  value={skipReason}
                  onChange={(e) => setSkipReason(e.target.value)}
                  className="input-field"
                >
                  <option value="BIN_ALREADY_EMPTY">Bin Already Empty</option>
                  <option value="SERVICE_NOT_REQUIRED">Service Not Required</option>
                  <option value="DUPLICATE_TARGET">Duplicate Target</option>
                  <option value="ADMINISTRATIVE_INSTRUCTION">Admin Override</option>
                  <option value="OTHER">Other</option>
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-xs text-slate-500 font-bold uppercase tracking-wider">Notes</label>
                <textarea
                  value={skipNotes}
                  onChange={(e) => setSkipNotes(e.target.value)}
                  placeholder="Explain why this point was skipped..."
                  className="input-field h-24 resize-none"
                />
              </div>
            </div>

            <div className="flex gap-3 justify-end pt-6 border-t border-surface-border">
              <button
                onClick={() => { setShowSkipModal(false); resetExecutionStates(); }}
                className="btn-secondary"
              >
                Cancel
              </button>
              <button
                onClick={handleSkipTarget}
                className="btn-primary"
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
