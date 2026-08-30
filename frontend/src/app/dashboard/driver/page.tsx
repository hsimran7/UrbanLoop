'use client';

import React, { useState, useEffect } from 'react';
import { apiRequest } from '../../../utils/api';
import { getSocket } from '../../../utils/socket';

interface Stop {
  id: string;
  stopOrder: number;
  completed: boolean;
  completedAt: string | null;
  status: string;
  property?: { address: string };
  collectionPoint?: { name: string };
}

interface Assignment {
  id: string;
  status: string;
  shiftName?: string;
  areaName?: string;
  zoneName?: string;
  vehicle?: {
    id: string;
    vehicleCode: string;
    registrationNumber: string;
    currentFuelLevel: number;
    odometerKm: number;
    status: string;
  };
  route?: {
    routeCode: string;
    expectedDistance: number;
    stops: Stop[];
  };
  targets?: { total: number; collected: number; missed: number; pending: number };
  completionRate?: number;
}

export default function DriverDashboardPage() {
  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [kpis, setKpis] = useState<any>(null);

  // Pre-Trip Checklist
  const [brakesPassed, setBrakesPassed] = useState(true);
  const [tiresPassed, setTiresPassed] = useState(true);
  const [lightsPassed, setTiresLights] = useState(true);
  const [hydraulicsPassed, setHydraulicsPassed] = useState(true);
  const [fuelPassed, setFuelPassed] = useState(true);
  const [batteryPassed, setBatteryPassed] = useState(true);
  const [cleanPassed, setCleanPassed] = useState(true);
  const [inspectionNotes, setInspectionNotes] = useState('');

  // Refuel Log Form
  const [fuelLitres, setFuelLitres] = useState('');
  const [fuelCost, setFuelCost] = useState('');
  const [fuelOdo, setFuelOdo] = useState('');

  // Breakdown Form
  const [breakdownType, setBreakdownType] = useState('FLAT_TIRE');
  const [breakdownDesc, setBreakdownDesc] = useState('');

  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    fetchDriverDashboard();

    const socket = getSocket('realtime');
    
    socket.on('connect', () => {
      console.log('Driver connected to realtime WS stream.');
      fetchDriverDashboard();
    });

    socket.on('TASK_ASSIGNED', () => fetchDriverDashboard());
    socket.on('TASK_STATUS_UPDATED', () => fetchDriverDashboard());
    socket.on('assignmentCreated', () => fetchDriverDashboard());
    socket.on('assignmentUpdated', () => fetchDriverDashboard());
    socket.on('taskCompleted', () => fetchDriverDashboard());
    socket.on('targetCollected', () => fetchDriverDashboard());
    socket.on('targetMissed', () => fetchDriverDashboard());
    socket.on('targetSkipped', () => fetchDriverDashboard());
    socket.on('notification', () => fetchDriverDashboard());

    return () => {
      socket.off('TASK_ASSIGNED');
      socket.off('TASK_STATUS_UPDATED');
      socket.off('assignmentCreated');
      socket.off('assignmentUpdated');
      socket.off('taskCompleted');
      socket.off('targetCollected');
      socket.off('targetMissed');
      socket.off('targetSkipped');
      socket.off('notification');
    };
  }, []);

  async function fetchDriverDashboard() {
    setLoading(true);
    setErrorMsg('');
    try {
      const [assRes, kpiRes] = await Promise.all([
        apiRequest('/fleet/driver/my-assignment'),
        apiRequest('/fleet/driver/kpis'),
      ]);

      if (assRes.ok) {
        const data = await assRes.json();
        setAssignment(data);
      } else {
        setErrorMsg('No vehicle or route assignment generated for you today.');
      }

      if (kpiRes.ok) setKpis(await kpiRes.json());
    } catch {
      setErrorMsg('Failed to load dashboard.');
    } finally {
      setLoading(false);
    }
  }

  // Lifecycle handlers
  async function handleAcceptAssignment() {
    if (!assignment) return;
    setActionLoading(true);
    setErrorMsg(''); setSuccessMsg('');
    try {
      const res = await apiRequest(`/assignments/${assignment.id}/accept`, { method: 'POST' });
      if (res.ok) {
        setSuccessMsg('Assignment accepted!');
        fetchDriverDashboard();
      } else {
        const err = await res.json();
        setErrorMsg(err.message || 'Failed to accept assignment.');
      }
    } catch { setErrorMsg('Network error.'); }
    finally { setActionLoading(false); }
  }

  async function handleStartAssignment() {
    if (!assignment) return;
    setActionLoading(true);
    setErrorMsg(''); setSuccessMsg('');
    try {
      const res = await apiRequest(`/assignments/${assignment.id}/start`, { method: 'POST' });
      if (res.ok) {
        setSuccessMsg('Route started! Stay safe.');
        fetchDriverDashboard();
      } else {
        const err = await res.json();
        setErrorMsg(err.message || 'Failed to start route.');
      }
    } catch { setErrorMsg('Network error.'); }
    finally { setActionLoading(false); }
  }

  async function handleCompleteAssignment() {
    if (!assignment) return;
    if (!confirm('Complete shift and finalize route collection?')) return;
    setActionLoading(true);
    setErrorMsg(''); setSuccessMsg('');
    try {
      const res = await apiRequest(`/assignments/${assignment.id}/complete`, { method: 'POST' });
      if (res.ok) {
        setSuccessMsg('Shift completed successfully!');
        fetchDriverDashboard();
      } else {
        const err = await res.json();
        setErrorMsg(err.message || 'Failed to complete route.');
      }
    } catch { setErrorMsg('Network error.'); }
    finally { setActionLoading(false); }
  }

  async function handleCollectStop(targetId: string) {
    if (!assignment) return;
    try {
      const clientEventId = `evt-collect-${targetId}-${Date.now()}`;
      const res = await apiRequest(`/assignments/${assignment.id}/targets/${targetId}/collect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientEventId }),
      });
      if (res.ok) {
        setSuccessMsg('Stop marked as collected!');
        fetchDriverDashboard();
      } else {
        const err = await res.json();
        setErrorMsg(err.message || 'Failed to mark stop collected.');
      }
    } catch { setErrorMsg('Network error.'); }
  }

  // Pre-trip inspection checklist submission
  async function handleSubmitInspection(e: React.FormEvent) {
    e.preventDefault();
    if (!assignment || !assignment.vehicle?.id) return;
    setErrorMsg('');
    setSuccessMsg('');

    try {
      const res = await apiRequest(`/fleet/vehicles/${assignment.vehicle.id}/inspection`, {
        method: 'POST',
        body: JSON.stringify({
          brakesPassed,
          tiresPassed,
          lightsPassed,
          hydraulicsPassed,
          fuelPassed,
          batteryPassed,
          cleanPassed,
          notes: inspectionNotes || undefined,
        }),
      });

      if (res.ok) {
        setSuccessMsg('Pre-Trip Inspection checklist logged successfully.');
        fetchDriverDashboard();
      } else {
        const err = await res.json();
        setErrorMsg(err.message || 'Failed to submit checklist.');
      }
    } catch {
      setErrorMsg('Network error.');
    }
  }

  // Refuel refilling logs
  async function handleFuelLog(e: React.FormEvent) {
    e.preventDefault();
    if (!assignment || !assignment.vehicle?.id) return;
    setErrorMsg('');
    setSuccessMsg('');

    try {
      const res = await apiRequest(`/fleet/vehicles/${assignment.vehicle.id}/fuel`, {
        method: 'POST',
        body: JSON.stringify({
          amountLitres: parseFloat(fuelLitres),
          cost: parseFloat(fuelCost),
          odometerKm: parseFloat(fuelOdo),
        }),
      });

      if (res.ok) {
        setSuccessMsg('Fuel refuelling history logged.');
        setFuelLitres('');
        setFuelCost('');
        setFuelOdo('');
        fetchDriverDashboard();
      } else {
        setErrorMsg('Failed to record fuel log.');
      }
    } catch {
      setErrorMsg('Network error refuelling log.');
    }
  }

  // Breakdown logs
  async function handleBreakdown(e: React.FormEvent) {
    e.preventDefault();
    if (!assignment || !assignment.vehicle?.id) return;
    setErrorMsg('');
    setSuccessMsg('');

    try {
      const res = await apiRequest(`/fleet/vehicles/${assignment.vehicle.id}/breakdown`, {
        method: 'POST',
        body: JSON.stringify({
          issueType: breakdownType,
          description: breakdownDesc,
        }),
      });

      if (res.ok) {
        setSuccessMsg('Vehicle breakdown report submitted. Dispatch notified.');
        setBreakdownDesc('');
        fetchDriverDashboard();
      } else {
        setErrorMsg('Failed to submit breakdown.');
      }
    } catch {
      setErrorMsg('Network error breakdown.');
    }
  }

  if (loading) {
    return (
      <div className="glass-card p-16 text-center">
        <div className="h-8 w-8 border-2 border-nature-accent border-t-transparent rounded-full animate-spin mx-auto mb-2" />
        <p className="text-slate-500 text-sm font-medium">Loading operator dashboard...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-24 text-slate-800">
      
      {/* Header & Status Banner */}
      <div className="glass-card p-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="text-xs text-nature-earth font-extrabold uppercase tracking-widest mb-1">Driver Portal</div>
          <h1 className="text-3xl font-extrabold text-slate-800 tracking-tight font-display flex items-center gap-3">
            Operator Board
            {assignment && (
              <span className={`px-3 py-1 text-xs font-black rounded-full uppercase border ${
                assignment.status === 'COMPLETED' ? 'bg-emerald-100 text-emerald-800 border-emerald-300' :
                assignment.status === 'IN_PROGRESS' ? 'bg-blue-100 text-blue-800 border-blue-300' :
                assignment.status === 'ACCEPTED' ? 'bg-teal-100 text-teal-800 border-teal-300' :
                'bg-amber-100 text-amber-800 border-amber-300'
              }`}>
                {assignment.status}
              </span>
            )}
          </h1>
        </div>

        {/* Lifecycle Buttons */}
        {assignment && (
          <div className="flex flex-wrap gap-2">
            {(assignment.status === 'ASSIGNED' || assignment.status === 'CREATED') && (
              <button onClick={handleAcceptAssignment} disabled={actionLoading}
                className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow-md transition disabled:opacity-50">
                Accept Assignment
              </button>
            )}
            {(assignment.status === 'ASSIGNED' || assignment.status === 'ACCEPTED' || assignment.status === 'READY') && (
              <button onClick={handleStartAssignment} disabled={actionLoading}
                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-xl shadow-md transition disabled:opacity-50">
                Start Route
              </button>
            )}
            {assignment.status === 'IN_PROGRESS' && (
              <button onClick={handleCompleteAssignment} disabled={actionLoading}
                className="px-5 py-2.5 bg-emerald-700 hover:bg-emerald-600 text-white font-bold text-xs rounded-xl shadow-md transition disabled:opacity-50">
                Complete Shift
              </button>
            )}
          </div>
        )}
      </div>

      {kpis && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
          <div className="glass-card p-5 text-center">
            <span className="text-slate-500 block font-extrabold uppercase tracking-wider text-[10px] mb-1">Routes Completed</span>
            <span className="text-2xl font-black text-slate-800">{kpis.routesCompleted || kpis.completedAssignments || 0}</span>
          </div>
          <div className="glass-card p-5 text-center">
            <span className="text-slate-500 block font-extrabold uppercase tracking-wider text-[10px] mb-1">Breakdowns Logged</span>
            <span className="text-2xl font-black text-red-600">{kpis.breakdownsReported || 0}</span>
          </div>
          <div className="glass-card p-5 text-center">
            <span className="text-slate-500 block font-extrabold uppercase tracking-wider text-[10px] mb-1">Success Rate</span>
            <span className="text-2xl font-black text-emerald-600">{kpis.collectionSuccessRate || kpis.avgCompletionRate || 100}%</span>
          </div>
          <div className="glass-card p-5 text-center">
            <span className="text-slate-500 block font-extrabold uppercase tracking-wider text-[10px] mb-1">Operator Safety Score</span>
            <span className="text-2xl font-black text-purple-700">{kpis.safetyScore || 97} / 100</span>
          </div>
        </div>
      )}

      {successMsg && <div className="p-4 rounded-xl border border-nature-accent bg-emerald-50 text-emerald-700 text-sm font-medium">{successMsg}</div>}
      {errorMsg && <div className="p-4 rounded-xl border border-red-200 bg-red-50 text-red-700 text-sm font-medium">{errorMsg}</div>}

      {!assignment ? (
        <div className="glass-card p-12 text-center">
          <div className="text-4xl mb-3">🚚</div>
          <p className="text-slate-600 text-sm font-bold">No active fleet routing assignment generated for you today.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Stops List */}
          <div className="lg:col-span-1 glass-card p-6 space-y-4">
            <div className="flex justify-between items-center pb-2 border-b border-surface-border">
              <h3 className="text-sm font-bold text-slate-800">Today's stops checklist</h3>
              <span className="text-xs text-nature-earth font-mono font-bold uppercase">{assignment.route?.routeCode || 'ROUTE-ACTIVE'}</span>
            </div>

            <div className="space-y-3">
              {(assignment.route?.stops || []).map((stop) => (
                <div key={stop.id} className="p-3.5 bg-nature-lightBg/60 border border-surface-border rounded-xl flex items-center justify-between text-xs gap-2">
                  <div>
                    <p className="font-bold text-slate-800">Stop #{stop.stopOrder}</p>
                    <p className="text-[11px] text-slate-500 mt-0.5 font-medium">{stop.property?.address || stop.collectionPoint?.name || 'Collection Stop'}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {!stop.completed && (
                      <button onClick={() => handleCollectStop(stop.id)}
                        className="px-2 py-1 bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-bold rounded-lg shadow-sm transition">
                        Collect
                      </button>
                    )}
                    <span className={`px-2.5 py-0.5 rounded-lg text-[10px] font-extrabold uppercase ${
                      stop.completed ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-nature-white text-slate-500 border border-surface-border'
                    }`}>
                      {stop.completed ? 'Completed' : 'Pending'}
                    </span>
                  </div>
                </div>
              ))}
              {(!assignment.route?.stops || assignment.route.stops.length === 0) && (
                <p className="text-xs text-slate-500 text-center py-4">No individual stops generated.</p>
              )}
            </div>
          </div>

          {/* Center Column: Pre-Trip Inspection Form */}
          <div className="lg:col-span-1 glass-card p-6 space-y-4">
            <h3 className="text-sm font-bold text-slate-800 pb-2 border-b border-surface-border">Pre-Trip Inspection Checklist</h3>

            {assignment.vehicle?.status !== 'ASSIGNED' && assignment.vehicle?.status !== 'READY' ? (
              <div className="p-4 border border-emerald-200 bg-emerald-50/50 text-xs rounded-xl text-slate-700">
                <p className="font-bold text-slate-800">Checklist status: {assignment.vehicle?.status || 'READY'}</p>
                <p className="text-slate-600 mt-1 font-medium">Inspection checklist logged. Vehicle status is READY or IN_SERVICE.</p>
              </div>
            ) : (
              <form onSubmit={handleSubmitInspection} className="space-y-3 text-xs">
                {[
                  { label: 'Brakes system check', val: brakesPassed, set: setBrakesPassed },
                  { label: 'Tires pressure check', val: tiresPassed, set: setTiresPassed },
                  { label: 'Lights alignment check', val: lightsPassed, set: setTiresLights },
                  { label: 'Hydraulics pressure check', val: hydraulicsPassed, set: setHydraulicsPassed },
                  { label: 'Fuel level verification', val: fuelPassed, set: setFuelPassed },
                  { label: 'Battery charge state', val: batteryPassed, set: setBatteryPassed },
                  { label: 'Cleanliness check', val: cleanPassed, set: setCleanPassed },
                ].map((item) => (
                  <label key={item.label} className="flex justify-between items-center p-3 bg-nature-lightBg/50 border border-surface-border rounded-xl cursor-pointer">
                    <span className="text-slate-700 font-semibold">{item.label}</span>
                    <input
                      type="checkbox"
                      checked={item.val}
                      onChange={(e) => item.set(e.target.checked)}
                      className="rounded accent-emerald-600 w-4 h-4"
                    />
                  </label>
                ))}

                <div className="space-y-1 pt-1">
                  <label className="text-slate-600 block font-bold text-xs">Notes</label>
                  <input
                    type="text"
                    value={inspectionNotes}
                    onChange={(e) => setInspectionNotes(e.target.value)}
                    placeholder="Worn out brake pads, etc..."
                    className="input-field !py-2"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full py-2.5 btn-primary font-bold rounded-xl transition"
                >
                  Submit Inspection
                </button>
              </form>
            )}
          </div>

          {/* Right Column: Breakdown and refuel */}
          <div className="lg:col-span-1 space-y-6">
            
            {/* Odo / Fuel summary */}
            <div className="glass-card p-5 text-xs space-y-2">
              <h4 className="font-bold text-slate-800 text-sm">Vehicle: {assignment.vehicle?.registrationNumber || 'UL-TRUCK-01'}</h4>
              <div className="flex justify-between text-slate-600 font-medium pt-1">
                <span>Current Fuel: <strong className="text-slate-800">{assignment.vehicle?.currentFuelLevel || 85}%</strong></span>
                <span>Odometer: <strong className="text-slate-800">{(assignment.vehicle?.odometerKm || 12450).toLocaleString()} km</strong></span>
              </div>
            </div>

            {/* Log refuelling */}
            <form onSubmit={handleFuelLog} className="glass-card p-6 space-y-3 text-xs">
              <h3 className="text-sm font-bold text-slate-800 border-b border-surface-border pb-2">Log refuel refill</h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-slate-600 font-semibold block">Litres filled</label>
                  <input type="number" required value={fuelLitres} onChange={e => setFuelLitres(e.target.value)} className="input-field !py-1.5" />
                </div>
                <div className="space-y-1">
                  <label className="text-slate-600 font-semibold block">Refuel cost</label>
                  <input type="number" required value={fuelCost} onChange={e => setFuelCost(e.target.value)} className="input-field !py-1.5" />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-slate-600 font-semibold block">Odometer snap (km)</label>
                <input type="number" required value={fuelOdo} onChange={e => setFuelOdo(e.target.value)} className="input-field !py-1.5" />
              </div>
              <button type="submit" className="w-full py-2.5 btn-primary font-bold rounded-xl">Log Refuel</button>
            </form>

            {/* Breakdown trigger */}
            <form onSubmit={handleBreakdown} className="p-6 rounded-2xl border border-red-200 bg-red-50/50 space-y-3 text-xs">
              <h3 className="text-sm font-bold text-red-700 border-b border-red-200 pb-2">Report Breakdown</h3>
              <div className="space-y-1">
                <label className="text-slate-700 font-semibold block">Issue type</label>
                <select value={breakdownType} onChange={e => setBreakdownType(e.target.value)} className="input-field !py-1.5">
                  <option value="FLAT_TIRE">FLAT_TIRE</option>
                  <option value="ENGINE_ISSUE">ENGINE_ISSUE</option>
                  <option value="HYDRAULIC_FAILURE">HYDRAULIC_FAILURE</option>
                  <option value="ACCIDENT">ACCIDENT</option>
                  <option value="FUEL_SHORTAGE">FUEL_SHORTAGE</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-slate-700 font-semibold block">Issue description</label>
                <textarea required rows={2} value={breakdownDesc} onChange={e => setBreakdownDesc(e.target.value)} className="input-field !py-1.5" />
              </div>
              <button type="submit" className="w-full py-2.5 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl transition shadow-sm">Report Breakdown</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
