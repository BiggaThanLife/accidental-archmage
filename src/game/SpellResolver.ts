// Rules engine: damage, knockback/sliding physics, hazard interactions and
// spell resolution. Everything is async so animations play in order.

import * as THREE from 'three';
import { GameState } from './GameState';
import {
  DIRS, Dir, Prop, Rng, Unit, Vec, Zone, chebyshev, dirTo, inBounds, key, manhattan, opposite,
  turnLeft, turnRight, vadd, veq,
} from './types';
import { SceneManager } from '../core/SceneManager';
import { GridBoard, tileToWorld } from '../core/GridBoard';
import { EntityView, makeDeliveryMesh, makeArmchair } from '../core/EntityView';
import { Effects } from '../core/Effects';
import { Spell, SpellPlan, planSpell, getTargetTiles } from '../spells/SpellGenerator';
import { QUIPS } from '../spells/SpellComponents';
import type { MetaBonuses } from '../meta/MetaProgression';
import { newId } from './GameState';

export interface RuleHooks {
  log(msg: string, cls?: string): void;
  residue(amount: number, why: string): void;
  refresh(): void;
}

export interface CastResult { endTurn: boolean }

const SLIPPERY = new Set(['grease', 'banana']);

export class Rules {
  private zoneMeshes = new Map<number, THREE.Object3D>();

  constructor(
    public state: GameState,
    private sm: SceneManager,
    private board: GridBoard,
    private view: EntityView,
    private fx: Effects,
    public bonuses: MetaBonuses,
    private rng: Rng,
    private hooks: RuleHooks,
  ) {}

  private sync() {
    this.view.sync(this.state);
    this.board.syncHazards(this.state.hazards);
    this.hooks.refresh();
  }

  private uw(u: Unit, y = 1.0) { const p = this.view.unitWorld(u); p.y = y; return p; }

  // ================================================================ damage
  async damage(u: Unit, amount: number, source: string, opts: { silent?: boolean } = {}) {
    if (!u.alive || amount <= 0) return;
    let dmg = amount;
    if (u.status.enraged > 0) dmg += 1;
    if (u.status.vulnerable > 0) dmg += 1;
    dmg += u.status.rust;
    const def = u.status.enraged > 0 ? 0 : u.def;
    dmg = Math.max(0, dmg - def);
    if (dmg === 0) {
      this.fx.floatText(this.uw(u), 'BLOCKED', 'info');
      return;
    }
    u.hp -= dmg;
    this.view.flash(u);
    this.fx.floatText(this.uw(u), `-${dmg}`, u.team === 'player' ? 'dmg-self' : 'dmg');
    if (!opts.silent && u.kind === 'wizard') this.hooks.log(`${source} hits you for ${dmg}. ${this.rng.pick(QUIPS.wizardHurt)}`, 'bad');
    if (u.hp <= 0) await this.kill(u, source);
    this.view.refreshTags(this.state);
  }

  async kill(u: Unit, source: string) {
    if (!u.alive) return;
    u.hp = 0;
    await this.view.die(u);
    u.alive = false;
    if (u.team === 'enemy') {
      this.hooks.log(`${u.name} ${this.rng.pick(QUIPS.kill)} (${source})`, 'good');
      this.hooks.residue(2, `${u.name} defeated`);
    } else if (u.kind === 'goose') {
      this.hooks.log('The goose departs in a cloud of feathers and spite.', 'info');
      this.fx.burst(tileToWorld(u.pos, 0.4), [0xffffff, 0xeeeeee], { count: 20, shape: 'flat', gravity: 2, up: 3 });
    }
    this.sync();
  }

  // ================================================================ movement & physics
  /** Knock a unit `dist` tiles in `dir`. Bumping into things hurts both parties. */
  async push(u: Unit, dir: Dir, dist: number, opts: { mode?: 'knock' | 'slide' | 'fly'; bounce?: boolean; noBumpDamage?: boolean } = {}) {
    if (!u.alive || dist <= 0) return;
    let d = dir;
    let blocked = false;
    for (let i = 0; i < dist && u.alive; i++) {
      const next = vadd(u.pos, DIRS[d]);
      if (this.state.isBlocked(next, u)) {
        if (opts.bounce) {
          d = opposite(d);
          this.fx.floatText(this.uw(u), 'boing!', 'info');
          const back = vadd(u.pos, DIRS[d]);
          if (this.state.isBlocked(back, u)) { blocked = true; break; }
          continue;
        }
        await this.collide(u, next, d, opts.noBumpDamage);
        blocked = true;
        break;
      }
      u.pos = next;
      await this.view.moveUnit(u, next, opts.mode ?? 'knock');
      await this.onEnter(u);
    }
    if (!blocked && u.alive) await this.slide(u, d);
    this.sync();
  }

  private async collide(u: Unit, into: Vec, d: Dir, noDamage?: boolean) {
    await this.view.bump(u, DIRS[d]);
    this.fx.floatText(this.uw(u, 1.3), this.rng.pick(QUIPS.bump), 'bonk');
    this.sm.addShake(0.12);
    const wizardPadded = u.kind === 'wizard' && this.bonuses.paddedHat;
    if (!noDamage && !wizardPadded) await this.damage(u, 1, 'A wall-related incident');
    if (!inBounds(into)) return;
    const other = this.state.unitAt(into);
    if (other && !noDamage) await this.damage(other, 1, `${u.name} (thrown)`);
    const prop = this.state.propAt(into);
    if (prop) await this.hitProp(prop, 1, `${u.name} slammed into it`);
  }

  /** Continue sliding while on grease or banana peels. */
  async slide(u: Unit, d: Dir) {
    let guard = 0;
    while (u.alive && guard++ < 10) {
      const hz = this.state.hazardAt(u.pos);
      if (!hz || !SLIPPERY.has(hz.kind)) return;
      if (hz.kind === 'banana') this.state.setHazard(u.pos, null);
      this.fx.floatText(this.uw(u), hz.kind === 'banana' ? 'slip!' : 'wheee!', 'info');
      const next = vadd(u.pos, DIRS[d]);
      if (this.state.isBlocked(next, u)) { await this.collide(u, next, d); return; }
      u.pos = next;
      await this.view.moveUnit(u, next, 'slide');
      await this.onEnter(u);
      this.sync();
    }
  }

  /** Hazard effects when a unit lands on a tile. */
  async onEnter(u: Unit) {
    const hz = this.state.hazardAt(u.pos);
    if (!hz || !u.alive) return;
    if (hz.kind === 'fire') {
      this.fx.floatText(this.uw(u, 1.3), 'HOT!', 'bonk');
      await this.damage(u, 1, 'Disco fire');
    } else if (hz.kind === 'shards') {
      await this.damage(u, 1, 'Pottery shards');
    } else if (hz.kind === 'jelly') {
      u.status.slow = Math.max(u.status.slow, 2);
    }
  }

  /** Walk a unit along a path; landing on slippery tiles turns a stroll into a slide. */
  async walk(u: Unit, path: Vec[]) {
    for (const step of path) {
      if (!u.alive) return;
      if (this.state.isBlocked(step, u)) return;
      const d = dirTo(u.pos, step);
      if (u.facing !== d) { u.facing = d; await this.view.face(u); }
      u.pos = { ...step };
      await this.view.moveUnit(u, step, 'walk');
      await this.onEnter(u);
      const hz = this.state.hazardAt(u.pos);
      if (hz && SLIPPERY.has(hz.kind)) {
        await this.slide(u, d);
        this.sync();
        return;
      }
      if (hz && hz.kind === 'jelly') { this.fx.floatText(this.uw(u), 'sticky!', 'info'); this.sync(); return; }
      this.sync();
    }
  }

  async swap(a: Unit, b: Unit) {
    const pa = { ...a.pos }, pb = { ...b.pos };
    a.pos = pb; b.pos = pa;
    await Promise.all([this.view.moveUnit(a, pb, 'fly'), this.view.moveUnit(b, pa, 'fly')]);
    await this.onEnter(a); await this.onEnter(b);
    this.sync();
  }

  // ================================================================ props & hazards
  async hitProp(p: Prop, dmg: number, why: string) {
    if (!this.state.props.includes(p)) return;
    switch (p.kind) {
      case 'crate': return this.explodeCrate(p);
      case 'vase': return this.breakVase(p, why);
      case 'confetti': return this.explodeConfetti(p);
      case 'cart':
        this.hooks.log('The shopping cart takes the hit and rolls away forever.', 'info');
        this.fx.burst(this.view.propWorld(p), [0xc0c6d0, 0xff3b30], { count: 10, shape: 'cube' });
        this.state.removeProp(p); this.sync(); return;
      case 'armchair':
        if (dmg >= 3) { this.fx.burst(this.view.propWorld(p), [0xb23a48, 0x4e342e], { count: 14, shape: 'cube' }); this.state.removeProp(p); this.sync(); }
        return;
      default: return;
    }
  }

  async explodeCrate(p: Prop) {
    if (!this.state.props.includes(p)) return;
    this.state.removeProp(p);
    this.sync();
    const c = p.pos;
    const w = tileToWorld(c, 0.4);
    this.fx.burst(w, [0x7ccf5a, 0x4caf50, 0xa5d66f, 0xa8743f], { count: 28, shape: 'leaf', speed: 4.5, up: 5 });
    this.fx.ring(w, 0x9cff6a, 2.6);
    this.sm.addShake(0.35);
    this.hooks.log('An Explosive Cabbage Crate detonates! Coleslaw everywhere.', 'boom');
    const dmg = 2 + this.bonuses.cabbageDmg;
    await this.blast(c, dmg, 'Exploding cabbage', true);
  }

  /** 3x3 blast around a point: damages units, breaks props, knocks units outward. */
  private async blast(c: Vec, dmg: number, why: string, knock: boolean) {
    const victims: Unit[] = [];
    const props: Prop[] = [];
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const t = { x: c.x + dx, y: c.y + dy };
      if (!inBounds(t)) continue;
      const u = this.state.unitAt(t); if (u) victims.push(u);
      const pr = this.state.propAt(t); if (pr) props.push(pr);
    }
    for (const u of victims) await this.damage(u, dmg, why);
    if (knock) {
      for (const u of victims) {
        if (!u.alive || veq(u.pos, c)) continue;
        await this.push(u, dirTo(c, u.pos), 1);
      }
    }
    for (const pr of props) { await this.sm.wait(90); await this.hitProp(pr, dmg, why); }
  }

  async breakVase(p: Prop, why: string) {
    if (!this.state.props.includes(p)) return;
    this.state.removeProp(p);
    this.state.setHazard(p.pos, 'shards', 4);
    this.fx.burst(tileToWorld(p.pos, 0.4), [0x3d7be0, 0xffffff, 0xffd34d], { count: 18, shape: 'tet', speed: 3 });
    this.hooks.log(`A Fragile Vase shatters (${why}). Insurance fraud: +1 residue.`, 'info');
    this.hooks.residue(1, 'vase insurance');
    this.sync();
  }

  async explodeConfetti(p: Prop) {
    if (!this.state.props.includes(p)) return;
    this.state.removeProp(p);
    this.sync();
    const w = tileToWorld(p.pos, 0.5);
    this.fx.burst(w, [0xff4fd8, 0x4fd1ff, 0xffe14a, 0x6ee7b7, 0xff7b00], { count: 40, shape: 'flat', speed: 4, up: 5, gravity: 3, life: 2 });
    this.sm.addShake(0.2);
    this.hooks.log('The confetti bomb goes off. Congratulations on your injuries!', 'boom');
    await this.blast(p.pos, 1, 'Confetti bomb', false);
  }

  async ignite(t: Vec, depth = 0): Promise<void> {
    if (!inBounds(t) || depth > 30) return;
    const hz = this.state.hazardAt(t);
    if (hz?.kind === 'water') {
      this.state.setHazard(t, null);
      this.fx.burst(tileToWorld(t, 0.2), [0xffffff, 0xdfe8ff], { count: 8, gravity: -1, up: 1, speed: 0.6 });
      this.sync();
      return;
    }
    if (hz?.kind === 'fire') return;
    const wasGrease = hz?.kind === 'grease';
    this.state.setHazard(t, 'fire', wasGrease ? 3 : 2);
    this.fx.burst(tileToWorld(t, 0.2), [0xff7b00, 0xffd23f, 0xff3d00], { count: 6, up: 2.5, speed: 1 });
    this.sync();
    const u = this.state.unitAt(t);
    if (u) await this.damage(u, 1, 'Fire');
    const pr = this.state.propAt(t);
    if (pr && (pr.kind === 'crate' || pr.kind === 'confetti')) await this.hitProp(pr, 1, 'fire');
    if (pr && pr.kind === 'armchair') { this.state.removeProp(pr); this.hooks.log('The armchair burns. It was a lovely armchair.', 'info'); this.sync(); }
    // fire races through connected grease
    for (const d of DIRS) {
      const n = vadd(t, d);
      if (this.state.hazardAt(n)?.kind === 'grease') { await this.sm.wait(70); await this.ignite(n, depth + 1); }
    }
  }

  /** Electricity through a water region. */
  async shock(t: Vec, dmg = 2, source = 'Electrified water') {
    const region = this.state.waterRegion(t);
    if (!region.length) return;
    const victims = region.map(p => this.state.unitAt(p)).filter((u): u is Unit => !!u);
    await this.fx.zap(region.map(p => tileToWorld(p, 0.3)));
    this.hooks.log(`Zzzt! The water conducts electricity across ${region.length} tile${region.length > 1 ? 's' : ''}.`, 'boom');
    for (const u of victims) await this.damage(u, dmg, source);
  }

  setTileHazard(t: Vec, kind: 'grease' | 'water' | 'banana' | 'jelly' | 'shards', turns: number) {
    if (!inBounds(t)) return;
    const pr = this.state.propAt(t);
    if (pr && pr.kind !== 'vase' && pr.kind !== 'crate') return;
    const cur = this.state.hazardAt(t);
    if (cur?.kind === 'fire' && kind === 'grease') return; // handled by caller via ignite
    if (cur?.kind === 'fire' && kind === 'water') { this.state.setHazard(t, null); return; }
    this.state.setHazard(t, kind, turns);
  }

  // ================================================================ enemy attacks
  telegraphFor(u: Unit, pos: Vec = u.pos, facing: Dir = u.facing): Vec[] {
    if (!u.alive || u.team !== 'enemy') return [];
    if (u.status.stun > 0 || u.status.pacified > 0 || u.status.interrupted > 0) return [];
    const f = DIRS[facing];
    const front = vadd(pos, f);
    switch (u.attack) {
      case 'melee': return [front].filter(inBounds);
      case 'sweep': return [front, vadd(front, DIRS[turnLeft(facing)]), vadd(front, DIRS[turnRight(facing)])].filter(inBounds);
      case 'line': {
        const out: Vec[] = [];
        let p = pos;
        for (let i = 0; i < 4; i++) {
          p = vadd(p, f);
          if (!inBounds(p)) break;
          out.push(p);
          const blocker = this.state.unitAt(p);
          if ((blocker && blocker !== u) || this.state.propAt(p)) break;
        }
        return out;
      }
      default: return [];
    }
  }

  async enemyAttack(u: Unit) {
    const tiles = this.telegraphFor(u);
    if (!tiles.length) return;
    const m = this.view.unitMeshes.get(u.id);
    // lunge
    if (m) {
      const base = m.position.clone(); const f = DIRS[u.facing];
      await this.sm.tween(180, t => { const k = Math.sin(Math.PI * t) * 0.35; m.position.set(base.x + f.x * k, base.y, base.z + f.y * k); });
      m.position.copy(base);
    }
    if (u.attack === 'line') {
      const bolt = makeDeliveryMesh('bolt', 0xffe0a0);
      await this.fx.projectile(bolt, this.uw(u, 0.5), tileToWorld(tiles[tiles.length - 1], 0.5), 0.1, 220, false);
    }
    if (u.status.blind > 0) {
      u.status.blind = 0;
      this.fx.floatText(this.uw(u), 'MISS (glitter)', 'info');
      this.hooks.log(`${u.name} swings blindly through a cloud of glitter.`, 'info');
      return;
    }
    const atk = u.atk + (u.status.enraged > 0 ? 2 : 0) + (u.status.aggro > 0 ? 1 : 0);
    for (const t of tiles) {
      const target = this.state.unitAt(t);
      if (target && target !== u) {
        await this.damage(target, atk, u.name);
        if (target.team === 'enemy') this.hooks.log(`${u.name} accidentally clobbers ${target.name}. Friendly fire!`, 'good');
      }
      const pr = this.state.propAt(t);
      if (pr) await this.hitProp(pr, atk, `${u.name}'s attack`);
    }
  }

  // ================================================================ spells
  async castSpell(spell: Spell, caster: Unit, target: Vec, echo = false): Promise<CastResult> {
    const plan = planSpell(spell, caster, target, this.state);
    if (!plan) return { endTurn: false };
    if (!echo) this.hooks.log(`<b>${spell.name}</b> — ${spell.formula}. ${spell.flavor}`, 'cast');
    if (caster.facing !== plan.dir && spell.delivery.shape !== 'selfAoe') { caster.facing = plan.dir; await this.view.face(caster); }

    await this.animateDelivery(spell, caster, plan);
    await this.resolveImpact(spell, caster, plan);

    let endTurn = false;
    if (!echo && caster.alive) endTurn = await this.sideEffect(spell, caster, plan);
    this.sync();
    return { endTurn };
  }

  private async animateDelivery(spell: Spell, caster: Unit, plan: SpellPlan) {
    const d = spell.delivery;
    const from = this.uw(caster, 0.8);
    const to = tileToWorld(plan.primary, 0.5);
    const last = tileToWorld(plan.area[plan.area.length - 1] ?? plan.primary, 0.5);
    switch (d.shape) {
      case 'cone':
        this.fx.floatText(this.uw(caster, 1.6), 'AH-CHOO!', 'shout');
        this.fx.burst(tileToWorld(plan.primary, 0.5), [0xe8fbff, 0xb8f0ff, 0xffffff], { count: 22, speed: 3, up: 1, gravity: 1 });
        await this.fx.ring(tileToWorld(plan.primary, 0.1), 0xb8f0ff, 2, 300);
        break;
      case 'overhead': {
        const anvil = makeDeliveryMesh('anvil', d.color);
        await this.fx.projectile(anvil, to.clone().setY(6), to.clone().setY(0.2), 0, 320, false);
        this.sm.addShake(0.4);
        this.fx.floatText(to.clone().setY(1.4), 'CLANG!', 'shout');
        break;
      }
      case 'arc':
        this.fx.floatText(this.uw(caster, 1.6), '"Did you hear...?"', 'shout');
        await Promise.all(plan.area.map(p => this.fx.ring(tileToWorld(p, 0.1), 0xff9ad5, 1.2, 400)));
        break;
      case 'selfAoe':
        this.fx.floatText(this.uw(caster, 1.6), '♪ wheeeze ♪', 'shout');
        await Promise.all([this.fx.ring(from.clone().setY(0.1), 0x8b5a2b, 5, 500), this.fx.ring(from.clone().setY(0.1), 0xffd34d, 3.5, 400)]);
        break;
      case 'path': case 'pierce': case 'flood': case 'stampede': {
        const mesh = d.id === 'carpet'
          ? new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.8, 10).rotateZ(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xb3203a }))
          : makeDeliveryMesh(d.id, d.color);
        if (d.id === 'firehose') {
          this.fx.burst(from, [0x5ab4ff, 0xb8e0ff], { count: 20, speed: 4, up: 1.5 });
        }
        if (d.id === 'applause') this.fx.floatText(this.uw(caster, 1.6), 'clap. clap. clap.', 'shout');
        if (d.id === 'livestock') this.fx.floatText(this.uw(caster, 1.6), 'MOOOO!', 'shout');
        await this.fx.projectile(mesh, from.clone().setY(d.id === 'livestock' ? 0 : 0.5), last.clone().setY(d.id === 'livestock' ? 0 : 0.5), 0, 120 * plan.area.length, d.id !== 'livestock');
        break;
      }
      default: {
        const mesh = d.id === 'armchair' ? makeArmchair() : makeDeliveryMesh(d.id, d.color);
        const arc = d.shape === 'lob' ? 3.5 : d.shape === 'projectile' || d.shape === 'pull' ? 0.15 : 1.4;
        if (d.id === 'pigeon') this.fx.floatText(this.uw(caster, 1.6), 'coo?', 'shout');
        if (d.id === 'coupon') this.fx.floatText(this.uw(caster, 1.6), '20% OFF!', 'shout');
        await this.fx.projectile(mesh, from, to, arc, d.shape === 'lob' ? 600 : 380, d.id !== 'pigeon');
        if (d.shape === 'area3x3') this.fx.burst(to, [0xffffff, 0xff9ad5, 0x9ad0ff, 0xffe14a], { count: 24, shape: 'cube', speed: 3, gravity: 1 });
      }
    }
  }

  private async resolveImpact(spell: Spell, caster: Unit, plan: SpellPlan) {
    const d = spell.delivery, pl = spell.payload;
    const b = this.bonuses;
    const hits = plan.hits.filter(u => u.alive);
    if (d.displace === 'inward') hits.reverse(); // near first

    // --- 1. payload status + damage on each hit unit
    for (const u of hits) {
      if (!u.alive) continue;
      const dmg = pl.id === 'cabbage' ? d.baseDamage + (spell.side.id === 'recoil' ? b.recoilDamage : 0) : spell.damage;
      await this.damage(u, dmg, spell.name);
      if (!u.alive) continue;
      this.applyStatus(spell, u);
      if (d.id === 'anvil') { u.status.rooted = Math.max(u.status.rooted, 1); await this.view.squash(u); }
      if (d.id === 'coupon') { u.status.stun = Math.max(u.status.stun, 1); this.fx.floatText(this.uw(u, 1.5), 'reading fine print…', 'info'); }
      if (d.electric && this.state.hazardAt(u.pos)?.kind === 'water') await this.shock(u.pos, 2, spell.name);
    }
    if (d.electric) {
      // an electric spell landing directly in a puddle also conducts
      const wet = plan.area.find(p => this.state.hazardAt(p)?.kind === 'water' && !this.state.unitAt(p));
      if (wet && !hits.length) await this.shock(wet, 2, spell.name);
    }

    // --- 2. delivery displacement
    for (const u of hits) {
      if (!u.alive) continue;
      switch (d.displace) {
        case 'push': {
          const dir = d.shape === 'lob' || d.shape === 'targeted' ? dirTo(caster.pos, u.pos) : plan.dir;
          await this.push(u, dir, d.displaceDist);
          break;
        }
        case 'turn':
          u.facing = opposite(u.facing);
          this.fx.floatText(this.uw(u, 1.5), '"wait, WHAT?"', 'info');
          await this.view.face(u, true);
          break;
        case 'pullToCaster': {
          const dir = dirTo(u.pos, caster.pos);
          const dist = Math.max(0, manhattan(u.pos, caster.pos) - 1);
          this.fx.floatText(this.uw(u, 1.5), 'SHLOOORP', 'shout');
          await this.push(u, dir, dist, { mode: 'slide', noBumpDamage: true });
          break;
        }
        case 'inward': {
          if (manhattan(u.pos, caster.pos) <= 1) break;
          await this.push(u, dirTo(u.pos, caster.pos), 1, { mode: 'slide' });
          break;
        }
      }
    }

    // --- 3. payload displacement
    for (const u of hits) {
      if (!u.alive) continue;
      if (pl.id === 'soap') { this.fx.floatText(this.uw(u, 1.5), 'sudsy!', 'info'); await this.push(u, dirTo(caster.pos, u.pos), 3, { mode: 'slide' }); }
      if (pl.id === 'tickle') {
        const side = this.rng.chance(0.5) ? turnLeft(plan.dir) : turnRight(plan.dir);
        this.fx.floatText(this.uw(u, 1.5), 'hehehe!', 'info');
        await this.push(u, side, 1, { mode: 'knock', noBumpDamage: true });
      }
      if (pl.id === 'slime') await this.push(u, dirTo(caster.pos, u.pos), 4, { mode: 'knock', bounce: true });
    }

    // --- 4. tile payloads
    if (pl.id === 'grease') {
      const tiles = new Map<string, Vec>();
      for (const p of plan.area) tiles.set(key(p), p);
      const spread = 1 + b.greaseSpread;
      for (let dy = -spread; dy <= spread; dy++) for (let dx = -spread; dx <= spread; dx++) {
        if (Math.abs(dx) + Math.abs(dy) > spread) continue;
        const t = { x: plan.primary.x + dx, y: plan.primary.y + dy };
        if (inBounds(t)) tiles.set(key(t), t);
      }
      const ignites: Vec[] = [];
      for (const t of tiles.values()) {
        if (this.state.hazardAt(t)?.kind === 'fire') ignites.push(t);
        else if (this.state.hazardAt(t)?.kind !== 'water') this.setTileHazard(t, 'grease', 4 + b.greaseTurns);
      }
      this.fx.burst(tileToWorld(plan.primary, 0.3), [0x6b4f1d, 0x8a6a2a], { count: 14, speed: 2.5 });
      this.sync();
      for (const t of ignites) await this.ignite(t);
    }
    if (pl.id === 'jelly') {
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) this.setTileHazard({ x: plan.primary.x + dx, y: plan.primary.y + dy }, 'jelly', 3);
      this.fx.burst(tileToWorld(plan.primary, 0.5), [0xff4d6d, 0x6ee7b7, 0xfcd34d, 0x93c5fd], { count: 26, speed: 3 });
      for (const u of this.unitsIn3x3(plan.primary)) u.status.slow = Math.max(u.status.slow, 2);
      this.sync();
    }
    if (pl.id === 'cabbage') {
      const w = tileToWorld(plan.primary, 0.4);
      this.fx.burst(w, [0x7ccf5a, 0x4caf50, 0xa5d66f], { count: 30, shape: 'leaf', speed: 4, up: 5 });
      this.fx.ring(w, 0x9cff6a, 2.6);
      this.fx.floatText(w.clone().setY(1.6), 'KA-BRASSICA!', 'shout');
      this.sm.addShake(0.3);
      await this.blast(plan.primary, 2 + b.cabbageDmg, spell.name, false);
    }

    // --- 5. delivery tile effects + props in the area
    if (d.id === 'soup' || d.id === 'firehose') {
      for (const p of plan.area) this.setTileHazard(p, 'water', -1);
      this.fx.burst(tileToWorld(plan.primary, 0.3), [0x5ab4ff, 0xd9a35a], { count: 16, speed: 2 });
      this.sync();
    }
    if (d.id === 'candelabra') {
      for (const p of plan.area) await this.ignite(p);
    }
    if (d.id === 'disco') this.spawnZone(spell, plan);

    const damaging = spell.damage > 0;
    for (const p of plan.area) {
      const pr = this.state.propAt(p);
      if (!pr) continue;
      if (damaging || pr.kind === 'vase') await this.hitProp(pr, spell.damage, spell.name);
    }

    if (d.id === 'armchair') {
      let spot: Vec | null = this.state.isFree(plan.primary) ? plan.primary : null;
      if (!spot) {
        for (const o of DIRS) { const n = vadd(plan.primary, o); if (this.state.isFree(n)) { spot = n; break; } }
      }
      if (spot) {
        const chair = this.state.makeProp('armchair', spot);
        this.sync();
        await this.view.dropProp(chair, 0.6);
        this.hooks.log('The armchair settles in. It is now your cover. It is also quite comfy.', 'info');
      }
    }
  }

  private unitsIn3x3(c: Vec) {
    return this.state.livingUnits().filter(u => chebyshev(u.pos, c) <= 1);
  }

  applyStatus(spell: Spell, u: Unit) {
    const b = this.bonuses;
    const s = u.status;
    const say = (t: string) => this.fx.floatText(this.uw(u, 1.55), t, 'status');
    switch (spell.payload.id) {
      case 'embarrass': s.stun = Math.max(s.stun, 1 + b.embarrassStun); say('😳 cringe!'); break;
      case 'bald': s.enraged = Math.max(s.enraged, 3); say('😡 MY HAIR!'); break;
      case 'apology': s.pacified = Math.max(s.pacified, 2 + b.apologyTurns); say('🕊️ "oh, no worries"'); break;
      case 'dread': s.rooted = Math.max(s.rooted, 2); say('⚓ why do I guard?'); break;
      case 'tapdance': s.rooted = Math.max(s.rooted, 1); say('♪ shuffle ♪'); break;
      case 'coffee': s.dot = Math.max(s.dot, 2); say('☕ $9 latte!'); break;
      case 'rust': s.rust += 1; say('🟫 rusty'); break;
      case 'hiccups': s.interrupted = Math.max(s.interrupted, 1); say('🫢 hic!'); break;
      case 'glitter': s.blind = 1; say('✨ sparkly!'); break;
      default: break;
    }
  }

  private spawnZone(spell: Spell, plan: SpellPlan) {
    const zone: Zone = { id: newId(), tiles: plan.area.map(p => ({ ...p })), turns: 2, spellId: spell.uid, center: { ...plan.primary } };
    this.state.zones.push(zone);
    const ball = makeDeliveryMesh('disco', 0xffffff);
    ball.position.copy(tileToWorld(plan.primary, 1.8));
    this.sm.scene.add(ball);
    this.zoneMeshes.set(zone.id, ball);
    this.sm.onTick((dt) => { ball.rotation.y += dt * 2; });
    zone.spell = spell;
  }

  /** Lingering zones (Disco Ball) pulse their payload each environment phase. */
  async pulseZones() {
    for (const z of [...this.state.zones]) {
      const spell = z.spell;
      if (spell) {
        this.board.setArea(z.tiles);
        await this.fx.ring(tileToWorld(z.center, 0.1), 0xff9ad5, 2.6, 380);
        this.fx.burst(tileToWorld(z.center, 1.5), [0xffffff, 0xff9ad5, 0x9ad0ff, 0xffe14a], { count: 16, shape: 'cube', speed: 3, gravity: 2 });
        const victims = z.tiles.map(p => this.state.unitAt(p)).filter((u): u is Unit => !!u);
        for (const u of victims) {
          await this.damage(u, 1, 'Disco pulse');
          if (u.alive) this.applyStatus(spell, u);
          if (u.alive && this.state.hazardAt(u.pos)?.kind === 'water') await this.shock(u.pos, 1, 'Disco pulse');
        }
        this.board.setArea([]);
      }
      z.turns -= 1;
      if (z.turns <= 0) {
        this.state.zones = this.state.zones.filter(x => x !== z);
        const m = this.zoneMeshes.get(z.id);
        if (m) { this.sm.scene.remove(m); this.zoneMeshes.delete(z.id); }
      }
    }
  }

  clearZones() {
    for (const m of this.zoneMeshes.values()) this.sm.scene.remove(m);
    this.zoneMeshes.clear();
    this.state.zones = [];
  }

  // ================================================================ side effects
  private async sideEffect(spell: Spell, caster: Unit, plan: SpellPlan): Promise<boolean> {
    const side = spell.side;
    const b = this.bonuses;
    const say = (t: string) => this.fx.floatText(this.uw(caster, 1.7), t, 'shout');
    switch (side.id) {
      case 'recoil': {
        const dist = Math.max(0, 2 - b.recoilReduce);
        if (dist === 0) { say('*boing* (absorbed)'); this.hooks.log('Your Rubber Robes absorb the recoil with a dignified wobble.', 'info'); break; }
        say('WHOOOA!');
        this.hooks.log(`The recoil launches you ${dist} tiles backward.`, 'bad');
        await this.push(caster, opposite(plan.dir), dist, { mode: 'fly' });
        break;
      }
      case 'goose': {
        const spot = this.freeNeighbor(caster.pos, true) ?? this.randomFreeTile();
        if (spot) {
          const g = this.state.makeUnit('goose', spot, this.rng.int(0, 3) as Dir);
          this.sync();
          const m = this.view.unitMeshes.get(g.id);
          if (m) { m.position.y = 3; await this.sm.tween(300, t => { m.position.y = 3 * (1 - t); }); m.position.y = 0; }
          this.fx.floatText(this.uw(g, 1.2), 'HONK?', 'shout');
          this.hooks.log('A profoundly confused goose appears. It pecks anyone nearby, friend or foe.', 'info');
        }
        break;
      }
      case 'banana': {
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const t = { x: caster.pos.x + dx, y: caster.pos.y + dy };
          if (inBounds(t) && !this.state.hazardAt(t) && !this.state.propAt(t)) this.state.setHazard(t, 'banana', 6);
        }
        this.fx.burst(this.uw(caster, 0.6), [0xffe14a, 0xffd400], { count: 16, shape: 'leaf', speed: 2.5 });
        this.hooks.log('Banana peels rain down around you. Watch your step.', 'info');
        this.sync();
        break;
      }
      case 'discofire': {
        const grease = [...this.state.hazards.entries()].filter(([, h]) => h.kind === 'grease').map(([k]) => { const [x, y] = k.split(',').map(Number); return { x, y }; });
        if (!grease.length) { this.hooks.log('You try to start a disco fire, but there is no grease. The vibe is merely "warm".', 'info'); break; }
        say('🪩 DISCO INFERNO!');
        this.hooks.log(`All ${grease.length} grease tiles erupt into a blinding disco fire!`, 'boom');
        this.sm.addShake(0.3);
        for (const t of grease) { await this.ignite(t); }
        break;
      }
      case 'apologize':
        caster.status.vulnerable = Math.max(caster.status.vulnerable, 1);
        say('"SO sorry, everyone!"');
        this.hooks.log('You apologise loudly. Your defence drops (+1 damage taken this round).', 'bad');
        break;
      case 'swap': {
        const other = plan.hits.find(u => u.alive) ?? this.state.unitAt(plan.primary);
        if (other && other !== caster) {
          say('wait, wrong way—');
          this.hooks.log(`You swap places with ${other.name}. Neither of you is happy about it.`, 'info');
          await this.swap(caster, other);
        } else {
          this.hooks.log('You attempt to swap places with nobody. It is awkward for everyone.', 'info');
        }
        break;
      }
      case 'vase': {
        const vase = makeDeliveryMesh('bolt', 0x3d7be0);
        await this.fx.projectile(vase, this.uw(caster, 4), this.uw(caster, 0.3), 0, 300, false);
        this.fx.burst(this.uw(caster, 0.2), [0x3d7be0, 0xffffff, 0xffd34d], { count: 14, shape: 'tet' });
        say('MY FOOT!');
        await this.damage(caster, 1, 'An overpriced vase', { silent: true });
        this.hooks.log('An overpriced vase lands on your foot. You are billed for it.', 'bad');
        break;
      }
      case 'sound':
        say('🔊 BOIOIOING!');
        for (const e of this.state.enemies()) e.status.alerted = Math.max(e.status.alerted, 2);
        this.hooks.log('A loud cartoon sound effect echoes. All enemies are alerted (+1 move).', 'bad');
        break;
      case 'honey':
        caster.status.bees = Math.max(caster.status.bees, 2);
        say('🐝 oh no, bees');
        this.hooks.log('You are coated in honey. Bees will sting you for 2 turns (stand in water to rinse).', 'bad');
        break;
      case 'pink':
        this.view.setRobeColor(caster, 0xff4fd8);
        for (const e of this.state.enemies()) e.status.aggro = Math.max(e.status.aggro, 2);
        say('✨ fabulous ✨');
        this.hooks.log('Your robes turn neon pink. Enemies are offended (+1 attack).', 'bad');
        break;
      case 'cart': {
        const nearest = this.state.enemies().sort((a, b2) => manhattan(a.pos, caster.pos) - manhattan(b2.pos, caster.pos))[0];
        const pref = nearest ? vadd(caster.pos, DIRS[dirTo(caster.pos, nearest.pos)]) : null;
        const spot = pref && this.state.isFree(pref) ? pref : this.freeNeighbor(caster.pos, false);
        if (spot) {
          const cart = this.state.makeProp('cart', spot);
          this.sync();
          await this.view.dropProp(cart, 2);
          this.hooks.log('A floating shopping cart appears. It will absorb one hit.', 'good');
        }
        break;
      }
      case 'trip':
        say('*trips on beard*');
        this.hooks.log('You trip over your own beard. Your turn is over.', 'bad');
        await this.view.squash(caster);
        return true;
      case 'confetti': {
        const spot = this.freeNeighbor(caster.pos, true);
        if (spot) {
          const bomb = this.state.makeProp('confetti', spot, 1);
          this.sync();
          await this.view.dropProp(bomb, 1.5);
          this.hooks.log('An unexploded confetti bomb lands next to you. It goes off at the end of the round.', 'bad');
        }
        break;
      }
      case 'again': {
        const mirrored = { x: caster.pos.x * 2 - plan.primary.x, y: caster.pos.y * 2 - plan.primary.y };
        const options = getTargetTiles(spell, caster, this.state);
        const tgt = options.find(p => veq(p, mirrored))
          ?? options.sort((a, c) => manhattan(a, mirrored) - manhattan(c, mirrored))[0];
        say('…AH-CHOO (again)!');
        this.hooks.log('You sneeze again. The spell repeats, backwards.', 'info');
        if (tgt) await this.castSpell(spell, caster, tgt, true);
        break;
      }
      case 'shatter': {
        const vases = this.state.props.filter(p => p.kind === 'vase' && chebyshev(p.pos, caster.pos) <= 3);
        say('*glass noises*');
        if (!vases.length) this.hooks.log('You shatter all nearby glass. There was none. Your spectacles crack slightly.', 'info');
        for (const v of vases) {
          await this.breakVase(v, 'sonic shatter');
          for (const o of DIRS) { const u = this.state.unitAt(vadd(v.pos, o)); if (u) await this.damage(u, 1, 'Flying shards'); }
        }
        break;
      }
    }
    return false;
  }

  private freeNeighbor(c: Vec, diagonal: boolean): Vec | null {
    const opts: Vec[] = [];
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      if (!diagonal && dx && dy) continue;
      const t = { x: c.x + dx, y: c.y + dy };
      if (this.state.isFree(t)) opts.push(t);
    }
    return opts.length ? this.rng.pick(opts) : null;
  }

  private randomFreeTile(): Vec | null {
    const free = this.state.allTiles().filter(t => this.state.isFree(t));
    return free.length ? this.rng.pick(free) : null;
  }
}
