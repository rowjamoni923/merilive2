import 'package:flutter/material.dart';
class CountryCode {
  final String code;
  final String country;
  final String name;
  final String flag;

  CountryCode({
    required this.code,
    required this.country,
    required this.name,
    required this.flag,
  });
}

final List<CountryCode> countries = [
  CountryCode(code: "+880", country: "BD", name: "Bangladesh", flag: "ðŸ‡§ðŸ‡©"),
  CountryCode(code: "+91", country: "IN", name: "India", flag: "ðŸ‡®ðŸ‡³"),
  CountryCode(code: "+92", country: "PK", name: "Pakistan", flag: "ðŸ‡µðŸ‡°"),
  CountryCode(code: "+966", country: "SA", name: "Saudi Arabia", flag: "ðŸ‡¸ðŸ‡¦"),
  CountryCode(code: "+971", country: "AE", name: "UAE", flag: "ðŸ‡¦ðŸ‡ª"),
  CountryCode(code: "+1", country: "US", name: "United States", flag: "ðŸ‡ºðŸ‡¸"),
  CountryCode(code: "+44", country: "GB", name: "United Kingdom", flag: "ðŸ‡¬ðŸ‡§"),
  CountryCode(code: "+90", country: "TR", name: "Turkey", flag: "ðŸ‡¹ðŸ‡·"),
  CountryCode(code: "+62", country: "ID", name: "Indonesia", flag: "ðŸ‡®ðŸ‡©"),
  CountryCode(code: "+60", country: "MY", name: "Malaysia", flag: "ðŸ‡²ðŸ‡¾"),
  CountryCode(code: "+66", country: "TH", name: "Thailand", flag: "ðŸ‡¹ðŸ‡­"),
  CountryCode(code: "+84", country: "VN", name: "Vietnam", flag: "ðŸ‡»ðŸ‡³"),
  CountryCode(code: "+82", country: "KR", name: "South Korea", flag: "ðŸ‡°ðŸ‡·"),
  CountryCode(code: "+81", country: "JP", name: "Japan", flag: "ðŸ‡¯ðŸ‡µ"),
  CountryCode(code: "+86", country: "CN", name: "China", flag: "ðŸ‡¨ðŸ‡³"),
  CountryCode(code: "+977", country: "NP", name: "Nepal", flag: "ðŸ‡³ðŸ‡µ"),
  CountryCode(code: "+94", country: "LK", name: "Sri Lanka", flag: "ðŸ‡±ðŸ‡°"),
  // Adding more from COUNTRY_CODES as needed...
];


