
INSERT INTO public.app_content (type, title, content, is_published, language, display_order)
VALUES
(
  'privacy_policy',
  'Privacy Policy',
  '## Privacy Policy

**Last Updated: April 11, 2026**

Welcome to MeriLive. Your privacy is important to us. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our mobile application.

### Information We Collect

- **Personal Information**: Name, email address, phone number, profile photo, and other information you provide during registration.
- **Usage Data**: Information about how you use the app, including streaming activity, interactions, and preferences.
- **Device Information**: Device type, operating system, unique device identifiers, and mobile network information.
- **Location Data**: Approximate location based on IP address (we do not collect precise GPS location).

### How We Use Your Information

- To provide, maintain, and improve our services
- To process transactions and send related information
- To send notifications, updates, and promotional materials
- To monitor and analyze usage patterns and trends
- To detect, prevent, and address technical issues and fraud
- To comply with legal obligations

### Data Sharing

We do not sell your personal information. We may share your data with:

- **Service Providers**: Third-party companies that help us operate our platform
- **Legal Requirements**: When required by law or to protect our rights
- **Business Transfers**: In connection with any merger or acquisition

### Data Security

We implement industry-standard security measures to protect your personal information, including encryption, secure servers, and access controls.

### Your Rights

- Access your personal data
- Request correction of inaccurate data
- Request deletion of your account and data
- Opt out of promotional communications
- Export your data

### Contact Us

If you have questions about this Privacy Policy, please contact us at:
- Email: support@merilive.com',
  true,
  'en',
  1
),
(
  'about_us',
  'About Us',
  '## About MeriLive

**MeriLive** is a next-generation social entertainment platform that connects people through live streaming, video calls, and interactive experiences.

### Our Mission

To create a vibrant global community where everyone can express themselves, connect with others, and enjoy premium entertainment experiences.

### What We Offer

- **Live Streaming**: Watch and broadcast live streams with real-time interaction
- **Video & Voice Calls**: Connect with friends and new people through high-quality calls
- **Virtual Gifts**: Send and receive animated gifts to show appreciation
- **Party Rooms**: Join group audio rooms for fun conversations and games
- **Agency System**: Build your team and grow together as content creators
- **Rewards Program**: Earn rewards through daily activities and achievements

### Our Values

- **Safety First**: We prioritize user safety with advanced moderation tools and content policies
- **Global Community**: We celebrate diversity and welcome users from all around the world
- **Innovation**: We continuously improve our platform with cutting-edge technology
- **Transparency**: We are committed to honest and open communication with our users

### Contact Information

- **Website**: www.merilive.com
- **Email**: support@merilive.com
- **Support**: Available 24/7 through in-app customer service',
  true,
  'en',
  2
),
(
  'user_agreement',
  'User Agreement',
  '## User Agreement

**Last Updated: April 11, 2026**

By using MeriLive, you agree to the following terms and conditions. Please read them carefully.

### 1. Acceptance of Terms

By creating an account or using MeriLive, you agree to be bound by this User Agreement and our Privacy Policy.

### 2. Eligibility

- You must be at least 18 years old to use MeriLive
- You must provide accurate and complete registration information
- You are responsible for maintaining the security of your account

### 3. User Conduct

You agree NOT to:

- Post or share inappropriate, offensive, or illegal content
- Harass, bully, or threaten other users
- Impersonate any person or entity
- Use the app for any fraudulent or illegal purpose
- Attempt to gain unauthorized access to other accounts
- Share or distribute copyrighted material without permission
- Use automated systems or bots on the platform

### 4. Virtual Currency & Purchases

- All purchases of coins and virtual items are final and non-refundable
- Virtual currencies have no real-world monetary value
- We reserve the right to modify pricing and availability of virtual items

### 5. Content Ownership

- You retain ownership of content you create and share
- By posting content, you grant MeriLive a license to use, display, and distribute it on the platform
- We may remove content that violates our policies

### 6. Account Termination

We reserve the right to suspend or terminate accounts that:

- Violate this User Agreement
- Engage in fraudulent activity
- Receive multiple reports from other users
- Remain inactive for an extended period

### 7. Limitation of Liability

MeriLive is provided "as is" without warranties of any kind. We are not liable for any indirect, incidental, or consequential damages arising from your use of the platform.

### 8. Changes to This Agreement

We may update this User Agreement from time to time. Continued use of MeriLive after changes constitutes acceptance of the updated terms.

### 9. Contact

For questions about this agreement, contact us at:
- Email: support@merilive.com',
  true,
  'en',
  3
)
ON CONFLICT DO NOTHING;
