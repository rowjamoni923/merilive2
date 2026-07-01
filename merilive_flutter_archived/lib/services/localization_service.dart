import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

class LocalizationService extends ChangeNotifier {
  static final LocalizationService _instance = LocalizationService._internal();
  factory LocalizationService() => _instance;
  LocalizationService._internal();

  String _currentLocale = 'en';
  String get currentLocale => _currentLocale;

  Future<void> initialize() async {
    final prefs = await SharedPreferences.getInstance();
    _currentLocale = prefs.getString('app_locale') ?? 'en';
    notifyListeners();
  }

  Future<void> setLocale(String localeCode) async {
    if (_currentLocale == localeCode) return;
    _currentLocale = localeCode;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('app_locale', localeCode);
    notifyListeners();
  }

  String translate(String key) {
    if (!_translations.containsKey(_currentLocale)) return key;
    return _translations[_currentLocale]![key] ?? _translations['en']![key] ?? key;
  }

  static const Map<String, Map<String, String>> _translations = {
    'en': {
      'settings': 'Settings',
      'account_security': 'Account & Security',
      'privacy_settings': 'Privacy Settings',
      'blocked_list': 'Blocked List',
      'preferences': 'Preferences',
      'push_notifications': 'Push Notifications',
      'language': 'Language',
      'clear_cache': 'Clear Cache',
      'support': 'Support',
      'about_merilive': 'About MeriLive',
      'privacy_policy': 'Privacy Policy',
      'terms_of_service': 'Terms of Service',
      'ai_chat_support': 'AI Chat Support',
      'customer_service': 'Customer Service',
      'logout': 'LOGOUT',
      'logout_confirm': 'Are you sure you want to exit?',
      'cancel': 'Cancel',
      'confirm': 'Confirm',
    },
    'bn': {
      'settings': 'সেটিংস',
      'account_security': 'অ্যাকাউন্ট ও নিরাপত্তা',
      'privacy_settings': 'প্রাইভেসি সেটিংস',
      'blocked_list': 'ব্লকড লিস্ট',
      'preferences': 'পছন্দসমূহ',
      'push_notifications': 'পুশ নোটিফিকেশন',
      'language': 'ভাষা',
      'clear_cache': 'ক্যাশে পরিষ্কার করুন',
      'support': 'সহায়তা',
      'about_merilive': 'মেরিলাইভ সম্পর্কে',
      'privacy_policy': 'প্রাইভেসি পলিসি',
      'terms_of_service': 'টার্মস অফ সার্ভিস',
      'ai_chat_support': 'এআই চ্যাট সাপোর্ট',
      'customer_service': 'কাস্টমার সার্ভিস',
      'logout': 'লগআউট',
      'logout_confirm': 'আপনি কি নিশ্চিত যে আপনি প্রস্থান করতে চান?',
      'cancel': 'বাতিল',
      'confirm': 'নিশ্চিত করুন',
    },
    'hi': {
      'settings': 'सेटिंग्स',
      'account_security': 'अकाउंट और सुरक्षा',
      'privacy_settings': 'गोपनीयता सेटिंग्स',
      'blocked_list': 'ब्लॉक की गई सूची',
      'preferences': 'प्राथमिकताएं',
      'push_notifications': 'पुश नोटिफिकेशन',
      'language': 'भाषा',
      'clear_cache': 'कैश साफ़ करें',
      'support': 'सहायता',
      'about_merilive': 'मेरीलाइव के बारे में',
      'privacy_policy': 'गोपनीयता नीति',
      'terms_of_service': 'सेवा की शर्तें',
      'ai_chat_support': 'AI चैट सपोर्ट',
      'customer_service': 'कस्टमर सर्विस',
      'logout': 'लॉगआउट',
      'logout_confirm': 'क्या आप वाकई बाहर निकलना चाहते हैं?',
      'cancel': 'रद्द करें',
      'confirm': 'पुष्टि करें',
    },
    'ar': {
      'settings': 'إعدادات',
      'account_security': 'الحساب والأمن',
      'privacy_settings': 'إعدادات الخصوصية',
      'blocked_list': 'قائمة المحظورين',
      'preferences': 'تفضيلات',
      'push_notifications': 'اشعارات الموقع',
      'language': 'لغة',
      'clear_cache': 'مسح ذاكرة التخزين المؤقت',
      'support': 'دعم',
      'about_merilive': 'حول MeriLive',
      'privacy_policy': 'سياسة الخصوصية',
      'terms_of_service': 'شروط الخدمة',
      'ai_chat_support': 'دعم الدردشة بالذكاء الاصطناعي',
      'customer_service': 'خدمة العملاء',
      'logout': 'تسجيل الخروج',
      'logout_confirm': 'هل أنت متأكد أنك تريد الخروج؟',
      'cancel': 'إلغاء',
      'confirm': 'تأكيد',
    },
  };

  String getLanguageName(String code) {
    switch (code) {
      case 'en': return 'English';
      case 'bn': return 'বাংলা';
      case 'hi': return 'हिन्दी';
      case 'ar': return 'العربية';
      default: return 'English';
    }
  }
}


