// Environment selection.
//   prod  – live Firebase data at dartnight/state (default on the hosted site)
//   dev   – Firebase, but an isolated path: dartnight-dev/state
//   local – no network; state lives in this browser's localStorage, seeded from
//           tests/fixtures/sample-state.json. Default when served from localhost.
// Override with ?env=prod|dev|local. In local mode, ?reset re-seeds from the fixture.

export const firebaseConfig = {
  apiKey: "AIzaSyCyjvOb6gZdjkQ1DuEQfjfuTIbM8yqPmhU",
  authDomain: "dart-night.firebaseapp.com",
  databaseURL: "https://dart-night-default-rtdb.firebaseio.com",
  projectId: "dart-night",
  storageBucket: "dart-night.firebasestorage.app",
  messagingSenderId: "816607620926",
  appId: "1:816607620926:web:51ced50986a0477061866f"
};

const params = new URLSearchParams(location.search);
const isLocalHost = ['localhost', '127.0.0.1', ''].includes(location.hostname);
const requested = params.get('env');

export const ENV = ['prod', 'dev', 'local'].includes(requested) ? requested : (isLocalHost ? 'local' : 'prod');
export const DB_PATH = ENV === 'dev' ? 'dartnight-dev/state' : 'dartnight/state';
export const LOCAL_RESET = params.has('reset');

export const APP_VERSION = 'v1.3 · Built 2026-11-10';
