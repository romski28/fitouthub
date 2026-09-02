"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import toast from "react-hot-toast";
import { API_BASE_URL } from "@/config/api";
import { useAuth } from "@/context/auth-context";
import { useRoleGuard } from "@/hooks/use-role-guard";
import ChatImageUploader from "@/components/chat-image-uploader";

type PmProject = {
  id: string;
  projectName: string;
  region?: string;
  tradesRequired?: string[];
  isEmergency?: boolean;
  onlySelectedProfessionalsCanBid?: boolean;
  tenderOpenedAt?: string;
  tenderClosedAt?: string;
  createdAt?: string;
  status?: string;
  currentStage?: string;
  pmId?: string | null;
  releasedForQuotationAt?: string | null;
  releasedByPmId?: string | null;
  notes?: string;
  clientName?: string;
  photos?: Array<{ id: string; url: string; note?: string | null }>;
  mimoProjectExtras?: Array<{ id: string; extraType: string; status: string; title?: string }>;
  user?: { firstName?: string; surname?: string; email?: string };
};

type PmMessage = {
  id: string;
  threadType: "project-professional" | "project-general";
  threadId: string;
  senderName: string;
  senderType: string;
  content: string;
  createdAt: string;
};

function formatDate(date?: string | null): string {
  if (!date) return "—";
  try {
    return new Intl.DateTimeFormat("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(date));
  } catch {
    return "—";
  }
}

export default function PmProjectDetailPage() {
  useRoleGuard(["project_manager"], { fallback: "/" });
  const params = useParams();
  const projectId = params?.id as string;
  const { accessToken } = useAuth();

  const [project, setProject] = useState<PmProject | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [releasing, setReleasing] = useState(false);
  const [messageText, setMessageText] = useState("");
  const [sendingMessage, setSendingMessage] = useState(false);
  const [arrangingCall, setArrangingCall] = useState(false);
  const [pendingPhotos, setPendingPhotos] = useState<File[]>([]);
  const [addingPhotos, setAddingPhotos] = useState(false);
  const [arrangingSurvey, setArrangingSurvey] = useState(false);
  const [refiningScope, setRefiningScope] = useState(false);
  const [requestingImages, setRequestingImages] = useState(false);
  const [pmScope, setPmScope] = useState<{
    summary?: string | null;
    scopeEntryCount?: number;
    versionCount?: number;
    scopeQna?: Array<{
      id: string;
      question: string;
      answer?: string | null;
      consumedAt?: string | null;
      createdAt?: string;
    }>;
  } | null>(null);
  const [pmMessages, setPmMessages] = useState<PmMessage[]>([]);
  const [generalThreadId, setGeneralThreadId] = useState<string | null>(null);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [sendingReply, setSendingReply] = useState(false);

  const fetchProject = useCallback(async () => {
    if (!accessToken || !projectId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/projects/${projectId}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `Failed to load project (${res.status})`);
      }
      const data = await res.json();
      setProject(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load project");
    } finally {
      setLoading(false);
    }
  }, [accessToken, projectId]);

  useEffect(() => {
    void fetchProject();
  }, [fetchProject]);

  const fetchScope = useCallback(async () => {
    if (!accessToken || !projectId) return;
    try {
      const res = await fetch(`${API_BASE_URL}/projects/${projectId}/pm-scope`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (res.ok) setPmScope(await res.json());
    } catch {
      /* ignore */
    }
  }, [accessToken, projectId]);

  useEffect(() => {
    void fetchScope();
  }, [fetchScope]);

  const fetchMessages = useCallback(async () => {
    if (!accessToken || !projectId) return;
    setMessagesLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/projects/${projectId}/pm-messages`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (res.ok) {
        const data = await res.json();
        setPmMessages(Array.isArray(data?.items) ? data.items : []);
        setGeneralThreadId(data?.generalThreadId ?? null);
      }
    } catch {
      /* ignore */
    } finally {
      setMessagesLoading(false);
    }
  }, [accessToken, projectId]);

  useEffect(() => {
    void fetchMessages();
  }, [fetchMessages]);

  const handleReply = async () => {
    if (!accessToken || !projectId || !replyText.trim() || !generalThreadId) return;
    setSendingReply(true);
    try {
      const res = await fetch(`${API_BASE_URL}/projects/pm/inbox/reply`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ threadType: "project-general", threadId: generalThreadId, content: replyText.trim() }),
      });
      if (!res.ok) throw new Error("Failed to send message");
      setReplyText("");
      await fetchMessages();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send message");
    } finally {
      setSendingReply(false);
    }
  };

  const handleRelease = async () => {
    if (!accessToken || !projectId) return;
    setReleasing(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/projects/${projectId}/pm-release`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `Failed to release (${res.status})`);
      }
      await fetchProject();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to release project");
    } finally {
      setReleasing(false);
    }
  };

  const postPmAction = async (url: string, body?: unknown) => {
    const res = await fetch(`${API_BASE_URL}${url}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(text || `Request failed (${res.status})`);
    }
  };

  const handleSendMessage = async () => {
    if (!messageText.trim()) return;
    setSendingMessage(true);
    try {
      await postPmAction(`/projects/${projectId}/pm-request-info`, { question: messageText });
      setMessageText("");
      toast.success("Question sent to the client");
      void fetchScope();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send question");
    } finally {
      setSendingMessage(false);
    }
  };

  const handleArrangeCall = async () => {
    setArrangingCall(true);
    try {
      await postPmAction(`/projects/${projectId}/pm-request-call`);
      toast.success("Call request sent to the client");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to request call");
    } finally {
      setArrangingCall(false);
    }
  };

  const handleAddPhotos = async () => {
    if (pendingPhotos.length === 0) return;
    setAddingPhotos(true);
    try {
      const formData = new FormData();
      pendingPhotos.forEach((f) => formData.append("files", f));
      formData.append("projectId", projectId);
      const uploadRes = await fetch(`${API_BASE_URL.replace(/\/$/, "")}/uploads`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
        body: formData,
      });
      if (!uploadRes.ok) {
        const text = await uploadRes.text();
        throw new Error(text || "Image upload failed");
      }
      const uploadData = await uploadRes.json();
      const urls: string[] = uploadData.urls || [];
      if (urls.length === 0) throw new Error("No URLs returned from upload");
      await postPmAction(`/projects/${projectId}/photos`, { urls });
      setPendingPhotos([]);
      toast.success("Photos added");
      await fetchProject();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add photos");
    } finally {
      setAddingPhotos(false);
    }
  };

  const handleArrangeSurvey = async () => {
    setArrangingSurvey(true);
    try {
      await postPmAction(`/projects/${projectId}/pm-request-survey`);
      toast.success("Survey booking request sent to the client");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to request survey");
    } finally {
      setArrangingSurvey(false);
    }
  };

  const handleRedefineScope = async () => {
    setRefiningScope(true);
    try {
      await postPmAction(`/projects/${projectId}/pm-redefine-scope`, {});
      toast.success("Scope refinement started");
      // The AI regeneration is async; poll briefly until the summary updates.
      for (let attempt = 1; attempt <= 5; attempt += 1) {
        await new Promise((r) => setTimeout(r, 4000));
        await fetchScope();
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to refine scope");
    } finally {
      setRefiningScope(false);
    }
  };

  const handleRequestImages = async () => {
    setRequestingImages(true);
    try {
      await postPmAction(`/projects/${projectId}/pm-request-images`);
      toast.success("Image request sent to the client");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to request images");
    } finally {
      setRequestingImages(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-5">
      <div className="flex items-center gap-3 text-sm bg-white border border-slate-200 rounded-lg px-4 py-2.5">
        <Link href="/pm" className="font-semibold text-slate-900 hover:text-slate-700">PM Home</Link>
        <span className="text-slate-300">/</span>
        <span className="text-slate-500">Project</span>
      </div>

      {loading && <div className="py-10 text-center text-slate-500 text-sm">Loading project…</div>}

      {error && (
        <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {!loading && !error && project && (
        <div className="rounded-xl border border-slate-200 bg-white px-5 py-5 shadow-sm space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-2xl font-bold text-slate-900">{project.projectName}</h1>
              <p className="mt-1 text-sm text-slate-500">
                For {project.clientName || `${project.user?.firstName || ""} ${project.user?.surname || ""}`.trim() || "the client"} in {project.region || "your location"}
              </p>
            </div>
            <span
              className={`shrink-0 inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${
                project.releasedForQuotationAt
                  ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                  : "border-amber-300 bg-amber-50 text-amber-700"
              }`}
            >
              {project.releasedForQuotationAt ? "Released for quotation" : "Awaiting release"}
            </span>
          </div>

          {project.tradesRequired && project.tradesRequired.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {project.tradesRequired.map((trade) => (
                <span
                  key={trade}
                  className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-600"
                >
                  {trade}
                </span>
              ))}
            </div>
          )}

          {project.mimoProjectExtras && project.mimoProjectExtras.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {project.mimoProjectExtras.map((extra) => (
                <span
                  key={extra.id}
                  className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${
                    extra.extraType === 'design'
                      ? 'border-pink-300 bg-pink-50 text-pink-800'
                      : 'border-indigo-300 bg-indigo-50 text-indigo-800'
                  }`}
                >
                  {extra.extraType === 'survey'
                    ? '🏗️ Surveying+'
                    : extra.extraType === 'design'
                    ? '🎨 Interior Design'
                    : extra.title || extra.extraType}
                </span>
              ))}
            </div>
          )}

          {project.notes && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Project notes</p>
              <p className="mt-1 text-sm whitespace-pre-wrap text-slate-700">{project.notes}</p>
            </div>
          )}

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 text-sm">
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <p className="text-xs text-slate-500">Status</p>
              <p className="font-medium text-slate-800">{project.status || "—"}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <p className="text-xs text-slate-500">Stage</p>
              <p className="font-medium text-slate-800">{project.currentStage || "—"}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <p className="text-xs text-slate-500">Project registered</p>
              <p className="font-medium text-slate-800">{formatDate(project.tenderOpenedAt)}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <p className="text-xs text-slate-500">Released at</p>
              <p className="font-medium text-slate-800">{formatDate(project.releasedForQuotationAt)}</p>
            </div>
          </div>

          {/* Images */}
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 space-y-3">
            <h3 className="text-sm font-semibold text-slate-900">Project images</h3>
            {project.photos && project.photos.length > 0 ? (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {project.photos.map((photo) => (
                  <a
                    key={photo.id}
                    href={photo.url}
                    target="_blank"
                    rel="noreferrer"
                    className="relative block aspect-square overflow-hidden rounded-lg border border-slate-200 bg-slate-50"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={photo.url} alt={photo.note || "Project image"} className="h-full w-full object-cover" />
                  </a>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-500">No images yet.</p>
            )}

            <div className="flex flex-wrap items-center gap-3">
              <ChatImageUploader
                onFilesSelected={setPendingPhotos}
                maxImages={5}
                disabled={addingPhotos}
                isUploading={addingPhotos}
                uploadingCount={pendingPhotos.length}
              />
              <button
                type="button"
                onClick={handleAddPhotos}
                disabled={addingPhotos || pendingPhotos.length === 0}
                className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {addingPhotos ? "Uploading…" : "Upload"}
              </button>
              <button
                type="button"
                onClick={handleRequestImages}
                disabled={requestingImages}
                className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {requestingImages ? "Requesting…" : "📸 Request images"}
              </button>
            </div>
          </div>

          {/* Scope */}
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 space-y-3">
            <h3 className="text-sm font-semibold text-slate-900">Project scope</h3>
            {pmScope?.summary ? (
              <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Current scope summary</p>
                <p className="mt-1 text-sm whitespace-pre-wrap text-slate-700">{pmScope.summary}</p>
              </div>
            ) : null}

            {pmScope?.scopeQna && pmScope.scopeQna.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Questions &amp; answers ({pmScope.scopeQna.length})
                </p>
                <ul className="space-y-2">
                  {pmScope.scopeQna.map((q) => {
                    const answered = Boolean(q.answer);
                    const consumed = Boolean(q.consumedAt);
                    return (
                      <li key={q.id} className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-medium text-slate-800">❓ {q.question}</p>
                          <span
                            className={`shrink-0 inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
                              consumed
                                ? "border-slate-300 bg-slate-100 text-slate-500"
                                : answered
                                ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                                : "border-amber-300 bg-amber-50 text-amber-700"
                            }`}
                          >
                            {consumed ? "Used in scope" : answered ? "Answered" : "Awaiting answer"}
                          </span>
                        </div>
                        {answered ? (
                          <p className="mt-1 text-sm text-slate-700 whitespace-pre-wrap">{q.answer}</p>
                        ) : (
                          <p className="mt-1 text-xs text-slate-400">The client hasn't answered yet.</p>
                        )}
                        <p className="mt-1 text-[11px] text-slate-400">{formatDate(q.createdAt)}</p>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            <div>
              <label className="text-xs font-medium text-slate-600">Ask for more info</label>
              <div className="mt-1 flex gap-2">
                <textarea
                  value={messageText}
                  onChange={(e) => setMessageText(e.target.value)}
                  rows={2}
                  placeholder="Ask the client a question…"
                  className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                />
                <button
                  type="button"
                  onClick={handleSendMessage}
                  disabled={sendingMessage || !messageText.trim()}
                  className="shrink-0 self-end rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  {sendingMessage ? "Sending…" : "Send"}
                </button>
              </div>
            </div>
            <button
              type="button"
              onClick={handleRedefineScope}
              disabled={refiningScope}
              className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {refiningScope ? "Refining…" : "✨ Redefine scope"}
            </button>
          </div>

          {/* Requests */}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleArrangeCall}
              disabled={arrangingCall}
              className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {arrangingCall ? "Requesting…" : "📞 Request call"}
            </button>
            <button
              type="button"
              onClick={handleArrangeSurvey}
              disabled={arrangingSurvey}
              className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {arrangingSurvey ? "Requesting…" : "🏗️ Request survey"}
            </button>
          </div>

          {/* Messages */}
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-900">Messages</h3>
              <button
                type="button"
                onClick={() => void fetchMessages()}
                className="text-xs font-semibold text-emerald-700 hover:text-emerald-800"
              >
                Refresh
              </button>
            </div>
            {messagesLoading ? (
              <p className="text-sm text-slate-500">Loading…</p>
            ) : pmMessages.length === 0 ? (
              <p className="text-sm text-slate-500">No messages yet.</p>
            ) : (
              <div className="space-y-2">
                {pmMessages.map((m) => (
                  <div
                    key={m.id}
                    className={`rounded-lg px-3 py-2 ${
                      m.senderType === "pm"
                        ? "border border-emerald-100 bg-emerald-50"
                        : "border border-slate-200 bg-white"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-slate-800">{m.senderName}</span>
                      <span className="text-[10px] text-slate-400">{formatDate(m.createdAt)}</span>
                    </div>
                    <p className="mt-0.5 whitespace-pre-wrap text-sm text-slate-700">{m.content}</p>
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <textarea
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                rows={2}
                placeholder="Reply to the client…"
                className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
              />
              <button
                type="button"
                onClick={handleReply}
                disabled={sendingReply || !replyText.trim() || !generalThreadId}
                className="shrink-0 self-end rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {sendingReply ? "Sending…" : "Send"}
              </button>
            </div>
          </div>

          {!project.releasedForQuotationAt && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
              <p className="text-sm text-amber-900">
                This project is held and not yet visible for quotation. Review the details and release it when ready.
              </p>
              <button
                type="button"
                disabled={releasing}
                onClick={handleRelease}
                className="mt-3 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50"
              >
                {releasing ? "Releasing…" : "Release for quotation"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
