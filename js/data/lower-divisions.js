/* GRIDIRON DYNASTY 2.0 - original lower-division programs for climb careers. */
(function () {
  'use strict';
  var places = [
    ['Albany','NY'],['Augusta','ME'],['Boulder','CO'],['Bozeman','MT'],['Canton','OH'],['Carson','NV'],['Cedar Falls','IA'],['Charleston','WV'],
    ['Chattanooga','TN'],['Cheyenne','WY'],['Dover','DE'],['Duluth','MN'],['Erie','PA'],['Eugene','OR'],['Fargo','ND'],['Flagstaff','AZ'],
    ['Fort Smith','AR'],['Grand Rapids','MI'],['Huntsville','AL'],['Jackson','MS'],['Knoxville','TN'],['Lafayette','LA'],['Lexington','KY'],['Lincoln','NE'],
    ['Macon','GA'],['Manchester','NH'],['Mesa','AZ'],['Mobile','AL'],['Norfolk','VA'],['Olympia','WA'],['Pensacola','FL'],['Peoria','IL']
  ];
  var colors = [['#17365d','#f4c542'],['#6b1f2b','#e6e6e6'],['#124734','#f0b323'],['#352a78','#efefef'],['#8a1c1c','#d5aa4f'],['#0e4d64','#f28c28'],['#432818','#bb9457'],['#1f3b73','#d6dbe8']];
  var mascots = ['Owls','Foxes','Bison','Hawks','Bears','Wolves','Stallions','Falcons'];
  var configs = {
    fcs:{prefix:'State',confs:['Pioneer','Frontier','Colonial','Southern'],base:4},
    d2:{prefix:'Tech',confs:['Great Lakes','Mountain','Atlantic','Gulf'],base:3},
    d3:{prefix:'College',confs:['North Woods','Heartland','Coastal','Commonwealth'],base:2}
  };
  Object.keys(configs).forEach(function (div, di) {
    var cfg=configs[div], teams=places.map(function (p,i) {
      var c=colors[(i+di*2)%colors.length], mascot=mascots[(i*3+di)%mascots.length];
      return { id:div+'-'+p[0].toLowerCase().replace(/[^a-z]/g,'')+'-'+i, name:p[0]+' '+cfg.prefix, nick:mascot, div:div,
        conf:cfg.confs[i%cfg.confs.length], city:p[0], st:p[1], colors:c, prestige:Math.max(1,Math.min(6,cfg.base+((i%5)-2))),
        stadium:p[0]+' Field',cap:6000+i*650,rivals:[],emoji:'🏈',original:true };
    });
    teams.forEach(function(t,i){t.rivals=[teams[(i+(i%2? -1:1)+teams.length)%teams.length].id];});
    window.TeamData.register(div,teams);
  });
})();
