/**
 * Intent Matcher - Parse user queries to determine action and pre-fill data
 */

import { matchServiceToProfession } from './service-matcher';

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
  // First, try to match by service/problem description
  let profession: string | undefined;
  let location: string | undefined;
  let confidence = 0;

  const matchedProfession = matchServiceToProfession(normalized);
  if (matchedProfession) {
    profession = matchedProfession;
    confidence = 0.95; // High confidence when service matches
  } else {
    // Fall back to profession keyword matching
    for (const prof of PROFESSIONS) {
      if (normalized.includes(prof)) {
        profession = prof;
        confidence = 0.9;
        break;
      }
    }
  }

  // If we found a profession or service, treat it as a find-professional intent
  if (profession || confidence > 0) {
    if (!profession) confidence = 0.8; // Default confidence if no profession found

    // Match location
    for (const loc of LOCATIONS) {
      if (normalized.includes(loc)) {
        location = loc;
        break;
      }
    }

    // Increase confidence if we found both profession and location
    if (profession && location) confidence = 0.95;
    else if (profession && matchedProfession) confidence = 0.95;
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

  // Check for action words (find, need, help, etc.) without specific profession
  const findMatch = /\b(find|looking for|need|search|hire|looking|want|get a?n?|help with|fix|repair|install|build)\b/.test(normalized);

  if (findMatch) {
    // Match location
    for (const loc of LOCATIONS) {
      if (normalized.includes(loc)) {
        location = loc;
        break;
      }
    }

    const displayText = location
      ? `Find professionals in ${location}`
      : 'Find professionals';

    return {
      action: 'find-professional',
      route: '/professionals',
      confidence: 0.7,
      metadata: {
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
