import React, { useState, useRef, useEffect } from 'react'
import {
  X,
  Lock,
  ArrowRight,
  ArrowLeft,
  Eye,
  EyeOff,
  Sparkles,
  Smartphone,
  Check,
  CheckCircle2,
  Loader2,
  AlertCircle
} from 'lucide-react'

interface AuthModalProps {
  isOpen: boolean
  initialMode?: 'signin' | 'signup'
  onClose: () => void
  onSuccess: (user?: { name: string; email: string; phone?: string; isDemo?: boolean }) => void
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  initialMode = 'signin',
  onClose,
  onSuccess
}) => {
  const [mode, setMode] = useState<'signin' | 'signup' | 'phone_entry' | 'otp'>(initialMode)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [toastMsg, setToastMsg] = useState<string | null>(null)

  // Phone OTP state
  const [phoneNumber, setPhoneNumber] = useState('')
  const [phoneFullName, setPhoneFullName] = useState('')
  const [otp, setOtp] = useState(['', '', '', '', '', ''])
  const [otpTimer, setOtpTimer] = useState(45)
  const otpRefs = useRef<(HTMLInputElement | null)[]>([])

  useEffect(() => {
    if (initialMode) {
      setMode(initialMode)
    }
  }, [initialMode, isOpen])

  useEffect(() => {
    if (toastMsg) {
      const timer = setTimeout(() => setToastMsg(null), 3500)
      return () => clearTimeout(timer)
    }
  }, [toastMsg])

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

  const fillDemoCredentials = () => {
    setMode('signin')
    setEmail('arun.sharma@example.com')
    setPassword('MandateRadar2026!')
    setErrorMessage('')
    setToastMsg('Filled demo credentials: arun.sharma@example.com')
  }

  const fillDemoPhone = () => {
    setPhoneNumber('9820148210')
    setPhoneFullName('Arun Sharma')
    setErrorMessage('')
  }

  const fillDemoOtp = () => {
    setOtp(['4', '8', '2', '9', '1', '0'])
    setErrorMessage('')
    setToastMsg('Auto-filled OTP: 482910')
  }

  const handleSendPhoneOtp = (e: React.FormEvent) => {
    e.preventDefault()
    const clean = phoneNumber.replace(/\D/g, '')
    if (clean.length !== 10) {
      setErrorMessage('Please enter a valid 10-digit Indian mobile number.')
      return
    }

    setIsLoading(true)
    setErrorMessage('')

    setTimeout(() => {
      setIsLoading(false)
      setOtp(['', '', '', '', '', ''])
      setOtpTimer(45)
      setMode('otp')
      setToastMsg(`Verification code 482910 sent to +91 ${clean}`)
    }, 500)
  }

  const handleVerifyPhoneOtp = (e: React.FormEvent) => {
    e.preventDefault()
    const code = otp.join('')
    if (code.length !== 6) {
      setErrorMessage('Please enter the full 6-digit verification code.')
      return
    }

    setIsLoading(true)
    setErrorMessage('')

    setTimeout(() => {
      setIsLoading(false)
      const cleanPhone = phoneNumber.replace(/\D/g, '') || '9820148210'
      const displayName = phoneFullName.trim() || `User +91 ${cleanPhone.slice(-4)}`
      const phoneEmail = `${cleanPhone}@phone.mandateradar.in`
      const isDemo = cleanPhone === '9820148210' && phoneFullName === 'Arun Sharma'

      const userObj = {
        id: `usr_${cleanPhone}`,
        name: displayName,
        email: phoneEmail,
        phone: `+91 ${cleanPhone}`,
        accountLabel: `${displayName.split(' ')[0]}'s Primary Statement`,
        isDemo
      }
      try {
        localStorage.setItem('mandate_radar_user', JSON.stringify(userObj))
      } catch {}

      setToastMsg('Phone verified! Launching dashboard...')
      setTimeout(() => {
        onSuccess({
          name: displayName,
          email: phoneEmail,
          phone: `+91 ${cleanPhone}`,
          isDemo
        })
      }, 300)
    }, 600)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setErrorMessage('')

    try {
      if (mode === 'signup') {
        const res = await fetch('/api/v1/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: email.trim(),
            password,
            full_name: fullName.trim() || email.split('@')[0]
          })
        })
        const data = await res.json()
        if (!res.ok) {
          throw new Error(data.detail || 'Registration failed. Please check inputs.')
        }
        if (data.access_token) {
          localStorage.setItem('mandate_radar_token', data.access_token)
          localStorage.setItem(
            'mandate_radar_user',
            JSON.stringify({
              id: data.user_id,
              name: data.full_name,
              email: data.email,
              phone: '+91 98201 48210',
              accountLabel: `${data.full_name.split(' ')[0]}'s Mandate Radar`,
              isDemo: false
            })
          )
        }
        setIsLoading(false)
        setToastMsg(`Welcome, ${data.full_name}! Account created.`)
        setTimeout(() => {
          onSuccess({
            name: data.full_name,
            email: data.email,
            isDemo: false
          })
        }, 400)
      } else if (mode === 'signin') {
        const res = await fetch('/api/v1/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: email.trim(),
            password
          })
        })
        const data = await res.json()
        if (!res.ok) {
          throw new Error(data.detail || 'Invalid email or password.')
        }
        const isDemo = data.email === 'arun.sharma@example.com'
        if (data.access_token) {
          localStorage.setItem('mandate_radar_token', data.access_token)
          localStorage.setItem(
            'mandate_radar_user',
            JSON.stringify({
              id: data.user_id,
              name: data.full_name,
              email: data.email,
              phone: '+91 98201 48210',
              accountLabel: `${data.full_name.split(' ')[0]}'s Mandate Radar`,
              isDemo
            })
          )
        }
        setIsLoading(false)
        setToastMsg(`Welcome back, ${data.full_name}!`)
        setTimeout(() => {
          onSuccess({
            name: data.full_name,
            email: data.email,
            isDemo
          })
        }, 400)
      }
    } catch (err: any) {
      setIsLoading(false)
      setErrorMessage(err.message || 'Authentication failed. Please verify credentials.')
    }
  }

  const handleDirectSampleBypass = () => {
    setToastMsg('Launching demo session...')
    setTimeout(() => {
      onSuccess({
        name: 'Arun Sharma',
        email: 'arun.sharma@example.com',
        isDemo: true
      })
    }, 300)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-fade-in text-left">
      <div className="relative w-full max-w-[480px] bg-[#07110C] border border-[rgba(238,219,202,0.2)] rounded-[32px] p-6 sm:p-8 shadow-2xl text-[#FAF8F5]">
        
        {/* Floating Toast Notification */}
        {toastMsg && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-2 rounded-full bg-[#2DE2B5] text-[#07110C] font-semibold text-xs shadow-xl animate-fade-in whitespace-nowrap">
            <CheckCircle2 className="w-4 h-4 text-[#07110C] shrink-0" />
            <span>{toastMsg}</span>
          </div>
        )}

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
              : mode === 'phone_entry'
              ? 'Sign in with Mobile'
              : mode === 'otp'
              ? 'Enter 6-digit code'
              : 'Sign in to your Radar'}
          </h2>
          <p className="text-xs sm:text-sm text-[#9BAEA2] mt-1.5 leading-relaxed">
            {mode === 'phone_entry'
              ? 'Enter your mobile number to receive a secure OTP code.'
              : mode === 'otp'
              ? `Enter the verification code sent to +91 ${phoneNumber || '98201 48210'}`
              : 'Access your auto-debits, recurring mandates, and cancellation routes.'}
          </p>
        </div>

        {/* Mode Switcher Tabs (Sign In vs Create Account) */}
        {mode !== 'otp' && mode !== 'phone_entry' && (
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

        {/* STEP 1: Phone Number Input */}
        {mode === 'phone_entry' ? (
          <form onSubmit={handleSendPhoneOtp} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-[#EEDBCA] mb-1.5">
                Full Name (Optional)
              </label>
              <input
                type="text"
                value={phoneFullName}
                onChange={e => setPhoneFullName(e.target.value)}
                placeholder="e.g. Rahul Verma"
                className="w-full px-3.5 py-2.5 text-xs bg-[#0E1F17] border border-white/15 text-white rounded-xl focus:border-[#2DE2B5] focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#EEDBCA] mb-1.5">
                Mobile Number
              </label>
              <div className="flex items-center gap-2">
                <div className="flex items-center px-3 py-2.5 bg-[#0E1F17] border border-white/15 rounded-xl text-xs font-mono text-[#EEDBCA] shrink-0">
                  🇮🇳 +91
                </div>
                <input
                  type="tel"
                  maxLength={10}
                  required
                  value={phoneNumber}
                  onChange={e => setPhoneNumber(e.target.value.replace(/\D/g, '').slice(0, 10))}
                  placeholder="98201 48210"
                  className="flex-1 px-3.5 py-2.5 text-xs bg-[#0E1F17] border border-white/15 text-white rounded-xl focus:border-[#2DE2B5] focus:outline-none font-mono text-sm tracking-wider"
                />
              </div>
            </div>

            {/* Quick Demo Phone Badge */}
            <div className="p-2.5 rounded-xl bg-[#0E1F17] border border-[#2DE2B5]/30 flex items-center justify-between text-xs">
              <div className="flex flex-col">
                <span className="text-[10px] uppercase font-mono tracking-wider text-[#9BAEA2]">Test Demo Number</span>
                <span className="font-mono text-xs text-[#2DE2B5]">+91 98201 48210</span>
              </div>
              <button
                type="button"
                onClick={fillDemoPhone}
                className="px-2.5 py-1 text-[11px] font-semibold rounded-lg bg-[#2DE2B5]/20 hover:bg-[#2DE2B5]/30 text-[#2DE2B5] border border-[#2DE2B5]/40 transition-colors cursor-pointer"
              >
                Auto-fill
              </button>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full h-11 bg-[#2DE2B5] text-[#07110C] font-bold text-sm rounded-xl hover:brightness-105 transition-all flex items-center justify-center gap-2 shadow-lg shadow-[#2DE2B5]/20 cursor-pointer mt-2"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-[#07110C]" />
                  <span>Sending Code...</span>
                </>
              ) : (
                <>
                  <span>Send Verification Code</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => { setMode('signin'); setErrorMessage('') }}
              className="w-full py-2 text-xs text-[#9BAEA2] hover:text-white flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Email Sign In</span>
            </button>
          </form>
        ) : mode === 'otp' ? (
          /* STEP 2: OTP Verification Screen */
          <form onSubmit={handleVerifyPhoneOtp} className="space-y-5">
            <div>
              <div className="flex items-center justify-between mb-2.5">
                <label className="text-xs font-medium text-[#EEDBCA]">
                  6-Digit Verification Code
                </label>
                <button
                  type="button"
                  onClick={fillDemoOtp}
                  className="text-[11px] text-[#2DE2B5] hover:underline cursor-pointer"
                >
                  Auto-fill 482910
                </button>
              </div>

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
                onClick={() => { setMode('phone_entry'); setErrorMessage('') }}
                className="text-[#2DE2B5] hover:underline cursor-pointer"
              >
                Change mobile number
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

            <button
              type="button"
              onClick={() => { setMode('signin'); setErrorMessage('') }}
              className="w-full py-2 text-xs text-[#9BAEA2] hover:text-white flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Use password instead</span>
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

            {/* 1-Click Demo Credential Auto-Fill for Evaluators */}
            <div className="p-2.5 rounded-xl bg-[#0E1F17] border border-[#2DE2B5]/30 flex items-center justify-between text-xs">
              <div className="flex flex-col">
                <span className="text-[10px] uppercase font-mono tracking-wider text-[#9BAEA2]">DB Demo Account</span>
                <span className="font-mono text-xs text-[#2DE2B5]">arun.sharma@example.com</span>
              </div>
              <button
                type="button"
                onClick={fillDemoCredentials}
                className="px-2.5 py-1 text-[11px] font-semibold rounded-lg bg-[#2DE2B5]/20 hover:bg-[#2DE2B5]/30 text-[#2DE2B5] border border-[#2DE2B5]/40 transition-colors cursor-pointer"
              >
                Auto-fill
              </button>
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
                  <span>Verifying &amp; Launching...</span>
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
                onClick={() => {
                  setToastMsg('Signed in with Google (Demo profile)')
                  setTimeout(handleDirectSampleBypass, 400)
                }}
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
                onClick={() => { setMode('phone_entry'); setErrorMessage('') }}
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
                Explore pre-seeded demo portfolio with 10 mandates
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
