// Turn flow: Player phase -> Enemy phase (telegraphed attacks, then movement)
// -> Environment phase (fire, DOTs, zones, fuses, status ticks) -> Player phase.

import { GameState } from './GameState';
import { Rules } from './SpellResolver';
import { Dir, DIRS, Rng, Unit, Vec, dirTo, key, manhattan, vadd, veq } from './types';
import { Spell, getTargetTiles } from '../spells/SpellGenerator';
import { GridBoard, tileToWorld } from '../core/GridBoard';
import { EntityView } from '../core/EntityView';
import { Effects } from '../core/Effects';
import { SceneManager } from '../core/SceneManager';
import { QUIPS } from '../spells/SpellComponents';

export type Phase = 'player' | 'enemy' | 'environment' | 'busy' | 'won' | 'lost';

export interface TurnHooks {
  log(msg: string, cls?: string): void;
  phaseChanged(phase: Phase): void;
  refresh(): void;
  floorCleared(): void;
  wizardDied(): void;
}

const AVOID = new Set(['fire', 'shards', 'grease', 'banana', 'mould', 'sludge']);

export class TurnManager {
  phase: Phase = 'player';
  hasMoved = false;
  hasCast = false;
  /** Coffee Run granted before you moved: one more move after the first. */
  private bonusMoves = 0;

  constructor(
    private state: GameState,
    private rules: Rules,
    private board: GridBoard,
    private view: EntityView,
    private fx: Effects,
    private sm: SceneManager,
    private rng: Rng,
    private hooks: TurnHooks,
  ) {}

  private setPhase(p: Phase) { this.phase = p; this.hooks.phaseChanged(p); }

  startFloor() {
    for (const e of this.state.enemies()) e.facing = dirTo(e.pos, this.state.wizard.pos);
    this.view.sync(this.state);
    for (const e of this.state.enemies()) this.view.face(e);
    this.state.turn = 1;
    this.beginPlayerTurn();
  }

  beginPlayerTurn() {
    this.hasMoved = false;
    this.hasCast = false;
    this.bonusMoves = 0;
    this.refreshTelegraphs();
    this.setPhase('player');
    this.hooks.refresh();
  }

  refreshTelegraphs() {
    const tiles: Vec[] = [];
    for (const e of this.state.enemies()) tiles.push(...this.rules.telegraphFor(e));
    this.board.setTelegraph(tiles);
  }

  /** Telegraphed tiles that threaten the wizard's current tile (for the HUD warning). */
  threatsOnWizard(): Unit[] {
    const w = this.state.wizard.pos;
    return this.state.enemies().filter(e => this.rules.telegraphFor(e).some(t => veq(t, w)));
  }

  // ------------------------------------------------------------ movement
  moveRange(u: Unit): number {
    let m = u.move + (u.status.alerted > 0 ? 1 : 0);
    if (u.status.slow > 0) m = Math.max(1, Math.floor(m / 2));
    if (u.status.rooted > 0) m = 0;
    return m;
  }

  /** BFS reachable tiles -> path. Wizard may step onto (but not through) slippery/sticky tiles. */
  reachable(u: Unit, avoidHazards: boolean): Map<string, Vec[]> {
    const range = this.moveRange(u);
    const out = new Map<string, Vec[]>();
    const q: { p: Vec; path: Vec[] }[] = [{ p: u.pos, path: [] }];
    const seen = new Set<string>([key(u.pos)]);
    while (q.length) {
      const { p, path } = q.shift()!;
      if (path.length >= range) continue;
      for (const d of DIRS) {
        const n = vadd(p, d);
        const k = key(n);
        if (seen.has(k) || this.state.isBlocked(n, u)) continue;
        const hz = this.state.hazardAt(n);
        if (avoidHazards && hz && AVOID.has(hz.kind)) continue;
        seen.add(k);
        const np = [...path, n];
        out.set(k, np);
        const stops = hz && (hz.kind === 'grease' || hz.kind === 'banana' || hz.kind === 'jelly');
        if (!stops) q.push({ p: n, path: np });
      }
    }
    return out;
  }

  async playerMove(dest: Vec): Promise<boolean> {
    if (this.phase !== 'player' || this.hasMoved) return false;
    const path = this.reachable(this.state.wizard, false).get(key(dest));
    if (!path) return false;
    this.setPhase('busy');
    this.hasMoved = true;
    await this.rules.walk(this.state.wizard, path);
    if (this.bonusMoves > 0) { this.bonusMoves -= 1; this.hasMoved = false; }
    return this.afterPlayerAction();
  }

  async playerCast(spell: Spell, target: Vec): Promise<boolean> {
    if (this.phase !== 'player' || this.hasCast || spell.cooldownLeft > 0) return false;
    const valid = getTargetTiles(spell, this.state.wizard, this.state).some(t => veq(t, target));
    if (!valid) return false;
    this.setPhase('busy');
    this.hasCast = true;
    spell.cooldownLeft = spell.cooldown + this.rules.takeCooldownPenalty();
    const res = await this.rules.castSpell(spell, this.state.wizard, target);
    const ok = await this.afterPlayerAction();
    if (ok && res.extraMove && !res.endTurn) {
      if (this.hasMoved) this.hasMoved = false; else this.bonusMoves += 1;
      this.setPhase('player');
    }
    if (ok && res.endTurn) await this.endTurn();
    return ok;
  }

  /** Returns false if the floor ended. */
  private async afterPlayerAction(): Promise<boolean> {
    this.view.sync(this.state);
    if (this.checkEnd()) return false;
    this.refreshTelegraphs();
    this.setPhase('player');
    this.hooks.refresh();
    return true;
  }

  private checkEnd(): boolean {
    if (!this.state.wizard.alive) {
      this.setPhase('lost');
      this.board.setTelegraph([]);
      this.hooks.wizardDied();
      return true;
    }
    if (this.state.enemies().length === 0) {
      this.setPhase('won');
      this.board.setTelegraph([]);
      this.hooks.floorCleared();
      return true;
    }
    return false;
  }

  // ------------------------------------------------------------ end turn
  async endTurn() {
    if (this.phase !== 'player') return;
    this.board.clearHighlights();
    this.board.setArea([]);
    this.setPhase('enemy');
    await this.enemyPhase();
    if (this.checkEnd()) return;
    this.setPhase('environment');
    await this.environmentPhase();
    if (this.checkEnd()) return;
    this.state.turn += 1;
    this.beginPlayerTurn();
  }

  private async enemyPhase() {
    const actors = this.state.units.filter(u => u.alive && u.team !== 'player').sort((a, b) => a.id - b.id);
    for (const e of actors) {
      if (!e.alive) continue;
      if (e.kind === 'golem' || e.kind === 'intern') continue; // they just stand there and take it
      if (e.kind === 'goose') { await this.gooseTurn(e); }
      else await this.enemyTurn(e);
      this.refreshTelegraphs();
      this.hooks.refresh();
      if (!this.state.wizard.alive || this.state.enemies().length === 0) return;
      await this.sm.wait(80);
    }
  }

  private async enemyTurn(e: Unit) {
    const w = (y = 1.5) => tileToWorld(e.pos, y);
    if (e.status.stun > 0) {
      this.fx.floatText(w(), '😳 too embarrassed', 'status');
      await this.sm.wait(250);
      return;
    }
    if (e.status.frozen > 0) {
      this.fx.floatText(w(), '🧊 frozen solid', 'status');
      await this.sm.wait(250);
      return;
    }
    // 1) execute the telegraphed attack from current position/facing
    if (e.status.pacified > 0) {
      this.fx.floatText(w(), '🕊️ "after you!"', 'status');
      await this.sm.wait(200);
    } else if (e.status.charmed > 0) {
      this.fx.floatText(w(), '🎭 "I am NOT the Archmage!"', 'status');
      await this.sm.wait(200);
    } else if (e.status.interrupted > 0) {
      this.fx.floatText(w(), '🫢 *hic* (attack cancelled)', 'status');
      await this.sm.wait(200);
    } else {
      await this.rules.enemyAttack(e);
      if (!this.state.wizard.alive || !e.alive) return;
    }
    // 2) reposition and aim next attack
    if (e.status.rooted > 0) {
      this.fx.floatText(w(), e.status.rooted > 1 ? '⚓ contemplating…' : '⚓ stuck', 'status');
    } else {
      await this.aiMove(e);
    }
  }

  private async aiMove(e: Unit) {
    const wiz = this.targetFor(e);
    let reach = this.reachable(e, true);
    if (reach.size === 0) reach = this.reachable(e, false);
    const candidates: { pos: Vec; path: Vec[] }[] = [{ pos: e.pos, path: [] }];
    for (const path of reach.values()) candidates.push({ pos: path[path.length - 1], path });

    let best = candidates[0];
    let bestFacing: Dir = dirTo(e.pos, wiz);
    let bestScore = Infinity;
    const origPos = e.pos;
    for (const c of candidates) {
      e.pos = c.pos; // temporarily, so line-of-sight treats the old tile as empty
      let score = manhattan(c.pos, wiz) + c.path.length * 0.05;
      let facing: Dir = dirTo(c.pos, wiz);
      for (let f = 0 as Dir; f < 4; f = (f + 1) as Dir) {
        if (this.rules.telegraphFor(e, c.pos, f).some(t => veq(t, wiz))) {
          score = c.path.length * 0.05; facing = f; break;
        }
      }
      // brutes and guards dislike standing next to explosive crates
      const nearCrate = this.state.props.some(p => p.kind === 'crate' && manhattan(p.pos, c.pos) <= 1);
      if (nearCrate) score += 0.5;
      score += this.rng.next() * 0.1;
      if (score < bestScore) { bestScore = score; best = c; bestFacing = facing; }
    }
    e.pos = origPos;

    if (best.path.length) await this.rules.walk(e, best.path);
    if (!e.alive) return;
    // re-aim: if it slid somewhere, aim at the wizard from wherever it ended up
    let facing = bestFacing;
    if (!veq(e.pos, best.pos)) {
      facing = dirTo(e.pos, wiz);
      for (let f = 0 as Dir; f < 4; f = (f + 1) as Dir) {
        if (this.rules.telegraphFor(e, e.pos, f).some(t => veq(t, wiz))) { facing = f; break; }
      }
    }
    if (facing !== e.facing) { e.facing = facing; await this.view.face(e); }
  }

  /** Who an enemy goes after: a Printer Jam Golem if there is one, then an "imposter", then you. */
  private targetFor(e: Unit): Vec {
    const near = (us: Unit[]) => us.sort((a, b) => manhattan(a.pos, e.pos) - manhattan(b.pos, e.pos))[0];
    const golem = near(this.state.livingUnits().filter(u => u.kind === 'golem'));
    if (golem) return golem.pos;
    const imposter = near(this.state.enemies().filter(u => u !== e && u.status.charmed > 0));
    if (imposter) return imposter.pos;
    return this.state.wizard.pos;
  }

  private async gooseTurn(g: Unit) {
    if (g.status.stun > 0) return;
    const steps = this.rng.int(0, 2);
    for (let i = 0; i < steps && g.alive; i++) {
      const opts = DIRS.map(d => vadd(g.pos, d)).filter(p => !this.state.isBlocked(p, g));
      if (!opts.length) break;
      await this.rules.walk(g, [this.rng.pick(opts)]);
    }
    if (!g.alive) return;
    const victims = DIRS.map(d => this.state.unitAt(vadd(g.pos, d))).filter((u): u is Unit => !!u);
    this.fx.floatText(tileToWorld(g.pos, 1.2), this.rng.pick(QUIPS.goose), 'shout');
    if (victims.length && g.status.pacified <= 0) {
      const v = this.rng.pick(victims);
      g.facing = dirTo(g.pos, v.pos);
      await this.view.face(g);
      await this.rules.damage(v, 1, 'The goose');
      this.hooks.log(`The goose pecks ${v.kind === 'wizard' ? 'you' : v.name}. It shows no remorse.`, v.kind === 'wizard' ? 'bad' : 'good');
    }
  }

  private async environmentPhase() {
    const st = this.state;
    // fire, mould and sludge hurt whoever is standing in them
    for (const u of st.livingUnits()) {
      const hz = st.hazardAt(u.pos)?.kind;
      if (hz === 'fire') await this.rules.damage(u, 1, 'Lingering fire');
      else if (hz === 'mould') { this.fx.floatText(tileToWorld(u.pos, 1.5), '🦠 mouldy', 'status'); await this.rules.damage(u, 1, 'Fridge mould'); }
      else if (hz === 'sludge') await this.rules.damage(u, 1, 'Toxic sludge');
    }
    // final written warnings come due
    for (const u of st.livingUnits()) {
      if (u.status.doom > 0) {
        u.status.doom -= 1;
        if (u.status.doom === 0) {
          this.fx.floatText(tileToWorld(u.pos, 1.7), '📄 TERMINATED', 'shout');
          this.hooks.log(`${u.kind === 'wizard' ? 'Your' : u.name + "'s"} final written warning comes due.`, u.kind === 'wizard' ? 'bad' : 'good');
          await this.rules.damage(u, 4, 'A final written warning');
        }
      }
    }
    if (!st.wizard.alive) return;
    // burning feet (coffee), bees
    for (const u of st.livingUnits()) {
      if (u.status.dot > 0) {
        this.fx.floatText(tileToWorld(u.pos, 1.5), '☕ hot hot', 'status');
        await this.rules.damage(u, 1, 'Overpriced coffee');
      }
      if (u.status.bees > 0 && u.alive) {
        if (st.hazardAt(u.pos)?.kind === 'water') {
          u.status.bees = 0;
          this.hooks.log('You rinse off the honey in the puddle. The bees lose interest.', 'good');
        } else {
          this.fx.burst(tileToWorld(u.pos, 1), [0xffd400, 0x222222], { count: 10, speed: 1.5, up: 1, gravity: 0 });
          await this.rules.damage(u, 1, 'Bees');
        }
      }
    }
    if (!st.wizard.alive) return;

    await this.rules.pulseZones();

    await this.rules.spreadMould();

    // confetti fuses
    for (const p of [...st.props]) {
      if (p.kind === 'confetti') {
        p.fuse = (p.fuse ?? 1) - 1;
        if (p.fuse <= 0) await this.rules.explodeConfetti(p);
      }
    }

    // hazard durations
    for (const [k, h] of [...st.hazards]) {
      if (h.turns > 0) {
        h.turns -= 1;
        if (h.turns === 0) st.hazards.delete(k);
      }
    }
    this.board.syncHazards(st.hazards);

    // status ticks
    for (const u of st.livingUnits()) {
      const s = u.status;
      for (const k of ['stun', 'pacified', 'enraged', 'vulnerable', 'dot', 'slow', 'rooted', 'interrupted', 'alerted', 'aggro', 'bees', 'weak', 'frozen', 'charmed', 'marked', 'pinned'] as const) {
        if (s[k] > 0) s[k] -= 1;
      }
    }
    if (st.wizard.alive && !st.enemies().some(e => e.status.aggro > 0)) this.view.setRobeColor(st.wizard, 0x5b3cc4);
    this.view.sync(st);
  }
}
