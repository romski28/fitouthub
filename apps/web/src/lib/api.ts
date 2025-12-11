import { Project, Professional, Tradesman } from "./types";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:3001";

async function safeFetch<T>(path: string): Promise<T | null> {
  const url = `${API_BASE}${path}`;
  try {
    const res = await fetch(url, {
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
      },
    });
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

export async function getProjects(): Promise<Project[]> {
  const data = await safeFetch<Project[]>("/projects");
  return data ?? [];
}

// Placeholders until API endpoints exist for tradesmen and professionals.
export async function getTradesmen(): Promise<Tradesman[]> {
  const data = await import("../data/tradesmen");
  return data.tradesmen;
}

export async function getProfessionals(): Promise<Professional[]> {
  const data = await import("../data/professionals");
  return data.professionals;
}
