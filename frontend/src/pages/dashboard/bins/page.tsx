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

  return (
    <div className="relative flex flex-col items-center">
      {/* Circular gauge */}
      <div className="relative w-28 h-28">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
          {/* Track */}
          <circle cx="50" cy="50" r="42" fill="none" stroke="rgba(148,163,184,0.15)" strokeWidth="10" />
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
              <stop offset="0%" stopColor={clamp >= 95 ? '#e11d48' : clamp >= 80 ? '#d97706' : '#059669'} />
              <stop offset="100%" stopColor={clamp >= 95 ? '#f43f5e' : clamp >= 80 ? '#f59e0b' : '#10b981'} />
            </linearGradient>
          </defs>
        </svg>
        {/* Center label */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-black text-slate-800">{clamp}%</span>
          <span className="text-[9px] text-slate-500 font-extrabold uppercase tracking-widest">FILL</span>
        </div>
      </div>
    </div>
  );
}

function ConnectivityBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; dot: string; bg: string }> = {
    ONLINE: { label: 'Online', dot: 'bg-emerald-500 animate-pulse', bg: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    STALE: { label: 'Stale', dot: 'bg-amber-500', bg: 'bg-amber-50 text-amber-700 border-amber-200' },
    OFFLINE: { label: 'Offline', dot: 'bg-rose-500', bg: 'bg-rose-50 text-rose-700 border-rose-200' },
    NEVER_CONNECTED: { label: 'No Device', dot: 'bg-slate-400', bg: 'bg-slate-50 text-slate-600 border-slate-200' },
  };
  const c = config[status] || config.NEVER_CONNECTED;
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${c.bg}`}>
      <span className={`w-2 h-2 rounded-full ${c.dot}`} />
      {c.label}
    </span>
  );
}

function AlertChip({ alert }: { alert: BinAlert }) {
  const severityColor: Record<string, string> = {
    INFO: 'bg-sky-50 text-sky-700 border-sky-200',
    WARNING: 'bg-amber-50 text-amber-700 border-amber-200',
    CRITICAL: 'bg-rose-50 text-rose-700 border-rose-200',
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
    <span className={`inline-block px-2.5 py-0.5 rounded-md text-[10px] font-extrabold border ${severityColor[alert.severity] || 'border-surface-border text-slate-500'}`}>
      {labels[alert.type] || alert.type}
    </span>
  );
}

function TimeAgo({ ts }: { ts: string | null }) {
  if (!ts) return <span className="text-slate-400 text-xs font-medium">—</span>;
  const d = new Date(ts);
  const diffMs = Date.now() - d.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return <span className="text-xs text-slate-700 font-semibold">just now</span>;
  if (mins < 60) return <span className="text-xs text-slate-600 font-medium">{mins}m ago</span>;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return <span className="text-xs text-slate-600 font-medium">{hrs}h ago</span>;
  return <span className="text-xs text-slate-500 font-medium">{d.toLocaleDateString()}</span>;
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
    DRY: { label: 'Dry / Recyclable', icon: '♻️', accent: 'text-sky-700' },
    WET: { label: 'Wet / Organic', icon: '🌿', accent: 'text-emerald-700' },
    E_WASTE: { label: 'E-Waste / Hazardous', icon: '⚡', accent: 'text-purple-700' },
    OTHER: { label: 'General / Landfill', icon: '🗑', accent: 'text-slate-600' },
  };

  const conditionColors: Record<string, string> = {
    GOOD: 'text-emerald-700 font-bold',
    DAMAGED: 'text-rose-700 font-bold',
    NEEDS_REPLACEMENT: 'text-amber-700 font-bold',
  };

  const activeAlertBins = bins.filter((b) => b.alerts?.some((a) => a.status === 'ACTIVE')).length;
  const onlineBins = bins.filter((b) => b.telemetryStatus === 'ONLINE').length;

  return (
    <div className="space-y-6 pb-20">
      {/* Header */}
      <div className="glass-card p-8 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-800 tracking-tight">My Smart Waste Bins</h1>
          <p className="text-sm text-slate-600 mt-2 font-medium">Live IoT digital-twin feeds · auto-refreshes every 30s</p>
        </div>
        <div className="flex items-center gap-3">
          {bins.length > 0 && (
            <div className="flex items-center gap-3 text-xs font-extrabold">
              <span className="text-emerald-700">{onlineBins} Online</span>
              {activeAlertBins > 0 && (
                <span className="px-2.5 py-1 rounded-lg bg-rose-50 text-rose-700 border border-rose-200">
                  ⚠ {activeAlertBins} Alert{activeAlertBins > 1 ? 's' : ''}
                </span>
              )}
            </div>
          )}
          <button
            onClick={fetchBins}
            className="px-5 py-2.5 text-xs font-bold border border-surface-border hover:bg-nature-lightBg bg-nature-white text-slate-700 rounded-xl transition shadow-sm"
          >
            ↻ Refresh
          </button>
        </div>
      </div>

      {/* Messages */}
      {errorMsg && (
        <div className="p-4 rounded-xl border border-red-200 bg-red-50 text-red-700 text-sm font-medium">
          {errorMsg}
        </div>
      )}
      {successMsg && (
        <div className="p-4 rounded-xl border border-nature-accent bg-emerald-50 text-emerald-700 text-sm font-medium">
          {successMsg}
        </div>
      )}

      {isLoading ? (
        <div className="glass-card h-60 flex flex-col items-center justify-center gap-3 text-slate-500">
          <span className="h-8 w-8 border-2 border-nature-accent border-t-transparent rounded-full animate-spin" />
          <span className="text-xs font-medium">Loading digital twin state...</span>
        </div>
      ) : bins.length === 0 ? (
        <div className="glass-card text-center py-20 text-slate-500 space-y-2">
          <div className="text-4xl mb-2">📭</div>
          <div className="font-bold text-slate-800 text-base">No bins assigned yet</div>
          <div className="text-xs font-medium max-w-xs mx-auto text-slate-500">Wait for your property registration to be verified by a government official, then bins will be automatically linked to your account.</div>
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
                className="glass-card !p-0 relative overflow-hidden transition-all duration-300 hover:shadow-md flex flex-col justify-between"
              >
                {/* Ambient glow */}
                <div
                  className={`absolute top-0 right-0 h-40 w-40 blur-3xl pointer-events-none opacity-30 ${
                    activeAlerts.length > 0 ? 'bg-rose-400' : 'bg-emerald-400'
                  }`}
                  style={{ transform: 'translate(50%, -50%)' }}
                />

                {/* Card Header */}
                <div className="p-5 flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xl">{typeConf.icon}</span>
                      <span className={`text-xs font-extrabold uppercase tracking-widest ${typeConf.accent}`}>
                        {typeConf.label}
                      </span>
                    </div>
                    <div className="font-mono font-extrabold text-slate-800 text-sm">{bin.qrCodeId}</div>
                  </div>
                  <ConnectivityBadge status={bin.telemetryStatus} />
                </div>

                {/* Gauge + Info Row */}
                <div className="px-5 flex items-center gap-6 pb-4">
                  <FillGauge level={bin.currentFillLevel} status={bin.status} />
                  <div className="flex-1 space-y-2 text-xs">
                    <div className="flex justify-between">
                      <span className="text-slate-500 font-semibold">Location</span>
                      <span className="text-slate-800 font-bold text-right truncate max-w-[140px]">
                        {bin.collectionPoint?.area?.name}
                        {bin.collectionPoint?.property?.address ? ` · ${bin.collectionPoint.property.address}` : ''}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500 font-semibold">Condition</span>
                      <span className={`font-bold ${conditionColors[bin.condition]}`}>{bin.condition}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500 font-semibold">Last Signal</span>
                      <TimeAgo ts={bin.lastTelemetryAt} />
                    </div>
                    {bin.lastEmptiedAt && (
                      <div className="flex justify-between">
                        <span className="text-slate-500 font-semibold">Last Emptied</span>
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
                <div className="border-t border-surface-border bg-nature-lightBg/40 px-5 py-3 flex items-center justify-between mt-auto">
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleReport(bin.id, { condition: 'DAMAGED' })}
                      disabled={bin.condition === 'DAMAGED'}
                      className="px-3 py-1.5 rounded-xl text-xs font-bold bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 transition disabled:opacity-40"
                    >
                      Report Damage
                    </button>
                    <button
                      onClick={() => handleReport(bin.id, { status: 'FULL' })}
                      disabled={bin.status === 'FULL' || bin.status === 'OVERFLOWING'}
                      className="px-3 py-1.5 rounded-xl text-xs font-bold bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 transition disabled:opacity-40"
                    >
                      Report Full
                    </button>
                  </div>
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : bin.id)}
                    className="text-xs text-slate-600 hover:text-slate-900 transition font-bold"
                  >
                    {isExpanded ? 'Less ↑' : 'History ↓'}
                  </button>
                </div>

                {/* Expanded Alert History */}
                {isExpanded && (
                  <div className="border-t border-surface-border px-5 py-4 space-y-2 bg-nature-lightBg/20">
                    <div className="text-xs font-extrabold text-slate-500 uppercase tracking-widest mb-2">All Alerts</div>
                    {(bin.alerts || []).length === 0 ? (
                      <div className="text-xs text-slate-500 font-medium">No alert history for this bin.</div>
                    ) : (
                      (bin.alerts || [])
                        .slice()
                        .sort((a, b) => new Date(b.triggeredAt).getTime() - new Date(a.triggeredAt).getTime())
                        .slice(0, 8)
                        .map((alert) => (
                          <div
                            key={alert.id}
                            className={`flex justify-between items-center text-xs py-1.5 border-b border-surface-border ${
                              alert.status === 'ACTIVE' ? 'text-slate-800 font-bold' : 'text-slate-500'
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <AlertChip alert={alert} />
                              <span className="font-semibold">{alert.status === 'RESOLVED' ? '✓ Resolved' : '● Active'}</span>
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

