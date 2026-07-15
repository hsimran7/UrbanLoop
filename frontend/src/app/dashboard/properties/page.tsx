'use client';

import React, { useState, useEffect } from 'react';
import { apiRequest } from '../../../utils/api';

interface Area {
  id: string;
  name: string;
  ward: {
    number: number;
    city: {
      name: string;
    };
  };
}

interface Property {
  id: string;
  address: string;
  latitude: number;
  longitude: number;
  status: 'PENDING' | 'VERIFIED' | 'REJECTED';
  area: {
    name: string;
    ward: {
      number: number;
      city: {
        name: string;
      };
    };
  };
}

export default function CitizenPropertiesPage() {
  const [properties, setProperties] = useState<Property[]>([]);
  const [areas, setAreas] = useState<Area[]>([]);
  const [address, setAddress] = useState('');
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  const [selectedAreaId, setSelectedAreaId] = useState('');

  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    setIsLoading(true);
    setErrorMsg('');
    try {
      const propRes = await apiRequest('/properties');
      if (propRes.ok) {
        setProperties(await propRes.json());
      }

      // Fetch all cities -> wards -> areas to populate select box
      const cityRes = await apiRequest('/geo/cities');
      if (cityRes.ok) {
        const cities = await cityRes.json();
        const allAreas: Area[] = [];

        for (const city of cities) {
          const wardRes = await apiRequest(`/geo/cities/${city.id}/wards`);
          if (wardRes.ok) {
            const wards = await wardRes.json();
            for (const ward of wards) {
              const areaRes = await apiRequest(`/geo/wards/${ward.id}/areas`);
              if (areaRes.ok) {
                const areasData = await areaRes.json();
                areasData.forEach((area: any) => {
                  allAreas.push({
                    id: area.id,
                    name: area.name,
                    ward: {
                      number: ward.number,
                      city: { name: city.name },
                    },
                  });
                });
              }
            }
          }
        }
        setAreas(allAreas);
        if (allAreas.length > 0) {
          setSelectedAreaId(allAreas[0].id);
        }
      }
    } catch (err) {
      setErrorMsg('Failed to load data. Ensure database services are running.');
    } finally {
      setIsLoading(false);
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setErrorMsg('');
    setSuccessMsg('');

    const latitude = parseFloat(lat);
    const longitude = parseFloat(lng);

    if (isNaN(latitude) || isNaN(longitude)) {
      setErrorMsg('Latitude and Longitude must be valid numbers.');
      setIsSubmitting(false);
      return;
    }

    try {
      const res = await apiRequest('/properties', {
        method: 'POST',
        body: JSON.stringify({
          address,
          latitude,
          longitude,
          areaId: selectedAreaId,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setSuccessMsg('Property successfully registered and is pending verification.');
        setAddress('');
        setLat('');
        setLng('');
        fetchData();
      } else {
        setErrorMsg(data.message || 'Failed to submit property.');
      }
    } catch (err) {
      setErrorMsg('Network error occurred. Try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
      {/* Registration Form */}
      <div className="lg:col-span-1 p-6 rounded-2xl border border-slate-900 bg-slate-950/40 relative h-fit">
        <h3 className="text-xl font-bold text-slate-200 border-b border-slate-900 pb-3 mb-5">
          Register Property
        </h3>

        {errorMsg && (
          <div className="mb-4 p-4 rounded-xl border border-rose-500/30 bg-rose-950/20 text-rose-300 text-sm font-medium">
            {errorMsg}
          </div>
        )}

        {successMsg && (
          <div className="mb-4 p-4 rounded-xl border border-emerald-500/30 bg-emerald-950/20 text-emerald-300 text-sm font-medium">
            {successMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-slate-300 text-xs font-semibold mb-2" htmlFor="address">
              Street Address
            </label>
            <input
              id="address"
              type="text"
              required
              className="w-full px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-100 text-sm focus:border-emerald-500 focus:outline-none placeholder:text-slate-600"
              placeholder="e.g. 742 Evergreen Terrace"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-slate-300 text-xs font-semibold mb-2" htmlFor="lat">
                Latitude
              </label>
              <input
                id="lat"
                type="text"
                required
                className="w-full px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-100 text-sm focus:border-emerald-500 focus:outline-none placeholder:text-slate-600"
                placeholder="37.7749"
                value={lat}
                onChange={(e) => setLat(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-slate-300 text-xs font-semibold mb-2" htmlFor="lng">
                Longitude
              </label>
              <input
                id="lng"
                type="text"
                required
                className="w-full px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-100 text-sm focus:border-emerald-500 focus:outline-none placeholder:text-slate-600"
                placeholder="-122.4194"
                value={lng}
                onChange={(e) => setLng(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className="block text-slate-300 text-xs font-semibold mb-2" htmlFor="area">
              Assigned Ward Area
            </label>
            {areas.length === 0 ? (
              <div className="text-xs text-rose-400">
                No active municipal areas. Ask admin to seed geography data.
              </div>
            ) : (
              <select
                id="area"
                className="w-full px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-100 text-sm focus:border-emerald-500 focus:outline-none"
                value={selectedAreaId}
                onChange={(e) => setSelectedAreaId(e.target.value)}
              >
                {areas.map((area) => (
                  <option key={area.id} value={area.id}>
                    {area.ward.city.name} - Ward {area.ward.number} ({area.name})
                  </option>
                ))}
              </select>
            )}
          </div>

          <button
            type="submit"
            disabled={isSubmitting || areas.length === 0}
            className="w-full py-3 rounded-xl font-bold bg-gradient-to-r from-emerald-500 to-teal-400 text-slate-950 hover:brightness-110 disabled:opacity-50 disabled:pointer-events-none active:scale-[0.98] transition-all text-sm flex items-center justify-center space-x-2"
          >
            {isSubmitting ? (
              <span className="inline-block h-4 w-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin"></span>
            ) : (
              <span>Submit Property</span>
            )}
          </button>
        </form>
      </div>

      {/* Properties List */}
      <div className="lg:col-span-2 p-6 rounded-2xl border border-slate-900 bg-slate-950/40">
        <h3 className="text-xl font-bold text-slate-200 border-b border-slate-900 pb-3 mb-5">
          Registered Properties Directory
        </h3>

        {isLoading ? (
          <div className="h-40 flex items-center justify-center">
            <span className="h-6 w-6 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin"></span>
          </div>
        ) : properties.length === 0 ? (
          <div className="text-center py-12 text-slate-500 text-sm">
            You haven't registered any properties yet. Use the form to register.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-900 text-slate-400 text-xs font-bold uppercase">
                  <th className="py-3 px-4">Address</th>
                  <th className="py-3 px-4">Area Location</th>
                  <th className="py-3 px-4">Coordinates</th>
                  <th className="py-3 px-4 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-900/50">
                {properties.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-900/30">
                    <td className="py-3.5 px-4 font-semibold text-slate-200">{p.address}</td>
                    <td className="py-3.5 px-4 text-slate-400">
                      {p.area?.ward?.city?.name} (Ward {p.area?.ward?.number} - {p.area?.name})
                    </td>
                    <td className="py-3.5 px-4 text-slate-500 font-mono text-xs">
                      {p.latitude.toFixed(4)}, {p.longitude.toFixed(4)}
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <span
                        className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-bold border uppercase tracking-wider ${
                          p.status === 'VERIFIED'
                            ? 'bg-emerald-950/30 text-emerald-400 border-emerald-500/25'
                            : p.status === 'REJECTED'
                            ? 'bg-rose-950/30 text-rose-400 border-rose-500/25'
                            : 'bg-amber-950/30 text-amber-400 border-amber-500/25'
                        }`}
                      >
                        {p.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
