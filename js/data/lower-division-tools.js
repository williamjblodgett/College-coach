/* GRIDIRON DYNASTY - shared importer for the complete lower-division database. */
(function () {
  'use strict';

  var palettes = [
    ['#12355b','#f4d35e'], ['#7a1f2b','#f2f2f2'], ['#154734','#ffb81c'],
    ['#352a78','#f5f3ff'], ['#8c1d40','#ffc627'], ['#005f73','#ee9b00'],
    ['#4e2a1e','#d6b588'], ['#003b5c','#c4d600'], ['#582c83','#fdb927'],
    ['#9d2235','#ffffff'], ['#006747','#cedc00'], ['#002855','#eaaa00']
  ];

  function slug(value) {
    return String(value).toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }
  function hash(value) {
    var h = 2166136261;
    for (var i = 0; i < value.length; i++) { h ^= value.charCodeAt(i); h += (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24); }
    return h >>> 0;
  }

  function register(division, rows) {
    var ceiling = division === 'fcs' ? 7 : division === 'd2' ? 6 : 5;
    var teams = rows.map(function (r) {
      var name = r[0], h = hash(division + ':' + name), palette = palettes[h % palettes.length];
      var cap = Number(r[6]) || (division === 'fcs' ? 11000 + h % 17000 : division === 'd2' ? 5000 + h % 9000 : 2500 + h % 6000);
      return {
        id: division + '-' + slug(name), name: name, nick: r[1] || 'Football', div: division,
        conf: r[4] || 'Independent', city: r[2] || name, st: r[3] || 'US',
        colors: palette.slice(), prestige: 1 + (h % ceiling), stadium: r[5] || (name + ' Stadium'),
        cap: cap, rivals: [], emoji: '🏈', currentProgram: true, generatedCrestOnly: true
      };
    });

    var conferences = {};
    teams.forEach(function (team) { (conferences[team.conf] || (conferences[team.conf] = [])).push(team); });
    Object.keys(conferences).forEach(function (conf) {
      var group = conferences[conf].sort(function (a, b) { return a.name.localeCompare(b.name); });
      if (group.length < 2) return;
      group.forEach(function (team, i) { team.rivals = [group[i % 2 ? i - 1 : (i + 1) % group.length].id]; });
    });
    window.TeamData.register(division, teams);
  }

  window.LowerDivisionData = { register: register };
})();
