# 🏈 Gridiron Dynasty

A **college football head-coaching career simulator** — build a career and a
dynasty, from a small program to a blue-blood job, a conference title, and a
national championship. Vanilla JS + HTML + CSS, **no build step, no framework,
no CDN**. Open `index.html` and play. Installable as a PWA.

**Live:** https://williamjblodgett.github.io/College-coach/

## Run locally

```bash
# any static server works; e.g.
python3 -m http.server 8017
# then open http://localhost:8017
```

Or just open `index.html` directly in a browser.

## Architecture

One global object per module, plain `<script>` tags, no bundler.

| File | Global | Responsibility |
|------|--------|----------------|
| `js/engine.js` | `GameEngine` | Serializable game state, rules, save/load with backfill |
| `js/ui.js` | `GameUI` | Screens + rendering (title → team → coach → HQ) |
| `js/data/teams.js` | `TeamData` | Division-tiered team registry |
| `js/data/teams-fbs.js` | — | All 136 FBS programs |
| `js/data/lower-divisions.js` | — | 96 original FCS, D-II, and D-III programs |
| `js/data/coaches.js` | `CoachData` | Real coaches, legends, create-a-coach config |
| `js/football.js` | `GameFootball` | Player stats, fatigue, injuries, morale, awards, draft decisions |
| `js/story.js` | `GameStory` | Roles, relationships, badges, press conferences |
| `js/world.js` | `GameWorld` | AI programs/coaches, news, rivalries, records, realignment |
| `js/tactics.js` | `GameTactics` | Weekly plans and deterministic regional weather |
| `js/saves.js` | `GameSaves` | Five IndexedDB slots, recovery snapshots, import/export |

### Save compatibility (core invariant)

`GameEngine.deserialize()` deep-merges any saved object **over** a fresh-state
template, so keys added in later waves are always backfilled and **old saves
never break**. Unknown/future keys are preserved. Saves live in `localStorage`
(`gridiron-save-v1`) and can be exported/imported as JSON.

### Data tiering

All four playable levels—FBS, FCS, D-II, and D-III—use the same generic season
engine. Lower-division schools are original fictional programs, supporting a
true unknown-assistant-to-blue-blood career without introducing additional
trademarked brands. Every team receives a deterministic, code-generated SVG
crest; optional licensed PNGs can still use the documented drop-in pipeline.

## Tests

Headless Playwright regression suite (chromium, service workers blocked). Asserts
engine math + dataset integrity **and** clicks through the real UI.

```bash
npm install        # installs playwright-core (uses pre-installed chromium)
npm test           # node tests/run.js
```

## Gridiron Dynasty 2.0

1. ✅ **Foundation** — FBS data, coach roster + create-a-coach, setup flow, HQ, PWA, tests
2. ✅ **Season engine** — schedule, weekly sim, AP Top 25, conference titles, 12-team playoff + bowls, career rollover
3. ✅ **Game day broadcast** — drive-by-drive sim, TV score bug + field + ticker, momentum, live 4th-down/2pt/onside/tempo decisions
4. ✅ **Recruiting + portal + NIL** — roster/depth chart that drives ratings, weekly recruiting board, signing-day cutscene, NIL/facilities budget, transfer portal, offseason development
5. ✅ **Staff** — a 9-role coordinator/position-coach cabinet whose ratings boost offense/defense/special teams/recruiting/development, with a hiring market, staff budget, and loyalty (poaching + leak risk)
6. ✅ **Scandal / NCAA violations** — a risk-vs-reward compliance system (now with an Off/Light/Realistic/Chaotic intensity setting): temptation events build hidden heat that can trigger investigations, sanctions (probation, scholarship losses, bowl bans, show-cause), AD hot seat, and firing — all consequence-focused
7. ✅ **Job carousel / dynasty arc** — contracts + salary + a personal wallet, end-of-season offers from bigger programs seeded by record/prestige/reputation, start-from-the-bottom, and a coach store to spend your salary
8. ✅ **Championship & bowl cutscene** — trophy presentation with team-colored confetti + career milestones
9. ✅ **Coach progression & notoriety** — coaching XP/levels, ability, name recognition, fame tiers, profile-gated job opportunities, unknown create-a-coach starts, explicit scandal payoffs, and richer fictional recruit identities
10. ✅ **Player football spine** — individual season/career statistics, box scores, fatigue, durability, injuries, morale, awards, records, and draft declarations
11. ✅ **Career stories** — assistant/coordinator starts, career badges, relationships, press conferences, enriched recruiting pitches/dealbreakers/visits/decommits
12. ✅ **Living world** — evolving AI programs, fictional AI coach turnover, persistent rivalry history, newsroom, conference realignment, and original lower-division ladders
13. ✅ **2.0 experience** — five save slots with recovery snapshots, difficulty presets, original SVG crests, weekly game plans, regional weather, install/update/offline UX, reduced motion, and sound controls

Every new career has a stable world seed. Results are reproducible within a save,
while recruiting identities, program strategies, injuries, headlines, coaching
changes, weather, and realignment create a different history in the next one.

## License / assets

Game code, generated crests, and lower-division programs are original. FBS team
names and colors belong to their respective schools; no trademarked school logos
are bundled (see the logos README). Coach ratings are balance-only game values,
not real-world evaluations.
