/* GRIDIRON DYNASTY — staff.js
 * window.GameStaff: the coaching cabinet — coordinators + position coaches whose
 * ratings drive offense/defense/special teams, recruiting, and development.
 * Each hire has a loyalty stat that feeds staff cohesion and (wave 6) leak risk.
 * Operates on window.GameEngine.state (state.staff, state.staffMarket).
 */
(function () {
  'use strict';

  var E = window.GameEngine;
  var T = window.TeamData;
  var N = window.NameData;

  // The cabinet. `aff` is a short description of what the role influences.
  var ROLES = [
    { id: 'OC', label: 'Offensive Coordinator', aff: 'Offense & scoring', primary: 'off' },
    { id: 'DC', label: 'Defensive Coordinator', aff: 'Defense', primary: 'def' },
    { id: 'ST', label: 'Special Teams Coord.', aff: 'Kicking, returns, onside', primary: 'special' },
    { id: 'QB', label: 'Quarterbacks Coach', aff: 'Passing & QB development', primary: 'off' },
    { id: 'OL', label: 'Offensive Line Coach', aff: 'Run game & protection', primary: 'off' },
    { id: 'DL', label: 'Defensive Line Coach', aff: 'Pass rush & run defense', primary: 'def' },
    { id: 'DB', label: 'Defensive Backs Coach', aff: 'Pass defense', primary: 'def' },
    { id: 'SC', label: 'Strength & Conditioning', aff: 'Player development', primary: 'dev' },
    { id: 'REC', label: 'Recruiting Coordinator', aff: 'Recruiting', primary: 'rec' }
  ];
  var ROLE_MAP = {};
  ROLES.forEach(function (r) { ROLE_MAP[r.id] = r; });

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  var _uid = 0;
  function uid() { return 's_' + Date.now().toString(36) + '_' + (_uid++); }

  function gauss(rng, m, sd) {
    var u = 1 - rng(), v = 1 - rng();
    return m + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  function makeMember(rng, roleId, prestige, bias) {
    bias = bias || 0;
    var overall = clamp(Math.round(gauss(rng, 50 + prestige * 3.4 + bias, 9)), 38, 96);
    // Recruiting/development skills correlate loosely with overall.
    var recruiting = clamp(Math.round(overall + gauss(rng, 0, 12)), 30, 99);
    var development = clamp(Math.round(overall + gauss(rng, 0, 12)), 30, 99);
    var loyalty = clamp(Math.round(gauss(rng, 72, 12)), 35, 99);
    var ambition = clamp(Math.round(gauss(rng, 60, 16)), 20, 99);
    var salary = clamp(Math.round((overall - 45) * 0.7 + (roleId === 'OC' || roleId === 'DC' ? 4 : 0)), 2, 34);
    return {
      id: uid(), name: N.make(rng), role: roleId,
      overall: overall, recruiting: recruiting, development: development,
      loyalty: loyalty, ambition: ambition, salary: salary
    };
  }

  var GameStaff = {
    ROLES: ROLES, ROLE_MAP: ROLE_MAP,

    // Initial cabinet + hiring market at career start.
    initStaff: function (state) {
      var team = T.get(state.team.id) || { prestige: 5 };
      var rng = E.makeRng(((state.seed || 1) ^ 0x7f4a7c15) >>> 0);
      var staff = {};
      ROLES.forEach(function (r) { staff[r.id] = makeMember(rng, r.id, team.prestige, 0); });
      state.staff = staff;
      state.program.staffBudget = Math.round(16 + team.prestige * 3.2);
      state.staffMarket = GameStaff.generateMarket(rng, team.prestige, 12);
      return state;
    },

    generateMarket: function (rng, prestige, size) {
      size = size || 12;
      var out = [];
      for (var i = 0; i < size; i++) {
        var role = ROLES[Math.floor(rng() * ROLES.length)].id;
        // Market spread: some clearly better than a mid staff, some worse.
        var bias = Math.round(gauss(rng, 2, 8));
        out.push(makeMember(rng, role, prestige, bias));
      }
      out.sort(function (a, b) { return b.overall - a.overall; });
      return out;
    },

    candidatesForRole: function (state, roleId) {
      return (state.staffMarket || []).filter(function (c) { return c.role === roleId; });
    },

    // Hire a market candidate into their role (replacing the incumbent). Costs
    // the candidate's salary from the staff budget.
    hire: function (state, candidateId) {
      var idx = (state.staffMarket || []).map(function (c) { return c.id; }).indexOf(candidateId);
      if (idx < 0) return { ok: false };
      var c = state.staffMarket[idx];
      if (state.program.staffBudget < c.salary) return { ok: false, reason: 'funds' };
      state.program.staffBudget -= c.salary;
      state.staff[c.role] = c;
      state.staffMarket.splice(idx, 1);
      return { ok: true, hired: c };
    },

    // ---- effects ----------------------------------------------------------
    ov: function (state, roleId) { return state.staff && state.staff[roleId] ? state.staff[roleId].overall : 52; },

    members: function (state) {
      var s = state.staff || {}, out = [];
      ROLES.forEach(function (r) { if (s[r.id]) out.push(s[r.id]); });
      return out;
    },

    avg: function (state, key) {
      var m = GameStaff.members(state);
      if (!m.length) return 55;
      return m.reduce(function (s, x) { return s + (x[key] || 0); }, 0) / m.length;
    },

    // Aggregate staff effects applied across the game. Modest by design so the
    // roster still dominates, but a great staff is worth several rating points.
    effects: function (state) {
      var ov = function (r) { return GameStaff.ov(state, r); };
      var off = (ov('OC') - 58) * 0.32 + (ov('QB') - 58) * 0.10 + (ov('OL') - 58) * 0.10;
      var def = (ov('DC') - 58) * 0.32 + (ov('DL') - 58) * 0.10 + (ov('DB') - 58) * 0.10;
      var special = ov('ST');
      var recruiting = (ov('REC') - 58) * 0.22 + (GameStaff.avg(state, 'recruiting') - 55) * 0.14;
      var development = (ov('SC') - 58) * 0.045 + (GameStaff.avg(state, 'development') - 55) * 0.03;
      var loyalty = GameStaff.avg(state, 'loyalty');
      return {
        off: off, def: def, special: special,
        recruiting: recruiting, development: development,
        loyalty: Math.round(loyalty), cohesion: Math.round(clamp(loyalty, 0, 100))
      };
    },

    // ---- offseason: loyalty drift + poaching + market refresh -------------
    offseasonUpdate: function (state, wins) {
      var team = T.get(state.team.id) || { prestige: 5 };
      var rng = E.makeRng((state.seed ^ (state.career.year * 0x2545f491)) >>> 0);
      var poached = [];
      ROLES.forEach(function (r) {
        var m = state.staff[r.id];
        if (!m) return;
        // Loyalty drifts up with winning, down with losing.
        m.loyalty = clamp(Math.round(m.loyalty + (wins - 6) * 1.4 + gauss(rng, 0, 4)), 20, 99);
        // Ambitious, talented assistants on a low-loyalty staff get poached for
        // promotions elsewhere.
        var leaveP = (m.overall / 100) * (m.ambition / 100) * (1 - m.loyalty / 100) * 0.9;
        if (m.overall >= 78 && rng() < leaveP) {
          var treePool=T.all().filter(function(x){return (x.prestige||5)<=Math.min(9,team.prestige+1)&&x.id!==state.team.id;}),landing=treePool[Math.floor(rng()*treePool.length)]||team;
          var branch={name:m.name,role:r.id,overall:m.overall,year:state.career.year,teamId:landing.id,wins:0,titles:0};
          poached.push(branch);state.career.coachingTree=state.career.coachingTree||[];state.career.coachingTree.push(branch);
          state.staff[r.id] = makeMember(rng, r.id, Math.max(2, team.prestige - 2), -6); // interim hire
        }
      });
      state.program.staffBudget += Math.round(12 + team.prestige * 2.6 + Math.max(0, wins - 6) * 1.5);
      state.staffMarket = GameStaff.generateMarket(rng, team.prestige, 12);
      state.program.staffPoached = poached;
      return { poached: poached, budget: state.program.staffBudget };
    },

    ensureStaff: function (state) {
      if (!state.staff || !Object.keys(state.staff).length) GameStaff.initStaff(state);
      else if (!state.staffMarket || !state.staffMarket.length) {
        var team = T.get(state.team.id) || { prestige: 5 };
        var rng = E.makeRng(((state.seed || 1) ^ 0x11a3) >>> 0);
        state.staffMarket = GameStaff.generateMarket(rng, team.prestige, 12);
      }
      return state;
    }
  };

  window.GameStaff = GameStaff;
})();
