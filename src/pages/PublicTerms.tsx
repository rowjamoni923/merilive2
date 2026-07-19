const PublicTerms = () => (
  <main className="min-h-screen bg-background text-foreground" style={{ touchAction: 'pan-y pinch-zoom', overscrollBehaviorY: 'auto', WebkitOverflowScrolling: 'touch' }}>
    <section className="bg-gradient-to-r from-primary via-accent to-primary px-4 py-7 text-center text-primary-foreground">
      <h1 className="text-2xl font-bold">Terms of Service</h1>
      <p className="mt-1 text-sm text-primary-foreground/85">MeriLive — Party & Chat</p>
      <p className="mt-1 text-xs text-primary-foreground/70">Last Updated: March 6, 2026</p>
    </section>

    <section className="mx-auto max-w-3xl space-y-6 px-4 py-8 text-sm leading-relaxed">
      <div>
        <h2 className="mb-2 text-lg font-bold">1. Acceptance</h2>
        <p>By using MeriLive, you agree to these Terms of Service and all app policies, including privacy, safety, live streaming, agency, payment, and content rules.</p>
      </div>
      <div>
        <h2 className="mb-2 text-lg font-bold">2. Eligibility</h2>
        <p>MeriLive is for users aged 18 or older. You are responsible for keeping your account, device, and login information secure.</p>
      </div>
      <div>
        <h2 className="mb-2 text-lg font-bold">3. Community Rules</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>No illegal, abusive, hateful, sexual, exploitative, or unsafe content.</li>
          <li>No sharing private contact/payment information where prohibited by app policy.</li>
          <li>No fraud, chargeback abuse, fake identity, bot activity, or platform manipulation.</li>
        </ul>
      </div>
      <div>
        <h2 className="mb-2 text-lg font-bold">4. Virtual Items & Earnings</h2>
        <p>Gem, diamonds, beans, gifts, VIP benefits, host earnings, agency commission, helper rewards, and withdrawals are governed by MeriLive in-app pricing and policy rules. Values may change according to admin-published policy.</p>
      </div>
      <div>
        <h2 className="mb-2 text-lg font-bold">5. Enforcement</h2>
        <p>We may restrict, suspend, remove content, block withdrawals, or terminate accounts that violate these terms, safety rules, payment rules, or legal requirements.</p>
      </div>
      <div>
        <h2 className="mb-2 text-lg font-bold">6. Contact</h2>
        <p>For support, contact <a href="mailto:support@merilive.com" className="font-semibold text-primary underline underline-offset-4">support@merilive.com</a> or visit <a href="/contact" className="font-semibold text-primary underline underline-offset-4">Contact Us</a>.</p>
      </div>
      <footer className="border-t border-border pt-5 text-center text-xs text-muted-foreground">
        © 2026 MeriLive — All Rights Reserved · <a href="/privacy-policy" className="underline underline-offset-4">Privacy Policy</a>
      </footer>
    </section>
  </main>
);

export default PublicTerms;