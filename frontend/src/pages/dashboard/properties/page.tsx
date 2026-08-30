import React, { useState, useEffect } from 'react';
import { apiRequest } from '../../../utils/api';
import { UrbanLoopMap } from '../../../components/maps/UrbanLoopMap';
import { NominatimSearch } from '../../../components/ui/NominatimSearch';
import { reverseGeocode, mapAddressToHierarchy } from '../../../utils/geocoding';
import { PunjabLocationSelector, LocationData } from '../../../components/ui/PunjabLocationSelector';

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

  const [location, setLocation] = useState<LocationData>({
    state: 'Punjab',
    district: '',
    city: '',
    area: '',
    address: '',
  });

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

  const handleMapClick = async (latlng: { lat: number; lng: number }) => {
    setLatitude(latlng.lat);
    setLongitude(latlng.lng);
    const result = await reverseGeocode(latlng.lat, latlng.lng);
    if (result) {
      const h = mapAddressToHierarchy(result.address);
      setLocation(prev => ({
        ...prev,
        state: h.state || 'Punjab',
        city: h.city || prev.city,
        area: h.area || h.ward || prev.area,
        address: result.address.road || prev.address,
      }));
    }
  };

  const handleNominatimSelect = (result: any) => {
    setLatitude(result.lat);
    setLongitude(result.lng);
    setLocation(prev => ({
      ...prev,
      state: result.hierarchy.state || 'Punjab',
      city: result.hierarchy.city || prev.city,
      area: result.hierarchy.area || result.hierarchy.ward || prev.area,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!location.district) {
      setErrorMsg('Please select a Punjab District.');
      return;
    }
    if (!location.city) {
      setErrorMsg('Please select a City / Town.');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg('');
    setSuccessMsg('');

    const formattedAddress = [
      location.address,
      location.area,
      location.city,
      location.district,
      location.state
    ].filter(Boolean).join(', ');

    try {
      const res = await apiRequest('/properties', {
        method: 'POST',
        body: JSON.stringify({
          address: formattedAddress,
          latitude,
          longitude,
          stateName: location.state,
          districtName: location.district,
          cityName: location.city,
          areaName: location.area || `${location.city} Zone`,
          wardNumber: 1,
          wardName: `Ward - ${location.city}`,
        }),
      });

      if (res.ok) {
        setSuccessMsg('Property successfully registered!');
        setLocation({
          state: 'Punjab',
          district: '',
          city: '',
          area: '',
          address: '',
        });
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
      <div className="glass-card p-8">
        <h1 className="text-3xl font-extrabold text-slate-800 tracking-tight">Property Registration</h1>
        <p className="text-slate-500 text-sm mt-1 font-medium">Select location on map or use Punjab dependent location dropdowns.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 h-[600px] relative rounded-2xl overflow-hidden border border-surface-border shadow-md">
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

        <div className="glass-card p-6 space-y-4">
          <h3 className="text-lg font-bold text-slate-800">Registration Details</h3>
          
          {errorMsg && <div className="p-3 text-xs font-bold border border-red-200 bg-red-50 text-red-700 rounded-lg">{errorMsg}</div>}
          {successMsg && <div className="p-3 text-xs font-bold border border-nature-accent bg-emerald-50 text-emerald-700 rounded-lg">{successMsg}</div>}

          <form onSubmit={handleSubmit} className="space-y-4">
            <PunjabLocationSelector
              value={location}
              onChange={setLocation}
            />

            <button disabled={isSubmitting} className="w-full py-3 btn-primary mt-4 disabled:opacity-50">
              {isSubmitting ? 'Registering...' : 'Register Property'}
            </button>
          </form>

          {properties.length > 0 && (
            <div className="mt-8 pt-4 border-t border-surface-border">
              <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Your Properties ({properties.length})</h4>
              <div className="space-y-2 max-h-[180px] overflow-y-auto pr-1">
                {properties.map(p => (
                  <div key={p.id} className="p-3 bg-nature-lightBg border border-surface-border rounded-xl flex justify-between items-center text-xs">
                    <span className="truncate max-w-[170px] text-slate-700 font-medium">{p.address}</span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                      p.status === 'VERIFIED' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-amber-50 border-amber-200 text-amber-700'
                    }`}>
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
