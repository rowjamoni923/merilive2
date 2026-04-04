-- Create user_blocks table for user blocking feature
CREATE TABLE IF NOT EXISTS public.user_blocks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  blocker_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  blocked_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(blocker_id, blocked_id)
);

-- Enable RLS
ALTER TABLE public.user_blocks ENABLE ROW LEVEL SECURITY;

-- Users can view their own blocks
CREATE POLICY "Users can view their own blocks"
  ON public.user_blocks
  FOR SELECT
  TO authenticated
  USING (blocker_id = auth.uid());

-- Users can create blocks
CREATE POLICY "Users can block others"
  ON public.user_blocks
  FOR INSERT
  TO authenticated
  WITH CHECK (blocker_id = auth.uid() AND blocked_id != auth.uid());

-- Users can unblock
CREATE POLICY "Users can unblock"
  ON public.user_blocks
  FOR DELETE
  TO authenticated
  USING (blocker_id = auth.uid());

-- Create app_content table for editable pages
CREATE TABLE IF NOT EXISTS public.app_content (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  page_key TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id)
);

-- Enable RLS
ALTER TABLE public.app_content ENABLE ROW LEVEL SECURITY;

-- Anyone can read active content
CREATE POLICY "Anyone can read active content"
  ON public.app_content
  FOR SELECT
  USING (is_active = true);

-- Only admins can manage content
CREATE POLICY "Admins can manage content"
  ON public.app_content
  FOR ALL
  TO authenticated
  USING (public.is_admin(auth.uid()));

-- Insert default content pages
INSERT INTO public.app_content (page_key, title, content) VALUES
  ('privacy_policy', 'Privacy Policy', '## Privacy Policy

**Last Updated: January 2026**

Your privacy is important to us. This Privacy Policy explains how we collect, use, and protect your personal information.

### Information We Collect
- Account information (name, email, profile photo)
- Usage data and app interactions
- Device information and IP address
- Location data (with your permission)

### How We Use Your Information
- To provide and improve our services
- To personalize your experience
- To communicate with you
- To ensure security and prevent fraud

### Data Protection
We implement industry-standard security measures to protect your data.

### Contact Us
For privacy concerns, please contact our support team.'),
  
  ('user_agreement', 'User Agreement', '## User Agreement

**Last Updated: January 2026**

Welcome to Meri Live! By using our app, you agree to these terms.

### Account Rules
- You must be 18+ years old
- One account per person
- Keep your login credentials secure
- No fake or misleading profiles

### Conduct Guidelines
- Be respectful to all users
- No harassment, bullying, or hate speech
- No adult or inappropriate content
- No spamming or scamming

### Content Ownership
- You own your content
- We may use it to provide services
- Do not share copyrighted material

### Termination
We may suspend accounts that violate these terms.'),

  ('about_us', 'About Us', '## About Meri Live

Meri Live is a social platform that connects people through live streaming and video calls.

### Our Mission
To create meaningful connections and provide entertainment through innovative live streaming technology.

### Features
- 📺 Live Streaming
- 📞 Video Calls
- 🎁 Virtual Gifts
- 🎉 Party Rooms
- 👥 Community Building

### Our Team
We are a passionate team dedicated to building the best social experience.

### Contact
Email: support@merilive.app
Website: www.merilive.app'),

  ('customer_service', 'Customer Service', '## Customer Service

### How Can We Help?

**Email Support**
support@merilive.app

**Response Time**
We typically respond within 24 hours.

### Common Issues

**Account Issues**
- Reset password in settings
- Verify email address
- Contact support for account recovery

**Payment Issues**
- Check payment method
- Contact your bank
- Reach out to support

**Technical Issues**
- Clear app cache
- Update to latest version
- Reinstall if needed

### Feedback
We love hearing from you! Share suggestions to help us improve.')
ON CONFLICT (page_key) DO NOTHING;

-- Create trigger for updated_at
CREATE TRIGGER update_app_content_updated_at
  BEFORE UPDATE ON public.app_content
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();