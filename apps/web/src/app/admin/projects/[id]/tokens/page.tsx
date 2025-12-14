"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { API_BASE_URL } from "@/config/api";

type EmailToken = {
  id: string;
  token: string;
  action: string;
  expiresAt: string;
  usedAt: string | null;
  createdAt: string;
  professional: {
    email: string;
    fullName?: string;
    businessName?: string;
  };
};

export default function ProjectTokensPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;
  
  const [tokens, setTokens] = useState<EmailToken[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchTokens();
  }, [projectId]);

  const fetchTokens = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/projects/${projectId}/tokens`);
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setTokens(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="text-center text-slate-600">Loading email tokens...</div>;
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
        <h1 className="text-3xl font-bold text-slate-900">Email Tokens</h1>
        <p className="mt-1 text-sm text-slate-600">{tokens.length} email tokens for this project</p>
      </div>

      <div className="space-y-3">
        {tokens.map((token) => (
          <div key={token.id} className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-slate-900">
                    {token.professional.fullName || token.professional.businessName}
                  </h3>
                  <span
                    className={`rounded-full px-2 py-1 text-xs font-medium ${
                      token.action === "accept"
                        ? "bg-green-100 text-green-700"
                        : "bg-slate-100 text-slate-700"
                    }`}
                  >
                    {token.action}
                  </span>
                </div>
                <p className="text-sm text-slate-600">{token.professional.email}</p>
              </div>
              <span
                className={`rounded-full px-2 py-1 text-xs font-medium ${
                  token.usedAt
                    ? "bg-blue-100 text-blue-700"
                    : new Date() > new Date(token.expiresAt)
                      ? "bg-rose-100 text-rose-700"
                      : "bg-amber-100 text-amber-700"
                }`}
              >
                {token.usedAt ? "Used" : new Date() > new Date(token.expiresAt) ? "Expired" : "Active"}
              </span>
            </div>

            <div className="mt-3 grid gap-2 text-sm text-slate-600">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="font-medium">Token:</span>
                  <code className="ml-2 rounded bg-slate-100 px-2 py-0.5 text-xs">{token.token.slice(0, 20)}...</code>
                </div>
                <div>
                  <span className="font-medium">Created:</span>
                  <span className="ml-2">{new Date(token.createdAt).toLocaleString()}</span>
                </div>
                <div>
                  <span className="font-medium">Expires:</span>
                  <span className="ml-2">{new Date(token.expiresAt).toLocaleString()}</span>
                </div>
                {token.usedAt && (
                  <div>
                    <span className="font-medium">Used:</span>
                    <span className="ml-2">{new Date(token.usedAt).toLocaleString()}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}

        {tokens.length === 0 && (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-8 text-center text-slate-600">
            No email tokens found for this project
          </div>
        )}
      </div>
    </div>
  );
}
