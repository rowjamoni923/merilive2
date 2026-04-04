/**
 * Public Privacy Policy Page
 * Accessible without authentication — required by Google Play Store
 * URL: /privacy-policy
 */

const PublicPrivacyPolicy = () => (
  <div className="min-h-screen bg-white text-gray-900">
    {/* Header */}
    <div className="bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-700 py-6 px-4 text-center">
      <h1 className="text-2xl font-bold text-white">Privacy Policy</h1>
      <p className="text-white/70 text-sm mt-1">MeriLive — Party & Chat (com.merilive.app)</p>
      <p className="text-white/50 text-xs mt-1">Last Updated: March 6, 2026</p>
    </div>

    <div className="max-w-3xl mx-auto px-4 py-8 space-y-6 text-sm leading-relaxed">

      <section>
        <h2 className="text-lg font-bold mb-2">1. Introduction</h2>
        <p>
          Welcome to MeriLive ("we", "our", "us"). This Privacy Policy explains how we collect, use, disclose,
          and safeguard your information when you use our mobile application MeriLive — Party & Chat
          (com.merilive.app) available on Google Play Store. Please read this privacy policy carefully. If you
          do not agree with the terms of this privacy policy, please do not access the application.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-bold mb-2">2. Information We Collect</h2>
        <p className="font-semibold mb-1">Personal Data:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Name, email address, phone number provided during registration</li>
          <li>Profile photo and bio information</li>
          <li>Gender and date of birth</li>
          <li>Payment and transaction information for in-app purchases</li>
        </ul>

        <p className="font-semibold mt-3 mb-1">Automatically Collected Data:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Device information (model, OS version, unique device identifiers)</li>
          <li>IP address and approximate location (country/city level)</li>
          <li>App usage data and interaction logs</li>
          <li>Crash reports and performance data</li>
        </ul>
      </section>

      <section>
        <h2 className="text-lg font-bold mb-2">3. Camera & Microphone</h2>
        <p>
          We access your device camera and microphone solely for the following core features:
        </p>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>Live Streaming:</strong> To broadcast live video and audio content</li>
          <li><strong>Video Calls:</strong> To enable one-on-one and group video/audio calls</li>
          <li><strong>Profile Photo:</strong> To capture profile pictures</li>
          <li><strong>Face Verification:</strong> For identity verification during host registration</li>
        </ul>
        <p className="mt-2">
          Camera and microphone data is transmitted in real-time during calls/streams and is not stored
          on our servers after the session ends, except for face verification photos which are stored
          securely for identity verification purposes.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-bold mb-2">4. Location Data</h2>
        <p>
          We collect <strong>approximate location data</strong> (country and city level) using your IP address for the following purposes:
        </p>
        <ul className="list-disc pl-5 space-y-1">
          <li>To display country flags on user profiles</li>
          <li>To match users with nearby content and hosts</li>
          <li>To comply with regional regulations and content restrictions</li>
          <li>To detect and prevent fraud (VPN/proxy detection for host verification)</li>
          <li>To provide region-appropriate currency and payment options</li>
        </ul>
        <p className="mt-2">
          We use <strong>coarse location (ACCESS_COARSE_LOCATION)</strong> and <strong>fine location (ACCESS_FINE_LOCATION)</strong> permissions
          only when you explicitly grant permission. Location data is used solely for the purposes described above
          and is not shared with third parties for advertising purposes.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-bold mb-2">5. How We Use Your Information</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li>To create and manage your account</li>
          <li>To enable live streaming, video calls, and chat features</li>
          <li>To process in-app purchases and transactions</li>
          <li>To provide customer support</li>
          <li>To enforce our community guidelines and terms of service</li>
          <li>To detect and prevent fraud, abuse, and policy violations</li>
          <li>To improve our services and user experience</li>
          <li>To send important notifications about your account</li>
        </ul>
      </section>

      <section>
        <h2 className="text-lg font-bold mb-2">6. Data Sharing & Disclosure</h2>
        <p>We do NOT sell your personal data. We may share information with:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>Service Providers:</strong> Cloud hosting (Supabase), analytics, payment processors</li>
          <li><strong>Legal Compliance:</strong> When required by law or to protect our rights</li>
          <li><strong>Business Transfers:</strong> In connection with a merger, acquisition, or sale of assets</li>
        </ul>
      </section>

      <section>
        <h2 className="text-lg font-bold mb-2">7. Data Storage & Security</h2>
        <p>
          Your data is stored on secure cloud servers with encryption at rest and in transit.
          We implement industry-standard security measures including:
        </p>
        <ul className="list-disc pl-5 space-y-1">
          <li>SSL/TLS encryption for all data transmission</li>
          <li>Row-Level Security (RLS) for database access control</li>
          <li>Regular security audits and vulnerability assessments</li>
          <li>Secure authentication with multi-factor support</li>
        </ul>
      </section>

      <section>
        <h2 className="text-lg font-bold mb-2">8. Your Rights</h2>
        <p>You have the right to:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Access your personal data</li>
          <li>Request correction of inaccurate data</li>
          <li>Request deletion of your account and data</li>
          <li>Withdraw consent for data collection</li>
          <li>Export your data in a portable format</li>
        </ul>
        <p className="mt-2">
          To exercise these rights, contact us at <strong>support@merilive.com</strong> or through
          the in-app customer service feature.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-bold mb-2">9. Children's Privacy</h2>
        <p>
          MeriLive is not intended for children under 18 years of age. We do not knowingly collect
          personal information from children under 18. If we discover that a child under 18 has
          provided us with personal information, we will delete such information immediately.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-bold mb-2">10. Third-Party Services</h2>
        <p>Our app integrates with the following third-party services:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>Google Sign-In:</strong> For authentication (governed by Google's Privacy Policy)</li>
          <li><strong>Firebase:</strong> For push notifications and analytics</li>
          <li><strong>Supabase:</strong> For data storage and authentication</li>
          <li><strong>LiveKit:</strong> For real-time video/audio streaming</li>
        </ul>
      </section>

      <section>
        <h2 className="text-lg font-bold mb-2">11. Permissions Summary</h2>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse border border-gray-300 text-xs">
            <thead>
              <tr className="bg-gray-100">
                <th className="border border-gray-300 p-2 text-left">Permission</th>
                <th className="border border-gray-300 p-2 text-left">Purpose</th>
              </tr>
            </thead>
            <tbody>
              <tr><td className="border border-gray-300 p-2">Camera</td><td className="border border-gray-300 p-2">Live streaming, video calls, face verification</td></tr>
              <tr><td className="border border-gray-300 p-2">Microphone</td><td className="border border-gray-300 p-2">Voice calls, live streaming audio</td></tr>
              <tr><td className="border border-gray-300 p-2">Location</td><td className="border border-gray-300 p-2">Country detection, fraud prevention</td></tr>
              <tr><td className="border border-gray-300 p-2">Storage</td><td className="border border-gray-300 p-2">Save/upload photos, media sharing</td></tr>
              <tr><td className="border border-gray-300 p-2">Notifications</td><td className="border border-gray-300 p-2">Call alerts, messages, updates</td></tr>
              <tr><td className="border border-gray-300 p-2">Phone State</td><td className="border border-gray-300 p-2">Detect incoming calls during video sessions</td></tr>
              <tr><td className="border border-gray-300 p-2">Bluetooth</td><td className="border border-gray-300 p-2">Connect audio devices (headphones/speakers)</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="text-lg font-bold mb-2">12. Changes to This Policy</h2>
        <p>
          We may update this Privacy Policy from time to time. We will notify you of any changes
          by posting the new Privacy Policy on this page and updating the "Last Updated" date.
          You are advised to review this Privacy Policy periodically for any changes.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-bold mb-2">13. Contact Us</h2>
        <p>If you have any questions about this Privacy Policy, please contact us:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>Email:</strong> support@merilive.com</li>
          <li><strong>In-App:</strong> Settings → Customer Service</li>
          <li><strong>Website:</strong> https://merilive.lovable.app/privacy-policy</li>
        </ul>
      </section>

      {/* Footer */}
      <div className="text-center pt-6 pb-4 border-t border-gray-200">
        <p className="text-gray-400 text-xs">© 2026 MeriLive — All Rights Reserved</p>
      </div>
    </div>
  </div>
);

export default PublicPrivacyPolicy;
