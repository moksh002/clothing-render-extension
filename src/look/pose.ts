// Browser-only: runs MediaPipe's pose landmarker on-device (wasm, no network after load).
import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision';
import type { Landmark } from './photo-kind';

let landmarker: Promise<PoseLandmarker> | null = null;

function getLandmarker(): Promise<PoseLandmarker> {
  landmarker ??= (async () => {
    const base = chrome.runtime.getURL('');
    const fileset = {
      wasmLoaderPath: `${base}mediapipe/vision_wasm_internal.js`,
      wasmBinaryPath: `${base}mediapipe/vision_wasm_internal.wasm`,
    };
    void FilesetResolver; // fileset paths are given directly, so no resolver lookup is needed
    return PoseLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: `${base}models/pose_landmarker_lite.task`, delegate: 'CPU' },
      runningMode: 'IMAGE',
      numPoses: 1,
      minPoseDetectionConfidence: 0.3,
      minPosePresenceConfidence: 0.3,
    });
  })().catch((e) => {
    landmarker = null;
    throw e;
  });
  return landmarker;
}

/** Body landmarks for the person in the image, or null if none was found. */
export async function detectPose(source: HTMLCanvasElement | ImageBitmap): Promise<Landmark[] | null> {
  const lm = await getLandmarker();
  const result = lm.detect(source);
  const first = result.landmarks?.[0];
  if (!first) return null;
  return first.map((p, i) => ({ x: p.x, y: p.y, visibility: (p as { visibility?: number }).visibility ?? result.worldLandmarks?.[0]?.[i]?.visibility }));
}
