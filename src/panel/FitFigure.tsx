import { useEffect, useRef, useState } from 'react';
import type { FitResult } from '../types';
import { SvgRenderer } from '../render/svg-renderer';
import { POSES } from '../render/body/poses';
import { ThreeRenderer, type GarmentLook, type View } from '../render/three/scene';

const svg = new SvgRenderer();

const VIEWS: { id: View; label: string }[] = [
  { id: 'front', label: 'Front' },
  { id: 'side', label: 'Side' },
  { id: 'back', label: 'Back' },
];

interface Props {
  fit: FitResult;
  look?: GarmentLook;
  pose: string;
  onPose: (id: string) => void;
}

/** 3D figure you can drag to rotate; falls back to the flat 2D drawing if WebGL is unavailable. */
export function FitFigure({ fit, look, pose, onPose }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const three = useRef<ThreeRenderer | null>(null);
  const [mode, setMode] = useState<'3d' | '2d'>('3d');
  const [webgl, setWebgl] = useState(true);

  // Create the 3D renderer when the 3D view is shown.
  useEffect(() => {
    if (mode !== '3d' || !box.current) return;
    try {
      three.current = new ThreeRenderer(box.current);
    } catch {
      setWebgl(false);
      setMode('2d');
      return;
    }
    return () => {
      three.current?.dispose();
      three.current = null;
    };
  }, [mode]);

  useEffect(() => {
    if (mode === '3d') three.current?.update(fit, look, pose);
    else if (svgRef.current) svg.render(fit, svgRef.current);
  }, [fit, look, mode, pose]);

  return (
    <div className="figure-wrap">
      {mode === '3d' ? <div ref={box} className="figure3d-box" /> : <svg ref={svgRef} className="figure" xmlns="http://www.w3.org/2000/svg" />}
      <div className="figure-bar">
        {mode === '3d' && (
          <div className="segmented" role="group" aria-label="View">
            {VIEWS.map((v) => (
              <button type="button" key={v.id} onClick={() => three.current?.setView(v.id)}>
                {v.label}
              </button>
            ))}
          </div>
        )}
        {webgl && (
          <button type="button" className="link" onClick={() => setMode(mode === '3d' ? '2d' : '3d')}>
            {mode === '3d' ? 'Flat 2D view' : '3D view'}
          </button>
        )}
        {mode === '3d' && <span className="muted small">Drag to rotate</span>}
      </div>
      {mode === '3d' && (
        <div className="poses" role="group" aria-label="Pose">
          {POSES.map((p) => (
            <button type="button" key={p.id} className="chip-btn" aria-pressed={pose === p.id} onClick={() => onPose(p.id)}>
              {p.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
