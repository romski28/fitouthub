"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/context/auth-context";
import { API_BASE_URL } from "@/config/api";
import type { NextStepAction } from "@/lib/next-steps";

// ── Types ────────────────────────────────────────────────────────
interface ProjectV2 {
  id: string;
  projectName: string;
  status: string;
  currentStage: string;
  region: string;
  clientName: string;
  notes?: string;
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
      setProject(data);

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
              className="mb-2 block w-full rounded-lg bg-slate-800 px-4 py-3 text-left text-sm font-medium text-white transition hover:bg-slate-700"
            >
              {step.actionLabel}
            </button>
          ))}

          {/* Elective actions */}
          {nextSteps.ELECTIVE.length > 0 && (
            <div className="mt-3 space-y-1">
              {nextSteps.ELECTIVE.map((step) => (
                <button
                  key={step.actionKey}
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

      {/* Placeholder: Tabs will go here */}
      <div className="rounded-xl border border-dashed border-[#D4C8A0] bg-[#F5EEDE]/50 px-5 py-12 text-center">
        <p className="text-sm text-slate-400">
          Tabs (Quotes · Chat · Files) — coming in next step
        </p>
      </div>

      {/* V2 badge */}
      <div className="mt-8 text-center">
        <Link href={`/projects/${id}`} className="text-xs text-slate-400 underline">
          Switch to V1 page
        </Link>
      </div>
    </div>
  );
}
