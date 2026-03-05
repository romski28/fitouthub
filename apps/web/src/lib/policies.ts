// Policy management utility for fetching and caching policy documents
// This replaces hardcoded policy content with API-fetched versions

export type PolicyType = 'TERMS_AND_CONDITIONS' | 'SECURITY_STATEMENT' | 'CONTRACT_TEMPLATE';

export interface Policy {
  id: string;
  type: PolicyType;
  version: string;
  title: string;
  content: string;
  isActive: boolean;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

// In-memory cache for policies
const policyCache = new Map<PolicyType, Policy>();
let lastFetchTime: number | null = null;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

/**
 * Get the API URL based on environment
 */
function getApiUrl(): string {
  return process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
}

/**
 * Fetch active policy from API
 */
async function fetchPolicyFromAPI(type: PolicyType): Promise<Policy> {
  const apiUrl = getApiUrl();
  const response = await fetch(`${apiUrl}/policies/active?type=${type}`);
  
  if (!response.ok) {
    throw new Error(`Failed to fetch policy: ${response.statusText}`);
  }
  
  return response.json();
}

/**
 * Get active policy with caching
 */
export async function getPolicy(type: PolicyType): Promise<Policy> {
  // Check cache first
  const now = Date.now();
  if (
    policyCache.has(type) &&
    lastFetchTime &&
    now - lastFetchTime < CACHE_DURATION
  ) {
    return policyCache.get(type)!;
  }

  // Fetch from API
  try {
    const policy = await fetchPolicyFromAPI(type);
    policyCache.set(type, policy);
    lastFetchTime = now;
    return policy;
  } catch (error) {
    console.error(`Error fetching policy ${type}:`, error);
    
    // If cache exists, return stale data as fallback
    if (policyCache.has(type)) {
      console.warn(`Using stale cache for policy ${type}`);
      return policyCache.get(type)!;
    }
    
    throw error;
  }
}

/**
 * Get policy content only (backward compatible with old usage)
 */
export async function getPolicyContent(type: PolicyType): Promise<string> {
  const policy = await getPolicy(type);
  return policy.content;
}

/**
 * Prefetch all active policies (useful for page load)
 */
export async function prefetchAllPolicies(): Promise<void> {
  try {
    const apiUrl = getApiUrl();
    const response = await fetch(`${apiUrl}/policies/active/all`);
    
    if (!response.ok) {
      throw new Error(`Failed to prefetch policies: ${response.statusText}`);
    }
    
    const policies: Policy[] = await response.json();
    
    policies.forEach(policy => {
      policyCache.set(policy.type as PolicyType, policy);
    });
    
    lastFetchTime = Date.now();
  } catch (error) {
    console.error('Error prefetching policies:', error);
  }
}

/**
 * Clear policy cache (useful for testing or force refresh)
 */
export function clearPolicyCache(): void {
  policyCache.clear();
  lastFetchTime = null;
}

/**
 * Get cached policy without fetching (returns null if not cached)
 */
export function getCachedPolicy(type: PolicyType): Policy | null {
  return policyCache.get(type) || null;
}
