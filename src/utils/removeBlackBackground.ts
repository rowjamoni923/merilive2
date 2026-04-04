/**
 * Remove black background from images and convert to transparent PNG
 * This uses Canvas API to process pixels and make black areas transparent
 */

interface ProcessingOptions {
  /** Threshold for black detection (0-255). Pixels with RGB all below this are considered black */
  blackThreshold?: number;
  /** Whether to use edge detection to preserve frame borders */
  preserveEdges?: boolean;
}

/**
 * Removes black background from an image and returns a transparent PNG blob
 */
export const removeBlackBackground = async (
  imageFile: File,
  options: ProcessingOptions = {}
): Promise<Blob> => {
  const { blackThreshold = 30, preserveEdges = true } = options;

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      // Create canvas with image dimensions
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      
      if (!ctx) {
        reject(new Error('Could not get canvas context'));
        return;
      }

      canvas.width = img.width;
      canvas.height = img.height;

      // Draw image to canvas
      ctx.drawImage(img, 0, 0);

      // Get image data
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;

      // Process each pixel
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        // alpha is data[i + 3]

        // Check if pixel is close to black
        const isBlack = r < blackThreshold && g < blackThreshold && b < blackThreshold;

        if (isBlack) {
          // Make this pixel fully transparent
          data[i + 3] = 0;
        } else if (preserveEdges) {
          // For semi-dark pixels near the threshold, apply gradual transparency
          // This creates smoother edges
          const maxChannel = Math.max(r, g, b);
          if (maxChannel < blackThreshold * 2) {
            // Gradual transparency based on brightness
            const alpha = Math.min(255, Math.floor((maxChannel / (blackThreshold * 2)) * 255));
            data[i + 3] = Math.max(alpha, data[i + 3] === 255 ? alpha : data[i + 3]);
          }
        }
      }

      // Put processed data back
      ctx.putImageData(imageData, 0, 0);

      // Convert to PNG blob (PNG supports transparency)
      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error('Failed to create blob'));
          }
        },
        'image/png',
        1.0
      );
    };

    img.onerror = () => {
      reject(new Error('Failed to load image'));
    };

    // Load image from file
    const reader = new FileReader();
    reader.onload = (e) => {
      img.src = e.target?.result as string;
    };
    reader.onerror = () => {
      reject(new Error('Failed to read file'));
    };
    reader.readAsDataURL(imageFile);
  });
};

/**
 * Process a GIF file - extract first frame, remove black background
 * Note: This converts GIF to PNG (loses animation)
 * For animated frames, SVGA format is recommended
 */
export const processGifFrame = async (
  gifFile: File,
  options: ProcessingOptions = {}
): Promise<Blob> => {
  // For GIF, we process it as a static image (first frame)
  // This is a limitation - animated GIFs will become static
  return removeBlackBackground(gifFile, options);
};

/**
 * Check if a file needs black background removal
 */
export const needsBackgroundRemoval = (file: File): boolean => {
  const fileName = file.name.toLowerCase();
  // GIF and some JPG/PNG files might have black backgrounds
  return fileName.endsWith('.gif') || 
         fileName.endsWith('.jpg') || 
         fileName.endsWith('.jpeg') ||
         fileName.endsWith('.png') ||
         fileName.endsWith('.webp');
};

/**
 * Get file extension
 */
export const getFileExtension = (fileName: string): string => {
  return fileName.split('.').pop()?.toLowerCase() || '';
};
