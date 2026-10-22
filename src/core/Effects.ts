import * as THREE from 'three';
import { SceneManager, Ease } from './SceneManager';

interface Particle {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  spin: THREE.Vector3;
  life: number;
  maxLife: number;
  gravity: number;
  floor: boolean;
}

interface FloatLabel { el: HTMLDivElement; pos: THREE.Vector3; born: number; life: number; size: number; pop: number }

const MAX_PARTICLES = 220;

/** Particles, projectiles and floating combat text. */
export class Effects {
  private particles: Particle[] = [];
  private labels: FloatLabel[] = [];
  private geoCache = new Map<string, THREE.BufferGeometry>();

  constructor(private sm: SceneManager, private labelLayer: HTMLElement) {
    sm.onTick(dt => this.tick(dt));
  }

  private geo(kind: string): THREE.BufferGeometry {
    let g = this.geoCache.get(kind);
    if (!g) {
      switch (kind) {
        case 'cube': g = new THREE.BoxGeometry(0.1, 0.1, 0.1); break;
        case 'flat': g = new THREE.PlaneGeometry(0.12, 0.08); break;
        case 'leaf': g = new THREE.IcosahedronGeometry(0.09, 0); break;
        case 'tet': g = new THREE.TetrahedronGeometry(0.07); break;
        default: g = new THREE.SphereGeometry(0.07, 6, 4);
      }
      this.geoCache.set(kind, g);
    }
    return g;
  }

  burst(at: THREE.Vector3, colors: number[], opts: { count?: number; speed?: number; up?: number; shape?: string; gravity?: number; life?: number; size?: number } = {}) {
    // keep phones cheap: cap live particles, trim new bursts when the pool is full
    const room = Math.max(0, MAX_PARTICLES - this.particles.length);
    const count = Math.min(opts.count ?? 14, room);
    for (let i = 0; i < count; i++) {
      const color = colors[i % colors.length];
      const mesh = new THREE.Mesh(
        this.geo(opts.shape ?? 'sphere'),
        new THREE.MeshStandardMaterial({ color, roughness: 0.5, side: THREE.DoubleSide, transparent: true }),
      );
      const s = (opts.size ?? 1) * (0.7 + Math.random() * 0.6);
      mesh.scale.setScalar(s);
      mesh.position.copy(at);
      mesh.castShadow = true;
      const a = Math.random() * Math.PI * 2;
      const sp = (opts.speed ?? 3) * (0.4 + Math.random() * 0.8);
      const life = (opts.life ?? 1.1) * (0.7 + Math.random() * 0.6);
      this.sm.scene.add(mesh);
      this.particles.push({
        mesh,
        vel: new THREE.Vector3(Math.cos(a) * sp, (opts.up ?? 3) * (0.5 + Math.random()), Math.sin(a) * sp),
        spin: new THREE.Vector3(Math.random() * 8, Math.random() * 8, Math.random() * 8),
        life, maxLife: life, gravity: opts.gravity ?? 9, floor: true,
      });
    }
  }

  /** Fly a mesh from a to b along an arc; resolves on impact and removes the mesh. */
  async projectile(mesh: THREE.Object3D, from: THREE.Vector3, to: THREE.Vector3, arc = 1, dur = 380, spin = true) {
    this.sm.scene.add(mesh);
    mesh.position.copy(from);
    const dir = to.clone().sub(from);
    if (dir.lengthSq() > 0) mesh.lookAt(to.x, mesh.position.y, to.z);
    const baseRot = mesh.rotation.clone();
    await this.sm.tween(dur, t => {
      mesh.position.lerpVectors(from, to, t);
      mesh.position.y += Math.sin(Math.PI * t) * arc;
      if (spin) mesh.rotation.set(baseRot.x + t * 6, baseRot.y, baseRot.z);
    }, Ease.linear);
    this.sm.scene.remove(mesh);
  }

  /** Expanding flat ring (shockwaves, gossip, accordion wheezes). */
  async ring(at: THREE.Vector3, color: number, radius = 1.5, dur = 450) {
    const m = new THREE.Mesh(
      new THREE.RingGeometry(0.8, 1, 32).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }),
    );
    m.position.copy(at).setY(at.y + 0.1);
    this.sm.scene.add(m);
    await this.sm.tween(dur, t => {
      m.scale.setScalar(0.1 + t * radius);
      (m.material as THREE.MeshBasicMaterial).opacity = 0.9 * (1 - t);
    });
    this.sm.scene.remove(m);
  }

  /** Lightning-ish zig-zag between points. */
  async zap(points: THREE.Vector3[], color = 0x9ff3ff, dur = 350) {
    if (points.length < 2) {
      if (points.length === 1) this.burst(points[0].clone().setY(0.4), [color, 0xffffff], { count: 10, speed: 2, up: 2 });
      return;
    }
    const verts: THREE.Vector3[] = [];
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i], b = points[i + 1];
      for (let s = 0; s <= 4; s++) {
        const p = a.clone().lerp(b, s / 4);
        p.y = 0.35 + (s % 4 ? (Math.random() - 0.5) * 0.4 : 0);
        p.x += s % 4 ? (Math.random() - 0.5) * 0.25 : 0;
        verts.push(p);
      }
    }
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(verts), new THREE.LineBasicMaterial({ color, transparent: true }));
    this.sm.scene.add(line);
    await this.sm.tween(dur, t => { (line.material as THREE.LineBasicMaterial).opacity = 1 - t; });
    this.sm.scene.remove(line);
  }

  /**
   * Floating text. `size` scales the pop (1 = normal, capped for small screens); `pop` is the overshoot amount.
   * Existing callers keep the old look (size 1, pop 0.x).
   */
  floatText(at: THREE.Vector3, text: string, cls = 'dmg', life = 1.3, opts: { size?: number; pop?: number } = {}) {
    const el = document.createElement('div');
    el.className = `float-text ${cls}`;
    el.textContent = text;
    this.labelLayer.appendChild(el);
    while (this.labels.length > 40) { const o = this.labels.shift()!; o.el.remove(); }
    const reduced = this.sm.reduceMotion;
    this.labels.push({
      el, pos: at.clone(), born: this.sm.now(), life: life * 1000 / this.sm.speed,
      size: Math.min(1.7, opts.size ?? 1), pop: reduced ? 0 : (opts.pop ?? 0),
    });
  }

  /**
   * Impact number scaled by how big the hit is. kind picks the style:
   * 'hit' normal damage, 'self' damage to the player, 'kill' lethal blow, 'bonus' crit/bonus damage, 'heal' healing.
   */
  damageNumber(at: THREE.Vector3, amount: number, kind: 'hit' | 'self' | 'kill' | 'bonus' | 'heal' = 'hit') {
    const mag = Math.min(1, amount / 8);
    const size = 1 + mag * 0.5 + (kind === 'kill' ? 0.2 : kind === 'bonus' ? 0.15 : 0);
    const pop = 0.25 + mag * 0.5 + (kind === 'kill' || kind === 'bonus' ? 0.2 : 0);
    const cls = kind === 'self' ? 'dmg-self' : kind === 'kill' ? 'dmg dmg-kill' : kind === 'bonus' ? 'dmg dmg-bonus'
      : kind === 'heal' ? 'dmg-heal' : 'dmg';
    const txt = kind === 'heal' ? `+${amount}` : kind === 'bonus' ? `-${amount}!` : kind === 'kill' ? `-${amount}!!` : `-${amount}`;
    this.floatText(at, txt, cls, kind === 'kill' ? 1.5 : 1.3, { size, pop });
  }

  /** Big screen-space callout ("COMBO x3", "CHAIN REACTION"). Pure CSS animation; removes itself. */
  callout(text: string, tier = 1) {
    const el = document.createElement('div');
    el.className = `callout tier-${Math.min(3, Math.max(1, tier))}${this.sm.reduceMotion ? ' still' : ''}`;
    el.textContent = text;
    this.labelLayer.appendChild(el);
    setTimeout(() => el.remove(), 1300);
  }

  private tick(dt: number) {
    for (const p of this.particles) {
      p.life -= dt;
      p.vel.y -= p.gravity * dt;
      p.mesh.position.addScaledVector(p.vel, dt);
      if (p.floor && p.mesh.position.y < 0.05) {
        p.mesh.position.y = 0.05;
        p.vel.y *= -0.35;
        p.vel.x *= 0.6; p.vel.z *= 0.6;
      }
      p.mesh.rotation.x += p.spin.x * dt;
      p.mesh.rotation.y += p.spin.y * dt;
      const m = p.mesh.material as THREE.MeshStandardMaterial;
      m.opacity = Math.min(1, p.life / (p.maxLife * 0.4));
    }
    const dead = this.particles.filter(p => p.life <= 0);
    if (dead.length) {
      dead.forEach(p => { this.sm.scene.remove(p.mesh); (p.mesh.material as THREE.Material).dispose(); });
      this.particles = this.particles.filter(p => p.life > 0);
    }

    const now = this.sm.now();
    for (const l of this.labels) {
      const t = (now - l.born) / l.life;
      const s = this.sm.toScreen(l.pos.clone().setY(l.pos.y + t * 0.9));
      let sc = 1;
      if (t < 0.15) sc = 0.6 + t * 2.7;
      if (l.pop > 0) {
        // overshoot then settle: 0 -> (1+pop) at 12% -> 1 at 30%
        sc = t < 0.12 ? 0.4 + (0.6 + l.pop) * (t / 0.12) : t < 0.3 ? 1 + l.pop * (1 - (t - 0.12) / 0.18) : 1;
      }
      l.el.style.transform = `translate(${s.x}px, ${s.y}px) translate(-50%, -50%) scale(${sc * l.size})`;
      l.el.style.opacity = String(t > 0.7 ? Math.max(0, (1 - t) / 0.3) : 1);
    }
    const old = this.labels.filter(l => now - l.born > l.life);
    if (old.length) {
      old.forEach(l => l.el.remove());
      this.labels = this.labels.filter(l => now - l.born <= l.life);
    }
  }
}
