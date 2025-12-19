import { Project, Professional, Tradesman } from "./types";
import { API_BASE_URL } from "@/config/api";

const API_BASE = API_BASE_URL;

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

export async function getProjects(params?: Record<string, string | undefined>): Promise<Project[]> {
  const search = params
    ? Object.entries(params)
        .filter(([, value]) => value)
        .reduce((acc, [key, value]) => {
          acc.append(key, value as string);
          return acc;
        }, new URLSearchParams())
    : null;
  const path = search && Array.from(search.keys()).length > 0 ? `/projects?${search.toString()}` : "/projects";
  const data = await safeFetch<Project[]>(path);
  return data ?? [];
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
