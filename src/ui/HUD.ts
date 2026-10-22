// DOM heads-up display: run stats, spell cards, End Turn, log, and the
// title / reward / death / Archmage Academy overlays.

import type { Spell } from '../spells/SpellGenerator';
import { BRANCHES, UPGRADES, MetaProgression, UpgradeNode } from '../meta/MetaProgression';
import type { Phase } from '../game/TurnManager';

export interface HudCallbacks {
  selectSpell(i: number): void;
  endTurn(): void;
  cancel(): void;
  startRun(): void;
  toggleSpeed(): void;
}

export interface HudStats {
  floor: number;
  roomTitle: string;
  hp: number;
  maxHp: number;
  residue: number;
  bank: number;
  turn: number;
  phase: Phase;
  hasMoved: boolean;
  hasCast: boolean;
  threats: number;
  speed: number;
}

const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

const SHAPE_ICON: Record<string, string> = {
  cone: '💨', homing: '🐦', targeted: '🎯', overhead: '⬇️', arc: '📣', single: '🎟️', splash2x2: '🍲', flood: '🌊', pull: '🌀',
  projectile: '📠', area3x3: '🪩', fireTarget: '🕯️', pierce: '👏', selfAoe: '🪗', path: '🧶', lob: '🏹', stampede: '🐄',
  global: '📧', dash: '🪑', chain: '📝', trap: '🪴',
};
const hex = (n: number) => '#' + (n & 0xffffff).toString(16).padStart(6, '0');
const chipsHtml = (s: Spell) =>
  `<span class="chip" title="Range / pattern">◎ ${esc(s.pattern)}</span>` +
  `<span class="chip ${s.damage > 0 ? 'dmg' : ''}" title="Damage">${s.damage > 0 ? '💥 ' + s.damage + ' dmg' : 'no dmg'}</span>` +
  (s.displacement !== 'None' ? `<span class="chip move" title="Displacement">↔ ${esc(s.displacement)}</span>` : '');

export class HUD {
  readonly stage: HTMLElement;
  readonly labels: HTMLElement;
  private el: Record<string, HTMLElement> = {};
  private logLines: string[] = [];
  selected = -1;
  private lastHp: number | null = null;
  private lastResidue: number | null = null;
  private toastTimer = 0;
  private lastPhase = '';
  private prevCd: number[] = [];

  constructor(root: HTMLElement, private cb: HudCallbacks) {
    root.innerHTML = `
      <div id="stage">
        <div id="labels"></div>
        <div id="top-stack" class="top-stack">
        <header id="topbar">
          <div class="floor-block" id="floor-block">
            <span class="eyebrow">Floor <b id="floor-num">1</b></span>
            <span id="room-title" class="room-title">—</span>
          </div>
          <div class="stat-row">
            <div class="hp" id="hp-box" title="Hit points"><span class="hp-heart">♥</span><div class="hp-bar"><i id="hp-fill"></i><b id="hp-text">12/12</b></div></div>
            <div class="residue" title="Unstable Mana Residue earned this run"><span class="eyebrow">Residue</span><b id="residue">0</b></div>
            <button id="speed-btn" class="ghost" title="Animation speed">1×</button>
          </div>
        </header>
        <div id="callouts" class="callouts">
          <div id="armed" class="armed" hidden></div>
          <div id="threat" class="threat" hidden></div>
          <div id="toast" class="toast" hidden></div>
        </div>
        </div>
        <div id="phase-pill" class="phase-pill">Your turn</div>
        <div id="hint" class="hint" hidden></div>
        <div id="confirm" class="confirm" hidden>
          <button id="confirm-x" class="confirm-x" aria-label="Cancel">✕</button>
          <button id="confirm-go" class="confirm-go">Confirm</button>
        </div>
        <div id="inspect" class="inspect" hidden></div>
      </div>
      <aside id="panel">
        <div class="panel-body">
          <div class="panel-head">
            <span class="eyebrow">Spellbook</span>
            <span id="action-state" class="action-state"></span>
          </div>
          <div id="spells" class="spells"></div>
          <div id="details" class="details"></div>
          <ol id="log" class="log" aria-live="polite"></ol>
        </div>
        <div class="actions">
          <button id="cancel-btn" class="ghost" hidden>Cancel spell</button>
          <button id="end-turn" class="end-turn">End Turn</button>
        </div>
      </aside>
      <div id="overlay" class="overlay" hidden></div>
    `;
    const ids = ['floor-num', 'room-title', 'hp-fill', 'hp-text', 'hp-box', 'armed', 'toast', 'residue', 'speed-btn', 'phase-pill', 'threat', 'hint', 'inspect',
      'confirm', 'confirm-go', 'confirm-x', 'action-state', 'spells', 'details', 'cancel-btn', 'end-turn', 'log', 'overlay'];
    for (const id of ids) this.el[id] = root.querySelector('#' + id)! as HTMLElement;
    this.stage = root.querySelector('#stage')!;
    this.labels = root.querySelector('#labels')!;
    this.el['end-turn'].addEventListener('click', () => cb.endTurn());
    this.el['cancel-btn'].addEventListener('click', () => cb.cancel());
    this.el['speed-btn'].addEventListener('click', () => cb.toggleSpeed());
  }

  // ------------------------------------------------------------ in-run HUD
  updateStats(s: HudStats) {
    this.el['floor-num'].textContent = String(s.floor);
    this.el['room-title'].textContent = s.roomTitle;
    this.el['hp-text'].textContent = `${Math.max(0, s.hp)}/${s.maxHp}`;
    (this.el['hp-fill'] as HTMLElement).style.width = `${Math.max(0, s.hp / s.maxHp) * 100}%`;
    this.el['hp-fill'].classList.toggle('low', s.hp <= s.maxHp * 0.34);
    if (this.lastHp !== null && s.hp !== this.lastHp) {
      const b = this.el['hp-box'];
      const cls = s.hp < this.lastHp ? 'hit' : 'heal';
      b.classList.remove('hit', 'heal'); void b.offsetWidth; b.classList.add(cls);
    }
    this.lastHp = s.hp;
    if (this.lastResidue !== null && s.residue > this.lastResidue) {
      const r = this.el['residue']; r.classList.remove('bump'); void r.offsetWidth; r.classList.add('bump');
    }
    this.lastResidue = s.residue;
    this.el['residue'].textContent = String(s.residue);
    this.el['speed-btn'].textContent = `${s.speed}×`;

    const pill = this.el['phase-pill'];
    const labels: Record<Phase, string> = {
      player: `Turn ${s.turn} · Your move`, enemy: 'Enemies are acting…', environment: 'The tower settles…',
      busy: 'Spell in progress…', won: 'Floor cleared!', lost: 'Oh dear.',
    };
    const tok = s.phase === 'player'
      ? `<span class="tok ${s.hasMoved ? 'used' : ''}">👣 Move</span><span class="tok ${s.hasCast ? 'used' : ''}">✨ Cast</span>` : '';
    pill.innerHTML = `<span class="pill-label">${labels[s.phase]}</span>${tok}`;
    if (this.lastPhase !== s.phase) { pill.classList.remove('flip'); void pill.offsetWidth; pill.classList.add('flip'); this.lastPhase = s.phase; }
    pill.dataset.phase = s.phase;

    const playerTurn = s.phase === 'player';
    (this.el['end-turn'] as HTMLButtonElement).disabled = !playerTurn;
    this.el['end-turn'].classList.toggle('pulse', playerTurn && s.hasMoved && s.hasCast);
    this.el['action-state'].innerHTML =
      `<span class="${s.hasMoved ? 'used' : ''}">${s.hasMoved ? '✓' : '○'} Move</span><span class="${s.hasCast ? 'used' : ''}">${s.hasCast ? '✓' : '○'} Cast</span>`;

    const t = this.el['threat'];
    t.hidden = !(playerTurn && s.threats > 0);
    t.textContent = s.threats > 0 ? `⚠ ${s.threats} enem${s.threats > 1 ? 'ies are' : 'y is'} aiming at your tile` : '';
  }

  renderSpells(hand: Spell[], canCast: boolean) {
    const host = this.el['spells'];
    host.innerHTML = hand.map((s, i) => {
      const cd = s.cooldownLeft > 0;
      const pct = cd ? Math.round((s.cooldownLeft / Math.max(1, s.cooldown)) * 100) : 0;
      const tip = cd ? `Recharging: ${s.cooldownLeft} turn${s.cooldownLeft > 1 ? 's' : ''} left` : '';
      return `
      <button class="card ${i === this.selected ? 'selected' : ''} ${cd ? 'cooling' : 'ready'}" data-i="${i}" style="--acc:${hex(s.payload.color)};--acc2:${hex(s.delivery.color)}" title="${esc(tip)}" ${cd || !canCast ? 'aria-disabled="true"' : ''} aria-pressed="${i === this.selected}">
        <span class="card-top"><span class="sigil" aria-hidden="true">${SHAPE_ICON[s.delivery.shape] ?? '✨'}</span><span class="name">${esc(s.name)}</span><span class="key">${i + 1}</span></span>
        <span class="formula"><b>${esc(s.delivery.noun)}</b> + <b>${esc(s.payload.name)}</b> + <b>${esc(s.side.tag)}</b></span>
        <span class="chips">${chipsHtml(s)}</span>
        <span class="cd-badge ${cd ? '' : 'rdy'}">${cd ? `⏳ ${s.cooldownLeft} turn${s.cooldownLeft > 1 ? 's' : ''} to recharge` : `Ready · recharge ${s.cooldown}`}</span>
        ${cd ? `<span class="cd-bar"><i style="width:${pct}%"></i></span>` : ''}
      </button>`;
    }).join('');
    const prev = this.prevCd;
    host.querySelectorAll<HTMLElement>('.card').forEach((c, i) => {
      if (prev.length === hand.length && prev[i] > 0 && hand[i].cooldownLeft === 0) c.classList.add('just-ready');
    });
    this.prevCd = hand.map(h => h.cooldownLeft);
    host.querySelector('.card.selected')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    host.querySelectorAll<HTMLButtonElement>('.card').forEach(b => {
      b.addEventListener('click', () => this.cb.selectSpell(Number(b.dataset.i)));
    });
    this.el['cancel-btn'].hidden = this.selected < 0;
    this.renderDetails(this.selected >= 0 ? hand[this.selected] : null);
  }

  renderDetails(s: Spell | null) {
    const d = this.el['details'];
    const armed = this.el['armed'];
    if (!s) {
      armed.hidden = true;
      d.classList.remove('has-spell');
      d.innerHTML = `<p class="muted">Pick a spell card, then a <span class="k-cast">blue</span> tile. Tap a <span class="k-move">green</span> tile to walk. <span class="k-tele">Red</span> tiles are where enemies strike next.</p>`;
      return;
    }
    d.classList.add('has-spell');
    d.style.setProperty('--acc', hex(s.payload.color));
    d.innerHTML = `
      <h3>${SHAPE_ICON[s.delivery.shape] ?? '✨'} ${esc(s.name)}</h3>
      <div class="chips">${chipsHtml(s)}</div>
      <p class="desc">${esc(s.description)}</p>
      <p class="side"><b>Always happens:</b> ${esc(s.side.text)}</p>
      <p class="flavor">“${esc(s.flavor)}”</p>`;
    armed.hidden = false;
    armed.style.setProperty('--acc', hex(s.payload.color));
    armed.innerHTML = `<b>${SHAPE_ICON[s.delivery.shape] ?? '✨'} ${esc(s.name)}</b><span class="mini">${s.damage > 0 ? s.damage + ' dmg · ' : ''}${esc(s.pattern)}</span>`;
  }

  private confirmCb: { go: () => void; cancel: () => void } | null = null;
  private confirmBound = false;

  /** Big confirm bar for touch: lets you commit without tapping the board again. */
  confirm(label: string | null, go?: () => void, cancel?: () => void) {
    if (!this.confirmBound) {
      this.confirmBound = true;
      this.el['confirm-go'].addEventListener('click', () => this.confirmCb?.go());
      this.el['confirm-x'].addEventListener('click', () => this.confirmCb?.cancel());
    }
    const c = this.el['confirm'];
    c.hidden = !label;
    this.el['phase-pill'].hidden = !!label;
    if (label && go && cancel) {
      this.el['confirm-go'].textContent = label;
      this.confirmCb = { go, cancel };
    } else this.confirmCb = null;
  }

  hint(text: string | null) {
    const h = this.el['hint'];
    h.hidden = !text;
    if (text) h.textContent = text;
  }

  inspect(html: string | null) {
    const i = this.el['inspect'];
    i.hidden = !html;
    if (html) i.innerHTML = html;
  }

  log(msg: string, cls = '') {
    this.logLines.unshift(`<li class="${cls}">${msg}</li>`);
    this.logLines = this.logLines.slice(0, 30);
    this.el['log'].innerHTML = this.logLines.join('');
    if (cls === 'bad' || cls === 'good' || cls === 'boom') {
      const t = this.el['toast'];
      t.className = 'toast ' + cls;
      t.innerHTML = msg;
      t.hidden = false;
      clearTimeout(this.toastTimer);
      this.toastTimer = window.setTimeout(() => { t.hidden = true; }, 3200);
    }
  }

  clearLog() { this.logLines = []; this.el['log'].innerHTML = ''; this.el['toast'].hidden = true; }

  // ------------------------------------------------------------ overlays
  private showOverlay(html: string) {
    const o = this.el['overlay'];
    o.innerHTML = `<div class="sheet">${html}</div>`;
    o.hidden = false;
    o.scrollTop = 0;
    return o;
  }

  hideOverlay() { this.el['overlay'].hidden = true; this.el['overlay'].innerHTML = ''; }

  showTitle(meta: MetaProgression, onStart: () => void, onAcademy: () => void, onMemo: () => void) {
    const d = meta.data;
    const o = this.showOverlay(`
      <div class="title-card">
        <span class="eyebrow">A slapstick tactical roguelite</span>
        <h1 class="game-title">Accidental<br/>Archmage</h1>
        <p class="lede">You were hired as the janitor. Through a clerical error you are now the Archmage. Ascend the tower using spells that work <em>mostly</em> as intended.</p>
        <div class="title-actions">
          <button class="primary" id="t-start">Enter the Tower</button>
          <button class="secondary" id="t-academy">Archmage Academy <span class="pill">${d.residue} residue</span></button>
        </div>
        <dl class="ledger">
          <div><dt>Runs</dt><dd>${d.runs}</dd></div>
          <div><dt>Best floor</dt><dd>${d.bestFloor}</dd></div>
          <div><dt>Lifetime residue</dt><dd>${d.lifetimeResidue}</dd></div>
        </dl>
        <details class="howto">
          <summary>How to play</summary>
          <ul>
            <li>Each turn you may <b>move once</b> (green tiles) and <b>cast once</b>. Order is up to you.</li>
            <li>Spells are built as <b>Delivery + Payload + Side effect</b>. The side effect always happens. Plan around it.</li>
            <li><b>Red tiles</b> show where each enemy will strike on its turn. Push, turn or embarrass them out of it.</li>
            <li>Grease makes things slide. Water conducts electric spells. Cabbage crates explode. Vases are overpriced.</li>
            <li>When you die you keep your <b>Unstable Mana Residue</b> to spend at the Academy.</li>
            <li>On touch screens: tap a tile to preview, then press <b>Cast here</b> or <b>Walk here</b> (or tap near the same tile again). Near-misses snap to the closest valid tile.</li>
            <li>The Academy's <b>Office Politics</b> and <b>Corporate Necromancy</b> branches add 30 petty and dark spell components.</li>
          </ul>
          <button class="secondary memo-link" id="t-memo">Re-read the HR memo</button>
        </details>
      </div>`);
    o.querySelector('#t-start')!.addEventListener('click', onStart);
    o.querySelector('#t-academy')!.addEventListener('click', onAcademy);
    o.querySelector('#t-memo')!.addEventListener('click', onMemo);
  }

  /** The janitor's onboarding: shown once before the first run, and again from How to play. */
  showMemo(onDone: () => void, doneLabel = 'Sign here (reluctantly)') {
    const o = this.showOverlay(`
      <div class="memo">
        <div class="memo-head">
          <span class="eyebrow">Memo from HR</span>
          <h2>Re: Your promotion</h2>
        </div>
        <p>Due to a clerical error (Form 27-B, misfiled), you are now the <b>Archmage</b>. Your predecessor is "on leave." Do not ask.</p>
        <p>You have not been trained. The spellbook is mostly sticky notes. Spells are assembled from whatever was in the supply closet, and they will do <em>roughly</em> what they say.</p>
        <p>Please do not die on company time.</p>
        <p class="memo-sign">— HR<br/><span>cc: Facilities, Legal, your next of kin</span></p>
        <div class="title-actions"><button class="primary" id="m-ok">${esc(doneLabel)}</button></div>
      </div>`);
    o.querySelector('#m-ok')!.addEventListener('click', onDone);
  }

  showReward(floor: number, gained: number, options: Spell[], handFull: boolean, onPick: (i: number) => void, onNap: () => void) {
    const o = this.showOverlay(`
      <div class="banner-head"><span class="stamp">✔ Floor ${floor} cleared</span><span class="eyebrow">+${gained} residue banked</span>
      <h2>The stairwell has a vending machine</h2></div>
      <p class="lede">Pick one new spell for your book${handFull ? ' (your book is full, so you will swap one out)' : ''}, or take a nap.</p>
      <div class="reward-grid">
        ${options.map((s, i) => `
          <button class="reward" data-i="${i}" style="--acc:${hex(s.payload.color)}">
            <span class="reward-top"><span class="sigil" aria-hidden="true">${SHAPE_ICON[s.delivery.shape] ?? '✨'}</span><span class="name">${esc(s.name)}</span></span>
            <span class="formula"><b>${esc(s.delivery.noun)}</b> + <b>${esc(s.payload.name)}</b> + <b>${esc(s.side.tag)}</b></span>
            <span class="chips">${chipsHtml(s)}<span class="chip">⏳ ${s.cooldown}</span></span>
            <span class="desc">${esc(s.description)}</span>
          </button>`).join('')}
        <button class="reward nap" id="r-nap">
          <span class="reward-top"><span class="sigil">💤</span><span class="name">Take a nap on the landing</span></span>
          <span class="desc">Restore 5 HP. Nobody will notice. Probably.</span>
        </button>
      </div>`);
    o.querySelectorAll<HTMLButtonElement>('.reward[data-i]').forEach(b => b.addEventListener('click', () => onPick(Number(b.dataset.i))));
    o.querySelector('#r-nap')!.addEventListener('click', onNap);
  }

  showReplace(newSpell: Spell, hand: Spell[], onReplace: (i: number) => void, onSkip: () => void) {
    const o = this.showOverlay(`
      <span class="stamp">📖 Spellbook full</span>
      <h2>Tear out which page?</h2>
      <p class="lede">Making room for <b>${esc(newSpell.name)}</b>.</p>
      <div class="reward-grid">
        ${hand.map((s, i) => `
          <button class="reward" data-i="${i}" style="--acc:${hex(s.payload.color)}">
            <span class="reward-top"><span class="sigil" aria-hidden="true">${SHAPE_ICON[s.delivery.shape] ?? '✨'}</span><span class="name">${esc(s.name)}</span></span>
            <span class="formula">${esc(s.formula)}</span>
          </button>`).join('')}
        <button class="reward nap" id="r-skip"><span class="name">Keep my book as it is</span></button>
      </div>`);
    o.querySelectorAll<HTMLButtonElement>('.reward[data-i]').forEach(b => b.addEventListener('click', () => onReplace(Number(b.dataset.i))));
    o.querySelector('#r-skip')!.addEventListener('click', onSkip);
  }

  showDeath(floor: number, earned: number, cause: string, meta: MetaProgression, onRestart: () => void, onTitle: () => void) {
    const o = this.showOverlay(`
      <div class="death-head">
        <span class="stamp bad">☠ Run over · Floor ${floor}</span>
        <h2>You have been accidentally deceased</h2>
        <p class="lede">${esc(cause)} You keep <b>${earned}</b> Unstable Mana Residue, which is now soaking into the Academy carpet.</p>
      </div>
      <div id="academy-host"></div>
      <div class="title-actions">
        <button class="primary" id="d-again">Climb again</button>
        <button class="secondary" id="d-title">Back to title</button>
      </div>`);
    this.renderAcademy(o.querySelector('#academy-host')!, meta);
    o.querySelector('#d-again')!.addEventListener('click', onRestart);
    o.querySelector('#d-title')!.addEventListener('click', onTitle);
  }

  showAcademy(meta: MetaProgression, onBack: () => void) {
    const o = this.showOverlay(`
      <div id="academy-host"></div>
      <div class="title-actions"><button class="primary" id="a-back">Done</button></div>`);
    this.renderAcademy(o.querySelector('#academy-host')!, meta);
    o.querySelector('#a-back')!.addEventListener('click', onBack);
  }

  renderAcademy(host: HTMLElement, meta: MetaProgression) {
    const nodeHtml = (n: UpgradeNode) => {
      const lv = meta.level(n.id);
      const cost = meta.nextCost(n);
      const locked = meta.isLocked(n);
      const maxed = cost === null;
      const affordable = meta.canBuy(n);
      const req = n.requires ? UPGRADES.find(u => u.id === n.requires!.id)! : null;
      return `
        <div class="node ${maxed ? 'maxed' : ''} ${locked ? 'locked' : ''}">
          <div class="node-head">
            <span class="node-name">${esc(n.name)}</span>
            <span class="lv">${n.costs.map((_, i) => `<i class="${i < lv ? 'on' : ''}"></i>`).join('')}</span>
          </div>
          <p class="node-desc">${esc(maxed ? n.levels[n.levels.length - 1] : n.levels[lv])}</p>
          ${locked && req ? `<p class="req">Requires ${esc(req.name)}${n.requires!.level > 1 ? ' ' + n.requires!.level : ''}</p>` : ''}
          <button class="buy" data-id="${n.id}" ${affordable ? '' : 'disabled'}>${maxed ? 'Mastered' : `Enrol · ${cost}`}</button>
        </div>`;
    };
    host.innerHTML = `
      <div class="academy">
        <div class="academy-head">
          <div>
            <span class="eyebrow">The Archmage Academy</span>
            <h2>Continuing Education</h2>
          </div>
          <div class="bank"><span class="eyebrow">Residue to spend</span><b>${meta.data.residue}</b></div>
        </div>
        <div class="branches">
          ${BRANCHES.map(b => `
            <section class="branch branch-${b.id}">
              <h3>${esc(b.name)}</h3>
              <p class="motto">${esc(b.motto)}</p>
              ${UPGRADES.filter(u => u.branch === b.id).map(nodeHtml).join('')}
            </section>`).join('')}
        </div>
      </div>`;
    host.querySelectorAll<HTMLButtonElement>('.buy').forEach(btn => btn.addEventListener('click', () => {
      const node = UPGRADES.find(u => u.id === btn.dataset.id)!;
      if (meta.buy(node)) this.renderAcademy(host, meta);
    }));
  }

  showFloorIntro(floor: number, title: string, flavor: string) {
    const h = this.el['hint'];
    h.hidden = false;
    h.classList.add('banner');
    h.innerHTML = `<span class="eyebrow">Floor ${floor}</span><b>${esc(title)}</b><span>${esc(flavor)}</span>`;
    setTimeout(() => { h.classList.remove('banner'); h.hidden = true; }, 2600);
  }
}

/** Inspect-box snippet for a unit trait; Game.ts can append it: parts.push(traitHtml(TRAIT_INFO[u.trait])). */
export function traitHtml(info: { name: string; text: string } | undefined | null): string {
  return info ? `<span class="trait" title="${esc(info.name + ': ' + info.text)}"><b>${esc(info.name)}</b><span>${esc(info.text)}</span></span>` : '';
}
