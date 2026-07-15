'use client';

import React, { useState, useEffect } from 'react';
import { apiRequest } from '../../../../utils/api';

interface Worker {
  id: string;
  employeeId: string;
  user: { email: string; role: string };
  employmentStatus: string;
}

interface TeamMember {
  id: string;
  workerProfileId: string;
  joinedAt: string;
  leftAt: string | null;
  worker?: {
    employeeId: string;
    user: { email: string };
  };
}

interface Team {
  id: string;
  name: string;
  vehicleRegistration: string | null;
  supervisorId: string | null;
  isActive: boolean;
  supervisor?: { employeeId: string; user: { email: string } };
  memberships?: TeamMember[];
  _count?: { memberships: number };
}

export default function TeamsManagementPage() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [expandedTeam, setExpandedTeam] = useState<string | null>(null);

  // Create team form
  const [teamName, setTeamName] = useState('');
  const [vehicleReg, setVehicleReg] = useState('');

  // Add member modal
  const [memberModal, setMemberModal] = useState<string | null>(null); // teamId
  const [selectedWorkerId, setSelectedWorkerId] = useState('');
  const [memberJoinDate, setMemberJoinDate] = useState(new Date().toISOString().split('T')[0]);

  // Supervisor modal
  const [supervisorModal, setSupervisorModal] = useState<string | null>(null);
  const [selectedSupervisorId, setSelectedSupervisorId] = useState('');

  useEffect(() => {
    fetchTeams();
    fetchWorkers();
  }, []);

  async function fetchTeams() {
    setIsLoading(true);
    try {
      const res = await apiRequest('/teams');
      if (res.ok) setTeams(await res.json());
      else setErrorMsg('Failed to load teams.');
    } catch {
      setErrorMsg('Network error loading teams.');
    } finally {
      setIsLoading(false);
    }
  }

  async function fetchWorkers() {
    try {
      const res = await apiRequest('/workforce/workers');
      if (res.ok) setWorkers(await res.json());
    } catch { /* silently fail */ }
  }

  async function handleCreateTeam(e: React.FormEvent) {
    e.preventDefault();
    setIsSubmitting(true);
    setErrorMsg(''); setSuccessMsg('');
    try {
      const res = await apiRequest('/teams', {
        method: 'POST',
        body: JSON.stringify({ name: teamName, vehicleRegistration: vehicleReg || null }),
      });
      if (res.ok) {
        setSuccessMsg('Team created successfully.');
        setShowCreateForm(false);
        setTeamName(''); setVehicleReg('');
        fetchTeams();
      } else {
        const data = await res.json();
        setErrorMsg(data.message || 'Failed to create team.');
      }
    } catch {
      setErrorMsg('Network error. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleAddMember() {
    if (!memberModal || !selectedWorkerId) return;
    setIsSubmitting(true);
    setErrorMsg(''); setSuccessMsg('');
    try {
      const res = await apiRequest(`/teams/${memberModal}/members`, {
        method: 'POST',
        body: JSON.stringify({ workerProfileId: selectedWorkerId, joinedAt: memberJoinDate }),
      });
      if (res.ok) {
        setSuccessMsg('Member added to team.');
        setMemberModal(null);
        setSelectedWorkerId('');
        fetchTeams();
      } else {
        const data = await res.json();
        setErrorMsg(data.message || 'Failed to add member.');
      }
    } catch {
      setErrorMsg('Network error. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleAssignSupervisor() {
    if (!supervisorModal || !selectedSupervisorId) return;
    setIsSubmitting(true);
    setErrorMsg(''); setSuccessMsg('');
    try {
      const res = await apiRequest(`/teams/${supervisorModal}/supervisor`, {
        method: 'PATCH',
        body: JSON.stringify({ supervisorId: selectedSupervisorId }),
      });
      if (res.ok) {
        setSuccessMsg('Supervisor assigned.');
        setSupervisorModal(null);
        setSelectedSupervisorId('');
        fetchTeams();
      } else {
        const data = await res.json();
        setErrorMsg(data.message || 'Failed to assign supervisor.');
      }
    } catch {
      setErrorMsg('Network error. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleRemoveMember(membershipId: string) {
    setIsSubmitting(true);
    setErrorMsg(''); setSuccessMsg('');
    try {
      const res = await apiRequest(`/teams/memberships/${membershipId}`, { method: 'DELETE' });
      if (res.ok) {
        setSuccessMsg('Member removed.');
        fetchTeams();
      } else {
        const data = await res.json();
        setErrorMsg(data.message || 'Failed to remove member.');
      }
    } catch {
      setErrorMsg('Network error.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Collection Teams</h1>
          <p className="text-sm text-slate-400 mt-1">Manage waste collection teams, memberships and supervisors</p>
        </div>
        <button
          onClick={() => { setShowCreateForm(!showCreateForm); setErrorMsg(''); setSuccessMsg(''); }}
          className="px-4 py-2 rounded-xl text-sm font-semibold bg-gradient-to-r from-emerald-500 to-teal-400 text-slate-950 hover:opacity-90 active:scale-95 transition shadow-lg shadow-emerald-500/20"
        >
          {showCreateForm ? 'Cancel' : '+ New Team'}
        </button>
      </div>

      {/* Feedback */}
      {errorMsg && (
        <div className="p-4 rounded-xl border border-red-500/30 bg-red-950/20 text-red-300 text-sm">{errorMsg}</div>
      )}
      {successMsg && (
        <div className="p-4 rounded-xl border border-emerald-500/30 bg-emerald-950/20 text-emerald-300 text-sm">{successMsg}</div>
      )}

      {/* Create Form */}
      {showCreateForm && (
        <form onSubmit={handleCreateTeam} className="p-6 rounded-2xl border border-slate-800 bg-slate-900/60 backdrop-blur space-y-4">
          <h2 className="text-base font-semibold text-slate-200">Create New Team</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Team Name</label>
              <input
                type="text" required value={teamName}
                onChange={e => setTeamName(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 text-sm focus:outline-none focus:border-emerald-500/50"
                placeholder="Team Alpha"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Vehicle Registration (optional)</label>
              <input
                type="text" value={vehicleReg}
                onChange={e => setVehicleReg(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 text-sm focus:outline-none focus:border-emerald-500/50"
                placeholder="MH-01-AB-1234"
              />
            </div>
          </div>
          <div className="flex justify-end">
            <button type="submit" disabled={isSubmitting}
              className="px-5 py-2 rounded-xl text-sm font-semibold bg-gradient-to-r from-emerald-500 to-teal-400 text-slate-950 hover:opacity-90 transition disabled:opacity-50">
              {isSubmitting ? 'Creating...' : 'Create Team'}
            </button>
          </div>
        </form>
      )}

      {/* Teams Grid */}
      {isLoading ? (
        <div className="p-12 text-center text-slate-500 text-sm">Loading teams...</div>
      ) : teams.length === 0 ? (
        <div className="p-12 text-center rounded-2xl border border-slate-800 bg-slate-900/40">
          <div className="text-4xl mb-3">🚛</div>
          <p className="text-slate-400 text-sm">No collection teams yet. Create the first one above.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {teams.map(team => (
            <div key={team.id} className="rounded-2xl border border-slate-800 bg-slate-900/40 overflow-hidden">
              {/* Team Header */}
              <div className="px-6 py-4 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-teal-500/20 to-emerald-500/10 border border-teal-500/20 flex items-center justify-center text-teal-400 font-bold text-sm">
                    {team.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div className="font-semibold text-slate-200">{team.name}</div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      {team.vehicleRegistration ? `🚛 ${team.vehicleRegistration}` : 'No vehicle assigned'} ·{' '}
                      {team.supervisor ? `Supervisor: ${team.supervisor.user.email}` : 'No supervisor'}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-0.5 rounded-md text-xs font-medium border ${team.isActive ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20' : 'bg-red-500/10 text-red-300 border-red-500/20'}`}>
                    {team.isActive ? 'Active' : 'Inactive'}
                  </span>
                  <button
                    onClick={() => { setSupervisorModal(team.id); setSelectedSupervisorId(''); }}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-700 hover:border-cyan-500/40 hover:text-cyan-400 transition"
                  >
                    Set Supervisor
                  </button>
                  <button
                    onClick={() => { setMemberModal(team.id); setSelectedWorkerId(''); }}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-700 hover:border-emerald-500/40 hover:text-emerald-400 transition"
                  >
                    Add Member
                  </button>
                  <button
                    onClick={() => setExpandedTeam(expandedTeam === team.id ? null : team.id)}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-700 hover:border-slate-600 transition"
                  >
                    {expandedTeam === team.id ? 'Collapse' : 'Members'}
                  </button>
                </div>
              </div>

              {/* Expanded Members */}
              {expandedTeam === team.id && (
                <div className="border-t border-slate-800 px-6 py-4">
                  {!team.memberships || team.memberships.length === 0 ? (
                    <p className="text-xs text-slate-500">No active members. Add workers to this team.</p>
                  ) : (
                    <div className="space-y-2">
                      {team.memberships.filter(m => !m.leftAt).map(m => (
                        <div key={m.id} className="flex items-center justify-between py-2 px-3 rounded-lg bg-slate-800/40">
                          <div>
                            <span className="text-sm text-slate-200">{m.worker?.user.email || m.workerProfileId}</span>
                            <span className="ml-2 text-xs text-slate-500">{m.worker?.employeeId}</span>
                            <span className="ml-2 text-xs text-slate-600">since {new Date(m.joinedAt).toLocaleDateString()}</span>
                          </div>
                          <button
                            onClick={() => handleRemoveMember(m.id)}
                            className="text-xs text-red-400/60 hover:text-red-400 transition px-2 py-1 rounded-lg hover:bg-red-950/20"
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add Member Modal */}
      {memberModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <h3 className="text-base font-semibold text-slate-100 mb-4">Add Team Member</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Select Worker</label>
                <select
                  value={selectedWorkerId}
                  onChange={e => setSelectedWorkerId(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 text-sm focus:outline-none focus:border-emerald-500/50"
                >
                  <option value="">— Select worker —</option>
                  {workers.map(w => (
                    <option key={w.id} value={w.id}>{w.user.email} ({w.employeeId})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Join Date</label>
                <input
                  type="date"
                  value={memberJoinDate}
                  onChange={e => setMemberJoinDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 text-sm focus:outline-none focus:border-emerald-500/50"
                />
              </div>
            </div>
            <div className="flex gap-3 mt-4">
              <button onClick={() => setMemberModal(null)}
                className="flex-1 py-2 rounded-xl text-sm font-medium border border-slate-700 hover:border-slate-600 transition">
                Cancel
              </button>
              <button onClick={handleAddMember} disabled={isSubmitting || !selectedWorkerId}
                className="flex-1 py-2 rounded-xl text-sm font-semibold bg-gradient-to-r from-emerald-500 to-teal-400 text-slate-950 hover:opacity-90 transition disabled:opacity-50">
                {isSubmitting ? 'Adding...' : 'Add Member'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Assign Supervisor Modal */}
      {supervisorModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <h3 className="text-base font-semibold text-slate-100 mb-4">Assign Supervisor</h3>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Select Supervisor</label>
              <select
                value={selectedSupervisorId}
                onChange={e => setSelectedSupervisorId(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 text-sm focus:outline-none focus:border-emerald-500/50"
              >
                <option value="">— Select supervisor —</option>
                {workers
                  .filter(w => w.user.role === 'SUPERVISOR' || w.user.role === 'FACILITY_MANAGER')
                  .map(w => (
                    <option key={w.id} value={w.id}>{w.user.email} ({w.user.role})</option>
                  ))}
              </select>
            </div>
            <div className="flex gap-3 mt-4">
              <button onClick={() => setSupervisorModal(null)}
                className="flex-1 py-2 rounded-xl text-sm font-medium border border-slate-700 hover:border-slate-600 transition">
                Cancel
              </button>
              <button onClick={handleAssignSupervisor} disabled={isSubmitting || !selectedSupervisorId}
                className="flex-1 py-2 rounded-xl text-sm font-semibold bg-gradient-to-r from-emerald-500 to-teal-400 text-slate-950 hover:opacity-90 transition disabled:opacity-50">
                {isSubmitting ? 'Assigning...' : 'Assign'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
