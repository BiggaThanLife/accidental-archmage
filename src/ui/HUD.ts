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

export class HUD {
  readonly stage: HTMLElement;
  readonly labels: HTMLElement;
  private el: Record<string, HTMLElement> = {};
  private logLines: string[] = [];
  selected = -1;

  constructor(root: HTMLElement, private cb: HudCallbacks) {
    root.innerHTML = `
      <div id="stage">
        <div id="labels"></div>
        <header id="topbar">
          <div class="floor-block">
            <span class="eyebrow">Floor <b id="floor-num">1</b></span>
            <span id="room-title" class="room-title">—</span>
          </div>
          <div class="stat-row">
            <div class="hp" title="Hit points"><span class="eyebrow">HP</span><div class="hp-bar"><i id="hp-fill"></i></div><b id="hp-text">12/12</b></div>
            <div class="residue" title="Unstable Mana Residue earned this run"><span class="eyebrow">Residue</span><b id="residue">0</b></div>
            <button id="speed-btn" class="ghost" title="Animation speed">1×</button>
          </div>
        </header>
        <div id="phase-pill" class="phase-pill">Your turn</div>
        <div id="threat" class="threat" hidden></div>
        <div id="hint" class="hint" hidden></div>
        <div id="confirm" class="confirm" hidden>
          <button id="confirm-x" class="confirm-x" aria-label="Cancel">✕</button>
          <button id="confirm-go" class="confirm-go">Confirm</button>
        </div>
        <div id="inspect" class="inspect" hidden></div>
      </div>
      <aside id="panel">
        <div class="panel-head">
          <span class="eyebrow">Spellbook</span>
          <span id="action-state" class="action-state"></span>
        </div>
        <div id="spells" class="spells"></div>
        <div id="details" class="details"></div>
        <div class="actions">
          <button id="cancel-btn" class="ghost" hidden>Cancel spell</button>
          <button id="end-turn" class="end-turn">End Turn</button>
        </div>
        <ol id="log" class="log" aria-live="polite"></ol>
      </aside>
      <div id="overlay" class="overlay" hidden></div>
    `;
    const ids = ['floor-num', 'room-title', 'hp-fill', 'hp-text', 'residue', 'speed-btn', 'phase-pill', 'threat', 'hint', 'inspect',
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
    this.el['residue'].textContent = String(s.residue);
    this.el['speed-btn'].textContent = `${s.speed}×`;

    const pill = this.el['phase-pill'];
    const labels: Record<Phase, string> = {
      player: `Turn ${s.turn} · Your move`, enemy: 'Enemies are acting…', environment: 'The tower settles…',
      busy: 'Spell in progress…', won: 'Floor cleared!', lost: 'Oh dear.',
    };
    pill.textContent = labels[s.phase];
    pill.dataset.phase = s.phase;

    const playerTurn = s.phase === 'player';
    (this.el['end-turn'] as HTMLButtonElement).disabled = !playerTurn;
    this.el['end-turn'].classList.toggle('pulse', playerTurn && s.hasMoved && s.hasCast);
    this.el['action-state'].innerHTML =
      `<span class="${s.hasMoved ? 'used' : ''}">Move</span><span class="${s.hasCast ? 'used' : ''}">Cast</span>`;

    const t = this.el['threat'];
    t.hidden = !(playerTurn && s.threats > 0);
    t.textContent = s.threats > 0 ? `⚠ ${s.threats} enem${s.threats > 1 ? 'ies are' : 'y is'} aiming at your tile` : '';
  }

  renderSpells(hand: Spell[], canCast: boolean) {
    const host = this.el['spells'];
    host.innerHTML = hand.map((s, i) => {
      const cd = s.cooldownLeft > 0;
      return `
      <button class="card ${i === this.selected ? 'selected' : ''} ${cd ? 'cooling' : ''}" data-i="${i}" ${cd || !canCast ? 'aria-disabled="true"' : ''}>
        <span class="card-top"><span class="key">${i + 1}</span><span class="name">${esc(s.name)}</span></span>
        <span class="formula">${esc(s.delivery.name)} + ${esc(s.payload.name)} + ${esc(s.side.tag)}</span>
        <span class="chips">
          <span class="chip" title="Range / pattern">${esc(s.pattern)}</span>
          <span class="chip ${s.damage > 0 ? 'dmg' : ''}" title="Damage">${s.damage > 0 ? s.damage + ' dmg' : 'no dmg'}</span>
          ${s.displacement !== 'None' ? `<span class="chip" title="Displacement">${esc(s.displacement)}</span>` : ''}
        </span>
        <span class="cd-badge">${cd ? `Recharging · ${s.cooldownLeft}` : `Cooldown ${s.cooldown}`}</span>
      </button>`;
    }).join('');
    host.querySelectorAll<HTMLButtonElement>('.card').forEach(b => {
      b.addEventListener('click', () => this.cb.selectSpell(Number(b.dataset.i)));
    });
    this.el['cancel-btn'].hidden = this.selected < 0;
    this.renderDetails(this.selected >= 0 ? hand[this.selected] : null);
  }

  renderDetails(s: Spell | null) {
    const d = this.el['details'];
    if (!s) {
      d.innerHTML = `<p class="muted">Tap a spell, then a highlighted tile. Tap a <span class="k-move">green</span> tile to walk. <span class="k-tele">Red</span> tiles are where enemies will strike next.</p>`;
      return;
    }
    d.innerHTML = `
      <h3>${esc(s.name)}</h3>
      <p class="desc">${esc(s.description)}</p>
      <p class="flavor">“${esc(s.flavor)}”</p>`;
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
  }

  clearLog() { this.logLines = []; this.el['log'].innerHTML = ''; }

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
          <span class="eyebrow">Memo · Human Resources, Tower Administration</span>
          <h2>RE: Your promotion</h2>
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
      <span class="eyebrow">Floor ${floor} cleared · +${gained} residue</span>
      <h2>The stairwell has a vending machine</h2>
      <p class="lede">Pick one new spell for your book${handFull ? ' (your book is full, so you will swap one out)' : ''}, or take a nap.</p>
      <div class="reward-grid">
        ${options.map((s, i) => `
          <button class="reward" data-i="${i}">
            <span class="name">${esc(s.name)}</span>
            <span class="formula">${esc(s.formula)}</span>
            <span class="chips"><span class="chip">${esc(s.pattern)}</span><span class="chip ${s.damage > 0 ? 'dmg' : ''}">${s.damage > 0 ? s.damage + ' dmg' : 'no dmg'}</span>${s.displacement !== 'None' ? `<span class="chip">${esc(s.displacement)}</span>` : ''}<span class="chip">CD ${s.cooldown}</span></span>
            <span class="desc">${esc(s.description)}</span>
          </button>`).join('')}
        <button class="reward nap" id="r-nap">
          <span class="name">Take a nap on the landing</span>
          <span class="desc">Restore 5 HP. Nobody will notice. Probably.</span>
        </button>
      </div>`);
    o.querySelectorAll<HTMLButtonElement>('.reward[data-i]').forEach(b => b.addEventListener('click', () => onPick(Number(b.dataset.i))));
    o.querySelector('#r-nap')!.addEventListener('click', onNap);
  }

  showReplace(newSpell: Spell, hand: Spell[], onReplace: (i: number) => void, onSkip: () => void) {
    const o = this.showOverlay(`
      <span class="eyebrow">Spellbook full</span>
      <h2>Tear out which page?</h2>
      <p class="lede">Making room for <b>${esc(newSpell.name)}</b>.</p>
      <div class="reward-grid">
        ${hand.map((s, i) => `
          <button class="reward" data-i="${i}">
            <span class="name">${esc(s.name)}</span>
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
        <span class="eyebrow">Run over · Floor ${floor}</span>
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
