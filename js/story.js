/* GRIDIRON DYNASTY 2.0 - coach roles, relationships, badges, and press conferences. */
(function () {
  'use strict';
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  var BADGES = [
    { id:'giant-killer', name:'Giant Killer', desc:'Beat elite programs from below.', test:function(s,x){ return x.wins >= 10 && (window.TeamData.get(s.team.id).prestige || 5) <= 4; }, effects:{ profile:4, motivation:2 } },
    { id:'program-builder', name:'Program Builder', desc:'Win consistently at one school.', test:function(s){ var j=s.career.jobs[s.career.jobs.length-1]; return j && j.wins >= 28; }, effects:{ profile:5, development:2 } },
    { id:'clean-program', name:'Clean Program', desc:'Win without inviting scrutiny.', test:function(s,x){ return x.wins >= 8 && s.integrity.heat < 20; }, effects:{ profile:2, recruiting:2 } },
    { id:'media-darling', name:'Media Darling', desc:'Build a national public profile.', test:function(s){ return s.career.fame >= 70 && s.career.relationships.media >= 70; }, effects:{ profile:4, recruiting:1 } },
    { id:'champion', name:'Champion', desc:'Win the national championship.', test:function(s,x){ return !!x.wonNatl; }, effects:{ profile:10, motivation:4 } }
  ];
  var PRESSERS = {
    win: { id:'win', title:'Postgame Podium', prompt:'Your team delivered. Who gets the credit?', options:[
      {id:'players',label:'Credit the players',desc:'Build the locker room.',fx:{players:5,media:1,morale:3}},
      {id:'staff',label:'Credit the staff',desc:'Strengthen the coaching room.',fx:{staff:5,media:1}},
      {id:'standard',label:'Set a higher standard',desc:'Turn attention to the next challenge.',fx:{players:-1,ad:2,recognition:2}}
    ]},
    loss: { id:'loss', title:'Questions After a Loss', prompt:'The pressure is on. How do you answer?', options:[
      {id:'blame-self',label:'Take responsibility',desc:'Protect the team and absorb the criticism.',fx:{players:4,media:3,ad:-1}},
      {id:'challenge',label:'Challenge the roster',desc:'Demand more, at a morale cost.',fx:{players:-4,ad:2,ability:1}},
      {id:'officials',label:'Question the officiating',desc:'Deflect blame and create a headline.',fx:{media:-4,fame:2,heat:3}}
    ]},
    upset: { id:'upset', title:'The Nation Is Watching', prompt:'A defining win has put your name everywhere.', options:[
      {id:'believe',label:'We expected to win',desc:'Project confidence and raise expectations.',fx:{recognition:5,fame:4,players:2}},
      {id:'underdog',label:'Embrace the underdog story',desc:'Become the season’s feel-good program.',fx:{media:6,fame:3,recruiting:6}},
      {id:'quiet',label:'Keep it inside the building',desc:'Protect focus and lower the temperature.',fx:{players:4,ad:3}}
    ]},
    rivalry:{id:'rivalry',title:'Rivalry Week Microphones',prompt:'This result will live all year. What defines the rivalry now?',options:[{id:'respect',label:'Respect the rival',desc:'Cool the temperature and build credibility.',fx:{media:3,ad:2}},{id:'claim',label:'Claim the state',desc:'Turn the win into recruiting momentum.',fx:{fame:3,recruiting:5}},{id:'fire',label:'Pour fuel on it',desc:'Energize fans and raise scrutiny.',fx:{boosters:4,heat:3}}]},
    streak:{id:'streak',title:'The Streak Defines the Season',prompt:'The questions are now about pressure, not one result.',options:[{id:'routine',label:'Keep the routine',desc:'Steady the locker room.',fx:{players:3,ad:1}},{id:'embrace',label:'Embrace expectations',desc:'Raise the national profile.',fx:{fame:3,recognition:3}},{id:'shield',label:'Shield the team',desc:'Take the pressure yourself.',fx:{media:2,players:2}}]},
    hotseat:{id:'hotseat',title:'Questions About Your Future',prompt:'The program is sliding and the job questions are direct.',options:[{id:'own',label:'Own the record',desc:'Protect trust with accountability.',fx:{ad:3,media:2}},{id:'plan',label:'Promise changes',desc:'Raise expectations for the next month.',fx:{ad:2,ability:1}},{id:'deflect',label:'Attack the premise',desc:'Rally loyalists but alienate media.',fx:{boosters:3,media:-5}}]},
    playoff:{id:'playoff',title:'Playoff Pressure Arrives',prompt:'The season has become a referendum on championships.',options:[{id:'standard',label:'This is the standard',desc:'Project a championship culture.',fx:{recognition:4,fame:2}},{id:'moment',label:'Enjoy the moment',desc:'Keep players loose.',fx:{players:4,morale:3}},{id:'business',label:'Treat it as business',desc:'Strengthen staff focus.',fx:{staff:4,ad:2}}]}
  };
  function ensure(state) {
    var c=state.career;
    c.role=c.role||'headCoach'; c.badges=c.badges||[];
    c.relationships=c.relationships||{players:60,staff:60,boosters:55,media:50,ad:60};
    c.pressHistory=c.pressHistory||[]; c.pendingPress=c.pendingPress||null;
    return c;
  }
  var Story = {
    BADGES:BADGES, PRESSERS:PRESSERS, ensure:ensure,
    roleLabel:function(role){return {oc:'Offensive Coordinator',dc:'Defensive Coordinator',assistant:'Assistant Coach',headCoach:'Head Coach'}[role]||'Head Coach';},
    effects:function(state){ var out={profile:0,recruiting:0,development:0,motivation:0}; ensure(state).badges.forEach(function(id){var b=BADGES.filter(function(x){return x.id===id;})[0];if(!b)return;Object.keys(b.effects).forEach(function(k){out[k]=(out[k]||0)+b.effects[k];});});return out;},
    afterGame:function(state,game){
      var c=ensure(state); if(c.pendingPress||!game)return null;
      var mine=game.home===state.team.id?game.homeScore:game.awayScore, opp=game.home===state.team.id?game.awayScore:game.homeScore;
      var myTeam=window.TeamData.get(state.team.id), oppTeam=window.TeamData.get(game.home===state.team.id?game.away:game.home);
      c.pressSeasonCount=c.pressSeasonYear===state.career.year?(c.pressSeasonCount||0):0;c.pressSeasonYear=state.career.year;
      if(c.pressSeasonCount>=6)return null;
      var kind=mine>opp?'win':'loss'; if(game.rivalry)kind='rivalry';else if(mine>opp&&oppTeam&&myTeam&&oppTeam.prestige-myTeam.prestige>=3)kind='upset';else if(state.season.record.wins>=8&&mine>opp)kind='streak';else if(state.season.record.losses>=5)kind='hotseat';
      var meaningful=game.rivalry||kind==='upset'||kind==='streak'||kind==='hotseat'||state.season.week===1||state.season.week>=12;if(!meaningful)return null;c.pressSeasonCount++;
      c.pendingPress={kind:kind,week:state.season.week};return PRESSERS[kind];
    },
    pending:function(state){var c=ensure(state);return c.pendingPress?PRESSERS[c.pendingPress.kind]:null;},
    resolvePress:function(state,optionId){var c=ensure(state),ev=Story.pending(state);if(!ev)return null;var o=ev.options.filter(function(x){return x.id===optionId;})[0];if(!o)return null;var fx=o.fx||{},r=c.relationships;
      ['players','staff','boosters','media','ad'].forEach(function(k){if(fx[k])r[k]=clamp(r[k]+fx[k],0,100);});
      if(fx.recognition)c.nameRecognition=clamp(c.nameRecognition+fx.recognition,0,100);if(fx.fame)c.fame=clamp(c.fame+fx.fame,0,100);if(fx.ability)c.coachingAbility=clamp(c.coachingAbility+fx.ability,20,99);
      if(fx.heat)state.integrity.heat=clamp(state.integrity.heat+fx.heat,0,100);if(fx.recruiting)state.recruiting.points+=fx.recruiting;
      if(fx.morale)(state.roster||[]).forEach(function(p){p.morale=clamp((p.morale||70)+fx.morale,0,100);});
      c.pressHistory.push({year:c.year,week:c.pendingPress.week,event:ev.id,choice:o.id});c.pendingPress=null;return {event:ev,option:o};
    },
    evaluateBadges:function(state,summary){var c=ensure(state),earned=[];BADGES.forEach(function(b){if(c.badges.indexOf(b.id)<0&&b.test(state,summary)){c.badges.push(b.id);earned.push(b);}});summary.badgesEarned=earned;return earned;}
  };
  window.GameStory=Story;
  if(window.GameRegistry){window.GameRegistry.registerAll('badge',BADGES);window.GameRegistry.registerAll('press',Object.keys(PRESSERS).map(function(k){return PRESSERS[k];}));}
})();
