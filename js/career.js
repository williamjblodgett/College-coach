/* GRIDIRON DYNASTY — career.js
 * window.GameCareer: contracts, coaching salary, and the end-of-season job
 * carousel. Your record + prestige + reputation seed offers from bigger
 * programs; take one and your reputation travels with you. Salary accrues to a
 * personal wallet (spent in the store, wave 8).
 */
(function () {
  'use strict';

  var E = window.GameEngine;
  var T = window.TeamData;

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  // Base annual salary ($M) by program prestige (1-10).
  function salaryFor(prestige, reputation) {
    var base = 0.25 + Math.pow(prestige, 1.55) * 0.11;   // ~0.4M (p1) .. ~9M (p10)
    var repBump = 1 + (reputation - 55) * 0.006;
    return Math.round(base * clamp(repBump, 0.7, 1.4) * 10) / 10;
  }

  var GameCareer = {
    salaryFor: salaryFor,

    // Set the contract for the current job.
    initContract: function (state) {
      var team = T.get(state.team.id) || { prestige: 5 };
      var sal = salaryFor(team.prestige, state.career.reputation);
      var years = 4 + Math.round((team.prestige) / 4); // 4-6
      state.contract = { salary: sal, years: years, yearsLeft: years, buyout: Math.round(sal * years * 0.5 * 10) / 10 };
      return state.contract;
    },

    // Pay one season of salary into the wallet; tick the contract down.
    payoutSalary: function (state) {
      var c = state.contract || {};
      state.career.wallet = Math.round((state.career.wallet + (c.salary || 0)) * 10) / 10;
      if (c.yearsLeft > 0) c.yearsLeft--;
      return c.salary || 0;
    },

    // Renew/extend the contract when staying put (bigger if you're winning).
    renew: function (state, lastWins) {
      var team = T.get(state.team.id) || { prestige: 5 };
      var c = state.contract;
      if (!c || c.yearsLeft > 0) return c;
      var bump = 1 + clamp((lastWins - 6) * 0.03 + (state.career.reputation - 55) * 0.004, -0.1, 0.5);
      var sal = Math.round(salaryFor(team.prestige, state.career.reputation) * bump * 10) / 10;
      var years = 4 + Math.round(team.prestige / 4);
      state.contract = { salary: Math.max(sal, c.salary), years: years, yearsLeft: years, buyout: Math.round(sal * years * 0.5 * 10) / 10 };
      return state.contract;
    },

    // Generate end-of-season job offers. Better programs come calling when you
    // overperform and your reputation is high; blue bloods rarely poach laterally.
    generateOffers: function (state, summary) {
      var cur = T.get(state.team.id) || { prestige: 5 };
      var rep = state.career.reputation;
      var wins = summary ? summary.wins : 6;
      var expected = clamp(Math.round(cur.prestige * 0.9 + 1), 3, 11);
      var over = wins - expected;
      var rng = E.makeRng((state.seed ^ (state.career.year * 0x1abcf) ^ Math.round(rep)) >>> 0);

      // Interest is a function of reputation + overperformance + titles.
      var interest = (rep - 50) * 0.9 + over * 6 + (summary && summary.wonConf ? 10 : 0) + (summary && summary.wonNatl ? 22 : 0);
      if (interest < 8) return [];

      // Prestige ceiling the market will consider you for.
      var ceil = clamp(cur.prestige + Math.round(interest / 14), cur.prestige, 10);
      var floor = Math.max(cur.prestige, cur.prestige >= 8 ? 8 : cur.prestige); // offers are upgrades (or lateral blue-blood)

      var pool = T.byDivision(cur.div || 'fbs').filter(function (t) {
        return t.id !== state.team.id && t.prestige >= floor && t.prestige <= ceil && t.prestige > cur.prestige - 1;
      });
      // Prefer bigger jobs; shuffle within.
      for (var i = pool.length - 1; i > 0; i--) { var j = Math.floor(rng() * (i + 1)); var tmp = pool[i]; pool[i] = pool[j]; pool[j] = tmp; }
      pool.sort(function (a, b) { return b.prestige - a.prestige; });

      var n = clamp(Math.round(interest / 22), 0, 4);
      var offers = pool.slice(0, n).map(function (t) {
        var years = 5 + Math.round(t.prestige / 5);
        var sal = salaryFor(t.prestige, rep);
        return {
          teamId: t.id, prestige: t.prestige, conf: t.conf,
          salary: sal, years: years, buyout: Math.round(sal * years * 0.5 * 10) / 10,
          pitch: GameCareer.pitch(t, cur)
        };
      });
      state.jobOffers = offers;
      return offers;
    },

    pitch: function (t, cur) {
      if (t.prestige >= 9) return 'A blue-blood job — a chance to chase national titles.';
      if (t.prestige - cur.prestige >= 3) return 'A major step up in resources and expectations.';
      if (t.prestige >= 7) return 'A prestige program ready to win now.';
      return 'A program on the rise looking for a leader.';
    },

    hasOffers: function (state) { return (state.jobOffers || []).length > 0; },

    // Stay at the current job: develop the roster + advance a year.
    stay: function (state, lastWins) {
      GameCareer.payoutSalary(state);
      GameCareer.renew(state, lastWins);
      state.jobOffers = [];
      if (window.GameProgram) window.GameProgram.startNextSeason(state);
      return state.season;
    },

    // Take a new job: reputation travels, everything else is fresh at the new
    // program. (changeJob advances the year and rebuilds the program.)
    acceptOffer: function (state, offer) {
      GameCareer.payoutSalary(state);
      var team = T.get(offer.teamId);
      state.jobOffers = [];
      E.changeJob(team);
      state.contract = { salary: offer.salary, years: offer.years, yearsLeft: offer.years, buyout: offer.buyout };
      return state;
    },

    ensureContract: function (state) {
      if (!state.contract || !state.contract.salary) GameCareer.initContract(state);
      return state;
    }
  };

  window.GameCareer = GameCareer;
})();
