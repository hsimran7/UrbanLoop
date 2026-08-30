import React, { useState, useEffect } from 'react';
import { apiRequest } from '../../../../utils/api';
import { getSocket } from '../../../../utils/socket';
import { UrbanLoopMap, MapMarkerProps } from '../../../../components/maps/UrbanLoopMap';

export default function CommandCenterPage() {
  const [kpis, setKpis] = useState<any[]>([]);
  const [risks, setRisks] = useState<any[]>([]);
  const [recommendations, setRecommendations] = useState<any[]>([]);
  
  const [topWards, setTopWards] = useState<any[]>([]);
  const [bottomWards, setBottomWards] = useState<any[]>([]);
  const [reports, setReports] = useState<any[]>([]);
  const [selectedFilter, setSelectedFilter] = useState('All Critical');
  
  const [areaHighlights, setAreaHighlights] = useState<any[]>([]);
  const [gisMarkers, setGisMarkers] = useState<MapMarkerProps[]>([]);
  const [gisCircles, setGisCircles] = useState<any[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    fetchAnalyticsData();

    const socket = getSocket('realtime');
    socket.on('connect', () => console.log('Command Center connected to realtime WS stream.'));
    socket.on('complaintSubmitted', fetchAnalyticsData);
    socket.on('propertyApproved', fetchAnalyticsData);
    socket.on('taskCompleted', fetchAnalyticsData);
    socket.on('binOverflow', fetchAnalyticsData);
    socket.on('workerShiftStarted', fetchAnalyticsData);
    socket.on('areaCompleted', fetchAnalyticsData);
    socket.on('assignmentCreated', fetchAnalyticsData);
    socket.on('assignmentUpdated', fetchAnalyticsData);
    socket.on('assignmentAccepted', fetchAnalyticsData);
    socket.on('assignmentCompleted', fetchAnalyticsData);

    return () => { socket.disconnect(); };
  }, []);

  useEffect(() => {
    loadGISMarkers();
  }, [selectedFilter]);

  useEffect(() => {
    drawAreaHighlights();
  }, [areaHighlights]);

  async function fetchAnalyticsData() {
    try {
      const [dashRes, rankRes, repRes, highlightsRes] = await Promise.all([
        apiRequest('/analytics/dashboard'),
        apiRequest('/analytics/wards'),
        apiRequest('/analytics/reports'),
        apiRequest('/analytics/area-highlights'),
      ]);

      if (dashRes.ok) {
        const dashData = await dashRes.json();
        setKpis([
          { title: 'Fleet Health', value: (dashData.kpis?.fleetHealthScore || 0) + '%', trend: 2.4 },
          { title: 'Vehicle Utilization', value: (dashData.kpis?.vehicleUtilization || 0) + '%', trend: 1.2 },
          { title: 'Citizen Rating', value: (dashData.kpis?.citizenSatisfaction || 0) + '/5', trend: 0.5 },
          { title: 'Issue Resolution', value: (dashData.kpis?.complaintResolutionRate || 0) + '%', trend: -1.1 },
        ]);
        setRisks(dashData.upcomingRisks || []);
        setRecommendations(dashData.aiRecommendations || []);
      }
      if (rankRes.ok) {
        const rankData = await rankRes.json();
        setTopWards(rankData.topPerforming);
        setBottomWards(rankData.bottomPerforming);
      }
      if (repRes.ok) setReports(await repRes.json());
      if (highlightsRes.ok) setAreaHighlights(await highlightsRes.json());

      loadGISMarkers();
    } catch {
      setErrorMsg('Failed to load command analytics streams.');
    } finally {
      setLoading(false);
    }
  }

  async function loadGISMarkers() {
    try {
      const res = await apiRequest(`/analytics/command-center-data?filter=${encodeURIComponent(selectedFilter)}`);
      if (res.ok) {
        const points = await res.json();
        const mappedMarkers: MapMarkerProps[] = points.map((pt: any, idx: number) => {
          let markerColor = '#3b82f6'; 
          if (selectedFilter === 'Overflow Bins') markerColor = '#ef4444';
          if (selectedFilter === 'Pending Complaints') markerColor = '#f97316';
          if (selectedFilter === 'Offline Smart Bins') markerColor = '#6b7280';
          if (selectedFilter === 'Missed Collections') markerColor = '#ef4444';

          return {
            id: `pt-${idx}`,
            position: [pt.lat, pt.lng],
            popupContent: `<div style="color: black; font-size: 11px; font-weight: bold;">${pt.title}</div>`,
            // Customizing circle markers happens via the map component
          };
        });
        setGisMarkers(mappedMarkers);
      }
    } catch (e) {
      console.error('Error loading GIS layer:', e);
    }
  }

  function drawAreaHighlights() {
    if (!areaHighlights || areaHighlights.length === 0) return;
    const mappedCircles = areaHighlights.map((area: any) => {
      let fillColor = '#10b981';
      if (area.color === 'red') fillColor = '#ef4444';
      if (area.color === 'orange') fillColor = '#f97316';
      if (area.color === 'yellow') fillColor = '#eab308';
      return {
        center: [area.center.lat, area.center.lng] as [number, number],
        radius: 800,
        color: fillColor,
        fillColor: fillColor,
        popup: `<div style="color: black; font-weight: bold;">${area.name} Area Focus</div>`
      };
    });
    setGisCircles(mappedCircles);
  }

  return (
    <div className="space-y-6 pb-20">
      <div className="glass-card p-8 flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-800 tracking-tight">Command Center</h1>
          <p className="text-sm text-slate-600 mt-2 font-medium">Live Municipal GIS & Executive Metrics.</p>
        </div>
      </div>

      {loading ? (
        <div className="glass-card h-40 flex items-center justify-center">
          <span className="h-8 w-8 border-2 border-nature-accent border-t-transparent rounded-full animate-spin"></span>
        </div>
      ) : (
        <>
          {errorMsg && <div className="p-4 border border-red-200 bg-red-50 text-red-700 font-bold text-xs rounded-xl">{errorMsg}</div>}

          {/* Quick Metrics */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {kpis.map((kpi: any, idx: number) => (
              <div key={idx} className="glass-card p-5">
                <p className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider">{kpi.title}</p>
                <div className="flex items-baseline space-x-2 mt-2">
                  <span className="text-2xl font-black text-slate-800">{kpi.value}</span>
                  <span className={`text-xs font-extrabold ${kpi.trend > 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                    {kpi.trend > 0 ? '+' : ''}{kpi.trend}%
                  </span>
                </div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            <div className="xl:col-span-2 space-y-4">
              <div className="glass-card p-6 flex flex-col h-[700px]">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-base font-bold text-slate-800">Live GIS Data Visualization</h3>
                  <select 
                    value={selectedFilter}
                    onChange={(e) => setSelectedFilter(e.target.value)}
                    className="input-field max-w-xs !py-1.5"
                  >
                    {['All Critical', 'Overflow Bins', 'Pending Complaints', 'Offline Smart Bins', 'Missed Collections', 'Live Vehicles', 'Active Workforce'].map(f => (
                      <option key={f} value={f}>{f}</option>
                    ))}
                  </select>
                </div>
                <div className="flex-grow w-full rounded-2xl overflow-hidden border border-surface-border shadow-sm">
                  <UrbanLoopMap 
                    center={[30.900965, 75.857277]} 
                    zoom={12} 
                    circleMarkers={gisMarkers.map(m => ({ center: m.position, radius: 8, color: '#3b82f6', popup: <div dangerouslySetInnerHTML={{ __html: String(m.popupContent) }} /> }))}
                    circles={gisCircles}
                    heatmap={selectedFilter === 'Overflow Bins' ? gisMarkers.map(m => [...m.position, 1]) as [number, number, number][] : []}
                  />
                </div>
              </div>
            </div>

            <div className="space-y-6">
              <div className="glass-card p-6">
                <h3 className="text-xs font-extrabold text-slate-500 uppercase tracking-widest mb-4">AI Risk Predictor</h3>
                <div className="space-y-4">
                  {risks.map((risk: any, i: number) => (
                    <div key={i} className="flex items-start space-x-3 p-3 bg-nature-lightBg/50 border border-surface-border rounded-xl">
                      <div className={`p-2 rounded-lg ${risk.level === 'HIGH' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'}`}>
                        {risk.level === 'HIGH' ? '⚠️' : '⚡'}
                      </div>
                      <div>
                        <p className="text-xs font-bold text-slate-800">{risk.issue}</p>
                        <p className="text-[10px] text-slate-500 mt-1 font-medium">{risk.probability}% probability • Impact: {risk.area}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

