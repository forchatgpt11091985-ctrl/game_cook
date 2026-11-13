import * as THREE from 'three';
import { SVGRenderer } from 'three/examples/jsm/renderers/SVGRenderer.js';

/** CPU-rendered 3D fallback: same scene and gameplay, without WebGL. */
class SoftwareRenderer {
  readonly mode = 'software';
  readonly shadowMap = { enabled: false, type: THREE.PCFSoftShadowMap };
  private svg = new SVGRenderer();
  private badge = document.createElement('div');
  private simplified = new WeakMap<THREE.BufferGeometry, THREE.BufferGeometry>();
  private lastFrame = -Infinity;
  private scenes = new WeakSet<THREE.Scene>();

  constructor(canvas: HTMLCanvasElement) {
    this.svg.setQuality('low'); this.svg.setPrecision(1);
    Object.assign(this.svg.domElement.style, { position: 'absolute', inset: '0', pointerEvents: 'none' });
    this.svg.domElement.setAttribute('aria-label', 'Тоскана: упрощённая 3D-графика без WebGL');
    canvas.before(this.svg.domElement);
    this.badge.textContent = 'Упрощённая 3D-графика · без WebGL';
    Object.assign(this.badge.style, { position: 'fixed', bottom: '4px', left: '8px', color: '#fff', background: '#173f43dd', borderRadius: '6px', padding: '3px 8px', font: '12px system-ui', pointerEvents: 'none' });
    canvas.parentElement?.append(this.badge);
  }
  setPixelRatio(_ratio: number) {}
  setSize(width: number, height: number, _style = false) { this.svg.setSize(width, height); }
  private geometry(source: THREE.BufferGeometry): THREE.BufferGeometry {
    const existing = this.simplified.get(source); if (existing) return existing;
    let result: THREE.BufferGeometry = source;
    if (source instanceof THREE.CircleGeometry) {
      const r = source.parameters.radius;
      result = r > 30 ? new THREE.PlaneGeometry(r * 2, r * 2, 24, 24) : new THREE.RingGeometry(0, r, 24, 8);
    } else if (source instanceof THREE.SphereGeometry) {
      const p = source.parameters;
      result = new THREE.SphereGeometry(p.radius, 6, 4, p.phiStart, p.phiLength, p.thetaStart, p.thetaLength);
    } else if (source instanceof THREE.CapsuleGeometry) {
      const p = source.parameters;
      result = new THREE.CapsuleGeometry(p.radius, p.height, 2, 6);
    } else if (source instanceof THREE.CylinderGeometry && source.parameters.radialSegments > 8) {
      const p = source.parameters;
      result = new THREE.CylinderGeometry(p.radiusTop, p.radiusBottom, p.height, 8, 1, p.openEnded);
    }
    this.simplified.set(source, result); this.simplified.set(result, result); return result;
  }
  render(scene: THREE.Scene, camera: THREE.Camera) {
    const now = performance.now(); if (now - this.lastFrame < 50) return; this.lastFrame = now;
    if (!this.scenes.has(scene)) {
      scene.add(new THREE.AmbientLight(0xffffff, 0.65));
      scene.traverse(object => { if (object instanceof THREE.DirectionalLight) object.intensity = 0.45; });
      this.scenes.add(scene);
    }
    scene.traverse(object => {
      if (object instanceof THREE.Mesh) object.geometry = this.geometry(object.geometry);
      // Texture sprites are unsupported. NPC names remain in interaction prompts.
      if (object instanceof THREE.Sprite) object.material.visible = false;
    });
    this.svg.render(scene, camera);
  }
  dispose() { this.svg.domElement.remove(); this.badge.remove(); this.simplified = new WeakMap(); }
}
export function createRenderer(canvas: HTMLCanvasElement) {
  try {
    return Object.assign(new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true }), { mode: 'webgl' as const });
  } catch { return new SoftwareRenderer(canvas); }
}
