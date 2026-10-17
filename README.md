# Accidental Archmage

**Play it in your browser: https://biggathanlife.github.io/accidental-archmage/**

A slapstick, isometric, turn-based tactical roguelite prototype built with **Three.js + TypeScript + Vite**.
You were hired as the janitor. Through a clerical error you are now the Archmage. Climb a procedural tower with
spells assembled from `[Delivery Method] + [Payload Element] + [Recoil / Side Effect]`.

## Run it

```bash
npm install
npm run dev          # http://localhost:5173 (also exposed on your LAN for phone testing)
npm run build        # typecheck + production build -> dist/
npm run build:single # one self-contained HTML file -> dist-single/index.html
```

## Controls

| Action | Mouse / keyboard | Touch |
|---|---|---|
| Walk | Click a green tile | Tap a green tile, then press **Walk here** (or tap near it again) |
| Cast | Click a card (or `1`–`5`), then a blue tile | Tap a card, tap a blue tile to preview the yellow area, then press **Cast here** (or tap near it again) |
| Cancel | `Esc` / right-click | "Cancel spell" button |
| End turn | `E` / `Enter` | End Turn button |
| Zoom | Mouse wheel | Pinch |
| Inspect | Hover any unit, prop or hazard | Tap it |

Each turn you get **one move and one cast**, in either order.

On touch screens, taps snap to the nearest valid tile, so a near-miss still selects the tile you meant, and the confirm button means you never have to hit the same small tile twice.

## Project layout

```
src/
  main.ts                    entry
  Game.ts                    controller: run lifecycle, input, selection, wiring
  core/
    SceneManager.ts          renderer, iso ortho camera at (20,20,20) → origin, lights/shadows, tweens, shake
    GridBoard.ts             8x8 board, raycast hover, highlight layers (move/range/path/area/telegraph), hazard decals
    EntityView.ts            low-poly primitive meshes (wizard cylinder, enemy cubes, props), animations, HP tags
    Effects.ts               particles, projectiles, rings, zaps, floating combat text
  game/
    types.ts                 grid math, statuses, seeded RNG
    GameState.ts             units, props, hazards, zones + queries
    DungeonGenerator.ts      procedural floors: rubble, water pools, grease, cabbage crates, vases, enemy rosters
    SpellResolver.ts         rules engine: damage, push/slide/bounce physics, chain reactions, spell + side-effect resolution
    TurnManager.ts           player → enemy (telegraphed attacks, then AI reposition) → environment phase
  spells/
    SpellComponents.ts       component library (seed data, tiered)
    SpellGenerator.ts        procedural spell composition + targeting geometry (range, area, displacement)
  meta/
    MetaProgression.ts       Unstable Mana Residue + Archmage Academy upgrade tree (localStorage)
  ui/
    HUD.ts                   stats, spell cards, End Turn, log, title / reward / death / Academy screens
```

## Systems

**Spells.** `SpellGenerator.compose()` derives name, range, area pattern, damage, displacement summary, cooldown
and a description from the three components. `getTargetTiles()` and `planSpell()` compute what can be targeted and
what gets hit for each delivery shape (cone, homing, overhead, 3-wide arc, 2x2 splash, 3x3 zone, piercing line,
projectile, pull, lob, stampede, self-centred, whole-floor, charge, chain, summon, trap). There are 27 deliveries,
25 payloads and 25 side effects (16,875 combinations); tier 0 is the core seed set from the design brief.

**Office Politics and Corporate Necromancy.** Two Academy branches (10 and 20 residue) each unlock 5 deliveries,
5 payloads and 5 side effects in a petty-office or dark-humour tone, built around tactical effects: a decoy every
enemy must attack (Printer Jam Golem), traps (Unwatered Office Plant), chains, executions (Performance Review),
charges, freezes that shatter for extra damage, delayed damage (Final Written Warning), death explosions, spreading
mould, enemies turned on each other (Imposter Syndrome), and side effects that grant a second move, a desk to hide
behind or an intern who takes a hit. Their components carry a `branch` field and only enter the pools once bought.

**Onboarding.** The first time you enter the tower, an HR memo explains that you are the janitor and have not been
trained; it can be re-read from How to play. The janitor's nervous thoughts appear in the log on the first floor.

**Telegraphs.** Enemies store an attack *pattern* and *facing*, not fixed tiles. Red tiles are recomputed whenever
anything moves, so shoving, sliding or turning an enemy (Gossip Wave turns them 180°) redirects its attack, often into
its colleagues. Guards strike the tile in front, Crossbow Clerks fire a 4-tile bolt that stops at the first blocker,
Bureaucrat Brutes sweep 3 tiles and have 1 defence.

**Environment.** Grease and banana peels make anything that lands on them keep sliding. Water pools conduct electric
spells (Fax Machine, Vacuum, Disco Ball) across the whole connected pool. Fire spreads through grease, evaporates water
and detonates crates. Cabbage crates explode in a 3x3, knock units outward and chain into other crates. Vases shatter
into shards (and pay out 1 residue in insurance fraud). Bumping into walls, props or units hurts both parties.

**Meta-progression.** Residue is earned from kills, cleared floors and broken vases, and is banked when you die.
The Academy has four branches:

- *Payload Synergy*: longer grease, longer cringe stuns, longer apologies, bigger cabbage blasts.
- *Casting Elasticity*: Rubber Robes reduce then remove recoil; Kinetic Rebate turns recoil into bonus damage; Padded Hat removes bump damage.
- *Component Mastery*: Kitchen Arts → Party Arts → Agricultural Siegecraft (Catapult, Summoned Livestock).
- *Starting Budget*: starter spells draw from tier-2 / tier-3 pools, a 4th starting spell, more max HP.

Clear a floor to pick one of three new spells (or take a nap for HP). The spellbook holds 5.

## Tuning hooks

- Enemy stats: `UNIT_TEMPLATES` in `GameState.ts`
- Floor composition: `DungeonGenerator.ts` (`enemyRoster`, hazard counts)
- Component numbers and text: `SpellComponents.ts`
- Upgrade costs and effects: `UPGRADES` / `bonuses()` in `MetaProgression.ts`
- `window.__aa` exposes the running game in the browser console for debugging.
