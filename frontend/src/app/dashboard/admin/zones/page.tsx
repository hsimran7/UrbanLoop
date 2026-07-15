'use client';

import React, { useState, useEffect } from 'react';
import { apiRequest } from '../../../../utils/api';

interface Area {
  id: string;
  name: string;
  ward: { number: number; city: { name: string } };
}

interface CollectionPoint {
  id: string;
  address: string;
  status: string;
  area?: { name: string };
}

interface ServiceZone {
  id: string;
  name: string;
  areaId: string;
  description: string | null;
  isActive: boolean;
  area?: { name: string; ward?: { number: number; city?: { name: string } } };
  _count?: { collectionPoints: number };
}

export default function ZonesManagementPage() {
  const [zones, setZones] = useState<ServiceZone[]>([]);
  const [areas, setAreas] = useState<Area[]>([]);
  const [collectionPoints, setCollectionPoints] = useState<CollectionPoint[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);

  // Create zone form
  const [zoneName, setZoneName] = useState('');
  const [zoneAreaId, setZoneAreaId] = useState('');
  const [zoneDesc, setZoneDesc] = useState('');

  // Assign collection points modal
  const [assignModal, setAssignModal] = useState<string | null>(null); // zoneId
  const [selectedPoints, setSelectedPoints] = useState<string[]>([]);
  const [filterAreaForPoints, setFilterAreaForPoints] = useState('');

  useEffect(() => {
    fetchZones();
    fetchAreas();
  }, []);

  useEffect(() => {
    if (filterAreaForPoints) fetchCollectionPoints(filterAreaForPoints);
  }, [filterAreaForPoints]);

  async function fetchZones() {
    setIsLoading(true);
    try {
      const res = await apiRequest('/zones');
      if (res.ok) setZones(await res.json());
      else setErrorMsg('Failed to load zones.');
    } catch {
      setErrorMsg('Network error loading zones.');
    } finally {
      setIsLoading(false);
    }
  }

  async function fetchAreas() {
    try {
      const cityRes = await apiRequest('/geo/cities');
      if (!cityRes.ok) return;
      const cities = await cityRes.json();
      const allAreas: Area[] = [];
      for (const city of cities) {
        const wardRes = await apiRequest(`/geo/cities/${city.id}/wards`);
        if (!wardRes.ok) continue;
        const wards = await wardRes.json();
        for (const ward of wards) {
          const areaRes = await apiRequest(`/geo/wards/${ward.id}/areas`);
          if (!areaRes.ok) continue;
          const areas = await areaRes.json();
          allAreas.push(...areas.map((a: Area) => ({ ...a, ward: { ...ward, city } })));
        }
      }
      setAreas(allAreas);
    } catch { /* silently fail */ }
  }

  async function fetchCollectionPoints(areaId: string) {
    try {
      const res = await apiRequest(`/properties/collection-points?areaId=${areaId}&status=ACTIVE`);
      if (res.ok) setCollectionPoints(await res.json());
    } catch { /* silently fail */ }
  }

  async function handleCreateZone(e: React.FormEvent) {
    e.preventDefault();
    setIsSubmitting(true);
    setErrorMsg(''); setSuccessMsg('');
    try {
      const res = await apiRequest('/zones', {
        method: 'POST',
        body: JSON.stringify({ name: zoneName, areaId: zoneAreaId, description: zoneDesc || null }),
      });
      if (res.ok) {
        setSuccessMsg('Service zone created.');
        setShowCreateForm(false);
        setZoneName(''); setZoneAreaId(''); setZoneDesc('');
        fetchZones();
      } else {
        const data = await res.json();
        setErrorMsg(data.message || 'Failed to create zone.');
      }
    } catch {
      setErrorMsg('Network error. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleAssignPoints() {
    if (!assignModal || selectedPoints.length === 0) return;
    setIsSubmitting(true);
    setErrorMsg(''); setSuccessMsg('');
    try {
      const res = await apiRequest(`/zones/${assignModal}/collection-points`, {
        method: 'PATCH',
        body: JSON.stringify({ collectionPointIds: selectedPoints }),
      });
      if (res.ok) {
        setSuccessMsg(`${selectedPoints.length} collection point(s) assigned to zone.`);
        setAssignModal(null);
        setSelectedPoints([]);
        fetchZones();
      } else {
        const data = await res.json();
        setErrorMsg(data.message || 'Failed to assign collection points.');
      }
    } catch {
      setErrorMsg('Network error. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  function togglePoint(id: string) {
    setSelectedPoints(prev => prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]);
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Service Zones</h1>
          <p className="text-sm text-slate-400 mt-1">Define geographic service zones and assign collection points within an area</p>
        </div>
        <button
          onClick={() => { setShowCreateForm(!showCreateForm); setErrorMsg(''); setSuccessMsg(''); }}
          className="px-4 py-2 rounded-xl text-sm font-semibold bg-gradient-to-r from-emerald-500 to-teal-400 text-slate-950 hover:opacity-90 active:scale-95 transition shadow-lg shadow-emerald-500/20"
        >
          {showCreateForm ? 'Cancel' : '+ New Zone'}
        </button>
      </div>

      {/* Feedback */}
      {errorMsg && <div className="p-4 rounded-xl border border-red-500/30 bg-red-950/20 text-red-300 text-sm">{errorMsg}</div>}
      {successMsg && <div className="p-4 rounded-xl border border-emerald-500/30 bg-emerald-950/20 text-emerald-300 text-sm">{successMsg}</div>}

      {/* Create Zone Form */}
      {showCreateForm && (
        <form onSubmit={handleCreateZone} className="p-6 rounded-2xl border border-slate-800 bg-slate-900/60 backdrop-blur space-y-4">
          <h2 className="text-base font-semibold text-slate-200">Create Service Zone</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Zone Name</label>
              <input type="text" required value={zoneName} onChange={e => setZoneName(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 text-sm focus:outline-none focus:border-emerald-500/50"
                placeholder="North Sector A" />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Parent Area</label>
              <select required value={zoneAreaId} onChange={e => setZoneAreaId(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 text-sm focus:outline-none focus:border-emerald-500/50">
                <option value="">— Select area —</option>
                {areas.map(a => (
                  <option key={a.id} value={a.id}>{a.name} (Ward {a.ward.number}, {a.ward.city.name})</option>
                ))}
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs text-slate-400 mb-1">Description (optional)</label>
              <textarea value={zoneDesc} onChange={e => setZoneDesc(e.target.value)} rows={2}
                className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 text-sm focus:outline-none focus:border-emerald-500/50 resize-none"
                placeholder="Covers streets 1–15 in the north quadrant" />
            </div>
          </div>
          <div className="flex justify-end">
            <button type="submit" disabled={isSubmitting}
              className="px-5 py-2 rounded-xl text-sm font-semibold bg-gradient-to-r from-emerald-500 to-teal-400 text-slate-950 hover:opacity-90 transition disabled:opacity-50">
              {isSubmitting ? 'Creating...' : 'Create Zone'}
            </button>
          </div>
        </form>
      )}

      {/* Zones List */}
      {isLoading ? (
        <div className="p-12 text-center text-slate-500 text-sm">Loading service zones...</div>
      ) : zones.length === 0 ? (
        <div className="p-12 text-center rounded-2xl border border-slate-800 bg-slate-900/40">
          <div className="text-4xl mb-3">🗺️</div>
          <p className="text-slate-400 text-sm">No service zones created yet. Define your first zone above.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {zones.map(zone => (
            <div key={zone.id} className="p-5 rounded-2xl border border-slate-800 bg-slate-900/40 space-y-3 flex flex-col">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-semibold text-slate-200">{zone.name}</div>
                  <div className="text-xs text-slate-500 mt-1">
                    {zone.area?.name && `📍 ${zone.area.name}`}
                    {zone.area?.ward?.number && ` · Ward ${zone.area.ward.number}`}
                    {zone.area?.ward?.city?.name && `, ${zone.area.ward.city.name}`}
                  </div>
                </div>
                <span className={`shrink-0 px-2 py-0.5 rounded-md text-xs font-medium border ${zone.isActive ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20' : 'bg-red-500/10 text-red-300 border-red-500/20'}`}>
                  {zone.isActive ? 'Active' : 'Inactive'}
                </span>
              </div>

              {zone.description && (
                <p className="text-xs text-slate-400">{zone.description}</p>
              )}

              <div className="flex items-center justify-between mt-auto pt-2 border-t border-slate-800/60">
                <span className="text-xs text-slate-500">
                  {zone._count?.collectionPoints ?? 0} collection points
                </span>
                <button
                  onClick={() => {
                    setAssignModal(zone.id);
                    setSelectedPoints([]);
                    setFilterAreaForPoints(zone.areaId);
                  }}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-700 hover:border-emerald-500/40 hover:text-emerald-400 transition"
                >
                  Assign Points
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Assign Collection Points Modal */}
      {assignModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-lg shadow-2xl max-h-[80vh] flex flex-col">
            <h3 className="text-base font-semibold text-slate-100 mb-4">Assign Collection Points to Zone</h3>

            {collectionPoints.length === 0 ? (
              <div className="flex-1 flex items-center justify-center text-sm text-slate-500 py-8">
                No active collection points found for this area.
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto space-y-2 mb-4">
                <p className="text-xs text-slate-500 mb-3">
                  Select collection points to assign. {selectedPoints.length} selected.
                </p>
                {collectionPoints.map(cp => (
                  <label key={cp.id}
                    className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition ${
                      selectedPoints.includes(cp.id)
                        ? 'border-emerald-500/40 bg-emerald-500/5'
                        : 'border-slate-700 hover:border-slate-600'
                    }`}>
                    <input type="checkbox" checked={selectedPoints.includes(cp.id)}
                      onChange={() => togglePoint(cp.id)}
                      className="w-4 h-4 rounded accent-emerald-500" />
                    <div>
                      <div className="text-sm text-slate-200">{cp.address}</div>
                      <div className="text-xs text-slate-500">{cp.status}</div>
                    </div>
                  </label>
                ))}
              </div>
            )}

            <div className="flex gap-3">
              <button onClick={() => { setAssignModal(null); setSelectedPoints([]); }}
                className="flex-1 py-2 rounded-xl text-sm font-medium border border-slate-700 hover:border-slate-600 transition">
                Cancel
              </button>
              <button onClick={handleAssignPoints} disabled={isSubmitting || selectedPoints.length === 0}
                className="flex-1 py-2 rounded-xl text-sm font-semibold bg-gradient-to-r from-emerald-500 to-teal-400 text-slate-950 hover:opacity-90 transition disabled:opacity-50">
                {isSubmitting ? 'Assigning...' : `Assign ${selectedPoints.length} Points`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
