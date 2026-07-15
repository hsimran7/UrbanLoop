'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { apiRequest } from '../../../../utils/api';

// ─── Types ───────────────────────────────────────────────────────────────────

interface BinAlert {
  id: string;
  type: string;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  status: 'ACTIVE' | 'RESOLVED';
  triggeredAt: string;
  resolvedAt: string | null;
  latestValue: number | null;
}

interface IoTDevice {
  id: string;
  deviceIdentifier: string;
  status: 'ACTIVE' | 'DISABLED' | 'REVOKED';
  lastSeenAt: string | null;
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
  device: IoTDevice | null;
  alerts: BinAlert[];
}

interface CollectionPoint {
  id: string;
  name: string;
  property: { address: string } | null;
  area: { name: string };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(ts: string | null): string {
  if (!ts) return '—';
  const d = new Date(ts);
  const diffMs = Date.now() - d.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return d.toLocaleDateString();
}

function FillBar({ level, type }: { level: number; type: string }) {
  const clamp = Math.max(0, Math.min(100, level));
  const color =
    clamp >= 95 ? 'bg-gradient-to-r from-rose-600 to-rose-400' :
    clamp >= 80 ? 'bg-gradient-to-r from-amber-500 to-yellow-400' :
    'bg-gradient-to-r from-emerald-500 to-teal-400';
  return (
    <div className="w-full">
      <div className="flex justify-between items-center mb-1">
        <span className="text-[10px] text-slate-500 font-semibold">{type}</span>
        <span className={`text-[10px] font-black ${clamp >= 95 ? 'text-rose-400' : clamp >= 80 ? 'text-amber-400' : 'text-emerald-400'}`}>
          {clamp}%
        </span>
      </div>
      <div className="h-1.5 w-full bg-slate-900 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-500 ${color}`} style={{ width: `${clamp}%` }} />
      </div>
    </div>
  );
}

function DeviceStatusBadge({ status }: { status: string | undefined }) {
  if (!status) return <span className="text-slate-600 text-xs">None</span>;
  const config: Record<string, string> = {
    ACTIVE: 'bg-emerald-950/50 text-emerald-300 border-emerald-500/30',
    DISABLED: 'bg-amber-950/50 text-amber-300 border-amber-500/30',
    REVOKED: 'bg-rose-950/50 text-rose-300 border-rose-500/30',
  };
  return (
    <span className={`px-2 py-0.5 text-[10px] font-bold border rounded-full ${config[status] || 'border-slate-700 text-slate-400'}`}>
      {status}
    </span>
  );
}

function TelemetryBadge({ status }: { status: string }) {
  const config: Record<string, { dot: string; text: string }> = {
    ONLINE: { dot: 'bg-emerald-400 animate-pulse', text: 'text-emerald-300' },
    STALE: { dot: 'bg-amber-400', text: 'text-amber-300' },
    OFFLINE: { dot: 'bg-rose-400', text: 'text-rose-300' },
    NEVER_CONNECTED: { dot: 'bg-slate-600', text: 'text-slate-500' },
  };
  const c = config[status] || config.NEVER_CONNECTED;
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-bold ${c.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
      {status.replace('_', ' ')}
    </span>
  );
}

// ─── Provision Modal ──────────────────────────────────────────────────────────

function ProvisionModal({
  bin,
  onClose,
  onProvisioned,
}: {
  bin: Bin;
  onClose: () => void;
  onProvisioned: () => void;
}) {
  const [deviceId, setDeviceId] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ deviceKey: string; deviceId: string } | null>(null);
  const [error, setError] = useState('');

  const handleProvision = async () => {
    if (!deviceId.trim()) { setError('Device identifier is required.'); return; }
    setLoading(true);
    setError('');
    try {
      const res = await apiRequest('/iot/devices', {
        method: 'POST',
        body: JSON.stringify({ binId: bin.id, deviceIdentifier: deviceId }),
      });
      const data = await res.json();
      if (res.ok) {
        setResult(data);
        onProvisioned();
      } else {
        setError(data.message || 'Failed to provision device.');
      }
    } catch {
      setError('Network error during provisioning.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-slate-950 border border-slate-800 rounded-2xl p-6 w-full max-w-md relative shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-black text-slate-100 mb-1">Provision IoT Device</h3>
        <p className="text-xs text-slate-400 mb-5">Bin: <span className="text-emerald-400 font-mono">{bin.qrCodeId}</span></p>

        {result ? (
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-emerald-950/30 border border-emerald-500/30 space-y-3">
              <div className="text-emerald-300 font-bold text-sm">✓ Device provisioned successfully</div>
              <div>
                <div className="text-xs text-slate-400 mb-1">Device ID (X-Device-Id header)</div>
                <code className="block bg-slate-900 rounded p-2 text-xs text-slate-200 font-mono break-all">{deviceId}</code>
              </div>
              <div>
                <div className="text-xs text-slate-400 mb-1">🔑 Device Key (X-Device-Key header) — shown <strong className="text-rose-400">ONCE</strong></div>
                <code className="block bg-slate-900 rounded p-2 text-xs text-emerald-300 font-mono break-all">{result.deviceKey}</code>
              </div>
              <div className="text-[11px] text-rose-300/80 font-semibold">⚠ Store this key securely. It will never be displayed again.</div>
            </div>
            <button onClick={onClose} className="w-full py-2.5 rounded-xl font-bold bg-slate-800 hover:bg-slate-700 text-slate-100 text-sm transition">
              Close
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {error && <div className="p-3 rounded-xl bg-rose-950/30 border border-rose-500/30 text-rose-300 text-xs">{error}</div>}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-2">Device Identifier (serial / label)</label>
              <input
                type="text"
                value={deviceId}
                onChange={(e) => setDeviceId(e.target.value)}
                placeholder="e.g. ULOOP-BIN-001-SN"
                className="w-full px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-100 text-sm focus:border-emerald-500 focus:outline-none"
              />
            </div>
            <div className="flex gap-3">
              <button onClick={onClose} className="flex-1 py-2.5 rounded-xl font-bold bg-slate-900 hover:bg-slate-800 text-slate-300 text-sm border border-slate-800 transition">
                Cancel
              </button>
              <button
                onClick={handleProvision}
                disabled={loading}
                className="flex-1 py-2.5 rounded-xl font-bold bg-gradient-to-r from-emerald-500 to-teal-400 text-slate-950 hover:brightness-110 disabled:opacity-50 text-sm transition"
              >
                {loading ? 'Provisioning…' : 'Provision Device'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AdminBinsPage() {
  const [bins, setBins] = useState<Bin[]>([]);
  const [collectionPoints, setCollectionPoints] = useState<CollectionPoint[]>([]);
  const [selectedCpId, setSelectedCpId] = useState('');
  const [selectedType, setSelectedType] = useState('DRY');
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [activeTab, setActiveTab] = useState<'grid' | 'iot'>('grid');
  const [filterStatus, setFilterStatus] = useState('ALL');
  const [provisionTarget, setProvisionTarget] = useState<Bin | null>(null);
  const [deviceActionLoading, setDeviceActionLoading] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setErrorMsg('');
    try {
      const [binRes, propRes] = await Promise.all([
        apiRequest('/bins'),
        apiRequest('/properties'),
      ]);
      if (binRes.ok) setBins(await binRes.json());

      if (propRes.ok) {
        const properties = await propRes.json();
        const cps: CollectionPoint[] = [];
        for (const p of properties) {
          if (p.status === 'VERIFIED' && p.collectionPoints) {
            for (const cp of p.collectionPoints) {
              cps.push({ id: cp.id, name: cp.name, property: { address: p.address }, area: { name: p.area.name } });
            }
          }
        }
        setCollectionPoints(cps);
        if (cps.length > 0 && !selectedCpId) setSelectedCpId(cps[0].id);
      }
    } catch {
      setErrorMsg('Failed to load data.');
    } finally {
      setIsLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    fetchData();
    const iv = setInterval(fetchData, 30_000);
    return () => clearInterval(iv);
  }, [fetchData]);

  const handleRegisterBin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const res = await apiRequest('/bins', {
        method: 'POST',
        body: JSON.stringify({ type: selectedType, collectionPointId: selectedCpId }),
      });
      const data = await res.json();
      if (res.ok) {
        setSuccessMsg(`Bin ${data.qrCodeId} registered successfully.`);
        fetchData();
      } else {
        setErrorMsg(data.message || 'Failed to register bin.');
      }
    } catch {
      setErrorMsg('Network error occurred.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteBin = async (binId: string) => {
    if (!confirm('Permanently decommission this bin and all its data?')) return;
    try {
      const res = await apiRequest(`/bins/${binId}`, { method: 'DELETE' });
      if (res.ok) { setSuccessMsg('Bin decommissioned.'); fetchData(); }
      else { const d = await res.json(); setErrorMsg(d.message || 'Delete failed.'); }
    } catch { setErrorMsg('Network error.'); }
  };

  const handleDeviceAction = async (action: string, deviceId: string) => {
    setDeviceActionLoading(deviceId + action);
    setErrorMsg('');
    setSuccessMsg('');
    try {
      let url = '';
      let method = 'PATCH';
      if (action === 'disable') url = `/iot/devices/${deviceId}/disable`;
      else if (action === 'enable') url = `/iot/devices/${deviceId}/enable`;
      else if (action === 'revoke') { url = `/iot/devices/${deviceId}/revoke`; method = 'DELETE'; }
      else if (action === 'rotate') { url = `/iot/devices/${deviceId}/rotate-key`; }

      const res = await apiRequest(url, { method });
      if (res.ok) {
        if (action === 'rotate') {
          const data = await res.json();
          setSuccessMsg(`New device key: ${data.deviceKey} — Copy and store this key now. It will not be shown again.`);
        } else {
          setSuccessMsg(`Device action "${action}" completed.`);
        }
        fetchData();
      } else {
        const data = await res.json();
        setErrorMsg(data.message || `Action "${action}" failed.`);
      }
    } catch {
      setErrorMsg('Network error during device action.');
    } finally {
      setDeviceActionLoading(null);
    }
  };

  // ─── Statistics ──────────────────────────────────────────────────────────────

  const stats = {
    total: bins.length,
    online: bins.filter((b) => b.telemetryStatus === 'ONLINE').length,
    offline: bins.filter((b) => b.telemetryStatus === 'OFFLINE').length,
    alerts: bins.filter((b) => b.alerts?.some((a) => a.status === 'ACTIVE')).length,
    avgFill: bins.length > 0 ? Math.round(bins.reduce((s, b) => s + b.currentFillLevel, 0) / bins.length) : 0,
    criticalFill: bins.filter((b) => b.currentFillLevel >= 80).length,
  };

  const filteredBins = bins.filter((b) => {
    if (filterStatus === 'ALL') return true;
    if (filterStatus === 'ALERT') return b.alerts?.some((a) => a.status === 'ACTIVE');
    if (filterStatus === 'OFFLINE') return b.telemetryStatus === 'OFFLINE' || b.telemetryStatus === 'STALE';
    if (filterStatus === 'CRITICAL') return b.currentFillLevel >= 80;
    return true;
  });

  const binsWithDevice = bins.filter((b) => b.device);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-900 pb-5">
        <div>
          <h2 className="text-2xl font-black text-slate-100">Smart Bin Command Centre</h2>
          <p className="text-xs text-slate-400 mt-1">Live digital-twin telemetry · IoT device management · auto-refreshes every 30s</p>
        </div>
        <button onClick={fetchData} className="px-4 py-2 text-xs font-bold border border-slate-800 hover:border-emerald-500/50 bg-slate-900 rounded-xl transition-all">
          ↻ Refresh
        </button>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
        {[
          { label: 'Total Bins', value: stats.total, color: 'text-slate-200' },
          { label: 'Online', value: stats.online, color: 'text-emerald-400' },
          { label: 'Offline', value: stats.offline, color: 'text-rose-400' },
          { label: 'Active Alerts', value: stats.alerts, color: stats.alerts > 0 ? 'text-rose-400' : 'text-slate-400' },
          { label: 'Avg Fill', value: `${stats.avgFill}%`, color: stats.avgFill >= 80 ? 'text-amber-400' : 'text-slate-200' },
          { label: 'Fill ≥ 80%', value: stats.criticalFill, color: stats.criticalFill > 0 ? 'text-amber-400' : 'text-slate-400' },
        ].map((s) => (
          <div key={s.label} className="p-4 rounded-2xl border border-slate-900 bg-slate-950/40 text-center">
            <div className={`text-xl font-black ${s.color}`}>{s.value}</div>
            <div className="text-[10px] text-slate-500 font-semibold mt-0.5 uppercase tracking-wide">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Messages */}
      {errorMsg && (
        <div className="p-4 rounded-xl border border-rose-500/30 bg-rose-950/20 text-rose-300 text-sm font-medium break-all">
          {errorMsg}
        </div>
      )}
      {successMsg && (
        <div className="p-4 rounded-xl border border-emerald-500/30 bg-emerald-950/20 text-emerald-300 text-sm font-medium break-all">
          {successMsg}
        </div>
      )}

      {/* Layout: Register + Tabs Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">

        {/* Register Panel */}
        <div className="p-6 rounded-2xl border border-slate-900 bg-slate-950/40 h-fit space-y-4">
          <h3 className="text-base font-bold text-slate-200 border-b border-slate-900 pb-3">Register New Bin</h3>
          <form onSubmit={handleRegisterBin} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-2">Collection Point</label>
              {collectionPoints.length === 0 ? (
                <div className="text-xs text-rose-400">No verified properties with collection points found.</div>
              ) : (
                <select
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-100 text-sm focus:border-emerald-500 focus:outline-none"
                  value={selectedCpId}
                  onChange={(e) => setSelectedCpId(e.target.value)}
                >
                  {collectionPoints.map((cp) => (
                    <option key={cp.id} value={cp.id}>{cp.property?.address} ({cp.area?.name})</option>
                  ))}
                </select>
              )}
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-2">Waste Type</label>
              <select
                className="w-full px-3 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-100 text-sm focus:border-emerald-500 focus:outline-none"
                value={selectedType}
                onChange={(e) => setSelectedType(e.target.value)}
              >
                <option value="DRY">DRY – Recyclable</option>
                <option value="WET">WET – Organic</option>
                <option value="E_WASTE">E-WASTE – Hazardous</option>
                <option value="OTHER">OTHER – General</option>
              </select>
            </div>
            <button
              type="submit"
              disabled={isSubmitting || collectionPoints.length === 0}
              className="w-full py-2.5 rounded-xl font-bold bg-gradient-to-r from-emerald-500 to-teal-400 text-slate-950 hover:brightness-110 disabled:opacity-50 text-sm transition-all flex items-center justify-center"
            >
              {isSubmitting ? <span className="h-4 w-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" /> : 'Register Bin'}
            </button>
          </form>
        </div>

        {/* Right Panel */}
        <div className="lg:col-span-3 space-y-4">

          {/* Tabs */}
          <div className="flex items-center gap-1 bg-slate-950/50 border border-slate-900 rounded-xl p-1 w-fit">
            {(['grid', 'iot'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  activeTab === tab
                    ? 'bg-emerald-500 text-slate-950'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {tab === 'grid' ? '📊 Bins Grid' : '📡 IoT Devices'}
              </button>
            ))}
          </div>

          {/* Bins Grid Tab */}
          {activeTab === 'grid' && (
            <div className="p-5 rounded-2xl border border-slate-900 bg-slate-950/40">
              {/* Filter Bar */}
              <div className="flex items-center gap-2 mb-4 flex-wrap">
                {['ALL', 'ALERT', 'OFFLINE', 'CRITICAL'].map((f) => (
                  <button
                    key={f}
                    onClick={() => setFilterStatus(f)}
                    className={`px-3 py-1 rounded-lg text-[11px] font-bold border transition-all ${
                      filterStatus === f
                        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50'
                        : 'text-slate-500 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    {f === 'ALL' ? `All (${bins.length})` :
                     f === 'ALERT' ? `⚠ Alerts (${stats.alerts})` :
                     f === 'OFFLINE' ? `📡 Offline/Stale (${stats.offline})` :
                     `🟠 Fill ≥ 80% (${stats.criticalFill})`}
                  </button>
                ))}
              </div>

              {isLoading ? (
                <div className="h-40 flex items-center justify-center">
                  <span className="h-6 w-6 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : filteredBins.length === 0 ? (
                <div className="text-center py-12 text-slate-500 text-sm">No bins match the selected filter.</div>
              ) : (
                <div className="grid grid-cols-1 gap-3">
                  {filteredBins.map((bin) => {
                    const activeAlerts = bin.alerts?.filter((a) => a.status === 'ACTIVE') || [];
                    return (
                      <div
                        key={bin.id}
                        className={`p-4 rounded-xl border flex gap-4 items-start transition-all ${
                          activeAlerts.length > 0
                            ? 'border-rose-500/25 bg-rose-950/10'
                            : bin.telemetryStatus === 'ONLINE'
                            ? 'border-emerald-500/15 bg-emerald-950/5'
                            : 'border-slate-900/60 bg-slate-950/20'
                        }`}
                      >
                        {/* Fill Bar + Info */}
                        <div className="flex-1 min-w-0 space-y-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono font-bold text-emerald-400 text-sm">{bin.qrCodeId}</span>
                            <TelemetryBadge status={bin.telemetryStatus} />
                            {activeAlerts.map((a) => (
                              <span key={a.id} className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${
                                a.severity === 'CRITICAL' ? 'border-rose-500/40 text-rose-300 bg-rose-950/30' : 'border-amber-500/40 text-amber-300 bg-amber-950/30'
                              }`}>
                                {a.type.replace(/_/g, ' ')}
                              </span>
                            ))}
                          </div>
                          <FillBar level={bin.currentFillLevel} type={bin.type} />
                          <div className="flex items-center gap-3 text-[10px] text-slate-500">
                            <span>{bin.collectionPoint?.area?.name}</span>
                            <span>·</span>
                            <span>Signal: {timeAgo(bin.lastTelemetryAt)}</span>
                            {bin.device && <span>· <DeviceStatusBadge status={bin.device.status} /></span>}
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex flex-col gap-1.5">
                          {!bin.device && (
                            <button
                              onClick={() => setProvisionTarget(bin)}
                              className="px-2.5 py-1.5 text-[10px] font-bold rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 transition whitespace-nowrap"
                            >
                              + Device
                            </button>
                          )}
                          <button
                            onClick={() => handleDeleteBin(bin.id)}
                            className="px-2.5 py-1.5 text-[10px] font-bold rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 transition"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* IoT Devices Tab */}
          {activeTab === 'iot' && (
            <div className="p-5 rounded-2xl border border-slate-900 bg-slate-950/40">
              <div className="text-xs text-slate-500 mb-4 font-semibold">
                {binsWithDevice.length} of {bins.length} bins have a provisioned device
              </div>

              {binsWithDevice.length === 0 ? (
                <div className="text-center py-12 text-slate-500 text-sm space-y-2">
                  <div className="text-2xl">📡</div>
                  <div>No IoT devices provisioned yet.</div>
                  <div className="text-xs">Use the Bins Grid to provision devices for individual bins.</div>
                </div>
              ) : (
                <div className="space-y-3">
                  {binsWithDevice.map((bin) => {
                    const dev = bin.device!;
                    const isLoading = deviceActionLoading?.startsWith(dev.id);
                    return (
                      <div key={dev.id} className="p-4 rounded-xl border border-slate-900 bg-slate-950/40 flex flex-col sm:flex-row sm:items-center gap-4">
                        <div className="flex-1 min-w-0 space-y-1.5">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono text-sm font-bold text-slate-200">{dev.deviceIdentifier}</span>
                            <DeviceStatusBadge status={dev.status} />
                          </div>
                          <div className="text-[11px] text-slate-400 space-y-0.5">
                            <div>Bin: <span className="text-emerald-400 font-mono">{bin.qrCodeId}</span> · {bin.collectionPoint?.area?.name}</div>
                            <div>Last Seen: <span className="text-slate-300">{timeAgo(dev.lastSeenAt)}</span></div>
                            <div>Device ID: <span className="text-slate-500 font-mono text-[10px]">{dev.id}</span></div>
                          </div>
                        </div>

                        {/* Device Actions */}
                        <div className="flex gap-2 flex-wrap">
                          {dev.status === 'ACTIVE' && (
                            <button
                              onClick={() => handleDeviceAction('disable', dev.id)}
                              disabled={!!isLoading}
                              className="px-3 py-1.5 text-[11px] font-bold rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/20 transition disabled:opacity-50"
                            >
                              Disable
                            </button>
                          )}
                          {dev.status === 'DISABLED' && (
                            <button
                              onClick={() => handleDeviceAction('enable', dev.id)}
                              disabled={!!isLoading}
                              className="px-3 py-1.5 text-[11px] font-bold rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 transition disabled:opacity-50"
                            >
                              Enable
                            </button>
                          )}
                          {dev.status !== 'REVOKED' && (
                            <>
                              <button
                                onClick={() => handleDeviceAction('rotate', dev.id)}
                                disabled={!!isLoading}
                                className="px-3 py-1.5 text-[11px] font-bold rounded-lg bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 border border-sky-500/20 transition disabled:opacity-50"
                              >
                                Rotate Key
                              </button>
                              <button
                                onClick={() => { if (confirm('Permanently revoke this device? This is irreversible.')) handleDeviceAction('revoke', dev.id); }}
                                disabled={!!isLoading}
                                className="px-3 py-1.5 text-[11px] font-bold rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 transition disabled:opacity-50"
                              >
                                Revoke
                              </button>
                            </>
                          )}
                          {dev.status === 'REVOKED' && (
                            <span className="px-3 py-1.5 text-[11px] font-bold rounded-lg text-slate-600 border border-slate-800">
                              Permanently Revoked
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Provision Modal */}
      {provisionTarget && (
        <ProvisionModal
          bin={provisionTarget}
          onClose={() => setProvisionTarget(null)}
          onProvisioned={fetchData}
        />
      )}
    </div>
  );
}
