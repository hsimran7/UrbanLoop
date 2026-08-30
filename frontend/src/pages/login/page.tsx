import React, { useState } from 'react';
import { useAuth } from '../../context/auth-context';
import { Link } from "react-router-dom";

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
    <div className="min-h-screen bg-[#EDECEC] flex flex-col justify-center items-center px-4 relative overflow-hidden">
      {/* Background radial glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[500px] w-[500px] bg-[#B7C396]/20 rounded-full blur-[100px] pointer-events-none"></div>

      <div className="w-full max-w-md p-8 rounded-[24px] border border-[#CCCCCC] bg-[#FEFEFE] relative shadow-md">
        <div className="flex flex-col items-center mb-8">
          <Link to="/" className="h-12 w-12 rounded-xl bg-[#B7C396] flex items-center justify-center font-bold text-slate-900 text-2xl shadow-sm mb-4 hover:scale-105 transition-all">
            UL
          </Link>
          <h2 className="text-2xl font-extrabold tracking-tight text-slate-900">Welcome to UrbanLoop</h2>
          <p className="text-slate-600 text-sm mt-1">Sign in to your municipal dashboard</p>
        </div>

        {errorMsg && (
          <div className="mb-6 p-4 rounded-xl border border-rose-300 bg-rose-50 text-rose-700 text-sm font-medium">
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-slate-700 text-sm font-semibold mb-2" htmlFor="email">
              Email Address
            </label>
            <input
              id="email"
              type="email"
              required
              className="w-full px-4 py-3 rounded-xl bg-[#FEFEFE] border border-[#CCCCCC] focus:border-[#B7C396] focus:ring-2 focus:ring-[#B7C396]/50 focus:outline-none text-slate-800 transition-all placeholder:text-slate-400"
              placeholder="e.g. citizen@urbanloop.gov"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-slate-700 text-sm font-semibold" htmlFor="password">
                Password
              </label>
              <Link to="/forgot-password" className="text-[#BA9A91] text-xs font-semibold hover:underline">
                Forgot password?
              </Link>
            </div>
            <input
              id="password"
              type="password"
              required
              className="w-full px-4 py-3 rounded-xl bg-[#FEFEFE] border border-[#CCCCCC] focus:border-[#B7C396] focus:ring-2 focus:ring-[#B7C396]/50 focus:outline-none text-slate-800 transition-all placeholder:text-slate-400"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-3.5 rounded-xl font-bold bg-[#B7C396] text-slate-900 hover:bg-[#A6B483] active:scale-[0.98] transition-all disabled:opacity-50 disabled:pointer-events-none mt-2 shadow-sm flex items-center justify-center space-x-2"
          >
            {isLoading ? (
              <span className="inline-block h-5 w-5 border-2 border-slate-900 border-t-transparent rounded-full animate-spin"></span>
            ) : (
              <span>Sign In</span>
            )}
          </button>
        </form>

        <div className="mt-8 text-center text-sm text-slate-500">
          Don't have an account?{' '}
          <Link to="/register" className="text-[#BA9A91] hover:underline font-semibold">
            Create Citizen Account
          </Link>
        </div>
      </div>
    </div>
  );
}
