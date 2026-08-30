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
  workerProfileId?: string;
  workerId?: string;
  role?: string;
  joinedAt?: string;
  leftAt?: string | null;
  effectiveFrom?: string;
  effectiveUntil?: string | null;
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
  const [selectedRole, setSelectedRole] = useState('COLLECTOR');
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
        body: JSON.stringify({
          workerId: selectedWorkerId,
          role: selectedRole,
          effectiveFrom: new Date(memberJoinDate).toISOString(),
        }),
      });
      if (res.ok) {
        setSuccessMsg('Member added to team.');
        setMemberModal(null);
        setSelectedWorkerId('');
        setSelectedRole('COLLECTOR');
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
          <h1 className="text-3xl font-extrabold text-slate-800 tracking-tight">Collection Teams</h1>
          <p className="text-sm text-slate-650 mt-2 font-medium">Manage waste collection teams, memberships and supervisors</p>
        </div>
        <button
          onClick={() => { setShowCreateForm(!showCreateForm); setErrorMsg(''); setSuccessMsg(''); }}
          className="btn-primary"
        >
          {showCreateForm ? 'Cancel' : '+ New Team'}
        </button>
      </div>

      {/* Feedback */}
      {errorMsg && (
        <div className="p-4 rounded-xl border border-red-200 bg-red-50 text-red-700 text-sm font-medium">{errorMsg}</div>
      )}
      {successMsg && (
        <div className="p-4 rounded-xl border border-nature-accent bg-nature-white/80 text-slate-800 text-sm font-medium">{successMsg}</div>
      )}

      {/* Create Form */}
      {showCreateForm && (
        <form onSubmit={handleCreateTeam} className="glass-card p-6 space-y-4">
          <h2 className="text-lg font-bold text-slate-800 uppercase tracking-wider">Create New Team</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-slate-500 font-bold uppercase tracking-wider mb-1">Team Name</label>
              <input
                type="text" required value={teamName}
                onChange={e => setTeamName(e.target.value)}
                className="input-field"
                placeholder="Team Alpha"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 font-bold uppercase tracking-wider mb-1">Vehicle Registration (optional)</label>
              <input
                type="text" value={vehicleReg}
                onChange={e => setVehicleReg(e.target.value)}
                className="input-field"
                placeholder="MH-01-AB-1234"
              />
            </div>
          </div>
          <div className="flex justify-end pt-2">
            <button type="submit" disabled={isSubmitting} className="btn-primary">
              {isSubmitting ? 'Creating...' : 'Create Team'}
            </button>
          </div>
        </form>
      )}

      {/* Teams Grid */}
      {isLoading ? (
        <div className="glass-card p-12 text-center text-slate-500 text-sm font-medium">Loading teams...</div>
      ) : teams.length === 0 ? (
        <div className="glass-card p-12 text-center">
          <div className="text-4xl mb-3">🚛</div>
          <p className="text-slate-650 text-sm font-semibold">No collection teams yet. Create the first one above.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {teams.map(team => (
            <div key={team.id} className="glass-card !p-0 overflow-hidden">
              {/* Team Header */}
              <div className="px-6 py-5 flex items-center justify-between flex-wrap gap-4 sm:flex-nowrap">
                <div className="flex items-center gap-4">
                  <div className="h-12 w-12 rounded-[16px] bg-nature-accent/20 border border-nature-accent/30 flex items-center justify-center text-nature-earth font-bold text-lg shadow-sm">
                    {team.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div className="font-extrabold text-slate-800 text-base">{team.name}</div>
                    <div className="text-xs text-slate-500 mt-1 font-semibold">
                      {team.vehicleRegistration ? `🚛 ${team.vehicleRegistration}` : 'No vehicle assigned'} ·{' '}
                      {team.supervisor ? `Supervisor: ${team.supervisor.email || team.supervisor.user?.email}` : 'No supervisor'}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap shrink-0">
                  <span className={`px-2.5 py-1 rounded-lg text-xs font-bold border ${team.isActive ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
                    {team.isActive ? 'Active' : 'Inactive'}
                  </span>
                  <button
                    onClick={() => { setSupervisorModal(team.id); setSelectedSupervisorId(''); }}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-surface-border hover:bg-nature-lightBg text-slate-650 transition"
                  >
                    Set Supervisor
                  </button>
                  <button
                    onClick={() => { setMemberModal(team.id); setSelectedWorkerId(''); }}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-surface-border hover:bg-nature-lightBg text-slate-650 transition"
                  >
                    Add Member
                  </button>
                  <button
                    onClick={() => setExpandedTeam(expandedTeam === team.id ? null : team.id)}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-surface-border hover:bg-nature-lightBg text-slate-650 transition"
                  >
                    {expandedTeam === team.id ? 'Collapse' : 'Members'}
                  </button>
                </div>
              </div>

              {/* Expanded Members */}
              {expandedTeam === team.id && (
                <div className="border-t border-surface-border bg-nature-lightBg/30 px-6 py-4">
                  {!team.memberships || team.memberships.length === 0 ? (
                    <p className="text-xs text-slate-500 font-semibold">No active members. Add workers to this team.</p>
                  ) : (
                    <div className="space-y-2">
                      {team.memberships.filter(m => !m.effectiveUntil || new Date(m.effectiveUntil) > new Date()).map(m => (
                        <div key={m.id} className="flex items-center justify-between py-3 px-4 rounded-xl bg-nature-white border border-surface-border shadow-sm">
                          <div>
                            <span className="text-sm font-bold text-slate-800">{m.worker?.email || m.worker?.user?.email || m.workerId}</span>
                            <span className="ml-2 text-xs text-slate-500 font-mono font-medium">({m.worker?.employeeCode || m.worker?.employeeId})</span>
                            <span className="ml-2 text-xs text-slate-600 font-medium">· {m.role} since {m.effectiveFrom ? new Date(m.effectiveFrom).toLocaleDateString() : 'N/A'}</span>
                          </div>
                          <button
                            onClick={() => handleRemoveMember(m.id)}
                            className="text-xs text-red-600 hover:text-red-800 transition px-3 py-1.5 rounded-lg hover:bg-red-50 font-bold border border-transparent hover:border-red-200"
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
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-nature-white border border-surface-border rounded-[24px] p-8 w-full max-w-sm shadow-glass-hover space-y-6">
            <h3 className="text-xl font-bold text-slate-800 tracking-tight">Add Team Member</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-xs text-slate-500 font-bold uppercase tracking-wider mb-1">Select Worker</label>
                <select
                  value={selectedWorkerId}
                  onChange={e => setSelectedWorkerId(e.target.value)}
                  className="input-field"
                >
                  <option value="">— Select worker —</option>
                  {workers.map(w => (
                    <option key={w.id} value={w.id}>{w.email} ({w.employeeId})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-500 font-bold uppercase tracking-wider mb-1">Role</label>
                <select
                  value={selectedRole}
                  onChange={e => setSelectedRole(e.target.value)}
                  className="input-field"
                >
                  <option value="COLLECTOR">Collector</option>
                  <option value="DRIVER">Driver</option>
                  <option value="TEAM_LEAD">Team Lead</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-500 font-bold uppercase tracking-wider mb-1">Join Date</label>
                <input
                  type="date"
                  value={memberJoinDate}
                  onChange={e => setMemberJoinDate(e.target.value)}
                  className="input-field"
                />
              </div>
            </div>
            <div className="flex gap-3 pt-4 border-t border-surface-border">
              <button onClick={() => setMemberModal(null)} className="btn-secondary flex-1">
                Cancel
              </button>
              <button onClick={handleAddMember} disabled={isSubmitting || !selectedWorkerId} className="btn-primary flex-1">
                {isSubmitting ? 'Adding...' : 'Add Member'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Assign Supervisor Modal */}
      {supervisorModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-nature-white border border-surface-border rounded-[24px] p-8 w-full max-w-sm shadow-glass-hover space-y-6">
            <h3 className="text-xl font-bold text-slate-800 tracking-tight">Assign Supervisor</h3>
            <div>
              <label className="block text-xs text-slate-500 font-bold uppercase tracking-wider mb-1">Select Supervisor</label>
              <select
                value={selectedSupervisorId}
                onChange={e => setSelectedSupervisorId(e.target.value)}
                className="input-field"
              >
                <option value="">— Select supervisor —</option>
                {workers
                  .filter(w => w.user?.role === 'SUPERVISOR' || w.user?.role === 'FACILITY_MANAGER' || w.user?.role === 'SYSTEM_ADMIN')
                  .map(w => (
                    <option key={w.id} value={w.id}>{w.user?.email || w.employeeId} ({w.user?.role})</option>
                  ))}
              </select>
            </div>
            <div className="flex gap-3 pt-4 border-t border-surface-border">
              <button onClick={() => setSupervisorModal(null)} className="btn-secondary flex-1">
                Cancel
              </button>
              <button onClick={handleAssignSupervisor} disabled={isSubmitting || !selectedSupervisorId} className="btn-primary flex-1">
                {isSubmitting ? 'Assigning...' : 'Assign'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
