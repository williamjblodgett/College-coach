/* GRIDIRON DYNASTY — program.js
 * window.GameProgram: roster, recruiting, NIL/facilities budget, transfer
 * portal, and offseason development. Operates on window.GameEngine.state.
 *
 * The roster drives on-field strength: rosterRatings() feeds the player's
 * season power rating and the game-day unit ratings, so recruiting/portal/NIL
 * decisions show up in results.
 */
(function () {
  'use strict';

  var E = window.GameEngine;
  var T = window.TeamData;
  var N = window.NameData;

  // Roster composition: position, unit group, and how many to carry.
  var POS_PLAN = [
    ['QB', 'OFF', 3], ['RB', 'OFF', 4], ['WR', 'OFF', 6], ['TE', 'OFF', 3], ['OL', 'OFF', 9],
    ['DL', 'DEF', 8], ['LB', 'DEF', 6], ['CB', 'DEF', 5], ['S', 'DEF', 4],
    ['K', 'ST', 1], ['P', 'ST', 1]
  ];
  var POS_GROUP = {};
  POS_PLAN.forEach(function (p) { POS_GROUP[p[0]] = p[1]; });

  var YEARS = ['FR', 'SO', 'JR', 'SR'];
  var DEV_TRAITS = [
    { id: 'normal', label: 'Normal', head: 6, w: 60 },
    { id: 'impact', label: 'Impact', head: 12, w: 26 },
    { id: 'star', label: 'Star', head: 18, w: 11 },
    { id: 'elite', label: 'Elite', head: 26, w: 3 }
  ];

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function pick(rng, arr) { return arr[Math.floor(rng() * arr.length)]; }
  function weighted(rng, items, wKey) {
    var total = 0, i;
    for (i = 0; i < items.length; i++) total += items[i][wKey];
    var r = rng() * total;
    for (i = 0; i < items.length; i++) { r -= items[i][wKey]; if (r <= 0) return items[i]; }
    return items[items.length - 1];
  }
  var _uid = 0;
  function uid(prefix) { return prefix + '_' + (Date.now().toString(36)) + '_' + (_uid++); }

  // Star distribution weighted by program prestige (1-10).
  function rollStars(rng, prestige, isRecruit) {
    // Higher prestige => more 4/5 stars on roster; recruits skew a touch lower.
    var p = prestige + (isRecruit ? -0.6 : 0);
    var w = [
      { s: 2, w: clamp(52 - p * 4, 8, 60) },
      { s: 3, w: clamp(34 + p * 1.0, 20, 46) },
      { s: 4, w: clamp(4 + p * 3.4, 3, 46) },
      { s: 5, w: clamp(-8 + p * 2.4, 0.3, 22) }
    ];
    return weighted(rng, w, 'w').s;
  }

  function ovrForStars(rng, stars, year) {
    var base = { 2: 60, 3: 68, 4: 75, 5: 82 }[stars] || 62;
    var yb = { FR: -5, SO: 0, JR: 3, SR: 5 }[year] || 0;
    return clamp(Math.round(base + yb + (rng() * 8 - 4)), 40, 99);
  }

  function makePlayer(rng, pos, prestige, forcedYear, isRecruit) {
    var year = forcedYear || pick(rng, YEARS);
    var stars = rollStars(rng, prestige, isRecruit);
    var ovr = ovrForStars(rng, stars, isRecruit ? 'FR' : year);
    var dev = weighted(rng, DEV_TRAITS, 'w');
    var pot = clamp(ovr + Math.round(dev.head * (0.4 + rng() * 0.9)) + (5 - stars <= 1 ? 4 : 0), ovr, 99);
    return {
      id: uid('p'), name: N.make(rng), pos: pos, group: POS_GROUP[pos],
      year: isRecruit ? 'FR' : year, stars: stars, ovr: ovr, pot: pot, dev: dev.id
    };
  }

  var GameProgram = {
    POS_PLAN: POS_PLAN, YEARS: YEARS,

    // ---- roster generation ------------------------------------------------
    generateRoster: function (rng, prestige) {
      var roster = [];
      POS_PLAN.forEach(function (p) {
        var pos = p[0], count = p[2];
        // Spread across classes so there's a pipeline.
        for (var i = 0; i < count; i++) {
          var year = YEARS[i % 4];
          roster.push(makePlayer(rng, pos, prestige, year, false));
        }
      });
      GameProgram.markStarters(roster);
      return roster;
    },

    // Flag the top player(s) at each position as starters (for the depth chart).
    markStarters: function (roster) {
      var byPos = {};
      roster.forEach(function (pl) { pl.starter = false; (byPos[pl.pos] = byPos[pl.pos] || []).push(pl); });
      var starters = { QB: 1, RB: 1, WR: 3, TE: 1, OL: 5, DL: 4, LB: 3, CB: 2, S: 2, K: 1, P: 1 };
      Object.keys(byPos).forEach(function (pos) {
        byPos[pos].sort(function (a, b) { return b.ovr - a.ovr; });
        var n = starters[pos] || 1;
        for (var i = 0; i < byPos[pos].length; i++) byPos[pos][i].starter = i < n;
      });
      return roster;
    },

    posGroup: function (roster, pos) {
      return roster.filter(function (p) { return p.pos === pos; }).sort(function (a, b) { return b.ovr - a.ovr; });
    },
    topAvg: function (roster, pos, n) {
      var g = GameProgram.posGroup(roster, pos).slice(0, n);
      if (!g.length) return 55;
      return g.reduce(function (s, p) { return s + p.ovr; }, 0) / g.length;
    },

    // Unit + overall ratings derived from the depth chart.
    rosterRatings: function (state) {
      var r = state.roster || [];
      if (!r.length) return { off: 60, def: 60, overall: 60 };
      var off = GameProgram.topAvg(r, 'QB', 1) * 0.28 + GameProgram.topAvg(r, 'RB', 1) * 0.10 +
        GameProgram.topAvg(r, 'WR', 2) * 0.18 + GameProgram.topAvg(r, 'TE', 1) * 0.08 +
        GameProgram.topAvg(r, 'OL', 5) * 0.36;
      var def = GameProgram.topAvg(r, 'DL', 4) * 0.36 + GameProgram.topAvg(r, 'LB', 3) * 0.30 +
        (GameProgram.topAvg(r, 'CB', 2) + GameProgram.topAvg(r, 'S', 2)) / 2 * 0.34;
      return { off: Math.round(off), def: Math.round(def), overall: Math.round((off + def) / 2) };
    },

    // The player's season power rating: roster-driven, nudged by prestige/coach.
    playerTeamRating: function (state) {
      var rr = GameProgram.rosterRatings(state);
      var team = T.get(state.team.id) || { prestige: 5 };
      var c = state.coach.ratings || {};
      var coachBump = ((c.offense + c.defense + c.motivation) / 3 - 62) * 0.12;
      var r = 0.72 * rr.overall + 0.20 * (45 + team.prestige * 4.6) + 8 + coachBump;
      return clamp(Math.round(r), 35, 99);
    },

    // Game-day unit ratings for the player (blend roster + coach).
    playerUnitRatings: function (state) {
      var rr = GameProgram.rosterRatings(state);
      var c = state.coach.ratings || {};
      return {
        off: clamp(Math.round(rr.off * 0.68 + (45 + 0) + (c.offense - 62) * 0.32 + (c.development - 62) * 0.08), 35, 99),
        def: clamp(Math.round(rr.def * 0.68 + 45 + (c.defense - 62) * 0.32 + (c.discipline - 62) * 0.08), 35, 99)
      };
    },

    // ---- recruiting -------------------------------------------------------
    // Build a national recruiting board for the upcoming class.
    generateBoard: function (rng, prestige, classYear, size) {
      size = size || 64;
      var board = [];
      for (var i = 0; i < size; i++) {
        var pos = pick(rng, POS_PLAN)[0];
        // National pool: independent of your prestige, skews to 3-star. Blue-chip
        // (4-5 star) prospects are deliberately scarce.
        var w = [{ s: 2, w: 36 }, { s: 3, w: 46 }, { s: 4, w: 15 }, { s: 5, w: 3 }];
        var stars = weighted(rng, w, 'w').s;
        var proj = ovrForStars(rng, stars, 'FR');
        var dev = weighted(rng, DEV_TRAITS, 'w');
        var pot = clamp(proj + Math.round(dev.head * (0.5 + rng())), proj, 99);
        // Initial lean toward the player: bigger programs start ahead, but blue
        // chips start well short of a commitment for everyone.
        var lean = clamp(6 + prestige * 1.7 - (stars - 3) * 10 + (rng() * 8 - 4), 1, 48);
        board.push({
          id: uid('r'), name: N.make(rng), pos: pos, stars: stars,
          proj: proj, pot: pot, dev: dev.id,
          lean: Math.round(lean), status: 'open', heat: 0
        });
      }
      board.sort(function (a, b) { return (b.stars * 100 + b.proj) - (a.stars * 100 + a.proj); });
      board.forEach(function (p, i) { p.rank = i + 1; });
      return board;
    },

    weeklyRecruitPoints: function (state) {
      var c = state.coach.ratings || {};
      return Math.round(8 + c.recruiting * 0.09 + state.program.nilLevel * 0.05);
    },

    // Called each time a week is advanced: grant points + AI competition.
    onWeekAdvanced: function (state) {
      var rec = state.recruiting;
      if (rec.signed) return;
      rec.points += GameProgram.weeklyRecruitPoints(state);
      rec.weeksRecruited = (rec.weeksRecruited || 0) + 1;
      var rng = E.makeRng((state.season.seed ^ (rec.weeksRecruited * 0x27d4eb2f)) >>> 0);
      // Rivals pull uncommitted prospects: the less you've invested, the more
      // likely a prospect commits elsewhere. Higher stars leave faster.
      rec.board.forEach(function (p) {
        if (p.status !== 'open') return;
        // Rivals poach blue chips fast if you're not actively invested.
        var leaveP = 0.02 + (p.stars - 2) * 0.03 - p.lean * 0.0006 - p.heat * 0.02;
        if (rng() < clamp(leaveP, 0.004, 0.2)) { p.status = 'lost'; }
      });
    },

    // Spend recruiting points on a prospect to raise their lean toward you.
    recruitEffort: function (state, prospectId, pts) {
      var rec = state.recruiting;
      var p = rec.board.filter(function (x) { return x.id === prospectId; })[0];
      if (!p || p.status !== 'open' || rec.signed) return { ok: false };
      pts = Math.max(1, Math.min(pts, rec.points));
      if (pts <= 0) return { ok: false };
      rec.points -= pts;
      var team = T.get(state.team.id) || { prestige: 5 };
      // Prestige + NIL raise your base pull; higher-star prospects resist harder
      // for everyone, so blue chips demand real, focused investment.
      var base = 1.35 + team.prestige * 0.06 + state.program.nilLevel * 0.012;
      var starResist = 1 + Math.max(0, p.stars - 3) * 0.95;
      var pull = base / starResist;
      p.heat = (p.heat || 0) + pts;
      p.lean = clamp(p.lean + pts * pull, 0, 100);
      var committed = false;
      if (p.lean >= 100) {
        p.status = 'committed'; committed = true;
        if (rec.commits.indexOf(p.id) < 0) rec.commits.push(p.id);
      }
      return { ok: true, committed: committed, lean: Math.round(p.lean), spent: pts };
    },

    commitList: function (state) {
      var ids = state.recruiting.commits;
      return state.recruiting.board.filter(function (p) { return ids.indexOf(p.id) >= 0; });
    },

    // Lock the class at season's end. Committed prospects become the signed
    // class; they join the roster at the next-season rollover.
    signingDay: function (state) {
      var rec = state.recruiting;
      var signed = GameProgram.commitList(state).map(function (p) {
        return { id: p.id, name: p.name, pos: p.pos, stars: p.stars, proj: p.proj, pot: p.pot, dev: p.dev };
      });
      rec.signed = true;
      state.program.signedClass = signed;
      return signed;
    },

    classSummary: function (signed) {
      var byStar = { 5: 0, 4: 0, 3: 0, 2: 0 };
      signed.forEach(function (p) { byStar[p.stars] = (byStar[p.stars] || 0) + 1; });
      // 0-100 class score: blue chips are worth far more than volume, so a small
      // elite class and a big solid class land in a similar-but-distinct range.
      var pts = { 5: 28, 4: 17, 3: 8, 2: 3 };
      var score = signed.reduce(function (s, p) { return s + (pts[p.stars] || 0) + (p.proj - 60) * 0.1; }, 0);
      return { count: signed.length, byStar: byStar, score: Math.round(clamp(score, 0, 100)) };
    },

    // ---- offseason: budget, portal, attrition -----------------------------
    beginOffseason: function (state) {
      var team = T.get(state.team.id) || { prestige: 5 };
      var lastWins = 0;
      var h = state.history[state.history.length - 1];
      if (h) lastWins = h.wins;
      state.program.offseasonPoints = Math.round(14 + team.prestige * 1.6 + lastWins * 0.8 + state.career.reputation * 0.06);
      // Own-player attrition: some non-seniors enter the portal / leave. Higher
      // NIL retains more; deep backups more likely to bolt for playing time.
      var rng = E.makeRng((state.seed ^ (state.career.year * 0x9e3779b9)) >>> 0);
      var departures = [];
      state.roster.forEach(function (p) {
        if (p.year === 'SR') return; // handled by graduation
        var base = p.starter ? 0.03 : 0.10;
        var leaveP = base - state.program.nilLevel * 0.0006 + (p.stars >= 4 && !p.starter ? 0.05 : 0);
        if (rng() < clamp(leaveP, 0.01, 0.22)) { p.leaving = true; departures.push(p); }
      });
      state.program.departures = departures.map(function (p) { return { name: p.name, pos: p.pos, stars: p.stars, ovr: p.ovr }; });
      // Incoming transfer portal pool.
      state.program.portal = GameProgram.generatePortal(rng, team.prestige, state.career.year);
      return { points: state.program.offseasonPoints, departures: state.program.departures, portal: state.program.portal };
    },

    generatePortal: function (rng, prestige, year, size) {
      size = size || 10;
      var out = [];
      for (var i = 0; i < size; i++) {
        var pos = pick(rng, POS_PLAN)[0];
        var yr = pick(rng, ['SO', 'JR', 'JR', 'SR']);
        var stars = rollStars(rng, prestige + 1, true);
        var ovr = ovrForStars(rng, stars, yr);
        var dev = weighted(rng, DEV_TRAITS, 'w');
        var cost = clamp(Math.round((ovr - 58) * 0.7 + stars * 2), 2, 30);
        out.push({ id: uid('t'), name: N.make(rng), pos: pos, year: yr, stars: stars, ovr: ovr, pot: clamp(ovr + dev.head, ovr, 99), dev: dev.id, cost: cost, signed: false });
      }
      out.sort(function (a, b) { return b.ovr - a.ovr; });
      return out;
    },

    signTransfer: function (state, transferId) {
      var t = state.program.portal.filter(function (x) { return x.id === transferId; })[0];
      if (!t || t.signed) return { ok: false };
      if (state.program.offseasonPoints < t.cost) return { ok: false, reason: 'funds' };
      state.program.offseasonPoints -= t.cost;
      t.signed = true;
      // Add immediately as a returning player for next season.
      state.roster.push({ id: uid('p'), name: t.name, pos: t.pos, group: POS_GROUP[t.pos], year: t.year, stars: t.stars, ovr: t.ovr, pot: t.pot, dev: t.dev, transfer: true });
      return { ok: true, spent: t.cost };
    },

    // Spend offseason points to raise NIL or Facilities (each +1 costs 1).
    invest: function (state, kind, amount) {
      amount = Math.max(0, Math.min(amount, state.program.offseasonPoints));
      if (amount <= 0) return { ok: false };
      var key = kind === 'nil' ? 'nilLevel' : 'facilitiesLevel';
      var room = 100 - state.program[key];
      amount = Math.min(amount, room);
      if (amount <= 0) return { ok: false, reason: 'max' };
      state.program.offseasonPoints -= amount;
      state.program[key] = clamp(state.program[key] + amount, 0, 100);
      return { ok: true, level: state.program[key] };
    },

    // ---- rollover: develop, graduate, integrate class ---------------------
    developAndRollover: function (state) {
      var rng = E.makeRng((state.seed ^ (state.career.year * 2246822519)) >>> 0);
      var c = state.coach.ratings || {};
      var fac = state.program.facilitiesLevel;
      var kept = [];
      state.roster.forEach(function (p) {
        if (p.leaving) return;            // transferred out
        if (p.year === 'SR') return;      // graduated
        // Develop.
        var headroom = Math.max(0, p.pot - p.ovr);
        var traitBoost = { normal: 1, impact: 1.6, star: 2.2, elite: 3 }[p.dev] || 1;
        var gain = (1 + rng() * 2) * traitBoost + fac * 0.02 + (c.development - 62) * 0.02;
        p.ovr = clamp(Math.round(p.ovr + Math.min(headroom, gain)), 40, 99);
        // Advance class.
        p.year = YEARS[Math.min(3, YEARS.indexOf(p.year) + 1)];
        delete p.leaving;
        kept.push(p);
      });
      // Add signed recruits as freshmen.
      (state.program.signedClass || []).forEach(function (r) {
        kept.push({ id: uid('p'), name: r.name, pos: r.pos, group: POS_GROUP[r.pos], year: 'FR', stars: r.stars, ovr: clamp(r.proj - 3, 40, 99), pot: r.pot, dev: r.dev });
      });
      // Backfill thin positions with walk-ons so the depth chart is never empty.
      POS_PLAN.forEach(function (pl) {
        var pos = pl[0], min = Math.max(1, pl[2] - 3);
        var have = kept.filter(function (p) { return p.pos === pos; }).length;
        for (var i = have; i < min; i++) {
          var team = T.get(state.team.id) || { prestige: 4 };
          kept.push(makePlayer(rng, pos, Math.max(2, team.prestige - 2), 'FR', false));
        }
      });
      state.roster = kept;
      GameProgram.markStarters(state.roster);
      return state.roster;
    },

    // ---- lifecycle --------------------------------------------------------
    // Called once when a new career begins.
    initProgram: function (state) {
      var team = T.get(state.team.id) || { prestige: 5 };
      var rng = E.makeRng(((state.seed || 1) ^ 0x5bd1e995) >>> 0);
      state.roster = GameProgram.generateRoster(rng, team.prestige);
      state.program.nilLevel = clamp(20 + team.prestige * 5, 10, 90);
      state.program.facilitiesLevel = clamp(20 + team.prestige * 5, 10, 90);
      state.program.offseasonPoints = 0;
      state.recruiting = E.freshState().recruiting;
      state.recruiting.classYear = state.career.year + 1;
      state.recruiting.board = GameProgram.generateBoard(rng, team.prestige, state.recruiting.classYear);
      return state;
    },

    // Fresh recruiting class for a new season (called from GameSeason.start).
    startRecruitingClass: function (state) {
      var team = T.get(state.team.id) || { prestige: 5 };
      var rng = E.makeRng((state.season.seed ^ 0xc2b2ae35) >>> 0);
      state.recruiting = E.freshState().recruiting;
      state.recruiting.classYear = state.career.year + 1;
      state.recruiting.board = GameProgram.generateBoard(rng, team.prestige, state.recruiting.classYear);
    },

    // Full transition from the offseason into the next season: integrate the
    // signed class + portal, develop/graduate the roster, advance the year, and
    // kick off a fresh season with a new recruiting class.
    startNextSeason: function (state) {
      GameProgram.developAndRollover(state);   // add signed class, graduate SR, develop
      state.career.year++;
      state.program.signedClass = [];
      state.program.departures = [];
      state.program.portal = [];
      if (window.GameSeason) window.GameSeason.start(state); // sets fresh season seed
      GameProgram.startRecruitingClass(state); // new class using the fresh seed
      return state.season;
    },

    // Ensure a career that predates wave 4 (old save) gets a roster/board.
    ensureProgram: function (state) {
      if (!state.roster || !state.roster.length) GameProgram.initProgram(state);
      else if (!state.recruiting.board || !state.recruiting.board.length) {
        var team = T.get(state.team.id) || { prestige: 5 };
        var rng = E.makeRng(((state.seed || 1) ^ 0x1b56c4f) >>> 0);
        state.recruiting.board = GameProgram.generateBoard(rng, team.prestige, state.career.year + 1);
      }
      return state;
    }
  };

  window.GameProgram = GameProgram;
})();
