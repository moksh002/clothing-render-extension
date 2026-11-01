import { useEffect, useState } from 'react';
import { buildPhotoLook } from '../look/pipeline';
import type { PhotoLook } from '../types/page';

const cache = new Map<string, PhotoLook | null>();

/** The garment's look from its product photos, computed in the panel (pose model and canvas live here). */
export function useGarmentLook(imageUrls: string[] | undefined, key: string | undefined): { look: PhotoLook | null; busy: boolean } {
  const [look, setLook] = useState<PhotoLook | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setLook(null);
    if (!imageUrls?.length || !key) return;
    if (cache.has(key)) {
      setLook(cache.get(key) ?? null);
      return;
    }
    let cancelled = false;
    setBusy(true);
    buildPhotoLook(imageUrls)
      .then((l) => {
        console.info('[look]', JSON.stringify({ kinds: l?.kinds, picked: l?.picked, colour: l?.colour, print: !!l?.textureDataUrl, back: !!l?.back, fabric: !!l?.fabricDataUrl }));
        cache.set(key, l);
        if (!cancelled) setLook(l);
      })
      .catch((e) => console.warn('photo look failed', e))
      .finally(() => !cancelled && setBusy(false));
    return () => {
      cancelled = true;
    };
  }, [key, imageUrls]);

  return { look, busy };
}
