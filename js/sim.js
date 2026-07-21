/* GRIDIRON DYNASTY — sim.js
 * window.GameSim: a drive-by-drive American-football play engine for a single
 * game, driving the broadcast presentation. Realistic-ish: downs & distance,
 * run/pass distributions off vs. defense, sacks, turnovers, penalties, special
 * teams, field goals, clock/quarters, halftime, overtime, momentum, and
 * high-leverage coaching decisions surfaced to the player (4th down, PAT/2pt,
 * onside, clock/tempo). The opponent (AI) makes its own reasonable calls.
 *
 * The game state is transient (not persisted into the season save); the season
 * commits only the final score when the game ends.
 *
 * Usage:
 *   var g = GameSim.create({ home, away, playerSide, stakes, seed });
 *   // loop:
 *   if (g.pending) show decision; GameSim.decide(g, choiceId);
 *   else var ev = GameSim.advance(g);   // returns an event to render
 *   // GameSim.simRemaining(g) resolves everything left (auto-coach).
 */
(function () {
  'use strict';

  var T = window.TeamData;
  var E = window.GameEngine;

  var QUARTER_SECONDS = 15 * 60;

  // ---- rng ------------------------------------------------------------------
  function rngFrom(seed) {
    var r = E && E.makeRng ? E.makeRng(seed >>> 0) : function () { return Math.random(); };
    return r;
  }
  function gauss(rng, mean, sd) {
    // Box-Muller
    var u = 1 - rng(), v = 1 - rng();
    return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function other(side) { return side === 'home' ? 'away' : 'home'; }

  // ---- team unit setup ------------------------------------------------------
  function unit(side, cfg) {
    var team = T.get(cfg.id) || { id: cfg.id, name: cfg.name || 'Team', nick: '', colors: ['#444', '#888'], emoji: '🏈' };
    return {
      side: side, id: team.id, name: team.name, nick: team.nick,
      colors: team.colors, emoji: team.emoji,
      off: clamp(Math.round(cfg.off), 30, 99),
      def: clamp(Math.round(cfg.def), 30, 99),
      isPlayer: !!cfg.isPlayer,
      timeouts: 3, score: 0, tempo: 'normal',
      stats: { plays: 0, yards: 0, pass: 0, rush: 0, first: 0, to: 0, sacks: 0 }
    };
  }

  var GameSim = {
    QUARTER_SECONDS: QUARTER_SECONDS,

    // Build unit ratings for a team from a season-league entry + optional coach.
    ratingsFor: function (leagueEntry, coach, isPlayer) {
      var base = leagueEntry ? leagueEntry.rating : 60;
      var off = base, def = base;
      if (isPlayer && coach && coach.ratings) {
        var c = coach.ratings;
        off = base + (c.offense - 62) * 0.55 + (c.development - 62) * 0.12;
        def = base + (c.defense - 62) * 0.55 + (c.discipline - 62) * 0.12;
      } else {
        // AI: small stable split so teams aren't identical on both sides.
        var h = 0; var s = (leagueEntry && leagueEntry.rating || 60) + '';
        for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) & 255;
        var tilt = (h % 9) - 4;
        off = base + tilt; def = base - tilt;
      }
      return { off: off, def: def };
    },

    create: function (opts) {
      var seed = (opts.seed != null ? opts.seed : (Date.now() ^ Math.floor(Math.random() * 1e9))) >>> 0;
      var g = {
        home: unit('home', opts.home),
        away: unit('away', opts.away),
        playerSide: opts.playerSide || (opts.home.isPlayer ? 'home' : (opts.away.isPlayer ? 'away' : null)),
        stakes: opts.stakes || 'Regular Season',
        neutral: !!opts.neutral,
        venue: opts.venue || '',
        qtr: 1, clock: QUARTER_SECONDS,
        poss: null, los: 25, down: 1, toGo: 10,
        mo: 0,                     // momentum, + favors home
        over: false, pending: null,
        awaitingKickoff: true, kickTo: null, awaitingPAT: null,
        receiverSecondHalf: null,  // team that receives to start 2nd half
        ot: 0, otState: null,
        playCount: 0, log: [],
        _rng: null, _seed: seed,
        result: null
      };
      g._rng = rngFrom(seed);
      // Coin toss: away receives first (visitor), home receives 2nd half.
      g.poss = 'away';
      g.kickTo = 'away';
      g.receiverSecondHalf = 'home';
      g.log.push({ tag: 'kick', text: g.stakes + (g.neutral ? ' · neutral site' : '') + ' — kickoff!' });
      return g;
    },

    // ---- clock / helpers ----------------------------------------------------
    timeString: function (g) {
      var m = Math.floor(g.clock / 60), s = g.clock % 60;
      return m + ':' + (s < 10 ? '0' : '') + s;
    },
    quarterLabel: function (g) {
      if (g.ot) return 'OT' + g.ot;
      return ['1st', '2nd', '3rd', '4th'][g.qtr - 1] || '?';
    },
    downLabel: function (g) {
      if (g.awaitingKickoff || g.awaitingPAT) return '';
      var od = ['1st', '2nd', '3rd', '4th'][g.down - 1] || '';
      var dist = (g.los + g.toGo >= 100) ? 'Goal' : g.toGo;
      return od + ' & ' + dist;
    },
    // Ball spot from home's left-to-right perspective (0..100) for the field view.
    fieldSpot: function (g) {
      return g.poss === 'home' ? g.los : 100 - g.los;
    },
    isPlayer: function (g, side) { return g.playerSide && side === g.playerSide; },
    leading: function (g, side) { return g[side].score > g[other(side)].score; },

    // ---- momentum -----------------------------------------------------------
    _mo: function (g, side, amt) {
      var d = side === 'home' ? amt : -amt;
      g.mo = clamp(g.mo + d, -100, 100);
    },
    _edge: function (g, offSide) {
      var o = g[offSide], d = g[other(offSide)];
      var base = o.off - d.def;
      var mo = (offSide === 'home' ? g.mo : -g.mo) * 0.06;
      return base + mo;
    },

    // ---- main advance -------------------------------------------------------
    // Returns an event {tag, text, ...}. Sets g.pending when the player must
    // make a decision (call GameSim.decide next). Never call while g.pending set.
    advance: function (g) {
      if (g.over) return { tag: 'final', text: 'Final.' };
      if (g.pending) return { tag: 'decision', text: '', pending: g.pending };
      if (g.awaitingPAT) return GameSim._pat(g);
      if (g.awaitingKickoff) return GameSim._kickoff(g);
      return GameSim._snap(g);
    },

    // Resolve everything remaining, auto-coaching the player's decisions.
    simRemaining: function (g, maxPlays) {
      maxPlays = maxPlays || 2000;
      var n = 0;
      while (!g.over && n++ < maxPlays) {
        if (g.pending) GameSim.decide(g, GameSim.autoChoice(g));
        else GameSim.advance(g);
      }
      return g.result;
    },

    // Sensible default for a pending decision (AI / auto-coach).
    autoChoice: function (g) {
      if (!g.pending) return null;
      var p = g.pending;
      if (p.kind === 'fourth_down') return GameSim._aiFourth(g);
      if (p.kind === 'pat') return GameSim._aiPat(g);
      if (p.kind === 'kickoff') return GameSim._aiKickoff(g);
      return p.options ? p.options[0].id : 'ok';
    },

    // Apply a player's (or auto) decision.
    decide: function (g, choiceId) {
      var p = g.pending; if (!p) return GameSim.advance(g);
      g.pending = null;
      if (p.kind === 'fourth_down') {
        if (choiceId === 'fg') return GameSim._fieldGoal(g);
        if (choiceId === 'punt') return GameSim._punt(g);
        return GameSim._runPlay(g, { forceType: null, fourthGo: true }); // 'go' / fake
      }
      if (p.kind === 'pat') {
        return GameSim._doPat(g, choiceId);
      }
      if (p.kind === 'kickoff') {
        return GameSim._doKickoff(g, choiceId === 'onside');
      }
      if (p.kind === 'tempo') {
        g[g.poss].tempo = choiceId; return { tag: 'info', text: 'Tempo: ' + choiceId };
      }
      return GameSim.advance(g);
    },

    // ---- kickoff ------------------------------------------------------------
    _kickoff: function (g) {
      var kicking = g.kickTo ? other(g.kickTo) : other(g.poss);
      // Offer onside to the player if trailing late in the 4th.
      var receiving = other(kicking);
      if (GameSim.isPlayer(g, kicking) && g.qtr >= 4 && g.clock <= 210 &&
          g[kicking].score < g[receiving].score) {
        g.pending = { kind: 'kickoff', side: kicking, options: [
          { id: 'normal', label: 'Kick Deep', desc: 'Standard kickoff.' },
          { id: 'onside', label: 'Onside Kick', desc: 'Gamble to get the ball back.', risky: true }
        ], rec: 'onside' };
        return { tag: 'decision', text: 'Kickoff decision', pending: g.pending };
      }
      var onside = GameSim.isPlayer(g, kicking) ? false : GameSim._aiKickoff(g) === 'onside';
      return GameSim._doKickoff(g, onside);
    },
    _aiKickoff: function (g) {
      var kicking = g.kickTo ? other(g.kickTo) : other(g.poss);
      var receiving = other(kicking);
      if (g.qtr >= 4 && g.clock <= 150 && g[kicking].score < g[receiving].score) return 'onside';
      return 'normal';
    },
    _doKickoff: function (g, onside) {
      var kicking = g.kickTo ? other(g.kickTo) : other(g.poss);
      var receiving = other(kicking);
      g.awaitingKickoff = false; g.kickTo = null;
      var rng = g._rng;
      if (onside) {
        var recover = rng() < 0.18;
        if (recover) {
          g.poss = kicking; g.los = clamp(48 + Math.round(gauss(rng, 0, 3)), 40, 55);
          GameSim._newSeries(g);
          GameSim._mo(g, kicking, 30);
          return GameSim._start(g, { tag: 'onside', text: '🏈 ONSIDE KICK RECOVERED by ' + g[kicking].name + '!' }, kicking);
        }
        g.poss = receiving; g.los = clamp(52 + Math.round(gauss(rng, 0, 3)), 45, 62);
        GameSim._newSeries(g);
        GameSim._mo(g, receiving, 12);
        return GameSim._start(g, { tag: 'onside', text: 'Onside kick fails — ' + g[receiving].name + ' recovers in great field position.' }, receiving);
      }
      // normal kickoff
      var touchback = rng() < 0.62;
      g.poss = receiving;
      if (touchback) g.los = 25;
      else g.los = clamp(Math.round(gauss(rng, 27, 8)), 8, 45);
      GameSim._newSeries(g);
      var txt = touchback ? (g[receiving].name + ' will start at the 25.') : (g[receiving].name + ' returns it out to the ' + GameSim._yardName(g, g.los) + '.');
      return GameSim._start(g, { tag: 'kick', text: txt }, receiving);
    },

    _start: function (g, ev, side) {
      ev.poss = side;
      return ev;
    },

    // ---- snap gate (handles 4th-down decision) ------------------------------
    _snap: function (g) {
      // End-of-quarter check handled after plays; here just run a down.
      if (g.down === 4) {
        var ctx = GameSim._fourthContext(g);
        if (GameSim.isPlayer(g, g.poss) && ctx.isDecision) {
          g.pending = { kind: 'fourth_down', side: g.poss, options: ctx.options, rec: ctx.rec, ctx: ctx };
          return { tag: 'decision', text: '4th down decision', pending: g.pending };
        }
        var pick = GameSim.isPlayer(g, g.poss) ? ctx.auto : GameSim._aiFourth(g);
        if (pick === 'fg') return GameSim._fieldGoal(g);
        if (pick === 'punt') return GameSim._punt(g);
        return GameSim._runPlay(g, { fourthGo: true });
      }
      return GameSim._runPlay(g, {});
    },

    _fourthContext: function (g) {
      var toGoal = 100 - g.los;
      var fgDist = toGoal + 17;
      var options = [];
      options.push({ id: 'go', label: 'Go For It', desc: '4th & ' + (g.los + g.toGo >= 100 ? 'Goal' : g.toGo) + ' — trust the offense.' });
      if (fgDist <= 60) options.push({ id: 'fg', label: 'Field Goal', desc: fgDist + '-yard attempt.' });
      if (g.los < 68) options.push({ id: 'punt', label: 'Punt', desc: 'Flip the field.' });
      // Recommendation.
      var rec = 'punt';
      if (fgDist <= 50) rec = 'fg';
      if (g.toGo <= 2 && g.los >= 45) rec = 'go';
      if (fgDist <= 38) rec = 'fg';
      var desperate = (g.qtr >= 4 && g[g.poss].score < g[other(g.poss)].score && g.clock <= 300);
      if (desperate && g.los >= 45 && fgDist > 50) rec = 'go';
      // Is this a real decision, or an automatic punt?
      var isDecision = (g.los >= 40) || (g.toGo <= 4) || (fgDist <= 60) || desperate;
      var auto = isDecision ? rec : 'punt';
      return { options: options, rec: rec, auto: auto, isDecision: isDecision, fgDist: fgDist };
    },

    _aiFourth: function (g) {
      var ctx = GameSim._fourthContext(g);
      // AI leans to the recommendation, with a little aggression late.
      return ctx.auto;
    },

    // ---- offensive play -----------------------------------------------------
    _choosePlayType: function (g) {
      var o = g[g.poss];
      var rng = g._rng;
      var passBias = 0.5;
      if (o.tempo === 'hurry') passBias = 0.72;
      if (o.tempo === 'milk') passBias = 0.32;
      // situational
      if (g.down >= 3 && g.toGo >= 7) passBias += 0.22;
      if (g.down >= 3 && g.toGo <= 2) passBias -= 0.25;
      if (g.qtr >= 4 && g[g.poss].score < g[other(g.poss)].score && g.clock < 300) passBias += 0.18;
      passBias = clamp(passBias, 0.08, 0.9);
      if (rng() < passBias) {
        var deep = rng() < (0.22 + (g.toGo >= 10 ? 0.12 : 0) + (o.tempo === 'hurry' ? 0.08 : 0));
        return deep ? 'deep' : 'short';
      }
      return 'run';
    },

    _runPlay: function (g, opt) {
      var rng = g._rng, o = g[g.poss], d = g[other(g.poss)];
      o.stats.plays++;
      var edge = GameSim._edge(g, g.poss);
      var type = opt.forceType || GameSim._choosePlayType(g);
      var gain = 0, timeUsed = 35, clockStops = false, ev = { tag: 'run', text: '' };
      var oppName = o.name;

      // Pre-snap penalty (rare).
      if (rng() < 0.055) {
        var off = rng() < 0.5;
        var yds = 5 + (rng() < 0.4 ? 5 : 0);
        if (off) {
          g.los = clamp(g.los - yds, 1, 99); g.toGo += yds;
          return GameSim._afterPlay(g, { tag: 'flag', text: '🚩 Penalty on ' + o.name + ' — ' + yds + ' yards. Replay ' + GameSim.downLabel(g) + '.' }, 5, true, true);
        } else {
          var toGoal0 = 100 - g.los; var add = Math.min(yds, toGoal0 - 1);
          g.los += add; g.toGo = Math.max(1, g.toGo - add);
          if (g.toGo <= 0 || g.los + 0 >= 100) {}
          return GameSim._afterPlay(g, { tag: 'flag', text: '🚩 Defensive penalty on ' + d.name + ' — ' + add + ' yards.' }, 5, true, true, true);
        }
      }

      if (type === 'run') {
        var sd = 4.7;
        gain = gauss(rng, 4.6 + edge * 0.07, sd);
        if (rng() < 0.055) gain += 12 + rng() * 34;      // breakaway
        gain = Math.round(clamp(gain, -6, 99));
        timeUsed = o.tempo === 'hurry' ? 24 : (o.tempo === 'milk' ? 42 : 37);
        o.stats.rush += Math.max(0, gain);
        // fumble
        if (rng() < 0.012 + Math.max(0, -edge) * 0.0004) {
          o.stats.to++;
          return GameSim._turnover(g, 'FUMBLE', 'lost a fumble', Math.round(clamp(g.los + gain * 0.5, 1, 99)));
        }
        ev.tag = 'run';
        ev.text = GameSim._runText(g, gain);
      } else {
        // pass
        var deep = type === 'deep';
        var compBase = (deep ? 0.47 : 0.665) + edge * 0.006;
        compBase = clamp(compBase, 0.2, deep ? 0.74 : 0.87);
        // sack chance
        var sackP = 0.05 + Math.max(0, -edge) * 0.0015 + (deep ? 0.018 : 0);
        if (rng() < sackP) {
          var loss = Math.round(4 + rng() * 6);
          gain = -Math.min(loss, g.los - 1);
          o.stats.sacks++;
          timeUsed = 32;
          ev.tag = 'sack';
          ev.text = GameSim._qb(g) + ' is SACKED for a loss of ' + (-gain) + '.';
          GameSim._mo(g, other(g.poss), 6);
          return GameSim._afterPlay(g, ev, gain, timeUsed, false);
        }
        // interception
        var intP = (deep ? 0.055 : 0.022) + Math.max(0, -edge) * 0.0009;
        if (rng() < intP) {
          o.stats.to++;
          var spot = Math.round(clamp(g.los + (deep ? 18 + rng() * 20 : 6 + rng() * 8), 1, 99));
          return GameSim._turnover(g, 'INT', 'is INTERCEPTED', spot);
        }
        if (rng() < compBase) {
          var mean = deep ? 23 : 7.8;
          gain = gauss(rng, mean + edge * 0.05, deep ? 10 : 5.6);
          if (rng() < 0.06) gain += 10 + rng() * 30; // YAC
          gain = Math.round(clamp(gain, -3, 99));
          o.stats.pass += Math.max(0, gain);
          timeUsed = o.tempo === 'hurry' ? 20 : 29;
          clockStops = rng() < 0.28; // out of bounds
          ev.tag = 'pass';
          ev.text = GameSim._passText(g, gain, deep, clockStops);
          if (rng() < 0.006) { o.stats.to++; return GameSim._turnover(g, 'FUMBLE', 'fumbles after the catch', Math.round(clamp(g.los + gain, 1, 99))); }
        } else {
          gain = 0; timeUsed = 6; clockStops = true;
          ev.tag = 'incomplete';
          ev.text = 'Pass ' + (deep ? 'deep ' : '') + 'incomplete' + (deep ? ' downfield.' : '.');
        }
      }
      return GameSim._afterPlay(g, ev, gain, timeUsed, clockStops);
    },

    // Apply yardage, downs, scoring; append event; run clock; return event.
    _afterPlay: function (g, ev, gain, timeUsed, clockStops, noDownChange, autoFirst) {
      var o = g[g.poss];
      g.playCount++;
      var newLos = g.los + gain;

      // Touchdown
      if (newLos >= 100) {
        g.los = 100;
        o.score += 6; o.stats.first++;
        ev.tag = 'td'; ev.text = '🏈 TOUCHDOWN ' + o.name + '! ' + (ev.text || '');
        GameSim._mo(g, g.poss, 26);
        GameSim._runClock(g, Math.min(timeUsed, 12));
        g.awaitingPAT = g.poss;
        ev.score = true;
        return GameSim._finishEvent(g, ev);
      }
      // Safety
      if (newLos <= 0) {
        g[other(g.poss)].score += 2;
        ev.tag = 'safety'; ev.text = '⚠️ SAFETY! ' + g[other(g.poss)].name + ' gets two.';
        GameSim._mo(g, other(g.poss), 18);
        GameSim._runClock(g, timeUsed);
        // free kick to the scoring team
        g.awaitingKickoff = true; g.kickTo = other(g.poss); // conceding team kicks
        // conceding team kicks -> other(poss) receives? Safety: team scored on kicks.
        g.kickTo = g.poss; // receiving side marker: kickTo = team that will receive
        // conceding team (g.poss) free-kicks to scoring team (other)
        g.kickTo = other(g.poss);
        return GameSim._finishEvent(g, ev);
      }

      g.los = clamp(newLos, 1, 99);
      var gotFirst = autoFirst || (gain >= g.toGo);
      if (!noDownChange) {
        if (gotFirst) {
          g.down = 1; o.stats.first++;
          g.toGo = Math.min(10, 100 - g.los);
          if (ev.tag === 'run' || ev.tag === 'pass') ev.first = true;
        } else {
          g.down++;
          g.toGo = g.toGo - gain;
          if (g.down > 4) {
            GameSim._runClock(g, timeUsed);
            return GameSim._turnoverOnDowns(g, ev);
          }
        }
      }
      if (gain >= 20) GameSim._mo(g, g.poss, 8);
      GameSim._runClock(g, timeUsed, clockStops);
      return GameSim._finishEvent(g, ev);
    },

    _turnover: function (g, kind, verb, spot) {
      var o = g[g.poss];
      var ev = { tag: kind === 'INT' ? 'int' : 'fumble', text: GameSim._qb(g, true) + ' ' + verb + '! ' + g[other(g.poss)].name + ' takes over.' };
      GameSim._runClock(g, 12);
      GameSim._mo(g, other(g.poss), 24);
      g.poss = other(g.poss);
      g.los = clamp(100 - spot, 1, 99);
      GameSim._newSeries(g);
      ev.turnover = true;
      return GameSim._finishEvent(g, ev);
    },
    _turnoverOnDowns: function (g, ev) {
      ev.tag = 'downs';
      ev.text = (ev.text ? ev.text + ' ' : '') + 'Turnover on downs — ' + g[other(g.poss)].name + ' takes over.';
      GameSim._mo(g, other(g.poss), 14);
      g.poss = other(g.poss);
      g.los = clamp(100 - g.los, 1, 99);
      GameSim._newSeries(g);
      return GameSim._finishEvent(g, ev);
    },

    _newSeries: function (g) { g.down = 1; g.toGo = Math.min(10, 100 - g.los); },

    // ---- special teams ------------------------------------------------------
    _fieldGoal: function (g) {
      var rng = g._rng, o = g[g.poss];
      var dist = (100 - g.los) + 17;
      var p = clamp(1.30 - dist * 0.013, 0.05, 0.99);
      GameSim._runClock(g, 8);
      var good = rng() < p;
      if (good) {
        o.score += 3;
        GameSim._mo(g, g.poss, 8);
        var ev = { tag: 'fg', text: '✅ ' + dist + '-yard field goal is GOOD! ' + o.name + ' on the board.' };
        g.awaitingKickoff = true; g.kickTo = other(g.poss);
        ev.score = true;
        return GameSim._finishEvent(g, ev);
      }
      GameSim._mo(g, other(g.poss), 10);
      var spot = Math.max(20, g.los - 8);
      g.poss = other(g.poss); g.los = clamp(100 - spot, 1, 80);
      GameSim._newSeries(g);
      return GameSim._finishEvent(g, { tag: 'fgmiss', text: '❌ ' + dist + '-yard field goal is NO GOOD. ' + g[g.poss].name + ' takes over.' });
    },

    _punt: function (g) {
      var rng = g._rng;
      GameSim._runClock(g, 8);
      var net = Math.round(clamp(gauss(rng, 42, 8), 20, 65));
      var landing = g.los + net;
      var recv = other(g.poss);
      var los2;
      if (landing >= 100) los2 = 20; // touchback
      else los2 = clamp(100 - landing, 1, 95);
      g.poss = recv; g.los = los2;
      GameSim._newSeries(g);
      return GameSim._finishEvent(g, { tag: 'punt', text: 'Punt — ' + g[recv].name + ' takes over at the ' + GameSim._yardName(g, g.los) + '.' });
    },

    // ---- PAT ----------------------------------------------------------------
    _pat: function (g) {
      var scorer = g.awaitingPAT;
      if (GameSim.isPlayer(g, scorer)) {
        g.pending = { kind: 'pat', side: scorer, options: [
          { id: 'kick', label: 'Extra Point', desc: 'Kick for 1 (safe).' },
          { id: 'two', label: 'Two-Point Try', desc: 'Go for 2 (~47%).', risky: true }
        ], rec: GameSim._aiPat(g) };
        return { tag: 'decision', text: 'Extra point decision', pending: g.pending };
      }
      return GameSim._doPat(g, GameSim._aiPat(g));
    },
    _aiPat: function (g) {
      var scorer = g.awaitingPAT;
      var diff = g[scorer].score - g[other(scorer)].score; // after the 6
      // Late-game two-point logic for a few key margins.
      if (g.qtr >= 4) {
        if (diff === 2 || diff === -1 || diff === 5 || diff === -4 || diff === -10) return 'two';
      }
      return 'kick';
    },
    _doPat: function (g, choice) {
      var rng = g._rng, scorer = g.awaitingPAT;
      g.awaitingPAT = null;
      var ev;
      if (choice === 'two') {
        var good = rng() < 0.47 + (g[scorer].off - g[other(scorer)].def) * 0.004;
        if (good) { g[scorer].score += 2; ev = { tag: 'two', text: '💪 Two-point conversion is GOOD!' }; }
        else ev = { tag: 'twofail', text: 'Two-point try is no good.' };
      } else {
        var made = rng() < 0.94;
        if (made) { g[scorer].score += 1; ev = { tag: 'pat', text: 'Extra point is good.' }; }
        else ev = { tag: 'patmiss', text: 'The extra point is MISSED!' };
      }
      g.awaitingKickoff = true; g.kickTo = other(scorer);
      return GameSim._finishEvent(g, ev);
    },

    // ---- clock / quarter management ----------------------------------------
    _runClock: function (g, seconds, stops) {
      if (g.ot) return; // OT is untimed here
      g.clock -= Math.max(0, seconds);
      if (g.clock <= 0) { g.clock = 0; }
    },

    // Finalize an event: handle quarter/half/game transitions, append to log.
    _finishEvent: function (g, ev) {
      // Quarter / half / game boundaries.
      if (!g.ot && g.clock <= 0) {
        if (g.qtr === 1 || g.qtr === 3) {
          g.qtr++; g.clock = QUARTER_SECONDS;
          ev.text = (ev.text ? ev.text + '  ' : '') + '— End of the ' + (g.qtr === 2 ? '1st' : '3rd') + ' quarter.';
        } else if (g.qtr === 2) {
          // Halftime -> 2nd half kickoff by the team that didn't receive first.
          g.qtr = 3; g.clock = QUARTER_SECONDS;
          g.awaitingKickoff = true; g.awaitingPAT = null;
          g.kickTo = g.receiverSecondHalf;
          ev.tag = ev.tag === 'td' || ev.tag === 'fg' ? ev.tag : 'half';
          ev.text = (ev.text ? ev.text + '  ' : '') + '🏟️ Halftime — ' + g.home.name + ' ' + g.home.score + ', ' + g.away.name + ' ' + g.away.score + '.';
        } else if (g.qtr === 4) {
          if (g.home.score === g.away.score) {
            GameSim._startOT(g);
            ev.text = (ev.text ? ev.text + '  ' : '') + '⏱️ Tied at the end of regulation — OVERTIME!';
          } else {
            return GameSim._endGame(g, ev);
          }
        }
      }
      // OT resolution check after each possession result.
      if (g.ot) GameSim._checkOT(g, ev);
      g.log.push(ev);
      if (g.log.length > 220) g.log.shift();
      return ev;
    },

    _startOT: function (g) {
      g.ot = 1; g.clock = 0;
      g.otState = { possNum: 0, first: null, firstScoreStart: null };
      GameSim._setupOTPossession(g, 'away'); // visitor first by convention
    },
    _setupOTPossession: function (g, side) {
      g.poss = side; g.los = 75; // ball at opponent's 25
      GameSim._newSeries(g);
      g.awaitingKickoff = false; g.awaitingPAT = null;
      g.otState.possScoreStart = { home: g.home.score, away: g.away.score };
      g.otState.current = side;
    },
    _checkOT: function (g, ev) {
      // A possession "ends" on: TD (after PAT resolves), FG, turnover, downs, miss.
      var enders = { fg: 1, fgmiss: 1, int: 1, fumble: 1, downs: 1, patmiss: 0 };
      var endedByScoreKick = (ev.tag === 'pat' || ev.tag === 'two' || ev.tag === 'twofail' || ev.tag === 'patmiss');
      var ended = enders[ev.tag] || endedByScoreKick;
      if (!ended) return;
      var os = g.otState;
      var cur = os.current;
      // Clear any kickoff request that OT doesn't use.
      g.awaitingKickoff = false;
      if (cur === 'away') {
        // second team gets a shot
        os.awayEndScore = { home: g.home.score, away: g.away.score };
        GameSim._setupOTPossession(g, 'home');
      } else {
        // both teams have had it this OT round
        if (g.home.score !== g.away.score) {
          return GameSim._endGame(g, ev);
        }
        g.ot++;
        if (g.ot > 6) {
          // safety valve: decide by momentum/coin flip
          if (g.mo === 0) g.mo = g._rng() < 0.5 ? 1 : -1;
          if (g.mo > 0) g.home.score += 3; else g.away.score += 3;
          return GameSim._endGame(g, ev);
        }
        GameSim._setupOTPossession(g, 'away');
      }
    },

    _endGame: function (g, ev) {
      g.over = true;
      var hs = g.home.score, as = g.away.score;
      var winnerSide = hs === as ? (g._rng() < 0.5 ? 'home' : 'away') : (hs > as ? 'home' : 'away');
      if (hs === as) { if (winnerSide === 'home') g.home.score++; else g.away.score++; }
      g.result = {
        homeScore: g.home.score, awayScore: g.away.score,
        winnerSide: g.home.score > g.away.score ? 'home' : 'away',
        winnerId: g.home.score > g.away.score ? g.home.id : g.away.id,
        home: g.home.id, away: g.away.id, ot: g.ot
      };
      ev.tag = 'final';
      ev.text = 'FINAL — ' + g.home.name + ' ' + g.home.score + ', ' + g.away.name + ' ' + g.away.score + (g.ot ? '  (' + g.ot + 'OT)' : '') + '.';
      g.log.push(ev);
      return ev;
    },

    // ---- flavor text --------------------------------------------------------
    _qb: function (g, poss) { return g[g.poss].name + ' QB'; },
    _yardName: function (g, los) {
      // los is from possession team's own goal; convert to "OWN xx / OPP xx".
      if (los <= 50) return 'own ' + los;
      return 'opp ' + (100 - los);
    },
    _runText: function (g, gain) {
      var rng = g._rng;
      if (gain <= -1) return pickr(rng, ['Stuffed in the backfield for ' + gain + '.', 'No room — ' + gain + ' on the carry.']);
      if (gain === 0) return 'No gain on the run.';
      if (gain >= 25) return pickr(rng, ['🔥 BIG RUN — ' + gain + ' yards, breaking free!', 'He\'s gone for ' + gain + '! Huge gain on the ground.']);
      if (gain >= 10) return pickr(rng, ['Nice run for ' + gain + '.', 'Finds a crease — ' + gain + ' yards.']);
      return pickr(rng, ['Run up the middle for ' + gain + '.', 'Off tackle, ' + gain + ' yards.', 'Gains ' + gain + ' on the carry.']);
    },
    _passText: function (g, gain, deep, oob) {
      var rng = g._rng;
      if (deep && gain >= 25) return pickr(rng, ['💥 DEEP BALL — complete for ' + gain + '!', 'Down the field, caught for ' + gain + '! What a throw.']);
      if (gain >= 20) return 'Complete for ' + gain + ' — big play through the air.';
      if (gain >= 8) return pickr(rng, ['Completed for ' + gain + '.', 'Finds his man for ' + gain + (oob ? ', out of bounds.' : '.')]);
      if (gain <= 0) return 'Caught behind the line for ' + gain + '.';
      return 'Quick completion for ' + gain + (oob ? ', steps out.' : '.');
    }
  };

  function pickr(rng, arr) { return arr[Math.floor(rng() * arr.length)]; }

  window.GameSim = GameSim;
})();
