'use client';

import React, { useState, useEffect } from 'react';
import { apiRequest } from '../../../../utils/api';

interface Area {
  id: string;
  name: string;
  ward: {
    id: string;
    number: number;
    city: {
      id: string;
      name: string;
    };
  };
}

interface Schedule {
  id: string;
  areaId: string;
  wasteType: 'DRY' | 'WET' | 'E_WASTE' | 'OTHER';
  dayOfWeek: 'MONDAY' | 'TUESDAY' | 'WEDNESDAY' | 'THURSDAY' | 'FRIDAY' | 'SATURDAY' | 'SUNDAY';
  startTime: string;
  endTime: string;
  status: 'ACTIVE' | 'INACTIVE';
  effectiveFrom: string;
  effectiveUntil: string | null;
  area?: {
    name: string;
  };
}

export default function AdminSchedulesPage() {
  const [areas, setAreas] = useState<Area[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  
  // Selection/filter state
  const [selectedAreaId, setSelectedAreaId] = useState('');
  
  // Form Create Recurring Schedule state
  const [wasteType, setWasteType] = useState('DRY');
  const [dayOfWeek, setDayOfWeek] = useState('MONDAY');
  const [startTime, setStartTime] = useState('08:00');
  const [endTime, setEndTime] = useState('11:00');
  const [effectiveFrom, setEffectiveFrom] = useState('');
  const [effectiveUntil, setEffectiveUntil] = useState('');

  // Form Create Exception state
  const [exType, setExType] = useState('CANCELLED');
  const [exScheduleId, setExScheduleId] = useState('');
  const [exOriginalDate, setExOriginalDate] = useState('');
  const [exReplacementDate, setExReplacementDate] = useState('');
  const [exReplacementStart, setExReplacementStart] = useState('14:00');
  const [exReplacementEnd, setExReplacementEnd] = useState('17:00');
  const [exReason, setExReason] = useState('');
  const [exWasteType, setExWasteType] = useState('E_WASTE');

  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  useEffect(() => {
    fetchAreas();
  }, []);

  useEffect(() => {
    if (selectedAreaId) {
      fetchSchedules();
    }
  }, [selectedAreaId]);

  async function fetchAreas() {
    setIsLoading(true);
    try {
      const cityRes = await apiRequest('/geo/cities');
      if (cityRes.ok) {
        const cities = await cityRes.json();
        const allAreas: Area[] = [];

        for (const city of cities) {
          const wardRes = await apiRequest(`/geo/cities/${city.id}/wards`);
          if (wardRes.ok) {
            const wards = await wardRes.json();
            for (const ward of wards) {
              const areaRes = await apiRequest(`/geo/wards/${ward.id}/areas`);
              if (areaRes.ok) {
                const areasData = await areaRes.json();
                areasData.forEach((area: any) => {
                  allAreas.push({
                    id: area.id,
                    name: area.name,
                    ward: {
                      id: ward.id,
                      number: ward.number,
                      city: { id: city.id, name: city.name },
                    },
                  });
                });
              }
            }
          }
        }
        setAreas(allAreas);
        if (allAreas.length > 0) {
          setSelectedAreaId(allAreas[0].id);
        }
      }
    } catch (err) {
      setErrorMsg('Failed to load geography listings.');
    } finally {
      setIsLoading(false);
    }
  }

  async function fetchSchedules() {
    setErrorMsg('');
    try {
      const res = await apiRequest('/schedules');
      if (res.ok) {
        const data = await res.json();
        // Filter schedules matching the selected area
        setSchedules(data.filter((s: Schedule) => s.areaId === selectedAreaId));
      }
    } catch (err) {
      console.error('Error fetching schedules:', err);
    }
  }

  const handleCreateSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      const res = await apiRequest('/schedules', {
        method: 'POST',
        body: JSON.stringify({
          areaId: selectedAreaId,
          wasteType,
          dayOfWeek,
          startTime,
          endTime,
          effectiveFrom: new Date(effectiveFrom).toISOString(),
          effectiveUntil: effectiveUntil ? new Date(effectiveUntil).toISOString() : undefined,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setSuccessMsg('Collection schedule registered successfully.');
        setEffectiveFrom('');
        setEffectiveUntil('');
        fetchSchedules();
      } else {
        setErrorMsg(data.message || 'Overlap conflict detected.');
      }
    } catch (err) {
      setErrorMsg('Network error while saving schedule.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleStatus = async (scheduleId: string, currentStatus: string) => {
    setErrorMsg('');
    setSuccessMsg('');
    const newStatus = currentStatus === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';

    try {
      const res = await apiRequest(`/schedules/${scheduleId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: newStatus }),
      });

      if (res.ok) {
        setSuccessMsg(`Schedule status updated to ${newStatus}.`);
        fetchSchedules();
      } else {
        const data = await res.json();
        setErrorMsg(data.message || 'Status toggle failed.');
      }
    } catch (err) {
      setErrorMsg('Network error.');
    }
  };

  const handleCreateException = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      const res = await apiRequest('/schedule-exceptions', {
        method: 'POST',
        body: JSON.stringify({
          areaId: selectedAreaId,
          type: exType,
          scheduleId: exType !== 'SPECIAL_COLLECTION' ? exScheduleId : undefined,
          originalDate: new Date(exOriginalDate).toISOString(),
          replacementDate: exType === 'RESCHEDULED' ? new Date(exReplacementDate).toISOString() : undefined,
          replacementStartTime: exType !== 'CANCELLED' ? exReplacementStart : undefined,
          replacementEndTime: exType !== 'CANCELLED' ? exReplacementEnd : undefined,
          wasteType: exType === 'SPECIAL_COLLECTION' ? exWasteType : undefined,
          reason: exReason,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setSuccessMsg(`Exception event registered successfully.`);
        setExReason('');
        setExOriginalDate('');
        setExReplacementDate('');
      } else {
        setErrorMsg(data.message || 'Exception registration failed.');
      }
    } catch (err) {
      setErrorMsg('Network error.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // List of active recurring schedules to select in Exception form
  const activeSchedules = schedules.filter((s) => s.status === 'ACTIVE');

  return (
    <div className="space-y-8">
      {/* Title */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-slate-900 pb-4 gap-4">
        <div>
          <h2 className="text-2xl font-black text-slate-100">Schedule Management</h2>
          <p className="text-xs text-slate-400 mt-1">Configure weekly recurring waste services and register schedule exception overrides</p>
        </div>
        
        {/* Area Selector Filter */}
        <div className="flex items-center space-x-2 shrink-0">
          <span className="text-xs text-slate-400 font-semibold">Active Area Grid:</span>
          {areas.length > 0 ? (
            <select
              className="px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-100 text-xs focus:border-emerald-500 focus:outline-none"
              value={selectedAreaId}
              onChange={(e) => setSelectedAreaId(e.target.value)}
            >
              {areas.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.ward.city.name} - Ward {a.ward.number} ({a.name})
                </option>
              ))}
            </select>
          ) : (
            <span className="text-xs text-rose-400 font-semibold">No seeded areas found</span>
          )}
        </div>
      </div>

      {errorMsg && (
        <div className="p-4 rounded-xl border border-rose-500/30 bg-rose-950/20 text-rose-300 text-sm font-medium">
          {errorMsg}
        </div>
      )}

      {successMsg && (
        <div className="p-4 rounded-xl border border-emerald-500/30 bg-emerald-950/20 text-emerald-300 text-sm font-medium">
          {successMsg}
        </div>
      )}

      {isLoading ? (
        <div className="h-60 flex items-center justify-center">
          <span className="h-8 w-8 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin"></span>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Create Recurring Schedule Form */}
          <div className="lg:col-span-1 p-6 rounded-2xl border border-slate-900 bg-slate-950/40 space-y-4">
            <h3 className="text-lg font-bold text-slate-200 border-b border-slate-900 pb-3">
              Configure Recurring Schedule
            </h3>
            
            <form onSubmit={handleCreateSchedule} className="space-y-4">
              <div>
                <label className="block text-slate-400 text-xs font-semibold mb-2">Waste Type</label>
                <select
                  className="w-full px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-100 text-xs focus:border-emerald-500 focus:outline-none"
                  value={wasteType}
                  onChange={(e) => setWasteType(e.target.value)}
                >
                  <option value="DRY">DRY</option>
                  <option value="WET">WET</option>
                  <option value="E_WASTE">E-WASTE</option>
                  <option value="OTHER">OTHER</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-400 text-xs font-semibold mb-2">Day of Week</label>
                <select
                  className="w-full px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-100 text-xs focus:border-emerald-500 focus:outline-none"
                  value={dayOfWeek}
                  onChange={(e) => setDayOfWeek(e.target.value)}
                >
                  <option value="MONDAY">MONDAY</option>
                  <option value="TUESDAY">TUESDAY</option>
                  <option value="WEDNESDAY">WEDNESDAY</option>
                  <option value="THURSDAY">THURSDAY</option>
                  <option value="FRIDAY">FRIDAY</option>
                  <option value="SATURDAY">SATURDAY</option>
                  <option value="SUNDAY">SUNDAY</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-400 text-xs font-semibold mb-2">Start Time</label>
                  <input
                    type="text"
                    required
                    placeholder="08:00"
                    className="w-full px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-100 text-xs focus:border-emerald-500 focus:outline-none placeholder:text-slate-700"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-slate-400 text-xs font-semibold mb-2">End Time</label>
                  <input
                    type="text"
                    required
                    placeholder="11:00"
                    className="w-full px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-100 text-xs focus:border-emerald-500 focus:outline-none placeholder:text-slate-700"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-400 text-xs font-semibold mb-2">Effective From</label>
                <input
                  type="date"
                  required
                  className="w-full px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-100 text-xs focus:border-emerald-500 focus:outline-none"
                  value={effectiveFrom}
                  onChange={(e) => setEffectiveFrom(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-slate-400 text-xs font-semibold mb-2">Effective Until (Optional)</label>
                <input
                  type="date"
                  className="w-full px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-100 text-xs focus:border-emerald-500 focus:outline-none"
                  value={effectiveUntil}
                  onChange={(e) => setEffectiveUntil(e.target.value)}
                />
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-3 rounded-xl font-bold bg-gradient-to-r from-emerald-500 to-teal-400 text-slate-950 text-xs hover:brightness-110 transition active:scale-95 disabled:opacity-50"
              >
                Save Schedule
              </button>
            </form>
          </div>

          {/* Schedules Directory List */}
          <div className="lg:col-span-2 space-y-6">
            
            {/* Recurring Schedule Directory */}
            <div className="p-6 rounded-2xl border border-slate-900 bg-slate-950/40">
              <h3 className="text-lg font-bold text-slate-200 mb-4">Area Recurring Directory</h3>
              {schedules.length === 0 ? (
                <div className="text-center py-8 text-slate-500 text-xs">
                  No recurring waste collections scheduled for this area yet.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-900 text-slate-500 font-bold uppercase">
                        <th className="py-2.5 px-3">Day</th>
                        <th className="py-2.5 px-3">Type</th>
                        <th className="py-2.5 px-3">Time Range</th>
                        <th className="py-2.5 px-3 text-center">Status</th>
                        <th className="py-2.5 px-3 text-center">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-900/50">
                      {schedules.map((s) => (
                        <tr key={s.id} className="hover:bg-slate-900/10">
                          <td className="py-3 px-3 font-semibold text-slate-300">{s.dayOfWeek}</td>
                          <td className="py-3 px-3">
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-900 border border-slate-800 text-emerald-400">
                              {s.wasteType}
                            </span>
                          </td>
                          <td className="py-3 px-3 font-mono text-slate-400">{s.startTime} – {s.endTime}</td>
                          <td className="py-3 px-3 text-center">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              s.status === 'ACTIVE' ? 'bg-emerald-950/20 text-emerald-400 border border-emerald-500/10' : 'bg-slate-900 text-slate-500 border border-slate-800'
                            }`}>
                              {s.status}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-center">
                            <button
                              onClick={() => handleToggleStatus(s.id, s.status)}
                              className="text-xs font-bold text-emerald-400 hover:text-emerald-300 hover:underline transition"
                            >
                              Toggle
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Create Schedule Exception Form */}
            <div className="p-6 rounded-2xl border border-slate-900 bg-slate-950/40 space-y-4">
              <h3 className="text-lg font-bold text-slate-200 border-b border-slate-900 pb-3">
                Register Schedule Exception
              </h3>

              <form onSubmit={handleCreateException} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-slate-400 text-xs font-semibold mb-2">Exception Type</label>
                    <select
                      className="w-full px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-100 text-xs focus:border-emerald-500 focus:outline-none"
                      value={exType}
                      onChange={(e) => {
                        setExType(e.target.value);
                        if (activeSchedules.length > 0) {
                          setExScheduleId(activeSchedules[0].id);
                        }
                      }}
                    >
                      <option value="CANCELLED">CANCELLED (Suspends original)</option>
                      <option value="RESCHEDULED">RESCHEDULED (Substitutes to new date/time)</option>
                      <option value="SPECIAL_COLLECTION">SPECIAL COLLECTION (Adds additional)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-slate-400 text-xs font-semibold mb-2">
                      {exType === 'SPECIAL_COLLECTION' ? 'Waste Category (Required)' : 'Target Schedule (Required)'}
                    </label>
                    {exType === 'SPECIAL_COLLECTION' ? (
                      <select
                        className="w-full px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-100 text-xs focus:border-emerald-500 focus:outline-none"
                        value={exWasteType}
                        onChange={(e) => setExWasteType(e.target.value)}
                      >
                        <option value="DRY">DRY</option>
                        <option value="WET">WET</option>
                        <option value="E_WASTE">E-WASTE</option>
                        <option value="OTHER">OTHER</option>
                      </select>
                    ) : activeSchedules.length === 0 ? (
                      <div className="text-xs text-rose-400 font-semibold py-2">No active recurring schedules</div>
                    ) : (
                      <select
                        className="w-full px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-100 text-xs focus:border-emerald-500 focus:outline-none"
                        value={exScheduleId}
                        onChange={(e) => setExScheduleId(e.target.value)}
                      >
                        <option value="">-- Choose Schedule --</option>
                        {activeSchedules.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.dayOfWeek} : {s.wasteType} ({s.startTime}-{s.endTime})
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-slate-400 text-xs font-semibold mb-2">
                      {exType === 'SPECIAL_COLLECTION' ? 'Collection Date' : 'Original Date'}
                    </label>
                    <input
                      type="date"
                      required
                      className="w-full px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-100 text-xs focus:border-emerald-500 focus:outline-none"
                      value={exOriginalDate}
                      onChange={(e) => setExOriginalDate(e.target.value)}
                    />
                  </div>

                  {exType === 'RESCHEDULED' && (
                    <div>
                      <label className="block text-slate-400 text-xs font-semibold mb-2">Replacement Date</label>
                      <input
                        type="date"
                        required
                        className="w-full px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-100 text-xs focus:border-emerald-500 focus:outline-none"
                        value={exReplacementDate}
                        onChange={(e) => setExReplacementDate(e.target.value)}
                      />
                    </div>
                  )}
                </div>

                {exType !== 'CANCELLED' && (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-slate-400 text-xs font-semibold mb-2">
                        {exType === 'RESCHEDULED' ? 'Replacement Start Time' : 'Start Time'}
                      </label>
                      <input
                        type="text"
                        required
                        className="w-full px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-100 text-xs focus:border-emerald-500 focus:outline-none"
                        placeholder="14:00"
                        value={exReplacementStart}
                        onChange={(e) => setExReplacementStart(e.target.value)}
                      />
                    </div>

                    <div>
                      <label className="block text-slate-400 text-xs font-semibold mb-2">
                        {exType === 'RESCHEDULED' ? 'Replacement End Time' : 'End Time'}
                      </label>
                      <input
                        type="text"
                        required
                        className="w-full px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-100 text-xs focus:border-emerald-500 focus:outline-none"
                        placeholder="17:00"
                        value={exReplacementEnd}
                        onChange={(e) => setExReplacementEnd(e.target.value)}
                      />
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-slate-400 text-xs font-semibold mb-2">Reason / Memo</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Municipal Holiday, Maintenance delay, Electronic campaign"
                    className="w-full px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-100 text-xs focus:border-emerald-500 focus:outline-none"
                    value={exReason}
                    onChange={(e) => setExReason(e.target.value)}
                  />
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting || (exType !== 'SPECIAL_COLLECTION' && !exScheduleId)}
                  className="w-full py-3 rounded-xl font-bold bg-gradient-to-r from-emerald-500 to-teal-400 text-slate-950 text-xs hover:brightness-110 transition active:scale-95 disabled:opacity-50"
                >
                  Register Exception
                </button>
              </form>
            </div>

          </div>

        </div>
      )}
    </div>
  );
}
