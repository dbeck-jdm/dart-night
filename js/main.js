// Entry point: wires tabs, sync status, and rendering.
import { S, connect, onSyncStatus } from './store.js';
import { ENV } from './config.js';
import { applyTheme } from './themes.js';
import { $, openM, closeM } from './ui/dom.js';
import { renderNight } from './ui/night.js';
import { renderScores } from './ui/scores.js';
import { renderBracket } from './ui/bracket.js';
import { renderHistory } from './ui/history.js';
import { renderAnalytics, destroyCharts } from './ui/analytics.js';
import { renderSetup } from './ui/setup.js';

const RENDERERS = {
  night: renderNight,
  scores: renderScores,
  bracket: renderBracket,
  history: renderHistory,
  analytics: renderAnalytics,
  setup: renderSetup,
};

let activeTab = 'night';
let connected = false;

// Only the visible tab is rendered; switching tabs renders the new one.
function render() {
  if (!connected) return;
  if (S.theme) applyTheme(S.theme);
  if (activeTab === 'setup') {
    const focused = document.activeElement;
    if (focused && focused.tagName === 'INPUT' && focused.closest('#section-setup')) return;
  }
  RENDERERS[activeTab]();
}

function nav(name, btn) {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  $('section-' + name).classList.add('active');
  btn.classList.add('active');
  if (activeTab === 'analytics' && name !== 'analytics') destroyCharts();
  activeTab = name;
  render();
}

window.nav = nav;
window.openM = openM;
window.closeM = closeM;

onSyncStatus(s => {
  $('syncBadge').className = 'sync-badge ' + s;
  $('syncText').textContent = { live: 'Live', saving: 'Saving…', error: 'Offline', connecting: 'Connecting…' }[s] || s;
});

if (ENV !== 'prod') {
  const badge = document.createElement('div');
  badge.className = 'env-badge';
  badge.textContent = ENV === 'local' ? 'LOCAL TEST DATA' : 'DEV DATABASE';
  badge.title = 'Not the live data. Add ?env=prod to the URL to use live data.';
  document.querySelector('.header-right').prepend(badge);
}

connect(() => { connected = true; render(); });
