import React, { useState, useEffect } from 'react';
import { apiRequest } from '../../../../utils/api';

interface ServiceRequest {
  id: string;
  requestCode: string;
  title: string;
  description: string;
  priority: string;
  status: string;
  submittedAt: string;
  category: { id: string; name: string };
  assignedDepartmentId: string | null;
  assignedUserId: string | null;
  assignedTeamId: string | null;
  sla?: {
    resolutionDueAt: string;
    acknowledgmentDueAt: string;
    acknowledgmentBreached: boolean;
    resolutionBreached: boolean;
  };
}

export default function GovernmentServiceRequestsPage() {
  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);

  // Filter conditions
  const [filterPriority, setFilterPriority] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterDept, setFilterDept] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Operations Modals State
  const [selectedRequest, setSelectedRequest] = useState<ServiceRequest | null>(null);
  const [comments, setComments] = useState<any[]>([]);
  const [newComment, setNewComment] = useState('');
  const [commentVisibility, setCommentVisibility] = useState<'PUBLIC' | 'INTERNAL'>('INTERNAL');

  // Operations Form State
  const [triagePriority, setTriagePriority] = useState('');
  const [triageCategory, setTriageCategory] = useState('');
  const [assignDeptId, setAssignDeptId] = useState('');
  const [assignUserId, setAssignUserId] = useState('');
  const [assignReason, setAssignReason] = useState('');

  // Resolution Form State
  const [resCode, setResCode] = useState('COLLECTION_COMPLETED');
  const [resSummary, setResSummary] = useState('');
  const [resEvidence, setResEvidence] = useState('');

  // Alert panels
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    setLoading(true);
    try {
      const [reqRes, deptRes, catRes] = await Promise.all([
        apiRequest('/service-requests'),
        apiRequest('/departments'), // Let's mock fallback if not found
        apiRequest('/service-requests/categories'),
      ]);

      if (reqRes.ok) setRequests(await reqRes.json());

      if (deptRes.ok) {
        setDepartments(await deptRes.json());
      } else {
        setDepartments([]); // No fallback mock — departments come from DB
      }

      if (catRes.ok) {
        setCategories(await catRes.json());
      } else {
        setCategories([]); // No fallback mock — categories come from DB
      }
    } catch {
      setErrorMsg('Failed to load operations request feed.');
    } finally {
      setLoading(false);
    }
  }

  async function handleLoadRequestDetails(req: ServiceRequest) {
    setSuccessMsg('');
    setErrorMsg('');
    setNewComment('');
    try {
      const detailsRes = await apiRequest(`/service-requests/${req.id}`);
      if (detailsRes.ok) {
        setSelectedRequest(await detailsRes.json());
      } else {
        setSelectedRequest(req);
      }
      
      const res = await apiRequest(`/service-requests/${req.id}/comments`);
      if (res.ok) setComments(await res.json());
    } catch {
      setErrorMsg('Failed to load dialogue log.');
    }
  }

  async function handleTriageAssign() {
    if (!selectedRequest) return;
    setErrorMsg('');
    setSuccessMsg('');

    try {
      // 1. Triage priority if set
      if (triagePriority || triageCategory) {
        const tRes = await apiRequest(`/service-requests/${selectedRequest.id}/triage`, {
          method: 'POST',
          body: JSON.stringify({
            categoryId: triageCategory || undefined,
            priority: triagePriority || undefined,
          }),
        });
        if (!tRes.ok) {
          const err = await tRes.json();
          throw new Error(err.message || 'Triage failed.');
        }
      }

      // 2. Assign department/user if set
      if (assignDeptId || assignUserId) {
        const aRes = await apiRequest(`/service-requests/${selectedRequest.id}/assign`, {
          method: 'POST',
          body: JSON.stringify({
            assignedDepartmentId: assignDeptId || undefined,
            assignedUserId: assignUserId || undefined,
            reason: assignReason || undefined,
          }),
        });
        if (!aRes.ok) {
          const err = await aRes.json();
          throw new Error(err.message || 'Assignment failed.');
        }
      }

      setSuccessMsg('Triage and Assignment action completed.');
      fetchData();
      setSelectedRequest(null);
    } catch (e: any) {
      setErrorMsg(e.message || 'Operations update failed.');
    }
  }

  async function handleStartWork() {
    if (!selectedRequest) return;
    try {
      const res = await apiRequest(`/service-requests/${selectedRequest.id}/start`, {
        method: 'POST',
      });
      if (res.ok) {
        setSuccessMsg('Work started. Ticket status is now IN_PROGRESS.');
        fetchData();
        handleLoadRequestDetails(selectedRequest);
      } else {
        const err = await res.json();
        setErrorMsg(err.message || 'Failed to start work.');
      }
    } catch {
      setErrorMsg('Network error.');
    }
  }

  async function handleRequestInfo() {
    if (!selectedRequest) return;
    const notes = prompt('Enter the information needed from the citizen:');
    if (!notes) return;

    try {
      const res = await apiRequest(`/service-requests/${selectedRequest.id}/request-information`, {
        method: 'POST',
        body: JSON.stringify({ notes }),
      });
      if (res.ok) {
        setSuccessMsg('Information requested. Resolution SLA resolution timer paused.');
        fetchData();
        handleLoadRequestDetails(selectedRequest);
      } else {
        const err = await res.json();
        setErrorMsg(err.message || 'Failed to request details.');
      }
    } catch {
      setErrorMsg('Network error.');
    }
  }

  async function handleResolve() {
    if (!selectedRequest) return;
    try {
      const res = await apiRequest(`/service-requests/${selectedRequest.id}/resolve`, {
        method: 'POST',
        body: JSON.stringify({
          resolutionCode: resCode,
          resolutionSummary: resSummary,
          evidenceId: resEvidence || undefined,
        }),
      });
      if (res.ok) {
        setSuccessMsg('Request marked RESOLVED.');
        fetchData();
        setSelectedRequest(null);
      } else {
        const err = await res.json();
        setErrorMsg(err.message || 'Failed to resolve request.');
      }
    } catch {
      setErrorMsg('Network error resolving.');
    }
  }

  async function handleClose() {
    if (!selectedRequest) return;
    try {
      const res = await apiRequest(`/service-requests/${selectedRequest.id}/close`, {
        method: 'POST',
      });
      if (res.ok) {
        setSuccessMsg('Request CLOSED successfully.');
        fetchData();
        setSelectedRequest(null);
      } else {
        const err = await res.json();
        setErrorMsg(err.message || 'Failed to close request.');
      }
    } catch {
      setErrorMsg('Network error closing.');
    }
  }

  async function handleCancel() {
    if (!selectedRequest) return;
    const reason = prompt('Please enter cancellation reason:');
    if (!reason) return;

    try {
      const res = await apiRequest(`/service-requests/${selectedRequest.id}/cancel`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      });
      if (res.ok) {
        setSuccessMsg('Request CANCELLED successfully.');
        fetchData();
        setSelectedRequest(null);
      } else {
        const err = await res.json();
        setErrorMsg(err.message || 'Failed to cancel request.');
      }
    } catch {
      setErrorMsg('Network error cancelling.');
    }
  }

  async function handlePostComment() {
    if (!newComment.trim() || !selectedRequest) return;
    try {
      const res = await apiRequest(`/service-requests/${selectedRequest.id}/comments`, {
        method: 'POST',
        body: JSON.stringify({
          message: newComment,
          visibility: commentVisibility,
        }),
      });
      if (res.ok) {
        setNewComment('');
        const cRes = await apiRequest(`/service-requests/${selectedRequest.id}/comments`);
        if (cRes.ok) setComments(await cRes.json());
      }
    } catch {
      setErrorMsg('Failed to post comment.');
    }
  }

  // Filter logic
  const filteredRequests = requests.filter((r) => {
    const matchesSearch = r.requestCode.toLowerCase().includes(searchQuery.toLowerCase()) || r.title.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesPriority = filterPriority ? r.priority === filterPriority : true;
    const matchesStatus = filterStatus ? r.status === filterStatus : true;
    const matchesDept = filterDept ? r.assignedDepartmentId === filterDept : true;
    return matchesSearch && matchesPriority && matchesStatus && matchesDept;
  });

  return (
    <div className="space-y-8 pb-24 text-slate-800">
      
      {/* Header */}
      <div className="glass-card p-8 flex justify-between items-center">
        <div>
          <div className="text-xs text-nature-earth font-extrabold uppercase tracking-widest mb-1">Operations Control</div>
          <h1 className="text-3xl font-extrabold text-slate-800 tracking-tight font-display">Municipal Support Board</h1>
          <p className="text-sm text-slate-600 mt-2 font-medium">Triage, allocate, resolve service requests, and manage SLA escalations.</p>
        </div>
      </div>

      {successMsg && <div className="p-4 rounded-xl border border-nature-accent bg-emerald-50 text-emerald-700 text-sm font-medium">{successMsg}</div>}
      {errorMsg && <div className="p-4 rounded-xl border border-red-200 bg-red-50 text-red-700 text-sm font-medium">{errorMsg}</div>}

      {/* Global metrics grid */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
        {[
          { label: 'Unassigned Requests', val: requests.filter(r => !r.assignedDepartmentId).length, color: 'text-amber-700' },
          { label: 'Open Tickets', val: requests.filter(r => r.status !== 'CLOSED' && r.status !== 'RESOLVED' && r.status !== 'CANCELLED' && r.status !== 'REJECTED').length, color: 'text-sky-700' },
          { label: 'SLA Warnings / At Risk', val: requests.filter(r => r.sla?.acknowledgmentBreached || r.sla?.resolutionBreached).length, color: 'text-rose-700 font-black' },
          { label: 'Escalated Breaches', val: requests.filter(r => r.sla?.resolutionBreached).length, color: 'text-red-700 font-black' },
          { label: 'Reopened Complaints', val: requests.filter(r => r.status === 'REOPENED').length, color: 'text-amber-700' },
          { label: 'Resolved (Awaiting Close)', val: requests.filter(r => r.status === 'RESOLVED').length, color: 'text-emerald-700' },
        ].map((s) => (
          <div key={s.label} className="glass-card p-4 text-center">
            <div className={`text-2xl font-black ${s.color}`}>{s.val}</div>
            <div className="text-[9px] text-slate-500 mt-1 uppercase font-extrabold tracking-wider">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Queue filter controls */}
      <div className="glass-card p-5 flex flex-wrap gap-4 items-end text-xs">
        <div className="space-y-1.5 flex-1 min-w-[200px]">
          <label className="text-slate-600 font-bold block">Search query</label>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search request code, title..."
            className="input-field !py-2"
          />
        </div>

        <div className="space-y-1.5 min-w-[130px]">
          <label className="text-slate-600 font-bold block">Priority</label>
          <select
            value={filterPriority}
            onChange={(e) => setFilterPriority(e.target.value)}
            className="input-field !py-2"
          >
            <option value="">All Priorities</option>
            <option value="LOW">LOW</option>
            <option value="NORMAL">NORMAL</option>
            <option value="HIGH">HIGH</option>
            <option value="URGENT">URGENT</option>
            <option value="CRITICAL">CRITICAL</option>
          </select>
        </div>

        <div className="space-y-1.5 min-w-[150px]">
          <label className="text-slate-600 font-bold block">Status</label>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="input-field !py-2"
          >
            <option value="">All Statuses</option>
            <option value="SUBMITTED">SUBMITTED</option>
            <option value="TRIAGED">TRIAGED</option>
            <option value="ASSIGNED">ASSIGNED</option>
            <option value="IN_PROGRESS">IN_PROGRESS</option>
            <option value="WAITING_FOR_INFORMATION">WAITING_FOR_INFO</option>
            <option value="RESOLVED">RESOLVED</option>
            <option value="REOPENED">REOPENED</option>
            <option value="CLOSED">CLOSED</option>
          </select>
        </div>

        <div className="space-y-1.5 min-w-[160px]">
          <label className="text-slate-400 font-medium block">Assigned Department</label>
          <select
            value={filterDept}
            onChange={(e) => setFilterDept(e.target.value)}
            className="w-full px-3 py-2 bg-slate-950 border border-slate-850 rounded-lg text-slate-300 focus:outline-none focus:border-indigo-500"
          >
            <option value="">All Departments</option>
            {departments.map(d => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Side: Requests List */}
        <div className="lg:col-span-2 space-y-4">
          <h3 className="text-sm font-bold text-slate-200">Active Service Queue</h3>

          {loading ? (
            <div className="p-16 text-center border border-slate-800 rounded-2xl bg-slate-900/10">
              <div className="h-6 w-6 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin mx-auto" />
            </div>
          ) : filteredRequests.length === 0 ? (
            <p className="text-slate-500 text-xs py-12 text-center border border-slate-850 rounded-2xl bg-slate-900/10">No requests in current queue.</p>
          ) : (
            <div className="space-y-3 max-h-[600px] overflow-y-auto pr-2">
              {filteredRequests.map(r => (
                <div
                  key={r.id}
                  onClick={() => handleLoadRequestDetails(r)}
                  className={`p-4 rounded-xl border transition cursor-pointer text-xs space-y-3 ${
                    selectedRequest?.id === r.id
                      ? 'border-indigo-500 bg-indigo-950/10'
                      : 'border-slate-850 bg-slate-900/10 hover:border-slate-800'
                  }`}
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <h4 className="font-semibold text-slate-200">{r.requestCode} - {r.title}</h4>
                      <p className="text-[10px] text-slate-500 mt-0.5">Category: {r.category.name}</p>
                    </div>

                    <div className="flex gap-2">
                      <span className={`px-2 py-0.5 rounded text-[9px] font-semibold uppercase ${
                        r.priority === 'CRITICAL' || r.priority === 'URGENT' ? 'bg-red-500/10 text-red-400' : 'bg-slate-800 text-slate-400'
                      }`}>
                        {r.priority}
                      </span>
                      <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-400 font-semibold uppercase text-[9px]">
                        {r.status}
                      </span>
                    </div>
                  </div>

                  <p className="text-slate-400 leading-normal line-clamp-2">{r.description}</p>

                  <div className="flex justify-between items-center text-[10px] text-slate-500 border-t border-slate-850/60 pt-2">
                    <span>Submitted: {new Date(r.submittedAt).toLocaleString()}</span>
                    {r.sla && (
                      <span className={r.sla.resolutionBreached ? 'text-red-400 font-bold' : 'text-slate-500'}>
                        {r.sla.resolutionBreached ? '⚠️ SLA BREACHED' : `Due: ${new Date(r.sla.resolutionDueAt).toLocaleTimeString()}`}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right Side: Selected Details & Operations Panel */}
        <div className="lg:col-span-1 space-y-6">
          <h3 className="text-sm font-bold text-slate-200">Request Actions</h3>

          {!selectedRequest ? (
            <div className="p-16 text-center border border-slate-800 rounded-2xl bg-slate-900/10">
              <div className="text-3xl mb-2">📋</div>
              <p className="text-slate-500 text-xs font-semibold">Select a ticket from the queue to run workflow actions.</p>
            </div>
          ) : (
            <div className="p-6 rounded-2xl border border-slate-800 bg-slate-900/20 backdrop-blur space-y-6 text-xs">
              <div>
                <h4 className="font-bold text-slate-200">{selectedRequest.requestCode}</h4>
                <p className="text-[10px] text-slate-500 mt-0.5">Status: <strong className="text-indigo-400 uppercase">{selectedRequest.status}</strong></p>
              </div>

              {/* Creator details, Property, Area */}
              <div className="p-4 bg-slate-950/40 border border-slate-850 rounded-xl space-y-2 text-slate-350">
                <h5 className="font-bold text-slate-200 uppercase tracking-wider text-[9px] mb-1">Ticket Metadata</h5>
                <p>Citizen: <strong>{(selectedRequest as any).creator?.name || (selectedRequest as any).creator?.email || 'N/A'}</strong></p>
                <p>Property: <strong>{(selectedRequest as any).property?.address || 'N/A'}</strong></p>
                <p>Area: <strong>{(selectedRequest as any).area?.name || 'N/A'}</strong></p>
                <p>Priority: <strong className="text-rose-450">{(selectedRequest as any).priority}</strong></p>
                {selectedRequest.sla && (
                  <p>SLA Due: <strong>{new Date(selectedRequest.sla.resolutionDueAt).toLocaleString()}</strong></p>
                )}
                {selectedRequest.assignedUserId && (
                  <p>Assignee: <strong>{(selectedRequest as any).assignee?.name || selectedRequest.assignedUserId}</strong></p>
                )}
              </div>

              {/* Triage / Assign Section */}
              {(selectedRequest.status === 'SUBMITTED' || selectedRequest.status === 'TRIAGED') && (
                <div className="space-y-3 p-4 bg-slate-950/40 border border-slate-850 rounded-xl">
                  <h5 className="font-bold text-slate-350 uppercase tracking-wider text-[10px]">Triage & Assignment</h5>

                  <div className="space-y-2">
                    <label className="text-slate-500 font-medium block">Triage Priority</label>
                    <select
                      value={triagePriority}
                      onChange={(e) => setTriagePriority(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-800 rounded text-slate-300"
                    >
                      <option value="">No Change</option>
                      <option value="LOW">LOW</option>
                      <option value="NORMAL">NORMAL</option>
                      <option value="HIGH">HIGH</option>
                      <option value="URGENT">URGENT</option>
                      <option value="CRITICAL">CRITICAL</option>
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-slate-500 font-medium block">Department</label>
                    <select
                      value={assignDeptId}
                      onChange={(e) => setAssignDeptId(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-800 rounded text-slate-300"
                    >
                      <option value="">Select Department</option>
                      {departments.map(d => (
                        <option key={d.id} value={d.id}>{d.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-slate-500 font-medium block">Assign User ID</label>
                    <input
                      type="text"
                      placeholder="e.g. worker-1..."
                      value={assignUserId}
                      onChange={(e) => setAssignUserId(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-800 rounded text-slate-200"
                    />
                  </div>

                  <button
                    onClick={handleTriageAssign}
                    className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-slate-100 font-bold rounded transition"
                  >
                    Execute Triage/Assign
                  </button>
                </div>
              )}

              {/* Start Work / Pause SLA timers */}
              <div className="flex gap-2">
                {(selectedRequest.status === 'ASSIGNED' || selectedRequest.status === 'REOPENED') && (
                  <button
                    onClick={handleStartWork}
                    className="flex-1 py-2 bg-blue-600 hover:bg-blue-500 text-slate-100 font-bold rounded transition"
                  >
                    Start Work
                  </button>
                )}

                {selectedRequest.status === 'IN_PROGRESS' && (
                  <button
                    onClick={handleRequestInfo}
                    className="flex-1 py-2 bg-yellow-600/20 hover:bg-yellow-600/30 border border-yellow-500/30 text-yellow-350 font-bold rounded transition"
                  >
                    Pause (Request Info)
                  </button>
                )}
              </div>

              {/* Resolution Form Section */}
              {selectedRequest.status === 'IN_PROGRESS' && (
                <div className="space-y-3 p-4 bg-emerald-950/10 border border-emerald-500/20 rounded-xl">
                  <h5 className="font-bold text-emerald-450 uppercase tracking-wider text-[10px]">Log Resolution Summary</h5>

                  <div className="space-y-2">
                    <label className="text-slate-400 font-medium block">Resolution Code</label>
                    <select
                      value={resCode}
                      onChange={(e) => setResCode(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-800 rounded text-slate-350"
                    >
                      <option value="COLLECTION_COMPLETED">COLLECTION_COMPLETED</option>
                      <option value="BIN_REPAIRED">BIN_REPAIRED</option>
                      <option value="BIN_REPLACED">BIN_REPLACED</option>
                      <option value="WASTE_REMOVED">WASTE_REMOVED</option>
                      <option value="NO_ISSUE_FOUND">NO_ISSUE_FOUND</option>
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-slate-400 font-medium block">Resolution Summary</label>
                    <textarea
                      placeholder="Notes on resolution steps..."
                      value={resSummary}
                      onChange={(e) => setResSummary(e.target.value)}
                      rows={2}
                      className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-800 rounded text-slate-200"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-slate-400 font-medium block">Resolution Proof Key (Optional)</label>
                    <input
                      type="text"
                      placeholder="Upload reference storage key..."
                      value={resEvidence}
                      onChange={(e) => setResEvidence(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-800 rounded text-slate-200"
                    />
                  </div>

                  <button
                    onClick={handleResolve}
                    className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-slate-100 font-bold rounded transition"
                  >
                    Submit Resolution
                  </button>
                </div>
              )}

              {/* Close & Cancel Action Buttons */}
              <div className="flex gap-2 border-t border-slate-850 pt-4">
                {selectedRequest.status === 'RESOLVED' && (
                  <button
                    onClick={handleClose}
                    className="flex-1 py-2 bg-slate-850 hover:bg-slate-800 border border-slate-700 text-slate-300 font-bold rounded transition"
                  >
                    Administrative Close
                  </button>
                )}

                {selectedRequest.status !== 'CLOSED' && selectedRequest.status !== 'CANCELLED' && selectedRequest.status !== 'REJECTED' && (
                  <button
                    onClick={handleCancel}
                    className="flex-1 py-2 bg-red-650/10 hover:bg-red-600/20 border border-red-500/30 text-red-300 font-bold rounded transition"
                  >
                    Cancel Request
                  </button>
                )}
              </div>

              {/* Timeline Events */}
              {(selectedRequest as any).events && (selectedRequest as any).events.length > 0 && (
                <div className="space-y-3 border-t border-slate-850 pt-4">
                  <h5 className="font-bold text-slate-350 uppercase">Timeline Events</h5>
                  <div className="space-y-2 max-h-[150px] overflow-y-auto pr-1">
                    {(selectedRequest as any).events.map((evt: any) => (
                      <div key={evt.id} className="p-2 bg-slate-950/30 rounded border border-slate-900 text-[10px] text-slate-400">
                        <div className="flex justify-between font-semibold">
                          <span>{evt.eventType}</span>
                          <span>{new Date(evt.occurredAt).toLocaleTimeString()}</span>
                        </div>
                        {evt.metadata && (
                          <pre className="text-[8px] text-slate-500 overflow-x-auto mt-1">
                            {JSON.stringify(evt.metadata)}
                          </pre>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Comments Thread (Internal & Public comments log) */}
              <div className="space-y-4 border-t border-slate-850 pt-4">
                <h5 className="font-bold text-slate-350 uppercase">Triage Dialogue & Investigation Notes</h5>

                <div className="space-y-2 max-h-[250px] overflow-y-auto pr-1">
                  {comments.map((c) => (
                    <div
                      key={c.id}
                      className={`p-3 rounded-lg text-[11px] space-y-1 ${
                        c.visibility === 'INTERNAL'
                          ? 'border border-amber-500/30 bg-amber-950/10'
                          : 'border border-slate-850 bg-slate-950/30'
                      }`}
                    >
                      <div className="flex justify-between text-[9px] text-slate-500">
                        <span>User: {c.authorId} ({c.visibility})</span>
                        <span>{new Date(c.createdAt).toLocaleTimeString()}</span>
                      </div>
                      <p className="text-slate-300">{c.message}</p>
                    </div>
                  ))}
                </div>

                {/* Post comment block */}
                <div className="space-y-2 pt-2">
                  <div className="flex justify-between items-center text-[10px]">
                    <span className="text-slate-500">Visibility:</span>
                    <div className="flex gap-3">
                      <label className="flex items-center gap-1 cursor-pointer">
                        <input
                          type="radio"
                          name="visibility"
                          checked={commentVisibility === 'INTERNAL'}
                          onChange={() => setCommentVisibility('INTERNAL')}
                        />
                        <span className="text-amber-400 font-semibold">INTERNAL</span>
                      </label>
                      <label className="flex items-center gap-1 cursor-pointer">
                        <input
                          type="radio"
                          name="visibility"
                          checked={commentVisibility === 'PUBLIC'}
                          onChange={() => setCommentVisibility('PUBLIC')}
                        />
                        <span className="text-slate-400">PUBLIC</span>
                      </label>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Type comment/internal note..."
                      value={newComment}
                      onChange={(e) => setNewComment(e.target.value)}
                      className="flex-1 px-2.5 py-1.5 bg-slate-950 border border-slate-850 rounded text-slate-200"
                    />
                    <button
                      onClick={handlePostComment}
                      className="px-3 bg-indigo-600 hover:bg-indigo-500 text-slate-100 font-bold rounded"
                    >
                      Post
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
