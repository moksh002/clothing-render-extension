import type { FitResult } from '../types';

/** A renderer only draws a FitResult; it never computes fit. */
export interface Renderer {
  render(fit: FitResult, el: SVGElement): void;
}

/** The interactive 3D renderer (see render/three/scene.ts). Kept separate because it owns a WebGL canvas. */
export type { ThreeRenderer } from './three/scene';
