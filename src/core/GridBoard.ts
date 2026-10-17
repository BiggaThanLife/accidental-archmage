import * as THREE from 'three';
import { SceneManager } from './SceneManager';
import { BOARD_SIZE, Hazard, HazardKind, Vec, key } from '../game/types';

export const TILE_TOP = 0.0;

export function tileToWorld(p: Vec, y = 0): THREE.Vector3 {
  return new THREE.Vector3(p.x - (BOARD_SIZE - 1) / 2, y, p.y - (BOARD_SIZE - 1) / 2);
}

export type HighlightKind = 'move' | 'range' | 'path' | 'area' | 'invalid';

const HL_COLORS: Record<HighlightKind, number> = {
  move: 0x4fffc0,
  range: 0x7aa8ff,
  path: 0xb6ffe9,
  area: 0xffd34d,
  invalid: 0x777777,
};

const HAZARD_COLORS: Record<HazardKind, number> = {
  grease: 0x5a3d12,
  water: 0x2f8fff,
  fire: 0xff6a1a,
  banana: 0xffe14a,
  jelly: 0xff6fb5,
  shards: 0xbff4ff,
};

/**
 * The interactive 8x8 tower floor: tile meshes, hover raycasting, highlight
 * layers (movement / spell range / affected area / enemy telegraphs) and
 * hazard decals.
 */
export class GridBoard {
  readonly group = new THREE.Group();
  private tiles: THREE.Mesh[] = [];
  private hlLayer: THREE.Mesh[] = [];
  private areaLayer: THREE.Mesh[] = [];
  private teleLayer: THREE.Mesh[] = [];
  private hazardGroups: THREE.Group[] = [];
  private hazardSig: string[] = [];
  private hover: THREE.Mesh;
  private raycaster = new THREE.Raycaster();
  private hlMats = new Map<HighlightKind, THREE.MeshBasicMaterial>();
  private teleMat: THREE.MeshBasicMaterial;
  private areaMat: THREE.MeshBasicMaterial;
  private animated: { obj: THREE.Object3D; kind: HazardKind; phase: number }[] = [];
  hoverTile: Vec | null = null;

  constructor(private sm: SceneManager) {
    sm.scene.add(this.group);

    // Plinth + decorative tower rim
    const plinth = new THREE.Mesh(
      new THREE.BoxGeometry(BOARD_SIZE + 0.6, 1.2, BOARD_SIZE + 0.6),
      new THREE.MeshStandardMaterial({ color: 0x3b2b52, roughness: 0.9 }),
    );
    plinth.position.y = -0.75;
    plinth.receiveShadow = true;
    this.group.add(plinth);
    const trim = new THREE.Mesh(
      new THREE.BoxGeometry(BOARD_SIZE + 0.9, 0.12, BOARD_SIZE + 0.9),
      new THREE.MeshStandardMaterial({ color: 0xc9973a, roughness: 0.5, metalness: 0.4 }),
    );
    trim.position.y = -1.3;
    this.group.add(trim);

    // Corner turrets
    const turretMat = new THREE.MeshStandardMaterial({ color: 0x4a3866, roughness: 0.85 });
    const roofMat = new THREE.MeshStandardMaterial({ color: 0x7c4dff, roughness: 0.6 });
    // (no turret on the corner nearest the camera, so it never hides the board)
    for (const [cx, cz] of [[-1, -1], [1, -1], [-1, 1]]) {
      const t = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.5, 1.5, 8), turretMat);
      const off = BOARD_SIZE / 2 + 0.35;
      t.position.set(cx * off, -0.2, cz * off);
      t.castShadow = true;
      this.group.add(t);
      const r = new THREE.Mesh(new THREE.ConeGeometry(0.55, 0.7, 8), roofMat);
      r.position.set(cx * off, 0.9, cz * off);
      r.castShadow = true;
      this.group.add(r);
    }

    const tileGeo = new THREE.BoxGeometry(0.96, 0.22, 0.96);
    const matA = new THREE.MeshStandardMaterial({ color: 0x8f86a8, roughness: 0.85 });
    const matB = new THREE.MeshStandardMaterial({ color: 0x7a7194, roughness: 0.85 });
    const planeGeo = new THREE.PlaneGeometry(0.9, 0.9);
    planeGeo.rotateX(-Math.PI / 2);

    for (const k of Object.keys(HL_COLORS) as HighlightKind[]) {
      this.hlMats.set(k, new THREE.MeshBasicMaterial({ color: HL_COLORS[k], transparent: true, opacity: k === 'move' ? 0.5 : 0.45, depthWrite: false }));
    }
    this.teleMat = new THREE.MeshBasicMaterial({ color: 0xff3b5c, transparent: true, opacity: 0.5, depthWrite: false });
    this.areaMat = new THREE.MeshBasicMaterial({ color: HL_COLORS.area, transparent: true, opacity: 0.55, depthWrite: false });

    for (let y = 0; y < BOARD_SIZE; y++) {
      for (let x = 0; x < BOARD_SIZE; x++) {
        const w = tileToWorld({ x, y });
        const t = new THREE.Mesh(tileGeo, (x + y) % 2 ? matA : matB);
        t.position.set(w.x, -0.11, w.z);
        t.receiveShadow = true;
        t.userData.tile = { x, y };
        this.group.add(t);
        this.tiles.push(t);

        const hz = new THREE.Group();
        hz.position.set(w.x, 0.005, w.z);
        this.group.add(hz);
        this.hazardGroups.push(hz);
        this.hazardSig.push('');

        const mk = (yy: number, mat: THREE.Material) => {
          const m = new THREE.Mesh(planeGeo, mat);
          m.position.set(w.x, yy, w.z);
          m.visible = false;
          m.renderOrder = 2;
          this.group.add(m);
          return m;
        };
        this.teleLayer.push(mk(0.03, this.teleMat));
        this.hlLayer.push(mk(0.04, this.hlMats.get('range')!));
        this.areaLayer.push(mk(0.05, this.areaMat));
      }
    }

    // Hover marker: a chunky gold frame
    const ring = new THREE.RingGeometry(0.4, 0.5, 4, 1);
    ring.rotateX(-Math.PI / 2);
    ring.rotateY(Math.PI / 4);
    this.hover = new THREE.Mesh(ring, new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.95, depthWrite: false }));
    this.hover.scale.set(1.35, 1, 1.35);
    this.hover.visible = false;
    this.hover.renderOrder = 3;
    this.group.add(this.hover);

    sm.onTick((_dt, time) => this.animate(time));
  }

  private idx(p: Vec) { return p.y * BOARD_SIZE + p.x; }

  /** Raycast a pointer (in container pixels) against the tiles. */
  pick(px: number, py: number, extra: THREE.Object3D[] = []): { tile: Vec | null; object: THREE.Object3D | null } {
    const el = this.sm.container;
    const ndc = new THREE.Vector2((px / el.clientWidth) * 2 - 1, -(py / el.clientHeight) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.sm.camera);
    const hits = this.raycaster.intersectObjects([...extra, ...this.tiles], true);
    for (const h of hits) {
      let o: THREE.Object3D | null = h.object;
      while (o) {
        if (o.userData.tile) return { tile: o.userData.tile as Vec, object: o };
        if (o.userData.unitId !== undefined || o.userData.propId !== undefined) return { tile: null, object: o };
        o = o.parent;
      }
    }
    return { tile: null, object: null };
  }

  setHover(p: Vec | null) {
    this.hoverTile = p;
    this.hover.visible = !!p;
    if (p) {
      const w = tileToWorld(p);
      this.hover.position.set(w.x, 0.07, w.z);
    }
  }

  setHighlights(tiles: Vec[], kind: HighlightKind) {
    this.hlLayer.forEach(m => (m.visible = false));
    this.addHighlights(tiles, kind);
  }

  addHighlights(tiles: Vec[], kind: HighlightKind) {
    const mat = this.hlMats.get(kind)!;
    for (const p of tiles) {
      const m = this.hlLayer[this.idx(p)];
      if (!m) continue;
      m.material = mat;
      m.visible = true;
    }
  }

  clearHighlights() { this.hlLayer.forEach(m => (m.visible = false)); }

  setArea(tiles: Vec[]) {
    this.areaLayer.forEach(m => (m.visible = false));
    for (const p of tiles) { const m = this.areaLayer[this.idx(p)]; if (m) m.visible = true; }
  }

  setTelegraph(tiles: Vec[]) {
    this.teleLayer.forEach(m => (m.visible = false));
    for (const p of tiles) { const m = this.teleLayer[this.idx(p)]; if (m) m.visible = true; }
  }

  /** Rebuild hazard decals that changed. */
  syncHazards(hazards: Map<string, Hazard>) {
    for (let y = 0; y < BOARD_SIZE; y++) for (let x = 0; x < BOARD_SIZE; x++) {
      const i = y * BOARD_SIZE + x;
      const h = hazards.get(key({ x, y }));
      const sig = h ? h.kind : '';
      if (sig === this.hazardSig[i]) continue;
      this.hazardSig[i] = sig;
      const g = this.hazardGroups[i];
      this.animated = this.animated.filter(a => a.obj.parent !== g && a.obj !== g);
      g.clear();
      if (h) this.buildHazard(g, h.kind, x * 7 + y * 13);
    }
  }

  private buildHazard(g: THREE.Group, kind: HazardKind, seed: number) {
    const rnd = (n: number) => ((Math.sin(seed * 12.9898 + n * 78.233) * 43758.5453) % 1 + 1) % 1;
    const color = HAZARD_COLORS[kind];
    const base = new THREE.Mesh(
      new THREE.CircleGeometry(0.44, 20).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({
        color, roughness: kind === 'grease' ? 0.15 : 0.5, metalness: kind === 'grease' ? 0.3 : 0,
        transparent: true, opacity: kind === 'water' ? 0.7 : 0.9, emissive: kind === 'fire' ? 0xff3300 : 0x000000,
        emissiveIntensity: kind === 'fire' ? 1.2 : 0,
      }),
    );
    base.scale.set(1 + rnd(1) * 0.12, 1, 0.85 + rnd(2) * 0.15);
    base.receiveShadow = true;
    g.add(base);
    if (kind === 'water' || kind === 'fire') this.animated.push({ obj: base, kind, phase: rnd(3) * 6 });

    if (kind === 'fire') {
      for (let i = 0; i < 3; i++) {
        const f = new THREE.Mesh(
          new THREE.ConeGeometry(0.1 + rnd(i + 4) * 0.08, 0.35 + rnd(i + 7) * 0.25, 6),
          new THREE.MeshBasicMaterial({ color: i % 2 ? 0xffd23f : 0xff7b00 }),
        );
        f.position.set((rnd(i + 10) - 0.5) * 0.5, 0.18, (rnd(i + 13) - 0.5) * 0.5);
        g.add(f);
        this.animated.push({ obj: f, kind, phase: rnd(i) * 6 });
      }
    } else if (kind === 'banana') {
      for (let i = 0; i < 2; i++) {
        const b = new THREE.Mesh(
          new THREE.TorusGeometry(0.12, 0.04, 6, 10, Math.PI),
          new THREE.MeshStandardMaterial({ color: 0xffd400, roughness: 0.6 }),
        );
        b.rotation.x = -Math.PI / 2;
        b.rotation.z = rnd(i + 20) * Math.PI * 2;
        b.position.set((rnd(i + 21) - 0.5) * 0.45, 0.04, (rnd(i + 22) - 0.5) * 0.45);
        g.add(b);
      }
    } else if (kind === 'jelly') {
      const cols = [0xff4d6d, 0x6ee7b7, 0xfcd34d, 0x93c5fd, 0xc4b5fd];
      for (let i = 0; i < 7; i++) {
        const b = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 4), new THREE.MeshStandardMaterial({ color: cols[i % cols.length], roughness: 0.3 }));
        b.scale.set(1, 0.7, 1.5);
        b.position.set((rnd(i + 30) - 0.5) * 0.7, 0.04, (rnd(i + 40) - 0.5) * 0.7);
        b.rotation.y = rnd(i) * 3;
        g.add(b);
      }
    } else if (kind === 'shards') {
      for (let i = 0; i < 5; i++) {
        const s = new THREE.Mesh(new THREE.TetrahedronGeometry(0.07), new THREE.MeshStandardMaterial({ color: 0xe6fbff, metalness: 0.2, roughness: 0.1 }));
        s.position.set((rnd(i + 50) - 0.5) * 0.7, 0.04, (rnd(i + 60) - 0.5) * 0.7);
        s.rotation.set(rnd(i), rnd(i + 1), rnd(i + 2));
        g.add(s);
      }
    } else if (kind === 'grease') {
      const b = new THREE.Mesh(new THREE.CircleGeometry(0.12, 10).rotateX(-Math.PI / 2), base.material);
      b.position.set(0.32, 0.002, -0.25);
      g.add(b);
    }
  }

  private animate(time: number) {
    const pulse = 0.38 + Math.sin(time * 5) * 0.14;
    this.teleMat.opacity = pulse;
    this.areaMat.opacity = 0.45 + Math.sin(time * 7) * 0.12;
    this.hover.rotation.y = Math.sin(time * 2) * 0.05;
    for (const a of this.animated) {
      if (a.kind === 'fire' && a.obj instanceof THREE.Mesh && a.obj.geometry.type === 'ConeGeometry') {
        a.obj.scale.y = 0.8 + Math.sin(time * 14 + a.phase) * 0.3;
        a.obj.position.y = 0.15 + Math.sin(time * 9 + a.phase) * 0.03;
      } else if (a.kind === 'water') {
        a.obj.scale.x = 1 + Math.sin(time * 2 + a.phase) * 0.04;
      } else if (a.kind === 'fire') {
        const m = (a.obj as THREE.Mesh).material as THREE.MeshStandardMaterial;
        m.emissiveIntensity = 1 + Math.sin(time * 11 + a.phase) * 0.4;
      }
    }
  }
}
