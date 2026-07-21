/* GRIDIRON DYNASTY — regression suite (Wave 1)
 * Serves the repo root over http and drives it with headless chromium.
 * Two layers: (a) engine/data math via page.evaluate; (b) real UI click-through.
 * Run: node tests/run.js
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright-core');
const { findChromium, ok, eq, group, summary } = require('./helper.js');

const ROOT = path.resolve(__dirname, '..');
const PORT = 8117;

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml', '.png': 'image/png'
};

function serve() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let p = decodeURIComponent(req.url.split('?')[0]);
      if (p === '/') p = '/index.html';
      const fp = path.join(ROOT, p);
      if (!fp.startsWith(ROOT) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) {
        res.writeHead(404); res.end('not found'); return;
      }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(fp)] || 'application/octet-stream' });
      fs.createReadStream(fp).pipe(res);
    });
    server.listen(PORT, () => resolve(server));
  });
}

(async () => {
  const server = await serve();
  const browser = await chromium.launch({ executablePath: findChromium(), args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 430, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    var t = m.text();
    // Expected by design: the logo drop-in pipeline probes images/logos/<id>.png
    // and falls back to the color monogram when absent (404). Not a real error.
    if (/Failed to load resource/i.test(t) && /logos\//.test(m.location().url || '')) return;
    if (/logos\/.+\.png/.test(t)) return;
    errors.push(t);
  });

  await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.GameEngine && window.TeamData && window.CoachData && window.GameUI);

  // ---------- (a) DATA INTEGRITY ----------
  group('FBS dataset integrity');
  const data = await page.evaluate(() => {
    const all = window.TeamData.byDivision('fbs');
    const ids = all.map(t => t.id);
    const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
    const badColor = all.filter(t => !/^#[0-9a-fA-F]{6}$/.test(t.colors[0]) || !/^#[0-9a-fA-F]{6}$/.test(t.colors[1]));
    const emptyConf = window.TeamData.conferences('fbs').filter(c => window.TeamData.byConference(c).length === 0);
    const badPrestige = all.filter(t => !(t.prestige >= 1 && t.prestige <= 10));
    // rivals that don't resolve to a known team
    const idset = {}; ids.forEach(i => idset[i] = true);
    const danglingRivals = [];
    all.forEach(t => (t.rivals || []).forEach(r => { if (!idset[r]) danglingRivals.push(t.id + '->' + r); }));
    return {
      count: all.length, dupes, badColor: badColor.map(t => t.id),
      confs: window.TeamData.conferences('fbs'), emptyConf,
      badPrestige: badPrestige.map(t => t.id), danglingRivals,
      missingFields: all.filter(t => !t.name || !t.nick || !t.conf || !t.city || !t.st || !t.stadium).map(t => t.id)
    };
  });
  ok(data.count >= 130, 'FBS team count >= 130 (got ' + data.count + ')');
  eq(data.dupes.length, 0, 'no duplicate team ids');
  eq(data.badColor.length, 0, 'all colors valid hex: ' + data.badColor.join(','));
  eq(data.emptyConf.length, 0, 'no empty conferences: ' + data.emptyConf.join(','));
  eq(data.badPrestige.length, 0, 'prestige in 1..10: ' + data.badPrestige.join(','));
  eq(data.missingFields.length, 0, 'no missing required fields: ' + data.missingFields.join(','));
  eq(data.danglingRivals.length, 0, 'all rival ids resolve: ' + data.danglingRivals.join(','));
  ok(data.confs.length >= 10, 'at least 10 conferences (got ' + data.confs.length + ')');

  group('Coach dataset integrity');
  const cd = await page.evaluate(() => {
    const C = window.CoachData;
    const all = C.real.concat(C.legends);
    const badRatings = all.filter(c => C.SKILLS.some(k => !(c.ratings[k] >= 0 && c.ratings[k] <= 100)));
    return {
      real: C.real.length, legends: C.legends.length,
      backgrounds: C.backgrounds.length, badRatings: badRatings.map(c => c.id),
      skills: C.SKILLS.length
    };
  });
  ok(cd.real >= 15, 'at least 15 real coaches (got ' + cd.real + ')');
  ok(cd.legends >= 10, 'at least 10 legends (got ' + cd.legends + ')');
  eq(cd.skills, 7, '7 skill categories');
  eq(cd.badRatings.length, 0, 'all coach ratings in 0..100');
  ok(cd.backgrounds >= 4, 'at least 4 create-a-coach backgrounds');

  // ---------- (a) ENGINE MATH ----------
  group('Engine state + save/load backfill');
  const eng = await page.evaluate(() => {
    const E = window.GameEngine;
    const results = {};
    // fresh state has required keys
    const fs0 = E.freshState();
    results.hasKeys = ['saveVersion','coach','team','career','season','roster','history','settings']
      .every(k => k in fs0);

    // newCareer wires team + coach
    const team = window.TeamData.get('alabama');
    const coach = { id: 'x', name: 'Test Coach', source: 'custom',
      ratings: { recruiting: 60, offense: 70, defense: 65, development: 55, discipline: 80, motivation: 75, media: 50 } };
    E.newCareer(coach, team);
    results.teamId = E.state.team.id;
    results.coachName = E.state.coach.name;
    results.screen = E.state.screen;
    results.repuIsNum = typeof E.state.career.reputation === 'number';

    // ratings clamp
    E.deserialize(JSON.stringify(Object.assign({}, E.state, { coach: Object.assign({}, E.state.coach, { ratings: Object.assign({}, E.state.coach.ratings, { offense: 999, defense: -50 }) }) })));
    results.clampHi = E.state.coach.ratings.offense;
    results.clampLo = E.state.coach.ratings.defense;

    // teamPower is a sane number
    results.power = E.teamPower(team, E.state.coach);

    // BACKFILL: an old save missing new keys should be repaired, values preserved
    const oldSave = { saveVersion: 1, coach: { name: 'Legacy Coach' }, team: { id: 'oregon' }, career: { wins: 7, losses: 2 } };
    E.deserialize(JSON.stringify(oldSave));
    results.backfillName = E.state.coach.name;         // preserved
    results.backfillWins = E.state.career.wins;         // preserved
    results.backfillHasSeason = !!E.state.season && Array.isArray(E.state.season.schedule); // backfilled
    results.backfillHasSettings = !!E.state.settings && E.state.settings.sound === true;      // backfilled default
    results.backfillRatingsDefault = E.state.coach.ratings.offense; // backfilled default 50

    // round-trip serialize/deserialize is stable
    const a = E.serialize();
    E.deserialize(a);
    results.roundTrip = E.serialize() === a;

    // unknown keys preserved
    E.deserialize(JSON.stringify(Object.assign({}, JSON.parse(a), { __future: { xp: 42 } })));
    results.futurePreserved = E.state.__future && E.state.__future.xp === 42;

    // garbage rejected
    results.rejectsGarbage = E.deserialize('not json') === null && E.deserialize('123') === null;
    return results;
  });
  ok(eng.hasKeys, 'freshState has all core keys');
  eq(eng.teamId, 'alabama', 'newCareer sets team id');
  eq(eng.coachName, 'Test Coach', 'newCareer sets coach name');
  eq(eng.screen, 'hq', 'newCareer lands on hq screen');
  ok(eng.repuIsNum, 'reputation is numeric');
  eq(eng.clampHi, 100, 'rating clamps high to 100');
  eq(eng.clampLo, 0, 'rating clamps low to 0');
  ok(eng.power > 20 && eng.power < 120, 'teamPower in sane range (got ' + eng.power + ')');
  eq(eng.backfillName, 'Legacy Coach', 'backfill preserves saved coach name');
  eq(eng.backfillWins, 7, 'backfill preserves saved career wins');
  ok(eng.backfillHasSeason, 'backfill adds missing season object');
  ok(eng.backfillHasSettings, 'backfill adds missing settings default');
  eq(eng.backfillRatingsDefault, 50, 'backfill fills default coach ratings');
  ok(eng.roundTrip, 'serialize/deserialize round-trips');
  ok(eng.futurePreserved, 'unknown/future keys preserved');
  ok(eng.rejectsGarbage, 'garbage input rejected (null)');

  // ---------- (b) UI CLICK-THROUGH ----------
  group('UI flow: title -> team -> coach -> HQ -> save/reload');
  // Clean slate.
  await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.GameUI);

  // Title screen
  await page.waitForSelector('.title-screen');
  ok(await page.isVisible('text=GRIDIRON DYNASTY'), 'title screen renders');

  // New Career
  await page.click('button:has-text("New Career")');
  await page.waitForSelector('.team-grid .team-card');
  const teamCount = await page.evaluate(() => document.querySelectorAll('.team-card').length);
  ok(teamCount > 100, 'team select lists many teams (got ' + teamCount + ')');

  // Filter by search then pick a specific team
  await page.fill('.input[type="search"]', 'Oregon');
  await page.waitForTimeout(60);
  const filtered = await page.evaluate(() => document.querySelectorAll('.team-card').length);
  ok(filtered >= 1 && filtered < 10, 'search filters team list (got ' + filtered + ')');
  await page.click('.team-card:has-text("Oregon Ducks"), .team-card:has-text("Oregon")');
  await page.click('button:has-text("Next: Choose Coach")');

  // Coach select — real tab
  await page.waitForSelector('.coach-grid .coach-card');
  await page.click('.coach-card:has-text("Kirby Smart")');
  // Switch to create-a-coach and build one
  await page.click('.tab:has-text("Create-a-Coach")');
  await page.waitForSelector('.builder');
  await page.fill('.builder .input[type="text"]', 'Coach Riley Vance');
  await page.click('.builder .chip:has-text("QB Guru")');
  // move a slider
  const slider = await page.$('.builder .range');
  await slider.focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await page.click('button:has-text("Start Career")');

  // HQ
  await page.waitForSelector('.hq');
  const hq = await page.evaluate(() => ({
    team: document.querySelector('.hq-team') ? document.querySelector('.hq-team').textContent : '',
    coach: document.querySelector('.hq-coach') ? document.querySelector('.hq-coach').textContent : '',
    stateCoach: window.GameEngine.state.coach.name,
    stateTeam: window.GameEngine.state.team.id,
    saved: window.GameEngine.hasSave()
  }));
  ok(/Oregon/.test(hq.team), 'HQ shows chosen team (' + hq.team + ')');
  ok(/Riley Vance/.test(hq.coach), 'HQ shows created coach (' + hq.coach + ')');
  eq(hq.stateCoach, 'Coach Riley Vance', 'state has created coach');
  eq(hq.stateTeam, 'oregon', 'state has chosen team');
  ok(hq.saved, 'career auto-saved to localStorage');

  // Reload -> Continue restores HQ
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.GameUI);
  await page.waitForSelector('.title-screen');
  await page.click('button:has-text("Continue Career")');
  await page.waitForSelector('.hq');
  const restored = await page.evaluate(() => window.GameEngine.state.team.id + '|' + window.GameEngine.state.coach.name);
  eq(restored, 'oregon|Coach Riley Vance', 'reload + Continue restores career');

  // Screenshot the HQ for the report.
  fs.mkdirSync(path.join(ROOT, 'tests/artifacts'), { recursive: true });
  await page.screenshot({ path: path.join(ROOT, 'tests/artifacts/hq.png'), fullPage: true });

  // ---------- (a) SEASON ENGINE ----------
  group('Season engine: schedule + sim + postseason + rollover');
  const se = await page.evaluate(() => {
    const E = window.GameEngine, S = window.GameSeason, T = window.TeamData;
    E.newCareer({ id: 'c', name: 'Sim Coach', source: 'custom',
      ratings: { recruiting: 70, offense: 80, defense: 75, development: 70, discipline: 70, motivation: 70, media: 60 } },
      T.get('oregon'));
    S.start(E.state);
    const s = E.state.season;
    const teams = S.leagueTeams(E.state);

    // schedule invariants
    const busy = {}; teams.forEach(t => busy[t.id] = {});
    let weekConflicts = 0, maxGames = 0;
    const per = {}; teams.forEach(t => per[t.id] = 0);
    s.schedule.forEach(g => {
      per[g.home]++; per[g.away]++;
      if (busy[g.home][g.week] || busy[g.away][g.week]) weekConflicts++;
      busy[g.home][g.week] = 1; busy[g.away][g.week] = 1;
    });
    teams.forEach(t => { maxGames = Math.max(maxGames, per[t.id]); });
    const playerGames = S.playerGames(E.state).length;

    // sim regular season
    let guard = 0; while (s.phase === 'regular' && guard++ < 40) S.simWeek(E.state);
    const unplayed = s.schedule.filter(g => !g.played).length;
    let W = 0, L = 0; Object.keys(s.league).forEach(id => { W += s.league[id].w; L += s.league[id].l; });

    const conf = S.playConfChamps(E.state);
    const post = S.playPostseason(E.state);
    const champion = s.postseason.champion;
    const seeds = s.postseason.cfpSeeds.length;

    const careerBefore = { w: E.state.career.wins, seasons: E.state.career.seasonsCoached, year: E.state.career.year };
    const sum = S.finish(E.state);
    const careerAfter = { w: E.state.career.wins, seasons: E.state.career.seasonsCoached, year: E.state.career.year,
      hist: E.state.history.length, phase: E.state.season.phase, started: E.state.season.started };

    return { teams: teams.length, weekConflicts, maxGames, playerGames, unplayed, W, L,
      confGames: conf.length, seeds, champion, bowls: s.postseason.bowls.length,
      playerRec: sum, careerBefore, careerAfter };
  });
  eq(se.teams, 136, 'season simulates all 136 FBS teams');
  eq(se.weekConflicts, 0, 'no team plays twice in one week');
  eq(se.maxGames, 12, 'teams play at most a 12-game slate');
  ok(se.playerGames >= 11 && se.playerGames <= 12, 'player has a full ~12-game schedule (got ' + se.playerGames + ')');
  eq(se.unplayed, 0, 'every regular-season game gets played');
  eq(se.W, se.L, 'league wins equal losses (records consistent)');
  ok(se.confGames >= 6, 'conference title games are played (got ' + se.confGames + ')');
  eq(se.seeds, 12, '12-team playoff bracket seeded');
  ok(!!se.champion, 'a national champion is crowned (' + se.champion + ')');
  ok(se.bowls >= 10, 'bowl slate is populated (got ' + se.bowls + ')');
  eq(se.careerAfter.seasons, se.careerBefore.seasons + 1, 'finish() increments seasons coached');
  eq(se.careerAfter.year, se.careerBefore.year + 1, 'finish() advances the year');
  eq(se.careerAfter.w, se.careerBefore.w + se.playerRec.wins, 'season wins roll into career total');
  eq(se.careerAfter.hist, 1, 'season summary archived to history');
  eq(se.careerAfter.started, false, 'season resets to preseason after finish');

  group('Save backfill: wave-1 save gains the season schema');
  const bf = await page.evaluate(() => {
    const E = window.GameEngine;
    // A save shaped like Wave 1 (no season.phase/league/rankings keys).
    const old = { saveVersion: 1, coach: { name: 'Legacy' }, team: { id: 'georgia', division: 'fbs' },
      career: { wins: 3, losses: 1, year: 2025 }, season: { started: false, week: 0, schedule: [], results: [], record: { wins: 0, losses: 0, confWins: 0, confLosses: 0 } } };
    E.deserialize(JSON.stringify(old));
    const s = E.state.season;
    return { phase: s.phase, hasLeague: !!s.league && typeof s.league === 'object',
      hasRankings: Array.isArray(s.rankings), hasPost: !!s.postseason && Array.isArray(s.postseason.cfpSeeds),
      keptWins: E.state.career.wins };
  });
  eq(bf.phase, 'preseason', 'backfill adds season.phase default');
  ok(bf.hasLeague, 'backfill adds season.league');
  ok(bf.hasRankings, 'backfill adds season.rankings');
  ok(bf.hasPost, 'backfill adds season.postseason.cfpSeeds');
  eq(bf.keptWins, 3, 'backfill preserves saved career wins');

  // ---------- (b) SEASON UI CLICK-THROUGH ----------
  group('UI: start season -> sim -> playoff -> summary -> next season');
  await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.GameUI);
  await page.waitForSelector('.title-screen');
  await page.click('button:has-text("New Career")');
  await page.waitForSelector('.team-card');
  await page.fill('.input[type="search"]', 'Georgia Bulldogs');
  await page.waitForTimeout(80);
  // The search narrows to exactly the Georgia Bulldogs card.
  await page.click('.team-card');
  const pickedGeorgia = await page.evaluate(() => window.GameUI._pick().team && window.GameUI._pick().team.id);
  eq(pickedGeorgia, 'georgia', 'search + click selects Georgia');
  await page.click('button:has-text("Next: Choose Coach")');
  await page.waitForSelector('.coach-card');
  await page.click('.coach-card:has-text("Kirby Smart")');
  await page.click('button:has-text("Start Career")');
  await page.waitForSelector('.hq');

  // Enter the season
  await page.click('button:has-text("Start the")');
  await page.waitForSelector('.season .season-tabs');
  ok(await page.isVisible('button:has-text("Sim to Postseason")'), 'season hub shows weekly controls');

  // Quick-sim one week (player's game auto-simmed), then fast-forward.
  await page.click('button:has-text("Quick Sim"), button:has-text("Advance Week")');
  await page.waitForSelector('.result-banner, .scoreboard');
  await page.click('button:has-text("Sim to Postseason")');
  await page.waitForSelector('button:has-text("Play Championship Games")');
  await page.click('button:has-text("Play Championship Games")');
  await page.waitForSelector('button:has-text("Run the Playoff")');
  await page.click('button:has-text("Run the Playoff")');
  await page.waitForSelector('.champ-banner');
  ok(await page.isVisible('.champ-banner'), 'national champion banner shows after playoff');

  // Check the schedule + rankings tabs render
  await page.click('.season-tabs .tab:has-text("Top 25")');
  await page.waitForSelector('.rank-row');
  const rankCount = await page.evaluate(() => document.querySelectorAll('.rank-row').length);
  eq(rankCount, 25, 'Top 25 renders exactly 25 teams');
  await page.click('.season-tabs .tab:has-text("Schedule")');
  await page.waitForSelector('.sch-row');

  // Finish the season -> summary -> next season
  await page.click('.season-tabs .tab:has-text("This Week")');
  await page.click('button:has-text("Finish Season")');
  await page.waitForSelector('.summary-card');
  const summaryYear = await page.evaluate(() => document.querySelector('.sum-year').textContent);
  ok(/2025/.test(summaryYear), 'summary shows the completed 2025 season');
  await page.click('.summary-card button:has-text("Start 2026 Season")');
  await page.waitForSelector('.season .season-tabs');
  const nextYear = await page.evaluate(() => window.GameEngine.state.season.year);
  eq(nextYear, 2026, 'next season starts in 2026');

  await page.screenshot({ path: path.join(ROOT, 'tests/artifacts/season.png'), fullPage: true });

  // ---------- (a) GAME-DAY SIM ENGINE ----------
  group('Game Day: broadcast sim engine');
  const gs = await page.evaluate(() => {
    const S = window.GameSim;
    let bad = 0, nolog = 0, sum = 0;
    for (let i = 0; i < 150; i++) {
      const g = S.create({ seed: i + 11, home: { id: 'ohiostate', off: 78, def: 80, isPlayer: false },
        away: { id: 'michigan', off: 80, def: 78, isPlayer: false } });
      const r = S.simRemaining(g);
      if (!r || r.homeScore === r.awayScore || r.homeScore < 0 || r.awayScore < 0 || r.homeScore > 99 || r.awayScore > 99) bad++;
      if (!g.log.length) nolog++;
      sum += r.homeScore + r.awayScore;
    }
    const rt = S.ratingsFor({ rating: 70 }, { ratings: { offense: 92, defense: 50, development: 70, discipline: 70 } }, true);
    return { bad, nolog, avg: sum / 150, offHi: rt.off > 72, defLo: rt.def < 68 };
  });
  eq(gs.bad, 0, '150 simmed games all valid with a winner');
  eq(gs.nolog, 0, 'every game produces a play-by-play log');
  ok(gs.avg > 24 && gs.avg < 80, 'combined scoring is realistic (avg ' + gs.avg.toFixed(1) + ')');
  ok(gs.offHi && gs.defLo, 'coach off/def ratings shape the team units');

  // ---------- (b) GAME-DAY UI CLICK-THROUGH ----------
  group('Game Day UI: coach a game -> final -> commit');
  await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.GameUI && window.GameSim);
  const gameWeek = await page.evaluate(() => {
    const E = window.GameEngine, S = window.GameSeason, T = window.TeamData;
    E.newCareer({ id: 'c', name: 'Coach Vance', source: 'custom',
      ratings: { recruiting: 75, offense: 88, defense: 82, development: 75, discipline: 72, motivation: 78, media: 65 } }, T.get('oregon'));
    S.start(E.state);
    const first = S.playerGames(E.state)[0];
    E.state.season.week = first.week;         // jump to a week the player actually plays
    E.state.screen = 'season';
    window.GameUI.renderSeason();
    return first.week;
  });
  await page.waitForSelector('.season-tabs');
  await page.click('button:has-text("Coach This Game")');
  await page.waitForSelector('.field');
  ok(await page.isVisible('.bug'), 'broadcast score bug renders');
  ok(await page.isVisible('.momentum'), 'momentum meter renders');

  // Play some plays, resolving any coaching decisions that pop up.
  let sawDecision = false;
  for (let i = 0; i < 22; i++) {
    if (await page.$('.decision-card')) { sawDecision = true; await page.click('.dc-opt'); }
    else if (await page.$('button:has-text("Next Play")')) { await page.click('button:has-text("Next Play")'); }
    await page.waitForTimeout(15);
    if (await page.$('.final-card')) break;
  }
  const tickers = await page.evaluate(() => document.querySelectorAll('.tk-line').length);
  ok(tickers > 5, 'play-by-play ticker populates (got ' + tickers + ')');

  // Finish the game and commit.
  if (!(await page.$('.final-card'))) await page.click('button:has-text("Sim to Final")');
  await page.waitForSelector('.final-card');
  await page.screenshot({ path: path.join(ROOT, 'tests/artifacts/gameday.png'), fullPage: true });
  await page.click('.final-card button:has-text("Continue")');
  await page.waitForSelector('.season-tabs');
  const post = await page.evaluate((wk) => {
    const E = window.GameEngine, S = window.GameSeason;
    const pg = S.playerGames(E.state).filter(g => g.week === wk)[0];
    const otherPlayed = S.gamesInWeek(E.state, wk).every(g => g.played);
    return { week: E.state.season.week, played: pg.played, rec: E.state.season.record.wins + E.state.season.record.losses, otherPlayed };
  }, gameWeek);
  eq(post.week, gameWeek + 1, 'coaching a game advances the week');
  ok(post.played, 'player game is marked played after the broadcast');
  eq(post.rec, 1, 'season record reflects the coached game');
  ok(post.otherPlayed, 'the rest of the week is quick-simmed');

  group('No runtime errors');
  eq(errors.length, 0, 'no page/console errors: ' + errors.slice(0, 3).join(' | '));

  await browser.close();
  server.close();
  const passed = summary();
  process.exit(passed ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
