/* GRIDIRON DYNASTY — teams.js
 * window.TeamData: registry that later tier files (teams-fbs.js, teams-fcs.js,
 * teams-d2.js, teams-d3.js) push into via register(). Keeping the registry
 * separate lets each division ship as its own drop-in data file/commit.
 *
 * Team record shape:
 *   { id, name, nick, div, conf, city, st, colors:[primary,secondary],
 *     prestige:1..10, stadium, cap, rivals:[ids], emoji }
 */
(function () {
  'use strict';

  var byId = {};
  var all = [];

  var TeamData = {
    DIVISIONS: ['fbs', 'fcs', 'd2', 'd3'],
    DIVISION_LABEL: { fbs: 'FBS', fcs: 'FCS', d2: 'Division II', d3: 'Division III' },

    // Register a batch of teams for a division. Idempotent per id.
    register: function (division, teams) {
      for (var i = 0; i < teams.length; i++) {
        var t = teams[i];
        t.div = t.div || division;
        if (byId[t.id]) continue;
        byId[t.id] = t;
        all.push(t);
      }
      return this;
    },

    get: function (id) { return byId[id] || null; },
    all: function () { return all.slice(); },
    count: function () { return all.length; },

    byDivision: function (div) {
      return all.filter(function (t) { return t.div === div; });
    },

    conferences: function (div) {
      var seen = {}, out = [];
      for (var i = 0; i < all.length; i++) {
        var t = all[i];
        if (div && t.div !== div) continue;
        if (!seen[t.conf]) { seen[t.conf] = true; out.push(t.conf); }
      }
      out.sort();
      return out;
    },

    byConference: function (conf) {
      return all.filter(function (t) { return t.conf === conf; });
    }
  };

  window.TeamData = TeamData;
})();
