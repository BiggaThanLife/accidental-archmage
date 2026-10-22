// "What persists across runs": Unstable Mana Residue + The Archmage Academy upgrade tree.

export type BranchId = 'synergy' | 'elasticity' | 'mastery' | 'budget' | 'politics' | 'necro';

export interface UpgradeNode {
  id: string;
  branch: BranchId;
  name: string;
  /** one line per level */
  levels: string[];
  costs: number[];
  requires?: { id: string; level: number };
}

export interface Branch { id: BranchId; name: string; motto: string }

export const BRANCHES: Branch[] = [
  { id: 'synergy', name: 'Payload Synergy', motto: 'Make the bad things last longer.' },
  { id: 'elasticity', name: 'Casting Elasticity', motto: 'Bounce back. Literally.' },
  { id: 'mastery', name: 'Component Mastery', motto: 'New ways to deliver chaos.' },
  { id: 'budget', name: 'Starting Budget', motto: 'Better stationery, better spells.' },
  { id: 'politics', name: 'Office Politics', motto: 'Petty, effective, deniable.' },
  { id: 'necro', name: 'Corporate Necromancy', motto: 'Nobody survives the quarterly review.' },
];

export const UPGRADES: UpgradeNode[] = [
  // Payload Synergy — longer / stronger elements
  { id: 'grease', branch: 'synergy', name: 'Lingering Grease', costs: [8, 14], levels: ['Grease lasts +3 turns', 'Grease lasts +6 turns and spreads 1 tile further'] },
  { id: 'cringe', branch: 'synergy', name: 'Deep Cringe', costs: [10, 18], levels: ['Embarrassment stuns +1 turn', 'Embarrassment stuns +2 turns'] },
  { id: 'sorry', branch: 'synergy', name: 'Sincere Apologies', costs: [8, 14], levels: ['Apology pacifies +1 turn', 'Apology pacifies +2 turns'] },
  { id: 'cabbage', branch: 'synergy', name: 'Cabbage Patch', costs: [10, 18], levels: ['Cabbage blasts deal +1 damage', 'Cabbage blasts deal +2 damage'] },

  // Casting Elasticity — tame the recoil, then weaponise it
  { id: 'robes', branch: 'elasticity', name: 'Rubber Robes', costs: [6, 12], levels: ['Self-knockback reduced by 1', 'Self-knockback removed entirely'] },
  { id: 'rebate', branch: 'elasticity', name: 'Kinetic Rebate', costs: [14, 22], levels: ['Recoil spells deal +1 damage', 'Recoil spells deal +2 damage'], requires: { id: 'robes', level: 2 } },
  { id: 'hat', branch: 'elasticity', name: 'Padded Hat', costs: [8], levels: ['Take no bump damage when slammed into things'] },

  // Component Mastery — unlock delivery methods
  { id: 'kitchen', branch: 'mastery', name: 'Kitchen Arts', costs: [10], levels: ['Unlocks Soup Bowl, Firehose, Vacuum Cleaner, Fax Machine'] },
  { id: 'party', branch: 'mastery', name: 'Party Arts', costs: [16], levels: ['Unlocks Disco Ball, Candelabra, Applause, Accordion, Carpet'], requires: { id: 'kitchen', level: 1 } },
  { id: 'agri', branch: 'mastery', name: 'Agricultural Siegecraft', costs: [24], levels: ['Unlocks Catapult and Summoned Livestock'], requires: { id: 'party', level: 1 } },
  { id: 'summoning', branch: 'mastery', name: 'Summoning (Correspondence Course)', costs: [14], levels: ['Start every run with a Summon Familiar card: a random magical creature with a random, unhelpful flaw'] },

  // Starting Budget — better starter pools
  { id: 'petty', branch: 'budget', name: 'Petty Cash', costs: [8], levels: ['Starter spells draw from tier-2 payloads and side effects'] },
  { id: 'grant', branch: 'budget', name: 'Embezzled Grant', costs: [18], levels: ['Starter spells draw from the full tier-3 pools'], requires: { id: 'petty', level: 1 } },
  { id: 'pocket', branch: 'budget', name: 'Extra Pocket', costs: [12], levels: ['Start each run with a 4th spell'] },
  { id: 'tenure', branch: 'budget', name: 'Tenure', costs: [6, 12, 18], levels: ['+3 max HP', '+6 max HP', '+9 max HP'] },

  // Office Politics / Corporate Necromancy: each unlocks 5 deliveries, 5 payloads and 5 side effects
  { id: 'politics', branch: 'politics', name: 'Office Politics', costs: [10], levels: ['Unlocks Reply-All, Stapler, Swivel Chair, Sticky Note, Lost-and-Found; Self-Doubt, Frozen Burrito, Overtime, Toxic Positivity, Cc\'d; and 5 petty side effects'] },
  { id: 'necro', branch: 'necro', name: 'Corporate Necromancy', costs: [16], levels: ['Unlocks Office Plant, Shredder, Printer Golem, Performance Review, Fire Drill; Imposter Syndrome, Restructuring, Death by Committee, Fridge Mould, Final Warning; and 5 dark side effects'], requires: { id: 'politics', level: 1 } },
];

export interface MetaBonuses {
  greaseTurns: number;
  greaseSpread: number;
  embarrassStun: number;
  apologyTurns: number;
  cabbageDmg: number;
  recoilReduce: number;
  recoilDamage: number;
  paddedHat: boolean;
  deliveryTier: number;
  starterTier: number;
  starterCount: number;
  bonusHp: number;
  officePolitics: boolean;
  necromancy: boolean;
  summoning: boolean;
}

interface SaveData {
  residue: number;
  levels: Record<string, number>;
  runs: number;
  bestFloor: number;
  lifetimeResidue: number;
  memoSeen?: boolean;
  /** one-time guide tips already shown */
  tipsSeen?: Record<string, boolean>;
}

const STORAGE_KEY = 'accidental-archmage-save-v1';

export class MetaProgression {
  data: SaveData;

  constructor() {
    this.data = { residue: 0, levels: {}, runs: 0, bestFloor: 0, lifetimeResidue: 0 };
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) this.data = { ...this.data, ...JSON.parse(raw) };
    } catch { /* storage blocked: progress lives for this session only */ }
  }

  save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data)); } catch { /* ignore */ }
  }

  level(id: string) { return this.data.levels[id] ?? 0; }

  nextCost(node: UpgradeNode): number | null {
    const lv = this.level(node.id);
    return lv < node.costs.length ? node.costs[lv] : null;
  }

  isLocked(node: UpgradeNode) {
    return !!node.requires && this.level(node.requires.id) < node.requires.level;
  }

  canBuy(node: UpgradeNode) {
    const c = this.nextCost(node);
    return c !== null && !this.isLocked(node) && this.data.residue >= c;
  }

  buy(node: UpgradeNode): boolean {
    if (!this.canBuy(node)) return false;
    this.data.residue -= this.nextCost(node)!;
    this.data.levels[node.id] = this.level(node.id) + 1;
    this.save();
    return true;
  }

  /** Bank residue from a finished run. */
  bankRun(residue: number, floor: number) {
    this.data.residue += residue;
    this.data.lifetimeResidue += residue;
    this.data.runs += 1;
    this.data.bestFloor = Math.max(this.data.bestFloor, floor);
    this.save();
  }

  /** Total upgrade levels bought: a crude "how equipped are you" number. */
  power(): number {
    return UPGRADES.reduce((n, u) => n + this.level(u.id), 0);
  }

  /** Cheapest sensible next purchase (preferring a short list of survival upgrades), affordable or not. */
  nextGoal(prefer: string[] = ['robes', 'tenure', 'hat', 'pocket', 'petty', 'kitchen']): { node: UpgradeNode; cost: number; affordable: boolean } | null {
    const open = UPGRADES.filter(u => !this.isLocked(u) && this.nextCost(u) !== null);
    if (!open.length) return null;
    const pick = prefer.map(id => open.find(u => u.id === id)).find(Boolean)
      ?? open.sort((a, b) => this.nextCost(a)! - this.nextCost(b)!)[0];
    const cost = this.nextCost(pick)!;
    return { node: pick, cost, affordable: this.data.residue >= cost };
  }

  /** Upgrades a player is expected to have bought to be comfortable on a given floor. */
  static expectedPower(floor: number): number {
    return floor < 4 ? 0 : floor < 6 ? 2 : floor < 8 ? 4 : 6 + Math.floor((floor - 8) / 2);
  }

  reset() {
    this.data = { residue: 0, levels: {}, runs: 0, bestFloor: 0, lifetimeResidue: 0 };
    this.save();
  }

  bonuses(): MetaBonuses {
    const L = (id: string) => this.level(id);
    return {
      greaseTurns: L('grease') * 3,
      greaseSpread: L('grease') >= 2 ? 1 : 0,
      embarrassStun: L('cringe'),
      apologyTurns: L('sorry'),
      cabbageDmg: L('cabbage'),
      recoilReduce: L('robes'),
      recoilDamage: L('rebate'),
      paddedHat: L('hat') > 0,
      deliveryTier: L('agri') ? 3 : L('party') ? 2 : L('kitchen') ? 1 : 0,
      starterTier: L('grant') ? 2 : L('petty') ? 1 : 0,
      starterCount: L('pocket') ? 4 : 3,
      bonusHp: L('tenure') * 3,
      officePolitics: L('politics') > 0,
      necromancy: L('necro') > 0,
      summoning: L('summoning') > 0,
    };
  }
}
