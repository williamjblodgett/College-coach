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
| `js/data/teams-fbs.js` | — | All 136 FBS programs (2025 alignment) |
| `js/data/coaches.js` | `CoachData` | Real coaches, legends, create-a-coach config |

### Save compatibility (core invariant)

`GameEngine.deserialize()` deep-merges any saved object **over** a fresh-state
template, so keys added in later waves are always backfilled and **old saves
never break**. Unknown/future keys are preserved. Saves live in `localStorage`
(`gridiron-save-v1`) and can be exported/imported as JSON.

### Data tiering

Teams roll out by division as separate data files: **FBS first** (this wave),
then FCS, D-II, D-III. The engine treats divisions generically, so tiers drop in
without refactors. Logos use a color-monogram fallback with a drop-in PNG
pipeline — see [`images/logos/README.md`](images/logos/README.md) for the
pipeline and trademark/sourcing notes.

## Tests

Headless Playwright regression suite (chromium, service workers blocked). Asserts
engine math + dataset integrity **and** clicks through the real UI.

```bash
npm install        # installs playwright-core (uses pre-installed chromium)
npm test           # node tests/run.js
```

## Roadmap (built in vertical waves — one feature = one commit = one deploy)

1. ✅ **Foundation** — FBS data, coach roster + create-a-coach, setup flow, HQ, PWA, tests
2. ✅ **Season engine** — schedule, weekly sim, AP Top 25, conference titles, 12-team playoff + bowls, career rollover
3. ✅ **Game day broadcast** — drive-by-drive sim, TV score bug + field + ticker, momentum, live 4th-down/2pt/onside/tempo decisions
4. ✅ **Recruiting + portal + NIL** — roster/depth chart that drives ratings, weekly recruiting board, signing-day cutscene, NIL/facilities budget, transfer portal, offseason development
5. ✅ **Staff** — a 9-role coordinator/position-coach cabinet whose ratings boost offense/defense/special teams/recruiting/development, with a hiring market, staff budget, and loyalty (poaching + leak risk)
6. ✅ **Scandal / NCAA violations** — a risk-vs-reward compliance system: temptation events (recruiting violations, booster benefits, academic fraud, conduct, personal-conduct allegation) build hidden heat that can trigger investigations, sanctions (probation, scholarship losses, bowl bans, show-cause), AD hot seat, and firing — all consequence-focused
7. Job carousel / dynasty arc — offers, contracts, reputation that travels
8. Championship & bowl cutscenes
9–11. Data tiers: FCS → D-II → D-III

## License / assets

Game code is original. Team names, colors, and marks belong to their respective
schools; no trademarked logos are bundled (see the logos README). Coach ratings
are balance-only game values, not real-world evaluations.
