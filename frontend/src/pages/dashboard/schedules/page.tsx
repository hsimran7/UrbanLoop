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
    REGULAR: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    RESCHEDULED: 'bg-amber-50 text-amber-700 border-amber-200 animate-pulse',
    SPECIAL: 'bg-cyan-50 text-cyan-700 border-cyan-200',
  };

  return (
    <div className="space-y-8 pb-20">
      {/* Title */}
      <div className="glass-card p-8 flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-800 tracking-tight">Waste Collection Schedules</h1>
          <p className="text-sm text-slate-600 mt-2 font-medium">
            Real-time collection timings, municipal weekly routines, and holiday exceptions
          </p>
        </div>
        <button
          onClick={fetchSchedules}
          className="px-5 py-2.5 text-xs font-bold border border-surface-border hover:bg-nature-lightBg bg-nature-white text-slate-700 rounded-xl transition shadow-sm"
        >
          Refresh Feeds
        </button>
      </div>

      {errorMsg && (
        <div className="p-4 rounded-xl border border-red-200 bg-red-50 text-red-700 text-sm font-medium">
          {errorMsg}
        </div>
      )}

      {isLoading ? (
        <div className="glass-card h-60 flex items-center justify-center">
          <span className="h-8 w-8 border-2 border-nature-accent border-t-transparent rounded-full animate-spin"></span>
        </div>
      ) : propertySchedules.length === 0 ? (
        <div className="glass-card text-center py-16 text-slate-500 text-sm font-medium">
          No verified properties found. Collection schedules are only visible for verified citizen properties. Please check property verification status.
        </div>
      ) : (
        <div className="space-y-8">
          {/* Property Selector for multi-property citizens */}
          {propertySchedules.length > 1 && (
            <div className="glass-card p-4 flex items-center space-x-4">
              <span className="text-sm text-slate-600 font-bold">Select Property Profile:</span>
              <select
                className="input-field max-w-md !py-2"
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
            <div className="lg:col-span-1 glass-card p-6 border-nature-accent/30 relative overflow-hidden flex flex-col justify-between">
              <div className="absolute top-0 right-0 h-32 w-32 bg-nature-accent/10 blur-2xl pointer-events-none"></div>

              <div>
                <span className="text-nature-earth text-xs font-extrabold uppercase tracking-widest">
                  NEXT COLLECTION EVENT
                </span>

                {nextCollection ? (
                  <div className="mt-4 space-y-4">
                    <div className="text-slate-800 font-black text-2xl">
                      {formatFriendlyDate(nextCollection.collectionDate)}
                    </div>
                    <div className="inline-flex px-3.5 py-1 rounded-full text-xs font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-200 uppercase tracking-wide">
                      {nextCollection.wasteType} WASTE
                    </div>
                    <div className="text-slate-700 text-lg font-bold font-mono">
                      {nextCollection.startTime} – {nextCollection.endTime}
                    </div>
                  </div>
                ) : (
                  <div className="text-slate-500 text-sm py-8 font-medium">
                    No collection services scheduled in the near future.
                  </div>
                )}
              </div>

              {nextCollection && (
                <div className="border-t border-surface-border pt-4 mt-6 text-xs text-slate-600 font-medium leading-normal">
                  💡 Prepare your <span className="text-slate-800 font-bold">{nextCollection.wasteType.toLowerCase()}</span> waste bin at your collection point before {nextCollection.startTime}.
                </div>
              )}
            </div>

            {/* WEEKLY RECURRING SCHEDULE CARD */}
            <div className="lg:col-span-2 glass-card p-6">
              <h3 className="text-lg font-bold text-slate-800 border-b border-surface-border pb-3 mb-4 flex items-center justify-between">
                <span>Standard Weekly Schedule</span>
                <span className="text-xs text-slate-500 font-medium">Active for {selectedData?.areaName}</span>
              </h3>

              {activeAreaRecurring.length === 0 ? (
                <div className="text-center py-12 text-slate-500 text-sm font-medium">
                  No standard weekly collection schedule configured for this area.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {activeAreaRecurring.map((s) => (
                    <div key={s.id} className="p-4 rounded-2xl bg-nature-lightBg/60 border border-surface-border flex justify-between items-center">
                      <div>
                        <div className="font-bold text-slate-800 text-sm uppercase">{s.dayOfWeek}</div>
                        <div className="text-slate-500 font-mono text-xs mt-1 font-semibold">{s.startTime} – {s.endTime}</div>
                      </div>
                      <span className="px-3 py-1 rounded-full text-xs font-extrabold bg-nature-white border border-surface-border text-nature-earth shadow-sm">
                        {s.wasteType}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>

          {/* Lower layout: Upcoming Occurrences Timeline */}
          <div className="glass-card p-6">
            <h3 className="text-lg font-bold text-slate-800 border-b border-surface-border pb-3 mb-6">
              Upcoming Collection Timeline (Next 7 Days)
            </h3>

            {!selectedData?.occurrences || selectedData.occurrences.length === 0 ? (
              <div className="text-center py-12 text-slate-500 text-sm font-medium">
                No upcoming collections found in this range.
              </div>
            ) : (
              <div className="space-y-4">
                {selectedData.occurrences.map((occ, idx) => (
                  <div
                    key={idx}
                    className={`p-4.5 rounded-2xl border flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 transition-all ${
                      occ.source === 'RESCHEDULED'
                        ? 'border-amber-200 bg-amber-50/40'
                        : occ.source === 'SPECIAL'
                        ? 'border-cyan-200 bg-cyan-50/40'
                        : 'border-surface-border bg-nature-lightBg/30'
                    }`}
                  >
                    {/* Time & Waste info */}
                    <div className="flex items-start space-x-4">
                      <div className="flex flex-col">
                        <span className="text-[11px] text-slate-500 font-extrabold uppercase tracking-wider">
                          {occ.source} EVENT
                        </span>
                        <span className="font-extrabold text-slate-800 mt-0.5">
                          {formatFriendlyDate(occ.collectionDate)}
                        </span>
                        <span className="text-xs text-slate-500 mt-0.5 font-mono font-semibold">
                          {occ.startTime} – {occ.endTime}
                        </span>
                      </div>
                    </div>

                    {/* Badge details & Reason if exception */}
                    <div className="flex flex-col sm:items-end justify-center">
                      <span className={`inline-block px-3 py-1 rounded-full text-xs font-extrabold border uppercase tracking-wider ${badgeColors[occ.source]}`}>
                        {occ.wasteType} WASTE
                      </span>
                      {occ.changeReason && (
                        <span className="text-xs text-amber-700 mt-1.5 font-semibold italic">
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

