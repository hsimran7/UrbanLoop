import React, { useState, useEffect } from 'react';
import { useNavigate } from "react-router-dom";
import { useAuth } from '../../context/auth-context';
import { apiRequest } from '../../utils/api';
import { Link } from "react-router-dom";
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
  const navigate = useNavigate();

  useEffect(() => {
    if (user) {
      if (user.role === 'WORKER' || user.role === 'DRIVER') navigate('/dashboard/worker');
      else if (user.role === 'SUPERVISOR' || user.role === 'FACILITY_MANAGER') navigate('/dashboard/admin');
    }
  }, [user, navigate]);

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
    socket.on('CITIZEN_VERIFIED', handler);
    socket.on('CITIZEN_REJECTED', handler);
    socket.on('SERVICE_REQUEST_UPDATED', handler);
    socket.on('BIN_UPDATED', handler);

    return () => {
      socket.off('complaintSubmitted', handler);
      socket.off('propertyApproved', handler);
      socket.off('taskCompleted', handler);
      socket.off('binOverflow', handler);
      socket.off('collectionCompleted', handler);
      socket.off('scheduleUpdated', handler);
      socket.off('notificationCreated', handler);
      socket.off('notification', handler);
      socket.off('CITIZEN_VERIFIED', handler);
      socket.off('CITIZEN_REJECTED', handler);
      socket.off('SERVICE_REQUEST_UPDATED', handler);
      socket.off('BIN_UPDATED', handler);
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
      <div className="glass-card p-8 relative overflow-hidden flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-800">
            Hello, <span className="text-nature-earth">{user.name || user.email.split('@')[0]}</span>
          </h1>
          <p className="text-slate-600 text-sm mt-2 font-medium">{greeting}! Welcome back to your UrbanLoop dashboard.</p>
        </div>
        <div className="text-5xl animate-bounce">🌱</div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {[
          { label: 'Report Complaint', href: '/dashboard/complaints', emoji: '🚨', hover: 'hover:border-red-300' },
          { label: 'Collection Schedule', href: '/dashboard/schedules', emoji: '🗓️', hover: 'hover:border-blue-300' },
          { label: 'My Property', href: '/dashboard/properties', emoji: '🏡', hover: 'hover:border-nature-accent' },
          { label: 'Nearby Bins', href: '/dashboard/schedules', emoji: '🗑️', hover: 'hover:border-teal-300' },
          { label: 'View Bills', href: '/dashboard/schedules', emoji: '💳', hover: 'hover:border-indigo-300' }
        ].map((btn) => (
          <Link key={btn.label} to={btn.href} className={`flex flex-col items-center justify-center p-5 glass-card !rounded-2xl transition-all hover:bg-nature-white/90 ${btn.hover} group`}>
            <span className="text-3xl mb-3 group-hover:scale-110 transition-transform">{btn.emoji}</span>
            <span className="text-xs font-bold text-slate-600 group-hover:text-slate-900 text-center uppercase tracking-wider">{btn.label}</span>
          </Link>
        ))}
      </div>

      {isLoading ? (
        <div className="h-40 flex items-center justify-center"><span className="animate-spin h-8 w-8 border-2 border-nature-accent border-t-transparent rounded-full"></span></div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-6">
            <div className="glass-card p-6 border-surface-border">
              <h3 className="text-sm font-bold text-slate-800 mb-4 flex justify-between items-center uppercase tracking-wider">
                <span>My Property Map</span>
                <Link to="/dashboard/properties" className="text-xs text-nature-earth hover:underline">Manage Properties</Link>
              </h3>
              {properties.length === 0 ? (
                <div className="h-64 flex flex-col items-center justify-center bg-nature-lightBg/50 rounded-xl border border-dashed border-nature-neutral">
                  <span className="text-4xl mb-2">📍</span>
                  <p className="text-sm text-slate-500 font-medium">No properties linked yet.</p>
                  <Link to="/dashboard/properties" className="mt-4 btn-primary">Register Property</Link>
                </div>
              ) : (
                <div className="h-72 w-full rounded-xl overflow-hidden relative border border-surface-border shadow-sm">
                  <UrbanLoopMap center={mapCenter} zoom={15} markers={mapMarkers} className="w-full h-full" />
                </div>
              )}
            </div>
          </div>

          <div className="lg:col-span-1 space-y-6">
            {/* TODAY'S COLLECTION STATUS */}
            <div className="glass-card p-6">
              <h3 className="text-sm font-bold text-slate-800 mb-4 uppercase tracking-wider">Today's Status</h3>
              {(() => {
                const todayStr = new Date().toISOString().split('T')[0];
                const todayCollection = history.find(h => {
                  if (!h.collectedAt) return false;
                  const dStr = new Date(h.collectedAt).toISOString().split('T')[0];
                  return dStr === todayStr;
                });

                if (todayCollection) {
                  return (
                    <div className="p-4 rounded-xl border border-emerald-200 bg-emerald-50 flex items-center justify-between shadow-sm">
                      <div>
                        <div className="text-xs text-emerald-700 font-bold uppercase tracking-wider">Emptying Completed</div>
                        <div className="text-[11px] text-emerald-600 mt-1 font-medium">Status: {todayCollection.status}</div>
                        <div className="text-[10px] text-emerald-500 mt-0.5">Time: {new Date(todayCollection.collectedAt).toLocaleTimeString()}</div>
                      </div>
                      <span className="text-2xl">🟢</span>
                    </div>
                  );
                } else {
                  const todayScheduled = schedules.some(s => s.collectionDate === todayStr);
                  if (todayScheduled) {
                    return (
                      <div className="p-4 rounded-xl border border-amber-200 bg-amber-50 flex items-center justify-between shadow-sm">
                        <div>
                          <div className="text-xs text-amber-700 font-bold uppercase tracking-wider">Scheduled for Today</div>
                          <div className="text-[10px] text-amber-600 mt-1 font-medium">Pending worker empty scan</div>
                        </div>
                        <span className="text-2xl animate-pulse">🟡</span>
                      </div>
                    );
                  } else {
                    return (
                      <div className="p-4 rounded-xl border border-nature-neutral/50 bg-nature-lightBg flex items-center justify-between text-xs text-slate-500 font-medium shadow-sm">
                        <span>No collection scheduled for today.</span>
                        <span className="text-xl">⚪</span>
                      </div>
                    );
                  }
                }
              })()}
            </div>

            {/* NOTIFICATIONS PANEL */}
            <div className="glass-card p-6 space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Alerts & Notifications</h3>
                {notifications.filter(n => !n.isRead).length > 0 && (
                  <button 
                    onClick={async () => {
                      await apiRequest('/assignments/my-notifications/read-all', { method: 'POST' });
                      fetchCitizenData();
                    }}
                    className="text-[10px] text-nature-earth hover:underline font-bold uppercase"
                  >
                    Mark all read
                  </button>
                )}
              </div>
              {notifications.filter(n => !n.isRead).length === 0 ? (
                <div className="text-center py-6 text-slate-500 text-xs font-medium">No new notifications.</div>
              ) : (
                <div className="space-y-2.5 max-h-48 overflow-y-auto pr-1">
                  {notifications.filter(n => !n.isRead).map((n: any) => (
                    <div key={n.id} className="p-3 rounded-xl border border-blue-200 bg-blue-50 text-xs relative group shadow-sm">
                      <div className="font-bold text-blue-800 pr-4">{n.title}</div>
                      <div className="text-blue-600 mt-1 text-[11px] leading-relaxed font-medium">{n.body}</div>
                      <button
                        onClick={async () => {
                          await apiRequest(`/assignments/my-notifications/${n.id}/read`, { method: 'POST' });
                          fetchCitizenData();
                        }}
                        className="absolute top-2 right-2 text-slate-400 hover:text-slate-600 text-[10px]"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* COMPLETED COLLECTIONS */}
            <div className="glass-card p-6 space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Completed</h3>
                <Link to="/dashboard/citizen/history" className="text-xs text-nature-earth hover:underline font-bold uppercase">View All</Link>
              </div>
              {history.length === 0 ? (
                <div className="text-center py-6 text-slate-500 text-xs font-medium">No records recorded.</div>
              ) : (
                <div className="space-y-3">
                  {history.slice(0, 3).map((h: any, i: number) => (
                    <div key={i} className="flex items-center justify-between p-3 rounded-xl border border-surface-border bg-nature-lightBg/50 shadow-sm">
                      <div>
                        <div className="text-xs font-bold text-slate-700">{h.address}</div>
                        <div className="text-[10px] text-slate-500 mt-1 font-medium">
                          {h.collectedAt ? new Date(h.collectedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : ''}
                        </div>
                      </div>
                      <span className={`px-2 py-0.5 rounded text-[9px] font-bold border ${
                        h.status === 'COLLECTED' ? 'bg-emerald-100 border-emerald-200 text-emerald-800' :
                        h.status === 'MISSED' ? 'bg-red-100 border-red-200 text-red-800' :
                        'bg-cyan-100 border-cyan-200 text-cyan-800'
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
    socket.on('NEW_CITIZEN_REGISTRATION', fetchAdminStats);
    socket.on('NEW_CITIZEN_REQUEST', fetchAdminStats);
    socket.on('CITIZEN_VERIFIED', fetchAdminStats);
    socket.on('SERVICE_REQUEST_UPDATED', fetchAdminStats);
    socket.on('BIN_UPDATED', fetchAdminStats);
    socket.on('BIN_STATUS_UPDATED', fetchAdminStats);
    socket.on('BIN_TELEMETRY_UPDATED', fetchAdminStats);

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
      socket.off('NEW_CITIZEN_REGISTRATION', fetchAdminStats);
      socket.off('NEW_CITIZEN_REQUEST', fetchAdminStats);
      socket.off('CITIZEN_VERIFIED', fetchAdminStats);
      socket.off('SERVICE_REQUEST_UPDATED', fetchAdminStats);
      socket.off('BIN_UPDATED', fetchAdminStats);
      socket.off('BIN_STATUS_UPDATED', fetchAdminStats);
      socket.off('BIN_TELEMETRY_UPDATED', fetchAdminStats);
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
        activeVehicles: typeof analytics?.kpis?.activeVehicles === 'object'
          ? (analytics?.kpis?.activeVehicles?.value ?? 0)
          : (analytics?.kpis?.activeVehicles || 0),
        overflowingBins: binsList.filter((b: any) => b.status === 'OVERFLOWING').length,
        pendingComplaints: complaintsList.filter((c: any) => c.status !== 'RESOLVED' && c.status !== 'CLOSED').length,
        collectionPercent: typeof analytics?.kpis?.collectionEfficiency === 'object'
          ? `${analytics?.kpis?.collectionEfficiency?.value ?? 0}%`
          : (analytics?.routeCompletionRate ? `${analytics.routeCompletionRate}%` : '0%'),
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
      <div className="glass-card p-8 relative overflow-hidden">
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-800">Government Control Center</h1>
        <p className="text-slate-600 text-sm mt-2 font-medium">Municipal Smart Waste Grid Command Panel.</p>
      </div>

      {loading ? (
        <div className="h-60 flex items-center justify-center">
          <span className="h-8 w-8 border-2 border-nature-accent border-t-transparent rounded-full animate-spin"></span>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
            {[
              { label: 'Total Citizens', value: stats.citizens, color: 'text-indigo-600' },
              { label: 'Active Workers', value: stats.workers, color: 'text-teal-600' },
              { label: 'Properties Mapped', value: stats.properties, color: 'text-emerald-600' },
              { label: 'Today\'s collection %', value: stats.collectionPercent, color: 'text-emerald-700' },
              { label: 'Pending Complaints', value: stats.pendingComplaints, color: 'text-amber-600' },
              { label: 'Overflowing Bins', value: stats.overflowingBins, color: 'text-rose-600' },
              { label: 'Vehicles Active', value: stats.activeVehicles, color: 'text-cyan-600' },
              { label: 'Pending Verifications', value: stats.pendingProperties, color: 'text-purple-600' },
            ].map((kpi) => (
              <div key={kpi.label} className="glass-card p-5 !rounded-[16px] text-center">
                <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block mb-2">{kpi.label}</span>
                <span className={`text-3xl font-extrabold ${kpi.color}`}>{kpi.value}</span>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-3">
              <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider pl-2">Live Grid Hotspots Map</h3>
              <div className="w-full h-[320px] rounded-2xl border border-surface-border overflow-hidden relative z-0 shadow-glass-soft">
                <UrbanLoopMap center={[30.900965, 75.857277]} zoom={12} markers={adminMarkers} />
              </div>
            </div>
            <div className="lg:col-span-1 glass-card p-6 flex flex-col justify-between">
              <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider border-b border-surface-border pb-3 mb-4">Weekly collection (Tons)</h3>
              {/* Dynamic KPI derived from DB */ }
              <div className="flex-1 flex items-end justify-between space-x-2 pt-4 px-2 h-40">
                {chartData.length > 0 ? chartData.map((d: any, idx: number) => {
                  const max = Math.max(...chartData.map(c => c.val || 1));
                  const height = ((d.val || 0) / max) * 100;
                  return (
                    <div key={idx} className="flex flex-col items-center flex-1 group">
                      <div className="w-full flex justify-center h-[120px] items-end relative">
                        <div 
                          className="w-full max-w-[40px] bg-nature-accent/80 rounded-t-md group-hover:bg-nature-accent transition-all duration-500 ease-out flex items-start justify-center pt-2"
                          style={{ height: `${height}%`, minHeight: '10%' }}
                        >
                           <span className="text-[10px] font-bold text-slate-800 opacity-0 group-hover:opacity-100 transition-opacity -mt-6 bg-nature-lightBg px-1.5 py-0.5 rounded shadow-lg absolute whitespace-nowrap z-10 border border-nature-neutral">{d.val} t</span>
                        </div>
                      </div>
                      <span className="text-[10px] text-slate-500 font-bold mt-3 uppercase tracking-wider">{d.day}</span>
                    </div>
                  );
                }) : (
                   <div className="flex-1 flex flex-col items-center justify-center h-full">
                     <p className="text-xs text-slate-500 font-medium">No collection data available</p>
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
