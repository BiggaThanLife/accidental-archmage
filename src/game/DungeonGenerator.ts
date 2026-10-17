// Procedural tower floor generator: obstacles, hazards (grease, water, crates, vases) and enemies.

import { GameState } from './GameState';
import { BOARD_SIZE, Rng, Vec, key, inBounds, UnitKind, Dir } from './types';

export interface FloorInfo {
  title: string;
  flavor: string;
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

/** Pick enemy composition based on floor depth. */
function enemyRoster(floor: number, rng: Rng): UnitKind[] {
  const count = Math.min(6, 2 + Math.floor((floor + 1) / 2));
  const roster: UnitKind[] = [];
  for (let i = 0; i < count; i++) {
    const r = rng.next();
    if (floor >= 3 && r < 0.2 + floor * 0.02) roster.push('brute');
    else if (floor >= 2 && r < 0.55) roster.push('clerk');
    else roster.push('guard');
  }
  return roster;
}

export class DungeonGenerator {
  constructor(private rng: Rng) {}

  generate(state: GameState, floor: number): FloorInfo {
    for (let attempt = 0; attempt < 30; attempt++) {
      if (this.tryGenerate(state, floor)) break;
    }
    const [title, flavor] = ROOM_NAMES[(floor - 1 + this.rng.int(0, 2)) % ROOM_NAMES.length];
    return { title, flavor };
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
    const hpBonus = Math.floor((floor - 1) / 3);
    for (const kind of enemyRoster(floor, rng)) {
      const p = randomTile(0, 3);
      if (!p) continue;
      state.makeUnit(kind, p, 2 as Dir, hpBonus);
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
