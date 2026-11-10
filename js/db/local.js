// Offline adapter for development: localStorage + BroadcastChannel so several
// tabs stay in sync like Firebase clients do. Never touches the network
// (except fetching the seed fixture from the same origin).
const KEY = 'dartnight-local-state';
const FIXTURE = 'tests/fixtures/sample-state.json';

// Mimic Firebase storage: it drops nulls and empty arrays/objects, so the app
// must cope with those fields being missing after a round trip.
export function firebaseShape(v) {
  if (v === null || v === undefined) return undefined;
  if (Array.isArray(v)) {
    const out = v.map(firebaseShape);
    return out.some(x => x !== undefined) ? out.map(x => x ?? null) : undefined;
  }
  if (typeof v === 'object') {
    const out = {};
    for (const [k, val] of Object.entries(v)) { const s = firebaseShape(val); if (s !== undefined) out[k] = s; }
    return Object.keys(out).length ? out : undefined;
  }
  return v;
}

export function createLocalAdapter({ reset = false } = {}) {
  const channel = 'BroadcastChannel' in window ? new BroadcastChannel(KEY) : null;
  let listener = null;
  const read = () => { try { const raw = localStorage.getItem(KEY); return raw ? JSON.parse(raw) : null; } catch { return null; } };
  const emit = () => listener && listener(read());

  return {
    async subscribe(onData, onError) {
      listener = onData;
      try {
        if (reset || read() === null) {
          const res = await fetch(FIXTURE);
          localStorage.setItem(KEY, await res.text());
        }
      } catch (e) { onError && onError(e); }
      if (channel) channel.onmessage = emit;
      emit();
    },
    async write(value) {
      localStorage.setItem(KEY, JSON.stringify(firebaseShape(value) ?? null));
      if (channel) channel.postMessage('changed');
      emit(); // Firebase also fires the local listener on set()
    },
  };
}
