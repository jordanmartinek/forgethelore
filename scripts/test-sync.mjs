/**
 * Cloud sync engine tests (zero dependencies, no network, no DOM).
 *
 * Simulates two "devices" sharing one LocalMockBackend "cloud", exercising:
 *   - push + revision bump + dirty-check no-op
 *   - offline queueing then replay on reconnect
 *   - a second device pulling the first device's push
 *   - conflict when both edit and push against a stale rev (resolver: remote/local)
 *   - pull fast-forward when local is clean
 *
 * Run: NODE_OPTIONS= node scripts/test-sync.mjs
 */

import { LocalMockBackend } from '../src/core/sync/backend.js';
import { SyncEngine } from '../src/core/sync/sync-engine.js';
import { snapshotHash } from '../src/core/project-data.js';

let passed = 0, failed = 0;
function assert(cond, msg) { if (cond) passed++; else { failed++; console.error('  ✗', msg); } }

// A "device" = its own local key-value store + snapshot state + a SyncEngine
// pointed at the SHARED cloud store. Snapshots are simple {data} objects here.
function makeDevice(name, cloudStore, { online = true } = {}) {
  const local = { data: { characters: [] } }; // the device's current project data
  const revStore = new Map();
  let onlineFlag = online;

  const engine = new SyncEngine(new LocalMockBackend({ store: cloudStore }), {
    getActiveProject: () => ({ id: 'projX', name: 'Test' }),
    buildSnapshot: async () => ({ _meta: { projectId: 'projX', projectName: 'Test' }, data: JSON.parse(JSON.stringify(local.data)) }),
    applySnapshot: (pid, snap) => { local.data = JSON.parse(JSON.stringify(snap.data)); return Object.keys(local.data).length; },
    isOnline: () => onlineFlag,
    storage: { getItem: (k) => (revStore.has(k) ? revStore.get(k) : null), setItem: (k, v) => revStore.set(k, String(v)) },
    debounceMs: 0,
  });

  return {
    name, engine, local,
    edit(fn) { fn(local.data); },
    setOnline(v) { onlineFlag = v; },
  };
}

const cloud = new Map();

// ── Device A: first push creates rev 1 ───────────────────────────────────────
const a = makeDevice('A', cloud);
a.edit((d) => d.characters.push({ id: 'c1', name: 'Aurelian' }));
let r = await a.engine.flush();
assert(r.pushed.includes('projX'), 'A: first change pushes');
let remote = await a.engine.backend.get('projX');
assert(remote && remote.rev === 1, 'cloud rev is 1 after first push');
assert(remote.snapshot.data.characters.length === 1, 'cloud has A\'s character');

// ── Dirty check: flushing again with no change is a no-op ─────────────────────
r = await a.engine.flush();
assert(r.skipped.includes('projX') && !r.pushed.includes('projX'), 'unchanged flush is skipped (no-op push)');
remote = await a.engine.backend.get('projX');
assert(remote.rev === 1, 'cloud rev unchanged after no-op flush');

// ── Device B pulls A's data (clean local -> fast-forward) ────────────────────
const b = makeDevice('B', cloud);
const pullRes = await b.engine.pull('projX');
assert(pullRes === 'applied', 'B: pull applies A\'s snapshot');
assert(b.local.data.characters.length === 1 && b.local.data.characters[0].name === 'Aurelian', 'B now has Aurelian');

// ── Offline queueing then replay ─────────────────────────────────────────────
b.setOnline(false);
b.edit((d) => d.characters.push({ id: 'c2', name: 'Sera' }));
r = await b.engine.flush();
assert(r.offline === true, 'B offline: flush reports offline, nothing pushed');
assert((await b.engine.backend.get('projX')).rev === 1, 'cloud untouched while B offline');
// Reconnect and replay (the pending project is still queued).
b.setOnline(true);
r = await b.engine.flush();
assert(r.pushed.includes('projX'), 'B reconnect: queued change replays and pushes');
assert((await b.engine.backend.get('projX')).rev === 2, 'cloud rev is 2 after B pushes');

// ── Conflict: A still at rev 1, edits, pushes against stale base -> conflict ──
// Resolver picks 'remote' (default-safe): A adopts B's version.
let resolverCalls = 0;
a.engine.d.resolveConflict = async () => { resolverCalls++; return 'remote'; };
a.edit((d) => d.characters.push({ id: 'c3', name: 'Koss' }));
r = await a.engine.flush();
assert(resolverCalls === 1, 'A: stale push triggers conflict resolver');
assert(a.local.data.characters.some((c) => c.name === 'Sera'), 'A adopted B\'s data on remote-wins');
assert(!a.local.data.characters.some((c) => c.name === 'Koss'), 'A\'s conflicting local edit was discarded on remote-wins');

// ── Conflict with 'local' resolution forces our version on top ───────────────
const c = makeDevice('C', cloud);
await c.engine.pull('projX'); // C is now current (rev 2)
// Meanwhile D pushes rev 3.
const dDev = makeDevice('D', cloud);
await dDev.engine.pull('projX');
dDev.edit((d) => d.characters.push({ id: 'd1', name: 'Vex' }));
await dDev.engine.flush();
assert((await cloud) && (await c.engine.backend.get('projX')).rev === 3, 'D advanced cloud to rev 3');
// C edits from stale rev 2 and forces local.
c.engine.d.resolveConflict = async () => 'local';
c.edit((d) => d.characters.push({ id: 'c9', name: 'Voss' }));
r = await c.engine.flush();
assert(r.pushed.includes('projX'), 'C: local-wins conflict resolves by force-pushing');
const finalRemote = await c.engine.backend.get('projX');
assert(finalRemote.rev === 4, 'cloud advanced to rev 4 after C force-push');
assert(finalRemote.snapshot.data.characters.some((x) => x.name === 'Voss'), 'cloud has C\'s forced data');

// ── snapshotHash sanity ──────────────────────────────────────────────────────
assert(snapshotHash({ data: { a: [1, 2] } }) === snapshotHash({ data: { a: [1, 2] } }), 'hash is stable for equal data');
assert(snapshotHash({ data: { a: [1] } }) !== snapshotHash({ data: { a: [2] } }), 'hash differs for different data');

console.log(`\n${failed === 0 ? '✅' : '❌'} sync engine tests: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
