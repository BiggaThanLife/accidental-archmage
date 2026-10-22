// In-tone onboarding + signposting: one-time contextual tips, a floor threat chip, and the post-mortem "performance review".
import './guide.css';
import { MetaProgression } from '../meta/MetaProgression';

export type Phase = 'player' | 'enemy' | 'environment' | string;

interface Tip { title: string; body: string }

const TIPS: Record<string, Tip> = {
  telegraph: { title: 'Memo: Red Tiles', body: 'Red tiles are where staff will hit you NEXT turn. Step off them, or shove an enemy so they clobber each other. HR calls this "workplace collaboration".' },
  grease: { title: 'Memo: Slippery When Mopped', body: 'Grease makes anything that lands on it slide onward. Push enemies across it, and keep your own feet off it. You mopped it. This is on you.' },
  water: { title: 'Memo: Puddles', body: 'Water carries electricity through the whole connected pool. Zap one enemy standing in it and everyone else gets the invoice.' },
  crate: { title: 'Memo: Cabbage Crates', body: 'Crates explode (3x3) when hit. Lure enemies next to one, then hit it from far away. Do not stand next to it yourself.' },
  vase: { title: 'Memo: Vases', body: 'Smashing a vase pays +1 residue as "insurance". Smash them freely, but not while standing on the shards.' },
  cooldown: { title: 'Memo: Cooldowns', body: 'That spell is still recharging. Cooldowns tick down at the start of each of your turns, so pick a different card, or reposition and wait.' },
  idle: { title: 'Memo: Doing Nothing', body: 'You ended a turn without moving or casting. Bold. Each turn you get one move AND one cast; skipping both just lets them hit you for free.' },
  recoil: { title: 'Memo: Self-Inflicted', body: 'You hurt yourself with your own spell. Recoil and knockback are the price of power. The Academy sells Rubber Robes and a Padded Hat for exactly this.' },
  lowhp: { title: 'Memo: Occupational Hazard', body: 'You are nearly dead. Clear the floor and take the nap in the stairwell (+6 HP), or kill what threatens you before it acts.' },
  reward: { title: 'Memo: The Vending Machine', body: 'Spells carry over between floors, so pick what combos with your book. Cards with a push, pull or slide chip are great for making enemies hit each other.' },
};

export interface RunStats {
  turns: number;
  moves: number;
  casts: number;
  idleTurns: number;
  /** HP lost during the enemy phase (telegraphed attacks) */
  attackDmg: number;
  attackHits: number;
  /** HP lost during the environment phase (fire, mould, shards) */
  hazardDmg: number;
  /** HP lost during your own turn (recoil, bumps) */
  selfDmg: number;
  /** log events showing the environment/enemies got used (explosions, friendly fire, shocks, slips) */
  envEvents: number;
}

const blank = (): RunStats => ({ turns: 0, moves: 0, casts: 0, idleTurns: 0, attackDmg: 0, attackHits: 0, hazardDmg: 0, selfDmg: 0, envEvents: 0 });
const THREAT_NAMES = ['', 'Light', 'Moderate', 'Serious', 'Severe', 'Lethal'];

export class Guide {
  stats: RunStats = blank();
  private chip: HTMLElement;
  private toast: HTMLElement;
  private queue: string[] = [];
  private timer = 0;
  private prevHp = -1;
  private seen: Record<string, boolean>;
  private reduceMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  constructor(stage: HTMLElement, private meta: MetaProgression) {
    this.seen = meta.data.tipsSeen ?? (meta.data.tipsSeen = {});
    this.chip = document.createElement('div');
    this.chip.className = 'guide-chip';
    this.chip.hidden = true;
    this.toast = document.createElement('div');
    this.toast.className = 'guide-toast';
    this.toast.hidden = true;
    this.toast.setAttribute('role', 'status');
    this.toast.setAttribute('aria-live', 'polite');
    stage.append(this.chip, this.toast);
  }

  // ------------------------------------------------------------ run tracking
  newRun() { this.stats = blank(); this.prevHp = -1; this.queue = []; this.dismiss(); }

  /** Call from refresh() with current HP and phase to attribute damage. */
  observeHp(hp: number, maxHp: number, phase: Phase) {
    if (this.prevHp >= 0 && hp < this.prevHp) {
      const d = this.prevHp - hp;
      if (phase === 'enemy') { this.stats.attackDmg += d; this.stats.attackHits += 1; }
      else if (phase === 'environment') this.stats.hazardDmg += d;
      else { this.stats.selfDmg += d; if (hp > 0) this.tip('recoil'); }
    }
    this.prevHp = hp;
    if (hp > 0 && hp <= maxHp * 0.34) this.tip('lowhp');
  }
  /** Reset the HP baseline when a new floor starts (healing and max-HP changes are not damage). */
  floorEntered(hp: number) { this.prevHp = hp; }
  noteLog(msg: string, cls?: string) {
    if (cls === 'boom' || /friendly fire|shock|slip|slide|explod|bonk|crash|detonat/i.test(msg)) this.stats.envEvents += 1;
  }
  noteMove() { this.stats.moves += 1; }
  noteCast() { this.stats.casts += 1; }
  noteEndTurn(moved: boolean, cast: boolean) {
    this.stats.turns += 1;
    if (!moved && !cast) { this.stats.idleTurns += 1; this.tip('idle'); }
  }

  // ------------------------------------------------------------ floor chip
  setFloor(floor: number, threat: number, power: number) {
    const need = MetaProgression.expectedPower(floor);
    const dots = '●'.repeat(threat) + '○'.repeat(5 - threat);
    const gap = power < need;
    this.chip.hidden = false;
    // Sit just under the top bar, whose height varies with the floor name's wrapping.
    const tb = document.getElementById('topbar');
    if (tb) this.chip.style.top = `${tb.offsetTop + tb.offsetHeight + 6}px`;
    this.chip.className = 'guide-chip' + (gap ? ' warn' : '');
    this.chip.innerHTML = `<span class="g-dots" aria-hidden="true">${dots}</span><b>Threat: ${THREAT_NAMES[threat]}</b>`
      + `<span class="g-sub">${gap ? 'Under-equipped: visit the Academy' : floor < 4 ? 'Winnable with what you have' : 'Gear is on par: play matters'}</span>`;
    this.chip.title = `Floor ${floor} threat ${threat}/5. Academy upgrades owned: ${power} (about ${need} expected here).`;
  }
  hideChip() { this.chip.hidden = true; }

  // ------------------------------------------------------------ tips
  /** Show a tip once, ever (persisted). Queues if another is on screen. */
  tip(id: string) {
    if (this.seen[id] || this.queue.includes(id) || !TIPS[id]) return;
    this.seen[id] = true;
    this.meta.save();
    this.queue.push(id);
    if (this.toast.hidden) this.next();
  }

  /** At the start of each player turn: surface at most one situational tip. */
  turnStart(ctx: { telegraphs: boolean; hazards: Set<string>; props: Set<string>; turn: number }) {
    const order: [string, boolean][] = [
      ['telegraph', ctx.telegraphs],
      ['grease', ctx.hazards.has('grease') && ctx.turn >= 2],
      ['crate', ctx.props.has('crate') && ctx.turn >= 3],
      ['water', ctx.hazards.has('water') && ctx.turn >= 4],
      ['vase', ctx.props.has('vase') && ctx.turn >= 5],
    ];
    const hit = order.find(([id, ok]) => ok && !this.seen[id]);
    if (hit) this.tip(hit[0]);
  }

  private next() {
    const id = this.queue.shift();
    if (!id) { this.toast.hidden = true; return; }
    const t = TIPS[id];
    this.toast.hidden = false;
    this.toast.classList.toggle('still', this.reduceMotion);
    this.toast.innerHTML = `<div class="g-text"><b>${t.title}</b><span>${t.body}</span></div><button class="g-x" aria-label="Dismiss tip">Got it</button>`;
    this.toast.querySelector('.g-x')!.addEventListener('click', () => this.dismiss());
    window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => this.dismiss(), 12000);
  }

  dismiss() {
    window.clearTimeout(this.timer);
    this.toast.hidden = true;
    if (this.queue.length) this.timer = window.setTimeout(() => this.next(), 250);
  }

  // ------------------------------------------------------------ performance review
  /** Build a "performance review" card for the death screen. */
  review(floor: number, firstDeath: boolean): string {
    const s = this.stats;
    const flaws: { why: string; fix: string }[] = [];
    const totalLost = s.attackDmg + s.hazardDmg + s.selfDmg;
    if (s.attackDmg >= 4 && s.attackDmg >= totalLost * 0.5) {
      flaws.push({ why: `Took ${s.attackDmg} damage from telegraphed attacks (${s.attackHits} hits). The red tiles were a suggestion you declined.`, fix: 'Before ending a turn, check the red tiles: step off them, or shove enemies so they hit each other. Stunning or freezing an attacker cancels its swing.' });
    }
    if (s.selfDmg >= 3) {
      flaws.push({ why: `Hurt yourself for ${s.selfDmg} with recoil and bumps.`, fix: 'Cast from a spot with room behind you, or buy Rubber Robes / Padded Hat at the Academy.' });
    }
    if (s.hazardDmg >= 3) {
      flaws.push({ why: `Lost ${s.hazardDmg} HP to hazards (fire, mould, shards).`, fix: 'Do not end turns on hazard tiles. Hover or tap a tile to inspect it.' });
    }
    if (s.casts >= 3 && s.envEvents === 0) {
      flaws.push({ why: 'Never used the environment: no explosions, slips or friendly fire.', fix: 'Grease, water and cabbage crates do more work than most spells. Push enemies into them.' });
    }
    if (s.idleTurns >= 2) {
      flaws.push({ why: `Skipped ${s.idleTurns} turns doing nothing.`, fix: 'Even a move that gets you out of a red tile counts. A cast every turn is free damage.' });
    } else if (s.turns >= 4 && s.casts < s.turns * 0.6) {
      flaws.push({ why: `Cast on only ${s.casts} of ${s.turns} turns.`, fix: 'Cards recharge over time; rotate between spells so one is always ready.' });
    }

    const need = MetaProgression.expectedPower(floor);
    const under = this.meta.power() < need;
    const goal = this.meta.nextGoal();

    let verdict: string, kind: string;
    if (flaws.length && under) { verdict = 'Mixed: sloppy play AND thin gear.'; kind = 'both'; }
    else if (flaws.length) { verdict = 'Likely cause: how you played this run, not your gear.'; kind = 'play'; }
    else if (under) { verdict = `Likely cause: under-equipped for floor ${floor}. Spend residue at the Academy.`; kind = 'gear'; }
    else { verdict = 'Likely cause: bad luck or a tough room. Try a different spell loadout.'; kind = 'luck'; }

    const lines = flaws.slice(0, 3).map(f => `<li><b>${f.why}</b><span>${f.fix}</span></li>`).join('');
    const goalHtml = goal
      ? `<p class="g-buy">Suggested purchase: <b>${goal.node.name}</b> (${goal.cost} residue${goal.affordable ? ', you can afford it now' : `, you have ${this.meta.data.residue}`}). <em>${goal.node.levels[this.meta.level(goal.node.id)]}</em></p>`
      : '';
    const first = firstDeath
      ? '<p class="g-first">First death? Normal. Residue is banked even when you die: spend it in the Academy below, then climb again. Cheap early picks: Rubber Robes, Tenure (+HP), Padded Hat.</p>'
      : '';
    return `<section class="guide-review ${kind}">
      <span class="eyebrow">Performance review · Floor ${floor}</span>
      <p class="g-verdict">${verdict}</p>
      ${first}
      ${lines ? `<ul class="g-flaws">${lines}</ul>` : ''}
      ${goalHtml}
    </section>`;
  }

  /** Insert the review after the death header. Returns false if the host is missing. */
  mountReview(host: Element | null, floor: number) {
    this.queue = [];
    this.dismiss();
    this.hideChip();
    if (!host) return false;
    const first = !this.seen['death'];
    this.seen['death'] = true;
    this.meta.save();
    host.insertAdjacentHTML('afterend', this.review(floor, first));
    return true;
  }
}
