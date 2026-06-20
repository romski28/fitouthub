"use client";

import Link from "next/link";
import { useParams } from "next/navigation";

export function PageVersionToggle({ mode }: { mode: "v1" | "v2" }) {
  const { id } = useParams<{ id: string }>();
  const isV1 = mode === "v1";

  return (
    <div className="fixed bottom-4 right-4 z-40">
      <Link
        href={isV1 ? `/projects-v2/${id}` : `/projects/${id}`}
        className="inline-flex items-center gap-1.5 rounded-full border border-slate-300 bg-white/90 px-3 py-1.5 text-[11px] font-medium text-slate-500 shadow-sm backdrop-blur transition hover:border-slate-400 hover:text-slate-700"
      >
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-400" />
        {isV1 ? "Try V2" : "Back to V1"}
      </Link>
    </div>
  );
}
