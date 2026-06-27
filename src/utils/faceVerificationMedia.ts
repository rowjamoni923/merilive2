export interface FaceVerificationMediaLike {
  verification_type?: 'user' | 'host' | string | null;
  profile_photo_url?: string | null;
  face_image_url?: string | null;
  video_url?: string | null;
  selfie_url?: string | null;
  front_url?: string | null;
  left_url?: string | null;
  right_url?: string | null;
  host_photos?: string[] | null;
  ai_analysis?: Record<string, unknown> | null;
}

export const isRenderableFaceMediaUrl = (url?: string | null): url is string => {
  const value = String(url || '').trim();
  return Boolean(value) && !value.startsWith('admin-approved://') && !value.startsWith('pending://');
};

const isUploadPending = (analysis?: Record<string, unknown> | null) => {
  const value = analysis?.upload_pending;
  return value === true || String(value ?? '').trim().toLowerCase() === 'true';
};

export function getFaceSubmissionMediaReadiness(submission: FaceVerificationMediaLike) {
  const isHost = String(submission.verification_type || '').trim().toLowerCase() === 'host';
  const profilePhoto = isRenderableFaceMediaUrl(submission.profile_photo_url);
  const faceVideo = isRenderableFaceMediaUrl(submission.face_image_url);
  const introVideo = isRenderableFaceMediaUrl(submission.video_url);
  const liveStill = [submission.front_url, submission.left_url, submission.right_url, submission.selfie_url]
    .some(isRenderableFaceMediaUrl);
  const uploadPending = isUploadPending(submission.ai_analysis);

  const missing: string[] = [];
  if (uploadPending) missing.push('Upload still finishing');
  if (!profilePhoto) missing.push('Profile photo');
  if (!faceVideo) missing.push('Face/live test video');
  if (!liveStill && !faceVideo) missing.push('Live test evidence');
  if (isHost && !introVideo) missing.push('Intro video');

  return {
    ready: missing.length === 0,
    missing,
    uploadPending,
    hasProfilePhoto: profilePhoto,
    hasFaceVideo: faceVideo,
    hasIntroVideo: introVideo,
    hasLiveEvidence: liveStill || faceVideo,
  };
}