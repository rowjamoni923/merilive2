/**
 * R2 Upload Hook
 * 
 * Supports large file uploads (up to 150MB) using:
 * - Direct edge function upload for files <= 50MB
 * - Presigned URL + client-side upload for files > 50MB
 */

import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { getAdminSessionToken } from '@/utils/adminSession';

interface UploadOptions {
  bucket: string;
  folder: string;
  onProgress?: (progress: number) => void;
}

interface UploadResult {
  success: boolean;
  url?: string;
  error?: string;
}

// R2 upload threshold - files larger than this use presigned URL method
const R2_THRESHOLD = 50 * 1024 * 1024; // 50MB
const SUPABASE_THRESHOLD = 50 * 1024 * 1024; // 50MB - use Supabase for smaller files
const R2_FUNCTION_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/r2-upload`;
const PUBLIC_BINARY_ASSET_BUCKET = 'animations';

const getFileExtension = (file: File) => file.name.split('.').pop()?.toLowerCase() || 'bin';

const getSupabaseUploadTarget = (file: File, requestedBucket: string) => {
  const ext = getFileExtension(file);
  const rawType = (file.type || '').toLowerCase().split(';')[0].trim();
  const isBinaryVisualAsset = ['svga', 'lottie', 'zip'].includes(ext) || !rawType || rawType === 'application/octet-stream';
  const isAudioAsset = rawType.startsWith('audio/') || ['mp3', 'wav', 'ogg', 'm4a', 'aac'].includes(ext);

  // Several public visual buckets intentionally allow binary animation assets, while
  // shop-items/sounds do not list SVGA/audio MIME types. Store those admin assets in
  // the shared public animation bucket so normal shop/item uploads never hit R2.
  if (isBinaryVisualAsset || isAudioAsset) {
    return {
      bucket: PUBLIC_BINARY_ASSET_BUCKET,
      contentType: isAudioAsset || isBinaryVisualAsset ? 'application/octet-stream' : (rawType || 'application/octet-stream'),
    };
  }

  return {
    bucket: requestedBucket,
    contentType: rawType || 'application/octet-stream',
  };
};

const buildR2Headers = async (contentType?: string) => {
  const headers: Record<string, string> = contentType ? { 'Content-Type': contentType } : {};
  const adminToken = getAdminSessionToken();
  if (adminToken) {
    headers['x-admin-token'] = adminToken;
    return headers;
  }
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
  return headers;
};

export function useR2Upload() {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);

  // R2 requires minimum 5MB per part (except last part)
  // 5MB chunks meet R2 requirements
  const CHUNK_SIZE = 5 * 1024 * 1024;

  /**
   * Upload large file to R2 using proxy multipart upload
   * Each chunk is sent to the edge function which uploads it to R2
   * This avoids CORS issues since browser doesn't upload directly to R2
   */
  const uploadToR2Multipart = async (
    file: File, 
    folder: string,
    onProgress?: (progress: number) => void
  ): Promise<string> => {
    const totalParts = Math.ceil(file.size / CHUNK_SIZE);
    console.log(`[R2 Multipart] Starting: ${file.name} (${(file.size / 1024 / 1024).toFixed(2)}MB, ${totalParts} parts, chunk=${CHUNK_SIZE/1024/1024}MB)`);
    
    // Step 1: Initialize multipart upload
    const initResponse = await fetch(R2_FUNCTION_URL, {
      method: 'POST',
      headers: await buildR2Headers('application/json'),
      body: JSON.stringify({
        action: 'init-multipart',
        folder,
        fileName: file.name,
        fileType: file.type || 'application/octet-stream',
        fileSize: file.size,
      }),
    });
    
    const initResult = await initResponse.json();
    if (!initResponse.ok || !initResult.success) {
      throw new Error(initResult.error || 'Failed to initialize upload');
    }
    
    const { uploadId, key } = initResult;
    console.log(`[R2 Multipart] Initialized: uploadId=${uploadId.substring(0, 20)}..., key=${key}`);
    
    const uploadedParts: { PartNumber: number; ETag: string }[] = [];
    
    // Step 2: Upload each part via edge function (proxy)
    for (let partNumber = 1; partNumber <= totalParts; partNumber++) {
      const start = (partNumber - 1) * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, file.size);
      const chunk = file.slice(start, end);
      
      // Convert chunk to base64 for JSON transport
      const arrayBuffer = await chunk.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      let binary = '';
      for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      const base64 = btoa(binary);
      
      // Upload part via edge function proxy
      const uploadResponse = await fetch(R2_FUNCTION_URL, {
        method: 'POST',
        headers: await buildR2Headers('application/json'),
        body: JSON.stringify({
          action: 'upload-part',
          uploadId,
          key,
          partNumber,
          partData: base64,
        }),
      });
      
      const uploadResult = await uploadResponse.json();
      if (!uploadResponse.ok || !uploadResult.success) {
        throw new Error(uploadResult.error || `Failed to upload part ${partNumber}`);
      }
      
      uploadedParts.push({ PartNumber: partNumber, ETag: uploadResult.etag });
      
      const pct = Math.round((partNumber / totalParts) * 95);
      setProgress(pct);
      onProgress?.(pct);
      console.log(`[R2 Multipart] Part ${partNumber}/${totalParts} (ETag: ${uploadResult.etag})`);
    }
    
    // Step 3: Complete the multipart upload
    setProgress(98);
    onProgress?.(98);
    
    const completeResponse = await fetch(R2_FUNCTION_URL, {
      method: 'POST',
      headers: await buildR2Headers('application/json'),
      body: JSON.stringify({
        action: 'complete-multipart',
        uploadId,
        key,
        parts: uploadedParts,
      }),
    });
    
    const completeResult = await completeResponse.json();
    if (!completeResponse.ok || !completeResult.success) {
      throw new Error(completeResult.error || 'Failed to complete upload');
    }
    
    setProgress(100);
    onProgress?.(100);
    console.log(`[R2 Multipart] Complete: ${completeResult.url}`);
    return completeResult.url;
  };

  /**
   * Upload smaller file to R2 via edge function (streaming)
   */
  const uploadToR2Direct = async (file: File, folder: string): Promise<string> => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('folder', folder);

    const response = await fetch(R2_FUNCTION_URL, {
      method: 'POST',
      headers: await buildR2Headers(),
      body: formData,
    });

    const result = await response.json();
    
    if (!response.ok || !result.success) {
      // If server says to use multipart, do that
      if (result.useMultipart) {
        return uploadToR2Multipart(file, folder);
      }
      throw new Error(result.error || 'R2 upload failed');
    }

    console.log('[R2] Direct upload success:', result.url);
    return result.url;
  };

  /**
   * Upload to Supabase Storage (for smaller files)
   */
  const uploadToSupabase = async (
    file: File, 
    bucket: string, 
    folder: string,
    onProgress?: (progress: number) => void
  ): Promise<string> => {
    const fileExt = getFileExtension(file);
    const fileName = `${folder}/${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
    const uploadTarget = getSupabaseUploadTarget(file, bucket);

    const { data: { session } } = await supabase.auth.getSession();
    const adminToken = getAdminSessionToken();
    if (!session?.access_token && !adminToken) {
      throw new Error('Not authenticated');
    }

    setProgress(10);
    onProgress?.(10);

    // Pkg fix: Supabase storage SDK has no built-in timeout — if the network
    // stalls the promise never resolves and the admin spinner gets stuck.
    // Race it against a 90s timeout so the UI always recovers.
    const uploadPromise = supabase.storage
      .from(uploadTarget.bucket)
      .upload(fileName, file, {
        cacheControl: '3600',
        upsert: true,
        contentType: uploadTarget.contentType,
      });
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Upload timed out after 90s — check network and retry.')), 90_000)
    );
    const { data, error } = await Promise.race([uploadPromise, timeoutPromise]) as Awaited<typeof uploadPromise>;

    if (error) {
      console.error('[Supabase Storage] Upload error:', error);
      throw new Error(error.message || 'Storage upload failed');
    }

    setProgress(100);
    onProgress?.(100);

    const { data: { publicUrl } } = supabase.storage
      .from(uploadTarget.bucket)
      .getPublicUrl(data.path);

    return publicUrl;
  };

  /**
   * Smart upload - automatically chooses best method based on file size
   * - Files <= 50MB: Supabase Storage
   * - Files > 50MB: R2 with presigned URL (bypasses edge function memory limit)
   */
  const uploadFile = async (file: File, options: UploadOptions): Promise<UploadResult> => {
    if (!file) {
      return { success: false, error: 'No file provided' };
    }

    // Validate file size (max 150MB)
    if (file.size > 150 * 1024 * 1024) {
      toast.error('File size cannot exceed 150MB');
      return { success: false, error: 'File too large (max 150MB)' };
    }

    const fileSizeMB = (file.size / (1024 * 1024)).toFixed(2);
    console.log(`[Upload] Starting: ${file.name} (${fileSizeMB}MB)`);

    setUploading(true);
    setProgress(0);

    try {
      let url: string;
      const useR2Multipart = file.size > SUPABASE_THRESHOLD;

      if (useR2Multipart) {
        toast.info(`Large file (${fileSizeMB}MB) - Uploading to R2...`, { duration: 60000 });
        url = await uploadToR2Multipart(file, options.folder, options.onProgress);
        console.log('[Upload] R2 multipart upload completed:', url);
      } else {
        url = await uploadToSupabase(file, options.bucket, options.folder, options.onProgress);
        console.log('[Upload] Supabase completed:', url);
      }

      toast.success(useR2Multipart ? 'Uploaded successfully! ✨' : 'Upload complete!');
      return { success: true, url };

    } catch (error: any) {
      console.error('[Upload] Error:', error);
      const errorMsg = error?.message || 'Unknown error';
      toast.error(`Upload failed: ${errorMsg}`);
      return { success: false, error: errorMsg };

    } finally {
      setUploading(false);
      setProgress(0);
    }
  };

  return {
    uploadFile,
    uploadToR2Multipart,
    uploadToR2Direct,
    uploadToSupabase,
    uploading,
    progress,
  };
}

export default useR2Upload;
