// Shared game types. Grid coordinates: x = column (0..7), y = row (0..7).

export interface Vec { x: number; y: number }

/** 0 = North (y-1), 1 = East (x+1), 2 = South (y+1), 3 = West (x-1) */
export type Dir = 0 | 1 | 2 | 3;
export const DIRS: readonly Vec[] = [
  { x: 0, y: -1 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
];

export const BOARD_SIZE = 8;

export type HazardKind = 'grease' | 'water' | 'fire' | 'banana' | 'jelly' | 'shards' | 'mould' | 'sludge';
export interface Hazard {
  kind: HazardKind;
  /** turns remaining, -1 = permanent until something removes it */
  turns: number;
}

export type UnitKind = 'wizard' | 'guard' | 'clerk' | 'brute' | 'goose' | 'golem' | 'intern';
export type Team = 'player' | 'enemy' | 'neutral';
export type AttackPattern = 'melee' | 'line' | 'sweep' | 'peck';

export interface Status {
  stun: number;        // skips the whole enemy phase
  pacified: number;    // won't attack
  enraged: number;     // +2 atk, takes +1 damage
  vulnerable: number;  // takes +1 damage (wizard apology)
  dot: number;         // burning feet: 1 damage per env phase
  blind: number;       // next attack misses
  slow: number;        // half movement
  rooted: number;      // cannot move (existential dread / tap dancing / anvil)
  interrupted: number; // attack wind-up cancelled
  rust: number;        // permanent: +1 damage taken per stack
  alerted: number;     // +1 move
  aggro: number;       // +1 atk (neon pink robes)
  bees: number;        // wizard only: bees sting at env phase
  weak: number;        // crippling self-doubt: deals 2 less damage
  frozen: number;      // frozen burrito: can't act; the next hit shatters for +2
  charmed: number;     // imposter syndrome: other enemies attack it instead of you
  doom: number;        // final written warning: takes 4 damage when this runs out
  marked: number;      // death by committee: explodes (3x3, 2 dmg) if it dies while marked
  pinned: number;      // stapled: can't move or be pushed
}

export const emptyStatus = (): Status => ({
  stun: 0, pacified: 0, enraged: 0, vulnerable: 0, dot: 0, blind: 0, slow: 0,
  rooted: 0, interrupted: 0, rust: 0, alerted: 0, aggro: 0, bees: 0,
  weak: 0, frozen: 0, charmed: 0, doom: 0, marked: 0, pinned: 0,
});

export interface Unit {
  id: number;
  kind: UnitKind;
  team: Team;
  name: string;
  pos: Vec;
  hp: number;
  maxHp: number;
  atk: number;
  def: number;
  move: number;
  facing: Dir;
  attack: AttackPattern;
  status: Status;
  alive: boolean;
}

export type PropKind = 'obstacle' | 'pillar' | 'crate' | 'vase' | 'armchair' | 'cart' | 'confetti' | 'plant' | 'bin' | 'desk';
export interface Prop {
  id: number;
  kind: PropKind;
  pos: Vec;
  /** confetti bombs: turns until boom */
  fuse?: number;
  /** unwatered office plant: the spell it goes off with */
  spell?: import('../spells/SpellGenerator').Spell;
}

/** A lingering spell zone (e.g. Floating Disco Ball) that re-applies a payload each environment phase. */
export interface Zone {
  id: number;
  tiles: Vec[];
  turns: number;
  spellId: number;
  center: Vec;
  spell?: import('../spells/SpellGenerator').Spell;
}

export const vadd = (a: Vec, b: Vec): Vec => ({ x: a.x + b.x, y: a.y + b.y });
export const vscale = (a: Vec, s: number): Vec => ({ x: a.x * s, y: a.y * s });
export const veq = (a: Vec, b: Vec) => a.x === b.x && a.y === b.y;
export const manhattan = (a: Vec, b: Vec) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
export const chebyshev = (a: Vec, b: Vec) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
export const inBounds = (p: Vec) => p.x >= 0 && p.y >= 0 && p.x < BOARD_SIZE && p.y < BOARD_SIZE;
export const key = (p: Vec) => `${p.x},${p.y}`;
export const opposite = (d: Dir): Dir => ((d + 2) % 4) as Dir;
export const turnRight = (d: Dir): Dir => ((d + 1) % 4) as Dir;
export const turnLeft = (d: Dir): Dir => ((d + 3) % 4) as Dir;

/** Dominant-axis direction from a to b (ties broken toward x axis). */
export function dirTo(a: Vec, b: Vec): Dir {
  const dx = b.x - a.x, dy = b.y - a.y;
  if (dx === 0 && dy === 0) return 2;
  if (Math.abs(dx) >= Math.abs(dy)) return dx > 0 ? 1 : 3;
  return dy > 0 ? 2 : 0;
}

/** Seeded RNG (mulberry32) so floors/spells are reproducible per seed. */
export class Rng {
  private s: number;
  constructor(seed: number) { this.s = seed >>> 0 || 1; }
  next(): number {
    let t = (this.s += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  int(min: number, maxIncl: number) { return min + Math.floor(this.next() * (maxIncl - min + 1)); }
  pick<T>(arr: readonly T[]): T { return arr[Math.floor(this.next() * arr.length)]; }
  chance(p: number) { return this.next() < p; }
  shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
}
