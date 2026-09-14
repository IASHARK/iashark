// Formatage pur (echappement HTML, placeholders, montants, dates). Aucun import.

export function escapeHtml(value: unknown): string {
  return String(value == null ? "" : value).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" } as Record<string, string>)[c]
  );
}

// Remplace {cle} par vars[cle]. Une cle absente est laissee telle quelle (les
// tests verifient qu'aucun placeholder ne subsiste dans un e-mail rendu).
export function fill(template: string, vars: Record<string, string | number | null | undefined>): string {
  return template.replace(/\{([a-zA-Z][a-zA-Z0-9_]*)\}/g, (m, key) => {
    const v = vars[key];
    return v === undefined || v === null ? m : String(v);
  });
}

// Montant Stripe en unite mineure (EUR, GBP, ZAR, MXN : 2 decimales).
export function formatMoney(amountMinor: number, currency: string, intlLocale: string): string {
  const cur = String(currency || "").toUpperCase();
  const value = amountMinor / 100;
  let out: string;
  try {
    out = new Intl.NumberFormat(intlLocale, { style: "currency", currency: cur }).format(value);
  } catch (_e) {
    out = value.toFixed(2) + " " + cur;
  }
  // "$" seul est ambigu (es-MX affiche "$199.00" pour des pesos) : on precise.
  if (out.includes("$") && cur !== "USD") out += " " + cur;
  return out;
}

export function formatDate(iso: string | null | undefined, intlLocale: string, timeZone: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  try {
    return new Intl.DateTimeFormat(intlLocale, { dateStyle: "long", timeZone }).format(d);
  } catch (_e) {
    return d.toISOString().slice(0, 10);
  }
}

export function formatDateTime(iso: string | null | undefined, intlLocale: string, timeZone: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  try {
    return new Intl.DateTimeFormat(intlLocale, { dateStyle: "long", timeStyle: "short", timeZone, timeZoneName: "short" }).format(d);
  } catch (_e) {
    return d.toISOString();
  }
}

// HTML deja echappe -> URL https cliquables. Ponctuation finale exclue.
export function linkify(escaped: string): string {
  return escaped.replace(/https:\/\/[^\s<>"']*[^\s<>"'.,;:)]/g, (url) => '<a href="' + url + '" style="color:#0b5cad;text-decoration:underline">' + url + "</a>");
}
