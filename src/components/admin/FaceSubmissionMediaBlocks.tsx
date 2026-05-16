import { useAdminSignedUrl, useAdminSignedUrls } from "@/hooks/useAdminSignedUrl";

interface MediaSubmission {
  profile_photo_url?: string | null;
  face_image_url?: string | null;
  video_url?: string | null;
  host_photos?: string[] | null;
}

const VIDEO_RE = /\.(webm|mp4|mov|avi|ogg)(\?|$)/i;

/**
 * Renders profile photo + face verification media + intro video + host photos
 * for a face_verification_submissions row. All URLs are resolved through
 * signed-URL helper so private storage buckets render correctly in admin.
 */
export function FaceSubmissionMediaBlocks({ submission }: { submission: MediaSubmission }) {
  const profilePhoto = useAdminSignedUrl(submission.profile_photo_url, "face-verification");
  const faceMedia = useAdminSignedUrl(submission.face_image_url, "face-verification");
  const introVideo = useAdminSignedUrl(submission.video_url, "face-verification");
  const hostPhotos = useAdminSignedUrls(submission.host_photos || [], "face-verification");

  return (
    <>
      {profilePhoto && (
        <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
          <p className="text-xs font-semibold text-purple-600 mb-2">📷 Profile Photo</p>
          <img
            src={profilePhoto}
            alt="Profile"
            className="w-24 h-24 rounded-xl object-cover border-2 border-purple-300"
          />
        </div>
      )}

      {faceMedia && (
        <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
          <p className="text-xs font-semibold text-purple-600 mb-2">🔍 Face Verification</p>
          <div className="rounded-lg overflow-hidden border border-slate-200 bg-black">
            {VIDEO_RE.test(faceMedia) ? (
              <video src={faceMedia} controls playsInline muted className="w-full max-h-64 object-contain" />
            ) : (
              <img src={faceMedia} alt="Face" className="w-full max-h-64 object-contain" />
            )}
          </div>
        </div>
      )}

      {introVideo && introVideo !== faceMedia && (
        <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
          <p className="text-xs font-semibold text-purple-600 mb-2">🎥 Verification Video</p>
          <div className="rounded-lg overflow-hidden border border-slate-200 bg-black">
            <video src={introVideo} controls playsInline muted className="w-full max-h-64 object-contain" />
          </div>
        </div>
      )}

      {hostPhotos.length > 0 && (
        <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
          <p className="text-xs font-semibold text-purple-600 mb-2">🖼️ Host Photos ({hostPhotos.length})</p>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {hostPhotos.map((photo, idx) => (
              <img
                key={idx}
                src={photo}
                alt={`Host ${idx + 1}`}
                className="w-20 h-20 rounded-lg object-cover border-2 border-slate-300 flex-shrink-0"
              />
            ))}
          </div>
        </div>
      )}
    </>
  );
}

/** Compact face media renderer for the modal view (bigger frames). */
export function FaceSubmissionModalMedia({ submission }: { submission: MediaSubmission }) {
  const faceMedia = useAdminSignedUrl(submission.face_image_url, "face-verification");
  const introVideo = useAdminSignedUrl(submission.video_url, "face-verification");

  return (
    <>
      {faceMedia && (
        <div className="rounded-lg overflow-hidden border border-slate-700 bg-black">
          {VIDEO_RE.test(faceMedia) ? (
            <video
              src={faceMedia}
              controls
              playsInline
              muted
              className="w-full h-64 object-cover"
            />
          ) : (
            <img src={faceMedia} alt="Face" className="w-full h-64 object-cover" />
          )}
        </div>
      )}

      {introVideo && introVideo !== faceMedia && (
        <div className="rounded-lg overflow-hidden border border-slate-700 bg-black">
          <video
            src={introVideo}
            controls
            playsInline
            muted
            className="w-full h-64 object-cover"
          />
        </div>
      )}
    </>
  );
}
