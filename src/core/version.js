/**
 * LoreForge Planner - Single Source of Truth for App Identity & Version
 *
 * Previously the product name and version were duplicated (and drifted) across
 * package.json (0.1.0), the status bar (v0.2.0), and export payloads ("1.0").
 * Everything now imports from here so there is exactly one place to bump.
 */

export const APP_NAME = 'LoreForge Planner';
export const APP_ID = 'loreforge-planner';

/** Application version. Keep in sync with package.json "version". */
export const APP_VERSION = '0.3.0';

/**
 * Schema version for exported project files. Bump this only when the export
 * data shape changes in a way that requires migration on import.
 */
export const EXPORT_SCHEMA_VERSION = 2;
