import { supabase } from '@/integrations/supabase/client';

type VerifiableProfile = {
  id: string;
  is_face_verified?: boolean | null;
  face_verification_image?: string | null;
  is_host?: boolean | null;
  host_status?: string | null;
};

type ApprovedSubmission = {
  verification_type?: string | null;
  face_image_url?: string | null;
};

type ApprovedHostApplication = {
  face_verification_status?: string | null;
  face_verification_image_url?: string | null;
};

export const resolveProfileVerificationState = async (profile: VerifiableProfile) => {
  const alreadyFaceVerified = Boolean(profile.is_face_verified || profile.face_verification_image);
  const alreadyHostApproved = Boolean(profile.is_host) || String(profile.host_status ?? '').toLowerCase() === 'approved';

  if (alreadyFaceVerified && alreadyHostApproved) {
    return {
      isFaceVerified: true,
      faceVerificationImage: profile.face_verification_image ?? null,
      isHostApproved: true,
    };
  }

  const [submissionResult, hostApplicationResult] = await Promise.all([
    supabase
      .from('face_verification_submissions')
      .select('verification_type, face_image_url')
      .eq('user_id', profile.id)
      .eq('status', 'approved')
      .order('reviewed_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('host_applications')
      .select('face_verification_status, face_verification_image_url')
      .eq('user_id', profile.id)
      .eq('status', 'approved')
      .order('reviewed_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const approvedSubmission = submissionResult.data as ApprovedSubmission | null;
  const approvedHostApplication = hostApplicationResult.data as ApprovedHostApplication | null;
  const hostFacePassed = approvedHostApplication?.face_verification_status === 'passed' || Boolean(approvedHostApplication?.face_verification_image_url);

  return {
    faceVerificationImage:
      profile.face_verification_image ??
      approvedSubmission?.face_image_url ??
      approvedHostApplication?.face_verification_image_url ??
      null,
    isHostApproved:
      alreadyHostApproved ||
      approvedSubmission?.verification_type === 'host' ||
      Boolean(approvedHostApplication),
  };
};

export const hydrateProfileVerificationState = async <T extends VerifiableProfile>(profile: T): Promise<T> => {
  const resolved = await resolveProfileVerificationState(profile);

  return {
    ...profile,
    is_face_verified: resolved.isFaceVerified,
    face_verification_image: profile.face_verification_image || resolved.faceVerificationImage,
    is_host: profile.is_host || resolved.isHostApproved,
    host_status: resolved.isHostApproved ? (profile.host_status || 'approved') : profile.host_status,
  };
};