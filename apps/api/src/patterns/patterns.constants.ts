/**
 * Core hardcoded service-to-profession patterns
 * These are the foundational patterns that power the matching engine
 * They are read-only in the admin console and serve as the baseline
 */

export const CORE_SERVICE_PATTERNS = [
  // PLUMBING SERVICES
  {
    name: 'Leaky pipe',
    pattern: 'leaky pipe',
    category: 'service',
    mapsTo: 'plumber',
  },
  {
    name: 'Leaking pipe',
    pattern: 'leaking pipe',
    category: 'service',
    mapsTo: 'plumber',
  },
  {
    name: 'Burst pipe',
    pattern: 'burst pipe',
    category: 'service',
    mapsTo: 'plumber',
  },
  {
    name: 'Water pipe',
    pattern: 'water pipe',
    category: 'service',
    mapsTo: 'plumber',
  },
  {
    name: 'Toilet repair',
    pattern: 'toilet repair',
    category: 'service',
    mapsTo: 'plumber',
  },
  {
    name: 'Blocked drain',
    pattern: 'blocked drain',
    category: 'service',
    mapsTo: 'plumber',
  },
  {
    name: 'Drainage',
    pattern: 'drainage',
    category: 'service',
    mapsTo: 'plumber',
  },
  {
    name: 'Bathroom fitting',
    pattern: 'bathroom fitting',
    category: 'service',
    mapsTo: 'plumber',
  },
  {
    name: 'Hot water',
    pattern: 'hot water',
    category: 'service',
    mapsTo: 'plumber',
  },
  { name: 'Boiler', pattern: 'boiler', category: 'service', mapsTo: 'plumber' },
  {
    name: 'Sink repair',
    pattern: 'sink repair',
    category: 'service',
    mapsTo: 'plumber',
  },
  { name: 'Taps', pattern: 'taps', category: 'service', mapsTo: 'plumber' },
  { name: 'Faucet', pattern: 'faucet', category: 'service', mapsTo: 'plumber' },

  // ELECTRICAL SERVICES
  {
    name: 'Electrical work',
    pattern: 'electrical work',
    category: 'service',
    mapsTo: 'electrician',
  },
  {
    name: 'Wiring',
    pattern: 'wiring',
    category: 'service',
    mapsTo: 'electrician',
  },
  {
    name: 'Light installation',
    pattern: 'light installation',
    category: 'service',
    mapsTo: 'electrician',
  },
  {
    name: 'Socket installation',
    pattern: 'socket installation',
    category: 'service',
    mapsTo: 'electrician',
  },
  {
    name: 'Circuit breaker',
    pattern: 'circuit breaker',
    category: 'service',
    mapsTo: 'electrician',
  },
  {
    name: 'Electrical fault',
    pattern: 'electrical fault',
    category: 'service',
    mapsTo: 'electrician',
  },
  {
    name: 'Power outage',
    pattern: 'power outage',
    category: 'service',
    mapsTo: 'electrician',
  },
  {
    name: 'Rewiring',
    pattern: 'rewiring',
    category: 'service',
    mapsTo: 'electrician',
  },
  {
    name: 'Lighting',
    pattern: 'lighting',
    category: 'service',
    mapsTo: 'electrician',
  },
  {
    name: 'Electrics',
    pattern: 'electrics',
    category: 'service',
    mapsTo: 'electrician',
  },
  {
    name: 'Light not working',
    pattern: 'light not working',
    category: 'service',
    mapsTo: 'electrician',
  },
  {
    name: 'Lights not working',
    pattern: 'lights not working',
    category: 'service',
    mapsTo: 'electrician',
  },
  {
    name: 'Bulb replacement',
    pattern: 'bulb replacement',
    category: 'service',
    mapsTo: 'electrician',
  },
  {
    name: 'Replace bulb',
    pattern: 'replace bulb',
    category: 'service',
    mapsTo: 'electrician',
  },
  {
    name: 'Lamp repair',
    pattern: 'lamp repair',
    category: 'service',
    mapsTo: 'electrician',
  },
  {
    name: 'Short circuit',
    pattern: 'short circuit',
    category: 'service',
    mapsTo: 'electrician',
  },
  {
    name: 'Tripping power',
    pattern: 'tripping power',
    category: 'service',
    mapsTo: 'electrician',
  },
  {
    name: 'Fuse blown',
    pattern: 'fuse blown',
    category: 'service',
    mapsTo: 'electrician',
  },
  {
    name: 'Breaker tripped',
    pattern: 'breaker tripped',
    category: 'service',
    mapsTo: 'electrician',
  },
  {
    name: 'Distribution panel',
    pattern: 'distribution panel',
    category: 'service',
    mapsTo: 'electrician',
  },
  {
    name: 'Electrical panel',
    pattern: 'electrical panel',
    category: 'service',
    mapsTo: 'electrician',
  },
  {
    name: 'Dimmer switch',
    pattern: 'dimmer switch',
    category: 'service',
    mapsTo: 'electrician',
  },
  {
    name: 'Install dimmer',
    pattern: 'install dimmer',
    category: 'service',
    mapsTo: 'electrician',
  },
  {
    name: 'LED light',
    pattern: 'led light',
    category: 'service',
    mapsTo: 'electrician',
  },
  {
    name: 'Ceiling light',
    pattern: 'ceiling light',
    category: 'service',
    mapsTo: 'electrician',
  },
  {
    name: 'Downlight',
    pattern: 'downlight',
    category: 'service',
    mapsTo: 'electrician',
  },
  {
    name: 'Spotlight',
    pattern: 'spotlight',
    category: 'service',
    mapsTo: 'electrician',
  },
  {
    name: 'Track lighting',
    pattern: 'track lighting',
    category: 'service',
    mapsTo: 'electrician',
  },
  {
    name: 'Socket repair',
    pattern: 'socket repair',
    category: 'service',
    mapsTo: 'electrician',
  },
  {
    name: 'Switch repair',
    pattern: 'switch repair',
    category: 'service',
    mapsTo: 'electrician',
  },
  {
    name: 'Plug point',
    pattern: 'plug point',
    category: 'service',
    mapsTo: 'electrician',
  },
  {
    name: 'Power socket',
    pattern: 'power socket',
    category: 'service',
    mapsTo: 'electrician',
  },

  // CARPENTRY/WOODWORK
  {
    name: 'Carpentry',
    pattern: 'carpentry',
    category: 'service',
    mapsTo: 'carpenter',
  },
  {
    name: 'Wooden door',
    pattern: 'wooden door',
    category: 'service',
    mapsTo: 'carpenter',
  },
  {
    name: 'Cabinet',
    pattern: 'cabinet',
    category: 'service',
    mapsTo: 'carpenter',
  },
  {
    name: 'Shelving',
    pattern: 'shelving',
    category: 'service',
    mapsTo: 'carpenter',
  },
  {
    name: 'Desk building',
    pattern: 'desk building',
    category: 'service',
    mapsTo: 'carpenter',
  },
  {
    name: 'Wood repair',
    pattern: 'wood repair',
    category: 'service',
    mapsTo: 'carpenter',
  },
  {
    name: 'Wardrobe',
    pattern: 'wardrobe',
    category: 'service',
    mapsTo: 'carpenter',
  },
  {
    name: 'Custom woodwork',
    pattern: 'custom woodwork',
    category: 'service',
    mapsTo: 'carpenter',
  },
  {
    name: 'Timber work',
    pattern: 'timber work',
    category: 'service',
    mapsTo: 'carpenter',
  },
  {
    name: 'Joinery',
    pattern: 'joinery',
    category: 'service',
    mapsTo: 'carpenter',
  },

  // PAINTING & DECORATION
  {
    name: 'Paint wall',
    pattern: 'paint wall',
    category: 'service',
    mapsTo: 'painter',
  },
  {
    name: 'Painting',
    pattern: 'painting',
    category: 'service',
    mapsTo: 'painter',
  },
  {
    name: 'Wall paint',
    pattern: 'wall paint',
    category: 'service',
    mapsTo: 'painter',
  },
  {
    name: 'Interior paint',
    pattern: 'interior paint',
    category: 'service',
    mapsTo: 'painter',
  },
  {
    name: 'Exterior paint',
    pattern: 'exterior paint',
    category: 'service',
    mapsTo: 'painter',
  },
  {
    name: 'Repainting',
    pattern: 'repainting',
    category: 'service',
    mapsTo: 'painter',
  },
  {
    name: 'Wall decoration',
    pattern: 'wall decoration',
    category: 'service',
    mapsTo: 'painter',
  },
  {
    name: 'Decorating',
    pattern: 'decorating',
    category: 'service',
    mapsTo: 'painter',
  },
  {
    name: 'Wallpaper',
    pattern: 'wallpaper',
    category: 'service',
    mapsTo: 'painter',
  },
  {
    name: 'Paint job',
    pattern: 'paint job',
    category: 'service',
    mapsTo: 'painter',
  },

  // TILING/FLOORING
  {
    name: 'Tile installation',
    pattern: 'tile installation',
    category: 'service',
    mapsTo: 'tiler',
  },
  { name: 'Tiling', pattern: 'tiling', category: 'service', mapsTo: 'tiler' },
  {
    name: 'Floor tile',
    pattern: 'floor tile',
    category: 'service',
    mapsTo: 'tiler',
  },
  {
    name: 'Wall tile',
    pattern: 'wall tile',
    category: 'service',
    mapsTo: 'tiler',
  },
  {
    name: 'Bathroom tile',
    pattern: 'bathroom tile',
    category: 'service',
    mapsTo: 'tiler',
  },
  {
    name: 'Kitchen tile',
    pattern: 'kitchen tile',
    category: 'service',
    mapsTo: 'tiler',
  },
  { name: 'Grout', pattern: 'grout', category: 'service', mapsTo: 'tiler' },
  { name: 'Mosaic', pattern: 'mosaic', category: 'service', mapsTo: 'tiler' },
  { name: 'Marble', pattern: 'marble', category: 'service', mapsTo: 'tiler' },

  // MASONRY/CONCRETE
  {
    name: 'Brick work',
    pattern: 'brick work',
    category: 'service',
    mapsTo: 'mason',
  },
  { name: 'Masonry', pattern: 'masonry', category: 'service', mapsTo: 'mason' },
  {
    name: 'Concrete',
    pattern: 'concrete',
    category: 'service',
    mapsTo: 'mason',
  },
  {
    name: 'Brickwork',
    pattern: 'brickwork',
    category: 'service',
    mapsTo: 'mason',
  },
  {
    name: 'Stone work',
    pattern: 'stone work',
    category: 'service',
    mapsTo: 'mason',
  },
  {
    name: 'Wall construction',
    pattern: 'wall construction',
    category: 'service',
    mapsTo: 'mason',
  },
  {
    name: 'Foundation',
    pattern: 'foundation',
    category: 'service',
    mapsTo: 'mason',
  },
  {
    name: 'Concrete floor',
    pattern: 'concrete floor',
    category: 'service',
    mapsTo: 'mason',
  },
  {
    name: 'Retaining wall',
    pattern: 'retaining wall',
    category: 'service',
    mapsTo: 'mason',
  },

  // GENERAL BUILDING/RENOVATION
  {
    name: 'Renovation',
    pattern: 'renovation',
    category: 'service',
    mapsTo: 'builder',
  },
  { name: 'Fitout', pattern: 'fitout', category: 'service', mapsTo: 'builder' },
  {
    name: 'Construction',
    pattern: 'construction',
    category: 'service',
    mapsTo: 'builder',
  },
  {
    name: 'Building work',
    pattern: 'building work',
    category: 'service',
    mapsTo: 'builder',
  },
  {
    name: 'Structural work',
    pattern: 'structural work',
    category: 'service',
    mapsTo: 'builder',
  },
  {
    name: 'Extension',
    pattern: 'extension',
    category: 'service',
    mapsTo: 'builder',
  },
  {
    name: 'New build',
    pattern: 'new build',
    category: 'service',
    mapsTo: 'builder',
  },
  {
    name: 'Refurbishment',
    pattern: 'refurbishment',
    category: 'service',
    mapsTo: 'builder',
  },
  {
    name: 'Major works',
    pattern: 'major works',
    category: 'service',
    mapsTo: 'builder',
  },

  // ARCHITECTURE/DESIGN
  {
    name: 'Architectural design',
    pattern: 'architectural design',
    category: 'service',
    mapsTo: 'architect',
  },
  {
    name: 'Building design',
    pattern: 'building design',
    category: 'service',
    mapsTo: 'architect',
  },
  {
    name: 'Space planning',
    pattern: 'space planning',
    category: 'service',
    mapsTo: 'architect',
  },
  {
    name: 'Floor plan',
    pattern: 'floor plan',
    category: 'service',
    mapsTo: 'architect',
  },
  {
    name: 'Design consultation',
    pattern: 'design consultation',
    category: 'service',
    mapsTo: 'architect',
  },
  {
    name: 'Interior design',
    pattern: 'interior design',
    category: 'service',
    mapsTo: 'architect',
  },

  // HVAC
  {
    name: 'Air conditioning',
    pattern: 'air conditioning',
    category: 'service',
    mapsTo: 'hvac',
  },
  {
    name: 'AC repair',
    pattern: 'ac repair',
    category: 'service',
    mapsTo: 'hvac',
  },
  { name: 'Heating', pattern: 'heating', category: 'service', mapsTo: 'hvac' },
  {
    name: 'Ventilation',
    pattern: 'ventilation',
    category: 'service',
    mapsTo: 'hvac',
  },
  {
    name: 'Climate control',
    pattern: 'climate control',
    category: 'service',
    mapsTo: 'hvac',
  },
  {
    name: 'Thermostat',
    pattern: 'thermostat',
    category: 'service',
    mapsTo: 'hvac',
  },

  // GLAZING/WINDOWS
  { name: 'Window', pattern: 'window', category: 'service', mapsTo: 'glazier' },
  { name: 'Glass', pattern: 'glass', category: 'service', mapsTo: 'glazier' },
  {
    name: 'Glazing',
    pattern: 'glazing',
    category: 'service',
    mapsTo: 'glazier',
  },
  { name: 'Mirror', pattern: 'mirror', category: 'service', mapsTo: 'glazier' },
  {
    name: 'Glass door',
    pattern: 'glass door',
    category: 'service',
    mapsTo: 'glazier',
  },
  {
    name: 'Window repair',
    pattern: 'window repair',
    category: 'service',
    mapsTo: 'glazier',
  },
  {
    name: 'Double glazing',
    pattern: 'double glazing',
    category: 'service',
    mapsTo: 'glazier',
  },

  // FLOORING
  {
    name: 'Flooring',
    pattern: 'flooring',
    category: 'service',
    mapsTo: 'flooring',
  },
  {
    name: 'Laminate',
    pattern: 'laminate',
    category: 'service',
    mapsTo: 'flooring',
  },
  {
    name: 'Wooden floor',
    pattern: 'wooden floor',
    category: 'service',
    mapsTo: 'flooring',
  },
  {
    name: 'Vinyl floor',
    pattern: 'vinyl floor',
    category: 'service',
    mapsTo: 'flooring',
  },
  {
    name: 'Carpet',
    pattern: 'carpet',
    category: 'service',
    mapsTo: 'flooring',
  },
  {
    name: 'Floor installation',
    pattern: 'floor installation',
    category: 'service',
    mapsTo: 'flooring',
  },
  {
    name: 'Floor repair',
    pattern: 'floor repair',
    category: 'service',
    mapsTo: 'flooring',
  },
];
