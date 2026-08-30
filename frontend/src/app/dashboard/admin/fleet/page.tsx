'use client';

import React, { useState, useEffect, useRef } from 'react';
import { apiRequest } from '../../../../utils/api';
import { getSocket } from '../../../../utils/socket';
import { UrbanLoopMap, MapMarkerProps } from '../../../../components/maps/UrbanLoopMap';

interface Vehicle {
  id: string;
  vehicleCode: string;
  type: string;
  status: 'AVAILABLE' | 'IN_SERVICE' | 'UNDER_MAINTENANCE' | 'BREAKDOWN';
  latitude: number | null;
  longitude: number | null;
  speed?: number;
  batteryLevel?: number;
  fuelLevel?: number;
}

interface TelemetryPoint {
  latitude: number;
  longitude: number;
  timestamp: string;
  speed: number;
}

interface FleetNotification {
  id: string;
  type: 'WARNING' | 'ERROR' | 'INFO';
  message: string;
  timestamp: string;
  vehicleCode?: string;
}

export default function FleetDashboardPage() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [depots, setDepots] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');

  // Route Replay State
  const [replayHistory, setReplayHistory] = useState<TelemetryPoint[]>([]);
  const [isReplaying, setIsReplaying] = useState(false);
  const [replayIndex, setReplayIndex] = useState(0);
  const [replaySpeed, setReplaySpeed] = useState(1);
  const replayIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const [notifications, setNotifications] = useState<FleetNotification[]>([]);

  useEffect(() => {
    fetchFleetData();

    const socket = getSocket('fleet');
    const handleVehicleUpdate = (updatedVeh: Vehicle) => {
      setVehicles((prev) =>
        prev.map((v) => (v.id === updatedVeh.id ? { ...v, ...updatedVeh } : v))
      );
    };
    const handleNotification = (notif: FleetNotification) => {
      setNotifications((prev) => [notif, ...prev]);
    };

    socket.on('vehicleLocationUpdated', handleVehicleUpdate);
    socket.on('fleetNotification', handleNotification);

    return () => {
      socket.off('vehicleLocationUpdated', handleVehicleUpdate);
      socket.off('fleetNotification', handleNotification);
      if (replayIntervalRef.current) clearInterval(replayIntervalRef.current);
    };
  }, []);

  async function fetchFleetData() {
    try {
      const [vRes, dRes] = await Promise.all([
        apiRequest('/fleet/vehicles'),
        apiRequest('/facilities'),
      ]);

      if (vRes.ok) setVehicles(await vRes.json());
      if (dRes.ok) {
        const facList = await dRes.json();
        setDepots(facList.filter((f: any) => f.facilityType === 'DEPOT'));
      }
    } catch {
      setErrorMsg('Failed to load fleet listings.');
    } finally {
      setLoading(false);
    }
  }

  // Generate map markers dynamically based on vehicles state
  const mapMarkers: MapMarkerProps[] = [];
  const circleMarkers: any[] = [];

  vehicles.forEach((v) => {
    if (!v.latitude || !v.longitude) return;
    let color = '#6b7280';
    if (v.status === 'AVAILABLE') color = '#10b981';
    if (v.status === 'IN_SERVICE') color = '#3b82f6';
    if (v.status === 'BREAKDOWN') color = '#ef4444';
    if (v.status === 'UNDER_MAINTENANCE') color = '#f97316';

    circleMarkers.push({
      center: [v.latitude, v.longitude],
      radius: 8,
      color,
      fillColor: color,
      popup: `<div style="color: black; font-size: 11px;"><strong>${v.vehicleCode}</strong><br/>Status: ${v.status}<br/>Speed: ${v.speed || 0} km/h</div>`
    });
  });

  depots.forEach((d) => {
    if (d.latitude && d.longitude) {
      mapMarkers.push({
        id: `depot-${d.id}`,
        position: [d.latitude, d.longitude],
        popupContent: `<strong>Depot: ${d.name}</strong>`
      });
    }
  });

  if (replayHistory.length > 0 && replayHistory[replayIndex]) {
    const rp = replayHistory[replayIndex];
    circleMarkers.push({
      center: [rp.latitude, rp.longitude],
      radius: 10,
      color: '#a855f7',
      fillColor: '#a855f7',
      popup: 'Replay Position'
    });
  }

  async function handleLoadReplay(vehicleId: string) {
    setIsReplaying(false);
    setReplayIndex(0);
    if (replayIntervalRef.current) clearInterval(replayIntervalRef.current);

    try {
      const res = await apiRequest(`/fleet/vehicles/${vehicleId}/telemetry`);
      if (res.ok) {
        setReplayHistory(await res.json());
      }
    } catch {
      setErrorMsg('Failed to load telemetry history.');
    }
  }

  function toggleReplay() {
    if (isReplaying) {
      setIsReplaying(false);
      if (replayIntervalRef.current) clearInterval(replayIntervalRef.current);
    } else {
      if (replayHistory.length === 0) return;
      setIsReplaying(true);
      const intervalMs = 1000 / replaySpeed;
      replayIntervalRef.current = setInterval(() => {
        setReplayIndex((prev) => {
          const next = prev + 1;
          if (next >= replayHistory.length) {
            clearInterval(replayIntervalRef.current as NodeJS.Timeout);
            setIsReplaying(false);
            return prev;
          }
          return next;
        });
      }, intervalMs);
    }
  }

  useEffect(() => {
    if (isReplaying) {
      setIsReplaying(false);
      toggleReplay();
    }
  }, [replaySpeed]);

  const activeCount = vehicles.filter((v) => v.status === 'IN_SERVICE').length;
  const breakdownCount = vehicles.filter((v) => v.status === 'BREAKDOWN').length;

  return (
    <div className="space-y-6 pb-20">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-3xl font-black text-slate-100">Live Fleet Command</h2>
          <p className="text-slate-450 text-sm mt-1">Real-time GPS tracking and route replay analytics.</p>
        </div>
      </div>

      {loading ? (
        <div className="h-40 flex items-center justify-center">
          <span className="h-8 w-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin"></span>
        </div>
      ) : (
        <>
          {errorMsg && <div className="p-4 bg-rose-500/10 text-rose-400 font-bold text-xs rounded-xl">{errorMsg}</div>}

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800">
              <p className="text-[10px] font-bold text-slate-500 uppercase">Total Fleet</p>
              <p className="text-2xl font-black text-slate-100 mt-1">{vehicles.length}</p>
            </div>
            <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800">
              <p className="text-[10px] font-bold text-emerald-500 uppercase">Active Routes</p>
              <p className="text-2xl font-black text-emerald-400 mt-1">{activeCount}</p>
            </div>
            <div className="p-5 rounded-2xl bg-rose-500/10 border border-rose-500/30">
              <p className="text-[10px] font-bold text-rose-400 uppercase">Breakdowns</p>
              <p className="text-2xl font-black text-rose-400 mt-1">{breakdownCount}</p>
            </div>
            <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800">
              <p className="text-[10px] font-bold text-slate-500 uppercase">Avg Fleet Speed</p>
              <p className="text-2xl font-black text-indigo-400 mt-1">
                {vehicles.length > 0
                  ? Math.round(vehicles.reduce((acc, v) => acc + (v.speed || 0), 0) / vehicles.length)
                  : 0} km/h
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            <div className="xl:col-span-2 space-y-4">
              <div className="w-full h-[550px] rounded-2xl overflow-hidden border border-slate-800 relative bg-slate-950 shadow-2xl">
                <UrbanLoopMap 
                  center={[30.900965, 75.857277]} 
                  zoom={12} 
                  markers={mapMarkers}
                  circleMarkers={circleMarkers}
                  polylines={replayHistory.length > 0 ? [{ positions: replayHistory.map(r => [r.latitude, r.longitude]), color: '#a855f7', weight: 4 }] : []}
                />
              </div>

              {/* Route Replay Controls */}
              <div className="p-5 bg-slate-900 border border-slate-800 rounded-2xl">
                <div className="flex flex-col md:flex-row items-center justify-between space-y-4 md:space-y-0 md:space-x-4">
                  <div className="flex items-center space-x-3">
                    <select
                      className="px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs focus:border-emerald-500 outline-none"
                      onChange={(e) => handleLoadReplay(e.target.value)}
                      defaultValue=""
                    >
                      <option value="" disabled>Select Vehicle for Replay</option>
                      {vehicles.map((v) => (
                        <option key={v.id} value={v.id}>{v.vehicleCode} - {v.type}</option>
                      ))}
                    </select>

                    <button
                      onClick={toggleReplay}
                      disabled={replayHistory.length === 0}
                      className="px-4 py-2 bg-indigo-500 text-slate-950 font-bold text-xs rounded-xl hover:brightness-110 disabled:opacity-50"
                    >
                      {isReplaying ? '⏸ Pause' : '▶ Play Route'}
                    </button>
                  </div>
                  
                  {replayHistory.length > 0 && (
                    <div className="flex-grow max-w-sm flex items-center space-x-3">
                      <span className="text-[10px] font-bold text-slate-500">1x</span>
                      <input
                        type="range"
                        min="1"
                        max="10"
                        value={replaySpeed}
                        onChange={(e) => setReplaySpeed(Number(e.target.value))}
                        className="w-full accent-indigo-500"
                      />
                      <span className="text-[10px] font-bold text-slate-500">10x</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="space-y-6">
              {/* Notifications */}
              <div className="p-5 bg-slate-900 border border-slate-800 rounded-2xl h-[300px] flex flex-col">
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4">Live Alerts</h3>
                <div className="flex-grow overflow-y-auto space-y-3 pr-2">
                  {notifications.length === 0 ? (
                    <p className="text-xs text-slate-600 text-center mt-10">No recent alerts.</p>
                  ) : (
                    notifications.map((n) => (
                      <div key={n.id} className="p-3 bg-slate-950 border border-slate-800 rounded-xl">
                        <div className="flex justify-between items-start mb-1">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${n.type === 'ERROR' ? 'bg-rose-500/20 text-rose-400' : n.type === 'WARNING' ? 'bg-amber-500/20 text-amber-400' : 'bg-blue-500/20 text-blue-400'}`}>
                            {n.type}
                          </span>
                          <span className="text-[10px] text-slate-500">{new Date(n.timestamp).toLocaleTimeString()}</span>
                        </div>
                        <p className="text-xs text-slate-300 font-medium leading-relaxed">{n.message}</p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
