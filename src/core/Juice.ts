import { SceneManager } from './SceneManager';
import { Effects } from './Effects';

/**
 * Presentation-only "impact juice": hit-stop, shake, slow-mo and callouts scaled by how big a moment is.
 * Everything here goes through SceneManager's animation clock (hit-stop / slow-mo count down in REAL time,
 * so the game always resumes) and is a no-op under prefers-reduced-motion. Budgets keep the total added
 * delay per burst of action modest (about 0.4s worst case).
 */
export class Juice {
  private windowStart = 0;
  private stopUsed = 0;   // ms of hit-stop spent in this window
  private slowUsed = 0;   // ms of slow-mo spent in this window
  private calloutKinds = new Set<string>();

  private static readonly STOP_BUDGET = 260;
  private static readonly SLOW_BUDGET = 260;
  private static readonly WINDOW_MS = 2500;

  constructor(private sm: SceneManager, private fx: Effects) {}

  /** Call at the start of a cast to refill budgets and allow callouts again. */
  beginCast() {
    this.windowStart = performance.now();
    this.stopUsed = 0; this.slowUsed = 0;
    this.calloutKinds.clear();
  }

  private refill() {
    if (performance.now() - this.windowStart > Juice.WINDOW_MS) this.beginCast();
  }

  private stop(ms: number) {
    this.refill();
    const take = Math.min(ms, Juice.STOP_BUDGET - this.stopUsed);
    if (take < 20) return;
    this.stopUsed += take;
    this.sm.hitStop(take);
  }

  /** A single hit landed. dmg drives freeze + shake; kills hit harder. */
  impact(dmg: number, kill: boolean) {
    if (this.sm.reduceMotion) return;
    this.stop(kill ? 75 + Math.min(dmg, 5) * 6 : 35 + Math.min(dmg, 5) * 9);
    this.sm.addShake(Math.min(0.28, 0.04 + dmg * 0.03 + (kill ? 0.08 : 0)));
  }

  /** A big blast (3x3, ring-sized). radius in tiles. */
  blast(radius: number) {
    this.sm.addShake(Math.min(0.4, 0.15 + radius * 0.08));
    this.sm.punch(0.02 + radius * 0.01);
  }

  /** Multi-kill / chain moment: slow-mo beat, camera punch and a callout (once per kind per cast). */
  bigMoment(kind: 'combo' | 'chain', n: number) {
    this.refill();
    const key = kind;
    const first = !this.calloutKinds.has(key + n);
    if (!first) return;
    this.calloutKinds.add(key + n);
    const text = kind === 'combo' ? `COMBO x${n}` : 'CHAIN REACTION';
    this.fx.callout(text, n >= 4 ? 3 : n >= 3 ? 2 : 1);
    if (this.sm.reduceMotion) return;
    const slow = Math.min(Juice.SLOW_BUDGET - this.slowUsed, 150 + n * 30);
    if (slow >= 60) { this.slowUsed += slow; this.sm.slowMo(0.4, slow); }
    this.sm.punch(0.04 + Math.min(n, 4) * 0.012);
    this.sm.addShake(0.15 + Math.min(n, 4) * 0.04);
  }
}
