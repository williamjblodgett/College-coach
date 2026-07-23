/* GRIDIRON DYNASTY 2.0 - persistent evolving programs, coaches, rivalries, news, and realignment. */
(function () {
  'use strict';
  var E=window.GameEngine,T=window.TeamData;
  var STRATEGIES=['recruiting','development','portal','offense','defense','stability'];
  function clamp(v,lo,hi){return Math.max(lo,Math.min(hi,v));}
  function ensure(state){
    var w=state.world||(state.world={seed:state.seed||1,era:1,news:[],records:{}});
    w.programs=w.programs||{};w.coaches=w.coaches||{};w.rivalries=w.rivalries||{};w.realignment=w.realignment||[];
    var rng=E.stream('world-programs','foundation',state);
    T.all().forEach(function(team){
      if(team._basePrestige==null)team._basePrestige=team.prestige;
      if(team._baseConf==null)team._baseConf=team.conf;
      team.conf=team._baseConf;
      var startingPower=window.CurrentPower?window.CurrentPower.rating(team):clamp(Math.round(38+team._basePrestige*5.5),35,99);
      var p=w.programs[team.id]||(w.programs[team.id]={basePrestige:team._basePrestige,prestige:team._basePrestige,power:startingPower,strategy:STRATEGIES[Math.floor(rng()*STRATEGIES.length)],resources:clamp(Math.round(team._basePrestige*9+rng()*12),15,98),momentum:0});
      if(p.power==null)p.power=startingPower;
      team.prestige=p.prestige;
      if(!w.coaches[team.id]&&team.id!==state.team.id)w.coaches[team.id]={name:window.NameData.make(rng),rating:45+Math.floor(rng()*40),years:1,archetype:p.strategy};
    });
    // Conference membership is mutable world history, so replay saved moves
    // after the static team catalog is rebuilt on every page load.
    w.realignment.forEach(function(move){var up=T.get(move.up),down=T.get(move.down);if(up)up.conf=move.to;if(down)down.conf=move.from;});
    return w;
  }
  function news(state,kind,headline,detail,teamId){var w=ensure(state);w.news.unshift({id:state.career.year+'-'+kind+'-'+w.news.length,year:state.career.year,week:state.season.week||0,kind:kind,headline:headline,detail:detail||'',teamId:teamId||null});w.news=w.news.slice(0,160);}
  var World={
    STRATEGIES:STRATEGIES,ensure:ensure,news:news,
    onSeasonStart:function(state){var w=ensure(state);Object.keys(w.coaches).forEach(function(id){w.coaches[id].years=(w.coaches[id].years||0)+1;});return w;},
    finishSeason:function(state,summary){
      var w=ensure(state),league=state.season.league||{},year=state.career.year,rng=E.stream('world-offseason',year,state);
      Object.keys(league).forEach(function(id){var p=w.programs[id],team=T.get(id);if(!p||!team)return;var expected=clamp(Math.round(p.prestige*.9+1),3,11),over=league[id].w-expected;p.momentum=clamp(Math.round((p.momentum||0)*.5+over*4),-30,30);p.power=clamp(Math.round((p.power||league[id].rating)*.82+league[id].rating*.1+(league[id].w-league[id].l)*.65),38,99);if(id===state.team.id)return;if(over>=4&&rng()<.45)p.prestige=clamp(p.prestige+1,1,10);if(over<=-4&&rng()<.4)p.prestige=clamp(p.prestige-1,1,10);team.prestige=p.prestige;});
      var my=T.get(state.team.id);if(summary.wonNatl){news(state,'championship',my.name+' stands alone','The national championship reshapes the sport.',my.id);}else if(summary.wins>=10)news(state,'season',my.name+' breaks through',summary.wins+' wins have changed expectations.',my.id);else news(state,'season',my.name+' closes the book on '+year,summary.wins+'-'+summary.losses+' sets the stage for a defining offseason.',my.id);
      var ids=Object.keys(league).filter(function(id){return id!==state.team.id;});
      for(var i=0;i<Math.min(6,ids.length);i++){var id=ids[Math.floor(rng()*ids.length)],entry=league[id],coach=w.coaches[id],team=T.get(id);if(!coach||!team)continue;var exp=clamp(Math.round(w.programs[id].prestige*.9+1),3,11);if(entry.w<=exp-3||rng()<.018){var old=coach.name;w.coaches[id]={name:window.NameData.make(rng),rating:42+Math.floor(rng()*45),years:0,archetype:STRATEGIES[Math.floor(rng()*STRATEGIES.length)]};news(state,'coaching',team.name+' changes direction',old+' is out; '+w.coaches[id].name+' takes over.',id);}}
      (state.season.schedule||[]).filter(function(g){return g.rivalry&&g.played;}).forEach(function(g){var key=[g.home,g.away].sort().join('|'),r=w.rivalries[key]||(w.rivalries[key]={teams:[g.home,g.away],games:0,wins:{}});r.games++;r.wins[g.winner]=(r.wins[g.winner]||0)+1;r.last={year:year,winner:g.winner,homeScore:g.homeScore,awayScore:g.awayScore};});
      if(year>2025&&(year-2025)%4===0)World.realign(state,rng);
      var recs=w.records||(w.records={});function setRec(key,value,label){if(!recs[key]||value>recs[key].value)recs[key]={value:value,player:label,teamId:state.team.id,year:year};}
      setRec('coachCareerWins',state.career.wins,(state.coach&&state.coach.name)||'Coach');setRec('seasonWins',summary.wins,(state.coach&&state.coach.name)||'Coach');setRec('recruitingClass',(state.program.classHistory&&state.program.classHistory.length?state.program.classHistory[state.program.classHistory.length-1].score:0),(state.coach&&state.coach.name)||'Coach');
      var pointDiff=(state.season.schedule||[]).filter(function(g){return g.played&&(g.home===state.team.id||g.away===state.team.id);}).reduce(function(m,g){return Math.max(m,Math.abs(g.homeScore-g.awayScore));},0);setRec('largestMargin',pointDiff,(state.coach&&state.coach.name)||'Coach');
      summary.worldNews=w.news.slice(0,8);return w;
    },
    realign:function(state,rng){var w=ensure(state),powers=['SEC','Big Ten','ACC','Big 12'],candidates=T.byDivision('fbs').filter(function(t){return powers.indexOf(t.conf)<0;}).sort(function(a,b){return w.programs[b.id].prestige-w.programs[a.id].prestige;}),target=powers[Math.floor(rng()*powers.length)],bottom=T.byConference(target).sort(function(a,b){return w.programs[a.id].prestige-w.programs[b.id].prestige;})[0],up=candidates[0];if(!up||!bottom)return null;var old=up.conf;up.conf=target;bottom.conf=old;var move={year:state.career.year,up:up.id,down:bottom.id,from:old,to:target};w.realignment.push(move);news(state,'realignment',up.name+' joins the '+target,bottom.name+' moves to the '+old+'.',up.id);return move;},
    strategyEffect:function(state,teamId){var p=ensure(state).programs[teamId],team=T.get(teamId);if(!p||!team)return {rating:0,strategy:'stability'};var legacy=38+team.prestige*5.5;return {rating:Math.round((p.power-legacy)+(p.resources-50)*.025+p.momentum*.04),strategy:p.strategy};}
  };
  window.GameWorld=World;if(window.GameRegistry)window.GameRegistry.register('system','world',World);
})();
