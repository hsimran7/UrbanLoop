import React, { useEffect } from 'react';
import { useAuth } from '../../context/auth-context';
import { useNavigate, useLocation } from "react-router-dom";
import { Link, Outlet } from "react-router-dom";
import { getSocket } from '../../utils/socket';
import { ErrorBoundary } from '../../components/ui/ErrorBoundary';

export default function DashboardLayout() {
  const { user, isLoading, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation(); const pathname = location.pathname;

  useEffect(() => {
    if (!isLoading && !user) {
      navigate('/login');
    }
  }, [user, isLoading, navigate]);

  useEffect(() => {
    if (!user) return;
    const socket = getSocket('realtime');
    const handleDeactivated = (data: { userId?: string }) => {
      if (data.userId === user.id) {
        alert('Your account has been deactivated by an administrator.');
        logout();
        navigate('/login');
      }
    };
    socket.on('accountDeactivated', handleDeactivated);
    return () => {
      socket.off('accountDeactivated', handleDeactivated);
    };
  }, [user, logout, navigate]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center relative overflow-hidden bg-transparent">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-96 w-96 bg-nature-accent/20 rounded-full blur-[120px]"></div>
        <div className="h-16 w-16 rounded-[20px] bg-nature-accent flex items-center justify-center font-bold text-white text-2xl shadow-xl shadow-nature-accent/25 animate-pulse mb-6">
          UL
        </div>
        <div className="h-6 w-6 border-2 border-nature-accent border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  const isAdmin = ['SYSTEM_ADMIN', 'GOVERNMENT_OFFICIAL', 'SUPERVISOR', 'FACILITY_MANAGER'].includes(user.role);
  const isWorker = ['WORKER', 'DRIVER'].includes(user.role);

  const roleColors: Record<string, string> = {
    CITIZEN: 'bg-nature-softGreen text-slate-800 border-nature-accent/40',
    WORKER: 'bg-nature-accent text-slate-900 border-nature-accent',
    DRIVER: 'bg-nature-accent text-slate-900 border-nature-accent',
    GOVERNMENT_OFFICIAL: 'bg-slate-200 text-slate-800 border-slate-300',
    SUPERVISOR: 'bg-nature-earth/20 text-slate-800 border-nature-earth/40',
    FACILITY_MANAGER: 'bg-nature-earth/20 text-slate-800 border-nature-earth/40',
    SYSTEM_ADMIN: 'bg-slate-800 text-white border-slate-900',
  };

  const activeLinkClass = 'bg-nature-accent/20 border-l-4 border-nature-accent text-slate-900 font-semibold rounded-r-2xl';
  const inactiveLinkClass = 'border-l-4 border-transparent text-slate-600 hover:bg-nature-lightBg/50 hover:text-slate-900 transition rounded-r-2xl';

  return (
    <div className="min-h-screen bg-transparent text-slate-800 flex flex-col md:flex-row">
      {/* Sidebar */}
      <aside className="w-full md:w-64 glass-card m-0 md:m-4 md:mr-0 flex flex-col justify-between shrink-0 overflow-hidden border-none shadow-glass-soft">
        <div>
          {/* Logo */}
          <div className="p-6 border-b border-surface-border flex items-center space-x-3">
            <div className="h-8 w-8 rounded-xl bg-nature-accent flex items-center justify-center font-bold text-slate-900 text-base shadow-sm">
              UL
            </div>
            <span className="font-extrabold text-lg text-slate-900 tracking-tight">
              UrbanLoop
            </span>
          </div>

          {/* User profile */}
          <div className="p-6 border-b border-surface-border">
            <div className="text-sm font-semibold text-slate-800 truncate">{user.email}</div>
            <div className={`mt-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border uppercase tracking-wider leading-normal select-none shadow-sm ${roleColors[user.role] || 'bg-slate-100 text-slate-600 border-slate-200'}`}>
              {user.role.replace('_', ' ')}
            </div>
          </div>

          {/* Nav links */}
          <nav className="py-6 flex flex-col pr-4">
            <Link
              to="/dashboard"
              className={`px-6 py-3 text-sm flex items-center space-x-3 ${
                pathname === '/dashboard' ? activeLinkClass : inactiveLinkClass
              }`}
            >
              <span>Dashboard Overview</span>
            </Link>

            {/* If admin, render admin links */}
            {isAdmin ? (
              <>
                <Link to="/dashboard/admin/properties" className={`px-6 py-3 text-sm flex items-center space-x-3 ${pathname === '/dashboard/admin/properties' ? activeLinkClass : inactiveLinkClass}`}>
                  <span>Verification Queue</span>
                </Link>
                <Link to="/dashboard/admin/bins" className={`px-6 py-3 text-sm flex items-center space-x-3 ${pathname === '/dashboard/admin/bins' ? activeLinkClass : inactiveLinkClass}`}>
                  <span>Municipal Bins Grid</span>
                </Link>
                <Link to="/dashboard/admin/schedules" className={`px-6 py-3 text-sm flex items-center space-x-3 ${pathname === '/dashboard/admin/schedules' ? activeLinkClass : inactiveLinkClass}`}>
                  <span>Schedule Management</span>
                </Link>
                
                <div className="px-6 pt-4 pb-1">
                  <div className="text-xs font-semibold uppercase tracking-widest text-slate-500">Workforce</div>
                </div>
                
                <Link to="/dashboard/admin/workforce" className={`px-6 py-3 text-sm flex items-center space-x-3 ${pathname === '/dashboard/admin/workforce' ? activeLinkClass : inactiveLinkClass}`}>
                  <span>Workers</span>
                </Link>
                <Link to="/dashboard/admin/teams" className={`px-6 py-3 text-sm flex items-center space-x-3 ${pathname === '/dashboard/admin/teams' ? activeLinkClass : inactiveLinkClass}`}>
                  <span>Collection Teams</span>
                </Link>
                <Link to="/dashboard/admin/shifts" className={`px-6 py-3 text-sm flex items-center space-x-3 ${pathname === '/dashboard/admin/shifts' ? activeLinkClass : inactiveLinkClass}`}>
                  <span>Shifts</span>
                </Link>
                <Link to="/dashboard/admin/zones" className={`px-6 py-3 text-sm flex items-center space-x-3 ${pathname === '/dashboard/admin/zones' ? activeLinkClass : inactiveLinkClass}`}>
                  <span>Service Zones</span>
                </Link>
                <Link to="/dashboard/admin/assignments" className={`px-6 py-3 text-sm flex items-center space-x-3 ${pathname === '/dashboard/admin/assignments' ? activeLinkClass : inactiveLinkClass}`}>
                  <span>Daily Assignments</span>
                </Link>
                <Link to="/dashboard/admin/operations" className={`px-6 py-3 text-sm flex items-center space-x-3 ${pathname === '/dashboard/admin/operations' ? activeLinkClass : inactiveLinkClass}`}>
                  <span>Operations Control</span>
                </Link>
                <Link to="/dashboard/admin/facility" className={`px-6 py-3 text-sm flex items-center space-x-3 ${pathname === '/dashboard/admin/facility' ? activeLinkClass : inactiveLinkClass}`}>
                  <span>Facility Intake</span>
                </Link>
                <Link to="/dashboard/admin/traceability" className={`px-6 py-3 text-sm flex items-center space-x-3 ${pathname === '/dashboard/admin/traceability' ? activeLinkClass : inactiveLinkClass}`}>
                  <span>Government Trace</span>
                </Link>
                <Link to="/dashboard/admin/service-requests" className={`px-6 py-3 text-sm flex items-center space-x-3 ${pathname === '/dashboard/admin/service-requests' ? activeLinkClass : inactiveLinkClass}`}>
                  <span>Service Requests</span>
                </Link>
                <Link to="/dashboard/admin/fleet" className={`px-6 py-3 text-sm flex items-center space-x-3 ${pathname === '/dashboard/admin/fleet' ? activeLinkClass : inactiveLinkClass}`}>
                  <span>Fleet Live Tracking</span>
                </Link>
                <Link to="/dashboard/admin/command-center" className={`px-6 py-3 text-sm flex items-center space-x-3 ${pathname === '/dashboard/admin/command-center' ? activeLinkClass : inactiveLinkClass}`}>
                  <span>Command Center</span>
                </Link>
                <Link to="/dashboard/admin/ai-intelligence" className={`px-6 py-3 text-sm flex items-center space-x-3 ${pathname === '/dashboard/admin/ai-intelligence' ? activeLinkClass : inactiveLinkClass}`}>
                  <span>AI Decision Intelligence</span>
                </Link>
              </>
            ) : isWorker ? (
              <>
                <Link to="/dashboard/worker" className={`px-6 py-3 text-sm flex items-center space-x-3 ${pathname === '/dashboard/worker' ? activeLinkClass : inactiveLinkClass}`}>
                  <span>Today's Work Plan</span>
                </Link>
                <Link to="/dashboard/worker/driver" className={`px-6 py-3 text-sm flex items-center space-x-3 ${pathname === '/dashboard/worker/driver' ? activeLinkClass : inactiveLinkClass}`}>
                  <span>Operator Board</span>
                </Link>
              </>
            ) : (
              <>
                <Link to="/dashboard/properties" className={`px-6 py-3 text-sm flex items-center space-x-3 ${pathname === '/dashboard/properties' ? activeLinkClass : inactiveLinkClass}`}>
                  <span>My Properties</span>
                </Link>
                <Link to="/dashboard/bins" className={`px-6 py-3 text-sm flex items-center space-x-3 ${pathname === '/dashboard/bins' ? activeLinkClass : inactiveLinkClass}`}>
                  <span>My Waste Bins</span>
                </Link>
                <Link to="/dashboard/schedules" className={`px-6 py-3 text-sm flex items-center space-x-3 ${pathname === '/dashboard/schedules' ? activeLinkClass : inactiveLinkClass}`}>
                  <span>Waste Schedules</span>
                </Link>
                <Link to="/dashboard/citizen/history" className={`px-6 py-3 text-sm flex items-center space-x-3 ${pathname === '/dashboard/citizen/history' ? activeLinkClass : inactiveLinkClass}`}>
                  <span>Emptying History</span>
                </Link>
                <Link to="/dashboard/complaints" className={`px-6 py-3 text-sm flex items-center space-x-3 ${pathname === '/dashboard/complaints' ? activeLinkClass : inactiveLinkClass}`}>
                  <span>Support Requests</span>
                </Link>
              </>
            )}
          </nav>
        </div>

        {/* Logout button */}
        <div className="p-6 border-t border-surface-border">
          <button
            onClick={logout}
            className="w-full py-2.5 rounded-[16px] text-sm font-medium border border-nature-neutral/40 hover:bg-red-50 hover:border-red-200 hover:text-red-700 active:scale-95 transition-all flex items-center justify-center space-x-2"
          >
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-grow p-6 md:p-8 overflow-y-auto max-w-7xl">
        <ErrorBoundary>
          <Outlet />
        </ErrorBoundary>
      </main>
    </div>
  );
}
