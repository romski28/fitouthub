"use client";

import { API_BASE_URL } from "@/config/api";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";

type PublicQuestionOption = {
  value: string;
  label: string;
  sortOrder: number;
};

type PublicQuestion = {
  id: string;
  code: string;
  title: string;
  description?: string | null;
  type:
    | "short_text"
    | "long_text"
    | "single_select"
    | "multi_select"
    | "matrix_rating"
    | "yes_no"
    | "number"
    | "email"
    | "phone"
    | "date";
  placeholder?: string | null;
  helpText?: string | null;
  isRequired: boolean;
  sortOrder: number;
  settings?: Record<string, unknown> | null;
  options: PublicQuestionOption[];
};

type PublicPayload = {
  invite: {
    recipientName?: string | null;
    roleLabel?: string | null;
    companyName?: string | null;
    status: string;
    submittedAt?: string | null;
    expiresAt?: string | null;
  };
  questionnaire: {
    id: string;
    locale?: string;
    fallbackLocale?: string;
    availableLocales?: string[];
    title: string;
    description?: string | null;
    welcomeTitle?: string | null;
    welcomeMessage?: string | null;
    thankYouTitle?: string | null;
    thankYouMessage?: string | null;
    joinCtaLabel?: string | null;
    joinCtaUrl?: string | null;
    questions: PublicQuestion[];
  };
  submission: {
    id: string;
    status: string;
    completedAt?: string | null;
    respondentName?: string | null;
    answers: Record<string, unknown>;
  } | null;
};

function getUiText(locale: string) {
  if (locale.toLowerCase() === "zh-hk") {
    return {
      loading: "正在載入問卷…",
      unavailableTitle: "問卷暫時無法使用",
      unavailableFallback: "未能載入問卷",
      invitation: "問卷邀請",
      recipient: "收件人",
      role: "角色",
      company: "公司",
      expiresOn: "此邀請連結將於以下時間失效",
      start: "開始填寫",
      starting: "正在開始…",
      questionOf: "第 {current} 題，共 {total} 題",
      yourAnswer: "你的答案",
      yes: "是",
      no: "否",
      requiredError: "請先回答此問題再繼續。",
      back: "返回",
      next: "下一題",
      saving: "儲存中…",
      submit: "提交",
      submitting: "提交中…",
      responseReceived: "已收到你的回覆",
      thankYou: "多謝你",
      submittedSuccess: "你的答案已成功提交。",
      joinFallback: "加入 FitOut Hub",
      language: "語言",
      inviteFallback: "請回答以下問題。",
    };
  }

  return {
    loading: "Loading questionnaire…",
    unavailableTitle: "Questionnaire unavailable",
    unavailableFallback: "Failed to load questionnaire",
    invitation: "Questionnaire invitation",
    recipient: "Recipient",
    role: "Role",
    company: "Company",
    expiresOn: "This invitation expires on",
    start: "Start questionnaire",
    starting: "Starting…",
    questionOf: "Question {current} of {total}",
    yourAnswer: "Your answer",
    yes: "Yes",
    no: "No",
    requiredError: "Please answer this question before continuing.",
    back: "Back",
    next: "Next",
    saving: "Saving…",
    submit: "Submit",
    submitting: "Submitting…",
    responseReceived: "Response received",
    thankYou: "Thank you",
    submittedSuccess: "Your answers have been submitted successfully.",
    joinFallback: "Join FitOut Hub",
    language: "Language",
    inviteFallback: "Please answer the following questions.",
  };
}

function normaliseQuestionAnswer(type: PublicQuestion["type"], value: unknown) {
  if (type === "multi_select") {
    if (Array.isArray(value)) {
      return value.map((item) => String(item));
    }
    return [];
  }
  if (type === "yes_no") {
    if (typeof value === "boolean") return value;
    if (typeof value === "string") {
      const normalized = value.toLowerCase();
      if (normalized === "yes" || normalized === "true") return true;
      if (normalized === "no" || normalized === "false") return false;
    }
    return null;
  }
  if (value === null || value === undefined) return "";
  return String(value);
}

function isMissingAnswer(question: PublicQuestion, value: unknown) {
  if (!question.isRequired) return false;

  if (question.type === "matrix_rating") {
    if (!value || typeof value !== "object" || Array.isArray(value)) return true;
    const rows = Array.isArray((question.settings as any)?.rows)
      ? ((question.settings as any).rows as Array<{ key?: string }>)
      : [];
    const keys = rows.map((row) => String(row.key || "").trim()).filter(Boolean);
    if (keys.length === 0) return true;
    const current = value as Record<string, unknown>;
    return keys.some((key) => {
      const item = current[key];
      const parsed = Number(item);
      return !Number.isFinite(parsed) || parsed < 1 || parsed > 5;
    });
  }

  if (value === null || value === undefined) return true;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "boolean") return false;

  return String(value).trim().length === 0;
}

export default function PublicQuestionnairePage() {
  const params = useParams<{ token: string }>();
  const [token, setToken] = useState<string>("");
  const [locale, setLocale] = useState<string>("en");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [payload, setPayload] = useState<PublicPayload | null>(null);
  const [step, setStep] = useState<"welcome" | "question" | "thanks">("welcome");
  const [questionIndex, setQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [starting, setStarting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [completing, setCompleting] = useState(false);
  const uiText = useMemo(() => getUiText(locale), [locale]);

  useEffect(() => {
    if (params?.token) {
      setToken(params.token);
    }
  }, [params]);

  useEffect(() => {
    if (!token) return;

    const load = async () => {
      try {
        setLoading(true);
        setError(null);

        const res = await fetch(
          `${API_BASE_URL}/questionnaires/public/${token}?locale=${encodeURIComponent(locale)}`,
          {
            cache: "no-store",
          },
        );

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body?.message || "Failed to load questionnaire");
        }

        const data = (await res.json()) as PublicPayload;
        const initialAnswers: Record<string, unknown> = {};

        for (const question of data.questionnaire.questions) {
          initialAnswers[question.id] = normaliseQuestionAnswer(
            question.type,
            data.submission?.answers?.[question.id],
          );
        }

        setPayload(data);
        setAnswers((prev) => {
          const merged = { ...initialAnswers };
          for (const [questionId, value] of Object.entries(prev)) {
            if (questionId in merged && (merged[questionId] === "" || merged[questionId] === null)) {
              merged[questionId] = value;
            }
          }
          return merged;
        });

        if (data.invite.status === "submitted" || data.submission?.status === "completed") {
          setStep("thanks");
        } else {
          setStep("welcome");
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load questionnaire");
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [token, locale]);

  const questions = payload?.questionnaire.questions || [];
  const currentQuestion = questions[Math.min(questionIndex, Math.max(questions.length - 1, 0))] || null;

  const progress = useMemo(() => {
    if (!questions.length) return 0;
    return Math.round(((questionIndex + 1) / questions.length) * 100);
  }, [questionIndex, questions.length]);

  const getMatrixRowLabel = (
    row: Record<string, unknown>,
    activeLocale: string,
  ) => {
    const normalized = activeLocale.toLowerCase();
    if (normalized === "zh-hk" && typeof row.labelZhHk === "string" && row.labelZhHk.trim()) {
      return row.labelZhHk;
    }
    if (typeof row.label === "string" && row.label.trim()) {
      return row.label;
    }
    if (typeof row.key === "string") {
      return row.key;
    }
    return "";
  };

  const startQuestionnaire = async () => {
    if (!token) return;
    try {
      setStarting(true);
      const res = await fetch(`${API_BASE_URL}/questionnaires/public/${token}/start`, {
        method: "POST",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.message || "Failed to start questionnaire");
      }
      setQuestionIndex(0);
      setStep("question");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start questionnaire");
    } finally {
      setStarting(false);
    }
  };

  const saveCurrentAnswer = async () => {
    if (!token || !currentQuestion) return false;

    const value = answers[currentQuestion.id];
    if (isMissingAnswer(currentQuestion, value)) {
      setError(uiText.requiredError);
      return false;
    }

    try {
      setSaving(true);
      setError(null);

      const res = await fetch(`${API_BASE_URL}/questionnaires/public/${token}/answer`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          questionId: currentQuestion.id,
          value,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.message || "Failed to save answer");
      }

      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save answer");
      return false;
    } finally {
      setSaving(false);
    }
  };

  const goNext = async () => {
    const ok = await saveCurrentAnswer();
    if (!ok) return;

    if (questionIndex < questions.length - 1) {
      setQuestionIndex((prev) => prev + 1);
      return;
    }

    try {
      setCompleting(true);
      const res = await fetch(`${API_BASE_URL}/questionnaires/public/${token}/complete`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.message || "Failed to submit questionnaire");
      }

      setStep("thanks");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit questionnaire");
    } finally {
      setCompleting(false);
    }
  };

  const goBack = () => {
    if (questionIndex > 0) {
      setQuestionIndex((prev) => prev - 1);
    }
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-50 flex items-center justify-center px-6">
        <p className="text-slate-700">{uiText.loading}</p>
      </main>
    );
  }

  if (error && !payload) {
    return (
      <main className="min-h-screen bg-slate-50 flex items-center justify-center px-6">
        <div className="max-w-lg rounded-xl border border-red-200 bg-red-50 p-6 text-red-800">
          <h1 className="text-lg font-semibold">{uiText.unavailableTitle}</h1>
          <p className="mt-2 text-sm">{error || uiText.unavailableFallback}</p>
        </div>
      </main>
    );
  }

  if (!payload) {
    return null;
  }

  const joinCtaUrl = payload.questionnaire.joinCtaUrl || "/professionals";
  const joinCtaLabel = payload.questionnaire.joinCtaLabel || uiText.joinFallback;
  const availableLocales = payload.questionnaire.availableLocales || ["en", "zh-hk"];
  const languageLabel = (value: string) => {
    const normalized = value.toLowerCase();
    if (normalized === "zh-hk") return "繁體中文（廣東話）";
    if (normalized === "en") return "English";
    return value;
  };

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10">
      <div className="mx-auto w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex justify-end">
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <span>{uiText.language}</span>
            <select
              value={locale}
              onChange={(event) => setLocale(event.target.value)}
              className="rounded-md border border-slate-300 bg-white px-2 py-1 text-sm"
            >
              {availableLocales.map((itemLocale) => (
                <option key={itemLocale} value={itemLocale}>
                  {languageLabel(itemLocale)}
                </option>
              ))}
            </select>
          </label>
        </div>

        {step === "welcome" && (
          <section className="space-y-4">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700">{uiText.invitation}</p>
            <h1 className="text-2xl font-bold text-slate-900">
              {payload.questionnaire.welcomeTitle || payload.questionnaire.title}
            </h1>
            <p className="text-sm text-slate-700">
              {payload.questionnaire.welcomeMessage || payload.questionnaire.description || uiText.inviteFallback}
            </p>

            {(payload.invite.recipientName || payload.invite.roleLabel || payload.invite.companyName) && (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                {payload.invite.recipientName && <p>{uiText.recipient}: {payload.invite.recipientName}</p>}
                {payload.invite.roleLabel && <p>{uiText.role}: {payload.invite.roleLabel}</p>}
                {payload.invite.companyName && <p>{uiText.company}: {payload.invite.companyName}</p>}
              </div>
            )}

            {payload.invite.expiresAt && (
              <p className="text-xs text-amber-700">
                {uiText.expiresOn} {new Date(payload.invite.expiresAt).toLocaleString()}.
              </p>
            )}

            <button
              type="button"
              onClick={startQuestionnaire}
              disabled={starting}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
            >
              {starting ? uiText.starting : uiText.start}
            </button>
          </section>
        )}

        {step === "question" && currentQuestion && (
          <section className="space-y-5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                {uiText.questionOf
                  .replace("{current}", String(questionIndex + 1))
                  .replace("{total}", String(questions.length))}
              </p>
              <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-100">
                <div className="h-full bg-emerald-500 transition-all" style={{ width: `${progress}%` }} />
              </div>
            </div>

            <div>
              <h1 className="text-xl font-semibold text-slate-900">{currentQuestion.title}</h1>
              {currentQuestion.description && (
                <p className="mt-1 text-sm text-slate-600">{currentQuestion.description}</p>
              )}
              {currentQuestion.helpText && (
                <p className="mt-1 text-xs text-slate-500">{currentQuestion.helpText}</p>
              )}
            </div>

            <div>
              {(currentQuestion.type === "short_text" ||
                currentQuestion.type === "email" ||
                currentQuestion.type === "phone" ||
                currentQuestion.type === "number" ||
                currentQuestion.type === "date") && (
                <input
                  type={
                    currentQuestion.type === "email"
                      ? "email"
                      : currentQuestion.type === "number"
                        ? "number"
                        : currentQuestion.type === "date"
                          ? "date"
                          : "text"
                  }
                  value={String(answers[currentQuestion.id] ?? "")}
                  onChange={(event) =>
                    setAnswers((prev) => ({ ...prev, [currentQuestion.id]: event.target.value }))
                  }
                  placeholder={currentQuestion.placeholder || uiText.yourAnswer}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              )}

              {currentQuestion.type === "long_text" && (
                <textarea
                  rows={5}
                  value={String(answers[currentQuestion.id] ?? "")}
                  onChange={(event) =>
                    setAnswers((prev) => ({ ...prev, [currentQuestion.id]: event.target.value }))
                  }
                  placeholder={currentQuestion.placeholder || uiText.yourAnswer}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              )}

              {currentQuestion.type === "yes_no" && (
                <div className="grid gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() =>
                      setAnswers((prev) => ({ ...prev, [currentQuestion.id]: true }))
                    }
                    className={`rounded-lg border px-4 py-3 text-left text-sm ${
                      answers[currentQuestion.id] === true
                        ? "border-emerald-400 bg-emerald-50 text-emerald-800"
                        : "border-slate-300 bg-white text-slate-700"
                    }`}
                  >
                    {uiText.yes}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setAnswers((prev) => ({ ...prev, [currentQuestion.id]: false }))
                    }
                    className={`rounded-lg border px-4 py-3 text-left text-sm ${
                      answers[currentQuestion.id] === false
                        ? "border-rose-400 bg-rose-50 text-rose-800"
                        : "border-slate-300 bg-white text-slate-700"
                    }`}
                  >
                    {uiText.no}
                  </button>
                </div>
              )}

              {currentQuestion.type === "single_select" && (
                <div className="space-y-2">
                  {currentQuestion.options.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() =>
                        setAnswers((prev) => ({ ...prev, [currentQuestion.id]: option.value }))
                      }
                      className={`w-full rounded-lg border px-3 py-2 text-left text-sm ${
                        answers[currentQuestion.id] === option.value
                          ? "border-blue-400 bg-blue-50 text-blue-800"
                          : "border-slate-300 bg-white text-slate-700"
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              )}

              {currentQuestion.type === "multi_select" && (
                <div className="space-y-2">
                  {currentQuestion.options.map((option) => {
                    const selected = Array.isArray(answers[currentQuestion.id])
                      ? (answers[currentQuestion.id] as string[])
                      : [];
                    const active = selected.includes(option.value);

                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => {
                          setAnswers((prev) => {
                            const current = Array.isArray(prev[currentQuestion.id])
                              ? (prev[currentQuestion.id] as string[])
                              : [];

                            const next = current.includes(option.value)
                              ? current.filter((value) => value !== option.value)
                              : [...current, option.value];

                            return { ...prev, [currentQuestion.id]: next };
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

              {currentQuestion.type === "matrix_rating" && (
                <div className="space-y-2">
                  {Array.isArray((currentQuestion.settings as any)?.rows) &&
                    ((currentQuestion.settings as any).rows as Array<Record<string, unknown>>).map((row) => {
                      const rowKey = String(row.key || "").trim();
                      if (!rowKey) return null;

                      const selectedValue =
                        typeof answers[currentQuestion.id] === "object" &&
                        answers[currentQuestion.id] !== null &&
                        !Array.isArray(answers[currentQuestion.id])
                          ? (answers[currentQuestion.id] as Record<string, unknown>)[rowKey]
                          : null;

                      return (
                        <div key={rowKey} className="rounded-lg border border-slate-200 p-3">
                          <p className="mb-2 text-sm font-medium text-slate-900">
                            {getMatrixRowLabel(row, locale)}
                          </p>
                          <div className="grid grid-cols-5 gap-2">
                            {[1, 2, 3, 4, 5].map((score) => (
                              <button
                                key={score}
                                type="button"
                                onClick={() => {
                                  setAnswers((prev) => {
                                    const current =
                                      typeof prev[currentQuestion.id] === "object" &&
                                      prev[currentQuestion.id] !== null &&
                                      !Array.isArray(prev[currentQuestion.id])
                                        ? (prev[currentQuestion.id] as Record<string, unknown>)
                                        : {};
                                    return {
                                      ...prev,
                                      [currentQuestion.id]: {
                                        ...current,
                                        [rowKey]: score,
                                      },
                                    };
                                  });
                                }}
                                className={`rounded-md border px-2 py-2 text-sm ${
                                  Number(selectedValue) === score
                                    ? "border-blue-400 bg-blue-50 text-blue-800"
                                    : "border-slate-300 bg-white text-slate-700"
                                }`}
                              >
                                {score}
                              </button>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                </div>
              )}
            </div>

            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </div>
            )}

            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={goBack}
                disabled={questionIndex === 0 || saving || completing}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                {uiText.back}
              </button>

              <button
                type="button"
                onClick={goNext}
                disabled={saving || completing}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
              >
                {questionIndex < questions.length - 1
                  ? saving
                    ? uiText.saving
                    : uiText.next
                  : completing
                    ? uiText.submitting
                    : uiText.submit}
              </button>
            </div>
          </section>
        )}

        {step === "thanks" && (
          <section className="space-y-4">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700">{uiText.responseReceived}</p>
            <h1 className="text-2xl font-bold text-slate-900">
              {payload.questionnaire.thankYouTitle || uiText.thankYou}
            </h1>
            <p className="text-sm text-slate-700">
              {payload.questionnaire.thankYouMessage || uiText.submittedSuccess}
            </p>
            <div className="pt-2">
              <Link
                href={joinCtaUrl}
                className="inline-flex rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
              >
                {joinCtaLabel}
              </Link>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
