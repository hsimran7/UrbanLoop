'use client';

import React, { useState, useEffect } from 'react';
import { apiRequest } from '../../../../utils/api';
import { SearchableSelect } from '../../../../components/ui/SearchableSelect';

type EmploymentStatus = 'ACTIVE' | 'INACTIVE' | 'SUSPENDED' | 'ON_LEAVE';
type UserRole = 'WORKER' | 'SUPERVISOR' | 'FACILITY_MANAGER';

interface Worker {
  id: string;
  employeeId: string;
  employeeCode: string;
  employmentStatus: EmploymentStatus;
  phone: string | null;
  joinedAt: string;
  hireDate: string;
  specializations: string[];
  user: {
    id: string;
    email: string;
    role: UserRole;
    status: 'PENDING' | 'ACTIVE' | 'SUSPENDED';
  };
}

const ROLES: UserRole[] = ['WORKER', 'SUPERVISOR', 'FACILITY_MANAGER'];

export default function WorkforceManagementPage() {
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'ACTIVE' | 'PENDING'>('ACTIVE');
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showInviteForm, setShowInviteForm] = useState(false);

  // Invite form state
  const [inviteEmail, setInviteEmail] = useState('');
  const [invitePassword, setInvitePassword] = useState('');
  const [inviteRole, setInviteRole] = useState<UserRole>('WORKER');
  const [inviteEmployeeId, setInviteEmployeeId] = useState('');
  const [invitePhone, setInvitePhone] = useState('');
  const [inviteSpecs, setInviteSpecs] = useState('');

  // Status update modal
  const [statusModal, setStatusModal] = useState<{ workerId: string; current: EmploymentStatus } | null>(null);
  const [newStatus, setNewStatus] = useState<EmploymentStatus>('ACTIVE');

  useEffect(() => {
    fetchWorkers();
  }, []);

  async function fetchWorkers() {
    setIsLoading(true);
    setErrorMsg('');
    try {
      const res = await apiRequest('/workforce/workers');
      if (res.ok) {
        setWorkers(await res.json());
      } else {
        setErrorMsg('Failed to load workforce directory.');
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
          employeeCode: inviteEmployeeId,
          phone: invitePhone,
          specializations: inviteSpecs.split(',').map(s => s.trim()).filter(Boolean),
        }),
      });
      if (res.ok) {
        setSuccessMsg('Worker invited successfully with active profile.');
        setShowInviteForm(false);
        setInviteEmail('');
        setInvitePassword('');
        setInviteEmployeeId('');
        setInvitePhone('');
        setInviteSpecs('');
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

  async function handleApprove(workerId: string) {
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const res = await apiRequest(`/workforce/workers/${workerId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'ACTIVE' }),
      });
      if (res.ok) {
        setSuccessMsg('Worker account has been approved and activated.');
        fetchWorkers();
      } else {
        const data = await res.json();
        setErrorMsg(data.message || 'Failed to approve worker.');
      }
    } catch {
      setErrorMsg('Network error.');
    }
  }

  async function handleReject(workerId: string) {
    if (!confirm('Are you sure you want to reject this worker registration request?')) return;
    setErrorMsg('');
    setSuccessMsg('');
    try {
      // Rejection suspends/deactivates the user
      const res = await apiRequest(`/workforce/workers/${workerId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'SUSPENDED' }),
      });
      if (res.ok) {
        setSuccessMsg('Worker registration rejected.');
        fetchWorkers();
      } else {
        const data = await res.json();
        setErrorMsg(data.message || 'Failed to reject worker.');
      }
    } catch {
      setErrorMsg('Network error.');
    }
  }

  async function handleDeactivate(workerId: string) {
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const res = await apiRequest(`/workforce/workers/${workerId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'SUSPENDED' }),
      });
      if (res.ok) {
        setSuccessMsg('Worker account has been deactivated (suspended).');
        fetchWorkers();
      } else {
        const data = await res.json();
        setErrorMsg(data.message || 'Failed to deactivate worker.');
      }
    } catch {
      setErrorMsg('Network error.');
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
        setSuccessMsg('Worker status updated successfully.');
        setStatusModal(null);
        fetchWorkers();
      } else {
        const data = await res.json();
        setErrorMsg(data.message || 'Failed to update status.');
      }
    } catch {
      setErrorMsg('Network error.');
    } finally {
      setIsSubmitting(false);
    }
  }

  // Filter based on tabs
  const pendingWorkers = workers.filter(w => w.user.status === 'PENDING' || w.employmentStatus === 'INACTIVE');
  const activeWorkers = workers.filter(w => w.user.status !== 'PENDING' && w.employmentStatus !== 'INACTIVE');

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Workforce Management</h1>
          <p className="text-sm text-slate-400 mt-1">Manage municipal worker approvals, profiles, and account activations.</p>
        </div>
        <button
          onClick={() => { setShowInviteForm(!showInviteForm); setErrorMsg(''); setSuccessMsg(''); }}
          className="px-4 py-2 rounded-xl text-sm font-semibold bg-gradient-to-r from-emerald-500 to-teal-400 text-slate-950 hover:opacity-90 active:scale-95 transition shadow-lg shadow-emerald-500/20 cursor-pointer"
        >
          {showInviteForm ? 'Cancel' : '+ Seed Active Worker'}
        </button>
      </div>

      {/* Messages */}
      {errorMsg && (
        <div className="p-4 rounded-xl border border-red-500/30 bg-red-950/20 text-red-300 text-sm">{errorMsg}</div>
      )}
      {successMsg && (
        <div className="p-4 rounded-xl border border-emerald-500/30 bg-emerald-950/20 text-emerald-350 text-sm">{successMsg}</div>
      )}

      {/* Invite Worker Form (Admin Seed) */}
      {showInviteForm && (
        <form onSubmit={handleInviteWorker} className="p-6 rounded-2xl border border-slate-800 bg-slate-900/60 backdrop-blur space-y-4">
          <h2 className="text-base font-semibold text-slate-200">Seed New Active Worker</h2>
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
              <label className="block text-xs text-slate-400 mb-1">Password</label>
              <input
                type="password"
                required
                value={invitePassword}
                onChange={e => setInvitePassword(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 text-sm focus:outline-none focus:border-emerald-500/50"
                placeholder="Initial password"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Role</label>
              <SearchableSelect
                value={inviteRole}
                onChange={(val) => setInviteRole(val as UserRole)}
                options={ROLES.map(r => ({ value: r, label: r.replace('_', ' ') }))}
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Employee ID</label>
              <input
                type="text"
                required
                value={inviteEmployeeId}
                onChange={e => setInviteEmployeeId(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 text-sm focus:outline-none focus:border-emerald-500/50"
                placeholder="EMP-102"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Phone Number</label>
              <input
                type="text"
                required
                value={invitePhone}
                onChange={e => setInvitePhone(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 text-sm focus:outline-none focus:border-emerald-500/50"
                placeholder="+919999999999"
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
              className="px-5 py-2 rounded-xl text-sm font-semibold bg-gradient-to-r from-emerald-500 to-teal-400 text-slate-950 hover:opacity-90 transition disabled:opacity-50"
            >
              {isSubmitting ? 'Seeding...' : 'Seed Profile'}
            </button>
          </div>
        </form>
      )}

      {/* Tabs */}
      <div className="flex border-b border-slate-800 text-sm">
        <button
          onClick={() => setActiveTab('ACTIVE')}
          className={`px-6 py-3 font-semibold transition ${activeTab === 'ACTIVE' ? 'border-b-2 border-emerald-500 text-emerald-400' : 'text-slate-500 hover:text-slate-300'}`}
        >
          Active Workforce ({activeWorkers.length})
        </button>
        <button
          onClick={() => setActiveTab('PENDING')}
          className={`px-6 py-3 font-semibold transition ${activeTab === 'PENDING' ? 'border-b-2 border-emerald-500 text-emerald-400' : 'text-slate-500 hover:text-slate-300'}`}
        >
          Pending Approvals ({pendingWorkers.length})
        </button>
      </div>

      {/* Table */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/40 overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-slate-500 text-sm">Loading workforce data...</div>
        ) : activeTab === 'PENDING' ? (
          /* PENDING APPROVALS TAB */
          pendingWorkers.length === 0 ? (
            <div className="p-12 text-center text-slate-500">
              <span className="text-4xl block mb-2">🎉</span>
              <p className="text-sm">No pending worker approvals at the moment.</p>
            </div>
          ) : (
            <div className="overflow-x-auto text-xs">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-500 font-bold uppercase">
                    <th className="px-6 py-3">Employee ID</th>
                    <th className="px-6 py-3">Email Address</th>
                    <th className="px-6 py-3">Phone</th>
                    <th className="px-6 py-3">Request Date</th>
                    <th className="px-6 py-3 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-850">
                  {pendingWorkers.map(w => (
                    <tr key={w.id} className="hover:bg-slate-800/10">
                      <td className="px-6 py-4 font-mono text-slate-300 font-semibold">{w.employeeId}</td>
                      <td className="px-6 py-4 text-slate-200">{w.user.email}</td>
                      <td className="px-6 py-4 text-slate-400">{w.phone || '—'}</td>
                      <td className="px-6 py-4 text-slate-500">{new Date(w.joinedAt).toLocaleDateString()}</td>
                      <td className="px-6 py-4">
                        <div className="flex justify-center space-x-2">
                          <button
                            onClick={() => handleApprove(w.id)}
                            className="px-3.5 py-1.5 rounded-lg bg-emerald-500 hover:brightness-110 text-slate-950 font-bold transition active:scale-95"
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => handleReject(w.id)}
                            className="px-3.5 py-1.5 rounded-lg border border-rose-500/30 hover:bg-rose-500/10 text-rose-450 font-bold transition active:scale-95"
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
          )
        ) : (
          /* ACTIVE WORKFORCE TAB */
          activeWorkers.length === 0 ? (
            <div className="p-12 text-center text-slate-500">
              <span className="text-4xl block mb-2">👷</span>
              <p className="text-sm">No active workforce registered. Use top right to seed profile.</p>
            </div>
          ) : (
            <div className="overflow-x-auto text-xs">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-500 font-bold uppercase">
                    <th className="px-6 py-3">Employee ID</th>
                    <th className="px-6 py-3">Email Address</th>
                    <th className="px-6 py-3">Role</th>
                    <th className="px-6 py-3">Employment Status</th>
                    <th className="px-6 py-3">Specializations</th>
                    <th className="px-6 py-3 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-850">
                  {activeWorkers.map(w => (
                    <tr key={w.id} className="hover:bg-slate-800/10">
                      <td className="px-6 py-4 font-mono text-slate-300 font-semibold">{w.employeeId}</td>
                      <td className="px-6 py-4 text-slate-200">{w.user.email}</td>
                      <td className="px-6 py-4">
                        <span className="px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-400 font-semibold">
                          {w.user.role}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-0.5 rounded font-semibold border ${
                          w.employmentStatus === 'ACTIVE'
                            ? 'bg-emerald-950/20 text-emerald-400 border-emerald-500/20'
                            : 'bg-amber-950/20 text-amber-400 border-amber-500/20'
                        }`}>
                          {w.employmentStatus}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-slate-400">{w.specializations.join(', ')}</td>
                      <td className="px-6 py-4">
                        <div className="flex justify-center space-x-2">
                          <button
                            onClick={() => { setStatusModal({ workerId: w.id, current: w.employmentStatus }); setNewStatus(w.employmentStatus); }}
                            className="px-3 py-1.5 rounded-lg border border-slate-800 hover:border-slate-700 text-slate-350 transition active:scale-95"
                          >
                            Update Status
                          </button>
                          <button
                            onClick={() => handleDeactivate(w.id)}
                            className="px-3 py-1.5 rounded-lg border border-rose-500/20 hover:bg-rose-500/5 text-rose-450 transition active:scale-95"
                          >
                            Deactivate
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}
      </div>

      {/* Status Update Modal */}
      {statusModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <h3 className="text-base font-bold text-slate-100 mb-4">Update Employment Status</h3>
            <p className="text-xs text-slate-400 mb-4">
              Current: <span className="font-semibold text-emerald-400">{statusModal.current}</span>
            </p>
            <div className="mb-4">
              <SearchableSelect
                value={newStatus}
                onChange={(val) => setNewStatus(val as EmploymentStatus)}
                options={['ACTIVE', 'INACTIVE', 'SUSPENDED', 'ON_LEAVE'].map(s => ({ value: s, label: s }))}
              />
            </div>
            <div className="flex gap-3 text-xs">
              <button
                onClick={() => setStatusModal(null)}
                className="flex-1 py-2 rounded-xl border border-slate-750 hover:border-slate-700 text-slate-300 font-bold transition"
              >
                Cancel
              </button>
              <button
                onClick={handleStatusUpdate}
                disabled={isSubmitting}
                className="flex-1 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-400 text-slate-950 font-bold hover:opacity-95 transition"
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
