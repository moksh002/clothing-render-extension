// Cross-sections of the body mesh: intersect with a horizontal plane and chain the segments into loops.

export interface Loop {
  /** x,z pairs, flattened. */
  pts: number[];
  perimeter: number;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/** Positions are cm, y up. Triangles index the positions. */
export function sliceLoops(pos: Float32Array, tris: Uint32Array, y: number): Loop[] {
  const n = pos.length / 3;
  // Crossing point per edge, keyed by sorted vertex pair.
  const crossings = new Map<number, [number, number]>();
  const segs: [number, number][] = [];
  const cross = (a: number, b: number): number => {
    const key = a < b ? a * n + b : b * n + a;
    if (!crossings.has(key)) {
      const ya = pos[a * 3 + 1];
      const yb = pos[b * 3 + 1];
      const t = (y - ya) / (yb - ya);
      crossings.set(key, [pos[a * 3] + t * (pos[b * 3] - pos[a * 3]), pos[a * 3 + 2] + t * (pos[b * 3 + 2] - pos[a * 3 + 2])]);
    }
    return key;
  };
  for (let i = 0; i < tris.length; i += 3) {
    const a = tris[i], b = tris[i + 1], c = tris[i + 2];
    const sa = pos[a * 3 + 1] >= y, sb = pos[b * 3 + 1] >= y, sc = pos[c * 3 + 1] >= y;
    if (sa === sb && sb === sc) continue;
    const edges: number[] = [];
    if (sa !== sb) edges.push(cross(a, b));
    if (sb !== sc) edges.push(cross(b, c));
    if (sc !== sa) edges.push(cross(c, a));
    segs.push([edges[0], edges[1]]);
  }

  // Chain segments into loops through shared edge keys.
  const adj = new Map<number, number[]>();
  segs.forEach(([a, b], i) => {
    (adj.get(a) ?? adj.set(a, []).get(a)!).push(i);
    (adj.get(b) ?? adj.set(b, []).get(b)!).push(i);
  });
  const used = new Uint8Array(segs.length);
  const loops: Loop[] = [];
  for (let s = 0; s < segs.length; s++) {
    if (used[s]) continue;
    const keys: number[] = [segs[s][0]];
    let cur = s;
    let end = segs[s][1];
    used[s] = 1;
    for (;;) {
      keys.push(end);
      const next = (adj.get(end) ?? []).find((k) => !used[k]);
      if (next === undefined) break;
      used[next] = 1;
      end = segs[next][0] === end ? segs[next][1] : segs[next][0];
      cur = next;
    }
    void cur;
    const pts: number[] = [];
    let perimeter = 0, minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    keys.forEach((k, i) => {
      const [x, z] = crossings.get(k)!;
      pts.push(x, z);
      minX = Math.min(minX, x); maxX = Math.max(maxX, x); minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
      if (i > 0) perimeter += Math.hypot(x - pts[(i - 1) * 2], z - pts[(i - 1) * 2 + 1]);
    });
    if (keys.length > 2) loops.push({ pts, perimeter, minX, maxX, minZ, maxZ });
  }
  return loops;
}

/** The loop that surrounds the body's centre line (the trunk), or null below the crotch. */
export function trunkLoop(loops: Loop[], maxHalfWidth = Infinity): Loop | null {
  const around = loops.filter((l) => l.minX < 0 && l.maxX > 0 && l.maxX - l.minX <= 2 * maxHalfWidth);
  if (!around.length) return null;
  return around.reduce((m, l) => (l.perimeter > m.perimeter ? l : m));
}
