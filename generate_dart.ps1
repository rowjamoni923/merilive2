$content = Get-Content -Path "i:\ami-tomar-jonno-62e3a48a\src\data\countryCodes.ts" -Raw
$content = $content -replace "export interface CountryCode \{[\s\S]*?\}","class CountryCode { final String code; final String country; final String name; final String flag; const CountryCode({required this.code, required this.country, required this.name, required this.flag}); }"
$content = $content -replace "export const COUNTRY_CODES: CountryCode\[\] = \[", "const List<CountryCode> COUNTRY_CODES = ["
$content = $content -replace "export const.*", ""
Set-Content -Path "i:\ami-tomar-jonno-62e3a48a\merilive_flutter\lib\data\country_codes.dart" -Value $content
