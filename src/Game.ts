// Top-level controller: wires the engine, rules, turn flow, meta-progression and HUD,
// and turns pointer/touch input into moves and casts.

import { SceneManager } from './core/SceneManager';
import { GridBoard, tileToWorld } from './core/GridBoard';
import { EntityView } from './core/EntityView';
import { Effects } from './core/Effects';
import { GameState } from './game/GameState';
import { Rules } from './game/SpellResolver';
import { TurnManager, Phase } from './game/TurnManager';
import { DungeonGenerator } from './game/DungeonGenerator';
import { Rng, Vec, key, veq, emptyStatus } from './game/types';
import { Spell, SpellGenerator, getTargetTiles, planSpell } from './spells/SpellGenerator';
import { QUIPS } from './spells/SpellComponents';
import { MetaProgression } from './meta/MetaProgression';
import { HUD } from './ui/HUD';

const MAX_HAND = 5;

interface Run {
  floor: number;
  residue: number;
  hand: Spell[];
  roomTitle: string;
  lastHit: string;
}

export class Game {
  private meta = new MetaProgression();
  private rng = new Rng((Date.now() ^ (Math.random() * 1e9)) >>> 0);
  private hud: HUD;
  private sm: SceneManager;
  private board: GridBoard;
  private view: EntityView;
  private fx: Effects;
  private state = new GameState();
  private rules: Rules;
  private turns: TurnManager;
  private dungeon: DungeonGenerator;
  private gen: SpellGenerator;
  private run: Run | null = null;

  private selected = -1;
  private pending: Vec | null = null; // touch: first tap previews, second confirms
  private hovered: Vec | null = null;

  constructor(root: HTMLElement) {
    this.hud = new HUD(root, {
      selectSpell: i => this.selectSpell(i),
      endTurn: () => this.endTurn(),
      cancel: () => this.deselect(),
      startRun: () => this.startRun(),
      toggleSpeed: () => this.toggleSpeed(),
    });
    this.sm = new SceneManager(this.hud.stage);
    this.board = new GridBoard(this.sm);
    this.view = new EntityView(this.sm, this.hud.labels);
    this.fx = new Effects(this.sm, this.hud.labels);
    const bonuses = this.meta.bonuses();
    this.gen = new SpellGenerator(this.rng, bonuses);
    this.dungeon = new DungeonGenerator(this.rng);

    this.rules = new Rules(this.state, this.sm, this.board, this.view, this.fx, bonuses, this.rng, {
      log: (m, c) => { this.hud.log(m, c); if (c === 'bad') this.run && (this.run.lastHit = m.replace(/<[^>]+>/g, '')); },
      residue: (n) => { if (this.run) { this.run.residue += n; this.refresh(); } },
      refresh: () => this.refresh(),
    });
    this.turns = new TurnManager(this.state, this.rules, this.board, this.view, this.fx, this.sm, this.rng, {
      log: (m, c) => this.hud.log(m, c),
      phaseChanged: (p) => this.onPhase(p),
      refresh: () => this.refresh(),
      floorCleared: () => this.onFloorCleared(),
      wizardDied: () => this.onDeath(),
    });

    try { const s = Number(localStorage.getItem('aa-speed')); if (s === 1 || s === 2 || s === 3) this.sm.speed = s; } catch { /* ignore */ }

    this.bindInput();
    (window as unknown as { __aa: unknown }).__aa = this; // handy for debugging in the console
    this.showTitle();
    // A gentle demo board behind the title screen
    this.state.makeUnit('wizard', { x: 3, y: 7 }, 0);
    this.dungeon.generate(this.state, 1);
    this.view.sync(this.state);
    this.board.syncHazards(this.state.hazards);
  }

  // ------------------------------------------------------------ run lifecycle
  private showTitle() {
    this.hud.showTitle(this.meta, () => this.startRun(), () => this.hud.showAcademy(this.meta, () => this.showTitle()),
      () => this.hud.showMemo(() => this.showTitle(), 'Back to the title'));
  }

  /** The first time you enter the tower, HR explains (badly) what happened. */
  startRun() {
    if (!this.meta.data.memoSeen) {
      this.hud.showMemo(() => { this.meta.data.memoSeen = true; this.meta.save(); this.beginRun(); });
      return;
    }
    this.beginRun();
  }

  private beginRun() {
    const b = this.meta.bonuses();
    this.rules.bonuses = b;
    this.gen.setBonuses(b);
    this.state.units = [];
    this.view.clearAll();
    const wiz = this.state.makeUnit('wizard', { x: 3, y: 7 }, 0);
    wiz.maxHp += b.bonusHp;
    wiz.hp = wiz.maxHp;
    this.run = {
      floor: 1, residue: 0, roomTitle: '',
      hand: this.gen.starterHand(b.starterCount, b.deliveryTier, b.starterTier),
      lastHit: 'You were overwhelmed by paperwork.',
    };
    this.rules.exitInterviewLoss = 0;
    this.rules.pendingCooldownPenalty = 0;
    this.nervous = this.rng.shuffle([...QUIPS.nervous]);
    this.hud.clearLog();
    this.hud.log('You accept the post of Archmage. Nobody checked your references.', 'info');
    this.hud.hideOverlay();
    this.enterFloor();
  }

  private enterFloor() {
    const run = this.run!;
    this.rules.clearZones();
    const wiz = this.state.wizard;
    wiz.status = emptyStatus();
    wiz.alive = true;
    // the Exit Interview penalty only lasts for the floor it happened on
    wiz.maxHp += this.rules.exitInterviewLoss;
    this.rules.exitInterviewLoss = 0;
    this.view.clearAll();
    const info = this.dungeon.generate(this.state, run.floor);
    this.state.floor = run.floor;
    run.roomTitle = info.title;
    run.hand.forEach(s => (s.cooldownLeft = 0));
    this.view.sync(this.state);
    this.view.setRobeColor(wiz, 0x5b3cc4);
    this.board.syncHazards(this.state.hazards);
    this.deselect();
    this.hud.showFloorIntro(run.floor, info.title, info.flavor);
    this.hud.log(`Floor ${run.floor}: ${info.title}. ${this.state.enemies().length} staff members object to your presence.`, 'info');
    this.turns.startFloor();
  }

  private onFloorCleared() {
    const run = this.run!;
    const bonus = 5 + run.floor;
    run.residue += bonus;
    this.hud.log(`Floor cleared! +${bonus} residue.`, 'good');
    this.refresh();
    const b = this.meta.bonuses();
    const payloadTier = Math.min(2, Math.max(b.starterTier, Math.floor(run.floor / 2)));
    const options = [0, 1, 2].map(() => this.gen.generate({ deliveryTier: b.deliveryTier, payloadTier, sideTier: payloadTier }));
    setTimeout(() => {
      this.hud.showReward(run.floor, bonus, options, run.hand.length >= MAX_HAND,
        (i) => {
          const pick = options[i];
          if (run.hand.length < MAX_HAND) { run.hand.push(pick); this.nextFloor(); }
          else this.hud.showReplace(pick, run.hand, (j) => { run.hand[j] = pick; this.nextFloor(); }, () => this.nextFloor());
        },
        () => {
          const w = this.state.wizard;
          w.hp = Math.min(w.maxHp, w.hp + 5);
          this.nextFloor();
        });
    }, 900 / this.sm.speed);
  }

  private nextFloor() {
    const run = this.run!;
    run.floor += 1;
    const w = this.state.wizard;
    w.hp = Math.min(w.maxHp, w.hp + 1);
    this.hud.hideOverlay();
    this.enterFloor();
  }

  private onDeath() {
    const run = this.run!;
    this.meta.bankRun(run.residue, run.floor);
    this.hud.log('You have died. Spectacularly. The Academy keeps your residue.', 'bad');
    setTimeout(() => {
      this.hud.showDeath(run.floor, run.residue, run.lastHit, this.meta, () => this.startRun(), () => this.showTitle());
    }, 1100 / this.sm.speed);
  }

  // ------------------------------------------------------------ HUD sync
  private refresh() {
    if (!this.run) return;
    const w = this.state.wizard;
    this.hud.updateStats({
      floor: this.run.floor, roomTitle: this.run.roomTitle, hp: w.hp, maxHp: w.maxHp,
      residue: this.run.residue, bank: this.meta.data.residue, turn: this.state.turn,
      phase: this.turns.phase, hasMoved: this.turns.hasMoved, hasCast: this.turns.hasCast,
      threats: this.turns.phase === 'player' ? this.turns.threatsOnWizard().length : 0,
      speed: this.sm.speed,
    });
    this.hud.selected = this.selected;
    this.hud.renderSpells(this.run.hand, this.turns.phase === 'player' && !this.turns.hasCast);
    this.view.refreshTags(this.state);
  }

  private onPhase(p: Phase) {
    if (p !== 'player') {
      this.pending = null;
      this.hud.confirm(null);
      this.board.clearHighlights();
      this.board.setArea([]);
      this.hud.hint(null);
    } else {
      // cooldowns tick at the start of each of your turns
      if (this.run && !this.turns.hasMoved && !this.turns.hasCast) {
        // only once per turn: beginPlayerTurn calls with both flags reset
        if (this.lastCooldownTurn !== this.state.turn) {
          this.lastCooldownTurn = this.state.turn;
          if (this.state.turn > 1) this.run.hand.forEach(s => (s.cooldownLeft = Math.max(0, s.cooldownLeft - 1)));
          // the janitor is not coping, at least for the first few turns
          if (this.run.floor === 1 && this.state.turn <= 3 && this.nervous.length) this.hud.log(`<i>"${this.nervous.shift()}"</i>`, 'info');
        }
      }
      if (this.selected >= 0 && (this.turns.hasCast || this.run!.hand[this.selected].cooldownLeft > 0)) this.selected = -1;
      this.updateHighlights();
    }
    this.refresh();
  }
  private lastCooldownTurn = -1;
  private nervous: string[] = [];

  // ------------------------------------------------------------ selection & highlights
  private selectSpell(i: number) {
    if (!this.run || this.turns.phase !== 'player') return;
    const s = this.run.hand[i];
    if (!s) return;
    if (this.selected === i) { this.deselect(); return; }
    if (this.turns.hasCast) { this.hud.log('You have already cast a spell this turn. One catastrophe per turn, please.', 'info'); return; }
    if (s.cooldownLeft > 0) { this.hud.log(`${s.name} is still recharging (${s.cooldownLeft} turn${s.cooldownLeft > 1 ? 's' : ''}).`, 'info'); return; }
    this.selected = i;
    this.pending = null;
    this.hud.confirm(null);
    this.updateHighlights();
    this.refresh();
  }

  private deselect() {
    this.selected = -1;
    this.pending = null;
    this.hud.confirm(null);
    this.hud.hint(null);
    this.updateHighlights();
    this.refresh();
  }

  private updateHighlights() {
    if (!this.run || this.turns.phase !== 'player') { this.board.clearHighlights(); this.board.setArea([]); return; }
    const wiz = this.state.wizard;
    const focus = this.pending ?? this.hovered;
    if (this.selected >= 0) {
      const spell = this.run.hand[this.selected];
      const targets = getTargetTiles(spell, wiz, this.state);
      this.board.setHighlights(targets, 'range');
      const plan = focus ? planSpell(spell, wiz, focus, this.state) : null;
      this.board.setArea(plan ? plan.area : []);
    } else if (!this.turns.hasMoved) {
      const reach = this.turns.reachable(wiz, false);
      this.board.setHighlights([...reach.values()].map(p => p[p.length - 1]), 'move');
      const path = focus ? reach.get(key(focus)) : undefined;
      if (path) this.board.addHighlights(path, 'path');
      this.board.setArea([]);
    } else {
      this.board.clearHighlights();
      this.board.setArea([]);
    }
  }

  // ------------------------------------------------------------ input
  private bindInput() {
    const el = this.hud.stage;
    const canvas = this.sm.renderer.domElement;
    let downAt: { x: number; y: number; t: number } | null = null;

    const tileFromEvent = (e: PointerEvent): Vec | null => {
      const r = canvas.getBoundingClientRect();
      const res = this.board.pick(e.clientX - r.left, e.clientY - r.top, this.view.pickables());
      if (res.tile) return res.tile;
      if (res.object) {
        let o: THREE_Object | null = res.object;
        while (o && o.userData.unitId === undefined) o = o.parent;
        const u = o ? this.state.units.find(x => x.id === o!.userData.unitId) : undefined;
        if (u?.alive) return { ...u.pos };
      }
      return null;
    };

    canvas.addEventListener('pointermove', e => {
      if (e.pointerType !== 'mouse') return;
      const t = tileFromEvent(e);
      if ((t && this.hovered && veq(t, this.hovered)) || (!t && !this.hovered)) return;
      this.hovered = t;
      this.board.setHover(t);
      this.inspectTile(t);
      this.updateHighlights();
    });
    canvas.addEventListener('pointerleave', () => { this.hovered = null; this.board.setHover(null); this.updateHighlights(); });
    canvas.addEventListener('pointerdown', e => { downAt = { x: e.clientX, y: e.clientY, t: performance.now() }; });
    canvas.addEventListener('pointerup', e => {
      if (!downAt) return;
      const moved = Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y);
      downAt = null;
      if (moved > 12) return;
      const t = tileFromEvent(e);
      const r = canvas.getBoundingClientRect();
      this.onTap(t, e.pointerType !== 'mouse', e.clientX - r.left, e.clientY - r.top);
    });
    canvas.addEventListener('contextmenu', e => { e.preventDefault(); this.deselect(); });
    el.addEventListener('wheel', e => { e.preventDefault(); this.sm.setZoom(this.sm.zoom * (e.deltaY > 0 ? 0.92 : 1.08)); }, { passive: false });

    // pinch zoom
    const touches = new Map<number, { x: number; y: number }>();
    let pinch0 = 0, zoom0 = 1;
    canvas.addEventListener('pointerdown', e => {
      if (e.pointerType !== 'touch') return;
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (touches.size === 2) { const [a, b] = [...touches.values()]; pinch0 = Math.hypot(a.x - b.x, a.y - b.y); zoom0 = this.sm.zoom; }
    });
    canvas.addEventListener('pointermove', e => {
      if (!touches.has(e.pointerId)) return;
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (touches.size === 2 && pinch0 > 0) { const [a, b] = [...touches.values()]; this.sm.setZoom(zoom0 * Math.hypot(a.x - b.x, a.y - b.y) / pinch0); downAt = null; }
    });
    const lift = (e: PointerEvent) => { touches.delete(e.pointerId); if (touches.size < 2) pinch0 = 0; };
    canvas.addEventListener('pointercancel', lift);
    window.addEventListener('pointerup', lift);

    window.addEventListener('keydown', e => {
      if (!this.run || (e.target as HTMLElement)?.tagName === 'INPUT') return;
      if (e.key >= '1' && e.key <= '5') this.selectSpell(Number(e.key) - 1);
      else if (e.key === 'Escape') this.deselect();
      else if (e.key === 'e' || e.key === 'E' || e.key === 'Enter') this.endTurn();
    });
  }

  private inspectTile(t: Vec | null) {
    if (!t) { this.hud.inspect(null); return; }
    const u = this.state.unitAt(t);
    const p = this.state.propAt(t);
    const h = this.state.hazardAt(t);
    const parts: string[] = [];
    if (u) {
      const intent = u.team === 'enemy'
        ? (this.rules.telegraphFor(u).length ? { melee: 'Strikes the tile in front', line: 'Fires a bolt up to 4 tiles ahead', sweep: 'Sweeps 3 tiles in front', peck: '' }[u.attack] : 'Not attacking next turn')
        : u.kind === 'goose' ? 'Wanders. Pecks anyone adjacent.'
        : u.kind === 'golem' ? 'Every enemy must attack it until it breaks.'
        : u.kind === 'intern' ? 'Takes one hit for you, then quits.' : 'That is you.';
      const st = this.view.statusList(u);
      parts.push(`<b>${u.name}</b> <span class="mono">${u.hp}/${u.maxHp} HP · ATK ${u.atk}${u.def ? ` · DEF ${u.def}` : ''}</span><span>${intent}</span>${st.length ? `<span class="mono">${st.join(' · ')}</span>` : ''}`);
    }
    if (p) {
      const pd: Record<string, string> = {
        crate: 'Explosive Cabbage Crate — blows up (3x3, 2 dmg) when hit.',
        vase: 'Fragile Vase — shatters into shards when touched. +1 residue (insurance).',
        obstacle: 'Rubble — solid. Things that hit it say "bonk".',
        pillar: 'Load-bearing pillar. Please do not lick.',
        armchair: 'Your armchair. Cover from bolts. Very comfy.',
        cart: 'Floating shopping cart — absorbs one hit.',
        confetti: 'Confetti bomb — goes off at the end of the round (3x3, 1 dmg).',
        plant: 'Unwatered office plant — snaps when an enemy steps next to it, hitting everything around it except you.',
        bin: 'Lost-and-Found Bin — cover. Breaks if hit hard.',
        desk: 'Your desk fort — cover. Breaks if hit hard.',
      };
      parts.push(`<span>${pd[p.kind]}</span>`);
    }
    if (h) {
      const hd: Record<string, string> = {
        grease: 'Grease — anything that lands here slides onward.',
        water: 'Water — electric spells shock everyone in the connected pool.',
        fire: 'Disco fire — 1 damage on entry and each round.',
        banana: 'Banana peel — one free slide, then it is gone.',
        jelly: 'Jellybeans — sticky; halves movement.',
        shards: 'Pottery shards — 1 damage on entry.',
        mould: 'Fridge mould — 1 damage each round to whoever stands here. Spreads. Fire clears it.',
        sludge: 'Toxic sludge — 1 damage on entry and each round.',
      };
      parts.push(`<span>${hd[h.kind]}${h.turns > 0 ? ` (${h.turns} turns)` : ''}</span>`);
    }
    this.hud.inspect(parts.length ? parts.join('') : null);
  }

  /** Screen-space center of a tile, in stage pixels. */
  private tileCenterPx(p: Vec) { return this.sm.toScreen(tileToWorld(p, 0)); }

  /** Rough on-screen size of one tile (changes with zoom and screen size). */
  private tilePx() {
    const a = this.tileCenterPx({ x: 3, y: 3 }), b = this.tileCenterPx({ x: 4, y: 3 });
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  /** Tiles the current action can use: spell targets, or walkable tiles. */
  private validTiles(): Vec[] {
    if (!this.run) return [];
    const wiz = this.state.wizard;
    if (this.selected >= 0) return getTargetTiles(this.run.hand[this.selected], wiz, this.state);
    if (!this.turns.hasMoved) return [...this.turns.reachable(wiz, false).values()].map(p => p[p.length - 1]);
    return [];
  }

  private async onTap(t: Vec | null, touch: boolean, px: number, py: number) {
    if (!this.run || this.turns.phase !== 'player') return;
    const valid = this.validTiles();
    const isValid = (p: Vec | null) => !!p && valid.some(v => veq(v, p));

    if (touch) {
      const tol = this.tilePx() * 0.8;
      // 1) A second tap anywhere near the previewed tile confirms it.
      if (this.pending) {
        const c = this.tileCenterPx(this.pending);
        if (Math.hypot(px - c.x, py - c.y) < tol) { await this.confirmPending(); return; }
      }
      // 2) Snap a slightly-off tap to the nearest valid tile.
      let pick: Vec | null = isValid(t) ? t : null;
      if (!pick) {
        let best = Infinity;
        for (const v of valid) {
          const c = this.tileCenterPx(v);
          const d = Math.hypot(px - c.x, py - c.y);
          if (d < tol && d < best) { best = d; pick = v; }
        }
      }
      if (pick) {
        this.pending = pick;
        this.board.setHover(pick);
        this.inspectTile(pick);
        this.hud.hint(null);
        this.hud.confirm(this.selected >= 0 ? 'Cast here' : 'Walk here', () => this.confirmPending(), () => this.clearPending());
        this.updateHighlights();
        return;
      }
      // 3) Not an action tap: just inspect what was tapped.
      this.clearPending();
      this.board.setHover(t);
      this.inspectTile(t);
      if (t && this.selected >= 0) this.hud.hint('Out of range. Tap a blue tile, or Cancel.');
      return;
    }

    // Mouse: act immediately on a valid tile.
    this.board.setHover(t);
    this.inspectTile(t);
    if (!t) return;
    if (isValid(t)) { this.pending = t; await this.confirmPending(); return; }
    if (this.selected >= 0) this.hud.hint('Out of range. Click a blue tile, or press Esc.');
  }

  private clearPending() {
    this.pending = null;
    this.hud.confirm(null);
    this.updateHighlights();
  }

  private async confirmPending() {
    if (!this.run || !this.pending || this.turns.phase !== 'player') return;
    const t = this.pending;
    this.pending = null;
    this.hud.confirm(null);
    this.hud.hint(null);
    this.board.setArea([]);
    this.board.clearHighlights();
    if (this.selected >= 0) {
      const spell = this.run.hand[this.selected];
      this.selected = -1;
      await this.turns.playerCast(spell, t);
    } else {
      await this.turns.playerMove(t);
    }
  }

  private async endTurn() {
    if (!this.run || this.turns.phase !== 'player') return;
    this.selected = -1; this.pending = null;
    this.hud.hint(null);
    this.hud.confirm(null);
    await this.turns.endTurn();
  }

  private toggleSpeed() {
    this.sm.speed = this.sm.speed >= 3 ? 1 : this.sm.speed + 1;
    try { localStorage.setItem('aa-speed', String(this.sm.speed)); } catch { /* ignore */ }
    this.refresh();
  }
}

type THREE_Object = import('three').Object3D;
