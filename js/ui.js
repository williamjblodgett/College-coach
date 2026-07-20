/* GRIDIRON DYNASTY — ui.js
 * window.GameUI: screen rendering + the setup flow (title → team → coach → HQ).
 * Pure DOM; no framework. Renders into #app.
 */
(function () {
  'use strict';

  var E = window.GameEngine;
  var T = window.TeamData;
  var CoachData = window.CoachData;

  // Temporary selections held during the setup flow (before newCareer commits).
  var pick = { team: null, coachTab: 'real', build: null };

  function el(tag, attrs, children) {
    var n = document.createElement(tag);
    if (attrs) {
      for (var k in attrs) {
        if (!Object.prototype.hasOwnProperty.call(attrs, k)) continue;
        if (k === 'class') n.className = attrs[k];
        else if (k === 'html') n.innerHTML = attrs[k];
        else if (k === 'text') n.textContent = attrs[k];
        else if (k.slice(0, 2) === 'on' && typeof attrs[k] === 'function') {
          n.addEventListener(k.slice(2), attrs[k]);
        } else if (attrs[k] != null) n.setAttribute(k, attrs[k]);
      }
    }
    (children || []).forEach(function (c) {
      if (c == null) return;
      n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return n;
  }

  function app() { return document.getElementById('app'); }
  function clear() { var a = app(); while (a.firstChild) a.removeChild(a.firstChild); }
  function mount(node) { clear(); app().appendChild(node); }

  // ---- team monogram / logo (drop-in image upgrade) ------------------------
  // Renders a color monogram badge; if images/logos/<id>.png exists it upgrades.
  function teamBadge(team, size) {
    size = size || 44;
    var wrap = el('span', { class: 'badge', style:
      'width:' + size + 'px;height:' + size + 'px;font-size:' + Math.round(size * 0.42) + 'px;' +
      'background:linear-gradient(135deg,' + team.colors[0] + ',' + shade(team.colors[0], -18) + ');' +
      'color:' + readable(team.colors[0]) + ';border:2px solid ' + team.colors[1] + ';' });
    wrap.appendChild(el('span', { class: 'badge-emoji', text: team.emoji || '🏈' }));
    // Attempt logo upgrade.
    var img = new Image();
    img.className = 'badge-img';
    img.alt = team.name;
    img.onload = function () { wrap.classList.add('has-logo'); wrap.appendChild(img); };
    img.onerror = function () {};
    img.src = 'images/logos/' + team.id + '.png';
    return wrap;
  }

  function coachAvatar(coach, size) {
    size = size || 44;
    var bg = coach.color || '#333';
    return el('span', { class: 'badge', style:
      'width:' + size + 'px;height:' + size + 'px;font-size:' + Math.round(size * 0.5) + 'px;' +
      'background:linear-gradient(135deg,' + bg + ',' + shade(bg, -20) + ');color:#fff;' },
      [el('span', { text: coach.avatar || '🧢' })]);
  }

  // Color helpers.
  function hexToRgb(h) {
    h = h.replace('#', '');
    if (h.length === 3) h = h[0]+h[0]+h[1]+h[1]+h[2]+h[2];
    return [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16)];
  }
  function shade(hex, amt) {
    var c = hexToRgb(hex).map(function (v) { return Math.max(0, Math.min(255, v + amt)); });
    return '#' + c.map(function (v) { return ('0' + v.toString(16)).slice(-2); }).join('');
  }
  function readable(hex) {
    var c = hexToRgb(hex);
    var lum = (0.299*c[0] + 0.587*c[1] + 0.114*c[2]);
    return lum > 150 ? '#111' : '#fff';
  }

  function btn(label, cls, on) {
    return el('button', { class: 'btn ' + (cls || ''), onclick: on }, [label]);
  }

  // ---- Screen: Title -------------------------------------------------------
  function renderTitle() {
    pick = { team: null, coachTab: 'real', build: null };
    var hasSave = E.hasSave();
    var card = el('div', { class: 'screen title-screen' }, [
      el('div', { class: 'title-mark' }, [
        el('div', { class: 'title-emoji', text: '🏈' }),
        el('h1', { class: 'title-name', text: 'GRIDIRON DYNASTY' }),
        el('p', { class: 'title-sub', text: 'College Football Head-Coaching Career Sim' })
      ]),
      el('div', { class: 'title-actions' }, [
        hasSave ? btn('▶  Continue Career', 'primary big', function () {
          E.load(); GameUI.render();
        }) : null,
        btn(hasSave ? 'New Career' : '▶  New Career', hasSave ? '' : 'primary big', function () {
          if (hasSave && !confirm('Start a new career? Your current save will be replaced when you finish setup.')) return;
          renderTeamSelect();
        }),
        btn('Import Save', 'ghost', importSave)
      ]),
      el('p', { class: 'title-foot', text: 'v1 · Wave 1 · ' + T.byDivision('fbs').length + ' FBS programs' })
    ]);
    mount(card);
  }

  function importSave() {
    var txt = prompt('Paste an exported save (JSON):');
    if (!txt) return;
    var s = E.deserialize(txt);
    if (!s) { alert('That did not look like a valid save.'); return; }
    E.save();
    GameUI.render();
  }

  // ---- Screen: Team Select -------------------------------------------------
  function renderTeamSelect() {
    var confs = T.conferences('fbs');
    var state = { conf: 'All', q: '' };

    var list = el('div', { class: 'grid team-grid' });
    var subtitle = el('p', { class: 'muted select-count' });

    function refresh() {
      list.innerHTML = '';
      var teams = T.byDivision('fbs').filter(function (t) {
        if (state.conf !== 'All' && t.conf !== state.conf) return false;
        if (state.q) {
          var q = state.q.toLowerCase();
          if ((t.name + ' ' + t.nick + ' ' + t.city).toLowerCase().indexOf(q) < 0) return false;
        }
        return true;
      }).sort(function (a, b) { return a.name.localeCompare(b.name); });
      subtitle.textContent = teams.length + ' program' + (teams.length === 1 ? '' : 's');
      teams.forEach(function (t) {
        var stars = '★'.repeat(Math.round(t.prestige / 2)) + '☆'.repeat(5 - Math.round(t.prestige / 2));
        list.appendChild(el('button', {
          class: 'card team-card' + (pick.team && pick.team.id === t.id ? ' selected' : ''),
          onclick: function () { pick.team = t; renderTeamSelect(); }
        }, [
          teamBadge(t, 40),
          el('div', { class: 'card-body' }, [
            el('div', { class: 'card-title', text: t.name }),
            el('div', { class: 'card-sub', text: t.nick + ' · ' + t.conf }),
            el('div', { class: 'card-meta', text: t.city + ', ' + t.st }),
            el('div', { class: 'card-stars', text: stars, title: 'Prestige ' + t.prestige + '/10' })
          ])
        ]));
      });
    }

    var confSel = el('select', { class: 'select', onchange: function (e) { state.conf = e.target.value; refresh(); } },
      [el('option', { value: 'All', text: 'All Conferences' })].concat(
        confs.map(function (c) { return el('option', { value: c, text: c }); })));

    var search = el('input', { class: 'input', type: 'search', placeholder: 'Search team, mascot, city…',
      oninput: function (e) { state.q = e.target.value; refresh(); } });

    var footer = el('div', { class: 'sticky-footer' }, [
      el('div', { class: 'sf-info' }, [
        pick.team ? teamBadge(pick.team, 34) : null,
        el('span', { text: pick.team ? ('Selected: ' + pick.team.name) : 'Pick your program to begin.' })
      ]),
      el('div', { class: 'sf-actions' }, [
        btn('Back', 'ghost', renderTitle),
        btn('Next: Choose Coach  →', 'primary', function () {
          if (!pick.team) { alert('Choose a program first.'); return; }
          renderCoachSelect();
        })
      ])
    ]);

    var screen = el('div', { class: 'screen' }, [
      el('div', { class: 'screen-head' }, [
        el('h2', { text: 'Choose Your Program' }),
        el('p', { class: 'muted', text: 'Step 1 of 2 — FBS (more divisions coming in later waves).' })
      ]),
      el('div', { class: 'toolbar' }, [confSel, search, subtitle]),
      list, footer
    ]);
    mount(screen);
    refresh();
  }

  // ---- Screen: Coach Select / Create ---------------------------------------
  function renderCoachSelect() {
    var tabs = [
      { id: 'real', label: 'Real Coaches' },
      { id: 'legend', label: 'Legends' },
      { id: 'custom', label: 'Create-a-Coach' }
    ];

    var body = el('div', { class: 'coach-body' });

    function tabBar() {
      return el('div', { class: 'tabs' }, tabs.map(function (t) {
        return el('button', {
          class: 'tab' + (pick.coachTab === t.id ? ' active' : ''),
          onclick: function () { pick.coachTab = t.id; refresh(); }
        }, [t.label]);
      }));
    }

    function coachCard(c) {
      var chips = CoachData.SKILLS.map(function (k) {
        return el('span', { class: 'skill-chip' }, [
          el('span', { class: 'sk-name', text: CoachData.SKILL_LABEL[k].slice(0, 3) }),
          el('span', { class: 'sk-val', text: c.ratings[k] })
        ]);
      });
      return el('button', {
        class: 'card coach-card' + (pick.coach && pick.coach.id === c.id ? ' selected' : ''),
        onclick: function () { pick.coach = normalizeChoice(c); refresh(); }
      }, [
        coachAvatar(c, 46),
        el('div', { class: 'card-body' }, [
          el('div', { class: 'card-title', text: c.name }),
          el('div', { class: 'card-sub', text: c.archetype }),
          el('div', { class: 'card-bio', text: c.bio }),
          el('div', { class: 'skill-row' }, chips)
        ])
      ]);
    }

    function normalizeChoice(c) {
      return {
        id: c.id, name: c.name, source: c.source || c.tab || 'real',
        background: c.background || c.archetype || '', avatar: c.avatar || '🧢',
        color: c.color || '#c8102e', bio: c.bio || '',
        ratings: JSON.parse(JSON.stringify(c.ratings))
      };
    }

    function refresh() {
      body.innerHTML = '';
      if (pick.coachTab === 'custom') {
        body.appendChild(renderBuilder(function (built) { pick.coach = built; }));
      } else {
        var pool = pick.coachTab === 'real' ? CoachData.real
          : CoachData.legends;
        // The "My Coaches" custom saves are surfaced under Create-a-Coach.
        var grid = el('div', { class: 'grid coach-grid' });
        pool.forEach(function (c) { grid.appendChild(coachCard(c)); });
        body.appendChild(grid);
      }
      footerInfo.innerHTML = '';
      if (pick.coach) {
        footerInfo.appendChild(coachAvatar(pick.coach, 34));
        footerInfo.appendChild(el('span', { text: 'Coach: ' + (pick.coach.name || '(unnamed)') }));
      } else {
        footerInfo.appendChild(el('span', { text: 'Pick or build your head coach.' }));
      }
      // keep tab bar in sync
      tabHolder.innerHTML = '';
      tabHolder.appendChild(tabBar());
    }

    var footerInfo = el('div', { class: 'sf-info' });
    var tabHolder = el('div');

    var footer = el('div', { class: 'sticky-footer' }, [
      footerInfo,
      el('div', { class: 'sf-actions' }, [
        btn('Back', 'ghost', renderTeamSelect),
        btn('Start Career  🏈', 'primary', function () {
          if (!pick.coach) { alert('Choose or create a coach first.'); return; }
          if (!pick.coach.name || !pick.coach.name.trim()) { alert('Give your coach a name.'); return; }
          E.newCareer(pick.coach, pick.team);
          E.save();
          renderHQ();
        })
      ])
    ]);

    var screen = el('div', { class: 'screen' }, [
      el('div', { class: 'screen-head' }, [
        el('h2', { text: 'Choose Your Coach' }),
        el('p', { class: 'muted' }, [
          'Step 2 of 2 — coaching ', pick.team ? el('strong', { text: pick.team.name }) : 'your program', '.'
        ])
      ]),
      tabHolder, body, footer
    ]);
    mount(screen);
    refresh();
  }

  // ---- Create-a-coach builder ----------------------------------------------
  function renderBuilder(onChange) {
    var base = CoachData.BUILDER_BASE, pool = CoachData.BUILDER_POOL;
    var min = CoachData.BUILDER_MIN, max = CoachData.BUILDER_MAX;

    if (!pick.build) {
      pick.build = {
        name: '', background: CoachData.backgrounds[0].id,
        avatar: CoachData.avatars[0], color: CoachData.colors[0],
        alloc: {}
      };
      CoachData.SKILLS.forEach(function (k) { pick.build.alloc[k] = base; });
    }
    var b = pick.build;

    function spent() {
      var s = 0; CoachData.SKILLS.forEach(function (k) { s += (b.alloc[k] - base); }); return s;
    }
    function remaining() { return pool - spent(); }

    function effective(k) {
      var bonus = 0;
      var bg = CoachData.background(b.background);
      if (bg && bg.bonus[k]) bonus = bg.bonus[k];
      return Math.min(100, b.alloc[k] + bonus);
    }

    function commit() {
      var ratings = {};
      CoachData.SKILLS.forEach(function (k) { ratings[k] = effective(k); });
      var built = {
        id: 'custom_' + Date.now(), name: b.name.trim(), source: 'custom',
        background: b.background, avatar: b.avatar, color: b.color,
        bio: (CoachData.background(b.background) || {}).blurb || 'A coach of your own making.',
        ratings: ratings
      };
      onChange(built);
    }

    var wrap = el('div', { class: 'builder' });

    var nameRow = el('div', { class: 'form-row' }, [
      el('label', { text: 'Coach Name' }),
      el('input', { class: 'input', type: 'text', value: b.name, placeholder: 'e.g. Coach Riley Vance',
        oninput: function (e) { b.name = e.target.value; commit(); } })
    ]);

    var bgRow = el('div', { class: 'form-row' }, [
      el('label', { text: 'Background' }),
      el('div', { class: 'chip-select' }, CoachData.backgrounds.map(function (bg) {
        return el('button', {
          class: 'chip' + (b.background === bg.id ? ' active' : ''),
          title: bg.blurb,
          onclick: function () { b.background = bg.id; render(); }
        }, [bg.name]);
      }))
    ]);

    var appearRow = el('div', { class: 'form-row' }, [
      el('label', { text: 'Appearance' }),
      el('div', { class: 'appearance' }, [
        el('div', { class: 'chip-select tight' }, CoachData.avatars.map(function (a) {
          return el('button', { class: 'chip emoji' + (b.avatar === a ? ' active' : ''),
            onclick: function () { b.avatar = a; render(); } }, [a]);
        })),
        el('div', { class: 'chip-select tight' }, CoachData.colors.map(function (c) {
          return el('button', { class: 'swatch' + (b.color === c ? ' active' : ''),
            style: 'background:' + c, onclick: function () { b.color = c; render(); } }, ['']);
        }))
      ])
    ]);

    var poolLabel = el('div', { class: 'pool-label' });
    var sliders = el('div', { class: 'sliders' });

    function render() {
      var bg = CoachData.background(b.background);
      poolLabel.textContent = 'Points remaining: ' + remaining();
      poolLabel.className = 'pool-label' + (remaining() < 0 ? ' over' : '');
      sliders.innerHTML = '';
      CoachData.SKILLS.forEach(function (k) {
        var bonus = bg && bg.bonus[k] ? bg.bonus[k] : 0;
        var row = el('div', { class: 'slider-row' }, [
          el('span', { class: 'sl-name', text: CoachData.SKILL_LABEL[k] }),
          el('input', { class: 'range', type: 'range', min: min, max: max, value: b.alloc[k],
            oninput: function (e) {
              var v = parseInt(e.target.value, 10);
              var delta = (v - base) - (b.alloc[k] - base);
              if (delta > 0 && delta > remaining()) v = base + (remaining() + (b.alloc[k] - base));
              b.alloc[k] = v; render(); commit();
            } }),
          el('span', { class: 'sl-val', text: b.alloc[k] + (bonus ? (' (+' + bonus + ')') : '') })
        ]);
        sliders.appendChild(row);
      });
      // header avatar preview
      preview.innerHTML = '';
      preview.appendChild(coachAvatar({ avatar: b.avatar, color: b.color }, 48));
      preview.appendChild(el('div', {}, [
        el('div', { class: 'card-title', text: b.name || '(unnamed coach)' }),
        el('div', { class: 'card-sub', text: (bg ? bg.name : '') })
      ]));
      commit();
    }

    var preview = el('div', { class: 'builder-preview' });

    wrap.appendChild(preview);
    wrap.appendChild(nameRow);
    wrap.appendChild(bgRow);
    wrap.appendChild(appearRow);
    wrap.appendChild(el('div', { class: 'form-row' }, [
      el('label', { text: 'Skill Allocation' }), poolLabel
    ]));
    wrap.appendChild(sliders);
    render();
    return wrap;
  }

  // ---- Screen: HQ ----------------------------------------------------------
  function renderHQ() {
    var s = E.state;
    var team = T.get(s.team.id) || { name: s.team.name, colors: ['#333','#777'], conf: '', city: '', st: '', prestige: 5, stadium: '', cap: 0, emoji: '🏈', nick: '' };
    var coach = s.coach;
    var power = E.teamPower(team, coach);

    document.documentElement.style.setProperty('--team-primary', team.colors[0]);
    document.documentElement.style.setProperty('--team-secondary', team.colors[1]);

    var hero = el('div', { class: 'hq-hero', style:
      'background:linear-gradient(135deg,' + team.colors[0] + ',' + shade(team.colors[0], -30) + ');' +
      'color:' + readable(team.colors[0]) + ';' }, [
      teamBadge(team, 72),
      el('div', { class: 'hq-hero-text' }, [
        el('div', { class: 'hq-eyebrow', text: (team.conf || 'FBS') + ' · ' + (team.city ? team.city + ', ' + team.st : '') }),
        el('h2', { class: 'hq-team', text: team.name + ' ' + team.nick }),
        el('div', { class: 'hq-coach' }, [
          coachAvatar(coach, 26),
          el('span', { text: 'Head Coach ' + coach.name + ' · ' + (s.career.year) + ' season' })
        ])
      ])
    ]);

    function stat(label, value, sub) {
      return el('div', { class: 'stat' }, [
        el('div', { class: 'stat-val', text: value }),
        el('div', { class: 'stat-label', text: label }),
        sub ? el('div', { class: 'stat-sub', text: sub }) : null
      ]);
    }

    var stats = el('div', { class: 'stat-grid' }, [
      stat('Program Power', power, 'prestige + staff'),
      stat('Reputation', s.career.reputation, 'career'),
      stat('Record', s.career.wins + '–' + s.career.losses, 'all-time'),
      stat('Prestige', team.prestige + '/10', 'program'),
      stat('Stadium', (team.cap ? (team.cap.toLocaleString()) : '—'), team.stadium || '')
    ]);

    function skillBar(k) {
      var v = coach.ratings[k];
      return el('div', { class: 'kv' }, [
        el('span', { class: 'kv-label', text: CoachData.SKILL_LABEL[k] }),
        el('span', { class: 'meter' }, [ el('span', { class: 'meter-fill', style: 'width:' + v + '%' }) ]),
        el('span', { class: 'kv-num', text: v })
      ]);
    }

    var coachPanel = el('div', { class: 'panel' }, [
      el('h3', { text: '🧢 Your Coach' }),
      el('p', { class: 'muted', text: coach.bio || '' }),
      el('div', { class: 'kv-list' }, CoachData.SKILLS.map(skillBar))
    ]);

    var rivals = (team.rivals || []).map(function (id) { return T.get(id); }).filter(Boolean);
    var rivalPanel = el('div', { class: 'panel' }, [
      el('h3', { text: '🔥 Rivals' }),
      rivals.length
        ? el('div', { class: 'rival-list' }, rivals.map(function (r) {
            return el('div', { class: 'rival' }, [ teamBadge(r, 28), el('span', { text: r.name }) ]);
          }))
        : el('p', { class: 'muted', text: 'No fixed rivals on file.' })
    ]);

    var nextPanel = el('div', { class: 'panel next-panel' }, [
      el('h3', { text: '📅 Season Hub' }),
      el('p', { class: 'muted', text: 'The weekly season engine arrives in Wave 2: schedule, sims, polls, and bowl bids. For now, your program office is set up and your career is saved.' }),
      el('div', { class: 'btn-row' }, [
        btn('💾 Save', 'ghost', function () { E.save(); toast('Career saved.'); }),
        btn('⬇ Export Save', 'ghost', function () {
          var t = E.serialize();
          navigator.clipboard && navigator.clipboard.writeText(t);
          prompt('Copy your save (also copied to clipboard):', t);
        }),
        btn('↩ Main Menu', 'ghost', function () { E.save(); renderTitle(); })
      ])
    ]);

    var screen = el('div', { class: 'screen hq' }, [
      hero, stats,
      el('div', { class: 'panel-grid' }, [coachPanel, rivalPanel]),
      nextPanel
    ]);
    mount(screen);
  }

  function toast(msg) {
    var t = el('div', { class: 'toast', text: msg });
    document.body.appendChild(t);
    requestAnimationFrame(function () { t.classList.add('show'); });
    setTimeout(function () { t.classList.remove('show'); setTimeout(function () { t.remove(); }, 300); }, 1600);
  }

  var GameUI = {
    // Entry point — routes based on saved/loaded state.
    render: function () {
      var s = E.state;
      if (!s) { renderTitle(); return; }
      switch (s.screen) {
        case 'hq': renderHQ(); break;
        default: renderTitle();
      }
    },
    renderTitle: renderTitle,
    renderHQ: renderHQ,
    teamBadge: teamBadge,
    toast: toast,
    // exposed for tests
    _pick: function () { return pick; }
  };

  window.GameUI = GameUI;
})();
