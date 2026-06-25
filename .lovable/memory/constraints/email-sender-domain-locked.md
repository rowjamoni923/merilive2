---
name: Email sender domain locked
description: notify.send.merilive.com is the PERMANENT sender domain. Never change, remove, disable, or switch to another provider.
type: constraint
---

# 🔒 PERMANENT EMAIL SENDER DOMAIN

**Domain:** `notify.send.merilive.com` (root: `send.merilive.com`)
**Status:** LOCKED — user explicit instruction 2026-06-25

## Forbidden actions
- ❌ NEVER call `email_domain--toggle_project_emails` with `enabled: false`
- ❌ NEVER suggest switching to Resend / SendGrid / Mailgun / Brevo / Gmail connector for app or auth emails
- ❌ NEVER suggest removing the NS records (`ns5.lovable.cloud`, `ns6.lovable.cloud`) at the registrar
- ❌ NEVER re-run domain setup with a different subdomain
- ❌ NEVER delete `auth-email-hook`, `send-transactional-email`, `handle-email-unsubscribe`, `handle-email-suppression`, `process-email-queue` edge functions
- ❌ NEVER remove their entries from `supabase/config.toml`
- ❌ NEVER rename `auth-email-hook` (system contract)

## Why
User personally chose `send.merilive.com` and explicitly instructed: "এটা permanent করো যাতে এটা আর ভুল না হয় বা এটা remove না হয়।" All OTP / auth / transactional emails MUST route through this Lovable-managed domain so they land in Gmail Inbox (not Spam).

## If something breaks
Troubleshoot WITHIN Lovable Emails (check DNS verify in Cloud → Emails, check `email_send_log`, redeploy edge functions, rerun `setup_email_infra` if queue infra missing). Do NOT propose provider switch as a fix.
