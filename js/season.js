/* GRIDIRON DYNASTY — season.js
 * window.GameSeason: division-aware schedule generation, weekly game sim,
 * AP-style rankings, conference championships, 12-team playoff + bowls, and
 * season->career rollover. Operates on window.GameEngine.state.season.
 *
 * Design notes:
 * - Only the player's division is simulated (currently FBS; others tier in later).
 * - The schedule is a single global list of matchups so a game is one row shared
 *   by both teams. Weeks are assigned greedily (<=1 game per team per week).
 * - Team ratings are computed once at season start and stored in league[id] so
 *   results are stable across save/reload.
 */
(function () {
  'use strict';

  var E = window.GameEngine;
  var T = window.TeamData;

  var TOTAL_REG_WEEKS = 14;   // 12 games + up to 2 byes → reliable placement
  var GAMES_PER_TEAM = 12;
  var MAX_CONF_GAMES = 9;

  var BOWL_NAMES = [
    'Sun Bowl', 'Gator Bowl', 'Liberty Bowl', 'Holiday Bowl', 'Las Vegas Bowl',
    'Music City Bowl', 'Duke\'s Mayo Bowl', 'Pinstripe Bowl', 'Texas Bowl',
    'Cheez-It Bowl', 'ReliaQuest Bowl', 'Gasparilla Bowl', 'Armed Forces Bowl',
    'Independence Bowl', 'Birmingham Bowl', 'Frisco Bowl', 'Cure Bowl',
    'Boca Raton Bowl', 'Camellia Bowl', 'New Orleans Bowl', 'Myrtle Beach Bowl',
    'First Responder Bowl', 'Fenway Bowl', 'Hawaii Bowl', 'Guaranteed Rate Bowl'
  ];
  // Names given to the New Year's Six-style playoff sites (flavor only).
  var CFP_SITES = ['Rose Bowl', 'Sugar Bowl', 'Orange Bowl', 'Cotton Bowl', 'Fiesta Bowl', 'Peach Bowl'];

  // ---- small utils ----------------------------------------------------------
  function hashStr(s) {
    var h = 2166136261 >>> 0;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function shuffle(arr, rng) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(rng() * (i + 1));
      var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }
  function pairKey(a, b) { return a < b ? a + '|' + b : b + '|' + a; }

  // ---- ratings --------------------------------------------------------------
  function ratingFor(team, year, coach, isPlayer) {
    var wob = (hashStr(team.id + ':' + year) % 15) - 7; // -7..+7, stable per season
    var r = 44 + team.prestige * 4.6 + wob;
    if (isPlayer && coach && coach.ratings) {
      var c = coach.ratings;
      var coachAvg = (c.offense + c.defense + c.development + c.discipline + c.motivation + c.recruiting) / 6;
      r += (coachAvg - 60) * 0.28;
    }
    return clamp(Math.round(r), 35, 99);
  }

  // ---- schedule -------------------------------------------------------------
  function buildSchedule(teams, rng, priorityId) {
    var byId = {}; teams.forEach(function (t) { byId[t.id] = t; });
    var games = [];
    var gcount = {}, ccount = {}, played = {};
    teams.forEach(function (t) { gcount[t.id] = 0; ccount[t.id] = 0; });

    function add(a, b, isConf, isRiv) {
      if (a === b) return false;
      var k = pairKey(a, b);
      if (played[k]) return false;
      if (gcount[a] >= GAMES_PER_TEAM || gcount[b] >= GAMES_PER_TEAM) return false;
      if (isConf && (ccount[a] >= MAX_CONF_GAMES || ccount[b] >= MAX_CONF_GAMES)) return false;
      played[k] = true; gcount[a]++; gcount[b]++;
      if (isConf) { ccount[a]++; ccount[b]++; }
      games.push({ home: a, away: b, conf: !!isConf, rivalry: !!isRiv, neutral: false });
      return true;
    }

    // 1) Rivalry games first (may be cross-conference).
    teams.forEach(function (t) {
      (t.rivals || []).forEach(function (r) {
        if (byId[r]) add(t.id, r, byId[r].conf === t.conf, true);
      });
    });

    // 1b) Guarantee the player's team a full slate before general scheduling,
    // while opponents still have open games (prefer conference foes).
    if (priorityId && byId[priorityId]) {
      var pconf = byId[priorityId].conf;
      var cands = shuffle(teams.slice(), rng).sort(function (a, b) {
        return (b.conf === pconf ? 1 : 0) - (a.conf === pconf ? 1 : 0);
      });
      for (var pi = 0; pi < cands.length && gcount[priorityId] < GAMES_PER_TEAM; pi++) {
        if (cands[pi].id === priorityId) continue;
        add(priorityId, cands[pi].id, cands[pi].conf === pconf, false);
      }
    }

    // 2) Conference games (partial round-robin, capped per team).
    var byConf = {};
    teams.forEach(function (t) { (byConf[t.conf] = byConf[t.conf] || []).push(t); });
    Object.keys(byConf).forEach(function (conf) {
      var list = shuffle(byConf[conf].slice(), rng);
      for (var i = 0; i < list.length; i++) {
        for (var j = i + 1; j < list.length; j++) {
          add(list[i].id, list[j].id, true, false);
        }
      }
    });

    // 3) Fill remaining slots with random non-conference opponents.
    var pool = teams.slice();
    var guard = 0;
    var needy = function () { return pool.filter(function (t) { return gcount[t.id] < GAMES_PER_TEAM; }); };
    var rem = needy();
    while (rem.length > 1 && guard++ < 20000) {
      shuffle(rem, rng);
      var placedAny = false;
      for (var a = 0; a < rem.length; a++) {
        if (gcount[rem[a].id] >= GAMES_PER_TEAM) continue;
        for (var b = a + 1; b < rem.length; b++) {
          if (gcount[rem[b].id] >= GAMES_PER_TEAM) continue;
          if (add(rem[a].id, rem[b].id, false, false)) { placedAny = true; break; }
        }
      }
      rem = needy();
      if (!placedAny) break;
    }

    // 4) Assign weeks greedily so no team plays twice in a week.
    var busy = {}; teams.forEach(function (t) { busy[t.id] = {}; });
    // Assign the player's games first (so they always fit the 14-week slate),
    // then rivalries, then the rest.
    games.sort(function (x, y) {
      var px = (priorityId && (x.home === priorityId || x.away === priorityId)) ? 1 : 0;
      var py = (priorityId && (y.home === priorityId || y.away === priorityId)) ? 1 : 0;
      if (px !== py) return py - px;
      return (y.rivalry ? 1 : 0) - (x.rivalry ? 1 : 0);
    });
    var scheduled = [];
    games.forEach(function (g) {
      for (var w = 1; w <= TOTAL_REG_WEEKS; w++) {
        if (!busy[g.home][w] && !busy[g.away][w]) {
          g.week = w; busy[g.home][w] = true; busy[g.away][w] = true;
          scheduled.push(g); return;
        }
      }
      // Could not place within the regular season — drop it (rare).
    });
    // Randomize home/away a bit so it's not always the first-listed team at home.
    scheduled.forEach(function (g) {
      if (!g.rivalry && rng() < 0.5) { var t = g.home; g.home = g.away; g.away = t; }
      g.homeScore = null; g.awayScore = null; g.played = false; g.tag = g.rivalry ? 'Rivalry' : (g.conf ? 'Conf' : '');
    });
    return scheduled;
  }

  // ---- game sim -------------------------------------------------------------
  // Update league standings from a game whose scores are already set.
  function applyResult(g, league) {
    var H = league[g.home], A = league[g.away];
    var hs = g.homeScore, as = g.awayScore;
    H.pf += hs; H.pa += as; A.pf += as; A.pa += hs;
    var homeWon = hs > as;
    if (homeWon) { H.w++; A.l++; } else { A.w++; H.l++; }
    if (g.conf) {
      if (homeWon) { H.cw++; A.cl++; } else { A.cw++; H.cl++; }
    }
    g.winner = homeWon ? g.home : g.away;
    g.played = true;
    return g;
  }

  // Quick-sim a game to a final score (used for non-player games).
  function simGame(g, league, rng) {
    var hr = league[g.home].rating + (g.neutral ? 0 : 3); // home-field edge
    var ar = league[g.away].rating;
    var diff = hr - ar;
    var hs = 21 + diff * 0.45 + (rng() * 2 - 1) * 17;
    var as = 21 - diff * 0.45 + (rng() * 2 - 1) * 17;
    hs = clamp(Math.round(hs), 0, 70);
    as = clamp(Math.round(as), 0, 70);
    if (hs === as) { if (rng() < 0.5) hs += 3; else as += 3; } // break ties (OT)
    g.homeScore = hs; g.awayScore = as;
    return applyResult(g, league);
  }

  // ---- rankings -------------------------------------------------------------
  function computeRankings(league, teamIds) {
    var scored = teamIds.map(function (id) {
      var L = league[id];
      var score = L.w * 135 - L.l * 82 + L.rating * 1.5 + (L.pf - L.pa) * 0.08;
      return { id: id, score: score };
    });
    scored.sort(function (a, b) { return b.score - a.score; });
    return scored.map(function (s) { return s.id; });
  }

  // ---- public API -----------------------------------------------------------
  var GameSeason = {
    TOTAL_REG_WEEKS: TOTAL_REG_WEEKS,

    // Divisions currently simulated (player's division).
    leagueTeams: function (state) {
      var div = (T.get(state.team.id) || {}).div || state.team.division || 'fbs';
      return T.byDivision(div);
    },

    // Begin a new season: ratings, schedule, empty records.
    start: function (state) {
      var s = state.season;
      var teams = GameSeason.leagueTeams(state);
      s.seed = (hashStr(state.team.id + ':' + state.career.year) ^ (state.seed || 0)) >>> 0;
      var rng = E.makeRng(s.seed);
      var league = {};
      teams.forEach(function (t) {
        var isPlayer = t.id === state.team.id;
        league[t.id] = {
          rating: ratingFor(t, state.career.year, state.coach, isPlayer),
          w: 0, l: 0, cw: 0, cl: 0, pf: 0, pa: 0, champ: false
        };
      });
      // Roster-driven strength for the player's program (wave 4).
      if (window.GameProgram && league[state.team.id]) {
        window.GameProgram.ensureProgram(state);
        league[state.team.id].rating = window.GameProgram.playerTeamRating(state);
      }
      s.league = league;
      s.schedule = buildSchedule(teams, rng, state.team.id);
      s.rankings = computeRankings(league, teams.map(function (t) { return t.id; }));
      s.year = state.career.year;
      s.week = 1;
      s.phase = 'regular';
      s.totalRegWeeks = TOTAL_REG_WEEKS;
      s.postseason = { confChamps: {}, confGames: [], cfpSeeds: [], bracket: [], bowls: [], champion: null };
      s.record = { wins: 0, losses: 0, confWins: 0, confLosses: 0 };
      s.started = true;
      if (window.GameScandal) window.GameScandal.onSeasonStart(state);
      return s;
    },

    ensureStarted: function (state) {
      if (!state.season.started || state.season.phase === 'preseason') GameSeason.start(state);
      return state.season;
    },

    // Games the player is involved in, in week order.
    playerGames: function (state) {
      var id = state.team.id;
      return state.season.schedule
        .filter(function (g) { return g.home === id || g.away === id; })
        .sort(function (a, b) { return a.week - b.week; });
    },

    gamesInWeek: function (state, week) {
      return state.season.schedule.filter(function (g) { return g.week === week; });
    },

    // The player's game in the current week (null on a bye).
    playerWeekGame: function (state) {
      var id = state.team.id;
      return GameSeason.gamesInWeek(state, state.season.week).filter(function (g) {
        return g.home === id || g.away === id;
      })[0] || null;
    },

    // Commit a player-coached final score, then quick-sim the rest of the week
    // and advance. Mirrors simWeek's bookkeeping but leaves the player's game
    // to the broadcast result.
    commitPlayerResult: function (state, homeScore, awayScore) {
      var s = state.season;
      if (s.phase !== 'regular') return null;
      var wk = s.week;
      var pg = GameSeason.playerWeekGame(state);
      if (pg && !pg.played) {
        pg.homeScore = homeScore; pg.awayScore = awayScore;
        applyResult(pg, s.league);
      }
      var rng = E.makeRng((s.seed ^ (wk * 2654435761)) >>> 0);
      GameSeason.gamesInWeek(state, wk).forEach(function (g) { if (!g.played) simGame(g, s.league, rng); });
      s.rankings = computeRankings(s.league, Object.keys(s.league));
      var res = { week: wk, games: GameSeason.gamesInWeek(state, wk), playerGame: pg };
      s.week++;
      if (s.week > s.totalRegWeeks) s.phase = 'confchamp';
      if (window.GameProgram) window.GameProgram.onWeekAdvanced(state);
      if (window.GameScandal) window.GameScandal.maybeTrigger(state);
      GameSeason.syncPlayerRecord(state);
      return res;
    },

    // Sim every game in the current week; advance the pointer.
    simWeek: function (state) {
      var s = state.season;
      if (s.phase !== 'regular') return null;
      var rng = E.makeRng((s.seed ^ (s.week * 2654435761)) >>> 0);
      var games = GameSeason.gamesInWeek(state, s.week);
      games.forEach(function (g) { if (!g.played) simGame(g, s.league, rng); });
      s.rankings = computeRankings(s.league, Object.keys(s.league));
      var playerGame = games.filter(function (g) { return g.home === state.team.id || g.away === state.team.id; })[0] || null;
      var wk = s.week;
      s.week++;
      if (s.week > s.totalRegWeeks) s.phase = 'confchamp';
      if (window.GameProgram) window.GameProgram.onWeekAdvanced(state);
      if (window.GameScandal) window.GameScandal.maybeTrigger(state);
      GameSeason.syncPlayerRecord(state);
      return { week: wk, games: games, playerGame: playerGame };
    },

    // Conference title games: top two by conference record meet at a neutral site.
    playConfChamps: function (state) {
      var s = state.season;
      if (s.phase !== 'confchamp') return null;
      var rng = E.makeRng((s.seed ^ 0x9e3779b9) >>> 0);
      var teams = GameSeason.leagueTeams(state);
      var byConf = {};
      teams.forEach(function (t) { (byConf[t.conf] = byConf[t.conf] || []).push(t.id); });
      var titleGames = [];
      Object.keys(byConf).forEach(function (conf) {
        var ids = byConf[conf].slice();
        ids.sort(function (a, b) { return GameSeason._confSort(s.league, a, b); });
        if (ids.length >= 4) {
          var g = { home: ids[0], away: ids[1], conf: true, rivalry: false, neutral: true,
            homeScore: null, awayScore: null, played: false, tag: conf + ' Championship', bowlName: conf + ' Championship' };
          simGame(g, s.league, rng);
          s.postseason.confChamps[conf] = g.winner;
          s.league[g.winner].champ = true;
          titleGames.push(g);
          (s.postseason.confGames = s.postseason.confGames || []).push(g);
        } else if (ids.length) {
          // Small "conference" (e.g. independents): best record is champion, no game.
          s.postseason.confChamps[conf] = ids[0];
          s.league[ids[0]].champ = true;
        }
      });
      s.rankings = computeRankings(s.league, Object.keys(s.league));
      s.phase = 'postseason';
      GameSeason.syncPlayerRecord(state);
      return titleGames;
    },

    _confSort: function (league, a, b) {
      var A = league[a], B = league[b];
      var apct = A.cw + A.cl ? A.cw / (A.cw + A.cl) : 0;
      var bpct = B.cw + B.cl ? B.cw / (B.cw + B.cl) : 0;
      if (bpct !== apct) return bpct - apct;
      if (B.w !== A.w) return B.w - A.w;
      return B.rating - A.rating;
    },

    // 12-team playoff (5 top conf champs seeded, 7 at-large) + bowls, all simmed.
    playPostseason: function (state) {
      var s = state.season;
      if (s.phase !== 'postseason') return null;
      var rng = E.makeRng((s.seed ^ 0x85ebca6b) >>> 0);
      var ranked = s.rankings.slice();
      var rankOf = {}; ranked.forEach(function (id, i) { rankOf[id] = i; });

      // Postseason ban (NCAA sanction): the player's team is ineligible.
      var banned = {};
      if (window.GameScandal && window.GameScandal.postseasonBanned(state)) {
        banned[state.team.id] = true;
        s.postseason.playerBanned = true;
      }

      // Highest-ranked conference champions (guarantee up to 5 in the field).
      var champs = Object.keys(s.postseason.confChamps).map(function (c) { return s.postseason.confChamps[c]; })
        .filter(function (id) { return !banned[id]; });
      champs.sort(function (a, b) { return rankOf[a] - rankOf[b]; });
      var seeds = [];
      var inField = {};
      Object.keys(banned).forEach(function (id) { inField[id] = true; }); // exclude from at-large too
      champs.slice(0, 5).forEach(function (id) { if (!inField[id]) { seeds.push(id); inField[id] = true; } });
      // Fill to 12 with the best remaining ranked teams (at-large).
      for (var i = 0; i < ranked.length && seeds.length < 12; i++) {
        if (!inField[ranked[i]]) { seeds.push(ranked[i]); inField[ranked[i]] = true; }
      }
      // Re-seed 1..12 by ranking order.
      seeds.sort(function (a, b) { return rankOf[a] - rankOf[b]; });
      s.postseason.cfpSeeds = seeds.slice();

      // Bracket: 1-4 byes; first round 5v12,6v11,7v10,8v9.
      var bracket = { round: [], names: CFP_SITES };
      function game(home, away, tag, site) {
        var g = { home: home, away: away, conf: false, rivalry: false, neutral: true,
          homeScore: null, awayScore: null, played: false, tag: tag, bowlName: site || tag };
        simGame(g, s.league, rng); return g;
      }
      // First round (seeds 5-12); higher seed hosts.
      var fr = [ [5, 12], [8, 9], [6, 11], [7, 10] ].map(function (p) {
        return game(seeds[p[0] - 1], seeds[p[1] - 1], 'CFP First Round');
      });
      // Quarterfinals: seed1 vs winner(8/9), seed4 vs winner(5/12), seed2 vs winner(7/10), seed3 vs winner(6/11)
      var qf = [
        game(seeds[0], fr[1].winner, 'CFP Quarterfinal', CFP_SITES[0]),
        game(seeds[3], fr[0].winner, 'CFP Quarterfinal', CFP_SITES[1]),
        game(seeds[1], fr[3].winner, 'CFP Quarterfinal', CFP_SITES[2]),
        game(seeds[2], fr[2].winner, 'CFP Quarterfinal', CFP_SITES[3])
      ];
      var sf = [
        game(qf[0].winner, qf[1].winner, 'CFP Semifinal', CFP_SITES[4]),
        game(qf[2].winner, qf[3].winner, 'CFP Semifinal', CFP_SITES[5])
      ];
      var natl = game(sf[0].winner, sf[1].winner, 'National Championship', 'National Championship');
      bracket.firstRound = fr; bracket.quarters = qf; bracket.semis = sf; bracket.final = natl;
      s.postseason.bracket = bracket;
      s.postseason.champion = natl.winner;
      s.league[natl.winner].champ = true;

      // Bowls: teams with >=6 wins, not already in the playoff, paired off.
      var eligible = ranked.filter(function (id) { return s.league[id].w >= 6 && !inField[id]; });
      var bowls = [];
      for (var b = 0; b + 1 < eligible.length && bowls.length < BOWL_NAMES.length; b += 2) {
        var g = { home: eligible[b], away: eligible[b + 1], conf: false, rivalry: false, neutral: true,
          homeScore: null, awayScore: null, played: false, tag: 'Bowl', bowlName: BOWL_NAMES[bowls.length] };
        simGame(g, s.league, rng);
        bowls.push(g);
      }
      s.postseason.bowls = bowls;
      s.rankings = computeRankings(s.league, Object.keys(s.league));
      s.phase = 'complete';
      GameSeason.syncPlayerRecord(state);
      return s.postseason;
    },

    // All postseason games the player appeared in (for their record + display).
    playerPostseasonGames: function (state) {
      var id = state.team.id, out = [];
      var ps = state.season.postseason;
      (ps.confGames || []).forEach(function (g) { if (g.home === id || g.away === id) out.push(g); });
      var bk = ps.bracket;
      if (bk && bk.firstRound) {
        [].concat(bk.firstRound, bk.quarters, bk.semis, [bk.final]).forEach(function (g) {
          if (g && (g.home === id || g.away === id)) out.push(g);
        });
      }
      (ps.bowls || []).forEach(function (g) { if (g.home === id || g.away === id) out.push(g); });
      return out;
    },

    // Recompute the player's season W/L (regular + postseason) into season.record.
    syncPlayerRecord: function (state) {
      var id = state.team.id;
      var rec = { wins: 0, losses: 0, confWins: 0, confLosses: 0 };
      function tally(g) {
        if (!g || !g.played) return;
        if (g.home !== id && g.away !== id) return;
        var won = g.winner === id;
        if (won) rec.wins++; else rec.losses++;
        if (g.conf) { if (won) rec.confWins++; else rec.confLosses++; }
      }
      state.season.schedule.forEach(tally);
      // conf title game (stored only inside titleGames run -> reflected via league; also count here)
      GameSeason.playerPostseasonGames(state).forEach(tally);
      // conference championship game isn't in schedule; find via league champ handled separately.
      state.season.record = rec;
      return rec;
    },

    // Human-readable current-phase label.
    phaseLabel: function (state) {
      var s = state.season;
      switch (s.phase) {
        case 'regular': return 'Week ' + s.week + ' of ' + s.totalRegWeeks;
        case 'confchamp': return 'Conference Championships';
        case 'postseason': return 'Playoff & Bowls';
        case 'complete': return 'Season Complete';
        default: return 'Preseason';
      }
    },

    // Finalize: roll season results into the career, archive a summary, advance year.
    finish: function (state) {
      var s = state.season;
      var id = state.team.id;
      var team = T.get(id) || { prestige: 5, name: state.team.name, conf: '' };
      GameSeason.syncPlayerRecord(state);
      var rec = s.record;

      var wonConf = false;
      Object.keys(s.postseason.confChamps).forEach(function (c) {
        if (s.postseason.confChamps[c] === id) wonConf = true;
      });
      var wonNatl = s.postseason.champion === id;
      var madePlayoff = (s.postseason.cfpSeeds || []).indexOf(id) >= 0;
      var finalRank = s.rankings.indexOf(id); // 0-based; -1 if unranked (shouldn't happen)

      // Reputation: performance vs. a prestige-based expectation.
      var expectedWins = clamp(Math.round(team.prestige * 0.9 + 1), 3, 11);
      var delta = (rec.wins - expectedWins) * 2;
      if (wonConf) delta += 8;
      if (madePlayoff) delta += 6;
      if (wonNatl) delta += 16;
      if (finalRank >= 0 && finalRank < 25) delta += 3;
      state.career.reputation = clamp(Math.round(state.career.reputation + delta), 0, 100);

      // Career totals.
      state.career.wins += rec.wins;
      state.career.losses += rec.losses;
      if (wonConf) state.career.confTitles++;
      if (wonNatl) state.career.natTitles++;
      state.career.seasonsCoached++;
      state.career.legacyPoints += rec.wins + (wonConf ? 10 : 0) + (wonNatl ? 30 : 0) + (madePlayoff ? 6 : 0);
      var job = state.career.jobs[state.career.jobs.length - 1];
      if (job) { job.wins += rec.wins; job.losses += rec.losses; }

      var summary = {
        year: state.career.year,
        teamId: id,
        teamName: team.name,
        wins: rec.wins, losses: rec.losses,
        confWins: rec.confWins, confLosses: rec.confLosses,
        finalRank: finalRank >= 0 ? finalRank + 1 : null,
        wonConf: wonConf, madePlayoff: madePlayoff, wonNatl: wonNatl,
        champion: s.postseason.champion,
        championName: (T.get(s.postseason.champion) || {}).name || '',
        reputation: state.career.reputation,
        repDelta: delta,
        postseasonBanned: !!s.postseason.playerBanned
      };

      // Compliance review: AD trust, investigation + verdict, sanctions, firing.
      if (window.GameScandal) {
        summary.verdict = window.GameScandal.endSeasonReview(state, summary);
        summary.fired = state.integrity.fired;
        summary.firedReason = state.integrity.firedReason;
        summary.adTrust = state.integrity.adTrust;
        summary.reputation = state.career.reputation; // may have changed from sanctions
      }
      // Job carousel: offers from bigger programs (only if not fired).
      if (window.GameCareer && !(summary.fired)) {
        summary.offers = window.GameCareer.generateOffers(state, summary);
      }
      state.history.push(summary);

      // Hand off to the offseason (signing day → portal/budget → rollover).
      // The year is advanced later by GameProgram.startNextSeason so signing
      // day and development can run against the just-finished season's data.
      s.phase = 'offseason';
      return summary;
    }
  };

  window.GameSeason = GameSeason;
})();
