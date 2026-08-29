// Ambient declarations for the app's custom globals and loose DOM access.
// These document the intentional cross-module compatibility globals (published
// by conflict-board / faction-planner) so type-checking doesn't flag them.

export {};

declare global {
  interface Window {
    __loreforge_pieces?: any[];
    __loreforge_scenes?: any[];
    __loreforge_factions?: any[];
    __loreforge_factionData?: any[];
    showDirectoryPicker?: (opts?: any) => Promise<any>;
  }
}
