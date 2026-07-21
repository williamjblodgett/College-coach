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
  function lum(c) { return 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]; }
  function toHex(c) { return '#' + c.map(function (v) { return ('0' + Math.max(0, Math.min(255, Math.round(v))).toString(16)).slice(-2); }).join(''); }
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
    // Pick whichever color makes the more vivid accent.
    var a1 = vividAccent(primary), a2 = vividAccent(secondary);
    var accent = lum(hexToRgb(a1)) >= lum(hexToRgb(a2)) - 25 ? a1 : a2;
    root.style.setProperty('--accent', accent);
    root.style.setProperty('--accent-dark', shade(accent, -34));
    root.style.setProperty('--accent-ink', readable(accent));
    root.style.setProperty('--team-primary', primary);
    root.style.setProperty('--team-secondary', secondary);
    document.querySelector('meta[name="theme-color"]') && document.querySelector('meta[name="theme-color"]').setAttribute('content', shade(primary, -40));
  }
  function resetTheme() {
    var root = document.documentElement;
    ['--accent', '--accent-dark', '--accent-ink'].forEach(function (v) { root.style.removeProperty(v); });
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
    if (window.GameProgram) window.GameProgram.ensureProgram(s);
    var rr = window.GameProgram && s.roster.length ? window.GameProgram.rosterRatings(s) : null;
    var power = rr ? rr.overall : E.teamPower(team, coach);

    applyTheme(team);

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
      stat('Roster OVR', power, rr ? ('OFF ' + rr.off + ' · DEF ' + rr.def) : 'prestige'),
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
        sanctions.length
          ? el('div', { class: 'sanction-list' }, sanctions.map(function (x) { return el('div', { class: 'sanction-item', text: '⛔ ' + x }); }))
          : el('p', { class: 'muted', text: 'Program in good standing.' })
      ]);
    }

    var screen = el('div', { class: 'screen hq' }, [
      hero, stats,
      el('div', { class: 'panel-grid' }, [coachPanel, rivalPanel]),
      compliancePanel, nextPanel
    ]);
    mount(screen);
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

    function weekTab() {
      var wrap = el('div');
      var phase = s.season.phase;

      // A pending compliance/scandal decision takes priority.
      var Scandal = window.GameScandal;
      var pendingScandal = Scandal && Scandal.pendingEvent(s);
      if (pendingScandal) wrap.appendChild(scandalCard(pendingScandal));

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
      wrap.appendChild(el('div', { class: 'btn-row', style: 'margin-top:16px' }, [
        btn('📜  Finish Season & View Summary', 'primary big', function () {
          var summary = Season.finish(s); E.save(); lastWeekResult = null; seasonTab = 'week';
          renderSeasonSummary(summary);
        })
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
        var row = el('div', { class: 'board-row' }, [
          el('span', { class: 'br-rank', text: '#' + p.rank }),
          el('span', { class: 'stars s' + p.stars, text: '★'.repeat(p.stars) }),
          el('span', { class: 'br-pos', text: p.pos }),
          el('span', { class: 'br-name', text: p.name }),
          el('span', { class: 'br-ovr', text: p.proj }),
          el('span', { class: 'br-lean' }, [el('span', { class: 'br-lean-fill', style: 'width:' + leanPct + '%' })]),
          rec.signed ? null : el('button', {
            class: 'btn br-btn', disabled: rec.points <= 0 ? 'disabled' : null,
            onclick: function () {
              var res = P.recruitEffort(s, p.id, Math.min(4, rec.points));
              if (res && res.committed) toast('🎉 ' + p.name + ' commits to ' + T.get(s.team.id).name + '!');
              E.save(); draw();
            }
          }, ['Recruit'])
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
          btn('🏈  Start ' + nextYear + ' Season  →', 'primary big', function () {
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
          el('span', { class: 'ros-name', text: p.name + (p.transfer ? ' ⇄' : '') }),
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

    var oppRankIdx = s.season.rankings.indexOf(oppId);
    var stakes = pg.rivalry ? '🔥 Rivalry Game' : (pg.conf ? (T.get(playerId).conf + ' Game') : 'Non-Conference');
    if (oppRankIdx >= 0 && oppRankIdx < 25) stakes += ' · vs #' + (oppRankIdx + 1);

    applyTheme(T.get(playerId));
    var homeTeam = T.get(pg.home), venue = homeTeam.stadium + ' · ' + homeTeam.city + ', ' + homeTeam.st;
    var g = Sim.create({
      home: homeCfg, away: awayCfg, playerSide: playerSide,
      stakes: stakes, neutral: false, venue: venue,
      seed: (s.season.seed ^ (s.season.week * 40503)) >>> 0
    });

    var playing = false, speed = SPEEDS.normal, timer = null, wasPlaying = false;

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
            lastWeekResult = Season.commitPlayerResult(s, res.homeScore, res.awayScore);
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
    renderFired: renderFired,
    teamBadge: teamBadge,
    toast: toast,
    // exposed for tests
    _pick: function () { return pick; }
  };

  window.GameUI = GameUI;
})();
