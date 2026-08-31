import React, { useState } from 'react';
import { UserPlus, Mail, Lock, Eye, EyeOff, AlertCircle, User, Phone, MapPin } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

interface SignUpFormProps {
  onSwitchToLogin?: () => void;
}

const SignUpForm: React.FC<SignUpFormProps> = ({ onSwitchToLogin }) => {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
    role: 'citizen',
    phone: '',
    assignedArea: ''
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { signUp } = useAuth();

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Validation
    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (formData.password.length < 6) {
      setError('Password must be at least 6 characters long');
      return;
    }

    setIsLoading(true);
    try {
      const { error: signUpError } = await signUp(
        formData.email,
        formData.password,
        {
          name: formData.name,
          role: formData.role,
          phone: formData.phone,
          assignedArea: formData.assignedArea
        }
      );

      if (signUpError) {
        setError(signUpError.message || 'Failed to create account');
      }
    } catch (err) {
      setError('An unexpected error occurred during signup');
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
          className="max-w-lg w-full rounded-3xl p-6 md:p-10 relative text-[#172033]"
          style={{
            background: 'rgba(255, 255, 255, 0.82)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            border: '1px solid rgba(191, 219, 254, 0.8)',
            boxShadow: '0 20px 50px rgba(30, 64, 175, 0.12)',
          }}
        >
          {/* Header */}
          <div className="text-center mb-6">
            <div className="mx-auto h-13 w-13 bg-[#2563EB] rounded-2xl flex items-center justify-center mb-3 text-white text-2xl shadow-lg">
              ⚡
            </div>
            <span className="text-xs font-extrabold uppercase tracking-widest text-[#2563EB] mb-1 block font-heading">
              UrbanLoop
            </span>
            <h2 className="text-2xl md:text-3xl font-extrabold text-[#172554] font-heading">Create Your Account</h2>
            <p className="text-[#526070] text-xs md:text-sm font-medium mt-1">Register for municipal services</p>
          </div>

          {/* Error Message */}
          {error && (
            <div className="mb-6 p-4 bg-red-50/90 border border-red-200 rounded-2xl flex items-center space-x-2 text-red-800 text-xs md:text-sm font-semibold">
              <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Sign Up Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Account Type / Role */}
            <div>
              <label htmlFor="role" className="block text-xs font-extrabold text-[#172033] uppercase tracking-wider mb-1.5">
                Account Type
              </label>
              <select
                id="role"
                name="role"
                value={formData.role}
                onChange={handleInputChange}
                className="w-full h-12 px-4 rounded-xl bg-white/92 border border-[#D7E0EC] focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/15 focus:outline-none text-[#172033] text-sm font-medium transition-all"
              >
                <option value="citizen">Citizen Account</option>
                <option value="worker">Municipal Worker</option>
                <option value="driver">Driver / Operator</option>
                <option value="supervisor">Supervisor</option>
              </select>
            </div>

            {/* Name Input */}
            <div>
              <label htmlFor="name" className="block text-xs font-extrabold text-[#172033] uppercase tracking-wider mb-1.5">
                Full Name
              </label>
              <div className="relative">
                <User className="absolute left-3.5 top-1/2 transform -translate-y-1/2 h-5 w-5 text-[#526070]" />
                <input
                  id="name"
                  name="name"
                  type="text"
                  value={formData.name}
                  onChange={handleInputChange}
                  className="w-full h-12 pl-11 pr-4 rounded-xl bg-white/92 border border-[#D7E0EC] focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/15 focus:outline-none text-[#172033] text-sm font-medium transition-all placeholder:text-[#526070]/60"
                  placeholder="Enter full name"
                  required
                />
              </div>
            </div>

            {/* Email Input */}
            <div>
              <label htmlFor="email" className="block text-xs font-extrabold text-[#172033] uppercase tracking-wider mb-1.5">
                Email Address
              </label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 transform -translate-y-1/2 h-5 w-5 text-[#526070]" />
                <input
                  id="email"
                  name="email"
                  type="email"
                  value={formData.email}
                  onChange={handleInputChange}
                  className="w-full h-12 pl-11 pr-4 rounded-xl bg-white/92 border border-[#D7E0EC] focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/15 focus:outline-none text-[#172033] text-sm font-medium transition-all placeholder:text-[#526070]/60"
                  placeholder="Enter email address"
                  required
                />
              </div>
            </div>

            {/* Phone Input */}
            <div>
              <label htmlFor="phone" className="block text-xs font-extrabold text-[#172033] uppercase tracking-wider mb-1.5">
                Phone Number
              </label>
              <div className="relative">
                <Phone className="absolute left-3.5 top-1/2 transform -translate-y-1/2 h-5 w-5 text-[#526070]" />
                <input
                  id="phone"
                  name="phone"
                  type="tel"
                  value={formData.phone}
                  onChange={handleInputChange}
                  className="w-full h-12 pl-11 pr-4 rounded-xl bg-white/92 border border-[#D7E0EC] focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/15 focus:outline-none text-[#172033] text-sm font-medium transition-all placeholder:text-[#526070]/60"
                  placeholder="+91 99999 99999"
                />
              </div>
            </div>

            {/* Password Input */}
            <div>
              <label htmlFor="password" className="block text-xs font-extrabold text-[#172033] uppercase tracking-wider mb-1.5">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 transform -translate-y-1/2 h-5 w-5 text-[#526070]" />
                <input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  value={formData.password}
                  onChange={handleInputChange}
                  className="w-full h-12 pl-11 pr-12 rounded-xl bg-white/92 border border-[#D7E0EC] focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/15 focus:outline-none text-[#172033] text-sm font-medium transition-all placeholder:text-[#526070]/60"
                  placeholder="At least 6 characters"
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

            {/* Confirm Password */}
            <div>
              <label htmlFor="confirmPassword" className="block text-xs font-extrabold text-[#172033] uppercase tracking-wider mb-1.5">
                Confirm Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 transform -translate-y-1/2 h-5 w-5 text-[#526070]" />
                <input
                  id="confirmPassword"
                  name="confirmPassword"
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={formData.confirmPassword}
                  onChange={handleInputChange}
                  className="w-full h-12 pl-11 pr-12 rounded-xl bg-white/92 border border-[#D7E0EC] focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/15 focus:outline-none text-[#172033] text-sm font-medium transition-all placeholder:text-[#526070]/60"
                  placeholder="Re-enter password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3.5 top-1/2 transform -translate-y-1/2 text-[#526070] hover:text-[#172033]"
                >
                  {showConfirmPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full h-12 bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-extrabold text-sm rounded-xl shadow-md transition-all active:scale-[0.98] disabled:opacity-50 mt-4 cursor-pointer flex items-center justify-center space-x-2"
            >
              {isLoading ? (
                <span className="inline-block h-5 w-5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
              ) : (
                <span>Create Account</span>
              )}
            </button>
          </form>

          {/* Back to Login Link */}
          {onSwitchToLogin && (
            <div className="mt-6 text-center text-xs md:text-sm font-medium text-[#526070]">
              <p>
                Already have an account?{' '}
                <button
                  type="button"
                  onClick={onSwitchToLogin}
                  className="text-[#2563EB] hover:underline font-extrabold cursor-pointer"
                >
                  Sign In
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

export default SignUpForm;
