/* 2026 preseason starting strength, anchored to the final 2025 AP/CFP results. */
(function () {
  'use strict';
  var ranked = ['indiana','miami','olemiss','oregon','ohiostate','georgia','texastech','texasam','alabama','notredame','byu','texas','oklahoma','utah','vanderbilt','virginia','iowa','tulane','jamesmadison','usc','michigan','houston','navy','northtexas','tcu'];
  var ratings = {};
  ranked.forEach(function (id, i) { ratings[id] = 98 - i * 0.9; });
  window.CurrentPower = {
    label: '2026 preseason', sourceSeason: 2025, ranked: ranked.slice(),
    rating: function (team) {
      var id = typeof team === 'string' ? team : team.id;
      if (ratings[id] != null) return Math.round(ratings[id]);
      var data = typeof team === 'string' ? (window.TeamData.get(id) || {}) : team;
      return Math.max(42, Math.min(86, Math.round(39 + (data.prestige || 3) * 4.8)));
    }
  };
})();
