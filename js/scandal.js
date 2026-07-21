/* GRIDIRON DYNASTY — scandal.js
 * window.GameScandal: a risk-vs-reward compliance/scandal system. Temptations
 * offer short-term gains at the cost of "heat" (scrutiny); heat plus low staff
 * cohesion can trigger an end-of-season investigation with NCAA sanctions
 * (probation, scholarship losses, bowl bans, show-cause) and, with a shaky AD,
 * getting fired.
 *
 * Tone contract: every liability is presented as a labeled allegation/decision
 * with consequences to manage, involving adults, with NO explicit content. It
 * reads as a strategy risk mechanic, not titillation.
 */
(function () {
  'use strict';

  var E = window.GameEngine;

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  // How often temptations appear — a player setting.
  var INTENSITY = {
    off: { mult: 0, cap: 0, label: 'Off' },
    light: { mult: 0.5, cap: 2, label: 'Light' },
    realistic: { mult: 1, cap: 3, label: 'Realistic' },
    chaotic: { mult: 1.8, cap: 6, label: 'Chaotic' }
  };

  // ---- temptation catalog ---------------------------------------------------
  // Each event: id, category, once (career-once), cond(state)->bool, title,
  // blurb, options[{ id, label, desc, risky, fx }]. fx is a declarative effect
  // object applied by applyEffects().
  var EVENTS = [
    {
      id: 'recruit_bagman', category: 'Recruiting', weight: 3,
      title: 'A Booster’s “Help”',
      blurb: 'A prominent booster hints he can quietly “take care of” a blue-chip recruit who’s leaning elsewhere.',
      options: [
        { id: 'decline', label: 'Keep it clean', desc: 'Recruit him by the rules.', fx: {} },
        { id: 'take', label: 'Look the other way', desc: 'A commitment firms up — but it’s a clear recruiting violation.', risky: true, fx: { recruitPoints: 20, heat: 15, tag: 'recruiting violation' } }
      ]
    },
    {
      id: 'booster_envelope', category: 'Boosters', weight: 3,
      title: 'Off-the-Books Money',
      blurb: 'A booster collective offers cash outside the NIL rules to “sweeten the pot” for the program.',
      options: [
        { id: 'refuse', label: 'Refuse the money', desc: 'Stay within the guardrails.', fx: {} },
        { id: 'take', label: 'Take the envelope', desc: 'More resources now, at the risk of an improper-benefits case.', risky: true, fx: { nil: 8, recruitPoints: 10, heat: 17, tag: 'improper benefits' } }
      ]
    },
    {
      id: 'academic', category: 'Academics', weight: 2,
      title: 'An Eligibility Problem',
      blurb: 'A key starter is failing a course and could be ruled academically ineligible for the stretch run.',
      options: [
        { id: 'rules', label: 'Follow the rules', desc: 'He sits until he’s eligible. The AD notices your integrity.', fx: { adTrust: 4 } },
        { id: 'fraud', label: 'Arrange “tutoring”', desc: 'He stays on the field — academic fraud if it ever surfaces.', risky: true, fx: { heat: 19, tag: 'academic fraud' } }
      ]
    },
    {
      id: 'dui', category: 'Player Conduct', weight: 2,
      title: 'A Weekend Arrest',
      blurb: 'A star player is arrested for DUI. It hasn’t hit the media yet. How you handle it sets a tone.',
      options: [
        { id: 'suspend', label: 'Suspend him', desc: 'You lose him for a game but send a clear message.', fx: { adTrust: 5, reputation: 2 } },
        { id: 'bury', label: 'Bury it', desc: 'Keep him available and hope it stays quiet — a personal-conduct liability.', risky: true, fx: { heat: 15, adTrust: -3, tag: 'conduct cover-up' } }
      ]
    },
    {
      id: 'staff_leak', category: 'Staff', weight: 2,
      cond: function (state) { return window.GameStaff && window.GameStaff.effects(state).cohesion < 60; },
      title: 'A Disgruntled Assistant',
      blurb: 'Staff cohesion is low, and a disgruntled assistant is shopping unflattering stories about the program.',
      options: [
        { id: 'address', label: 'Address it directly', desc: 'Smooth things over and tighten the ship.', fx: { heat: 4 } },
        { id: 'ignore', label: 'Ignore it', desc: 'Do nothing and hope it blows over — leaks may follow.', risky: true, fx: { heat: 16, tag: 'internal leak' } }
      ]
    },
    {
      id: 'personal_conduct_student', category: 'Personal Conduct', weight: 1, once: true, rare: true,
      cond: function (state) { return state.career.seasonsCoached >= 1; },
      title: 'A Personal-Conduct Allegation',
      blurb: 'An allegation surfaces of an inappropriate relationship between you and an adult student. Whatever the facts, it is a serious personal-conduct liability that can end a career. How you respond now shapes the fallout.',
      options: [
        { id: 'cooperate', label: 'Self-report & cooperate', desc: 'Take a reputation and trust hit now; a review is likely, but full cooperation limits the damage.', fx: { reputation: -10, adTrust: -8, heat: 8, tag: 'personal-conduct review', capSeverity: true } },
        { id: 'deny', label: 'Deny and contain it', desc: 'No immediate cost — but if it comes out, the consequences are severe.', risky: true, fx: { heat: 34, tag: 'personal-conduct allegation', severe: true } },
        { id: 'resign', label: 'Step down quietly', desc: 'Resign the position on your own terms rather than fight it.', fx: { resign: true, tag: 'resignation' } }
      ]
    },
    {
      id: 'car_gift', category: 'Boosters', weight: 2,
      title: 'Keys to a New Car',
      blurb: 'A booster wants to hand a wavering recruit the keys to a new truck to close the deal.',
      options: [
        { id: 'decline', label: 'Not a chance', desc: 'Keep the program clean.', fx: {} },
        { id: 'take', label: 'Let it happen', desc: 'The recruit commits — a textbook improper-benefits violation.', risky: true, fx: { recruitPoints: 16, heat: 16, tag: 'improper benefits' } }
      ]
    },
    {
      id: 'tampering', category: 'Transfer Portal', weight: 2,
      title: 'Tampering in the Portal',
      blurb: 'A rival’s star is unhappy. Your staff could quietly reach out before he’s officially in the portal.',
      options: [
        { id: 'wait', label: 'Wait for the portal', desc: 'Do it by the book.', fx: {} },
        { id: 'tamper', label: 'Make the call', desc: 'Get a head start — tampering if anyone talks.', risky: true, fx: { recruitPoints: 12, heat: 14, tag: 'tampering' } }
      ]
    },
    {
      id: 'practice_hours', category: 'NCAA Rules', weight: 2,
      title: 'Extra Practice Hours',
      blurb: 'You could squeeze in “voluntary” workouts well past the weekly practice-time limit.',
      options: [
        { id: 'rules', label: 'Respect the limit', desc: 'Rest matters too.', fx: { adTrust: 2 } },
        { id: 'exceed', label: 'Push past the cap', desc: 'A sharper team now — a countable-hours violation if logged.', risky: true, fx: { heat: 12, tag: 'practice-hours violation' } }
      ]
    },
    {
      id: 'gambling', category: 'Staff', weight: 1,
      title: 'A Betting Problem',
      blurb: 'Word reaches you that an assistant has been betting on games. Sports-wagering rules are strict.',
      options: [
        { id: 'report', label: 'Report it', desc: 'Handle it the right way, whatever the cost.', fx: { adTrust: 4 } },
        { id: 'hide', label: 'Keep it in-house', desc: 'Quietly move on and hope nobody asks.', risky: true, fx: { heat: 18, tag: 'sports-wagering' } }
      ]
    },
    {
      id: 'grade_grease', category: 'Academics', weight: 1,
      title: 'A Friendly Professor',
      blurb: 'A booster professor offers to “take care of” grades for a couple of borderline players.',
      options: [
        { id: 'no', label: 'Decline', desc: 'They earn it or they sit.', fx: {} },
        { id: 'yes', label: 'Take the favor', desc: 'They stay eligible — academic fraud if it surfaces.', risky: true, fx: { heat: 20, tag: 'academic fraud' } }
      ]
    },
    // Positive integrity events — reward clean, well-run programs.
    {
      id: 'compliance_award', category: 'Compliance', weight: 2, positive: true,
      cond: function (state) { return state.integrity.heat < 25 && (!window.GameStaff || window.GameStaff.effects(state).cohesion >= 65); },
      title: 'A Clean-Program Commendation',
      blurb: 'Your compliance office is recognized for running a tight, rules-abiding program. The AD takes note.',
      options: [
        { id: 'ok', label: 'Accept the recognition', desc: 'Trust and goodwill, earned honestly.', fx: { adTrust: 6, heat: -6, reputation: 2, tag: 'clean program' } }
      ]
    },
    {
      id: 'community', category: 'Community', weight: 2, positive: true,
      title: 'A Community Initiative',
      blurb: 'Your players want to lead a local outreach program. It’s good for them — and for your image.',
      options: [
        { id: 'ok', label: 'Champion it', desc: 'Give back and build goodwill.', fx: { reputation: 3, adTrust: 3, tag: 'community outreach' } }
      ]
    }
  ];
  var EVENT_MAP = {};
  EVENTS.forEach(function (e) { EVENT_MAP[e.id] = e; });

  var GameScandal = {
    EVENTS: EVENTS,

    // Qualitative scrutiny band (we surface a band, not the raw number).
    scrutinyBand: function (state) {
      var h = state.integrity.heat;
      if (h < 20) return { label: 'Clean', cls: 'good' };
      if (h < 45) return { label: 'Elevated', cls: 'ok' };
      if (h < 70) return { label: 'High', cls: 'warn' };
      return { label: 'Under the Microscope', cls: 'bad' };
    },

    hasActiveSanctions: function (state) {
      var i = state.integrity;
      return i.probation > 0 || i.bowlBanUntil >= state.career.year || i.scholarshipPenalty > 0 || i.showCause;
    },

    // Is the player's team barred from the postseason this year?
    postseasonBanned: function (state) {
      return state.integrity.bowlBanUntil >= state.career.year;
    },

    recruitingPenaltyFactor: function (state) {
      return state.integrity.scholarshipPenalty > 0 ? 0.7 : 1;
    },

    // ---- temptation flow ----------------------------------------------------
    // Called on each week advance: occasionally surface a temptation.
    INTENSITY: INTENSITY,

    maybeTrigger: function (state) {
      var i = state.integrity;
      if (i.pendingEvent || i.fired) return null;
      var intensity = (state.settings && state.settings.scandalIntensity) || 'realistic';
      var cfg = INTENSITY[intensity] || INTENSITY.realistic;
      if (cfg.mult <= 0) return null;                 // scandals off
      if (i.eventsThisSeason >= cfg.cap) return null;
      var rng = E.makeRng((state.season.seed ^ (state.season.week * 0x51ed270b) ^ 0x9e37) >>> 0);
      // ~16% per week, a touch higher when heat is already up (rivals dig),
      // scaled by the chosen intensity.
      var chance = (0.14 + (i.heat > 40 ? 0.05 : 0)) * cfg.mult;
      if (rng() > chance) return null;
      var pool = EVENTS.filter(function (e) {
        if (e.once && i.seenEvents.indexOf(e.id) >= 0) return false;
        if (e.rare && rng() > 0.28) return false;        // gate the rare one hard
        if (e.cond && !e.cond(state)) return false;
        return true;
      });
      if (!pool.length) return null;
      var total = pool.reduce(function (s, e) { return s + (e.weight || 1); }, 0);
      var r = rng() * total, chosen = pool[pool.length - 1];
      for (var k = 0; k < pool.length; k++) { r -= (pool[k].weight || 1); if (r <= 0) { chosen = pool[k]; break; } }
      i.pendingEvent = { id: chosen.id };
      return chosen;
    },

    pendingEvent: function (state) {
      var p = state.integrity.pendingEvent;
      return p ? EVENT_MAP[p.id] : null;
    },

    // Resolve the current temptation with the player's chosen option.
    resolve: function (state, optionId) {
      var ev = GameScandal.pendingEvent(state);
      if (!ev) return { ok: false };
      var opt = ev.options.filter(function (o) { return o.id === optionId; })[0];
      if (!opt) return { ok: false };
      var i = state.integrity;
      i.pendingEvent = null;
      i.eventsThisSeason = (i.eventsThisSeason || 0) + 1;
      if (ev.once) i.seenEvents.push(ev.id);
      var outcome = GameScandal.applyEffects(state, opt.fx || {});
      if (opt.risky) i.riskyThisSeason = (i.riskyThisSeason || 0) + 1;
      i.allegations.push({ year: state.career.year, event: ev.id, choice: opt.id, tag: (opt.fx && opt.fx.tag) || '', risky: !!opt.risky });
      return { ok: true, event: ev, option: opt, outcome: outcome };
    },

    applyEffects: function (state, fx) {
      var i = state.integrity, out = {};
      if (fx.heat) {
        var heatMult = window.GameCareer ? window.GameCareer.storeEffects(state).heatMult : 1; // PR firm
        var h = Math.round(fx.heat * heatMult);
        i.heat = clamp(i.heat + h, 0, 100); out.heat = h;
      }
      if (fx.adTrust) { i.adTrust = clamp(i.adTrust + fx.adTrust, 0, 100); out.adTrust = fx.adTrust; }
      if (fx.reputation) { state.career.reputation = clamp(state.career.reputation + fx.reputation, 0, 100); out.reputation = fx.reputation; }
      if (fx.recruitPoints && state.recruiting) { state.recruiting.points += fx.recruitPoints; out.recruitPoints = fx.recruitPoints; }
      if (fx.nil && state.program) { state.program.nilLevel = clamp(state.program.nilLevel + fx.nil, 0, 100); out.nil = fx.nil; }
      if (fx.severe) i._severeFlag = true;
      if (fx.capSeverity) i._capSeverity = true;
      if (fx.resign) { GameScandal.dismiss(state, 'resign'); out.resign = true; }
      return out;
    },

    // ---- end-of-season review ----------------------------------------------
    // Update AD trust from results and roll for an investigation + verdict.
    // Returns a verdict object stored on integrity.lastVerdict.
    endSeasonReview: function (state, summary) {
      var i = state.integrity;
      if (i.fired) return i.lastVerdict; // already gone
      var rng = E.makeRng((state.seed ^ (state.career.year * 0x1000193) ^ i.heat) >>> 0);

      // AD trust: winning builds it, losing erodes it.
      var wins = summary ? summary.wins : 6;
      var team = (window.TeamData && window.TeamData.get(state.team.id)) || { prestige: 5 };
      var expected = clamp(Math.round(team.prestige * 0.9 + 1), 3, 11);
      i.adTrust = clamp(Math.round(i.adTrust + (wins - expected) * 3 + (summary && summary.wonConf ? 6 : 0) + (summary && summary.wonNatl ? 12 : 0)), 0, 100);

      // Passive heat: low cohesion / very aggressive NIL invite scrutiny; a
      // fully clean season lets heat cool off.
      var cohesion = window.GameStaff ? window.GameStaff.effects(state).cohesion : 70;
      if (cohesion < 55) i.heat = clamp(i.heat + 4, 0, 100);
      if (state.program && state.program.nilLevel > 85) i.heat = clamp(i.heat + 3, 0, 100);
      if (!i.riskyThisSeason) i.heat = clamp(i.heat - 10, 0, 100);

      // Decrement existing sanction timers.
      if (i.probation > 0) i.probation--;
      if (i.scholarshipPenalty > 0) i.scholarshipPenalty--;

      // Investigation roll.
      var invMult = window.GameCareer ? window.GameCareer.storeEffects(state).invMult : 1; // private investigator
      var invChance = clamp(((i.heat - 25) / 120 + (cohesion < 55 ? 0.06 : 0) + (i._severeFlag ? 0.35 : 0)) * invMult, 0, 0.9);
      var verdict = { year: state.career.year, investigated: false, severity: 'none', sanctions: [], fired: false, heatBefore: i.heat };

      if (rng() < invChance) {
        verdict.investigated = true;
        i.underInvestigation = true;
        // Severity from heat, escalated by a live "severe" flag, capped by cooperation.
        var sev;
        var h = i.heat + (i._severeFlag ? 25 : 0);
        if (h < 40) sev = rng() < 0.5 ? 'cleared' : 'secondary';
        else if (h < 62) sev = rng() < 0.55 ? 'secondary' : 'major';
        else if (h < 85) sev = 'major';
        else sev = 'severe';
        if (i._capSeverity && (sev === 'severe')) sev = 'major';
        verdict.severity = sev;
        GameScandal.applySanctions(state, sev, verdict);
      } else if (i._severeFlag) {
        // A buried severe matter that didn't surface this year still simmers.
        verdict.severity = 'simmering';
      }

      // AD patience: sustained losing or a wrecked reputation gets you fired
      // even without a formal sanction (the hot seat).
      if (!verdict.fired && i.adTrust < 22 && !i.fired) {
        GameScandal.dismiss(state, 'performance');
        verdict.fired = true; verdict.severity = verdict.severity === 'none' ? 'hotseat' : verdict.severity;
        verdict.reason = 'performance';
      }

      // Reset per-season counters + transient flags.
      i.underInvestigation = false;
      i.riskyThisSeason = 0;
      i.eventsThisSeason = 0;
      i._severeFlag = false;
      i._capSeverity = false;
      i.lastVerdict = verdict;
      return verdict;
    },

    applySanctions: function (state, severity, verdict) {
      var i = state.integrity, year = state.career.year;
      if (severity === 'cleared' || severity === 'none') {
        verdict.sanctions.push('No violations found — program cleared.');
        i.heat = clamp(i.heat - 20, 0, 100);
        return;
      }
      if (severity === 'secondary') {
        i.probation = Math.max(i.probation, 1);
        state.career.reputation = clamp(state.career.reputation - 3, 0, 100);
        verdict.sanctions.push('Secondary violations — 1 year of probation.');
        i.heat = clamp(i.heat - 25, 0, 100);
        return;
      }
      if (severity === 'major') {
        i.probation = Math.max(i.probation, 2);
        i.scholarshipPenalty = Math.max(i.scholarshipPenalty, 2);
        i.bowlBanUntil = Math.max(i.bowlBanUntil, year + 1);
        i.adTrust = clamp(i.adTrust - 15, 0, 100);
        state.career.reputation = clamp(state.career.reputation - 10, 0, 100);
        verdict.sanctions.push('Scholarship reductions (2 years).');
        verdict.sanctions.push('Postseason ban next season.');
        verdict.sanctions.push('2 years probation.');
        i.heat = clamp(i.heat - 30, 0, 100);
        if (i.adTrust < 40) { GameScandal.dismiss(state, 'sanctions'); verdict.fired = true; verdict.reason = 'sanctions'; }
        return;
      }
      // severe → show-cause
      i.showCause = true;
      i.bowlBanUntil = Math.max(i.bowlBanUntil, year + 2);
      i.scholarshipPenalty = Math.max(i.scholarshipPenalty, 3);
      state.career.reputation = clamp(state.career.reputation - 25, 0, 100);
      verdict.sanctions.push('SHOW-CAUSE penalty issued.');
      verdict.sanctions.push('Multi-year postseason ban and scholarship losses.');
      GameScandal.dismiss(state, 'showcause');
      verdict.fired = true; verdict.reason = 'showcause';
      i.heat = clamp(i.heat - 40, 0, 100);
    },

    // Mark the coach as dismissed/resigned from the current job.
    dismiss: function (state, reason) {
      state.integrity.fired = true;
      state.integrity.firedReason = reason;
      var job = state.career.jobs[state.career.jobs.length - 1];
      if (job && job.endYear == null) job.endYear = state.career.year;
    },

    // ---- lifecycle ----------------------------------------------------------
    // Called at the start of each season (from GameSeason.start) to reset the
    // per-season counters (heat/sanctions persist across seasons).
    onSeasonStart: function (state) {
      var i = state.integrity;
      i.eventsThisSeason = 0;
      i.riskyThisSeason = 0;
      i.pendingEvent = null;
    },

    ensureIntegrity: function (state) {
      if (!state.integrity) state.integrity = E.freshState().integrity;
      return state;
    }
  };

  window.GameScandal = GameScandal;
})();
