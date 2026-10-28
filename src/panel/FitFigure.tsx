import { useEffect, useRef } from 'react';
import type { FitResult } from '../types';
import { SvgRenderer } from '../render/svg-renderer';

const renderer = new SvgRenderer();

export function FitFigure({ fit }: { fit: FitResult }) {
  const ref = useRef<SVGSVGElement>(null);
  useEffect(() => {
    if (ref.current) renderer.render(fit, ref.current);
  }, [fit]);
  return <svg ref={ref} className="figure" xmlns="http://www.w3.org/2000/svg" />;
}
