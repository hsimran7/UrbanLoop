'use client';

import React, { useState, useEffect } from 'react';
import { apiRequest } from '../../../utils/api';
import { UrbanLoopMap } from '../../../components/maps/UrbanLoopMap';
import { NominatimSearch } from '../../../components/ui/NominatimSearch';
import { reverseGeocode, mapAddressToHierarchy } from '../../../utils/geocoding';
import Link from 'next/link';

interface Property {
  id: string;
  address: string;
  latitude: number;
  longitude: number;
  status: 'PENDING' | 'VERIFIED' | 'REJECTED';
}

export default function CitizenPropertiesPage() {
  const [properties, setProperties] = useState<Property[]>([]);
  const [latitude, setLatitude] = useState(30.900965);
  const [longitude, setLongitude] = useState(75.857277);
  
  const [houseNumber, setHouseNumber] = useState('');
  const [streetName, setStreetName] = useState('');
  const [landmark, setLandmark] = useState('');
  
  const [stateName, setStateName] = useState('');
  const [cityName, setCityName] = useState('');
  const [areaName, setAreaName] = useState('');
  
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  useEffect(() => {
    fetchProperties();
  }, []);

  async function fetchProperties() {
    setIsLoading(true);
    try {
      const res = await apiRequest('/properties');
      if (res.ok) setProperties(await res.json());
    } catch {
      setErrorMsg('Failed to load properties.');
    } finally {
      setIsLoading(false);
    }
  }

  const handleMapClick = async (latlng: { lat: number, lng: number }) => {
    setLatitude(latlng.lat);
    setLongitude(latlng.lng);
    const result = await reverseGeocode(latlng.lat, latlng.lng);
    if (result) {
      const h = mapAddressToHierarchy(result.address);
      if (h.state) setStateName(h.state);
      if (h.city) setCityName(h.city);
      if (h.area || h.ward) setAreaName(h.area || h.ward);
      if (result.address.road) setStreetName(result.address.road);
    }
  };

  const handleNominatimSelect = (result: any) => {
    setLatitude(result.lat);
    setLongitude(result.lng);
    if (result.hierarchy.state) setStateName(result.hierarchy.state);
    if (result.hierarchy.city) setCityName(result.hierarchy.city);
    if (result.hierarchy.area || result.hierarchy.ward) setAreaName(result.hierarchy.area || result.hierarchy.ward);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setErrorMsg('');
    setSuccessMsg('');

    const addressDetails = [
      houseNumber ? `House ${houseNumber}` : '',
      streetName,
      landmark ? `Near ${landmark}` : '',
      areaName,
      cityName,
      stateName
    ].filter(Boolean).join(', ');

    try {
      const res = await apiRequest('/properties', {
        method: 'POST',
        body: JSON.stringify({
          address: addressDetails,
          latitude,
          longitude,
          stateName: stateName || 'Punjab',
          cityName: cityName || 'Ludhiana',
          areaName: areaName || 'Central',
          wardNumber: 1, // Fallback
          wardName: `Ward 1 - ${cityName}`
        })
      });

      if (res.ok) {
        setSuccessMsg('Property successfully registered!');
        setHouseNumber('');
        setStreetName('');
        setLandmark('');
        fetchProperties();
      } else {
        const data = await res.json();
        setErrorMsg(data.message || 'Failed to register property.');
      }
    } catch {
      setErrorMsg('Network error.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 pb-12">
      <div>
        <h2 className="text-2xl font-black text-slate-100">Property Registration</h2>
        <p className="text-slate-450 text-xs mt-1">Select location on the OpenStreetMap to auto-retrieve Indian address details.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 h-[600px] relative rounded-2xl overflow-hidden border border-slate-800">
          <div className="absolute top-4 left-4 right-4 z-[1000]">
            <NominatimSearch onSelect={handleNominatimSelect} />
          </div>
          <UrbanLoopMap 
            center={[latitude, longitude]} 
            zoom={16}
            onMapClick={handleMapClick}
            markers={[{ id: 'pin', position: [latitude, longitude] }]}
          />
        </div>

        <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl">
          <h3 className="text-lg font-bold mb-4">Registration Details</h3>
          
          {errorMsg && <div className="p-3 mb-4 text-xs font-bold bg-rose-500/10 text-rose-400 rounded-lg">{errorMsg}</div>}
          {successMsg && <div className="p-3 mb-4 text-xs font-bold bg-emerald-500/10 text-emerald-400 rounded-lg">{successMsg}</div>}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1">State / City / Area (Auto-filled)</label>
              <div className="grid grid-cols-3 gap-2">
                <input value={stateName} readOnly className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs" placeholder="State" />
                <input value={cityName} readOnly className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs" placeholder="City" />
                <input value={areaName} readOnly className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs" placeholder="Area" />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1">House/Flat Number</label>
              <input value={houseNumber} onChange={e=>setHouseNumber(e.target.value)} required className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs focus:ring-1 focus:ring-emerald-500 outline-none" />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1">Street / Road Name</label>
              <input value={streetName} onChange={e=>setStreetName(e.target.value)} className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs focus:ring-1 focus:ring-emerald-500 outline-none" />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1">Landmark</label>
              <input value={landmark} onChange={e=>setLandmark(e.target.value)} className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs focus:ring-1 focus:ring-emerald-500 outline-none" />
            </div>

            <button disabled={isSubmitting} className="w-full py-3 bg-emerald-500 text-slate-950 font-bold rounded-xl mt-4 hover:brightness-110">
              {isSubmitting ? 'Registering...' : 'Register Property'}
            </button>
          </form>

          {properties.length > 0 && (
            <div className="mt-8">
              <h4 className="text-sm font-bold text-slate-400 mb-3">Your Properties</h4>
              <div className="space-y-2 max-h-[200px] overflow-y-auto">
                {properties.map(p => (
                  <div key={p.id} className="p-3 bg-slate-950 border border-slate-800 rounded-lg flex justify-between items-center">
                    <span className="text-xs truncate max-w-[150px]">{p.address}</span>
                    <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${p.status === 'VERIFIED' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'}`}>
                      {p.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
