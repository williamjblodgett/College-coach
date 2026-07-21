/* GRIDIRON DYNASTY 2.0 - transparent difficulty presets. */
(function () {
  'use strict';
  var PRESETS = {
    story:   { id: 'story', label: 'Story', opponent: -5, recruiting: 1.25, progression: 1.25, injuries: 0.65, scrutiny: 0.70 },
    coach:   { id: 'coach', label: 'Coach', opponent: -2, recruiting: 1.10, progression: 1.10, injuries: 0.85, scrutiny: 0.90 },
    dynasty: { id: 'dynasty', label: 'Dynasty', opponent: 0, recruiting: 1.00, progression: 1.00, injuries: 1.00, scrutiny: 1.00 },
    legend:  { id: 'legend', label: 'Legend', opponent: 4, recruiting: 0.82, progression: 0.85, injuries: 1.20, scrutiny: 1.25 }
  };

  window.GameDifficulty = {
    PRESETS: PRESETS,
    get: function (state) {
      var id = state && state.settings && state.settings.difficulty || 'dynasty';
      if (id === 'custom' && state.settings.difficultyCustom) return state.settings.difficultyCustom;
      return PRESETS[id] || PRESETS.dynasty;
    },
    labels: function () { return Object.keys(PRESETS).map(function (id) { return PRESETS[id]; }); }
  };
  if (window.GameRegistry) window.GameRegistry.registerAll('difficulty', Object.keys(PRESETS).map(function (id) { return PRESETS[id]; }));
})();
