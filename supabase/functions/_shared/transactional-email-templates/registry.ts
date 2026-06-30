/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'

export interface TemplateEntry {
  component: React.ComponentType<any>
  subject: string | ((data: Record<string, any>) => string)
  to?: string
  displayName?: string
  previewData?: Record<string, any>
}

import { template as otpCode } from './otp-code.tsx'
import { template as ratingRewardDecision } from './rating-reward-decision.tsx'
import { template as supportReply } from './support-reply.tsx'

export const TEMPLATES: Record<string, TemplateEntry> = {
  'otp-code': otpCode,
  'rating-reward-decision': ratingRewardDecision,
  'support-reply': supportReply,
}
