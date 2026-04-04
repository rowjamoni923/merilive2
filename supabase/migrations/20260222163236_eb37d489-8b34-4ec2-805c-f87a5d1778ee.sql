-- Fix misassigned countries: these users have BD but their cities prove they're from other countries

-- Ethiopia (Addis Ababa)
UPDATE profiles SET country_code = 'ET', country_name = 'Ethiopia', country_flag = '🇪🇹'
WHERE country_code = 'BD' AND city = 'Addis Ababa';

-- India (Indian cities wrongly marked as BD)
UPDATE profiles SET country_code = 'IN', country_name = 'India', country_flag = '🇮🇳'
WHERE country_code = 'BD' AND city IN ('Ranchi', 'Mumbai', 'Patna', 'Vadodara', 'Rohtak', 'Agra', 'Bareilly', 'Lucknow', 'Delhi', 'Kolkata', 'Chennai', 'Hyderabad', 'Pune', 'Jaipur', 'Surat', 'Kanpur', 'Nagpur', 'Indore', 'Thane', 'Bhopal', 'Visakhapatnam', 'Noida', 'Gurgaon', 'Ahmedabad', 'Bangalore', 'Bengaluru');

-- Philippines (Philippine cities wrongly marked as BD)
UPDATE profiles SET country_code = 'PH', country_name = 'Philippines', country_flag = '🇵🇭'
WHERE country_code = 'BD' AND city IN ('Iloilo City', 'Makati City', 'Manila', 'Quezon City', 'Cebu City', 'Davao City', 'Taguig', 'Pasig', 'Caloocan', 'Zamboanga City');