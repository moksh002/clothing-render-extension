import {
  AmbientLight,
  BufferGeometry,
  CircleGeometry,
  Color,
  DirectionalLight,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  HemisphereLight,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Scene,
  SphereGeometry,
  WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { FitResult } from '../../types';
import { buildFigure, type Part, type Ring } from './figure';

export type View = 'front' | 'side' | 'back';

/** Appearance of the garment. Defaults to a neutral colour. */
export interface GarmentLook {
  colour?: string;
}

const SKIN = new Color('#e3c3a8');
const NEUTRAL = new Color('#aab8d4');
const TIGHT = new Color('#e5736f');
const SEGMENTS = 40;

/** Loft elliptical rings (top to bottom) into a closed-around, vertex-coloured surface. */
export function loftGeometry(rings: Ring[], base: Color, capEnds: boolean): BufferGeometry {
  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const tint = new Color();
  for (const r of rings) {
    tint.copy(base).lerp(TIGHT, r.tint);
    for (let j = 0; j < SEGMENTS; j++) {
      const th = (j / SEGMENTS) * Math.PI * 2;
      pos.push(r.cx + r.a * Math.cos(th), r.y, r.cz + r.b * Math.sin(th));
      col.push(tint.r, tint.g, tint.b);
    }
  }
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
  return g;
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

  update(fit: FitResult, look: GarmentLook = {}): void {
    this.clearFigure();
    const spec = buildFigure(fit);
    const cloth = new Color(look.colour ?? NEUTRAL.getStyle());
    for (const part of spec.parts) this.addPart(part, part.kind === 'garment' ? cloth : SKIN);
    for (const blob of spec.blobs) {
      const m = new Mesh(new SphereGeometry(1, 24, 16), this.skin.clone());
      (m.material as MeshStandardMaterial).vertexColors = false;
      (m.material as MeshStandardMaterial).color = SKIN.clone();
      m.scale.set(blob.radii.x, blob.radii.y, blob.radii.z);
      m.position.set(blob.center.x, blob.center.y, blob.center.z);
      if (blob.rotZ) m.rotation.z = blob.rotZ;
      this.figure.add(m);
    }
    if (spec.heightCm !== this.height) {
      this.height = spec.heightCm;
      this.frame();
    }
    this.requestRender();
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

  private addPart(part: Part, base: Color): void {
    const g = new Group();
    g.position.set(part.origin.x, part.origin.y, 0);
    g.rotation.z = part.rotZ;
    const mesh = new Mesh(loftGeometry(part.rings, base, part.kind === 'body'), part.kind === 'garment' ? this.cloth : this.skin);
    g.add(mesh);
    this.figure.add(g);
  }

  private clearFigure(): void {
    for (const child of [...this.figure.children]) {
      this.figure.remove(child);
      child.traverse((o) => {
        if (o instanceof Mesh) {
          o.geometry.dispose();
          if (o.material !== this.skin && o.material !== this.cloth) (o.material as MeshStandardMaterial).dispose();
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
