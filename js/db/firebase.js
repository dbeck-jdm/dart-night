// Firebase Realtime Database adapter. Loaded only when ENV is prod or dev.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getDatabase, ref, onValue, set } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js';
import { firebaseConfig } from '../config.js';

export function createFirebaseAdapter(path) {
  const db = getDatabase(initializeApp(firebaseConfig));
  const stateRef = ref(db, path);
  return {
    subscribe(onData, onError) { onValue(stateRef, snap => onData(snap.val()), onError); },
    write(value) { return set(stateRef, value); },
  };
}
