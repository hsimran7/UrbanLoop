import React, { useState, useEffect } from 'react';
import { apiRequest } from '../../utils/api';

export interface LocationData {
  stateId: string;
  stateName: string;
  districtId: string;
  districtName: string;
  cityId: string;
  cityName: string;
  wardId: string;
  wardName: string;
  areaId: string;
  areaName: string;
}

interface CascadingLocationFilterProps {
  onLocationChange: (location: LocationData) => void;
  layout?: 'horizontal' | 'vertical' | 'grid';
  required?: boolean;
}

interface GeoItem {
  id: string;
  name: string;
  number?: number;
}

export const CascadingLocationFilter: React.FC<CascadingLocationFilterProps> = ({
  onLocationChange,
  layout = 'grid',
  required = false,
}) => {
  const [states, setStates] = useState<GeoItem[]>([]);
  const [districts, setDistricts] = useState<GeoItem[]>([]);
  const [cities, setCities] = useState<GeoItem[]>([]);
  const [wards, setWards] = useState<GeoItem[]>([]);
  const [areas, setAreas] = useState<GeoItem[]>([]);

  const [selectedStateId, setSelectedStateId] = useState<string>('');
  const [selectedDistrictId, setSelectedDistrictId] = useState<string>('');
  const [selectedCityId, setSelectedCityId] = useState<string>('');
  const [selectedWardId, setSelectedWardId] = useState<string>('');
  const [selectedAreaId, setSelectedAreaId] = useState<string>('');

  // 1. Fetch States on mount
  useEffect(() => {
    async function loadStates() {
      try {
        const res = await apiRequest('/geo/states');
        if (res.ok) {
          const data = await res.json();
          setStates(data);
          // Auto-select Punjab if present
          const punjab = data.find((s: any) => s.name?.toLowerCase().includes('punjab'));
          if (punjab) {
            setSelectedStateId(punjab.id);
          } else if (data.length > 0) {
            setSelectedStateId(data[0].id);
          }
        }
      } catch (e) {
        console.error('Failed to load states:', e);
      }
    }
    loadStates();
  }, []);

  // 2. Fetch Districts when State changes
  useEffect(() => {
    if (!selectedStateId) {
      setDistricts([]);
      setSelectedDistrictId('');
      return;
    }
    async function loadDistricts() {
      try {
        const res = await apiRequest(`/geo/states/${selectedStateId}/districts`);
        if (res.ok) {
          const data = await res.json();
          setDistricts(data);
        } else {
          // Fallback to query param if sub-resource returns empty
          const qRes = await apiRequest(`/geo/districts?stateId=${selectedStateId}`);
          if (qRes.ok) setDistricts(await qRes.json());
        }
      } catch (e) {
        console.error('Failed to load districts:', e);
      }
    }
    setSelectedDistrictId('');
    setSelectedCityId('');
    setSelectedWardId('');
    setSelectedAreaId('');
    loadDistricts();
  }, [selectedStateId]);

  // 3. Fetch Cities when District changes
  useEffect(() => {
    if (!selectedDistrictId) {
      setCities([]);
      setSelectedCityId('');
      return;
    }
    async function loadCities() {
      try {
        const res = await apiRequest(`/geo/districts/${selectedDistrictId}/cities`);
        if (res.ok) {
          const data = await res.json();
          setCities(data);
        } else {
          const qRes = await apiRequest(`/geo/cities?districtId=${selectedDistrictId}`);
          if (qRes.ok) setCities(await qRes.json());
        }
      } catch (e) {
        console.error('Failed to load cities:', e);
      }
    }
    setSelectedCityId('');
    setSelectedWardId('');
    setSelectedAreaId('');
    loadCities();
  }, [selectedDistrictId]);

  // 4. Fetch Wards when City changes
  useEffect(() => {
    if (!selectedCityId) {
      setWards([]);
      setSelectedWardId('');
      return;
    }
    async function loadWards() {
      try {
        const res = await apiRequest(`/geo/cities/${selectedCityId}/wards`);
        if (res.ok) {
          const data = await res.json();
          setWards(data);
        } else {
          const qRes = await apiRequest(`/geo/wards?cityId=${selectedCityId}`);
          if (qRes.ok) setWards(await qRes.json());
        }
      } catch (e) {
        console.error('Failed to load wards:', e);
      }
    }
    setSelectedWardId('');
    setSelectedAreaId('');
    loadWards();
  }, [selectedCityId]);

  // 5. Fetch Areas when Ward changes
  useEffect(() => {
    if (!selectedWardId) {
      setAreas([]);
      setSelectedAreaId('');
      return;
    }
    async function loadAreas() {
      try {
        const res = await apiRequest(`/geo/wards/${selectedWardId}/areas`);
        if (res.ok) {
          const data = await res.json();
          setAreas(data);
        } else {
          const qRes = await apiRequest(`/geo/areas?wardId=${selectedWardId}`);
          if (qRes.ok) setAreas(await qRes.json());
        }
      } catch (e) {
        console.error('Failed to load areas:', e);
      }
    }
    setSelectedAreaId('');
    loadAreas();
  }, [selectedWardId]);

  // 6. Notify parent component of location changes
  useEffect(() => {
    const currentState = states.find(s => s.id === selectedStateId);
    const currentDistrict = districts.find(d => d.id === selectedDistrictId);
    const currentCity = cities.find(c => c.id === selectedCityId);
    const currentWard = wards.find(w => w.id === selectedWardId);
    const currentArea = areas.find(a => a.id === selectedAreaId);

    onLocationChange({
      stateId: selectedStateId,
      stateName: currentState?.name || '',
      districtId: selectedDistrictId,
      districtName: currentDistrict?.name || '',
      cityId: selectedCityId,
      cityName: currentCity?.name || '',
      wardId: selectedWardId,
      wardName: currentWard ? (currentWard.name || `Ward ${currentWard.number}`) : '',
      areaId: selectedAreaId,
      areaName: currentArea?.name || '',
    });
  }, [selectedStateId, selectedDistrictId, selectedCityId, selectedWardId, selectedAreaId]);

  const selectClass =
    "w-full h-11 px-3.5 py-2.5 bg-slate-950/90 border border-slate-800 hover:border-emerald-700/60 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 rounded-xl text-xs font-medium text-slate-100 transition-all outline-none cursor-pointer appearance-none bg-[url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2216%22%20height%3D%2216%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%2310b981%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpath%20d%3D%22m6%209%206%206%206-6%22%2F%3E%3C%2Fsvg%3E')] bg-[length:16px_16px] bg-[right_12px_center] bg-no-repeat pr-10 disabled:opacity-50 disabled:cursor-not-allowed";
  const labelClass = "block text-xs font-semibold text-emerald-300/90 tracking-wide mb-1.5 uppercase";

  const containerClass =
    layout === 'grid'
      ? 'grid grid-cols-1 md:grid-cols-2 gap-4.5'
      : layout === 'horizontal'
      ? 'flex flex-wrap gap-3'
      : 'space-y-3';

  return (
    <div className={containerClass}>
      {/* 1. State */}
      <div>
        <label className={labelClass}>State *</label>
        <select
          value={selectedStateId}
          onChange={(e) => setSelectedStateId(e.target.value)}
          required={required}
          className={selectClass}
        >
          <option value="" className="bg-slate-900 text-slate-100">Select State</option>
          {states.map((s) => (
            <option key={s.id} value={s.id} className="bg-slate-900 text-slate-100">
              {s.name}
            </option>
          ))}
        </select>
      </div>

      {/* 2. District */}
      <div>
        <label className={labelClass}>District *</label>
        <select
          value={selectedDistrictId}
          onChange={(e) => setSelectedDistrictId(e.target.value)}
          disabled={!selectedStateId}
          required={required}
          className={selectClass}
        >
          <option value="" className="bg-slate-900 text-slate-100">{selectedStateId ? 'Select District' : 'Select State First'}</option>
          {districts.map((d) => (
            <option key={d.id} value={d.id} className="bg-slate-900 text-slate-100">
              {d.name}
            </option>
          ))}
        </select>
      </div>

      {/* 3. City */}
      <div>
        <label className={labelClass}>City *</label>
        <select
          value={selectedCityId}
          onChange={(e) => setSelectedCityId(e.target.value)}
          disabled={!selectedDistrictId}
          required={required}
          className={selectClass}
        >
          <option value="" className="bg-slate-900 text-slate-100">{selectedDistrictId ? 'Select City' : 'Select District First'}</option>
          {cities.map((c) => (
            <option key={c.id} value={c.id} className="bg-slate-900 text-slate-100">
              {c.name}
            </option>
          ))}
        </select>
      </div>

      {/* 4. Ward */}
      <div>
        <label className={labelClass}>Ward *</label>
        <select
          value={selectedWardId}
          onChange={(e) => setSelectedWardId(e.target.value)}
          disabled={!selectedCityId}
          required={required}
          className={selectClass}
        >
          <option value="" className="bg-slate-900 text-slate-100">{selectedCityId ? 'Select Ward' : 'Select City First'}</option>
          {wards.map((w) => (
            <option key={w.id} value={w.id} className="bg-slate-900 text-slate-100">
              {w.name || `Ward ${w.number}`}
            </option>
          ))}
        </select>
      </div>

      {/* 5. Area */}
      <div>
        <label className={labelClass}>Area *</label>
        <select
          value={selectedAreaId}
          onChange={(e) => setSelectedAreaId(e.target.value)}
          disabled={!selectedWardId}
          required={required}
          className={selectClass}
        >
          <option value="" className="bg-slate-900 text-slate-100">{selectedWardId ? 'Select Area' : 'Select Ward First'}</option>
          {areas.map((a) => (
            <option key={a.id} value={a.id} className="bg-slate-900 text-slate-100">
              {a.name}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
};
