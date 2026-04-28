import React from 'react';

type UploadRow = {
  id: string;
  filename: string;
  url: string;
  note: string;
  value: string;
  uploading: boolean;
};

interface MaterialsClaimItemsTableProps {
  rows: UploadRow[];
  totalClaimed: number;
  maxClaimableAmount: number;
  onNoteChange: (rowId: string, value: string) => void;
  onValueChange: (rowId: string, value: string) => void;
  onRemove: (rowId: string) => void;
  formatHKD: (value: number | string) => string;
}

export default function MaterialsClaimItemsTable({
  rows,
  totalClaimed,
  maxClaimableAmount,
  onNoteChange,
  onValueChange,
  onRemove,
  formatHKD,
}: MaterialsClaimItemsTableProps) {
  const isOverMaximum = totalClaimed > maxClaimableAmount;
  const totalLabel = isOverMaximum
    ? `Total claimed (Maximum payment of ${formatHKD(maxClaimableAmount)} will be requested)`
    : 'Total claimed';

  return (
    <div className="rounded-md border border-slate-700 overflow-hidden">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-slate-700 bg-slate-900/80">
            <th className="px-3 py-2 text-left font-semibold text-slate-300">File</th>
            <th className="px-3 py-2 text-left font-semibold text-slate-300">Note</th>
            <th className="px-3 py-2 text-left font-semibold text-slate-300 w-28">Value (HKD)</th>
            <th className="px-2 py-2 w-8" />
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-b border-slate-800 bg-slate-900/40">
              <td className="px-3 py-2 text-slate-200">
                {row.uploading ? (
                  <span className="text-slate-400 italic">Uploading {row.filename}...</span>
                ) : row.url === 'error' ? (
                  <span className="text-rose-400">{row.filename} (failed)</span>
                ) : (
                  <span className="truncate max-w-[120px] block">{row.filename}</span>
                )}
              </td>
              <td className="px-3 py-2">
                <input
                  type="text"
                  value={row.note}
                  onChange={(e) => onNoteChange(row.id, e.target.value)}
                  placeholder="Short description"
                  className="w-full rounded border border-slate-600 bg-slate-900 px-2 py-1 text-xs text-white placeholder-slate-500"
                  disabled={row.uploading}
                />
              </td>
              <td className="px-3 py-2">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={row.value}
                  onChange={(e) => onValueChange(row.id, e.target.value)}
                  placeholder="0.00"
                  className="w-full rounded border border-slate-600 bg-slate-900 px-2 py-1 text-xs text-white placeholder-slate-500"
                  disabled={row.uploading}
                />
              </td>
              <td className="px-2 py-2 text-center">
                <button
                  type="button"
                  onClick={() => onRemove(row.id)}
                  className="text-slate-400 hover:text-rose-400 transition"
                  aria-label="Remove"
                >
                  x
                </button>
              </td>
            </tr>
          ))}
          {rows.length > 0 && (
            <tr className="border-t border-slate-700 bg-slate-900/80">
              <td colSpan={2} className="px-3 py-2 text-right text-xs font-semibold text-slate-300">
                {totalLabel}
              </td>
              <td className={`px-3 py-2 text-xs font-bold ${isOverMaximum ? 'text-amber-300' : 'text-white'}`}>
                {formatHKD(totalClaimed)}
              </td>
              <td />
            </tr>
          )}
        </tbody>
      </table>

      {rows.length > 0 && isOverMaximum && (
        <div className="border-t border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-200">
          Claimed total exceeds available materials cap balance. Submission will be limited to the remaining maximum.
        </div>
      )}
    </div>
  );
}
