// Procedural spell component library (seed data).
// Tier 0 = the core seed set from the design brief. Higher tiers come from the
// extended library and are unlocked through the Archmage Academy.

export type Shape =
  | 'cone' | 'homing' | 'targeted' | 'overhead' | 'arc' | 'single'
  | 'splash2x2' | 'area3x3' | 'path' | 'pierce' | 'flood' | 'selfAoe'
  | 'fireTarget' | 'pull' | 'projectile' | 'lob' | 'stampede'
  | 'global' | 'dash' | 'chain' | 'summon' | 'trap';

export type DisplaceKind = 'none' | 'push' | 'pull' | 'turn' | 'pullToCaster' | 'inward' | 'outward';

/** Components that need an Academy branch: Office Politics (petty) or Corporate Necromancy (dark). */
export type ComponentBranch = 'politics' | 'necro';

export interface DeliveryDef {
  id: string;
  name: string;
  /** noun used in generated spell names */
  noun: string;
  shape: Shape;
  range: number;
  minRange?: number;
  baseDamage: number;
  displace: DisplaceKind;
  displaceDist: number;
  /** 0 = core, 1 = Kitchen Arts, 2 = Party Arts, 3 = Agricultural Siegecraft */
  tier: number;
  electric?: boolean;
  branch?: ComponentBranch;
  /** human-readable pattern, e.g. "2-tile cone" */
  pattern: string;
  blurb: string;
  color: number;
}

export interface PayloadDef {
  id: string;
  name: string;
  adj: string;
  tier: number;
  branch?: ComponentBranch;
  damage: number;
  blurb: string;
  color: number;
}

export interface SideDef {
  id: string;
  tier: number;
  branch?: ComponentBranch;
  text: string;
  /** short tag for the card */
  tag: string;
  /** rough "badness" — good drawbacks lower the cooldown */
  severity: number;
}

export const DELIVERIES: DeliveryDef[] = [
  // ---- Core seed set
  { id: 'sneeze', name: 'Aggressive Sneeze', noun: 'Sneeze', shape: 'cone', range: 2, baseDamage: 1, displace: 'push', displaceDist: 1, tier: 0, pattern: '2-tile cone', blurb: 'A nasal hurricane that shoves everything 1 tile back.', color: 0xb8f0ff },
  { id: 'pigeon', name: 'Sentient Pigeon', noun: 'Pigeon', shape: 'homing', range: 4, baseDamage: 1, displace: 'none', displaceDist: 0, tier: 0, pattern: 'homing, 4 tiles', blurb: 'Homes in on whoever is nearest the target tile. Has opinions.', color: 0x9aa3b5 },
  { id: 'armchair', name: 'Launched Armchair', noun: 'Recliner', shape: 'targeted', range: 3, baseDamage: 2, displace: 'push', displaceDist: 1, tier: 0, pattern: 'target, 3 tiles', blurb: 'Lands with authority, then stays there as cover.', color: 0xa0522d },
  { id: 'anvil', name: 'Interdimensional Anvil', noun: 'Anvil', shape: 'overhead', range: 1, baseDamage: 3, displace: 'none', displaceDist: 0, tier: 0, pattern: 'adjacent, overhead', blurb: 'Heavy crush. The target is too flat to move for a turn.', color: 0x5d6470 },
  { id: 'gossip', name: 'Gossip Wave', noun: 'Rumour', shape: 'arc', range: 3, baseDamage: 0, displace: 'turn', displaceDist: 0, tier: 0, pattern: '3-wide arc, 3 tiles', blurb: 'Everyone turns around to see who is talking. Redirects attacks!', color: 0xff9ad5 },
  { id: 'coupon', name: 'Aggressive Coupon', noun: 'Coupon', shape: 'single', range: 5, baseDamage: 0, displace: 'none', displaceDist: 0, tier: 0, pattern: 'single target, 5 tiles', blurb: 'Target spends their whole turn reading the fine print.', color: 0xfff27a },

  // ---- Kitchen Arts (tier 1)
  { id: 'soup', name: 'Suspiciously Heavy Soup Bowl', noun: 'Soup', shape: 'splash2x2', range: 2, baseDamage: 1, displace: 'none', displaceDist: 0, tier: 1, pattern: '2x2 splash, 2 tiles', blurb: 'Leaves a 2x2 puddle of mystery broth (counts as water).', color: 0xd9a35a },
  { id: 'firehose', name: 'Accidental Firehose', noun: 'Hose', shape: 'flood', range: 3, baseDamage: 0, displace: 'push', displaceDist: 1, tier: 1, pattern: '3-tile line', blurb: 'Floods a line with water and shoves anyone in it.', color: 0x5ab4ff },
  { id: 'vacuum', name: 'Overloaded Vacuum Cleaner', noun: 'Hoover', shape: 'pull', range: 3, baseDamage: 1, displace: 'pullToCaster', displaceDist: 3, tier: 1, electric: true, pattern: '3-tile pull line', blurb: 'Sucks the first victim right up to your feet. Sparks a bit.', color: 0xc04cff },
  { id: 'fax', name: 'Aggressive Fax Machine', noun: 'Fax', shape: 'projectile', range: 5, baseDamage: 2, displace: 'push', displaceDist: 1, tier: 1, electric: true, pattern: '5-tile projectile', blurb: 'High-speed paper. Electrified. Hits the first thing in line.', color: 0xf5f5f5 },

  // ---- Party Arts (tier 2)
  { id: 'disco', name: 'Floating Disco Ball', noun: 'Boogie', shape: 'area3x3', range: 3, baseDamage: 1, displace: 'none', displaceDist: 0, tier: 2, electric: true, pattern: '3x3 zone, pulses 3 turns', blurb: 'Hovers and pulses its payload for 3 turns. Electric groove.', color: 0xe0e0ff },
  { id: 'candelabra', name: 'Floating Candelabra', noun: 'Candelabra', shape: 'fireTarget', range: 4, baseDamage: 1, displace: 'none', displaceDist: 0, tier: 2, pattern: 'plus-shape fire, 4 tiles', blurb: 'Sets the target and its neighbours ablaze. Very gothic.', color: 0xffb347 },
  { id: 'applause', name: 'Sarcastic Applause', noun: 'Ovation', shape: 'pierce', range: 6, baseDamage: 1, displace: 'none', displaceDist: 0, tier: 2, pattern: '6-tile piercing line', blurb: 'Pierces every unit in a straight line with slow clapping.', color: 0xffe0b0 },
  { id: 'accordion', name: 'Haunted Accordion', noun: 'Squeezebox', shape: 'selfAoe', range: 0, baseDamage: 1, displace: 'inward', displaceDist: 1, tier: 2, pattern: 'around caster, radius 2', blurb: 'Wheezes everyone within 2 tiles 1 step toward you.', color: 0x8b5a2b },
  { id: 'carpet', name: 'Sentient Carpet', noun: 'Rug', shape: 'path', range: 4, baseDamage: 1, displace: 'push', displaceDist: 1, tier: 2, pattern: '4-tile ground path', blurb: 'Rolls over everything in a line, shoving it along.', color: 0xb3203a },

  // ---- Agricultural Siegecraft (tier 3)
  { id: 'catapult', name: 'Catapult', noun: 'Trebuchet', shape: 'lob', range: 6, minRange: 2, baseDamage: 3, displace: 'push', displaceDist: 1, tier: 3, pattern: 'lob, 2–6 tiles', blurb: 'Lobs over obstacles. You built it during the loading screen.', color: 0x7a5230 },
  { id: 'livestock', name: 'Summoned Livestock', noun: 'Cow', shape: 'stampede', range: 5, baseDamage: 2, displace: 'push', displaceDist: 2, tier: 3, pattern: '5-tile stampede', blurb: 'A cow charges a line, shoving everyone 2 tiles. Moo.', color: 0xffffff },

  // ---- Office Politics (Academy: petty components)
  { id: 'replyall', name: 'Reply-All Avalanche', noun: 'Reply-All', shape: 'global', range: 0, baseDamage: 1, displace: 'none', displaceDist: 0, tier: 0, branch: 'politics', pattern: 'every enemy on the floor', blurb: 'Hits every enemy on the floor. They are all now annoyed enough to move 1 extra tile.', color: 0x7ab8ff },
  { id: 'stapler', name: 'Stapler of Finality', noun: 'Stapler', shape: 'single', range: 2, baseDamage: 2, displace: 'none', displaceDist: 0, tier: 0, branch: 'politics', pattern: 'single target, 2 tiles', blurb: 'Staples the target to the floor: it cannot move or be pushed for 2 turns.', color: 0x9aa3b5 },
  { id: 'chair', name: 'Swivel Chair Joust', noun: 'Swivel Chair', shape: 'dash', range: 4, baseDamage: 1, displace: 'push', displaceDist: 2, tier: 0, branch: 'politics', pattern: 'charge up to 4 tiles', blurb: 'You ride a swivel chair up to 4 tiles in a line and ram the first thing you meet 2 tiles further.', color: 0x333a48 },
  { id: 'sticky', name: 'Passive-Aggressive Sticky Note', noun: 'Sticky Note', shape: 'chain', range: 4, baseDamage: 1, displace: 'none', displaceDist: 0, tier: 0, branch: 'politics', pattern: 'target + 2 jumps, 4 tiles', blurb: '"Per my last note..." Hits the target, then jumps to up to 2 more nearby.', color: 0xffe14a },
  { id: 'lostfound', name: 'Lost-and-Found Bin', noun: 'Lost-and-Found', shape: 'lob', range: 5, minRange: 2, baseDamage: 1, displace: 'push', displaceDist: 1, tier: 0, branch: 'politics', pattern: 'lob, 2-5 tiles', blurb: 'Lobbed over obstacles. The bin stays behind as cover, full of single gloves.', color: 0x3d7be0 },

  // ---- Corporate Necromancy (Academy: dark components)
  { id: 'plant', name: 'Unwatered Office Plant', noun: 'Ficus', shape: 'trap', range: 3, baseDamage: 2, displace: 'none', displaceDist: 0, tier: 0, branch: 'necro', pattern: 'trap, 3 tiles', blurb: 'Plants a dead ficus. It goes off when an enemy steps next to it, hitting everything around it except you.', color: 0x8a7a3a },
  { id: 'shredder', name: 'Paper Shredder of Due Process', noun: 'Shredder', shape: 'pull', range: 4, baseDamage: 2, displace: 'pull', displaceDist: 2, tier: 0, branch: 'necro', pattern: '4-tile pull line', blurb: 'Drags the first enemy in line 2 tiles toward you, feet first.', color: 0x5a5f6b },
  { id: 'golem', name: 'Printer Jam Golem', noun: 'Printer Golem', shape: 'summon', range: 3, baseDamage: 0, displace: 'none', displaceDist: 0, tier: 0, branch: 'necro', pattern: 'summon decoy, 3 tiles', blurb: 'Summons a jammed printer (4 HP) that every enemy must attack until it breaks. Anything next to it when it lands gets the payload.', color: 0xd8d8d8 },
  { id: 'review', name: 'Performance Review', noun: 'Review', shape: 'single', range: 5, baseDamage: 1, displace: 'none', displaceDist: 0, tier: 0, branch: 'necro', pattern: 'single target, 5 tiles', blurb: 'Instantly lets go of an enemy at 2 HP or less. Otherwise, a 1-damage "note for improvement".', color: 0xff3b30 },
  { id: 'firedrill', name: 'Fire Drill', noun: 'Fire Drill', shape: 'selfAoe', range: 0, baseDamage: 0, displace: 'outward', displaceDist: 2, tier: 0, branch: 'necro', pattern: 'around you, radius 2', blurb: 'Everyone within 2 tiles is shoved 2 tiles away from you. This is not a drill. It is a drill.', color: 0xff5a36 },
];

export const PAYLOADS: PayloadDef[] = [
  // ---- Core
  { id: 'embarrass', name: 'Extreme Embarrassment', adj: 'Mortifying', tier: 0, damage: 0, blurb: 'stuns for 1 turn out of second-hand cringe', color: 0xff6fa8 },
  { id: 'bald', name: 'Sudden Baldness', adj: 'Follicle-Stealing', tier: 0, damage: 1, blurb: 'enrages: +2 attack, but takes +1 damage from everything', color: 0xffd6a5 },
  { id: 'grease', name: 'Grease Splatter', adj: 'Greasy', tier: 0, damage: 0, blurb: 'coats the hit tile and neighbours in slippery grease', color: 0x6b4f1d },
  { id: 'cabbage', name: 'Explosive Cabbage', adj: 'Brassica-Laden', tier: 0, damage: 1, blurb: '3x3 cabbage blast for 2 damage, vegetables everywhere', color: 0x7ccf5a },
  { id: 'soap', name: 'Slippery Soap', adj: 'Sudsy', tier: 0, damage: 0, blurb: 'targets slide 3 tiles away from you', color: 0xc7f9ff },
  { id: 'apology', name: 'Polite Apology', adj: 'Apologetic', tier: 0, damage: 0, blurb: 'pacifies: target skips its next 2 attacks', color: 0xa8e6cf },

  // ---- Tier 1
  { id: 'dread', name: 'Existential Dread', adj: 'Nihilistic', tier: 1, damage: 0, blurb: 'roots for 2 turns while they question being a tower guard', color: 0x6a5acd },
  { id: 'tapdance', name: 'Spontaneous Tap Dancing', adj: 'Jazz-Handed', tier: 1, damage: 1, blurb: 'roots for 1 turn, shuffling in place', color: 0xffcc00 },
  { id: 'jelly', name: 'Jellybean Overload', adj: 'Sugar-Rushed', tier: 1, damage: 0, blurb: 'fills a 3x3 zone with sticky beans (half movement)', color: 0xff7eb6 },
  { id: 'coffee', name: 'Overpriced Coffee Spill', adj: 'Artisanal', tier: 1, damage: 1, blurb: 'burns feet: 1 damage per turn for 2 turns', color: 0x8b5a2b },
  { id: 'tickle', name: 'Ghostly Tickling', adj: 'Giggly', tier: 1, damage: 0, blurb: 'targets stagger 1 tile sideways laughing', color: 0xe8e8ff },

  // ---- Tier 2
  { id: 'rust', name: 'Instant Rust', adj: 'Corroding', tier: 2, damage: 1, blurb: 'permanent: target takes +1 damage for the encounter', color: 0xb7410e },
  { id: 'hiccups', name: 'Uncontrollable Hiccups', adj: 'Hiccuping', tier: 2, damage: 1, blurb: "interrupts the target's telegraphed attack", color: 0x9ad0ff },
  { id: 'glitter', name: 'Infinite Glitter', adj: 'Bedazzling', tier: 2, damage: 0, blurb: 'blinds: their next attack misses entirely', color: 0xfff3a0 },
  { id: 'slime', name: 'Sentient Slime Coating', adj: 'Gooey', tier: 2, damage: 1, blurb: 'knocks targets 4 tiles, bouncing off walls', color: 0x7fff7f },

  // ---- Office Politics
  { id: 'selfdoubt', name: 'Crippling Self-Doubt', adj: 'Self-Doubting', tier: 0, branch: 'politics', damage: 0, blurb: 'makes the target deal 2 less damage for 2 turns', color: 0x9b8fd6 },
  { id: 'burrito', name: 'Frozen Breakroom Burrito', adj: 'Freezer-Burnt', tier: 0, branch: 'politics', damage: 0, blurb: 'freezes the target for 2 turns; the next hit shatters it for +2 damage', color: 0xbfe8ff },
  { id: 'overtime', name: 'Mandatory Overtime', adj: 'Unpaid', tier: 0, branch: 'politics', damage: 1, blurb: 'halves the target movement for 3 turns', color: 0x6b6f7a },
  { id: 'positivity', name: 'Toxic Positivity', adj: 'Relentlessly Positive', tier: 0, branch: 'politics', damage: 0, blurb: 'heals the target 1, but it is too cheerful to attack for 2 turns', color: 0xffd1e8 },
  { id: 'cc', name: "Cc'd on Everything", adj: "Cc'd", tier: 0, branch: 'politics', damage: 1, blurb: 'also reaches the 2 nearest enemies: all take +1 damage for 2 turns', color: 0x7ab8ff },

  // ---- Corporate Necromancy
  { id: 'imposter', name: 'Imposter Syndrome', adj: 'Imposter', tier: 0, branch: 'necro', damage: 0, blurb: 'makes the other enemies think it is you, so they attack it for a turn', color: 0x5b3cc4 },
  { id: 'restructure', name: 'Restructuring', adj: 'Restructured', tier: 0, branch: 'necro', damage: 0, blurb: 'reassigns the target to the far side of the room', color: 0x2f3a4a },
  { id: 'committee', name: 'Death by Committee', adj: 'Committee-Approved', tier: 0, branch: 'necro', damage: 1, blurb: 'if the target dies within 3 turns, it explodes (3x3, 2 damage)', color: 0x7a2e3a },
  { id: 'mould', name: 'Fridge Mould', adj: 'Mouldy', tier: 0, branch: 'necro', damage: 0, blurb: 'grows mould that spreads each turn and hurts whoever stands in it', color: 0x6f8a3a },
  { id: 'warning', name: 'Final Written Warning', adj: 'Final', tier: 0, branch: 'necro', damage: 0, blurb: 'in 3 turns the target takes 4 damage. No appeals', color: 0x222222 },
];

export const SIDES: SideDef[] = [
  // ---- Core
  { id: 'recoil', tier: 0, tag: 'Recoil', severity: 2, text: '...and launches the caster 2 tiles backward (but the extra oomph adds +1 damage).' },
  { id: 'goose', tier: 0, tag: 'Goose', severity: 1, text: '...and summons a confused goose onto the board.' },
  { id: 'banana', tier: 0, tag: 'Bananas', severity: 1, text: '...and covers all surrounding tiles in banana peels.' },
  { id: 'discofire', tier: 0, tag: 'Disco Fire', severity: 2, text: '...and ignites any grease on the board into a massive disco fire.' },
  { id: 'apologize', tier: 0, tag: 'Sorry!', severity: 1, text: '...and forces the wizard to apologize loudly, dropping defense.' },
  { id: 'swap', tier: 0, tag: 'Swap', severity: 1, text: '...and swaps positions between the caster and the target.' },

  // ---- Tier 1
  { id: 'vase', tier: 1, tag: 'Vase', severity: 2, text: "...and drops a fragile, overpriced vase directly onto the caster's foot." },
  { id: 'sound', tier: 1, tag: 'BOING', severity: 1, text: '...and triggers a loud cartoon sound effect that alerts all enemies.' },
  { id: 'honey', tier: 1, tag: 'Bees', severity: 2, text: '...and coats the wizard in sticky honey, drawing nearby bees.' },
  { id: 'pink', tier: 1, tag: 'Neon Pink', severity: 1, text: "...and turns the caster's robes neon pink, increasing enemy aggression." },
  { id: 'cart', tier: 1, tag: 'Cart', severity: 0, text: '...and summons a floating shopping cart that blocks the next projectile.' },

  // ---- Tier 2
  { id: 'trip', tier: 2, tag: 'Trip', severity: 2, text: '...and makes the caster trip over their own beard, ending their turn.' },
  { id: 'confetti', tier: 2, tag: 'Confetti', severity: 1, text: '...and spawns an unexploded confetti bomb on a random neighbouring tile.' },
  { id: 'again', tier: 2, tag: 'Echo', severity: 0, text: '...and makes the wizard sneeze again, repeating the spell backwards.' },
  { id: 'shatter', tier: 2, tag: 'Shatter', severity: 1, text: '...and shatters all nearby glass, showering the arena with shards.' },

  // ---- Office Politics
  { id: 'calendar', tier: 0, branch: 'politics', tag: 'Double-Booked', severity: 1, text: '...and double-books you: your next spell takes 1 turn longer to recharge.' },
  { id: 'budget', tier: 0, branch: 'politics', tag: 'Budget Cuts', severity: 1, text: '...but with budget cuts: half damage, ready again next turn.' },
  { id: 'desk', tier: 0, branch: 'politics', tag: 'Desk Fort', severity: 0, text: '...and builds a desk behind you to hide behind.' },
  { id: 'teambuilding', tier: 0, branch: 'politics', tag: 'Team Building', severity: 1, text: '...and pulls every enemy 1 tile toward the target for a trust exercise.' },
  { id: 'coffee', tier: 0, branch: 'politics', tag: 'Coffee Run', severity: 0, text: '...and sends you on a coffee run: you may move again this turn.' },

  // ---- Corporate Necromancy
  { id: 'blame', tier: 0, branch: 'necro', tag: 'Blame Shift', severity: 0, text: '...and blames the nearest enemy, whose coworkers rough it up for 1 damage.' },
  { id: 'intern', tier: 0, branch: 'necro', tag: 'Intern', severity: 0, text: '...and summons an unpaid intern next to you who takes one hit, then quits.' },
  { id: 'exit', tier: 0, branch: 'necro', tag: 'Exit Interview', severity: 2, text: '...and holds your exit interview early: -1 max HP for the rest of this floor.' },
  { id: 'incident', tier: 0, branch: 'necro', tag: 'Incident', severity: 2, text: '...and resets "days since last accident" to 0: everyone, including you, takes 1 damage.' },
  { id: 'sludge', tier: 0, branch: 'necro', tag: 'Sludge', severity: 1, text: '...and spills toxic sludge on 3 random tiles. HR has been notified.' },
];

/** The Summon Familiar card (Academy: Summoning). Not part of the random pools. */
export const FAMILIAR_DELIVERY: DeliveryDef = { id: 'familiar', name: 'Summon Familiar', noun: 'Familiar', shape: 'summon', range: 2, baseDamage: 0, displace: 'none', displaceDist: 0, tier: 99, pattern: 'summon, 2 tiles', blurb: 'Summons a random magical familiar with a random flaw.', color: 0xb28cff };
export const NO_PAYLOAD: PayloadDef = { id: 'none', name: 'Mystery Creature', adj: '', tier: 99, damage: 0, blurb: '', color: 0xffffff };
export const NO_SIDE: SideDef = { id: 'none', tier: 99, tag: 'Fine Print', severity: 1, text: '...and something answers. It is not quite right.' };

/** Flavour quips used in spell descriptions and the combat log. */
export const QUIPS = {
  cast: [
    'The Academy would like to distance itself from this.',
    'Technically this counts as a spell.',
    'Your tenure committee is watching.',
    'Somewhere, a textbook burst into tears.',
    'Results may vary. Results will vary.',
    'Not covered by your wizard insurance.',
  ],
  kill: [
    'has been accidentally retired.',
    'leaves the tower in a huff (and a stretcher).',
    'files a formal complaint, posthumously.',
    'is now a cautionary tale.',
    'clocks out permanently.',
  ],
  goose: ['HONK.', 'HONK HONK.', 'The goose regrets nothing.', 'A goose has entered the chat.'],
  bump: ['BONK!', 'Clang!', 'Oof!', 'Thwump!'],
  wizardHurt: ['Ow, my dignity!', 'That will leave a mark on my CV.', 'Ouch! Worth it.', 'My beard!'],
  /** the janitor's thoughts during the first floor of a run */
  nervous: [
    'Which end of the wand is the pointy end?',
    "I'm sure this is in the manual somewhere.",
    'The last Archmage had decades of experience. I have a mop.',
    'If I keep casting, maybe nobody will ask for my credentials.',
    'Note to self: find out what "mana" is.',
    'Is it too late to go back to mopping?',
  ],
};
