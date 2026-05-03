/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Preview, Section, Text, Row, Column,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

interface OtpProps {
  otp?: string
  purpose?: string
  expiryMinutes?: number
  displayName?: string
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

const purposeIntro = (p?: string, name?: string): string => {
  const greeting = name ? `Hi ${name},` : 'Hello,'
  switch (p) {
    case 'login':
      return `${greeting} use the code below to securely sign in to your MeriLive account.`
    case 'register':
      return `${greeting} welcome to MeriLive! Use the code below to verify your email and activate your account.`
    case 'reset':
    case 'password_reset':
      return `${greeting} we received a request to reset your password. Use the code below to continue.`
    case 'admin':
    case 'two_factor':
      return `${greeting} use the code below to complete admin two-factor verification.`
    case 'agency':
      return `${greeting} use the code below to verify your agency account.`
    default:
      return `${greeting} use the code below to complete your verification.`
  }
}

const OtpEmail = ({ otp = '------', purpose = 'verify', expiryMinutes = 5, displayName }: OtpProps) => {
  const label = purposeLabel(purpose)
  const intro = purposeIntro(purpose, displayName)
  const code = String(otp).padEnd(6, '·').slice(0, 6)
  const digits = code.split('')

  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>{`Your MeriLive ${label.toLowerCase()} code is ${otp} — expires in ${expiryMinutes} minutes`}</Preview>
      <Body style={main}>
        <Container style={outerContainer}>
          {/* Premium Card */}
          <Section style={card}>
            {/* Gold gradient header */}
            <Section style={header}>
              <Text style={brandRow}>
                <span style={brandWhite}>MERI</span>
                <span style={brandGold}>LIVE</span>
              </Text>
              <Text style={tagline}>Premium Live Streaming</Text>
            </Section>

            {/* Body */}
            <Section style={bodySection}>
              <Text style={purposePill}>{label}</Text>
              <Heading as="h1" style={h1}>Your Verification Code</Heading>
              <Text style={introText}>{intro}</Text>

              {/* OTP Boxes */}
              <Section style={otpWrap}>
                <Row>
                  {digits.map((d, i) => (
                    <Column key={i} align="center" style={otpCell}>
                      <Text style={otpDigit}>{d}</Text>
                    </Column>
                  ))}
                </Row>
              </Section>

              {/* Expiry */}
              <Text style={expiryText}>
                ⏱ This code expires in <strong style={expiryStrong}>{expiryMinutes} minutes</strong>
              </Text>

              {/* Security note */}
              <Section style={securityBox}>
                <Text style={securityTitle}>🔒 Security Notice</Text>
                <Text style={securityText}>
                  MeriLive staff will <strong>never</strong> ask for this code. If you didn't request this verification, you can safely ignore this email — your account remains secure.
                </Text>
              </Section>
            </Section>

            {/* Footer */}
            <Section style={footerSection}>
              <Text style={footerBrand}>MERI<span style={brandGold}>LIVE</span></Text>
              <Text style={footerText}>This is an automated security email from MeriLive.</Text>
              <Text style={footerSmall}>© {new Date().getFullYear()} MeriLive · All Rights Reserved</Text>
            </Section>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: OtpEmail,
  subject: (data: Record<string, any>) => {
    const code = String(data?.otp ?? '').trim()
    const lbl = purposeLabel(data?.purpose)
    return code ? `${code} — Your MeriLive ${lbl} Code` : `Your MeriLive ${lbl} Code`
  },
  displayName: 'OTP / Verification Code',
  previewData: { otp: '482917', purpose: 'login', expiryMinutes: 5, displayName: 'Sazzad' },
} satisfies TemplateEntry

/* ===== Premium luxurious styles (email-client safe) ===== */
const main = {
  backgroundColor: '#ffffff',
  margin: '0',
  padding: '0',
  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
}
const outerContainer = {
  width: '100%',
  maxWidth: '560px',
  margin: '0 auto',
  padding: '32px 16px',
}
const card = {
  background: '#ffffff',
  borderRadius: '20px',
  overflow: 'hidden' as const,
  border: '1px solid #ece6d3',
  boxShadow: '0 8px 32px rgba(15, 12, 41, 0.08)',
}
const header = {
  background: 'linear-gradient(135deg, #0b0a1f 0%, #1a1340 50%, #2d1b6b 100%)',
  padding: '36px 24px 30px',
  textAlign: 'center' as const,
}
const brandRow = {
  margin: '0',
  fontSize: '28px',
  fontWeight: 800 as const,
  letterSpacing: '4px',
  lineHeight: '1',
}
const brandWhite = { color: '#ffffff' }
const brandGold = { color: '#f5d472' }
const tagline = {
  margin: '10px 0 0',
  fontSize: '11px',
  fontWeight: 600 as const,
  letterSpacing: '3px',
  textTransform: 'uppercase' as const,
  color: '#c9b079',
}
const bodySection = {
  padding: '32px 28px 8px',
  background: '#ffffff',
}
const purposePill = {
  display: 'inline-block',
  margin: '0 0 14px',
  padding: '6px 14px',
  fontSize: '11px',
  fontWeight: 700 as const,
  letterSpacing: '2px',
  textTransform: 'uppercase' as const,
  color: '#7a5a16',
  background: 'linear-gradient(135deg, #fbf3d2 0%, #f5e6a8 100%)',
  border: '1px solid #f0d97a',
  borderRadius: '999px',
}
const h1 = {
  margin: '6px 0 12px',
  fontSize: '24px',
  fontWeight: 800 as const,
  color: '#0b0a1f',
  letterSpacing: '-0.3px',
}
const introText = {
  margin: '0 0 26px',
  fontSize: '15px',
  lineHeight: '1.6',
  color: '#4a4a5e',
}
const otpWrap = {
  margin: '8px 0 18px',
  padding: '20px 8px',
  background: 'linear-gradient(135deg, #faf6e8 0%, #fff9e3 100%)',
  border: '1px solid #f0d97a',
  borderRadius: '14px',
}
const otpCell = {
  width: '14%',
  padding: '0 3px',
  textAlign: 'center' as const,
}
const otpDigit = {
  display: 'inline-block',
  width: '100%',
  margin: '0',
  padding: '14px 0',
  background: 'linear-gradient(180deg, #ffffff 0%, #fffdf4 100%)',
  border: '1.5px solid #d4af37',
  borderRadius: '10px',
  fontSize: '28px',
  fontWeight: 800 as const,
  color: '#0b0a1f',
  fontFamily: "'SF Mono', Menlo, Consolas, 'Courier New', monospace",
  textAlign: 'center' as const,
  lineHeight: '1',
  boxShadow: '0 2px 8px rgba(212, 175, 55, 0.18)',
}
const expiryText = {
  margin: '4px 0 22px',
  fontSize: '13px',
  color: '#6b6b80',
  textAlign: 'center' as const,
}
const expiryStrong = {
  color: '#a07d1f',
}
const securityBox = {
  margin: '0 0 18px',
  padding: '16px 18px',
  background: '#f8f7fb',
  borderLeft: '3px solid #d4af37',
  borderRadius: '0 10px 10px 0',
}
const securityTitle = {
  margin: '0 0 6px',
  fontSize: '13px',
  fontWeight: 700 as const,
  color: '#0b0a1f',
}
const securityText = {
  margin: '0',
  fontSize: '13px',
  lineHeight: '1.55',
  color: '#55556a',
}
const footerSection = {
  padding: '20px 28px 28px',
  background: '#fafaf6',
  borderTop: '1px solid #eee7d3',
  textAlign: 'center' as const,
}
const footerBrand = {
  margin: '0 0 8px',
  fontSize: '13px',
  fontWeight: 800 as const,
  letterSpacing: '3px',
  color: '#0b0a1f',
}
const footerText = {
  margin: '0 0 4px',
  fontSize: '12px',
  color: '#888899',
}
const footerSmall = {
  margin: '0',
  fontSize: '11px',
  color: '#aaaab5',
}
