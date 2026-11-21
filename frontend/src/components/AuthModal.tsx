import React, { useState, useRef, useEffect } from 'react'
import {
  X,
  Lock,
  ArrowRight,
  Eye,
  EyeOff,
  Sparkles,
  Smartphone,
  Check,
  Loader2,
  AlertCircle
} from 'lucide-react'

interface AuthModalProps {
  isOpen: boolean
  initialMode?: 'signin' | 'signup'
  onClose: () => void
  onSuccess: (user?: { name: string; email: string }) => void // Directly opens dashboard
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  initialMode = 'signin',
  onClose,
  onSuccess
}) => {
  const [mode, setMode] = useState<'signin' | 'signup' | 'otp'>(initialMode)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  // 6-digit OTP state
  const [otp, setOtp] = useState(['4', '8', '2', '9', '1', '0'])
  const [otpTimer, setOtpTimer] = useState(42)
  const otpRefs = useRef<(HTMLInputElement | null)[]>([])

  useEffect(() => {
    if (initialMode) {
      setMode(initialMode)
    }
  }, [initialMode, isOpen])

  useEffect(() => {
    if (mode === 'otp' && otpTimer > 0) {
      const interval = setInterval(() => setOtpTimer(t => t - 1), 1000)
      return () => clearInterval(interval)
    }
  }, [mode, otpTimer])

  if (!isOpen) return null

  const handleOtpChange = (idx: number, value: string) => {
    if (!/^\d*$/.test(value)) return
    const newOtp = [...otp]
    newOtp[idx] = value.slice(-1)
    setOtp(newOtp)
    if (value && idx < 5) {
      otpRefs.current[idx + 1]?.focus()
    }
  }

  const handleOtpKeyDown = (idx: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !otp[idx] && idx > 0) {
      otpRefs.current[idx - 1]?.focus()
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setTimeout(() => {
      setIsLoading(false)
      onSuccess({
        name: fullName || (email ? email.split('@')[0] : 'Rahul Sharma'),
        email: email || 'rahul.sharma@example.com'
      })
    }, 400)
  }

  const handleDirectSampleBypass = () => {
    onSuccess({
      name: 'Rahul Sharma',
      email: 'rahul.sharma@example.com'
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-fade-in text-left">
      <div className="relative w-full max-w-[480px] bg-[#07110C] border border-[rgba(238,219,202,0.2)] rounded-[32px] p-6 sm:p-8 shadow-2xl text-[#FAF8F5]">
        
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-6 right-6 w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white/80 hover:text-white transition-colors cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Modal Header */}
        <div className="mb-6">
          <div className="flex items-center gap-2.5 mb-3">
            <div className="w-7 h-7 rounded-full border border-[#2DE2B5] bg-[#0E1F17] flex items-center justify-center overflow-hidden">
              <div
                className="w-full h-full animate-radar-sweep"
                style={{
                  background: 'conic-gradient(from 0deg, transparent 65%, rgba(45, 226, 181, 0.4) 90%, #2DE2B5 100%)'
                }}
              />
            </div>
            <span className="font-extrabold text-sm tracking-wider font-mono text-[#EEDBCA] uppercase">
              Mandate Radar
            </span>
          </div>

          <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            {mode === 'signup'
              ? 'Create your account'
              : mode === 'otp'
              ? 'Enter 6-digit code'
              : 'Sign in to your Radar'}
          </h2>
          <p className="text-xs sm:text-sm text-[#9BAEA2] mt-1.5 leading-relaxed">
            {mode === 'otp'
              ? 'Enter the verification code sent to +91 98••• ••812'
              : 'Access your auto-debits, recurring mandates, and cancellation routes.'}
          </p>
        </div>

        {/* Mode Switcher Tabs (Sign In vs Create Account) */}
        {mode !== 'otp' && (
          <div className="flex rounded-xl bg-[#0E1F17] p-1 border border-white/10 mb-6">
            <button
              type="button"
              onClick={() => { setMode('signin'); setErrorMessage('') }}
              className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                mode === 'signin'
                  ? 'bg-[#EEDBCA] text-[#07110C] shadow-sm font-bold'
                  : 'text-[#9BAEA2] hover:text-white'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => { setMode('signup'); setErrorMessage('') }}
              className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                mode === 'signup'
                  ? 'bg-[#EEDBCA] text-[#07110C] shadow-sm font-bold'
                  : 'text-[#9BAEA2] hover:text-white'
              }`}
            >
              Create Account
            </button>
          </div>
        )}

        {/* Error message */}
        {errorMessage && (
          <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-xs text-red-400 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* OTP Screen */}
        {mode === 'otp' ? (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-xs font-medium text-[#EEDBCA] mb-2.5">
                Verification Code
              </label>
              <div className="flex items-center justify-between gap-2">
                {otp.map((d, i) => (
                  <input
                    key={i}
                    ref={el => { otpRefs.current[i] = el }}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={d}
                    onChange={e => handleOtpChange(i, e.target.value)}
                    onKeyDown={e => handleOtpKeyDown(i, e)}
                    className="w-12 h-14 text-center font-mono text-xl font-bold bg-[#0E1F17] border border-white/15 text-white rounded-xl focus:border-[#2DE2B5] focus:outline-none focus:ring-2 focus:ring-[#2DE2B5]/30 transition-all"
                  />
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between text-xs text-[#9BAEA2]">
              <span>Resend code in <strong>0:{otpTimer < 10 ? `0${otpTimer}` : otpTimer}</strong></span>
              <button
                type="button"
                onClick={() => setMode('signin')}
                className="text-[#2DE2B5] hover:underline cursor-pointer"
              >
                Use password
              </button>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full h-11 bg-[#2DE2B5] text-[#07110C] font-bold text-sm rounded-xl hover:brightness-105 transition-all flex items-center justify-center gap-2 shadow-lg shadow-[#2DE2B5]/20 cursor-pointer"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-[#07110C]" />
                  <span>Entering Dashboard...</span>
                </>
              ) : (
                <>
                  <span>Verify &amp; Open Dashboard</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        ) : (
          /* Sign In & Sign Up Form */
          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'signup' && (
              <div>
                <label className="block text-xs font-medium text-[#EEDBCA] mb-1.5">
                  Full Name
                </label>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={e => setFullName(e.target.value)}
                  placeholder="e.g. Rahul Sharma"
                  className="w-full px-3.5 py-2.5 text-xs bg-[#0E1F17] border border-white/15 text-white rounded-xl focus:border-[#EEDBCA] focus:outline-none"
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-[#EEDBCA] mb-1.5">
                Email Address
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full px-3.5 py-2.5 text-xs bg-[#0E1F17] border border-white/15 text-white rounded-xl focus:border-[#EEDBCA] focus:outline-none"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-medium text-[#EEDBCA]">
                  Password
                </label>
                {mode === 'signin' && (
                  <button
                    type="button"
                    className="text-[11px] text-[#9BAEA2] hover:text-[#EEDBCA]"
                  >
                    Forgot password?
                  </button>
                )}
              </div>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Enter password"
                  className="w-full px-3.5 py-2.5 text-xs bg-[#0E1F17] border border-white/15 text-white rounded-xl pr-10 focus:border-[#EEDBCA] focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9BAEA2] hover:text-white cursor-pointer"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Submit Button (Immediately Opens Dashboard) */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full h-11 bg-[#2DE2B5] text-[#07110C] font-bold text-sm rounded-xl hover:brightness-105 transition-all flex items-center justify-center gap-2 shadow-lg shadow-[#2DE2B5]/20 cursor-pointer mt-2"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-[#07110C]" />
                  <span>Launching Dashboard...</span>
                </>
              ) : (
                <>
                  <span>{mode === 'signup' ? 'Create Account & Open Dashboard' : 'Sign In & Open Dashboard'}</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>

            {/* Divider */}
            <div className="relative my-4 flex items-center justify-center">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-white/10" />
              </div>
              <span className="relative px-3 text-[11px] uppercase font-mono text-[#9BAEA2] bg-[#07110C]">
                or
              </span>
            </div>

            {/* Secondary OAuth Buttons */}
            <div className="space-y-2">
              <button
                type="button"
                onClick={handleSubmit}
                className="w-full h-10 bg-[#0E1F17] hover:bg-[#142B20] border border-white/15 text-white font-medium text-xs rounded-xl flex items-center justify-center gap-2.5 transition-all cursor-pointer"
              >
                <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                </svg>
                <span>Continue with Google</span>
              </button>

              <button
                type="button"
                onClick={() => setMode('otp')}
                className="w-full h-10 bg-[#0E1F17] hover:bg-[#142B20] border border-white/15 text-white font-medium text-xs rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer"
              >
                <Smartphone className="w-4 h-4 text-[#9BAEA2]" />
                <span>Continue with Phone (OTP)</span>
              </button>
            </div>

            {/* Quick Sample Data Direct Access */}
            <div className="pt-3 text-center border-t border-white/10 mt-4">
              <button
                type="button"
                onClick={handleDirectSampleBypass}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#2DE2B5] hover:underline cursor-pointer group"
              >
                <Sparkles className="w-3.5 h-3.5 text-[#2DE2B5] group-hover:rotate-12 transition-transform" />
                <span>Try with sample data (₹65,623)</span>
              </button>
              <div className="text-[11px] text-[#9BAEA2] mt-0.5">
                No signup needed · 1-click launch to dashboard
              </div>
            </div>
          </form>
        )}

        {/* Security Note */}
        <div className="mt-5 pt-3 border-t border-white/10 flex items-center justify-center gap-1.5 text-[11px] text-[#9BAEA2]">
          <Lock className="w-3.5 h-3.5 text-[#2DE2B5]" />
          <span>Your statement is processed locally and never sold</span>
        </div>
      </div>
    </div>
  )
}
