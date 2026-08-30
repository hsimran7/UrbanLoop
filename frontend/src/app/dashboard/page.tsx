'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../context/auth-context';
import { apiRequest } from '../../utils/api';
import Link from 'next/link';
import { getSocket } from '../../utils/socket';
import { UrbanLoopMap, MapMarkerProps } from '../../components/maps/UrbanLoopMap';

interface Property {
  id: string;
  address: string;
  latitude: number;
  longitude: number;
  status: 'PENDING' | 'VERIFIED' | 'REJECTED';
  collectionPoints?: any[];
}

interface Complaint {
  id: string;
  title: string;
  requestCode: string;
  status: string;
}

interface ScheduleOccurrence {
  wasteType: string;
  collectionDate: string;
  startTime: string;
  endTime: string;
}

export default function DashboardRootPage() {
  const { user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (user) {
      if (user.role === 'WORKER') router.push('/dashboard/worker');
      else if (user.role === 'SUPERVISOR') router.push('/dashboard/supervisor/operations');
      else if (user.role === 'FACILITY_MANAGER') router.push('/dashboard/facility');
    }
  }, [user, router]);

  if (!user) return null;

  if (user.role === 'CITIZEN') return <CitizenDashboard user={user} />;
  if (user.role === 'SYSTEM_ADMIN' || user.role === 'GOVERNMENT_OFFICIAL') return <AdminDashboard user={user} />;

  return (
    <div className="h-60 flex items-center justify-center">
      <span className="h-8 w-8 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin"></span>
    </div>
  );
}

// ==========================================
// CITIZEN DASHBOARD COMPONENT
// ==========================================
function CitizenDashboard({ user }: { user: any }) {
  const [properties, setProperties] = useState<Property[]>([]);
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [schedules, setSchedules] = useState<ScheduleOccurrence[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);
  
  const [isLoading, setIsLoading] = useState(true);
  const [greeting, setGreeting] = useState('Good Morning');

  useEffect(() => {
    const hour = new Date().getHours();
    if (hour < 12) setGreeting('Good Morning');
    else if (hour < 17) setGreeting('Good Afternoon');
    else setGreeting('Good Evening');
  }, []);

  useEffect(() => {
    fetchCitizenData();
    const socket = getSocket('realtime');
    
    socket.on('connect', () => console.log('Citizen connected to realtime WS stream.'));
    
    const handler = () => fetchCitizenData();
    
    socket.on('complaintSubmitted', handler);
    socket.on('propertyApproved', handler);
    socket.on('taskCompleted', handler);
    socket.on('binOverflow', handler);
    socket.on('collectionCompleted', handler);
    socket.on('scheduleUpdated', handler);
    socket.on('notificationCreated', handler);
    socket.on('notification', handler);

    return () => {
      socket.off('complaintSubmitted', handler);
      socket.off('propertyApproved', handler);
      socket.off('taskCompleted', handler);
      socket.off('binOverflow', handler);
      socket.off('collectionCompleted', handler);
      socket.off('scheduleUpdated', handler);
      socket.off('notificationCreated', handler);
      socket.off('notification', handler);
      socket.disconnect();
    };
  }, []);

  async function fetchCitizenData() {
    setIsLoading(true);
    try {
      const [propRes, compRes, schedRes, histRes, notifRes] = await Promise.all([
        apiRequest('/properties'),
        apiRequest('/service-requests'),
        apiRequest('/citizen/schedules'),
        apiRequest('/assignments/citizen-history'),
        apiRequest('/assignments/my-notifications'),
      ]);

      if (propRes.ok) setProperties(await propRes.json());
      if (compRes.ok) {
        const compList = await compRes.json();
        setComplaints(compList.slice(0, 3));
      }
      if (schedRes.ok) {
        const schedData = await schedRes.json();
        const occurrences: ScheduleOccurrence[] = schedData.flatMap((p: any) => p.occurrences) || [];
        setSchedules(occurrences.slice(0, 3));
      }
      if (histRes.ok) setHistory(await histRes.json());
      if (notifRes.ok) setNotifications(await notifRes.json());
    } catch (e) {
      console.error('Error fetching citizen data:', e);
    } finally {
      setIsLoading(false);
    }
  }

  const activeProperty = properties.find(p => p.status === 'VERIFIED');
  const targetProp = activeProperty || properties[0];
  const mapCenter: [number, number] = targetProp ? [targetProp.latitude, targetProp.longitude] : [30.900965, 75.857277];

  const mapMarkers: MapMarkerProps[] = targetProp ? [
    { id: 'prop', position: [targetProp.latitude, targetProp.longitude], popupContent: 'My Property' }
  ] : [];

  if (targetProp?.collectionPoints) {
    targetProp.collectionPoints.forEach((cp: any) => {
      mapMarkers.push({ id: `cp-${cp.id}`, position: [cp.latitude, cp.longitude], popupContent: `Collection Point: ${cp.name}` });
    });
  }

  return (
    <div className="space-y-8 pb-20">
      <div className="p-6 rounded-2xl border border-slate-800 bg-gradient-to-r from-slate-900 to-slate-950 relative overflow-hidden flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-slate-100">
            Hello, <span className="text-emerald-400 font-extrabold">{user.name || user.email.split('@')[0]}</span>
          </h1>
          <p className="text-slate-450 text-xs mt-1.5">{greeting}! Welcome back to your UrbanLoop dashboard.</p>
        </div>
        <div className="text-4xl animate-bounce">🌱</div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {[
          { label: 'Report Complaint', href: '/dashboard/complaints', emoji: '🚨', bg: 'hover:border-rose-500/30' },
          { label: 'Collection Schedule', href: '/dashboard/schedules', emoji: '🗓️', bg: 'hover:border-blue-500/30' },
          { label: 'My Property', href: '/dashboard/properties', emoji: '🏡', bg: 'hover:border-emerald-500/30' },
          { label: 'Nearby Bins', href: '/dashboard/schedules', emoji: '🗑️', bg: 'hover:border-teal-500/30' },
          { label: 'View Bills', href: '/dashboard/schedules', emoji: '💳', bg: 'hover:border-indigo-500/30' }
        ].map((btn) => (
          <Link key={btn.label} href={btn.href} className={`flex flex-col items-center justify-center p-4 rounded-2xl border border-slate-800 bg-slate-900/50 hover:bg-slate-900 transition-all ${btn.bg} group`}>
            <span className="text-2xl mb-2 group-hover:scale-110 transition-transform">{btn.emoji}</span>
            <span className="text-[10px] font-bold text-slate-400 group-hover:text-slate-200 text-center uppercase tracking-wider">{btn.label}</span>
          </Link>
        ))}
      </div>

      {isLoading ? (
        <div className="h-40 flex items-center justify-center"><span className="animate-spin h-8 w-8 border-2 border-emerald-500 border-t-transparent rounded-full"></span></div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-6">
            <div className="p-6 rounded-2xl border border-slate-900 bg-slate-950/40">
              <h3 className="text-sm font-bold text-slate-200 mb-4 flex justify-between items-center">
                <span>My Property Map</span>
                <Link href="/dashboard/properties" className="text-xs text-emerald-400 hover:underline">Manage Properties</Link>
              </h3>
              {properties.length === 0 ? (
                <div className="h-64 flex flex-col items-center justify-center bg-slate-900/50 rounded-xl border border-dashed border-slate-700">
                  <span className="text-4xl mb-2">📍</span>
                  <p className="text-sm text-slate-400 font-medium">No properties linked yet.</p>
                  <Link href="/dashboard/properties" className="mt-4 px-4 py-2 bg-emerald-500/20 text-emerald-400 text-xs font-bold rounded-lg hover:bg-emerald-500/30 transition">Register Property</Link>
                </div>
              ) : (
                <div className="h-72 w-full rounded-xl overflow-hidden relative border border-slate-800">
                  <UrbanLoopMap center={mapCenter} zoom={15} markers={mapMarkers} className="w-full h-full" />
                </div>
              )}
            </div>
          </div>

          <div className="lg:col-span-1 space-y-6">
            {/* TODAY'S COLLECTION STATUS */}
            <div className="p-6 rounded-2xl border border-slate-900 bg-slate-950/40">
              <h3 className="text-sm font-bold text-slate-200 mb-4">Today's Collection Status</h3>
              {(() => {
                const todayStr = new Date().toISOString().split('T')[0];
                const todayCollection = history.find(h => {
                  if (!h.collectedAt) return false;
                  const dStr = new Date(h.collectedAt).toISOString().split('T')[0];
                  return dStr === todayStr;
                });

                if (todayCollection) {
                  return (
                    <div className="p-4 rounded-xl border border-emerald-500/20 bg-emerald-950/10 flex items-center justify-between">
                      <div>
                        <div className="text-xs text-emerald-400 font-bold uppercase tracking-wider">Emptying Completed</div>
                        <div className="text-[11px] text-slate-400 mt-1">Status: {todayCollection.status}</div>
                        <div className="text-[10px] text-slate-500 mt-0.5">Time: {new Date(todayCollection.collectedAt).toLocaleTimeString()}</div>
                      </div>
                      <span className="text-2xl">🟢</span>
                    </div>
                  );
                } else {
                  const todayScheduled = schedules.some(s => s.collectionDate === todayStr);
                  if (todayScheduled) {
                    return (
                      <div className="p-4 rounded-xl border border-yellow-500/20 bg-yellow-950/10 flex items-center justify-between">
                        <div>
                          <div className="text-xs text-yellow-400 font-bold uppercase tracking-wider">Scheduled for Today</div>
                          <div className="text-[10px] text-slate-400 mt-1">Pending worker empty scan</div>
                        </div>
                        <span className="text-2xl animate-pulse">🟡</span>
                      </div>
                    );
                  } else {
                    return (
                      <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/20 flex items-center justify-between text-xs text-slate-400">
                        <span>No collection scheduled for today.</span>
                        <span className="text-xl">⚪</span>
                      </div>
                    );
                  }
                }
              })()}
            </div>

            {/* NOTIFICATIONS PANEL */}
            <div className="p-6 rounded-2xl border border-slate-900 bg-slate-950/40 space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="text-sm font-bold text-slate-200">Alerts & Notifications</h3>
                {notifications.filter(n => !n.isRead).length > 0 && (
                  <button 
                    onClick={async () => {
                      await apiRequest('/assignments/my-notifications/read-all', { method: 'POST' });
                      fetchCitizenData();
                    }}
                    className="text-[10px] text-emerald-400 hover:underline"
                  >
                    Mark all read
                  </button>
                )}
              </div>
              {notifications.filter(n => !n.isRead).length === 0 ? (
                <div className="text-center py-6 text-slate-500 text-xs">No new notifications.</div>
              ) : (
                <div className="space-y-2.5 max-h-48 overflow-y-auto pr-1">
                  {notifications.filter(n => !n.isRead).map((n: any) => (
                    <div key={n.id} className="p-3 rounded-xl border border-blue-500/20 bg-blue-950/5 text-xs relative group">
                      <div className="font-semibold text-blue-300 pr-4">{n.title}</div>
                      <div className="text-slate-400 mt-1 text-[11px] leading-relaxed">{n.body}</div>
                      <button
                        onClick={async () => {
                          await apiRequest(`/assignments/my-notifications/${n.id}/read`, { method: 'POST' });
                          fetchCitizenData();
                        }}
                        className="absolute top-2 right-2 text-slate-500 hover:text-slate-350 text-[10px]"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* COMPLETED COLLECTIONS */}
            <div className="p-6 rounded-2xl border border-slate-900 bg-slate-950/40 space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="text-sm font-bold text-slate-200">Completed Collections</h3>
                <Link href="/dashboard/citizen/history" className="text-xs text-emerald-400 hover:underline">View All</Link>
              </div>
              {history.length === 0 ? (
                <div className="text-center py-6 text-slate-500 text-xs">No records recorded.</div>
              ) : (
                <div className="space-y-3">
                  {history.slice(0, 3).map((h: any, i: number) => (
                    <div key={i} className="flex items-center justify-between p-3 rounded-xl border border-slate-900 bg-slate-900/20">
                      <div>
                        <div className="text-xs font-bold text-slate-300">{h.address}</div>
                        <div className="text-[10px] text-slate-500 mt-1">
                          {h.collectedAt ? new Date(h.collectedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : ''}
                        </div>
                      </div>
                      <span className={`px-2 py-0.5 rounded text-[9px] font-bold border ${
                        h.status === 'COLLECTED' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' :
                        h.status === 'MISSED' ? 'bg-red-500/10 border-red-500/20 text-red-400' :
                        'bg-cyan-500/10 border-cyan-500/20 text-cyan-400'
                      }`}>
                        {h.status}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ==========================================
// ADMIN DASHBOARD COMPONENT
// ==========================================
function AdminDashboard({ user }: { user: any }) {
  const [stats, setStats] = useState({ citizens: 0, workers: 0, properties: 0, bins: 0, pendingProperties: 0, activeVehicles: 0, overflowingBins: 0, pendingComplaints: 0, collectionPercent: '0%' });
  const [adminMarkers, setAdminMarkers] = useState<MapMarkerProps[]>([]);
  const [chartData, setChartData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAdminStats();
    const socket = getSocket('realtime');
    
    socket.on('connect', () => console.log('Admin connected to realtime WS stream.'));
    socket.on('complaintSubmitted', fetchAdminStats);
    socket.on('propertyApproved', fetchAdminStats);
    socket.on('taskCompleted', fetchAdminStats);
    socket.on('binOverflow', fetchAdminStats);
    socket.on('workerShiftStarted', fetchAdminStats);
    socket.on('areaCompleted', fetchAdminStats);
    socket.on('assignmentCreated', fetchAdminStats);
    socket.on('assignmentUpdated', fetchAdminStats);
    socket.on('assignmentAccepted', fetchAdminStats);
    socket.on('assignmentRejected', fetchAdminStats);
    socket.on('assignmentStarted', fetchAdminStats);
    socket.on('assignmentCompleted', fetchAdminStats);
    socket.on('notificationCreated', fetchAdminStats);

    return () => {
      socket.off('complaintSubmitted', fetchAdminStats);
      socket.off('propertyApproved', fetchAdminStats);
      socket.off('taskCompleted', fetchAdminStats);
      socket.off('binOverflow', fetchAdminStats);
      socket.off('workerShiftStarted', fetchAdminStats);
      socket.off('areaCompleted', fetchAdminStats);
      socket.off('assignmentCreated', fetchAdminStats);
      socket.off('assignmentUpdated', fetchAdminStats);
      socket.off('assignmentAccepted', fetchAdminStats);
      socket.off('assignmentRejected', fetchAdminStats);
      socket.off('assignmentStarted', fetchAdminStats);
      socket.off('assignmentCompleted', fetchAdminStats);
      socket.off('notificationCreated', fetchAdminStats);
      socket.disconnect();
    };
  }, []);

  async function fetchAdminStats() {
    setLoading(true);
    try {
      const [analyticsRes, graphRes, usersRes, propRes, binRes, compRes] = await Promise.all([
        apiRequest('/analytics/dashboard'),
        apiRequest('/ai/graphs'),
        apiRequest('/workforce/workers'),
        apiRequest('/properties'),
        apiRequest('/bins'),
        apiRequest('/service-requests'),
      ]);

      const analytics = analyticsRes.ok ? await analyticsRes.json() : null;
      const graphs = graphRes.ok ? await graphRes.json() : null;
      const workersList = usersRes.ok ? await usersRes.json() : [];
      const propertiesList = propRes.ok ? await propRes.json() : [];
      const binsList = binRes.ok ? await binRes.json() : [];
      const complaintsList = compRes.ok ? await compRes.json() : [];

      setStats({
        citizens: propertiesList.map((p: any) => p.ownerId).filter((v: any, i: any, a: any) => a.indexOf(v) === i).length || 3,
        workers: workersList.length,
        properties: propertiesList.length,
        bins: binsList.length,
        pendingProperties: propertiesList.filter((p: any) => p.status === 'PENDING').length,
        activeVehicles: analytics?.kpis?.activeVehicles || 0,
        overflowingBins: binsList.filter((b: any) => b.status === 'OVERFLOWING').length,
        pendingComplaints: complaintsList.filter((c: any) => c.status !== 'RESOLVED' && c.status !== 'CLOSED').length,
        collectionPercent: analytics?.routeCompletionRate ? `${analytics.routeCompletionRate}%` : '0%',
      });

      // Plot actual overflowing bins on the map instead of hardcoded data
      const overflowMarkers = binsList
        .filter((b: any) => b.status === 'OVERFLOWING' && b.collectionPoint?.latitude)
        .map((b: any) => ({
          id: b.id,
          position: [b.collectionPoint.latitude, b.collectionPoint.longitude] as [number, number],
          popupContent: `🚨 OVERFLOWING BIN: ${b.qrCodeId}`,
        }));
      setAdminMarkers(overflowMarkers);
      if (graphs && graphs.dailyWasteCollected) {
        setChartData(graphs.dailyWasteCollected);
      }
    } catch (e) {
      console.error('Error fetching admin stats:', e);
    } finally {
      setLoading(false);
    }
  }



  return (
    <div className="space-y-8 pb-20">
      <div className="p-6 rounded-2xl border border-slate-800 bg-gradient-to-r from-slate-900 to-indigo-950/20 relative overflow-hidden">
        <h1 className="text-2xl font-black tracking-tight text-slate-100">Government Control Center</h1>
        <p className="text-slate-450 text-xs mt-1.5">Municipal Smart Waste Grid Command Panel.</p>
      </div>

      {loading ? (
        <div className="h-60 flex items-center justify-center">
          <span className="h-8 w-8 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin"></span>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
            {[
              { label: 'Total Citizens', value: stats.citizens, color: 'text-indigo-400' },
              { label: 'Active Workers', value: stats.workers, color: 'text-teal-400' },
              { label: 'Properties Mapped', value: stats.properties, color: 'text-emerald-400' },
              { label: 'Today\'s collection %', value: stats.collectionPercent, color: 'text-emerald-450' },
              { label: 'Pending Complaints', value: stats.pendingComplaints, color: 'text-amber-400' },
              { label: 'Overflowing Bins', value: stats.overflowingBins, color: 'text-rose-400' },
              { label: 'Vehicles Active', value: stats.activeVehicles, color: 'text-cyan-400' },
              { label: 'Pending Verifications', value: stats.pendingProperties, color: 'text-purple-400' },
            ].map((kpi) => (
              <div key={kpi.label} className="p-5 rounded-2xl border border-slate-900 bg-slate-950/40">
                <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block mb-1">{kpi.label}</span>
                <span className={`text-2xl font-extrabold ${kpi.color}`}>{kpi.value}</span>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-3">
              <h3 className="text-sm font-bold text-slate-200">Live Grid Hotspots Map</h3>
              <div className="w-full h-[320px] rounded-2xl border border-slate-800 overflow-hidden relative z-0">
                <UrbanLoopMap center={[30.900965, 75.857277]} zoom={12} markers={adminMarkers} />
              </div>
            </div>
            <div className="lg:col-span-1 p-5 rounded-2xl border border-slate-900 bg-slate-950/40 flex flex-col justify-between">
              <h3 className="text-sm font-bold text-slate-200 border-b border-slate-900 pb-2 mb-3">Weekly collection (Tons)</h3>
              {/* Dynamic KPI derived from DB */ }
              <div className="flex-1 flex items-end justify-between space-x-2 pt-4 px-2 h-40">
                {chartData.length > 0 ? chartData.map((d: any, idx: number) => {
                  const max = Math.max(...chartData.map(c => c.val || 1));
                  const height = ((d.val || 0) / max) * 100;
                  return (
                    <div key={idx} className="flex flex-col items-center flex-1 group">
                      <div className="w-full flex justify-center h-[120px] items-end relative">
                        <div 
                          className="w-full max-w-[40px] bg-indigo-500/80 rounded-t-md group-hover:bg-indigo-400 transition-all duration-500 ease-out flex items-start justify-center pt-2"
                          style={{ height: `${height}%`, minHeight: '10%' }}
                        >
                           <span className="text-[10px] font-bold text-white opacity-0 group-hover:opacity-100 transition-opacity -mt-6 bg-slate-800 px-1.5 py-0.5 rounded shadow-lg absolute whitespace-nowrap z-10">{d.val} t</span>
                        </div>
                      </div>
                      <span className="text-[10px] text-slate-400 font-semibold mt-3 uppercase tracking-wider">{d.day}</span>
                    </div>
                  );
                }) : (
                   <div className="flex-1 flex flex-col items-center justify-center h-full">
                     <p className="text-xs text-slate-500">No collection data available</p>
                   </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
