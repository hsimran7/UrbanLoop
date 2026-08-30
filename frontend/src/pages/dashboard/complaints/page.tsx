import React, { useState, useEffect } from 'react';
import { apiRequest } from '../../../utils/api';
import { PunjabLocationSelector, LocationData } from '../../../components/ui/PunjabLocationSelector';

interface Category {
  id: string;
  code: string;
  name: string;
  description: string;
}

interface Property {
  id: string;
  address: string;
  areaId: string;
}

interface Bin {
  id: string;
  qrCodeId: string;
  type: string;
}

interface ServiceRequest {
  id: string;
  requestCode: string;
  title: string;
  description: string;
  priority: string;
  status: string;
  submittedAt: string;
  resolvedAt: string | null;
  category: Category;
  sla?: {
    resolutionDueAt: string;
  };
}

export default function CitizenComplaintsPage() {
  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [bins, setBins] = useState<Bin[]>([]);

  // Form State
  const [categoryId, setCategoryId] = useState('');
  const [propertyId, setPropertyId] = useState('');
  const [binId, setBinId] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [addressText, setAddressText] = useState('');
  const [locationData, setLocationData] = useState<LocationData>({ state: 'Punjab', district: '', city: '', area: '', address: '' });
  const [evidenceId, setEvidenceId] = useState('');
  const [ignoreDuplicateWarning, setIgnoreDuplicateWarning] = useState(false);

  // Modal / Detail views
  const [selectedRequest, setSelectedRequest] = useState<ServiceRequest | null>(null);
  const [timeline, setTimeline] = useState<any[]>([]);
  const [comments, setComments] = useState<any[]>([]);
  const [newComment, setNewComment] = useState('');
  const [rating, setRating] = useState(5);
  const [feedbackComment, setFeedbackComment] = useState('');

  // Info alerts
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [duplicateWarning, setDuplicateWarning] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchInitialData();
  }, []);

  async function fetchInitialData() {
    setLoading(true);
    try {
      const [reqRes, catRes, propRes] = await Promise.all([
        apiRequest('/service-requests'),
        apiRequest('/service-requests/categories'), // Let's mock fallback if not found, or standard fetch
        apiRequest('/properties'),
      ]);

      if (reqRes.ok) setRequests(await reqRes.json());
      
      // Category fallback if backend hasn't populated database rows
      if (catRes.ok) {
        setCategories(await catRes.json());
      } else {
        setCategories([
          { id: 'cat-missed', code: 'MISSED_COLLECTION', name: 'Missed Waste Collection', description: 'Dry/Wet waste not collected' },
          { id: 'cat-overflow', code: 'OVERFLOWING_BIN', name: 'Overflowing Bin', description: 'Bin fill level exceeding limit' },
          { id: 'cat-damaged', code: 'DAMAGED_BIN', name: 'Damaged Smart Bin', description: 'Broken lid or physical structure' },
          { id: 'cat-illegal', code: 'ILLEGAL_DUMPING', name: 'Illegal Dumping', description: 'Unauthorized waste disposal on street' },
          { id: 'cat-odor', code: 'FACILITY_ODOR', name: 'Facility Odor', description: 'Bad odor from nearby processing center' },
          { id: 'cat-other', code: 'OTHER', name: 'Other Complaints', description: 'General citizen support query' },
        ]);
      }

      if (propRes.ok) setProperties(await propRes.json());
    } catch {
      setErrorMsg('Failed to connect to backend.');
    } finally {
      setLoading(false);
    }
  }

  // Fetch bins when property selected
  useEffect(() => {
    if (propertyId) {
      fetchPropertyBins(propertyId);
    } else {
      setBins([]);
    }
  }, [propertyId]);

  async function fetchPropertyBins(pid: string) {
    try {
      const res = await apiRequest(`/properties/${pid}`);
      if (res.ok) {
        const data = await res.json();
        // Flat map bins from collection points
        const propertyBins = data.collectionPoints?.flatMap((cp: any) => cp.bins) || [];
        setBins(propertyBins);
      }
    } catch {
      // quiet fail
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');
    setDuplicateWarning(null);

    const activeProp = properties.find(p => p.id === propertyId);

    const payload = {
      categoryId,
      areaId: activeProp?.areaId || 'area-default-mock',
      propertyId: propertyId || undefined,
      binId: binId || undefined,
      title,
      description,
      latitude: latitude ? parseFloat(latitude) : undefined,
      longitude: longitude ? parseFloat(longitude) : undefined,
      addressText: addressText || activeProp?.address || undefined,
      evidenceId: evidenceId || undefined,
      ignoreDuplicateWarning,
    };

    try {
      const res = await apiRequest('/service-requests', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (res.ok) {
        setSuccessMsg(`Service request submitted successfully: ${data.requestCode}`);
        // Reset form
        setTitle('');
        setDescription('');
        setCategoryId('');
        setPropertyId('');
        setBinId('');
        setLatitude('');
        setLongitude('');
        setAddressText('');
        setEvidenceId('');
        setIgnoreDuplicateWarning(false);
        fetchInitialData();
      } else if (data.message === 'Possible duplicate request detected.') {
        setDuplicateWarning(data);
      } else {
        setErrorMsg(data.message || 'Failed to submit request.');
      }
    } catch {
      setErrorMsg('Network error.');
    }
  }

  async function handleLoadTimeline(req: ServiceRequest) {
    setSelectedRequest(req);
    setNewComment('');
    setFeedbackComment('');
    try {
      const [tRes, cRes] = await Promise.all([
        apiRequest(`/service-requests/${req.id}/timeline`),
        apiRequest(`/service-requests/${req.id}/comments`),
      ]);
      if (tRes.ok) setTimeline(await tRes.json());
      if (cRes.ok) setComments(await cRes.json());
    } catch {
      setErrorMsg('Failed to load request timeline.');
    }
  }

  async function handleAddComment() {
    if (!newComment.trim() || !selectedRequest) return;
    try {
      const res = await apiRequest(`/service-requests/${selectedRequest.id}/comments`, {
        method: 'POST',
        body: JSON.stringify({
          message: newComment,
          visibility: 'PUBLIC',
        }),
      });
      if (res.ok) {
        setNewComment('');
        // Reload comments
        const cRes = await apiRequest(`/service-requests/${selectedRequest.id}/comments`);
        if (cRes.ok) setComments(await cRes.json());
      }
    } catch {
      setErrorMsg('Failed to post comment.');
    }
  }

  async function handleReopen(reason: string) {
    if (!selectedRequest) return;
    try {
      const res = await apiRequest(`/service-requests/${selectedRequest.id}/reopen`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      });
      if (res.ok) {
        setSuccessMsg('Complaint reopened successfully.');
        handleLoadTimeline(selectedRequest);
        fetchInitialData();
      } else {
        const err = await res.json();
        setErrorMsg(err.message || 'Failed to reopen complaint.');
      }
    } catch {
      setErrorMsg('Network error reopening.');
    }
  }

  async function handleFeedback() {
    if (!selectedRequest) return;
    try {
      const res = await apiRequest(`/service-requests/${selectedRequest.id}/feedback`, {
        method: 'POST',
        body: JSON.stringify({
          rating,
          comment: feedbackComment || undefined,
        }),
      });
      if (res.ok) {
        setSuccessMsg('Feedback submitted successfully. Thank you!');
        handleLoadTimeline(selectedRequest);
        fetchInitialData();
      } else {
        const err = await res.json();
        setErrorMsg(err.message || 'Failed to submit feedback.');
      }
    } catch {
      setErrorMsg('Network error feedback.');
    }
  }

  return (
    <div className="space-y-8 pb-24 text-slate-800">
      {/* Page Header */}
      <div className="glass-card p-8">
        <div className="text-xs text-nature-earth font-extrabold uppercase tracking-widest mb-1">Citizen Portal</div>
        <h1 className="text-3xl font-extrabold text-slate-800 tracking-tight font-display">Support & Service Requests</h1>
        <p className="text-sm text-slate-600 mt-2 font-medium">Submit waste complaints, track resolution timelines, and verify SLA performance.</p>
      </div>

      {successMsg && <div className="p-4 rounded-xl border border-nature-accent bg-emerald-50 text-emerald-700 text-sm font-medium">{successMsg}</div>}
      {errorMsg && <div className="p-4 rounded-xl border border-red-200 bg-red-50 text-red-700 text-sm font-medium">{errorMsg}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Side: Submit Request */}
        <div className="lg:col-span-1 glass-card p-6 space-y-4">
          <h3 className="text-sm font-bold text-slate-800 border-b border-surface-border pb-2">Submit Service Request</h3>

          <form onSubmit={handleSubmit} className="space-y-4 text-xs">
            <div className="space-y-1.5">
              <label className="text-slate-600 block font-bold">Category</label>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                required
                className="input-field !py-2"
              >
                <option value="">Select Category</option>
                {categories.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-slate-600 block font-bold">Linked Property</label>
              <select
                value={propertyId}
                onChange={(e) => setPropertyId(e.target.value)}
                className="input-field !py-2"
              >
                <option value="">Select Property (Optional)</option>
                {properties.map(p => (
                  <option key={p.id} value={p.id}>{p.address}</option>
                ))}
              </select>
            </div>

            {propertyId && bins.length > 0 && (
              <div className="space-y-1.5">
                <label className="text-slate-600 block font-bold">Linked Smart Bin</label>
                <select
                  value={binId}
                  onChange={(e) => setBinId(e.target.value)}
                  className="input-field !py-2"
                >
                  <option value="">Select Bin (Optional)</option>
                  {bins.map(b => (
                    <option key={b.id} value={b.id}>{b.qrCodeId} ({b.type})</option>
                  ))}
                </select>
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-slate-600 block font-bold">Service Location (Punjab)</label>
              <PunjabLocationSelector
                value={locationData}
                onChange={(loc) => {
                  setLocationData(loc);
                  setAddressText([loc.address, loc.area, loc.city, loc.district, loc.state].filter(Boolean).join(', '));
                }}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-slate-600 block font-bold">Detailed Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe the complaint in detail..."
                required
                rows={3}
                className="input-field !py-2 resize-none"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-slate-600 block font-bold">Evidence Storage Key (Optional)</label>
              <input
                type="text"
                value={evidenceId}
                onChange={(e) => setEvidenceId(e.target.value)}
                placeholder="File storage key..."
                className="input-field !py-2"
              />
            </div>

            {duplicateWarning && (
              <div className="p-3 border border-amber-300 bg-amber-50 text-amber-800 rounded-lg space-y-2">
                <p className="font-semibold">⚠️ Duplicate Ticket Warning</p>
                <p>An active request already exists: {duplicateWarning.requestCode} ({duplicateWarning.status})</p>
                <label className="flex items-center gap-2 mt-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={ignoreDuplicateWarning}
                    onChange={(e) => setIgnoreDuplicateWarning(e.target.checked)}
                    className="rounded border-amber-400"
                  />
                  <span>Submit separate issue anyway</span>
                </label>
              </div>
            )}

            <button
              type="submit"
              className="btn-primary w-full"
            >
              Submit Request
            </button>
          </form>
        </div>

        {/* Center/Right: Requests Feed & Timelines */}
        <div className="lg:col-span-2 space-y-6">
          <h3 className="text-sm font-bold text-slate-800 border-b border-surface-border pb-2">Your Filed Tickets</h3>

          {loading ? (
            <div className="p-12 text-center glass-card">
              <div className="h-6 w-6 border-2 border-nature-earth border-t-transparent rounded-full animate-spin mx-auto" />
            </div>
          ) : requests.length === 0 ? (
            <p className="text-slate-500 text-xs py-8 text-center glass-card">No service requests submitted yet.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {requests.map(r => (
                <div
                  key={r.id}
                  onClick={() => handleLoadTimeline(r)}
                  className={`p-4 rounded-xl border transition cursor-pointer space-y-3 ${
                    selectedRequest?.id === r.id
                      ? 'border-nature-earth bg-amber-50/60'
                      : 'border-surface-border bg-nature-white hover:border-nature-earth/50'
                  }`}
                >
                  <div className="flex justify-between items-start text-xs">
                    <div>
                      <h4 className="font-semibold text-slate-800">{r.title}</h4>
                      <p className="text-[10px] text-slate-500 mt-0.5">{r.requestCode}</p>
                    </div>
                    <span className={`px-2 py-0.5 rounded text-[9px] font-semibold uppercase ${
                      r.status === 'RESOLVED' ? 'bg-emerald-100 text-emerald-700' :
                      r.status === 'CLOSED' ? 'bg-slate-100 text-slate-600' :
                      r.status === 'IN_PROGRESS' ? 'bg-blue-100 text-blue-700' :
                      'bg-amber-100 text-amber-700'
                    }`}>
                      {r.status}
                    </span>
                  </div>

                  <p className="text-[11px] text-slate-600 line-clamp-2">{r.description}</p>

                  <div className="flex justify-between text-[10px] text-slate-500 border-t border-surface-border pt-2">
                    <span>Priority: {r.priority}</span>
                    <span>Date: {new Date(r.submittedAt).toLocaleDateString()}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Timeline details graph */}
          {selectedRequest && (
            <div className="p-6 rounded-2xl border border-surface-border glass-card space-y-6">
              <div className="flex justify-between items-center border-b border-surface-border pb-4">
                <div>
                  <h4 className="text-sm font-bold text-slate-800">Lineage: {selectedRequest.requestCode}</h4>
                  <p className="text-xs text-slate-500 mt-1">{selectedRequest.category.name}</p>
                </div>

                {/* Reopen Action Panel */}
                {selectedRequest.status === 'RESOLVED' && (
                  <button
                    onClick={() => {
                      const reason = prompt('Please enter the reopen reason:');
                      if (reason) handleReopen(reason);
                    }}
                    className="px-3 py-1 bg-red-100 hover:bg-red-200 border border-red-300 text-red-700 text-xs font-semibold rounded-lg transition"
                  >
                    Reopen Complaint
                  </button>
                )}
              </div>

              {/* SLA compliance badge */}
              {selectedRequest.sla && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-[10px] text-slate-700 flex justify-between">
                  <span>SLA target compliance:</span>
                  <span className="font-semibold text-slate-800">
                    Expected resolution by: {new Date(selectedRequest.sla.resolutionDueAt).toLocaleString()}
                  </span>
                </div>
              )}

              {/* Timeline list */}
              <div className="relative border-l border-nature-earth/40 ml-3 pl-6 space-y-6">
                {timeline.map((evt) => (
                  <div key={evt.id} className="relative">
                    <div className="absolute -left-[29px] top-0.5 h-3 w-3 rounded-full bg-nature-earth border-2 border-white" />
                    <div className="text-xs">
                      <span className="font-semibold text-slate-700 uppercase tracking-wider">{evt.eventType}</span>
                      <p className="text-[10px] text-slate-500 mt-1">{new Date(evt.occurredAt).toLocaleString()}</p>
                      {evt.metadata && <p className="text-[10px] font-mono text-slate-500 mt-1.5 p-2 bg-nature-white rounded border border-surface-border">Metadata: {JSON.stringify(evt.metadata)}</p>}
                    </div>
                  </div>
                ))}
              </div>

              {/* Feedback Form (if CLOSED/RESOLVED) */}
              {(selectedRequest.status === 'RESOLVED' || selectedRequest.status === 'CLOSED') && (
                <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl space-y-3">
                  <h5 className="text-xs font-bold text-emerald-700 uppercase tracking-wider">Submit Resolution Feedback</h5>
                  <div className="flex gap-2 text-xs">
                    {[1, 2, 3, 4, 5].map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setRating(s)}
                        className={`px-3 py-1 border rounded-lg transition font-bold ${
                          rating === s ? 'bg-emerald-100 text-emerald-700 border-emerald-400' : 'bg-white border-slate-300 text-slate-500'
                        }`}
                      >
                        {s} ★
                      </button>
                    ))}
                  </div>
                  <input
                    type="text"
                    placeholder="Feedback comment (optional)..."
                    value={feedbackComment}
                    onChange={(e) => setFeedbackComment(e.target.value)}
                    className="input-field !py-2"
                  />
                  <button
                    onClick={handleFeedback}
                    className="btn-primary"
                  >
                    Submit Feedback
                  </button>
                </div>
              )}

              {/* Comments Thread (Public comments only) */}
              <div className="space-y-4 border-t border-surface-border pt-4">
                <h5 className="text-xs font-bold text-slate-700 uppercase">Public Dialogue Thread</h5>

                <div className="space-y-3">
                  {comments.map((c) => (
                    <div key={c.id} className="p-3 bg-nature-white border border-surface-border rounded-xl space-y-1 text-xs">
                      <div className="flex justify-between text-[10px] text-slate-500">
                        <span>User: {c.authorId}</span>
                        <span>{new Date(c.createdAt).toLocaleTimeString()}</span>
                      </div>
                      <p className="text-slate-700 leading-relaxed font-sans">{c.message}</p>
                    </div>
                  ))}
                </div>

                <div className="flex gap-3 text-xs">
                  <input
                    type="text"
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    placeholder="Ask for updates or add information..."
                    className="flex-1 input-field !py-2"
                  />
                  <button
                    onClick={handleAddComment}
                    className="btn-primary"
                  >
                    Post
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
