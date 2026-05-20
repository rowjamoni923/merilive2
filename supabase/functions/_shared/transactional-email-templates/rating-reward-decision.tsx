/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Preview, Section, Text, Hr,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = 'Merilive'

interface DecisionProps {
  displayName?: string
  status?: 'approved' | 'rejected'
  rewardType?: 'beans' | 'diamonds' | string
  rewardAmount?: number
  rejectionReason?: string
}

const RatingRewardDecisionEmail = ({
  displayName,
  status = 'approved',
  rewardType,
  rewardAmount,
  rejectionReason,
}: DecisionProps) => {
  const isApproved = status === 'approved'
  const greeting = displayName ? `Hi ${displayName},` : 'Hello,'
  const rewardLabel =
    rewardType === 'beans'
      ? `${Number(rewardAmount || 0).toLocaleString()} Beans`
      : `${Number(rewardAmount || 0).toLocaleString()} Diamonds`

  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>
        {isApproved
          ? `Your rating reward has been approved — ${rewardLabel} credited.`
          : 'Your rating reward submission needs another try.'}
      </Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>
            {isApproved ? '🎉 Rating Reward Approved' : '❌ Rating Reward Rejected'}
          </Heading>
          <Text style={text}>{greeting}</Text>

          {isApproved ? (
            <>
              <Text style={text}>
                Thank you for rating {SITE_NAME} on the Play Store. Your screenshot
                has been verified by our team.
              </Text>
              <Section style={rewardBox}>
                <Text style={rewardLabelStyle}>Reward Credited</Text>
                <Text style={rewardValueStyle}>{rewardLabel}</Text>
              </Section>
              <Text style={text}>
                The reward is already available in your account balance. Enjoy!
              </Text>
            </>
          ) : (
            <>
              <Text style={text}>
                We reviewed your Play Store rating screenshot and were unable to
                approve it this time.
              </Text>
              {rejectionReason && (
                <Section style={reasonBox}>
                  <Text style={reasonLabel}>Reason</Text>
                  <Text style={reasonValue}>{rejectionReason}</Text>
                </Section>
              )}
              <Text style={text}>
                Open the app, tap the Rating Reward row on your profile, and
                submit a fresh screenshot showing all 5 stars selected on the
                {` ${SITE_NAME} `}Play Store page.
              </Text>
            </>
          )}

          <Hr style={hr} />
          <Text style={footer}>The {SITE_NAME} Team</Text>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: RatingRewardDecisionEmail,
  subject: (data: Record<string, any>) =>
    data?.status === 'rejected'
      ? `Your ${SITE_NAME} rating reward needs another try`
      : `Your ${SITE_NAME} rating reward has been credited 🎉`,
  displayName: 'Rating reward decision',
  previewData: {
    displayName: 'Jane',
    status: 'approved',
    rewardType: 'beans',
    rewardAmount: 5000,
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }
const container = { padding: '24px 28px', maxWidth: '560px', margin: '0 auto' }
const h1 = { fontSize: '22px', fontWeight: 'bold', color: '#0f172a', margin: '0 0 18px' }
const text = { fontSize: '14px', color: '#334155', lineHeight: '1.55', margin: '0 0 14px' }
const rewardBox = {
  background: '#ecfdf5',
  border: '1px solid #a7f3d0',
  borderRadius: '10px',
  padding: '14px 16px',
  margin: '8px 0 18px',
}
const rewardLabelStyle = { fontSize: '11px', color: '#047857', textTransform: 'uppercase' as const, letterSpacing: '0.06em', margin: '0 0 4px', fontWeight: 600 }
const rewardValueStyle = { fontSize: '20px', color: '#065f46', fontWeight: 700, margin: 0 }
const reasonBox = {
  background: '#fef2f2',
  border: '1px solid #fecaca',
  borderRadius: '10px',
  padding: '12px 16px',
  margin: '8px 0 18px',
}
const reasonLabel = { fontSize: '11px', color: '#b91c1c', textTransform: 'uppercase' as const, letterSpacing: '0.06em', margin: '0 0 4px', fontWeight: 600 }
const reasonValue = { fontSize: '14px', color: '#7f1d1d', margin: 0, lineHeight: '1.5' }
const hr = { borderColor: '#e2e8f0', margin: '24px 0 16px' }
const footer = { fontSize: '12px', color: '#94a3b8', margin: 0 }
