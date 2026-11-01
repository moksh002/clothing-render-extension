import {
  AmbientLight,
  BufferGeometry,
  CanvasTexture,
  CircleGeometry,
  Color,
  CanvasTexture as CanvasTex,
  DirectionalLight,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  HemisphereLight,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  PerspectiveCamera,
  RepeatWrapping,
  Scene,
  SRGBColorSpace,
  SphereGeometry,
  WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { FitResult } from '../../types';
import { buildBodyGarment } from '../body/garment';
import { bodyMeshData, eyeData, getBodyFit, type EyeData } from '../body/model';
import { buildFigure, type Part, type Ring } from './figure';

export type View = 'front' | 'side' | 'back';

/** Appearance of the garment. Defaults to a neutral colour. */
export interface GarmentLook {
  colour?: string;
  /** PNG data URL of the front (and back) garment cut-outs side by side. */
  textureDataUrl?: string;
  front?: { u0: number; u1: number };
  back?: { u0: number; u1: number };
  /** Greyscale fabric weave, used as a bump map. */
  fabricDataUrl?: string;
}

const SKIN = new Color('#e3c3a8');
const NEUTRAL = new Color('#aab8d4');
const UNDERWEAR = new Color('#262830');
const TIGHT = new Color('#e5736f');
const DEFAULT_SEGMENTS = 40;
/** One tile of the fabric weave covers about this many cm of cloth. */
const FABRIC_TILE_CM = 6;

/** Planar UV for textured garments: the same vertex can map to the front or back photo depending on the face. */
export type UvOf = (x: number, y: number, z: number, ring: Ring, front: boolean) => [number, number];

/** Loft elliptical or polar rings (top to bottom) into a vertex-coloured surface. */
export function loftGeometry(
  rings: Ring[],
  base: Color,
  capEnds: boolean,
  uvOf?: UvOf,
  /** Tile the fabric bump around and along the garment (second UV set). */
  fabricUv = false,
): BufferGeometry {
  const SEGMENTS = rings[0].radii?.length ?? DEFAULT_SEGMENTS;
  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const ringOf: number[] = [];
  const segOf: number[] = [];
  const tint = new Color();
  rings.forEach((r, ri) => {
    tint.copy(base).lerp(TIGHT, r.tint);
    for (let j = 0; j < SEGMENTS; j++) {
      const th = (j / SEGMENTS) * Math.PI * 2;
      pos.push(r.cx + (r.radii ? r.radii[j] : r.a) * Math.cos(th), r.y, r.cz + (r.radii ? r.radii[j] : r.b) * Math.sin(th));
      col.push(tint.r, tint.g, tint.b);
      ringOf.push(ri);
      segOf.push(j);
    }
  });
  for (let i = 0; i < rings.length - 1; i++) {
    for (let j = 0; j < SEGMENTS; j++) {
      const k = (j + 1) % SEGMENTS;
      const a = i * SEGMENTS + j;
      const b = i * SEGMENTS + k;
      const c = (i + 1) * SEGMENTS + j;
      const d = (i + 1) * SEGMENTS + k;
      idx.push(a, c, b, b, c, d);
    }
  }
  if (capEnds) {
    for (const [ringIndex, flip] of [[0, true], [rings.length - 1, false]] as const) {
      const r = rings[ringIndex];
      const centre = pos.length / 3;
      pos.push(r.cx, r.y, r.cz);
      tint.copy(base).lerp(TIGHT, r.tint);
      col.push(tint.r, tint.g, tint.b);
      ringOf.push(ringIndex);
      segOf.push(0);
      for (let j = 0; j < SEGMENTS; j++) {
        const a = ringIndex * SEGMENTS + j;
        const b = ringIndex * SEGMENTS + ((j + 1) % SEGMENTS);
        idx.push(centre, flip ? a : b, flip ? b : a);
      }
    }
  }

  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  if (!uvOf && !fabricUv) return g;

  // Textured: give every triangle its own vertices so the front/back photo seam and the wrap-around of
  // the fabric tiling do not smear texture across a triangle.
  const nrm = g.getAttribute('normal').array as Float32Array;
  const P: number[] = [], C: number[] = [], N: number[] = [], UV: number[] = [], UV1: number[] = [];
  for (let t = 0; t < idx.length; t += 3) {
    const tri = [idx[t], idx[t + 1], idx[t + 2]];
    const ring = rings[ringOf[tri[0]]];
    const front = (pos[tri[0] * 3 + 2] + pos[tri[1] * 3 + 2] + pos[tri[2] * 3 + 2]) / 3 >= ring.cz;
    const segs = tri.map((v) => segOf[v]);
    const wraps = Math.max(...segs) - Math.min(...segs) > SEGMENTS / 2;
    for (const v of tri) {
      const x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2];
      P.push(x, y, z);
      C.push(col[v * 3], col[v * 3 + 1], col[v * 3 + 2]);
      N.push(nrm[v * 3], nrm[v * 3 + 1], nrm[v * 3 + 2]);
      const r = rings[ringOf[v]];
      if (uvOf) UV.push(...uvOf(x, y, z, r, front));
      if (fabricUv) {
        const j = segOf[v] + (wraps && segOf[v] < SEGMENTS / 2 ? SEGMENTS : 0);
        UV1.push((j / SEGMENTS) * ((2 * Math.PI * Math.max(r.a, 5)) / FABRIC_TILE_CM), y / FABRIC_TILE_CM);
      }
    }
  }
  const out = new BufferGeometry();
  out.setAttribute('position', new Float32BufferAttribute(P, 3));
  out.setAttribute('color', new Float32BufferAttribute(C, 3));
  out.setAttribute('normal', new Float32BufferAttribute(N, 3));
  if (uvOf) out.setAttribute('uv', new Float32BufferAttribute(UV, 2));
  if (fabricUv) out.setAttribute('uv1', new Float32BufferAttribute(UV1, 2));
  g.dispose();
  return out;
}

export class ThreeRenderer {
  private renderer: WebGLRenderer;
  private scene = new Scene();
  private camera = new PerspectiveCamera(28, 1, 5, 2000);
  private controls: OrbitControls;
  private figure = new Group();
  private skin = new MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0, side: DoubleSide });
  private cloth = new MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0, side: DoubleSide });
  private resizeObs: ResizeObserver;
  private height = 175;
  private raf = 0;

  /** Throws if WebGL is unavailable, so the caller can fall back to the 2D renderer. */
  constructor(private container: HTMLElement) {
    this.renderer = new WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.domElement.className = 'figure3d';
    container.appendChild(this.renderer.domElement);

    this.scene.add(new HemisphereLight(0xffffff, 0x8f9aab, 1.1));
    this.scene.add(new AmbientLight(0xffffff, 0.25));
    const key = new DirectionalLight(0xffffff, 1.5);
    key.position.set(90, 220, 160);
    this.scene.add(key);
    const rim = new DirectionalLight(0xdbe6ff, 0.6);
    rim.position.set(-120, 140, -140);
    this.scene.add(rim);

    const floor = new Mesh(new CircleGeometry(55, 48), new MeshStandardMaterial({ color: '#dfe3e9', roughness: 1 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.2;
    this.scene.add(floor);
    this.scene.add(this.figure);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enablePan = false;
    this.controls.enableDamping = false;
    this.controls.minPolarAngle = 0.6;
    this.controls.maxPolarAngle = 1.75;
    this.controls.addEventListener('change', () => this.requestRender());

    this.resizeObs = new ResizeObserver(() => this.resize());
    this.resizeObs.observe(container);
    this.resize();
  }

  private token = 0;

  /** Draw the figure for a fit. Fitting the real body takes a moment, so this is asynchronous. */
  async update(fit: FitResult, look: GarmentLook = {}): Promise<void> {
    const token = ++this.token;
    const bf = await getBodyFit(fit.body);
    if (token !== this.token) return; // a newer update superseded this one
    this.clearFigure();

    const procedural = bf ? null : buildFigure(fit);
    const parts = bf ? buildBodyGarment(fit, bf).parts : procedural!.parts;
    const textured = !!look.textureDataUrl;
    // With a texture the vertex colour is white so the photo shows true (red still tints tight areas).
    const cloth = textured ? new Color('#ffffff') : new Color(look.colour ?? NEUTRAL.getStyle());
    this.setTexture(look.textureDataUrl);
    this.setFabric(look.fabricDataUrl);

    if (bf) this.addBodyMesh(bf);
    const shirt = parts.find((p) => p.name === 'shirt');
    const maxA = shirt ? Math.max(...shirt.rings.map((r) => r.a)) : 20;
    const top = shirt ? shirt.rings[0].y : 0;
    const bottom = shirt ? shirt.rings[shirt.rings.length - 1].y : 0;
    for (const part of parts) {
      if (bf && part.kind === 'body') continue;
      let uvOf: UvOf | undefined;
      if (textured && part.kind === 'garment') {
        // The photos show the front and the back: project each straight onto its side of the shirt.
        // Sleeves, and a side with no photo, point at the atlas's plain border texel.
        const span = 2 * maxA * 1.2;
        const plain: [number, number] = [0.004, 0.004];
        const eps = 0.002;
        const inRect = (r: { u0: number; u1: number }, u: number) => r.u0 + Math.min(1 - eps, Math.max(eps, u)) * (r.u1 - r.u0);
        uvOf = part.name === 'shirt'
          ? (x, y, _z, ring, front) => {
              const v = (y - bottom) / Math.max(1, top - bottom);
              if (front) return look.front ? [inRect(look.front, 0.5 + (x - ring.cx) / span), v] : plain;
              // Seen from behind the photo is mirrored: the wearer's left is on the viewer's right.
              return look.back ? [inRect(look.back, 0.5 - (x - ring.cx) / span), v] : plain;
            }
          : () => plain;
      }
      this.addPart(part, part.kind === 'garment' ? cloth : SKIN, uvOf);
    }
    if (procedural) {
      for (const blob of procedural.blobs) {
        const m = new Mesh(new SphereGeometry(1, 24, 16), this.skin.clone());
        (m.material as MeshStandardMaterial).vertexColors = false;
        (m.material as MeshStandardMaterial).color = SKIN.clone();
        m.scale.set(blob.radii.x, blob.radii.y, blob.radii.z);
        m.position.set(blob.center.x, blob.center.y, blob.center.z);
        if (blob.rotZ) m.rotation.z = blob.rotZ;
        this.figure.add(m);
      }
    }
    const h = fit.body.heightCm;
    if (h !== this.height) {
      this.height = h;
      this.frame();
    }
    this.requestRender();
  }

  private addBodyMesh(bf: Parameters<typeof bodyMeshData>[0]): void {
    const d = bodyMeshData(bf);
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(d.positions, 3));
    g.setAttribute('normal', new Float32BufferAttribute(d.normals, 3));
    g.setAttribute('uv', new Float32BufferAttribute(d.uvs, 2));
    g.setIndex(Array.from(d.index));
    const mat = new MeshPhysicalMaterial({ color: SKIN, roughness: 0.55, metalness: 0, clearcoat: 0.12, clearcoatRoughness: 0.5, sheen: 0.4, sheenColor: new Color('#ffd9c2'), sheenRoughness: 0.5 });
    this.figure.add(new Mesh(g, mat));
    const eyes = eyeData(bf);
    for (const side of [eyes.left, eyes.right]) this.addEye(side);
  }

  private irisTexture: CanvasTexture | null = null;

  private addEye(e: EyeData): void {
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(e.positions, 3));
    g.setIndex(Array.from(e.index));
    g.computeVertexNormals();
    this.figure.add(new Mesh(g, new MeshPhysicalMaterial({ color: '#f3f1ee', roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.05 })));

    if (!this.irisTexture) {
      const c = document.createElement('canvas');
      c.width = c.height = 128;
      const x = c.getContext('2d')!;
      const grad = x.createRadialGradient(64, 64, 4, 64, 64, 62);
      grad.addColorStop(0, '#0b0b0d');
      grad.addColorStop(0.28, '#0b0b0d');
      grad.addColorStop(0.3, '#6b4a2b');
      grad.addColorStop(0.75, '#8a6238');
      grad.addColorStop(0.92, '#2b1f14');
      grad.addColorStop(1, 'rgba(43,31,20,0)');
      x.fillStyle = grad;
      x.fillRect(0, 0, 128, 128);
      this.irisTexture = new CanvasTex(c);
      this.irisTexture.colorSpace = SRGBColorSpace;
    }
    const iris = new Mesh(
      new CircleGeometry(e.radius * 0.52, 32),
      new MeshPhysicalMaterial({ map: this.irisTexture, transparent: true, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.05 }),
    );
    iris.position.set(e.centre[0], e.centre[1], e.centre[2] + e.radius * 0.97);
    this.figure.add(iris);
  }

  setView(view: View): void {
    const d = this.camera.position.distanceTo(this.controls.target);
    const y = this.controls.target.y + d * 0.12;
    const [x, z] = view === 'front' ? [0, d] : view === 'side' ? [d, 0] : [0, -d];
    this.camera.position.set(x, y, z);
    this.controls.update();
    this.requestRender();
  }

  dispose(): void {
    cancelAnimationFrame(this.raf);
    this.resizeObs.disconnect();
    this.controls.dispose();
    this.clearFigure();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  /** The canvas, for tests and screenshots. */
  get canvas(): HTMLCanvasElement {
    return this.renderer.domElement;
  }

  private under = new MeshStandardMaterial({ vertexColors: true, roughness: 0.9, side: DoubleSide });

  private addPart(part: Part, base: Color, uvOf?: UvOf): void {
    const g = new Group();
    g.position.set(part.origin.x, part.origin.y, 0);
    g.rotation.z = part.rotZ;
    const under = part.style === 'underwear';
    const mesh = new Mesh(
      loftGeometry(part.rings, under ? UNDERWEAR : base, part.kind === 'body' || part.name === 'briefs', under ? undefined : uvOf, part.kind === 'garment' && !under),
      under ? this.under : part.kind === 'garment' ? this.cloth : this.skin,
    );
    g.add(mesh);
    this.figure.add(g);
  }

  private fabricUrl: string | undefined;

  private setFabric(url: string | undefined): void {
    if (url === this.fabricUrl) return;
    this.fabricUrl = url;
    const old = this.cloth.bumpMap;
    this.cloth.bumpMap = null;
    this.cloth.needsUpdate = true;
    old?.dispose();
    if (!url) return;
    const img = new Image();
    img.onload = () => {
      if (this.fabricUrl !== url) return;
      const tex = new CanvasTexture(img);
      tex.wrapS = tex.wrapT = RepeatWrapping;
      tex.channel = 1;
      this.cloth.bumpMap = tex;
      this.cloth.bumpScale = 1.2;
      this.cloth.needsUpdate = true;
      this.requestRender();
    };
    img.src = url;
  }

  private textureUrl: string | undefined;

  private setTexture(url: string | undefined): void {
    if (url === this.textureUrl) return;
    this.textureUrl = url;
    const old = this.cloth.map;
    this.cloth.map = null;
    this.cloth.needsUpdate = true;
    old?.dispose();
    if (!url) return;
    const img = new Image();
    img.onload = () => {
      if (this.textureUrl !== url) return; // replaced meanwhile
      const tex = new CanvasTexture(img);
      tex.colorSpace = SRGBColorSpace;
      this.cloth.map = tex;
      this.cloth.needsUpdate = true;
      this.requestRender();
    };
    img.src = url;
  }

  private clearFigure(): void {
    for (const child of [...this.figure.children]) {
      this.figure.remove(child);
      child.traverse((o) => {
        if (o instanceof Mesh) {
          o.geometry.dispose();
          if (o.material !== this.skin && o.material !== this.cloth && o.material !== this.under) (o.material as MeshStandardMaterial).dispose();
        }
      });
    }
  }

  private frame(): void {
    const H = this.height;
    this.controls.target.set(0, H * 0.52, 0);
    const dist = (H * 1.12) / 2 / Math.tan((this.camera.fov * Math.PI) / 360);
    this.camera.position.set(0, H * 0.52 + dist * 0.12, dist);
    this.controls.minDistance = dist * 0.5;
    this.controls.maxDistance = dist * 1.8;
    this.controls.update();
  }

  private resize(): void {
    const w = Math.max(200, this.container.clientWidth);
    const h = Math.round(Math.min(w * 1.3, 560));
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = `${h}px`;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.requestRender();
  }

  private requestRender(): void {
    if (this.raf) return;
    this.raf = requestAnimationFrame(() => {
      this.raf = 0;
      this.renderer.render(this.scene, this.camera);
    });
  }
}
