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

  // Editable user form state
  const [form, setForm] = useState({
    email: "",
    firstName: "",
    surname: "",
    mobile: "",
    role: "",
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
          mobile: data.user.mobile ?? "",
          role: data.user.role ?? "",
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
          mobile: form.mobile,
          role: form.role,
        }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setError(`HTTP ${res.status} — ${(body && body.message) || res.statusText}`);
        return;
      }
      setSaveMessage("Saved.");
    } catch (err) {
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
                    {r}
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
              <span>Mobile</span>
              <input
                type="text"
                value={form.mobile}
                onChange={(e) => setForm((p) => ({ ...p, mobile: e.target.value }))}
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
    </div>
  );
}
