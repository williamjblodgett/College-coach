/* GRIDIRON DYNASTY — engine.js
 * window.GameEngine: single serializable state object + rules + save/load.
 * Save compatibility invariant: deserialize() deep-merges a saved object OVER a
 * fresh-state template, so keys added in later waves are always backfilled and
 * old saves never break.
 */
(function () {
  'use strict';

  var SAVE_KEY = 'gridiron-save-v1';
  var SAVE_VERSION = 2;

  // ---- deep helpers ---------------------------------------------------------
  function isPlainObject(v) {
    return v !== null && typeof v === 'object' && !Array.isArray(v);
  }

  // Deep-merge source OVER a fresh template. Template supplies defaults for any
  // missing key; saved values win where present. Arrays are taken wholesale
  // from source when present (they represent user data, not schema).
  function backfill(template, source) {
    if (!isPlainObject(template)) {
      return source === undefined ? template : source;
    }
    var out = Array.isArray(template) ? template.slice() : {};
    var k;
    for (k in template) {
      if (!Object.prototype.hasOwnProperty.call(template, k)) continue;
      out[k] = template[k];
    }
    if (isPlainObject(source)) {
      for (k in source) {
        if (!Object.prototype.hasOwnProperty.call(source, k)) continue;
        if (isPlainObject(template[k]) && isPlainObject(source[k])) {
          out[k] = backfill(template[k], source[k]);
        } else {
          out[k] = source[k]; // saved value (incl. arrays) wins
        }
      }
    }
    return out;
  }

  function clone(v) {
    return JSON.parse(JSON.stringify(v));
  }

  function hashSeed(seed, namespace, salt) {
    var h = (seed >>> 0) ^ 2166136261;
    var text = String(namespace || 'world') + ':' + String(salt == null ? '' : salt);
    for (var i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }

  // Ordered migrations repair nested array records that template backfill
  // cannot reach. Always migrate a clone so a failed import remains untouched.
  var MIGRATIONS = {
    1: function (s) {
      s.world = s.world || { seed: s.seed || 0, era: 1, news: [], records: {} };
      s.settings = s.settings || {};
      if (!s.settings.difficulty) s.settings.difficulty = 'dynasty';
      if (s.settings.reducedMotion == null) s.settings.reducedMotion = false;
      (s.roster || []).forEach(function (p) {
        if (p.durability == null) p.durability = 65;
        if (p.fatigue == null) p.fatigue = 0;
        if (p.morale == null) p.morale = 70;
        if (!p.injuries) p.injuries = [];
        if (!p.stats) p.stats = {};
      });
      s.saveVersion = 2;
      return s;
    }
  };

  function migrate(input) {
    var s = clone(input), version = Math.max(1, Number(s.saveVersion) || 1);
    while (version < SAVE_VERSION) {
      if (!MIGRATIONS[version]) throw new Error('Missing save migration from version ' + version);
      s = MIGRATIONS[version](s); version = Number(s.saveVersion) || version + 1;
    }
    return s;
  }

  // ---- deterministic RNG (mulberry32) --------------------------------------
  function makeRng(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ---- fresh state template -------------------------------------------------
  // Every field the game reads lives here with a sane default. Later waves add
  // keys here; backfill() upgrades old saves automatically.
  function freshState() {
    return {
      saveVersion: SAVE_VERSION,
      createdAt: 0,
      seed: 0,
      world: { seed: 0, era: 1, news: [], records: {} },
      screen: 'title',            // current UI screen
      // The coach the player controls.
      coach: {
        id: null,
        name: '',
        source: 'real',           // real | legend | custom
        background: '',
        avatar: '🧢',
        color: '#c8102e',
        bio: '',
        ratings: {                // 0-100 balance stats
          recruiting: 50, offense: 50, defense: 50,
          development: 50, discipline: 50, motivation: 50, media: 50
        }
      },
      // The program the player currently coaches.
      team: {
        id: null,
        name: '',
        division: 'fbs'
      },
      // Career-spanning record (survives job changes in later waves).
      career: {
        year: 2025,
        seasonsCoached: 0,
        wins: 0,
        losses: 0,
        confTitles: 0,
        natTitles: 0,
        jobs: [],                 // [{teamId, startYear, endYear, wins, losses}]
        reputation: 50,           // portable prestige, 0-100
        coachingAbility: 50,      // earned game-management/development mastery
        nameRecognition: 25,      // how widely athletic departments know the coach
        fame: 15,                 // national profile with fans, media, and boosters
        coachXp: 0,
        coachLevel: 1,
        role: 'headCoach',
        badges: [],
        relationships: { players: 60, staff: 60, boosters: 55, media: 50, ad: 60 },
        pressHistory: [],
        pendingPress: null,
        ethicsHistory: [],
        redemption: 0,
        caseCloud: 0,
        legacyPoints: 0,
        wallet: 0,                // personal money ($M) accumulated from salary (wave 7)
        spent: 0,                 // lifetime personal spending ($M)
        purchases: []             // owned store items (wave 8)
        ,age: 32, regionalRecognition: 25, nationalRecognition: 5,
        careerPhase: 'Rising Coach', coachingTree: [], retirementEligible: false,
        finances: { expenses: 0, agentFees: 0 }, hallOfFame: null
      },
      // Current coaching contract (wave 7).
      contract: { salary: 0, years: 0, yearsLeft: 0, buyout: 0 },
      jobOffers: [],              // transient end-of-season carousel offers
      startMode: 'established',   // 'established' | 'bottom'
      // Current in-season state (season engine, wave 2).
      season: {
        started: false,
        phase: 'preseason',       // preseason|regular|confchamp|postseason|complete
        year: 2025,
        week: 0,                  // next week to play (1-based); 0 = not started
        totalRegWeeks: 13,
        seed: 0,
        schedule: [],             // global matchups: {week,home,away,homeScore,awayScore,played,conf,rivalry,neutral,tag}
        league: {},               // teamId -> {rating,w,l,cw,cl,pf,pa,champ}
        rankings: [],             // ordered teamIds (full), UI shows top 25
        postseason: {             // filled as postseason progresses
          confChamps: {}, confGames: [], cfpSeeds: [], bracket: [], bowls: [], champion: null
        },
        gamePlan: 'balanced',
        objectives: [],
        record: { wins: 0, losses: 0, confWins: 0, confLosses: 0 }
      },
      roster: [],                 // player objects (wave 4): {id,name,pos,group,year,stars,ovr,pot,dev}
      // Recruiting class + weekly effort (wave 4).
      recruiting: {
        classYear: 2026,
        points: 0,                // recruiting effort points to spend
        board: [],                // prospect objects
        commits: [],              // prospect ids committed to the player
        signed: false,
        weeksRecruited: 0
      },
      // Program resources: NIL, facilities, budget, transfer portal (wave 4).
      program: {
        offseasonPoints: 0,       // points to allocate each offseason
        nilLevel: 30,             // 0-100, boosts recruiting + retention
        facilitiesLevel: 30,      // 0-100, boosts player development
        portal: [],               // incoming transfer pool (offseason)
        departures: [],           // players who left this offseason
        signedClass: [],          // most recent signed class (for the cutscene)
        draftClass: [],           // players departing for the pro draft
        staffBudget: 0            // points for hiring assistants (wave 5)
        ,offseasonReport: null, classHistory: []
      },
      // Coaching staff cabinet + hiring market (wave 5).
      staff: {},                  // role id -> staff member object
      staffMarket: [],            // available candidates to hire
      // Compliance / scandal risk system (wave 6). A risk-vs-reward liability
      // model: temptations grant short-term gains but raise scrutiny (heat),
      // which can trigger an investigation and NCAA sanctions.
      integrity: {
        heat: 0,                  // 0-100 hidden scrutiny level
        adTrust: 60,              // 0-100 administration confidence
        underInvestigation: false,
        probation: 0,             // seasons of probation remaining
        bowlBanUntil: 0,          // banned from the postseason through this year
        scholarshipPenalty: 0,    // seasons of reduced recruiting remaining
        showCause: false,         // career-defining sanction
        fired: false,
        pendingEvent: null,       // temptation event awaiting a decision
        seenEvents: [],           // one-time event ids already used
        eventsThisSeason: 0,
        riskyThisSeason: 0,
        allegations: [],          // history of events + verdicts
        openCases: [],             // persistent multi-stage investigations
        caseHistory: [],
        pendingCaseDecision: null,
        mediaPressure: 0,
        boosterTrust: 60,
        complianceScore: 60,
        lastVerdict: null         // most recent end-of-season review result
      },
      history: [],                // season summaries
      settings: {
        sound: true,
        broadcastSpeed: 'normal',
        difficulty: 'dynasty',
        difficultyCustom: null,
        reducedMotion: false,
        scandalIntensity: 'realistic', // off | light | realistic | chaotic
        coachMode: 'full',             // full | key | decisions | sim
        recruitingAssist: 'assisted', // assisted | manual
        simPolicy: 'stop'              // stop at major story decisions
      }
    };
  }

  // ---- validation ----------------------------------------------------------
  function normalize(state) {
    var s = backfill(freshState(), migrate(state));
    // Clamp coach ratings into range.
    var r = s.coach.ratings, k;
    for (k in r) {
      if (!Object.prototype.hasOwnProperty.call(r, k)) continue;
      r[k] = Math.max(0, Math.min(100, Math.round(r[k] || 0)));
    }
    return s;
  }

  // ---- public API ----------------------------------------------------------
  var Engine = {
    SAVE_KEY: SAVE_KEY,
    SAVE_VERSION: SAVE_VERSION,
    state: null,

    freshState: freshState,
    backfill: backfill,
    makeRng: makeRng,
    hashSeed: hashSeed,
    stream: function (namespace, salt, state) {
      var s = state || this.state || {};
      return makeRng(hashSeed(s.seed || (s.world && s.world.seed) || 1, namespace, salt));
    },
    migrate: migrate,

    // Create a brand-new career from a chosen coach + team.
    newCareer: function (coach, team) {
      var s = freshState();
      s.createdAt = Date.now();
      s.seed = (Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0;
      s.world.seed = s.seed;
      s.coach = backfill(s.coach, coach || {});
      if (team) {
        s.team = { id: team.id, name: team.name, division: team.div || team.division || 'fbs' };
        s.career.year = 2025;
        s.career.jobs = [{
          teamId: team.id, startYear: s.career.year, endYear: null, wins: 0, losses: 0
        }];
        var source = s.coach.source || 'custom';
        s.career.role = s.coach.role || 'headCoach';
        var ratings = s.coach.ratings || {};
        var avg = 0, count = 0;
        Object.keys(ratings).forEach(function (key) { avg += ratings[key] || 0; count++; });
        avg = count ? avg / count : 50;
        if (source === 'custom') {
          // Created coaches are unknown first-time hires who must climb.
          s.career.reputation = 30;
          s.career.coachingAbility = Math.max(35, Math.min(55, Math.round(avg - 10)));
          s.career.nameRecognition = 10;
          s.career.fame = 5;
        } else if (source === 'legend') {
          s.career.reputation = 92;
          s.career.coachingAbility = Math.max(88, Math.round(avg));
          s.career.nameRecognition = 98;
          s.career.fame = 98;
          s.career.coachLevel = 10;
          s.career.coachXp = 9000;
        } else {
          // Current coaches retain a profile appropriate to their established career.
          s.career.reputation = Math.max(62, Math.round(avg - 8));
          s.career.coachingAbility = Math.max(65, Math.round(avg));
          s.career.nameRecognition = Math.max(60, Math.round((avg + (ratings.media || 70)) / 2));
          s.career.fame = Math.max(50, Math.round((s.career.nameRecognition + (ratings.media || 70)) / 2));
          s.career.coachLevel = Math.max(5, Math.round((avg - 45) / 7));
          s.career.coachXp = (s.career.coachLevel - 1) * 1000;
        }
      }
      s.recruiting.classYear = s.career.year + 1;
      s.screen = 'hq';
      this.state = normalize(s);
      // Generate the initial roster + recruiting board (wave 4).
      if (window.GameProgram && team) window.GameProgram.initProgram(this.state);
      if (window.GameCareer && team) window.GameCareer.initContract(this.state);
      if (window.GameStory) window.GameStory.ensure(this.state);
      return this.state;
    },

    // Move to a new program (after being fired/resigning, or later via the job
    // carousel). Keeps the coach + career totals; resets the season, roster,
    // staff, recruiting, and compliance for a fresh program.
    changeJob: function (team) {
      var s = this.state;
      if (!s || !team) return s;
      if (window.GameCases) window.GameCases.onJobChange(s);
      var job = s.career.jobs[s.career.jobs.length - 1];
      if (job && job.endYear == null) job.endYear = s.career.year;
      s.career.year++; // a season concluded; the new job begins next year
      s.team = { id: team.id, name: team.name, division: team.div || team.division || 'fbs' };
      s.career.jobs.push({ teamId: team.id, startYear: s.career.year, endYear: null, wins: 0, losses: 0 });
      var fresh = freshState();
      s.season = fresh.season; s.season.phase = 'preseason'; s.season.year = s.career.year;
      s.recruiting = fresh.recruiting;
      s.program = fresh.program;
      s.staff = {}; s.staffMarket = [];
      s.integrity = fresh.integrity;
      s.integrity.adTrust = Math.round(48 + (team.prestige || 5) * 1.5);
      s.roster = [];
      s.screen = 'hq';
      this.state = normalize(s);
      if (window.GameProgram) window.GameProgram.initProgram(this.state);
      if (window.GameCareer) window.GameCareer.initContract(this.state);
      return this.state;
    },

    // Serialize current state to a JSON string.
    serialize: function () {
      return JSON.stringify(this.state);
    },

    // Parse + backfill an arbitrary saved object/string into valid state.
    deserialize: function (raw) {
      var obj = raw;
      if (typeof raw === 'string') {
        try { obj = JSON.parse(raw); } catch (e) { obj = null; }
      }
      if (!isPlainObject(obj)) return null;
      this.state = normalize(obj);
      return this.state;
    },

    save: function () {
      try {
        localStorage.setItem(SAVE_KEY, this.serialize());
        if (window.GameSaves) window.GameSaves.autosave(this.state);
        return true;
      } catch (e) { return false; }
    },

    load: function () {
      try {
        var raw = localStorage.getItem(SAVE_KEY);
        if (!raw) return null;
        return this.deserialize(raw);
      } catch (e) { return null; }
    },

    hasSave: function () {
      try { return !!localStorage.getItem(SAVE_KEY); } catch (e) { return false; }
    },

    clearSave: function () {
      try { localStorage.removeItem(SAVE_KEY); } catch (e) {}
      this.state = null;
    },

    // Overall "team rating" derived from coach ratings + program prestige.
    // Used as a placeholder power number until the roster sim lands (wave 2/3).
    teamPower: function (team, coach) {
      var prestige = (team && team.prestige) || 5;
      var c = coach && coach.ratings ? coach.ratings : null;
      var coachAvg = c
        ? (c.offense + c.defense + c.development + c.discipline + c.motivation) / 5
        : 50;
      return Math.round(prestige * 6 + coachAvg * 0.4); // ~ 30-90 scale
    }
  };

  window.GameEngine = Engine;
})();
