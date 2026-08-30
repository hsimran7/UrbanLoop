import React, { useState, useEffect } from 'react';
import { apiRequest } from '../../../../utils/api';
import { getSocket } from '../../../../utils/socket';

interface PendingCitizen {
  id: string;
  name: string;
  email: string;
  phone: string;
  status: string;
  verificationStatus: string;
  createdAt: string;
}

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

export default function AdminVerificationQueuePage() {
  const [pendingCitizens, setPendingCitizens] = useState<PendingCitizen[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [selectedCitizenDetails, setSelectedCitizenDetails] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  useEffect(() => {
    fetchQueueData();

    // Listen for real-time socket events
    const socket = getSocket('realtime');
    const handler = () => fetchQueueData();

    socket.on('NEW_CITIZEN_REGISTRATION', handler);
    socket.on('CITIZEN_VERIFIED', handler);
    socket.on('CITIZEN_REJECTED', handler);

    return () => {
      socket.off('NEW_CITIZEN_REGISTRATION', handler);
      socket.off('CITIZEN_VERIFIED', handler);
      socket.off('CITIZEN_REJECTED', handler);
    };
  }, []);

  async function fetchQueueData() {
    setIsLoading(true);
    setErrorMsg('');
    try {
      const [pendingRes, propRes] = await Promise.all([
        apiRequest('/users/pending'),
        apiRequest('/properties')
      ]);

      if (pendingRes.ok) {
        const citizens = await pendingRes.json();
        setPendingCitizens(citizens.filter((u: any) => u.role === 'CITIZEN'));
      }
      if (propRes.ok) {
        setProperties(await propRes.json());
      }
    } catch {
      setErrorMsg('Failed to connect to backend verification services.');
    } finally {
      setIsLoading(false);
    }
  }

  const handleVerifyCitizen = async (userId: string, action: 'verify' | 'reject') => {
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const res = await apiRequest(`/users/${userId}/${action}`, {
        method: 'POST',
      });
      if (res.ok) {
        setSuccessMsg(`Citizen account ${action === 'verify' ? 'VERIFIED' : 'REJECTED'} successfully.`);
        fetchQueueData();
      } else {
        const data = await res.json();
        setErrorMsg(data.message || 'Action failed.');
      }
    } catch {
      setErrorMsg('Network error while processing citizen verification.');
    }
  };

  const handleVerifyProperty = async (propertyId: string, status: 'VERIFIED' | 'REJECTED') => {
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const res = await apiRequest(`/properties/${propertyId}/verify`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        setSuccessMsg(`Property status updated to ${status} successfully.`);
        fetchQueueData();
      } else {
        const data = await res.json();
        setErrorMsg(data.message || 'Verification update failed.');
      }
    } catch {
      setErrorMsg('Network error processing property verification.');
    }
  };

  const handleInspectCitizen = async (userId: string) => {
    try {
      const res = await apiRequest(`/users/${userId}/details`);
      if (res.ok) {
        setSelectedCitizenDetails(await res.json());
      }
    } catch {
      // quiet catch
    }
  };

  const pendingProperties = properties.filter((p) => p.status === 'PENDING');

  return (
    <div className="space-y-8 pb-24 text-slate-800">
      {/* Header */}
      <div className="glass-card p-8 flex justify-between items-center">
        <div>
          <div className="text-xs text-nature-earth font-extrabold uppercase tracking-widest mb-1">Government Administration</div>
          <h1 className="text-3xl font-extrabold text-slate-800 tracking-tight font-display">Citizen Verification Queue</h1>
          <p className="text-sm text-slate-600 mt-2 font-medium">Verify registered municipal citizens, inspect declared properties, and audit linked smart bins.</p>
        </div>
      </div>

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
        <div className="glass-card h-60 flex items-center justify-center">
          <span className="h-8 w-8 border-2 border-nature-accent border-t-transparent rounded-full animate-spin"></span>
        </div>
      ) : (
        <div className="space-y-8">
          
          {/* SECTION 1: PENDING CITIZEN REGISTRATIONS */}
          <div className="glass-card p-6">
            <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center justify-between">
              <span>Pending Citizen Registrations</span>
              <span className="text-xs px-3 py-1 rounded-full bg-amber-50 text-amber-700 font-extrabold border border-amber-200">
                {pendingCitizens.length} Awaiting Verification
              </span>
            </h3>

            {pendingCitizens.length === 0 ? (
              <div className="text-center py-8 text-slate-500 text-sm font-medium">
                No new citizen registrations awaiting verification.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-surface-border bg-nature-lightBg text-slate-500 text-xs font-extrabold uppercase tracking-wider">
                      <th className="py-3 px-4">Citizen Name</th>
                      <th className="py-3 px-4">Email</th>
                      <th className="py-3 px-4">Phone</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-border">
                    {pendingCitizens.map((c) => (
                      <tr key={c.id} className="hover:bg-nature-lightBg/50 transition">
                        <td className="py-3.5 px-4 font-bold text-slate-800">{c.name || 'Citizen User'}</td>
                        <td className="py-3.5 px-4 text-slate-700 font-medium">{c.email}</td>
                        <td className="py-3.5 px-4 text-slate-500 font-medium">{c.phone || 'N/A'}</td>
                        <td className="py-3.5 px-4">
                          <span className="px-2.5 py-0.5 text-[10px] font-extrabold rounded-md bg-amber-50 text-amber-700 border border-amber-200">
                            PENDING_VERIFICATION
                          </span>
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="flex items-center justify-center space-x-2">
                            <button
                              onClick={() => handleVerifyCitizen(c.id, 'verify')}
                              className="px-3.5 py-1.5 rounded-xl text-xs font-extrabold bg-emerald-600 hover:bg-emerald-500 text-white transition shadow-sm"
                            >
                              Verify
                            </button>
                            <button
                              onClick={() => handleVerifyCitizen(c.id, 'reject')}
                              className="px-3.5 py-1.5 rounded-xl text-xs font-extrabold bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 transition"
                            >
                              Reject
                            </button>
                            <button
                              onClick={() => handleInspectCitizen(c.id)}
                              className="px-3.5 py-1.5 rounded-xl text-xs font-extrabold bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 transition"
                            >
                              Inspect Details
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

          {/* SECTION 2: PENDING PROPERTY REGISTRATIONS */}
          <div className="glass-card p-6">
            <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center justify-between">
              <span>Pending Property Declarations</span>
              <span className="text-xs px-3 py-1 rounded-full bg-purple-50 text-purple-700 font-extrabold border border-purple-200">
                {pendingProperties.length} Pending
              </span>
            </h3>

            {pendingProperties.length === 0 ? (
              <div className="text-center py-8 text-slate-500 text-sm font-medium">
                No pending property declarations.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-surface-border bg-nature-lightBg text-slate-500 text-xs font-extrabold uppercase tracking-wider">
                      <th className="py-3 px-4">Address</th>
                      <th className="py-3 px-4">Owner</th>
                      <th className="py-3 px-4">Area Context</th>
                      <th className="py-3 px-4 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-border">
                    {pendingProperties.map((p) => (
                      <tr key={p.id} className="hover:bg-nature-lightBg/50 transition">
                        <td className="py-3.5 px-4 font-bold text-slate-800">{p.address}</td>
                        <td className="py-3.5 px-4 text-slate-700 font-medium">{p.owner?.email}</td>
                        <td className="py-3.5 px-4 text-slate-500 font-medium">
                          {p.area?.ward?.city?.name} - Ward {p.area?.ward?.number} ({p.area?.name})
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="flex items-center justify-center space-x-2">
                            <button
                              onClick={() => handleVerifyProperty(p.id, 'VERIFIED')}
                              className="px-3.5 py-1.5 rounded-xl text-xs font-extrabold bg-emerald-600 hover:bg-emerald-500 text-white transition shadow-sm"
                            >
                              Approve
                            </button>
                            <button
                              onClick={() => handleVerifyProperty(p.id, 'REJECTED')}
                              className="px-3.5 py-1.5 rounded-xl text-xs font-extrabold bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 transition"
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

          {/* INSPECT MODAL */}
          {selectedCitizenDetails && (
            <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[2000] flex items-center justify-center p-4">
              <div className="bg-nature-white border border-surface-border rounded-2xl max-w-2xl w-full p-6 space-y-6 max-h-[85vh] overflow-y-auto shadow-2xl">
                <div className="flex justify-between items-center border-b border-surface-border pb-3">
                  <h3 className="text-lg font-bold text-slate-800">Citizen Profile & Bin Information</h3>
                  <button onClick={() => setSelectedCitizenDetails(null)} className="text-slate-400 hover:text-slate-700 text-lg font-bold">✕</button>
                </div>

                <div className="space-y-4 text-xs">
                  <div className="p-4 rounded-2xl bg-nature-lightBg/60 border border-surface-border grid grid-cols-2 gap-3 font-medium">
                    <div><span className="text-slate-500 block font-semibold">Name:</span> <span className="font-bold text-slate-800">{selectedCitizenDetails.user?.name || 'N/A'}</span></div>
                    <div><span className="text-slate-500 block font-semibold">Email:</span> <span className="font-bold text-slate-800">{selectedCitizenDetails.user?.email}</span></div>
                    <div><span className="text-slate-500 block font-semibold">Phone:</span> <span className="font-bold text-slate-800">{selectedCitizenDetails.user?.phone || 'N/A'}</span></div>
                    <div><span className="text-slate-500 block font-semibold">Status:</span> <span className="font-extrabold text-emerald-700">{selectedCitizenDetails.user?.verificationStatus}</span></div>
                  </div>

                  <h4 className="font-bold text-slate-800 text-sm pt-2">Properties ({selectedCitizenDetails.properties?.length || 0})</h4>
                  {selectedCitizenDetails.properties?.map((p: any) => (
                    <div key={p.id} className="p-4 rounded-xl bg-nature-lightBg/40 border border-surface-border space-y-1">
                      <div className="font-bold text-slate-800">{p.address}</div>
                      <div className="text-slate-500 font-medium">Context: {p.district || 'Punjab'} / {p.city} / {p.ward} / {p.area}</div>
                    </div>
                  ))}

                  <h4 className="font-bold text-slate-800 text-sm pt-2">Linked Smart Bins ({selectedCitizenDetails.bins?.length || 0})</h4>
                  {selectedCitizenDetails.bins?.map((b: any) => (
                    <div key={b.id} className="p-4 rounded-xl bg-nature-lightBg/40 border border-surface-border flex justify-between items-center">
                      <div>
                        <div className="font-bold text-slate-800">{b.qrCodeId} ({b.type})</div>
                        <div className="text-slate-500 font-medium">Fill Level: {b.fillLevel}%</div>
                      </div>
                      <span className={`px-3 py-1 rounded-full font-extrabold text-[10px] uppercase border ${b.status === 'OVERFLOWING' ? 'bg-rose-50 text-rose-700 border-rose-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>
                        {b.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

        </div>
      )}
    </div>
  );
}

