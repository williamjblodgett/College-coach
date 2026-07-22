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
  function mount(node, preserveScroll) {
    clear(); app().appendChild(node);
    if (!preserveScroll) window.scrollTo(0, 0);
  }

  // ---- team monogram / logo (drop-in image upgrade) ------------------------
  // Renders a color monogram badge; if images/logos/<id>.png exists it upgrades.
  function teamBadge(team, size) {
    size = size || 44;
    var wrap = el('span', { class: 'badge', style:
      'width:' + size + 'px;height:' + size + 'px;font-size:' + Math.round(size * 0.42) + 'px;' +
      'background:linear-gradient(135deg,' + team.colors[0] + ',' + shade(team.colors[0], -18) + ');' +
      'color:' + readable(team.colors[0]) + ';border:2px solid ' + team.colors[1] + ';' });
    if (window.GameCrests) wrap.appendChild(window.GameCrests.render(team, size));
    else wrap.appendChild(el('span', { class: 'badge-emoji', text: team.emoji || '🏈' }));
    // Imported programs intentionally use generated crests. Skip hundreds of
    // image probes while keeping the drop-in logo path for bundled teams.
    if (!team.generatedCrestOnly) {
      var img = new Image();
      img.className = 'badge-img';
      img.alt = team.name;
      img.onload = function () { wrap.classList.add('has-logo'); wrap.appendChild(img); };
      img.onerror = function () {};
      img.src = 'images/logos/' + team.id + '.png';
    }
    return wrap;
  }

  function coachAvatar(coach, size) {
    size = size || 44;
    var idx = typeof coach.portrait === 'number' ? coach.portrait : coachPortraitIndex(coach);
    idx = Math.max(0, Math.min(15, idx));
    var col = idx % 4, row = Math.floor(idx / 4), ring = coach.color || '#ffb400';
    return el('span', { class: 'coach-portrait', role: 'img', 'aria-label': (coach.name || 'Coach') + ' illustrated portrait',
      'data-portrait': idx, style:
      'width:' + size + 'px;height:' + size + 'px;' +
      'background-position:' + (col * 100 / 3) + '% ' + (row * 100 / 3) + '%;' +
      'border-color:' + ring + ';box-shadow:0 0 0 2px ' + mixHex(ring, '#000000', .48) + ',0 8px 20px rgba(0,0,0,.32);' });
  }

  function coachPortraitIndex(coach) {
    var key = String(coach.id || coach.name || coach.avatar || 'coach'), h = 0;
    for (var i = 0; i < key.length; i++) h = ((h * 31) + key.charCodeAt(i)) >>> 0;
    return h % 16;
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
    var relative = c.map(function (v) { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); });
    var l = .2126 * relative[0] + .7152 * relative[1] + .0722 * relative[2];
    var whiteContrast = 1.05 / (l + .05), blackContrast = (l + .05) / .05;
    return whiteContrast >= blackContrast ? '#ffffff' : '#111111';
  }
  function lum(c) { return 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]; }
  function toHex(c) { return '#' + c.map(function (v) { return ('0' + Math.max(0, Math.min(255, Math.round(v))).toString(16)).slice(-2); }).join(''); }
  function mixHex(base, tint, amount) {
    var a = hexToRgb(base), b = hexToRgb(tint);
    return toHex(a.map(function (v, i) { return v * (1 - amount) + b[i] * amount; }));
  }
  // Turn a (possibly dark) team color into a vibrant accent readable on the dark UI.
  function vividAccent(hex) {
    var c = hexToRgb(hex), guard = 0;
    while (lum(c) < 135 && guard++ < 12) c = c.map(function (v) { return v * 1.22 + 26; });
    // nudge saturation so navy/maroon don't wash to grey
    var mx = Math.max(c[0], c[1], c[2]), mn = Math.min(c[0], c[1], c[2]);
    if (mx - mn < 40) { /* low saturation — leave as a light neutral */ }
    return toHex(c);
  }
  // Apply the hired team's colors across the whole UI (accent + surfaces).
  function applyTheme(team) {
    var root = document.documentElement;
    if (!team || !team.colors) { resetTheme(); return; }
    var primary = team.colors[0], secondary = team.colors[1];
    // Primary drives interaction color; secondary remains a visible supporting
    // accent. Dark school colors are lifted enough to meet UI contrast needs.
    var a1 = vividAccent(primary), a2 = vividAccent(secondary);
    var accent = a1;
    root.style.setProperty('--accent', accent);
    root.style.setProperty('--accent-dark', shade(accent, -34));
    root.style.setProperty('--accent-ink', readable(accent));
    root.style.setProperty('--team-alt', a2);
    root.style.setProperty('--team-primary', primary);
    root.style.setProperty('--team-secondary', secondary);
    root.style.setProperty('--bg', mixHex('#080b12', primary, .11));
    root.style.setProperty('--bg-2', mixHex('#111725', primary, .15));
    root.style.setProperty('--panel', mixHex('#171e2b', primary, .14));
    root.style.setProperty('--panel-2', mixHex('#202a3b', primary, .18));
    root.style.setProperty('--line', mixHex('#303a50', primary, .22));
    var rgb = hexToRgb(primary);
    root.style.setProperty('--team-glow', 'rgba(' + rgb.join(',') + ',.28)');
    root.style.setProperty('--team-wash', 'rgba(' + rgb.join(',') + ',.14)');
    root.style.setProperty('--team-border', 'rgba(' + rgb.join(',') + ',.48)');
    document.querySelector('meta[name="theme-color"]') && document.querySelector('meta[name="theme-color"]').setAttribute('content', shade(primary, -40));
  }
  function resetTheme() {
    var root = document.documentElement;
    ['--accent','--accent-dark','--accent-ink','--team-alt','--team-primary','--team-secondary','--bg','--bg-2','--panel','--panel-2','--line','--team-glow','--team-wash','--team-border'].forEach(function (v) { root.style.removeProperty(v); });
    document.querySelector('meta[name="theme-color"]') && document.querySelector('meta[name="theme-color"]').setAttribute('content', '#0b0e14');
  }

  function btn(label, cls, on) {
    return el('button', { class: 'btn ' + (cls || ''), onclick: on }, [label]);
  }

  // ---- Screen: Title -------------------------------------------------------
  function renderTitle() {
    resetTheme();
    pick = { team: null, coachTab: 'real', build: null };
    var hasSave = E.hasSave();
    var card = el('div', { class: 'screen title-screen' }, [
      el('div', { class: 'title-hero-card' }, [
        el('div', { class: 'title-kicker', text: 'THE COMPLETE COLLEGE FOOTBALL UNIVERSE' }),
        el('div', { class: 'title-mark' }, [
        el('div', { class: 'title-emoji', text: '🏈' }),
        el('h1', { class: 'title-name', text: 'GRIDIRON DYNASTY' }),
        el('p', { class: 'title-sub', text: 'Recruit. Scheme. Survive the spotlight. Build a legacy.' })
        ]),
        el('div', { class: 'title-metrics' }, [
          el('div', { class: 'title-metric' }, [el('strong', { text: T.all().length }), el('span', { text: 'Programs' })]),
          el('div', { class: 'title-metric' }, [el('strong', { text: '4' }), el('span', { text: 'Divisions' })]),
          el('div', { class: 'title-metric' }, [el('strong', { text: '∞' }), el('span', { text: 'Dynasties' })])
        ])
      ]),
      el('div', { class: 'title-actions title-actions-primary' }, [
        hasSave ? btn('▶  Continue Career', 'primary big', function () {
          E.load(); GameUI.render();
        }) : null,
        btn(hasSave ? 'New Career' : '▶  New Career', hasSave ? '' : 'primary big', function () {
          if (hasSave && !confirm('Start a new career? Your current save will be replaced when you finish setup.')) return;
          renderTeamSelect();
        }),
      ]),
      el('div', { class: 'title-utility' }, [
        btn('Import Save', 'ghost', importSave),
        window.GameSaves ? btn('Dynasty Slots', 'ghost', renderSaveSlots) : null,
        window.GamePWA && !window.matchMedia('(display-mode: standalone)').matches ? btn('Install App', 'ghost', function () {
          if (!window.GamePWA.canInstall()) { toast('Use your browser menu and choose Install App or Add to Home Screen.'); return; }
          window.GamePWA.install();
        }) : null
      ]),
      el('div', { class: 'title-features' }, [
        el('span', { text: '🏈 4 divisions' }), el('span', { text: '🧑‍💼 assistant-to-legend careers' }),
        el('span', { text: '🌎 evolving worlds' }), el('span', { text: '📴 offline PWA' })
      ]),
      el('p', { class: 'title-foot', text: 'v2.5 · Coach Portrait Studio · ' + T.all().length + ' playable programs' })
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

  function downloadText(name, text) {
    var blob = new Blob([text], { type: 'application/json' });
    var url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 500);
  }

  function renderSaveSlots() {
    var Saves = window.GameSaves;
    var holder = el('div', { class: 'slot-list' }, [el('p', { class: 'muted', text: 'Loading dynasty slots…' })]);
    mount(el('div', { class: 'screen slots-screen' }, [
      el('div', { class: 'screen-head' }, [el('h2', { text: 'Dynasty Saves' }), el('p', { class: 'muted', text: 'Five named careers with rolling recovery snapshots.' })]),
      holder,
      el('div', { class: 'sticky-footer' }, [el('div', { class: 'sf-info', text: 'Autosaves retain five recovery points.' }), el('div', { class: 'sf-actions' }, [btn('Back', 'ghost', renderTitle)])])
    ]));
    Saves.list().then(function (slots) {
      var byId = {}; slots.forEach(function (slot) { byId[slot.id] = slot; }); holder.innerHTML = '';
      for (var i = 1; i <= Saves.MAX_SLOTS; i++) (function (id) {
        var slot = byId[id];
        if (!slot) {
          holder.appendChild(el('div', { class: 'slot-card empty' }, [
            el('div', { class: 'slot-main' }, [el('div', { class: 'card-title', text: 'Empty Slot ' + id.slice(-1) }), el('div', { class: 'muted', text: 'Begin a new coaching universe.' })]),
            btn('New Dynasty', 'primary', function () { Saves.setActive(id); E.clearSave(); renderTeamSelect(); })
          ])); return;
        }
        holder.appendChild(el('div', { class: 'slot-card' + (Saves.activeId() === id ? ' active' : '') }, [
          el('div', { class: 'slot-main' }, [
            el('div', { class: 'card-title', text: slot.name }),
            el('div', { class: 'card-sub', text: (slot.summary.coach || 'Coach') + ' · ' + (slot.summary.team || 'Unassigned') + ' · ' + slot.summary.year }),
            el('div', { class: 'muted slot-time', text: new Date(slot.updatedAt).toLocaleString() + ' · ' + (slot.snapshots || []).length + ' recovery saves' })
          ]),
          el('div', { class: 'slot-actions' }, [
            btn('Continue', 'primary', function () { Saves.loadSlot(id).then(function (state) { E.deserialize(state); E.save(); GameUI.render(); }).catch(function (e) { alert(e.message); }); }),
            btn('Rename', 'ghost', function () { var name = prompt('Dynasty name:', slot.name); if (name) Saves.renameSlot(id, name).then(renderSaveSlots); }),
            btn('Export', 'ghost', function () { Saves.exportSlot(id).then(function (raw) { downloadText('gridiron-' + id + '.json', raw); }); }),
            btn('Delete', 'ghost', function () { if (confirm('Delete ' + slot.name + '? Export it first if you may want it later.')) Saves.deleteSlot(id).then(renderSaveSlots); })
          ])
        ]));
      })('slot-' + i);
    }).catch(function () { holder.innerHTML = '<p class="muted">Save slots are unavailable in this browser. The legacy local save remains active.</p>'; });
  }

  // ---- Screen: Team Select -------------------------------------------------
  function renderTeamSelect() {
    var state = pick.teamFilters || { division: pick.division || 'fbs', conf: 'All', q: '', bottom: pick.startBottom || false, limit: 72 };
    pick.teamFilters = state;
    var confs = T.conferences(state.division);

    var list = el('div', { class: 'grid team-grid' });
    var subtitle = el('p', { class: 'muted select-count' });
    var more = btn('Show More Programs', 'ghost', function () { state.limit += 72; refresh(); });
    var moreWrap = el('div', { class: 'load-more' }, [more]);

    function refresh() {
      list.innerHTML = '';
      var teams = T.byDivision(state.division).filter(function (t) {
        if (state.bottom && t.prestige > 3) return false; // start-from-the-bottom
        if (state.conf !== 'All' && t.conf !== state.conf) return false;
        if (state.q) {
          var q = state.q.toLowerCase();
          if ((t.name + ' ' + t.nick + ' ' + t.city).toLowerCase().indexOf(q) < 0) return false;
        }
        return true;
      }).sort(function (a, b) { return a.name.localeCompare(b.name); });
      var visible = teams.slice(0, state.limit);
      subtitle.textContent = teams.length > visible.length ? ('Showing ' + visible.length + ' of ' + teams.length + ' programs') : (teams.length + ' program' + (teams.length === 1 ? '' : 's'));
      moreWrap.style.display = teams.length > visible.length ? '' : 'none';
      more.textContent = 'Show More Programs (' + (teams.length - visible.length) + ' remaining)';
      visible.forEach(function (t) {
        var stars = '★'.repeat(Math.round(t.prestige / 2)) + '☆'.repeat(5 - Math.round(t.prestige / 2));
        list.appendChild(el('button', {
          class: 'card team-card' + (pick.team && pick.team.id === t.id ? ' selected' : ''),
          style: '--card-primary:' + t.colors[0] + ';--card-secondary:' + t.colors[1] + ';',
          onclick: function () { pick.team = t; pick.preserveTeamScroll = true; renderTeamSelect(); }
        }, [
          teamBadge(t, 40),
          el('div', { class: 'card-body' }, [
            el('div', { class: 'team-card-head' }, [
              el('div', { class: 'card-title', text: t.name }),
              el('span', { class: 'team-tier', text: T.DIVISION_LABEL[t.div] })
            ]),
            el('div', { class: 'card-sub', text: t.nick + ' · ' + t.conf }),
            el('div', { class: 'card-meta', text: t.city + ', ' + t.st }),
            el('div', { class: 'card-stars', text: stars, title: 'Prestige ' + t.prestige + '/10' })
          ])
        ]));
      });
    }

    var confSel = el('select', { class: 'select', onchange: function (e) { state.conf = e.target.value; state.limit = 72; refresh(); } },
      [el('option', { value: 'All', text: 'All Conferences' })].concat(
        confs.map(function (c) { return el('option', { value: c, text: c }); })));
    confSel.value = state.conf;

    var search = el('input', { class: 'input', type: 'search', value: state.q, placeholder: 'Search all programs…',
      oninput: function (e) { state.q = e.target.value; state.limit = 72; refresh(); } });

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

    var modeToggle = el('div', { class: 'mode-toggle' }, [
      el('button', { class: 'chip' + (!state.bottom ? ' active' : ''), onclick: function () { state.bottom = false; pick.startBottom = false; refresh(); syncMode(); } }, ['🏛️ Established']),
      el('button', { class: 'chip' + (state.bottom ? ' active' : ''), onclick: function () { state.bottom = true; pick.startBottom = true; refresh(); syncMode(); } }, ['🌱 Start from the Bottom'])
    ]);
    function syncMode() {
      var chips = modeToggle.querySelectorAll('.chip');
      chips[0].className = 'chip' + (!state.bottom ? ' active' : '');
      chips[1].className = 'chip' + (state.bottom ? ' active' : '');
    }

    var divisionToggle = el('div', { class: 'mode-toggle division-toggle' }, [
      ['fbs','FBS'],['fcs','FCS'],['d2','Division II'],['d3','Division III']
    ].map(function (d) {
      return el('button', { class: 'chip' + (state.division === d[0] ? ' active' : ''), onclick: function () {
        pick.division = d[0]; pick.team = null; pick.teamFilters = { division: d[0], conf: 'All', q: '', bottom: state.bottom, limit: 72 }; renderTeamSelect();
      } }, [el('span', { text: d[1] }), el('small', { text: T.byDivision(d[0]).length })]);
    }));

    var screen = el('div', { class: 'screen' }, [
      el('div', { class: 'screen-head' }, [
        el('h2', { text: 'Choose Your Program' }),
        el('p', { class: 'muted', text: 'Pick a blue-blood and win now, or start at a bottom-tier program and climb the carousel.' })
      ]),
      el('div', { class: 'program-controls' }, [divisionToggle, modeToggle, el('div', { class: 'toolbar' }, [confSel, search, subtitle])]),
      list, moreWrap, footer
    ]);
    var keepTeamScroll = !!pick.preserveTeamScroll;
    pick.preserveTeamScroll = false;
    mount(screen, keepTeamScroll);
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
        coachAvatar(c, 64),
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
        background: c.background || c.archetype || '', avatar: c.avatar || '🧢', portrait: typeof c.portrait === 'number' ? c.portrait : coachPortraitIndex(c),
        color: c.color || '#c8102e', bio: c.bio || '',
        ratings: JSON.parse(JSON.stringify(c.ratings))
      };
    }

    function refresh() {
      body.innerHTML = '';
      if (pick.coachTab === 'custom') {
        pick.startRole = pick.startRole || 'assistant';
        body.appendChild(el('div', { class: 'role-picker panel' }, [
          el('h3', { text: 'Starting Role' }),
          el('p', { class: 'muted', text: 'Begin on a staff and earn a head-coaching interview, or take over a small program immediately.' }),
          el('div', { class: 'scandal-chips' }, [
            ['assistant','Assistant'],['oc','Offensive Coordinator'],['dc','Defensive Coordinator'],['headCoach','Small-School Head Coach']
          ].map(function (r) { return el('button', { class: 'chip' + (pick.startRole === r[0] ? ' active' : ''), onclick: function () { pick.startRole = r[0]; refresh(); } }, [r[1]]); }))
        ]));
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
          pick.coach.role = pick.coach.source === 'custom' ? (pick.startRole || 'assistant') : 'headCoach';
          if (pick.coach.source === 'custom' && pick.coach.role === 'headCoach' && pick.team && pick.team.prestige > 3) {
            alert('Created coaches begin as unknowns. Choose a prestige 1-3 program and earn bigger opportunities.');
            pick.startBottom = true;
            renderTeamSelect();
            return;
          }
          E.newCareer(pick.coach, pick.team);
          E.state.startMode = pick.startBottom ? 'bottom' : 'established';
          E.state.settings.scandalIntensity = pick.scandalIntensity || 'realistic';
          if (pick.startBottom) E.state.career.reputation = Math.max(30, E.state.career.reputation - 8);
          E.save();
          renderHQ();
        })
      ])
    ]);

    var scandalRow = window.GameScandal ? el('div', { class: 'setup-scandals' }, [
      el('span', { class: 'ss-label', text: '⚖️ Scandals:' }),
      scandalChips(function () { return pick.scandalIntensity || 'realistic'; }, function (v) { pick.scandalIntensity = v; })
    ]) : null;

    var screen = el('div', { class: 'screen' }, [
      el('div', { class: 'screen-head' }, [
        el('h2', { text: 'Choose Your Coach' }),
        el('p', { class: 'muted' }, [
          'Step 2 of 2 — coaching ', pick.team ? el('strong', { text: pick.team.name }) : 'your program', '.'
        ])
      ]),
      tabHolder, body, scandalRow, footer
    ]);
    mount(screen);
    refresh();
  }

  // Reusable scandal-intensity chip selector.
  function scandalChips(getVal, setVal) {
    var Scandal = window.GameScandal;
    var order = ['off', 'light', 'realistic', 'chaotic'];
    var row = el('div', { class: 'scandal-chips' });
    function draw() {
      row.innerHTML = '';
      order.forEach(function (k) {
        var cfg = Scandal.INTENSITY[k];
        row.appendChild(el('button', { class: 'chip' + (getVal() === k ? ' active' : ''),
          onclick: function () { setVal(k); draw(); } }, [cfg.label]));
      });
    }
    draw();
    return row;
  }

  // ---- Create-a-coach builder ----------------------------------------------
  function renderBuilder(onChange) {
    var base = CoachData.BUILDER_BASE, pool = CoachData.BUILDER_POOL;
    var min = CoachData.BUILDER_MIN, max = CoachData.BUILDER_MAX;

    if (!pick.build) {
      pick.build = {
        name: '', background: CoachData.backgrounds[0].id, portrait: 0,
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
        background: b.background, avatar: b.avatar, portrait: b.portrait, color: b.color,
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

    var appearRow = el('div', { class: 'form-row coach-appearance-row' }, [
      el('label', { text: 'Portrait & Accent' }),
      el('div', { class: 'appearance' }, [
        el('div', { class: 'portrait-picker' }, Array.from({ length: 16 }, function (_, i) {
          return el('button', { class: 'portrait-option' + (b.portrait === i ? ' active' : ''), 'data-portrait': i,
            title: 'Portrait ' + (i + 1), 'aria-label': 'Choose coach portrait ' + (i + 1),
            onclick: function () { b.portrait = i; render(); } }, [coachAvatar({ name: 'Portrait ' + (i + 1), portrait: i, color: b.color }, 58)]);
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
      preview.appendChild(coachAvatar({ name: b.name || 'Custom coach', avatar: b.avatar, portrait: b.portrait, color: b.color }, 76));
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
    if (window.GameProgram) window.GameProgram.ensureProgram(s);
    var rr = window.GameProgram && s.roster.length ? window.GameProgram.rosterRatings(s) : null;
    var power = rr ? rr.overall : E.teamPower(team, coach);

    applyTheme(team);

    var commandBar = el('nav', { class: 'command-bar', 'aria-label': 'Dynasty navigation' }, [
      el('div', { class: 'command-brand' }, [teamBadge(team, 38), el('div', {}, [
        el('strong', { text: team.name }), el('span', { text: s.career.year + ' · ' + (window.GameStory ? window.GameStory.roleLabel(s.career.role) : 'Head Coach') })
      ])]),
      el('div', { class: 'command-links' }, [
        btn('Roster', 'ghost', function () { renderRoster('hq'); }),
        btn('Staff', 'ghost', function () { renderStaff('hq'); }),
        window.GameWorld ? btn('News', 'ghost', renderNewsroom) : null,
        window.GameScandal ? btn('Settings', 'ghost', renderSettings) : null
      ])
    ]);

    var hero = el('div', { class: 'hq-hero', style:
      'background:linear-gradient(135deg,' + team.colors[0] + ',' + shade(team.colors[0], -30) + ');' +
      'color:' + readable(team.colors[0]) + ';' }, [
      teamBadge(team, 72),
      el('div', { class: 'hq-hero-text' }, [
        el('div', { class: 'hq-eyebrow', text: (team.conf || 'FBS') + ' · ' + (team.city ? team.city + ', ' + team.st : '') }),
        el('h2', { class: 'hq-team', text: team.name + ' ' + team.nick }),
        el('div', { class: 'hq-coach' }, [
          coachAvatar(coach, 26),
          el('span', { text: (window.GameStory ? window.GameStory.roleLabel(s.career.role) : 'Head Coach') + ' ' + coach.name + ' · ' + (s.career.year) + ' season' })
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
      stat('Roster OVR', power, rr ? ('OFF ' + rr.off + ' · DEF ' + rr.def) : 'prestige'),
      stat('Coach Level', s.career.coachLevel, 'ability ' + s.career.coachingAbility),
      stat('Recognition', s.career.nameRecognition, 'job market'),
      stat('Fame', s.career.fame, window.GameCareer ? window.GameCareer.fameLabel(s.career.fame) : 'career'),
      stat('Reputation', s.career.reputation, 'career'),
      stat('Record', s.career.wins + '–' + s.career.losses, 'all-time'),
      stat('NIL', s.program.nilLevel, 'level'),
      stat('Facilities', s.program.facilitiesLevel, 'level')
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
      el('div', { class: 'kv-list' }, CoachData.SKILLS.map(skillBar)),
      window.GameStory && s.career.badges.length ? el('div', { class: 'badge-strip' }, s.career.badges.map(function (id) {
        var b = window.GameStory.BADGES.filter(function (x) { return x.id === id; })[0];
        return el('span', { class: 'career-badge', title: b ? b.desc : '', text: b ? b.name : id });
      })) : el('p', { class: 'muted coach-note', text: 'Career badges unlock through distinctive achievements.' }),
      window.GameStory ? el('div', { class: 'relationship-row' }, Object.keys(s.career.relationships).map(function (key) {
        return el('span', { class: 'relationship-chip', text: key.toUpperCase() + ' ' + s.career.relationships[key] });
      })) : null
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

    var Season = window.GameSeason;
    var inProgress = s.season.started && s.season.phase !== 'preseason' && s.season.phase !== 'complete';
    var seasonCtaLabel = inProgress ? ('▶  Continue Season · ' + Season.phaseLabel(s))
      : ('🏈  Start the ' + s.career.year + ' Season');
    var lastYear = s.history.length ? s.history[s.history.length - 1] : null;

    var nextPanel = el('div', { class: 'panel next-panel' }, [
      el('h3', { text: '📅 Season Hub' }),
      inProgress
        ? el('p', { class: 'muted', text: 'Your season is underway — ' + Season.phaseLabel(s) + '. Record ' + s.season.record.wins + '–' + s.season.record.losses + '.' })
        : el('p', { class: 'muted', text: 'Set your program on the field: 12-game slate, weekly sims, the AP Top 25, conference title races, and a 12-team Playoff.' }),
      lastYear ? el('p', { class: 'muted', text: 'Last season (' + lastYear.year + '): ' + lastYear.wins + '–' + lastYear.losses +
        (lastYear.wonNatl ? ' · 🏆 National Champions' : (lastYear.wonConf ? ' · 🥇 Conference Champions' : (lastYear.finalRank ? ' · #' + lastYear.finalRank + ' final' : ''))) }) : null,
      el('div', { class: 'btn-row' }, [
        btn(seasonCtaLabel, 'primary', function () {
          Season.ensureStarted(s);
          s.screen = 'season';
          E.save();
          renderSeason();
        }),
        btn('📋 Roster', 'ghost', function () { renderRoster('hq'); }),
        btn('🧑‍🏫 Staff', 'ghost', function () { renderStaff('hq'); }),
        window.GameWorld ? btn('📰 Newsroom', 'ghost', function () { renderNewsroom(); }) : null,
        window.GameCareer ? btn('🛍️ Store', 'ghost', function () { renderStore('hq'); }) : null,
        window.GameScandal ? btn('⚙️ Settings', 'ghost', function () { renderSettings(); }) : null,
        btn('💾 Save', 'ghost', function () { E.save(); toast('Career saved.'); }),
        btn('⬇ Export', 'ghost', function () {
          var t = E.serialize();
          navigator.clipboard && navigator.clipboard.writeText(t);
          prompt('Copy your save (also copied to clipboard):', t);
        }),
        btn('↩ Menu', 'ghost', function () { E.save(); renderTitle(); })
      ])
    ]);

    // Compliance & AD panel (wave 6).
    var compliancePanel = null;
    if (window.GameScandal) {
      var Scandal = window.GameScandal;
      var band = Scandal.scrutinyBand(s);
      var integ = s.integrity;
      var sanctions = [];
      if (integ.showCause) sanctions.push('Show-cause penalty');
      if (integ.bowlBanUntil >= s.career.year) sanctions.push('Postseason ban (' + integ.bowlBanUntil + ')');
      if (integ.scholarshipPenalty > 0) sanctions.push('Scholarship reductions (' + integ.scholarshipPenalty + 'y)');
      if (integ.probation > 0) sanctions.push('Probation (' + integ.probation + 'y)');
      compliancePanel = el('div', { class: 'panel' }, [
        el('h3', { text: '🏛️ Compliance & AD' }),
        el('div', { class: 'comp-row' }, [
          el('span', { class: 'comp-label', text: 'Program Scrutiny' }),
          el('span', { class: 'scrutiny ' + band.cls, text: band.label })
        ]),
        el('div', { class: 'kv' }, [
          el('span', { class: 'kv-label', text: 'AD Trust' }),
          el('span', { class: 'meter' }, [el('span', { class: 'meter-fill', style: 'width:' + integ.adTrust + '%' })]),
          el('span', { class: 'kv-num', text: integ.adTrust })
        ]),
        window.GameCases ? el('div', { class: 'case-metrics' }, [
          el('span', { text: 'Media ' + integ.mediaPressure }),
          el('span', { text: 'Compliance ' + integ.complianceScore }),
          el('span', { text: 'Open cases ' + integ.openCases.length })
        ]) : null,
        sanctions.length
          ? el('div', { class: 'sanction-list' }, sanctions.map(function (x) { return el('div', { class: 'sanction-item', text: '⛔ ' + x }); }))
          : el('p', { class: 'muted', text: integ.openCases && integ.openCases.length ? 'A formal inquiry is active.' : 'Program in good standing.' }),
        window.GameCases ? btn('Open Case Files', 'ghost', function () { renderCaseFiles(); }) : null
      ]);
    }

    var contractBar = null;
    if (window.GameCareer) {
      window.GameCareer.ensureContract(s);
      contractBar = el('div', { class: 'contract-bar' }, [
        el('span', { class: 'cb-item', text: '💼 $' + s.contract.salary + 'M/yr' }),
        el('span', { class: 'cb-item', text: '📄 ' + s.contract.yearsLeft + ' yrs left' }),
        el('span', { class: 'cb-item', text: '💰 Wallet $' + (s.career.wallet || 0).toFixed(1) + 'M' })
      ]);
    }

    var screen = el('div', { class: 'screen hq' }, [
      commandBar, hero, stats, contractBar,
      el('div', { class: 'panel-grid' }, [coachPanel, rivalPanel]),
      compliancePanel, nextPanel
    ]);
    mount(screen);
  }

  // ---- Living world newsroom ----------------------------------------------
  function renderNewsroom() {
    var s=E.state,W=window.GameWorld,w=W.ensure(s),records=w.records||{};
    applyTheme(T.get(s.team.id));
    var news=(w.news||[]).slice(0,30), moves=(w.realignment||[]).slice().reverse();
    var recordRows=Object.keys(records).map(function(key){var r=records[key],team=T.get(r.teamId);return el('div',{class:'news-row'},[
      el('span',{class:'news-kind',text:key.replace(/([A-Z])/g,' $1').toUpperCase()}),
      el('span',{class:'news-copy',text:r.player+' · '+r.value+' · '+(team?team.name:'')+' '+r.year})
    ]);});
    var screen=el('div',{class:'screen newsroom'},[
      el('div',{class:'screen-head'},[el('h2',{text:'College Football Newsroom'}),el('p',{class:'muted',text:'Your dynasty remembers championships, coaching moves, records, rivalries, and conference shifts.'})]),
      el('div',{class:'panel'},[el('h3',{text:'Latest Headlines'})].concat(news.length?news.map(function(n){var team=n.teamId&&T.get(n.teamId);return el('article',{class:'news-story'},[
        el('div',{class:'news-kicker',text:n.year+(n.week?' · Week '+n.week:'')+' · '+n.kind.toUpperCase()}),
        el('div',{class:'card-title',text:n.headline}),el('p',{class:'muted',text:n.detail+(team?' · '+team.name:'')})
      ]);}):[el('p',{class:'muted',text:'The first headlines will arrive as your dynasty unfolds.'})])),
      el('div',{class:'panel-grid'},[
        el('div',{class:'panel'},[el('h3',{text:'Program Record Book'})].concat(recordRows.length?recordRows:[el('p',{class:'muted',text:'Individual records begin after your first season.'})])),
        el('div',{class:'panel'},[el('h3',{text:'Realignment History'})].concat(moves.length?moves.map(function(m){var up=T.get(m.up),down=T.get(m.down);return el('div',{class:'news-row',text:m.year+' · '+(up?up.name:m.up)+' → '+m.to+' · '+(down?down.name:m.down)+' → '+m.from});}):[el('p',{class:'muted',text:'Conference maps have held—for now.'})]))
      ]),
      el('div',{class:'sticky-footer'},[el('div',{class:'sf-info'},[el('span',{text:(w.news||[]).length+' archived stories · '+Object.keys(w.rivalries||{}).length+' tracked rivalries'})]),el('div',{class:'sf-actions'},[btn('← Back to HQ','primary',function(){renderHQ();})])])
    ]);
    mount(screen);
  }

  function renderCaseFiles() {
    var s=E.state,C=window.GameCases,i=C.ensure(s),open=i.openCases||[],history=i.caseHistory||[];
    applyTheme(T.get(s.team.id));
    function caseRow(c,closed){return el('article',{class:'case-file '+(closed?'closed':'open')},[
      el('div',{class:'case-file-head'},[el('span',{class:'sc-flag',text:(closed?'CLOSED':'ACTIVE')+' · '+c.category}),el('span',{class:'scrutiny '+(c.verdict&&c.verdict.severity==='severe'?'bad':'ok'),text:closed?(c.verdict&&c.verdict.severity||'cleared'):c.stage})]),
      el('div',{class:'card-title',text:c.title}),
      el('p',{class:'muted',text:'Opened '+c.openedYear+' · Week '+c.openedWeek+' · Evidence '+c.evidence+' · '+(c.choices||[]).length+' recorded decisions'}),
      c.verdict&&c.verdict.sanctions?el('div',{class:'sanction-list'},c.verdict.sanctions.map(function(x){return el('div',{class:'sanction-item',text:x});})):null
    ]);}
    var screen=el('div',{class:'screen cases-screen'},[
      el('div',{class:'screen-head'},[el('h2',{text:'Compliance Case Files'}),el('p',{class:'muted',text:'Investigations persist across weeks. Cooperation, evidence, media pressure, staff trust, and appeals shape the outcome.'})]),
      el('div',{class:'stat-grid'},[
        el('div',{class:'stat'},[el('div',{class:'stat-val',text:open.length}),el('div',{class:'stat-label',text:'Open Cases'})]),
        el('div',{class:'stat'},[el('div',{class:'stat-val',text:i.mediaPressure}),el('div',{class:'stat-label',text:'Media Pressure'})]),
        el('div',{class:'stat'},[el('div',{class:'stat-val',text:i.complianceScore}),el('div',{class:'stat-label',text:'Compliance'})]),
        el('div',{class:'stat'},[el('div',{class:'stat-val',text:s.career.redemption||0}),el('div',{class:'stat-label',text:'Reform Seasons'})])
      ]),
      el('div',{class:'panel'},[el('h3',{text:'Active Investigations'})].concat(open.length?open.map(function(c){return caseRow(c,false);}):[el('p',{class:'muted',text:'No active formal cases.'})])),
      el('div',{class:'panel redemption-panel'},[el('h3',{text:'Reform & Redemption'}),el('p',{class:'muted',text:'Invest 8 offseason points in independent oversight, player welfare, and community trust. Open cases must be resolved first.'}),btn('Launch Reform Program','primary',function(){var r=C.runRedemptionProgram(s);if(!r.ok){toast(r.reason);return;}E.save();toast('Reform initiative launched.');renderCaseFiles();})]),
      el('div',{class:'panel'},[el('h3',{text:'Closed Cases'})].concat(history.length?history.map(function(c){return caseRow(c,true);}):[el('p',{class:'muted',text:'No completed case history.'})])),
      el('div',{class:'sticky-footer'},[el('div',{class:'sf-info'},[el('span',{text:(s.career.ethicsHistory||[]).length+' career rulings follow your coach'})]),el('div',{class:'sf-actions'},[btn('← Back to HQ','primary',renderHQ)])])
    ]);mount(screen);
  }

  // ---- Season Hub (Wave 2) -------------------------------------------------
  var seasonTab = 'week';
  var lastWeekResult = null; // {week, games, playerGame} from the most recent sim

  function rec(L) { return (L ? L.w + '–' + L.l : '0–0'); }

  // Small scoreboard card for a single matchup (away @ home, winner bolded).
  function miniGame(g, opts) {
    opts = opts || {};
    var home = T.get(g.home), away = T.get(g.away);
    if (!home || !away) return el('div');
    var hs = g.homeScore, as = g.awayScore;
    var homeWon = g.played && hs > as;
    function side(team, score, won, atHome) {
      return el('div', { class: 'sb-side' + (g.played && won ? ' win' : '') + (g.played && !won ? ' lose' : '') }, [
        teamBadge(team, 26),
        el('span', { class: 'sb-name', text: (opts.rank && opts.rank[team.id] ? '#' + opts.rank[team.id] + ' ' : '') + team.name }),
        el('span', { class: 'sb-score', text: g.played ? String(score) : '' })
      ]);
    }
    return el('div', { class: 'scorecard' + (opts.player ? ' player' : '') }, [
      opts.label ? el('div', { class: 'sb-label', text: opts.label }) : (g.bowlName ? el('div', { class: 'sb-label', text: g.bowlName }) : (g.tag ? el('div', { class: 'sb-label', text: g.tag }) : null)),
      side(away, as, g.played && !homeWon, false),
      side(home, hs, homeWon, true),
      el('div', { class: 'sb-meta', text: g.neutral ? 'neutral site' : (away.name + ' at ' + home.name) })
    ]);
  }

  function subTabs(active, onPick) {
    var tabs = [['week', 'This Week'], ['recruiting', 'Recruiting'], ['schedule', 'Schedule'], ['rankings', 'Top 25'], ['standings', 'Standings']];
    return el('div', { class: 'tabs season-tabs' }, tabs.map(function (t) {
      return el('button', { class: 'tab' + (active === t[0] ? ' active' : ''),
        onclick: function () { onPick(t[0]); } }, [t[1]]);
    }));
  }

  function seasonHero(s) {
    var team = T.get(s.team.id) || { name: s.team.name, colors: ['#333', '#777'], nick: '', conf: 'FBS', city: '', st: '' };
    var Season = window.GameSeason;
    var myRank = s.season.rankings.indexOf(s.team.id);
    return el('div', { class: 'hq-hero', style:
      'background:linear-gradient(135deg,' + team.colors[0] + ',' + shade(team.colors[0], -30) + ');color:' + readable(team.colors[0]) + ';' }, [
      teamBadge(team, 64),
      el('div', { class: 'hq-hero-text' }, [
        el('div', { class: 'hq-eyebrow', text: s.career.year + ' Season · ' + Season.phaseLabel(s) }),
        el('h2', { class: 'hq-team', text: team.name + ' ' + team.nick }),
        el('div', { class: 'hq-coach' }, [
          el('span', { text: 'Record ' + s.season.record.wins + '–' + s.season.record.losses +
            '  (' + s.season.record.confWins + '–' + s.season.record.confLosses + ' conf)' +
            (myRank >= 0 && myRank < 25 ? '  ·  AP #' + (myRank + 1) : '') })
        ])
      ])
    ]);
  }

  function renderSeason() {
    var s = E.state;
    var Season = window.GameSeason;
    Season.ensureStarted(s);
    s.screen = 'season';

    var team = T.get(s.team.id);
    if (team) applyTheme(team);

    var content = el('div', { class: 'season-content' });
    function pick(tab) { seasonTab = tab; draw(); }

    function draw() {
      content.innerHTML = '';
      if (seasonTab === 'week') content.appendChild(weekTab());
      else if (seasonTab === 'recruiting') content.appendChild(recruitingTab());
      else if (seasonTab === 'schedule') content.appendChild(scheduleTab());
      else if (seasonTab === 'rankings') content.appendChild(rankingsTab());
      else if (seasonTab === 'standings') content.appendChild(standingsTab());
      tabHolder.innerHTML = '';
      tabHolder.appendChild(subTabs(seasonTab, pick));
    }

    var rankMap = function () {
      var m = {}; s.season.rankings.forEach(function (id, i) { if (i < 25) m[id] = i + 1; }); return m;
    };

    // -- This Week / advance controls --
    function scandalCard(ev) {
      var Scandal = window.GameScandal;
      return el('div', { class: 'scandal-card' }, [
        el('div', { class: 'sc-flag', text: '⚠️ ' + ev.category }),
        el('div', { class: 'sc-title', text: ev.title }),
        el('div', { class: 'sc-blurb', text: ev.blurb }),
        el('div', { class: 'sc-options' }, ev.options.map(function (o) {
          return el('button', { class: 'dc-opt' + (o.risky ? ' risky' : ''), onclick: function () {
            Scandal.resolve(s, o.id); E.save();
            if (s.integrity.fired) { renderFired(); return; }
            draw(); refreshHero();
          } }, [
            el('div', { class: 'dc-opt-label', text: o.label }),
            el('div', { class: 'dc-opt-desc', text: o.desc })
          ]);
        }))
      ]);
    }

    function caseDecisionCard(p) {
      return el('div', { class: 'scandal-card case-decision' }, [
        el('div', { class: 'sc-flag', text: '📂 FORMAL CASE · ' + p.phase.toUpperCase() }),
        el('div', { class: 'sc-title', text: p.title }),
        el('div', { class: 'sc-blurb', text: p.prompt }),
        el('div', { class: 'sc-options' }, p.options.map(function (o) {
          return el('button', { class: 'dc-opt' + (o.risky ? ' risky' : ''), onclick: function () {
            window.GameCases.resolve(s, o.id); E.save();
            if (s.integrity.fired) { renderFired(); return; }
            draw(); refreshHero();
          } }, [el('div', { class: 'dc-opt-label', text: o.label }), el('div', { class: 'dc-opt-desc', text: o.desc })]);
        }))
      ]);
    }

    function weekTab() {
      var wrap = el('div');
      var phase = s.season.phase;

      // A pending compliance/scandal decision takes priority.
      var Scandal = window.GameScandal;
      var pendingCase = window.GameCases && window.GameCases.pending(s);
      if (pendingCase) wrap.appendChild(caseDecisionCard(pendingCase));
      var pendingScandal = Scandal && Scandal.pendingEvent(s);
      if (pendingScandal && !pendingCase) wrap.appendChild(scandalCard(pendingScandal));
      var pendingPress = window.GameStory && window.GameStory.pending(s);
      if (pendingPress) wrap.appendChild(el('div', { class: 'press-card' }, [
        el('div', { class: 'sc-flag', text: 'PRESS CONFERENCE' }),
        el('div', { class: 'sc-title', text: pendingPress.title }),
        el('div', { class: 'sc-blurb', text: pendingPress.prompt }),
        el('div', { class: 'sc-options' }, pendingPress.options.map(function (o) { return el('button', { class: 'dc-opt', onclick: function () { window.GameStory.resolvePress(s, o.id); E.save(); draw(); } }, [
          el('div', { class: 'dc-opt-label', text: o.label }), el('div', { class: 'dc-opt-desc', text: o.desc })
        ]); }))
      ]));

      // Postseason-ban notice.
      if (Scandal && Scandal.postseasonBanned(s)) {
        wrap.appendChild(el('div', { class: 'ban-note', text: '🚫 Program is under a postseason ban this season.' }));
      }

      // Show the most recent simmed week's result, if any.
      if (lastWeekResult && lastWeekResult.playerGame) {
        var pg = lastWeekResult.playerGame;
        var won = pg.winner === s.team.id;
        wrap.appendChild(el('div', { class: 'result-banner ' + (won ? 'win' : 'loss') }, [
          el('div', { class: 'rb-tag', text: 'Week ' + lastWeekResult.week + ' Result' }),
          el('div', { class: 'rb-line', text: (won ? 'W  ' : 'L  ') +
            (pg.home === s.team.id ? pg.homeScore + '–' + pg.awayScore : pg.awayScore + '–' + pg.homeScore) +
            '  vs ' + (T.get(pg.home === s.team.id ? pg.away : pg.home) || {}).name })
        ]));
      }

      if (phase === 'regular') {
        var wk = s.season.week;
        var myGame = Season.gamesInWeek(s, wk).filter(function (g) { return g.home === s.team.id || g.away === s.team.id; })[0];
        wrap.appendChild(el('h3', { class: 'sec-title', text: 'Week ' + wk + ' of ' + s.season.totalRegWeeks }));
        if (myGame) {
          var opp = T.get(myGame.home === s.team.id ? myGame.away : myGame.home);
          var atHome = myGame.home === s.team.id;
          var oppL = s.season.league[opp.id];
          wrap.appendChild(el('div', { class: 'matchup' }, [
            el('div', { class: 'matchup-head', text: (myGame.rivalry ? '🔥 Rivalry · ' : (myGame.conf ? 'Conference · ' : 'Non-Conference · ')) + (atHome ? 'HOME' : 'AWAY') }),
            el('div', { class: 'matchup-body' }, [
              teamBadge(opp, 48),
              el('div', {}, [
                el('div', { class: 'card-title', text: (atHome ? 'vs ' : 'at ') + opp.name + ' ' + opp.nick }),
                el('div', { class: 'card-sub', text: opp.conf + ' · ' + rec(oppL) + ' · rating ' + oppL.rating +
                  (s.season.rankings.indexOf(opp.id) >= 0 && s.season.rankings.indexOf(opp.id) < 25 ? ' · AP #' + (s.season.rankings.indexOf(opp.id) + 1) : '') })
              ])
            ])
          ]));
          if (window.GameTactics) {
            var tactical = window.GameTactics, forecast = myGame.weather || tactical.forecast(s, myGame);
            wrap.appendChild(el('div', { class: 'panel game-plan' }, [
              el('h4', { text: 'Weekly Game Plan' }),
              el('p', { class: 'muted forecast', text: forecast.kind + ' · ' + forecast.temp + '°F · wind ' + forecast.wind + ' mph' }),
              el('div', { class: 'mode-toggle' }, Object.keys(tactical.PLANS).map(function (id) {
                var plan=tactical.PLANS[id];
                return el('button', { class: 'chip' + (s.season.gamePlan === id ? ' active' : ''), title: plan.desc, onclick: function () { tactical.setPlan(s,id); E.save(); draw(); } }, [plan.name]);
              })),
              el('p', { class: 'muted', text: tactical.PLANS[s.season.gamePlan || 'balanced'].desc })
            ]));
          }
        } else {
          wrap.appendChild(el('p', { class: 'muted', text: 'BYE week — no game scheduled.' }));
        }
        var weekBtns = [];
        if (myGame) {
          weekBtns.push(btn('🏟️  Coach This Game', 'primary big', function () { renderGameDay(); }));
          weekBtns.push(btn('⚡  Quick Sim', 'ghost', function () {
            lastWeekResult = Season.simWeek(s); E.save(); draw(); refreshHero();
          }));
        } else {
          weekBtns.push(btn('▶  Advance Week ' + wk, 'primary big', function () {
            lastWeekResult = Season.simWeek(s); E.save(); draw(); refreshHero();
          }));
        }
        weekBtns.push(btn('⏩  Sim to Postseason', 'ghost', function () {
          while (s.season.phase === 'regular') lastWeekResult = Season.simWeek(s);
          E.save(); draw(); refreshHero();
        }));
        wrap.appendChild(el('div', { class: 'btn-row' }, weekBtns));
        // Top games this week (already-played previous week shown via banner; here show scoreboard of last simmed week).
        if (lastWeekResult && lastWeekResult.games) {
          wrap.appendChild(el('h4', { class: 'sec-sub', text: 'Week ' + lastWeekResult.week + ' scoreboard' }));
          wrap.appendChild(scoreboardGrid(topGames(lastWeekResult.games, 8)));
        }
      } else if (phase === 'confchamp') {
        wrap.appendChild(el('h3', { class: 'sec-title', text: 'Conference Championship Week' }));
        wrap.appendChild(el('p', { class: 'muted', text: 'The regular season is in the books. Conference title games are set.' }));
        wrap.appendChild(el('div', { class: 'btn-row' }, [
          btn('🏟️  Play Championship Games', 'primary big', function () {
            var games = Season.playConfChamps(s); E.save();
            lastWeekResult = null; draw(); refreshHero();
            var mine = games.filter(function (g) { return g.home === s.team.id || g.away === s.team.id; })[0];
            if (mine) toast(mine.winner === s.team.id ? '🥇 You won your conference!' : 'Fell short in the title game.');
          })
        ]));
      } else if (phase === 'postseason') {
        wrap.appendChild(el('h3', { class: 'sec-title', text: 'Playoff & Bowl Season' }));
        var champConf = Object.keys(s.season.postseason.confChamps).filter(function (c) { return s.season.postseason.confChamps[c] === s.team.id; })[0];
        if (champConf) wrap.appendChild(el('div', { class: 'result-banner win' }, [el('div', { class: 'rb-line', text: '🥇 ' + champConf + ' Champions!' })]));
        wrap.appendChild(el('p', { class: 'muted', text: 'The 12-team College Football Playoff bracket and the bowl slate are ready.' }));
        wrap.appendChild(el('div', { class: 'btn-row' }, [
          btn('🏆  Run the Playoff & Bowls', 'primary big', function () {
            Season.playPostseason(s); E.save(); draw(); refreshHero();
          })
        ]));
      } else if (phase === 'complete') {
        wrap.appendChild(bracketView());
      }
      return wrap;
    }

    function topGames(games, n) {
      // Prioritize the player's game, then ranked matchups.
      var rk = {}; s.season.rankings.forEach(function (id, i) { rk[id] = i; });
      return games.slice().sort(function (a, b) {
        var ap = (a.home === s.team.id || a.away === s.team.id) ? -1 : Math.min(rk[a.home], rk[a.away]);
        var bp = (b.home === s.team.id || b.away === s.team.id) ? -1 : Math.min(rk[b.home], rk[b.away]);
        return ap - bp;
      }).slice(0, n);
    }

    function scoreboardGrid(games) {
      var rk = rankMap();
      return el('div', { class: 'scoreboard' }, games.map(function (g) {
        return miniGame(g, { rank: rk, player: g.home === s.team.id || g.away === s.team.id });
      }));
    }

    // -- Postseason bracket + champion --
    function bracketView() {
      var ps = s.season.postseason;
      var wrap = el('div');
      if (ps.champion) {
        var champ = T.get(ps.champion);
        var iAmChamp = ps.champion === s.team.id;
        wrap.appendChild(el('div', { class: 'champ-banner' + (iAmChamp ? ' mine' : '') }, [
          el('div', { class: 'trophy', text: '🏆' }),
          el('div', {}, [
            el('div', { class: 'champ-label', text: 'National Champion' }),
            el('div', { class: 'champ-name', text: champ ? champ.name + ' ' + champ.nick : '' }),
            iAmChamp ? el('div', { class: 'champ-you', text: 'YOU DID IT!' }) : null
          ])
        ]));
      }
      var rk = rankMap();
      function round(title, games) {
        if (!games || !games.length) return null;
        return el('div', { class: 'bracket-round' }, [
          el('h4', { class: 'sec-sub', text: title }),
          el('div', { class: 'scoreboard' }, games.map(function (g) { return miniGame(g, { rank: rk, player: g.home === s.team.id || g.away === s.team.id }); }))
        ]);
      }
      var bk = ps.bracket;
      if (bk && bk.final) {
        wrap.appendChild(round('National Championship', [bk.final]));
        wrap.appendChild(round('Semifinals', bk.semis));
        wrap.appendChild(round('Quarterfinals', bk.quarters));
        wrap.appendChild(round('First Round', bk.firstRound));
      }
      if (ps.bowls && ps.bowls.length) {
        wrap.appendChild(el('h4', { class: 'sec-sub', text: 'Bowl Games' }));
        wrap.appendChild(el('div', { class: 'scoreboard' }, ps.bowls.slice(0, 12).map(function (g) {
          return miniGame(g, { rank: rk, player: g.home === s.team.id || g.away === s.team.id });
        })));
      }
      // Did the player win a trophy worth a ceremony?
      var title = playerTitleResult(s);
      var finishToSummary = function () {
        var summary = Season.finish(s); E.save(); lastWeekResult = null; seasonTab = 'week';
        renderSeasonSummary(summary);
      };
      wrap.appendChild(el('div', { class: 'btn-row', style: 'margin-top:16px' }, [
        title
          ? btn('🏆  ' + (title.kind === 'natl' ? 'Championship Ceremony' : 'Trophy Presentation') + '  →', 'primary big',
              function () { renderChampionship(title, finishToSummary); })
          : btn('📜  Finish Season & View Summary', 'primary big', finishToSummary)
      ]));
      return wrap;
    }

    // -- Schedule tab --
    function scheduleTab() {
      var games = Season.playerGames(s);
      var rk = rankMap();
      var rows = games.map(function (g) {
        var opp = T.get(g.home === s.team.id ? g.away : g.home);
        var atHome = g.home === s.team.id;
        var res = '';
        var cls = 'sch-row';
        if (g.played) {
          var won = g.winner === s.team.id;
          cls += won ? ' won' : ' lost';
          res = (won ? 'W ' : 'L ') + (atHome ? g.homeScore + '–' + g.awayScore : g.awayScore + '–' + g.homeScore);
        }
        return el('div', { class: cls }, [
          el('span', { class: 'sch-wk', text: 'Wk ' + g.week }),
          teamBadge(opp, 24),
          el('span', { class: 'sch-opp', text: (atHome ? 'vs ' : '@ ') + (rk[opp.id] ? '#' + rk[opp.id] + ' ' : '') + opp.name }),
          el('span', { class: 'sch-tag', text: g.rivalry ? '🔥' : (g.conf ? 'conf' : '') }),
          el('span', { class: 'sch-res', text: res })
        ]);
      });
      // Append postseason games the player is in.
      Season.playerPostseasonGames(s).forEach(function (g) {
        var opp = T.get(g.home === s.team.id ? g.away : g.home);
        var won = g.winner === s.team.id;
        rows.push(el('div', { class: 'sch-row ' + (won ? 'won' : 'lost') }, [
          el('span', { class: 'sch-wk', text: '🏆' }),
          teamBadge(opp, 24),
          el('span', { class: 'sch-opp', text: (g.bowlName || 'Postseason') + ' vs ' + opp.name }),
          el('span', { class: 'sch-tag', text: '' }),
          el('span', { class: 'sch-res', text: (won ? 'W ' : 'L ') + Math.max(g.homeScore, g.awayScore) + '–' + Math.min(g.homeScore, g.awayScore) })
        ]));
      });
      return el('div', { class: 'panel' }, [el('h3', { text: 'Your Schedule' })].concat(rows));
    }

    // -- Rankings tab --
    function rankingsTab() {
      var top = s.season.rankings.slice(0, 25);
      var rows = top.map(function (id, i) {
        var t = T.get(id), L = s.season.league[id];
        return el('div', { class: 'rank-row' + (id === s.team.id ? ' mine' : '') }, [
          el('span', { class: 'rank-no', text: (i + 1) }),
          teamBadge(t, 24),
          el('span', { class: 'rank-name', text: t.name }),
          el('span', { class: 'rank-conf', text: t.conf }),
          el('span', { class: 'rank-rec', text: rec(L) + (L.champ ? ' 🥇' : '') })
        ]);
      });
      return el('div', { class: 'panel' }, [el('h3', { text: 'AP Top 25 · ' + window.GameSeason.phaseLabel(s) })].concat(rows));
    }

    // -- Standings tab (player's conference) --
    function standingsTab() {
      var team = T.get(s.team.id);
      var confTeams = T.byConference(team.conf).filter(function (t) { return t.div === team.div; });
      confTeams.sort(function (a, b) { return window.GameSeason._confSort(s.season.league, a.id, b.id); });
      var rk = rankMap();
      var rows = confTeams.map(function (t, i) {
        var L = s.season.league[t.id];
        return el('div', { class: 'stand-row' + (t.id === s.team.id ? ' mine' : '') }, [
          el('span', { class: 'stand-no', text: (i + 1) }),
          teamBadge(t, 22),
          el('span', { class: 'stand-name', text: (rk[t.id] ? '#' + rk[t.id] + ' ' : '') + t.name }),
          el('span', { class: 'stand-conf', text: L.cw + '–' + L.cl }),
          el('span', { class: 'stand-ovr', text: L.w + '–' + L.l + (L.champ ? ' 🥇' : '') })
        ]);
      });
      return el('div', { class: 'panel' }, [
        el('h3', { text: team.conf + ' Standings' }),
        el('div', { class: 'stand-head' }, [
          el('span', { class: 'stand-no', text: '#' }), el('span', {}), el('span', { class: 'stand-name', text: 'Team' }),
          el('span', { class: 'stand-conf', text: 'Conf' }), el('span', { class: 'stand-ovr', text: 'Overall' })
        ])
      ].concat(rows));
    }

    // -- Recruiting tab --
    function recruitingTab() {
      var P = window.GameProgram;
      P.ensureProgram(s);
      var rec = s.recruiting;
      var commits = P.commitList(s);
      var summary = P.classSummary(commits.map(function (c) { return { stars: c.stars, proj: c.proj }; }));
      var wrap = el('div');

      wrap.appendChild(el('div', { class: 'rec-head' }, [
        el('div', { class: 'rec-stat' }, [el('div', { class: 'rec-val', text: rec.points }), el('div', { class: 'rec-lbl', text: 'Points' })]),
        el('div', { class: 'rec-stat' }, [el('div', { class: 'rec-val', text: commits.length }), el('div', { class: 'rec-lbl', text: 'Commits' })]),
        el('div', { class: 'rec-stat' }, [el('div', { class: 'rec-val', text: summary.score }), el('div', { class: 'rec-lbl', text: 'Class Score' })]),
        el('div', { class: 'rec-stat' }, [el('div', { class: 'rec-val', text: 'NIL ' + s.program.nilLevel }), el('div', { class: 'rec-lbl', text: 'Level' })])
      ]));

      if (rec.signed) {
        wrap.appendChild(el('p', { class: 'muted', text: 'Signing day is done — this class is locked. New prospects open up next season.' }));
      } else {
        wrap.appendChild(el('p', { class: 'rec-note', text: 'Spend recruiting points on prospects to raise their lean. Land them before rivals do — high-star recruits are harder for smaller programs. Class locks at signing day.' }));
      }

      if (commits.length) {
        wrap.appendChild(el('h4', { class: 'sec-sub', text: '✅ Your Commits (' + commits.length + ')' }));
        wrap.appendChild(el('div', { class: 'commit-strip' }, commits.map(function (p) {
          return el('div', { class: 'commit-chip' }, [
            el('span', { class: 'stars s' + p.stars, text: '★'.repeat(p.stars) }),
            el('span', { class: 'commit-pos', text: p.pos }),
            el('span', { class: 'commit-name', text: p.name })
          ]);
        })));
      }

      wrap.appendChild(el('h4', { class: 'sec-sub', text: 'Recruiting Board' }));
      var list = el('div', { class: 'board' });
      var open = rec.board.filter(function (p) { return p.status === 'open'; }).slice(0, 40);
      if (!open.length) list.appendChild(el('p', { class: 'muted', text: 'No open prospects remain on the board.' }));
      open.forEach(function (p) {
        var leanPct = Math.round(p.lean);
        var pitch = P.pitchGrade(s, p);
        var row = el('div', { class: 'board-row' }, [
          el('span', { class: 'br-rank', text: '#' + p.rank }),
          el('span', { class: 'stars s' + p.stars, text: '★'.repeat(p.stars) }),
          el('span', { class: 'br-pos', text: p.pos }),
          el('span', { class: 'br-name' }, [
            el('span', { text: p.name }),
            el('span', { class: 'br-home muted', text: p.hometown ? (p.hometown + ', ' + p.state + ' / ' + p.highSchool) : 'Fictional prospect' }),
            el('span', { class: 'br-fit', text: pitch.label + ': ' + pitch.letter + (p.visited ? ' · Visited' : '') })
          ]),
          el('span', { class: 'br-ovr', text: p.proj }),
          el('span', { class: 'br-lean' }, [el('span', { class: 'br-lean-fill', style: 'width:' + leanPct + '%' })]),
          rec.signed ? null : el('span', { class: 'br-actions' }, [
            el('button', { class: 'btn br-btn', disabled: rec.points <= 0 ? 'disabled' : null, onclick: function () {
              var res = P.recruitEffort(s, p.id, Math.min(4, rec.points));
              if (res && res.committed) toast('🎉 ' + p.name + ' commits to ' + T.get(s.team.id).name + '!');
              E.save(); draw();
            } }, ['Recruit']),
            el('button', { class: 'btn br-btn ghost', disabled: rec.points < 8 || p.visited ? 'disabled' : null, onclick: function () {
              var res = P.scheduleVisit(s, p.id); if (res && res.committed) toast('🎉 ' + p.name + ' commits after his visit!'); E.save(); draw();
            } }, [p.visited ? 'Visited' : 'Visit'])
          ])
        ]);
        list.appendChild(row);
      });
      wrap.appendChild(list);
      return wrap;
    }

    var heroHolder = el('div');
    function refreshHero() { heroHolder.innerHTML = ''; heroHolder.appendChild(seasonHero(s)); }
    var tabHolder = el('div');
    refreshHero();

    var footer = el('div', { class: 'sticky-footer' }, [
      el('div', { class: 'sf-info' }, [el('span', { text: window.GameSeason.phaseLabel(s) })]),
      el('div', { class: 'sf-actions' }, [
        btn('📋 Roster', 'ghost', function () { renderRoster('season'); }),
        btn('🏛️ HQ', 'ghost', function () { s.screen = 'hq'; E.save(); renderHQ(); }),
        btn('💾 Save', 'ghost', function () { E.save(); toast('Saved.'); })
      ])
    ]);

    var screen = el('div', { class: 'screen season' }, [heroHolder, tabHolder, content, footer]);
    mount(screen);
    draw();
  }

  function renderSeasonSummary(sum) {
    var s = E.state;
    applyTheme(T.get(s.team.id));
    var champ = T.get(sum.champion);
    var badges = [];
    if (sum.wonNatl) badges.push(['🏆', 'National Champions']);
    if (sum.wonConf) badges.push(['🥇', 'Conference Champions']);
    if (sum.madePlayoff && !sum.wonNatl) badges.push(['🎟️', 'Playoff Berth']);
    if (sum.finalRank && sum.finalRank <= 25) badges.push(['📊', 'Final AP #' + sum.finalRank]);

    var card = el('div', { class: 'screen summary-screen' }, [
      el('div', { class: 'summary-card' }, [
        el('div', { class: 'sum-year', text: sum.year + ' Season' }),
        el('div', { class: 'sum-team', text: sum.teamName }),
        el('div', { class: 'sum-record', text: sum.wins + '–' + sum.losses }),
        el('div', { class: 'sum-badges' }, badges.length ? badges.map(function (b) {
          return el('div', { class: 'sum-badge' }, [el('span', { class: 'sb-emoji', text: b[0] }), el('span', { text: b[1] })]);
        }) : [el('p', { class: 'muted', text: sum.wins >= 6 ? 'Bowl-eligible season.' : 'A building year.' })]),
        el('div', { class: 'sum-rep', text: 'Reputation ' + (sum.repDelta >= 0 ? '+' : '') + sum.repDelta + ' → ' + sum.reputation }),
        sum.playerAwards && sum.playerAwards.length ? el('div', { class: 'season-awards' }, [
          el('div', { class: 'sec-sub', text: 'Player Honors' })
        ].concat(sum.playerAwards.map(function (a) { return el('div', { class: 'sum-badge' }, [el('span', { text: '🏅' }), el('span', { text: a.player + ' · ' + a.name })]); }))) : null,
        champ ? el('div', { class: 'sum-natl', text: 'National Champion: ' + champ.name + ' ' + champ.nick }) : null,
        verdictBlock(sum),
        el('div', { class: 'btn-row', style: 'justify-content:center;margin-top:18px' },
          sum.fired
            ? [btn('Face the Consequences  →', 'primary big', function () { renderFired(); })]
            : [btn('✍️  Continue to Signing Day  →', 'primary big', function () { renderSigningDay(); })])
      ])
    ]);
    mount(card);
  }

  // Compliance-review block for the season summary (wave 6).
  function verdictBlock(sum) {
    var v = sum.verdict;
    if (!v) return null;
    if (!v.investigated && v.severity !== 'simmering' && !sum.fired) {
      if (sum.postseasonBanned) return el('div', { class: 'verdict-block' }, [el('div', { class: 'vb-line muted', text: 'Served a postseason ban this year. No new violations found.' })]);
      return null;
    }
    var sevLabel = { cleared: 'Cleared', secondary: 'Secondary Violations', major: 'Major Violations', severe: 'Show-Cause', simmering: 'Allegation Unresolved', hotseat: 'Dismissed' }[v.severity] || '';
    var cls = (v.severity === 'severe' || sum.fired) ? 'bad' : (v.severity === 'major' ? 'warn' : 'ok');
    return el('div', { class: 'verdict-block ' + cls }, [
      el('div', { class: 'vb-head', text: '🏛️ NCAA / Compliance Review' }),
      el('div', { class: 'vb-sev', text: sevLabel }),
      (v.sanctions && v.sanctions.length) ? el('div', { class: 'vb-sanctions' }, v.sanctions.map(function (x) { return el('div', { class: 'vb-item', text: '• ' + x }); })) : null,
      v.severity === 'simmering' ? el('div', { class: 'vb-line muted', text: 'The allegation did not surface this year — but it is not going away.' }) : null
    ]);
  }

  // ---- Fired / resignation outcome (Wave 6, previews wave 7 carousel) -------
  function renderFired() {
    var s = E.state;
    applyTheme(T.get(s.team.id));
    var reason = s.integrity.firedReason;
    var reasonText = {
      showcause: 'A show-cause penalty has ended your tenure. Your name is mud on the coaching carousel.',
      sanctions: 'Major NCAA sanctions cost you the confidence of the administration. You have been let go.',
      performance: 'The athletic director ran out of patience. You have been fired.',
      resign: 'You stepped down from your position on your own terms.'
    }[reason] || 'Your tenure has come to an end.';

    var team = T.get(s.team.id) || { prestige: 5 };
    // Lower-tier job openings you could take to keep coaching.
    var maxPrestige = reason === 'showcause' ? Math.max(1, team.prestige - 4)
      : reason === 'resign' ? team.prestige : Math.max(1, team.prestige - 2);
    var seed = (s.seed ^ (s.career.year * 40597)) >>> 0;
    var rng = E.makeRng(seed);
    var pool = T.byDivision('fbs').filter(function (t) {
      return t.id !== s.team.id && t.prestige <= maxPrestige && t.prestige >= Math.max(1, maxPrestige - 3);
    });
    // shuffle + take a few offers
    for (var i = pool.length - 1; i > 0; i--) { var j = Math.floor(rng() * (i + 1)); var tmp = pool[i]; pool[i] = pool[j]; pool[j] = tmp; }
    var offers = pool.slice(0, 4);

    var card = el('div', { class: 'screen fired-screen' }, [
      el('div', { class: 'fired-card' }, [
        el('div', { class: 'fired-eyebrow', text: reason === 'resign' ? 'RESIGNATION' : 'DISMISSED' }),
        el('div', { class: 'fired-title', text: reason === 'resign' ? 'You Stepped Down' : 'You’ve Been Let Go' }),
        el('p', { class: 'fired-reason', text: reasonText }),
        el('div', { class: 'fired-career', text: 'Career: ' + s.career.wins + '–' + s.career.losses + ' · ' +
          s.career.confTitles + ' conf titles · ' + s.career.natTitles + ' national titles · ' + s.career.seasonsCoached + ' seasons' }),
        offers.length ? el('div', { class: 'offer-head', text: 'Programs willing to give you a shot:' }) : null,
        el('div', { class: 'offer-list' }, offers.map(function (t) {
          return el('button', { class: 'offer-card', onclick: function () {
            E.changeJob(t); E.save(); renderHQ();
          } }, [
            teamBadge(t, 34),
            el('div', {}, [
              el('div', { class: 'card-title', text: t.name + ' ' + t.nick }),
              el('div', { class: 'card-sub', text: t.conf + ' · prestige ' + t.prestige + '/10' })
            ])
          ]);
        })),
        el('div', { class: 'btn-row', style: 'justify-content:center;margin-top:14px' }, [
          btn('Retire from Coaching', 'ghost', function () {
            E.save(); renderTitle();
          })
        ])
      ])
    ]);
    mount(card);
  }

  // ---- Signing Day cutscene (Wave 4) ---------------------------------------
  function renderSigningDay() {
    var s = E.state, P = window.GameProgram;
    applyTheme(T.get(s.team.id));
    var signed = P.signingDay(s);
    E.save();
    var sum = P.classSummary(signed);
    var team = T.get(s.team.id);

    var reveal = el('div', { class: 'signing-list' });
    var card = el('div', { class: 'screen signing-screen' }, [
      el('div', { class: 'signing-desk' }, [
        el('div', { class: 'desk-eyebrow', text: '🖊️ NATIONAL SIGNING DAY · ' + (s.recruiting.classYear) + ' CLASS' }),
        el('div', { class: 'desk-team' }, [teamBadge(team, 40), el('span', { text: team.name + ' ' + team.nick })]),
        el('div', { class: 'desk-score' }, [
          el('div', { class: 'ds-num', text: sum.score }),
          el('div', { class: 'ds-lbl', text: 'CLASS SCORE' })
        ]),
        el('div', { class: 'desk-stars' }, [5, 4, 3, 2].map(function (st) {
          return el('span', { class: 'ds-star' }, [el('b', { text: sum.byStar[st] || 0 }), el('span', { class: 'stars s' + st, text: '★'.repeat(st) })]);
        }))
      ]),
      reveal,
      el('div', { class: 'btn-row', style: 'justify-content:center;margin-top:16px' }, [
        btn('Continue to the Offseason  →', 'primary big', function () { P.beginOffseason(s); E.save(); renderOffseason(); })
      ])
    ]);
    mount(card);

    // Reveal signees one at a time for a little theatre.
    if (!signed.length) {
      reveal.appendChild(el('p', { class: 'muted', text: 'No signees this cycle — build more interest next year.' }));
      return;
    }
    var i = 0;
    (function revealNext() {
      if (i >= signed.length) return;
      var p = signed[i++];
      var row = el('div', { class: 'signee', style: 'animation-delay:0s' }, [
        el('span', { class: 'stars s' + p.stars, text: '★'.repeat(p.stars) }),
        el('span', { class: 'signee-pos', text: p.pos }),
        el('span', { class: 'signee-name', text: p.name }),
        el('span', { class: 'signee-ovr', text: 'proj ' + p.proj })
      ]);
      reveal.appendChild(row);
      setTimeout(revealNext, 180);
    })();
  }

  // ---- Offseason hub (Wave 4): portal + NIL/facilities ---------------------
  function renderOffseason() {
    var s = E.state, P = window.GameProgram;
    applyTheme(T.get(s.team.id));
    var nextYear = s.career.year + 1;

    function draw() {
      var prog = s.program;
      var content = el('div', { class: 'screen offseason' }, [
        el('div', { class: 'screen-head' }, [
          el('h2', { text: nextYear + ' Offseason' }),
          el('p', { class: 'muted', text: 'Spend booster points on the transfer portal, NIL, and facilities before next season.' })
        ]),
        el('div', { class: 'off-points' }, [
          el('span', { class: 'op-num', text: prog.offseasonPoints }), el('span', { text: ' booster points to spend' })
        ]),
        // NIL + facilities investment
        el('div', { class: 'panel' }, [
          el('h3', { text: '💰 NIL & Facilities' }),
          investRow('NIL Collective', 'nil', prog.nilLevel, 'Boosts recruiting pull and player retention.'),
          investRow('Facilities', 'facilities', prog.facilitiesLevel, 'Boosts player development each offseason.')
        ]),
        // Transfer portal
        portalPanel(),
        // Departures
        prog.departures && prog.departures.length ? el('div', { class: 'panel' }, [
          el('h3', { text: '🚪 Entered the Portal (' + prog.departures.length + ')' }),
          el('div', { class: 'dep-list' }, prog.departures.map(function (d) {
            return el('div', { class: 'dep-row' }, [
              el('span', { class: 'stars s' + d.stars, text: '★'.repeat(d.stars) }),
              el('span', { class: 'dep-pos', text: d.pos }),
              el('span', { class: 'dep-name', text: d.name }),
              el('span', { class: 'dep-ovr', text: d.ovr })
            ]);
          }))
        ]) : null,
        el('div', { class: 'btn-row', style: 'margin-top:16px' }, [
          btn((window.GameCareer && window.GameCareer.hasOffers(s) ? '📞  Job Offers & Next Season  →' : '🏈  Start ' + nextYear + ' Season  →'), 'primary big', function () {
            if (window.GameCareer) { renderCarousel(); return; }
            P.startNextSeason(s); s.screen = 'season'; seasonTab = 'week'; lastWeekResult = null; E.save(); renderSeason();
          }),
          btn('📋 Roster', 'ghost', function () { renderRoster('offseason'); }),
          btn('🧑‍🏫 Staff', 'ghost', function () { renderStaff('offseason'); })
        ])
      ]);
      mount(content);
    }

    function investRow(label, kind, level, desc) {
      return el('div', { class: 'invest-row' }, [
        el('div', { class: 'invest-info' }, [
          el('div', { class: 'invest-label', text: label + ' — Level ' + level }),
          el('div', { class: 'invest-desc muted', text: desc }),
          el('span', { class: 'meter wide' }, [el('span', { class: 'meter-fill', style: 'width:' + level + '%' })])
        ]),
        el('div', { class: 'invest-btns' }, [
          btn('+1', 'ghost', function () { if (P.invest(s, kind, 1).ok) { E.save(); draw(); } }),
          btn('+5', 'ghost', function () { if (P.invest(s, kind, 5).ok) { E.save(); draw(); } })
        ])
      ]);
    }

    function portalPanel() {
      var portal = (s.program.portal || []);
      return el('div', { class: 'panel' }, [
        el('h3', { text: '🔁 Transfer Portal' }),
        portal.length ? el('div', { class: 'portal-list' }, portal.map(function (t) {
          return el('div', { class: 'portal-row' + (t.signed ? ' signed' : '') }, [
            el('span', { class: 'stars s' + t.stars, text: '★'.repeat(t.stars) }),
            el('span', { class: 'pt-pos', text: t.pos }),
            el('span', { class: 'pt-name', text: t.name + ' · ' + t.year }),
            el('span', { class: 'pt-ovr', text: 'OVR ' + t.ovr }),
            t.signed
              ? el('span', { class: 'pt-signed', text: '✓ Signed' })
              : el('button', { class: 'btn pt-btn', disabled: s.program.offseasonPoints < t.cost ? 'disabled' : null,
                  onclick: function () { if (P.signTransfer(s, t.id).ok) { toast('Signed ' + t.name + '!'); E.save(); draw(); } } }, ['Sign · ' + t.cost + 'pt'])
          ]);
        })) : el('p', { class: 'muted', text: 'No transfers available.' })
      ]);
    }

    draw();
  }

  // ---- Championship / bowl cutscene (Wave 8) -------------------------------
  // Determine if the player earned a trophy ceremony this postseason.
  function playerTitleResult(s) {
    var ps = s.season.postseason || {};
    var id = s.team.id;
    if (ps.champion === id && ps.bracket && ps.bracket.final) return { kind: 'natl', game: ps.bracket.final };
    // Won a bowl (non-playoff) game?
    var games = window.GameSeason.playerPostseasonGames(s);
    for (var i = games.length - 1; i >= 0; i--) {
      var g = games[i];
      if (g.bowlName && g.tag === 'Bowl' && g.winner === id) return { kind: 'bowl', game: g };
    }
    // Conference championship win, if no bigger prize.
    var confWin = (ps.confGames || []).filter(function (g) { return (g.home === id || g.away === id) && g.winner === id; })[0];
    if (confWin) return { kind: 'conf', game: confWin };
    return null;
  }

  function renderChampionship(title, onContinue) {
    var s = E.state;
    var team = T.get(s.team.id) || { name: s.team.name, nick: '', colors: ['#c8102e', '#fff'], emoji: '🏈' };
    applyTheme(team);
    var g = title.game;
    var myScore = g.home === s.team.id ? g.homeScore : g.awayScore;
    var oppScore = g.home === s.team.id ? g.awayScore : g.homeScore;
    var opp = T.get(g.home === s.team.id ? g.away : g.home) || { name: 'Opponent' };
    var titleName = title.kind === 'natl' ? 'NATIONAL CHAMPIONS'
      : title.kind === 'bowl' ? (g.bowlName + ' Champions').toUpperCase()
      : ((T.get(s.team.id) || {}).conf || '') + ' CHAMPIONS';
    var eyebrow = title.kind === 'natl' ? '🏆 THE NATIONAL CHAMPIONSHIP'
      : title.kind === 'bowl' ? '🏆 ' + (g.bowlName || 'BOWL GAME').toUpperCase()
      : '🥇 CONFERENCE CHAMPIONSHIP';

    var canvas = document.createElement('canvas');
    canvas.className = 'confetti-canvas';

    var natlAfter = s.career.natTitles + (title.kind === 'natl' ? 1 : 0);
    var confAfter = s.career.confTitles + (title.kind === 'conf' || title.kind === 'natl' ? 0 : 0);

    var card = el('div', { class: 'screen champ-cutscene' }, [
      canvas,
      el('div', { class: 'cut-desk' }, [
        el('div', { class: 'cut-eyebrow', text: eyebrow }),
        el('div', { class: 'cut-trophy', text: '🏆' }),
        teamBadge(team, 72),
        el('div', { class: 'cut-team', text: team.name + ' ' + team.nick }),
        el('div', { class: 'cut-title', text: titleName }),
        el('div', { class: 'cut-score', text: 'Defeated ' + opp.name + '  ' + myScore + '–' + oppScore + (g.ot ? ' (' + g.ot + 'OT)' : '') }),
        el('div', { class: 'cut-coach' }, [
          coachAvatar(s.coach, 30),
          el('span', { text: 'Head Coach ' + s.coach.name })
        ]),
        el('div', { class: 'cut-milestone', text: milestoneLine(title, natlAfter) }),
        btn('Continue  →', 'primary big', function () { stop(); onContinue(); })
      ])
    ]);
    mount(card);

    // Confetti in the team colors.
    var running = true, raf = null;
    function stop() { running = false; if (raf) cancelAnimationFrame(raf); }
    var ctx = canvas.getContext('2d');
    var W, H, parts = [];
    var palette = [team.colors[0], team.colors[1], '#ffffff', '#ffd400'];
    function resize() { W = canvas.width = canvas.offsetWidth; H = canvas.height = canvas.offsetHeight; }
    function seedParts() {
      parts = [];
      for (var i = 0; i < 140; i++) parts.push({
        x: Math.random() * W, y: Math.random() * -H, w: 4 + Math.random() * 6, h: 6 + Math.random() * 8,
        vy: 1.5 + Math.random() * 3.5, vx: (Math.random() - 0.5) * 1.5, rot: Math.random() * 6.28,
        vr: (Math.random() - 0.5) * 0.25, c: palette[Math.floor(Math.random() * palette.length)]
      });
    }
    function frame() {
      if (!running) return;
      ctx.clearRect(0, 0, W, H);
      parts.forEach(function (p) {
        p.y += p.vy; p.x += p.vx; p.rot += p.vr;
        if (p.y > H + 12) { p.y = -12; p.x = Math.random() * W; }
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillStyle = p.c;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); ctx.restore();
      });
      raf = requestAnimationFrame(frame);
    }
    // canvas needs layout; defer a tick
    requestAnimationFrame(function () { resize(); seedParts(); frame(); });
    window.addEventListener('resize', function () { if (running) { resize(); seedParts(); } });
  }

  function milestoneLine(title, natlAfter) {
    var s = E.state;
    if (title.kind === 'natl') {
      return natlAfter >= 2 ? ('Title #' + natlAfter + ' — a dynasty is forming.') : 'Your first national title. Immortality begins.';
    }
    if (title.kind === 'bowl') return 'A bowl win to cap the season.';
    return 'Conference champions — on to bigger things.';
  }

  // ---- Settings (optional scandals + toggles) ------------------------------
  function renderSettings() {
    var s = E.state;
    applyTheme(T.get(s.team.id));
    s.settings = s.settings || {};
    var descs = {
      off: 'No temptations or investigations. Pure football.',
      light: 'Rare temptations, gentler risk.',
      realistic: 'A steady trickle of dilemmas (default).',
      chaotic: 'Frequent temptations — the program is always on the edge.'
    };
    var descEl = el('p', { class: 'muted set-desc' });
    function refreshDesc() { descEl.textContent = descs[s.settings.scandalIntensity || 'realistic']; }
    function settingChips(values, current, onPick) {
      return el('div', { class: 'scandal-chips' }, values.map(function (item) {
        return el('button', { class: 'chip' + (current() === item.id ? ' active' : ''), onclick: function () { onPick(item.id); renderSettings(); } }, [item.label]);
      }));
    }

    var screen = el('div', { class: 'screen settings-screen' }, [
      el('div', { class: 'screen-head' }, [el('h2', { text: '⚙️ Settings' })]),
      window.GameDifficulty ? el('div', { class: 'panel' }, [
        el('h3', { text: 'Challenge' }),
        el('p', { class: 'muted', text: 'Every preset is transparent: it changes opponent strength, recruiting, progression, injuries, and scrutiny.' }),
        settingChips(window.GameDifficulty.labels(), function () { return s.settings.difficulty || 'dynasty'; }, function (id) { s.settings.difficulty = id; E.save(); }),
        el('p', { class: 'muted set-desc', text: 'Current modifiers: ' + JSON.stringify(window.GameDifficulty.get(s)) })
      ]) : null,
      el('div', { class: 'panel' }, [
        el('h3', { text: '⚖️ Scandal Intensity' }),
        el('p', { class: 'muted', text: 'How often compliance/scandal dilemmas appear. Change it any time.' }),
        scandalChips(function () { return s.settings.scandalIntensity || 'realistic'; },
          function (v) { s.settings.scandalIntensity = v; E.save(); refreshDesc(); }),
        descEl
      ]),
      el('div', { class: 'panel' }, [
        el('h3', { text: '📺 Broadcast Speed' }),
        el('div', { class: 'scandal-chips' }, ['slow', 'normal', 'fast'].map(function (sp) {
          return el('button', { class: 'chip' + ((s.settings.broadcastSpeed || 'normal') === sp ? ' active' : ''),
            onclick: function (e) {
              s.settings.broadcastSpeed = sp; E.save();
              var chips = e.target.parentNode.querySelectorAll('.chip');
              chips.forEach(function (c) { c.classList.remove('active'); });
              e.target.classList.add('active');
            } }, [sp.charAt(0).toUpperCase() + sp.slice(1)]);
        }))
      ]),
      el('div', { class: 'panel' }, [
        el('h3', { text: 'Accessibility' }),
        el('button', { class: 'chip' + (s.settings.sound ? ' active' : ''), onclick: function () {
          s.settings.sound = !s.settings.sound; E.save(); renderSettings();
        } }, [s.settings.sound ? 'Sound: On' : 'Sound: Off']),
        el('button', { class: 'chip' + (s.settings.reducedMotion ? ' active' : ''), onclick: function () {
          s.settings.reducedMotion = !s.settings.reducedMotion;
          document.documentElement.classList.toggle('reduced-motion', s.settings.reducedMotion);
          E.save(); renderSettings();
        } }, [s.settings.reducedMotion ? 'Reduced Motion: On' : 'Reduced Motion: Off'])
      ]),
      el('div', { class: 'sticky-footer' }, [
        el('div', { class: 'sf-info' }, [el('span', { text: 'Settings save automatically.' })]),
        el('div', { class: 'sf-actions' }, [btn('← Back', 'ghost', function () { s.screen = 'hq'; E.save(); renderHQ(); })])
      ])
    ]);
    mount(screen);
    refreshDesc();
  }

  // ---- Store (Wave 8): spend salary --------------------------------------
  function renderStore(from) {
    var s = E.state, C = window.GameCareer;
    applyTheme(T.get(s.team.id));
    var back = from === 'hq' ? function () { s.screen = 'hq'; E.save(); renderHQ(); } : function () { s.screen = 'hq'; E.save(); renderHQ(); };
    var cats = ['Program', 'Career', 'Legacy', 'Lifestyle'];
    var catLabel = { Program: '🏈 Program Investments', Career: '💼 Your Personal Team', Legacy: '🏛️ Legacy', Lifestyle: '💎 Lifestyle & Flex' };
    var catBlurb = {
      Program: 'Reinvest in the team — recruiting, development, facilities.',
      Career: 'Protect and advance your own career.',
      Legacy: 'Cement your place in history.',
      Lifestyle: 'Enjoy the money. Some of it even helps.'
    };

    function draw() {
      var walletBar = el('div', { class: 'store-wallet' }, [
        el('span', { class: 'sw-amt', text: '💰 $' + (s.career.wallet || 0).toFixed(1) + 'M' }),
        el('span', { class: 'sw-sub muted', text: 'available · $' + (s.career.spent || 0).toFixed(1) + 'M spent all-time' })
      ]);

      var sections = cats.map(function (cat) {
        var items = C.STORE.filter(function (it) { return it.cat === cat; });
        return el('div', { class: 'panel store-section' }, [
          el('h3', { text: catLabel[cat] }),
          el('p', { class: 'muted store-blurb', text: catBlurb[cat] }),
          el('div', { class: 'store-grid' }, items.map(function (it) {
            var owned = it.once && C.owns(s, it.id);
            var afford = (s.career.wallet || 0) >= it.cost;
            return el('div', { class: 'store-item' + (owned ? ' owned' : '') }, [
              el('div', { class: 'si-emoji', text: it.emoji }),
              el('div', { class: 'si-body' }, [
                el('div', { class: 'si-name', text: it.name }),
                el('div', { class: 'si-desc muted', text: it.desc })
              ]),
              owned
                ? el('span', { class: 'si-owned', text: '✓ Owned' })
                : el('button', { class: 'btn si-buy', disabled: !afford ? 'disabled' : null,
                    onclick: function () {
                      var res = C.buy(s, it.id);
                      if (res.ok) { toast('Bought ' + it.name + '!'); E.save(); draw(); }
                    } }, ['$' + it.cost + 'M'])
            ]);
          }))
        ]);
      });

      var screen = el('div', { class: 'screen store-screen' }, [
        el('div', { class: 'screen-head' }, [
          el('h2', { text: 'The Coach’s Store' }),
          el('p', { class: 'muted', text: 'Spend your salary. Program buys help the team; some personal buys quietly help too.' })
        ]),
        walletBar
      ].concat(sections).concat([
        el('div', { class: 'sticky-footer' }, [
          el('div', { class: 'sf-info' }, [el('span', { text: 'Wallet $' + (s.career.wallet || 0).toFixed(1) + 'M' })]),
          el('div', { class: 'sf-actions' }, [btn('← Back', 'ghost', back)])
        ])
      ]));
      mount(screen);
    }
    draw();
  }

  // ---- Job carousel (Wave 7) -----------------------------------------------
  function renderCarousel() {
    var s = E.state, C = window.GameCareer;
    applyTheme(T.get(s.team.id));
    var lastWins = s.history.length ? s.history[s.history.length - 1].wins : 6;
    var cur = T.get(s.team.id) || { prestige: 5, name: s.team.name, nick: '' };
    var offers = s.jobOffers || [];
    var contract = s.contract || {};
    var profile = C.profileScore(s);

    var stayCard = el('div', { class: 'carousel-current' }, [
      el('div', { class: 'cc-eyebrow', text: 'YOUR JOB' }),
      el('div', { class: 'cc-team' }, [teamBadge(cur, 36), el('span', { text: cur.name + ' ' + cur.nick })]),
      el('div', { class: 'cc-contract', text: 'Candidate profile ' + profile + ' / Level ' + s.career.coachLevel + ' / ' + C.fameLabel(s.career.fame) }),
      el('div', { class: 'cc-contract', text: '$' + contract.salary + 'M/yr · ' + (contract.yearsLeft > 0 ? contract.yearsLeft + ' yrs left' : 'contract expiring') }),
      btn('Stay at ' + cur.name + '  →', 'primary big', function () {
        C.stay(s, lastWins); s.screen = 'season'; seasonTab = 'week'; lastWeekResult = null; E.save(); renderSeason();
      })
    ]);

    var offerEls = offers.map(function (o) {
      var t = T.get(o.teamId);
      return el('div', { class: 'offer-card carousel-offer' }, [
        teamBadge(t, 40),
        el('div', { class: 'co-body' }, [
          el('div', { class: 'card-title', text: t.name + ' ' + t.nick }),
          el('div', { class: 'card-sub', text: t.conf + ' · prestige ' + t.prestige + '/10 · $' + o.salary + 'M/yr' }),
          el('div', { class: 'co-pitch muted', text: o.pitch + ' Candidate threshold: ' + (o.requiredProfile || C.requiredProfile(t.prestige)) + '.' })
        ]),
        btn('Take Job', '', function () {
          if (!confirm('Leave ' + cur.name + ' for ' + t.name + '? Your recruits and staff stay behind.')) return;
          C.acceptOffer(s, o); E.save(); toast('Welcome to ' + t.name + '!'); renderHQ();
        })
      ]);
    });

    var screen = el('div', { class: 'screen carousel-screen' }, [
      el('div', { class: 'screen-head' }, [
        el('h2', { text: '📞 The Coaching Carousel' }),
        el('p', { class: 'muted', text: offers.length ? 'Bigger programs are calling. Climb the ladder — or build where you are.' : 'No new offers this year. Keep winning to draw interest.' })
      ]),
      stayCard,
      offers.length ? el('h3', { class: 'sec-title', text: 'Offers on the Table' }) : null,
      el('div', { class: 'offer-list' }, offerEls)
    ]);
    mount(screen);
  }

  // ---- Roster / depth chart (Wave 4) ---------------------------------------
  function renderRoster(from) {
    var s = E.state, P = window.GameProgram;
    applyTheme(T.get(s.team.id));
    P.ensureProgram(s);
    var rr = P.rosterRatings(s);
    var back = from === 'offseason' ? function () { renderOffseason(); }
      : from === 'season' ? function () { renderSeason(); }
      : function () { s.screen = 'hq'; E.save(); renderHQ(); };

    var groups = [['OFF', 'Offense'], ['DEF', 'Defense'], ['ST', 'Special Teams']];
    var posOrder = { QB: 1, RB: 2, WR: 3, TE: 4, OL: 5, DL: 6, LB: 7, CB: 8, S: 9, K: 10, P: 11 };

    var panels = groups.map(function (grp) {
      var players = s.roster.filter(function (p) { return p.group === grp[0]; })
        .sort(function (a, b) { return (posOrder[a.pos] - posOrder[b.pos]) || (b.ovr - a.ovr); });
      return el('div', { class: 'panel' }, [
        el('h3', { text: grp[1] })
      ].concat(players.map(function (p) {
        return el('div', { class: 'ros-row' + (p.starter ? ' starter' : '') }, [
          el('span', { class: 'ros-pos', text: p.pos }),
          el('span', { class: 'stars s' + p.stars, text: '★'.repeat(p.stars) }),
          el('span', { class: 'ros-name' }, [
            el('span', { text: p.name + (p.transfer ? ' ⇄' : '') }),
            p.injury && p.injury.weeks > 0 ? el('span', { class: 'player-status injured', text: p.injury.name + ' · ' + p.injury.weeks + 'w' })
              : el('span', { class: 'player-status muted', text: 'MOR ' + (p.morale == null ? 70 : p.morale) + ' · FAT ' + (p.fatigue || 0) })
          ]),
          el('span', { class: 'ros-yr', text: p.year }),
          el('span', { class: 'ros-ovr', text: p.ovr }),
          el('span', { class: 'ros-pot muted', text: p.pot > p.ovr ? '↗' + p.pot : '—' })
        ]);
      })));
    });

    var screen = el('div', { class: 'screen roster-screen' }, [
      el('div', { class: 'screen-head' }, [
        el('h2', { text: T.get(s.team.id).name + ' Roster' }),
        el('p', { class: 'muted', text: 'Depth chart — starters highlighted. Overall ' + rr.overall + ' (OFF ' + rr.off + ' · DEF ' + rr.def + ').' })
      ]),
      el('div', { class: 'stat-grid' }, [
        rosterStat('Roster OVR', rr.overall), rosterStat('Offense', rr.off), rosterStat('Defense', rr.def),
        rosterStat('Injured', s.roster.filter(function (p) { return p.injury && p.injury.weeks > 0; }).length),
        rosterStat('NIL', s.program.nilLevel), rosterStat('Facilities', s.program.facilitiesLevel)
      ]),
      el('div', { class: 'panel-grid roster-grid' }, panels),
      el('div', { class: 'sticky-footer' }, [
        el('div', { class: 'sf-info' }, [el('span', { text: s.roster.length + ' players' })]),
        el('div', { class: 'sf-actions' }, [btn('← Back', 'ghost', back)])
      ])
    ]);
    mount(screen);
  }
  function rosterStat(label, val) {
    return el('div', { class: 'stat' }, [el('div', { class: 'stat-val', text: val }), el('div', { class: 'stat-label', text: label })]);
  }

  // ---- Staff / coaching cabinet (Wave 5) -----------------------------------
  function renderStaff(from) {
    var s = E.state, St = window.GameStaff;
    applyTheme(T.get(s.team.id));
    St.ensureStaff(s);
    var back = from === 'offseason' ? function () { renderOffseason(); }
      : from === 'season' ? function () { renderSeason(); }
      : function () { s.screen = 'hq'; E.save(); renderHQ(); };

    function loyClass(l) { return l >= 75 ? 'good' : l >= 55 ? 'ok' : 'bad'; }

    function draw() {
      var eff = St.effects(s);
      function fx(n, plus) { return (plus && n >= 0 ? '+' : '') + (Math.round(n * 10) / 10); }

      var effChips = el('div', { class: 'staff-effects' }, [
        effChip('Offense', fx(eff.off, true)),
        effChip('Defense', fx(eff.def, true)),
        effChip('Sp. Teams', eff.special),
        effChip('Recruiting', fx(eff.recruiting, true)),
        effChip('Development', fx(eff.development, true)),
        effChip('Cohesion', eff.cohesion)
      ]);

      // Cabinet
      var cabinet = el('div', { class: 'panel' }, [el('h3', { text: '🧑‍🏫 Your Staff' })].concat(
        St.ROLES.map(function (r) {
          var m = s.staff[r.id];
          var key = r.primary === 'rec' ? ('REC ' + (m ? m.recruiting : '—'))
            : r.primary === 'dev' ? ('DEV ' + (m ? m.development : '—')) : ('OVR ' + (m ? m.overall : '—'));
          return el('div', { class: 'staff-row' }, [
            el('div', { class: 'staff-role' }, [
              el('div', { class: 'sr-label', text: r.label }),
              el('div', { class: 'sr-aff muted', text: r.aff })
            ]),
            el('div', { class: 'staff-mem' }, [
              el('div', { class: 'sm-name', text: m ? m.name : '(vacant)' }),
              el('div', { class: 'sm-meta' }, [
                el('span', { class: 'sm-ovr', text: m ? m.overall : '—' }),
                el('span', { class: 'sm-loy ' + (m ? loyClass(m.loyalty) : ''), text: m ? ('♥ ' + m.loyalty) : '' })
              ])
            ])
          ]);
        })
      ));

      // Market
      var market = (s.staffMarket || []).slice(0, 14);
      var marketPanel = el('div', { class: 'panel' }, [
        el('h3', { text: '📋 Coaching Market' }),
        el('p', { class: 'muted', text: 'Budget: ' + s.program.staffBudget + ' pts. Hiring replaces the coach in that role.' }),
        el('div', { class: 'market-list' }, market.map(function (c) {
          var incumbent = s.staff[c.role];
          var better = incumbent && c.overall > incumbent.overall;
          return el('div', { class: 'market-row' }, [
            el('span', { class: 'mk-role', text: c.role }),
            el('span', { class: 'mk-name', text: c.name }),
            el('span', { class: 'mk-ovr' + (better ? ' up' : ''), text: c.overall + (better ? ' ↑' : '') }),
            el('span', { class: 'mk-loy muted', text: '♥' + c.loyalty }),
            el('button', { class: 'btn mk-btn', disabled: s.program.staffBudget < c.salary ? 'disabled' : null,
              onclick: function () {
                var res = St.hire(s, c.id);
                if (res.ok) { toast('Hired ' + c.name + ' (' + St.ROLE_MAP[c.role].label + ')'); E.save(); draw(); }
              } }, ['Hire · ' + c.salary])
          ]);
        }))
      ]);

      var screen = el('div', { class: 'screen staff-screen' }, [
        el('div', { class: 'screen-head' }, [
          el('h2', { text: T.get(s.team.id).name + ' Staff' }),
          el('p', { class: 'muted', text: 'Coordinators and position coaches shape your team. Loyalty guards against leaks and poaching.' })
        ]),
        effChips, cabinet, marketPanel,
        el('div', { class: 'sticky-footer' }, [
          el('div', { class: 'sf-info' }, [el('span', { text: 'Cohesion ' + St.effects(s).cohesion + ' · Budget ' + s.program.staffBudget })]),
          el('div', { class: 'sf-actions' }, [btn('← Back', 'ghost', back)])
        ])
      ]);
      mount(screen);
    }
    function effChip(label, val) {
      return el('div', { class: 'sfx' }, [el('div', { class: 'sfx-val', text: val }), el('div', { class: 'sfx-lbl', text: label })]);
    }
    draw();
  }

  // ---- Game Day broadcast (Wave 3) -----------------------------------------
  var SPEEDS = { slow: 1100, normal: 620, fast: 300 };

  function renderGameDay() {
    var s = E.state;
    var Season = window.GameSeason, Sim = window.GameSim;
    var pg = Season.playerWeekGame(s);
    if (!pg) { renderSeason(); return; }

    var league = s.season.league;
    var coach = s.coach;
    var playerId = s.team.id;
    var playerSide = pg.home === playerId ? 'home' : 'away';
    var oppId = pg.home === playerId ? pg.away : pg.home;

    var pr = window.GameProgram ? window.GameProgram.playerUnitRatings(s) : Sim.ratingsFor(league[playerId], coach, true);
    var or = Sim.ratingsFor(league[oppId], null, false);
    var homeCfg = playerSide === 'home'
      ? { id: pg.home, off: pr.off, def: pr.def, special: pr.special, isPlayer: true }
      : { id: pg.home, off: or.off, def: or.def, isPlayer: false };
    var awayCfg = playerSide === 'away'
      ? { id: pg.away, off: pr.off, def: pr.def, special: pr.special, isPlayer: true }
      : { id: pg.away, off: or.off, def: or.def, isPlayer: false };
    var tactical = null;
    if (window.GameTactics) {
      tactical = window.GameTactics.apply(s, playerSide === 'home' ? homeCfg : awayCfg);
    }

    var oppRankIdx = s.season.rankings.indexOf(oppId);
    var stakes = pg.rivalry ? '🔥 Rivalry Game' : (pg.conf ? (T.get(playerId).conf + ' Game') : 'Non-Conference');
    if (oppRankIdx >= 0 && oppRankIdx < 25) stakes += ' · vs #' + (oppRankIdx + 1);

    applyTheme(T.get(playerId));
    var homeTeam = T.get(pg.home), weather = pg.weather || (tactical && tactical.weather);
    var venue = homeTeam.stadium + ' · ' + homeTeam.city + ', ' + homeTeam.st + (weather ? ' · ' + weather.kind + ' ' + weather.temp + '°F' : '');
    var g = Sim.create({
      home: homeCfg, away: awayCfg, playerSide: playerSide,
      stakes: stakes, neutral: false, venue: venue,
      seed: (s.season.seed ^ (s.season.week * 40503)) >>> 0
    });
    if (tactical) g[playerSide].tempo = tactical.tempo;

    var playing = false, speed = SPEEDS[(s.settings && s.settings.broadcastSpeed) || 'normal'] || SPEEDS.normal, timer = null, wasPlaying = false;

    // ---- build DOM ----
    var homeU = g.home, awayU = g.away;
    function abbr(u) { return (T.get(u.id) || {}).nick || u.name; }

    function scoreRow(u, sideKey) {
      return el('div', { class: 'bug-team', 'data-side': sideKey }, [
        teamBadge(T.get(u.id), 30),
        el('span', { class: 'bug-name', text: u.name }),
        el('span', { class: 'bug-poss', 'data-poss': sideKey }, ['●']),
        el('span', { class: 'bug-score', 'data-score': sideKey, text: '0' })
      ]);
    }

    var bug = el('div', { class: 'bug' }, [
      el('div', { class: 'bug-teams' }, [ scoreRow(awayU, 'away'), scoreRow(homeU, 'home') ]),
      el('div', { class: 'bug-center' }, [
        el('div', { class: 'bug-clock' }, ['', el('span', { class: 'bug-qtr' })]),
        el('div', { class: 'bug-dd' }),
        el('div', { class: 'bug-to' })
      ])
    ]);

    // Field
    var ball = el('div', { class: 'ball-mark' });
    var firstLine = el('div', { class: 'first-line' });
    var losLine = el('div', { class: 'los-line' });
    var fieldEndL = el('div', { class: 'endzone left', style: 'background:' + (T.get(awayU.id).colors[0]) });
    var fieldEndR = el('div', { class: 'endzone right', style: 'background:' + (T.get(homeU.id).colors[0]) });
    var field = el('div', { class: 'field' }, [
      fieldEndL, fieldEndR,
      el('div', { class: 'yard-lines' }, [10,20,30,40,50,40,30,20,10].map(function (n, i) {
        return el('div', { class: 'yl', style: 'left:' + ((i + 1) * 10) + '%' }, [el('span', { text: n })]);
      })),
      losLine, firstLine, ball
    ]);

    // Momentum meter
    var moFill = el('div', { class: 'mo-fill' });
    var momentum = el('div', { class: 'momentum' }, [
      el('span', { class: 'mo-cap', text: abbr(awayU) }),
      el('div', { class: 'mo-track' }, [moFill]),
      el('span', { class: 'mo-cap', text: abbr(homeU) })
    ]);

    // Ticker
    var ticker = el('div', { class: 'ticker' });

    // Controls
    var tempoRow = el('div', { class: 'tempo-row' });
    var nextBtn = btn('▶ Next Play', 'primary', function () { if (!playing) tick(); });
    var autoBtn = btn('⏵ Auto', '', function () { toggleAuto(); });
    var driveBtn = btn('⏭ Drive', 'ghost', function () { runDrive(); });
    var finishBtn = btn('⏩ Sim to Final', 'ghost', function () { simToFinal(); });
    var speedSel = el('select', { class: 'select speed', onchange: function (e) { speed = SPEEDS[e.target.value]; } }, [
      el('option', { value: 'slow', text: '🐢 Slow' }),
      el('option', { value: 'normal', text: '▶ Normal', selected: 'selected' }),
      el('option', { value: 'fast', text: '⚡ Fast' })
    ]);
    var controls = el('div', { class: 'gd-controls' }, [
      el('div', { class: 'gd-btns' }, [nextBtn, autoBtn, driveBtn, finishBtn, speedSel]),
      tempoRow
    ]);

    var decisionHolder = el('div', { class: 'decision-holder' });

    var screen = el('div', { class: 'screen gameday' }, [
      el('div', { class: 'gd-head' }, [
        el('div', { class: 'gd-stakes', text: g.stakes }),
        el('div', { class: 'gd-venue', text: g.venue })
      ]),
      bug, field, momentum, controls, ticker, decisionHolder
    ]);
    mount(screen);

    // ---- rendering helpers ----
    function q(sel) { return screen.querySelector(sel); }
    function updateBug() {
      q('[data-score="home"]').textContent = g.home.score;
      q('[data-score="away"]').textContent = g.away.score;
      q('.bug-clock').firstChild.textContent = Sim.timeString(g) + ' ';
      q('.bug-qtr').textContent = Sim.quarterLabel(g);
      q('.bug-dd').textContent = g.awaitingKickoff ? 'Kickoff' : (g.awaitingPAT ? 'PAT' : (Sim.downLabel(g) + '  ·  ball on ' + ballOnText()));
      var to = '';
      q('.bug-to').textContent = '⏱ ' + g.away.timeouts + '  |  ' + g.home.timeouts + ' ⏱';
      q('[data-poss="home"]').style.opacity = g.poss === 'home' && !g.awaitingKickoff ? '1' : '0';
      q('[data-poss="away"]').style.opacity = g.poss === 'away' && !g.awaitingKickoff ? '1' : '0';
    }
    function ballOnText() {
      var los = g.los;
      return los <= 50 ? (abbr(g.poss === 'home' ? g.home : g.away) + ' ' + los) : (abbr(g.poss === 'home' ? g.away : g.home) + ' ' + (100 - los));
    }
    function updateField() {
      if (g.awaitingKickoff || g.awaitingPAT) { ball.style.opacity = '0'; firstLine.style.opacity = '0'; losLine.style.opacity = '0'; return; }
      ball.style.opacity = '1'; firstLine.style.opacity = '1'; losLine.style.opacity = '1';
      var spot = Sim.fieldSpot(g); // 0..100 home perspective (home attacks right)
      ball.style.left = clampPct(spot) + '%';
      losLine.style.left = clampPct(spot) + '%';
      var fd = g.poss === 'home' ? Math.min(100, g.los + g.toGo) : Math.max(0, 100 - (g.los + g.toGo));
      firstLine.style.left = clampPct(g.poss === 'home' ? fd : fd) + '%';
      ball.textContent = '🏈';
    }
    function clampPct(p) { return Math.max(2, Math.min(98, p)); }
    function updateMomentum() {
      // g.mo in -100..100 (+home). Fill from center.
      var pct = 50 + g.mo / 2; // 0..100
      moFill.style.width = Math.abs(g.mo) / 2 + '%';
      moFill.style.left = g.mo >= 0 ? '50%' : (50 - Math.abs(g.mo) / 2) + '%';
      moFill.style.background = g.mo >= 0 ? T.get(g.home.id).colors[0] : T.get(g.away.id).colors[0];
    }
    function pushTicker(ev) {
      if (!ev || !ev.text || ev.tag === 'decision') return;
      var line = el('div', { class: 'tk-line tk-' + ev.tag }, [
        el('span', { class: 'tk-tag', text: tagLabel(ev.tag) }),
        el('span', { class: 'tk-txt', text: ev.text })
      ]);
      ticker.insertBefore(line, ticker.firstChild);
      while (ticker.children.length > 40) ticker.removeChild(ticker.lastChild);
      if (ev.tag === 'td' || ev.tag === 'fg' || ev.tag === 'int' || ev.tag === 'fumble' || ev.tag === 'onside' || ev.tag === 'two') flash(ev.tag);
    }
    function tagLabel(tag) {
      var m = { run: 'RUN', pass: 'PASS', incomplete: 'INC', sack: 'SACK', td: 'TD', fg: 'FG', fgmiss: 'MISS',
        punt: 'PUNT', int: 'INT', fumble: 'FUM', downs: 'DOWNS', kick: 'KICK', onside: 'ONSIDE', pat: 'XP',
        two: '2PT', twofail: '2PT', patmiss: 'XP', half: 'HALF', flag: 'FLAG', safety: 'SAFETY', final: 'FINAL', info: '' };
      return m[tag] != null ? m[tag] : '•';
    }
    function flash(tag) {
      field.classList.remove('flash-td', 'flash-to');
      void field.offsetWidth;
      field.classList.add((tag === 'td' || tag === 'fg' || tag === 'two') ? 'flash-td' : 'flash-to');
    }

    function renderTempo() {
      tempoRow.innerHTML = '';
      if (Sim.isPlayer(g, g.poss) && !g.awaitingKickoff && !g.awaitingPAT && !g.over) {
        tempoRow.appendChild(el('span', { class: 'tempo-label', text: 'Tempo:' }));
        [['normal', 'Normal'], ['hurry', 'Hurry-Up'], ['milk', 'Milk Clock']].forEach(function (t) {
          tempoRow.appendChild(el('button', {
            class: 'chip tempo' + (g[g.poss].tempo === t[0] ? ' active' : ''),
            onclick: function () { Sim.decide(g, t[0]); renderTempo(); }
          }, [t[1]]));
        });
      }
    }

    function refreshAll(ev) { updateBug(); updateField(); updateMomentum(); renderTempo(); if (ev) pushTicker(ev); }

    // ---- decision UI ----
    function showDecision() {
      stopAuto(true);
      var p = g.pending;
      var title = { fourth_down: '4th Down — Your Call', pat: 'After the Touchdown', kickoff: 'Kickoff Strategy' }[p.kind] || 'Decision';
      var sub = p.kind === 'fourth_down' ? (Sim.downLabel(g) + ' at the ' + ballOnText()) : '';
      var card = el('div', { class: 'decision-card' }, [
        el('div', { class: 'dc-title', text: title }),
        sub ? el('div', { class: 'dc-sub', text: sub }) : null,
        el('div', { class: 'dc-options' }, p.options.map(function (o) {
          return el('button', { class: 'dc-opt' + (p.rec === o.id ? ' rec' : '') + (o.risky ? ' risky' : ''),
            onclick: function () { choose(o.id); } }, [
            el('div', { class: 'dc-opt-label', text: o.label + (p.rec === o.id ? '  ✓' : '') }),
            el('div', { class: 'dc-opt-desc', text: o.desc })
          ]);
        }))
      ]);
      decisionHolder.innerHTML = '';
      decisionHolder.appendChild(el('div', { class: 'decision-overlay' }, [card]));
    }
    function choose(id) {
      decisionHolder.innerHTML = '';
      var ev = Sim.decide(g, id);
      refreshAll(ev);
      afterStep();
      if (wasPlaying) startAuto();
    }

    // ---- loop ----
    function tick() {
      if (g.over) return endGame();
      if (g.pending) { showDecision(); return; }
      var ev = Sim.advance(g);
      if (ev.tag === 'decision') { showDecision(); return; }
      refreshAll(ev);
      afterStep();
    }
    function afterStep() {
      if (g.over) { endGame(); return; }
      if (playing && !g.pending) timer = setTimeout(tick, speed);
    }
    function startAuto() { playing = true; wasPlaying = true; autoBtn.textContent = '⏸ Pause'; autoBtn.classList.add('primary'); if (!g.pending && !g.over) tick(); }
    function stopAuto(keepWas) { playing = false; if (!keepWas) wasPlaying = false; autoBtn.textContent = '⏵ Auto'; autoBtn.classList.remove('primary'); if (timer) clearTimeout(timer); }
    function toggleAuto() { if (playing) stopAuto(); else startAuto(); }
    function runDrive() {
      var startPoss = g.poss, guard = 0;
      stopAuto();
      (function step() {
        if (g.over) return endGame();
        if (g.pending) { showDecision(); return; }
        var ev = Sim.advance(g);
        if (ev.tag === 'decision') { showDecision(); return; }
        refreshAll(ev);
        if (g.over) return endGame();
        if (g.poss !== startPoss || ev.score || guard++ > 40) return; // drive ended
        timer = setTimeout(step, Math.min(speed, 260));
      })();
    }
    function simToFinal() {
      stopAuto();
      Sim.simRemaining(g);
      // replay only the tail of the log for context
      ticker.innerHTML = '';
      g.log.slice(-14).reverse().forEach(pushTicker);
      refreshAll(null);
      endGame();
    }

    function endGame() {
      stopAuto();
      if (finishedShown) return; finishedShown = true;
      var res = g.result;
      var iWon = res.winnerId === playerId;
      var myScore = playerSide === 'home' ? res.homeScore : res.awayScore;
      var oppScore = playerSide === 'home' ? res.awayScore : res.homeScore;
      var overlay = el('div', { class: 'decision-overlay final-overlay' }, [
        el('div', { class: 'final-card ' + (iWon ? 'win' : 'loss') }, [
          el('div', { class: 'fc-result', text: iWon ? 'VICTORY' : 'DEFEAT' }),
          el('div', { class: 'fc-score' }, [
            el('div', { class: 'fc-line' }, [teamBadge(T.get(awayU.id), 26), el('span', { text: awayU.name }), el('span', { class: 'fc-num', text: res.awayScore })]),
            el('div', { class: 'fc-line' }, [teamBadge(T.get(homeU.id), 26), el('span', { text: homeU.name }), el('span', { class: 'fc-num', text: res.homeScore })])
          ]),
          g.ot ? el('div', { class: 'fc-ot', text: g.ot + ' OT' }) : null,
          el('div', { class: 'fc-stat', text: statLine() }),
          btn('Continue  →', 'primary big', function () {
            lastWeekResult = Season.commitPlayerResult(s, res.homeScore, res.awayScore, g[playerSide].stats);
            E.save(); seasonTab = 'week'; renderSeason();
          })
        ])
      ]);
      decisionHolder.innerHTML = '';
      decisionHolder.appendChild(overlay);
    }
    function statLine() {
      var ph = g[playerSide].stats, po = g[playerSide === 'home' ? 'away' : 'home'].stats;
      return 'Yards ' + (ph.rush + ph.pass) + ' · 1st downs ' + ph.first + ' · TO ' + ph.to;
    }
    var finishedShown = false;

    // initial paint
    refreshAll({ tag: 'kick', text: g.log[0].text });
    updateBug(); updateField();
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
        case 'season': renderSeason(); break;
        default: renderTitle();
      }
    },
    renderTitle: renderTitle,
    renderHQ: renderHQ,
    renderSeason: renderSeason,
    renderRoster: renderRoster,
    renderStaff: renderStaff,
    renderSigningDay: renderSigningDay,
    renderOffseason: renderOffseason,
    renderCarousel: renderCarousel,
    renderStore: renderStore,
    renderSettings: renderSettings,
    renderChampionship: renderChampionship,
    renderFired: renderFired,
    teamBadge: teamBadge,
    toast: toast,
    // exposed for tests
    _pick: function () { return pick; }
  };

  window.GameUI = GameUI;
})();
