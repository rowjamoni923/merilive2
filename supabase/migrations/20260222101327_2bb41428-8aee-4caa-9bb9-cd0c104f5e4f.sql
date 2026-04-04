
-- Map cities to their correct countries and update profiles
-- Bangladesh cities
UPDATE profiles SET country_code = 'BD', country_name = 'Bangladesh', country_flag = '🇧🇩' WHERE city IN ('Dhaka', 'Gazipur', 'Chattogram', 'Rajshahi', 'Sylhet', 'Kushtia', 'Natore', 'Lalmonirhat', 'Dighalia', 'Farīdpur', 'Rajbari', 'Sundarganj') AND country_code IS NULL;

-- India cities
UPDATE profiles SET country_code = 'IN', country_name = 'India', country_flag = '🇮🇳' WHERE city IN ('New Delhi', 'Ahmedabad', 'Bengaluru', 'Coimbatore', 'Dhoraji', 'Goshainganj', 'Jaipur', 'Jamshedpur', 'Malda', 'Meerut', 'Prayagraj', 'Pune', 'Raipur', 'Rawaseser') AND country_code IS NULL;

-- Pakistan cities
UPDATE profiles SET country_code = 'PK', country_name = 'Pakistan', country_flag = '🇵🇰' WHERE city IN ('Islamabad', 'Karachi', 'Lahore', 'Rawalpindi', 'Thakar Ke Hashim') AND country_code IS NULL;

-- Saudi Arabia cities
UPDATE profiles SET country_code = 'SA', country_name = 'Saudi Arabia', country_flag = '🇸🇦' WHERE city IN ('Jeddah', 'Dammam') AND country_code IS NULL;

-- UAE cities
UPDATE profiles SET country_code = 'AE', country_name = 'United Arab Emirates', country_flag = '🇦🇪' WHERE city IN ('Dubai') AND country_code IS NULL;

-- Ethiopia cities
UPDATE profiles SET country_code = 'ET', country_name = 'Ethiopia', country_flag = '🇪🇹' WHERE city IN ('Addis Ababa') AND country_code IS NULL;

-- Turkey cities
UPDATE profiles SET country_code = 'TR', country_name = 'Turkey', country_flag = '🇹🇷' WHERE city IN ('Istanbul', 'Mahmutbey', 'Tekirdağ') AND country_code IS NULL;

-- Indonesia cities
UPDATE profiles SET country_code = 'ID', country_name = 'Indonesia', country_flag = '🇮🇩' WHERE city IN ('Kasihan', 'Kediri', 'Malang', 'Manado', 'Pekanbaru', 'Sidoarjo', 'Yogyakarta') AND country_code IS NULL;

-- Brazil cities
UPDATE profiles SET country_code = 'BR', country_name = 'Brazil', country_flag = '🇧🇷' WHERE city IN ('São Paulo', 'Juazeiro do Norte') AND country_code IS NULL;

-- Germany cities
UPDATE profiles SET country_code = 'DE', country_name = 'Germany', country_flag = '🇩🇪' WHERE city IN ('Frankfurt am Main', 'Nuremberg') AND country_code IS NULL;

-- Jordan cities
UPDATE profiles SET country_code = 'JO', country_name = 'Jordan', country_flag = '🇯🇴' WHERE city IN ('Amman') AND country_code IS NULL;

-- Iraq cities
UPDATE profiles SET country_code = 'IQ', country_name = 'Iraq', country_flag = '🇮🇶' WHERE city IN ('Basra', 'Sulaymaniyah') AND country_code IS NULL;

-- Romania cities
UPDATE profiles SET country_code = 'RO', country_name = 'Romania', country_flag = '🇷🇴' WHERE city IN ('Bucharest') AND country_code IS NULL;

-- Netherlands cities
UPDATE profiles SET country_code = 'NL', country_name = 'Netherlands', country_flag = '🇳🇱' WHERE city IN ('Dronten') AND country_code IS NULL;

-- Philippines cities
UPDATE profiles SET country_code = 'PH', country_name = 'Philippines', country_flag = '🇵🇭' WHERE city IN ('Manila') AND country_code IS NULL;

-- France cities
UPDATE profiles SET country_code = 'FR', country_name = 'France', country_flag = '🇫🇷' WHERE city IN ('Paris') AND country_code IS NULL;

-- Italy cities
UPDATE profiles SET country_code = 'IT', country_name = 'Italy', country_flag = '🇮🇹' WHERE city IN ('Rome') AND country_code IS NULL;

-- Spain cities
UPDATE profiles SET country_code = 'ES', country_name = 'Spain', country_flag = '🇪🇸' WHERE city IN ('Barcelona') AND country_code IS NULL;

-- Russia cities
UPDATE profiles SET country_code = 'RU', country_name = 'Russia', country_flag = '🇷🇺' WHERE city IN ('Kazan') AND country_code IS NULL;

-- USA cities
UPDATE profiles SET country_code = 'US', country_name = 'United States', country_flag = '🇺🇸' WHERE city IN ('Hillsboro') AND country_code IS NULL;

-- Libya cities
UPDATE profiles SET country_code = 'LY', country_name = 'Libya', country_flag = '🇱🇾' WHERE city IN ('Tripoli') AND country_code IS NULL;
