"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { API_BASE_URL } from "@/config/api";
import { useAuth } from "@/context/auth-context";
import { useRouter } from "next/navigation";

type QuestionnaireListItem = {
  id: string;
  slug: string;
  title: string;
  audienceKey: string;
  description?: string | null;
  status: "draft" | "active" | "archived";
  createdAt: string;
  updatedAt: string;
  _count?: {
    questions: number;
    invites: number;
    submissions: number;
  };
};

type QuestionnaireInvite = {
  id: string;
  token: string;
  email: string;
  recipientName?: string | null;
  roleLabel?: string | null;
  companyName?: string | null;
  status: string;
  expiresAt?: string | null;
  submittedAt?: string | null;
  createdAt: string;
};

type QuestionnaireQuestion = {
  id: string;
  code: string;
  title: string;
  type: string;
  isRequired: boolean;
  sortOrder: number;
  options: Array<{ value: string; label: string; sortOrder: number }>;
};

type QuestionnaireResponse = {
  id: string;
  status: string;
  respondentEmail?: string | null;
  respondentName?: string | null;
  startedAt: string;
  completedAt?: string | null;
  invite?: {
    email: string;
  } | null;
  answers: Array<{
    question: {
      title: string;
      code: string;
    };
    value: unknown;
  }>;
};

type QuestionnaireDetail = {
  id: string;
  slug: string;
  title: string;
  audienceKey: string;
  description?: string | null;
  status: "draft" | "active" | "archived";
  welcomeTitle?: string | null;
  welcomeMessage?: string | null;
  thankYouTitle?: string | null;
  thankYouMessage?: string | null;
  joinCtaLabel?: string | null;
  joinCtaUrl?: string | null;
  questions: QuestionnaireQuestion[];
  invites: QuestionnaireInvite[];
  submissions: QuestionnaireResponse[];
};

export default function AdminQuestionnairesPage() {
  const router = useRouter();
  const { user, accessToken } = useAuth();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<QuestionnaireListItem[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [detail, setDetail] = useState<QuestionnaireDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [creatingStarter, setCreatingStarter] = useState(false);
  const [sendingInvite, setSendingInvite] = useState(false);
  const [lastInviteUrl, setLastInviteUrl] = useState<string>("");
  const [inviteForm, setInviteForm] = useState({
    email: "",
    recipientName: "",
    roleLabel: "",
    companyName: "",
    expiresInDays: "14",
    customMessage: "",
  });

  useEffect(() => {
    if (user && user.role !== "admin") {
      router.push("/");
    }
  }, [user, router]);

  const loadQuestionnaires = useCallback(async () => {
    if (!accessToken) return;
    try {
      setLoading(true);
      setError(null);

      const res = await fetch(`${API_BASE_URL}/questionnaires`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!res.ok) {
        throw new Error("Failed to load questionnaires");
      }

      const data = (await res.json()) as QuestionnaireListItem[];
      setItems(Array.isArray(data) ? data : []);

      if (!selectedId && data.length > 0) {
        setSelectedId(data[0].id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load questionnaires");
    } finally {
      setLoading(false);
    }
  }, [accessToken, selectedId]);

  const loadDetail = useCallback(async () => {
    if (!accessToken || !selectedId) {
      setDetail(null);
      return;
    }

    try {
      setDetailLoading(true);
      const res = await fetch(`${API_BASE_URL}/questionnaires/${selectedId}`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!res.ok) {
        throw new Error("Failed to load questionnaire details");
      }

      const data = (await res.json()) as QuestionnaireDetail;
      setDetail(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load questionnaire details");
    } finally {
      setDetailLoading(false);
    }
  }, [accessToken, selectedId]);

  useEffect(() => {
    if (user?.role === "admin" && accessToken) {
      loadQuestionnaires();
    }
  }, [user, accessToken, loadQuestionnaires]);

  useEffect(() => {
    loadDetail();
  }, [loadDetail]);

  const handleCreateStarter = async () => {
    if (!accessToken) return;
    try {
      setCreatingStarter(true);
      setError(null);

      const res = await fetch(`${API_BASE_URL}/questionnaires/starter`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload?.message || "Failed to create starter questionnaire");
      }

      const created = (await res.json()) as QuestionnaireDetail;
      await loadQuestionnaires();
      setSelectedId(created.id);
      setDetail(created);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create starter questionnaire");
    } finally {
      setCreatingStarter(false);
    }
  };

  const handleSendInvite = async () => {
    if (!accessToken || !detail) return;

    if (!inviteForm.email.trim()) {
      alert("Invite email is required");
      return;
    }

    try {
      setSendingInvite(true);
      setError(null);
      setLastInviteUrl("");

      const res = await fetch(`${API_BASE_URL}/questionnaires/${detail.id}/invites`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: inviteForm.email.trim(),
          recipientName: inviteForm.recipientName.trim() || undefined,
          roleLabel: inviteForm.roleLabel.trim() || undefined,
          companyName: inviteForm.companyName.trim() || undefined,
          expiresInDays:
            inviteForm.expiresInDays.trim().length > 0
              ? Number(inviteForm.expiresInDays)
              : undefined,
          customMessage: inviteForm.customMessage.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload?.message || "Failed to send invite");
      }

      const payload = (await res.json()) as { inviteUrl?: string };
      if (payload.inviteUrl) {
        setLastInviteUrl(payload.inviteUrl);
      }

      setInviteForm((prev) => ({
        ...prev,
        email: "",
        recipientName: "",
        roleLabel: "",
        companyName: "",
        customMessage: "",
      }));

      await loadDetail();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send invite");
    } finally {
      setSendingInvite(false);
    }
  };

  const responsePreview = useMemo(() => {
    return (detail?.submissions || []).slice(0, 8);
  }, [detail]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-lg text-slate-700">Loading questionnaires…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 py-8">
      <div className="mx-auto max-w-7xl px-6 space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Questionnaires</h1>
            <p className="mt-2 text-slate-600">
              Manage stakeholder questionnaires, send invite links, and review responses.
            </p>
          </div>
          <button
            type="button"
            onClick={handleCreateStarter}
            disabled={creatingStarter}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {creatingStarter ? "Preparing…" : "Create starter (contractors/tradesmen)"}
          </button>
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-base font-semibold text-slate-900 mb-3">Forms</h2>
            <div className="space-y-2 max-h-[70vh] overflow-y-auto pr-1">
              {items.length === 0 ? (
                <p className="text-sm text-slate-600">No questionnaires yet.</p>
              ) : (
                items.map((item) => {
                  const active = item.id === selectedId;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setSelectedId(item.id)}
                      className={`w-full rounded-lg border p-3 text-left transition ${
                        active
                          ? "border-blue-300 bg-blue-50"
                          : "border-slate-200 bg-white hover:bg-slate-50"
                      }`}
                    >
                      <p className="text-sm font-semibold text-slate-900">{item.title}</p>
                      <p className="mt-1 text-xs text-slate-600">Audience: {item.audienceKey}</p>
                      <p className="mt-1 text-xs text-slate-600">
                        {item._count?.questions ?? 0} questions · {item._count?.invites ?? 0} invites · {item._count?.submissions ?? 0} responses
                      </p>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          <div className="space-y-6">
            {detailLoading ? (
              <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm text-sm text-slate-600">
                Loading selected questionnaire…
              </div>
            ) : !detail ? (
              <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm text-sm text-slate-600">
                Select a questionnaire to view details.
              </div>
            ) : (
              <>
                <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="text-xl font-semibold text-slate-900">{detail.title}</h2>
                    <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700 uppercase">
                      {detail.status}
                    </span>
                  </div>
                  <p className="text-sm text-slate-700">{detail.description || "No description set."}</p>
                  <p className="text-xs text-slate-500">Slug: {detail.slug}</p>
                  <p className="text-xs text-slate-500">Audience: {detail.audienceKey}</p>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
                  <h3 className="text-lg font-semibold text-slate-900">Send invitation</h3>
                  <div className="grid gap-3 md:grid-cols-2">
                    <input
                      value={inviteForm.email}
                      onChange={(event) => setInviteForm((prev) => ({ ...prev, email: event.target.value }))}
                      placeholder="Invitee email"
                      className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    />
                    <input
                      value={inviteForm.recipientName}
                      onChange={(event) =>
                        setInviteForm((prev) => ({ ...prev, recipientName: event.target.value }))
                      }
                      placeholder="Recipient name (optional)"
                      className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    />
                    <input
                      value={inviteForm.roleLabel}
                      onChange={(event) => setInviteForm((prev) => ({ ...prev, roleLabel: event.target.value }))}
                      placeholder="Role label (optional)"
                      className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    />
                    <input
                      value={inviteForm.companyName}
                      onChange={(event) =>
                        setInviteForm((prev) => ({ ...prev, companyName: event.target.value }))
                      }
                      placeholder="Company name (optional)"
                      className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    />
                    <input
                      value={inviteForm.expiresInDays}
                      onChange={(event) =>
                        setInviteForm((prev) => ({ ...prev, expiresInDays: event.target.value }))
                      }
                      placeholder="Expires in days"
                      className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    />
                  </div>
                  <textarea
                    rows={3}
                    value={inviteForm.customMessage}
                    onChange={(event) => setInviteForm((prev) => ({ ...prev, customMessage: event.target.value }))}
                    placeholder="Optional personal message"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={handleSendInvite}
                      disabled={sendingInvite}
                      className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                    >
                      {sendingInvite ? "Sending…" : "Send invitation"}
                    </button>
                    {lastInviteUrl && (
                      <a
                        href={lastInviteUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-sm font-semibold text-blue-700 hover:text-blue-800"
                      >
                        Open latest invite link
                      </a>
                    )}
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                  <h3 className="text-lg font-semibold text-slate-900 mb-3">Questions</h3>
                  <div className="space-y-2">
                    {detail.questions.length === 0 ? (
                      <p className="text-sm text-slate-600">No questions yet.</p>
                    ) : (
                      detail.questions.map((question) => (
                        <div key={question.id} className="rounded-lg border border-slate-200 p-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-semibold text-slate-900">{question.sortOrder}. {question.title}</p>
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700">{question.type}</span>
                            {question.isRequired && (
                              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700">Required</span>
                            )}
                          </div>
                          {question.options.length > 0 && (
                            <p className="mt-1 text-xs text-slate-600">
                              Options: {question.options.map((option) => option.label).join(", ")}
                            </p>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                  <h3 className="text-lg font-semibold text-slate-900 mb-3">Recent responses</h3>
                  <div className="space-y-3">
                    {responsePreview.length === 0 ? (
                      <p className="text-sm text-slate-600">No responses submitted yet.</p>
                    ) : (
                      responsePreview.map((response) => (
                        <div key={response.id} className="rounded-lg border border-slate-200 p-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="text-sm font-semibold text-slate-900">
                              {response.respondentName || response.respondentEmail || response.invite?.email || "Unknown respondent"}
                            </p>
                            <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700 uppercase">
                              {response.status}
                            </span>
                          </div>
                          <p className="mt-1 text-xs text-slate-500">
                            Started: {new Date(response.startedAt).toLocaleString()}
                            {response.completedAt ? ` · Completed: ${new Date(response.completedAt).toLocaleString()}` : ""}
                          </p>
                          <p className="mt-2 text-xs text-slate-600">
                            {response.answers.length} answers captured
                          </p>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
