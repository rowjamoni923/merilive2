import 'dart:convert';
import 'dart:typed_data';
import 'package:image/image.dart' as img;

class FaceUtils {
  /// Generates a perceptual hash for a face image (Parity with web generateFaceHash)
  /// 1. Resizes to 32x32
  /// 2. Converts to grayscale
  /// 3. Calculates average brightness
  /// 4. Returns a 1024-bit hash as a string
  static String generateFaceHash(Uint8List imageBytes) {
    final image = img.decodeImage(imageBytes);
    if (image == null) return "";

    // 1. Resize to 32x32
    final resized = img.copyResize(image, width: 32, height: 32);

    // 2. Convert to grayscale and calculate average
    int total = 0;
    List<int> grayPixels = [];
    
    for (int y = 0; y < 32; y++) {
      for (int x = 0; x < 32; x++) {
        final pixel = resized.getPixel(x, y);
        // Standard grayscale weights: 0.299R + 0.587G + 0.114B
        final gray = (0.299 * pixel.r + 0.587 * pixel.g + 0.114 * pixel.b).round();
        grayPixels.add(gray);
        total += gray;
      }
    }

    final average = total / 1024;

    // 3. Generate bits based on average
    String hash = "";
    for (final gray in grayPixels) {
      hash += gray >= average ? "1" : "0";
    }

    return hash;
  }
}
