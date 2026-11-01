import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Dev hook for the browser test harness: `?lab` exposes the pose tools on window.
if (new URLSearchParams(location.search).has('lab')) {
  Promise.all([import('../look/pose'), import('../look/photo-kind'), import('../look/pipeline')]).then(([pose, kind, pipeline]) => {
    (window as unknown as { __vfLab: unknown }).__vfLab = { ...pose, ...kind, ...pipeline };
  });
}
