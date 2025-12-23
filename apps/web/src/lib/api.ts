import { Project, Professional, Tradesman } from "./types";
import { API_BASE_URL } from "@/config/api";

const API_BASE = API_BASE_URL;

async function safeFetch<T>(path: string): Promise<T | null> {
  const url = `${API_BASE}${path}`;
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout
    
    const res = await fetch(url, {
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
      },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    
    if (!res.ok) {
      console.warn(`API ${res.status} at ${url}:`, await res.text());
      return null;
    }
    return (await res.json()) as T;
  } catch (err) {
    console.error(`Fetch failed for ${url}:`, err instanceof Error ? err.message : err);
    return null;
  }
}

export async function getProjects(params?: Record<string, string | undefined>): Promise<Project[]> {
  const search = params
    ? Object.entries(params)
        .filter(([, value]) => value)
        .reduce((acc, [key, value]) => {
          acc.append(key, value as string);
          return acc;
        }, new URLSearchParams())
    : null;
  const hasFilters = search && Array.from(search.keys()).length > 0;
  const path = hasFilters ? `/projects?${search!.toString()}` : "/projects/canonical";
  const data = await safeFetch<Project[]>(path);
  return data ?? [];
}

export async function getProjectDetail(id: string): Promise<Project> {
  const data = await safeFetch<Project>(`/projects/${id}`);
  if (!data) {
    throw new Error('Project not found');
  }
  return data;
}

// Placeholders until API endpoints exist for tradesmen and professionals.
export async function getTradesmen(): Promise<Tradesman[]> {
  const data = await import("../data/tradesmen");
  return data.tradesmen;
}

export async function getProfessionals(): Promise<Professional[]> {
  const data = await safeFetch<Professional[]>("/professionals");
  return data ?? [];
}
