"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { API_BASE_URL } from "@/config/api";
import { ProjectProgressBar } from "@/components/project-progress-bar";
import { useAuth } from "@/context/auth-context";
import ProjectFinancialsCard from "@/components/project-financials-card";
import { useFundsSecured } from "@/hooks/use-funds-secured";

interface ProjectProfessional {
  id: string;
  status: string;
  quoteAmount?: number | string;
  invoice?: { amount?: number | string; paymentStatus?: string | null } | null;
  professional: {
    id: string;
    email: string;
    fullName?: string;
    businessName?: string;
    phone?: string;
  };
}

interface ProjectDetail {
  id: string;
  projectName: string;
  clientName: string;
  contractorName?: string;
  region: string;
  budget?: number | string;
  status: string;
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
  startDate?: string;
  endDate?: string;
  professionals?: ProjectProfessional[];
  tradesRequired?: string[];
}

const formatDate = (date?: string) => {
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
};

const formatHKD = (value?: number | string) => {
  if (value === undefined || value === null || value === "") return "HK$ —";
  const num = typeof value === "number" ? value : Number(value);
  if (Number.isNaN(num)) return `HK$ ${value}`;
  return `HK$ ${num.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
};

export default function AdminProjectDetailPage({ params }: { params: { id: string } }) {
  const routeParams = useParams();
  const router = useRouter();
  // Prefer useParams to avoid hydration edge cases where params prop can be undefined in client components
  const projectId = (routeParams?.id as string) || params.id;
  const { isLoggedIn, accessToken } = useAuth();
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Check if funds are secured via financial summary
  const fundsSecured = useFundsSecured(projectId, accessToken || undefined);

  useEffect(() => {
    if (!isLoggedIn || !accessToken) return;
    if (!projectId) {
      setError("Project id is missing in route");
      setLoading(false);
      return;
    }
    const load = async () => {
      setLoading(true);
      try {
        const res = await fetch(`${API_BASE_URL}/projects/${projectId}`, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
        });

        if (!res.ok) {
          const errText = await res.text().catch(() => "");
          throw new Error(`Failed to load project (${res.status}) ${errText || ""}`.trim());
        }

        const raw = await res.text().catch(() => "");

        if (!raw || !raw.trim()) {
          setError(`Empty body from ${res.url} (status ${res.status})`);
          setProject(null);
          return;
        }

        try {
          const data = JSON.parse(raw);
          setProject(data);
        } catch (err) {
          console.warn("Admin project detail received non-JSON response", { status: res.status, raw });
          setError(`Non-JSON project response (status ${res.status}): ${raw.slice(0, 200)}`);
          setProject(null);
        }
      } catch (e: any) {
        setError(e?.message || "Failed to load project");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [projectId, isLoggedIn, accessToken]);

  useEffect(() => {
    // Redirect to list if somehow no id is present
    if (!projectId && !loading) {
      router.push("/admin/projects");
    }
  }, [projectId, loading, router]);

  if (loading) {
    return <div className="p-6 text-sm text-slate-600">Loading project…</div>;
  }

  if (error || !project) {
    return (
      <div className="p-6 text-sm text-red-700">
        {error || "Project not found"}
        <div>
          <Link href="/admin/projects" className="text-blue-600 hover:underline">
            ← Back to admin projects
          </Link>
        </div>
      </div>
    );
  }

  const awardedPro = project.professionals?.find((p) => p.status === "awarded");
  const isAwarded = project.status === "awarded" || Boolean(awardedPro);
  const projectCostValue = awardedPro?.quoteAmount ?? project.budget ?? 0;
  const escrowValue = (awardedPro as any)?.invoice?.amount ?? (project as any)?.escrowAmount ?? 0;
  const paidValue = (project as any)?.paidAmount ?? (awardedPro as any)?.invoice?.paidAmount ?? 0;

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-5">
      <div className="flex items-center justify-between">
        <Link href="/admin/projects" className="text-sm text-blue-600 hover:underline">
          ← Back to admin projects
        </Link>
        <span className="text-xs text-slate-500">ID: {project.id}</span>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div
          className={`px-5 py-4 text-white rounded-t-xl ${
            project.status === "withdrawn"
              ? "bg-gradient-to-r from-slate-400 to-slate-300"
              : "bg-gradient-to-r from-slate-900 to-slate-800"
          }`}
        >
          <h1 className={`text-2xl font-bold ${project.status === "withdrawn" ? "text-slate-700" : ""}`}>
            {project.projectName}
          </h1>
          <p
            className={`text-sm font-semibold uppercase tracking-wide mt-1 ${
              project.status === "withdrawn" ? "text-slate-600" : "text-emerald-300"
            }`}
          >
            {project.region}
          </p>
        </div>

        <div className="p-5 space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="flex items-center gap-2 text-sm">
              <span className="h-1.5 w-1.5 rounded-full bg-slate-300" />
              <span className="font-semibold text-slate-700">Budget:</span>
              <span className="text-slate-600">{project.budget ? formatHKD(project.budget) : "Not specified"}</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <span className="h-1.5 w-1.5 rounded-full bg-slate-300" />
              <span className="font-semibold text-slate-700">Professionals:</span>
              <span className="text-slate-600">{project.professionals?.length || 0}</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <span className="h-1.5 w-1.5 rounded-full bg-slate-300" />
              <span className="font-semibold text-slate-700">Created:</span>
              <span className="text-slate-600">{formatDate(project.createdAt)}</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <span className="h-1.5 w-1.5 rounded-full bg-slate-300" />
              <span className="font-semibold text-slate-700">Updated:</span>
              <span className="text-slate-600">{formatDate(project.updatedAt)}</span>
            </div>
          </div>

          {project.notes && (
            <div className="rounded-md bg-slate-50 px-3 py-2 text-sm border border-slate-100">
              <p className="font-semibold text-slate-800 mb-1">Notes</p>
              <p className="text-slate-700 leading-relaxed">{project.notes}</p>
            </div>
          )}
        </div>
      </div>

      <ProjectProgressBar
        project={{
          id: project.id,
          status: project.status,
          startDate: project.startDate,
          endDate: project.endDate,
          professionals:
            project.professionals?.map((p) => ({
              status: p.status,
              quoteAmount: p.quoteAmount,
              invoice: p.invoice || null,
            })) || [],
        }}
        variant="full"
        fundsSecured={fundsSecured}
      />

      {isAwarded && (
        <div className="rounded-xl border border-emerald-100 bg-emerald-50 shadow-sm p-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-semibold text-emerald-900">Project Budget</p>
            <span className="text-xs font-medium text-emerald-700">Awarded</span>
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            <div className="rounded-md bg-white border border-emerald-100 px-3 py-2 shadow-[0_1px_3px_rgba(16,185,129,0.08)]">
              <p className="text-[11px] font-semibold text-emerald-800">Project Cost</p>
              <p className="text-sm font-bold text-emerald-900">{formatHKD(projectCostValue)}</p>
            </div>
            <div className="rounded-md bg-white border border-emerald-100 px-3 py-2 shadow-[0_1px_3px_rgba(16,185,129,0.08)]">
              <p className="text-[11px] font-semibold text-emerald-800">Escrow Account</p>
              <p className="text-sm font-bold text-emerald-900">{formatHKD(escrowValue)}</p>
            </div>
            <div className="rounded-md bg-white border border-emerald-100 px-3 py-2 shadow-[0_1px_3px_rgba(16,185,129,0.08)]">
              <p className="text-[11px] font-semibold text-emerald-800">Paid</p>
              <p className="text-sm font-bold text-emerald-900">{formatHKD(paidValue)}</p>
            </div>
          </div>
        </div>
      )}

      {/* Financials */}
      {isAwarded && accessToken && (
        <ProjectFinancialsCard
          projectId={project.id}
          accessToken={accessToken}
          projectCost={projectCostValue}
          originalBudget={project.budget}
          role="admin"
        />
      )}

      {project.professionals && project.professionals.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="px-5 py-4 border-b border-slate-200 flex items-start justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Invited Professionals</h2>
              <p className="text-sm text-slate-600">Read-only overview for admins.</p>
            </div>
            <div className="text-xs text-slate-500">Total: {project.professionals.length}</div>
          </div>
          <div className="p-5 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-slate-600">
                  <th className="py-2 pr-4">Name</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2 pr-4">Quote</th>
                  <th className="py-2 pr-4">Invoice</th>
                </tr>
              </thead>
              <tbody>
                {project.professionals.map((pp) => {
                  const displayName = pp.professional.fullName || pp.professional.businessName || pp.professional.email;
                  return (
                    <tr key={pp.id} className="border-t border-slate-100 hover:bg-slate-50">
                      <td className="py-2 pr-4">
                        <div className="flex items-center gap-2">
                          <div className="h-6 w-6 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-[10px] font-bold">
                            {displayName[0]?.toUpperCase()}
                          </div>
                          <span className="font-medium text-slate-800 text-xs">{displayName}</span>
                        </div>
                      </td>
                      <td className="py-2 pr-4 capitalize text-slate-700">{pp.status}</td>
                      <td className="py-2 pr-4 text-slate-700">{pp.quoteAmount ? formatHKD(pp.quoteAmount) : "—"}</td>
                      <td className="py-2 pr-4 text-slate-700">{pp.invoice?.amount ? formatHKD(pp.invoice.amount) : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
