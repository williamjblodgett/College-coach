/* GRIDIRON DYNASTY — coaches.js
 * window.CoachData: playable head coaches across two roster tabs (Real / Legends)
 * plus the create-a-coach builder config (backgrounds + points pool).
 * Ratings are 0-100 BALANCE-ONLY game stats, not a real-world evaluation.
 * Bios are brief, factual-flavor descriptors.
 * Skill keys: recruiting, offense, defense, development, discipline, motivation, media
 */
(function () {
  'use strict';

  function C(id, name, tab, archetype, bio, r) {
    return {
      id: id, name: name, tab: tab, source: tab, archetype: archetype, bio: bio,
      avatar: '🧢', color: '#c8102e',
      ratings: {
        recruiting: r[0], offense: r[1], defense: r[2], development: r[3],
        discipline: r[4], motivation: r[5], media: r[6]
      }
    };
  }

  // ---- Real active coaches (balance ratings) ----
  var real = [
    C('kirby','Kirby Smart','real','Recruiter','Elite recruiter and defensive builder of a modern powerhouse.',[95,78,92,88,86,84,80]),
    C('saban','Nick Saban','legend','CEO','The gold standard: process, dynasties, and championship pedigree.',[97,86,95,94,95,90,88]),
    C('dabo','Dabo Swinney','real','Motivator','Program-culture evangelist who turned a job into a juggernaut.',[88,84,86,90,84,95,90]),
    C('ryanday','Ryan Day','real','Offense','Offensive architect with a QB-factory reputation.',[90,94,80,84,80,80,82]),
    C('lanekiffin','Lane Kiffin','real','Offense','Aggressive play-caller and portal maximizer with media flair.',[86,93,74,80,66,82,95]),
    C('debord','Steve Sarkisian','real','Offense','QB whisperer and polished offensive mind.',[85,93,78,86,80,82,84]),
    C('briankelly','Brian Kelly','real','CEO','Program-builder with a long track record of winning.',[84,82,82,86,84,80,78]),
    C('marcus','Marcus Freeman','real','Motivator','Young, magnetic leader and strong recruiter.',[90,80,86,84,86,92,86]),
    C('deion','Deion Sanders','real','Media','Culture-shifting, spotlight-drawing program transformer.',[92,78,80,78,72,94,99]),
    C('jamesfranklin','James Franklin','real','Recruiter','Relentless recruiter who keeps a blue blood stocked.',[90,78,84,84,82,84,82]),
    C('mattrhule','Matt Rhule','real','CEO','Turnaround specialist who rebuilds broken programs.',[84,80,80,88,84,84,80]),
    C('jeffbrohm','Jeff Brohm','real','Offense','Inventive offensive mind revitalizing his alma mater.',[80,92,74,82,78,82,80]),
    C('joshheupel','Josh Heupel','real','Offense','Tempo-and-verticals offensive schemer.',[82,92,74,82,78,82,78]),
    C('kalenboard','Kalen DeBoer','real','Offense','Balanced builder who wins fast at every stop.',[85,88,80,86,82,84,80]),
    C('curttcin','Curt Cignetti','real','CEO','Blunt, proven winner who elevates programs quickly.',[82,84,82,86,82,86,82]),
    C('mikenorvell','Mike Norvell','real','Offense','Detail-driven offensive coach and portal builder.',[83,88,78,82,80,80,78]),
    C('bretbielema','Bret Bielema','real','Defense','Physical, old-school program-builder.',[80,76,84,84,84,80,76]),
    C('dandonnell','Dan Lanning','real','Defense','Fiery defensive leader and top-tier recruiter.',[91,80,90,84,84,92,84]),
    C('sonnydykes','Sonny Dykes','real','Offense','Air-raid tactician who overachieves in big games.',[80,90,74,82,78,80,80]),
    C('mikegundy','Mike Gundy','real','CEO','Steady long-tenure program stabilizer.',[80,84,80,84,80,80,80]),
    C('chrisklieman','Chris Klieman','real','Development','Player-developer who wins with less.',[80,80,82,88,84,82,78]),
    C('mattcamp','Matt Campbell','real','Development','Culture-and-development builder at a hard job.',[80,82,82,88,84,84,80]),
    C('willie','Willie Fritz','real','Development','Program-fixer known for tough, efficient teams.',[78,80,80,86,84,80,76]),
    C('jamey','Jamey Chadwell','real','Offense','Creative option-offense innovator at the Group of Five.',[78,88,74,82,80,82,78]),
    C('jasoncandle','Jason Candle','real','Development','Steady Group-of-Five program-builder.',[74,80,78,84,82,80,74]),
    C('lincolnriley','Lincoln Riley','real','Offense','Offensive savant and quarterback developer.',[89,95,74,84,78,82,86]),
    C('mariocristobal','Mario Cristobal','real','Recruiter','Physical, elite-recruiting program-builder.',[92,78,82,84,84,86,82]),
    C('brentvenables','Brent Venables','real','Defense','Fiery defensive mastermind.',[88,76,93,82,84,90,80]),
    C('kylewhittingham','Kyle Whittingham','real','Defense','Tough, disciplined long-tenured winner.',[80,78,90,86,88,84,76]),
    C('lukefickell','Luke Fickell','real','CEO','Program-builder who develops and wins.',[84,80,84,86,84,84,80]),
    C('hughfreeze','Hugh Freeze','real','Offense','Creative offensive mind and sharp recruiter.',[86,90,74,80,72,82,84]),
    C('mikeelko','Mike Elko','real','Defense','Defensive strategist turning around a big job.',[84,78,88,84,84,84,80]),
    C('lanceleipold','Lance Leipold','real','Development','Master rebuilder and player-developer.',[80,82,80,90,86,84,78])
  ];

  // ---- Legends ----
  var legends = [
    C('bearbryant','Bear Bryant','legend','CEO','Houndstooth legend; the measuring stick for the sport.',[92,84,90,92,96,96,86]),
    C('bobby','Bobby Bowden','legend','Motivator','Beloved builder of a dynasty from nothing.',[92,88,82,90,86,96,90]),
    C('joepa','Joe Paterno','legend','CEO','Record-setting tenure and "Grand Experiment" ideals.',[86,80,88,90,92,88,80]),
    C('woody','Woody Hayes','legend','Discipline','Three-yards-and-a-cloud-of-dust intensity.',[84,74,90,86,96,92,74]),
    C('bo','Bo Schembechler','legend','Discipline','Toughness-first icon of a storied rivalry.',[84,78,88,86,94,92,76]),
    C('tomosborne','Tom Osborne','legend','Development','Option-offense mastermind and program pillar.',[88,90,84,92,90,86,80]),
    C('barryswitzer','Barry Switzer','legend','Recruiter','Wishbone wizard and charismatic recruiter.',[94,90,80,86,74,90,88]),
    C('lousholtz','Lou Holtz','legend','Motivator','Master motivator and turnaround artist.',[86,82,82,86,86,96,90]),
    C('urban','Urban Meyer','legend','CEO','Spread-offense innovator with multiple titles.',[92,92,84,88,84,88,84]),
    C('petecarroll','Pete Carroll','legend','Motivator','Energy-and-competition culture-builder.',[92,88,86,88,80,94,88]),
    C('spurrier','Steve Spurrier','legend','Offense','The Head Ball Coach; passing-game revolutionary.',[86,95,74,82,78,84,94]),
    C('joebordanet','Frank Beamer','legend','Defense','Special-teams and defense identity ("Beamer Ball").',[82,74,90,86,88,88,82]),
    C('mackbrown','Mack Brown','legend','Recruiter','Ace recruiter and relationship-driven program leader.',[94,82,82,84,82,88,88]),
    C('leroy','Eddie Robinson','legend','Development','Trailblazing all-time wins leader and developer of men.',[86,82,84,94,92,94,82]),
    C('joejoe','John Gagliardi','legend','Development','Winningest coach ever; the no-tackling-in-practice sage.',[80,84,82,96,88,88,78]),
    C('darrell','Darrell Royal','legend','CEO','Wishbone pioneer and dignified program leader.',[86,86,84,88,90,86,82])
  ];

  // Named coaches use an explicit identity-to-cell mapping. Custom coaches
  // continue to use the generic portrait builder sheet below.
  real.forEach(function (coach, i) {
    if (i < 16) { coach.portraitSheet = 'coach-active-a.jpg'; coach.portrait = i; }
    else if (i < 32) { coach.portraitSheet = 'coach-active-b.jpg'; coach.portrait = i - 16; }
    else { coach.portraitFile = 'coach-lance.jpg'; coach.portrait = 0; }
  });
  legends.forEach(function (coach, i) {
    coach.portraitSheet = 'coach-legends.jpg'; coach.portrait = i;
    if (coach.id === 'joepa') { coach.portraitSheet = null; coach.portraitFile = 'coaches/joepa.jpg'; }
  });

  // ---- Create-a-coach config ----
  var backgrounds = [
    { id: 'qbguru', name: 'QB Guru', blurb: 'Made your name developing quarterbacks.',
      bonus: { offense: 8, development: 4 } },
    { id: 'defmind', name: 'Defensive Mind', blurb: 'A coordinator feared for your schemes.',
      bonus: { defense: 8, discipline: 4 } },
    { id: 'ceo', name: 'The CEO', blurb: 'A manager of people and programs.',
      bonus: { discipline: 5, media: 4, development: 3 } },
    { id: 'recruiter', name: 'Ace Recruiter', blurb: 'You win December before September.',
      bonus: { recruiting: 8, motivation: 4 } },
    { id: 'riser', name: 'The Riser', blurb: 'A hungry up-and-comer with something to prove.',
      bonus: { motivation: 6, media: 3, development: 3 } }
  ];

  var avatars = ['🧢','🎯','🧠','🔥','⚡','🦅','🐺','🎓','📋','🥇','😎','🧊'];
  var colors = ['#c8102e','#0033a0','#154733','#ff8200','#4d1979','#000000','#f1b82d','#00b140'];

  var CoachData = {
    real: real,
    legends: legends,
    backgrounds: backgrounds,
    avatars: avatars,
    colors: colors,
    SKILLS: ['recruiting','offense','defense','development','discipline','motivation','media'],
    SKILL_LABEL: {
      recruiting: 'Recruiting', offense: 'Offense', defense: 'Defense',
      development: 'Development', discipline: 'Discipline', motivation: 'Motivation', media: 'Media'
    },
    // Create-a-coach pool: base value per skill + this many points to spend.
    BUILDER_BASE: 40,
    BUILDER_POOL: 90,
    BUILDER_MIN: 30,
    BUILDER_MAX: 95,

    get: function (id) {
      var pools = real.concat(legends);
      for (var i = 0; i < pools.length; i++) if (pools[i].id === id) return pools[i];
      return null;
    },
    background: function (id) {
      for (var i = 0; i < backgrounds.length; i++) if (backgrounds[i].id === id) return backgrounds[i];
      return null;
    }
  };

  window.CoachData = CoachData;
})();
