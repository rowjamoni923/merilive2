import { NativeLiveKit, isNativeLiveKitAvailable } from '@/plugins/NativeLiveKit';

const VIDEO_CLAIM_KEY = '__meriWebViewCameraClaimed';

const hasLiveVideo = (stream: MediaStream | null | undefined) =>
  !!stream && stream.getVideoTracks().some((track) => track.readyState === 'live');

export async function claimAndroidWebViewCamera(reason: string): Promise<boolean> {
  if (!isNativeLiveKitAvailable()) return false;
  try {
    await NativeLiveKit.claimCameraForWebView();
    console.log(`[AndroidCameraHandoff] claimed WebView camera: ${reason}`);
    return true;
  } catch (error) {
    console.warn(`[AndroidCameraHandoff] claim failed (${reason}):`, error);
    throw error;
  }
}

export function releaseAndroidWebViewCamera(reason: string): void {
  if (!isNativeLiveKitAvailable()) return;
  void NativeLiveKit.releaseCameraForWebView()
    .then(() => console.log(`[AndroidCameraHandoff] released WebView camera: ${reason}`))
    .catch(() => undefined);
}

export function releaseAndroidWebViewCameraWhenStopped(stream: MediaStream | null | undefined, reason: string): void {
  if (!isNativeLiveKitAvailable() || !hasLiveVideo(stream)) return;
  const s = stream as MediaStream & Record<string, unknown>;
  if (s[VIDEO_CLAIM_KEY]) return;
  s[VIDEO_CLAIM_KEY] = true;

  const maybeRelease = () => {
    if (!stream.getVideoTracks().some((track) => track.readyState === 'live')) {
      releaseAndroidWebViewCamera(reason);
    }
  };

  stream.getVideoTracks().forEach((track) => track.addEventListener('ended', maybeRelease, { once: true }));
}

export function stopMediaStreamAndReleaseAndroidCamera(stream: MediaStream | null | undefined, reason: string): void {
  if (!stream) return;
  const hadVideo = hasLiveVideo(stream);
  stream.getTracks().forEach((track) => track.stop());
  if (hadVideo) releaseAndroidWebViewCamera(reason);
}

export async function claimAndroidWebViewCameraForStream<T extends MediaStream | null>(
  factory: () => Promise<T>,
  reason: string,
): Promise<T> {
  const claimed = await claimAndroidWebViewCamera(reason);
  try {
    const stream = await factory();
    if (claimed && hasLiveVideo(stream)) {
      releaseAndroidWebViewCameraWhenStopped(stream, reason);
    } else if (claimed) {
      releaseAndroidWebViewCamera(`${reason}:no-video`);
    }
    return stream;
  } catch (error) {
    if (claimed) releaseAndroidWebViewCamera(`${reason}:failed`);
    throw error;
  }
}