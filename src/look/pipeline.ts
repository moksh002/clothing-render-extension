// Browser-only: reads every product photo, sorts them with on-device pose detection, and builds the
// garment's look (colour, front/back print, fabric weave). Nothing leaves the browser.
import type { PhotoLook } from '../types/page';
import { classifyPose, type PhotoAnalysis } from './photo-kind';
import { detectPose } from './pose';
import { extractLook, type Look, type Pixels } from './segment';
import { buildAtlas, buildTexture, fabricPatch, type Texture } from './texture';
import { sizedImageUrl } from './urls';

const PHOTO_WIDTH = 480;
const MAX_PHOTOS = 8;

interface Photo {
  url: string;
  img: Pixels;
  canvas: HTMLCanvasElement;
  analysis: PhotoAnalysis;
  look: Look | null;
}

async function loadCanvas(url: string, width: number): Promise<HTMLCanvasElement | null> {
  try {
    const res = await fetch(url, { mode: 'cors' });
    if (!res.ok) return null;
    const bmp = await createImageBitmap(await res.blob());
    const scale = Math.min(1, width / bmp.width);
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * scale);
    c.height = Math.round(bmp.height * scale);
    c.getContext('2d', { willReadFrequently: true })!.drawImage(bmp, 0, 0, c.width, c.height);
    return c;
  } catch {
    return null;
  }
}

const pixelsOf = (c: HTMLCanvasElement): Pixels => c.getContext('2d')!.getImageData(0, 0, c.width, c.height);

const dataUrl = (t: Texture) => {
  const c = document.createElement('canvas');
  c.width = t.width;
  c.height = t.height;
  c.getContext('2d')!.putImageData(new ImageData(t.data as Uint8ClampedArray<ArrayBuffer>, t.width, t.height), 0, 0);
  return c.toDataURL('image/png');
};

const coverage = (l: Look) => l.mask.reduce((a, b) => a + b, 0) / l.mask.length;

async function analyse(url: string): Promise<Photo | null> {
  const canvas = await loadCanvas(url, PHOTO_WIDTH);
  if (!canvas) return null;
  const img = pixelsOf(canvas);
  let lm = null;
  try {
    lm = await detectPose(canvas);
  } catch {
    /* no pose model: fall back to colour rules alone */
  }
  const analysis = classifyPose(lm);
  const look = analysis.kind === 'front' || analysis.kind === 'back' || analysis.kind === 'side'
    ? extractLook(img, analysis.region)
    : extractLook(img);
  return { url, img, canvas, analysis, look };
}

/**
 * Best photo of a kind. Square-on shots matter most (a turned torso distorts the print), then how much of
 * the frame the garment fills, so the texture has more pixels.
 */
const score = (p: Photo) => Math.min(1.1, p.analysis.frontal ?? 0.8) ** 2 * coverage(p.look!) * Math.min(0.45, p.analysis.torsoLen ?? 0.3);
const best = (photos: Photo[], kind: Photo['analysis']['kind']) =>
  photos.filter((p) => p.analysis.kind === kind && p.look).sort((a, b) => score(b) - score(a))[0];

export async function buildPhotoLook(imageUrls: string[]): Promise<PhotoLook | null> {
  const urls = imageUrls.slice(0, MAX_PHOTOS).map((u) => sizedImageUrl(u, PHOTO_WIDTH));
  const photos: Photo[] = [];
  for (const u of urls) {
    const p = await analyse(u);
    if (p) photos.push(p);
  }
  if (!photos.length) return null;
  const kinds = photos.map((p) => p.analysis.kind);

  let front: Photo | undefined = best(photos, 'front');
  const back = best(photos, 'back');
  // If pose finds nobody (flat-lays, mannequins), use the first photo the colour rules can read.
  if (!front) front = photos.find((p) => p.look && p.analysis.kind !== 'back' && p.analysis.kind !== 'side') ?? photos.find((p) => p.look);
  if (!front?.look) return null;

  const hasPrint = front.look.hasPrint || !!back?.look?.hasPrint;
  const out: PhotoLook = { colour: front.look.colour, kinds, picked: { front: photos.indexOf(front), back: back ? photos.indexOf(back) : -1 } };

  if (hasPrint) {
    const f = buildTexture(front.img, front.look, { deshade: 0.8 });
    const b = back?.look ? buildTexture(back.img, back.look, { deshade: 0.8 }) : undefined;
    const atlas = buildAtlas(f, b);
    if (atlas) {
      out.textureDataUrl = dataUrl(atlas.texture);
      out.front = atlas.front;
      out.back = atlas.back;
    }
  }

  // Fabric weave: from a close-up if there is one (larger, sharper), else the front photo.
  const closeup = best(photos, 'closeup');
  const source = closeup ?? front;
  let patchImg: Pixels = source.img;
  let patchLook: Look | null = source.look;
  const hi = await loadCanvas(sizedImageUrl(source.url, 900), 900);
  if (hi) {
    patchImg = pixelsOf(hi);
    patchLook = extractLook(patchImg, source === front ? front.analysis.region : undefined) ?? patchLook;
  }
  const patch = patchLook ? fabricPatch(patchImg, patchLook) : null;
  if (patch) out.fabricDataUrl = dataUrl(patch);
  return out;
}
