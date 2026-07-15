'use client';

import React, { useEffect } from 'react';
import { useAuth } from '../../context/auth-context';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, isLoading, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!isLoading && !user) {
      router.push('/login');
    }
  }, [user, isLoading, router]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center relative overflow-hidden">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-96 w-96 bg-emerald-500/5 rounded-full blur-[120px]"></div>
        <div className="h-16 w-16 rounded-2xl bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center font-bold text-slate-950 text-2xl shadow-xl shadow-emerald-500/25 animate-pulse mb-6">
          UL
        </div>
        <div className="h-6 w-6 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  const isOfficial = user.role === 'SYSTEM_ADMIN' || user.role === 'GOVERNMENT_OFFICIAL';
  const isWorker = user.role === 'WORKER' || user.role === 'SUPERVISOR' || user.role === 'FACILITY_MANAGER';

  const roleColors: Record<string, string> = {
    CITIZEN: 'from-emerald-500/20 to-emerald-500/10 text-emerald-300 border-emerald-500/20',
    WORKER: 'from-teal-500/20 to-teal-500/10 text-teal-300 border-teal-500/20',
    GOVERNMENT_OFFICIAL: 'from-cyan-500/20 to-cyan-500/10 text-cyan-300 border-cyan-500/20',
    SYSTEM_ADMIN: 'from-purple-500/20 to-purple-500/10 text-purple-300 border-purple-500/20',
  };

  const activeLinkClass = 'bg-slate-900 border-l-4 border-emerald-500 text-slate-100 font-semibold';
  const inactiveLinkClass = 'border-l-4 border-transparent text-slate-400 hover:bg-slate-900/50 hover:text-slate-100 transition';

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col md:flex-row">
      {/* Sidebar */}
      <aside className="w-full md:w-64 border-b md:border-b-0 md:border-r border-slate-900 bg-slate-950 flex flex-col justify-between shrink-0">
        <div>
          {/* Logo */}
          <div className="p-6 border-b border-slate-900 flex items-center space-x-3">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center font-bold text-slate-950 text-base shadow-md shadow-emerald-500/10">
              UL
            </div>
            <span className="font-extrabold text-lg bg-gradient-to-r from-emerald-400 to-teal-300 bg-clip-text text-transparent">
              UrbanLoop
            </span>
          </div>

          {/* User profile */}
          <div className="p-6 border-b border-slate-900">
            <div className="text-sm font-semibold text-slate-200 truncate">{user.email}</div>
            <div className="mt-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-gradient-to-r border uppercase tracking-wider leading-normal select-none shadow-sm shadow-black/20 status-badge">
              <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium bg-gradient-to-r ${roleColors[user.role] || 'from-slate-500/20 to-slate-500/10 text-slate-300 border-slate-500/20'}`}>
                {user.role.replace('_', ' ')}
              </span>
            </div>
          </div>

          {/* Nav links */}
          <nav className="py-6 flex flex-col">
            <Link
              href="/dashboard"
              className={`px-6 py-3 text-sm flex items-center space-x-3 ${
                pathname === '/dashboard' ? activeLinkClass : inactiveLinkClass
              }`}
            >
              <span>Dashboard Overview</span>
            </Link>

            {/* If official, render admin links, otherwise render citizen links */}
            {isOfficial ? (
              <>
                <Link
                  href="/dashboard/admin/properties"
                  className={`px-6 py-3 text-sm flex items-center space-x-3 ${
                    pathname === '/dashboard/admin/properties' ? activeLinkClass : inactiveLinkClass
                  }`}
                >
                  <span>Verification Queue</span>
                </Link>
                <Link
                  href="/dashboard/admin/bins"
                  className={`px-6 py-3 text-sm flex items-center space-x-3 ${
                    pathname === '/dashboard/admin/bins' ? activeLinkClass : inactiveLinkClass
                  }`}
                >
                  <span>Municipal Bins Grid</span>
                </Link>
                <Link
                  href="/dashboard/admin/schedules"
                  className={`px-6 py-3 text-sm flex items-center space-x-3 ${
                    pathname === '/dashboard/admin/schedules' ? activeLinkClass : inactiveLinkClass
                  }`}
                >
                  <span>Schedule Management</span>
                </Link>

                {/* Phase 5: Workforce management */}
                <div className="px-6 pt-4 pb-1">
                  <div className="text-xs font-semibold uppercase tracking-widest text-slate-600">Workforce</div>
                </div>
                <Link
                  href="/dashboard/admin/workforce"
                  className={`px-6 py-3 text-sm flex items-center space-x-3 ${
                    pathname === '/dashboard/admin/workforce' ? activeLinkClass : inactiveLinkClass
                  }`}
                >
                  <span>Workers</span>
                </Link>
                <Link
                  href="/dashboard/admin/teams"
                  className={`px-6 py-3 text-sm flex items-center space-x-3 ${
                    pathname === '/dashboard/admin/teams' ? activeLinkClass : inactiveLinkClass
                  }`}
                >
                  <span>Collection Teams</span>
                </Link>
                <Link
                  href="/dashboard/admin/shifts"
                  className={`px-6 py-3 text-sm flex items-center space-x-3 ${
                    pathname === '/dashboard/admin/shifts' ? activeLinkClass : inactiveLinkClass
                  }`}
                >
                  <span>Shifts</span>
                </Link>
                <Link
                  href="/dashboard/admin/zones"
                  className={`px-6 py-3 text-sm flex items-center space-x-3 ${
                    pathname === '/dashboard/admin/zones' ? activeLinkClass : inactiveLinkClass
                  }`}
                >
                  <span>Service Zones</span>
                </Link>
                <Link
                  href="/dashboard/admin/assignments"
                  className={`px-6 py-3 text-sm flex items-center space-x-3 ${
                    pathname === '/dashboard/admin/assignments' ? activeLinkClass : inactiveLinkClass
                  }`}
                >
                  <span>Daily Assignments</span>
                </Link>
                <Link
                  href="/dashboard/supervisor/operations"
                  className={`px-6 py-3 text-sm flex items-center space-x-3 ${
                    pathname === '/dashboard/supervisor/operations' ? activeLinkClass : inactiveLinkClass
                  }`}
                >
                  <span>Operations Control</span>
                </Link>
              </>
            ) : isWorker ? (
              <>
                <Link
                  href="/dashboard/worker"
                  className={`px-6 py-3 text-sm flex items-center space-x-3 ${
                    pathname === '/dashboard/worker' ? activeLinkClass : inactiveLinkClass
                  }`}
                >
                  <span>Today's Work Plan</span>
                </Link>
                {user.role === 'SUPERVISOR' && (
                  <Link
                    href="/dashboard/supervisor/operations"
                    className={`px-6 py-3 text-sm flex items-center space-x-3 ${
                      pathname === '/dashboard/supervisor/operations' ? activeLinkClass : inactiveLinkClass
                    }`}
                  >
                    <span>Operations Control</span>
                  </Link>
                )}
              </>
            ) : (
              <>
                <Link
                  href="/dashboard/properties"
                  className={`px-6 py-3 text-sm flex items-center space-x-3 ${
                    pathname === '/dashboard/properties' ? activeLinkClass : inactiveLinkClass
                  }`}
                >
                  <span>My Properties</span>
                </Link>
                <Link
                  href="/dashboard/bins"
                  className={`px-6 py-3 text-sm flex items-center space-x-3 ${
                    pathname === '/dashboard/bins' ? activeLinkClass : inactiveLinkClass
                  }`}
                >
                  <span>My Waste Bins</span>
                </Link>
                <Link
                  href="/dashboard/schedules"
                  className={`px-6 py-3 text-sm flex items-center space-x-3 ${
                    pathname === '/dashboard/schedules' ? activeLinkClass : inactiveLinkClass
                  }`}
                >
                  <span>Waste Schedules</span>
                </Link>
                <Link
                  href="/dashboard/citizen/history"
                  className={`px-6 py-3 text-sm flex items-center space-x-3 ${
                    pathname === '/dashboard/citizen/history' ? activeLinkClass : inactiveLinkClass
                  }`}
                >
                  <span>Emptying History</span>
                </Link>
              </>
            )}
          </nav>
        </div>

        {/* Logout button */}
        <div className="p-6 border-t border-slate-900">
          <button
            onClick={logout}
            className="w-full py-2.5 rounded-xl text-sm font-semibold border border-slate-800 hover:border-rose-500/30 hover:bg-rose-950/10 hover:text-rose-400 active:scale-98 transition flex items-center justify-center space-x-2"
          >
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-grow p-6 md:p-8 overflow-y-auto max-w-7xl">
        {children}
      </main>
    </div>
  );
}
