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
        btn('💾 Save', 'ghost', function () { E.save(); toast('Career saved.'); }),
        btn('⬇ Export', 'ghost', function () {
          var t = E.serialize();
          navigator.clipboard && navigator.clipboard.writeText(t);
          prompt('Copy your save (also copied to clipboard):', t);
        }),
        btn('↩ Menu', 'ghost', function () { E.save(); renderTitle(); })
      ])
    ]);

    var screen = el('div', { class: 'screen hq' }, [
      hero, stats,
      el('div', { class: 'panel-grid' }, [coachPanel, rivalPanel]),
      nextPanel
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
    var tabs = [['week', 'This Week'], ['schedule', 'Schedule'], ['rankings', 'Top 25'], ['standings', 'Standings']];
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
    if (team) {
      document.documentElement.style.setProperty('--team-primary', team.colors[0]);
      document.documentElement.style.setProperty('--team-secondary', team.colors[1]);
    }

    var content = el('div', { class: 'season-content' });
    function pick(tab) { seasonTab = tab; draw(); }

    function draw() {
      content.innerHTML = '';
      if (seasonTab === 'week') content.appendChild(weekTab());
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
    function weekTab() {
      var wrap = el('div');
      var phase = s.season.phase;

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
        wrap.appendChild(el('div', { class: 'btn-row' }, [
          btn('▶  Sim Week ' + wk, 'primary big', function () {
            lastWeekResult = Season.simWeek(s); E.save(); draw(); refreshHero();
          }),
          btn('⏩  Sim to Postseason', 'ghost', function () {
            while (s.season.phase === 'regular') lastWeekResult = Season.simWeek(s);
            E.save(); draw(); refreshHero();
          })
        ]));
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

    var heroHolder = el('div');
    function refreshHero() { heroHolder.innerHTML = ''; heroHolder.appendChild(seasonHero(s)); }
    var tabHolder = el('div');
    refreshHero();

    var footer = el('div', { class: 'sticky-footer' }, [
      el('div', { class: 'sf-info' }, [el('span', { text: window.GameSeason.phaseLabel(s) })]),
      el('div', { class: 'sf-actions' }, [
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
        el('div', { class: 'btn-row', style: 'justify-content:center;margin-top:18px' }, [
          btn('🏈  Start ' + s.career.year + ' Season', 'primary big', function () {
            window.GameSeason.ensureStarted(s); s.screen = 'season'; E.save(); renderSeason();
          }),
          btn('🏛️  Program HQ', 'ghost', function () { s.screen = 'hq'; E.save(); renderHQ(); })
        ])
      ])
    ]);
    mount(card);
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
    teamBadge: teamBadge,
    toast: toast,
    // exposed for tests
    _pick: function () { return pick; }
  };

  window.GameUI = GameUI;
})();
