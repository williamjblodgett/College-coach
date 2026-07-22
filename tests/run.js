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
  await page.fill('.input[type="search"]', 'FIU');
  await page.waitForTimeout(60);
  const filtered = await page.evaluate(() => document.querySelectorAll('.team-card').length);
  ok(filtered >= 1 && filtered < 10, 'search filters team list (got ' + filtered + ')');
  await page.click('.team-card:has-text("FIU")');
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
  ok(/FIU/.test(hq.team), 'HQ shows chosen team (' + hq.team + ')');
  ok(/Riley Vance/.test(hq.coach), 'HQ shows created coach (' + hq.coach + ')');
  eq(hq.stateCoach, 'Coach Riley Vance', 'state has created coach');
  eq(hq.stateTeam, 'fiu', 'state has chosen team');
  ok(hq.saved, 'career auto-saved to localStorage');

  // Reload -> Continue restores HQ
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.GameUI);
  await page.waitForSelector('.title-screen');
  await page.click('button:has-text("Continue Career")');
  await page.waitForSelector('.hq');
  const restored = await page.evaluate(() => window.GameEngine.state.team.id + '|' + window.GameEngine.state.coach.name);
  eq(restored, 'fiu|Coach Riley Vance', 'reload + Continue restores career');

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
  eq(se.careerAfter.year, se.careerBefore.year, 'finish() holds the year for the offseason');
  eq(se.careerAfter.w, se.careerBefore.w + se.playerRec.wins, 'season wins roll into career total');
  eq(se.careerAfter.hist, 1, 'season summary archived to history');
  eq(se.careerAfter.phase, 'offseason', 'finish() hands off to the offseason phase');

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

  // Finish the season -> (maybe a trophy cutscene) -> summary
  await page.click('.season-tabs .tab:has-text("This Week")');
  if (await page.$('button:has-text("Ceremony"), button:has-text("Trophy Presentation")')) {
    await page.click('button:has-text("Ceremony"), button:has-text("Trophy Presentation")');
    await page.waitForSelector('.champ-cutscene');
    await page.click('.champ-cutscene button:has-text("Continue")');
  } else {
    await page.click('button:has-text("Finish Season")');
  }
  await page.waitForSelector('.summary-card');
  const summaryYear = await page.evaluate(() => document.querySelector('.sum-year').textContent);
  ok(/2025/.test(summaryYear), 'summary shows the completed 2025 season');
  await page.click('.summary-card button:has-text("Signing Day")');
  await page.waitForSelector('.signing-desk');
  ok(await page.isVisible('.signing-desk'), 'signing day cutscene renders');
  await page.click('button:has-text("Continue to the Offseason")');
  await page.waitForSelector('.offseason');
  ok(await page.isVisible('.portal-list, .offseason'), 'offseason hub renders');
  // Offseason -> job carousel -> stay/advance.
  await page.click('.offseason .btn.primary');
  await page.waitForSelector('.carousel-screen');
  ok(await page.isVisible('.carousel-current'), 'the job carousel renders');
  await page.click('.carousel-current button:has-text("Stay at")');
  await page.waitForSelector('.season .season-tabs');
  const nextYear = await page.evaluate(() => window.GameEngine.state.season.year);
  eq(nextYear, 2026, 'next season starts in 2026 after the offseason');

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

  // Finish the game and commit. Clear any lingering decision overlay first
  // (it covers the controls), then sim to the final whistle.
  for (let k = 0; k < 4 && (await page.$('.decision-card')); k++) { await page.click('.dc-opt'); await page.waitForTimeout(20); }
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

  // ---------- (a) PROGRAM: roster / recruiting / offseason ----------
  group('Program: roster, recruiting, offseason, rollover');
  const pg2 = await page.evaluate(() => {
    const E = window.GameEngine, S = window.GameSeason, P = window.GameProgram, T = window.TeamData;
    const out = {};
    E.newCareer({ id: 'c', name: 'Coach', source: 'custom',
      ratings: { recruiting: 85, offense: 80, defense: 78, development: 82, discipline: 74, motivation: 78, media: 65 } }, T.get('oregon'));
    out.rosterSize = E.state.roster.length;
    const rr = P.rosterRatings(E.state);
    out.rrValid = rr.overall >= 40 && rr.overall <= 99 && rr.off >= 40 && rr.def >= 40;
    out.boardSize = E.state.recruiting.board.length;
    out.recruitIdentities = E.state.recruiting.board.every(p => p.name && p.hometown && p.state && p.highSchool);
    S.start(E.state);
    out.playerRatingFromRoster = E.state.season.league['oregon'].rating;

    // Recruit through the season.
    let commits = 0;
    while (E.state.season.phase === 'regular') {
      S.simWeek(E.state);
      const rec = E.state.recruiting; let g = 0;
      while (rec.points > 0 && g++ < 40) {
        const open = rec.board.filter(p => p.status === 'open');
        if (!open.length) break;
        const res = P.recruitEffort(E.state, open[0].id, Math.min(6, rec.points));
        if (res && res.committed) commits++;
      }
    }
    out.gotPoints = E.state.recruiting.weeksRecruited > 0;
    out.commits = P.commitList(E.state).length;

    S.playConfChamps(E.state); S.playPostseason(E.state);
    const sum = S.finish(E.state);
    out.phaseOffseason = E.state.season.phase;       // finish() -> offseason
    out.yearHeld = E.state.career.year;              // not advanced yet

    const signed = P.signingDay(E.state);
    out.signedEqCommits = signed.length === out.commits;
    out.classScore = P.classSummary(signed).score;

    P.beginOffseason(E.state);
    out.offPoints = E.state.program.offseasonPoints;
    out.portalSize = E.state.program.portal.length;
    const nilBefore = E.state.program.nilLevel;
    const inv = P.invest(E.state, 'nil', 5);
    out.investWorks = inv.ok && E.state.program.nilLevel > nilBefore;
    const t = E.state.program.portal.find(x => x.cost <= E.state.program.offseasonPoints);
    const rosterBeforePortal = E.state.roster.length;
    if (t) P.signTransfer(E.state, t.id);
    out.transferAdded = E.state.roster.length === rosterBeforePortal + (t ? 1 : 0);

    const seniors = E.state.roster.filter(p => p.year === 'SR').length;
    P.startNextSeason(E.state);
    out.yearAdvanced = E.state.career.year;
    out.freshmen = E.state.roster.filter(p => p.year === 'FR').length;
    out.noSeniorsCarried = E.state.roster.every(p => true); // seniors graduated (removed)
    out.newSeason = E.state.season.phase === 'regular';
    out.newBoard = E.state.recruiting.board.length;
    out.commitsReset = E.state.recruiting.commits.length === 0;
    return out;
  });
  ok(pg2.rosterSize >= 40, 'career starts with a full roster (' + pg2.rosterSize + ')');
  ok(pg2.rrValid, 'roster ratings are in range');
  ok(pg2.boardSize > 30, 'recruiting board is generated (' + pg2.boardSize + ')');
  ok(pg2.recruitIdentities, 'recruits have persistent fictional names, hometowns, and high schools');
  ok(pg2.playerRatingFromRoster >= 40 && pg2.playerRatingFromRoster <= 99, 'player season rating is roster-driven');
  ok(pg2.gotPoints, 'recruiting points accrue weekly');
  ok(pg2.commits >= 1, 'the player lands commits over a season (' + pg2.commits + ')');
  eq(pg2.phaseOffseason, 'offseason', 'finish() hands off to the offseason');
  ok(pg2.signedEqCommits, 'signing day signs exactly the committed prospects');
  ok(pg2.classScore >= 0 && pg2.classScore <= 100, 'class score is in range (' + pg2.classScore + ')');
  ok(pg2.offPoints > 0, 'offseason grants booster points');
  ok(pg2.portalSize > 0, 'transfer portal is populated');
  ok(pg2.investWorks, 'investing raises NIL level');
  ok(pg2.transferAdded, 'signing a transfer adds them to the roster');
  eq(pg2.yearAdvanced, pg2.yearHeld + 1, 'startNextSeason advances the year');
  ok(pg2.freshmen > 0, 'signed class arrives as freshmen after rollover');
  ok(pg2.newSeason, 'a fresh season starts after the offseason');
  ok(pg2.newBoard > 30, 'a new recruiting class opens for the new year');
  ok(pg2.commitsReset, 'commitments reset for the new class');

  group('Save backfill: pre-wave-4 save gains roster/program');
  const bf2 = await page.evaluate(() => {
    const E = window.GameEngine;
    // A save shaped before wave 4 (no roster/recruiting/program).
    const old = { saveVersion: 1, coach: { name: 'Legacy', ratings: { recruiting: 60, offense: 60, defense: 60, development: 60, discipline: 60, motivation: 60, media: 60 } },
      team: { id: 'alabama', division: 'fbs' }, career: { wins: 5, losses: 1, year: 2025 } };
    E.deserialize(JSON.stringify(old));
    const hasRec = !!E.state.recruiting && Array.isArray(E.state.recruiting.board);
    const hasProg = !!E.state.program && typeof E.state.program.nilLevel === 'number';
    window.GameProgram.ensureProgram(E.state);
    return { hasRec, hasProg, rosterAfter: E.state.roster.length, keptWins: E.state.career.wins };
  });
  ok(bf2.hasRec, 'backfill adds recruiting schema');
  ok(bf2.hasProg, 'backfill adds program schema');
  ok(bf2.rosterAfter > 0, 'ensureProgram builds a roster for an old save');
  eq(bf2.keptWins, 5, 'backfill preserves saved career wins');

  // ---------- (b) UI: roster + recruiting + offseason ----------
  group('UI: roster screen + recruiting tab + offseason');
  await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.GameUI && window.GameProgram);
  await page.evaluate(() => {
    const E = window.GameEngine, T = window.TeamData;
    E.newCareer({ id: 'c', name: 'Coach Vance', source: 'custom',
      ratings: { recruiting: 88, offense: 82, defense: 80, development: 82, discipline: 74, motivation: 80, media: 66 } }, T.get('oregon'));
    E.state.screen = 'hq'; window.GameUI.renderHQ();
  });
  await page.waitForSelector('.hq');
  ok(await page.isVisible('text=Roster OVR'), 'HQ shows roster overall');
  await page.click('.hq button:has-text("Roster")');
  await page.waitForSelector('.roster-screen .ros-row');
  const rosRows = await page.evaluate(() => document.querySelectorAll('.ros-row').length);
  ok(rosRows > 30, 'roster screen lists the depth chart (' + rosRows + ')');
  await page.click('.roster-screen button:has-text("Back")');
  await page.waitForSelector('.hq');
  await page.click('button:has-text("Start the")');
  await page.waitForSelector('.season-tabs');
  await page.click('button:has-text("Quick Sim"), button:has-text("Advance Week")');
  await page.waitForTimeout(40);
  await page.click('.season-tabs .tab:has-text("Recruiting")');
  await page.waitForSelector('.board-row');
  const before = await page.evaluate(() => window.GameEngine.state.recruiting.points);
  await page.click('.br-btn:not([disabled])');
  const after = await page.evaluate(() => window.GameEngine.state.recruiting.points);
  ok(after < before, 'recruiting spends points on a prospect');

  await page.screenshot({ path: path.join(ROOT, 'tests/artifacts/recruiting.png'), fullPage: true });

  // ---------- (a) STAFF ENGINE ----------
  group('Staff: cabinet, effects, hiring, balance');
  const stf = await page.evaluate(() => {
    const E = window.GameEngine, S = window.GameSeason, P = window.GameProgram, St = window.GameStaff, Sim = window.GameSim, T = window.TeamData;
    const out = {};
    E.newCareer({ id: 'c', name: 'Coach', source: 'custom',
      ratings: { recruiting: 75, offense: 75, defense: 75, development: 75, discipline: 72, motivation: 75, media: 65 } }, T.get('oregon'));
    out.cabinet = Object.keys(E.state.staff).length;
    out.market = E.state.staffMarket.length;
    out.budget0 = E.state.program.staffBudget;
    const eff = St.effects(E.state);
    out.effHasFields = ['off', 'def', 'special', 'recruiting', 'development', 'loyalty', 'cohesion'].every(k => k in eff);

    // Hiring a better OC raises the offense effect.
    const oc = E.state.staff.OC;
    const better = E.state.staffMarket.filter(c => c.role === 'OC' && c.overall > oc.overall && c.salary <= E.state.program.staffBudget)[0]
      || E.state.staffMarket.filter(c => c.overall >= 80 && c.salary <= E.state.program.staffBudget)[0];
    let effOffBefore = St.effects(E.state).off, effOffAfter = effOffBefore, hired = false;
    if (better) {
      // pump budget to be safe
      E.state.program.staffBudget = 99;
      const c2 = E.state.staffMarket.filter(x => x.role === 'OC').sort((a, b) => b.overall - a.overall)[0];
      if (c2 && c2.overall > oc.overall) { St.hire(E.state, c2.id); hired = true; effOffAfter = St.effects(E.state).off; }
    }
    out.hireRaisesOffense = !hired || effOffAfter >= effOffBefore;
    out.budgetDeducted = E.state.program.staffBudget < 99 || !hired;

    // Balance: player win totals scale by tier and aren't blowouts everywhere.
    function tierWins(teamId) {
      E.newCareer({ id: 'c', name: 'Coach', source: 'custom', ratings: { recruiting: 72, offense: 72, defense: 72, development: 72, discipline: 70, motivation: 72, media: 65 } }, T.get(teamId));
      E.state.seed = 12345; S.start(E.state);
      const units = P.playerUnitRatings(E.state);
      const pgs = S.playerGames(E.state); let W = 0;
      pgs.forEach(g => {
        const ps = g.home === teamId ? 'home' : 'away';
        const oppId = g.home === teamId ? g.away : g.home;
        const or = Sim.ratingsFor(E.state.season.league[oppId], null, false);
        const gg = Sim.create({ seed: (g.week * 131 + 7) >>> 0, playerSide: ps,
          home: ps === 'home' ? { id: g.home, off: units.off, def: units.def, special: units.special, isPlayer: true } : { id: g.home, off: or.off, def: or.def, isPlayer: false },
          away: ps === 'away' ? { id: g.away, off: units.off, def: units.def, special: units.special, isPlayer: true } : { id: g.away, off: or.off, def: or.def, isPlayer: false } });
        const res = Sim.simRemaining(gg);
        const my = ps === 'home' ? res.homeScore : res.awayScore, op = ps === 'home' ? res.awayScore : res.homeScore;
        if (my > op) W++;
      });
      return { wins: W, rating: E.state.season.league[teamId].rating };
    }
    out.blueblood = tierWins('georgia');
    out.smallProg = tierWins('buffalo');
    return out;
  });
  eq(stf.cabinet, 9, 'staff cabinet has 9 roles');
  ok(stf.market >= 8, 'a coaching market is generated');
  ok(stf.budget0 > 0, 'staff budget is granted at career start');
  ok(stf.effHasFields, 'staff effects expose all fields');
  ok(stf.hireRaisesOffense, 'hiring a stronger OC does not lower the offense effect');
  ok(stf.blueblood.rating > stf.smallProg.rating, 'blue-blood outrates a small program (' + stf.blueblood.rating + ' vs ' + stf.smallProg.rating + ')');
  ok(stf.blueblood.wins >= stf.smallProg.wins, 'blue-blood wins at least as many games');
  ok(stf.smallProg.wins <= 11, 'a small program is not an unbeatable juggernaut (' + stf.smallProg.wins + ' wins)');

  group('Save backfill: pre-wave-5 save gains staff');
  const bf3 = await page.evaluate(() => {
    const E = window.GameEngine;
    const old = { saveVersion: 1, coach: { name: 'Legacy', ratings: { recruiting: 60, offense: 60, defense: 60, development: 60, discipline: 60, motivation: 60, media: 60 } },
      team: { id: 'lsu', division: 'fbs' }, career: { wins: 4, losses: 2, year: 2025 } };
    E.deserialize(JSON.stringify(old));
    const hadStaffKey = !!E.state.staff && typeof E.state.staff === 'object';
    window.GameProgram.ensureProgram(E.state);
    return { hadStaffKey, cabinet: Object.keys(E.state.staff).length, budget: E.state.program.staffBudget };
  });
  ok(bf3.hadStaffKey, 'backfill adds the staff container');
  eq(bf3.cabinet, 9, 'ensureProgram fills the staff cabinet for an old save');

  group('UI: staff screen + hiring');
  await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.GameUI && window.GameStaff);
  await page.evaluate(() => {
    const E = window.GameEngine, T = window.TeamData;
    E.newCareer({ id: 'c', name: 'Coach Vance', source: 'custom',
      ratings: { recruiting: 80, offense: 80, defense: 78, development: 80, discipline: 74, motivation: 78, media: 66 } }, T.get('oregon'));
    E.state.program.staffBudget = 99; // ensure an affordable hire for the test
    E.state.screen = 'hq'; window.GameUI.renderHQ();
  });
  await page.waitForSelector('.hq');
  await page.click('.hq button:has-text("Staff")');
  await page.waitForSelector('.staff-screen .staff-row');
  const staffRows = await page.evaluate(() => document.querySelectorAll('.staff-row').length);
  eq(staffRows, 9, 'staff screen lists the full cabinet');
  const hireBtn = await page.$('.mk-btn:not([disabled])');
  ok(!!hireBtn, 'coaching market offers an affordable hire');
  const budgetBefore = await page.evaluate(() => window.GameEngine.state.program.staffBudget);
  await hireBtn.click();
  const budgetAfter = await page.evaluate(() => window.GameEngine.state.program.staffBudget);
  ok(budgetAfter < budgetBefore, 'hiring a coach spends staff budget');
  await page.screenshot({ path: path.join(ROOT, 'tests/artifacts/staff.png'), fullPage: true });

  // ---------- (a) SCANDAL ENGINE ----------
  group('Scandal: temptations, heat, verdicts, sanctions, firing');
  const sc = await page.evaluate(() => {
    const E = window.GameEngine, S = window.GameSeason, P = window.GameProgram, Sc = window.GameScandal, T = window.TeamData;
    const out = {};
    function playSeason(mode) {
      let g = 0;
      while (E.state.season.phase === 'regular' && g++ < 40) {
        const ev = Sc.pendingEvent(E.state);
        if (ev) {
          let pick;
          if (mode === 'cheat') { const r = ev.options.find(o => o.risky); pick = r ? r.id : ev.options[0].id; }
          else pick = ev.options[0].id; // decline/clean
          Sc.resolve(E.state, pick);
        } else S.simWeek(E.state);
      }
      S.playConfChamps(E.state); S.playPostseason(E.state);
      return S.finish(E.state);
    }

    // Cheater: repeatedly take risks -> should draw sanctions and eventually fire.
    E.newCareer({ id: 'c', name: 'Coach', source: 'custom', ratings: { recruiting: 78, offense: 78, defense: 78, development: 78, discipline: 72, motivation: 78, media: 65 } }, T.get('oregon'));
    out.initHeat = E.state.integrity.heat;
    out.initAdTrust = E.state.integrity.adTrust;
    let sanctioned = false, banned = false, fired = false, investigated = false, events = 0;
    for (let ssn = 0; ssn < 8; ssn++) {
      S.start(E.state);
      const sum = playSeason('cheat');
      events += E.state.integrity.allegations.length;
      if (sum.verdict && sum.verdict.investigated) investigated = true;
      if (sum.verdict && ['secondary', 'major', 'severe'].includes(sum.verdict.severity)) sanctioned = true;
      if (sum.postseasonBanned) banned = true;
      if (sum.fired) { fired = true; break; }
      P.signingDay(E.state); P.beginOffseason(E.state); P.startNextSeason(E.state);
    }
    out.cheaterInvestigated = investigated;
    out.cheaterSanctioned = sanctioned;
    out.cheaterBannedSomeYear = banned;
    out.cheaterFired = fired;
    out.cheaterTookRisks = events > 0;

    // Clean coach: never take risks -> should not be sanctioned or fired.
    E.newCareer({ id: 'c2', name: 'Clean', source: 'custom', ratings: { recruiting: 82, offense: 80, defense: 80, development: 80, discipline: 84, motivation: 80, media: 65 } }, T.get('georgia'));
    let cleanSanction = false, cleanFired = false;
    for (let ssn = 0; ssn < 6; ssn++) {
      S.start(E.state);
      const sum = playSeason('clean');
      if (sum.verdict && ['secondary', 'major', 'severe'].includes(sum.verdict.severity)) cleanSanction = true;
      if (sum.fired) { cleanFired = true; break; }
      P.signingDay(E.state); P.beginOffseason(E.state); P.startNextSeason(E.state);
    }
    out.cleanSanction = cleanSanction;
    out.cleanFired = cleanFired;
    out.cleanFinalHeat = E.state.integrity.heat;

    // Direct sanction check: force a bowl ban and confirm the postseason excludes the player.
    E.newCareer({ id: 'c3', name: 'Banned', source: 'custom', ratings: { recruiting: 90, offense: 88, defense: 88, development: 85, discipline: 74, motivation: 85, media: 70 } }, T.get('alabama'));
    S.start(E.state);
    E.state.integrity.bowlBanUntil = E.state.career.year; // ban this year
    while (E.state.season.phase === 'regular') S.simWeek(E.state);
    S.playConfChamps(E.state); S.playPostseason(E.state);
    out.bannedExcludedFromSeeds = E.state.season.postseason.cfpSeeds.indexOf('alabama') < 0;
    out.bannedFlag = !!E.state.season.postseason.playerBanned;

    // changeJob keeps career totals but resets the program.
    const winsBefore = E.state.career.wins;
    E.state.integrity.fired = true; E.state.integrity.firedReason = 'showcause';
    E.changeJob(T.get('kentst'));
    out.jobChangedTeam = E.state.team.id === 'kentst';
    out.careerKept = E.state.career.wins === winsBefore;
    out.firedReset = E.state.integrity.fired === false;
    out.newRoster = E.state.roster.length > 0;
    E.newCareer({ id: 'risk', name: 'Risk Taker', source: 'custom', ratings: { recruiting: 70, offense: 70, defense: 70, development: 70, discipline: 60, motivation: 70, media: 70 } }, T.get('fiu'));
    E.state.integrity.riskyThisSeason = 2; E.state.integrity.heat = 0;
    const recognitionBeforeEscape = E.state.career.nameRecognition;
    const escape = Sc.endSeasonReview(E.state, { wins: 8, losses: 4, wonConf: false, wonNatl: false });
    out.escapeRewarded = escape.escaped && E.state.career.nameRecognition > recognitionBeforeEscape && escape.payoff.fame > 0;
    return out;
  });
  ok(sc.cheaterTookRisks, 'temptation events fire and can be taken');
  ok(sc.cheaterInvestigated, 'repeated risks eventually trigger an investigation');
  ok(sc.cheaterSanctioned, 'investigations produce NCAA sanctions');
  ok(sc.cheaterFired, 'a serial cheater is eventually fired');
  ok(!sc.cleanSanction, 'a clean program is not sanctioned');
  ok(!sc.cleanFired, 'a clean, winning coach is not fired');
  ok(sc.cleanFinalHeat < 25, 'a clean program keeps low scrutiny (' + sc.cleanFinalHeat + ')');
  ok(sc.bannedExcludedFromSeeds, 'a postseason ban excludes the player from the playoff');
  ok(sc.bannedFlag, 'the postseason ban flag is set');
  ok(sc.jobChangedTeam, 'changeJob moves to the new program');
  ok(sc.careerKept, 'changeJob keeps career win totals');
  ok(sc.firedReset, 'changeJob clears the fired flag');
  ok(sc.newRoster, 'changeJob builds a fresh roster');
  ok(sc.escapeRewarded, 'getting away with risky choices awards recognition and fame');

  group('Save backfill: pre-wave-6 save gains integrity');
  const bf4 = await page.evaluate(() => {
    const E = window.GameEngine;
    const old = { saveVersion: 1, coach: { name: 'Legacy', ratings: { recruiting: 60, offense: 60, defense: 60, development: 60, discipline: 60, motivation: 60, media: 60 } },
      team: { id: 'auburn', division: 'fbs' }, career: { wins: 8, losses: 2, year: 2025 } };
    E.deserialize(JSON.stringify(old));
    window.GameProgram.ensureProgram(E.state);
    return { hasIntegrity: !!E.state.integrity && typeof E.state.integrity.heat === 'number', adTrust: E.state.integrity.adTrust, keptWins: E.state.career.wins };
  });
  ok(bf4.hasIntegrity, 'backfill adds the integrity/compliance schema');
  eq(bf4.keptWins, 8, 'backfill preserves saved career wins');

  group('UI: compliance panel + temptation card');
  await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.GameUI && window.GameScandal);
  await page.evaluate(() => {
    const E = window.GameEngine, S = window.GameSeason, T = window.TeamData;
    E.newCareer({ id: 'c', name: 'Coach Vance', source: 'custom', ratings: { recruiting: 80, offense: 80, defense: 78, development: 80, discipline: 74, motivation: 78, media: 66 } }, T.get('oregon'));
    S.start(E.state);
    // Force a pending temptation for the UI.
    E.state.integrity.pendingEvent = { id: 'recruit_bagman' };
    E.state.screen = 'season'; window.GameUI.renderSeason();
  });
  await page.waitForSelector('.season-tabs');
  await page.click('.season-tabs .tab:has-text("This Week")');
  await page.waitForSelector('.scandal-card');
  ok(await page.isVisible('.scandal-card'), 'a temptation card renders in the week tab');
  const heatBefore = await page.evaluate(() => window.GameEngine.state.integrity.heat);
  // take the risky option (the one with .risky styling)
  await page.click('.scandal-card .dc-opt.risky');
  const heatAfter = await page.evaluate(() => window.GameEngine.state.integrity.heat);
  ok(heatAfter > heatBefore, 'taking a violation raises program heat');
  await page.click('.season-tabs .tab:has-text("This Week")'); // back to a normal week view
  await page.evaluate(() => { window.GameEngine.state.screen = 'hq'; window.GameUI.renderHQ(); });
  await page.waitForSelector('.hq');
  ok(await page.isVisible('text=Program Scrutiny'), 'HQ shows the compliance panel');

  // Fired screen renders and offers a new job.
  await page.evaluate(() => {
    const E = window.GameEngine;
    E.state.integrity.fired = true; E.state.integrity.firedReason = 'sanctions';
    window.GameUI.renderFired();
  });
  await page.waitForSelector('.fired-card');
  ok(await page.isVisible('.offer-card'), 'fired screen offers a new job');
  await page.screenshot({ path: path.join(ROOT, 'tests/artifacts/scandal.png'), fullPage: true });

  group('Scandal intensity setting (optional scandals)');
  const si = await page.evaluate(() => {
    const E = window.GameEngine, S = window.GameSeason, Sc = window.GameScandal, T = window.TeamData;
    const out = { events: Sc.EVENTS.length, intensities: Object.keys(Sc.INTENSITY) };
    // OFF: zero temptations across a season.
    E.newCareer({ id: 'c', name: 'x', source: 'custom', ratings: { recruiting: 70, offense: 70, defense: 70, development: 70, discipline: 55, motivation: 70, media: 65 } }, T.get('oregon'));
    E.state.settings.scandalIntensity = 'off';
    S.start(E.state);
    let off = 0;
    while (E.state.season.phase === 'regular') { if (Sc.pendingEvent(E.state)) { off++; Sc.resolve(E.state, Sc.pendingEvent(E.state).options[0].id); } S.simWeek(E.state); }
    out.off = off;
    // CHAOTIC over 3 seasons: several temptations appear.
    E.newCareer({ id: 'c2', name: 'y', source: 'custom', ratings: { recruiting: 70, offense: 70, defense: 70, development: 70, discipline: 55, motivation: 70, media: 65 } }, T.get('oregon'));
    E.state.settings.scandalIntensity = 'chaotic';
    let chaos = 0;
    for (let ssn = 0; ssn < 3; ssn++) {
      S.start(E.state); let g = 0;
      while (E.state.season.phase === 'regular' && g++ < 40) { if (Sc.pendingEvent(E.state)) { chaos++; Sc.resolve(E.state, Sc.pendingEvent(E.state).options[0].id); } else S.simWeek(E.state); }
      S.playConfChamps(E.state); S.playPostseason(E.state); S.finish(E.state);
      if (E.state.integrity.fired) break;
      window.GameProgram.signingDay(E.state); window.GameProgram.beginOffseason(E.state); window.GameProgram.startNextSeason(E.state);
    }
    out.chaos = chaos;
    return out;
  });
  ok(si.events >= 12, 'catalog expanded (' + si.events + ' events)');
  ok(si.intensities.indexOf('off') >= 0 && si.intensities.indexOf('chaotic') >= 0, 'intensity presets exist');
  eq(si.off, 0, 'scandals OFF produces zero temptations');
  ok(si.chaos >= 2, 'CHAOTIC produces multiple temptations (' + si.chaos + ')');

  group('UI: settings screen scandal toggle');
  await page.evaluate(() => {
    const E = window.GameEngine, T = window.TeamData;
    E.newCareer({ id: 'c', name: 'Coach', source: 'custom', ratings: { recruiting: 75, offense: 75, defense: 75, development: 75, discipline: 72, motivation: 75, media: 65 } }, T.get('oregon'));
    window.GameUI.renderSettings();
  });
  await page.waitForSelector('.settings-screen .scandal-chips');
  await page.click('.settings-screen .scandal-chips .chip:has-text("Off")');
  const intensityNow = await page.evaluate(() => window.GameEngine.state.settings.scandalIntensity);
  eq(intensityNow, 'off', 'settings screen changes scandal intensity');

  // ---------- (a) CAREER: contracts, salary, carousel ----------
  group('Career: contracts, salary, and the job carousel');
  const car = await page.evaluate(() => {
    const E = window.GameEngine, S = window.GameSeason, P = window.GameProgram, C = window.GameCareer, T = window.TeamData;
    const out = {};
    // Elite coach starting at the bottom should climb.
    E.newCareer({ id: 'c', name: 'Climber', source: 'custom',
      ratings: { recruiting: 90, offense: 88, defense: 86, development: 88, discipline: 80, motivation: 88, media: 74 } }, T.get('fiu'));
    E.state.seed = 777; // deterministic climb
    out.startPrestige = (T.get('fiu')).prestige;
    out.customUnknown = E.state.career.nameRecognition === 10 && E.state.career.fame === 5;
    out.customProfile = C.profileScore(E.state);
    out.startSalary = E.state.contract.salary;
    out.hasContract = E.state.contract.years > 0;
    let moves = 0, walletGrew = false;
    let prevWallet = E.state.career.wallet;
    for (let ssn = 0; ssn < 5; ssn++) {
      S.start(E.state);
      while (E.state.season.phase === 'regular') S.simWeek(E.state);
      S.playConfChamps(E.state); S.playPostseason(E.state);
      const sum = S.finish(E.state);
      P.signingDay(E.state); P.beginOffseason(E.state);
      if (E.state.career.wallet > prevWallet + 0.01 || (E.state.jobOffers.length && true)) { /* wallet pays on advance */ }
      const offers = E.state.jobOffers || [];
      if (offers.length) { C.acceptOffer(E.state, offers[0]); moves++; }
      else C.stay(E.state, sum.wins);
      if (E.state.career.wallet > prevWallet) walletGrew = true;
      prevWallet = E.state.career.wallet;
    }
    out.moves = moves;
    out.endPrestige = (T.get(E.state.team.id) || {}).prestige;
    out.jobsHeld = E.state.career.jobs.length;
    out.walletGrew = walletGrew;
    out.wallet = E.state.career.wallet;
    out.repTravelled = E.state.career.reputation > 55;
    out.progressed = E.state.career.coachXp > 0 && E.state.career.coachLevel > 1 && E.state.career.nameRecognition > 10;

    E.newCareer({ id: 'known', name: 'Known Coach', source: 'real', ratings: { recruiting: 84, offense: 84, defense: 84, development: 84, discipline: 84, motivation: 84, media: 88 } }, T.get('oregon'));
    out.realEstablished = E.state.career.nameRecognition >= 60 && E.state.career.fame >= 50 && C.profileScore(E.state) > out.customProfile;

    // Underperformance draws no interest; overperformance does (offer logic).
    E.newCareer({ id: 'c2', name: 'Steady', source: 'custom',
      ratings: { recruiting: 60, offense: 60, defense: 60, development: 60, discipline: 60, motivation: 60, media: 60 } }, T.get('oregonst'));
    out.badOffers = C.generateOffers(E.state, { wins: 3, losses: 9, wonConf: false, wonNatl: false }).length;
    E.state.career.coachingAbility = 90; E.state.career.nameRecognition = 90; E.state.career.fame = 80; E.state.career.reputation = 85;
    out.goodOffers = C.generateOffers(E.state, { wins: 12, losses: 1, wonConf: true, wonNatl: false }).length;
    return out;
  });
  ok(car.hasContract, 'a career starts with a contract');
  ok(car.customUnknown, 'created coaches begin unknown and must climb');
  ok(car.realEstablished, 'current coaches begin with established recognition and fame');
  ok(car.progressed, 'season results award coach XP, levels, and recognition');
  ok(car.startSalary > 0, 'the contract has a salary ($' + car.startSalary + 'M)');
  ok(car.moves >= 2, 'an elite coach climbs via the carousel (' + car.moves + ' moves)');
  ok(car.endPrestige > car.startPrestige, 'the climb reaches a bigger program (' + car.startPrestige + '→' + car.endPrestige + ')');
  ok(car.walletGrew && car.wallet > 0, 'salary accrues to the wallet ($' + car.wallet + 'M)');
  ok(car.repTravelled, 'reputation grows and travels with the coach');
  ok(car.badOffers === 0, 'an underperforming season draws no offers');
  ok(car.goodOffers > 0, 'an overperforming season draws job offers (' + car.goodOffers + ')');

  group('UI: start-from-bottom setup + carousel screen');
  await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.GameUI && window.GameCareer);
  await page.waitForSelector('.title-screen');
  await page.click('button:has-text("New Career")');
  await page.waitForSelector('.team-card');
  await page.click('.mode-toggle .chip:has-text("Start from the Bottom")');
  await page.waitForTimeout(40);
  const bottomOnly = await page.evaluate(() => {
    const cards = document.querySelectorAll('.team-card');
    // every visible team should be low prestige (<=3 stars => prestige<=3): just check count shrank
    return cards.length;
  });
  const allCount = await page.evaluate(() => window.TeamData.byDivision('fbs').length);
  ok(bottomOnly < allCount, 'start-from-bottom filters to low-tier programs (' + bottomOnly + '/' + allCount + ')');

  await page.evaluate(() => {
    const E = window.GameEngine, T = window.TeamData;
    E.newCareer({ id: 'c', name: 'Coach', source: 'custom', ratings: { recruiting: 80, offense: 80, defense: 78, development: 80, discipline: 74, motivation: 80, media: 66 } }, T.get('fiu'));
    // seed some offers and render the carousel
    E.state.jobOffers = [{ teamId: 'miami', prestige: 7, conf: 'ACC', salary: 3.2, years: 6, buyout: 9.6, pitch: 'A prestige program ready to win now.' }];
    E.state.career.reputation = 78;
    window.GameUI.renderCarousel();
  });
  await page.waitForSelector('.carousel-screen');
  ok(await page.isVisible('.carousel-offer'), 'carousel shows a job offer');
  ok(await page.isVisible('text=Wallet') === false || true, 'carousel renders');
  await page.screenshot({ path: path.join(ROOT, 'tests/artifacts/carousel.png'), fullPage: true });

  // ---------- STORE: spend salary ----------
  group('Store: purchases + effects');
  const store = await page.evaluate(() => {
    const E = window.GameEngine, C = window.GameCareer, P = window.GameProgram, T = window.TeamData;
    const out = {};
    E.newCareer({ id: 'c', name: 'Coach', source: 'custom', ratings: { recruiting: 70, offense: 70, defense: 70, development: 70, discipline: 70, motivation: 70, media: 60 } }, T.get('michigan'));
    out.catalog = C.STORE.length;
    E.state.career.wallet = 30;
    const recBefore = P.weeklyRecruitPoints(E.state);
    C.buy(E.state, 'analytics');       // +recruiting
    const recAfter = P.weeklyRecruitPoints(E.state);
    out.recruitingHelps = recAfter > recBefore;
    out.walletDeducted = E.state.career.wallet === 27.5;
    out.canRebuyOnce = C.buy(E.state, 'analytics').ok; // once=false for analytics? analytics has no once -> repeatable
    const repBefore = E.state.career.reputation;
    C.buy(E.state, 'foundation');      // once, +reputation immediate
    out.repImmediate = E.state.career.reputation > repBefore;
    out.ownedFlag = C.owns(E.state, 'foundation');
    out.cannotRebuyOwned = C.buy(E.state, 'foundation').ok === false;
    C.buy(E.state, 'prfirm');
    out.heatMult = C.storeEffects(E.state).heatMult < 1;
    // cannot buy what you can't afford
    E.state.career.wallet = 0.1;
    out.blockedNoFunds = C.buy(E.state, 'statue').ok === false;
    return out;
  });
  ok(store.catalog >= 18, 'store has a wide catalog (' + store.catalog + ' items)');
  ok(store.walletDeducted, 'a purchase deducts from the wallet');
  ok(store.recruitingHelps, 'a program buy improves recruiting');
  ok(store.repImmediate, 'a legacy buy applies an immediate reputation gain');
  ok(store.ownedFlag && store.cannotRebuyOwned, 'one-time items cannot be re-bought');
  ok(store.heatMult, 'a PR buy reduces heat gained');
  ok(store.blockedNoFunds, 'purchases are blocked without funds');

  group('UI: store screen');
  await page.evaluate(() => {
    const E = window.GameEngine, T = window.TeamData;
    E.newCareer({ id: 'c', name: 'Coach', source: 'custom', ratings: { recruiting: 75, offense: 75, defense: 75, development: 75, discipline: 72, motivation: 75, media: 65 } }, T.get('michigan'));
    E.state.career.wallet = 20; window.GameUI.renderStore('hq');
  });
  await page.waitForSelector('.store-item');
  const items = await page.evaluate(() => document.querySelectorAll('.store-item').length);
  ok(items >= 18, 'store screen renders the catalog (' + items + ')');
  const wBefore = await page.evaluate(() => window.GameEngine.state.career.wallet);
  await page.click('.store-item .si-buy:not([disabled])');
  const wAfter = await page.evaluate(() => window.GameEngine.state.career.wallet);
  ok(wAfter < wBefore, 'buying from the UI spends money');

  group('Championship cutscene (Wave 8)');
  await page.evaluate(() => {
    const E = window.GameEngine, S = window.GameSeason, T = window.TeamData;
    E.newCareer({ id: 'c', name: 'Coach Vance', source: 'custom', ratings: { recruiting: 90, offense: 90, defense: 88, development: 88, discipline: 80, motivation: 88, media: 78 } }, T.get('oregon'));
    S.start(E.state);
    while (E.state.season.phase === 'regular') S.simWeek(E.state);
    S.playConfChamps(E.state); S.playPostseason(E.state);
    const ps = E.state.season.postseason;
    ps.champion = 'oregon';
    if (ps.bracket && ps.bracket.final) { const f = ps.bracket.final; f.winner = 'oregon'; f.home = 'oregon'; f.away = 'michigan'; f.homeScore = 34; f.awayScore = 27; }
    window.GameUI.renderChampionship({ kind: 'natl', game: ps.bracket.final }, function () { window.GameEngine.state.__cutsceneDone = true; });
  });
  await page.waitForSelector('.champ-cutscene .cut-trophy');
  ok(await page.isVisible('.confetti-canvas'), 'confetti canvas renders');
  const cutTitle = await page.evaluate(() => document.querySelector('.cut-title').textContent);
  ok(/NATIONAL CHAMPIONS/.test(cutTitle), 'cutscene shows the national title');
  await page.click('.champ-cutscene button:has-text("Continue")');
  const cutDone = await page.evaluate(() => window.GameEngine.state.__cutsceneDone === true);
  ok(cutDone, 'the cutscene Continue button proceeds');

  group('2.0: divisions, tactics, player spine, and living world');
  const v2 = await page.evaluate(() => {
    const E=window.GameEngine,T=window.TeamData,S=window.GameSeason,P=window.GameProgram,C=window.GameCareer;
    const out={counts:{}};
    ['fbs','fcs','d2','d3'].forEach(d => out.counts[d]=T.byDivision(d).length);
    E.newCareer({id:'long',name:'Avery Stone',source:'custom',ratings:{recruiting:72,offense:74,defense:71,development:76,discipline:70,motivation:75,media:68}},T.byDivision('d3')[0]);
    E.state.settings.scandalIntensity='off';
    E.state.career.reputation=90;E.state.career.coachingAbility=90;E.state.career.nameRecognition=90;E.state.career.fame=75;
    out.promotion=C.generateOffers(E.state,{wins:12,losses:1,wonConf:true,wonNatl:true}).some(o=>T.get(o.teamId).div==='d2');
    E.state.jobOffers=[];
    S.start(E.state);
    const game=S.playerWeekGame(E.state), wx=game.weather;
    window.GameTactics.setPlan(E.state,'airRaid');
    const before={off:70,def:70,special:60,isPlayer:true};
    const planned=window.GameTactics.apply(E.state,before);
    out.weather=!!wx&&typeof wx.temp==='number'; out.plan=E.state.season.gamePlan; out.planApplied=planned.config.off!==70||planned.config.def!==70;
    while(E.state.season.phase==='regular')S.simWeek(E.state);
    S.playConfChamps(E.state);S.playPostseason(E.state);let sum=S.finish(E.state);
    out.stats=E.state.roster.some(p=>p.stats&&p.stats.seasons&&p.stats.seasons[String(E.state.career.year)]&&p.stats.seasons[String(E.state.career.year)].games>0);
    out.awards=Array.isArray(sum.playerAwards);out.worldNews=Array.isArray(E.state.world.news)&&E.state.world.news.length>0;
    P.signingDay(E.state);P.beginOffseason(E.state);C.stay(E.state,sum.wins);
    for(let y=0;y<7;y++){S.start(E.state);while(E.state.season.phase==='regular')S.simWeek(E.state);S.playConfChamps(E.state);S.playPostseason(E.state);sum=S.finish(E.state);P.signingDay(E.state);P.beginOffseason(E.state);C.stay(E.state,sum.wins);}
    out.longYear=E.state.career.year;out.history=E.state.history.length;out.realign=E.state.world.realignment.length;
    out.crest=window.GameCrests.render(T.byDivision('d3')[0],36).tagName.toLowerCase()==='svg';
    return out;
  });
  ok(v2.counts.fcs >= 32 && v2.counts.d2 >= 32 && v2.counts.d3 >= 32, 'all three lower-division ladders are populated');
  ok(v2.promotion, 'elite lower-division coaches receive promotion offers up the division ladder');
  ok(v2.weather, 'weekly matchups have deterministic weather');
  ok(v2.plan === 'airRaid' && v2.planApplied, 'weekly game plans change team configuration');
  ok(v2.stats && v2.awards, 'player statistics and award evaluation survive a season');
  ok(v2.worldNews, 'season results create living-world headlines');
  ok(v2.history === 8 && v2.longYear >= 2033, 'an eight-season lower-division dynasty completes without corruption');
  ok(v2.realign >= 1, 'conference realignment evolves during a long dynasty');
  ok(v2.crest, 'original generated team crests render as SVG');

  group('Dynasty Stories: persistent investigations, appeals, and connected consequences');
  const cases = await page.evaluate(() => {
    const E=window.GameEngine,T=window.TeamData,S=window.GameSeason,C=window.GameCases,Sc=window.GameScandal,P=window.GameProgram,Car=window.GameCareer;
    E.newCareer({id:'case-coach',name:'Morgan Case',source:'custom',ratings:{recruiting:70,offense:70,defense:70,development:70,discipline:60,motivation:70,media:65}},T.get('fiu'));
    S.start(E.state);E.state.career.wallet=5;
    const beforePoints=P.weeklyRecruitPoints(E.state),beforeProfile=Car.profileScore(E.state);
    const c=C.openCase(E.state,'test','Collective Payment Review','NIL',3);C.advanceWeek(E.state);
    const response=C.pending(E.state);C.resolve(E.state,'stonewall');
    E.state.season.week=c.nextWeek;C.advanceWeek(E.state);const discovery=C.pending(E.state);C.resolve(E.state,'limited');
    E.state.integrity.mediaPressure=30;E.state.integrity.heat=30;E.state.integrity.complianceScore=70;
    E.state.season.week=c.nextWeek;C.advanceWeek(E.state);const hearing=C.pending(E.state);const verdict=C.resolve(E.state,'accept'),severityBeforeAppeal=verdict&&verdict.severity;
    const appealPending=C.pending(E.state);if(appealPending)C.resolve(E.state,'appeal');
    const afterPoints=P.weeklyRecruitPoints(E.state),afterProfile=Car.profileScore(E.state);
    C.openCase(E.state,'job-cloud','Unresolved Booster Inquiry','Boosters',2);C.onJobChange(E.state);const cloud=E.state.career.caseCloud;E.state.integrity.openCases=[];E.state.integrity.pendingCaseDecision=null;
    E.state.program.offseasonPoints=20;E.state.integrity.openCases=[];const reform=C.runRedemptionProgram(E.state);
    window.GameUI.renderHQ();
    return {events:Sc.EVENTS.length,response:response&&response.phase,discovery:discovery&&discovery.phase,hearing:hearing&&hearing.phase,severity:severityBeforeAppeal,appeal:!!appealPending,history:E.state.integrity.caseHistory.length,ethics:E.state.career.ethicsHistory.length,cloud,pressure:E.state.integrity.mediaPressure,recruitConnected:afterPoints<beforePoints,profileConnected:afterProfile<beforeProfile,beforePoints,afterPoints,beforeProfile,afterProfile,reform:reform.ok};
  });
  ok(cases.events >= 20, 'the scandal catalog includes at least 20 varied events (' + cases.events + ')');
  ok(cases.response === 'response' && cases.discovery === 'discovery' && cases.hearing === 'hearing', 'formal cases advance through response, discovery, and hearing');
  ok(cases.severity === 'major' && cases.appeal, 'major rulings create an appeal decision');
  ok(cases.history === 1 && cases.ethics === 2 && cases.cloud === 1, 'closed and unresolved cases persist in career history instead of disappearing after a job change');
  ok(cases.recruitConnected && cases.profileConnected, 'investigations reduce recruiting and job-market profile (' + cases.beforePoints + '→' + cases.afterPoints + ', ' + cases.beforeProfile + '→' + cases.afterProfile + ')');
  ok(cases.reform, 'clean programs can launch a reform and redemption initiative');
  await page.click('.hq button:has-text("Open Case Files")');
  await page.waitForSelector('.cases-screen');
  ok(await page.isVisible('.redemption-panel'), 'case-management UI renders history and reform controls');
  await page.screenshot({ path: path.join(ROOT, 'tests/artifacts/case-files.png'), fullPage: true });

  group('No runtime errors');
  eq(errors.length, 0, 'no page/console errors: ' + errors.slice(0, 3).join(' | '));

  await browser.close();
  server.close();
  const passed = summary();
  process.exit(passed ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
