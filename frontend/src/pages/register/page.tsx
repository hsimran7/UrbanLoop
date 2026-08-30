import React, { useState } from 'react';
import { useAuth } from '../../context/auth-context';
import { Link } from "react-router-dom";

export default function RegisterPage() {
  const { register } = useAuth();
  
  // Registration flow state
  const [selectedRole, setSelectedRole] = useState<'CITIZEN' | 'WORKER' | null>(null);

  // Common Form States
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  
  // Worker-specific Form States
  const [employeeCode, setEmployeeCode] = useState('');

  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMsg('');
    setSuccessMsg('');

    if (selectedRole === 'CITIZEN' && password !== confirmPassword) {
      setErrorMsg('Passwords do not match.');
      setIsLoading(false);
      return;
    }

    const payload = {
      email,
      password,
      name,
      phone,
      role: selectedRole!,
      ...(selectedRole === 'WORKER' ? { employeeCode } : {}),
    };

    const result = await register(payload);
    if (result.success) {
      if (selectedRole === 'WORKER') {
        setSuccessMsg('Registration request submitted! Worker accounts stay PENDING until approved by a Government Admin.');
      } else {
        setSuccessMsg('Registration successful! You can now sign in immediately.');
      }
      setEmail('');
      setPassword('');
      setConfirmPassword('');
      setName('');
      setPhone('');
      setEmployeeCode('');
      setIsLoading(false);
    } else {
      setErrorMsg(result.error || 'Registration failed. Try again.');
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#EDECEC] flex flex-col justify-center items-center px-4 relative overflow-hidden">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[500px] w-[500px] bg-[#B7C396]/20 rounded-full blur-[100px] pointer-events-none"></div>

      <div className="w-full max-w-lg p-8 rounded-[24px] border border-[#CCCCCC] bg-[#FEFEFE] relative shadow-md">
        <div className="flex flex-col items-center mb-8">
          <Link to="/" className="h-12 w-12 rounded-xl bg-[#B7C396] flex items-center justify-center font-bold text-slate-900 text-2xl shadow-sm mb-4 hover:scale-105 transition-all">
            UL
          </Link>
          <h2 className="text-2xl font-extrabold tracking-tight text-slate-900">Create UrbanLoop Account</h2>
          <p className="text-slate-600 text-sm mt-1">Smart Municipal Waste Grid Portal</p>
        </div>

        {errorMsg && (
          <div className="mb-6 p-4 rounded-xl border border-rose-300 bg-rose-50 text-rose-700 text-sm font-medium">
            {errorMsg}
          </div>
        )}

        {successMsg && (
          <div className="mb-6 p-4 rounded-xl border border-emerald-300 bg-emerald-50 text-emerald-800 text-sm font-medium">
            {successMsg}
            <div className="mt-2 text-xs font-semibold text-[#BA9A91] underline">
              <Link to="/login">Proceed to Sign In →</Link>
            </div>
          </div>
        )}

        {/* STEP 1: CHOOSE ROLE */}
        {!selectedRole && !successMsg && (
          <div className="space-y-6">
            <h3 className="text-center font-bold text-slate-800 text-base mb-6">Choose Account Type</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <button
                onClick={() => setSelectedRole('CITIZEN')}
                className="p-6 rounded-2xl border border-[#CCCCCC] bg-[#FEFEFE] hover:border-[#B7C396] hover:bg-[#E0E7D7]/40 text-left transition duration-200 group cursor-pointer focus:outline-none shadow-sm"
              >
                <div className="text-3xl mb-2 group-hover:scale-110 transition-transform">🏡</div>
                <div className="font-extrabold text-slate-900 text-base mb-1">Citizen Account</div>
                <p className="text-slate-600 text-xs leading-relaxed">
                  Register properties, view trash collection schedules, and report support complaints.
                </p>
              </button>

              <button
                onClick={() => setSelectedRole('WORKER')}
                className="p-6 rounded-2xl border border-[#CCCCCC] bg-[#FEFEFE] hover:border-[#B7C396] hover:bg-[#E0E7D7]/40 text-left transition duration-200 group cursor-pointer focus:outline-none shadow-sm"
              >
                <div className="text-3xl mb-2 group-hover:scale-110 transition-transform">👷</div>
                <div className="font-extrabold text-slate-900 text-base mb-1">Worker Account</div>
                <p className="text-slate-600 text-xs leading-relaxed">
                  Access route assignments, collect smart bins, and upload evidence images.
                </p>
              </button>
            </div>
            <div className="text-center text-sm text-slate-500 mt-4">
              Already have an account?{' '}
              <Link to="/login" className="text-[#BA9A91] hover:underline font-semibold">
                Sign In
              </Link>
            </div>
          </div>
        )}

        {/* STEP 2: DYNAMIC REGISTRATION FORM */}
        {selectedRole && !successMsg && (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="flex justify-between items-center mb-4">
              <span className="text-xs font-bold text-slate-600 uppercase tracking-widest">
                Registering as: {selectedRole}
              </span>
              <button
                type="button"
                onClick={() => {
                  setSelectedRole(null);
                  setErrorMsg('');
                }}
                className="text-xs font-bold text-[#BA9A91] hover:underline"
              >
                Change Role
              </button>
            </div>

            <div>
              <label className="block text-slate-700 text-xs font-semibold mb-1.5" htmlFor="name">
                {selectedRole === 'CITIZEN' ? 'Full Name' : 'Name'}
              </label>
              <input
                id="name"
                type="text"
                required
                className="w-full px-4 py-2.5 rounded-xl bg-[#FEFEFE] border border-[#CCCCCC] focus:border-[#B7C396] focus:ring-2 focus:ring-[#B7C396]/50 focus:outline-none text-slate-800 text-sm transition-all placeholder:text-slate-400"
                placeholder={selectedRole === 'CITIZEN' ? 'e.g. John Doe' : 'e.g. Robert Smith'}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            {selectedRole === 'WORKER' && (
              <div>
                <label className="block text-slate-700 text-xs font-semibold mb-1.5" htmlFor="employeeCode">
                  Employee ID
                </label>
                <input
                  id="employeeCode"
                  type="text"
                  required
                  className="w-full px-4 py-2.5 rounded-xl bg-[#FEFEFE] border border-[#CCCCCC] focus:border-[#B7C396] focus:ring-2 focus:ring-[#B7C396]/50 focus:outline-none text-slate-800 text-sm transition-all placeholder:text-slate-400"
                  placeholder="e.g. EMP-104"
                  value={employeeCode}
                  onChange={(e) => setEmployeeCode(e.target.value)}
                />
              </div>
            )}

            <div>
              <label className="block text-slate-700 text-xs font-semibold mb-1.5" htmlFor="email">
                Email Address
              </label>
              <input
                id="email"
                type="email"
                required
                className="w-full px-4 py-2.5 rounded-xl bg-[#FEFEFE] border border-[#CCCCCC] focus:border-[#B7C396] focus:ring-2 focus:ring-[#B7C396]/50 focus:outline-none text-slate-800 text-sm transition-all placeholder:text-slate-400"
                placeholder="e.g. name@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-slate-700 text-xs font-semibold mb-1.5" htmlFor="phone">
                Phone Number
              </label>
              <input
                id="phone"
                type="text"
                required
                className="w-full px-4 py-2.5 rounded-xl bg-[#FEFEFE] border border-[#CCCCCC] focus:border-[#B7C396] focus:ring-2 focus:ring-[#B7C396]/50 focus:outline-none text-slate-800 text-sm transition-all placeholder:text-slate-400"
                placeholder="e.g. +919999999999"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-slate-700 text-xs font-semibold mb-1.5" htmlFor="password">
                Password
              </label>
              <input
                id="password"
                type="password"
                required
                className="w-full px-4 py-2.5 rounded-xl bg-[#FEFEFE] border border-[#CCCCCC] focus:border-[#B7C396] focus:ring-2 focus:ring-[#B7C396]/50 focus:outline-none text-slate-800 text-sm transition-all placeholder:text-slate-400"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <p className="text-[10px] text-slate-500 mt-1 leading-normal">
                Must be at least 8 characters and include 1 uppercase, 1 lowercase, 1 number, and 1 special symbol.
              </p>
            </div>

            {selectedRole === 'CITIZEN' && (
              <div>
                <label className="block text-slate-700 text-xs font-semibold mb-1.5" htmlFor="confirm-password">
                  Confirm Password
                </label>
                <input
                  id="confirm-password"
                  type="password"
                  required
                  className="w-full px-4 py-2.5 rounded-xl bg-[#FEFEFE] border border-[#CCCCCC] focus:border-[#B7C396] focus:ring-2 focus:ring-[#B7C396]/50 focus:outline-none text-slate-800 text-sm transition-all placeholder:text-slate-400"
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3.5 rounded-xl font-bold bg-[#B7C396] text-slate-900 hover:bg-[#A6B483] active:scale-[0.98] transition-all disabled:opacity-50 disabled:pointer-events-none mt-2 shadow-sm flex items-center justify-center space-x-2 text-sm"
            >
              {isLoading ? (
                <span className="inline-block h-5 w-5 border-2 border-slate-900 border-t-transparent rounded-full animate-spin"></span>
              ) : (
                <span>Register Account</span>
              )}
            </button>
            
            <div className="mt-8 text-center text-sm text-slate-500">
              Already have an account?{' '}
              <Link to="/login" className="text-[#BA9A91] hover:underline font-semibold">
                Sign In
              </Link>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
