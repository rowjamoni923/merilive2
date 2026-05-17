import { AdminMediaFrame, isAdminVideoUrl } from "@/components/admin/AdminMediaViewer";
// NOTE: main app (FaceVerification.tsx) writes the WEBM face-clip into both
// `face_image_url` AND `selfie_url`, while `front_url/left_url/right_url` are
// only populated when actual angle stills are captured. So we must NOT fall
// back to selfie_url for the angle grid (it's a video, not a photo), and the
// grid itself must render with kind="auto" so any stray video plays instead of
// showing as a broken image.

interface MediaSubmission {
  profile_photo_url?: string | null;
  face_image_url?: string | null;
  video_url?: string | null;
  selfie_url?: string | null;
  front_url?: string | null;
  left_url?: string | null;
  right_url?: string | null;
  host_photos?: string[] | null;
}

const isRenderableFaceMediaUrl = (url?: string | null): url is string => {
  const value = String(url || "").trim();
  return Boolean(value) && !value.startsWith("admin-approved://") && !value.startsWith("pending://");
};

/**
 * Renders profile photo + face verification media + intro video + host photos
 * for a face_verification_submissions row. AdminMediaFrame does ALL signed-URL
 * resolution internally (single source of truth, no double-resolve race).
 */
export function FaceSubmissionMediaBlocks({ submission }: { submission: MediaSubmission }) {
  const profilePhoto = isRenderableFaceMediaUrl(submission.profile_photo_url) ? submission.profile_photo_url : null;
  const faceClip = isRenderableFaceMediaUrl(submission.face_image_url) ? submission.face_image_url : null;
  const introVideo = isRenderableFaceMediaUrl(submission.video_url) ? submission.video_url : null;
  const angleMedia = [submission.front_url, submission.left_url, submission.right_url].filter(isRenderableFaceMediaUrl);
  const selfieFallback = isRenderableFaceMediaUrl(submission.selfie_url) ? submission.selfie_url : null;
  const faceMedia = angleMedia[0] || faceClip || selfieFallback;
  const livenessClip = faceClip && faceClip !== faceMedia && faceClip !== introVideo ? faceClip : null;
  const hostPhotos = (submission.host_photos || []).filter(isRenderableFaceMediaUrl);

  return (
    <>
      {profilePhoto && (
        <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
          <p className="text-xs font-semibold text-purple-600 mb-2">📷 Profile Photo</p>
          <AdminMediaFrame src={profilePhoto} alt="Profile" kind="image" bucket="face-verification" className="w-24 h-24 rounded-xl border-2 border-purple-300" mediaClassName="object-cover" />
        </div>
      )}

      {faceMedia && (
        <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
          <p className="text-xs font-semibold text-purple-600 mb-2">🔍 Face Verification</p>
          <AdminMediaFrame src={faceMedia} alt="Face" kind="auto" bucket="face-verification" poster={profilePhoto} className="bg-background" mediaClassName="max-h-64" />
        </div>
      )}

      {livenessClip && (
        <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
          <p className="text-xs font-semibold text-purple-600 mb-2">🎬 Face Liveness Recording</p>
          <AdminMediaFrame src={livenessClip} alt="Face liveness clip" kind="video" bucket="face-verification" poster={profilePhoto} className="bg-background" mediaClassName="max-h-64" />
        </div>
      )}

      {introVideo && introVideo !== faceMedia && introVideo !== livenessClip && (
        <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
          <p className="text-xs font-semibold text-purple-600 mb-2">🎥 Verification Video</p>
          <AdminMediaFrame src={introVideo} alt="Verification video" kind="video" bucket="face-verification" poster={profilePhoto} className="bg-background" mediaClassName="max-h-64" />
        </div>
      )}

      {angleMedia.length > 0 && (
        <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
          <p className="text-xs font-semibold text-purple-600 mb-2">🔐 Manual Face Angles ({angleMedia.length})</p>
          <div className="grid grid-cols-3 gap-2">
            {angleMedia.map((url, idx) => (
              <AdminMediaFrame key={idx} src={url} alt={`Face angle ${idx + 1}`} kind="auto" bucket="face-verification" className="aspect-square bg-background" mediaClassName="object-cover" />
            ))}
          </div>
        </div>
      )}

      {hostPhotos.length > 0 && (
        <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
          <p className="text-xs font-semibold text-purple-600 mb-2">🖼️ Host Photos ({hostPhotos.length})</p>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {hostPhotos.map((photo, idx) => (
              <AdminMediaFrame key={idx} src={photo} alt={`Host ${idx + 1}`} kind="image" bucket="face-verification" className="w-20 h-20 rounded-lg border-2 border-slate-300 flex-shrink-0" mediaClassName="object-cover" />
            ))}
          </div>
        </div>
      )}
    </>
  );
}

/** Compact face media renderer for the modal view (bigger frames). */
export function FaceSubmissionModalMedia({ submission }: { submission: MediaSubmission }) {
  const faceClip = isRenderableFaceMediaUrl(submission.face_image_url) ? submission.face_image_url : null;
  const faceAngles = [submission.front_url, submission.left_url, submission.right_url].filter(isRenderableFaceMediaUrl);
  const selfieFallback = isRenderableFaceMediaUrl(submission.selfie_url) ? submission.selfie_url : null;
  const faceMedia = faceAngles[0] || faceClip || selfieFallback;
  const introVideo = isRenderableFaceMediaUrl(submission.video_url) ? submission.video_url : null;
  const livenessClip = faceClip && faceClip !== faceMedia && faceClip !== introVideo ? faceClip : null;
  const profilePhoto = isRenderableFaceMediaUrl(submission.profile_photo_url) ? submission.profile_photo_url : null;

  return (
    <>
      {faceMedia && (
        <AdminMediaFrame src={faceMedia} alt="Face" bucket="face-verification" poster={profilePhoto} className="bg-background" mediaClassName={isAdminVideoUrl(faceMedia) ? "h-64" : "h-64 object-cover"} />
      )}

      {livenessClip && (
        <AdminMediaFrame src={livenessClip} alt="Face liveness clip" kind="video" bucket="face-verification" poster={profilePhoto} className="bg-background" mediaClassName="h-64" />
      )}

      {introVideo && introVideo !== faceMedia && introVideo !== livenessClip && (
        <AdminMediaFrame src={introVideo} alt="Verification video" kind="video" bucket="face-verification" className="bg-background" mediaClassName="h-64" />
      )}
    </>
  );
}
