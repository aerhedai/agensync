// Single source of truth for which currencies the app offers and how each
// renders in a composed reply — the settings-page <select> and the
// formatter both read from this, so they can't drift out of sync.
export const CURRENCY_SYMBOLS: Record<string, string> = {
  GBP: "£",
  USD: "$",
  EUR: "€",
};

export const SUPPORTED_CURRENCIES = Object.keys(CURRENCY_SYMBOLS) as [
  string,
  ...string[],
];

export function currencySymbol(code: string): string {
  return CURRENCY_SYMBOLS[code] ?? code;
}
