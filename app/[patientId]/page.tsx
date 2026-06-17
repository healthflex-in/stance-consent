'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { gql, useQuery, useMutation } from '@apollo/client'
import { ApolloProvider } from '@apollo/client'
import { ShieldCheck, ExternalLink, CheckCircle2, AlertCircle, Mail, Check, Edit2 } from 'lucide-react'
import { client } from '@/lib/apollo-client'
import { Toaster, toast } from 'sonner'

// ─── GraphQL ──────────────────────────────────────────────────────────────────

const GET_POLICIES = gql`
  query GetPolicies {
    activePolicies {
      _id key policyVersion text
      links { label url }
    }
  }
`

const CHECK_CONSENT = gql`
  query CheckConsent($userId: ObjectID!) {
    hasUserAcceptedPolicies(userId: $userId)
  }
`

const INITIATE_CONSENT_OTP = gql`
  mutation InitiateConsentOTP($patientId: ObjectID!) {
    initiateConsentOTP(patientId: $patientId) {
      maskedEmail otpToken expiresIn noEmail
    }
  }
`

const ADD_CONSENT_EMAIL = gql`
  mutation AddConsentEmail($patientId: ObjectID!, $email: String!) {
    addConsentEmail(patientId: $patientId, email: $email) {
      maskedEmail otpToken expiresIn noEmail
    }
  }
`

const VERIFY_CONSENT_OTP = gql`
  mutation VerifyConsentOTP($otpToken: String!, $otp: String!) {
    verifyConsentOTP(otpToken: $otpToken, otp: $otp)
  }
`

const RECORD_CONSENT = gql`
  mutation RecordConsent($input: RecordConsentInput!) {
    recordConsent(input: $input) { _id acceptedAt }
  }
`

// ─── Types ────────────────────────────────────────────────────────────────────

interface Policy {
  _id: string; key: string; policyVersion: string
  text: string; links: { label: string; url: string }[]
}

type Step = 'loading' | 'add_email' | 'otp' | 'consent' | 'done' | 'already_accepted'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// ─── Page ─────────────────────────────────────────────────────────────────────

function ConsentPage({ patientId }: { patientId: string }) {
  const [step, setStep] = useState<Step>('loading')
  const [maskedEmail, setMaskedEmail] = useState('')
  const [otpToken, setOtpToken] = useState('')
  const [otp, setOtp] = useState('')
  const [otpError, setOtpError] = useState('')
  const [agreed, setAgreed] = useState(false)

  // Email collection state
  const [newEmail, setNewEmail] = useState('')
  const [emailError, setEmailError] = useState('')
  const [isEditingEmail, setIsEditingEmail] = useState(false)
  const [editEmail, setEditEmail] = useState('')
  const [editEmailError, setEditEmailError] = useState('')

  const { data: policiesData } = useQuery(GET_POLICIES, { fetchPolicy: 'no-cache' })
  const { data: consentData } = useQuery(CHECK_CONSENT, {
    variables: { userId: patientId },
    fetchPolicy: 'no-cache',
  })

  const policies: Policy[] = policiesData?.activePolicies ?? []

  const handleOTPResult = (result: { maskedEmail: string; otpToken: string; expiresIn: number; noEmail: boolean }) => {
    if (result.noEmail) {
      setStep('add_email')
    } else {
      setMaskedEmail(result.maskedEmail)
      setOtpToken(result.otpToken)
      setStep('otp')
    }
  }

  const [initiateOTP] = useMutation(INITIATE_CONSENT_OTP, {
    onCompleted: (d) => handleOTPResult(d.initiateConsentOTP),
    onError: (err) => toast.error(err.message || 'Something went wrong.'),
  })

  const [addEmail, { loading: addingEmail }] = useMutation(ADD_CONSENT_EMAIL, {
    onCompleted: (d) => handleOTPResult(d.addConsentEmail),
    onError: (err) => setEmailError(err.message || 'Failed to save email.'),
  })

  // For the "change email" flow when they're on the OTP screen
  const [reAddEmail, { loading: reAddingEmail }] = useMutation(ADD_CONSENT_EMAIL, {
    onCompleted: (d) => {
      setIsEditingEmail(false)
      handleOTPResult(d.addConsentEmail)
      toast.success('Email updated. New OTP sent.')
    },
    onError: (err) => setEditEmailError(err.message || 'Failed to update email.'),
  })

  const [reInitiate, { loading: resending }] = useMutation(INITIATE_CONSENT_OTP, {
    onCompleted: (d) => {
      setOtpToken(d.initiateConsentOTP.otpToken)
      setMaskedEmail(d.initiateConsentOTP.maskedEmail)
      toast.success('New OTP sent!')
      setOtp('')
      setOtpError('')
    },
    onError: () => toast.error('Failed to resend. Please try again.'),
  })

  const [verifyOTP, { loading: verifyingOTP }] = useMutation(VERIFY_CONSENT_OTP, {
    onCompleted: () => setStep('consent'),
    onError: () => setOtpError('Incorrect OTP. Please try again.'),
  })

  const [recordConsent, { loading: submitting }] = useMutation(RECORD_CONSENT, {
    onCompleted: () => setStep('done'),
    onError: () => toast.error('Something went wrong. Please try again.'),
  })

  useEffect(() => {
    if (!patientId) return
    if (consentData?.hasUserAcceptedPolicies) { setStep('already_accepted'); return }
    initiateOTP({ variables: { patientId } })
  }, [patientId, consentData])

  const handleEmailSubmit = () => {
    setEmailError('')
    if (!EMAIL_RE.test(newEmail.trim())) { setEmailError('Please enter a valid email.'); return }
    addEmail({ variables: { patientId, email: newEmail.trim() } })
  }

  const handleEditEmailSubmit = () => {
    setEditEmailError('')
    if (!EMAIL_RE.test(editEmail.trim())) { setEditEmailError('Please enter a valid email.'); return }
    reAddEmail({ variables: { patientId, email: editEmail.trim() } })
  }

  const handleOTPSubmit = () => {
    setOtpError('')
    if (otp.length !== 6) { setOtpError('Please enter the 6-digit OTP.'); return }
    verifyOTP({ variables: { otpToken, otp } })
  }

  // ── States ──────────────────────────────────────────────────────────────

  if (step === 'loading') return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-3">
      <div className="w-6 h-6 border-2 border-gray-300 border-t-black rounded-full animate-spin" />
      <p className="text-xs text-gray-400">Sending verification code…</p>
    </div>
  )

  if (step === 'already_accepted') return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-6 gap-4">
      <div className="w-16 h-16 rounded-2xl flex items-center justify-center" style={{ backgroundColor: '#DDFE71' }}>
        <CheckCircle2 className="w-8 h-8 text-black" />
      </div>
      <h1 className="text-lg font-semibold text-gray-900 text-center">You've already accepted our policies</h1>
      <p className="text-sm text-gray-500 text-center max-w-xs">Your consent is on record. No further action needed.</p>
    </div>
  )

  if (step === 'done') return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-6 gap-4">
      <div className="w-16 h-16 rounded-2xl flex items-center justify-center" style={{ backgroundColor: '#DDFE71' }}>
        <CheckCircle2 className="w-8 h-8 text-black" />
      </div>
      <h1 className="text-lg font-semibold text-gray-900 text-center">Thank you!</h1>
      <p className="text-sm text-gray-500 text-center max-w-xs">Your consent has been recorded. You're all set for your session at Stance Health.</p>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">

      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-4 py-4 flex items-center gap-3 flex-shrink-0">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ backgroundColor: '#DDFE71' }}>
          <ShieldCheck className="w-5 h-5 text-black" />
        </div>
        <div>
          <h1 className="text-sm font-semibold text-gray-900">Stance Health — Consent</h1>
          <p className="text-xs text-gray-400">
            {step === 'add_email' && 'Add your email to continue'}
            {step === 'otp' && `OTP sent to ${maskedEmail}`}
            {step === 'consent' && 'Review and confirm the below'}
          </p>
        </div>
      </div>

      {/* ── Add email step ─────────────────────────────────────────── */}
      {step === 'add_email' && (
        <div className="flex-1 flex flex-col justify-center px-6 py-8 max-w-sm mx-auto w-full">
          <div className="mb-6">
            <div className="w-12 h-12 rounded-2xl bg-amber-50 flex items-center justify-center mb-4">
              <Mail className="w-6 h-6 text-amber-600" />
            </div>
            <h2 className="text-base font-semibold text-gray-900 mb-1">No email on file</h2>
            <p className="text-sm text-gray-500">
              We need an email address to verify your identity. Enter it below — we'll send an OTP to confirm.
            </p>
          </div>

          <input
            type="email"
            value={newEmail}
            onChange={(e) => { setNewEmail(e.target.value); setEmailError('') }}
            onKeyDown={(e) => e.key === 'Enter' && handleEmailSubmit()}
            placeholder="your.email@example.com"
            className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-black outline-none text-sm mb-1"
            autoFocus
          />
          {emailError && <p className="text-xs text-red-500 mt-1 mb-2">{emailError}</p>}

          <button
            onClick={handleEmailSubmit}
            disabled={addingEmail}
            className="w-full mt-3 py-3.5 rounded-2xl font-semibold text-sm text-black flex items-center justify-center gap-2 disabled:opacity-60"
            style={{ backgroundColor: '#DDFE71' }}
          >
            {addingEmail
              ? <div className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
              : 'Send OTP'
            }
          </button>
        </div>
      )}

      {/* ── OTP step ──────────────────────────────────────────────── */}
      {step === 'otp' && (
        <div className="flex-1 flex flex-col justify-center px-6 py-8 max-w-sm mx-auto w-full">
          {!isEditingEmail ? (
            <>
              <div className="mb-6">
                <h2 className="text-base font-semibold text-gray-900 mb-1">Check your email</h2>
                <p className="text-sm text-gray-500">
                  We've sent a 6-digit code to{' '}
                  <strong className="text-gray-700">{maskedEmail}</strong>
                </p>
              </div>

              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={otp}
                onChange={(e) => { setOtp(e.target.value.replace(/\D/g, '')); setOtpError('') }}
                onKeyDown={(e) => e.key === 'Enter' && handleOTPSubmit()}
                placeholder="123456"
                className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-black outline-none text-center tracking-widest text-xl font-semibold"
                autoFocus
              />
              {otpError && <p className="text-xs text-red-500 mt-2">{otpError}</p>}

              <button
                onClick={handleOTPSubmit}
                disabled={verifyingOTP || otp.length < 6}
                className="w-full mt-4 py-3.5 rounded-2xl font-semibold text-sm text-black flex items-center justify-center gap-2 disabled:opacity-60"
                style={{ backgroundColor: '#DDFE71' }}
              >
                {verifyingOTP
                  ? <div className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                  : 'Verify'
                }
              </button>

              <div className="flex items-center justify-center gap-4 mt-4">
                <button onClick={() => reInitiate({ variables: { patientId } })} disabled={resending}
                  className="text-xs text-gray-400 underline underline-offset-2">
                  {resending ? 'Sending…' : 'Resend OTP'}
                </button>
                <span className="text-gray-300">|</span>
                <button
                  onClick={() => { setIsEditingEmail(true); setEditEmail(''); setEditEmailError('') }}
                  className="text-xs text-blue-600 underline underline-offset-2 flex items-center gap-1"
                >
                  <Edit2 className="w-3 h-3" /> Change email
                </button>
              </div>
            </>
          ) : (
            /* ── Edit email inline ─────────────────────────────────── */
            <>
              <div className="mb-4">
                <h2 className="text-base font-semibold text-gray-900 mb-1">Change email</h2>
                <p className="text-sm text-gray-500">Enter a new email — we'll send a fresh OTP to it.</p>
              </div>

              <div className="relative">
                <input
                  type="email"
                  value={editEmail}
                  onChange={(e) => { setEditEmail(e.target.value); setEditEmailError('') }}
                  onKeyDown={(e) => e.key === 'Enter' && handleEditEmailSubmit()}
                  placeholder="new.email@example.com"
                  className={`w-full px-4 py-3 pr-12 rounded-xl border-2 outline-none text-sm ${
                    editEmailError ? 'border-red-300' : 'border-gray-200 focus:border-black'
                  }`}
                  autoFocus
                />
                {editEmail && EMAIL_RE.test(editEmail.trim()) && (
                  <button onClick={handleEditEmailSubmit}
                    className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-lg flex items-center justify-center"
                    style={{ backgroundColor: '#DDFE71' }}>
                    <Check className="w-4 h-4 text-black" />
                  </button>
                )}
              </div>
              {editEmailError && <p className="text-xs text-red-500 mt-1">{editEmailError}</p>}

              <button onClick={handleEditEmailSubmit} disabled={reAddingEmail || !editEmail.trim()}
                className="w-full mt-3 py-3.5 rounded-2xl font-semibold text-sm text-black flex items-center justify-center gap-2 disabled:opacity-60"
                style={{ backgroundColor: '#DDFE71' }}>
                {reAddingEmail
                  ? <div className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                  : 'Save & Send OTP'
                }
              </button>

              <button onClick={() => setIsEditingEmail(false)}
                className="mt-3 text-xs text-gray-400 underline underline-offset-2 text-center w-full">
                Cancel
              </button>
            </>
          )}
        </div>
      )}

      {/* ── Consent step ──────────────────────────────────────────── */}
      {step === 'consent' && (
        <>
          <div className="flex-1 overflow-y-auto">
            <ol className="px-4 py-4 space-y-3 pb-36">
              {policies.map((policy, index) => (
                <li key={policy.key} className="flex gap-1 items-baseline">
                  <span className="flex-shrink-0 text-gray-400 font-medium leading-relaxed" style={{ fontSize: '12px', minWidth: '14px', lineHeight: '1.625' }}>{index + 1}.</span>
                  <span className="flex-1">
                    <span className="text-gray-600 leading-relaxed" style={{ fontSize: '12px' }}>
                      {policy.text}
                      {policy.links.map((link) => (
                        <a key={link.url} href={link.url} target="_blank" rel="noopener noreferrer"
                          className="inline-flex items-center gap-0.5 ml-1 text-blue-600 underline underline-offset-2 font-medium"
                          style={{ fontSize: '11px' }}>
                          {link.label}
                          <ExternalLink className="w-2.5 h-2.5" />
                        </a>
                      ))}
                    </span>
                  </span>
                </li>
              ))}
            </ol>
          </div>

          <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 px-4 pb-8 pt-4 space-y-3">
            <button type="button" onClick={() => setAgreed((v) => !v)}
              className="flex items-center gap-2 w-full text-left">
              <span className="flex-shrink-0 w-4 h-4 rounded border-2 flex items-center justify-center transition-colors"
                style={agreed ? { backgroundColor: '#DDFE71', borderColor: '#000' } : { borderColor: '#d1d5db' }}>
                {agreed && (
                  <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 12 12" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2 6l3 3 5-5" />
                  </svg>
                )}
              </span>
              <span className="text-xs text-gray-700 font-medium">I have read and agree to all the above</span>
            </button>

            <button onClick={() => { if (agreed) recordConsent({ variables: { input: { userId: patientId, platform: 'web' } } }) }}
              disabled={!agreed || submitting}
              className="w-full py-4 rounded-2xl font-semibold text-sm text-black transition-all disabled:cursor-not-allowed"
              style={{ backgroundColor: agreed && !submitting ? '#DDFE71' : '#E5E7EB' }}>
              {submitting ? 'Saving…' : 'I agree and continue'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}

export default function ConsentPageWrapper() {
  const params = useParams()
  const patientId = params.patientId as string
  return (
    <ApolloProvider client={client}>
      <Toaster position="top-center" />
      <ConsentPage patientId={patientId} />
    </ApolloProvider>
  )
}
