// Summoned familiars: a random magical creature with a random, unhelpful flaw.
// The familiar fights on your side during its own phase (just before the enemies move),
// and its flaw gets involved. Flaws are allowed to hurt, and even kill, the Archmage.

import { GameState } from './GameState';
import type { Rules } from './SpellResolver';
import type { TurnManager } from './TurnManager';
import { DIRS, Dir, Rng, Unit, Vec, chebyshev, dirTo, inBounds, manhattan, turnLeft, turnRight, vadd, veq } from './types';
import { EntityView, makeDeliveryMesh } from '../core/EntityView';
import { Effects } from '../core/Effects';
import { SceneManager } from '../core/SceneManager';
import { tileToWorld } from '../core/GridBoard';

export type CreatureId = 'owl' | 'imp' | 'mop' | 'dragon' | 'mimic' | 'wisp' | 'gargoyle' | 'slime';
export interface CreatureDef { id: CreatureId; name: string; hp: number; def: number; move: number; blurb: string }

export const CREATURES: CreatureDef[] = [
  { id: 'owl', name: 'Owl Familiar', hp: 4, def: 0, move: 3, blurb: 'Flies over hazards and pecks for 1.' },
  { id: 'imp', name: 'Pocket Imp', hp: 4, def: 0, move: 2, blurb: 'Throws a fireball up to 3 tiles: 1 damage, and the tile catches fire.' },
  { id: 'mop', name: 'Animated Mop', hp: 5, def: 0, move: 2, blurb: 'Shoves an enemy 1 tile for 1 damage, and mops up grease, water, mould and sludge around it.' },
  { id: 'dragon', name: 'Baby Dragon', hp: 6, def: 0, move: 2, blurb: 'Breathes a 2-tile cone of fire every other turn.' },
  { id: 'mimic', name: 'Mimic', hp: 6, def: 1, move: 1, blurb: 'Looks exactly like a crate. Bites for 2.' },
  { id: 'wisp', name: "Will-o'-the-Wisp", hp: 3, def: 0, move: 0, blurb: 'Teleports next to an enemy, singes it for 1 and blinds it.' },
  { id: 'gargoyle', name: 'Gargoyle', hp: 8, def: 1, move: 0, blurb: 'Never moves. Tough. Smacks everything next to it for 2.' },
  { id: 'slime', name: 'Slime Familiar', hp: 6, def: 1, move: 2, blurb: 'Leaves sticky jelly behind it and shrugs off some damage. Hits for 1.' },
];

export type FlawId = 'blind' | 'forgetful' | 'disfigured' | 'cowardly' | 'narcoleptic' | 'affectionate' | 'pyromaniac'
  | 'kleptomaniac' | 'unionised' | 'pacifist' | 'gassy' | 'overconfident' | 'allergic' | 'existential';
export interface FlawDef { id: FlawId; adj: string; blurb: string }

export const FLAWS: FlawDef[] = [
  { id: 'blind', adj: 'Blind', blurb: 'It is blind, so it attacks a random tile next to it. That might be you.' },
  { id: 'forgetful', adj: 'Forgetful', blurb: 'One turn in three it forgets what it was doing and wanders off.' },
  { id: 'disfigured', adj: 'Disfigured', blurb: 'It is so hideous that anything next to it freezes in horror, including you.' },
  { id: 'cowardly', adj: 'Cowardly', blurb: 'Below half health it runs away from everything.' },
  { id: 'narcoleptic', adj: 'Narcoleptic', blurb: 'It falls asleep at random.' },
  { id: 'affectionate', adj: 'Overly Affectionate', blurb: 'It sticks next to you and hugs you: you cannot be pushed, but you cannot move either.' },
  { id: 'pyromaniac', adj: 'Pyromaniac', blurb: 'Every tile it walks over catches fire.' },
  { id: 'kleptomaniac', adj: 'Kleptomaniac', blurb: 'It steals vases (+1 residue each) instead of fighting whenever one is nearby.' },
  { id: 'unionised', adj: 'Unionised', blurb: 'It works 3 turns, then takes a mandatory break.' },
  { id: 'pacifist', adj: 'Pacifist', blurb: 'It refuses to fight. It apologises to enemies instead, which pacifies them.' },
  { id: 'gassy', adj: 'Gassy', blurb: 'Every turn it shoves everything next to it 1 tile. You included.' },
  { id: 'overconfident', adj: 'Overconfident', blurb: 'It always goes for the biggest enemy, straight through any hazard.' },
  { id: 'allergic', adj: 'Magic-Allergic', blurb: 'It takes 1 damage whenever you cast a spell near it.' },
  { id: 'existential', adj: 'Existentially Troubled', blurb: 'Sometimes it just stands there, contemplating the void.' },
];

export const creatureDef = (id: string) => CREATURES.find(c => c.id === id) ?? CREATURES[0];
export const flawDef = (id: string) => FLAWS.find(f => f.id === id) ?? FLAWS[0];

const MELEE_DAMAGE: Partial<Record<CreatureId, number>> = { owl: 1, mop: 1, mimic: 2, gargoyle: 2, slime: 1, wisp: 1 };

export interface CompanionHooks {
  log(msg: string, cls?: string): void;
  refresh(): void;
}

export class Companions {
  constructor(
    private state: GameState,
    private rules: Rules,
    private turns: TurnManager,
    private view: EntityView,
    private fx: Effects,
    private sm: SceneManager,
    private rng: Rng,
    private hooks: CompanionHooks,
  ) {}

  living(): Unit[] { return this.state.units.filter(u => u.alive && u.kind === 'familiar' && !!u.familiar); }

  private say(f: Unit, text: string, cls = 'status') { this.fx.floatText(tileToWorld(f.pos, 1.5), text, cls); }

  // ------------------------------------------------------------ the familiar's turn
  async takeTurn(f: Unit) {
    const info = f.familiar!;
    if (!f.alive) return;
    const st = this.state, w = st.wizard;
    info.turns += 1;
    if (f.status.stun > 0 || f.status.frozen > 0) { this.say(f, '…'); return; }

    // flaws that waste the turn
    if (info.flaw === 'narcoleptic') {
      if (info.asleep > 0) { info.asleep -= 1; this.say(f, '💤 zzz'); return; }
      if (this.rng.chance(0.25)) {
        info.asleep = 1;
        this.say(f, '💤 *dozes off*');
        this.hooks.log(`${f.name} falls asleep in the middle of the fight.`, 'info');
        return;
      }
    }
    if (info.flaw === 'unionised' && info.turns % 4 === 0) {
      this.say(f, '☕ mandatory break');
      this.hooks.log(`${f.name} takes its contractually mandated break. Fighting resumes next turn.`, 'info');
      return;
    }
    if (info.flaw === 'existential' && this.rng.chance(0.25)) {
      this.say(f, '🌌 why are we here?');
      this.hooks.log(`${f.name} stares into the void. The void files a complaint.`, 'info');
      return;
    }
    if (info.flaw === 'forgetful' && this.rng.chance(1 / 3)) {
      this.say(f, '❓ wait, what was I doing?');
      await this.wander(f);
      return;
    }
    const enemies = st.enemies();
    if (info.flaw === 'cowardly' && f.hp * 2 <= f.maxHp && enemies.length) {
      this.say(f, '😱 NOPE');
      this.hooks.log(`${f.name} remembers it has somewhere else to be.`, 'info');
      await this.flee(f);
      return;
    }
    if (info.flaw === 'kleptomaniac') {
      const vase = st.props.filter(p => p.kind === 'vase' && manhattan(p.pos, f.pos) <= 5)
        .sort((a, b) => manhattan(a.pos, f.pos) - manhattan(b.pos, f.pos))[0];
      if (vase) { await this.stealVase(f, vase.pos); return; }
    }
    if (info.flaw === 'affectionate') {
      await this.moveNextTo(f, w.pos);
      if (w.alive && manhattan(f.pos, w.pos) === 1 && this.rng.chance(0.5)) {
        w.status.rooted = Math.max(w.status.rooted, 2);
        w.status.pinned = Math.max(w.status.pinned, 2);
        f.facing = dirTo(f.pos, w.pos); await this.view.face(f);
        this.say(f, '🤗 HUG');
        this.hooks.log(`${f.name} hugs you tightly. You cannot move this turn, but nothing can push you either.`, 'bad');
        return;
      }
    }

    if (enemies.length) {
      const target = info.flaw === 'overconfident'
        ? [...enemies].sort((a, b) => b.maxHp - a.maxHp || manhattan(a.pos, f.pos) - manhattan(b.pos, f.pos))[0]
        : [...enemies].sort((a, b) => manhattan(a.pos, f.pos) - manhattan(b.pos, f.pos))[0];
      // an affectionate familiar will not leave your side: it only fights what comes to it
      await this.act(f, target, info.flaw === 'affectionate');
    }
    if (!f.alive) return;
    if (info.flaw === 'gassy') await this.gas(f);
    if (info.flaw === 'disfigured') this.horror(f);
    if (info.creature === 'mop') this.mopUp(f);
  }

  /** Allergic familiars react when you cast near them. */
  async afterPlayerCast() {
    const w = this.state.wizard;
    for (const f of this.living()) {
      if (f.familiar!.flaw !== 'allergic' || chebyshev(f.pos, w.pos) > 2) continue;
      this.say(f, '🤧 ACHOO', 'shout');
      this.hooks.log(`${f.name} is allergic to your magic.`, 'info');
      await this.rules.damage(f, 1 + f.def, 'Magic allergy'); // armour does not help with allergies
    }
  }

  // ------------------------------------------------------------ moving
  private async act(f: Unit, target: Unit, stay = false) {
    const info = f.familiar!;
    const c = info.creature as CreatureId;
    const ranged = c === 'imp' ? 3 : c === 'dragon' ? 2 : 1;

    // move into reach
    if (stay) {
      if (manhattan(f.pos, target.pos) > ranged) return;
    } else if (c === 'wisp') {
      const spots = DIRS.map(d => vadd(target.pos, d)).filter(p => this.state.isFree(p));
      const spot = spots.sort((a, b) => manhattan(a, f.pos) - manhattan(b, f.pos))[0];
      if (spot && !veq(spot, f.pos) && manhattan(f.pos, target.pos) > 1) await this.blink(f, spot);
    } else if (f.move > 0 && manhattan(f.pos, target.pos) > ranged) {
      await this.approach(f, target.pos, ranged);
    }
    if (!f.alive || !target.alive) return;

    if (info.flaw === 'pacifist') {
      if (manhattan(f.pos, target.pos) <= ranged) {
        f.facing = dirTo(f.pos, target.pos); await this.view.face(f);
        target.status.pacified = Math.max(target.status.pacified, 2);
        this.say(f, '🕊️ "so sorry!"');
        this.fx.floatText(tileToWorld(target.pos, 1.6), '🕊️ "oh, no worries"', 'status');
        this.hooks.log(`${f.name} apologises to ${target.name} instead of fighting. It works, somehow.`, 'good');
      }
      return;
    }

    if (c === 'imp') {
      if (manhattan(f.pos, target.pos) > 3 && info.flaw !== 'blind') return;
      const tile = info.flaw === 'blind' ? this.randomTileNear(f.pos, 3) : target.pos;
      if (!tile) return;
      f.facing = dirTo(f.pos, tile); await this.view.face(f);
      const ball = makeDeliveryMesh('fireball', 0xff7b00);
      await this.fx.projectile(ball, tileToWorld(f.pos, 0.7), tileToWorld(tile, 0.4), 1.2, 320, true);
      if (info.flaw === 'blind') this.say(f, '🔥 "got it?"');
      await this.rules.ignite(tile);
      return;
    }
    if (c === 'dragon') {
      if (info.breath > 0) { info.breath -= 1; this.say(f, '😤 catching breath'); return; }
      const dir: Dir = info.flaw === 'blind' ? (this.rng.int(0, 3) as Dir) : dirTo(f.pos, target.pos);
      f.facing = dir; await this.view.face(f);
      const d = DIRS[dir], a = vadd(f.pos, d), b = vadd(a, d);
      const cone = [a, b, vadd(b, DIRS[turnLeft(dir)]), vadd(b, DIRS[turnRight(dir)])].filter(inBounds);
      this.say(f, '🔥 RAWR', 'shout');
      this.fx.burst(tileToWorld(a, 0.5), [0xff7b00, 0xffd23f, 0xff3d00], { count: 18, speed: 3, up: 1 });
      for (const t of cone) await this.rules.ignite(t);
      info.breath = 1;
      return;
    }

    // melee creatures
    const dmg = MELEE_DAMAGE[c] ?? 1;
    let tiles: Vec[];
    if (info.flaw === 'blind') tiles = [this.rng.pick(DIRS.map(d => vadd(f.pos, d)).filter(inBounds))];
    else if (c === 'gargoyle') tiles = DIRS.map(d => vadd(f.pos, d)).filter(p => inBounds(p) && this.state.unitAt(p)?.team === 'enemy');
    else tiles = manhattan(f.pos, target.pos) === 1 ? [target.pos] : [];
    if (info.flaw === 'blind' && tiles.length) this.say(f, '👀 "is that you?"');
    for (const t of tiles) {
      if (!f.alive) return;
      f.facing = dirTo(f.pos, t); await this.view.face(f);
      await this.lunge(f);
      const victim = this.state.unitAt(t);
      if (victim && victim !== f) {
        if (victim.kind === 'wizard') this.hooks.log(`${f.name} attacks you by mistake.`, 'bad');
        await this.rules.damage(victim, dmg, f.name);
        if (victim.alive && c === 'wisp') { victim.status.blind = 1; this.fx.floatText(tileToWorld(victim.pos, 1.6), '✨ dazzled', 'status'); }
        if (victim.alive && c === 'mop') await this.rules.push(victim, dirTo(f.pos, victim.pos), 1);
      } else {
        const pr = this.state.propAt(t);
        if (pr) await this.rules.hitProp(pr, dmg, f.name);
        else this.fx.floatText(tileToWorld(t, 1), 'whiff', 'info');
      }
    }
  }

  /** Walk toward a spot from which `goal` is within `reach` tiles. */
  private async approach(f: Unit, goal: Vec, reach: number) {
    const info = f.familiar!;
    const careless = info.flaw === 'overconfident' || info.creature === 'owl';
    const paths = [...this.turns.reachable(f, !careless).values()];
    if (!paths.length) return;
    paths.sort((a, b) => {
      const da = manhattan(a[a.length - 1], goal), db = manhattan(b[b.length - 1], goal);
      const ra = da <= reach ? 0 : da, rb = db <= reach ? 0 : db;
      return ra - rb || a.length - b.length;
    });
    const best = paths[0];
    const endDist = manhattan(best[best.length - 1], goal);
    if (endDist >= manhattan(f.pos, goal)) return;
    await this.travel(f, best);
  }

  private async moveNextTo(f: Unit, goal: Vec) {
    if (manhattan(f.pos, goal) === 1) return;
    const paths = [...this.turns.reachable(f, true).values()].filter(p => manhattan(p[p.length - 1], goal) === 1);
    if (!paths.length) { await this.approach(f, goal, 1); return; }
    paths.sort((a, b) => a.length - b.length);
    await this.travel(f, paths[0]);
  }

  private async travel(f: Unit, path: Vec[]) {
    const info = f.familiar!;
    const left: Vec[] = [{ ...f.pos }, ...path.slice(0, -1)];
    if (info.creature === 'owl') {
      const dest = path[path.length - 1];
      f.facing = dirTo(f.pos, dest); await this.view.face(f);
      f.pos = { ...dest };
      await this.view.moveUnit(f, dest, 'fly', 360);
    } else {
      await this.rules.walk(f, path);
    }
    if (info.creature === 'slime') for (const t of left) if (!this.state.hazardAt(t)) this.state.setHazard(t, 'jelly', 3);
    if (info.flaw === 'pyromaniac') {
      this.say(f, '🔥 hehehe');
      for (const t of left) if (!veq(t, f.pos)) await this.rules.ignite(t);
    }
    this.view.sync(this.state);
    this.hooks.refresh();
  }

  private async blink(f: Unit, to: Vec) {
    this.fx.burst(tileToWorld(f.pos, 0.6), [0x9ff3ff, 0xffffff], { count: 12, speed: 2 });
    f.pos = { ...to };
    await this.view.moveUnit(f, to, 'fly', 220);
    this.fx.burst(tileToWorld(f.pos, 0.6), [0x9ff3ff, 0xffffff], { count: 12, speed: 2 });
    this.view.sync(this.state);
  }

  private async wander(f: Unit) {
    if (f.move <= 0) return;
    const paths = [...this.turns.reachable(f, true).values()];
    if (!paths.length) return;
    await this.travel(f, this.rng.pick(paths));
  }

  private async flee(f: Unit) {
    const enemies = this.state.enemies();
    const paths = [...this.turns.reachable(f, true).values()];
    if (!paths.length || f.move <= 0) return;
    const safety = (p: Vec) => Math.min(...enemies.map(e => manhattan(e.pos, p)));
    paths.sort((a, b) => safety(b[b.length - 1]) - safety(a[a.length - 1]));
    if (safety(paths[0][paths[0].length - 1]) <= safety(f.pos)) return;
    await this.travel(f, paths[0]);
  }

  private async stealVase(f: Unit, at: Vec) {
    if (manhattan(f.pos, at) > 1 && f.familiar!.creature === 'wisp') {
      const spot = DIRS.map(d => vadd(at, d)).filter(p => this.state.isFree(p)).sort((a, b) => manhattan(a, f.pos) - manhattan(b, f.pos))[0];
      if (spot) await this.blink(f, spot);
    } else if (manhattan(f.pos, at) > 1) await this.approach(f, at, 1);
    if (!f.alive || manhattan(f.pos, at) > 1) { this.say(f, '👀 shiny…'); return; }
    const vase = this.state.props.find(p => p.kind === 'vase' && veq(p.pos, at));
    if (!vase) return;
    this.state.removeProp(vase);
    this.view.sync(this.state);
    this.say(f, '💰 mine now');
    this.rules.addResidue(1, 'a stolen vase');
    this.hooks.log(`${f.name} pockets a vase instead of fighting. You get +1 residue for "insurance".`, 'good');
  }

  // ------------------------------------------------------------ after-turn flaws
  private async gas(f: Unit) {
    const near = this.state.livingUnits().filter(u => u !== f && manhattan(u.pos, f.pos) === 1);
    this.fx.burst(tileToWorld(f.pos, 0.4), [0x9cff6a, 0xc8e6a0], { count: 16, speed: 2, up: 0.5, gravity: 0 });
    this.say(f, '💨 *pfffrt*');
    if (!near.length) return;
    this.hooks.log(`${f.name} lets one go. Everything next to it is blown back a tile.`, 'info');
    for (const u of near) await this.rules.push(u, dirTo(f.pos, u.pos), 1);
  }

  private horror(f: Unit) {
    const near = this.state.livingUnits().filter(u => u !== f && chebyshev(u.pos, f.pos) === 1);
    let scared = 0;
    for (const u of near) {
      if (u.team === 'enemy') { u.status.stun = Math.max(u.status.stun, 1); scared++; this.fx.floatText(tileToWorld(u.pos, 1.6), '😱', 'status'); }
      if (u.kind === 'wizard') {
        u.status.rooted = Math.max(u.status.rooted, 2);
        this.fx.floatText(tileToWorld(u.pos, 1.6), '😱 you looked', 'status');
        this.hooks.log(`You make the mistake of looking at ${f.name}. You are frozen in horror and cannot move next turn.`, 'bad');
      }
    }
    if (scared) this.hooks.log(`${scared} enem${scared > 1 ? 'ies are' : 'y is'} frozen in horror by ${f.name}'s face.`, 'good');
  }

  private mopUp(f: Unit) {
    let cleaned = 0;
    for (const t of [f.pos, ...DIRS.map(d => vadd(f.pos, d))]) {
      const hz = this.state.hazardAt(t);
      if (hz && hz.kind !== 'fire') { this.state.setHazard(t, null); cleaned++; }
    }
    if (cleaned) { this.say(f, '🧽 *squeak*'); this.view.sync(this.state); }
  }

  // ------------------------------------------------------------ helpers
  private async lunge(f: Unit) {
    const m = this.view.unitMeshes.get(f.id);
    if (!m) return;
    const base = m.position.clone(), d = DIRS[f.facing];
    await this.sm.tween(160, t => { const k = Math.sin(Math.PI * t) * 0.3; m.position.set(base.x + d.x * k, base.y, base.z + d.y * k); });
    m.position.copy(base);
  }

  private randomTileNear(c: Vec, r: number): Vec | null {
    const tiles = this.state.allTiles().filter(p => { const d = manhattan(p, c); return d >= 1 && d <= r; });
    return tiles.length ? this.rng.pick(tiles) : null;
  }
}
