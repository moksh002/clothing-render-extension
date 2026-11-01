// Prepares the on-device pose model for the extension (not committed: ~20 MB).
//   - copies MediaPipe's wasm runtime from node_modules (Apache-2.0)
//   - downloads the pose landmarker model from Google's MediaPipe model storage (Apache-2.0) and checks its hash
// Runs automatically before `npm run build`.
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';
const MODEL_SHA256 = '59929e1d1ee95287735ddd833b19cf4ac46d29bc7afddbbf6753c459690d574a';

mkdirSync('public/mediapipe', { recursive: true });
mkdirSync('public/models', { recursive: true });
for (const f of ['vision_wasm_internal.js', 'vision_wasm_internal.wasm']) {
  copyFileSync(`node_modules/@mediapipe/tasks-vision/wasm/${f}`, `public/mediapipe/${f}`);
}

const dest = 'public/models/pose_landmarker_lite.task';
const sha = (buf) => createHash('sha256').update(buf).digest('hex');
if (!existsSync(dest) || sha(readFileSync(dest)) !== MODEL_SHA256) {
  console.log('downloading pose model...');
  const buf = Buffer.from(await (await fetch(MODEL_URL)).arrayBuffer());
  if (sha(buf) !== MODEL_SHA256) throw new Error('pose model hash mismatch; refusing to use it');
  writeFileSync(dest, buf);
}
console.log('pose assets ready');
