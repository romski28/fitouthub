"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { API_BASE_URL } from "@/config/api";
import { useAuth } from "@/context/auth-context";

type Person = {
  personaId: string;
  identityId: string;
  type: string;
  email: string | null;
  name: string;
  role: string | null;
  mobile: string | null;
  professionType: string | null;
  status: string | null;
  userId: string | null;
  professionalId: string | null;
  createdAt: string;
};

const PERSONA_LABELS: Record<string, string> = {
  CLIENT: "Client",
  PROFESSIONAL: "Professional",
  LANDLORD: "Landlord",
  ESTATE_AGENT: "Estate Agent",
  PROPERTY_MANAGER: "Property Manager",
  OWNER_OCCUPIER: "Owner Occupier",
  PROJECT_DELEGATE: "Project Delegate",
};

const PERSONA_TONES: Record<string, string> = {
  CLIENT: "bg-slate-100 text-slate-700 ring-slate-200",
  PROFESSIONAL: "bg-purple-100 text-purple-700 ring-purple-200",
  LANDLORD: "bg-amber-100 text-amber-800 ring-amber-200",
  ESTATE_AGENT: "bg-violet-100 text-violet-700 ring-violet-200",
  PROPERTY_MANAGER: "bg-cyan-100 text-cyan-800 ring-cyan-200",
  OWNER_OCCUPIER: "bg-emerald-100 text-emerald-800 ring-emerald-200",
  PROJECT_DELEGATE: "bg-rose-100 text-rose-700 ring-rose-200",
};

const STATUS_TONES: Record<string, string> = {
  approved: "bg-emerald-100 text-emerald-800 ring-emerald-200",
  pending: "bg-amber-100 text-amber-800 ring-amber-200",
  rejected: "bg-rose-100 text-rose-800 ring-rose-200",
  suspended: "bg-slate-200 text-slate-700 ring-slate-300",
};

function formatDate(date?: string): string {
  if (!date) return "—";
  try {
    return new Intl.DateTimeFormat("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(new Date(date));
  } catch {
    return "—";
  }
}

function personaLabel(type: string): string {
  return PERSONA_LABELS[type] ?? type;
}

function personaTone(type: string): string {
  return PERSONA_TONES[type] ?? "bg-slate-100 text-slate-700 ring-slate-200";
}

export default function AdminPeoplePage() {
  const { accessToken } = useAuth();
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");

  useEffect(() => {
    if (!accessToken) return;
    fetchPeople();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  const fetchPeople = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/admin/people`, {
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        const msg = (body && (body.message || body.error)) || res.statusText;
        setError(`HTTP ${res.status}${msg ? ` — ${msg}` : ""}`);
        setPeople([]);
        setLoading(false);
        return;
      }
      const data = await res.json();
      setPeople(Array.isArray(data) ? data : []);
    } catch (err) {
      setError((err as Error).message || "Failed to fetch people");
      setPeople([]);
    } finally {
      setLoading(false);
    }
  };

  const types = useMemo(
    () => Array.from(new Set(people.map((p) => p.type))).sort(),
    [people],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return people.filter((p) => {
      if (typeFilter && p.type !== typeFilter) return false;
      if (!q) return true;
      return [p.name, p.email, p.mobile, p.role, p.professionType].some(
        (v) => v && String(v).toLowerCase().includes(q),
      );
    });
  }, [people, search, typeFilter]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">People</h1>
          <p className="mt-1 text-sm text-slate-600">
            Every account on the platform, regardless of persona.
          </p>
        </div>
        <Link
          href="/admin/users"
          className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Open legacy Users
        </Link>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, email, phone, role…"
          className="w-full max-w-xs rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-500"
        />
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-500"
        >
          <option value="">All personas</option>
          {types.map((t) => (
            <option key={t} value={t}>
              {personaLabel(t)}
            </option>
          ))}
        </select>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-md border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      {/* Table */}
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        {loading ? (
          <div className="p-8 text-center text-sm text-slate-500">Loading…</div>
        ) : error ? (
          <div className="p-8 text-center text-sm text-slate-500">
            Could not load people.
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">
            No people found.
          </div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Contact</th>
                <th className="px-4 py-3 font-medium">Persona</th>
                <th className="px-4 py-3 font-medium">Role / Type</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Created</th>
                <th className="px-4 py-3 font-medium">Manage</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((p) => (
                <tr key={p.personaId} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-900">
                    {p.name}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    <div>{p.email ?? "—"}</div>
                    {p.mobile && (
                      <div className="text-xs text-slate-400">{p.mobile}</div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${personaTone(p.type)}`}
                    >
                      {personaLabel(p.type)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {p.professionType ? (
                      <span className="capitalize">{p.professionType}</span>
                    ) : p.role ? (
                      <span className="capitalize">{p.role}</span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {p.status ? (
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${
                          STATUS_TONES[p.status.toLowerCase()] ??
                          "bg-slate-100 text-slate-700 ring-slate-200"
                        }`}
                      >
                        {p.status}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-500">
                    {formatDate(p.createdAt)}
                  </td>
                  <td className="px-4 py-3">
                    {p.professionalId ? (
                      <Link
                        href={`/admin/professionals?highlight=${encodeURIComponent(p.professionalId)}`}
                        className="font-semibold text-purple-700 hover:underline"
                      >
                        Professional
                      </Link>
                    ) : p.userId ? (
                      <Link
                        href="/admin/users"
                        className="font-semibold text-slate-700 hover:underline"
                      >
                        User
                      </Link>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
