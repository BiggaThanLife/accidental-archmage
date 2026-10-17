import * as THREE from 'three';

export type Easing = (t: number) => number;
export const Ease = {
  linear: (t: number) => t,
  outCubic: (t: number) => 1 - Math.pow(1 - t, 3),
  inOutQuad: (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  outBack: (t: number) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
  inQuad: (t: number) => t * t,
};

interface Tween {
  start: number;
  dur: number;
  ease: Easing;
  update: (t: number) => void;
  resolve: () => void;
}

/**
 * Owns the renderer, isometric orthographic camera, lights and the frame loop.
 * Also provides a tiny promise-based tween system that the game awaits so that
 * spell resolution reads like a script.
 */
export class SceneManager {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.OrthographicCamera;
  readonly renderer: THREE.WebGLRenderer;
  readonly container: HTMLElement;
  private tweens: Tween[] = [];
  private tickers: ((dt: number, time: number) => void)[] = [];
  private last = performance.now();
  private elapsed = 0;
  private shake = 0;
  private baseCamPos = new THREE.Vector3(20, 20, 20);
  /** global animation speed multiplier (2 = twice as fast) */
  speed = 1;
  zoom = 1;

  constructor(container: HTMLElement) {
    this.container = container;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    container.appendChild(this.renderer.domElement);

    this.scene.background = new THREE.Color(0x1d1430);

    // Isometric orthographic camera: positioned at (20,20,20) looking at the origin.
    this.camera = new THREE.OrthographicCamera(-6, 6, 5, -5, 0.1, 200);
    this.camera.position.copy(this.baseCamPos);
    this.camera.lookAt(0, 0, 0);

    // Soft lighting
    const hemi = new THREE.HemisphereLight(0xcfd8ff, 0x3a2650, 0.9);
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff1d6, 1.6);
    sun.position.set(6, 14, 4);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -8; sun.shadow.camera.right = 8;
    sun.shadow.camera.top = 8; sun.shadow.camera.bottom = -8;
    sun.shadow.camera.near = 1; sun.shadow.camera.far = 40;
    sun.shadow.bias = -0.0008;
    sun.shadow.radius = 4;
    this.scene.add(sun);
    const rim = new THREE.DirectionalLight(0x9f7bff, 0.45);
    rim.position.set(-8, 6, -6);
    this.scene.add(rim);

    new ResizeObserver(() => this.resize()).observe(container);
    this.resize();
    this.renderer.setAnimationLoop(() => this.frame());
  }

  resize() {
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = w + 'px';
    this.renderer.domElement.style.height = h + 'px';
    const aspect = w / h;
    // The 8x8 board spans ~11.3 world units wide on screen in this projection.
    // Fit whichever dimension is tighter, with room for units and labels.
    const halfH = Math.max(5.0, 5.95 / aspect) / this.zoom;
    const halfW = halfH * aspect;
    this.camera.left = -halfW; this.camera.right = halfW;
    this.camera.top = halfH; this.camera.bottom = -halfH;
    this.camera.updateProjectionMatrix();
  }

  setZoom(z: number) { this.zoom = Math.max(0.8, Math.min(1.8, z)); this.resize(); }

  onTick(fn: (dt: number, time: number) => void) { this.tickers.push(fn); }

  tween(durMs: number, update: (t: number) => void, ease: Easing = Ease.outCubic): Promise<void> {
    return new Promise(resolve => {
      this.tweens.push({ start: performance.now(), dur: Math.max(1, durMs / this.speed), ease, update, resolve });
    });
  }

  wait(ms: number) { return this.tween(ms, () => {}); }

  addShake(amount: number) { this.shake = Math.min(0.5, this.shake + amount); }

  /** Project a world position to container pixel coordinates. */
  toScreen(v: THREE.Vector3): { x: number; y: number } {
    const p = v.clone().project(this.camera);
    return {
      x: (p.x * 0.5 + 0.5) * this.container.clientWidth,
      y: (-p.y * 0.5 + 0.5) * this.container.clientHeight,
    };
  }

  private frame() {
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.elapsed += dt;
    const time = this.elapsed;
    const done: Tween[] = [];
    for (const tw of this.tweens) {
      const t = Math.min(1, (now - tw.start) / tw.dur);
      tw.update(tw.ease(t));
      if (t >= 1) done.push(tw);
    }
    if (done.length) {
      this.tweens = this.tweens.filter(t => !done.includes(t));
      done.forEach(t => t.resolve());
    }
    for (const fn of this.tickers) fn(dt, time);

    // camera shake
    if (this.shake > 0.001) {
      this.camera.position.set(
        this.baseCamPos.x + (Math.random() - 0.5) * this.shake,
        this.baseCamPos.y + (Math.random() - 0.5) * this.shake,
        this.baseCamPos.z + (Math.random() - 0.5) * this.shake,
      );
      this.shake *= 0.86;
    } else {
      this.camera.position.copy(this.baseCamPos);
    }
    this.renderer.render(this.scene, this.camera);
  }
}
