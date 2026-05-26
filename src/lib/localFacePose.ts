import type { PoseSample } from "@/lib/face-pose";

export type LocalFacePoseResult = {
  faceDetected: boolean;
  pose: PoseSample & { roll: number };
  eyesOpen: boolean;
  source: "local";
};

let detectorPromise: Promise<any | null> | null = null;

const loadLocalDetector = async () => {
  if (typeof window === "undefined") return null;
  if (!detectorPromise) {
    detectorPromise = (async () => {
      try {
        await import("@tensorflow/tfjs-backend-webgl");
        const tf = await import("@tensorflow/tfjs-core");
        await tf.ready();
        const faceLandmarksDetection = await import("@tensorflow-models/face-landmarks-detection");
        return faceLandmarksDetection.createDetector(
          faceLandmarksDetection.SupportedModels.MediaPipeFaceMesh,
          { runtime: "tfjs", refineLandmarks: false, maxFaces: 1 } as any,
        );
      } catch (error) {
        console.warn("[LocalFacePose] detector load failed", error);
        return null;
      }
    })();
  }
  return detectorPromise;
};

const imageFromBase64 = (imageBase64: string): Promise<HTMLImageElement> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Unable to decode camera frame"));
    img.src = imageBase64.startsWith("data:") ? imageBase64 : `data:image/jpeg;base64,${imageBase64}`;
  });
};

const point = (keypoints: Array<{ x: number; y: number; z?: number }>, index: number) => keypoints[index] ?? null;

export async function detectLocalFacePoseFromBase64(imageBase64: string): Promise<LocalFacePoseResult | null> {
  const detector = await loadLocalDetector();
  if (!detector) return null;

  try {
    const img = await imageFromBase64(imageBase64);
    const faces = await detector.estimateFaces(img, { flipHorizontal: false });
    if (!faces?.length) {
      return { faceDetected: false, pose: { yaw: 0, pitch: 0, roll: 0 }, eyesOpen: false, source: "local" };
    }

    const keypoints = faces[0].keypoints || [];
    const leftEyeOuter = point(keypoints, 33);
    const rightEyeOuter = point(keypoints, 263);
    const leftEyeUpper = point(keypoints, 159);
    const leftEyeLower = point(keypoints, 145);
    const rightEyeUpper = point(keypoints, 386);
    const rightEyeLower = point(keypoints, 374);
    const noseTip = point(keypoints, 1) || point(keypoints, 4);

    if (!leftEyeOuter || !rightEyeOuter || !noseTip) {
      return { faceDetected: true, pose: { yaw: 0, pitch: 0, roll: 0 }, eyesOpen: true, source: "local" };
    }

    const eyeDx = rightEyeOuter.x - leftEyeOuter.x;
    const eyeDy = rightEyeOuter.y - leftEyeOuter.y;
    const eyeDistance = Math.max(1, Math.hypot(eyeDx, eyeDy));
    const eyeMidX = (leftEyeOuter.x + rightEyeOuter.x) / 2;
    const eyeMidY = (leftEyeOuter.y + rightEyeOuter.y) / 2;

    const yaw = Math.max(-45, Math.min(45, ((noseTip.x - eyeMidX) / eyeDistance) * 70));
    const pitch = Math.max(-35, Math.min(35, (((noseTip.y - eyeMidY) / eyeDistance) - 0.62) * 55));
    const roll = Math.max(-45, Math.min(45, Math.atan2(eyeDy, eyeDx) * 180 / Math.PI));

    const leftEyeOpen = leftEyeUpper && leftEyeLower
      ? Math.abs(leftEyeLower.y - leftEyeUpper.y) / eyeDistance > 0.025
      : true;
    const rightEyeOpen = rightEyeUpper && rightEyeLower
      ? Math.abs(rightEyeLower.y - rightEyeUpper.y) / eyeDistance > 0.025
      : true;

    return {
      faceDetected: true,
      pose: { yaw, pitch, roll },
      eyesOpen: Boolean(leftEyeOpen || rightEyeOpen),
      source: "local",
    };
  } catch (error) {
    console.warn("[LocalFacePose] detection failed", error);
    return null;
  }
}