// Small DOM helpers shared by the tab modules.
import { S } from '../store.js';

export const $ = id => document.getElementById(id);

// Escape user-entered text (player and night names) before putting it in HTML.
export const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// rawName for textContent/toasts; pName (escaped) for innerHTML templates.
export const rawName = i => (S.players && S.players[i]) || `P${i + 1}`;
export const pName = i => esc(rawName(i));

export const dateStr = () => new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });

let toastTimer = null;
export function toast(msg) {
  const el = $('toast');
  el.textContent = msg; el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2400);
}

export const openM = id => $(id).classList.add('open');
export const closeM = id => $(id).classList.remove('open');

// Render a winner-picker list into a modal; calls onPick(idx) on tap.
export function pickerHTML(prefix, idxs, handler, nameFn = pName) {
  return idxs.map(idx => `<div class="ppick" id="${prefix}${idx}" onclick="window.${handler}(${idx})"><div class="ppick-name">${nameFn(idx)}</div><div class="chk">✓</div></div>`).join('');
}
export function markPicked(containerId, prefix, idx) {
  document.querySelectorAll(`#${containerId} .ppick`).forEach(e => e.classList.remove('sel'));
  $(prefix + idx)?.classList.add('sel');
}
