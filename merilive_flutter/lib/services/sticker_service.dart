import 'package:flutter/material.dart';
import 'package:google_mlkit_face_detection/google_mlkit_face_detection.dart';

class StickerService {
  static final StickerService _instance = StickerService._internal();
  factory StickerService() => _instance;
  StickerService._internal();

  final FaceDetector _faceDetector = FaceDetector(
    options: FaceDetectorOptions(
      enableContours: true,
      enableClassification: true,
      performanceMode: FaceDetectorMode.accurate,
    ),
  );

  String? activeSticker;

  void setActiveSticker(String? stickerId) {
    activeSticker = stickerId;
  }

  /// Processes raw camera image to find face position and size
  /// Returns a set of coordinates relative to the preview size
  Future<Rect?> processImageForSticker(InputImage inputImage) async {
    try {
      final List<Face> faces = await _faceDetector.processImage(inputImage);
      if (faces.isEmpty) return null;
      
      // Get the largest face
      Face largestFace = faces[0];
      for (var face in faces) {
        if (face.boundingBox.width > largestFace.boundingBox.width) {
          largestFace = face;
        }
      }
      
      return largestFace.boundingBox;
    } catch (e) {
      debugPrint("Sticker detection error: $e");
      return null;
    }
  }

  void dispose() {
    _faceDetector.close();
  }
}


