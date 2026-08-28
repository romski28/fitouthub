import { PlatformFeeBreakdown } from '../common/platform-fee.service';

// Markup applied to subcontracted (B2B) portions of a quote in place of the
// 10% platform fee. 1.0 = pass-through at cost; tunable later via env.
export const B2B_MARKUP_MULTIPLIER = Number(process.env.B2B_MARKUP_MULTIPLIER ?? 1);

const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export interface SubcontractingEntryInput {
  trade?: string;
  kind?: string;
  amount?: number | string;
  labour?: number | string;
  supplies?: number | string;
  other?: number | string;
  otherNotes?: string;
  contactId?: string | null;
  professionalId?: string | null;
  b2bCost?: number | string | null;
  multiplier?: number | string | null;
  status?: string;
  name?: string | null;
}

export interface NormalizedSubcontractingEntry {
  trade: string;
  kind: string;
  amount: number;
  labour: number;
  supplies: number;
  other: number;
  otherNotes: string | null;
  contactId: string | null;
  professionalId: string | null;
  b2bCost: number | null;
  multiplier: number;
  status: string;
  name: string | null;
}

/**
 * Normalise a per-trade subcontracting plan into its stored shape and split
 * the totals into the self-delivered portion (fee applies) vs the subcontracted
 * B2B portion (fee-exempt, marked up by the multiplier).
 */
export function normalizeSubcontracting(
  entries?: SubcontractingEntryInput[],
): {
  normalized: NormalizedSubcontractingEntry[];
  selfBase: number;
  b2bBase: number;
} {
  const normalized: NormalizedSubcontractingEntry[] = [];
  let selfBase = 0;
  let b2bBase = 0;

  if (Array.isArray(entries)) {
    for (const entry of entries) {
      const kind = String(entry?.kind || '').trim().toLowerCase();
      const labour = roundMoney(Number(entry?.labour ?? 0));
      const supplies = roundMoney(Number(entry?.supplies ?? 0));
      const other = roundMoney(Number(entry?.other ?? 0));
      const passedAmount = roundMoney(Number(entry?.amount ?? 0));
      const amount =
        labour + supplies + other > 0
          ? roundMoney(labour + supplies + other)
          : passedAmount;
      const rawMultiplier = Number(entry?.multiplier ?? B2B_MARKUP_MULTIPLIER);
      normalized.push({
        trade: String(entry?.trade || '').trim(),
        kind,
        amount,
        labour,
        supplies,
        other,
        otherNotes: entry?.otherNotes || null,
        contactId: entry?.contactId || null,
        professionalId: entry?.professionalId || null,
        b2bCost: entry?.b2bCost != null ? Number(entry.b2bCost) : null,
        multiplier: Number.isFinite(rawMultiplier) ? rawMultiplier : B2B_MARKUP_MULTIPLIER,
        status: String(entry?.status || 'tbc'),
        name: entry?.name || null,
      });
      if (kind === 'self') selfBase += amount;
      else b2bBase += amount;
    }
    selfBase = roundMoney(selfBase);
    b2bBase = roundMoney(b2bBase);
  }

  return { normalized, selfBase, b2bBase };
}

/**
 * Build the per-trade fee breakdown from the self/B2B split and the
 * self-delivered fee result.
 */
export function buildTradePlanFeeBreakdown(
  selfBase: number,
  b2bBase: number,
  selfFee: PlatformFeeBreakdown,
): PlatformFeeBreakdown & {
  b2bBaseAmount: number;
  b2bGrossAmount: number;
  b2bMultiplier: number;
} {
  const b2bGross = roundMoney(b2bBase * B2B_MARKUP_MULTIPLIER);
  const grossAmount = roundMoney(selfFee.grossAmount + b2bGross);
  const baseTotal = roundMoney(selfBase + b2bBase);
  return {
    ...selfFee,
    baseAmount: baseTotal,
    platformFeeAmount: roundMoney(grossAmount - baseTotal),
    effectivePercent:
      baseTotal > 0 ? roundMoney(((grossAmount - baseTotal) / baseTotal) * 100) : 0,
    grossAmount,
    b2bBaseAmount: b2bBase,
    b2bGrossAmount: b2bGross,
    b2bMultiplier: B2B_MARKUP_MULTIPLIER,
  };
}
