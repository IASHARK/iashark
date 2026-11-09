// /go/<site>/<source> : redirection 302 vers le lien d'affiliation du site de
// paris (09/11/2026). Les adresses sont dans ./lib/go-links.mjs (un seul
// endroit a corriger si le site de paris change de domaine).
// Declaree dans netlify.toml ([[edge_functions]]). Rien n'est journalise ici :
// le clic est compte par funnel-track.js (data-track-kind="bookmaker_cta").
import { goResponse } from "./lib/go-links.mjs";

export default (request: Request) => {
  let r;
  try {
    r = goResponse(new URL(request.url).pathname);
  } catch (_e) {
    r = goResponse("/");
  }
  return new Response(null, { status: r.status, headers: r.headers });
};
