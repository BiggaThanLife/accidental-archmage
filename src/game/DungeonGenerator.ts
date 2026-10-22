// Procedural tower floor generator: obstacles, hazards (grease, water, crates, vases) and enemies.

import { GameState } from './GameState';
import { BOARD_SIZE, Rng, Vec, key, inBounds, UnitKind, Dir } from './types';

export interface FloorInfo {
  title: string;
  flavor: string;
  /** 1..5 */
  threat: number;
}

const ROOM_NAMES = [
  ['Faculty Lounge', 'Someone microwaved fish in here. The air is a hazard.'],
  ['Department of Slippery Floors', 'Mopped daily. Dried never.'],
  ['The Cabbage Archive', 'Every cabbage is catalogued. Several are armed.'],
  ['Hall of Overpriced Pottery', 'You break it, you bought it. You will break it.'],
  ['Flooded Seminar Room', 'Attendance is mandatory. Swimming is optional.'],
  ['Office of Petty Grievances', 'Forms must be filed in triplicate, then on fire.'],
  ['Ballroom of Mild Peril', 'The disco ball is load-bearing.'],
  ['Records & Regrets', 'Your permanent record is kept here. It is long.'],
];

/**
 * Pick enemy composition based on floor depth.
 * Ramp (v2): headcount 2,3,3,4,4,5,5,6 (was 3,3,4,4,5,5,6) so floor 1 is a real tutorial and the cap is hit a floor later.
 * New enemy types are introduced one at a time (at most one clerk on floor 2, one brute on floor 3) instead of
 * floor 2 being ~55% crossbow clerks.
 */
function enemyRoster(floor: number, rng: Rng): UnitKind[] {
  const count = Math.min(6, 2 + Math.floor(floor * 0.55));
  const clerkP = floor < 2 ? 0 : Math.min(0.4, 0.2 + (floor - 2) * 0.05);
  const bruteP = floor < 3 ? 0 : Math.min(0.35, 0.12 + (floor - 3) * 0.04);
  const roster: UnitKind[] = [];
  let clerks = 0, brutes = 0;
  for (let i = 0; i < count; i++) {
    const r = rng.next();
    if (r < bruteP && (floor > 3 || brutes < 1)) { roster.push('brute'); brutes++; }
    else if (r < bruteP + clerkP && (floor > 2 || clerks < 1)) { roster.push('clerk'); clerks++; }
    else roster.push('guard');
  }
  return roster;
}

/** Rough "how much trouble is this room" number: sum of enemy damage x toughness. */
export function floorThreat(state: GameState): number {
  return state.enemies().reduce((t, e) => t + e.atk * (e.hp + e.def), 0);
}

/** 1 (light) .. 5 (lethal). */
export function threatLevel(threat: number): number {
  return threat < 22 ? 1 : threat < 42 ? 2 : threat < 68 ? 3 : threat < 100 ? 4 : 5;
}

export class DungeonGenerator {
  constructor(private rng: Rng) {}

  generate(state: GameState, floor: number): FloorInfo {
    for (let attempt = 0; attempt < 30; attempt++) {
      if (this.tryGenerate(state, floor)) break;
    }
    const [title, flavor] = ROOM_NAMES[(floor - 1 + this.rng.int(0, 2)) % ROOM_NAMES.length];
    return { title, flavor, threat: threatLevel(floorThreat(state)) };
  }

  private tryGenerate(state: GameState, floor: number): boolean {
    const wizard = state.wizard;
    state.units = [wizard];
    state.props = [];
    state.hazards.clear();
    state.zones = [];
    const rng = this.rng;

    wizard.pos = { x: rng.int(2, 5), y: BOARD_SIZE - 1 };
    wizard.facing = 0;
    const reserved = new Set<string>([key(wizard.pos)]);
    // keep the wizard's immediate surroundings free so the first turn is playable
    for (const d of [[0, -1], [1, 0], [-1, 0], [1, -1], [-1, -1]]) reserved.add(key({ x: wizard.pos.x + d[0], y: wizard.pos.y + d[1] }));

    const free = (p: Vec) => inBounds(p) && !reserved.has(key(p)) && !state.unitAt(p) && !state.propAt(p);
    const randomTile = (yMin = 0, yMax = BOARD_SIZE - 1): Vec | null => {
      for (let i = 0; i < 60; i++) {
        const p = { x: rng.int(0, BOARD_SIZE - 1), y: rng.int(yMin, yMax) };
        if (free(p) && !state.hazardAt(p)) return p;
      }
      return null;
    };

    // Solid obstacles (rubble / pillars)
    const obstacles = rng.int(2, 4);
    for (let i = 0; i < obstacles; i++) {
      const p = randomTile(1, BOARD_SIZE - 3);
      if (p) state.makeProp(rng.chance(0.5) ? 'pillar' : 'obstacle', p);
    }

    // Water pool: a small blob
    const pools = rng.int(1, 2);
    for (let i = 0; i < pools; i++) {
      const c = randomTile(1, BOARD_SIZE - 3);
      if (!c) continue;
      const size = rng.int(2, 4);
      const blob = [c];
      for (let j = 0; j < size; j++) {
        const b = blob[rng.int(0, blob.length - 1)];
        const d = rng.pick([[1, 0], [-1, 0], [0, 1], [0, -1]]);
        const n = { x: b.x + d[0], y: b.y + d[1] };
        if (free(n)) blob.push(n);
      }
      blob.forEach(p => state.setHazard(p, 'water'));
    }

    // Grease puddles
    const grease = rng.int(2, 4);
    for (let i = 0; i < grease; i++) {
      const p = randomTile();
      if (p) state.setHazard(p, 'grease', -1);
    }

    // Explosive cabbage crates
    const crates = rng.int(1, 2 + Math.min(2, Math.floor(floor / 2)));
    for (let i = 0; i < crates; i++) {
      const p = randomTile(0, BOARD_SIZE - 3);
      if (p) state.makeProp('crate', p);
    }

    // Fragile vases
    const vases = rng.int(1, 3);
    for (let i = 0; i < vases; i++) {
      const p = randomTile();
      if (p) state.makeProp('vase', p);
    }

    // Enemies in the top half
    // +1 HP per 3 floors, phased in per enemy (1/3, 2/3, then all) instead of every enemy jumping at floors 4 and 7
    const hpBase = Math.floor((floor - 1) / 3);
    const hpFrac = ((floor - 1) % 3) / 3;
    for (const kind of enemyRoster(floor, rng)) {
      const p = randomTile(0, 3);
      if (!p) continue;
      state.makeUnit(kind, p, 2 as Dir, hpBase + (rng.chance(hpFrac) ? 1 : 0));
    }

    // Validate: wizard can reach next to every enemy
    return this.reachableCheck(state);
  }

  private reachableCheck(state: GameState): boolean {
    const start = state.wizard.pos;
    const seen = new Set<string>([key(start)]);
    const q: Vec[] = [start];
    while (q.length) {
      const c = q.shift()!;
      for (const d of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const n = { x: c.x + d[0], y: c.y + d[1] };
        if (!inBounds(n) || seen.has(key(n))) continue;
        const o = state.propAt(n);
        if (o) continue;
        seen.add(key(n));
        if (!state.unitAt(n)) q.push(n);
      }
    }
    return state.enemies().length > 0 && state.enemies().every(e => seen.has(key(e.pos)));
  }
}
