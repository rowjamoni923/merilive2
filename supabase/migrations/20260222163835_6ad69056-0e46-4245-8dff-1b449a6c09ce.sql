-- Fix all remaining wrongly-assigned BD users based on their actual city locations

-- Philippines
UPDATE profiles SET country_code = 'PH', country_name = 'Philippines', country_flag = '🇵🇭'
WHERE country_code = 'BD' AND city IN ('Makati City', 'Laguna', 'Manila', 'Quezon City', 'Cebu City', 'Davao City', 'Iloilo City', 'Taguig', 'Pasig', 'Caloocan');

-- India
UPDATE profiles SET country_code = 'IN', country_name = 'India', country_flag = '🇮🇳'
WHERE country_code = 'BD' AND city IN ('Dhamtari', 'Gohāna', 'Nashik', 'Sahāranpur', 'Tirupur', 'Udaipur', 'Ranchi', 'Mumbai', 'Patna', 'Vadodara', 'Rohtak', 'Agra', 'Bareilly', 'Delhi', 'Kolkata', 'Chennai', 'Hyderabad', 'Pune', 'Jaipur', 'Lucknow', 'Surat', 'Kanpur', 'Nagpur', 'Indore', 'Bhopal', 'Noida', 'Gurgaon', 'Ahmedabad', 'Bangalore', 'Bengaluru', 'Thane');

-- Qatar
UPDATE profiles SET country_code = 'QA', country_name = 'Qatar', country_flag = '🇶🇦'
WHERE country_code = 'BD' AND city = 'Doha';

-- Pakistan
UPDATE profiles SET country_code = 'PK', country_name = 'Pakistan', country_flag = '🇵🇰'
WHERE country_code = 'BD' AND city IN ('Karachi', 'Lahore', 'Islamabad', 'Rawalpindi', 'Faisalabad', 'Peshawar', 'Multan', 'Quetta');

-- Nepal
UPDATE profiles SET country_code = 'NP', country_name = 'Nepal', country_flag = '🇳🇵'
WHERE country_code = 'BD' AND city IN ('Pokhara', 'Kathmandu', 'Lalitpur', 'Biratnagar', 'Bharatpur');

-- Poland
UPDATE profiles SET country_code = 'PL', country_name = 'Poland', country_flag = '🇵🇱'
WHERE country_code = 'BD' AND city = 'Warsaw';

-- Ethiopia
UPDATE profiles SET country_code = 'ET', country_name = 'Ethiopia', country_flag = '🇪🇹'
WHERE country_code = 'BD' AND city = 'Addis Ababa';