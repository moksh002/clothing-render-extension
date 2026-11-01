// Loads the packed MakeHuman body (see scripts/build-body.ts). Pure parsing, no network.

export interface TargetData {
  idx: Uint16Array;
  /** Quantised xyz deltas; multiply by `scale` for mesh units (decimetres). */
  d: Int16Array;
  scale: number;
}

export interface BodyAssets {
  /** Rest-pose positions of the body vertices, xyz, decimetres. */
  positions: Float32Array;
  /** Render vertex -> source vertex. */
  rvSrc: Uint16Array;
  rvUv: Float32Array;
  /** Triangles over render vertices. */
  tris: Uint32Array;
  /** Triangles over source vertices (what the slicing code uses). */
  srcTris: Uint32Array;
  targets: Map<string, TargetData>;
  unitCm: number;
  /** Eyeball helper meshes: triangle indices over the source vertices. */
  eyes: { left: Uint32Array; right: Uint32Array };
}

interface Meta {
  unitCm: number;
  eyes: { left: number[]; right: number[] };
  layout: Record<'positions' | 'rvSrc' | 'rvUv' | 'tris', { offset: number; length: number }>;
  targets: { name: string; offset: number; count: number; scale: number }[];
}

export function parseBodyAssets(meta: Meta, body: ArrayBuffer, targets: ArrayBuffer): BodyAssets {
  const l = meta.layout;
  const positions = new Float32Array(body, l.positions.offset, l.positions.length);
  const rvSrc = new Uint16Array(body, l.rvSrc.offset, l.rvSrc.length);
  const rvUv = new Float32Array(body, l.rvUv.offset, l.rvUv.length);
  const tris = new Uint32Array(body, l.tris.offset, l.tris.length);
  const srcTris = new Uint32Array(tris.length);
  for (let i = 0; i < tris.length; i++) srcTris[i] = rvSrc[tris[i]];

  const map = new Map<string, TargetData>();
  for (const t of meta.targets) {
    const idxBytes = t.count * 2;
    const pad = (4 - (idxBytes % 4)) % 4;
    map.set(t.name, {
      idx: new Uint16Array(targets, t.offset, t.count),
      d: new Int16Array(targets, t.offset + idxBytes + pad, t.count * 3),
      scale: t.scale,
    });
  }
  return {
    positions, rvSrc, rvUv, tris, srcTris, targets: map, unitCm: meta.unitCm,
    eyes: { left: new Uint32Array(meta.eyes.left), right: new Uint32Array(meta.eyes.right) },
  };
}

/** Fetch and parse the packed body from the extension's own files. */
export async function loadBodyAssets(base: string): Promise<BodyAssets> {
  const [meta, body, targets] = await Promise.all([
    fetch(`${base}body.json`).then((r) => r.json() as Promise<Meta>),
    fetch(`${base}body.bin`).then((r) => r.arrayBuffer()),
    fetch(`${base}targets.bin`).then((r) => r.arrayBuffer()),
  ]);
  return parseBodyAssets(meta, body, targets);
}
