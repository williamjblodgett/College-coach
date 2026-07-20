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

  group('No runtime errors');
  eq(errors.length, 0, 'no page/console errors: ' + errors.slice(0, 3).join(' | '));

  await browser.close();
  server.close();
  const passed = summary();
  process.exit(passed ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
