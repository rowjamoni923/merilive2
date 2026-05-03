/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

interface OtpProps {
  otp?: string
  purpose?: string
  expiryMinutes?: number
}

const purposeLabel = (p?: string): string => {
  switch (p) {
    case 'login': return 'Sign-In Verification'
    case 'register': return 'Account Verification'
    case 'reset':
    case 'password_reset': return 'Password Reset'
    case 'admin':
    case 'two_factor': return 'Admin Verification'
    case 'agency': return 'Agency Verification'
    default: return 'Identity Verification'
  }
}

const OtpEmail = ({ otp = '------', purpose = 'verify', expiryMinutes = 5 }: OtpProps) => {
  const label = purposeLabel(purpose)
  const digits = String(otp).split('')
  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>Your MeriLive {label.toLowerCase()} code is {otp}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={header}>
            <Text style={brand}>
              <span style={brandWhite}>MERI</span><span style={brandGold}>LIVE</span>
            </Text>
            <Text style={labelStyle}>{label}</Text>
          </Section>
          <Section style={card}>
            <Text style={cardLabel}>Your Verification Code</Text>
            <Text style={otpRow}>
              {digits.map((d, i) => (
                <span key={i} style={digit}>{d}</span>
              ))}
            </Text>
            <Text style={expiry}>Expires in {expiryMinutes} minutes</Text>
          </Section>
          <Section style={tipBox}>
            <Text style={tipText}>
              <strong style={tipStrong}>Security tip:</strong> MeriLive staff will never ask for this code. If you didn't request it, please ignore this email.
            </Text>
          </Section>
          <Text style={footer}>© {new Date().getFullYear()} MeriLive · All Rights Reserved</Text>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: OtpEmail,
  subject: (data: Record<string, any>) => `[MeriLive] ${purposeLabel(data?.purpose)} Code`,
  displayName: 'OTP / Verification Code',
  previewData: { otp: '482917', purpose: 'login', expiryMinutes: 5 },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif" }
const container = { padding: '32px 16px', maxWidth: '520px', margin: '0 auto' }
const header = { background: '#0b0a1f', borderRadius: '16px 16px 0 0', padding: '32px 24px', textAlign: 'center' as const }
const brand = { fontSize: '24px', fontWeight: 'bold' as const, letterSpacing: '3px', margin: '0' }
const brandWhite = { color: '#ffffff' }
const brandGold = { color: '#f5d472' }
const labelStyle = { marginTop: '14px', fontSize: '11px', fontWeight: 'bold' as const, letterSpacing: '4px', textTransform: 'uppercase' as const, color: '#c9b079' }
const card = { background: '#10102b', padding: '28px 16px', textAlign: 'center' as const, borderRadius: '0' }
const cardLabel = { fontSize: '11px', fontWeight: 'bold' as const, color: '#f5d472', letterSpacing: '4px', textTransform: 'uppercase' as const, margin: '0 0 18px' }
const otpRow = { margin: '0', fontSize: '0' }
const digit = { display: 'inline-block', width: '40px', height: '52px', lineHeight: '52px', margin: '0 4px', background: '#1a1740', border: '1px solid #3a2d6b', borderRadius: '10px', fontSize: '26px', fontWeight: 'bold' as const, color: '#f5d472', fontFamily: 'Georgia, serif' }
const expiry = { marginTop: '18px', fontSize: '12px', color: '#7e7fa8', letterSpacing: '1px' }
const tipBox = { background: '#fdf8e8', borderLeft: '3px solid #f5d472', borderRadius: '0 0 16px 16px', padding: '14px 16px' }
const tipText = { margin: '0', fontSize: '12px', lineHeight: '1.6', color: '#333333' }
const tipStrong = { color: '#a07d1f' }
const footer = { textAlign: 'center' as const, fontSize: '11px', color: '#999999', marginTop: '20px' }
