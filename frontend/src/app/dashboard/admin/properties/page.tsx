'use client';

import React, { useState, useEffect } from 'react';
import { apiRequest } from '../../../../utils/api';

interface Property {
  id: string;
  address: string;
  latitude: number;
  longitude: number;
  status: 'PENDING' | 'VERIFIED' | 'REJECTED';
  owner: {
    email: string;
  };
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

export default function AdminPropertiesQueuePage() {
  const [properties, setProperties] = useState<Property[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  useEffect(() => {
    fetchProperties();
  }, []);

  async function fetchProperties() {
    setIsLoading(true);
    setErrorMsg('');
    try {
      const res = await apiRequest('/properties');
      if (res.ok) {
        setProperties(await res.json());
      } else {
        setErrorMsg('Failed to load verification queue.');
      }
    } catch (err) {
      setErrorMsg('Failed to connect to backend api services.');
    } finally {
      setIsLoading(false);
    }
  }

  const handleVerify = async (propertyId: string, status: 'VERIFIED' | 'REJECTED') => {
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const res = await apiRequest(`/properties/${propertyId}/verify`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });

      if (res.ok) {
        setSuccessMsg(`Property status updated to ${status} successfully.`);
        fetchProperties();
      } else {
        const data = await res.json();
        setErrorMsg(data.message || 'Verification update failed.');
      }
    } catch (err) {
      setErrorMsg('Network error while processing verification request.');
    }
  };

  const pendingProperties = properties.filter((p) => p.status === 'PENDING');
  const reviewedProperties = properties.filter((p) => p.status !== 'PENDING');

  return (
    <div className="space-y-8">
      {/* Title */}
      <div className="flex justify-between items-center border-b border-slate-900 pb-4">
        <div>
          <h2 className="text-2xl font-black text-slate-100">Verification Queue</h2>
          <p className="text-xs text-slate-400 mt-1">Review and approve citizen property registrations to activate collections</p>
        </div>
        <button
          onClick={fetchProperties}
          className="px-4 py-2 text-xs font-bold border border-slate-800 hover:border-slate-700 bg-slate-900 rounded-xl transition"
        >
          Refresh Queue
        </button>
      </div>

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
        <div className="h-60 flex items-center justify-center">
          <span className="h-8 w-8 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin"></span>
        </div>
      ) : (
        <div className="space-y-8">
          {/* Pending Section */}
          <div className="p-6 rounded-2xl border border-slate-900 bg-slate-950/40">
            <h3 className="text-lg font-bold text-slate-200 mb-4 flex items-center justify-between">
              <span>Pending Review</span>
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400 font-bold">
                {pendingProperties.length} Awaiting
              </span>
            </h3>

            {pendingProperties.length === 0 ? (
              <div className="text-center py-8 text-slate-500 text-sm">
                No properties currently awaiting verification. Good job!
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-900 text-slate-400 text-xs font-bold uppercase">
                      <th className="py-3 px-4">Address</th>
                      <th className="py-3 px-4">Owner</th>
                      <th className="py-3 px-4">Area Context</th>
                      <th className="py-3 px-4">Coordinates</th>
                      <th className="py-3 px-4 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-900/50">
                    {pendingProperties.map((p) => (
                      <tr key={p.id} className="hover:bg-slate-900/30">
                        <td className="py-3.5 px-4 font-semibold text-slate-200">{p.address}</td>
                        <td className="py-3.5 px-4 text-slate-300">{p.owner?.email}</td>
                        <td className="py-3.5 px-4 text-slate-400">
                          {p.area?.ward?.city?.name} - Ward {p.area?.ward?.number} ({p.area?.name})
                        </td>
                        <td className="py-3.5 px-4 text-slate-500 font-mono text-xs">
                          {p.latitude.toFixed(4)}, {p.longitude.toFixed(4)}
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="flex items-center justify-center space-x-2">
                            <button
                              onClick={() => handleVerify(p.id, 'VERIFIED')}
                              className="px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-500 text-slate-950 hover:brightness-110 transition active:scale-95"
                            >
                              Approve
                            </button>
                            <button
                              onClick={() => handleVerify(p.id, 'REJECTED')}
                              className="px-3 py-1.5 rounded-lg text-xs font-bold bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 transition active:scale-95"
                            >
                              Reject
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Reviewed Section */}
          <div className="p-6 rounded-2xl border border-slate-900 bg-slate-950/40">
            <h3 className="text-lg font-bold text-slate-200 mb-4">Historical Logs (Reviewed)</h3>

            {reviewedProperties.length === 0 ? (
              <div className="text-center py-8 text-slate-500 text-sm">
                No historically reviewed properties found.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-900 text-slate-400 text-xs font-bold uppercase">
                      <th className="py-3 px-4">Address</th>
                      <th className="py-3 px-4">Owner</th>
                      <th className="py-3 px-4">Area Context</th>
                      <th className="py-3 px-4 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-900/50">
                    {reviewedProperties.map((p) => (
                      <tr key={p.id} className="hover:bg-slate-900/30">
                        <td className="py-3.5 px-4 font-semibold text-slate-200">{p.address}</td>
                        <td className="py-3.5 px-4 text-slate-400">{p.owner?.email}</td>
                        <td className="py-3.5 px-4 text-slate-500">
                          {p.area?.ward?.city?.name} - Ward {p.area?.ward?.number} ({p.area?.name})
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          <span
                            className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-bold border uppercase tracking-wider ${
                              p.status === 'VERIFIED'
                                ? 'bg-emerald-950/30 text-emerald-400 border-emerald-500/25'
                                : 'bg-rose-950/30 text-rose-400 border-rose-500/25'
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
      )}
    </div>
  );
}
