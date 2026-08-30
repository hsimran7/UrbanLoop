import React, { useState, useEffect } from 'react';
import { apiRequest } from '../../../../utils/api';
import { SearchableSelect } from '../../../../components/ui/SearchableSelect';

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
      <div className="glass-card p-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-800 tracking-tight">Service Zones</h1>
          <p className="text-sm text-slate-500 mt-1 font-medium">Define geographic service zones and assign collection points within an area</p>
        </div>
        <button
          onClick={() => { setShowCreateForm(!showCreateForm); setErrorMsg(''); setSuccessMsg(''); }}
          className="btn-primary"
        >
          {showCreateForm ? 'Cancel' : '+ New Zone'}
        </button>
      </div>

      {/* Feedback */}
      {errorMsg && <div className="p-4 rounded-xl border border-red-200 bg-red-50 text-red-700 text-sm font-medium">{errorMsg}</div>}
      {successMsg && <div className="p-4 rounded-xl border border-nature-accent bg-nature-white/80 text-emerald-700 text-sm font-medium">{successMsg}</div>}

      {/* Create Zone Form */}
      {showCreateForm && (
        <form onSubmit={handleCreateZone} className="glass-card p-6 space-y-4">
          <h2 className="text-base font-bold text-slate-800">Create Service Zone</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-slate-500 mb-1 font-semibold uppercase tracking-wider">Zone Name</label>
              <input type="text" required value={zoneName} onChange={e => setZoneName(e.target.value)}
                className="input-field"
                placeholder="North Sector A" />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1 font-semibold uppercase tracking-wider">Parent Area</label>
              <SearchableSelect
                value={zoneAreaId}
                onChange={setZoneAreaId}
                options={areas.map(a => ({ value: a.id, label: `${a.name} (Ward ${a.ward.number}, ${a.ward.city.name})` }))}
                placeholder="— Select area —"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs text-slate-500 mb-1 font-semibold uppercase tracking-wider">Description (optional)</label>
              <textarea value={zoneDesc} onChange={e => setZoneDesc(e.target.value)} rows={2}
                className="input-field resize-none"
                placeholder="Covers streets 1–15 in the north quadrant" />
            </div>
          </div>
          <div className="flex justify-end">
            <button type="submit" disabled={isSubmitting} className="btn-primary disabled:opacity-50">
              {isSubmitting ? 'Creating...' : 'Create Zone'}
            </button>
          </div>
        </form>
      )}

      {/* Zones List */}
      {isLoading ? (
        <div className="p-12 text-center text-slate-500 text-sm">Loading service zones...</div>
      ) : zones.length === 0 ? (
        <div className="glass-card p-12 text-center">
          <div className="text-4xl mb-3">🗺️</div>
          <p className="text-slate-500 text-sm">No service zones created yet. Define your first zone above.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {zones.map(zone => (
            <div key={zone.id} className="glass-card space-y-3 flex flex-col">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-bold text-slate-800">{zone.name}</div>
                  <div className="text-xs text-slate-500 mt-1">
                    {zone.area?.name && `📍 ${zone.area.name}`}
                    {zone.area?.ward?.number && ` · Ward ${zone.area.ward.number}`}
                    {zone.area?.ward?.city?.name && `, ${zone.area.ward.city.name}`}
                  </div>
                </div>
                <span className={`shrink-0 px-2 py-0.5 rounded-md text-xs font-bold border ${
                  zone.isActive ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-red-50 text-red-700 border-red-200'
                }`}>
                  {zone.isActive ? 'Active' : 'Inactive'}
                </span>
              </div>

              {zone.description && (
                <p className="text-xs text-slate-500">{zone.description}</p>
              )}

              <div className="flex items-center justify-between mt-auto pt-2 border-t border-surface-border">
                <span className="text-xs text-slate-500 font-semibold">
                  {zone._count?.collectionPoints ?? 0} collection points
                </span>
                <button
                  onClick={() => {
                    setAssignModal(zone.id);
                    setSelectedPoints([]);
                    setFilterAreaForPoints(zone.areaId);
                  }}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold border border-surface-border hover:bg-nature-lightBg text-slate-600 transition"
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
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-nature-white border border-surface-border rounded-2xl p-6 w-full max-w-lg shadow-2xl max-h-[80vh] flex flex-col">
            <h3 className="text-base font-bold text-slate-800 mb-4">Assign Collection Points to Zone</h3>

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
                        ? 'border-nature-accent bg-emerald-50'
                        : 'border-surface-border hover:bg-nature-lightBg'
                    }`}>
                    <input type="checkbox" checked={selectedPoints.includes(cp.id)}
                      onChange={() => togglePoint(cp.id)}
                      className="w-4 h-4 rounded accent-emerald-600" />
                    <div>
                      <div className="text-sm text-slate-700 font-medium">{cp.address}</div>
                      <div className="text-xs text-slate-500">{cp.status}</div>
                    </div>
                  </label>
                ))}
              </div>
            )}

            <div className="flex gap-3">
              <button onClick={() => { setAssignModal(null); setSelectedPoints([]); }}
                className="flex-1 py-2 rounded-xl text-sm font-medium border border-surface-border hover:bg-nature-lightBg text-slate-600 transition">
                Cancel
              </button>
              <button onClick={handleAssignPoints} disabled={isSubmitting || selectedPoints.length === 0}
                className="flex-1 py-2 btn-primary disabled:opacity-50">
                {isSubmitting ? 'Assigning...' : `Assign ${selectedPoints.length} Points`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
