'use client';

import React, { useState, useEffect, useRef } from 'react';
import { apiRequest } from '../../../utils/api';
import { getSocket } from '../../../utils/socket';

interface Occurrence {
  propertyId: string;
  propertyName: string;
  areaId: string;
  areaName: string;
  wasteType: 'DRY' | 'WET' | 'E_WASTE' | 'OTHER';
  collectionDate: string; // YYYY-MM-DD
  startTime: string;
  endTime: string;
  source: 'REGULAR' | 'RESCHEDULED' | 'SPECIAL';
  changeReason?: string;
}

interface PropertySchedule {
  propertyId: string;
  address: string;
  areaId: string;
  areaName: string;
  occurrences: Occurrence[];
}

interface RecurringSchedule {
  id: string;
  dayOfWeek: string;
  wasteType: string;
  startTime: string;
  endTime: string;
  status: string;
  areaId: string;
}

export default function CitizenSchedulesPage() {
  const [propertySchedules, setPropertySchedules] = useState<PropertySchedule[]>([]);
  const [recurringSchedules, setRecurringSchedules] = useState<RecurringSchedule[]>([]);
  const [selectedPropertyId, setSelectedPropertyId] = useState('');
  
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');

  const fetchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    fetchSchedules();

    const socket = getSocket('realtime');
    
    const queueFetch = () => {
      if (fetchTimeoutRef.current) clearTimeout(fetchTimeoutRef.current);
      fetchTimeoutRef.current = setTimeout(() => fetchSchedules(), 500);
    };

    socket.on('scheduleUpdated', queueFetch);
    socket.on('notificationCreated', queueFetch);

    return () => {
      if (fetchTimeoutRef.current) clearTimeout(fetchTimeoutRef.current);
      socket.off('scheduleUpdated', queueFetch);
      socket.off('notificationCreated', queueFetch);
      socket.disconnect();
    };
  }, []);

  async function fetchSchedules() {
    setIsLoading(true);
    setErrorMsg('');
    try {
      // 1. Fetch resolved occurrences
      const res = await apiRequest('/citizen/schedules');
      if (res.ok) {
        const data = await res.json();
        setPropertySchedules(data);
        if (data.length > 0) {
          setSelectedPropertyId(data[0].propertyId);
        }
      } else {
        setErrorMsg('Failed to load active waste collection schedules.');
      }

      // 2. Fetch recurring configurations to show the static weekly schedule
      const recRes = await apiRequest('/schedules');
      if (recRes.ok) {
        setRecurringSchedules(await recRes.json());
      }
    } catch (err) {
      setErrorMsg('Failed to connect to backend scheduling api services.');
    } finally {
      setIsLoading(false);
    }
  }

  const selectedData = propertySchedules.find((ps) => ps.propertyId === selectedPropertyId);
  const selectedAreaId = selectedData?.areaId;

  // Filter static recurring schedule for the selected property's area
  const activeAreaRecurring = recurringSchedules.filter(
    (s) => s.areaId === selectedAreaId && s.status === 'ACTIVE'
  );

  // Group recurring by day of week
  const daysOrder = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];
  activeAreaRecurring.sort((a, b) => daysOrder.indexOf(a.dayOfWeek) - daysOrder.indexOf(b.dayOfWeek));

  // Determine next collection card
  const nextCollection = selectedData?.occurrences && selectedData.occurrences.length > 0 
    ? selectedData.occurrences[0] 
    : null;

  // Formatting date strings helper
  const formatFriendlyDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
  };

  const badgeColors: Record<string, string> = {
    REGULAR: 'bg-emerald-950/20 text-emerald-400 border-emerald-500/20',
    RESCHEDULED: 'bg-amber-950/20 text-amber-400 border-amber-500/20 animate-pulse',
    SPECIAL: 'bg-cyan-950/20 text-cyan-400 border-cyan-500/20',
  };

  return (
    <div className="space-y-8">
      {/* Title */}
      <div className="flex justify-between items-center border-b border-slate-900 pb-4">
        <div>
          <h2 className="text-2xl font-black text-slate-100">Waste Collection Schedules</h2>
          <p className="text-xs text-slate-400 mt-1">
            Real-time collection timings, municipal weekly routines, and holiday exceptions
          </p>
        </div>
        <button
          onClick={fetchSchedules}
          className="px-4 py-2 text-xs font-bold border border-slate-800 hover:border-slate-700 bg-slate-900 rounded-xl transition"
        >
          Refresh Feeds
        </button>
      </div>

      {errorMsg && (
        <div className="p-4 rounded-xl border border-rose-500/30 bg-rose-950/20 text-rose-300 text-sm font-medium">
          {errorMsg}
        </div>
      )}

      {isLoading ? (
        <div className="h-60 flex items-center justify-center">
          <span className="h-8 w-8 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin"></span>
        </div>
      ) : propertySchedules.length === 0 ? (
        <div className="text-center py-16 rounded-2xl border border-dashed border-slate-800 text-slate-500 text-sm">
          No verified properties found. Collection schedules are only visible for verified citizen properties. Please check property verification status.
        </div>
      ) : (
        <div className="space-y-8">
          {/* Property Selector for multi-property citizens */}
          {propertySchedules.length > 1 && (
            <div className="p-4 rounded-xl bg-slate-900/50 border border-slate-900 flex items-center space-x-4">
              <span className="text-sm text-slate-400 font-medium">Select Property Profile:</span>
              <select
                className="px-4 py-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-100 text-sm focus:border-emerald-500 focus:outline-none"
                value={selectedPropertyId}
                onChange={(e) => setSelectedPropertyId(e.target.value)}
              >
                {propertySchedules.map((p) => (
                  <option key={p.propertyId} value={p.propertyId}>
                    {p.address} ({p.areaName})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Top layout: Next Collection & Weekly Schedule */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* NEXT COLLECTION CARD */}
            <div className="lg:col-span-1 p-6 rounded-2xl border border-emerald-500/20 bg-gradient-to-br from-slate-950 via-slate-950 to-emerald-950/20 relative overflow-hidden flex flex-col justify-between shadow-xl">
              <div className="absolute top-0 right-0 h-32 w-32 bg-emerald-500/5 blur-2xl pointer-events-none"></div>

              <div>
                <span className="text-slate-500 text-[10px] font-black uppercase tracking-widest">
                  NEXT COLLECTION EVENT
                </span>

                {nextCollection ? (
                  <div className="mt-4 space-y-4">
                    <div className="text-slate-100 font-extrabold text-2xl">
                      {formatFriendlyDate(nextCollection.collectionDate)}
                    </div>
                    <div className="inline-flex px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 uppercase tracking-wide">
                      {nextCollection.wasteType} WASTE
                    </div>
                    <div className="text-slate-300 text-lg font-bold font-mono">
                      {nextCollection.startTime} – {nextCollection.endTime}
                    </div>
                  </div>
                ) : (
                  <div className="text-slate-500 text-sm py-8">
                    No collection services scheduled in the near future.
                  </div>
                )}
              </div>

              {nextCollection && (
                <div className="border-t border-slate-900/60 pt-4 mt-6 text-xs text-slate-500 leading-normal">
                  💡 Prepare your <span className="text-slate-300 font-semibold">{nextCollection.wasteType.toLowerCase()}</span> waste bin at your collection point before {nextCollection.startTime}.
                </div>
              )}
            </div>

            {/* WEEKLY RECURRING SCHEDULE CARD */}
            <div className="lg:col-span-2 p-6 rounded-2xl border border-slate-900 bg-slate-950/40">
              <h3 className="text-lg font-bold text-slate-200 border-b border-slate-900 pb-3 mb-4 flex items-center justify-between">
                <span>Standard Weekly Schedule</span>
                <span className="text-xs text-slate-500 font-normal">Active for {selectedData?.areaName}</span>
              </h3>

              {activeAreaRecurring.length === 0 ? (
                <div className="text-center py-12 text-slate-500 text-sm">
                  No standard weekly collection schedule configured for this area.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {activeAreaRecurring.map((s) => (
                    <div key={s.id} className="p-4 rounded-xl bg-slate-900/50 border border-slate-900 flex justify-between items-center">
                      <div>
                        <div className="font-bold text-slate-200 text-sm uppercase">{s.dayOfWeek}</div>
                        <div className="text-slate-500 font-mono text-xs mt-1">{s.startTime} – {s.endTime}</div>
                      </div>
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-slate-950 border border-slate-800 text-emerald-400">
                        {s.wasteType}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>

          {/* Lower layout: Upcoming Occurrences Timeline */}
          <div className="p-6 rounded-2xl border border-slate-900 bg-slate-950/40">
            <h3 className="text-lg font-bold text-slate-200 border-b border-slate-900 pb-3 mb-6">
              Upcoming Collection Timeline (Next 7 Days)
            </h3>

            {!selectedData?.occurrences || selectedData.occurrences.length === 0 ? (
              <div className="text-center py-12 text-slate-500 text-sm">
                No upcoming collections found in this range.
              </div>
            ) : (
              <div className="space-y-4">
                {selectedData.occurrences.map((occ, idx) => (
                  <div
                    key={idx}
                    className={`p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 transition-all ${
                      occ.source === 'RESCHEDULED'
                        ? 'border-amber-500/20 bg-amber-950/5'
                        : occ.source === 'SPECIAL'
                        ? 'border-cyan-500/20 bg-cyan-950/5'
                        : 'border-slate-900 bg-slate-900/10'
                    }`}
                  >
                    {/* Time & Waste info */}
                    <div className="flex items-start space-x-4">
                      <div className="flex flex-col">
                        <span className="text-xs text-slate-500 font-bold uppercase tracking-wider">
                          {occ.source} EVENT
                        </span>
                        <span className="font-bold text-slate-100 mt-1">
                          {formatFriendlyDate(occ.collectionDate)}
                        </span>
                        <span className="text-xs text-slate-400 mt-0.5 font-mono">
                          {occ.startTime} – {occ.endTime}
                        </span>
                      </div>
                    </div>

                    {/* Badge details & Reason if exception */}
                    <div className="flex flex-col sm:items-end justify-center">
                      <span className={`inline-block px-3 py-1 rounded-full text-xs font-bold border uppercase tracking-wider ${badgeColors[occ.source]}`}>
                        {occ.wasteType} WASTE
                      </span>
                      {occ.changeReason && (
                        <span className="text-xs text-amber-400/80 mt-1.5 font-medium italic">
                          ⚠️ {occ.changeReason}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
