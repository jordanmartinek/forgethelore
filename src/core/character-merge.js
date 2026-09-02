/**
 * LoreForge Planner - Character list reconciliation (core, DOM-free)
 *
 * The `characters` collection is written by more than one workspace: the
 * Character Planner (free-form fields) and the Character Builder (a `traitTags`
 * array). The Planner historically re-persisted its whole import-time snapshot
 * on every edit, which silently dropped fields it didn't know about (like
 * `traitTags`) and records created elsewhere. This pure helper reconciles an
 * in-memory list against the live stored list right before a save so the two
 * workspaces coexist without clobbering each other.
 *
 * Rules:
 *   - For a record present in both: start from the STORED record (preserving
 *     foreign fields such as `traitTags`) and overlay the in-memory fields
 *     (which the editing workspace just changed).
 *   - Records present only in memory (newly created here) are kept as-is.
 *   - Records present only in storage (created by another workspace) are kept,
 *     UNLESS their id is in `deletedIds` (explicitly removed in this session).
 *
 * @param {any[]} memory   the editing workspace's in-memory records
 * @param {any[]} stored   the live stored records (loadData result)
 * @param {Set<string>|string[]} [deletedIds]
 * @returns {any[]} the reconciled list to persist
 */
export function reconcileCharacters(memory, stored, deletedIds = new Set()) {
  const deleted = deletedIds instanceof Set ? deletedIds : new Set(deletedIds || []);
  const mem = Array.isArray(memory) ? memory : [];
  const storedById = new Map((Array.isArray(stored) ? stored : []).map((r) => [r && r.id, r]));
  const seen = new Set();

  const merged = mem.map((rec) => {
    seen.add(rec.id);
    const prev = storedById.get(rec.id);
    return prev ? { ...prev, ...rec } : rec;
  });

  for (const rec of storedById.values()) {
    if (rec && !seen.has(rec.id) && !deleted.has(rec.id)) merged.push(rec);
  }

  return merged;
}
