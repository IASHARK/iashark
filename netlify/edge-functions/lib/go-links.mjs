// Liens d'affiliation (09/11/2026, demande de Clement) : UN SEUL endroit pour
// toutes les adresses des sites de paris. Le site, X et Telegram pointent vers
// /go/<site>/<source> ; si le site de paris change son domaine (1win le fait,
// FAQ 1win Partners n° 7), on corrige ici et nulle part ailleurs.
//
// Sources : site (boutons des pages match), x, telegram. Une source inconnue
// retombe sur « site ». Un site inconnu renvoie vers l'accueil IASHARK.

// Vavada (10/11/2026, Clement) : partenaire mis en avant a la place de 1win. Un seul
// lien de parrainage pour l'instant (espace vavadapart, Media > Links, RevShare 50 %) ;
// des liens separes par source viendront de la manager. 1win reste ici pour que les
// anciens posts X et Telegram menent encore quelque part.
const VAVADA = "https://standarttrack.com/?promo=e5c4d13e-1395-4bcc-af9b-194be7ff5af2&target=register";

export const GO_LINKS = {
  vavada: { site: VAVADA, x: VAVADA, telegram: VAVADA },
  "1win": {
    site: "https://r1wquow.com/betting?open=register&p=xf5w",
    x: "https://r1wquow.com/betting?open=register&p=f8ja",
    telegram: "https://r1wquow.com/betting?open=register&p=exbd",
  },
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
