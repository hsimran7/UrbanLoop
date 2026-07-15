'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { apiRequest } from '../../../utils/api';

interface BinAlert {
  id: string;
  type: string;
  severity: string;
  status: string;
  triggeredAt: string;
  latestValue: number | null;
}

interface Bin {
  id: string;
  qrCodeId: string;
  type: 'DRY' | 'WET' | 'E_WASTE' | 'OTHER';
  status: 'EMPTY' | 'FULL' | 'OVERFLOWING' | 'UNDER_MAINTENANCE';
  condition: 'GOOD' | 'DAMAGED' | 'NEEDS_REPLACEMENT';
  currentFillLevel: number;
  lastTelemetryAt: string | null;
  telemetryStatus: 'ONLINE' | 'STALE' | 'OFFLINE' | 'NEVER_CONNECTED';
  lastEmptiedAt: string | null;
  collectionPoint: {
    name: string;
    area: { name: string };
    property: { address: string } | null;
  };
  alerts: BinAlert[];
}

// ─── Sub-Components ──────────────────────────────────────────────────────────

function FillGauge({ level, status }: { level: number; status: string }) {
  const clamp = Math.max(0, Math.min(100, level));

  const fillColor =
    status === 'OVERFLOWING' || clamp >= 100
      ? 'from-rose-600 to-rose-400'
      : clamp >= 95
      ? 'from-rose-500 to-orange-400'
      : clamp >= 80
      ? 'from-amber-500 to-yellow-400'
      : 'from-emerald-500 to-teal-400';

  const glowColor =
    clamp >= 95
      ? 'shadow-rose-500/40'
      : clamp >= 80
      ? 'shadow-amber-500/40'
      : 'shadow-emerald-500/20';

  return (
    <div className="relative flex flex-col items-center">
      {/* Circular gauge */}
      <div className="relative w-28 h-28">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
          {/* Track */}
          <circle cx="50" cy="50" r="42" fill="none" stroke="rgba(148,163,184,0.1)" strokeWidth="10" />
          {/* Fill */}
          <circle
            cx="50"
            cy="50"
            r="42"
            fill="none"
            stroke="url(#fillGrad)"
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={`${(clamp / 100) * 263.9} 263.9`}
            className="transition-all duration-700"
          />
          <defs>
            <linearGradient id="fillGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor={clamp >= 95 ? '#f43f5e' : clamp >= 80 ? '#f59e0b' : '#10b981'} />
              <stop offset="100%" stopColor={clamp >= 95 ? '#fb923c' : clamp >= 80 ? '#fbbf24' : '#2dd4bf'} />
            </linearGradient>
          </defs>
        </svg>
        {/* Center label */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-black text-slate-100">{clamp}%</span>
          <span className="text-[9px] text-slate-400 font-semibold uppercase tracking-widest">FILL</span>
        </div>
      </div>
    </div>
  );
}

function ConnectivityBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; dot: string; bg: string }> = {
    ONLINE: { label: 'Online', dot: 'bg-emerald-400 animate-pulse', bg: 'bg-emerald-950/40 text-emerald-300 border-emerald-500/30' },
    STALE: { label: 'Stale', dot: 'bg-amber-400', bg: 'bg-amber-950/40 text-amber-300 border-amber-500/30' },
    OFFLINE: { label: 'Offline', dot: 'bg-rose-400', bg: 'bg-rose-950/40 text-rose-300 border-rose-500/30' },
    NEVER_CONNECTED: { label: 'No Device', dot: 'bg-slate-500', bg: 'bg-slate-900/40 text-slate-400 border-slate-700/30' },
  };
  const c = config[status] || config.NEVER_CONNECTED;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border ${c.bg}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
      {c.label}
    </span>
  );
}

function AlertChip({ alert }: { alert: BinAlert }) {
  const severityColor: Record<string, string> = {
    INFO: 'bg-sky-950/40 text-sky-300 border-sky-500/30',
    WARNING: 'bg-amber-950/40 text-amber-300 border-amber-500/30',
    CRITICAL: 'bg-rose-950/40 text-rose-300 border-rose-500/30',
  };
  const labels: Record<string, string> = {
    BIN_NEAR_FULL: '⚠ Near Full',
    BIN_FULL: '🟠 Full',
    BIN_OVERFLOW_RISK: '🔴 Overflow Risk',
    LOW_BATTERY: '🪫 Low Battery',
    DEVICE_STALE: '📡 Stale',
    DEVICE_OFFLINE: '⚡ Offline',
  };
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold border ${severityColor[alert.severity] || 'border-slate-700 text-slate-400'}`}>
      {labels[alert.type] || alert.type}
    </span>
  );
}

function TimeAgo({ ts }: { ts: string | null }) {
  if (!ts) return <span className="text-slate-500 text-xs">—</span>;
  const d = new Date(ts);
  const diffMs = Date.now() - d.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return <span className="text-xs text-slate-300">just now</span>;
  if (mins < 60) return <span className="text-xs text-slate-400">{mins}m ago</span>;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return <span className="text-xs text-slate-400">{hrs}h ago</span>;
  return <span className="text-xs text-slate-500">{d.toLocaleDateString()}</span>;
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function CitizenBinsPage() {
  const [bins, setBins] = useState<Bin[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchBins = useCallback(async () => {
    setIsLoading(true);
    setErrorMsg('');
    try {
      const res = await apiRequest('/bins');
      if (res.ok) {
        setBins(await res.json());
      } else {
        setErrorMsg('Failed to load bins. Please try again.');
      }
    } catch {
      setErrorMsg('Network error — could not reach backend services.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBins();
    // Auto-refresh every 30s to pick up simulator telemetry
    const interval = setInterval(fetchBins, 30_000);
    return () => clearInterval(interval);
  }, [fetchBins]);

  const handleReport = async (binId: string, updates: Record<string, string>) => {
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const res = await apiRequest(`/bins/${binId}`, {
        method: 'PATCH',
        body: JSON.stringify(updates),
      });
      if (res.ok) {
        setSuccessMsg('Report submitted. Thank you for helping keep UrbanLoop accurate!');
        fetchBins();
      } else {
        const data = await res.json();
        setErrorMsg(data.message || 'Failed to submit report.');
      }
    } catch {
      setErrorMsg('Network error while submitting report.');
    }
  };

  const binTypeConfig: Record<string, { label: string; icon: string; accent: string }> = {
    DRY: { label: 'Dry / Recyclable', icon: '♻️', accent: 'text-sky-400' },
    WET: { label: 'Wet / Organic', icon: '🌿', accent: 'text-emerald-400' },
    E_WASTE: { label: 'E-Waste / Hazardous', icon: '⚡', accent: 'text-purple-400' },
    OTHER: { label: 'General / Landfill', icon: '🗑', accent: 'text-slate-400' },
  };

  const conditionColors: Record<string, string> = {
    GOOD: 'text-emerald-400',
    DAMAGED: 'text-rose-400',
    NEEDS_REPLACEMENT: 'text-amber-400',
  };

  const activeAlertBins = bins.filter((b) => b.alerts?.some((a) => a.status === 'ACTIVE')).length;
  const onlineBins = bins.filter((b) => b.telemetryStatus === 'ONLINE').length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-900 pb-5">
        <div>
          <h2 className="text-2xl font-black text-slate-100">My Smart Waste Bins</h2>
          <p className="text-xs text-slate-400 mt-1">Live IoT digital-twin feeds · auto-refreshes every 30s</p>
        </div>
        <div className="flex items-center gap-3">
          {bins.length > 0 && (
            <div className="flex items-center gap-3 text-xs font-bold">
              <span className="text-emerald-400">{onlineBins} Online</span>
              {activeAlertBins > 0 && (
                <span className="px-2 py-1 rounded-lg bg-rose-950/40 text-rose-300 border border-rose-500/30">
                  ⚠ {activeAlertBins} Alert{activeAlertBins > 1 ? 's' : ''}
                </span>
              )}
            </div>
          )}
          <button
            onClick={fetchBins}
            className="px-4 py-2 text-xs font-bold border border-slate-800 hover:border-emerald-500/50 bg-slate-900 rounded-xl transition-all"
          >
            ↻ Refresh
          </button>
        </div>
      </div>

      {/* Messages */}
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
        <div className="h-60 flex flex-col items-center justify-center gap-3 text-slate-400">
          <span className="h-8 w-8 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
          <span className="text-xs">Loading digital twin state...</span>
        </div>
      ) : bins.length === 0 ? (
        <div className="text-center py-20 rounded-2xl border border-dashed border-slate-800 text-slate-500 space-y-2">
          <div className="text-3xl">📭</div>
          <div className="font-semibold">No bins assigned yet</div>
          <div className="text-xs max-w-xs mx-auto">Wait for your property registration to be verified by a government official, then bins will be automatically linked to your account.</div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {bins.map((bin) => {
            const typeConf = binTypeConfig[bin.type] || binTypeConfig.OTHER;
            const activeAlerts = bin.alerts?.filter((a) => a.status === 'ACTIVE') || [];
            const isExpanded = expandedId === bin.id;

            return (
              <div
                key={bin.id}
                className={`rounded-2xl border bg-slate-950/60 backdrop-blur-sm relative overflow-hidden transition-all duration-300 ${
                  activeAlerts.length > 0
                    ? 'border-rose-500/30 shadow-lg shadow-rose-900/20'
                    : bin.telemetryStatus === 'ONLINE'
                    ? 'border-emerald-500/20'
                    : 'border-slate-800/60'
                }`}
              >
                {/* Ambient glow */}
                <div
                  className={`absolute top-0 right-0 h-40 w-40 blur-3xl pointer-events-none opacity-40 ${
                    activeAlerts.length > 0 ? 'bg-rose-600' : 'bg-emerald-600'
                  }`}
                  style={{ transform: 'translate(50%, -50%)' }}
                />

                {/* Card Header */}
                <div className="p-5 flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xl">{typeConf.icon}</span>
                      <span className={`text-xs font-bold uppercase tracking-widest ${typeConf.accent}`}>
                        {typeConf.label}
                      </span>
                    </div>
                    <div className="font-mono font-bold text-emerald-400 text-sm">{bin.qrCodeId}</div>
                  </div>
                  <ConnectivityBadge status={bin.telemetryStatus} />
                </div>

                {/* Gauge + Info Row */}
                <div className="px-5 flex items-center gap-6 pb-4">
                  <FillGauge level={bin.currentFillLevel} status={bin.status} />
                  <div className="flex-1 space-y-2.5 text-xs">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Location</span>
                      <span className="text-slate-300 text-right truncate max-w-[140px]">
                        {bin.collectionPoint?.area?.name}
                        {bin.collectionPoint?.property?.address ? ` · ${bin.collectionPoint.property.address}` : ''}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Condition</span>
                      <span className={`font-bold ${conditionColors[bin.condition]}`}>{bin.condition}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Last Signal</span>
                      <TimeAgo ts={bin.lastTelemetryAt} />
                    </div>
                    {bin.lastEmptiedAt && (
                      <div className="flex justify-between">
                        <span className="text-slate-500">Last Emptied</span>
                        <TimeAgo ts={bin.lastEmptiedAt} />
                      </div>
                    )}
                  </div>
                </div>

                {/* Active Alerts */}
                {activeAlerts.length > 0 && (
                  <div className="px-5 pb-3 flex flex-wrap gap-1.5">
                    {activeAlerts.map((a) => (
                      <AlertChip key={a.id} alert={a} />
                    ))}
                  </div>
                )}

                {/* Actions */}
                <div className="border-t border-slate-900/60 px-5 py-3 flex items-center justify-between">
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleReport(bin.id, { condition: 'DAMAGED' })}
                      disabled={bin.condition === 'DAMAGED'}
                      className="px-3 py-1.5 rounded-lg text-[11px] font-bold bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 active:scale-95 transition disabled:opacity-40"
                    >
                      Report Damage
                    </button>
                    <button
                      onClick={() => handleReport(bin.id, { status: 'FULL' })}
                      disabled={bin.status === 'FULL' || bin.status === 'OVERFLOWING'}
                      className="px-3 py-1.5 rounded-lg text-[11px] font-bold bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/20 active:scale-95 transition disabled:opacity-40"
                    >
                      Report Full
                    </button>
                  </div>
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : bin.id)}
                    className="text-[11px] text-slate-500 hover:text-slate-300 transition font-semibold"
                  >
                    {isExpanded ? 'Less ↑' : 'History ↓'}
                  </button>
                </div>

                {/* Expanded Alert History */}
                {isExpanded && (
                  <div className="border-t border-slate-900/40 px-5 py-4 space-y-2">
                    <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">All Alerts</div>
                    {(bin.alerts || []).length === 0 ? (
                      <div className="text-xs text-slate-600">No alert history for this bin.</div>
                    ) : (
                      (bin.alerts || [])
                        .slice()
                        .sort((a, b) => new Date(b.triggeredAt).getTime() - new Date(a.triggeredAt).getTime())
                        .slice(0, 8)
                        .map((alert) => (
                          <div
                            key={alert.id}
                            className={`flex justify-between items-center text-xs py-1.5 border-b border-slate-900/30 ${
                              alert.status === 'ACTIVE' ? 'text-slate-200' : 'text-slate-500'
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <AlertChip alert={alert} />
                              <span>{alert.status === 'RESOLVED' ? '✓ Resolved' : '● Active'}</span>
                            </div>
                            <TimeAgo ts={alert.triggeredAt} />
                          </div>
                        ))
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
