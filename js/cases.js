/* GRIDIRON DYNASTY - persistent investigations, hearings, appeals, and redemption. */
(function () {
  'use strict';
  var E=window.GameEngine;
  function clamp(v,lo,hi){return Math.max(lo,Math.min(hi,v));}
  function ensure(state){
    var i=state.integrity;
    i.openCases=i.openCases||[];i.caseHistory=i.caseHistory||[];i.pendingCaseDecision=i.pendingCaseDecision||null;
    i.mediaPressure=i.mediaPressure||0;i.boosterTrust=i.boosterTrust==null?60:i.boosterTrust;i.complianceScore=i.complianceScore==null?60:i.complianceScore;
    state.career.ethicsHistory=state.career.ethicsHistory||[];state.career.redemption=state.career.redemption||0;state.career.caseCloud=state.career.caseCloud||0;
    return i;
  }
  function active(state,id){return ensure(state).openCases.filter(function(c){return c.id===id;})[0]||null;}
  function headline(state,kind,title,detail){if(window.GameWorld)window.GameWorld.news(state,kind,title,detail,state.team.id);}
  function decision(c){
    if(c.stage==='response')return {caseId:c.id,phase:'response',title:'Respond to the Allegation',prompt:c.title+' has become a formal inquiry. Set the program response.',options:[
      {id:'disclose',label:'Self-report everything',desc:'Lose control of the story, but reduce evidence risk and rebuild trust.'},
      {id:'counsel',label:'Hire outside counsel',desc:'Spend $0.5M for a careful independent response.'},
      {id:'stonewall',label:'Deny and fight',desc:'Protect boosters and momentum now; exposure becomes more damaging.',risky:true}
    ]};
    if(c.stage==='discovery')return {caseId:c.id,phase:'discovery',title:'Discovery and Interviews',prompt:'Investigators want records and staff interviews. The paper trail is growing.',options:[
      {id:'cooperate',label:'Full cooperation',desc:'Lower case risk, but the process raises public pressure.'},
      {id:'limited',label:'Limit the scope',desc:'Protect the program while accepting some suspicion.'},
      {id:'records',label:'Hide damaging records',desc:'A major short-term gamble; obstruction evidence can end a career.',risky:true}
    ]};
    if(c.stage==='hearing')return {caseId:c.id,phase:'hearing',title:'Committee Hearing',prompt:'The case is ready for judgment. Choose the program strategy.',options:[
      {id:'accept',label:'Negotiate penalties',desc:'Accept responsibility and reduce the ceiling of the punishment.'},
      {id:'contest',label:'Contest every charge',desc:'A clean win is possible, but so is a harsher ruling.',risky:true},
      {id:'staff',label:'Blame the staff',desc:'Reduce your exposure while devastating staff trust.',risky:true}
    ]};
    return null;
  }
  function schedule(state,c,weeks){c.nextWeek=(state.season.week||1)+(weeks||1);ensure(state).pendingCaseDecision=null;}
  function finalize(state,c){
    var i=ensure(state);c.closedYear=state.career.year;c.closedWeek=state.season.week;c.status='closed';
    i.openCases=i.openCases.filter(function(x){return x.id!==c.id;});i.caseHistory.unshift(c);i.caseHistory=i.caseHistory.slice(0,40);
    state.career.ethicsHistory.unshift({year:c.closedYear,teamId:state.team.id,title:c.title,severity:c.verdict&&c.verdict.severity||'cleared',appeal:c.appeal||null});
    state.career.ethicsHistory=state.career.ethicsHistory.slice(0,80);
  }
  function resolveCase(state,c,approach){
    var i=ensure(state),rng=E.stream('case-hearing',c.id+':'+approach,state),score=c.evidence*18+i.mediaPressure*.28+i.heat*.26-i.complianceScore*.18;
    if(approach==='accept')score-=16;
    if(approach==='contest')score+=(rng()-.46)*42;
    if(approach==='staff'){score-=8;Object.keys(state.staff||{}).forEach(function(k){state.staff[k].loyalty=clamp(state.staff[k].loyalty-16,10,99);});}
    var severity=score<12?'cleared':score<34?'secondary':score<67?'major':'severe';
    var verdict={year:state.career.year,investigated:true,severity:severity,sanctions:[],fired:false,caseId:c.id};
    window.GameScandal.applySanctions(state,severity,verdict);c.verdict=verdict;
    if(severity==='major'&&!verdict.fired){c.stage='appeal';i.pendingCaseDecision={caseId:c.id,phase:'appeal',title:'Appeal the Ruling',prompt:'Major penalties were imposed. The program has one chance to appeal.',options:[
      {id:'accept',label:'Accept the ruling',desc:'End the case and begin rebuilding.'},
      {id:'appeal',label:'File an appeal',desc:'Spend $0.5M. Strong compliance and full cooperation improve the odds.'}
    ]};return verdict;}
    finalize(state,c);headline(state,'investigation',c.title+' reaches a verdict',severity==='cleared'?'The program was cleared.':('The committee issued a '+severity+' ruling.'));return verdict;
  }
  var Cases={
    ensure:ensure,
    openCase:function(state,source,title,category,evidence){var i=ensure(state),id='case-'+state.career.year+'-'+(state.season.week||0)+'-'+(i.caseHistory.length+i.openCases.length+1),c={id:id,source:source,title:title,category:category||'Compliance',openedYear:state.career.year,openedWeek:state.season.week||0,status:'open',stage:'response',evidence:clamp(evidence||1,1,5),choices:[],nextWeek:state.season.week||1};i.openCases.push(c);headline(state,'investigation','Inquiry opened at '+state.team.name,title+' has moved into a formal review.');return c;},
    onScandalChoice:function(state,ev,opt){var i=ensure(state);if(!opt.risky)return null;var rng=E.stream('case-open',state.career.year+':'+state.season.week+':'+ev.id,state),chance=.16+i.heat*.006+i.mediaPressure*.003;if(rng()>clamp(chance,.12,.82))return null;return Cases.openCase(state,ev.id,ev.title,ev.category,1+Math.floor(i.heat/35));},
    pending:function(state){return ensure(state).pendingCaseDecision;},
    advanceWeek:function(state){var i=ensure(state);if(i.pendingCaseDecision)return i.pendingCaseDecision;i.mediaPressure=clamp(i.mediaPressure-1,0,100);for(var n=0;n<i.openCases.length;n++){var c=i.openCases[n];if((c.nextWeek||0)<=state.season.week){i.pendingCaseDecision=decision(c);return i.pendingCaseDecision;}}return null;},
    resolve:function(state,optionId){var i=ensure(state),p=i.pendingCaseDecision,c=p&&active(state,p.caseId);if(!p||!c)return null;var choice={year:state.career.year,week:state.season.week,phase:p.phase,choice:optionId};c.choices.push(choice);
      if(p.phase==='response'){if(optionId==='disclose'){c.evidence=clamp(c.evidence-1,0,9);i.complianceScore=clamp(i.complianceScore+10,0,100);i.adTrust=clamp(i.adTrust+5,0,100);state.career.reputation=clamp(state.career.reputation-2,0,100);}else if(optionId==='counsel'){state.career.wallet=Math.max(0,(state.career.wallet||0)-.5);c.evidence=clamp(c.evidence-1,0,9);i.complianceScore=clamp(i.complianceScore+4,0,100);}else{c.evidence++;i.mediaPressure=clamp(i.mediaPressure+10,0,100);i.boosterTrust=clamp(i.boosterTrust+6,0,100);}c.stage='discovery';schedule(state,c,2);}
      else if(p.phase==='discovery'){if(optionId==='cooperate'){c.evidence=clamp(c.evidence-1,0,9);i.complianceScore=clamp(i.complianceScore+8,0,100);i.mediaPressure=clamp(i.mediaPressure+4,0,100);}else if(optionId==='limited'){i.mediaPressure=clamp(i.mediaPressure+5,0,100);}else{var rng=E.stream('records',c.id,state);c.evidence=clamp(c.evidence+(rng()<.48?-1:3),0,9);i.heat=clamp(i.heat+18,0,100);i.mediaPressure=clamp(i.mediaPressure+12,0,100);}c.stage='hearing';schedule(state,c,2);}
      else if(p.phase==='hearing'){i.pendingCaseDecision=null;return resolveCase(state,c,optionId);}
      else if(p.phase==='appeal'){i.pendingCaseDecision=null;if(optionId==='appeal'){state.career.wallet=Math.max(0,(state.career.wallet||0)-.5);var rr=E.stream('appeal',c.id,state),success=rr()<(i.complianceScore*.006+(c.choices[0]&&c.choices[0].choice==='disclose'?.18:0));c.appeal=success?'granted':'denied';if(success){i.probation=Math.max(0,i.probation-1);i.scholarshipPenalty=Math.max(0,i.scholarshipPenalty-1);if(i.bowlBanUntil>state.career.year)i.bowlBanUntil--;c.verdict.severity='secondary';c.verdict.sanctions.push('Appeal granted - penalties reduced.');}else c.verdict.sanctions.push('Appeal denied.');}else c.appeal='waived';finalize(state,c);headline(state,'investigation',c.title+' case closes','The appeal was '+c.appeal+'.');return c.verdict;}return c;},
    recruitingFactor:function(state){var i=ensure(state);return clamp(1-i.mediaPressure*.003-i.openCases.length*.04,.62,1);},
    profilePenalty:function(state){var i=ensure(state);return Math.round(i.mediaPressure*.08+i.openCases.length*2+(state.career.caseCloud||0)*3+(i.showCause?18:0));},
    onSeasonStart:function(state){var i=ensure(state);if(!i.openCases.length&&i.heat<20){state.career.redemption=(state.career.redemption||0)+1;i.complianceScore=clamp(i.complianceScore+3,0,100);}Cases.advanceWeek(state);},
    onJobChange:function(state){var i=ensure(state),count=i.openCases.length;if(!count)return 0;i.openCases.forEach(function(c){state.career.ethicsHistory.unshift({year:state.career.year,teamId:state.team.id,title:c.title,severity:'unresolved',appeal:null});});state.career.caseCloud=(state.career.caseCloud||0)+count;state.career.reputation=clamp(state.career.reputation-count*4,0,100);return count;},
    runRedemptionProgram:function(state){var i=ensure(state);if(i.openCases.length)return {ok:false,reason:'Resolve open cases first.'};if((state.program.offseasonPoints||0)<8)return {ok:false,reason:'Requires 8 offseason points.'};state.program.offseasonPoints-=8;i.heat=clamp(i.heat-18,0,100);i.mediaPressure=clamp(i.mediaPressure-20,0,100);i.complianceScore=clamp(i.complianceScore+12,0,100);i.adTrust=clamp(i.adTrust+8,0,100);state.career.reputation=clamp(state.career.reputation+3,0,100);state.career.redemption=(state.career.redemption||0)+1;state.career.caseCloud=Math.max(0,(state.career.caseCloud||0)-1);headline(state,'community',state.team.name+' launches reform initiative','Independent oversight and community investment begin rebuilding trust.');return {ok:true};}
  };
  var EXTRA=[
    {id:'nil_audit',category:'NIL',weight:2,title:'Collective Books Do Not Balance',blurb:'The NIL collective cannot document several payments before an audit.',options:[{id:'audit',label:'Order an independent audit',desc:'Freeze new deals and establish the facts.',fx:{adTrust:5,recruitPoints:-4}},{id:'paper',label:'Backfill the paperwork',desc:'Keep the money moving and hope the dates are never checked.',risky:true,fx:{nil:5,heat:18,tag:'NIL reporting'}}]},
    {id:'burner_account',category:'Media',weight:1,title:'The Burner Account',blurb:'A staff member offers to run anonymous accounts attacking rivals and reporters.',options:[{id:'no',label:'Shut it down',desc:'Keep staff out of anonymous influence campaigns.',fx:{mediaPressure:-3}},{id:'yes',label:'Turn it loose',desc:'Shape the narrative now; discovery would become a national story.',risky:true,fx:{fame:4,heat:14,mediaPressure:8,tag:'covert media campaign'}}]},
    {id:'equipment_bid',category:'Contracts',weight:1,title:'The Equipment Contract',blurb:'A vendor offers a personal consulting fee if you steer the program contract their way.',options:[{id:'disclose',label:'Disclose the offer',desc:'Send it to university procurement.',fx:{adTrust:5}},{id:'fee',label:'Take the fee',desc:'Gain $0.5M through an undisclosed conflict of interest.',risky:true,fx:{wallet:.5,heat:20,tag:'undisclosed conflict'}}]},
    {id:'medical_leak',category:'Player Welfare',weight:2,title:'A Star Wants Privacy',blurb:'A reporter has learned about a star player injury before the family is ready to discuss it.',options:[{id:'protect',label:'Protect the player',desc:'Accept criticism and preserve locker-room trust.',fx:{morale:4,mediaPressure:3}},{id:'spin',label:'Leak your version first',desc:'Control the news cycle at the player’s expense.',risky:true,fx:{fame:2,heat:10,morale:-6,tag:'medical privacy'}}]},
    {id:'fake_visit',category:'Recruiting',weight:2,title:'A Visit That Never Happened',blurb:'Recruiting staff can bill a contact as an official visit to unlock extra benefits.',options:[{id:'correct',label:'Correct the record',desc:'Lose the advantage and protect the program.',fx:{adTrust:3}},{id:'file',label:'File the false visit',desc:'Gain recruiting leverage and create a paper trail.',risky:true,fx:{recruitPoints:14,heat:17,tag:'recruiting records'}}]},
    {id:'ticket_market',category:'Boosters',weight:1,title:'Donor Ticket Market',blurb:'Premium donor tickets are being resold through a booster-controlled side market.',options:[{id:'stop',label:'Stop the operation',desc:'Anger donors but protect the department.',fx:{boosters:-7,adTrust:5}},{id:'share',label:'Take a program share',desc:'Fund NIL while tying the program to the scheme.',risky:true,fx:{nil:7,heat:16,boosters:7,tag:'ticket diversion'}}]},
    {id:'nepotism',category:'Staff',weight:1,title:'A Booster’s Coaching Candidate',blurb:'A major donor wants an unqualified relative placed on your staff.',options:[{id:'merit',label:'Hire on merit',desc:'Protect staff standards and risk donor anger.',fx:{boosters:-6,staffLoyalty:4}},{id:'hire',label:'Make the hire',desc:'Unlock donor support while weakening and compromising the staff.',risky:true,fx:{nil:5,staffLoyalty:-8,heat:11,tag:'improper influence'}}]},
    {id:'whistleblower',category:'Staff',weight:1,title:'A Compliance Whistleblower',blurb:'A staff member says the athletics department ignored repeated warnings.',options:[{id:'protect',label:'Protect the whistleblower',desc:'Invite a real review and earn long-term credibility.',fx:{compliance:12,mediaPressure:6,adTrust:4}},{id:'retaliate',label:'Push them out',desc:'Silence the immediate threat; retaliation dramatically raises exposure.',risky:true,fx:{staffLoyalty:-12,heat:28,mediaPressure:10,severe:true,tag:'whistleblower retaliation'}}]}
  ];
  window.GameCases=Cases;if(window.GameScandal&&window.GameScandal.registerEvents)window.GameScandal.registerEvents(EXTRA);if(window.GameRegistry){window.GameRegistry.register('system','cases',Cases);window.GameRegistry.registerAll('scandal',EXTRA);}
})();
