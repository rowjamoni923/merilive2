import { adminSupabase as supabase } from '@/integrations/supabase/adminClient';
import { getAdminSessionToken } from '@/utils/adminSession';
import { recordAdminError } from '@/utils/adminErrorLog';
import { formatAdminError } from '@/utils/formatAdminError';

interface UploadOptions {
  bucket: string;
  folder?: string;
  contentType?: string;
  upsert?: boolean;
}

/**
 * Robust admin upload utility that handles Supabase Storage and fallback logic.
 * Ensures x-admin-token is included via adminSupabase client.
 */
export async function robustAdminUpload(
  file: File | Blob,
  fileName: string,
  options: UploadOptions
): Promise<string> {
  const { bucket, folder = 'uploads', contentType, upsert = true } = options;
  
  // Construct path
  const path = folder ? `${folder}/${fileName}` : fileName;
  
  // Use adminSupabase which carries x-admin-token in its fetch wrapper
  const { data, error } = await supabase.storage
    .from(bucket)
    .upload(path, file, {
      contentType: contentType || (file as File).type || 'application/octet-stream',
      upsert,
      cacheControl: '3600',
    });

  if (error) {
    recordAdminError({ 
      kind: "rpc", 
      label: `UploadHelper.${bucket}`, 
      message: formatAdminError(error) 
    });
    throw error;
  }

  const { data: { publicUrl } } = supabase.storage
    .from(bucket)
    .getPublicUrl(data.path);

  return publicUrl;
}
