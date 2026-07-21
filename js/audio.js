/* GRIDIRON DYNASTY 2.0 - tiny synthesized UI soundscape; no external assets. */
(function(){
  'use strict';
  var ctx=null;
  function enabled(){return !window.GameEngine||!window.GameEngine.state||window.GameEngine.state.settings.sound!==false;}
  function tone(freq,duration,gain){if(!enabled()||!window.AudioContext)return;try{ctx=ctx||new AudioContext();var o=ctx.createOscillator(),g=ctx.createGain();o.type='sine';o.frequency.value=freq;g.gain.setValueAtTime(gain||.025,ctx.currentTime);g.gain.exponentialRampToValueAtTime(.001,ctx.currentTime+duration);o.connect(g);g.connect(ctx.destination);o.start();o.stop(ctx.currentTime+duration);}catch(e){}}
  document.addEventListener('click',function(e){if(e.target&&e.target.closest&&e.target.closest('button'))tone(e.target.closest('.primary')?520:360,.055,.018);});
  window.GameAudio={click:function(){tone(380,.05,.02);},success:function(){tone(660,.12,.035);setTimeout(function(){tone(880,.15,.03);},90);},alert:function(){tone(180,.2,.035);}};
})();
