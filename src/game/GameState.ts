import {
  BOARD_SIZE, Hazard, HazardKind, Prop, PropKind, Unit, Vec, Zone, inBounds, key, emptyStatus,
  UnitKind, Dir,
} from './types';

let nextId = 1;
export const newId = () => nextId++;

export const BLOCKING_PROPS: PropKind[] = ['obstacle', 'pillar', 'crate', 'vase', 'armchair', 'cart', 'confetti'];

export interface UnitTemplate {
  name: string; hp: number; atk: number; def: number; move: number;
  attack: Unit['attack']; team: Unit['team'];
}

export const UNIT_TEMPLATES: Record<UnitKind, UnitTemplate> = {
  wizard: { name: 'You (the Archmage, allegedly)', hp: 12, atk: 0, def: 0, move: 3, attack: 'melee', team: 'player' },
  guard: { name: 'Tower Guard', hp: 4, atk: 2, def: 0, move: 2, attack: 'melee', team: 'enemy' },
  clerk: { name: 'Crossbow Clerk', hp: 3, atk: 2, def: 0, move: 2, attack: 'line', team: 'enemy' },
  brute: { name: 'Bureaucrat Brute', hp: 6, atk: 3, def: 1, move: 1, attack: 'sweep', team: 'enemy' },
  goose: { name: 'Confused Goose', hp: 3, atk: 1, def: 0, move: 2, attack: 'peck', team: 'neutral' },
};

export class GameState {
  units: Unit[] = [];
  props: Prop[] = [];
  hazards = new Map<string, Hazard>();
  zones: Zone[] = [];
  floor = 1;
  turn = 1;

  get wizard(): Unit {
    return this.units.find(u => u.kind === 'wizard')!;
  }

  livingUnits() { return this.units.filter(u => u.alive); }
  enemies() { return this.units.filter(u => u.alive && u.team === 'enemy'); }

  makeUnit(kind: UnitKind, pos: Vec, facing: Dir = 2, hpBonus = 0): Unit {
    const t = UNIT_TEMPLATES[kind];
    const u: Unit = {
      id: newId(), kind, team: t.team, name: t.name, pos: { ...pos },
      hp: t.hp + hpBonus, maxHp: t.hp + hpBonus, atk: t.atk, def: t.def, move: t.move,
      facing, attack: t.attack, status: emptyStatus(), alive: true,
    };
    this.units.push(u);
    return u;
  }

  makeProp(kind: PropKind, pos: Vec, fuse?: number): Prop {
    const p: Prop = { id: newId(), kind, pos: { ...pos }, fuse };
    this.props.push(p);
    return p;
  }

  removeProp(p: Prop) { this.props = this.props.filter(x => x !== p); }

  unitAt(p: Vec): Unit | undefined {
    return this.units.find(u => u.alive && u.pos.x === p.x && u.pos.y === p.y);
  }

  propAt(p: Vec): Prop | undefined {
    return this.props.find(o => o.pos.x === p.x && o.pos.y === p.y);
  }

  hazardAt(p: Vec): Hazard | undefined { return this.hazards.get(key(p)); }

  setHazard(p: Vec, kind: HazardKind | null, turns = -1) {
    if (!inBounds(p)) return;
    if (kind === null) this.hazards.delete(key(p));
    else this.hazards.set(key(p), { kind, turns });
  }

  /** True if a unit cannot enter this tile. */
  isBlocked(p: Vec, ignore?: Unit): boolean {
    if (!inBounds(p)) return true;
    const u = this.unitAt(p);
    if (u && u !== ignore) return true;
    const o = this.propAt(p);
    return !!o && BLOCKING_PROPS.includes(o.kind);
  }

  isFree(p: Vec) { return inBounds(p) && !this.unitAt(p) && !this.propAt(p); }

  allTiles(): Vec[] {
    const out: Vec[] = [];
    for (let y = 0; y < BOARD_SIZE; y++) for (let x = 0; x < BOARD_SIZE; x++) out.push({ x, y });
    return out;
  }

  /** Flood-fill connected water tiles starting at p. */
  waterRegion(p: Vec): Vec[] {
    const start = this.hazardAt(p);
    if (!start || start.kind !== 'water') return [];
    const seen = new Set<string>([key(p)]);
    const out: Vec[] = [p];
    const q = [p];
    while (q.length) {
      const c = q.shift()!;
      for (const d of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const n = { x: c.x + d[0], y: c.y + d[1] };
        const k = key(n);
        if (seen.has(k) || !inBounds(n)) continue;
        if (this.hazardAt(n)?.kind === 'water') { seen.add(k); out.push(n); q.push(n); }
      }
    }
    return out;
  }
}
