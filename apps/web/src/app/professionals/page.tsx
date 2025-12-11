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
        <p className="text-sm text-slate-600">Static preview from seed data. API endpoint will replace this soon.</p>
      </div>

      <div className="space-y-4">
        {professionals.map((pro) => (
          <div
            key={pro.id}
            className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
          >
            <div className="flex flex-wrap items-center gap-3">
              <div>
                <div className="text-base font-semibold text-slate-900">{pro.fullName || pro.businessName}</div>
                <div className="text-xs text-slate-600">
                  {pro.type === "contractor" ? pro.primaryTradeTitle || "Contractor" : "Reseller"}
                </div>
              </div>
              <Pill label={pro.type === "contractor" ? "Contractor" : "Reseller"} />
              <Pill label={pro.businessType === "company" ? "Company" : "Sole trader"} />
              <Pill label={pro.status} />
              <Pill label={`${pro.rating.toFixed(1)}★`} />
            </div>

            {pro.serviceArea.length ? (
              <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-700">
                {pro.serviceArea.map((area) => (
                  <span key={area} className="rounded border border-slate-200 px-2 py-1">
                    {area}
                  </span>
                ))}
              </div>
            ) : null}

            {pro.productCategories?.length ? (
              <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-700">
                {pro.productCategories.map((cat) => (
                  <span key={cat} className="rounded bg-slate-100 px-2 py-1">
                    {cat}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
