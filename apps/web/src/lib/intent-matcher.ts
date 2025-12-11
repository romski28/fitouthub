/**
 * Intent Matcher - Parse user queries to determine action and pre-fill data
 */

export type IntentAction = 'find-professional' | 'join' | 'manage-projects' | 'unknown';

export interface IntentResult {
  action: IntentAction;
  route: string;
  confidence: number; // 0-1, how confident we are in the match
  metadata: {
    professionType?: string;
    location?: string;
    description?: string;
    displayText: string; // What to show in modal
  };
}

// List of professions to match against
const PROFESSIONS = [
  'builder',
  'electrician',
  'plumber',
  'carpenter',
  'painter',
  'architect',
  'contractor',
  'engineer',
  'designer',
  'renovator',
  'flooring',
  'tiler',
  'mason',
  'welding',
  'hvac',
  'landscaper',
];

// Common location keywords
const LOCATIONS = [
  'hong kong island',
  'kowloon',
  'new territories',
  'causeway bay',
  'central',
  'mong kok',
  'tsim sha tsui',
  'shenzhen',
  'macau',
];

export function matchIntent(query: string): IntentResult {
  const normalized = query.toLowerCase().trim();

  // Early exit for empty
  if (!normalized.length) {
    return {
      action: 'unknown',
      route: '/',
      confidence: 0,
      metadata: { displayText: 'Please enter a query' },
    };
  }

  // Check for JOIN intent
  if (/\b(join|register|post my services?|become a professional|list my business)\b/.test(normalized)) {
    return {
      action: 'join',
      route: '/join',
      confidence: 0.95,
      metadata: {
        displayText: 'Join us as a professional or business',
      },
    };
  }

  // Check for PROJECT MANAGEMENT intent
  if (/\b(manage|track|manage project|my project|view project)\b/.test(normalized)) {
    return {
      action: 'manage-projects',
      route: '/projects',
      confidence: 0.9,
      metadata: {
        displayText: 'Manage your renovation projects',
      },
    };
  }

  // Check for FIND PROFESSIONAL intent (main intent)
  const findMatch = /\b(find|looking for|need|search|hire|looking|want|get a?n?)\b/.test(normalized);

  if (findMatch) {
    // Extract profession
    let profession: string | undefined;
    let location: string | undefined;
    let confidence = 0.8;

    // Match profession
    for (const prof of PROFESSIONS) {
      if (normalized.includes(prof)) {
        profession = prof;
        break;
      }
    }

    // Match location
    for (const loc of LOCATIONS) {
      if (normalized.includes(loc)) {
        location = loc;
        break;
      }
    }

    // Increase confidence if we found both profession and location
    if (profession && location) confidence = 0.95;
    else if (profession) confidence = 0.9;

    const displayText = profession
      ? location
        ? `Find ${profession}s in ${location}`
        : `Find ${profession}s`
      : 'Find professionals';

    return {
      action: 'find-professional',
      route: '/professionals',
      confidence,
      metadata: {
        professionType: profession,
        location,
        displayText,
      },
    };
  }

  // Default fallback: assume they want to browse professionals
  if (normalized.length > 0) {
    return {
      action: 'find-professional',
      route: '/professionals',
      confidence: 0.5,
      metadata: {
        displayText: `Search: "${query}"`,
      },
    };
  }

  return {
    action: 'unknown',
    route: '/',
    confidence: 0,
    metadata: { displayText: 'Not sure what you mean' },
  };
}

/**
 * Get readable action description for modal display
 */
export function getActionDescription(action: IntentAction): string {
  const descriptions: Record<IntentAction, string> = {
    'find-professional': 'Browse and find professionals',
    'join': 'Register your business',
    'manage-projects': 'Manage your projects',
    'unknown': 'Explore Fitout Hub',
  };
  return descriptions[action] || 'Explore';
}
