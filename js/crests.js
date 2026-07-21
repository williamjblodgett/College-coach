/* GRIDIRON DYNASTY 2.0 - deterministic, original, trademark-safe team crests. */
(function () {
  'use strict';
  var NS = 'http://www.w3.org/2000/svg';
  var SHAPES = ['shield', 'round', 'diamond', 'banner'];

  function hash(text) {
    var h = 2166136261;
    for (var i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function initials(team) {
    var words = (team.name || team.id || 'GD').replace(/[^A-Za-z0-9 ]/g, '').split(/\s+/).filter(Boolean);
    if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
    return (words[0][0] + words[words.length - 1][0]).toUpperCase();
  }
  function pathFor(shape) {
    if (shape === 'round') return 'M50 5a45 45 0 1 1 0 90 45 45 0 0 1 0-90z';
    if (shape === 'diamond') return 'M50 4 96 50 50 96 4 50z';
    if (shape === 'banner') return 'M8 10h84v62L50 96 8 72z';
    return 'M10 8h80v48c0 20-16 33-40 40C26 89 10 76 10 56z';
  }
  function render(team, size) {
    size = size || 44;
    var seed = hash(team.id || team.name || 'team');
    var shape = SHAPES[seed % SHAPES.length];
    var primary = team.colors && team.colors[0] || '#25345a';
    var secondary = team.colors && team.colors[1] || '#ffffff';
    var svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 100 100');
    svg.setAttribute('width', size); svg.setAttribute('height', size);
    svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', (team.name || 'Team') + ' original crest');
    svg.classList.add('team-crest');
    var base = document.createElementNS(NS, 'path');
    base.setAttribute('d', pathFor(shape)); base.setAttribute('fill', primary); base.setAttribute('stroke', secondary); base.setAttribute('stroke-width', '6');
    svg.appendChild(base);
    var stripe = document.createElementNS(NS, 'path');
    stripe.setAttribute('d', seed % 2 ? 'M18 62L82 24v18L28 75z' : 'M18 28h64v15H18z');
    stripe.setAttribute('fill', secondary); stripe.setAttribute('opacity', '0.9');
    svg.appendChild(stripe);
    var label = document.createElementNS(NS, 'text');
    label.setAttribute('x', '50'); label.setAttribute('y', seed % 2 ? '60' : '72'); label.setAttribute('text-anchor', 'middle');
    label.setAttribute('font-size', initials(team).length > 1 ? '31' : '40'); label.setAttribute('font-weight', '900');
    label.setAttribute('font-family', 'system-ui, sans-serif'); label.setAttribute('fill', seed % 2 ? secondary : primary);
    label.setAttribute('stroke', seed % 2 ? primary : secondary); label.setAttribute('stroke-width', '1.5'); label.setAttribute('paint-order', 'stroke');
    label.textContent = initials(team); svg.appendChild(label);
    return svg;
  }

  window.GameCrests = { render: render, hash: hash, initials: initials };
})();
