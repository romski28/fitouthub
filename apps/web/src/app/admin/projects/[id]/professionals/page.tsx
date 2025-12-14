"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { API_BASE_URL } from "@/config/api";

type ProjectProfessional = {
  id: string;
  status: string;
  respondedAt: string | null;
  quoteAmount: number | null;
  quoteNotes: string | null;
  quotedAt: string | null;
  createdAt: string;
  professional: {
    email: string;
    phone: string;
    fullName?: string;
    businessName?: string;
  };
};

export default function ProjectProfessionalsPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;
  
  const [professionals, setProfessionals] = useState<ProjectProfessional[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchProfessionals();
  }, [projectId]);

  const fetchProfessionals = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/projects/${projectId}/professionals`);
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setProfessionals(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="text-center text-slate-600">Loading professional responses...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <button
          onClick={() => router.back()}
          className="text-sm text-slate-600 hover:text-slate-900"
        >
          ← Back to Projects
        </button>
      </div>

      <div>
        <h1 className="text-3xl font-bold text-slate-900">Professional Responses & Quotes</h1>
        <p className="mt-1 text-sm text-slate-600">{professionals.length} professionals invited to this project</p>
      </div>

      <div className="space-y-4">
        {professionals.map((pp) => (
          <div key={pp.id} className="rounded-lg border border-slate-200 bg-white p-5">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-3">
                  <h3 className="text-lg font-semibold text-slate-900">
                    {pp.professional.fullName || pp.professional.businessName}
                  </h3>
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-medium ${
                      pp.status === "accepted"
                        ? "bg-green-100 text-green-700"
                        : pp.status === "declined"
                          ? "bg-rose-100 text-rose-700"
                          : pp.status === "quoted"
                            ? "bg-blue-100 text-blue-700"
                            : pp.status === "awarded"
                              ? "bg-purple-100 text-purple-700"
                              : "bg-amber-100 text-amber-700"
                    }`}
                  >
                    {pp.status}
                  </span>
                </div>
                <div className="mt-1 flex gap-4 text-sm text-slate-600">
                  <span>📧 {pp.professional.email}</span>
                  <span>📞 {pp.professional.phone}</span>
                </div>
              </div>
            </div>

            <div className="mt-4 grid gap-3 text-sm">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="font-medium text-slate-700">Invited:</span>
                  <span className="ml-2 text-slate-600">{new Date(pp.createdAt).toLocaleString()}</span>
                </div>
                {pp.respondedAt && (
                  <div>
                    <span className="font-medium text-slate-700">Responded:</span>
                    <span className="ml-2 text-slate-600">{new Date(pp.respondedAt).toLocaleString()}</span>
                  </div>
                )}
              </div>

              {pp.status === "quoted" && pp.quoteAmount && (
                <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Quote Submitted</p>
                      <p className="mt-1 text-2xl font-bold text-blue-900">
                        HK${pp.quoteAmount.toLocaleString()}
                      </p>
                      {pp.quoteNotes && (
                        <p className="mt-2 text-sm text-blue-800">{pp.quoteNotes}</p>
                      )}
                    </div>
                    {pp.quotedAt && (
                      <span className="text-xs text-blue-600">
                        {new Date(pp.quotedAt).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                </div>
              )}

              {pp.status === "pending" && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                  ⏳ Waiting for professional to respond (2 hour deadline)
                </div>
              )}

              {pp.status === "accepted" && !pp.quotedAt && (
                <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">
                  ✅ Professional accepted, quote pending (24 hour deadline)
                </div>
              )}

              {pp.status === "declined" && (
                <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
                  ❌ Professional declined this project
                </div>
              )}
            </div>
          </div>
        ))}

        {professionals.length === 0 && (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-8 text-center text-slate-600">
            No professionals invited to this project
          </div>
        )}
      </div>
    </div>
  );
}
