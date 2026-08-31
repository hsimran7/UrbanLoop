import React, { useState } from 'react';
import { useAuth } from '../../context/auth-context';
import { Link } from "react-router-dom";

export default function RegisterPage() {
  const { register } = useAuth();
  
  // Registration flow state (default to CITIZEN)
  const [selectedRole, setSelectedRole] = useState<'CITIZEN' | 'WORKER'>('CITIZEN');

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
      role: selectedRole,
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
    <div 
      className="min-h-screen w-full flex flex-col justify-between items-center p-4 md:p-8 relative overflow-hidden bg-cover bg-center bg-no-repeat bg-fixed font-sans"
      style={{
        backgroundImage: `linear-gradient(rgba(239, 246, 255, 0.35), rgba(248, 250, 252, 0.55)), url('/images/auth-nature.jpg'), url('/assets/nature-register.jpg')`
      }}
    >
      <div className="w-full flex justify-center items-center my-auto">
        {/* Blue-themed Glass Card */}
        <div 
          className="w-full max-w-lg md:max-w-xl rounded-3xl p-6 md:p-10 relative text-[#172033]"
          style={{
            background: 'rgba(255, 255, 255, 0.82)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            border: '1px solid rgba(191, 219, 254, 0.8)',
            boxShadow: '0 20px 50px rgba(30, 64, 175, 0.12)',
          }}
        >
          {/* Brand Header */}
          <div className="flex flex-col items-center mb-6 text-center">
            <Link to="/" className="h-13 w-13 rounded-2xl bg-[#2563EB] flex items-center justify-center font-black text-white text-2xl shadow-lg mb-3 hover:scale-105 transition-all">
              ⚡
            </Link>
            <span className="text-xs font-extrabold uppercase tracking-widest text-[#2563EB] mb-1 font-heading">
              UrbanLoop
            </span>
            <h1 className="text-2xl md:text-3xl font-extrabold text-[#172554] tracking-tight font-heading">
              Create Your Account
            </h1>
            <p className="text-[#526070] text-xs md:text-sm font-medium mt-1">
              Join your local municipal environmental & collection service
            </p>
          </div>

          {errorMsg && (
            <div className="mb-6 p-4 rounded-2xl border border-red-200 bg-red-50/90 text-red-800 text-xs md:text-sm font-semibold flex items-center gap-2">
              <span>⚠</span>
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="mb-6 p-4 rounded-2xl border border-blue-300 bg-blue-50/95 text-blue-900 text-xs md:text-sm font-semibold">
              <div>✓ {successMsg}</div>
              <div className="mt-2 text-xs font-extrabold text-[#2563EB] underline">
                <Link to="/login">Proceed to Sign In →</Link>
              </div>
            </div>
          )}

          {/* Account Role Selector Pills */}
          <div className="mb-6">
            <label className="block text-xs font-extrabold text-[#172554] uppercase tracking-wider mb-2 text-center">
              Select Account Type
            </label>
            <div className="grid grid-cols-2 gap-2.5 p-1.5 bg-[#EFF6FF] border border-[#BFDBFE] rounded-2xl">
              <button
                type="button"
                onClick={() => { setSelectedRole('CITIZEN'); setErrorMsg(''); }}
                className={`py-2.5 px-4 rounded-xl text-xs font-extrabold transition-all flex items-center justify-center gap-2 cursor-pointer ${
                  selectedRole === 'CITIZEN'
                    ? 'bg-[#2563EB] text-white shadow-md'
                    : 'text-[#172033] hover:bg-white/60'
                }`}
              >
                <span>🏡</span>
                <span>Citizen</span>
              </button>
              <button
                type="button"
                onClick={() => { setSelectedRole('WORKER'); setErrorMsg(''); }}
                className={`py-2.5 px-4 rounded-xl text-xs font-extrabold transition-all flex items-center justify-center gap-2 cursor-pointer ${
                  selectedRole === 'WORKER'
                    ? 'bg-[#2563EB] text-white shadow-md'
                    : 'text-[#172033] hover:bg-white/60'
                }`}
              >
                <span>👷</span>
                <span>Worker</span>
              </button>
            </div>
          </div>

          {/* Registration Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-[#172033] text-xs font-extrabold uppercase tracking-wider mb-1.5" htmlFor="name">
                {selectedRole === 'CITIZEN' ? 'Full Name' : 'Name'}
              </label>
              <input
                id="name"
                type="text"
                required
                className="w-full h-12 px-4 py-3 rounded-xl bg-white/92 border border-[#D7E0EC] focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/15 focus:outline-none text-[#172033] text-sm font-medium transition-all placeholder:text-[#526070]/60"
                placeholder={selectedRole === 'CITIZEN' ? 'Enter your full name' : 'Enter full name'}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            {selectedRole === 'WORKER' && (
              <div>
                <label className="block text-[#172033] text-xs font-extrabold uppercase tracking-wider mb-1.5" htmlFor="employeeCode">
                  Employee ID
                </label>
                <input
                  id="employeeCode"
                  type="text"
                  required
                  className="w-full h-12 px-4 py-3 rounded-xl bg-white/92 border border-[#D7E0EC] focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/15 focus:outline-none text-[#172033] text-sm font-medium transition-all placeholder:text-[#526070]/60"
                  placeholder="e.g. EMP-104"
                  value={employeeCode}
                  onChange={(e) => setEmployeeCode(e.target.value)}
                />
              </div>
            )}

            <div>
              <label className="block text-[#172033] text-xs font-extrabold uppercase tracking-wider mb-1.5" htmlFor="email">
                Email Address
              </label>
              <input
                id="email"
                type="email"
                required
                className="w-full h-12 px-4 py-3 rounded-xl bg-white/92 border border-[#D7E0EC] focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/15 focus:outline-none text-[#172033] text-sm font-medium transition-all placeholder:text-[#526070]/60"
                placeholder="name@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-[#172033] text-xs font-extrabold uppercase tracking-wider mb-1.5" htmlFor="phone">
                Phone Number
              </label>
              <input
                id="phone"
                type="text"
                required
                className="w-full h-12 px-4 py-3 rounded-xl bg-white/92 border border-[#D7E0EC] focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/15 focus:outline-none text-[#172033] text-sm font-medium transition-all placeholder:text-[#526070]/60"
                placeholder="+91 99999 99999"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-[#172033] text-xs font-extrabold uppercase tracking-wider mb-1.5" htmlFor="password">
                Password
              </label>
              <input
                id="password"
                type="password"
                required
                className="w-full h-12 px-4 py-3 rounded-xl bg-white/92 border border-[#D7E0EC] focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/15 focus:outline-none text-[#172033] text-sm font-medium transition-all placeholder:text-[#526070]/60"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <p className="text-[10px] text-[#526070] mt-1 font-semibold">
                Must be at least 8 characters with uppercase, lowercase, number & special symbol.
              </p>
            </div>

            {selectedRole === 'CITIZEN' && (
              <div>
                <label className="block text-[#172033] text-xs font-extrabold uppercase tracking-wider mb-1.5" htmlFor="confirm-password">
                  Confirm Password
                </label>
                <input
                  id="confirm-password"
                  type="password"
                  required
                  className="w-full h-12 px-4 py-3 rounded-xl bg-white/92 border border-[#D7E0EC] focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/15 focus:outline-none text-[#172033] text-sm font-medium transition-all placeholder:text-[#526070]/60"
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full h-12 py-3 bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-extrabold text-sm rounded-xl shadow-md transition-all active:scale-[0.98] disabled:opacity-50 mt-4 cursor-pointer flex items-center justify-center space-x-2"
            >
              {isLoading ? (
                <span className="inline-block h-5 w-5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
              ) : (
                <span>Create Account</span>
              )}
            </button>
            
            <div className="pt-4 text-center text-xs md:text-sm font-medium text-[#526070]">
              Already have an account?{' '}
              <Link to="/login" className="text-[#2563EB] hover:underline font-extrabold">
                Sign in
              </Link>
            </div>
          </form>
        </div>
      </div>

      {/* Footer Banner */}
      <div className="pt-6 text-center text-xs font-extrabold text-[#2563EB] tracking-widest uppercase flex items-center gap-2">
        <span>🔹</span>
        <span>CLEANER CITIES • BETTER LIVING</span>
        <span>🔹</span>
      </div>
    </div>
  );
}
