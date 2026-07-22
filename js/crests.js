/* GRIDIRON DYNASTY 2.0 - deterministic, original, trademark-safe team crests. */
(function () {
  'use strict';
  var NS = 'http://www.w3.org/2000/svg';
  var SHAPES = ['shield', 'round', 'diamond', 'banner', 'hex'];

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
    if (shape === 'hex') return 'M25 7h50l22 43-22 43H25L3 50z';
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
    var defs=document.createElementNS(NS,'defs'),grad=document.createElementNS(NS,'linearGradient');
    grad.setAttribute('id','crest-'+seed);grad.setAttribute('x1','0');grad.setAttribute('y1','0');grad.setAttribute('x2','1');grad.setAttribute('y2','1');
    [[primary,'0%'],[primary,'58%'],[secondary,'160%']].forEach(function(x){var stop=document.createElementNS(NS,'stop');stop.setAttribute('stop-color',x[0]);stop.setAttribute('offset',x[1]);grad.appendChild(stop);});
    defs.appendChild(grad);svg.appendChild(defs);
    var base = document.createElementNS(NS, 'path');
    base.setAttribute('d', pathFor(shape)); base.setAttribute('fill', 'url(#crest-'+seed+')'); base.setAttribute('stroke', secondary); base.setAttribute('stroke-width', '6');
    svg.appendChild(base);
    var inner=document.createElementNS(NS,'path');inner.setAttribute('d',pathFor(shape));inner.setAttribute('fill','none');inner.setAttribute('stroke',primary);inner.setAttribute('stroke-width','2');inner.setAttribute('transform','translate(5 5) scale(.9)');inner.setAttribute('opacity','.85');svg.appendChild(inner);
    var stripe = document.createElementNS(NS, 'path');
    stripe.setAttribute('d', seed % 2 ? 'M18 62L82 24v18L28 75z' : 'M18 28h64v15H18z');
    stripe.setAttribute('fill', secondary); stripe.setAttribute('opacity', '0.9');
    svg.appendChild(stripe);
    if (seed % 3 === 0) {
      var crown=document.createElementNS(NS,'path');crown.setAttribute('d','M31 21l9 7 10-13 10 13 9-7-4 18H35z');crown.setAttribute('fill',secondary);crown.setAttribute('opacity','.92');svg.appendChild(crown);
    } else if (seed % 3 === 1) {
      var wing=document.createElementNS(NS,'path');wing.setAttribute('d','M20 48c13-19 29-23 48-23-12 8-20 16-24 25 10-7 20-10 34-9-17 10-29 18-37 32z');wing.setAttribute('fill',secondary);wing.setAttribute('opacity','.28');svg.appendChild(wing);
    }
    var label = document.createElementNS(NS, 'text');
    label.setAttribute('x', '50'); label.setAttribute('y', seed % 2 ? '60' : '72'); label.setAttribute('text-anchor', 'middle');
    label.setAttribute('font-size', initials(team).length > 1 ? '31' : '40'); label.setAttribute('font-weight', '900');
    label.setAttribute('font-family', 'system-ui, sans-serif'); label.setAttribute('fill', seed % 2 ? secondary : primary);
    label.setAttribute('stroke', seed % 2 ? primary : secondary); label.setAttribute('stroke-width', '1.5'); label.setAttribute('paint-order', 'stroke');
    label.textContent = initials(team); svg.appendChild(label);
    var star=document.createElementNS(NS,'text');star.setAttribute('x','50');star.setAttribute('y','90');star.setAttribute('text-anchor','middle');star.setAttribute('font-size','10');star.setAttribute('letter-spacing','3');star.setAttribute('fill',secondary);star.textContent=seed%2?'★ ★':'◆ ◆';svg.appendChild(star);
    return svg;
  }

  window.GameCrests = { render: render, hash: hash, initials: initials };
})();
