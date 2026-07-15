'use client';

import React, { useState, useEffect } from 'react';
import { apiRequest } from '../../../../utils/api';

const DAYS = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];

interface Shift {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  activeDays: string[];
  cutoffMinutes: number;
  isActive: boolean;
  timezone: string;
}

interface Worker {
  id: string;
  employeeId: string;
  user: { email: string };
  employmentStatus: string;
}

interface ShiftAssignment {
  id: string;
  workDate: string;
  shiftId: string;
  workerProfileId: string;
  shift?: { name: string; startTime: string; endTime: string };
  worker?: { employeeId: string; user: { email: string } };
}

export default function ShiftsManagementPage() {
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [assignments, setAssignments] = useState<ShiftAssignment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState<'shifts' | 'assignments'>('shifts');
  const [showCreateForm, setShowCreateForm] = useState(false);

  // Create shift form
  const [shiftName, setShiftName] = useState('');
  const [shiftStart, setShiftStart] = useState('07:00');
  const [shiftEnd, setShiftEnd] = useState('14:00');
  const [shiftDays, setShiftDays] = useState<string[]>(['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY']);
  const [cutoffMins, setCutoffMins] = useState(60);
  const [timezone, setTimezone] = useState('Asia/Kolkata');

  // Assign shift form
  const [assignShiftId, setAssignShiftId] = useState('');
  const [assignWorkerId, setAssignWorkerId] = useState('');
  const [assignDate, setAssignDate] = useState(new Date().toISOString().split('T')[0]);
  const [filterDate, setFilterDate] = useState('');

  useEffect(() => {
    fetchShifts();
    fetchWorkers();
  }, []);

  useEffect(() => {
    fetchAssignments(filterDate);
  }, [filterDate]);

  async function fetchShifts() {
    setIsLoading(true);
    try {
      const res = await apiRequest('/shifts');
      if (res.ok) setShifts(await res.json());
    } catch { /* silently fail */ }
    finally { setIsLoading(false); }
  }

  async function fetchWorkers() {
    try {
      const res = await apiRequest('/workforce/workers');
      if (res.ok) setWorkers(await res.json());
    } catch { /* silently fail */ }
  }

  async function fetchAssignments(date?: string) {
    try {
      const query = date ? `?workDate=${date}` : '';
      const res = await apiRequest(`/shifts/assignments${query}`);
      if (res.ok) setAssignments(await res.json());
    } catch { /* silently fail */ }
  }

  function toggleDay(day: string) {
    setShiftDays(prev => prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]);
  }

  async function handleCreateShift(e: React.FormEvent) {
    e.preventDefault();
    setIsSubmitting(true);
    setErrorMsg(''); setSuccessMsg('');
    try {
      const res = await apiRequest('/shifts', {
        method: 'POST',
        body: JSON.stringify({
          name: shiftName,
          startTime: shiftStart,
          endTime: shiftEnd,
          activeDays: shiftDays,
          cutoffMinutes: cutoffMins,
          timezone,
        }),
      });
      if (res.ok) {
        setSuccessMsg('Shift created successfully.');
        setShowCreateForm(false);
        setShiftName('');
        fetchShifts();
      } else {
        const data = await res.json();
        setErrorMsg(data.message || 'Failed to create shift.');
      }
    } catch {
      setErrorMsg('Network error. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleAssignShift(e: React.FormEvent) {
    e.preventDefault();
    if (!assignShiftId || !assignWorkerId) return;
    setIsSubmitting(true);
    setErrorMsg(''); setSuccessMsg('');
    try {
      const res = await apiRequest(`/shifts/${assignShiftId}/assignments`, {
        method: 'POST',
        body: JSON.stringify({ workerProfileId: assignWorkerId, workDate: assignDate }),
      });
      if (res.ok) {
        setSuccessMsg('Worker assigned to shift.');
        setAssignWorkerId('');
        fetchAssignments(filterDate);
      } else {
        const data = await res.json();
        setErrorMsg(data.message || 'Failed to assign shift.');
      }
    } catch {
      setErrorMsg('Network error. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Shifts & Scheduling</h1>
          <p className="text-sm text-slate-400 mt-1">Define reusable shift patterns and assign workers to daily shifts</p>
        </div>
        {activeTab === 'shifts' && (
          <button
            onClick={() => { setShowCreateForm(!showCreateForm); setErrorMsg(''); setSuccessMsg(''); }}
            className="px-4 py-2 rounded-xl text-sm font-semibold bg-gradient-to-r from-emerald-500 to-teal-400 text-slate-950 hover:opacity-90 active:scale-95 transition shadow-lg shadow-emerald-500/20"
          >
            {showCreateForm ? 'Cancel' : '+ New Shift'}
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-800">
        {(['shifts', 'assignments'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-5 py-2.5 text-sm font-medium capitalize transition border-b-2 -mb-px ${
              activeTab === tab
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            {tab === 'shifts' ? 'Shift Definitions' : 'Worker Assignments'}
          </button>
        ))}
      </div>

      {/* Feedback */}
      {errorMsg && <div className="p-4 rounded-xl border border-red-500/30 bg-red-950/20 text-red-300 text-sm">{errorMsg}</div>}
      {successMsg && <div className="p-4 rounded-xl border border-emerald-500/30 bg-emerald-950/20 text-emerald-300 text-sm">{successMsg}</div>}

      {activeTab === 'shifts' ? (
        <>
          {/* Create Shift Form */}
          {showCreateForm && (
            <form onSubmit={handleCreateShift} className="p-6 rounded-2xl border border-slate-800 bg-slate-900/60 backdrop-blur space-y-5">
              <h2 className="text-base font-semibold text-slate-200">Create Shift Definition</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Shift Name</label>
                  <input type="text" required value={shiftName} onChange={e => setShiftName(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 text-sm focus:outline-none focus:border-emerald-500/50"
                    placeholder="Morning Shift A" />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Timezone</label>
                  <input type="text" value={timezone} onChange={e => setTimezone(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 text-sm focus:outline-none focus:border-emerald-500/50"
                    placeholder="Asia/Kolkata" />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Start Time</label>
                  <input type="time" value={shiftStart} onChange={e => setShiftStart(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 text-sm focus:outline-none focus:border-emerald-500/50" />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">End Time</label>
                  <input type="time" value={shiftEnd} onChange={e => setShiftEnd(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 text-sm focus:outline-none focus:border-emerald-500/50" />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Cutoff (minutes before start)</label>
                  <input type="number" min={0} max={480} value={cutoffMins} onChange={e => setCutoffMins(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 text-sm focus:outline-none focus:border-emerald-500/50" />
                </div>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-2">Active Days</label>
                <div className="flex flex-wrap gap-2">
                  {DAYS.map(d => (
                    <button
                      key={d} type="button"
                      onClick={() => toggleDay(d)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
                        shiftDays.includes(d)
                          ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                          : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-600'
                      }`}
                    >
                      {d.slice(0, 3)}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex justify-end">
                <button type="submit" disabled={isSubmitting}
                  className="px-5 py-2 rounded-xl text-sm font-semibold bg-gradient-to-r from-emerald-500 to-teal-400 text-slate-950 hover:opacity-90 transition disabled:opacity-50">
                  {isSubmitting ? 'Creating...' : 'Create Shift'}
                </button>
              </div>
            </form>
          )}

          {/* Shifts Grid */}
          {isLoading ? (
            <div className="p-12 text-center text-slate-500 text-sm">Loading shifts...</div>
          ) : shifts.length === 0 ? (
            <div className="p-12 text-center rounded-2xl border border-slate-800 bg-slate-900/40">
              <div className="text-4xl mb-3">🕐</div>
              <p className="text-slate-400 text-sm">No shift definitions yet. Create the first shift above.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {shifts.map(shift => (
                <div key={shift.id} className="p-5 rounded-2xl border border-slate-800 bg-slate-900/40 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="font-semibold text-slate-200">{shift.name}</div>
                    <span className={`px-2 py-0.5 rounded-md text-xs font-medium border ${shift.isActive ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20' : 'bg-red-500/10 text-red-300 border-red-500/20'}`}>
                      {shift.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  <div className="text-sm text-slate-300">
                    🕒 {shift.startTime} – {shift.endTime}
                  </div>
                  <div className="text-xs text-slate-500">
                    Cutoff: {shift.cutoffMinutes} min · {shift.timezone}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {DAYS.map(d => (
                      <span key={d}
                        className={`px-1.5 py-0.5 rounded text-xs font-medium ${shift.activeDays?.includes(d) ? 'bg-teal-500/20 text-teal-300' : 'bg-slate-800 text-slate-600'}`}>
                        {d.slice(0, 3)}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          {/* Assign Worker Form */}
          <form onSubmit={handleAssignShift} className="p-6 rounded-2xl border border-slate-800 bg-slate-900/60 backdrop-blur">
            <h2 className="text-base font-semibold text-slate-200 mb-4">Assign Worker to Shift</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Shift</label>
                <select value={assignShiftId} onChange={e => setAssignShiftId(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 text-sm focus:outline-none focus:border-emerald-500/50">
                  <option value="">— Select shift —</option>
                  {shifts.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Worker</label>
                <select value={assignWorkerId} onChange={e => setAssignWorkerId(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 text-sm focus:outline-none focus:border-emerald-500/50">
                  <option value="">— Select worker —</option>
                  {workers.map(w => <option key={w.id} value={w.id}>{w.user.email} ({w.employeeId})</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Work Date</label>
                <input type="date" value={assignDate} onChange={e => setAssignDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 text-sm focus:outline-none focus:border-emerald-500/50" />
              </div>
            </div>
            <div className="flex justify-end mt-4">
              <button type="submit" disabled={isSubmitting || !assignShiftId || !assignWorkerId}
                className="px-5 py-2 rounded-xl text-sm font-semibold bg-gradient-to-r from-emerald-500 to-teal-400 text-slate-950 hover:opacity-90 transition disabled:opacity-50">
                {isSubmitting ? 'Assigning...' : 'Assign Worker'}
              </button>
            </div>
          </form>

          {/* Filter + Assignment List */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/40 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-800 flex items-center gap-4">
              <span className="text-sm font-semibold text-slate-200">Shift Assignments</span>
              <input
                type="date"
                value={filterDate}
                onChange={e => setFilterDate(e.target.value)}
                className="px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 text-xs focus:outline-none focus:border-emerald-500/50"
                placeholder="Filter by date"
              />
              {filterDate && (
                <button onClick={() => setFilterDate('')} className="text-xs text-slate-500 hover:text-slate-300 transition">Clear</button>
              )}
            </div>
            {assignments.length === 0 ? (
              <div className="p-10 text-center text-slate-500 text-sm">No assignments found.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-800 text-xs text-slate-500 uppercase tracking-wider">
                      <th className="px-6 py-3 text-left">Worker</th>
                      <th className="px-6 py-3 text-left">Shift</th>
                      <th className="px-6 py-3 text-left">Work Date</th>
                      <th className="px-6 py-3 text-left">Hours</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/50">
                    {assignments.map(a => (
                      <tr key={a.id} className="hover:bg-slate-800/20 transition">
                        <td className="px-6 py-4 text-slate-200">{a.worker?.user.email || a.workerProfileId}
                          <span className="ml-1 text-slate-500 text-xs">{a.worker?.employeeId}</span>
                        </td>
                        <td className="px-6 py-4 text-slate-300">{a.shift?.name || a.shiftId}</td>
                        <td className="px-6 py-4 text-slate-400">{new Date(a.workDate).toLocaleDateString()}</td>
                        <td className="px-6 py-4 text-slate-400 text-xs">{a.shift?.startTime} – {a.shift?.endTime}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
