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
  function divisionTier(div) { return { d3: 0, d2: 1, fcs: 2, fbs: 3 }[div || 'fbs']; }

  function fameLabel(fame) {
    if (fame >= 90) return 'Icon';
    if (fame >= 75) return 'National Star';
    if (fame >= 55) return 'Household Name';
    if (fame >= 35) return 'Rising Name';
    if (fame >= 15) return 'Regional Coach';
    return 'Unknown';
  }

  // ---- the store: a wide catalog you buy with accrued salary --------------
  // effect keys — ongoing: recruiting, development, jobInterest, walletInterest,
  //   heatMult, invMult; immediate (applied once at purchase): reputation,
  //   facilities, legacy, media.
  var STORE = [
    // Program investments (help the team win)
    { id: 'analytics', name: 'Recruiting Analytics Service', cat: 'Program', cost: 2.5, emoji: '📈', desc: 'A data team that finds and closes recruits.', effect: { recruiting: 5 } },
    { id: 'sportsci', name: 'Sports Science Lab', cat: 'Program', cost: 3.5, emoji: '🔬', desc: 'Cutting-edge player development and recovery.', effect: { development: 0.6 } },
    { id: 'charterjet', name: 'Charter Jet Program', cat: 'Program', cost: 4, emoji: '✈️', desc: 'Fly coast to coast on the recruiting trail.', effect: { recruiting: 4 } },
    { id: 'nutrition', name: 'Elite Nutrition Program', cat: 'Program', cost: 1.5, emoji: '🥗', desc: 'Fuel the roster for a long season.', effect: { development: 0.35 } },
    { id: 'indoorfac', name: 'Indoor Practice Facility', cat: 'Program', cost: 6, emoji: '🏟️', desc: 'Practice through any weather.', effect: { facilities: 12 }, once: true },
    { id: 'rechub', name: 'Recruiting War Room', cat: 'Program', cost: 3, emoji: '🗂️', desc: 'A dedicated space and staff for the class.', effect: { recruiting: 3, development: 0.15 } },

    // Personal team (protect + advance your career)
    { id: 'agent', name: 'Super-Agent', cat: 'Career', cost: 2.5, emoji: '🤝', desc: 'Draws bigger job offers your way.', effect: { jobInterest: 14 } },
    { id: 'prfirm', name: 'PR & Crisis Firm', cat: 'Career', cost: 3, emoji: '📰', desc: 'Manages your image — less heat from every misstep.', effect: { heatMult: 0.7 } },
    { id: 'fixer', name: 'Private Investigator', cat: 'Career', cost: 2, emoji: '🕵️', desc: 'Keeps problems quiet — lowers investigation risk.', effect: { invMult: 0.7 } },
    { id: 'advisor', name: 'Financial Advisor', cat: 'Career', cost: 1.5, emoji: '💹', desc: 'Grows your money — earn interest on your wallet.', effect: { walletInterest: 0.15 } },
    { id: 'mediatrainer', name: 'Media Trainer', cat: 'Career', cost: 1, emoji: '🎙️', desc: 'Polish at the podium (+media).', effect: { media: 6 }, once: true },
    { id: 'buyoutins', name: 'Buyout Insurance', cat: 'Career', cost: 2, emoji: '🛡️', desc: 'A softer landing if it all goes wrong (+AD goodwill).', effect: { reputation: 3 }, once: true },

    // Legacy + lifestyle (reputation, legacy points, and pure flex)
    { id: 'foundation', name: 'Charitable Foundation', cat: 'Legacy', cost: 3, emoji: '💗', desc: 'Give back to the community (+reputation, +legacy).', effect: { reputation: 6, legacy: 20 }, once: true },
    { id: 'hofcampaign', name: 'Hall-of-Fame Campaign', cat: 'Legacy', cost: 4, emoji: '🏅', desc: 'Burnish the legend (+legacy).', effect: { legacy: 30 }, once: true },
    { id: 'statue', name: 'Commission a Statue', cat: 'Legacy', cost: 8, emoji: '🗿', desc: 'Bronze, outside the stadium. Immortality (+big legacy).', effect: { legacy: 60, reputation: 4 }, once: true },
    { id: 'lakehouse', name: 'Lake House', cat: 'Lifestyle', cost: 2, emoji: '🏡', desc: 'Somewhere to recharge in the offseason.', effect: { legacy: 5 }, once: true },
    { id: 'luxurycar', name: 'Luxury Sports Car', cat: 'Lifestyle', cost: 0.4, emoji: '🏎️', desc: 'Arrive in style.', effect: {}, once: true },
    { id: 'yacht', name: 'Yacht', cat: 'Lifestyle', cost: 7, emoji: '🛥️', desc: 'The ultimate flex.', effect: { legacy: 8 }, once: true },
    { id: 'artcollection', name: 'Art Collection', cat: 'Lifestyle', cost: 2.5, emoji: '🖼️', desc: 'Taste, acquired.', effect: {}, once: true },
    { id: 'golfclub', name: 'Country Club Membership', cat: 'Lifestyle', cost: 0.6, emoji: '⛳', desc: 'Network on the back nine.', effect: { jobInterest: 3 }, once: true },
    { id: 'ranch', name: 'Sprawling Ranch', cat: 'Lifestyle', cost: 5, emoji: '🐎', desc: 'Wide-open space, all yours.', effect: { legacy: 10 }, once: true }
  ];
  var STORE_MAP = {};
  STORE.forEach(function (it) { STORE_MAP[it.id] = it; });

  // Base annual salary ($M) by program prestige (1-10).
  function salaryFor(prestige, reputation) {
    var base = 0.25 + Math.pow(prestige, 1.55) * 0.11;   // ~0.4M (p1) .. ~9M (p10)
    var repBump = 1 + (reputation - 55) * 0.006;
    return Math.round(base * clamp(repBump, 0.7, 1.4) * 10) / 10;
  }

  var GameCareer = {
    salaryFor: salaryFor,
    fameLabel: fameLabel,

    profileScore: function (state) {
      var c = state.career || {};
      var badge = window.GameStory ? window.GameStory.effects(state).profile : 0;
      var casePenalty = window.GameCases ? window.GameCases.profilePenalty(state) : 0;
      var ability = c.coachingAbility == null ? 50 : c.coachingAbility;
      var recognition = c.nameRecognition == null ? 25 : c.nameRecognition;
      var fame = c.fame == null ? 15 : c.fame;
      var reputation = c.reputation == null ? 50 : c.reputation;
      return Math.round(ability * 0.42 + recognition * 0.33 + fame * 0.15 + reputation * 0.10 + badge - casePenalty);
    },

    requiredProfile: function (prestige, div) {
      var adjustment = { d3: -22, d2: -14, fcs: -7, fbs: 0 }[div || 'fbs'] || 0;
      return Math.max(8, Math.round(12 + prestige * 7.2 + adjustment));
    },

    progressSeason: function (state, summary) {
      var c = state.career;
      var team = T.get(state.team.id) || { prestige: 5 };
      var wins = summary.wins || 0;
      var expected = clamp(Math.round(team.prestige * 0.9 + 1), 3, 11);
      var over = wins - expected;
      var xp = 180 + wins * 28 + Math.max(0, over) * 45 +
        (summary.wonConf ? 350 : 0) + (summary.madePlayoff ? 300 : 0) + (summary.wonNatl ? 900 : 0);
      if (window.GameDifficulty) xp = Math.round(xp * (window.GameDifficulty.get(state).progression || 1));
      c.coachXp = (c.coachXp || 0) + xp;
      var oldLevel = c.coachLevel || 1;
      c.coachLevel = clamp(1 + Math.floor(c.coachXp / 1000), 1, 20);
      var levels = c.coachLevel - oldLevel;
      c.coachingAbility = clamp((c.coachingAbility || 50) + Math.max(0, levels) + (over >= 4 ? 1 : 0), 20, 99);
      // Completing seasons and outperforming expectations builds durable
      // professional credibility even before a marquee title arrives.
      c.reputation = clamp((c.reputation == null ? 50 : c.reputation) + 2 + Math.max(0, over) + Math.max(0, levels) * 2, 0, 100);
      c.nameRecognition = clamp((c.nameRecognition || 10) + Math.max(-3, over) +
        (summary.wonConf ? 6 : 0) + (summary.madePlayoff ? 7 : 0) + (summary.wonNatl ? 12 : 0), 0, 100);
      c.fame = clamp((c.fame || 5) + Math.max(-2, Math.round(over / 2)) +
        (summary.wonConf ? 4 : 0) + (summary.madePlayoff ? 6 : 0) + (summary.wonNatl ? 15 : 0), 0, 100);
      summary.coachXp = xp;
      summary.coachLevel = c.coachLevel;
      summary.coachingAbility = c.coachingAbility;
      summary.nameRecognition = c.nameRecognition;
      summary.fame = c.fame;
      summary.fameLabel = fameLabel(c.fame);
      summary.reputation = c.reputation;
      return summary;
    },

    // Set the contract for the current job.
    initContract: function (state) {
      var team = T.get(state.team.id) || { prestige: 5 };
      var sal = salaryFor(team.prestige, state.career.reputation);
      if (state.career.role && state.career.role !== 'headCoach') sal = Math.max(0.15, Math.round(sal * 0.28 * 10) / 10);
      var years = 4 + Math.round((team.prestige) / 4); // 4-6
      state.contract = { salary: sal, years: years, yearsLeft: years, buyout: Math.round(sal * years * 0.5 * 10) / 10 };
      return state.contract;
    },

    // Pay one season of salary into the wallet; tick the contract down.
    payoutSalary: function (state) {
      var c = state.contract || {};
      var interest = GameCareer.storeEffects(state).walletInterest; // financial advisor
      var pay = (c.salary || 0) * (1 + interest);
      state.career.wallet = Math.round((state.career.wallet + pay) * 10) / 10;
      if (c.yearsLeft > 0) c.yearsLeft--;
      return pay;
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
      var profile = GameCareer.profileScore(state);
      var wins = summary ? summary.wins : 6;
      var expected = clamp(Math.round(cur.prestige * 0.9 + 1), 3, 11);
      var over = wins - expected;
      var rng = E.makeRng((state.seed ^ (state.career.year * 0x1abcf) ^ Math.round(rep)) >>> 0);

      // Interest is a function of reputation + overperformance + titles (a
      // super-agent / networking raise your market profile).
      var interest = (rep - 50) * 0.45 + (profile - 35) * 0.75 + over * 6 + (summary && summary.wonConf ? 10 : 0) + (summary && summary.wonNatl ? 22 : 0)
        + GameCareer.storeEffects(state).jobInterest;
      if (interest < 8) return [];

      // Prestige ceiling the market will consider you for.
      var ceil = clamp(cur.prestige + Math.round(interest / 14), cur.prestige, 10);
      var floor = Math.max(cur.prestige, cur.prestige >= 8 ? 8 : cur.prestige); // offers are upgrades (or lateral blue-blood)

      var curDiv = cur.div || 'fbs', curTier = divisionTier(curDiv);
      var pool = T.all().filter(function (t) {
        var tier = divisionTier(t.div), nextDivision = tier === curTier + 1;
        var sameDivision = tier === curTier && t.prestige >= floor && t.prestige <= ceil && t.prestige > cur.prestige - 1;
        var required = GameCareer.requiredProfile(t.prestige, t.div);
        return t.id !== state.team.id && (sameDivision || nextDivision) && profile >= required;
      });
      // Prefer bigger jobs; shuffle within.
      for (var i = pool.length - 1; i > 0; i--) { var j = Math.floor(rng() * (i + 1)); var tmp = pool[i]; pool[i] = pool[j]; pool[j] = tmp; }
      pool.sort(function (a, b) { return divisionTier(b.div) - divisionTier(a.div) || b.prestige - a.prestige; });

      var n = clamp(Math.round(interest / 22), 0, 4);
      var offers = pool.slice(0, n).map(function (t) {
        var years = 5 + Math.round(t.prestige / 5);
        var sal = salaryFor(t.prestige, rep);
        return {
          teamId: t.id, prestige: t.prestige, conf: t.conf,
          role: 'headCoach',
          requiredProfile: GameCareer.requiredProfile(t.prestige, t.div), profileScore: profile,
          salary: sal, years: years, buyout: Math.round(sal * years * 0.5 * 10) / 10,
          pitch: GameCareer.pitch(t, cur)
        };
      });
      state.jobOffers = offers;
      return offers;
    },

    pitch: function (t, cur) {
      if (divisionTier(t.div) > divisionTier(cur.div)) return 'A promotion to ' + String(t.div).toUpperCase() + ' football and a larger stage.';
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
      state.career.role = offer.role || 'headCoach';
      state.contract = { salary: offer.salary, years: offer.years, yearsLeft: offer.years, buyout: offer.buyout };
      return state;
    },

    ensureContract: function (state) {
      if (!state.contract || !state.contract.salary) GameCareer.initContract(state);
      return state;
    },

    // ---- store --------------------------------------------------------------
    STORE: STORE, STORE_MAP: STORE_MAP,
    owns: function (state, id) { return (state.career.purchases || []).indexOf(id) >= 0; },

    buy: function (state, id) {
      var it = STORE_MAP[id];
      if (!it) return { ok: false };
      if (it.once && GameCareer.owns(state, id)) return { ok: false, reason: 'owned' };
      if ((state.career.wallet || 0) < it.cost) return { ok: false, reason: 'funds' };
      state.career.wallet = Math.round((state.career.wallet - it.cost) * 10) / 10;
      state.career.spent = Math.round(((state.career.spent || 0) + it.cost) * 10) / 10;
      (state.career.purchases = state.career.purchases || []).push(id);
      // Immediate (one-time) effects.
      var e = it.effect || {};
      if (e.reputation) state.career.reputation = clamp(state.career.reputation + e.reputation, 0, 100);
      if (e.legacy) state.career.legacyPoints = (state.career.legacyPoints || 0) + e.legacy;
      if (e.facilities && state.program) state.program.facilitiesLevel = clamp(state.program.facilitiesLevel + e.facilities, 0, 100);
      if (e.media && state.coach && state.coach.ratings) state.coach.ratings.media = clamp(state.coach.ratings.media + e.media, 0, 100);
      return { ok: true, item: it };
    },

    // Ongoing effects summed from owned items.
    storeEffects: function (state) {
      var acc = { recruiting: 0, development: 0, jobInterest: 0, walletInterest: 0, heatMult: 1, invMult: 1 };
      (state.career.purchases || []).forEach(function (id) {
        var it = STORE_MAP[id]; if (!it) return;
        var e = it.effect || {};
        if (e.recruiting) acc.recruiting += e.recruiting;
        if (e.development) acc.development += e.development;
        if (e.jobInterest) acc.jobInterest += e.jobInterest;
        if (e.walletInterest) acc.walletInterest += e.walletInterest;
        if (e.heatMult) acc.heatMult *= e.heatMult;
        if (e.invMult) acc.invMult *= e.invMult;
      });
      return acc;
    }
  };

  window.GameCareer = GameCareer;
})();
