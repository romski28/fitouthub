import { getProfessionals } from "../../lib/api";
import { Professional } from "../../lib/types";
import ProfessionalsList from "@/components/professionals-list";

// Removed local Pill component; rendering moved to ProfessionalsList

export default async function ProfessionalsPage() {
  const professionals: Professional[] = await getProfessionals();

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.12em] text-slate-500">Marketplace</p>
        <h1 className="text-2xl font-semibold text-slate-900">Professionals</h1>
        <p className="text-sm text-slate-600">Live data from the Fitout Hub API.</p>
      </div>

      {professionals.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-600">
          No professionals yet. Submit a registration to see them listed here.
        </div>
      ) : (
        <ProfessionalsList professionals={professionals} />
      )}
    </div>
  );
}
