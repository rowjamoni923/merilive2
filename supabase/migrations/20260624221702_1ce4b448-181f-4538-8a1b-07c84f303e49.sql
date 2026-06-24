-- 1) Table
CREATE TABLE IF NOT EXISTS public.policy_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  level_code text NOT NULL UNIQUE,
  level_order smallint NOT NULL,
  title text NOT NULL,
  subtitle text,
  banner_path text,
  accent_hex text,
  body_md text NOT NULL,
  version integer NOT NULL DEFAULT 1,
  is_published boolean NOT NULL DEFAULT true,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.policy_documents TO anon, authenticated;
GRANT ALL ON public.policy_documents TO service_role;

ALTER TABLE public.policy_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read published policies" ON public.policy_documents;
CREATE POLICY "Anyone can read published policies"
ON public.policy_documents FOR SELECT
USING (is_published = true);

DROP POLICY IF EXISTS "Service role full access policies" ON public.policy_documents;
CREATE POLICY "Service role full access policies"
ON public.policy_documents FOR ALL TO service_role
USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.tg_policy_documents_touch() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_policy_documents_touch ON public.policy_documents;
CREATE TRIGGER trg_policy_documents_touch BEFORE UPDATE ON public.policy_documents
FOR EACH ROW EXECUTE FUNCTION public.tg_policy_documents_touch();

-- 2) Owner-write RPC (uses admin-panel session header)
CREATE OR REPLACE FUNCTION public.admin_upsert_policy_document(
  _level_code text,
  _level_order smallint,
  _title text,
  _subtitle text,
  _banner_path text,
  _accent_hex text,
  _body_md text,
  _is_published boolean DEFAULT true
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_admin uuid; v_id uuid;
BEGIN
  v_admin := public.current_admin_id_from_header();
  IF v_admin IS NULL
     AND COALESCE(auth.role(),'') <> 'service_role'
     AND NOT public.has_role(auth.uid(),'admin') THEN
    RAISE EXCEPTION 'Admin only';
  END IF;

  INSERT INTO public.policy_documents
    (level_code, level_order, title, subtitle, banner_path, accent_hex, body_md, is_published, updated_by, version)
  VALUES
    (_level_code, _level_order, _title, _subtitle, _banner_path, _accent_hex, _body_md, COALESCE(_is_published,true), COALESCE(v_admin, auth.uid()), 1)
  ON CONFLICT (level_code) DO UPDATE
    SET level_order = EXCLUDED.level_order,
        title = EXCLUDED.title,
        subtitle = EXCLUDED.subtitle,
        banner_path = COALESCE(EXCLUDED.banner_path, public.policy_documents.banner_path),
        accent_hex = EXCLUDED.accent_hex,
        body_md = EXCLUDED.body_md,
        is_published = EXCLUDED.is_published,
        updated_by = COALESCE(v_admin, auth.uid()),
        version = public.policy_documents.version + 1
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;

REVOKE ALL ON FUNCTION public.admin_upsert_policy_document(text, smallint, text, text, text, text, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_upsert_policy_document(text, smallint, text, text, text, text, text, boolean) TO anon, authenticated, service_role;

-- 3) Seed (English, drafted from the actual privileges already built in this project)
INSERT INTO public.policy_documents (level_code, level_order, title, subtitle, accent_hex, body_md, is_published)
VALUES
('L1', 1, 'Helper — Level 1', 'Entry-level top-up assistant',
 '#34d399',
$$## Eligibility
- Verified account, KYC submitted, at least 30 days active history.
- Single country assignment.

## Responsibilities
- Process user top-up requests with configured payment methods.
- Respond to assigned tickets within the SLA shown in your dashboard.

## Tools & Access
- Helper inbox, top-up approval queue, basic earnings view.

## Earnings & Commission
- Commission rate is set by owner and shown live in the helper dashboard.
- No hardcoded numbers — every rate reads from the admin-managed settings.

## Conduct
- No off-platform contact, no shared accounts, no method swaps without approval.

## Termination & Appeal
- Two strikes for payment-method violations → suspension.
- Appeal via support ticket → routed to L5 / L6 of the same country.$$,
 true),

('L2', 2, 'Verified Helper — Level 2', 'KYC-verified helper with extended limits',
 '#60a5fa',
$$## Eligibility
- Full KYC + face verification.
- Minimum 60 days as L1 with clean record.

## Added Privileges over L1
- Higher daily top-up cap.
- Access to bulk-approve queue.
- Custom payment method visibility per country (subject to CSA visibility threshold).

## Responsibilities
- All L1 duties, plus quality review of L1 actions in your country.

## Compliance
- Mandatory monthly self-audit log.
- Any visibility manipulation = immediate downgrade.$$,
 true),

('L3', 3, 'Senior Helper / Trader — Level 3', 'Multi-country trader tier',
 '#a78bfa',
$$## Eligibility
- L2 in good standing for 90 days.
- Trading volume threshold met (read live from admin config).

## Privileges
- Multi-country payment method management.
- Access to trader wallet + diamond trader transfers.
- Direct line to L5 for escalations.

## Responsibilities
- Liquidity readiness in every assigned country.
- Onboarding mentorship for new L1 helpers.

## Conduct
- Country-isolation rule: never bridge funds across countries without approval.$$,
 true),

('L4', 4, 'Payroll Trader — Level 4', 'Automated payroll trader tier',
 '#f59e0b',
$$## Eligibility
- L3 with payroll_enabled flag set by owner.
- Verified trader_level = 4 in topup_helpers.

## Privileges
- Auto-payroll on configured schedule.
- Higher commission tier (read live from `trader_level_tiers`).
- Direct withdrawal bonus visibility.

## Responsibilities
- Maintain minimum trader-wallet float as configured.
- Daily reconciliation of payroll ledger.

## Termination
- Missed reconciliation for 3 consecutive days → payroll auto-pause + L5 review.$$,
 true),

('L5', 5, 'Country Payroll Admin — Level 5', 'Regional finance lead',
 '#ec4899',
$$## Authority
- Approve agency withdrawals in assigned country.
- Approve helper upgrade requests up to L4.
- Manage payroll commission rates in the live admin table.

## Privileges
- Access to country payroll admin console.
- Helper messaging at country scope.
- Commission earnings on processed payroll volume.

## Responsibilities
- Same-day processing of agency withdrawal queue.
- Quarterly audit of all L1–L4 helpers in country.

## Compliance
- Cannot self-approve own withdrawals or own commission edits.
- Every action is logged in `country_payroll_admin_audit`.$$,
 true),

('L6', 6, 'Country Super Admin (CSA) — Level 6', 'Highest country-level operator',
 '#facc15',
$$## Overview
The Country Super Admin (CSA) is the flagship operator role for an entire country. The CSA controls the country's helper visibility, holds the country diamond wallet, and earns auto-bonus on every approved agency withdrawal in their country.

## Diamond Wallet Operations (live from admin config)
All numbers below are read live from `csa_diamond_settings` — they are NEVER hardcoded. The owner can change any of them at any moment and the change reflects to every CSA instantly.

- **Minimum Purchase (USD):** the floor for each diamond purchase order.
- **Diamonds per 1 USD:** the conversion rate used to compute credited diamonds.
- **Visibility Threshold (Diamonds):** when the CSA balance is at or above this number, the CSA's country payment methods are LIVE for end users in that country. Below this number, the owner's official methods are shown instead (if `Owner Fallback` is enabled).
- **Owner Fallback:** when enabled, the owner pool guarantees uninterrupted helper top-up service even if a CSA balance hits zero.
- **Auto-credit on Payment:** when enabled, the crypto webhook automatically credits diamonds the moment a purchase is confirmed. When disabled, every purchase needs manual approval.
- **Withdrawal Bonus Rate (%):** the auto-credited reward percentage applied to every agency withdrawal in the CSA's country.
- **Bonus Trigger Status:** the withdrawal status (default `approved`) on which the bonus auto-credits.

## Country-Level Authority
- Final escalation point for all L1–L5 disputes in the country.
- Can pause / resume helper visibility in emergencies.
- Sole owner of country diamond wallet.

## Sub-Admin Management
- Approve, suspend, or revoke L5 Country Payroll Admins in country.
- Set scope and section permissions via the admin console.

## Payroll Oversight
- Read-only view of every payroll run for full transparency.
- Cannot edit payroll without owner co-sign.

## Audit & Reporting
- Every action logged in `country_payroll_admin_audit` and `admin_logs`.
- Monthly country report auto-generated and emailed.

## SLA & Uptime
- Diamond wallet balance must be kept above the visibility threshold to honour the country-method SLA.
- A balance drop below threshold triggers an immediate in-app low-balance dialog and a fallback to owner methods.

## Confidentiality
- Settings values, country payroll details, and helper financial data are strictly confidential.
- Sharing any of the above outside the platform = immediate termination + legal action.

## Termination & Appeal
- Termination is an owner-only action. Appeals route directly to the owner.
- On termination, the CSA diamond balance is reconciled and any remaining bonus is paid out per the owner's instructions.

## Contact & Escalation
- Use the in-app support ticket flow tagged `csa-l6` for any operational issue.
- For confidential matters, use the email broadcast reply channel.$$,
 true)
ON CONFLICT (level_code) DO NOTHING;

NOTIFY pgrst, 'reload schema';