'use client';

import React, { useState, useEffect } from 'react';
import { apiRequest } from '../../../../utils/api';

interface TraceItem {
  itemId: string;
  binId: string;
  collectionPointId: string;
  collectionPointName: string;
  address: string;
  ownerId?: string;
}

interface Transfer {
  id: string;
  status: string;
  dispatchedAt: string | null;
  arrivedAt: string | null;
  facility: {
    name: string;
    facilityCode: string;
    facilityType: string;
  };
}

interface Weighing {
  id: string;
  grossWeightKg: number;
  tareWeightKg: number;
  netWeightKg: number;
  weighingMethod: 'WEIGHBRIDGE' | 'DIGITAL_SCALE' | 'MANUAL_ENTRY' | 'SIMULATED';
  weighedAt: string;
}

interface Processing {
  id: string;
  processType: string;
  inputWeightKg: number;
  outputWeightKg: number | null;
  residueWeightKg: number | null;
  massBalanceStatus: string;
}

interface Receipt {
  id: string;
  receiptCode: string;
  status: string;
  acceptedWeightKg: number;
  rejectedWeightKg: number;
  rejectionReason: string | null;
  notes: string | null;
  processingRecords: Processing[];
}

interface CustodyEvent {
  id: string;
  eventType: string;
  actorId: string;
  occurredAt: string;
  metadata: any;
}

interface TraceDetail {
  loadId: string;
  loadCode: string;
  wasteType: string;
  status: string;
  openedAt: string;
  sealedAt: string | null;
  deliveredAt: string | null;
  items: TraceItem[];
  transfers: Transfer[];
  weighings: Weighing[];
  receipts: Receipt[];
  custodyHistory: CustodyEvent[];
}

export default function GovernmentTraceabilityPage() {
  const [loads, setLoads] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');

  // Selected Trace details
  const [traceDetail, setTraceDetail] = useState<TraceDetail | null>(null);
  const [loadingTrace, setLoadingTrace] = useState(false);

  useEffect(() => {
    fetchLoadsList();
  }, []);

  async function fetchLoadsList() {
    setIsLoading(true);
    try {
      const res = await apiRequest('/loads');
      if (res.ok) {
        setLoads(await res.json());
      } else {
        setErrorMsg('Failed to load waste loads feed.');
      }
    } catch {
      setErrorMsg('Network error.');
    } finally {
      setIsLoading(false);
    }
  }

  async function handleLoadTrace(loadId: string) {
    setLoadingTrace(true);
    setErrorMsg('');
    try {
      const res = await apiRequest(`/loads/${loadId}/trace`);
      if (res.ok) {
        setTraceDetail(await res.json());
      } else {
        setErrorMsg('Failed to trace load lineage. Check administrative scope.');
      }
    } catch {
      setErrorMsg('Network error tracing load.');
    } finally {
      setLoadingTrace(false);
    }
  }

  // Filter loads based on code, bin, or address
  const filteredLoads = loads.filter((l) => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    
    const matchesCode = l.loadCode.toLowerCase().includes(q);
    const matchesCategory = l.wasteType.toLowerCase().includes(q);
    const matchesStatus = l.status.toLowerCase().includes(q);
    
    // items is an array of items inside the load
    const matchesItems = l.items?.some((i: any) =>
      i.binId?.toLowerCase().includes(q) ||
      i.collectionPointId?.toLowerCase().includes(q)
    );

    return matchesCode || matchesCategory || matchesStatus || matchesItems;
  });

  return (
    <div className="space-y-8 pb-24">
      {/* Header */}
      <div className="p-6 rounded-2xl border border-slate-800 bg-gradient-to-br from-slate-900/80 to-indigo-950/20 backdrop-blur">
        <div className="text-xs text-indigo-400 font-semibold uppercase tracking-widest mb-1">Traceability Control</div>
        <h1 className="text-2xl font-bold text-slate-100 font-display">End-to-End Waste Traceability</h1>
        <p className="text-sm text-slate-400 mt-1">Audit materials from source citizen bin collection events up to final facility recovery or residue output processing.</p>
      </div>

      {errorMsg && (
        <div className="p-4 rounded-xl border border-red-500/30 bg-red-950/20 text-red-300 text-sm">{errorMsg}</div>
      )}

      {/* Global Mass Balance Panel */}
      {!isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[
            { label: 'Total Waste Batches', val: loads.length, color: 'text-indigo-400' },
            { label: 'In Transit', val: loads.filter(l => l.status === 'IN_TRANSIT').length, color: 'text-blue-400' },
            { label: 'Delivered / Arrived', val: loads.filter(l => ['ARRIVED', 'WEIGHED', 'ACCEPTED', 'PARTIALLY_REJECTED', 'REJECTED', 'CLOSED'].includes(l.status)).length, color: 'text-teal-400' },
            { label: 'Closed Cycles', val: loads.filter(l => l.status === 'CLOSED').length, color: 'text-emerald-400' },
          ].map((s) => (
            <div key={s.label} className="p-5 rounded-2xl border border-slate-800 bg-slate-900/40 backdrop-blur">
              <div className={`text-3xl font-bold ${s.color}`}>{s.val}</div>
              <div className="text-[10px] text-slate-500 mt-1.5 uppercase font-semibold tracking-wider">{s.label}</div>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left list: search & loads */}
        <div className="lg:col-span-1 space-y-4">
          <div className="space-y-2">
            <label className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Search batch loads</label>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by loadCode, binId, or status..."
              className="w-full px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <h3 className="text-sm font-bold text-slate-200">Waste Load Batches</h3>

          {isLoading ? (
            <div className="p-12 text-center border border-slate-800 rounded-2xl bg-slate-900/20">
              <div className="h-6 w-6 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <p className="text-slate-500 text-xs">Loading custody feeds...</p>
            </div>
          ) : filteredLoads.length === 0 ? (
            <p className="text-slate-500 text-xs py-4 text-center">No matching loads found.</p>
          ) : (
            <div className="space-y-3 max-h-[500px] overflow-y-auto pr-2">
              {filteredLoads.map((l) => (
                <div
                  key={l.id}
                  onClick={() => handleLoadTrace(l.id)}
                  className={`p-4 rounded-xl border transition cursor-pointer flex flex-col gap-2 ${
                    traceDetail?.loadId === l.id
                      ? 'border-indigo-500 bg-indigo-950/10'
                      : 'border-slate-800 bg-slate-900/20 hover:border-slate-700'
                  }`}
                >
                  <div className="flex justify-between items-start">
                    <h4 className="text-xs font-semibold text-slate-200">{l.loadCode}</h4>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${
                      l.status === 'CLOSED' ? 'bg-emerald-500/10 text-emerald-400' :
                      l.status === 'IN_TRANSIT' ? 'bg-blue-500/10 text-blue-400' :
                      'bg-slate-800 text-slate-400'
                    }`}>
                      {l.status}
                    </span>
                  </div>
                  <div className="flex justify-between text-[10px] text-slate-500">
                    <span>Category: {l.wasteType}</span>
                    <span>Items: {l.items?.length || 0} bins</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right column: Trace Pipeline Graph */}
        <div className="lg:col-span-2 space-y-4">
          <h3 className="text-sm font-bold text-slate-200">End-to-End Lineage Flow</h3>

          {loadingTrace ? (
            <div className="p-16 text-center border border-slate-800 rounded-2xl bg-slate-900/20">
              <div className="h-6 w-6 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <p className="text-slate-500 text-xs">Tracing waste lifecycle pipeline...</p>
            </div>
          ) : !traceDetail ? (
            <div className="p-16 text-center border border-slate-800 rounded-2xl bg-slate-900/20">
              <div className="text-4xl mb-3">🕸️</div>
              <p className="text-slate-400 text-sm font-semibold">Select a load batch from the list to view trace pipeline.</p>
              <p className="text-slate-500 text-xs mt-1">Audit complete custody trails from origin properties up to recycling outputs.</p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Batch General info */}
              <div className="p-4 rounded-xl border border-indigo-500/20 bg-indigo-950/10 grid grid-cols-3 gap-4 text-xs">
                <div>
                  <span className="text-slate-500 block">Load Batch</span>
                  <strong className="text-slate-200">{traceDetail.loadCode}</strong>
                </div>
                <div>
                  <span className="text-slate-500 block">Waste Type</span>
                  <strong className="text-slate-200">{traceDetail.wasteType}</strong>
                </div>
                <div>
                  <span className="text-slate-500 block">Lifecycle status</span>
                  <strong className="text-indigo-400 font-bold uppercase">{traceDetail.status}</strong>
                </div>
              </div>

              {/* Lineage Steps Nodes */}
              <div className="relative border-l border-slate-800 ml-4 pl-6 space-y-8">
                
                {/* Node 1: Collection points list */}
                <div className="relative">
                  <div className="absolute -left-[31px] top-0.5 h-4 w-4 rounded-full bg-indigo-500 border-4 border-slate-900" />
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">1. Citizen Bins Source Points</h4>
                  <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                    {traceDetail.items.map((item) => (
                      <div key={item.itemId} className="p-3 bg-slate-900/30 rounded-xl border border-slate-800/80 text-[10px] space-y-1">
                        <p className="font-semibold text-slate-300">📍 {item.address}</p>
                        <p className="text-slate-500">Bin Mapped ID: <strong className="text-slate-400">{item.binId}</strong></p>
                        {item.ownerId && <p className="text-slate-500">Owner User ID: <span className="text-indigo-400">{item.ownerId}</span></p>}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Node 2: Transfer destination dispatch */}
                {traceDetail.transfers.map((trans) => (
                  <div key={trans.id} className="relative">
                    <div className="absolute -left-[31px] top-0.5 h-4 w-4 rounded-full bg-blue-500 border-4 border-slate-900" />
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">2. Dispatched Waste Transfer</h4>
                    <div className="mt-3 p-4 bg-slate-900/30 rounded-xl border border-slate-800 space-y-2 text-xs">
                      <p className="text-slate-300 font-medium">Destination: {trans.facility.name} ({trans.facility.facilityCode})</p>
                      <p className="text-[10px] text-slate-500">Facility Type: {trans.facility.facilityType}</p>
                      <div className="flex gap-4 text-[10px] text-slate-500 mt-2">
                        {trans.dispatchedAt && <span>📅 Dispatched: {new Date(trans.dispatchedAt).toLocaleString()}</span>}
                        {trans.arrivedAt && <span>📅 Arrived: {new Date(trans.arrivedAt).toLocaleString()}</span>}
                      </div>
                    </div>
                  </div>
                ))}

                {/* Node 3: Weighing Scale Records */}
                {traceDetail.weighings.length > 0 && traceDetail.weighings.map((w) => (
                  <div key={w.id} className="relative">
                    <div className="absolute -left-[31px] top-0.5 h-4 w-4 rounded-full bg-teal-500 border-4 border-slate-900" />
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">3. Weighbridge Scale record</h4>
                    <div className="mt-3 p-4 bg-slate-900/30 rounded-xl border border-slate-800 space-y-2 text-xs">
                      <div className="flex justify-between items-center">
                        <p className="text-slate-300 font-medium">
                          Net Weight: <strong className="text-teal-400 text-sm font-extrabold">{(w.netWeightKg).toLocaleString()} kg</strong>
                        </p>
                        {w.weighingMethod === 'SIMULATED' && (
                          <span className="px-2 py-0.5 bg-amber-500/10 text-amber-400 border border-amber-500/20 text-[8px] font-bold uppercase rounded">
                            SIMULATED MEASUREMENT
                          </span>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-4 text-[10px] text-slate-500">
                        <p>Gross: {w.grossWeightKg.toLocaleString()} kg</p>
                        <p>Tare: {w.tareWeightKg.toLocaleString()} kg</p>
                        <p className="col-span-2">Weighed At: {new Date(w.weighedAt).toLocaleString()} (Method: {w.weighingMethod})</p>
                      </div>
                    </div>
                  </div>
                ))}

                {/* Node 4: Receipts verification */}
                {traceDetail.receipts.length > 0 && traceDetail.receipts.map((r) => (
                  <div key={r.id} className="relative">
                    <div className="absolute -left-[31px] top-0.5 h-4 w-4 rounded-full bg-emerald-500 border-4 border-slate-900" />
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">4. Facility Receipt Verification</h4>
                    <div className="mt-3 p-4 bg-slate-900/30 rounded-xl border border-slate-800 space-y-3 text-xs">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="text-slate-300 font-medium">Receipt Code: {r.receiptCode}</p>
                          <p className="text-[10px] text-slate-500 mt-0.5">Status: <strong className="text-emerald-400">{r.status}</strong></p>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4 text-[10px] text-slate-500 border-t border-slate-800/60 pt-2">
                        <p>Accepted Intake: <strong className="text-slate-300">{r.acceptedWeightKg.toLocaleString()} kg</strong></p>
                        <p>Rejected Weight: <strong className="text-slate-300">{r.rejectedWeightKg.toLocaleString()} kg</strong></p>
                        {r.rejectionReason && <p className="col-span-2 text-red-400">Rejection Reason: {r.rejectionReason}</p>}
                        {r.notes && <p className="col-span-2 font-mono">Notes: "{r.notes}"</p>}
                      </div>

                      {/* Processing outcomes nesting */}
                      {r.processingRecords.length > 0 && (
                        <div className="border-t border-slate-800 pt-3 space-y-2">
                          <h5 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">5. Materials Recovery Yields</h5>
                          {r.processingRecords.map((p) => (
                            <div key={p.id} className="p-3 bg-slate-950/40 border border-slate-850 rounded-lg space-y-2 text-[10px]">
                              <div className="flex justify-between items-center">
                                <span className="font-semibold text-slate-350">Process Type: {p.processType}</span>
                                <span className={`px-2 py-0.5 rounded-[4px] border ${
                                  p.massBalanceStatus === 'BALANCED'
                                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                    : 'bg-red-500/10 text-red-400 border-red-500/20'
                                }`}>
                                  {p.massBalanceStatus}
                                </span>
                              </div>
                              <div className="grid grid-cols-3 gap-2 text-slate-500">
                                <p>Input: {p.inputWeightKg.toLocaleString()} kg</p>
                                <p>Recovered: {p.outputWeightKg ? p.outputWeightKg.toLocaleString() + ' kg' : 'N/A'}</p>
                                <p>Residue: {p.residueWeightKg ? p.residueWeightKg.toLocaleString() + ' kg' : 'N/A'}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Custody trail events list */}
              <div className="p-5 border border-slate-800 bg-slate-900/10 rounded-2xl space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">Audit Chain Custody Log</h4>
                <div className="space-y-2">
                  {traceDetail.custodyHistory.map((evt) => (
                    <div key={evt.id} className="flex justify-between items-center text-[10px] text-slate-500 border-b border-slate-800/40 pb-1.5">
                      <div>
                        <strong className="text-slate-350">{evt.eventType}</strong> by Actor: <span className="text-slate-400 font-mono">{evt.actorId}</span>
                      </div>
                      <span>{new Date(evt.occurredAt).toLocaleTimeString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
