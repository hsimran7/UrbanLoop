'use client';

import React, { useState, useEffect } from 'react';
import { apiRequest } from '../../../../utils/api';
import { getSocket } from '../../../../utils/socket';

interface AIModel {
  name: string;
  version: string;
  status: string;
  accuracy: number;
}

interface AIRecommendation {
  id: string;
  title: string;
  description: string;
  actionType: string;
  targetId: string;
  status: string;
  factors: string[];
}

interface ForecastPoint {
  date: string;
  actual: number | null;
  predicted: number;
  confMin: number;
  confMax: number;
}

interface RiskItem {
  id: string;
  type: string;
  score: number;
  target: string;
  severity: string;
}

interface Message {
  sender: 'user' | 'ai';
  text: string;
}

interface ExecutiveReport {
  todayTons: number;
  collectionsCompleted: number;
  pendingCollections: number;
  overflowBins: number;
  offlineSmartBins: number;
  openComplaints: number;
  vehiclesActive: number;
  workersActive: number;
  successRate: number;
  mostEfficientArea: string;
  worstPerformingArea: string;
  recommendation: string;
}

interface WorkerPerformanceItem {
  id: string;
  name: string;
  completed: number;
  missed: number;
  late: number;
  complaints: number;
  avgTimeHours: number;
  score: number;
}

interface BinAnalysis {
  avgFillLevel: number;
  overflowProbability: number;
  offlineBins: number;
  nearFullBins: number;
  emptyBins: number;
}

interface GraphData {
  dailyWasteCollected: { day: string; val: number }[];
  complaintTrend: { day: string; count: number }[];
  wasteTypeDistribution: { type: string; count: number }[];
}

export default function AIIntelligenceCenter() {
  const [models, setModels] = useState<AIModel[]>([]);
  const [recommendations, setRecommendations] = useState<AIRecommendation[]>([]);
  const [forecasts, setForecasts] = useState<ForecastPoint[]>([]);
  const [risks, setRisks] = useState<RiskItem[]>([]);

  // DB-backed states
  const [report, setReport] = useState<ExecutiveReport | null>(null);
  const [workerPerf, setWorkerPerf] = useState<{ topPerforming: WorkerPerformanceItem[]; requiresAttention: WorkerPerformanceItem[] } | null>(null);
  const [binAnalysis, setBinAnalysis] = useState<BinAnalysis | null>(null);
  const [graphs, setGraphs] = useState<GraphData | null>(null);

  // Copilot dialogue states
  const [messages, setMessages] = useState<Message[]>([
    { sender: 'ai', text: 'Hello! I am your AI Copilot. You can ask me questions about fleet count, breakdowns, or service requests. How can I assist you today?' },
  ]);
  const [chatPrompt, setChatPrompt] = useState('');

  // VRP Optimization states
  const [selectedRoute, setSelectedRoute] = useState('route-1');
  const [optimizationResult, setOptimizationResult] = useState<any>(null);

  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  useEffect(() => {
    fetchAIData();

    const socket = getSocket('realtime');
    
    socket.on('connect', () => {
      console.log('AI page connected to realtime WS stream.');
    });

    socket.on('complaintSubmitted', () => {
      fetchAIData();
    });

    socket.on('propertyApproved', () => {
      fetchAIData();
    });

    socket.on('taskCompleted', () => {
      fetchAIData();
    });

    socket.on('binOverflow', () => {
      fetchAIData();
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  async function fetchAIData() {
    try {
      const [mRes, recRes, fRes, rRes, repRes, perfRes, binRes, graphRes] = await Promise.all([
        apiRequest('/ai/models'),
        apiRequest('/ai/recommendations'),
        apiRequest('/ai/forecast'),
        apiRequest('/ai/risks'),
        apiRequest('/ai/executive-report'),
        apiRequest('/ai/worker-performance'),
        apiRequest('/ai/bin-analysis'),
        apiRequest('/ai/graphs'),
      ]);

      if (mRes.ok) setModels(await mRes.json());
      if (recRes.ok) setRecommendations(await recRes.json());
      if (fRes.ok) {
        const fData = await fRes.json();
        setForecasts(fData.forecasts);
      }
      if (rRes.ok) setRisks(await rRes.json());
      if (repRes.ok) setReport(await repRes.json());
      if (perfRes.ok) setWorkerPerf(await perfRes.json());
      if (binRes.ok) setBinAnalysis(await binRes.json());
      if (graphRes.ok) setGraphs(await graphRes.json());
    } catch {
      setErrorMsg('Failed to load decision intelligence context.');
    } finally {
      setLoading(false);
    }
  }

  // Submit Copilot chatbot query
  async function handleSendPrompt(e: React.FormEvent) {
    e.preventDefault();
    if (!chatPrompt.trim()) return;

    const userText = chatPrompt;
    setMessages((prev) => [...prev, { sender: 'user', text: userText }]);
    setChatPrompt('');

    try {
      const res = await apiRequest('/ai/copilot', {
        method: 'POST',
        body: JSON.stringify({ prompt: userText }),
      });

      if (res.ok) {
        const data = await res.json();
        setMessages((prev) => [...prev, { sender: 'ai', text: data.reply }]);
      } else {
        setMessages((prev) => [...prev, { sender: 'ai', text: 'Apologies, I encountered an issue querying the database counts.' }]);
      }
    } catch {
      setMessages((prev) => [...prev, { sender: 'ai', text: 'Network connection failure.' }]);
    }
  }

  // Trigger Google OR-Tools VRP routing simulation
  async function handleOptimizeRoute() {
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const res = await apiRequest('/ai/optimize', {
        method: 'POST',
        body: JSON.stringify({ routeId: selectedRoute }),
      });

      if (res.ok) {
        const data = await res.json();
        setOptimizationResult(data);
        setSuccessMsg('OR-Tools VRP Route stop sequences optimized successfully.');
      } else {
        setErrorMsg('Failed to run route optimizations.');
      }
    } catch {
      setErrorMsg('Network error.');
    }
  }

  // Approve recommendation log
  async function handleApproveRecommendation(id: string) {
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const res = await apiRequest(`/ai/recommendations/${id}/approve`, {
        method: 'POST',
      });

      if (res.ok) {
        setSuccessMsg('Recommendation approved and logged in Decision Logs.');
        setRecommendations((prev) => prev.filter(r => r.id !== id));
      } else {
        setErrorMsg('Failed to execute recommendation.');
      }
    } catch {
      setErrorMsg('Connection error.');
    }
  }

  return (
    <div className="space-y-8 pb-24 text-slate-100">
      {/* Header */}
      <div className="p-6 rounded-2xl border border-slate-800 bg-gradient-to-br from-slate-900/80 to-indigo-950/20 backdrop-blur">
        <div className="text-xs text-indigo-400 font-semibold uppercase tracking-widest mb-1">Decision Support</div>
        <h1 className="text-2xl font-bold text-slate-100 font-display">AI Decision Intelligence Center</h1>
        <p className="text-sm text-slate-400 mt-1">Predict waste overflow risks, optimize routing stop sequences, and query metrics with AI Copilot.</p>
      </div>

      {successMsg && <div className="p-4 rounded-xl border border-emerald-500/30 bg-emerald-950/20 text-emerald-350 text-xs">{successMsg}</div>}
      {errorMsg && <div className="p-4 rounded-xl border border-red-500/30 bg-red-950/20 text-red-300 text-xs">{errorMsg}</div>}

      {/* Model Uptime Monitoring & Risks */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 text-xs">
        {/* Model Monitoring */}
        <div className="p-5 bg-slate-900/20 border border-slate-850 rounded-2xl space-y-3 md:col-span-2">
          <h3 className="text-sm font-bold text-slate-200">Active Machine Learning Models</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {models.map((m) => (
              <div key={m.name} className="p-3 bg-slate-950/40 border border-slate-850 rounded-xl">
                <span className="font-semibold text-slate-200 block truncate">{m.name}</span>
                <span className="text-[10px] text-slate-500 block mt-0.5">{m.version} | {m.status}</span>
                <span className="text-indigo-400 font-bold block mt-2">Accuracy: {(m.accuracy * 100).toFixed(0)}%</span>
              </div>
            ))}
          </div>
        </div>

        {/* Risk Alerts */}
        <div className="p-5 bg-slate-900/20 border border-slate-850 rounded-2xl space-y-3 md:col-span-1">
          <h3 className="text-sm font-bold text-slate-200">AI Risk Assessment</h3>
          <div className="space-y-2">
            {risks.map((rk) => (
              <div key={rk.id} className="flex justify-between items-center p-2.5 bg-slate-950/40 rounded-lg">
                <div>
                  <span className="font-semibold text-slate-200">{rk.type}</span>
                  <span className="block text-[10px] text-slate-500 mt-0.5">{rk.target}</span>
                </div>
                <span className={`px-2 py-0.5 rounded text-[8px] font-bold ${
                  rk.severity === 'HIGH' ? 'bg-red-500/10 text-red-400' : 'bg-orange-500/10 text-orange-400'
                }`}>{rk.score}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Municipal Daily Executive Report */}
      {report && (
        <div className="p-6 bg-slate-900/20 border border-slate-850 rounded-2xl space-y-4 text-xs">
          <div className="border-b border-slate-850 pb-3">
            <h3 className="text-sm font-bold text-slate-200">Municipal Daily Operations Report</h3>
            <p className="text-[10px] text-slate-500 mt-0.5">Aggregated real-time metrics computed directly from active database instances.</p>
          </div>
          
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-4 text-center">
            <div className="p-3 bg-slate-950/40 border border-slate-900 rounded-xl">
              <span className="text-slate-500 block text-[9px] uppercase font-semibold">Today's Collections</span>
              <span className="text-lg font-bold text-emerald-400">{report.todayTons} Tons</span>
            </div>
            <div className="p-3 bg-slate-950/40 border border-slate-900 rounded-xl">
              <span className="text-slate-500 block text-[9px] uppercase font-semibold">Completed Bins</span>
              <span className="text-lg font-bold text-slate-200">{report.collectionsCompleted}</span>
            </div>
            <div className="p-3 bg-slate-950/40 border border-slate-900 rounded-xl">
              <span className="text-slate-500 block text-[9px] uppercase font-semibold">Pending Bins</span>
              <span className="text-lg font-bold text-orange-400">{report.pendingCollections}</span>
            </div>
            <div className="p-3 bg-slate-950/40 border border-slate-900 rounded-xl">
              <span className="text-slate-500 block text-[9px] uppercase font-semibold">Overflowing Bins</span>
              <span className="text-lg font-bold text-rose-500">{report.overflowBins}</span>
            </div>
            <div className="p-3 bg-slate-950/40 border border-slate-900 rounded-xl">
              <span className="text-slate-500 block text-[9px] uppercase font-semibold">Open Complaints</span>
              <span className="text-lg font-bold text-cyan-400">{report.openComplaints}</span>
            </div>
            <div className="p-3 bg-slate-950/40 border border-slate-900 rounded-xl">
              <span className="text-slate-500 block text-[9px] uppercase font-semibold">Success Rate</span>
              <span className="text-lg font-bold text-emerald-450">{report.successRate}%</span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
            <div className="p-4 bg-indigo-950/10 border border-indigo-900/20 rounded-xl">
              <span className="text-slate-500 block text-[10px] uppercase font-semibold mb-1">Efficiency Metrics</span>
              <p className="text-slate-350 leading-relaxed text-[11px]">
                Most Efficient Area: <strong className="text-emerald-400">{report.mostEfficientArea}</strong><br/>
                Worst Performing Area: <strong className="text-rose-450">{report.worstPerformingArea}</strong>
              </p>
            </div>
            <div className="p-4 bg-emerald-950/10 border border-emerald-900/20 rounded-xl">
              <span className="text-slate-500 block text-[10px] uppercase font-semibold mb-1">AI Recommendation Insight</span>
              <p className="text-slate-300 italic text-[11px] leading-relaxed">
                "{report.recommendation}"
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Smart Bin Telemetry Analysis */}
      {binAnalysis && (
        <div className="p-6 bg-slate-900/20 border border-slate-850 rounded-2xl space-y-4 text-xs">
          <h3 className="text-sm font-bold text-slate-200">Smart Bin Fill Telemetry Analysis</h3>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-center">
            <div className="p-3 bg-slate-950/40 border border-slate-900 rounded-xl">
              <span className="text-slate-500 block text-[9px] uppercase font-semibold">Average Fill Level</span>
              <span className="text-lg font-bold text-slate-200">{binAnalysis.avgFillLevel}%</span>
            </div>
            <div className="p-3 bg-slate-950/40 border border-slate-900 rounded-xl">
              <span className="text-slate-500 block text-[9px] uppercase font-semibold">Overflow Probability</span>
              <span className="text-lg font-bold text-rose-400">{binAnalysis.overflowProbability}%</span>
            </div>
            <div className="p-3 bg-slate-950/40 border border-slate-900 rounded-xl">
              <span className="text-slate-500 block text-[9px] uppercase font-semibold">Offline Smart Bins</span>
              <span className="text-lg font-bold text-slate-400">{binAnalysis.offlineBins}</span>
            </div>
            <div className="p-3 bg-slate-950/40 border border-slate-900 rounded-xl">
              <span className="text-slate-500 block text-[9px] uppercase font-semibold">Near-Full Bins</span>
              <span className="text-lg font-bold text-orange-450">{binAnalysis.nearFullBins}</span>
            </div>
            <div className="p-3 bg-slate-950/40 border border-slate-900 rounded-xl">
              <span className="text-slate-500 block text-[9px] uppercase font-semibold">Empty Bins</span>
              <span className="text-lg font-bold text-emerald-450">{binAnalysis.emptyBins}</span>
            </div>
          </div>
        </div>
      )}

      {/* Real Data Trends (Graphs) */}
      {graphs && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 text-xs">
          {/* Daily Waste Collected */}
          <div className="p-5 bg-slate-900/20 border border-slate-850 rounded-2xl space-y-4">
            <h3 className="text-sm font-bold text-slate-200">Daily Waste Collected (Tons)</h3>
            <div className="h-44 flex items-end justify-between px-2 border-b border-slate-800 pb-2">
              {graphs.dailyWasteCollected.map((item, idx) => {
                const height = item.val > 0 ? `${(item.val / 15) * 100}%` : '4%';
                return (
                  <div key={idx} className="flex-1 flex flex-col items-center group relative h-full justify-end">
                    <div className="absolute bottom-full mb-1 text-[8px] bg-slate-950 border border-slate-850 p-1 rounded opacity-0 group-hover:opacity-100 transition">
                      {item.val} Tons
                    </div>
                    <div style={{ height }} className="w-6 bg-gradient-to-t from-indigo-650 to-indigo-400 rounded-t" />
                    <span className="text-[9px] text-slate-500 mt-2">{item.day}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Complaint Trend */}
          <div className="p-5 bg-slate-900/20 border border-slate-850 rounded-2xl space-y-4">
            <h3 className="text-sm font-bold text-slate-200">Complaint Daily Volume Trend</h3>
            <div className="h-44 flex items-end justify-between px-2 border-b border-slate-800 pb-2">
              {graphs.complaintTrend.map((item, idx) => {
                const height = item.count > 0 ? `${(item.count / 10) * 100}%` : '4%';
                return (
                  <div key={idx} className="flex-1 flex flex-col items-center group relative h-full justify-end">
                    <div className="absolute bottom-full mb-1 text-[8px] bg-slate-950 border border-slate-850 p-1 rounded opacity-0 group-hover:opacity-100 transition">
                      {item.count} complaints
                    </div>
                    <div style={{ height }} className="w-6 bg-gradient-to-t from-rose-600 to-rose-450 rounded-t" />
                    <span className="text-[9px] text-slate-500 mt-2">{item.day}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Worker Performance Rankings */}
      {workerPerf && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 text-xs">
          {/* Top Workers */}
          <div className="p-6 bg-slate-900/20 border border-slate-850 rounded-2xl space-y-3">
            <h3 className="text-sm font-bold text-emerald-450 font-display">Top Performing Workers</h3>
            <div className="space-y-2">
              {workerPerf.topPerforming.map((w, i) => (
                <div key={w.id} className="flex justify-between items-center p-3 bg-slate-950/40 rounded-xl border border-slate-900">
                  <div>
                    <span className="font-bold text-slate-200 block">#{i + 1} {w.name}</span>
                    <span className="text-[9px] text-slate-500">Completed: {w.completed} | Avg SLA: {w.avgTimeHours}h</span>
                  </div>
                  <span className="font-extrabold text-emerald-450">{w.score} pts</span>
                </div>
              ))}
            </div>
          </div>

          {/* Workers Requiring Attention */}
          <div className="p-6 bg-slate-900/20 border border-slate-850 rounded-2xl space-y-3">
            <h3 className="text-sm font-bold text-rose-400 font-display">Workers Requiring Attention</h3>
            <div className="space-y-2">
              {workerPerf.requiresAttention.length === 0 ? (
                <p className="text-slate-500 text-center py-6">All active workers operating within safe performance metrics.</p>
              ) : (
                workerPerf.requiresAttention.map((w) => (
                  <div key={w.id} className="flex justify-between items-center p-3 bg-slate-950/40 rounded-xl border border-slate-900">
                    <div>
                      <span className="font-bold text-slate-200 block">{w.name}</span>
                      <span className="text-[9px] text-slate-500">Missed: {w.missed} | Late Collections: {w.late}</span>
                    </div>
                    <span className="font-extrabold text-rose-450">{w.score} pts</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Copilot and explainable recommendations */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 text-xs">
        {/* AI Copilot chat dialogue */}
        <div className="p-6 bg-slate-900/20 border border-slate-850 rounded-2xl flex flex-col h-[400px]">
          <h3 className="text-sm font-bold text-slate-200 mb-3">AI Dialog Copilot</h3>
          <div className="flex-1 overflow-y-auto space-y-3 mb-4 pr-1">
            {messages.map((msg, i) => (
              <div key={i} className={`p-2.5 rounded-xl max-w-[85%] ${
                msg.sender === 'user' ? 'bg-indigo-650 text-slate-100 ml-auto' : 'bg-slate-950/60 text-slate-300'
              }`}>
                {msg.text}
              </div>
            ))}
          </div>
          <form onSubmit={handleSendPrompt} className="flex space-x-2">
            <input
              type="text"
              value={chatPrompt}
              onChange={(e) => setChatPrompt(e.target.value)}
              placeholder="Query vehicle counts, breakdowns, or open complaints..."
              className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-3 text-slate-200 focus:outline-none focus:border-indigo-500"
            />
            <button type="submit" className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg font-bold transition">Send</button>
          </form>
        </div>

        {/* Explainable Decision Recommendations */}
        <div className="p-6 bg-slate-900/20 border border-slate-850 rounded-2xl space-y-4">
          <h3 className="text-sm font-bold text-slate-200">Recommended Decision Actions</h3>
          <div className="space-y-3 overflow-y-auto max-h-[310px] pr-1">
            {recommendations.length === 0 ? (
              <p className="text-slate-500 text-center py-10">No pending operational advisory issues detected.</p>
            ) : (
              recommendations.map((rec) => (
                <div key={rec.id} className="p-4 bg-slate-950/40 border border-slate-850 rounded-xl space-y-3">
                  <div>
                    <h4 className="font-semibold text-slate-200">{rec.title}</h4>
                    <p className="text-[10px] text-slate-400 mt-1">{rec.description}</p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {rec.factors?.map((f, idx) => (
                      <span key={idx} className="px-2 py-0.5 bg-slate-900 text-slate-500 rounded text-[8px]">{f}</span>
                    ))}
                  </div>
                  <div className="flex justify-end pt-2 border-t border-slate-900">
                    <button
                      onClick={() => handleApproveRecommendation(rec.id)}
                      className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 rounded font-bold transition text-[10px]"
                    >
                      Approve Action
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* OR-Tools Route Optimizations & Time series forecasting */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 text-xs">
        {/* Route Optimization sequencing */}
        <div className="p-6 bg-slate-900/20 border border-slate-850 rounded-2xl space-y-4 lg:col-span-1">
          <h3 className="text-sm font-bold text-slate-200">VRP Route Optimization Center</h3>
          <div className="space-y-3">
            <div>
              <label className="text-[10px] text-slate-500 block mb-1">Select Assignment Route</label>
              <select
                value={selectedRoute}
                onChange={(e) => setSelectedRoute(e.target.value)}
                className="w-full bg-slate-950 border border-slate-850 rounded-lg p-2 text-slate-250"
              >
                <option value="route-1">Route East-1 (KA-01)</option>
                <option value="route-2">Route West-3 (KA-02)</option>
              </select>
            </div>
            <button
              onClick={handleOptimizeRoute}
              className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg font-bold transition"
            >
              Optimize Stop Sequence
            </button>
          </div>

          {optimizationResult && (
            <div className="p-3.5 bg-indigo-950/10 border border-indigo-900/30 rounded-xl space-y-2 mt-4">
              <span className="font-semibold text-indigo-300 block">Savings Output</span>
              <p className="text-[10px] text-slate-350">{optimizationResult.reasoning}</p>
              <div className="grid grid-cols-2 gap-2 text-[10px] font-mono mt-2">
                <div className="p-2 bg-slate-950/40 rounded border border-slate-900">
                  <span className="text-slate-500 block">Travel Savings</span>
                  <span className="text-emerald-450 font-bold">-{optimizationResult.savingsKm} km</span>
                </div>
                <div className="p-2 bg-slate-950/40 rounded border border-slate-900">
                  <span className="text-slate-500 block">Time Saved</span>
                  <span className="text-emerald-450 font-bold">-{optimizationResult.savingsMin} mins</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Prophet Forecasting */}
        <div className="p-6 bg-slate-900/20 border border-slate-850 rounded-2xl space-y-4 lg:col-span-2">
          <h3 className="text-sm font-bold text-slate-200">Prophet Waste Tonnage Forecast</h3>
          <div className="h-[220px] flex items-end justify-between border-b border-slate-800 pb-2">
            {forecasts.map((pt, idx) => {
              const maxVal = 20;
              const height = pt.actual ? `${(pt.actual / maxVal) * 100}%` : `${(pt.predicted / maxVal) * 100}%`;
              return (
                <div key={idx} className="flex-1 flex flex-col items-center group relative h-full justify-end">
                  {/* Tooltip */}
                  <div className="absolute bottom-full mb-2 bg-slate-950 border border-slate-800 text-[8px] p-1.5 rounded opacity-0 group-hover:opacity-100 transition whitespace-nowrap z-10 pointer-events-none">
                    <p>Predicted: {pt.predicted} Tons</p>
                    <p>Range: {pt.confMin} - {pt.confMax} Tons</p>
                  </div>

                  <div
                    style={{ height }}
                    className={`w-8 rounded-t transition ${pt.actual ? 'bg-indigo-500/80 hover:bg-indigo-400' : 'bg-purple-500/60 hover:bg-purple-400'}`}
                  />
                  <span className="text-[9px] text-slate-500 mt-2 block font-semibold">{pt.date}</span>
                </div>
              );
            })}
          </div>
          <div className="flex justify-between text-[10px] text-slate-500">
            <span className="flex items-center space-x-1.5">
              <span className="w-2.5 h-2.5 bg-indigo-500 rounded-sm inline-block" />
              <span>Actual waste logged</span>
            </span>
            <span className="flex items-center space-x-1.5">
              <span className="w-2.5 h-2.5 bg-purple-500/60 rounded-sm inline-block" />
              <span>Prophet Prediction</span>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
