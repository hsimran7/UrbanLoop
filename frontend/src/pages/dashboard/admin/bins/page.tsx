import React, { useState, useEffect, useCallback } from 'react';
import { apiRequest } from '../../../../utils/api';
import { CascadingLocationFilter } from '../../../../components/ui/CascadingLocationFilter';
import { UrbanLoopMap, MapMarkerProps } from '../../../../components/maps/UrbanLoopMap';

/* ─────────────────────────── types ─────────────────────────── */
interface AreaSummary {
  id: string;
  name: string;
  wardNumber: number;
  totalBins: number;
  onlineBins: number;
  offlineBins: number;
  nearFullBins: number;
  overflowBins: number;
  awaitingCollection: number;
  underMaintenance: number;
  lastCollectionTime: string | null;
  collectionEfficiency: number;
  activeTeamsCount: number;
  estWasteVolume: number;
  healthScore: number;
  status: 'Green' | 'Yellow' | 'Orange' | 'Red';
  statusText: string;
}

interface OperationalQueueItem {
  areaId: string;
  areaName: string;
  pendingBins: number;
  overflow: number;
  complaints: number;
  priority: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  color: 'Red' | 'Orange' | 'Yellow' | 'Green';
  action: string;
  score: number;
}

interface AreaAlert {
  id: string;
  title: string;
  message: string;
  action: string;
  severity: 'CRITICAL' | 'WARNING' | 'INFO';
}

interface AIRecommendation {
  id: string;
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  affectedArea: string;
  recommendation: string;
  reason: string;
  confidence: number;
  expectedImpact: string;
  affectedCitizens: number;
  estimatedResolution: string;
  status: 'AWAITING_APPROVAL' | 'APPROVED' | 'DISMISSED';
}

interface PredictiveIntelligence {
  id: string;
  type: string;
  target: string;
  probability: number;
  message: string;
  action: string;
}

interface LiveActivity {
  timestamp: string;
  timeStr: string;
  message: string;
  category: string;
}

interface ResourceAllocation {
  areaId: string;
  areaName: string;
  required: { vehicles: number; workers: number; supervisors: number };
  available: { vehicles: number; workers: number; supervisors: number };
}

interface HierarchyNode {
  id: string;
  name: string;
  state?: string;
  wards?: Array<{
    id: string;
    number: number;
    name: string;
    areas?: Array<{
      id: string;
      name: string;
      serviceZones?: Array<{
        id: string;
        name: string;
        code: string;
      }>;
    }>;
  }>;
}

interface DrilldownData {
  areaId: string;
  areaName: string;
  wardNumber: number;
  cityName: string;
  stateName: string;
  totalBins: number;
  todayProgress: number;
  collectionPoints: Array<{
    id: string;
    name: string;
    latitude: number;
    longitude: number;
    binsCount: number;
  }>;
  routeAssignments: any[];
  wasteTypeCounts: Record<string, number>;
  recentComplaints: any[];
  overflowHeatmap: any[];
  schedules: any[];
  workers: any[];
  individualBins: any[];
  analytics: {
    totalWaste: number;
    avgFill: number;
    overflowPct: number;
    complaintCount: number;
    deviceUptime: number;
    avgCollectionTime: number;
    workerProductivity: number;
    vehicleUtilization: number;
  };
}

/* ─────────────────────────── Component ─────────────────────────── */
export default function GovernmentCommandCenterPage() {
  // Selected location filters
  const [selectedState, setSelectedState] = useState('');
  const [selectedDistrict, setSelectedDistrict] = useState('');
  const [selectedCity, setSelectedCity] = useState('');
  const [selectedWard, setSelectedWard] = useState('');
  const [selectedArea, setSelectedArea] = useState('');
  const [selectedZone, setSelectedZone] = useState('');

  // Loaded data
  const [areaSummaries, setAreaSummaries] = useState<AreaSummary[]>([]);
  const [operationalQueue, setOperationalQueue] = useState<OperationalQueueItem[]>([]);
  const [areaNotifications, setAreaNotifications] = useState<AreaAlert[]>([]);
  const [aiRecommendations, setAiRecommendations] = useState<AIRecommendation[]>([]);
  const [liveActivities, setLiveActivities] = useState<LiveActivity[]>([]);
  const [predictions, setPredictions] = useState<PredictiveIntelligence[]>([]);
  const [resourceAllocations, setResourceAllocations] = useState<ResourceAllocation[]>([]);
  const [drilldownData, setDrilldownData] = useState<DrilldownData | null>(null);
  const [selectedBinDetails, setSelectedBinDetails] = useState<any>(null);

  // States
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingDrilldown, setIsLoadingDrilldown] = useState(false);
  const [isLoadingBin, setIsLoadingBin] = useState(false);
  const [actionSuccessMsg, setActionSuccessMsg] = useState('');
  
  // Controls
  const [activeMapLayer, setActiveMapLayer] = useState<'overflow' | 'complaints' | 'offline' | 'pending'>('overflow');
  const [isEmergencyMode, setIsEmergencyMode] = useState(false);

  // WebSockets for Real-Time Sync
  useEffect(() => {
    let socket: any = null;
    const setupRealtime = async () => {
      const { getSocket } = await import('../../../../utils/socket');
      socket = getSocket('realtime');
      
      const handleSync = () => {
        fetchData();
      };
      
      socket.on('complaintSubmitted', handleSync);
      socket.on('taskCompleted', handleSync);
      socket.on('binOverflow', handleSync);
      socket.on('workerShiftStarted', handleSync);
      socket.on('areaCompleted', handleSync);
    };
    setupRealtime();

    return () => {
      if (socket) {
        socket.off('complaintSubmitted');
        socket.off('taskCompleted');
        socket.off('binOverflow');
        socket.off('workerShiftStarted');
        socket.off('areaCompleted');
      }
    };
  }, []);

  // Load all command center feeds
  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const queryParams = new URLSearchParams();
      if (selectedState) queryParams.append('state', selectedState);
      if (selectedDistrict) queryParams.append('district', selectedDistrict);
      if (selectedCity) queryParams.append('city', selectedCity);
      if (selectedWard) queryParams.append('ward', selectedWard);
      if (selectedArea) queryParams.append('area', selectedArea);
      if (selectedZone) queryParams.append('zone', selectedZone);

      const [sumRes, queueRes, notifRes, recRes, actRes, predRes, resRes] = await Promise.all([
        apiRequest(`/bins/area-summaries?${queryParams.toString()}`),
        apiRequest('/bins/operational-queue'),
        apiRequest('/bins/area-notifications'),
        apiRequest('/bins/ai-recommendations'),
        apiRequest('/bins/live-activity'),
        apiRequest('/bins/predictive-intelligence'),
        apiRequest('/bins/resource-allocation')
      ]);

      if (sumRes.ok) {
        const summaries = await sumRes.json();
        setAreaSummaries(summaries);
        // Automatically trigger emergency mode if more than 3 critical zones exist
        const criticalCount = summaries.filter((s: any) => s.status === 'Red').length;
        setIsEmergencyMode(criticalCount > 0);
      }
      if (queueRes.ok) setOperationalQueue(await queueRes.json());
      if (notifRes.ok) setAreaNotifications(await notifRes.json());
      if (recRes.ok) setAiRecommendations(await recRes.json());
      if (actRes.ok) setLiveActivities(await actRes.json());
      if (predRes.ok) setPredictions(await predRes.json());
      if (resRes.ok) setResourceAllocations(await resRes.json());
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  }, [selectedState, selectedDistrict, selectedCity, selectedWard, selectedArea, selectedZone]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Trigger Command Action
  async function handleCommandAction(action: string, payload: any) {
    setActionSuccessMsg('');
    try {
      const res = await apiRequest(`/bins/actions/${action}`, {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        setActionSuccessMsg(`Action "${action.replace(/-/g, ' ')}" successfully dispatched to workforce queue.`);
        setTimeout(() => setActionSuccessMsg(''), 5000);
        fetchData();
      }
    } catch (e) {
      console.error(e);
    }
  }

  // Fetch Area Drilldown
  async function handleOpenDrilldown(areaId: string) {
    setIsLoadingDrilldown(true);
    setSelectedBinDetails(null);
    try {
      const res = await apiRequest(`/bins/area-drilldown/${areaId}`);
      if (res.ok) {
        setDrilldownData(await res.json());
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoadingDrilldown(false);
    }
  }

  // Fetch individual bin details
  async function handleOpenBinDetails(binId: string) {
    setIsLoadingBin(true);
    try {
      const res = await apiRequest(`/bins/${binId}`);
      if (res.ok) {
        setSelectedBinDetails(await res.json());
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoadingBin(false);
    }
  }

  // Calculate high-level executive KPIs
  const totalBins = areaSummaries.reduce((sum, s) => sum + s.totalBins, 0);
  const overflowBins = areaSummaries.reduce((sum, s) => sum + s.overflowBins, 0);
  const offlineBins = areaSummaries.reduce((sum, s) => sum + s.offlineBins, 0);
  const pendingCollections = areaSummaries.reduce((sum, s) => sum + s.awaitingCollection, 0);
  const completedToday = areaSummaries.reduce((sum, s) => sum + (s.totalBins - s.awaitingCollection), 0);
  const avgEfficiency = areaSummaries.length > 0 ? Math.round(areaSummaries.reduce((sum, s) => sum + s.collectionEfficiency, 0) / areaSummaries.length) : 92;
  const avgHealth = areaSummaries.length > 0 ? Math.round(areaSummaries.reduce((sum, s) => sum + s.healthScore, 0) / areaSummaries.length) : 85;

  return (
    <div className={`space-y-6 pb-20 text-slate-800 ${isEmergencyMode ? 'bg-red-50/20' : ''}`}>
      
      {/* Dynamic Emergency Mode Header */}
      {isEmergencyMode && (
        <div className="p-4 rounded-2xl border border-red-200 bg-red-50 text-red-700 text-xs font-bold animate-pulse flex items-center justify-between shadow-sm">
          <span>⚠️ EMERGENCY OPERATIONS MODE ACTIVE: CRITICAL DEVIATIONS EXCEED IN-WARD SAFETY THRESHOLDS</span>
          <button onClick={() => setIsEmergencyMode(false)} className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded-lg text-[10px] uppercase font-extrabold transition">
            Silence Mode
          </button>
        </div>
      )}

      {/* Main Title Banner */}
      <div className="glass-card p-8 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-800 tracking-tight font-display">Government Operations Command Center</h1>
          <p className="text-sm text-slate-600 mt-2 font-medium">Smart City Waste Management Console · live metrics feed · auto-refreshing</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => handleCommandAction('generate-report', {})}
            className="px-5 py-2.5 btn-primary font-bold text-xs transition">
            📄 Executive Report
          </button>
          <button onClick={() => handleCommandAction('create-emergency', {})}
            className="px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl text-xs transition shadow-sm">
            🚨 Trigger Response
          </button>
        </div>
      </div>

      {actionSuccessMsg && (
        <div className="p-4 rounded-xl border border-nature-accent bg-emerald-50 text-emerald-700 text-xs font-medium">
          {actionSuccessMsg}
        </div>
      )}

      {/* TOP SECTION: Executive KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3 text-xs">
        {[
          { label: 'Total Bins', value: totalBins, color: 'text-slate-800' },
          { label: 'Overflowing', value: overflowBins, color: overflowBins > 5 ? 'text-rose-700 font-black' : 'text-slate-700' },
          { label: 'Offline devices', value: offlineBins, color: offlineBins > 3 ? 'text-rose-700' : 'text-slate-700' },
          { label: 'Pending Stops', value: pendingCollections, color: 'text-slate-700' },
          { label: 'Daily Efficiency', value: `${avgEfficiency}%`, color: 'text-emerald-700' },
          { label: 'City Health Score', value: `${avgHealth}/100`, color: avgHealth < 70 ? 'text-amber-700' : 'text-emerald-700' },
          { label: 'Active Teams', value: '8 / 10', color: 'text-slate-800' },
          { label: 'Satisfaction', value: '4.4 / 5', color: 'text-amber-700' }
        ].map(kpi => (
          <div key={kpi.label} className="glass-card p-4 text-center">
            <div className={`text-xl font-black ${kpi.color}`}>{kpi.value}</div>
            <div className="text-[9px] text-slate-500 uppercase font-extrabold mt-1 tracking-wider">{kpi.label}</div>
          </div>
        ))}
      </div>

      {/* FILTERS: Cascading Hierarchy Filters */}
      <div className="glass-card p-4 text-xs">
        <CascadingLocationFilter
          layout="horizontal"
          onLocationChange={(loc) => {
            setSelectedState(loc.stateId || '');
            setSelectedDistrict(loc.districtId || '');
            setSelectedCity(loc.cityId || '');
            setSelectedWard(loc.wardId || '');
            setSelectedArea(loc.areaId || '');
            setSelectedZone(loc.zoneId || '');
          }}
        />
      </div>

      {/* MIDDLE CONTAINER: Three-Panel Control Room Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">

        {/* LEFT PANEL: Alerts, Dispatches, and recommendations */}
        <div className="lg:col-span-1 space-y-6 text-xs">
          
          {/* Critical Alerts */}
          <div className="glass-card p-5 space-y-4">
            <h3 className="text-xs font-extrabold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
              🔔 Smart alerts
            </h3>
            <div className="space-y-3 max-h-[220px] overflow-y-auto pr-1">
              {areaNotifications.length === 0 ? (
                <p className="text-slate-500 text-center py-4 font-medium">All areas reporting green.</p>
              ) : (
                areaNotifications.map((alert, idx) => (
                  <div key={idx} className="p-3 rounded-xl bg-nature-lightBg/60 border border-surface-border text-slate-700">
                    <span className="font-bold text-slate-800 block">{alert.title}</span>
                    <p className="mt-0.5 text-xs text-slate-600">{alert.message}</p>
                    <span className="text-[9px] text-nature-earth font-extrabold block mt-1 uppercase">🔧 Dispatch Recommendation</span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* AI Advisor feed */}
          <div className="glass-card p-5 space-y-4">
            <h3 className="text-xs font-extrabold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
              🤖 AI operations recommendations
            </h3>
            <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
              {aiRecommendations.length === 0 ? (
                <p className="text-slate-500 text-center py-4 font-medium">No critical AI recommendations.</p>
              ) : (
                aiRecommendations.map((rec) => (
                  <div key={rec.id} className="p-4 rounded-xl border border-indigo-200 bg-indigo-50/50 space-y-3 text-slate-700">
                    <div className="flex justify-between items-center font-bold">
                      <span className="text-indigo-800">{rec.affectedArea}</span>
                      <span className="text-[9px] px-1.5 py-0.5 bg-indigo-100 text-indigo-700 uppercase font-black rounded">{rec.priority}</span>
                    </div>
                    <p className="text-slate-800 text-xs font-semibold">{rec.recommendation}</p>
                    <div className="text-[10px] text-slate-500 space-y-1 font-medium">
                      <div>Confidence: {rec.confidence}% · Impact: {rec.expectedImpact}</div>
                      <div>Resolution: {rec.estimatedResolution} · Citizens: {rec.affectedCitizens}</div>
                    </div>
                    <div className="flex gap-2 pt-1">
                      <button onClick={() => handleCommandAction('approve-dispatch', { id: rec.id })}
                        className="flex-1 py-1.5 btn-primary font-bold text-[10px] transition">
                        Approve Action
                      </button>
                      <button onClick={() => setAiRecommendations(prev => prev.filter(r => r.id !== rec.id))}
                        className="py-1.5 px-3 border border-surface-border hover:bg-nature-lightBg text-slate-600 rounded-xl font-bold text-[10px] transition">
                        Dismiss
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* CENTER PANEL: Interactive SVG GIS Control Board */}
        <div className="lg:col-span-2 glass-card p-5 space-y-4">
          <div className="flex justify-between items-center flex-wrap gap-2">
            <h3 className="text-xs font-extrabold text-slate-500 uppercase tracking-wider">
              🗺️ GIS Command Heatmap Layer
            </h3>
            <div className="flex gap-1 bg-nature-lightBg/80 border border-surface-border rounded-xl p-1 text-[10px] font-bold">
              {[
                { key: 'overflow', label: 'Overflow' },
                { key: 'complaints', label: 'Complaints' },
                { key: 'offline', label: 'Offline' }
              ].map(layer => (
                <button key={layer.key} onClick={() => setActiveMapLayer(layer.key as any)}
                  className={`px-3 py-1.5 rounded-lg transition ${activeMapLayer === layer.key ? 'bg-nature-earth text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}>
                  {layer.label}
                </button>
              ))}
            </div>
          </div>

          {/* Custom SVG Interactive Municipal Map Dashboard */}
          <div className="h-96 w-full rounded-2xl border border-surface-border bg-nature-white flex items-center justify-center relative overflow-hidden shadow-inner">
            <UrbanLoopMap 
              center={[30.900965, 75.857277]} 
              zoom={12} 
              markers={[
                { id: 'cp1', position: [30.910000, 75.860000], popupContent: 'CP1 (Critical)' },
                { id: 'cp2', position: [30.890000, 75.850000], popupContent: 'CP2 (Normal)' }
              ]}
              clusters={true}
              heatmap={activeMapLayer === 'overflow' ? [[30.910000, 75.860000, 1], [30.915000, 75.865000, 0.8]] : undefined}
            />

            <div className="absolute bottom-4 left-4 bg-nature-white/90 backdrop-blur-md border border-surface-border p-3 rounded-xl text-[10px] text-slate-600 space-y-1 shadow-md">
              <div className="font-extrabold text-slate-800 uppercase">Active GIS Map View</div>
              <div>Filter Scope: {selectedWard ? 'Ward View' : selectedCity ? 'City View' : 'Regional Overview'}</div>
              <div>Heatmap Overlay: <span className="uppercase text-nature-earth font-bold">{activeMapLayer}</span></div>
            </div>
          </div>
        </div>

        {/* RIGHT PANEL: Live Timeline feed, Fleet logs, Queue */}
        <div className="lg:col-span-1 space-y-6 text-xs">
          
          {/* Dispatch Urgency Queue */}
          <div className="p-5 rounded-2xl border border-slate-900 bg-slate-950/40 space-y-4">
            <h3 className="text-xs font-bold text-slate-350 uppercase tracking-wider">
              🚨 Priority dispatch queue
            </h3>
            <div className="space-y-2 max-h-[180px] overflow-y-auto pr-1">
              {operationalQueue.slice(0, 4).map(item => (
                <div key={item.areaId} className="p-3 rounded-lg bg-slate-950 border border-slate-900 flex justify-between items-center">
                  <div>
                    <span className="font-bold text-slate-200 block">{item.areaName}</span>
                    <span className="text-[9px] text-slate-500">Score: {item.score} · Overflow: {item.overflow}</span>
                  </div>
                  <button onClick={() => handleCommandAction('dispatch-compactor', { areaId: item.areaId })}
                    className="px-2.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded transition text-[9px]">
                    Dispatch
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Live Activity Feed */}
          <div className="p-5 rounded-2xl border border-slate-900 bg-slate-950/40 space-y-4">
            <h3 className="text-xs font-bold text-slate-350 uppercase tracking-wider flex items-center gap-1">
              ⏱️ Real-time operations feed
            </h3>
            <div className="space-y-3 max-h-[220px] overflow-y-auto pr-1 border-l border-slate-850 pl-3">
              {liveActivities.length === 0 ? (
                <p className="text-slate-550 text-center py-4">Waiting for operations...</p>
              ) : (
                liveActivities.map((act, idx) => (
                  <div key={idx} className="relative space-y-0.5">
                    <span className="absolute -left-[17px] top-1.5 h-2 w-2 rounded-full bg-indigo-500 border border-slate-950" />
                    <span className="text-[9px] text-slate-550 block">{act.timeStr}</span>
                    <p className="text-slate-350 leading-relaxed text-[10px]">{act.message}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* BOTTOM SECTION: Area summaries dashboard grid */}
      <div className="space-y-6">
        <h2 className="text-sm font-black text-slate-350 uppercase tracking-wider border-b border-slate-900 pb-3">Ward Summary Overview Cards</h2>
        {isLoading ? (
          <div className="h-40 flex items-center justify-center">
            <span className="h-6 w-6 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin"></span>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
            {areaSummaries.map((area) => {
              const borderStyles = {
                Red: 'border-red-500/30 bg-red-950/5 hover:border-red-500/50',
                Orange: 'border-orange-500/30 bg-orange-950/5 hover:border-orange-500/50',
                Yellow: 'border-yellow-500/30 bg-yellow-950/5 hover:border-yellow-500/50',
                Green: 'border-emerald-500/30 bg-emerald-950/5 hover:border-emerald-500/50',
              };
              const badgeStyles = {
                Red: 'bg-red-500/10 text-red-400 border-red-500/20',
                Orange: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
                Yellow: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
                Green: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
              };

              return (
                <div key={area.id} onClick={() => handleOpenDrilldown(area.id)}
                  className={`p-5 rounded-2xl border transition cursor-pointer space-y-4 hover:shadow-lg hover:shadow-slate-950/50 ${borderStyles[area.status]}`}>
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="text-sm font-bold text-slate-200">{area.name}</h3>
                      <span className="text-[9px] text-slate-500 uppercase font-semibold">Ward {area.wardNumber}</span>
                    </div>
                    <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase border ${badgeStyles[area.status]}`}>
                      {area.statusText}
                    </span>
                  </div>

                  <div className="space-y-1.5 text-xs text-slate-400">
                    <div className="flex justify-between border-b border-slate-900/50 pb-1">
                      <span>Smart Bins</span>
                      <span className="font-semibold text-slate-200">{area.totalBins}</span>
                    </div>
                    <div className="flex justify-between border-b border-slate-900/50 pb-1">
                      <span>Overflow Bins</span>
                      <span className={`font-semibold ${area.overflowBins > 0 ? 'text-rose-400' : 'text-slate-200'}`}>{area.overflowBins}</span>
                    </div>
                    <div className="flex justify-between border-b border-slate-900/50 pb-1">
                      <span>Efficiency Index</span>
                      <span className="font-semibold text-emerald-400">{area.collectionEfficiency}%</span>
                    </div>
                    <div className="flex justify-between border-b border-slate-900/50 pb-1">
                      <span>Health Index</span>
                      <span className="font-semibold text-slate-200">{area.healthScore}/100</span>
                    </div>
                  </div>

                  <div className="pt-2 flex justify-between items-center text-[9px] text-slate-550 border-t border-slate-900">
                    <span>Teams: {area.activeTeamsCount}</span>
                    <span>Volume: {area.estWasteVolume} L</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Resource Allocation Dashboard Panel */}
      <div className="p-5 rounded-2xl border border-slate-900 bg-slate-950/40 space-y-4 text-xs">
        <h3 className="text-xs font-bold text-slate-350 uppercase tracking-wider">
          ⚖️ Resource Allocation Balance Sheet
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {resourceAllocations.map(res => (
            <div key={res.areaId} className="p-4 rounded-xl border border-slate-900 bg-slate-950/80 space-y-2">
              <span className="font-bold text-slate-250 block">{res.areaName}</span>
              <div className="grid grid-cols-2 gap-2 text-[10px] text-slate-400">
                <div className="p-2 rounded bg-slate-900/50 text-center">
                  <span className="text-slate-500 block uppercase font-semibold">Available</span>
                  <span className="font-bold text-slate-200">{res.available.vehicles} Vehicles / {res.available.workers} Workers</span>
                </div>
                <div className="p-2 rounded bg-slate-900/50 text-center">
                  <span className="text-slate-500 block uppercase font-semibold">Required</span>
                  <span className="font-bold text-rose-450">{res.required.vehicles} Vehicles / {res.required.workers} Workers</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Drill-Down Operational View Modal */}
      {drilldownData && (
        <div className="fixed inset-0 z-45 flex justify-end bg-black/85 backdrop-blur-sm" onClick={() => setDrilldownData(null)}>
          <div className="w-full max-w-5xl h-full bg-slate-950 border-l border-slate-850 p-6 overflow-y-auto space-y-8 relative shadow-2xl" onClick={e => e.stopPropagation()}>
            
            <button onClick={() => setDrilldownData(null)}
              className="absolute top-6 right-6 h-8 w-8 rounded-lg border border-slate-800 hover:border-slate-700 bg-slate-900 flex items-center justify-center text-slate-400 text-sm font-bold transition">
              ✕
            </button>

            <div>
              <div className="text-[10px] text-slate-500 uppercase font-black tracking-wider">
                {drilldownData.stateName} · {drilldownData.cityName} · Ward {drilldownData.wardNumber}
              </div>
              <h2 className="text-xl font-black text-slate-100 mt-1">Area: {drilldownData.areaName} Operations Center</h2>
              <p className="text-xs text-slate-400 mt-0.5">Showing live diagnostics, telemetry list, and analytics overrides for this ward segment.</p>
            </div>

            {/* Smart Analytics row */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center text-xs">
              {[
                { label: 'Total Waste Weight', value: `${drilldownData.analytics.totalWaste.toFixed(0)} kg`, color: 'text-indigo-400' },
                { label: 'Average Fill Level', value: `${drilldownData.analytics.avgFill.toFixed(0)}%`, color: 'text-emerald-400' },
                { label: 'Overflow Rate', value: `${drilldownData.analytics.overflowPct.toFixed(1)}%`, color: drilldownData.analytics.overflowPct > 5 ? 'text-rose-400' : 'text-slate-350' },
                { label: 'Active Complaints', value: drilldownData.analytics.complaintCount, color: 'text-amber-400' },
              ].map(stat => (
                <div key={stat.label} className="p-4 rounded-xl border border-slate-900 bg-slate-950/80">
                  <div className={`text-2xl font-black ${stat.color}`}>{stat.value}</div>
                  <div className="text-[10px] text-slate-500 uppercase font-semibold mt-1">{stat.label}</div>
                </div>
              ))}
            </div>

            {/* SVG Dynamic Analytics Charts */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs">
              <div className="p-5 rounded-2xl border border-slate-900 bg-slate-900/10 space-y-4">
                <h3 className="text-xs font-bold text-slate-350">Waste Category Distribution</h3>
                <div className="flex items-center gap-6">
                  <svg className="w-24 h-24 transform -rotate-90">
                    <circle cx="48" cy="48" r="36" fill="transparent" stroke="#0e1329" strokeWidth="18" />
                    <circle cx="48" cy="48" r="36" fill="transparent" stroke="#10b981" strokeWidth="18" strokeDasharray="226" strokeDashoffset={226 - (226 * (drilldownData.wasteTypeCounts.DRY || 0)) / (drilldownData.totalBins || 1)} />
                  </svg>
                  <div className="space-y-1.5 flex-1">
                    <div className="flex justify-between items-center text-[11px]">
                      <span className="flex items-center gap-1.5 text-emerald-400"><span className="h-2 w-2 rounded-full bg-emerald-500" /> DRY (Recyclables)</span>
                      <span className="font-semibold">{drilldownData.wasteTypeCounts.DRY || 0} bins</span>
                    </div>
                    <div className="flex justify-between items-center text-[11px]">
                      <span className="flex items-center gap-1.5 text-indigo-400"><span className="h-2 w-2 rounded-full bg-indigo-500" /> WET (Organic)</span>
                      <span className="font-semibold">{drilldownData.wasteTypeCounts.WET || 0} bins</span>
                    </div>
                    <div className="flex justify-between items-center text-[11px]">
                      <span className="flex items-center gap-1.5 text-amber-400"><span className="h-2 w-2 rounded-full bg-amber-500" /> E-WASTE (Hazardous)</span>
                      <span className="font-semibold">{drilldownData.wasteTypeCounts.E_WASTE || 0} bins</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-5 rounded-2xl border border-slate-900 bg-slate-900/10 space-y-3">
                <h3 className="text-xs font-bold text-slate-350">Operational KPIs</h3>
                <div className="space-y-2 text-[11px] text-slate-400">
                  <div className="flex justify-between items-center">
                    <span>IoT Telemetry Uptime</span>
                    <span className="font-bold text-emerald-400">{drilldownData.analytics.deviceUptime}%</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span>Avg Collection Stop Time</span>
                    <span className="font-bold text-slate-200">{drilldownData.analytics.avgCollectionTime} mins</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span>Worker Productivity Rate</span>
                    <span className="font-bold text-slate-200">{drilldownData.analytics.workerProductivity}%</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span>Collection Vehicle Utilization</span>
                    <span className="font-bold text-slate-200">{drilldownData.analytics.vehicleUtilization}%</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Individual Bins Explorer under Area */}
            <div className="space-y-4">
              <h3 className="text-sm font-black text-slate-350">Individual Bins inside {drilldownData.areaName}</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                {drilldownData.individualBins.map(bin => (
                  <div key={bin.id} onClick={() => handleOpenBinDetails(bin.id)}
                    className="p-4 rounded-xl border border-slate-900 bg-slate-950 hover:border-slate-800 transition cursor-pointer flex justify-between items-center">
                    <div className="space-y-1">
                      <span className="font-mono font-bold text-slate-200 text-xs block">{bin.qrCodeId}</span>
                      <span className="text-[10px] text-slate-500">Type: {bin.type} · Temp: {bin.temperature}°C</span>
                    </div>
                    <div className="text-right space-y-1">
                      <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase ${
                        bin.currentFillLevel >= 90 ? 'bg-rose-500/10 text-rose-400 border border-rose-500/25' :
                        bin.currentFillLevel >= 70 ? 'bg-amber-500/10 text-amber-400 border border-amber-500/25' :
                        'bg-emerald-500/10 text-emerald-400 border border-emerald-500/25'
                      }`}>{bin.currentFillLevel}% Fill</span>
                      <span className="block text-[10px] text-slate-500">Bat: {bin.batteryLevel}%</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Individual Bin Profile details */}
            {selectedBinDetails && (
              <div className="p-6 rounded-2xl border border-slate-800 bg-slate-950 space-y-4 text-xs animate-fade-in">
                <div className="flex justify-between items-start border-b border-slate-900 pb-3">
                  <div>
                    <span className="font-mono text-sm font-bold text-emerald-400">{selectedBinDetails.qrCodeId}</span>
                    <p className="text-[10px] text-slate-500">QR Registry Profile</p>
                  </div>
                  <button onClick={() => setSelectedBinDetails(null)} className="text-slate-550 hover:text-slate-300">✕ Dismiss</button>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-[11px] text-slate-400">
                  <div>
                    <span className="block text-slate-500">Assigned Street</span>
                    <span className="font-semibold text-slate-200">{selectedBinDetails.collectionPoint?.name || 'Main Street'}</span>
                  </div>
                  <div>
                    <span className="block text-slate-500">Property Address</span>
                    <span className="font-semibold text-slate-200">{selectedBinDetails.collectionPoint?.property?.address || 'Municipal Lot'}</span>
                  </div>
                  <div>
                    <span className="block text-slate-500">Battery Level</span>
                    <span className="font-semibold text-slate-200">85%</span>
                  </div>
                  <div>
                    <span className="block text-slate-500">Signal Strength</span>
                    <span className="font-semibold text-slate-200">-65 dBm</span>
                  </div>
                </div>

                {/* Telemetries History list */}
                <div className="space-y-2">
                  <h4 className="font-bold text-slate-350 text-xs">Recent Telemetry Events</h4>
                  <div className="space-y-1.5 max-h-[150px] overflow-y-auto pr-1">
                    {selectedBinDetails.telemetries?.length === 0 ? (
                      <p className="text-slate-550">No telemetry frames recorded.</p>
                    ) : (
                      selectedBinDetails.telemetries?.map((t: any, idx: number) => (
                        <div key={idx} className="p-2 rounded bg-slate-900/50 flex justify-between text-[10px] text-slate-400 border border-slate-900">
                          <span>{new Date(t.recordedAt).toLocaleString()}</span>
                          <span>Fill: {t.fillLevel}% · Temp: {t.temperature}°C</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
