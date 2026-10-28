import type { FitResult } from '../types';

/** A renderer only draws a FitResult; it never computes fit. */
export interface Renderer {
  render(fit: FitResult, el: SVGElement): void;
}
