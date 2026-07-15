'use client';

import React, { useState, useEffect } from 'react';
import { apiRequest } from '../../../../utils/api';

type EmploymentStatus = 'PROBATION' | 'ACTIVE' | 'ON_LEAVE' | 'SUSPENDED' | 'TERMINATED';
type UserRole = 'WORKER' | 'SUPERVISOR' | 'FACILITY_MANAGER';

interface Worker {
  id: string;
  employeeId: string;
  employmentStatus: EmploymentStatus;
  user: {
    id: string;
    email: string;
    role: UserRole;
    status: string;
  };
  hireDate: string;
  specializations: string[];
}

const STATUS_COLORS: Record<EmploymentStatus, string> = {
  PROBATION:  'from-yellow-500/20 to-yellow-600/10 text-yellow-300 border-yellow-500/30',
  ACTIVE:     'from-emerald-500/20 to-emerald-600/10 text-emerald-300 border-emerald-500/30',
  ON_LEAVE:   'from-blue-500/20 to-blue-600/10 text-blue-300 border-blue-500/30',
  SUSPENDED:  'from-orange-500/20 to-orange-600/10 text-orange-300 border-orange-500/30',
  TERMINATED: 'from-red-500/20 to-red-600/10 text-red-300 border-red-500/30',
};

const ROLES: UserRole[] = ['WORKER', 'SUPERVISOR', 'FACILITY_MANAGER'];
const STATUSES: EmploymentStatus[] = ['PROBATION', 'ACTIVE', 'ON_LEAVE', 'SUSPENDED', 'TERMINATED'];

export default function WorkforceManagementPage() {
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showInviteForm, setShowInviteForm] = useState(false);

  // Invite form state
  const [inviteEmail, setInviteEmail] = useState('');
  const [invitePassword, setInvitePassword] = useState('');
  const [inviteRole, setInviteRole] = useState<UserRole>('WORKER');
  const [inviteEmployeeId, setInviteEmployeeId] = useState('');
  const [inviteHireDate, setInviteHireDate] = useState(new Date().toISOString().split('T')[0]);
  const [inviteSpecs, setInviteSpecs] = useState('');

  // Status update modal
  const [statusModal, setStatusModal] = useState<{ workerId: string; current: EmploymentStatus } | null>(null);
  const [newStatus, setNewStatus] = useState<EmploymentStatus>('ACTIVE');

  useEffect(() => {
    fetchWorkers();
  }, []);

  async function fetchWorkers() {
    setIsLoading(true);
    try {
      const res = await apiRequest('/workforce/workers');
      if (res.ok) {
        const data = await res.json();
        setWorkers(data);
      } else {
        setErrorMsg('Failed to load workers.');
      }
    } catch {
      setErrorMsg('Network error while loading workers.');
    } finally {
      setIsLoading(false);
    }
  }

  async function handleInviteWorker(e: React.FormEvent) {
    e.preventDefault();
    setIsSubmitting(true);
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const res = await apiRequest('/workforce/workers', {
        method: 'POST',
        body: JSON.stringify({
          email: inviteEmail,
          password: invitePassword,
          role: inviteRole,
          employeeId: inviteEmployeeId,
          hireDate: inviteHireDate,
          specializations: inviteSpecs.split(',').map(s => s.trim()).filter(Boolean),
        }),
      });
      if (res.ok) {
        setSuccessMsg('Worker invited successfully.');
        setShowInviteForm(false);
        setInviteEmail(''); setInvitePassword(''); setInviteEmployeeId(''); setInviteSpecs('');
        fetchWorkers();
      } else {
        const data = await res.json();
        setErrorMsg(data.message || 'Failed to invite worker.');
      }
    } catch {
      setErrorMsg('Network error. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleStatusUpdate() {
    if (!statusModal) return;
    setIsSubmitting(true);
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const res = await apiRequest(`/workforce/workers/${statusModal.workerId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        setSuccessMsg('Worker status updated.');
        setStatusModal(null);
        fetchWorkers();
      } else {
        const data = await res.json();
        setErrorMsg(data.message || 'Failed to update status.');
      }
    } catch {
      setErrorMsg('Network error. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Workforce Management</h1>
          <p className="text-sm text-slate-400 mt-1">Manage municipal workers, supervisors and facility managers</p>
        </div>
        <button
          onClick={() => { setShowInviteForm(!showInviteForm); setErrorMsg(''); setSuccessMsg(''); }}
          className="px-4 py-2 rounded-xl text-sm font-semibold bg-gradient-to-r from-emerald-500 to-teal-400 text-slate-950 hover:opacity-90 active:scale-95 transition shadow-lg shadow-emerald-500/20"
        >
          {showInviteForm ? 'Cancel' : '+ Invite Worker'}
        </button>
      </div>

      {/* Feedback */}
      {errorMsg && (
        <div className="p-4 rounded-xl border border-red-500/30 bg-red-950/20 text-red-300 text-sm">{errorMsg}</div>
      )}
      {successMsg && (
        <div className="p-4 rounded-xl border border-emerald-500/30 bg-emerald-950/20 text-emerald-300 text-sm">{successMsg}</div>
      )}

      {/* Invite Form */}
      {showInviteForm && (
        <form onSubmit={handleInviteWorker} className="p-6 rounded-2xl border border-slate-800 bg-slate-900/60 backdrop-blur space-y-4">
          <h2 className="text-base font-semibold text-slate-200">Invite New Worker</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Email Address</label>
              <input
                type="email"
                required
                value={inviteEmail}
                onChange={e => setInviteEmail(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 text-sm focus:outline-none focus:border-emerald-500/50"
                placeholder="worker@municipality.gov"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Temporary Password</label>
              <input
                type="password"
                required
                value={invitePassword}
                onChange={e => setInvitePassword(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 text-sm focus:outline-none focus:border-emerald-500/50"
                placeholder="Set initial password"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Role</label>
              <select
                value={inviteRole}
                onChange={e => setInviteRole(e.target.value as UserRole)}
                className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 text-sm focus:outline-none focus:border-emerald-500/50"
              >
                {ROLES.map(r => (
                  <option key={r} value={r}>{r.replace('_', ' ')}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Employee ID</label>
              <input
                type="text"
                required
                value={inviteEmployeeId}
                onChange={e => setInviteEmployeeId(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 text-sm focus:outline-none focus:border-emerald-500/50"
                placeholder="EMP-001"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Hire Date</label>
              <input
                type="date"
                required
                value={inviteHireDate}
                onChange={e => setInviteHireDate(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 text-sm focus:outline-none focus:border-emerald-500/50"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Specializations (comma separated)</label>
              <input
                type="text"
                value={inviteSpecs}
                onChange={e => setInviteSpecs(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 text-sm focus:outline-none focus:border-emerald-500/50"
                placeholder="DRY, WET, E_WASTE"
              />
            </div>
          </div>
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 rounded-xl text-sm font-semibold bg-gradient-to-r from-emerald-500 to-teal-400 text-slate-950 hover:opacity-90 active:scale-95 transition disabled:opacity-50"
            >
              {isSubmitting ? 'Inviting...' : 'Send Invite'}
            </button>
          </div>
        </form>
      )}

      {/* Workers Table */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/40 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-200">All Workers</h2>
          <span className="text-xs text-slate-500">{workers.length} records</span>
        </div>
        {isLoading ? (
          <div className="p-12 text-center text-slate-500 text-sm">Loading workforce data...</div>
        ) : workers.length === 0 ? (
          <div className="p-12 text-center">
            <div className="text-4xl mb-3">👷</div>
            <p className="text-slate-400 text-sm">No workers registered yet. Invite your first worker above.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800 text-xs text-slate-500 uppercase tracking-wider">
                  <th className="px-6 py-3 text-left">Employee ID</th>
                  <th className="px-6 py-3 text-left">Email</th>
                  <th className="px-6 py-3 text-left">Role</th>
                  <th className="px-6 py-3 text-left">Status</th>
                  <th className="px-6 py-3 text-left">Hire Date</th>
                  <th className="px-6 py-3 text-left">Specializations</th>
                  <th className="px-6 py-3 text-left">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {workers.map(w => (
                  <tr key={w.id} className="hover:bg-slate-800/20 transition">
                    <td className="px-6 py-4 font-mono text-xs text-slate-300">{w.employeeId}</td>
                    <td className="px-6 py-4 text-slate-200">{w.user.email}</td>
                    <td className="px-6 py-4">
                      <span className="px-2 py-0.5 rounded-md text-xs font-medium bg-cyan-500/10 text-cyan-300 border border-cyan-500/20">
                        {w.user.role.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-0.5 rounded-md text-xs font-medium bg-gradient-to-r border ${STATUS_COLORS[w.employmentStatus]}`}>
                        {w.employmentStatus.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-slate-400 text-xs">{w.hireDate ? new Date(w.hireDate).toLocaleDateString() : '—'}</td>
                    <td className="px-6 py-4">
                      <div className="flex flex-wrap gap-1">
                        {(w.specializations || []).map(s => (
                          <span key={s} className="px-1.5 py-0.5 rounded text-xs bg-slate-700 text-slate-300">{s}</span>
                        ))}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <button
                        onClick={() => { setStatusModal({ workerId: w.id, current: w.employmentStatus }); setNewStatus(w.employmentStatus); }}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-700 hover:border-emerald-500/40 hover:text-emerald-400 transition"
                      >
                        Update Status
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Status Update Modal */}
      {statusModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <h3 className="text-base font-semibold text-slate-100 mb-4">Update Employment Status</h3>
            <p className="text-xs text-slate-400 mb-4">
              Current: <span className={`px-1.5 py-0.5 rounded text-xs bg-gradient-to-r border ${STATUS_COLORS[statusModal.current]}`}>{statusModal.current}</span>
            </p>
            <select
              value={newStatus}
              onChange={e => setNewStatus(e.target.value as EmploymentStatus)}
              className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 text-sm focus:outline-none focus:border-emerald-500/50 mb-4"
            >
              {STATUSES.map(s => (
                <option key={s} value={s}>{s.replace('_', ' ')}</option>
              ))}
            </select>
            <div className="flex gap-3">
              <button
                onClick={() => setStatusModal(null)}
                className="flex-1 py-2 rounded-xl text-sm font-medium border border-slate-700 hover:border-slate-600 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleStatusUpdate}
                disabled={isSubmitting}
                className="flex-1 py-2 rounded-xl text-sm font-semibold bg-gradient-to-r from-emerald-500 to-teal-400 text-slate-950 hover:opacity-90 transition disabled:opacity-50"
              >
                {isSubmitting ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
