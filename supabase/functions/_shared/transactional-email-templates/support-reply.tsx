/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Preview, Section, Text, Hr,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = 'MeriLive'

interface SupportReplyProps {
  ticketNumber?: string
  ticketSubject?: string
  replyContent?: string
}

const SupportReplyEmail = ({
  ticketNumber = '',
  ticketSubject = '',
  replyContent = '',
}: SupportReplyProps) => {
  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>{`Support reply for ticket #${ticketNumber}`}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>💬 Support Reply</Heading>
          <Text style={text}>We've responded to your support ticket.</Text>

          <Section style={ticketBox}>
            <Text style={ticketLabel}>{`Ticket #${ticketNumber}`}</Text>
            <Text style={ticketSubjectStyle}>{ticketSubject}</Text>
          </Section>

          <Section style={replyBox}>
            <Text style={replyHeader}>✉️ Our Response</Text>
            <Text style={replyText}>{replyContent}</Text>
          </Section>

          <Text style={text}>
            Have more questions? Open the app and continue the conversation.
          </Text>

          <Hr style={hr} />
          <Text style={footer}>The {SITE_NAME} Support Team</Text>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: SupportReplyEmail,
  subject: (data: Record<string, any>) =>
    `Re: ${data?.ticketSubject || 'Support'} [Ticket #${data?.ticketNumber || ''}]`,
  displayName: 'Support reply',
  previewData: {
    ticketNumber: '297429',
    ticketSubject: 'Live Chat - Account / Profile Issue',
    replyContent: 'Thanks for reaching out — your account has been restored.',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#f0f2f5', fontFamily: 'Arial, sans-serif' }
const container = { padding: '24px 28px', maxWidth: '600px', margin: '0 auto', background: '#ffffff', borderRadius: '12px' }
const h1 = { fontSize: '22px', fontWeight: 'bold', color: '#0f172a', margin: '0 0 18px' }
const text = { fontSize: '14px', color: '#334155', lineHeight: '1.55', margin: '0 0 14px' }
const ticketBox = {
  background: '#f8f9fc',
  borderLeft: '4px solid #6366f1',
  borderRadius: '8px',
  padding: '12px 16px',
  margin: '8px 0 18px',
}
const ticketLabel = { fontSize: '11px', color: '#6b7280', textTransform: 'uppercase' as const, letterSpacing: '0.08em', margin: '0 0 4px', fontWeight: 600 }
const ticketSubjectStyle = { fontSize: '15px', color: '#1f2937', fontWeight: 600, margin: 0 }
const replyBox = {
  background: '#ede9fe',
  borderRadius: '10px',
  padding: '16px 18px',
  margin: '8px 0 18px',
}
const replyHeader = { fontSize: '11px', color: '#7c3aed', textTransform: 'uppercase' as const, letterSpacing: '0.08em', margin: '0 0 6px', fontWeight: 700 }
const replyText = { fontSize: '14px', color: '#374151', lineHeight: '1.65', margin: 0, whiteSpace: 'pre-wrap' as const }
const hr = { borderColor: '#e2e8f0', margin: '24px 0 16px' }
const footer = { fontSize: '12px', color: '#94a3b8', margin: 0 }
