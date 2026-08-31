import React, { useState } from 'react';
import { LogIn, Mail, Lock, Eye, EyeOff, AlertCircle } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

interface LoginFormProps {
  onSwitchToSignUp?: () => void;
}

const LoginForm: React.FC<LoginFormProps> = ({ onSwitchToSignUp }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { signIn } = useAuth();

  // Demo accounts for testing
  const demoAccounts = [
    { email: 'admin@wms.com', password: 'admin123', role: 'Admin' },
    { email: 'manager@wms.com', password: 'manager123', role: 'Manager' },
    { email: 'staff@wms.com', password: 'staff123', role: 'Staff' },
    { email: 'citizen@wms.com', password: 'citizen123', role: 'Citizen' },
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const result = await signIn(email, password);
      if (result.error) {
        setError(result.error);
      }
    } catch (err) {
      setError('An unexpected error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDemoLogin = async (demoEmail: string, demoPassword: string) => {
    setEmail(demoEmail);
    setPassword(demoPassword);
    setError('');
    setIsLoading(true);

    try {
      const result = await signIn(demoEmail, demoPassword);
      if (result.error) {
        setError(result.error);
      }
    } catch (err) {
      setError('An unexpected error occurred');
    } finally {
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
        <div 
          className="max-w-md w-full rounded-3xl p-6 md:p-10 relative text-[#172033]"
          style={{
            background: 'rgba(255, 255, 255, 0.82)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            border: '1px solid rgba(191, 219, 254, 0.8)',
            boxShadow: '0 20px 50px rgba(30, 64, 175, 0.12)',
          }}
        >
          {/* Header */}
          <div className="text-center mb-8">
            <div className="mx-auto h-13 w-13 bg-[#2563EB] rounded-2xl flex items-center justify-center mb-3 text-white text-2xl shadow-lg">
              ⚡
            </div>
            <span className="text-xs font-extrabold uppercase tracking-widest text-[#2563EB] mb-1 block font-heading">
              UrbanLoop
            </span>
            <h2 className="text-2xl md:text-3xl font-extrabold text-[#172554] font-heading">Welcome Back</h2>
            <p className="text-[#526070] text-xs md:text-sm font-medium mt-1">Sign in to continue to municipal services</p>
          </div>

          {/* Error Message */}
          {error && (
            <div className="mb-6 p-4 bg-red-50/90 border border-red-200 rounded-2xl flex items-center space-x-2 text-red-800 text-xs md:text-sm font-semibold">
              <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Login Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="email" className="block text-xs font-extrabold text-[#172033] uppercase tracking-wider mb-2">
                Email Address
              </label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 transform -translate-y-1/2 h-5 w-5 text-[#526070]" />
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full h-12 pl-11 pr-4 rounded-xl bg-white/92 border border-[#D7E0EC] focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/15 focus:outline-none text-[#172033] text-sm font-medium transition-all placeholder:text-[#526070]/60"
                  placeholder="Enter your email"
                  required
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="block text-xs font-extrabold text-[#172033] uppercase tracking-wider mb-2">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 transform -translate-y-1/2 h-5 w-5 text-[#526070]" />
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full h-12 pl-11 pr-12 rounded-xl bg-white/92 border border-[#D7E0EC] focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/15 focus:outline-none text-[#172033] text-sm font-medium transition-all placeholder:text-[#526070]/60"
                  placeholder="Enter your password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 transform -translate-y-1/2 text-[#526070] hover:text-[#172033]"
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full h-12 bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-extrabold text-sm rounded-xl shadow-md transition-all active:scale-[0.98] disabled:opacity-50 mt-2 cursor-pointer flex items-center justify-center space-x-2"
            >
              {isLoading ? (
                <span className="inline-block h-5 w-5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
              ) : (
                <span>Sign In</span>
              )}
            </button>
          </form>

          {/* Demo Accounts */}
          <div className="mt-8 pt-6 border-t border-[#BFDBFE]">
            <p className="text-xs font-bold text-[#526070] text-center mb-3 uppercase tracking-wider">Demo Accounts (Click to login):</p>
            <div className="grid grid-cols-2 gap-2">
              {demoAccounts.map((account) => (
                <button
                  key={account.role}
                  onClick={() => handleDemoLogin(account.email, account.password)}
                  disabled={isLoading}
                  className="p-2.5 text-xs bg-[#EFF6FF] border border-[#BFDBFE] hover:bg-[#2563EB] hover:text-white rounded-xl transition-all text-left cursor-pointer group"
                >
                  <div className="font-extrabold text-[#172554] group-hover:text-white">{account.role}</div>
                  <div className="text-[#526070] group-hover:text-blue-100 text-[11px] truncate">{account.email}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Sign Up Link */}
          {onSwitchToSignUp && (
            <div className="mt-6 text-center text-xs md:text-sm font-medium text-[#526070]">
              <p>
                Don't have an account?{' '}
                <button
                  type="button"
                  onClick={onSwitchToSignUp}
                  className="text-[#2563EB] hover:underline font-extrabold cursor-pointer"
                >
                  Create Account
                </button>
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="pt-6 text-center text-xs font-extrabold text-[#2563EB] tracking-widest uppercase flex items-center gap-2">
        <span>🔹</span>
        <span>CLEANER CITIES • BETTER LIVING</span>
        <span>🔹</span>
      </div>
    </div>
  );
};

export default LoginForm;
