-- Create agency_policy_settings table for storing all policy content
CREATE TABLE public.agency_policy_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  section_key TEXT NOT NULL UNIQUE,
  section_title TEXT NOT NULL,
  content JSONB NOT NULL DEFAULT '{}',
  display_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.agency_policy_settings ENABLE ROW LEVEL SECURITY;

-- Policies for reading (everyone can read active policies)
CREATE POLICY "Anyone can view active policies" 
ON public.agency_policy_settings 
FOR SELECT 
USING (is_active = true);

-- Policies for admin management
CREATE POLICY "Admins can manage policies" 
ON public.agency_policy_settings 
FOR ALL 
TO authenticated 
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Create trigger for updated_at
CREATE TRIGGER update_agency_policy_settings_updated_at
BEFORE UPDATE ON public.agency_policy_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default policy data
INSERT INTO public.agency_policy_settings (section_key, section_title, content, display_order) VALUES
('exchange_rate', 'Exchange Rate', '{"rate": 125, "currency": "BDT", "display": "৳125 = $1 USD"}', 1),
('commission_tiers', 'Commission Tiers', '{"tiers": [{"level": "A1", "name": "Bronze", "income_min": 0, "income_max": 25, "rate": 2}, {"level": "A2", "name": "Silver", "income_min": 25, "income_max": 100, "rate": 3}, {"level": "A3", "name": "Gold", "income_min": 100, "income_max": 500, "rate": 4}, {"level": "A4", "name": "Platinum", "income_min": 500, "income_max": 1500, "rate": 10}, {"level": "A5", "name": "Diamond", "income_min": 1500, "income_max": null, "rate": 20}]}', 2),
('host_requirements', 'Host Requirements', '{"requirements": [{"key": "age", "title": "Age", "description": "18-35 years old"}, {"key": "camera", "title": "Camera Friendly", "description": "Attractive appearance & personality"}, {"key": "communication", "title": "Communication", "description": "Friendly & confident"}, {"key": "avatar", "title": "Avatar", "description": "Use clear face-showing photo"}]}', 3),
('violations', 'Violation Penalties', '{"violations": [{"title": "Phone Number/Contact Sharing", "severity": "high", "penalties": ["1st time: 2,000 coins deduction", "2nd time: 5,000 coins deduction", "3rd time: 10,000 coins deduction", "After: 10,000 coins each time"]}, {"title": "Not Showing Face on Live", "severity": "high", "penalties": ["1st-2nd time: 2,000 coins deduction", "3rd-4th time: 2,000 coins + 6 hours traffic ban", "5th-6th time: 2,000 coins + 12 hours traffic ban", "7th time: Account blocked"]}, {"title": "Call Reject/Miss", "severity": "medium", "penalties": ["Call reject: 5-12 hours traffic limit", "Call hangup: 5 minutes traffic limit", "Call miss: 1-24 hours traffic limit", "Black screen: 5 min - 12 hours limit"]}, {"title": "Bad Behavior (Private Call)", "severity": "medium", "penalties": ["1st time: 2,000 coins deduction", "2nd time: 4,000 coins deduction", "3rd time: 6,000 coins deduction", "4th time: 8,000 coins deduction"]}]}', 4),
('prohibited_content', 'Prohibited Content', '{"items": [{"title": "Sexual/Obscene Content", "description": "Nudity, indecent clothing, sexual hints"}, {"title": "Minor-related", "description": "Hosts or viewers under 18 years"}, {"title": "Violence/Weapons", "description": "Firearms, knives, violent behavior"}, {"title": "Drugs/Alcohol", "description": "Showing drugs or drinking"}, {"title": "Politics/Religion", "description": "Political comments or religious hatred"}, {"title": "Privacy Violation", "description": "Sharing personal info or impersonation"}, {"title": "Fraud", "description": "Gambling, financial fraud, scams"}, {"title": "Platform Rule Violation", "description": "AI use, bots, fake traffic"}]}', 5),
('call_rules', 'Call Rules', '{"rules": ["Make calls in a well-lit room", "Start the conversation yourself", "Muting is not allowed", "Stay focused, do not be distracted", "Show your face and talk throughout the call"]}', 6),
('withdrawal', 'Withdrawal Policy', '{"minimum_usd": 10, "settlement_day": "Monday", "settlement_time_ist": "09:30", "settlement_time_bd": "10:00", "payment_methods": [{"name": "bKash", "type": "Mobile Banking"}, {"name": "Nagad", "type": "Mobile Banking"}, {"name": "Rocket", "type": "Mobile Banking"}, {"name": "USDT", "type": "Crypto"}], "timezones": [{"country": "Bangladesh", "flag": "🇧🇩", "time": "Monday 10:00 AM"}, {"country": "India", "flag": "🇮🇳", "time": "Monday 09:30 AM"}, {"country": "Philippines", "flag": "🇵🇭", "time": "Monday 12:00 PM"}, {"country": "Vietnam", "flag": "🇻🇳", "time": "Monday 11:00 AM"}]}', 7);