import { S } from './store.js';

export const THEMES = {
  gold:   { name: 'Gold',   a: '#e8c547', b: '#e05c2a', p: ['#e8c547', '#e05c2a', '#4caf7d', '#7a9af0'] },
  blue:   { name: 'Blue',   a: '#4a9eff', b: '#7a5af8', p: ['#4a9eff', '#7a5af8', '#4caf7d', '#e8c547'] },
  green:  { name: 'Green',  a: '#4caf7d', b: '#2dd4bf', p: ['#4caf7d', '#2dd4bf', '#e8c547', '#ff6b6b'] },
  red:    { name: 'Red',    a: '#ff6b6b', b: '#ff9f43', p: ['#ff6b6b', '#ff9f43', '#4caf7d', '#4a9eff'] },
  purple: { name: 'Purple', a: '#bf7af0', b: '#e05c8a', p: ['#bf7af0', '#e05c8a', '#4caf7d', '#e8c547'] },
  teal:   { name: 'Teal',   a: '#26c6da', b: '#e05c2a', p: ['#26c6da', '#4caf7d', '#e8c547', '#ff6b6b'] },
};

export function getTheme() { return THEMES[S.theme || 'gold'] || THEMES.gold; }
export function PLAYER_COLORS() { return getTheme().p; }

export function applyTheme(key) {
  const t = THEMES[key] || THEMES.gold;
  let styleTag = document.getElementById('theme-override');
  if (!styleTag) {
    styleTag = document.createElement('style');
    styleTag.id = 'theme-override';
    document.head.appendChild(styleTag);
  }
  styleTag.textContent = `:root{--accent:${t.a};--accent2:${t.b};}`;
}
