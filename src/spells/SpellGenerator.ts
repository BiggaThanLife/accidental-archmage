// Procedural comedy spell system:
//   [Delivery Method] + [Payload Element] + [Recoil / Side Effect]
// Each generated spell knows its target range, area pattern, primary effect and
// grid displacement. Geometry (what can be targeted / what gets hit) lives here too.

import {
  DELIVERIES, PAYLOADS, SIDES, QUIPS, DeliveryDef, PayloadDef, SideDef,
} from './SpellComponents';
import {
  Dir, DIRS, Rng, Unit, Vec, dirTo, inBounds, manhattan, chebyshev, turnLeft, turnRight, vadd, vscale, veq,
} from '../game/types';
import type { GameState } from '../game/GameState';
import type { MetaBonuses } from '../meta/MetaProgression';

export interface Spell {
  uid: number;
  delivery: DeliveryDef;
  payload: PayloadDef;
  side: SideDef;
  name: string;
  /** "Sneeze + Embarrassment + Goose" */
  formula: string;
  range: number;
  minRange: number;
  pattern: string;
  damage: number;
  displacement: string;
  primaryEffect: string;
  cooldown: number;
  cooldownLeft: number;
  description: string;
  flavor: string;
}

export interface SpellPlan {
  dir: Dir;
  /** every tile the spell touches */
  area: Vec[];
  /** the main impact tile (used for cabbage / grease centres, swap target, etc.) */
  primary: Vec;
  /** units hit, in the order they should resolve (far to near for pushes) */
  hits: Unit[];
}

const SIDE_SUFFIX: Record<string, string> = {
  recoil: 'of Regret', goose: 'of Honking', banana: 'of Potassium', discofire: 'of Saturday Night',
  apologize: 'of Remorse', swap: 'of Confusion', vase: 'of Insurance Claims', sound: 'of BOING',
  honey: 'of Buzzing', pink: 'of Fashion', cart: 'of Retail', trip: 'of Clumsiness',
  confetti: 'of Celebration', again: 'of Déjà Vu', shatter: 'of Breakage',
  calendar: 'of Double-Booking', budget: 'of Austerity', desk: 'of Cubicle Defence', teambuilding: 'of Synergy',
  coffee: 'of Caffeine', blame: 'of Plausible Deniability', intern: 'of Unpaid Labour', exit: 'of Severance',
  incident: 'of Zero Days', sludge: 'of Liability',
};

const STRONG_DELIVERY = new Set(['anvil', 'coupon', 'disco', 'catapult', 'livestock', 'applause', 'replyall', 'golem', 'review', 'plant']);
const STRONG_PAYLOAD = new Set(['embarrass', 'apology', 'dread', 'cabbage', 'slime', 'jelly', 'imposter', 'burrito', 'warning', 'restructure']);

let spellUid = 1;

export interface GenOptions {
  deliveryTier: number;
  payloadTier: number;
  sideTier: number;
  /** force a particular delivery id */
  deliveryId?: string;
}

export class SpellGenerator {
  constructor(private rng: Rng, private bonuses: MetaBonuses) {}

  setBonuses(b: MetaBonuses) { this.bonuses = b; }

  /** Office Politics / Corporate Necromancy components only appear once that Academy branch is bought. */
  private allowed(c: { branch?: string }) {
    if (!c.branch) return true;
    return c.branch === 'politics' ? this.bonuses.officePolitics : this.bonuses.necromancy;
  }

  generate(opts: GenOptions): Spell {
    const dPool = DELIVERIES.filter(d => d.tier <= opts.deliveryTier && this.allowed(d));
    // Bias toward newly unlocked components so upgrades feel noticeable.
    const weighted: DeliveryDef[] = [];
    for (const d of dPool) for (let i = 0; i < 1 + d.tier; i++) weighted.push(d);
    const delivery = opts.deliveryId
      ? DELIVERIES.find(d => d.id === opts.deliveryId)!
      : this.rng.pick(weighted);
    const payload = this.rng.pick(PAYLOADS.filter(p => p.tier <= opts.payloadTier && this.allowed(p)));
    const side = this.rng.pick(SIDES.filter(s => s.tier <= opts.sideTier && this.allowed(s)));
    return this.compose(delivery, payload, side);
  }

  compose(delivery: DeliveryDef, payload: PayloadDef, side: SideDef): Spell {
    const b = this.bonuses;
    let damage = delivery.baseDamage + payload.damage;
    if (side.id === 'recoil') damage += b.recoilDamage;
    if (side.id === 'budget') damage = Math.floor(damage / 2);

    // ----- displacement summary
    const disp: string[] = [];
    switch (delivery.displace) {
      case 'push': disp.push(`Push ${delivery.displaceDist}`); break;
      case 'turn': disp.push('Turn 180°'); break;
      case 'pullToCaster': disp.push('Pull to you'); break;
      case 'inward': disp.push('Pull inward 1'); break;
      case 'pull': disp.push(`Pull ${delivery.displaceDist}`); break;
      case 'outward': disp.push(`Shove out ${delivery.displaceDist}`); break;
      default: break;
    }
    if (delivery.shape === 'dash') disp.push('You charge');
    if (payload.id === 'restructure') disp.push('Reassigned');
    if (side.id === 'teambuilding') disp.push('Enemies pulled 1');
    if (payload.id === 'soap') disp.push('Slide 3');
    if (payload.id === 'tickle') disp.push('Sidestep 1');
    if (payload.id === 'slime') disp.push('Bounce 4');
    if (side.id === 'swap') disp.push('Swap');
    if (side.id === 'recoil') {
      const r = Math.max(0, 2 - b.recoilReduce);
      disp.push(r > 0 ? `Self-launch ${r}` : 'Recoil absorbed');
    }

    // ----- primary effect line (with meta synergy applied)
    let primaryEffect = payload.blurb;
    if (payload.id === 'embarrass') primaryEffect = `stuns for ${1 + b.embarrassStun} turn${b.embarrassStun ? 's' : ''} out of second-hand cringe`;
    if (payload.id === 'apology') primaryEffect = `pacifies: target skips its next ${2 + b.apologyTurns} attacks`;
    if (payload.id === 'grease') primaryEffect = `coats the hit tile and neighbours in grease for ${4 + b.greaseTurns} turns`;
    if (payload.id === 'cabbage') primaryEffect = `3x3 cabbage blast for ${2 + b.cabbageDmg} damage, vegetables everywhere`;

    // ----- cooldown from rough power budget
    let cd = 2;
    if (STRONG_DELIVERY.has(delivery.id)) cd += 1;
    if (STRONG_PAYLOAD.has(payload.id)) cd += 1;
    if (side.severity >= 2) cd -= 1;
    if (side.severity === 0) cd += 1;
    if (delivery.shape === 'global') cd += 1; // hitting the whole floor is a lot
    cd = Math.max(1, Math.min(4, cd));
    if (side.id === 'budget') cd = 1;       // ready again on your next turn

    const name = `${payload.adj} ${delivery.noun} ${SIDE_SUFFIX[side.id] ?? ''}`.trim();
    const description =
      `${delivery.blurb} Laced with ${payload.name}, which ${primaryEffect}${delivery.electric ? ' (electric: shocks anyone standing in connected water)' : ''}. ${side.text}`;

    return {
      uid: spellUid++,
      delivery, payload, side, name,
      formula: `${delivery.name} + ${payload.name} + ${side.tag}`,
      range: delivery.range,
      minRange: delivery.minRange ?? (delivery.shape === 'selfAoe' || delivery.shape === 'global' ? 0 : 1),
      pattern: delivery.pattern,
      damage,
      displacement: disp.join(' · ') || 'None',
      primaryEffect,
      cooldown: cd,
      cooldownLeft: 0,
      description,
      flavor: this.rng.pick(QUIPS.cast),
    };
  }

  /** Starter hand: makes sure there is at least one spell that actually hurts. */
  starterHand(count: number, deliveryTier: number, starterTier: number): Spell[] {
    const hand: Spell[] = [];
    const firstDelivery = this.rng.pick(['pigeon', 'armchair', 'sneeze']);
    hand.push(this.generate({ deliveryTier, payloadTier: starterTier, sideTier: starterTier, deliveryId: firstDelivery }));
    let guard = 0;
    while (hand.length < count && guard++ < 50) {
      const s = this.generate({ deliveryTier, payloadTier: starterTier, sideTier: starterTier });
      if (hand.some(h => h.delivery.id === s.delivery.id)) continue;
      hand.push(s);
    }
    return hand;
  }
}

// ======================================================================
// Geometry: target tiles and affected area
// ======================================================================

const LINE_SHAPES = new Set(['arc', 'path', 'pierce', 'flood', 'pull', 'projectile', 'stampede', 'dash']);

/** Sticky-note chain: from the first victim, jump to the nearest unhit unit within 2 tiles, twice. */
export function chainVictims(first: Unit, caster: Unit, state: GameState, jumps = 2): Unit[] {
  const out = [first];
  let cur = first;
  for (let i = 0; i < jumps; i++) {
    const next = state.livingUnits()
      .filter(u => u !== caster && u.kind !== 'wizard' && !out.includes(u) && manhattan(u.pos, cur.pos) <= 2)
      .sort((a, b) => manhattan(a.pos, cur.pos) - manhattan(b.pos, cur.pos) || a.id - b.id)[0];
    if (!next) break;
    out.push(next);
    cur = next;
  }
  return out;
}

function straightLines(c: Vec, range: number): Vec[] {
  const out: Vec[] = [];
  for (const d of DIRS) for (let i = 1; i <= range; i++) {
    const p = vadd(c, vscale(d, i));
    if (inBounds(p)) out.push(p);
  }
  return out;
}

export function getTargetTiles(spell: Spell, caster: Unit, state: GameState): Vec[] {
  const c = caster.pos;
  const shape = spell.delivery.shape;
  if (shape === 'selfAoe' || shape === 'global') return [{ ...c }];
  if (shape === 'cone') return straightLines(c, 1);
  if (shape === 'summon' || shape === 'trap') {
    return state.allTiles().filter(p => { const d = manhattan(p, c); return d >= 1 && d <= spell.range && state.isFree(p); });
  }
  if (shape === 'overhead') {
    return state.allTiles().filter(p => chebyshev(p, c) === 1);
  }
  if (LINE_SHAPES.has(shape)) return straightLines(c, spell.range);
  return state.allTiles().filter(p => {
    const d = manhattan(p, c);
    return d >= spell.minRange && d <= spell.range;
  });
}

export function planSpell(spell: Spell, caster: Unit, target: Vec, state: GameState): SpellPlan | null {
  const valid = getTargetTiles(spell, caster, state).some(p => veq(p, target));
  if (!valid) return null;
  const c = caster.pos;
  const dir = dirTo(c, target);
  const d = DIRS[dir];
  const right = DIRS[turnRight(dir)];
  const left = DIRS[turnLeft(dir)];
  let area: Vec[] = [];
  let primary: Vec = target;

  switch (spell.delivery.shape) {
    case 'cone': {
      const a = vadd(c, d), b = vadd(c, vscale(d, 2));
      area = [a, b, vadd(b, left), vadd(b, right)];
      primary = a;
      break;
    }
    case 'homing': {
      const candidates = state.livingUnits()
        .filter(u => u !== caster && manhattan(u.pos, target) <= 1)
        .sort((u1, u2) => manhattan(u1.pos, target) - manhattan(u2.pos, target) || manhattan(u1.pos, c) - manhattan(u2.pos, c));
      primary = candidates.length ? { ...candidates[0].pos } : target;
      area = [primary];
      break;
    }
    case 'targeted': case 'overhead': case 'single': case 'lob':
      area = [target];
      break;
    case 'arc':
      area = [target, vadd(target, left), vadd(target, right)];
      break;
    case 'splash2x2':
      area = [target, vadd(target, d), vadd(target, right), vadd(vadd(target, d), right)];
      break;
    case 'area3x3':
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) area.push({ x: target.x + dx, y: target.y + dy });
      break;
    case 'fireTarget':
      area = [target, ...DIRS.map(o => vadd(target, o))];
      break;
    case 'selfAoe':
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
        if (dx || dy) area.push({ x: c.x + dx, y: c.y + dy });
      }
      primary = { ...c };
      break;
    case 'path': case 'pierce': case 'flood': case 'stampede':
      for (let i = 1; i <= spell.range; i++) area.push(vadd(c, vscale(d, i)));
      primary = vadd(c, d);
      break;
    case 'projectile': case 'pull': {
      for (let i = 1; i <= spell.range; i++) {
        const p = vadd(c, vscale(d, i));
        if (!inBounds(p)) break;
        area.push(p);
        primary = p;
        if (state.unitAt(p) || state.propAt(p)) break;
      }
      break;
    }
    case 'dash': {
      // ride toward the chosen tile; stop at (and ram) the first unit or prop in the way
      const steps = manhattan(c, target);
      for (let i = 1; i <= steps; i++) {
        const p = vadd(c, vscale(d, i));
        if (!inBounds(p)) break;
        area.push(p);
        primary = p;
        if (state.unitAt(p) || state.propAt(p)) break;
      }
      break;
    }
    case 'global': {
      area = state.enemies().map(u => ({ ...u.pos }));
      primary = { ...c };
      break;
    }
    case 'chain': {
      const first = state.unitAt(target);
      area = first && first !== caster ? chainVictims(first, caster, state).map(u => ({ ...u.pos })) : [target];
      break;
    }
    case 'summon': case 'trap':
      area = [target, ...DIRS.map(o => vadd(target, o))];
      break;
  }

  area = area.filter(inBounds);
  let hits = area
    .map(p => state.unitAt(p))
    .filter((u): u is Unit => !!u && u !== caster);
  // a dash only rams the thing at the end of the ride; a summon or trap only affects what is next to it
  if (spell.delivery.shape === 'dash') hits = hits.filter(u => veq(u.pos, primary));
  if (spell.delivery.shape === 'summon' || spell.delivery.shape === 'trap') hits = hits.filter(u => !veq(u.pos, target));
  if (spell.delivery.shape === 'trap') hits = []; // the plant waits for someone to walk by
  // Resolve far-to-near so pushes in a line don't collide with each other.
  hits.sort((a, b) => manhattan(b.pos, c) - manhattan(a.pos, c));
  // Caster can't be hit by own spell except via side effects.
  return { dir, area, primary, hits };
}
