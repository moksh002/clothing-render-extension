// Browser-only: download a product photo, find the garment and build its look.
import type { PhotoLook } from '../types/page';
import { buildTexture, extractLook } from './segment';

const MAX_WIDTH = 320;

export async function loadPhotoLook(url: string): Promise<PhotoLook | null> {
  try {
    const res = await fetch(url, { mode: 'cors' });
    if (!res.ok) return null;
    const bmp = await createImageBitmap(await res.blob());
    const scale = Math.min(1, MAX_WIDTH / bmp.width);
    const w = Math.round(bmp.width * scale);
    const h = Math.round(bmp.height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(bmp, 0, 0, w, h);
    const img = ctx.getImageData(0, 0, w, h);
    const look = extractLook(img);
    if (!look) return null;
    if (!look.hasPrint) return { colour: look.colour };

    const tex = buildTexture(img, look);
    const out = document.createElement('canvas');
    out.width = tex.width;
    out.height = tex.height;
    out.getContext('2d')!.putImageData(new ImageData(tex.data as Uint8ClampedArray<ArrayBuffer>, tex.width, tex.height), 0, 0);
    return { colour: look.colour, textureDataUrl: out.toDataURL('image/png') };
  } catch {
    return null;
  }
}
