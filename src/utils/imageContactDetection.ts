/**
 * Image-based Contact Detection Utility
 * Scans images for phone numbers, social media handles, and contact info
 * Uses Canvas API for client-side text extraction and pattern matching
 */

import { supabase } from '@/integrations/supabase/client';
import { detectContactInfo } from './contactDetection';

/**
 * Scan an image URL for contact information using the edge function OCR
 * Returns detection result with any found violations
 */
export async function scanImageForContactInfo(
  imageUrl: string,
  senderId: string,
  sourceType: 'chat' | 'live_stream' | 'private_call' | 'private_message',
  sourceId?: string
): Promise<{
  detected: boolean;
  violationNumber?: number;
  beansDeducted?: number;
  isBanned?: boolean;
}> {
  try {
    console.log('[ImageContactDetection] Scanning image:', imageUrl);

    // Call the edge function to scan the image
    const { data, error } = await supabase.functions.invoke('scan-image-contact', {
      body: {
        imageUrl,
        senderId,
        sourceType,
        sourceId: sourceId || null,
      }
    });

    if (error) {
      console.error('[ImageContactDetection] Edge function error:', error);
      return { detected: false };
    }

    console.log('[ImageContactDetection] Scan result:', data);

    if (data?.detected) {
      return {
        detected: true,
        violationNumber: data.violationNumber,
        beansDeducted: data.beansDeducted,
        isBanned: data.isBanned,
      };
    }

    return { detected: false };
  } catch (err) {
    console.error('[ImageContactDetection] Exception:', err);
    return { detected: false };
  }
}

/**
 * Check image filename for suspicious patterns
 * (e.g., screenshot_whatsapp.jpg, contact_number.png)
 */
export function checkImageFilename(filename: string): boolean {
  if (!filename) return false;
  
  const lower = filename.toLowerCase();
  const suspiciousPatterns = [
    'whatsapp', 'imo', 'facebook', 'messenger', 'telegram',
    'tiktok', 'instagram', 'contact', 'number', 'phone',
    'screenshot_whatsapp', 'wa_', 'fb_', 'img_whatsapp',
    'ফেসবুক', 'ইমো', 'হোয়াটসঅ্যাপ', 'নম্বর',
  ];

  return suspiciousPatterns.some(p => lower.includes(p));
}
