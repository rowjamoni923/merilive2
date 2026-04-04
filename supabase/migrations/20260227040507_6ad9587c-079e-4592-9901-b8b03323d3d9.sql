-- Fix corrupted country data: users whose city/region clearly indicate a different country than BD

-- Fix Philippines users (regions/cities clearly from PH)
UPDATE profiles SET 
  country_code = 'PH', 
  country_name = 'Philippines', 
  country_flag = '🇵🇭'
WHERE country_code = 'BD' 
  AND (
    region ILIKE '%calabarzon%' 
    OR region ILIKE '%national capital region%' 
    OR region ILIKE '%metro manila%'
    OR region ILIKE '%zamboanga%' 
    OR region ILIKE '%western visayas%' 
    OR region ILIKE '%northern mindanao%'
    OR region ILIKE '%central visayas%'
    OR region ILIKE '%eastern visayas%'
    OR region ILIKE '%ilocos%'
    OR region ILIKE '%cagayan valley%'
    OR region ILIKE '%central luzon%'
    OR region ILIKE '%mimaropa%'
    OR region ILIKE '%bicol%'
    OR region ILIKE '%caraga%'
    OR region ILIKE '%davao%'
    OR region ILIKE '%soccsksargen%'
    OR region ILIKE '%cordillera%'
    OR region ILIKE '%bangsamoro%'
    OR city ILIKE '%quezon city%'
    OR city ILIKE '%manila%'
    OR city ILIKE '%cebu%'
    OR city ILIKE '%davao%'
    OR city ILIKE '%bacolod%'
    OR city ILIKE '%dipolog%'
    OR city ILIKE '%dasmari%'
    OR city ILIKE '%imus%'
    OR city ILIKE '%cagayan de oro%'
    OR city ILIKE '%mandaluyong%'
  );

-- Fix India users (regions clearly from IN)
UPDATE profiles SET 
  country_code = 'IN', 
  country_name = 'India', 
  country_flag = '🇮🇳'
WHERE country_code = 'BD' 
  AND (
    region ILIKE '%west bengal%' 
    OR region ILIKE '%national capital territory of delhi%'
    OR region ILIKE '%tamil nadu%' 
    OR region ILIKE '%karnataka%' 
    OR region ILIKE '%maharashtra%'
    OR region ILIKE '%uttar pradesh%'
    OR region ILIKE '%rajasthan%'
    OR region ILIKE '%gujarat%'
    OR region ILIKE '%madhya pradesh%'
    OR region ILIKE '%andhra pradesh%'
    OR region ILIKE '%telangana%'
    OR region ILIKE '%kerala%'
    OR region ILIKE '%punjab%'
    OR region ILIKE '%haryana%'
    OR region ILIKE '%bihar%'
    OR region ILIKE '%odisha%'
    OR region ILIKE '%jharkhand%'
    OR region ILIKE '%assam%'
    OR region ILIKE '%chhattisgarh%'
    OR city ILIKE '%mumbai%'
    OR city ILIKE '%delhi%'
    OR city ILIKE '%bengaluru%'
    OR city ILIKE '%bangalore%'
    OR city ILIKE '%chennai%'
    OR city ILIKE '%hyderabad%'
    OR city ILIKE '%kolkata%'
    OR city ILIKE '%coimbatore%'
    OR city ILIKE '%kharagpur%'
    OR city ILIKE '%solapur%'
  );

-- Fix Indonesia users (regions clearly from ID)
UPDATE profiles SET 
  country_code = 'ID', 
  country_name = 'Indonesia', 
  country_flag = '🇮🇩'
WHERE country_code = 'BD' 
  AND (
    region ILIKE '%west java%' 
    OR region ILIKE '%jakarta%'
    OR region ILIKE '%east java%'
    OR region ILIKE '%central java%'
    OR region ILIKE '%bali%'
    OR region ILIKE '%north sumatra%'
    OR region ILIKE '%south sulawesi%'
    OR city ILIKE '%jakarta%'
    OR city ILIKE '%bekasi%'
    OR city ILIKE '%bandung%'
    OR city ILIKE '%surabaya%'
  );