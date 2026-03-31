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
  locale?: string;
  respondentEmail?: string | null;
  respondentName?: string | null;
  startedAt: string;
  completedAt?: string | null;
  invite?: {
    email: string;
  } | null;
  answers: Array<{
    question: {
      id?: string;
      title: string;
      code: string;
      type?: string;
    };
    value: unknown;
    displayValue?: unknown;
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

type QuestionnairePreview = {
  id: string;
  slug: string;
  status: "draft" | "active" | "archived";
  locale: string;
  fallbackLocale: string;
  availableLocales: string[];
  title: string;
  description?: string | null;
  welcomeTitle?: string | null;
  welcomeMessage?: string | null;
  thankYouTitle?: string | null;
  thankYouMessage?: string | null;
  joinCtaLabel?: string | null;
  joinCtaUrl?: string | null;
  questions: Array<{
    id: string;
    code: string;
    title: string;
    description?: string | null;
    type: string;
    settings?: Record<string, unknown> | null;
    placeholder?: string | null;
    helpText?: string | null;
    isRequired: boolean;
    sortOrder: number;
    options: Array<{
      id: string;
      value: string;
      sortOrder: number;
      label: string;
    }>;
  }>;
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
  const [previewLocale, setPreviewLocale] = useState("en");
  const [previewLoading, setPreviewLoading] = useState(false);
  const [preview, setPreview] = useState<QuestionnairePreview | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewStep, setPreviewStep] = useState<"welcome" | "question" | "thanks">("welcome");
  const [previewQuestionIndex, setPreviewQuestionIndex] = useState(0);
  const [previewAnswers, setPreviewAnswers] = useState<Record<string, unknown>>({});
  const [responsesLocale, setResponsesLocale] = useState("en");
  const [responsesLoading, setResponsesLoading] = useState(false);
  const [responsesData, setResponsesData] = useState<QuestionnaireResponse[]>([]);
  const [activeResponseId, setActiveResponseId] = useState<string | null>(null);
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

  useEffect(() => {
    setPreview(null);
    setPreviewOpen(false);
    setPreviewStep("welcome");
    setPreviewQuestionIndex(0);
    setPreviewAnswers({});
    setResponsesData([]);
    setActiveResponseId(null);
  }, [selectedId]);

  const loadResponses = useCallback(async () => {
    if (!accessToken || !selectedId) return;

    try {
      setResponsesLoading(true);
      const res = await fetch(
        `${API_BASE_URL}/questionnaires/${selectedId}/responses?locale=${encodeURIComponent(responsesLocale)}`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        },
      );

      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload?.message || "Failed to load responses");
      }

      const data = (await res.json()) as QuestionnaireResponse[];
      setResponsesData(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load responses");
    } finally {
      setResponsesLoading(false);
    }
  }, [accessToken, selectedId, responsesLocale]);

  useEffect(() => {
    loadResponses();
  }, [loadResponses]);

  const loadPreview = useCallback(
    async (locale: string) => {
      if (!accessToken || !detail) return null;

      setPreviewLoading(true);
      setError(null);

      try {
        const res = await fetch(
          `${API_BASE_URL}/questionnaires/${detail.id}/preview?locale=${encodeURIComponent(locale)}`,
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
          },
        );

        if (!res.ok) {
          const payload = await res.json().catch(() => ({}));
          throw new Error(payload?.message || "Failed to load preview");
        }

        const data = (await res.json()) as QuestionnairePreview;
        setPreview(data);
        return data;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load preview");
        return null;
      } finally {
        setPreviewLoading(false);
      }
    },
    [accessToken, detail],
  );

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

  const handlePreview = async () => {
    const data = await loadPreview(previewLocale);
    if (!data) return;

    setPreviewAnswers({});
    setPreviewQuestionIndex(0);
    setPreviewStep(data.questions.length > 0 ? "welcome" : "thanks");
    setPreviewOpen(true);
  };

  const closePreview = () => {
    setPreviewOpen(false);
    setPreviewStep("welcome");
    setPreviewQuestionIndex(0);
    setPreviewAnswers({});
  };

  const handlePreviewLocaleChange = async (locale: string) => {
    setPreviewLocale(locale);
    if (!previewOpen) return;

    const data = await loadPreview(locale);
    if (!data) return;

    setPreviewQuestionIndex((prev) => Math.min(prev, Math.max(data.questions.length - 1, 0)));
    setPreviewStep((prev) => {
      if (prev === "question" && data.questions.length === 0) {
        return "thanks";
      }
      return prev;
    });
  };

  const currentPreviewQuestion =
    preview?.questions[
      Math.min(previewQuestionIndex, Math.max((preview?.questions.length || 1) - 1, 0))
    ] || null;

  const previewProgress = preview?.questions.length
    ? Math.round(((previewQuestionIndex + 1) / preview.questions.length) * 100)
    : 0;

  const previewLocaleOptions =
    preview?.availableLocales?.length ? preview.availableLocales : ["en", "zh-hk"];

  const formatLocaleLabel = (locale: string) => {
    const normalized = locale.toLowerCase();
    if (normalized === "zh-hk") return "Cantonese (zh-HK)";
    if (normalized === "en") return "English";
    return locale;
  };

  const handlePreviewStart = () => {
    if (!preview) return;
    if (preview.questions.length === 0) {
      setPreviewStep("thanks");
      return;
    }
    setPreviewQuestionIndex(0);
    setPreviewStep("question");
  };

  const handlePreviewNext = () => {
    if (!preview) return;
    if (previewQuestionIndex < preview.questions.length - 1) {
      setPreviewQuestionIndex((prev) => prev + 1);
      return;
    }
    setPreviewStep("thanks");
  };

  const handlePreviewBack = () => {
    if (previewStep === "thanks") {
      if ((preview?.questions.length || 0) > 0) {
        setPreviewStep("question");
        setPreviewQuestionIndex(Math.max((preview?.questions.length || 1) - 1, 0));
      }
      return;
    }

    if (previewQuestionIndex > 0) {
      setPreviewQuestionIndex((prev) => prev - 1);
      return;
    }

    setPreviewStep("welcome");
  };

  const responsePreview = useMemo(() => {
    return responsesData.slice(0, 8);
  }, [responsesData]);

  const activeResponse = useMemo(
    () => responsesData.find((item) => item.id === activeResponseId) || null,
    [responsesData, activeResponseId],
  );

  const formatResponseValue = (value: unknown) => {
    if (Array.isArray(value)) {
      return value.map((item) => String(item)).join(", ");
    }
    if (value === null || value === undefined) {
      return "—";
    }
    if (typeof value === "object") {
      return JSON.stringify(value);
    }
    if (typeof value === "boolean") {
      return value ? "Yes" : "No";
    }
    return String(value);
  };

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
                  <div className="flex flex-wrap items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2">
                    <label className="text-sm text-blue-900">Preview language</label>
                    <select
                      value={previewLocale}
                      onChange={(event) => handlePreviewLocaleChange(event.target.value)}
                      className="rounded-md border border-blue-300 bg-white px-2 py-1 text-sm"
                    >
                      {previewLocaleOptions.map((locale) => (
                        <option key={locale} value={locale}>
                          {formatLocaleLabel(locale)}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={handlePreview}
                      disabled={previewLoading}
                      className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
                    >
                      {previewLoading ? "Loading preview…" : "Preview questionnaire"}
                    </button>
                  </div>
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
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <label className="text-sm text-slate-600">Response language</label>
                    <select
                      value={responsesLocale}
                      onChange={(event) => setResponsesLocale(event.target.value)}
                      className="rounded-md border border-slate-300 bg-white px-2 py-1 text-sm"
                    >
                      {previewLocaleOptions.map((locale) => (
                        <option key={locale} value={locale}>
                          {formatLocaleLabel(locale)}
                        </option>
                      ))}
                    </select>
                    {responsesLoading && <span className="text-xs text-slate-500">Loading…</span>}
                  </div>
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
                          <div className="mt-3">
                            <button
                              type="button"
                              onClick={() => setActiveResponseId(response.id)}
                              className="rounded-lg border border-blue-300 px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-50"
                            >
                              Review response
                            </button>
                          </div>
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

      {previewOpen && preview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <div className="relative max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-6 py-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-blue-700">Admin preview</p>
                <h2 className="text-lg font-semibold text-slate-900">Saveless questionnaire walkthrough</h2>
              </div>
              <div className="flex items-center gap-3">
                <label className="text-sm text-slate-600">Language</label>
                <select
                  value={previewLocale}
                  onChange={(event) => handlePreviewLocaleChange(event.target.value)}
                  className="rounded-md border border-slate-300 bg-white px-2 py-1 text-sm"
                >
                  {previewLocaleOptions.map((locale) => (
                    <option key={locale} value={locale}>
                      {formatLocaleLabel(locale)}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={closePreview}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Close
                </button>
              </div>
            </div>

            <div className="px-6 py-6">
              {previewLoading ? (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-6 text-sm text-slate-600">
                  Loading preview…
                </div>
              ) : previewStep === "welcome" ? (
                <section className="space-y-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700">Questionnaire invitation</p>
                  <h1 className="text-2xl font-bold text-slate-900">{preview.welcomeTitle || preview.title}</h1>
                  <p className="text-sm text-slate-700">{preview.welcomeMessage || preview.description || "No welcome copy set."}</p>
                  <div className="flex items-center justify-between gap-3 pt-3">
                    <button
                      type="button"
                      onClick={closePreview}
                      className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      Return to admin panel
                    </button>
                    <button
                      type="button"
                      onClick={handlePreviewStart}
                      className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
                    >
                      Start preview
                    </button>
                  </div>
                </section>
              ) : previewStep === "question" && currentPreviewQuestion ? (
                <section className="space-y-5">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                      Question {previewQuestionIndex + 1} of {preview.questions.length}
                    </p>
                    <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-100">
                      <div className="h-full bg-emerald-500 transition-all" style={{ width: `${previewProgress}%` }} />
                    </div>
                  </div>

                  <div>
                    <h1 className="text-xl font-semibold text-slate-900">{currentPreviewQuestion.title}</h1>
                    {currentPreviewQuestion.description && (
                      <p className="mt-1 text-sm text-slate-600">{currentPreviewQuestion.description}</p>
                    )}
                    {currentPreviewQuestion.helpText && (
                      <p className="mt-1 text-xs text-slate-500">{currentPreviewQuestion.helpText}</p>
                    )}
                  </div>

                  <div>
                    {(["short_text", "email", "phone", "number", "date"] as const).includes(
                      currentPreviewQuestion.type as "short_text" | "email" | "phone" | "number" | "date",
                    ) && (
                      <input
                        type={
                          currentPreviewQuestion.type === "email"
                            ? "email"
                            : currentPreviewQuestion.type === "number"
                              ? "number"
                              : currentPreviewQuestion.type === "date"
                                ? "date"
                                : "text"
                        }
                        value={String(previewAnswers[currentPreviewQuestion.id] ?? "")}
                        onChange={(event) =>
                          setPreviewAnswers((prev) => ({
                            ...prev,
                            [currentPreviewQuestion.id]: event.target.value,
                          }))
                        }
                        placeholder={currentPreviewQuestion.placeholder || "Preview input"}
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      />
                    )}

                    {currentPreviewQuestion.type === "long_text" && (
                      <textarea
                        rows={5}
                        value={String(previewAnswers[currentPreviewQuestion.id] ?? "")}
                        onChange={(event) =>
                          setPreviewAnswers((prev) => ({
                            ...prev,
                            [currentPreviewQuestion.id]: event.target.value,
                          }))
                        }
                        placeholder={currentPreviewQuestion.placeholder || "Preview input"}
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      />
                    )}

                    {currentPreviewQuestion.type === "yes_no" && (
                      <div className="grid gap-2 sm:grid-cols-2">
                        <button
                          type="button"
                          onClick={() =>
                            setPreviewAnswers((prev) => ({ ...prev, [currentPreviewQuestion.id]: true }))
                          }
                          className={`rounded-lg border px-4 py-3 text-left text-sm ${
                            previewAnswers[currentPreviewQuestion.id] === true
                              ? "border-emerald-400 bg-emerald-50 text-emerald-800"
                              : "border-slate-300 bg-white text-slate-700"
                          }`}
                        >
                          Yes
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setPreviewAnswers((prev) => ({ ...prev, [currentPreviewQuestion.id]: false }))
                          }
                          className={`rounded-lg border px-4 py-3 text-left text-sm ${
                            previewAnswers[currentPreviewQuestion.id] === false
                              ? "border-rose-400 bg-rose-50 text-rose-800"
                              : "border-slate-300 bg-white text-slate-700"
                          }`}
                        >
                          No
                        </button>
                      </div>
                    )}

                    {currentPreviewQuestion.type === "single_select" && (
                      <div className="space-y-2">
                        {currentPreviewQuestion.options.map((option) => (
                          <button
                            key={option.value}
                            type="button"
                            onClick={() =>
                              setPreviewAnswers((prev) => ({
                                ...prev,
                                [currentPreviewQuestion.id]: option.value,
                              }))
                            }
                            className={`w-full rounded-lg border px-3 py-2 text-left text-sm ${
                              previewAnswers[currentPreviewQuestion.id] === option.value
                                ? "border-blue-400 bg-blue-50 text-blue-800"
                                : "border-slate-300 bg-white text-slate-700"
                            }`}
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                    )}

                    {currentPreviewQuestion.type === "multi_select" && (
                      <div className="space-y-2">
                        {currentPreviewQuestion.options.map((option) => {
                          const selected = Array.isArray(previewAnswers[currentPreviewQuestion.id])
                            ? (previewAnswers[currentPreviewQuestion.id] as string[])
                            : [];
                          const active = selected.includes(option.value);

                          return (
                            <button
                              key={option.value}
                              type="button"
                              onClick={() => {
                                setPreviewAnswers((prev) => {
                                  const current = Array.isArray(prev[currentPreviewQuestion.id])
                                    ? (prev[currentPreviewQuestion.id] as string[])
                                    : [];
                                  const next = current.includes(option.value)
                                    ? current.filter((value) => value !== option.value)
                                    : [...current, option.value];

                                  return { ...prev, [currentPreviewQuestion.id]: next };
                                });
                              }}
                              className={`w-full rounded-lg border px-3 py-2 text-left text-sm ${
                                active
                                  ? "border-blue-400 bg-blue-50 text-blue-800"
                                  : "border-slate-300 bg-white text-slate-700"
                              }`}
                            >
                              {option.label}
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {currentPreviewQuestion.type === "matrix_rating" && (
                      <div className="overflow-hidden rounded-lg border border-slate-200">
                        {/* Scale header */}
                        <div className="hidden border-b border-slate-200 bg-slate-50 px-3 py-2 sm:flex sm:items-center sm:justify-end sm:gap-1.5">
                          {[1, 2, 3, 4, 5].map((n) => (
                            <span key={n} className="w-10 text-center text-xs font-semibold text-slate-500">{n}</span>
                          ))}
                        </div>
                        {(() => {
                          const matrixSettings =
                            currentPreviewQuestion.settings && typeof currentPreviewQuestion.settings === "object"
                              ? (currentPreviewQuestion.settings as { rows?: Array<{ key?: string; label?: string; labelZhHk?: string }> })
                              : {};
                          const rows = Array.isArray(matrixSettings.rows) ? matrixSettings.rows : [];
                          const currentAnswers =
                            previewAnswers[currentPreviewQuestion.id] &&
                            typeof previewAnswers[currentPreviewQuestion.id] === "object" &&
                            !Array.isArray(previewAnswers[currentPreviewQuestion.id])
                              ? (previewAnswers[currentPreviewQuestion.id] as Record<string, number>)
                              : {};

                          const getRowLabel = (row: { key?: string; label?: string; labelZhHk?: string }) => {
                            const norm = previewLocale.toLowerCase();
                            if (norm === "zh-hk" && row.labelZhHk?.trim()) return row.labelZhHk;
                            return row.label || row.key || "";
                          };

                          if (rows.length === 0) {
                            return (
                              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                                Matrix rows are not configured for this question.
                              </div>
                            );
                          }

                          return rows.map((row, rowIndex) => {
                            const rowKey = row?.key || `row_${rowIndex + 1}`;
                            const selectedRating =
                              typeof currentAnswers[rowKey] === "number" ? currentAnswers[rowKey] : null;
                            const isLast = rowIndex === rows.length - 1;

                            return (
                              <div
                                key={rowKey}
                                className={`flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4 ${
                                  !isLast ? "border-b border-slate-200" : ""
                                }`}
                              >
                                <p className="text-sm font-medium text-slate-900 sm:flex-1">{getRowLabel(row)}</p>
                                <div className="flex items-center gap-1.5 sm:shrink-0">
                                  {[1, 2, 3, 4, 5].map((rating) => (
                                    <button
                                      key={`${rowKey}-${rating}`}
                                      type="button"
                                      onClick={() => {
                                        setPreviewAnswers((prev) => {
                                          const previousValue =
                                            prev[currentPreviewQuestion.id] &&
                                            typeof prev[currentPreviewQuestion.id] === "object" &&
                                            !Array.isArray(prev[currentPreviewQuestion.id])
                                              ? (prev[currentPreviewQuestion.id] as Record<string, number>)
                                              : {};
                                          return {
                                            ...prev,
                                            [currentPreviewQuestion.id]: {
                                              ...previousValue,
                                              [rowKey]: rating,
                                            },
                                          };
                                        });
                                      }}
                                      className={`h-9 w-10 rounded-md border text-sm font-semibold transition ${
                                        selectedRating === rating
                                          ? "border-blue-400 bg-blue-50 text-blue-800"
                                          : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
                                      }`}
                                    >
                                      {rating}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            );
                          });
                        })()}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between gap-3">
                    <button
                      type="button"
                      onClick={handlePreviewBack}
                      className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      Back
                    </button>

                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={closePreview}
                        className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        Return to admin panel
                      </button>
                      <button
                        type="button"
                        onClick={handlePreviewNext}
                        className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
                      >
                        {previewQuestionIndex < preview.questions.length - 1 ? "Next" : "Finish preview"}
                      </button>
                    </div>
                  </div>
                </section>
              ) : (
                <section className="space-y-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700">Preview complete</p>
                  <h1 className="text-2xl font-bold text-slate-900">{preview.thankYouTitle || "Thank you"}</h1>
                  <p className="text-sm text-slate-700">{preview.thankYouMessage || "No thank-you copy set."}</p>
                  <div className="flex items-center justify-between gap-3 pt-2">
                    <button
                      type="button"
                      onClick={handlePreviewBack}
                      className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      Back
                    </button>
                    <button
                      type="button"
                      onClick={closePreview}
                      className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
                    >
                      Return to admin panel
                    </button>
                  </div>
                </section>
              )}
            </div>
          </div>
        </div>
      )}

      {activeResponse && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <div className="relative max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-6 py-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-blue-700">Response review</p>
                <h2 className="text-lg font-semibold text-slate-900">
                  {activeResponse.respondentName || activeResponse.respondentEmail || activeResponse.invite?.email || "Unknown respondent"}
                </h2>
              </div>
              <div className="flex items-center gap-3">
                <label className="text-sm text-slate-600">Language</label>
                <select
                  value={responsesLocale}
                  onChange={(event) => setResponsesLocale(event.target.value)}
                  className="rounded-md border border-slate-300 bg-white px-2 py-1 text-sm"
                >
                  {previewLocaleOptions.map((locale) => (
                    <option key={locale} value={locale}>
                      {formatLocaleLabel(locale)}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setActiveResponseId(null)}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Close
                </button>
              </div>
            </div>

            <div className="px-6 py-6">
              <p className="mb-4 text-xs text-slate-500">
                Started: {new Date(activeResponse.startedAt).toLocaleString()}
                {activeResponse.completedAt
                  ? ` · Completed: ${new Date(activeResponse.completedAt).toLocaleString()}`
                  : ""}
              </p>

              <div className="space-y-3">
                {activeResponse.answers.length === 0 ? (
                  <p className="text-sm text-slate-600">No answers captured.</p>
                ) : (
                  activeResponse.answers.map((answer, index) => (
                    <div key={`${answer.question.code}-${index}`} className="rounded-lg border border-slate-200 p-3">
                      <p className="text-sm font-semibold text-slate-900">{answer.question.title}</p>
                      <p className="mt-1 text-xs text-slate-500">Code: {answer.question.code}</p>
                      <p className="mt-2 text-sm text-slate-700">
                        {formatResponseValue(answer.displayValue ?? answer.value)}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
