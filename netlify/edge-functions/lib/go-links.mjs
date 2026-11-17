// Liens d'affiliation (09/11/2026, demande de Clement) : UN SEUL endroit pour
// toutes les adresses des sites de paris. Le site, X et Telegram pointent vers
// /go/<site>/<source> ; si le site de paris change son domaine (1win le fait,
// FAQ 1win Partners n° 7), on corrige ici et nulle part ailleurs.
//
// Sources : site (boutons des pages match), x, telegram. Une source inconnue
// retombe sur « site ». Un site inconnu renvoie vers l'accueil IASHARK.

// Vavada (10/11/2026, Clement) : partenaire mis en avant a la place de 1win. Un seul
// lien de parrainage pour l'instant (espace vavadapart, Media > Links, RevShare 50 %) ;
// des liens separes par source viendront de la manager.
const VAVADA = "https://standarttrack.com/?promo=e5c4d13e-1395-4bcc-af9b-194be7ff5af2&target=register";

// Lolly Bet (11/11/2026, Clement) : compte partenaire 1258, une campagne par source
// (espace affiliates.lolly-bet888.com > Campaigns), pour savoir d'ou viennent les joueurs.
const LOLLY = "https://www.lolly-bet888.com?faff=1258&sub=";

export const GO_LINKS = {
  lolly: { site: LOLLY + "site", x: LOLLY + "x", telegram: LOLLY + "telegram" },
  vavada: { site: VAVADA, x: VAVADA, telegram: VAVADA },
  // 1win retire le 10/11/2026 (Clement : « enleve 1win de partout ») : les anciens
  // liens /go/1win/... des posts X et Telegram menaient chez Vavada, et chez Lolly Bet
  // depuis le 11/11/2026 (Clement : « on passe sur Lolly Bet partout »).
  "1win": { site: LOLLY + "site", x: LOLLY + "x", telegram: LOLLY + "telegram" },
};

export function resolveGo(pathname) {
  const parts = String(pathname || "").split("/").filter(Boolean);
  // parts[0] === "go"
  const book = (parts[1] || "").toLowerCase();
  const source = (parts[2] || "site").toLowerCase();
  const links = Object.prototype.hasOwnProperty.call(GO_LINKS, book) ? GO_LINKS[book] : null;
  if (!links) return { status: 302, location: "/" };
  const url = Object.prototype.hasOwnProperty.call(links, source) ? links[source] : links.site;
  return { status: 302, location: url };
}

export function goResponse(pathname) {
  const r = resolveGo(pathname);
  return {
    status: r.status,
    headers: {
      Location: r.location,
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex, nofollow",
      "Referrer-Policy": "no-referrer-when-downgrade",
    },
  };
}

// « Pro offert 1 mois » (17/11/2026, migration 0077) : jeton de clic porte par /go/lolly/...?c=<uuid>.
// Seuls les liens Lolly Bet le lisent ; tout ce qui n'est pas un uuid est ignore.
// Adresse et cle PUBLIQUE de la base (les memes que app-client.js) : la fonction appelee ne fait que
// noter le premier passage d'un jeton existant.
export const MARQUER_URL = "https://ksvjraqitxouwiabecai.supabase.co/rest/v1/rpc/pro_offert_clic_marquer";
export const CLE_PUBLIQUE = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtzdmpyYXFpdHhvdXdpYWJlY2FpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI3ODcwMjMsImV4cCI6MjA4ODM2MzAyM30.Eh3qk4tATM40hoYxdErAllLEo1y8KNt4BSCET_fAgT8";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function jetonClic(pathname, c) {
  const parts = String(pathname || "").split("/").filter(Boolean);
  if ((parts[1] || "").toLowerCase() !== "lolly") return null;
  const j = String(c == null ? "" : c).trim().toLowerCase();
  return UUID.test(j) ? j : null;
}

// Comptage de chaque clic vers un site de paris (17/11/2026, Clement : « compte tout ») : une ligne
// « click » dans funnel_events par passage sur /go/<site>/<source>, d'ou qu'il vienne (site, X,
// Telegram, e-mail). Les apercus de liens et les robots (X, Telegram, Google...) sont marques
// bot:true pour ne pas gonfler le chiffre. Aucune donnee personnelle : ni adresse IP, ni compte.
export const SUIVI_URL = "https://ksvjraqitxouwiabecai.supabase.co/rest/v1/funnel_events";
const ROBOT = /bot|crawl|spider|slurp|preview|facebookexternalhit|whatsapp|telegram|discord|slack|curl|wget|python|headless|lighthouse|inspectiontool|feedfetcher|go-http|okhttp|axios|node-fetch|undici/i;
const SOURCES_SUIVIES = { site: 1, x: 1, telegram: 1, email: 1 };

export function evenementClic(pathname, userAgent) {
  const parts = String(pathname || "").split("/").filter(Boolean);
  const book = (parts[1] || "").toLowerCase();
  if (!Object.prototype.hasOwnProperty.call(GO_LINKS, book)) return null;
  const s = (parts[2] || "site").toLowerCase();
  const source = Object.prototype.hasOwnProperty.call(SOURCES_SUIVIES, s) ? s : "site";
  const ua = String(userAgent || "");
  const md = { kind: "go_" + book, label: "go_" + book, source };
  if (!ua || ROBOT.test(ua)) md.bot = true;
  return { event_type: "click", page: "/go/" + book + "/" + source, metadata: md };
}
