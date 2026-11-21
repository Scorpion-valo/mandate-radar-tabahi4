import React, { useState, useRef, useEffect } from 'react'
import {
  Lock,
  ArrowRight,
  ShieldCheck,
  Smartphone,
  Eye,
  EyeOff,
  AlertCircle,
  CheckCircle2,
  Sparkles,
  Loader2,
  RefreshCw,
  Compass
} from 'lucide-react'

export type AuthState = 'default' | 'focused' | 'error' | 'loading' | 'otp' | 'signup'

interface AuthCardProps {
  initialState?: AuthState
  onSuccess?: () => void
  onTrySampleData?: () => void
  onOpenDesignSystem?: () => void
}

export const AuthCard: React.FC<AuthCardProps> = ({
  initialState = 'default',
  onSuccess,
  onTrySampleData,
  onOpenDesignSystem
}) => {
  const [mode, setMode] = useState<'signin' | 'signup' | 'otp'>(
    initialState === 'signup' ? 'signup' : initialState === 'otp' ? 'otp' : 'signin'
  )
  const [activeState, setActiveState] = useState<AuthState>(initialState)

  // Form inputs
  const [email, setEmail] = useState('arun.sharma@example.com')
  const [password, setPassword] = useState('MandateRadar2026!')
  const [fullName, setFullName] = useState('Arun Sharma')
  const [showPassword, setShowPassword] = useState(false)
  const [errorMessage, setErrorMessage] = useState(
    initialState === 'error' ? 'Incorrect password. Please verify your credentials.' : ''
  )
  const [isLoading, setIsLoading] = useState(initialState === 'loading')

  // OTP inputs (6 boxes)
  const [otp, setOtp] = useState(['4', '8', '2', '9', '1', '0'])
  const [otpTimer, setOtpTimer] = useState(42)
  const otpRefs = useRef<(HTMLInputElement | null)[]>([])

  // Keep state synced if prop changes
  useEffect(() => {
    setActiveState(initialState)
    if (initialState === 'signup') setMode('signup')
    else if (initialState === 'otp') setMode('otp')
    else setMode('signin')

    if (initialState === 'error') {
      setErrorMessage('Incorrect password. Please verify your credentials.')
    } else {
      setErrorMessage('')
    }
    setIsLoading(initialState === 'loading')
  }, [initialState])

  // OTP timer countdown
  useEffect(() => {
    if (mode === 'otp' && otpTimer > 0) {
      const interval = setInterval(() => setOtpTimer(t => t - 1), 1000)
      return () => clearInterval(interval)
    }
  }, [mode, otpTimer])

  const handleOtpChange = (idx: number, value: string) => {
    if (!/^\d*$/.test(value)) return
    const newOtp = [...otp]
    newOtp[idx] = value.slice(-1)
    setOtp(newOtp)

    // Auto advance focus
    if (value && idx < 5) {
      otpRefs.current[idx + 1]?.focus()
    }
  }

  const handleOtpKeyDown = (idx: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !otp[idx] && idx > 0) {
      otpRefs.current[idx - 1]?.focus()
    }
  }

  const handleOtpPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault()
    const text = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
    if (text) {
      const newOtp = [...otp]
      for (let i = 0; i < text.length; i++) {
        newOtp[i] = text[i]
      }
      setOtp(newOtp)
      otpRefs.current[Math.min(text.length, 5)]?.focus()
    }
  }

  const fillDemoCredentials = () => {
    setMode('signin')
    setEmail('arun.sharma@example.com')
    setPassword('MandateRadar2026!')
    setErrorMessage('')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (activeState === 'error') {
      setErrorMessage('Incorrect password. Please verify your credentials.')
      return
    }

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
          throw new Error(data.detail || 'Registration failed.')
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
              accountLabel: `${data.full_name.split(' ')[0]}'s Mandate Radar`
            })
          )
        }
        setIsLoading(false)
        onSuccess?.()
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
        if (data.access_token) {
          localStorage.setItem('mandate_radar_token', data.access_token)
          localStorage.setItem(
            'mandate_radar_user',
            JSON.stringify({
              id: data.user_id,
              name: data.full_name,
              email: data.email,
              phone: '+91 98201 48210',
              accountLabel: `${data.full_name.split(' ')[0]}'s Mandate Radar`
            })
          )
        }
        setIsLoading(false)
        onSuccess?.()
      } else {
        setIsLoading(false)
        onSuccess?.()
      }
    } catch (err: any) {
      setIsLoading(false)
      setErrorMessage(err.message || 'Authentication failed. Please verify credentials.')
    }
  }

  return (
    <div className="w-full max-w-[460px] mx-auto p-6 sm:p-8 flex flex-col justify-between min-h-[620px] text-left">
      <div>
        {/* Brand Header: Radar Logo + Wordmark */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            {/* Minimal Radar-Sweep Icon */}
            <div className="relative w-8 h-8 rounded-full border border-[#2DE2B5] bg-[#0E1F17] flex items-center justify-center overflow-hidden shadow-[0_0_12px_rgba(45,226,181,0.25)]">
              {/* Concentric rings inside logo */}
              <div className="absolute inset-1 rounded-full border border-[#2DE2B5]/30" />
              {/* Spinning Sweep */}
              <div
                className="absolute inset-0 rounded-full animate-radar-sweep pointer-events-none"
                style={{
                  background: 'conic-gradient(from 0deg, transparent 65%, rgba(45, 226, 181, 0.4) 90%, #2DE2B5 100%)'
                }}
              />
              {/* Center Dot */}
              <div className="w-1.5 h-1.5 rounded-full bg-[#2DE2B5] z-10 shadow-[0_0_4px_#2DE2B5]" />
            </div>

            <div>
              <span className="font-bold text-lg tracking-tight text-[#F7F3EB] font-sans">
                Mandate Radar
              </span>
              <span className="ml-2 font-mono text-[10px] px-1.5 py-0.5 rounded bg-[#2DE2B5]/15 text-[#2DE2B5] border border-[#2DE2B5]/30">
                v2.4
              </span>
            </div>
          </div>

          {/* Mode Switcher Link (Sign In <-> Sign Up) */}
          {mode !== 'otp' && (
            <button
              type="button"
              onClick={() => {
                const next = mode === 'signin' ? 'signup' : 'signin'
                setMode(next)
                setActiveState(next === 'signup' ? 'signup' : 'default')
                setErrorMessage('')
              }}
              className="text-xs font-semibold text-[#2DE2B5] hover:underline"
            >
              {mode === 'signin' ? 'Sign up' : 'Sign in'}
            </button>
          )}
        </div>

        {/* Headings */}
        <div className="mb-6">
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[#F7F3EB] leading-tight">
            {mode === 'otp'
              ? 'Enter verification code'
              : mode === 'signup'
              ? 'Create your Mandate Radar account'
              : "Find every auto-debit. Cancel the ones you don't need."}
          </h1>
          <p className="text-sm text-[#BAC8BF] mt-2 leading-relaxed">
            {mode === 'otp'
              ? 'We sent a 6-digit confirmation code to your linked mobile number +91 98••• ••812'
              : 'Upload a bank statement. We map every recurring charge to the right cancellation route.'}
          </p>
        </div>

        {/* Inline Error Banner if state is error */}
        {errorMessage && (
          <div className="mb-5 p-3 rounded-lg border border-[#FF5C6C]/40 bg-[#FF5C6C]/10 flex items-start gap-2.5 text-xs text-[#FF5C6C] animate-shake">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-[#FF5C6C]" />
            <div className="flex-1">
              <span className="font-semibold">Authentication failed: </span>
              {errorMessage}
            </div>
          </div>
        )}

        {/* Form Container */}
        {mode === 'otp' ? (
          /* OTP Screen */
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="block text-xs font-medium text-[#BAC8BF] mb-3">
                6-digit One Time Password (OTP)
              </label>
              <div className="flex items-center justify-between gap-2 sm:gap-3" onPaste={handleOtpPaste}>
                {otp.map((digit, idx) => (
                  <input
                    key={idx}
                    ref={el => { otpRefs.current[idx] = el }}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    onChange={e => handleOtpChange(idx, e.target.value)}
                    onKeyDown={e => handleOtpKeyDown(idx, e)}
                    className="w-12 h-14 text-center font-mono text-xl font-bold bg-[#0E1F17] border border-[#203E30] text-[#F7F3EB] rounded-lg focus:border-[#2DE2B5] focus:outline-none focus:ring-2 focus:ring-[#2DE2B5]/30 transition-all"
                  />
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between text-xs text-[#BAC8BF]">
              <span>
                {otpTimer > 0 ? (
                  <>Resend code in <strong className="font-mono text-[#F7F3EB]">0:{otpTimer < 10 ? `0${otpTimer}` : otpTimer}</strong></>
                ) : (
                  <button
                    type="button"
                    onClick={() => setOtpTimer(45)}
                    className="text-[#2DE2B5] font-semibold hover:underline"
                  >
                    Resend OTP now
                  </button>
                )}
              </span>
              <button
                type="button"
                onClick={() => setMode('signin')}
                className="text-[#BAC8BF] hover:text-[#F7F3EB] underline"
              >
                Use password instead
              </button>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full h-11 btn-primary text-sm font-semibold tracking-wide"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-[#061A13]" />
                  <span>Verifying code...</span>
                </>
              ) : (
                <>
                  <span>Verify &amp; Continue</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        ) : (
          /* Email / Password Form (Sign In & Sign Up) */
          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'signup' && (
              <div>
                <label className="block text-xs font-medium text-[#BAC8BF] mb-1.5">
                  Full name
                </label>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={e => setFullName(e.target.value)}
                  placeholder="e.g. Rahul Sharma"
                  className="w-full px-3.5 py-2.5 text-sm fintech-input"
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-[#BAC8BF] mb-1.5">
                Email
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
                className={`w-full px-3.5 py-2.5 text-sm fintech-input ${
                  activeState === 'focused' ? 'border-[#2DE2B5] ring-2 ring-[#2DE2B5]/30' : ''
                }`}
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-medium text-[#BAC8BF]">
                  Password
                </label>
                {mode === 'signin' && (
                  <button
                    type="button"
                    className="text-xs text-[#BAC8BF] hover:text-[#2DE2B5] transition-colors"
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
                  placeholder="Enter your password"
                  className={`w-full px-3.5 py-2.5 text-sm fintech-input pr-10 ${
                    errorMessage ? 'has-error' : ''
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#7E9387] hover:text-[#F7F3EB]"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* 1-Click Demo Credential Auto-Fill */}
            <div className="p-2.5 rounded-lg bg-[#0E1F17] border border-[#2DE2B5]/30 flex items-center justify-between text-xs">
              <div className="flex flex-col">
                <span className="text-[10px] uppercase font-mono tracking-wider text-[#BAC8BF]">DB Seeded Demo User</span>
                <span className="font-mono text-xs text-[#2DE2B5]">arun.sharma@example.com</span>
              </div>
              <button
                type="button"
                onClick={fillDemoCredentials}
                className="px-2.5 py-1 text-[11px] font-semibold rounded bg-[#2DE2B5]/20 hover:bg-[#2DE2B5]/30 text-[#2DE2B5] border border-[#2DE2B5]/40 transition-colors cursor-pointer"
              >
                Auto-fill
              </button>
            </div>

            {/* Primary Action Button */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full h-11 btn-primary text-sm font-semibold tracking-wide mt-2"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-[#061A13]" />
                  <span>Connecting to Radar...</span>
                </>
              ) : (
                <>
                  <span>{mode === 'signup' ? 'Create Account' : 'Continue'}</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>

            {/* Divider */}
            <div className="relative my-4 flex items-center justify-center">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-[#203E30]" />
              </div>
              <span className="relative px-3 text-xs uppercase font-mono text-[#7E9387] bg-[var(--bg-primary)]">
                or
              </span>
            </div>

            {/* Secondary Buttons */}
            <div className="space-y-2.5">
              {/* Google Button */}
              <button
                type="button"
                onClick={handleSubmit}
                className="w-full h-10.5 btn-secondary text-xs sm:text-sm font-medium"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                  />
                </svg>
                <span>Continue with Google</span>
              </button>

              {/* Phone OTP Button */}
              <button
                type="button"
                onClick={() => setMode('otp')}
                className="w-full h-10.5 btn-secondary text-xs sm:text-sm font-medium"
              >
                <Smartphone className="w-4 h-4 text-[#BAC8BF]" />
                <span>Continue with phone (OTP)</span>
              </button>
            </div>

            {/* Hackathon Judge Bypass Link */}
            <div className="pt-2 text-center">
              <button
                type="button"
                onClick={onTrySampleData}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#2DE2B5] hover:underline cursor-pointer group"
              >
                <Sparkles className="w-3.5 h-3.5 text-[#2DE2B5] group-hover:rotate-12 transition-transform" />
                <span>Try with sample data</span>
              </button>
              <div className="text-[11px] text-[#7E9387]">
                No signup needed · Ideal for hackathon judges &amp; live tests
              </div>
            </div>
          </form>
        )}
      </div>

      {/* Footer Line with Lock Icon */}
      <div className="mt-8 pt-4 border-t border-[#203E30]/70 flex items-center justify-between text-[11px] text-[#7E9387]">
        <div className="flex items-center gap-1.5">
          <Lock className="w-3.5 h-3.5 text-[#2DE2B5]" />
          <span>Your statement is processed locally and never sold</span>
        </div>

        {/* Quick Design System Pill */}
        {onOpenDesignSystem && (
          <button
            type="button"
            onClick={onOpenDesignSystem}
            className="text-[10px] font-mono text-[#BAC8BF] hover:text-[#2DE2B5] underline"
          >
            Design System
          </button>
        )}
      </div>
    </div>
  )
}
