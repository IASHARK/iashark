// Formats francais partages par toutes les pages.
const nf = new Intl.NumberFormat("fr-FR");

export function fmtInt(n) {
  const v = Number(n);
  return Number.isFinite(v) ? nf.format(Math.round(v)) : "—";
}

export function fmtPct(n, digits = 0) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "—";
  return v.toLocaleString("fr-FR", { minimumFractionDigits: digits, maximumFractionDigits: digits }) + " %";
}

const CURRENCY_SYMBOL = { EUR: "€", GBP: "£", USD: "$", ZAR: "R", MXN: "MX$" };

export function fmtMoney(amount, currency = "EUR") {
  const v = Number(amount);
  if (!Number.isFinite(v)) return "—";
  const s = v.toLocaleString("fr-FR", { minimumFractionDigits: v % 1 ? 2 : 0, maximumFractionDigits: 2 });
  const cur = String(currency || "EUR").toUpperCase();
  return cur === "EUR" ? s + " €" : (CURRENCY_SYMBOL[cur] || cur + " ") + s;
}

// Sommes par devise -> "19,95 € + £14.99" (chaque devise reste separee :
// jamais de conversion approximative).
export function fmtMoneyMap(map) {
  const entries = Object.entries(map || {}).filter(([, v]) => Number(v) > 0);
  if (!entries.length) return "0 €";
  return entries.map(([c, v]) => fmtMoney(v, c)).join(" + ");
}

// Ecart en % par rapport a une reference. null si pas comparable.
export function deltaPct(current, previous) {
  const c = Number(current);
  const p = Number(previous);
  if (!Number.isFinite(c) || !Number.isFinite(p) || p === 0) return null;
  return ((c - p) / p) * 100;
}

export function fmtTime(iso) {
  try {
    return new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "—";
  }
}

export function fmtDate(iso) {
  try {
    return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
  } catch {
    return "—";
  }
}

// Date locale AAAA-MM-JJ (fuseau du navigateur, comme admin.html).
export function dayStr(d) {
  const x = d instanceof Date ? d : new Date();
  return x.getFullYear() + "-" + String(x.getMonth() + 1).padStart(2, "0") + "-" + String(x.getDate()).padStart(2, "0");
}

export function addDays(day, n) {
  const d = new Date(day + "T12:00:00");
  d.setDate(d.getDate() + n);
  return dayStr(d);
}
