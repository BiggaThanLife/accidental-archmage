import * as THREE from 'three';
import { SceneManager, Ease } from './SceneManager';
import { tileToWorld } from './GridBoard';
import type { GameState } from '../game/GameState';
import { Dir, Prop, Unit, Vec } from '../game/types';

const std = (color: number, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.7, ...extra });

function shadowed<T extends THREE.Object3D>(o: T): T {
  o.traverse(c => { if ((c as THREE.Mesh).isMesh) { c.castShadow = true; c.receiveShadow = true; } });
  return o;
}

export const facingToRot = (d: Dir) => [Math.PI, Math.PI / 2, 0, -Math.PI / 2][d];

// ---------------------------------------------------------------- unit meshes
function eyes(g: THREE.Group, y: number, z: number, spread = 0.12, size = 0.06) {
  for (const s of [-1, 1]) {
    const w = new THREE.Mesh(new THREE.SphereGeometry(size, 8, 6), std(0xffffff, { roughness: 0.3 }));
    w.position.set(s * spread, y, z);
    const p = new THREE.Mesh(new THREE.SphereGeometry(size * 0.5, 6, 4), std(0x111111));
    p.position.set(s * spread, y, z + size * 0.7);
    g.add(w, p);
  }
}

export function makeWizard(): THREE.Group {
  const g = new THREE.Group();
  const robe = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.34, 0.7, 12), std(0x5b3cc4));
  robe.position.y = 0.35; robe.name = 'robe';
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 10), std(0xffd7b5));
  head.position.y = 0.86;
  const beard = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.4, 10), std(0xf2f2f2));
  beard.rotation.x = Math.PI; beard.position.set(0, 0.68, 0.1);
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.04, 16), std(0x2d4ad8));
  brim.position.y = 0.98;
  const hat = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.55, 12), std(0x2d4ad8));
  hat.position.set(0, 1.25, -0.03); hat.rotation.x = -0.25;
  const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.06), std(0xffd34d, { emissive: 0xffaa00, emissiveIntensity: 0.6 }));
  star.position.set(0, 1.15, 0.13);
  const staff = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.1, 6), std(0x8b5a2b));
  staff.position.set(0.32, 0.55, 0.05);
  const orb = new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 8), std(0x9ff3ff, { emissive: 0x44ccff, emissiveIntensity: 0.8 }));
  orb.position.set(0.32, 1.12, 0.05);
  eyes(g, 0.9, 0.15, 0.07, 0.035);
  g.add(robe, head, beard, brim, hat, star, staff, orb);
  return shadowed(g);
}

function makeGuard(): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.62, 0.45), std(0x6c7a96));
  body.position.y = 0.31;
  const helm = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.18, 0.5), std(0x9aa7c2, { metalness: 0.5, roughness: 0.4 }));
  helm.position.y = 0.7;
  const plume = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.22, 0.35), std(0xd94060));
  plume.position.y = 0.88;
  const spear = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.2, 6), std(0x8b5a2b));
  spear.position.set(0.36, 0.55, 0.1);
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.18, 6), std(0xdddddd, { metalness: 0.7 }));
  tip.position.set(0.36, 1.2, 0.1);
  eyes(g, 0.48, 0.23);
  g.add(body, helm, plume, spear, tip);
  return shadowed(g);
}

function makeClerk(): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.52, 0.4), std(0xc9a96e));
  body.position.y = 0.26;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.3, 0.34), std(0xf0c9a0));
  head.position.y = 0.67;
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.05, 0.25), std(0x2e7d32));
  visor.position.set(0, 0.84, 0.12);
  const bow = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.06, 0.08), std(0x5d4037));
  bow.position.set(0, 0.36, 0.3);
  const stock = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.4), std(0x795548));
  stock.position.set(0, 0.36, 0.2);
  const glasses = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.012, 6, 12), std(0x222222));
  glasses.position.set(0.08, 0.7, 0.18);
  const g2 = glasses.clone(); g2.position.x = -0.08;
  eyes(g, 0.7, 0.17, 0.08, 0.035);
  g.add(body, head, visor, bow, stock, glasses, g2);
  return shadowed(g);
}

function makeBrute(): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.78, 0.62), std(0x7a2e3a));
  body.position.y = 0.39;
  const shirt = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.5, 0.02), std(0xf5f5f5));
  shirt.position.set(0, 0.45, 0.32);
  const tie = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.4, 0.03), std(0xffcc00));
  tie.position.set(0, 0.42, 0.335);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.3, 0.36), std(0xe0a37a));
  head.position.y = 0.93;
  const briefcase = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.3, 0.4), std(0x3e2723));
  briefcase.position.set(0.48, 0.3, 0);
  eyes(g, 0.95, 0.19, 0.09, 0.04);
  g.add(body, shirt, tie, head, briefcase);
  return shadowed(g);
}

function makeGoose(): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 10), std(0xfafafa));
  body.scale.set(1, 0.8, 1.3); body.position.y = 0.25;
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.35, 8), std(0xfafafa));
  neck.position.set(0, 0.5, 0.18); neck.rotation.x = 0.3;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 8), std(0xfafafa));
  head.position.set(0, 0.68, 0.24);
  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.14, 6), std(0xff9800));
  beak.rotation.x = Math.PI / 2; beak.position.set(0, 0.66, 0.36);
  eyes(g, 0.71, 0.29, 0.05, 0.02);
  g.add(body, neck, head, beak);
  return shadowed(g);
}

function makeGolem(): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.5, 0.6), std(0xd8d8d8, { roughness: 0.5 }));
  body.position.y = 0.45;
  const tray = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.04, 0.3), std(0x9a9a9a));
  tray.position.set(0, 0.74, -0.05);
  const paper = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.02, 0.36), std(0xffffff));
  paper.position.set(0, 0.24, 0.32); paper.rotation.x = -0.5;
  const light = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 4), new THREE.MeshBasicMaterial({ color: 0xff3b30 }));
  light.position.set(0.25, 0.62, 0.31);
  for (const x of [-0.22, 0.22]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.2, 0.14), std(0x6b6f7a));
    leg.position.set(x, 0.1, 0); g.add(leg);
  }
  eyes(g, 0.55, 0.31, 0.1, 0.045);
  g.add(body, tray, paper, light);
  return shadowed(g);
}

function makeIntern(): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, 0.48, 10), std(0x9ad0ff));
  body.position.y = 0.24;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8), std(0xf0c9a0));
  head.position.y = 0.6;
  const lanyard = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.13, 0.02), std(0xffffff));
  lanyard.position.set(0, 0.3, 0.19);
  const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.04, 0.12, 8), std(0x8b5a2b));
  cup.position.set(0.22, 0.32, 0.05);
  eyes(g, 0.63, 0.12, 0.05, 0.028);
  g.add(body, head, lanyard, cup);
  return shadowed(g);
}

/** Summoned familiars: small, magical, and visibly not quite right. */
function makeFamiliar(creature: string): THREE.Group {
  const g = new THREE.Group();
  switch (creature) {
    case 'owl': {
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 10), std(0x8b5e3c)); body.scale.set(1, 1.15, 0.9); body.position.y = 0.45;
      const belly = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), std(0xe8d3b0)); belly.position.set(0, 0.42, 0.11);
      for (const x of [-0.07, 0.07]) {
        const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.02, 12), std(0xf2e2c0)); ring.rotation.x = Math.PI / 2; ring.position.set(x, 0.56, 0.16); g.add(ring);
        const ear = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.1, 5), std(0x6b4423)); ear.position.set(x * 1.6, 0.73, 0); g.add(ear);
      }
      for (const x of [-0.22, 0.22]) {
        const wing = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.24, 0.18), std(0x6b4423)); wing.position.set(x, 0.45, 0); wing.rotation.z = x * 1.2; g.add(wing);
      }
      eyes(g, 0.56, 0.17, 0.07, 0.04);
      g.add(body, belly);
      g.userData.floaty = true;
      break;
    }
    case 'imp': {
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 10), std(0xd9382e)); body.position.y = 0.3;
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 10), std(0xe8483a)); head.position.y = 0.58;
      for (const x of [-0.08, 0.08]) {
        const horn = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.13, 6), std(0x2a1d12)); horn.position.set(x, 0.74, 0); horn.rotation.z = -x * 4; g.add(horn);
      }
      const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.35, 5), std(0xd9382e)); tail.position.set(0, 0.25, -0.22); tail.rotation.x = 1.0;
      const flame = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffb347 })); flame.position.set(0.2, 0.42, 0.08);
      eyes(g, 0.6, 0.12, 0.05, 0.03);
      g.add(body, head, tail, flame);
      break;
    }
    case 'mop': {
      const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.9, 6), std(0xc9a96e)); stick.position.y = 0.6;
      const head = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.25, 0.25, 12, 1, true), std(0xd8d8d8, { side: THREE.DoubleSide })); head.position.y = 0.14;
      for (let i = 0; i < 10; i++) {
        const strand = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.22, 4), std(0xeeeeee));
        strand.position.set(Math.cos(i * 0.63) * 0.2, 0.08, Math.sin(i * 0.63) * 0.2); g.add(strand);
      }
      const bucket = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.05, 0.08, 10), std(0x3d7be0)); bucket.position.set(0, 0.32, 0.05);
      eyes(g, 0.38, 0.12, 0.06, 0.035);
      g.add(stick, head, bucket);
      break;
    }
    case 'dragon': {
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 10), std(0x4caf50)); body.scale.set(1, 0.85, 1.25); body.position.y = 0.3;
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 10), std(0x5cc160)); head.position.set(0, 0.55, 0.2);
      const snout = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.09, 0.12), std(0x5cc160)); snout.position.set(0, 0.5, 0.34);
      for (const x of [-0.25, 0.25]) {
        const wing = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.3, 3), std(0x2e7d32, { flatShading: true })); wing.position.set(x, 0.48, -0.05); wing.rotation.z = -x * 4; g.add(wing);
      }
      const tail = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.35, 6), std(0x4caf50)); tail.position.set(0, 0.22, -0.32); tail.rotation.x = -1.6;
      eyes(g, 0.62, 0.3, 0.06, 0.035);
      g.add(body, head, snout, tail);
      break;
    }
    case 'mimic': {
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.4, 0.55), std(0xa8743f)); box.position.y = 0.2;
      const lid = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.12, 0.57), std(0x7b5129)); lid.position.set(0, 0.5, -0.08); lid.rotation.x = -0.45;
      const tongue = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.03, 0.32), std(0xd94060)); tongue.position.set(0, 0.4, 0.2);
      for (let i = 0; i < 5; i++) {
        const tooth = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.08, 4), std(0xffffff)); tooth.position.set(-0.24 + i * 0.12, 0.38, 0.27); tooth.rotation.x = Math.PI; g.add(tooth);
      }
      eyes(g, 0.56, 0.12, 0.12, 0.045);
      g.add(box, lid, tongue);
      break;
    }
    case 'wisp': {
      const core = new THREE.Mesh(new THREE.SphereGeometry(0.16, 14, 10), std(0x9ff3ff, { emissive: 0x44ccff, emissiveIntensity: 1.2, transparent: true, opacity: 0.85 }));
      core.position.y = 0.6;
      const halo = new THREE.Mesh(new THREE.SphereGeometry(0.26, 14, 10), new THREE.MeshBasicMaterial({ color: 0x9ff3ff, transparent: true, opacity: 0.25 }));
      halo.position.y = 0.6;
      const tail = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.3, 10), std(0x9ff3ff, { emissive: 0x44ccff, emissiveIntensity: 0.8, transparent: true, opacity: 0.6 }));
      tail.position.y = 0.38; tail.rotation.x = Math.PI;
      eyes(g, 0.63, 0.14, 0.05, 0.03);
      g.add(core, halo, tail);
      g.userData.floaty = true;
      break;
    }
    case 'gargoyle': {
      const base = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.15, 0.5), std(0x6d6189)); base.position.y = 0.08;
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.45, 0.36), std(0x8a8a94, { roughness: 0.95, flatShading: true })); body.position.y = 0.38;
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.24, 0.28), std(0x9a9aa4, { flatShading: true })); head.position.set(0, 0.72, 0.04);
      for (const x of [-0.3, 0.3]) {
        const wing = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.4, 3), std(0x6e6e78, { flatShading: true })); wing.position.set(x, 0.55, -0.1); wing.rotation.z = -x * 2.5; g.add(wing);
        const horn = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.12, 4), std(0x6e6e78)); horn.position.set(x * 0.3, 0.9, 0.04); g.add(horn);
      }
      eyes(g, 0.74, 0.19, 0.07, 0.035);
      g.add(base, body, head);
      break;
    }
    default: { // slime
      const blob = new THREE.Mesh(new THREE.SphereGeometry(0.28, 14, 10), std(0x7fff7f, { transparent: true, opacity: 0.75, roughness: 0.2 }));
      blob.scale.set(1, 0.7, 1); blob.position.y = 0.2;
      const inner = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), std(0x2e7d32)); inner.position.set(0.05, 0.18, -0.02);
      eyes(g, 0.3, 0.22, 0.08, 0.04);
      g.add(blob, inner);
    }
  }
  return shadowed(g);
}

// ---------------------------------------------------------------- prop meshes
export function makeArmchair(): THREE.Group {
  const g = new THREE.Group();
  const c = std(0xb23a48);
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.25, 0.65), c); seat.position.y = 0.25;
  const back = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.55, 0.15), c); back.position.set(0, 0.55, -0.27);
  const a1 = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.3, 0.6), c); a1.position.set(0.32, 0.45, 0);
  const a2 = a1.clone(); a2.position.x = -0.32;
  const legMat = std(0x4e342e);
  for (const [x, z] of [[-0.3, -0.27], [0.3, -0.27], [-0.3, 0.27], [0.3, 0.27]]) {
    const l = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.14, 6), legMat);
    l.position.set(x, 0.07, z); g.add(l);
  }
  g.add(seat, back, a1, a2);
  return shadowed(g);
}

function makeProp(kind: Prop['kind']): THREE.Group {
  const g = new THREE.Group();
  switch (kind) {
    case 'obstacle': {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.7, 0.85), std(0x5a4f73, { roughness: 0.95 }));
      b.position.y = 0.35;
      const top = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.25, 0.6), std(0x6d6189));
      top.position.set(0.05, 0.82, -0.05); top.rotation.y = 0.3;
      g.add(b, top);
      break;
    }
    case 'pillar': {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.36, 1.3, 10), std(0xb7aed0));
      p.position.y = 0.65;
      const cap = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.14, 0.8), std(0xd8d0ee));
      cap.position.y = 1.35;
      g.add(p, cap);
      break;
    }
    case 'crate': {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.62, 0.72), std(0xa8743f));
      b.position.y = 0.31;
      const slat = new THREE.Mesh(new THREE.BoxGeometry(0.76, 0.08, 0.76), std(0x7b5129));
      slat.position.y = 0.45;
      const label = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.2), std(0xff3b30, { emissive: 0x550000 }));
      label.position.set(0, 0.25, 0.365);
      g.add(b, slat, label);
      for (let i = 0; i < 3; i++) {
        const cab = new THREE.Mesh(new THREE.IcosahedronGeometry(0.15, 1), std(0x7ccf5a, { flatShading: true }));
        cab.position.set(-0.18 + i * 0.18, 0.7, (i % 2) * 0.12 - 0.06);
        g.add(cab);
      }
      break;
    }
    case 'vase': {
      const pts: THREE.Vector2[] = [];
      for (let i = 0; i <= 10; i++) {
        const t = i / 10;
        pts.push(new THREE.Vector2(0.12 + Math.sin(t * Math.PI) * 0.2 + (t > 0.85 ? (t - 0.85) * 0.8 : 0), t * 0.8));
      }
      const v = new THREE.Mesh(new THREE.LatheGeometry(pts, 14), std(0x3d7be0, { roughness: 0.15, metalness: 0.1 }));
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.025, 6, 20), std(0xffd34d, { metalness: 0.6, roughness: 0.3 }));
      band.rotation.x = Math.PI / 2; band.position.y = 0.4;
      const tag = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, 0.01), std(0xffffff));
      tag.position.set(0.2, 0.55, 0.2); tag.rotation.y = 0.7;
      g.add(v, band, tag);
      break;
    }
    case 'armchair':
      return makeArmchair();
    case 'cart': {
      const basket = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.35, 0.45), std(0xc0c6d0, { metalness: 0.7, roughness: 0.3, wireframe: false }));
      basket.position.y = 0.55;
      const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.5, 6), std(0xff3b30));
      handle.rotation.z = Math.PI / 2; handle.position.set(0, 0.8, -0.25);
      g.add(basket, handle);
      for (const [x, z] of [[-0.25, -0.18], [0.25, -0.18], [-0.25, 0.18], [0.25, 0.18]]) {
        const w = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.02, 6, 10), std(0x222222));
        w.position.set(x, 0.3, z); w.rotation.y = Math.PI / 2; g.add(w);
      }
      g.userData.floaty = true;
      break;
    }
    case 'confetti': {
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.28, 14, 10), std(0xff4fd8, { roughness: 0.3 }));
      b.position.y = 0.3;
      const dots = [0x4fd1ff, 0xffe14a, 0x6ee7b7];
      for (let i = 0; i < 9; i++) {
        const d = new THREE.Mesh(new THREE.SphereGeometry(0.045, 6, 4), std(dots[i % 3]));
        const a = i * 2.4, e = (i / 9) * Math.PI;
        d.position.set(Math.cos(a) * Math.sin(e) * 0.28, 0.3 + Math.cos(e) * 0.28, Math.sin(a) * Math.sin(e) * 0.28);
        g.add(d);
      }
      const fuse = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.2, 5), std(0x333333));
      fuse.position.y = 0.66;
      const spark = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 4), new THREE.MeshBasicMaterial({ color: 0xffdd55 }));
      spark.position.y = 0.78; spark.name = 'spark';
      g.add(b, fuse, spark);
      break;
    }
    case 'plant': {
      const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.15, 0.3, 10), std(0xb5651d));
      pot.position.y = 0.15;
      const soil = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.02, 10), std(0x3e2723));
      soil.position.y = 0.3;
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.03, 0.5, 5), std(0x6b5a2a));
      stem.position.y = 0.55; stem.rotation.z = 0.25;
      g.add(pot, soil, stem);
      for (let i = 0; i < 5; i++) {
        const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 4), std(i % 2 ? 0x8a7a3a : 0x6b5a2a, { flatShading: true }));
        leaf.scale.set(1.4, 0.3, 0.8);
        leaf.position.set(Math.cos(i * 1.3) * 0.16, 0.45 + i * 0.07, Math.sin(i * 1.3) * 0.16);
        leaf.rotation.z = -0.8;
        g.add(leaf);
      }
      break;
    }
    case 'bin': {
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.55, 0.6), std(0x3d7be0));
      box.position.y = 0.28;
      const label = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.14), std(0xffffff));
      label.position.set(0, 0.36, 0.305);
      const glove = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.1, 0.22), std(0xff9ad5));
      glove.position.set(-0.12, 0.6, 0); glove.rotation.y = 0.5;
      const scarf = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.035, 6, 10), std(0xfff27a));
      scarf.position.set(0.15, 0.6, 0.05); scarf.rotation.x = Math.PI / 2;
      g.add(box, label, glove, scarf);
      break;
    }
    case 'desk': {
      const top = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.08, 0.6), std(0x8b5a2b));
      top.position.y = 0.6;
      const front = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.5, 0.06), std(0x6d4320));
      front.position.set(0, 0.32, 0.27);
      for (const x of [-0.38, 0.38]) {
        const side = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.56, 0.56), std(0x6d4320));
        side.position.set(x, 0.3, 0); g.add(side);
      }
      const monitor = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.22, 0.04), std(0x222222));
      monitor.position.set(0.1, 0.78, -0.1);
      const mug = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.09, 8), std(0xffffff));
      mug.position.set(-0.25, 0.69, 0.05);
      g.add(top, front, monitor, mug);
      break;
    }
  }
  return shadowed(g);
}

// --------------------------------------------------------- delivery projectiles
export function makeDeliveryMesh(id: string, color: number): THREE.Object3D {
  const g = new THREE.Group();
  switch (id) {
    case 'pigeon': {
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8), std(0x9aa3b5)); b.scale.set(1, 0.8, 1.4);
      const h = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), std(0x6b7a99)); h.position.set(0, 0.08, 0.17);
      const w1 = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.02, 0.15), std(0x8a93a8)); w1.position.y = 0.05;
      g.add(b, h, w1);
      break;
    }
    case 'armchair': return makeArmchair();
    case 'anvil': {
      const top = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.18, 0.35), std(0x444a55, { metalness: 0.8, roughness: 0.3 })); top.position.y = 0.3;
      const mid = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.2, 0.25), std(0x444a55, { metalness: 0.8 })); mid.position.y = 0.12;
      const base = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.1, 0.4), std(0x444a55, { metalness: 0.8 }));
      g.add(top, mid, base);
      break;
    }
    case 'coupon': {
      const c = new THREE.Mesh(new THREE.PlaneGeometry(0.45, 0.25), std(0xfff27a, { side: THREE.DoubleSide, emissive: 0x554400 }));
      g.add(c);
      break;
    }
    case 'soup': {
      const bowl = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), std(0xf5f5f5, { side: THREE.DoubleSide }));
      const soup = new THREE.Mesh(new THREE.CircleGeometry(0.2, 12).rotateX(-Math.PI / 2), std(0xd9a35a));
      soup.position.y = -0.02;
      g.add(bowl, soup);
      break;
    }
    case 'fax': {
      const p = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.4, 3), std(0xffffff, { flatShading: true }));
      p.rotation.x = Math.PI / 2; p.scale.set(1, 1, 0.25);
      g.add(p);
      break;
    }
    case 'disco': {
      const b = new THREE.Mesh(new THREE.IcosahedronGeometry(0.3, 1), std(0xe8e8ff, { metalness: 1, roughness: 0.15, flatShading: true }));
      g.add(b);
      break;
    }
    case 'candelabra': {
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.06, 0.4, 6), std(0xc9973a, { metalness: 0.8 }));
      g.add(stem);
      for (const x of [-0.15, 0, 0.15]) {
        const flame = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.12, 6), new THREE.MeshBasicMaterial({ color: 0xffb347 }));
        flame.position.set(x, 0.28, 0); g.add(flame);
      }
      break;
    }
    case 'catapult': {
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.22), std(0x7a7a7a, { flatShading: true }));
      g.add(rock);
      break;
    }
    case 'livestock': {
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.35, 0.7), std(0xffffff));
      body.position.y = 0.3;
      const spot = new THREE.Mesh(new THREE.BoxGeometry(0.41, 0.15, 0.2), std(0x111111)); spot.position.set(0, 0.35, 0.05);
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.25, 0.22), std(0xffffff)); head.position.set(0, 0.45, 0.42);
      const snout = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.1, 0.06), std(0xffb3c6)); snout.position.set(0, 0.4, 0.55);
      g.add(body, spot, head, snout);
      break;
    }
    default: {
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), std(color, { emissive: color, emissiveIntensity: 0.4, transparent: true, opacity: 0.9 }));
      g.add(b);
    }
  }
  return shadowed(g);
}

// ---------------------------------------------------------------- the view
const STATUS_ICON: [keyof Unit['status'], string, string][] = [
  ['stun', '😳', 'Stunned'], ['pacified', '🕊️', 'Pacified'], ['enraged', '😡', 'Enraged'],
  ['vulnerable', '🙇', 'Vulnerable'], ['dot', '☕', 'Burning feet'], ['blind', '✨', 'Blinded'],
  ['slow', '🍬', 'Slowed'], ['rooted', '⚓', 'Rooted'], ['interrupted', '🫢', 'Hiccuping'],
  ['rust', '🟫', 'Rusted'], ['alerted', '❗', 'Alerted'], ['aggro', '💢', 'Aggro'], ['bees', '🐝', 'Bees'],
  ['weak', '😔', 'Self-doubt'], ['frozen', '🧊', 'Frozen'], ['charmed', '🎭', 'Mistaken for you'],
  ['doom', '📄', 'Final warning'], ['marked', '🗳️', 'Under committee review'], ['pinned', '📎', 'Stapled'],
];

export class EntityView {
  readonly unitMeshes = new Map<number, THREE.Group>();
  readonly propMeshes = new Map<number, THREE.Group>();
  private tags = new Map<number, HTMLDivElement>();
  private tagSig = new Map<number, string>();
  /** see-through wizard previewing where a move will end */
  private ghost: THREE.Group | null = null;

  constructor(private sm: SceneManager, private labelLayer: HTMLElement) {
    sm.onTick((_dt, time) => this.tick(time));
  }

  pickables(): THREE.Object3D[] {
    return [...this.unitMeshes.values()];
  }

  clearAll() {
    for (const m of this.unitMeshes.values()) this.sm.scene.remove(m);
    for (const m of this.propMeshes.values()) this.sm.scene.remove(m);
    for (const t of this.tags.values()) t.remove();
    this.unitMeshes.clear(); this.propMeshes.clear(); this.tags.clear(); this.tagSig.clear();
    this.setGhost(null);
  }

  /** Show (or hide, with null) the ghost Archmage on a tile, facing the way the walk would end. */
  setGhost(p: Vec | null, facing: Dir = 2) {
    if (!p) { if (this.ghost) this.ghost.visible = false; return; }
    if (!this.ghost) {
      const g = makeWizard();
      g.traverse(c => {
        const m = c as THREE.Mesh;
        if (!m.isMesh) return;
        const mat = (m.material as THREE.MeshStandardMaterial).clone();
        mat.transparent = true; mat.opacity = 0.42; mat.depthWrite = false;
        m.material = mat; m.castShadow = false; m.receiveShadow = false;
      });
      this.sm.scene.add(g);
      this.ghost = g;
    }
    this.ghost.visible = true;
    this.ghost.position.copy(tileToWorld(p));
    this.ghost.rotation.y = facingToRot(facing);
  }

  /** Create meshes for anything new; remove meshes for things that are gone. */
  sync(state: GameState) {
    for (const u of state.units) {
      if (!u.alive) continue;
      if (!this.unitMeshes.has(u.id)) {
        const m = u.kind === 'wizard' ? makeWizard() : u.kind === 'guard' ? makeGuard() : u.kind === 'clerk' ? makeClerk()
          : u.kind === 'brute' ? makeBrute() : u.kind === 'golem' ? makeGolem() : u.kind === 'intern' ? makeIntern()
          : u.kind === 'familiar' ? makeFamiliar(u.familiar?.creature ?? 'slime') : makeGoose();
        m.userData.unitId = u.id;
        m.position.copy(tileToWorld(u.pos));
        m.rotation.y = facingToRot(u.facing);
        this.sm.scene.add(m);
        this.unitMeshes.set(u.id, m);
        const tag = document.createElement('div');
        tag.className = `unit-tag team-${u.team}`;
        this.labelLayer.appendChild(tag);
        this.tags.set(u.id, tag);
      }
    }
    for (const [id, m] of this.unitMeshes) {
      const u = state.units.find(x => x.id === id);
      if (!u || !u.alive) {
        this.sm.scene.remove(m);
        this.unitMeshes.delete(id);
        this.tags.get(id)?.remove();
        this.tags.delete(id);
        this.tagSig.delete(id);
      }
    }
    for (const p of state.props) {
      if (!this.propMeshes.has(p.id)) {
        const m = makeProp(p.kind);
        m.userData.propId = p.id;
        m.position.copy(tileToWorld(p.pos));
        m.rotation.y = ((p.id * 37) % 4) * (Math.PI / 2) * (p.kind === 'crate' || p.kind === 'obstacle' || p.kind === 'bin' ? 1 : 0);
        this.sm.scene.add(m);
        this.propMeshes.set(p.id, m);
      }
    }
    for (const [id, m] of this.propMeshes) {
      if (!state.props.some(p => p.id === id)) { this.sm.scene.remove(m); this.propMeshes.delete(id); }
    }
    this.refreshTags(state);
  }

  refreshTags(state: GameState) {
    for (const u of state.units) {
      const tag = this.tags.get(u.id);
      if (!tag) continue;
      const icons = STATUS_ICON.filter(([k]) => u.status[k] > 0).map(([, i]) => i).join('');
      const sig = `${u.hp}/${u.maxHp}|${icons}`;
      if (this.tagSig.get(u.id) === sig) continue;
      this.tagSig.set(u.id, sig);
      const pips = u.maxHp <= 14
        ? Array.from({ length: u.maxHp }, (_, i) => `<i class="${i < u.hp ? 'on' : ''}"></i>`).join('')
        : `<b>${u.hp}/${u.maxHp}</b>`;
      tag.innerHTML = `<span class="pips">${pips}</span>${icons ? `<span class="icons">${icons}</span>` : ''}`;
    }
  }

  statusList(u: Unit): string[] {
    return STATUS_ICON.filter(([k]) => u.status[k] > 0).map(([k, i, label]) => `${i} ${label}${k === 'rust' ? ` ×${u.status[k]}` : ` (${u.status[k]})`}`);
  }

  setRobeColor(u: Unit, color: number) {
    const m = this.unitMeshes.get(u.id);
    const robe = m?.getObjectByName('robe') as THREE.Mesh | undefined;
    if (robe) (robe.material as THREE.MeshStandardMaterial).color.setHex(color);
  }

  async moveUnit(u: Unit, to: Vec, mode: 'walk' | 'slide' | 'knock' | 'fly' = 'walk', dur?: number) {
    const m = this.unitMeshes.get(u.id);
    if (!m) return;
    const from = m.position.clone();
    const target = tileToWorld(to);
    const d = dur ?? (mode === 'walk' ? 200 : mode === 'slide' ? 150 : mode === 'fly' ? 420 : 140);
    const hop = mode === 'walk' ? 0.18 : mode === 'fly' ? 1.4 : mode === 'knock' ? 0.25 : 0;
    if (mode === 'slide') m.rotation.z = 0.15;
    await this.sm.tween(d, t => {
      m.position.lerpVectors(from, target, t);
      m.position.y = Math.sin(Math.PI * t) * hop;
      if (mode === 'fly') m.rotation.x = t * Math.PI * 2;
    }, mode === 'walk' ? Ease.inOutQuad : Ease.linear);
    m.rotation.x = 0; m.rotation.z = 0;
    m.position.copy(target);
  }

  async bump(u: Unit, dir: Vec) {
    const m = this.unitMeshes.get(u.id);
    if (!m) return;
    const base = m.position.clone();
    await this.sm.tween(160, t => {
      const k = Math.sin(Math.PI * t) * 0.3;
      m.position.set(base.x + dir.x * k, base.y, base.z + dir.y * k);
      m.scale.set(1 + k * 0.5, 1 - k * 0.6, 1 + k * 0.5);
    }, Ease.linear);
    m.position.copy(base); m.scale.set(1, 1, 1);
  }

  async face(u: Unit, spin = false) {
    const m = this.unitMeshes.get(u.id);
    if (!m) return;
    const start = m.rotation.y;
    let target = facingToRot(u.facing);
    if (spin) target += Math.PI * 2;
    // shortest path unless spinning
    let delta = target - start;
    if (!spin) { while (delta > Math.PI) delta -= Math.PI * 2; while (delta < -Math.PI) delta += Math.PI * 2; }
    await this.sm.tween(spin ? 450 : 180, t => { m.rotation.y = start + delta * t; });
    m.rotation.y = facingToRot(u.facing);
  }

  /** Emissive materials of a unit mesh, with their original emissive remembered so overlapping flashes can't stick. */
  private emissives(m: THREE.Object3D): THREE.MeshStandardMaterial[] {
    const mats: THREE.MeshStandardMaterial[] = [];
    m.traverse(c => {
      const mm = (c as THREE.Mesh).material as THREE.MeshStandardMaterial;
      if (mm && 'emissive' in mm) {
        if (mm.userData.baseEm === undefined) mm.userData.baseEm = mm.emissive.getHex();
        mats.push(mm);
      }
    });
    return mats;
  }

  /**
   * Hit reaction (not awaited): white flash fading to red, plus squash-and-stretch and a lean away from `from`.
   * `strength` ~0..1 scales the squash. Under reduced motion it is just a simple red flash.
   */
  flash(u: Unit, opts: { from?: Vec; strength?: number } = {}) {
    const m = this.unitMeshes.get(u.id);
    if (!m) return;
    const mats = this.emissives(m);
    if (this.sm.reduceMotion) {
      mats.forEach(mm => mm.emissive.setHex(0xff2222));
      setTimeout(() => mats.forEach(mm => mm.emissive.setHex(mm.userData.baseEm)), 160);
      return;
    }
    const str = Math.min(1, opts.strength ?? 0.4);
    const c0 = m.children[0];
    const rot0 = c0 ? c0.rotation.clone() : null;
    // lean axis: tilt away from the attacker
    let lx = 0, lz = 0;
    if (opts.from) {
      const dx = u.pos.x - opts.from.x, dy = u.pos.y - opts.from.y;
      const len = Math.hypot(dx, dy) || 1;
      lz = -(dx / len); lx = dy / len;
    }
    const white = new THREE.Color(0xffffff), red = new THREE.Color(0xff2222);
    this.sm.tween(230, t => {
      const col = t < 0.35 ? white : red.clone().multiplyScalar(1 - (t - 0.35) / 0.65);
      for (const mm of mats) {
        const base = new THREE.Color(mm.userData.baseEm);
        if (t >= 1) mm.emissive.copy(base);
        else mm.emissive.setRGB(Math.max(col.r, base.r), Math.max(col.g, base.g), Math.max(col.b, base.b));
      }
      // squash-and-stretch: quick squash, overshoot stretch, settle
      const w = Math.sin(t * Math.PI * 2.4) * (1 - t) * (0.12 + str * 0.28);
      m.scale.set(1 + w, 1 - w * 1.1, 1 + w);
      if (c0 && rot0) {
        const k = Math.sin(Math.min(1, t * 1.6) * Math.PI) * (0.15 + str * 0.35) * (1 - t * 0.5);
        c0.rotation.x = rot0.x + lx * k; c0.rotation.z = rot0.z + lz * k;
      }
    }, Ease.linear).then(() => {
      mats.forEach(mm => mm.emissive.setHex(mm.userData.baseEm));
    });  // scale/lean already land exactly on neutral at t=1; don't clobber other tweens here
  }

  /** Cast wind-up: crouch, glow in the spell's colour, then spring up. Resolves when the release should happen. */
  async charge(u: Unit, color: number) {
    const m = this.unitMeshes.get(u.id);
    if (!m) return;
    const mats = this.emissives(m);
    const glow = new THREE.Color(color);
    const reduced = this.sm.reduceMotion;
    await this.sm.tween(reduced ? 90 : 170, t => {
      const g = Math.sin(t * Math.PI);
      for (const mm of mats) mm.emissive.copy(new THREE.Color(mm.userData.baseEm).lerp(glow, g * 0.6));
      if (!reduced) {
        const k = t < 0.65 ? t / 0.65 : 1 - (t - 0.65) / 0.35 * 1.4;   // crouch then spring past neutral
        m.scale.set(1 + k * 0.12, 1 - k * 0.2, 1 + k * 0.12);
      }
    }, Ease.linear);
    mats.forEach(mm => mm.emissive.setHex(mm.userData.baseEm));
    m.scale.set(1, 1, 1);
  }

  async squash(u: Unit) {
    const m = this.unitMeshes.get(u.id);
    if (!m) return;
    await this.sm.tween(350, t => { m.scale.set(1 + (1 - t) * 0.6, 0.25 + t * 0.75, 1 + (1 - t) * 0.6); }, Ease.outBack);
    m.scale.set(1, 1, 1);
  }

  /** Death: pop, spin and launch away from the hit (slapstick); simple shrink under reduced motion. */
  async die(u: Unit, from?: Vec) {
    const m = this.unitMeshes.get(u.id);
    if (!m) return;
    const y0 = m.position.y, p0 = m.position.clone();
    if (this.sm.reduceMotion) {
      await this.sm.tween(350, t => { m.scale.setScalar(1 - t * 0.9); });
      return;
    }
    let dx = 0, dz = 0;
    if (from) { const lx = u.pos.x - from.x, ly = u.pos.y - from.y, len = Math.hypot(lx, ly) || 1; dx = lx / len; dz = ly / len; }
    const spin = m.rotation.y;
    await this.sm.tween(500, t => {
      m.position.set(p0.x + dx * 0.9 * t, y0 + Math.sin(Math.PI * t) * 1.3, p0.z + dz * 0.9 * t);
      m.rotation.y = spin + t * Math.PI * 4;
      m.rotation.z = t * Math.PI * 0.5;
      m.scale.setScalar(t < 0.18 ? 1 + 0.35 * (t / 0.18) : Math.max(0.05, 1.35 * (1 - (t - 0.18) / 0.82)));
    }, Ease.linear);
  }

  async dropProp(p: Prop, height = 4) {
    const m = this.propMeshes.get(p.id);
    if (!m) return;
    const target = tileToWorld(p.pos);
    m.position.set(target.x, height, target.z);
    await this.sm.tween(320, t => { m.position.y = height * (1 - t); }, Ease.inQuad);
    m.position.y = 0;
  }

  async moveProp(p: Prop, to: Vec) {
    const m = this.propMeshes.get(p.id);
    if (!m) return;
    const from = m.position.clone(), target = tileToWorld(to);
    await this.sm.tween(160, t => m.position.lerpVectors(from, target, t), Ease.linear);
  }

  propWorld(p: Prop) { return tileToWorld(p.pos, 0.4); }
  unitWorld(u: Unit) { return this.unitMeshes.get(u.id)?.position.clone() ?? tileToWorld(u.pos); }

  private tick(time: number) {
    for (const [id, tag] of this.tags) {
      const m = this.unitMeshes.get(id);
      if (!m) continue;
      const s = this.sm.toScreen(m.position.clone().setY(m.position.y + 1.35));
      tag.style.transform = `translate(${s.x}px, ${s.y}px) translate(-50%, -100%)`;
    }
    for (const m of this.propMeshes.values()) {
      if (m.userData.floaty) m.position.y = 0.1 + Math.sin(time * 3 + m.id) * 0.06;
      const spark = m.getObjectByName('spark');
      if (spark) spark.scale.setScalar(0.7 + Math.sin(time * 20) * 0.4);
    }
    if (this.ghost?.visible) this.ghost.position.y = 0.06 + Math.sin(time * 4) * 0.05;
    // idle bob for units (and a gentle hover for flying familiars)
    for (const [id, m] of this.unitMeshes) {
      const child = m.children[0];
      if (child) child.scale.y = 1 + Math.sin(time * 3 + id) * 0.02;
      if (m.userData.floaty) m.children.forEach(c => { if (c.userData.y0 === undefined) c.userData.y0 = c.position.y; c.position.y = c.userData.y0 + 0.08 + Math.sin(time * 3 + id) * 0.05; });
    }
  }
}
