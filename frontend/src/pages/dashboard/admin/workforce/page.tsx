import React, { useState, useEffect } from 'react';
import { apiRequest } from '../../../../utils/api';
import { SearchableSelect } from '../../../../components/ui/SearchableSelect';

type EmploymentStatus = 'ACTIVE' | 'INACTIVE' | 'SUSPENDED' | 'ON_LEAVE';
type UserRole = 'WORKER' | 'SUPERVISOR' | 'FACILITY_MANAGER';

interface Worker {
  id: string;
  userId: string;
  employeeCode: string;
  employmentStatus: EmploymentStatus;
  phone: string | null;
  joinedAt: string;
  specializations: string[];
  // Flat fields from backend
  name: string;
  email: string;
  role: UserRole;
  status: 'PENDING' | 'ACTIVE' | 'SUSPENDED';
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
  const pendingWorkers = workers.filter(w => (w.status === 'PENDING' || w.employmentStatus === 'INACTIVE') && w != null);
  const activeWorkers = workers.filter(w => w != null && w.status !== 'PENDING' && w.employmentStatus !== 'INACTIVE');

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="glass-card p-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-800 tracking-tight">Workforce Management</h1>
          <p className="text-sm text-slate-500 mt-1 font-medium">Manage municipal worker approvals, profiles, and account activations.</p>
        </div>
        <button
          onClick={() => { setShowInviteForm(!showInviteForm); setErrorMsg(''); setSuccessMsg(''); }}
          className="btn-primary"
        >
          {showInviteForm ? 'Cancel' : '+ Seed Active Worker'}
        </button>
      </div>

      {/* Messages */}
      {errorMsg && (
        <div className="p-4 rounded-xl border border-red-200 bg-red-50 text-red-700 text-sm font-medium">{errorMsg}</div>
      )}
      {successMsg && (
        <div className="p-4 rounded-xl border border-nature-accent bg-nature-white/80 text-emerald-700 text-sm font-medium">{successMsg}</div>
      )}

      {/* Invite Worker Form (Admin Seed) */}
      {showInviteForm && (
        <form onSubmit={handleInviteWorker} className="glass-card p-6 space-y-4">
          <h2 className="text-base font-bold text-slate-800">Seed New Active Worker</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-slate-500 mb-1 font-semibold uppercase tracking-wider">Email Address</label>
              <input
                type="email"
                required
                value={inviteEmail}
                onChange={e => setInviteEmail(e.target.value)}
                className="input-field"
                placeholder="worker@municipality.gov"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1 font-semibold uppercase tracking-wider">Password</label>
              <input
                type="password"
                required
                value={invitePassword}
                onChange={e => setInvitePassword(e.target.value)}
                className="input-field"
                placeholder="Initial password"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1 font-semibold uppercase tracking-wider">Role</label>
              <SearchableSelect
                value={inviteRole}
                onChange={(val) => setInviteRole(val as UserRole)}
                options={ROLES.map(r => ({ value: r, label: r.replace('_', ' ') }))}
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1 font-semibold uppercase tracking-wider">Employee ID</label>
              <input
                type="text"
                required
                value={inviteEmployeeId}
                onChange={e => setInviteEmployeeId(e.target.value)}
                className="input-field"
                placeholder="EMP-102"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1 font-semibold uppercase tracking-wider">Phone Number</label>
              <input
                type="text"
                required
                value={invitePhone}
                onChange={e => setInvitePhone(e.target.value)}
                className="input-field"
                placeholder="+919999999999"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1 font-semibold uppercase tracking-wider">Specializations (comma separated)</label>
              <input
                type="text"
                value={inviteSpecs}
                onChange={e => setInviteSpecs(e.target.value)}
                className="input-field"
                placeholder="DRY, WET, E_WASTE"
              />
            </div>
          </div>
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={isSubmitting}
              className="btn-primary disabled:opacity-50"
            >
              {isSubmitting ? 'Seeding...' : 'Seed Profile'}
            </button>
          </div>
        </form>
      )}

      {/* Tabs */}
      <div className="flex border-b border-surface-border text-sm">
        <button
          onClick={() => setActiveTab('ACTIVE')}
          className={`px-6 py-3 font-bold transition border-b-2 -mb-px ${
            activeTab === 'ACTIVE' ? 'border-nature-accent text-nature-earth' : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          Active Workforce ({activeWorkers.length})
        </button>
        <button
          onClick={() => setActiveTab('PENDING')}
          className={`px-6 py-3 font-bold transition border-b-2 -mb-px ${
            activeTab === 'PENDING' ? 'border-nature-accent text-nature-earth' : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          Pending Approvals ({pendingWorkers.length})
        </button>
      </div>

      {/* Table */}
      <div className="glass-card !p-0 overflow-hidden">
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
                  <tr className="border-b border-surface-border bg-nature-lightBg text-slate-500 font-bold uppercase">
                    <th className="px-6 py-3">Employee ID</th>
                    <th className="px-6 py-3">Email Address</th>
                    <th className="px-6 py-3">Phone</th>
                    <th className="px-6 py-3">Request Date</th>
                    <th className="px-6 py-3 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-border">
                  {pendingWorkers.map(w => (
                    <tr key={w.id} className="hover:bg-nature-lightBg/50 transition">
                      <td className="px-6 py-4 font-mono text-slate-700 font-semibold">{w.employeeCode}</td>
                      <td className="px-6 py-4 text-slate-700">{w.email}</td>
                      <td className="px-6 py-4 text-slate-500">{w.phone || '—'}</td>
                      <td className="px-6 py-4 text-slate-500">{new Date(w.joinedAt).toLocaleDateString()}</td>
                      <td className="px-6 py-4">
                        <div className="flex justify-center space-x-2">
                          <button
                            onClick={() => handleApprove(w.id)}
                            className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition"
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => handleReject(w.id)}
                            className="px-3.5 py-1.5 rounded-lg border border-red-200 hover:bg-red-50 text-red-600 font-bold text-xs transition"
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
                  <tr className="border-b border-surface-border bg-nature-lightBg text-slate-500 font-bold uppercase">
                    <th className="px-6 py-3">Employee ID</th>
                    <th className="px-6 py-3">Email Address</th>
                    <th className="px-6 py-3">Role</th>
                    <th className="px-6 py-3">Employment Status</th>
                    <th className="px-6 py-3">Specializations</th>
                    <th className="px-6 py-3 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-border">
                  {activeWorkers.map(w => (
                    <tr key={w.id} className="hover:bg-nature-lightBg/50 transition">
                      <td className="px-6 py-4 font-mono text-slate-700 font-semibold">{w.employeeCode}</td>
                      <td className="px-6 py-4 text-slate-700">{w.email}</td>
                      <td className="px-6 py-4">
                        <span className="px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200 font-semibold">
                          {w.role}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-0.5 rounded font-semibold border text-xs ${
                          w.employmentStatus === 'ACTIVE'
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : 'bg-amber-50 text-amber-700 border-amber-200'
                        }`}>
                          {w.employmentStatus}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-slate-500">{w.specializations.join(', ')}</td>
                      <td className="px-6 py-4">
                        <div className="flex justify-center space-x-2">
                          <button
                            onClick={() => { setStatusModal({ workerId: w.id, current: w.employmentStatus }); setNewStatus(w.employmentStatus); }}
                            className="px-3 py-1.5 rounded-lg border border-surface-border hover:bg-nature-lightBg text-slate-600 font-bold text-xs transition"
                          >
                            Update Status
                          </button>
                          <button
                            onClick={() => handleDeactivate(w.id)}
                            className="px-3 py-1.5 rounded-lg border border-red-200 hover:bg-red-50 text-red-600 font-bold text-xs transition"
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
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-nature-white border border-surface-border rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <h3 className="text-base font-bold text-slate-800 mb-4">Update Employment Status</h3>
            <p className="text-xs text-slate-500 mb-4">
              Current: <span className="font-semibold text-nature-earth">{statusModal.current}</span>
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
                className="flex-1 py-2 rounded-xl border border-surface-border hover:bg-nature-lightBg text-slate-600 font-bold transition"
              >
                Cancel
              </button>
              <button
                onClick={handleStatusUpdate}
                disabled={isSubmitting}
                className="flex-1 py-2 btn-primary disabled:opacity-50"
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
