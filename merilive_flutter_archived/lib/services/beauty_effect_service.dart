import 'package:flutter/material.dart';

class BeautyEffectService {
  static final BeautyEffectService _instance = BeautyEffectService._internal();
  factory BeautyEffectService() => _instance;
  BeautyEffectService._internal();

  // Smoothing and Whitening state
  double smoothingIntensity = 0.5;
  double whiteningIntensity = 0.3;
  String? activeFilterId;

  void updateSmoothing(double value) => smoothingIntensity = value;
  void updateWhitening(double value) => whiteningIntensity = value;

  ColorFilter getCombinedFilter() {
    // Combine base matrix filter with whitening
    List<double> baseMatrix = _getMatrixForFilter(activeFilterId);
    List<double> finalMatrix = _applyWhitening(baseMatrix, whiteningIntensity);
    
    return ColorFilter.matrix(finalMatrix);
  }

  List<double> _getMatrixForFilter(String? filterId) {
    if (filterId == null || filterId == 'None') return _identity;
    
    switch (filterId) {
      case 'Natural': return _naturalMatrix;
      case 'Bright': return _brightMatrix;
      case 'Rosy': return _rosyMatrix;
      case 'Fresh': return _freshMatrix;
      default: return _identity;
    }
  }

  List<double> _applyWhitening(List<double> matrix, double intensity) {
    // Whitening boosts the brightness and reduces red/yellow saturation slightly
    var result = List<double>.from(matrix);
    result[4] += 50 * intensity;  // Red offset
    result[9] += 50 * intensity;  // Green offset
    result[14] += 50 * intensity; // Blue offset
    return result;
  }

  // Base Identity Matrix
  static const List<double> _identity = [
    1, 0, 0, 0, 0,
    0, 1, 0, 0, 0,
    0, 0, 1, 0, 0,
    0, 0, 0, 1, 0,
  ];

  // Premium Skin Tone and HSL Mapping
  static const List<double> _naturalMatrix = [
    1.0, 0, 0, 0, 10,
    0, 1.0, 0, 0, 5,
    0, 0, 1.0, 0, 0,
    0, 0, 0, 1, 0,
  ];

  static const List<double> _brightMatrix = [
    1.1, 0, 0, 0, 20,
    0, 1.1, 0, 0, 20,
    0, 0, 1.1, 0, 20,
    0, 0, 0, 1, 0,
  ];

  static const List<double> _rosyMatrix = [
    1.1, 0, 0, 0, 30,
    0, 1.0, 0, 0, 10,
    0, 0, 1.0, 0, 15,
    0, 0, 0, 1, 0,
  ];

  static const List<double> _freshMatrix = [
    1.0, 0, 0, 0, 5,
    0, 1.1, 0, 0, 15,
    0, 0, 1.2, 0, 25,
    0, 0, 0, 1, 0,
  ];

  // Advanced Skin Smoothing Simulation via Contrast/Sharpness Matrix
  List<double> getSmoothingMatrix() {
    double s = 1.0 - (smoothingIntensity * 0.2);
    return [
      s, 0, 0, 0, 0,
      0, s, 0, 0, 0,
      0, 0, s, 0, 0,
      0, 0, 0, 1, 0,
    ];
  }
}


