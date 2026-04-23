import 'package:flutter/material.dart';

class WithdrawalConstants {
  static const double minimumWithdrawalUsd = 10.0;

  static final Map<String, dynamic> withdrawalFeeConfig = {
    'BD': {
      'defaultFeeUsd': 5,
      'tiers': [
        {'maxLocal': 5000, 'feeUsd': 1},
        {'maxLocal': 10000, 'feeUsd': 2},
        {'maxLocal': 15000, 'feeUsd': 3},
        {'maxLocal': 20000, 'feeUsd': 4},
        {'maxLocal': 25000, 'feeUsd': 5},
        {'maxLocal': 50000, 'feeUsd': 8},
        {'maxLocal': 100000, 'feeUsd': 12},
        {'maxLocal': double.infinity, 'feeUsd': 15}
      ]
    },
    'IN': {
      'defaultFeeUsd': 3,
      'tiers': [
        {'maxLocal': 10000, 'feeUsd': 1},
        {'maxLocal': 25000, 'feeUsd': 2},
        {'maxLocal': 50000, 'feeUsd': 3},
        {'maxLocal': 100000, 'feeUsd': 5},
        {'maxLocal': double.infinity, 'feeUsd': 8}
      ]
    },
    'PK': {
      'defaultFeeUsd': 3,
      'tiers': [
        {'maxLocal': 25000, 'feeUsd': 1},
        {'maxLocal': 50000, 'feeUsd': 2},
        {'maxLocal': 100000, 'feeUsd': 3},
        {'maxLocal': double.infinity, 'feeUsd': 5}
      ]
    },
    'DEFAULT': {
      'defaultFeeUsd': 2,
      'tiers': [
        {'maxLocal': double.infinity, 'feeUsd': 2}
      ]
    }
  };

  static final Map<String, dynamic> countryConfigs = {
    'BD': {
      'name': 'Bangladesh',
      'flag': '🇧🇩',
      'currency': 'BDT',
      'currencySymbol': '৳',
      'paymentMethods': [
        {'value': 'bkash', 'label': 'bKash'},
        {'value': 'nagad', 'label': 'Nagad'},
        {'value': 'epay', 'label': 'ePay (Global)'}
      ]
    },
    'IN': {
      'name': 'India',
      'flag': '🇮🇳',
      'currency': 'INR',
      'currencySymbol': '₹',
      'paymentMethods': [
        {'value': 'upi', 'label': 'UPI'},
        {'value': 'epay', 'label': 'ePay (Global)'}
      ]
    },
    'PK': {
      'name': 'Pakistan',
      'flag': '🇵🇰',
      'currency': 'PKR',
      'currencySymbol': 'Rs',
      'paymentMethods': [
        {'value': 'easypaisa', 'label': 'Easypaisa'},
        {'value': 'epay', 'label': 'ePay (Global)'}
      ]
    },
    'GLOBAL': {
      'name': 'Global',
      'flag': '🌐',
      'currency': 'USD',
      'currencySymbol': '\$',
      'paymentMethods': [
        {'value': 'epay', 'label': 'ePay (Global)'},
        {'value': 'paypal', 'label': 'PayPal'}
      ]
    }
  };
}


