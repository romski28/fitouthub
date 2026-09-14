"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { API_BASE_URL } from "@/config/api";
import { useAuth } from "@/context/auth-context";

type PersonDetail = {
  personaId: string;
  identityId: string;
  type: string;
  email: string | null;
  emailVerified: boolean;
  createdAt: string;
  user: {
    id: string;
    email: string;
    firstName: string;
    surname: string;
    nickname: string;
    chineseName: string | null;
    role: string;
    mobile: string | null;
    locationPrimary: string | null;
    locationSecondary: string | null;
    locationTertiary: string | null;
    createdAt: string;
    updatedAt: string;
  } | null;
  professional: {
    id: string;
    fullName: string | null;
    businessName: string | null;
    professionType: string;
    status: string;
    phone: string;
    rating: number;
    primaryTrade: string | null;
    tradesOffered: string[];
    createdAt: string;
  } | null;
  properties: Array<{
    propertyId: string;
    role: string | null;
    isPrimary: boolean;
    displayAddress: string | null;
    buildingName: string;
    unitNumber: string | null;
    floorLevel: string | null;
    blockTower: string | null;
    street: string | null;
  }>;
  counts: {
    projects: number;
    chats: number;
  };
};

const PERSONA_LABELS: Record<string, string> = {
  CLIENT: "Tenant",
  PROFESSIONAL: "Professional",
  LANDLORD: "Landlord",
  ESTATE_AGENT: "Estate Agent",
  PROPERTY_MANAGER: "Property Manager",
  OWNER_OCCUPIER: "Owner Occupier",
  PROJECT_DELEGATE: "Project Delegate",
};

const ROLE_OPTIONS = [
  "client",
  "admin",
  "professional",
  "mimo_boh",
  "surveyor",
  "landlord",
  "property_manager",
  "estate_agent",
  "project_delegate",
  "owner_occupier",
];

const ROLE_LABELS: Record<string, string> = {
  client: "Tenant",
  admin: "Admin",
  professional: "Professional",
  surveyor: "Surveyor",
  mimo_boh: "Mimo BoH",
  landlord: "Landlord",
  property_manager: "Property Manager",
  estate_agent: "Estate Agent",
  project_delegate: "Project Delegate",
  owner_occupier: "Owner Occupier",
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

export default function AdminPersonDetailPage() {
  const { accessToken } = useAuth();
  const params = useParams<{ personaId: string }>();
  const router = useRouter();
  const personaId = params?.personaId;

  const [detail, setDetail] = useState<PersonDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<'saving' | 'saved' | null>(null);

  // Editable user form state
  const [form, setForm] = useState({
    email: "",
    firstName: "",
    surname: "",
    chineseName: "",
    nickname: "",
    mobile: "",
    role: "",
    password: "",
  });

  const fetchDetail = useCallback(async () => {
    if (!personaId || !accessToken) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/admin/people/${personaId}`, {
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError(`HTTP ${res.status} — ${(body && body.message) || res.statusText}`);
        return;
      }
      const data = (await res.json()) as PersonDetail;
      setDetail(data);
      if (data.user) {
        setForm({
          email: data.user.email ?? "",
          firstName: data.user.firstName ?? "",
          surname: data.user.surname ?? "",
          chineseName: data.user.chineseName ?? "",
          nickname: data.user.nickname ?? "",
          mobile: data.user.mobile ?? "",
          role: data.user.role ?? "",
          password: "",
        });
      }
    } catch (err) {
      setError((err as Error).message || "Failed to load person");
    } finally {
      setLoading(false);
    }
  }, [personaId, accessToken]);

  useEffect(() => {
    fetchDetail();
  }, [fetchDetail]);

  const handleSave = async () => {
    if (!detail?.user?.id || !accessToken) return;
    setSaving(true);
    setSaveStatus('saving');
    setSaveMessage(null);
    setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/users/${detail.user.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          email: form.email,
          firstName: form.firstName,
          surname: form.surname,
          chineseName: form.chineseName.trim() || null,
          nickname: form.nickname.trim() || undefined,
          mobile: form.mobile,
          role: form.role,
        }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setSaveStatus(null);
        setError(`HTTP ${res.status} — ${(body && body.message) || res.statusText}`);
        return;
      }

      // Optional password reset
      if (form.password && form.password.length >= 6) {
        const pwRes = await fetch(`${API_BASE_URL}/users/${detail.user.id}/password`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ password: form.password }),
        });
        if (!pwRes.ok) {
          setSaveStatus(null);
          setError("Profile saved, but password update failed.");
          return;
        }
      }

      setSaveMessage("Saved.");
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus(null), 1200);
    } catch (err) {
      setSaveStatus(null);
      setError((err as Error).message || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="p-8 text-center text-sm text-slate-500">Loading…</div>;
  }

  if (!detail) {
    return (
      <div className="space-y-4">
        {error && (
          <div className="rounded-md border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        )}
        <Link href="/admin/people" className="text-sm font-semibold text-slate-700 hover:underline">
          ← Back to People
        </Link>
      </div>
    );
  }

  const name =
    detail.professional?.fullName ||
    detail.professional?.businessName ||
    [detail.user?.firstName, detail.user?.surname].filter(Boolean).join(" ") ||
    detail.user?.nickname ||
    detail.email ||
    "Unknown";

  const isClient =
    detail.user?.role === "client" || detail.user?.role === "homeowner";
  const clientFilter =
    `${detail.user?.firstName || ""} ${detail.user?.surname || ""}`.trim() ||
    detail.user?.email ||
    "";

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/people" className="text-sm font-semibold text-slate-700 hover:underline">
          ← Back to People
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold text-slate-900">{name}</h1>
          <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-700 ring-1 ring-slate-200">
            {PERSONA_LABELS[detail.type] ?? detail.type}
          </span>
          {detail.professional && (
            <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800 ring-1 ring-amber-200">
              {detail.professional.status}
            </span>
          )}
        </div>
        <p className="mt-1 text-sm text-slate-500">
          {detail.email ?? "—"} · joined {formatDate(detail.createdAt)}
        </p>
      </div>

      {error && (
        <div className="rounded-md border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      )}
      {saveMessage && (
        <div className="rounded-md border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {saveMessage}
        </div>
      )}

      {/* User-level (identity) section */}
      {detail.user ? (
        <section className="rounded-lg border border-slate-200 bg-white p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            User account
          </h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="space-y-1 text-sm">
              <span>Email</span>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900 outline-none focus:border-slate-500"
              />
            </label>
            <label className="space-y-1 text-sm">
              <span>Role</span>
              <select
                value={form.role}
                onChange={(e) => setForm((p) => ({ ...p, role: e.target.value }))}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900 outline-none focus:border-slate-500"
              >
                {ROLE_OPTIONS.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABELS[r] ?? r}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-sm">
              <span>First name</span>
              <input
                type="text"
                value={form.firstName}
                onChange={(e) => setForm((p) => ({ ...p, firstName: e.target.value }))}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900 outline-none focus:border-slate-500"
              />
            </label>
            <label className="space-y-1 text-sm">
              <span>Surname</span>
              <input
                type="text"
                value={form.surname}
                onChange={(e) => setForm((p) => ({ ...p, surname: e.target.value }))}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900 outline-none focus:border-slate-500"
              />
            </label>
            <label className="space-y-1 text-sm">
              <span>Nickname (display name)</span>
              <input
                type="text"
                value={form.nickname}
                onChange={(e) => setForm((p) => ({ ...p, nickname: e.target.value }))}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900 outline-none focus:border-slate-500"
              />
            </label>
            <label className="space-y-1 text-sm">
              <span>Chinese name</span>
              <input
                type="text"
                value={form.chineseName}
                onChange={(e) => setForm((p) => ({ ...p, chineseName: e.target.value }))}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900 outline-none focus:border-slate-500"
              />
            </label>
            <label className="space-y-1 text-sm">
              <span>Mobile</span>
              <input
                type="text"
                value={form.mobile}
                onChange={(e) => setForm((p) => ({ ...p, mobile: e.target.value }))}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900 outline-none focus:border-slate-500"
              />
            </label>
            <label className="space-y-1 text-sm sm:col-span-2">
              <span>New password (leave blank to keep)</span>
              <input
                type="password"
                value={form.password}
                onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
                placeholder="Minimum 6 characters"
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900 outline-none focus:border-slate-500"
              />
            </label>
          </div>
          <div className="mt-4 flex items-center gap-3">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-60"
            >
              {saving ? "Saving…" : "Save user"}
            </button>
          </div>
          {isClient && (
            <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
              <Link
                href={`/admin/messaging?view=conversations&clientId=${encodeURIComponent(detail.user!.id)}`}
                className="rounded-md bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-sky-700"
              >
                Client Chats ({detail.counts?.chats ?? 0})
              </Link>
              <Link
                href={`/admin/projects?client=${encodeURIComponent(clientFilter)}`}
                className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-indigo-700"
              >
                Client Projects ({detail.counts?.projects ?? 0})
              </Link>
            </div>
          )}
        </section>
      ) : (
        <section className="rounded-lg border border-slate-200 bg-white p-5 text-sm text-slate-500">
          No user account linked to this persona.
        </section>
      )}

      {/* Professional section */}
      {detail.professional && (
        <section className="rounded-lg border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              Professional profile
            </h2>
            <Link
              href={`/admin/professionals?highlight=${encodeURIComponent(detail.professional.id)}`}
              className="text-sm font-semibold text-purple-700 hover:underline"
            >
              Manage in Professionals →
            </Link>
          </div>
          <dl className="mt-4 grid gap-3 sm:grid-cols-2">
            <div>
              <dt className="text-xs text-slate-400">Business name</dt>
              <dd className="text-sm text-slate-900">{detail.professional.businessName ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-400">Profession type</dt>
              <dd className="text-sm text-slate-900">{detail.professional.professionType}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-400">Phone</dt>
              <dd className="text-sm text-slate-900">{detail.professional.phone || "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-400">Rating</dt>
              <dd className="text-sm text-slate-900">{detail.professional.rating}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-400">Primary trade</dt>
              <dd className="text-sm text-slate-900">{detail.professional.primaryTrade ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-400">Trades offered</dt>
              <dd className="text-sm text-slate-900">
                {detail.professional.tradesOffered?.length
                  ? detail.professional.tradesOffered.join(", ")
                  : "—"}
              </dd>
            </div>
          </dl>
        </section>
      )}

      {/* Non-professional persona profiles are rendered through their user record;
          other profile types (landlord/estate agent/property manager/delegate) can be
          added here later as their admin CRUD matures. */}
      {!detail.professional && detail.type !== "CLIENT" && detail.type !== "OWNER_OCCUPIER" && (
        <section className="rounded-lg border border-slate-200 bg-white p-5 text-sm text-slate-500">
          {PERSONA_LABELS[detail.type] ?? detail.type} profile fields are not yet editable here.
        </section>
      )}

      {/* Account details (read-only) */}
      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Account details
        </h2>
        <dl className="mt-4 grid gap-3 sm:grid-cols-2">
          <div>
            <dt className="text-xs text-slate-400">Email verified</dt>
            <dd className="text-sm text-slate-900">
              {detail.emailVerified ? (
                <span className="inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">Verified</span>
              ) : (
                <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800">Unverified</span>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-slate-400">Primary location</dt>
            <dd className="text-sm text-slate-900">{detail.user?.locationPrimary || "—"}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-400">Secondary location</dt>
            <dd className="text-sm text-slate-900">{detail.user?.locationSecondary || "—"}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-400">Tertiary location</dt>
            <dd className="text-sm text-slate-900">{detail.user?.locationTertiary || "—"}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-400">Created</dt>
            <dd className="text-sm text-slate-900">{formatDate(detail.createdAt)}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-400">Last updated</dt>
            <dd className="text-sm text-slate-900">{formatDate(detail.user?.updatedAt)}</dd>
          </div>
        </dl>
      </section>

      {/* Property addresses */}
      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Property addresses
        </h2>
        {detail.properties?.length ? (
          <ul className="mt-4 space-y-2">
            {detail.properties.map((prop) => (
              <li
                key={prop.propertyId}
                className="flex flex-wrap items-center gap-2 rounded-md border border-slate-100 bg-slate-50 px-3 py-2"
              >
                <span className="text-sm text-slate-900">
                  {prop.displayAddress || prop.buildingName || "Unnamed property"}
                </span>
                {prop.role && (
                  <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs text-slate-700">
                    {prop.role}
                  </span>
                )}
                {prop.isPrimary && (
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">
                    Primary
                  </span>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 text-sm text-slate-500">No property addresses on file.</p>
        )}
      </section>

      {saveStatus && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm">
          <div className="w-full max-w-xs rounded-xl border border-slate-200 bg-white px-8 py-6 text-center shadow-xl">
            {saveStatus === 'saving' ? (
              <>
                <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-indigo-600" />
                <p className="mt-3 text-sm font-semibold text-slate-900">Saving…</p>
              </>
            ) : (
              <>
                <div className="mx-auto flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                  ✓
                </div>
                <p className="mt-3 text-sm font-semibold text-slate-900">Saved</p>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
