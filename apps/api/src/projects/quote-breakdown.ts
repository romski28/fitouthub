export type QuoteBreakdownCode = 'callout_fee' | 'supplies' | 'labour';

export interface QuoteBreakdownItem {
  code: QuoteBreakdownCode;
  label: string;
  amount: number;
  required: boolean;
  displayOrder: number;
}

export interface StoredQuoteBreakdown {
  version: 1;
  projectScale: string | null;
  isEmergency: boolean;
  baseItems: QuoteBreakdownItem[];
  baseTotal: number;
  clientItems: QuoteBreakdownItem[];
  clientTotal: number;
}

const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

const getDefinitions = (isEmergency: boolean): Array<Omit<QuoteBreakdownItem, 'amount'>> => {
  const items: Array<Omit<QuoteBreakdownItem, 'amount'>> = [];
  if (isEmergency) {
    items.push({ code: 'callout_fee', label: 'Callout fee', required: false, displayOrder: 1 });
  }
  items.push({ code: 'supplies', label: 'Supplies', required: true, displayOrder: isEmergency ? 2 : 1 });
  items.push({ code: 'labour', label: 'Labour', required: true, displayOrder: isEmergency ? 3 : 2 });
  return items;
};

const extractRawItems = (input: unknown): Array<Record<string, unknown>> => {
  if (Array.isArray(input)) return input.filter((item): item is Record<string, unknown> => !!item && typeof item === 'object');
  if (input && typeof input === 'object') {
    const value = input as Record<string, unknown>;
    if (Array.isArray(value.baseItems)) {
      return value.baseItems.filter((item): item is Record<string, unknown> => !!item && typeof item === 'object');
    }
    if (Array.isArray(value.items)) {
      return value.items.filter((item): item is Record<string, unknown> => !!item && typeof item === 'object');
    }
  }
  return [];
};

const buildClientItems = (baseItems: QuoteBreakdownItem[], clientTotal: number): QuoteBreakdownItem[] => {
  const baseTotal = roundMoney(baseItems.reduce((sum, item) => sum + item.amount, 0));
  if (baseTotal <= 0) {
    return baseItems.map((item) => ({ ...item }));
  }

  const positiveIndexes = baseItems
    .map((item, index) => (item.amount > 0 ? index : -1))
    .filter((index) => index >= 0);

  if (positiveIndexes.length === 0) {
    return baseItems.map((item) => ({ ...item }));
  }

  let allocated = 0;
  return baseItems.map((item, index) => {
    if (item.amount <= 0) {
      return { ...item, amount: 0 };
    }

    const positivePosition = positiveIndexes.indexOf(index);
    if (positivePosition === positiveIndexes.length - 1) {
      return { ...item, amount: roundMoney(clientTotal - allocated) };
    }

    const amount = roundMoney(clientTotal * (item.amount / baseTotal));
    allocated = roundMoney(allocated + amount);
    return { ...item, amount };
  });
};

export const getQuoteBreakdownDefinitions = (isEmergency: boolean) => getDefinitions(isEmergency);

export const normalizeQuoteBreakdownInput = (
  input: unknown,
  context: { projectScale?: string | null; isEmergency: boolean },
): StoredQuoteBreakdown | null => {
  const definitions = getDefinitions(context.isEmergency);
  const rawItems = extractRawItems(input);
  if (rawItems.length === 0) return null;

  const byCode = new Map<string, Record<string, unknown>>();
  rawItems.forEach((item) => {
    const code = String(item.code || '').trim().toLowerCase();
    if (code) byCode.set(code, item);
  });

  const baseItems = definitions.map((definition) => {
    const raw = byCode.get(definition.code);
    const numeric = Number(raw?.amount ?? 0);
    if (!Number.isFinite(numeric) || numeric < 0) {
      throw new Error(`Invalid amount for ${definition.label.toLowerCase()}`);
    }
    return {
      ...definition,
      amount: roundMoney(numeric),
    };
  });

  const missingRequired = baseItems.find((item) => item.required && !Number.isFinite(item.amount));
  if (missingRequired) {
    throw new Error(`Missing ${missingRequired.label.toLowerCase()}`);
  }

  const baseTotal = roundMoney(baseItems.reduce((sum, item) => sum + item.amount, 0));
  if (baseTotal <= 0) {
    throw new Error('Quote total must be greater than 0');
  }

  return {
    version: 1,
    projectScale: String(context.projectScale || '').trim().toUpperCase() || null,
    isEmergency: context.isEmergency,
    baseItems,
    baseTotal,
    clientItems: baseItems.map((item) => ({ ...item })),
    clientTotal: baseTotal,
  };
};

export const withClientQuoteBreakdown = (
  breakdown: StoredQuoteBreakdown | null,
  clientTotal: number,
): StoredQuoteBreakdown | null => {
  if (!breakdown) return null;
  const roundedClientTotal = roundMoney(clientTotal);
  return {
    ...breakdown,
    clientItems: buildClientItems(breakdown.baseItems, roundedClientTotal),
    clientTotal: roundedClientTotal,
  };
};

const extractItems = (items: unknown): QuoteBreakdownItem[] => {
  if (!Array.isArray(items)) return [];
  return items
    .filter((item): item is QuoteBreakdownItem => {
      return !!item && typeof item === 'object' && typeof (item as QuoteBreakdownItem).code === 'string';
    })
    .sort((a, b) => Number(a.displayOrder || 0) - Number(b.displayOrder || 0));
};

export const getStoredQuoteBreakdownClientItems = (value?: unknown | null): QuoteBreakdownItem[] => {
  if (!value || typeof value !== 'object') return [];
  const payload = value as Partial<StoredQuoteBreakdown> & { items?: unknown };
  const clientItems = extractItems(payload.clientItems);
  if (clientItems.length > 0) return clientItems;
  const baseItems = extractItems(payload.baseItems);
  if (baseItems.length > 0) return baseItems;
  return extractItems(payload.items);
};

export const getQuoteBreakdownDisplayLines = (value?: unknown | null): string[] => {
  return getStoredQuoteBreakdownClientItems(value).map((item) => {
    return `${item.label}: HK$${item.amount.toLocaleString('en-HK', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    })}`;
  });
};