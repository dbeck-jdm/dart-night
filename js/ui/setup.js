import { S, fresh, replaceState, save, emptyRR, emptyBracket } from '../store.js';
import { THEMES, applyTheme } from '../themes.js';
import { APP_VERSION } from '../config.js';
import { $, esc, toast, dateStr } from './dom.js';
import { resetAddForm } from './night.js';

export function renderSetup() {
  $('section-setup').innerHTML = `
    <div class="card"><h3>Players</h3>
      ${(S.players || []).map((p, i) => `<div class="player-row"><div class="player-num">${i + 1}</div>
        <input type="text" value="${esc(p)}" oninput="window._setPlayer(${i},this.value)" placeholder="Player ${i + 1}"/></div>`).join('')}
    </div>
    <div class="card"><h3>Night Name</h3>
      <input type="text" value="${esc(S.nightName || '')}" placeholder="e.g. April Dart Night" style="width:100%" oninput="window._setNightName(this.value)"/>
    </div>
    <div class="card"><h3>Points Guide</h3>
      <div style="font-size:0.78rem;color:var(--muted);line-height:2.2;">
        <div>Casual games: <strong style="color:var(--text)">Winner = 1pt (if points on)</strong></div>
        <div>Round robin: <strong style="color:var(--text)">Win = 1pt · Seeds bracket</strong></div>
        <div>Bracket (double-elim): <strong style="color:var(--text)">1st=8 · 2nd=6 · 3rd=3 · 4th=1</strong></div>
      </div>
    </div>
    <button class="btn btn-primary btn-full" onclick="window._startNight()">START NIGHT</button>
    <div style="margin-top:8px;"><button class="btn btn-danger btn-full btn-sm" onclick="window._resetAll()">RESET ALL DATA</button></div>
    <div class="card" style="margin-top:12px;">
      <h3>Color Theme</h3>
      <div class="theme-chooser">${Object.entries(THEMES).map(([k, t]) => `
        <div class="theme-swatch ${(S.theme || 'gold') === k ? 'sel' : ''}" onclick="window._setTheme('${k}')">
          <div class="theme-dot"><span style="background:${t.a}"></span><span style="background:${t.b}"></span></div>
          <div class="theme-lbl">${t.name}</div>
        </div>`).join('')}
      </div>
    </div>
    <div class="card" style="margin-top:0px;">
      <h3>Backup & Restore</h3>
      <p style="font-size:0.78rem;color:var(--muted);margin-bottom:10px;line-height:1.6;">Export saves all history and settings to a JSON file. Import restores from a previous export.</p>
      <div style="display:flex;gap:8px;">
        <button class="btn btn-secondary btn-sm" style="flex:1" onclick="window._exportData()">⬇ Export</button>
        <label style="flex:1;cursor:pointer;">
          <span class="btn btn-secondary btn-sm" style="width:100%;display:inline-flex;align-items:center;justify-content:center;gap:5px;">⬆ Import</span>
          <input type="file" accept=".json" style="display:none" onchange="window._importData(this)"/>
        </label>
      </div>
    </div>
    <div style="margin-top:20px;text-align:center;color:var(--muted);font-size:0.68rem;letter-spacing:1px;">${APP_VERSION}</div>`;
}

let _pTimer = null, _nnTimer = null;
window._setPlayer = (i, v) => { S.players[i] = v; clearTimeout(_pTimer); _pTimer = setTimeout(() => save(), 1000); };
window._setNightName = v => { S.nightName = v; clearTimeout(_nnTimer); _nnTimer = setTimeout(() => save(), 1000); };

window._startNight = () => {
  if ((S.players || []).some(p => !p.trim())) { toast('Enter all 4 player names'); return; }
  if (!S.nightName || !S.nightName.trim()) { toast('Enter a night name first'); return; }
  S.games = []; S.rr = emptyRR(); S.bracket = emptyBracket();
  S.active = true; S.nightDate = dateStr();
  resetAddForm();
  save(); toast('Night started! 🎯');
  document.querySelectorAll('.tab')[0].click();
};

window._exportData = () => {
  const exportObj = {
    exportedAt: new Date().toLocaleString('en-US', { timeZone: 'America/Toronto' }) + ' EDT',
    version: '1.1',
    players: S.players,
    history: S.history || [],
  };
  const blob = new Blob([JSON.stringify(exportObj, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `dartnight-export-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  toast('Exported! 📁');
};

window._importData = input => {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const data = JSON.parse(e.target.result);
      if (!data.history || !data.players) { toast('Invalid export file'); return; }
      if (!confirm(`Import ${data.history.length} night(s) from ${data.exportedAt || 'unknown date'}? This will merge with existing history.`)) return;
      // Merge history — avoid duplicates by name+date
      const existing = S.history || [];
      const existingKeys = new Set(existing.map(n => `${n.name}|${n.date}`));
      const newNights = data.history.filter(n => !existingKeys.has(`${n.name}|${n.date}`));
      S.history = [...existing, ...newNights];
      // Restore players if current are defaults
      if (data.players && S.players.every(p => p.startsWith('Player '))) {
        S.players = data.players;
      }
      save(); toast(`Imported ${newNights.length} new night(s)! 🎉`);
    } catch (err) {
      toast('Failed to read file'); console.error(err);
    }
  };
  reader.readAsText(file);
  input.value = '';
};

window._setTheme = key => {
  S.theme = key;
  applyTheme(key);
  save();
  renderSetup();
  toast(`Theme updated!`);
};

window._resetAll = () => {
  if (!confirm('Erase ALL data, including every saved night, for everyone? Export first if unsure.')) return;
  replaceState(fresh()); save(); toast('Reset complete');
};
