/* GRIDIRON DYNASTY 2.0 - player statistics, fatigue, injuries, morale, awards, and records. */
(function () {
  'use strict';
  var E = window.GameEngine;
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function blankStats() { return { games: 0, snaps: 0, passAtt: 0, passComp: 0, passYds: 0, passTd: 0, interceptions: 0, carries: 0, rushYds: 0, rushTd: 0, receptions: 0, recYds: 0, recTd: 0, tackles: 0, sacks: 0, defInt: 0, points: 0 }; }
  function add(target, values) { Object.keys(values).forEach(function (key) { target[key] = (target[key] || 0) + (values[key] || 0); }); }
  function top(roster, pos, n) { return roster.filter(function (p) { return p.pos === pos && !(p.injury && p.injury.weeks > 0); }).sort(function (a, b) { return b.ovr - a.ovr; }).slice(0, n); }
  function allocate(total, players, weight) {
    var left = total, out = [];
    players.forEach(function (p, i) {
      var val = i === players.length - 1 ? left : Math.round(total * weight[i]); left -= val; out.push([p, Math.max(0, val)]);
    }); return out;
  }
  function ensurePlayer(p, rng) {
    p.durability = p.durability == null ? 55 + Math.floor(rng() * 36) : p.durability;
    p.fatigue = p.fatigue == null ? 0 : p.fatigue;
    p.morale = p.morale == null ? 65 + Math.floor(rng() * 21) : p.morale;
    p.personality = p.personality || ['steady', 'competitive', 'leader', 'volatile', 'team-first'][Math.floor(rng() * 5)];
    p.injuries = p.injuries || [];
    p.stats = p.stats || { career: blankStats(), seasons: {} };
    p.stats.career = p.stats.career || blankStats(); p.stats.seasons = p.stats.seasons || {};
    return p;
  }
  function seasonStats(p, year) { var key = String(year); return p.stats.seasons[key] || (p.stats.seasons[key] = blankStats()); }
  function credit(p, year, values) { add(seasonStats(p, year), values); add(p.stats.career, values); }

  var Football = {
    blankStats: blankStats,
    ensureRoster: function (state) {
      var rng = E.stream('player-traits', state.career.year, state);
      (state.roster || []).forEach(function (p) { ensurePlayer(p, rng); }); return state.roster;
    },
    onSeasonStart: function (state) {
      Football.ensureRoster(state);
      (state.roster || []).forEach(function (p) { p.fatigue = clamp(Math.round((p.fatigue || 0) * 0.25), 0, 100); seasonStats(p, state.career.year); });
      state.season.playerAwards = []; state.season.injuryLog = [];
    },
    available: function (p) { return !(p.injury && p.injury.weeks > 0); },
    effectiveOvr: function (p) {
      if (!Football.available(p)) return 0;
      return clamp(Math.round(p.ovr - (p.fatigue || 0) * 0.08 + ((p.morale || 70) - 70) * 0.04), 30, 99);
    },
    recordGame: function (state, game, totals) {
      if (!game) return null;
      Football.ensureRoster(state);
      var year = state.career.year, week = state.season.week;
      var rng = E.stream('player-game', year + ':' + week + ':' + game.home + ':' + game.away, state);
      var myHome = game.home === state.team.id;
      var myScore = myHome ? game.homeScore : game.awayScore;
      var oppScore = myHome ? game.awayScore : game.homeScore;
      totals = totals || {};
      var plays = totals.plays || 58 + Math.floor(rng() * 18);
      var passYds = totals.pass != null ? totals.pass : Math.max(80, Math.round(135 + myScore * 4.2 + (rng() - .5) * 100));
      var rushYds = totals.rush != null ? totals.rush : Math.max(35, Math.round(70 + myScore * 2.8 + (rng() - .5) * 70));
      var qbs = top(state.roster, 'QB', 1), rbs = top(state.roster, 'RB', 2), wrs = top(state.roster, 'WR', 4), defs = state.roster.filter(function (p) { return p.group === 'DEF' && Football.available(p); }).sort(function (a,b) { return b.ovr-a.ovr; }).slice(0, 11);
      var passTd = Math.min(6, Math.floor(myScore / 10)), rushTd = Math.max(0, Math.floor(myScore / 7) - passTd);
      if (qbs[0]) credit(qbs[0], year, { games: 1, snaps: Math.round(plays * .92), passAtt: Math.round(passYds / 7.1), passComp: Math.round(passYds / 10.8), passYds: passYds, passTd: passTd, interceptions: totals.to ? Math.min(2, totals.to) : (rng() < .25 ? 1 : 0), carries: 3, rushYds: Math.round((rng() - .3) * 25) });
      allocate(rushYds, rbs, [.67, .33]).forEach(function (x, i) { credit(x[0], year, { games: 1, snaps: Math.round(plays * (i ? .28 : .58)), carries: Math.round(x[1] / 5.1), rushYds: x[1], rushTd: i ? 0 : rushTd }); });
      allocate(passYds, wrs, [.34, .27, .22, .17]).forEach(function (x, i) { credit(x[0], year, { games: 1, snaps: Math.round(plays * (.75 - i * .09)), receptions: Math.round(x[1] / 13), recYds: x[1], recTd: i < passTd ? 1 : 0 }); });
      defs.forEach(function (p, i) { credit(p, year, { games: 1, snaps: Math.round(plays * .72), tackles: Math.max(1, Math.round((plays / 11) + (rng() - .5) * 5)), sacks: (p.pos === 'DL' || p.pos === 'LB') && rng() < .18 ? 1 : 0, defInt: (p.pos === 'CB' || p.pos === 'S') && rng() < .10 ? 1 : 0 }); });
      var starters = state.roster.filter(function (p) { return p.starter && Football.available(p); });
      starters.forEach(function (p) { p.fatigue = clamp((p.fatigue || 0) + 7 + Math.floor(rng() * 8), 0, 100); p.morale = clamp((p.morale || 70) + (myScore > oppScore ? 2 : -3), 0, 100); });
      var cfg = window.GameDifficulty ? window.GameDifficulty.get(state) : { injuries: 1 };
      var candidates = starters.filter(function (p) { return rng() < (0.008 + (100 - p.durability) * .00022 + p.fatigue * .00012) * (cfg.injuries || 1); });
      if (candidates.length) {
        var hurt = candidates[0], roll = rng(), weeks = roll < .65 ? 1 : (roll < .9 ? 3 : 6), labels = weeks === 1 ? ['ankle sprain','shoulder bruise','hamstring tightness'] : weeks <= 3 ? ['high ankle sprain','concussion','knee sprain'] : ['fractured collarbone','torn ligament','broken foot'];
        hurt.injury = { name: labels[Math.floor(rng() * labels.length)], weeks: weeks, originalWeeks: weeks, year: year, week: week };
        hurt.injuries.push(hurt.injury); state.season.injuryLog.push({ playerId: hurt.id, name: hurt.name, injury: hurt.injury.name, weeks: weeks, week: week });
      }
      var box = { teamId: state.team.id, score: myScore, opponentScore: oppScore, plays: plays, passYds: passYds, rushYds: rushYds, totalYds: passYds + rushYds, turnovers: totals.to || 0, week: week };
      game.boxScore = game.boxScore || {}; game.boxScore[state.team.id] = box;
      return box;
    },
    advanceWeek: function (state) {
      Football.ensureRoster(state);
      (state.roster || []).forEach(function (p) {
        p.fatigue = clamp((p.fatigue || 0) - (p.starter ? 4 : 8), 0, 100);
        if (p.injury && p.injury.weeks > 0) { p.injury.weeks--; if (p.injury.weeks <= 0) { p.injury.recovered = true; p.injury = null; } }
      });
    },
    seasonAwards: function (state) {
      Football.ensureRoster(state); var year = state.career.year, awards = [];
      function best(pos, score, award) { var pool = state.roster.filter(function (p) { return pos.indexOf(p.pos) >= 0; }); pool.sort(function (a,b) { return score(seasonStats(b,year)) - score(seasonStats(a,year)); }); if (pool[0] && score(seasonStats(pool[0],year)) > 0) { var item = { id: award.toLowerCase().replace(/[^a-z]+/g,'-'), name: award, playerId: pool[0].id, player: pool[0].name, year: year }; awards.push(item); pool[0].awards = pool[0].awards || []; pool[0].awards.push(item); } }
      best(['QB'], function (s) { return s.passYds + s.passTd * 45 - s.interceptions * 30; }, 'Team Offensive MVP');
      best(['RB','WR','TE'], function (s) { return s.rushYds + s.recYds + (s.rushTd+s.recTd)*40; }, 'Breakout Playmaker');
      best(['DL','LB','CB','S'], function (s) { return s.tackles * 2 + s.sacks * 18 + s.defInt * 24; }, 'Team Defensive MVP');
      state.season.playerAwards = awards;
      var records = state.world.records || (state.world.records = {});
      state.roster.forEach(function (p) { var s = seasonStats(p, year); ['passYds','rushYds','recYds','passTd','sacks','defInt'].forEach(function (key) { if (!records[key] || s[key] > records[key].value) records[key] = { value: s[key], player: p.name, teamId: state.team.id, year: year }; }); });
      return awards;
    },
    draftDecisions: function (state) {
      var rng = E.stream('draft', state.career.year, state), out = [];
      state.roster.forEach(function (p) { if ((p.year === 'JR' || p.year === 'SR') && p.ovr >= 82) { var declare = p.year === 'SR' || rng() < clamp((p.ovr - 80) * .055 + (p.fame || 0) * .002, .05, .9); if (declare) { p.leaving = true; p.drafted = p.ovr >= 90 ? 'Day 1' : p.ovr >= 85 ? 'Day 2' : 'Day 3'; out.push({ id:p.id,name:p.name,pos:p.pos,ovr:p.ovr,projection:p.drafted }); } } });
      state.program.draftClass = out; return out;
    }
  };
  window.GameFootball = Football;
  if (window.GameRegistry) window.GameRegistry.register('system', 'football', Football);
})();
