/**
 * LoreForge Planner - Shared element/stamp catalog (core, DOM-free)
 *
 * The curated, grouped catalog of placeable elements ("stamps") drawn from the
 * world-shapes silhouette library, split by style (fantasy / sci-fi). This used
 * to live inside the Fantasy Map module, but both the 2D map painter AND the 3D
 * planet painter place the same elements, so the data lives here as one shared,
 * pure source of truth. No DOM — just the catalog structure, default colors, and
 * scatter variant families.
 *
 * STAMP_SETS[style] = [{ group: 'Label', items: [{ shape, label }] }, …]
 * STAMP_COLORS[shape] = '#hex'   (default tint per shape)
 * STAMP_VARIANTS[shape] = [shape…] (related shapes mixed in when scattering)
 */

/** Grouped, browsable element catalog per style. */
export const STAMP_SETS = {
  fantasy: [
    { group: 'Terrain', items: [
      { shape: 'mountain', label: 'Mountains' }, { shape: 'volcano', label: 'Volcano' },
      { shape: 'hill', label: 'Hills' }, { shape: 'forest', label: 'Forest' },
      { shape: 'pine_tree', label: 'Pines' }, { shape: 'tree', label: 'Tree' },
      { shape: 'cave', label: 'Cave' }, { shape: 'canyon', label: 'Canyon' },
    ]},
    { group: 'Water', items: [
      { shape: 'lake', label: 'Lake' }, { shape: 'waterfall', label: 'Falls' },
      { shape: 'ocean', label: 'Ocean' }, { shape: 'river', label: 'River' },
    ]},
    { group: 'Settlements', items: [
      { shape: 'metropolis', label: 'City' }, { shape: 'town', label: 'Town' },
      { shape: 'village', label: 'Village' }, { shape: 'district', label: 'District' },
    ]},
    { group: 'Structures', items: [
      { shape: 'castle', label: 'Castle' }, { shape: 'fortress', label: 'Fortress' },
      { shape: 'tower', label: 'Tower' }, { shape: 'temple', label: 'Temple' },
      { shape: 'ruins', label: 'Ruins' }, { shape: 'house', label: 'House' },
      { shape: 'hut', label: 'Hut' }, { shape: 'tent', label: 'Tent' },
      { shape: 'bridge', label: 'Bridge' }, { shape: 'wall', label: 'Wall' },
      { shape: 'monument', label: 'Monument' },
    ]},
    { group: 'Building Parts', items: [
      { shape: 'wall_straight', label: 'Wall' }, { shape: 'wall_corner', label: 'Corner' },
      { shape: 'door_single', label: 'Door' }, { shape: 'gate', label: 'Gate' },
      { shape: 'stairs', label: 'Stairs' }, { shape: 'stairs_spiral', label: 'Spiral' },
      { shape: 'column', label: 'Column' }, { shape: 'archway', label: 'Arch' },
      { shape: 'fence', label: 'Fence' }, { shape: 'roof_gable', label: 'Roof' },
      { shape: 'chimney', label: 'Chimney' }, { shape: 'balcony', label: 'Balcony' },
    ]},
    { group: 'Rooms', items: [
      { shape: 'room_square', label: 'Square' }, { shape: 'room_wide', label: 'Wide' },
      { shape: 'room_tall', label: 'Tall' }, { shape: 'room_l', label: 'L-Room' },
      { shape: 'room_t', label: 'T-Room' }, { shape: 'room_round', label: 'Round' },
      { shape: 'room_oct', label: 'Octagon' }, { shape: 'corridor_h', label: 'Hall (H)' },
      { shape: 'corridor_v', label: 'Hall (V)' }, { shape: 'corridor_cross', label: 'Cross' },
      { shape: 'corridor_corner', label: 'Bend' }, { shape: 'vault_room', label: 'Vault' },
    ]},
    { group: 'Furniture', items: [
      { shape: 'bed', label: 'Bed' }, { shape: 'table_round', label: 'Table' },
      { shape: 'table_long', label: 'Long Table' }, { shape: 'chair', label: 'Chair' },
      { shape: 'desk', label: 'Desk' }, { shape: 'shelf', label: 'Shelf' },
      { shape: 'crate', label: 'Crate' }, { shape: 'barrel', label: 'Barrel' },
      { shape: 'statue', label: 'Statue' }, { shape: 'fountain', label: 'Fountain' },
      { shape: 'pillar', label: 'Pillar' }, { shape: 'planter', label: 'Planter' },
    ]},
    { group: 'Markers', items: [
      { shape: 'pin', label: 'Pin' }, { shape: 'marker_star', label: 'Star' },
      { shape: 'marker_flag', label: 'Flag' }, { shape: 'marker_shield', label: 'Shield' },
      { shape: 'marker_x', label: 'X' }, { shape: 'marker_skull', label: 'Skull' },
      { shape: 'marker_danger', label: 'Danger' }, { shape: 'marker_diamond', label: 'Diamond' },
      { shape: 'marker_cross', label: 'Cross' }, { shape: 'marker_anchor', label: 'Anchor' },
    ]},
  ],
  scifi: [
    { group: 'Cosmic', items: [
      { shape: 'sun', label: 'Star' }, { shape: 'planet', label: 'Planet' },
      { shape: 'ringed_planet', label: 'Ringed World' }, { shape: 'gas_giant', label: 'Gas Giant' },
      { shape: 'moon', label: 'Moon' }, { shape: 'asteroid_belt', label: 'Belt' },
      { shape: 'nebula', label: 'Nebula' }, { shape: 'anomaly', label: 'Anomaly' },
      { shape: 'void_conduit', label: 'Wormhole' },
    ]},
    { group: 'Fleets & Craft', items: [
      { shape: 'spaceship', label: 'Ship' }, { shape: 'fleet', label: 'Fleet' },
      { shape: 'shuttle', label: 'Shuttle' }, { shape: 'fighter', label: 'Fighter' },
      { shape: 'freighter', label: 'Freighter' }, { shape: 'gunship', label: 'Gunship' },
      { shape: 'probe', label: 'Probe' }, { shape: 'drone', label: 'Drone' },
      { shape: 'hovercar', label: 'Hovercar' }, { shape: 'rover', label: 'Rover' },
      { shape: 'tank', label: 'Tank' }, { shape: 'transport', label: 'Transport' },
      { shape: 'mech', label: 'Mech' },
    ]},
    { group: 'Stations', items: [
      { shape: 'space_station', label: 'Station' }, { shape: 'satellite', label: 'Satellite' },
      { shape: 'megastructure', label: 'Megastructure' }, { shape: 'portal', label: 'Jump Gate' },
      { shape: 'module_hub', label: 'Hub' }, { shape: 'module_ring', label: 'Ring' },
      { shape: 'module_cylinder', label: 'Cylinder' }, { shape: 'module_solar', label: 'Solar Wing' },
      { shape: 'module_dock', label: 'Dock' }, { shape: 'module_habitat', label: 'Habitat' },
      { shape: 'module_comms', label: 'Comms' }, { shape: 'truss', label: 'Truss' },
      { shape: 'cupola', label: 'Cupola' }, { shape: 'gravity_ring', label: 'Gravity Ring' },
      { shape: 'drydock', label: 'Drydock' }, { shape: 'refinery', label: 'Refinery' },
    ]},
    { group: 'Ship Parts', items: [
      { shape: 'hull_fore', label: 'Fore Hull' }, { shape: 'hull_mid', label: 'Mid Hull' },
      { shape: 'hull_aft', label: 'Aft Hull' }, { shape: 'cockpit', label: 'Cockpit' },
      { shape: 'wing_left', label: 'Wing L' }, { shape: 'wing_right', label: 'Wing R' },
      { shape: 'thruster', label: 'Thruster' }, { shape: 'engine_pod', label: 'Engine' },
      { shape: 'nacelle', label: 'Nacelle' }, { shape: 'reactor_core', label: 'Reactor' },
      { shape: 'fuel_tank', label: 'Fuel Tank' }, { shape: 'cargo_pod', label: 'Cargo Pod' },
      { shape: 'landing_gear', label: 'Landing Gear' }, { shape: 'weapon_turret', label: 'Turret' },
      { shape: 'shield_gen', label: 'Shield Gen' }, { shape: 'docking_ring', label: 'Docking Ring' },
      { shape: 'escape_pod', label: 'Escape Pod' }, { shape: 'sensor_array', label: 'Sensors' },
    ]},
    { group: 'Rooms', items: [
      { shape: 'room_square', label: 'Room' }, { shape: 'room_round', label: 'Round Room' },
      { shape: 'corridor_h', label: 'Hall (H)' }, { shape: 'corridor_v', label: 'Hall (V)' },
      { shape: 'corridor_cross', label: 'Cross' }, { shape: 'corridor_corner', label: 'Bend' },
      { shape: 'airlock', label: 'Airlock' }, { shape: 'bridge_room', label: 'Bridge' },
      { shape: 'medbay', label: 'Medbay' }, { shape: 'armory', label: 'Armory' },
      { shape: 'cargo_bay', label: 'Cargo Bay' }, { shape: 'engine_room', label: 'Engine Room' },
      { shape: 'reactor_room', label: 'Reactor Room' }, { shape: 'quarters', label: 'Quarters' },
      { shape: 'lab_room', label: 'Lab' }, { shape: 'hangar', label: 'Hangar' },
      { shape: 'vault_room', label: 'Vault' }, { shape: 'observatory', label: 'Observatory' },
    ]},
    { group: 'Furniture & Tech', items: [
      { shape: 'bed', label: 'Bed' }, { shape: 'bunk', label: 'Bunk' },
      { shape: 'console', label: 'Console' }, { shape: 'terminal', label: 'Terminal' },
      { shape: 'workbench', label: 'Workbench' }, { shape: 'server_rack', label: 'Servers' },
      { shape: 'screen', label: 'Screen' }, { shape: 'locker', label: 'Locker' },
      { shape: 'container', label: 'Container' }, { shape: 'cryopod', label: 'Cryopod' },
      { shape: 'hydroponics', label: 'Hydroponics' }, { shape: 'holotable', label: 'Holotable' },
      { shape: 'data_core', label: 'Data Core' }, { shape: 'generator', label: 'Generator' },
      { shape: 'scanner', label: 'Scanner' },
    ]},
    { group: 'Props & POI', items: [
      { shape: 'beacon', label: 'Beacon' }, { shape: 'relay', label: 'Relay' },
      { shape: 'turret_gun', label: 'Gun Turret' }, { shape: 'power_node', label: 'Power Node' },
      { shape: 'jump_gate', label: 'Jump Gate' }, { shape: 'satellite_dish', label: 'Dish' },
      { shape: 'mine', label: 'Mine' }, { shape: 'crate_supply', label: 'Supply Crate' },
      { shape: 'solar_panel', label: 'Solar Panel' }, { shape: 'antenna_dish', label: 'Antenna' },
      { shape: 'waypoint', label: 'Waypoint' }, { shape: 'flag', label: 'Flag' },
    ]},
    { group: 'Markers', items: [
      { shape: 'pin', label: 'Pin' }, { shape: 'marker_star', label: 'Star' },
      { shape: 'marker_target', label: 'Target' }, { shape: 'marker_diamond', label: 'Diamond' },
      { shape: 'marker_danger', label: 'Danger' }, { shape: 'marker_dot', label: 'Dot' },
      { shape: 'marker_x', label: 'X' }, { shape: 'marker_cross', label: 'Cross' },
    ]},
  ],
};

/** Default tint per shape id (used for palette previews and placed elements). */
export const STAMP_COLORS = {
  mountain: '#8a8178', volcano: '#a8785c', hill: '#84a35a', forest: '#3f7d4f', pine_tree: '#2f6b45',
  tree: '#3f7d4f', metropolis: '#8a7a5a', town: '#8a7a5a', village: '#9c8a63', castle: '#b0a080',
  tower: '#b0a080', temple: '#c8bda0', ruins: '#9a8f7a', cave: '#57534e', lake: '#3f6b8a', waterfall: '#5a8fa8',
  sun: '#f5b73c', planet: '#4fa3d9', ringed_planet: '#6fc0c0', gas_giant: '#e0a458', moon: '#cbd5e1',
  asteroid_belt: '#9ca3af', space_station: '#7fd0ff', spaceship: '#cfe3ff', fleet: '#9fb8d0',
  satellite: '#a5c4ff', megastructure: '#8fa8ff', portal: '#c07fff', anomaly: '#c084fc', void_conduit: '#8b7cf6',
  nebula: '#b06fd0',
  // Fantasy structures & geography extras
  fortress: '#a89878', house: '#c0a878', hut: '#b89a63', tent: '#c9b382', bridge: '#9a8f7a',
  wall: '#9a8f7a', monument: '#c8bda0', district: '#9c8a63', canyon: '#b0764e',
  ocean: '#3f6b8a', river: '#4f86a8',
  // Rooms / corridors (neutral hull grey)
  room_square: '#8b93a0', room_wide: '#8b93a0', room_tall: '#8b93a0', room_l: '#8b93a0',
  room_t: '#8b93a0', room_round: '#8b93a0', room_oct: '#8b93a0',
  corridor_h: '#7d8590', corridor_v: '#7d8590', corridor_cross: '#7d8590', corridor_corner: '#7d8590',
  airlock: '#96a0ad', bridge_room: '#8aa0b8', medbay: '#c8d4dc', armory: '#8a8f96',
  cargo_bay: '#9a8f6a', engine_room: '#a08a6a', reactor_room: '#b0906a', quarters: '#96a0ad',
  lab_room: '#9ec8d0', hangar: '#7d8590', vault_room: '#9aa0a8', observatory: '#8aa0c0',
  // Furniture / fixtures (warm neutral)
  bed: '#b7a488', bunk: '#a89880', table_round: '#b89a70', table_long: '#b89a70', desk: '#a88f68',
  chair: '#a88f68', sofa: '#8a7f9a', console: '#7d8fa0', terminal: '#7d8fa0', workbench: '#98907e',
  shelf: '#a88f68', locker: '#8f96a0', crate: '#a8895c', barrel: '#8a6f4a', container: '#8a9a6a',
  planter: '#7a8f5a', lamp: '#c8b878', screen: '#6f8296', server_rack: '#7d8590', toilet: '#d8e0e6',
  sink: '#d0dce4', stove: '#9096a0', fridge: '#c0ccd4', statue: '#c8c0a8', fountain: '#8fb0c0',
  pillar: '#c8c0a8', hydroponics: '#6f9a5a', cryopod: '#9ec4dc',
  // Building parts
  wall_straight: '#9a9088', wall_corner: '#9a9088', door_single: '#a08a68', door_double: '#a08a68',
  blast_door: '#8f96a0', window_row: '#a0b0bc', stairs: '#a09888', stairs_spiral: '#a09888',
  ladder: '#98907e', elevator: '#8f96a0', ramp: '#9a9088', column: '#c8c0a8', archway: '#b8b09a',
  gate: '#9a8f7a', fence: '#98907e', roof_gable: '#a06850', chimney: '#8a7f76', balcony: '#b8b09a',
  solar_panel: '#3a6bbf', antenna_dish: '#b0b8c0', turbine: '#c0c8d0',
  // Ship parts (cool metallic)
  hull_fore: '#9aa4b0', hull_mid: '#9aa4b0', hull_aft: '#9aa4b0', cockpit: '#8fb0d0',
  wing_left: '#8f98a4', wing_right: '#8f98a4', thruster: '#a08f8a', engine_pod: '#8a94a0',
  nacelle: '#8fa0b8', reactor_core: '#7fd0c0', fuel_tank: '#a0a8b0', cargo_pod: '#9a8f6a',
  landing_gear: '#8f96a0', weapon_turret: '#8a8f96', shield_gen: '#7fb8e0', docking_ring: '#a0a8b0',
  escape_pod: '#c8b878', sensor_array: '#8fa0b8',
  // Station modules
  module_hub: '#9aa4b0', module_ring: '#9aa4b0', module_cylinder: '#9aa4b0', module_solar: '#7d8fa0',
  module_dock: '#8f96a0', module_habitat: '#96a4b0', module_comms: '#8fa0b8', truss: '#8f96a0',
  cupola: '#8fb0d0', gravity_ring: '#9aa4b0', drydock: '#8a9096', refinery: '#a08f70',
  // Sci-fi props
  beacon: '#ffcf6a', relay: '#8fb8e0', turret_gun: '#8a8f96', generator: '#e0b060', power_node: '#7fd0ff',
  scanner: '#7fd0c0', holotable: '#7fd0ff', data_core: '#8fa0e0', jump_gate: '#c07fff', drone: '#9aa4b0',
  mech: '#8f96a0', rover: '#b0a070', satellite_dish: '#b0b8c0', mine: '#8a8f96', crate_supply: '#a8895c',
  waypoint: '#7fd0ff', flag: '#e05a5a',
  // Vehicles
  shuttle: '#b0bcc8', fighter: '#9aa4b0', freighter: '#9a8f6a', hovercar: '#8fb0d0', tank: '#7d8560',
  transport: '#9aa0a8', gunship: '#8a9096', probe: '#b0b8c0',
  // Markers
  pin: '#e05a5a', marker_x: '#e05a5a', marker_star: '#f5b73c', marker_diamond: '#7fd0ff',
  marker_flag: '#e05a5a', marker_shield: '#6f9ae0', marker_skull: '#d8d0c0', marker_danger: '#f5a623',
  marker_target: '#e05a5a', marker_dot: '#7fd0ff', marker_cross: '#e05a5a', marker_anchor: '#8fa0b8',
};

/**
 * When you paint a stroke of one element, mix in related shapes so a "forest"
 * isn't a row of identical trees. The active shape is always included; the
 * scatter picks among these per placement. Shapes not listed just use themselves.
 */
export const STAMP_VARIANTS = {
  forest: ['forest', 'tree', 'pine_tree'],
  tree: ['tree', 'pine_tree', 'forest'],
  pine_tree: ['pine_tree', 'tree', 'forest'],
  mountain: ['mountain', 'hill', 'volcano'],
  hill: ['hill', 'mountain'],
  metropolis: ['metropolis', 'town'],
  town: ['town', 'village', 'metropolis'],
  village: ['village', 'town'],
  asteroid_belt: ['asteroid_belt', 'moon'],
  fleet: ['fleet', 'spaceship'],
  spaceship: ['spaceship', 'fleet'],
};

/** Default tint for a shape id (falls back to a neutral sand-grey). */
export function stampColor(shape) {
  return STAMP_COLORS[shape] || '#8a8178';
}

/** Flatten a style's grouped catalog into a plain [{shape,label}] list. */
export function stampItemsForStyle(style) {
  const groups = STAMP_SETS[style] || STAMP_SETS.fantasy;
  return groups.flatMap((g) => g.items);
}
