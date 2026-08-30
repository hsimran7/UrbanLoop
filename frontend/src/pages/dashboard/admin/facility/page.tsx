import React, { useState, useEffect } from 'react';
import { apiRequest } from '../../../../utils/api';
import { getSocket } from '../../../../utils/socket';

interface Facility {
  id: string;
  facilityCode: string;
  name: string;
  facilityType: string;
  status: string;
  dailyCapacityKg: number | null;
}

interface WasteLoad {
  id: string;
  loadCode: string;
  wasteType: string;
  status: 'OPEN' | 'SEALED' | 'IN_TRANSIT' | 'ARRIVED' | 'WEIGHED' | 'ACCEPTED' | 'PARTIALLY_REJECTED' | 'REJECTED' | 'CLOSED';
  itemsCount: number;
}

interface StaffAssignment {
  id: string;
  facility: Facility;
}

export default function FacilityDashboardPage() {
  const [myFacilities, setMyFacilities] = useState<StaffAssignment[]>([]);
  const [selectedFacId, setSelectedFacId] = useState<string>('');
  const [capacityInfo, setCapacityInfo] = useState<any>(null);
  const [loads, setLoads] = useState<WasteLoad[]>([]);
  
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Dialog targets
  const [weighTarget, setWeighTarget] = useState<WasteLoad | null>(null);
  const [receiptTarget, setReceiptTarget] = useState<WasteLoad | null>(null);
  const [processTarget, setProcessTarget] = useState<WasteLoad | null>(null);

  // Form states
  const [grossWeight, setGrossWeight] = useState(0);
  const [tareWeight, setTareWeight] = useState(0);
  const [weighingMethod, setWeighingMethod] = useState<'SIMULATED' | 'MANUAL_ENTRY'>('SIMULATED');

  const [receiptStatus, setReceiptStatus] = useState<'ACCEPTED' | 'PARTIALLY_ACCEPTED' | 'REJECTED'>('ACCEPTED');
  const [acceptedWeight, setAcceptedWeight] = useState(0);
  const [rejectedWeight, setRejectedWeight] = useState(0);
  const [rejectionReason, setRejectionReason] = useState('WRONG_WASTE_TYPE');
  const [receiptNotes, setReceiptNotes] = useState('');

  const [processType, setProcessType] = useState('COMPOSTED');
  const [processInputWeight, setProcessInputWeight] = useState(0);
  const [processOutputWeight, setProcessOutputWeight] = useState(0);
  const [processResidueWeight, setProcessResidueWeight] = useState(0);
  const [processNotes, setProcessNotes] = useState('');

  useEffect(() => {
    fetchAssignments();

    const socket = getSocket('realtime');
    
    socket.on('connect', () => {
      console.log('Facility connected to realtime WS stream.');
    });

    socket.on('taskCompleted', () => {
      if (selectedFacId) {
        fetchFacilityDetails();
      }
    });

    socket.on('assignmentUpdated', () => {
      if (selectedFacId) {
        fetchFacilityDetails();
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [selectedFacId]);

  useEffect(() => {
    if (selectedFacId) {
      fetchFacilityDetails();
    }
  }, [selectedFacId]);

  async function fetchAssignments() {
    setIsLoading(true);
    setErrorMsg('');
    try {
      const res = await apiRequest('/facilities/my-assignments');
      if (res.ok) {
        const list = await res.json();
        setMyFacilities(list);
        if (list.length > 0) {
          setSelectedFacId(list[0].facility.id);
        }
      } else {
        setErrorMsg('Failed to load facility assignments.');
      }
    } catch {
      setErrorMsg('Network error.');
    } finally {
      setIsLoading(false);
    }
  }

  async function fetchFacilityDetails() {
    setErrorMsg('');
    try {
      // 1. Fetch occupancy / capacity alerts
      const occRes = await apiRequest(`/facilities/${selectedFacId}/occupancy`);
      if (occRes.ok) {
        setCapacityInfo(await occRes.json());
      }

      // 2. Fetch loads (service filters by assigned manager facilities)
      const loadsRes = await apiRequest('/loads');
      if (loadsRes.ok) {
        const allLoads = await loadsRes.json();
        setLoads(allLoads);
      }
    } catch {
      setErrorMsg('Failed to fetch details for facility.');
    }
  }

  // ─── Actions ───────────────────────────────────────────────────────────────

  async function handleConfirmArrival(loadId: string) {
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const res = await apiRequest(`/loads/${loadId}/arrive`, { method: 'POST' });
      if (res.ok) {
        setSuccessMsg('Load arrival confirmed successfully.');
        fetchFacilityDetails();
      } else {
        const err = await res.json();
        setErrorMsg(err.message || 'Failed to confirm arrival.');
      }
    } catch {
      setErrorMsg('Network error.');
    }
  }

  async function handleRecordWeighing() {
    if (!weighTarget) return;
    setErrorMsg('');
    setSuccessMsg('');

    if (grossWeight < tareWeight) {
      alert('Gross weight must exceed tare weight.');
      return;
    }

    try {
      const res = await apiRequest(`/loads/${weighTarget.id}/weigh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          grossWeightKg: Number(grossWeight),
          tareWeightKg: Number(tareWeight),
          weighingMethod,
        }),
      });

      if (res.ok) {
        setSuccessMsg('Weighbridge scale record recorded.');
        setWeighTarget(null);
        fetchFacilityDetails();
      } else {
        const err = await res.json();
        setErrorMsg(err.message || 'Failed to record weighing.');
      }
    } catch {
      setErrorMsg('Network error.');
    }
  }

  async function handleIssueReceipt() {
    if (!receiptTarget) return;
    setErrorMsg('');
    setSuccessMsg('');

    try {
      const res = await apiRequest(`/loads/${receiptTarget.id}/receipt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: receiptStatus,
          acceptedWeightKg: Number(acceptedWeight),
          rejectedWeightKg: Number(rejectedWeight),
          rejectionReason: receiptStatus !== 'ACCEPTED' ? rejectionReason : undefined,
          notes: receiptNotes || undefined,
        }),
      });

      if (res.ok) {
        setSuccessMsg('Facility receipt issued successfully.');
        setReceiptTarget(null);
        fetchFacilityDetails();
      } else {
        const err = await res.json();
        setErrorMsg(err.message || 'Failed to issue receipt.');
      }
    } catch {
      setErrorMsg('Network error.');
    }
  }

  async function handleRecordProcessing() {
    if (!processTarget) return;
    setErrorMsg('');
    setSuccessMsg('');

    try {
      const res = await apiRequest(`/loads/${processTarget.id}/process`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          processType,
          inputWeightKg: Number(processInputWeight),
          outputWeightKg: Number(processOutputWeight),
          residueWeightKg: Number(processResidueWeight),
          notes: processNotes || undefined,
        }),
      });

      if (res.ok) {
        setSuccessMsg('Processing record logged. Load status is now CLOSED.');
        setProcessTarget(null);
        fetchFacilityDetails();
      } else {
        const err = await res.json();
        setErrorMsg(err.message || 'Failed to log processing.');
      }
    } catch {
      setErrorMsg('Network error.');
    }
  }

  // Derived filters
  const transitLoads = loads.filter(l => l.status === 'IN_TRANSIT');
  const arrivedLoads = loads.filter(l => l.status === 'ARRIVED');
  const weighedLoads = loads.filter(l => l.status === 'WEIGHED');
  const acceptedLoads = loads.filter(l => l.status === 'ACCEPTED' || l.status === 'PARTIALLY_REJECTED');
  const historyLoads = loads.filter(l => l.status === 'CLOSED' || l.status === 'REJECTED');

  const netWeightCalculator = Math.max(0, grossWeight - tareWeight);
  const receiptTotalCalc = Number(acceptedWeight) + Number(rejectedWeight);
  
  // real-time mass balance indicator status
  const massBalanceDiff = Math.abs(Number(processOutputWeight) + Number(processResidueWeight) - Number(processInputWeight));
  const isMassBalanced = processInputWeight > 0 ? (massBalanceDiff <= 0.02 * Number(processInputWeight)) : true;

  const capacityStatusColors = {
    NORMAL: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    NEAR_CAPACITY: 'bg-amber-50 text-amber-700 border-amber-200 animate-pulse',
    AT_CAPACITY: 'bg-red-50 text-red-700 border-red-200 font-bold',
  };

  return (
    <div className="space-y-8 pb-24 text-slate-800">
      {/* Header */}
      <div className="glass-card p-8 flex justify-between items-center flex-wrap gap-4">
        <div>
          <div className="text-xs text-nature-earth font-extrabold uppercase tracking-widest mb-1">Facility Dashboard</div>
          <h1 className="text-3xl font-extrabold text-slate-800 tracking-tight font-display">Municipal Intake Operations</h1>
          <p className="text-sm text-slate-600 mt-2 font-medium">Receive, weigh, verify receipts, and record material recovery outcomes.</p>
        </div>

        {/* Selected Facility Switcher */}
        {myFacilities.length > 0 && (
          <div className="flex flex-col gap-1.5 shrink-0 min-w-[220px]">
            <label className="text-[10px] text-slate-500 uppercase font-extrabold tracking-wider">Active Facility</label>
            <select
              value={selectedFacId}
              onChange={(e) => setSelectedFacId(e.target.value)}
              className="input-field !py-2"
            >
              {myFacilities.map((f) => (
                <option key={f.facility.id} value={f.facility.id}>
                  {f.facility.name} ({f.facility.facilityCode})
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {errorMsg && (
        <div className="p-4 rounded-xl border border-red-200 bg-red-50 text-red-700 text-sm font-medium">{errorMsg}</div>
      )}
      {successMsg && (
        <div className="p-4 rounded-xl border border-nature-accent bg-emerald-50 text-emerald-700 text-sm font-medium">{successMsg}</div>
      )}

      {/* Capacity Occupancy Alerts */}
      {capacityInfo && (
        <div className={`p-5 rounded-2xl border ${capacityStatusColors[capacityInfo.status as keyof typeof capacityStatusColors] || 'border-surface-border'} flex justify-between items-center flex-wrap gap-4 shadow-sm`}>
          <div>
            <h3 className="text-sm font-bold">Daily Intake Capacity Guard</h3>
            <p className="text-xs mt-1 text-slate-600 font-medium">
              Total accepted receipts today: <strong>{capacityInfo.intakeTodayKg.toLocaleString()} kg</strong>
              {capacityInfo.dailyCapacityKg ? ` / limit ${capacityInfo.dailyCapacityKg.toLocaleString()} kg` : ''}
            </p>
          </div>
          <span className="px-3.5 py-1 rounded-full text-xs font-extrabold border tracking-wider uppercase">
            {capacityInfo.status}
          </span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* Box 1: Dispatched & Transit Loads */}
        <div className="glass-card p-6 space-y-4">
          <div className="flex justify-between items-center border-b border-surface-border pb-3">
            <h2 className="text-xs font-extrabold uppercase tracking-wider text-slate-500">1. Dispatched In Transit</h2>
            <span className="px-3 py-1 bg-nature-lightBg border border-surface-border text-xs text-slate-700 rounded-full font-bold">{transitLoads.length} loads</span>
          </div>

          {transitLoads.length === 0 ? (
            <p className="text-slate-500 text-xs py-6 text-center font-medium">No loads currently in transit to this facility.</p>
          ) : (
            <div className="space-y-3">
              {transitLoads.map((l) => (
                <div key={l.id} className="p-4 border border-surface-border bg-nature-lightBg/50 rounded-2xl flex justify-between items-center">
                  <div>
                    <h4 className="text-xs font-bold text-slate-800">{l.loadCode}</h4>
                    <p className="text-[11px] text-slate-500 mt-1 font-medium">Category: <span className="font-semibold text-slate-700">{l.wasteType}</span></p>
                  </div>
                  <button
                    onClick={() => handleConfirmArrival(l.id)}
                    className="btn-primary text-xs !py-2"
                  >
                    Confirm Arrival
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Box 2: Arrived Awaiting Weighbridge scale */}
        <div className="glass-card p-6 space-y-4">
          <div className="flex justify-between items-center border-b border-surface-border pb-3">
            <h2 className="text-xs font-extrabold uppercase tracking-wider text-slate-500">2. Awaiting Weighbridge Scale</h2>
            <span className="px-3 py-1 bg-nature-lightBg border border-surface-border text-xs text-slate-700 rounded-full font-bold">{arrivedLoads.length} loads</span>
          </div>

          {arrivedLoads.length === 0 ? (
            <p className="text-slate-500 text-xs py-6 text-center font-medium">No loads awaiting weighing scale capture.</p>
          ) : (
            <div className="space-y-3">
              {arrivedLoads.map((l) => (
                <div key={l.id} className="p-4 border border-surface-border bg-nature-lightBg/50 rounded-2xl flex justify-between items-center">
                  <div>
                    <h4 className="text-xs font-bold text-slate-800">{l.loadCode}</h4>
                    <p className="text-[11px] text-slate-500 mt-1 font-medium">Category: <span className="font-semibold text-slate-700">{l.wasteType}</span></p>
                  </div>
                  <button
                    onClick={() => {
                      setWeighTarget(l);
                      setGrossWeight(4000);
                      setTareWeight(2000);
                    }}
                    className="btn-primary text-xs !py-2"
                  >
                    Weigh Load
                  </button>
                </div>
              ))}
            </div>
          )}

        </div>

        {/* Box 3: Weighed Loads awaiting Receipts */}
        <div className="p-6 rounded-2xl border border-slate-800 bg-slate-900/20 backdrop-blur space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400">3. Awaiting Receipt Clearance</h2>
            <span className="px-2 py-0.5 bg-slate-800 text-[10px] text-slate-300 rounded font-semibold">{weighedLoads.length} loads</span>
          </div>

          {weighedLoads.length === 0 ? (
            <p className="text-slate-500 text-xs py-4 text-center">No weighed loads awaiting receipt verification.</p>
          ) : (
            <div className="space-y-3">
              {weighedLoads.map((l) => (
                <div key={l.id} className="p-4 border border-slate-800 bg-slate-950/30 rounded-xl flex justify-between items-center">
                  <div>
                    <h4 className="text-xs font-semibold text-slate-200">{l.loadCode}</h4>
                    <p className="text-[10px] text-slate-500 mt-1">Category: {l.wasteType}</p>
                  </div>
                  <button
                    onClick={() => {
                      setReceiptTarget(l);
                      setAcceptedWeight(2000);
                      setRejectedWeight(0);
                    }}
                    className="px-3 py-1.5 bg-teal-600 hover:bg-teal-500 text-white rounded-lg text-xs font-semibold shadow transition"
                  >
                    Verify & Receipt
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Box 4: Accepted Loads for processing */}
        <div className="p-6 rounded-2xl border border-slate-800 bg-slate-900/20 backdrop-blur space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400">4. Processing & Material Recovery</h2>
            <span className="px-2 py-0.5 bg-slate-800 text-[10px] text-slate-300 rounded font-semibold">{acceptedLoads.length} loads</span>
          </div>

          {acceptedLoads.length === 0 ? (
            <p className="text-slate-500 text-xs py-4 text-center">No active accepted loads ready for material sorting/recovery.</p>
          ) : (
            <div className="space-y-3">
              {acceptedLoads.map((l) => (
                <div key={l.id} className="p-4 border border-slate-800 bg-slate-950/30 rounded-xl flex justify-between items-center">
                  <div>
                    <h4 className="text-xs font-semibold text-slate-200">{l.loadCode}</h4>
                    <p className="text-[10px] text-slate-500 mt-1">Status: {l.status}</p>
                  </div>
                  <button
                    onClick={() => {
                      setProcessTarget(l);
                      setProcessInputWeight(2000);
                      setProcessOutputWeight(1500);
                      setProcessResidueWeight(500);
                    }}
                    className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold shadow transition"
                  >
                    Log Processing
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ─── MODAL 1: Scale weighing record form ───────────────────────────── */}
      {weighTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 space-y-6 shadow-2xl">
            <div>
              <h2 className="text-lg font-bold text-slate-100">Scale Weighing</h2>
              <p className="text-xs text-slate-400 mt-1">Capture weight parameters for load {weighTarget.loadCode}</p>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Gross Weight (kg)</label>
                  <input
                    type="number"
                    value={grossWeight}
                    onChange={(e) => setGrossWeight(Number(e.target.value))}
                    className="w-full px-4 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Tare Weight (kg)</label>
                  <input
                    type="number"
                    value={tareWeight}
                    onChange={(e) => setTareWeight(Number(e.target.value))}
                    className="w-full px-4 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="p-3 rounded-xl border border-indigo-500/20 bg-indigo-950/10 flex justify-between text-xs">
                <span className="text-slate-400 font-medium">Calculated Net Weight:</span>
                <span className="text-indigo-400 font-bold">{netWeightCalculator.toLocaleString()} kg</span>
              </div>

              <div className="space-y-2">
                <label className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Weighing Method</label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { mode: 'SIMULATED', label: 'Simulate Scale', desc: 'Auto-resolved' },
                    { mode: 'MANUAL_ENTRY', label: 'Manual Scale', desc: 'Manual weighbridge' },
                  ].map((m) => (
                    <button
                      key={m.mode}
                      onClick={() => setWeighingMethod(m.mode as any)}
                      className={`p-3 rounded-xl border text-center transition flex flex-col items-center justify-center gap-1 ${
                        weighingMethod === m.mode
                          ? 'border-indigo-500 bg-indigo-950/20 text-indigo-300'
                          : 'border-slate-800 bg-slate-950/40 text-slate-400 hover:border-slate-700'
                      }`}
                    >
                      <span className="text-xs font-bold">{m.label}</span>
                      <span className="text-[8px] opacity-75">{m.desc}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex gap-3 justify-end pt-4 border-t border-slate-800">
              <button
                onClick={() => setWeighTarget(null)}
                className="px-4 py-2 border border-slate-800 hover:border-slate-700 text-slate-400 rounded-xl text-xs font-semibold transition"
              >
                Cancel
              </button>
              <button
                onClick={handleRecordWeighing}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold shadow transition"
              >
                Submit Weight
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL 2: Issue Receipt form ───────────────────────────────────── */}
      {receiptTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 space-y-6 shadow-2xl">
            <div>
              <h2 className="text-lg font-bold text-slate-100">Issue Facility Receipt</h2>
              <p className="text-xs text-slate-400 mt-1">Receipt parameters for load {receiptTarget.loadCode}</p>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Receipt Status</label>
                <select
                  value={receiptStatus}
                  onChange={(e) => setReceiptStatus(e.target.value as any)}
                  className="w-full px-4 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-200 focus:outline-none focus:border-teal-500"
                >
                  <option value="ACCEPTED">ACCEPTED (Completely cleared)</option>
                  <option value="PARTIALLY_ACCEPTED">PARTIALLY ACCEPTED (Some weight rejected)</option>
                  <option value="REJECTED">REJECTED (Complete load rejected)</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Accepted Weight (kg)</label>
                  <input
                    type="number"
                    value={acceptedWeight}
                    onChange={(e) => setAcceptedWeight(Number(e.target.value))}
                    className="w-full px-4 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-200 focus:outline-none focus:border-teal-500"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Rejected Weight (kg)</label>
                  <input
                    type="number"
                    value={rejectedWeight}
                    onChange={(e) => setRejectedWeight(Number(e.target.value))}
                    className="w-full px-4 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-200 focus:outline-none focus:border-teal-500"
                  />
                </div>
              </div>

              {receiptStatus !== 'ACCEPTED' && (
                <div className="space-y-2">
                  <label className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Rejection Reason</label>
                  <select
                    value={rejectionReason}
                    onChange={(e) => setRejectionReason(e.target.value)}
                    className="w-full px-4 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-200 focus:outline-none focus:border-teal-500"
                  >
                    <option value="WRONG_WASTE_TYPE">Wrong Waste Type</option>
                    <option value="CONTAMINATION">Contamination Mismatch</option>
                    <option value="HAZARDOUS_MATERIAL">Hazardous Material</option>
                    <option value="EXCESSIVE_MOISTURE">Excessive Moisture</option>
                    <option value="FACILITY_CAPACITY">Facility Capacity Exceeded</option>
                    <option value="OTHER">Other Issue</option>
                  </select>
                </div>
              )}

              <div className="space-y-2">
                <label className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Audit Notes</label>
                <textarea
                  value={receiptNotes}
                  onChange={(e) => setReceiptNotes(e.target.value)}
                  placeholder="Additional observations..."
                  className="w-full h-16 px-4 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-200 focus:outline-none focus:border-teal-500 resize-none"
                />
              </div>

              <div className="p-3 rounded-xl border border-teal-500/20 bg-teal-950/10 flex justify-between text-xs">
                <span className="text-slate-400 font-medium">Sum of weights:</span>
                <span className="text-teal-400 font-bold">{receiptTotalCalc.toLocaleString()} kg</span>
              </div>
            </div>

            <div className="flex gap-3 justify-end pt-4 border-t border-slate-800">
              <button
                onClick={() => setReceiptTarget(null)}
                className="px-4 py-2 border border-slate-800 hover:border-slate-700 text-slate-400 rounded-xl text-xs font-semibold transition"
              >
                Cancel
              </button>
              <button
                onClick={handleIssueReceipt}
                className="px-4 py-2 bg-teal-600 hover:bg-teal-500 text-white rounded-xl text-xs font-semibold shadow transition"
              >
                Issue Receipt
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL 3: Log Processing outcome ───────────────────────────────── */}
      {processTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 space-y-6 shadow-2xl">
            <div>
              <h2 className="text-lg font-bold text-slate-100">Log Processing Output</h2>
              <p className="text-xs text-slate-400 mt-1">Record recovery yields for load {processTarget.loadCode}</p>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Processing Type</label>
                <select
                  value={processType}
                  onChange={(e) => setProcessType(e.target.value)}
                  className="w-full px-4 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-200 focus:outline-none focus:border-blue-500"
                >
                  <option value="COMPOSTED">COMPOSTED</option>
                  <option value="SORTED">SORTED & RECOVERED</option>
                  <option value="RECYCLED">RECYCLED</option>
                  <option value="LANDFILLED">LANDFILLED</option>
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Input weight (kg)</label>
                <input
                  type="number"
                  value={processInputWeight}
                  onChange={(e) => setProcessInputWeight(Number(e.target.value))}
                  className="w-full px-4 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-200 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Output recovered (kg)</label>
                  <input
                    type="number"
                    value={processOutputWeight}
                    onChange={(e) => setProcessOutputWeight(Number(e.target.value))}
                    className="w-full px-4 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-200 focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Residue output (kg)</label>
                  <input
                    type="number"
                    value={processResidueWeight}
                    onChange={(e) => setProcessResidueWeight(Number(e.target.value))}
                    className="w-full px-4 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-200 focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Processing notes</label>
                <textarea
                  value={processNotes}
                  onChange={(e) => setProcessNotes(e.target.value)}
                  placeholder="Recovery logs..."
                  className="w-full h-16 px-4 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-200 focus:outline-none focus:border-blue-500 resize-none"
                />
              </div>

              {/* Real-time Mass Balance Alert Indicator */}
              <div className={`p-3 rounded-xl border flex justify-between text-xs ${
                isMassBalanced
                  ? 'border-emerald-500/20 bg-emerald-950/10 text-emerald-400'
                  : 'border-red-500/20 bg-red-950/10 text-red-400'
              }`}>
                <span>Mass Balance Verification:</span>
                <span className="font-bold">
                  {isMassBalanced ? 'BALANCED (Yields match input within 2%)' : 'MISMATCH (Sum mismatch exceeds 2%)'}
                </span>
              </div>
            </div>

            <div className="flex gap-3 justify-end pt-4 border-t border-slate-800">
              <button
                onClick={() => setProcessTarget(null)}
                className="px-4 py-2 border border-slate-800 hover:border-slate-700 text-slate-400 rounded-xl text-xs font-semibold transition"
              >
                Cancel
              </button>
              <button
                onClick={handleRecordProcessing}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold shadow transition"
              >
                Log Recovery Record
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
