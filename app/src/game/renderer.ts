import * as THREE from 'three';

/** The approved art direction requires the full renderer; never silently change quality. */
export function createRenderer(canvas: HTMLCanvasElement) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  return Object.assign(renderer, { mode: 'webgl' as const });
}
