/* Shared test helpers: locate the pre-installed chromium and a tiny assert. */
'use strict';
const fs = require('fs');
const path = require('path');

function findChromium() {
  const envExe = process.env.PW_CHROMIUM;
  if (envExe && fs.existsSync(envExe)) return envExe;
  const roots = ['/opt/pw-browsers'];
  const candidates = [];
  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    const walk = (d, depth) => {
      if (depth > 4) return;
      let entries = [];
      try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch (e) { return; }
      for (const e of entries) {
        const fp = path.join(d, e.name);
        if (e.isDirectory()) walk(fp, depth + 1);
        else if (e.name === 'chrome' || e.name === 'headless_shell') candidates.push(fp);
      }
    };
    walk(root, 0);
  }
  // Prefer full chrome over headless_shell for consistent rendering.
  candidates.sort((a, b) => (a.includes('headless_shell') ? 1 : 0) - (b.includes('headless_shell') ? 1 : 0));
  if (!candidates.length) throw new Error('No chromium found under /opt/pw-browsers');
  return candidates[0];
}

let _pass = 0, _fail = 0;
const _fails = [];
function ok(cond, msg) {
  if (cond) { _pass++; }
  else { _fail++; _fails.push(msg); console.log('  ✗ ' + msg); }
}
function eq(a, b, msg) { ok(a === b, (msg || 'eq') + ' (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')'); }
function group(name) { console.log('\n▸ ' + name); }
function summary() {
  console.log('\n' + (_fail ? '❌' : '✅') + ' ' + _pass + ' passed, ' + _fail + ' failed');
  return _fail === 0;
}

module.exports = { findChromium, ok, eq, group, summary };
