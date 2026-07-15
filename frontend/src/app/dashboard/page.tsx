'use client';

import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/auth-context';
import { apiRequest } from '../../utils/api';
import Link from 'next/link';

interface City {
  id: string;
  name: string;
  state: string;
  wards: { id: string; number: number; name: string }[];
}

export default function DashboardPage() {
  const { user } = useAuth();
  const [cities, setCities] = useState<City[]>([]);
  const [stats, setStats] = useState({ properties: 0, bins: 0, pending: 0 });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchDashboardData() {
      try {
        // Fetch geography list
        const geoRes = await apiRequest('/geo/cities');
        if (geoRes.ok) {
          const citiesData = await geoRes.json();
          // For each city, fetch wards to illustrate grid hierarchy
          const enrichedCities = await Promise.all(
            citiesData.map(async (city: any) => {
              const wardRes = await apiRequest(`/geo/cities/${city.id}/wards`);
              const wards = wardRes.ok ? await wardRes.ok ? await wardRes.json() : [] : [];
              return { ...city, wards };
            })
          );
          setCities(enrichedCities);
        }

        // Fetch properties & bins to generate summary counts
        const propRes = await apiRequest('/properties');
        const binRes = await apiRequest('/bins');

        const properties = propRes.ok ? await propRes.json() : [];
        const bins = binRes.ok ? await binRes.json() : [];

        const pending = properties.filter((p: any) => p.status === 'PENDING').length;

        setStats({
          properties: properties.length,
          bins: bins.length,
          pending,
        });
      } catch (err) {
        console.error('Error fetching dashboard summary:', err);
      } finally {
        setIsLoading(false);
      }
    }

    fetchDashboardData();
  }, []);

  if (!user) return null;

  const isOfficial = user.role === 'SYSTEM_ADMIN' || user.role === 'GOVERNMENT_OFFICIAL';

  return (
    <div className="space-y-8">
      {/* Header card */}
      <div className="p-8 rounded-2xl border border-slate-800/80 bg-gradient-to-r from-slate-900 to-slate-950 relative overflow-hidden">
        <div className="absolute top-0 right-0 h-40 w-40 bg-emerald-500/5 blur-3xl pointer-events-none"></div>
        <h1 className="text-3xl font-extrabold tracking-tight">
          Welcome back, <span className="text-emerald-400 font-bold">{user.email.split('@')[0]}</span>
        </h1>
        <p className="text-slate-400 mt-2 max-w-2xl text-sm leading-relaxed">
          Manage your smart waste services, review municipal collection grids, and track recycling metrics from your tailored command panel.
        </p>
      </div>

      {/* Metrics Summaries */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="p-6 rounded-2xl border border-slate-900 bg-slate-950/60 backdrop-blur relative overflow-hidden group hover:border-slate-800 transition">
          <div className="text-slate-500 text-xs font-bold uppercase tracking-wider mb-2">Registered Properties</div>
          <div className="text-3xl font-black text-slate-100 mb-1">{stats.properties}</div>
          <p className="text-slate-500 text-xs">
            {isOfficial ? 'Total properties across municipal database' : 'Properties registered under your ownership'}
          </p>
        </div>

        <div className="p-6 rounded-2xl border border-slate-900 bg-slate-950/60 backdrop-blur relative overflow-hidden group hover:border-slate-800 transition">
          <div className="text-slate-500 text-xs font-bold uppercase tracking-wider mb-2">Allocated Smart Bins</div>
          <div className="text-3xl font-black text-slate-100 mb-1">{stats.bins}</div>
          <p className="text-slate-500 text-xs">
            {isOfficial ? 'Active smart bins reporting telemetry' : 'IoT Bins associated with your verified properties'}
          </p>
        </div>

        {isOfficial ? (
          <div className="p-6 rounded-2xl border border-slate-900 bg-slate-950/60 backdrop-blur relative overflow-hidden group hover:border-slate-800 transition">
            <div className="text-slate-500 text-xs font-bold uppercase tracking-wider mb-2">Pending Verifications</div>
            <div className="text-3xl font-black text-rose-400 mb-1">{stats.pending}</div>
            <p className="text-slate-500 text-xs">Citizen properties awaiting municipal validation</p>
          </div>
        ) : (
          <div className="p-6 rounded-2xl border border-slate-900 bg-slate-950/60 backdrop-blur relative overflow-hidden group hover:border-slate-800 transition">
            <div className="text-slate-500 text-xs font-bold uppercase tracking-wider mb-2">Account Status</div>
            <div className="text-3xl font-black text-emerald-400 mb-1">{user.status}</div>
            <p className="text-slate-500 text-xs">Verification and validation active</p>
          </div>
        )}
      </div>

      {/* Quick Links & Geography List */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Quick Links */}
        <div className="lg:col-span-1 p-6 rounded-2xl border border-slate-900 bg-slate-950/40 space-y-4">
          <h3 className="text-lg font-bold text-slate-200 border-b border-slate-900 pb-3">Quick Navigation</h3>
          {isOfficial ? (
            <div className="flex flex-col gap-3">
              <Link
                href="/dashboard/admin/properties"
                className="w-full py-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-center font-bold text-sm text-emerald-400 transition"
              >
                Go to Verification Queue ({stats.pending})
              </Link>
              <Link
                href="/dashboard/admin/bins"
                className="w-full py-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-center font-bold text-sm text-emerald-400 transition"
              >
                Manage Bins Directory
              </Link>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <Link
                href="/dashboard/properties"
                className="w-full py-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-center font-bold text-sm text-emerald-400 transition"
              >
                Register a Property
              </Link>
              <Link
                href="/dashboard/bins"
                className="w-full py-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-center font-bold text-sm text-emerald-400 transition"
              >
                Check Bin Statuses
              </Link>
            </div>
          )}
        </div>

        {/* Municipal Coverage */}
        <div className="lg:col-span-2 p-6 rounded-2xl border border-slate-900 bg-slate-950/40">
          <h3 className="text-lg font-bold text-slate-200 border-b border-slate-900 pb-3 mb-4">
            Active Municipal Grid Coverage
          </h3>
          {isLoading ? (
            <div className="h-24 flex items-center justify-center">
              <span className="h-5 w-5 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin"></span>
            </div>
          ) : cities.length === 0 ? (
            <div className="p-8 text-center text-slate-500 text-sm">
              No municipal coverage grids seeded yet. Run database seeds.
            </div>
          ) : (
            <div className="space-y-4">
              {cities.map((city) => (
                <div key={city.id} className="p-4 rounded-xl bg-slate-900/50 border border-slate-900">
                  <div className="flex justify-between items-center mb-2">
                    <span className="font-bold text-slate-200">{city.name}</span>
                    <span className="text-xs text-slate-500 uppercase font-semibold">{city.state}</span>
                  </div>
                  <div className="text-xs text-slate-400">
                    Wards:{' '}
                    {city.wards.length === 0 ? (
                      <span className="text-slate-600">None registered</span>
                    ) : (
                      city.wards.map((w) => `Ward ${w.number} (${w.name})`).join(', ')
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
