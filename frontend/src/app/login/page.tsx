'use client';

import React, { useState } from 'react';
import { useAuth } from '../../context/auth-context';
import Link from 'next/link';

export default function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMsg('');

    const result = await login(email, password);
    if (!result.success) {
      setErrorMsg(result.error || 'Authentication failed. Please verify credentials.');
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
          className="w-full max-w-md rounded-3xl p-6 md:p-10 relative text-[#172033]"
          style={{
            background: 'rgba(255, 255, 255, 0.82)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            border: '1px solid rgba(191, 219, 254, 0.8)',
            boxShadow: '0 20px 50px rgba(30, 64, 175, 0.12)',
          }}
        >
          {/* Header */}
          <div className="flex flex-col items-center mb-8 text-center">
            <Link href="/" className="h-13 w-13 rounded-2xl bg-[#2563EB] flex items-center justify-center font-black text-white text-2xl shadow-lg mb-3 hover:scale-105 transition-all">
              ⚡
            </Link>
            <span className="text-xs font-extrabold uppercase tracking-widest text-[#2563EB] mb-1 font-heading">
              UrbanLoop
            </span>
            <h1 className="text-2xl md:text-3xl font-extrabold text-[#172554] tracking-tight font-heading">
              Welcome Back
            </h1>
            <p className="text-[#526070] text-xs md:text-sm font-medium mt-1">
              Sign in to continue to municipal services
            </p>
          </div>

          {errorMsg && (
            <div className="mb-6 p-4 rounded-2xl border border-red-200 bg-red-50/90 text-red-800 text-xs md:text-sm font-semibold flex items-center gap-2">
              <span>⚠</span>
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-[#172033] text-xs font-extrabold uppercase tracking-wider mb-2" htmlFor="email">
                Email Address
              </label>
              <input
                id="email"
                type="email"
                required
                className="w-full h-12 px-4 py-3 rounded-xl bg-white/92 border border-[#D7E0EC] focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/15 focus:outline-none text-[#172033] text-sm font-medium transition-all placeholder:text-[#526070]/60"
                placeholder="citizen@urbanloop.gov"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-[#172033] text-xs font-extrabold uppercase tracking-wider" htmlFor="password">
                  Password
                </label>
                <Link href="/forgot-password" className="text-[#2563EB] text-xs font-bold hover:underline">
                  Forgot password?
                </Link>
              </div>
              <input
                id="password"
                type="password"
                required
                className="w-full h-12 px-4 py-3 rounded-xl bg-white/92 border border-[#D7E0EC] focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/15 focus:outline-none text-[#172033] text-sm font-medium transition-all placeholder:text-[#526070]/60"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full h-12 py-3 bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-extrabold text-sm rounded-xl shadow-md transition-all active:scale-[0.98] disabled:opacity-50 mt-2 cursor-pointer flex items-center justify-center space-x-2"
            >
              {isLoading ? (
                <span className="inline-block h-5 w-5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
              ) : (
                <span>Sign In</span>
              )}
            </button>
          </form>

          {/* Switch to Register */}
          <div className="mt-8 text-center text-xs md:text-sm font-medium text-[#526070]">
            Don't have an account?{' '}
            <Link href="/register" className="text-[#2563EB] hover:underline font-extrabold">
              Create Account
            </Link>
          </div>
        </div>
      </div>

      {/* Footer Slogan */}
      <div className="pt-6 text-center text-xs font-extrabold text-[#2563EB] tracking-widest uppercase flex items-center gap-2">
        <span>🔹</span>
        <span>CLEANER CITIES • BETTER LIVING</span>
        <span>🔹</span>
      </div>
    </div>
  );
}
