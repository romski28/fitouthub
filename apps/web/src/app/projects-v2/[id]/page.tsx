"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { PageVersionToggle } from "@/components/page-version-toggle";
import { useAuth } from "@/context/auth-context";
import { useNextStepModal } from "@/context/next-step-modal-context";
import { resolveNextStepModalContent } from "@/lib/next-step-modal-content";
import { API_BASE_URL } from "@/config/api";
import { ProjectTabs } from "@/components/project-tabs";
import { ProjectChat } from "@/components/project-chat";
import { ProjectCalendar } from "@/components/project-calendar";
import type { NextStepAction } from "@/lib/next-steps";

const V2_TABS = [
  { id: "quotes", label: "Quotes", icon: "💰" },
  { id: "chat", label: "Chat", icon: "💬" },
  { id: "timeline", label: "Timeline", icon: "📅" },
  { id: "files", label: "Files", icon: "📎" },
];

// ── Types ────────────────────────────────────────────────────────
interface ProjectV2 {
  id: string;
  projectName: string;
  status: string;
  currentStage: string;
  region: string;
  clientName: string;
  notes?: string;
  startDate?: string;
  endDate?: string;
  siteInspectionAvailableOn?: string;
  siteStartedAt?: string;
  createdAt?: string;
}

interface NextStepResult {
  PRIMARY: NextStepAction[];
  ELECTIVE: NextStepAction[];
  status: string;
  stage: string;
}

// ── Page ─────────────────────────────────────────────────────────
export default function ProjectV2Page() {
  const { id } = useParams<{ id: string }>();
  const { isLoggedIn, accessToken, user } = useAuth();

  const [project, setProject] = useState<ProjectV2 | null>(null);
  const [nextSteps, setNextSteps] = useState<NextStepResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [role, setRole] = useState<"CLIENT" | "PROFESSIONAL" | null>(null);
  const [activeTab, setActiveTab] = useState("quotes");
  const { openModal } = useNextStepModal();

  // ── Handle next step click ─────────────────────────────────────
  const handleStepClick = (step: NextStepAction) => {
    if (!project || !user || !role) return;
    const content = resolveNextStepModalContent(step.actionKey, step.modalContent);
    openModal(
      step.actionKey,
      project.id,
      `/projects-v2/${project.id}`,
      user.id,
      role,
      content,
      nextSteps?.stage || project.currentStage,
      () => fetchProject(), // Refresh after completion
    );
  };

  // ── Fetch project + next steps ─────────────────────────────────
  const fetchProject = useCallback(async () => {
    if (!isLoggedIn || !accessToken) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`${API_BASE_URL}/projects/${id}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) throw new Error(`Project fetch failed (${res.status})`);
      const data = await res.json();
      setProject({
        id: data.id,
        projectName: data.projectName,
        status: data.status,
        currentStage: data.currentStage,
        region: data.region,
        clientName: data.clientName,
        notes: data.notes,
        startDate: data.startDate,
        endDate: data.endDate,
        siteInspectionAvailableOn: data.siteInspectionAvailableOn,
        siteStartedAt: data.siteStartedAt,
        createdAt: data.createdAt,
      });

      // Detect role
      const isClient = data.userId === user?.id || data.clientId === user?.id;
      setRole(isClient ? "CLIENT" : "PROFESSIONAL");

      // Fetch next steps
      const stepsRes = await fetch(
        `${API_BASE_URL}/projects/${id}/next-steps?role=${isClient ? "CLIENT" : "PROFESSIONAL"}`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      if (stepsRes.ok) {
        const stepsData = await stepsRes.json();
        setNextSteps(stepsData);
      }
    } catch (err: any) {
      setError(err.message || "Failed to load project");
    } finally {
      setLoading(false);
    }
  }, [id, isLoggedIn, accessToken, user]);

  useEffect(() => {
    fetchProject();
  }, [fetchProject]);

  // ── Loading / Error ────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-slate-700" />
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12 text-center">
        <h2 className="text-lg font-semibold text-slate-800">Couldn't load project</h2>
        <p className="mt-1 text-sm text-slate-600">{error || "Not found"}</p>
        <button
          onClick={fetchProject}
          className="mt-4 rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white"
        >
          Retry
        </button>
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────
  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      {/* Status Bar */}
      <div className="mb-6 rounded-xl border border-[#D4C8A0] bg-[#F5EEDE] px-5 py-3">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-900">{project.projectName}</h1>
            <p className="text-sm text-slate-600">
              {project.region} · Stage: {project.currentStage || project.status}
            </p>
          </div>
          <span className="rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-600 border border-[#D4C8A0]">
            {role}
          </span>
        </div>
      </div>

      {/* Next Steps */}
      {nextSteps && (
        <div className="mb-6 rounded-xl border border-[#D4C8A0] bg-[#F5EEDE] px-5 py-4">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
            Next Steps
          </h2>

          {/* Primary actions */}
          {nextSteps.PRIMARY.map((step) => (
            <button
              key={step.actionKey}
              onClick={() => handleStepClick(step)}
              className="mb-2 block w-full rounded-lg bg-emerald-600 px-4 py-3 text-left text-sm font-medium text-white shadow-sm transition hover:bg-emerald-700"
            >
              {step.actionLabel}
              {step.description && (
                <span className="mt-0.5 block text-xs font-normal text-white/70">{step.description}</span>
              )}
            </button>
          ))}

          {/* Elective actions */}
          {nextSteps.ELECTIVE.length > 0 && (
            <div className="mt-3 space-y-1">
              {nextSteps.ELECTIVE.map((step) => (
                <button
                  key={step.actionKey}
                  onClick={() => handleStepClick(step)}
                  className="block w-full rounded-lg border border-[#D4C8A0] bg-white px-4 py-2 text-left text-sm text-slate-700 transition hover:bg-[#F5EEDE]"
                >
                  {step.actionLabel}
                </button>
              ))}
            </div>
          )}

          {nextSteps.PRIMARY.length === 0 && nextSteps.ELECTIVE.length === 0 && (
            <p className="text-sm text-slate-500">No actions available for this stage.</p>
          )}
        </div>
      )}

      {/* Tabs */}
      <div className="rounded-xl border border-[#D4C8A0] bg-[#F5EEDE] overflow-hidden">
        <ProjectTabs
          activeTab={activeTab}
          onTabChange={setActiveTab}
          tabs={V2_TABS}
        />

        <div className="px-5 py-4">
          {activeTab === "quotes" && (
            <div className="text-sm text-slate-600">
              <p className="text-slate-400 italic">Quotes overview — read-only view of submitted quotes.</p>
              {/* TODO: wire quote data */}
            </div>
          )}
          {activeTab === "chat" && (
            <ProjectChat
              projectId={id}
              accessToken={accessToken || ""}
              currentUserRole={role === "CLIENT" ? "client" : "professional"}
            />
          )}
          {activeTab === "timeline" && (
            <ProjectCalendar
              events={[
                ...(project.startDate
                  ? [{ date: project.startDate, label: "Proposed start date", type: "start" as const }]
                  : []),
                ...(project.endDate
                  ? [{ date: project.endDate, label: "Project deadline", type: "deadline" as const }]
                  : []),
                ...(project.siteInspectionAvailableOn
                  ? [{ date: project.siteInspectionAvailableOn, label: "Site inspection available", type: "inspection" as const }]
                  : []),
                ...(project.siteStartedAt
                  ? [{ date: project.siteStartedAt, label: "Site work started", type: "milestone" as const }]
                  : []),
                ...(project.createdAt
                  ? [{ date: project.createdAt, label: "Project created", type: "milestone" as const }]
                  : []),
              ]}
            />
          )}
          {activeTab === "files" && (
            <div className="text-sm text-slate-600">
              <p className="text-slate-400 italic">Project files and media — read-only view.</p>
              {/* TODO: wire file/media data */}
            </div>
          )}
        </div>
      </div>

      {/* V2 badge */}
      <PageVersionToggle mode="v2" />
    </div>
  );
}
