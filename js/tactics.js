/* GRIDIRON DYNASTY 2.0 - weekly game plans and deterministic stadium weather. */
(function () {
  'use strict';
  var E=window.GameEngine,T=window.TeamData;
  var PLANS={
    balanced:{name:'Balanced',desc:'Stay multiple and avoid giving the opponent an obvious tendency.',off:0,def:0,special:1,tempo:'normal'},
    airRaid:{name:'Air Raid',desc:'Spread the field and chase explosive passes; vulnerable in bad weather.',off:3,def:-1,special:0,tempo:'hurry'},
    ground:{name:'Ground Control',desc:'Lean on the run game, shorten the night, and protect a tired defense.',off:2,def:1,special:0,tempo:'milk'},
    pressure:{name:'Pressure Package',desc:'Attack protections and create negative plays at the cost of big-play risk.',off:-1,def:3,special:0,tempo:'normal'},
    field:{name:'Field Position',desc:'Conservative offense, sound defense, and a special-teams edge.',off:-1,def:2,special:4,tempo:'milk'}
  };
  function weather(state,game){
    var home=T.get(game.home)||{},rng=E.stream('weather',(state.career.year||2025)+':'+game.week+':'+game.home,state);
    var cold=['ME','NH','NY','PA','MI','MN','ND','MT','WI','IA','OH','CO','WY'].indexOf(home.st)>=0;
    var hot=['FL','GA','AL','MS','LA','TX','AZ'].indexOf(home.st)>=0;
    var roll=rng(),kind=roll<.1?'Rain':(cold&&roll<.25?'Snow':(roll>.91?'Windy':'Clear'));
    var temp=Math.round((cold?46:(hot?76:62))+(rng()-.5)*26);
    return {kind:kind,temp:temp,wind:kind==='Windy'?Math.round(14+rng()*17):Math.round(2+rng()*10),impact:kind==='Rain'?-2:(kind==='Snow'?-3:(kind==='Windy'?-2:0))};
  }
  var Tactics={PLANS:PLANS,
    ensure:function(state){state.season.gamePlan=state.season.gamePlan||'balanced';return state.season.gamePlan;},
    prepareSchedule:function(state){Tactics.ensure(state);(state.season.schedule||[]).forEach(function(g){g.weather=g.weather||weather(state,g);});},
    setPlan:function(state,id){state.season.gamePlan=PLANS[id]?id:'balanced';return state.season.gamePlan;},
    apply:function(state,cfg){var plan=PLANS[Tactics.ensure(state)],g=window.GameSeason&&window.GameSeason.playerWeekGame(state),w=g&&g.weather||{impact:0,kind:'Clear'};cfg.off+=plan.off;cfg.def+=plan.def;cfg.special=(cfg.special||58)+plan.special;if(plan.id==='airRaid'&&w.impact)cfg.off+=w.impact;return {config:cfg,tempo:plan.tempo,plan:plan,weather:w};},
    forecast:weather
  };
  Object.keys(PLANS).forEach(function(id){PLANS[id].id=id;});
  window.GameTactics=Tactics;if(window.GameRegistry)window.GameRegistry.register('system','tactics',Tactics);
})();
