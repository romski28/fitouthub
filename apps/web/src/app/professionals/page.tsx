import { getProfessionals } from "../../lib/api";
import { Professional } from "../../lib/types";

function Pill({ label }: { label: string }) {
  return (
    <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">
      {label}
    </span>
  );
}

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
        <div className="space-y-4">
          {professionals.map((pro) => {
            const serviceAreas = (pro.serviceArea ?? "")
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean);

            return (
              <div
                key={pro.id}
                className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
              >
                <div className="flex flex-wrap items-center gap-3">
                  <div>
                    <div className="text-base font-semibold text-slate-900">
                      {pro.fullName || pro.businessName || "Professional"}
                    </div>
                    <div className="text-xs text-slate-600">
                      {pro.professionType}
                    </div>
                  </div>
                  <Pill label={pro.professionType} />
                  <Pill label={pro.status} />
                  <Pill label={`${pro.rating.toFixed(1)}★`} />
                </div>

                <div className="mt-3 grid gap-2 text-xs text-slate-700 sm:grid-cols-2 lg:grid-cols-3">
                  <div className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
                    <span className="font-semibold">Email:</span>
                    <span className="text-slate-600">{pro.email}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
                    <span className="font-semibold">Phone:</span>
                    <span className="text-slate-600">{pro.phone}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
                    <span className="font-semibold">Status:</span>
                    <span className="text-slate-600 capitalize">{pro.status}</span>
                  </div>
                </div>

                {serviceAreas.length ? (
                  <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-700">
                    {serviceAreas.map((area) => (
                      <span key={area} className="rounded border border-slate-200 px-2 py-1">
                        {area}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
