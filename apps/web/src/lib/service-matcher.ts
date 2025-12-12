/**
 * Service-to-Profession Mapping
 * 
 * Maps specific services, tasks, and problems to the professions that handle them.
 * This allows users to search for what they need (e.g., "fix a leaky pipe")
 * and be matched to the right professional type (e.g., "plumber").
 * 
 * Structure:
 * {
 *   "service keyword or phrase": "profession_type",
 *   "another service": "profession_type",
 * }
 * 
 * Add more services by extending this map.
 * Keep keywords lowercase and concise.
 */

export const SERVICE_TO_PROFESSION: Record<string, string> = {
  // PLUMBING SERVICES
  'leaky pipe': 'plumber',
  'leaking pipe': 'plumber',
  'burst pipe': 'plumber',
  'water pipe': 'plumber',
  'toilet repair': 'plumber',
  'blocked drain': 'plumber',
  'drainage': 'plumber',
  'bathroom fitting': 'plumber',
  'hot water': 'plumber',
  'boiler': 'plumber',
  'sink repair': 'plumber',
  'taps': 'plumber',
  'faucet': 'plumber',

  // ELECTRICAL SERVICES
  'electrical work': 'electrician',
  'wiring': 'electrician',
  'light installation': 'electrician',
  'socket installation': 'electrician',
  'circuit breaker': 'electrician',
  'electrical fault': 'electrician',
  'power outage': 'electrician',
  'rewiring': 'electrician',
  'lighting': 'electrician',
  'electrics': 'electrician',
  // Expanded common phrases
  'light not working': 'electrician',
  'lights not working': 'electrician',
  'bulb replacement': 'electrician',
  'replace bulb': 'electrician',
  'lamp repair': 'electrician',
  'short circuit': 'electrician',
  'tripping power': 'electrician',
  'fuse blown': 'electrician',
  'breaker tripped': 'electrician',
  'distribution panel': 'electrician',
  'electrical panel': 'electrician',
  'dimmer switch': 'electrician',
  'install dimmer': 'electrician',
  'led light': 'electrician',
  'ceiling light': 'electrician',
  'downlight': 'electrician',
  'spotlight': 'electrician',
  'track lighting': 'electrician',
  'socket repair': 'electrician',
  'switch repair': 'electrician',
  'plug point': 'electrician',
  'power socket': 'electrician',

  // CARPENTRY/WOODWORK
  'carpentry': 'carpenter',
  'wooden door': 'carpenter',
  'cabinet': 'carpenter',
  'shelving': 'carpenter',
  'desk building': 'carpenter',
  'wood repair': 'carpenter',
  'wardrobe': 'carpenter',
  'custom woodwork': 'carpenter',
  'timber work': 'carpenter',
  'joinery': 'carpenter',

  // PAINTING & DECORATION
  'paint wall': 'painter',
  'painting': 'painter',
  'wall paint': 'painter',
  'interior paint': 'painter',
  'exterior paint': 'painter',
  'repainting': 'painter',
  'wall decoration': 'painter',
  'decorating': 'painter',
  'wallpaper': 'painter',
  'paint job': 'painter',

  // TILING/FLOORING
  'tile installation': 'tiler',
  'tiling': 'tiler',
  'floor tile': 'tiler',
  'wall tile': 'tiler',
  'bathroom tile': 'tiler',
  'kitchen tile': 'tiler',
  'grout': 'tiler',
  'mosaic': 'tiler',
  'marble': 'tiler',

  // MASONRY/CONCRETE
  'brick work': 'mason',
  'masonry': 'mason',
  'concrete': 'mason',
  'brickwork': 'mason',
  'stone work': 'mason',
  'wall construction': 'mason',
  'foundation': 'mason',
  'concrete floor': 'mason',
  'retaining wall': 'mason',

  // GENERAL BUILDING/RENOVATION
  'renovation': 'builder',
  'fitout': 'builder',
  'construction': 'builder',
  'building work': 'builder',
  'structural work': 'builder',
  'extension': 'builder',
  'new build': 'builder',
  'refurbishment': 'builder',
  'major works': 'builder',

  // ARCHITECTURE/DESIGN
  'architectural design': 'architect',
  'building design': 'architect',
  'space planning': 'architect',
  'floor plan': 'architect',
  'design consultation': 'architect',
  'interior design': 'architect',

  // HVAC
  'air conditioning': 'hvac',
  'ac repair': 'hvac',
  'heating': 'hvac',
  'ventilation': 'hvac',
  'climate control': 'hvac',
  'thermostat': 'hvac',

  // GLAZING/WINDOWS
  'window': 'glazier',
  'glass': 'glazier',
  'glazing': 'glazier',
  'mirror': 'glazier',
  'glass door': 'glazier',
  'window repair': 'glazier',
  'double glazing': 'glazier',

  // FLOORING
  'flooring': 'flooring',
  'laminate': 'flooring',
  'wooden floor': 'flooring',
  'vinyl floor': 'flooring',
  'carpet': 'flooring',
  'floor installation': 'flooring',
  'floor repair': 'flooring',
};

/**
 * Match a service description to a profession
 * 
 * @param query - The user's service description (e.g., "I need to fix a leaky pipe")
 * @returns The matched profession type, or null if no match found
 * 
 * Example:
 * matchServiceToProfession("I need to fix a leaky pipe") => "plumber"
 * matchServiceToProfession("need electrical work") => "electrician"
 */
export function matchServiceToProfession(query: string): string | null {
  const normalized = query.toLowerCase().trim();

  // Check if any service keyword appears in the query
  for (const [service, profession] of Object.entries(SERVICE_TO_PROFESSION)) {
    if (normalized.includes(service)) {
      return profession;
    }
  }

  return null;
}

/**
 * Get all services for a profession
 * Useful for UI/documentation
 * 
 * Example:
 * getServicesForProfession("plumber")
 * => ["leaky pipe", "leaking pipe", "burst pipe", ...]
 */
export function getServicesForProfession(profession: string): string[] {
  return Object.entries(SERVICE_TO_PROFESSION)
    .filter(([, prof]) => prof === profession)
    .map(([service]) => service);
}

/**
 * Get all unique professions
 * Useful for dropdowns/filtering
 */
export function getAllProfessions(): string[] {
  return Array.from(new Set(Object.values(SERVICE_TO_PROFESSION)));
}
