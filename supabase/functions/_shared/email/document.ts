// Mini modele de document : un meme contenu produit la version texte brut ET
// la version HTML (aucune information presente dans l'une et absente de
// l'autre). HTML simple et accessible : lang, titre, titres hierarchises,
// tableaux avec en-tetes de ligne, contraste eleve, aucune image, aucun
// script, aucun pixel de suivi. Module pur.

import { escapeHtml, linkify } from "./format.ts";

export type Block =
  | { kind: "h1"; text: string }
  | { kind: "h2"; text: string }
  | { kind: "p"; text: string }
  | { kind: "rows"; rows: Array<[string, string]> }
  | { kind: "quote"; items: string[] }
  | { kind: "form"; title: string; lines: string[] }
  | { kind: "small"; text: string };

export type RenderedEmail = { subject: string; text: string; html: string };

export function renderText(blocks: Block[]): string {
  const out: string[] = [];
  for (const b of blocks) {
    switch (b.kind) {
      case "h1":
        out.push(b.text, "=".repeat(Math.min(b.text.length, 60)), "");
        break;
      case "h2":
        out.push(b.text, "-".repeat(Math.min(b.text.length, 60)), "");
        break;
      case "p":
      case "small":
        out.push(b.text, "");
        break;
      case "rows":
        for (const [k, v] of b.rows) out.push(k + " : " + v);
        out.push("");
        break;
      case "quote":
        for (const item of b.items) out.push("  [x] " + item);
        out.push("");
        break;
      case "form":
        out.push("  " + b.title);
        for (const line of b.lines) out.push("  | " + line);
        out.push("");
        break;
    }
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
}

const P = 'style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#1a1a1a"';

export function renderHtml(lang: string, subject: string, blocks: Block[]): string {
  const body: string[] = [];
  for (const b of blocks) {
    switch (b.kind) {
      case "h1":
        body.push('<h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;color:#0a0a0a">' + escapeHtml(b.text) + "</h1>");
        break;
      case "h2":
        body.push('<h2 style="margin:24px 0 10px;font-size:17px;line-height:1.35;color:#0a0a0a">' + escapeHtml(b.text) + "</h2>");
        break;
      case "p":
        body.push("<p " + P + ">" + linkify(escapeHtml(b.text)) + "</p>");
        break;
      case "small":
        body.push('<p style="margin:0 0 12px;font-size:13px;line-height:1.55;color:#3d3d3d">' + linkify(escapeHtml(b.text)) + "</p>");
        break;
      case "rows":
        body.push('<table role="table" style="border-collapse:collapse;width:100%;margin:0 0 16px;font-size:15px">' +
          b.rows.map(([k, v]) =>
            '<tr><th scope="row" style="text-align:left;vertical-align:top;padding:6px 12px 6px 0;color:#3d3d3d;font-weight:600;border-bottom:1px solid #e2e2e2">' +
            escapeHtml(k) + '</th><td style="padding:6px 0;color:#1a1a1a;border-bottom:1px solid #e2e2e2">' + linkify(escapeHtml(v)) + "</td></tr>"
          ).join("") + "</table>");
        break;
      case "quote":
        body.push('<ul style="margin:0 0 16px;padding:0 0 0 20px;font-size:15px;line-height:1.6;color:#1a1a1a">' +
          b.items.map((i) => '<li style="margin:0 0 8px">' + linkify(escapeHtml(i)) + "</li>").join("") + "</ul>");
        break;
      case "form":
        body.push('<div style="margin:0 0 16px;padding:12px 14px;border:1px solid #bdbdbd;border-radius:6px;font-size:14px;line-height:1.6;color:#1a1a1a">' +
          '<p style="margin:0 0 8px;font-weight:700">' + escapeHtml(b.title) + "</p>" +
          b.lines.map((l) => '<p style="margin:0 0 6px">' + linkify(escapeHtml(l)) + "</p>").join("") + "</div>");
        break;
    }
  }
  return "<!doctype html>\n<html lang=\"" + escapeHtml(lang) + "\">\n<head>\n<meta charset=\"utf-8\">\n" +
    "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">\n<title>" + escapeHtml(subject) + "</title>\n</head>\n" +
    '<body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,Helvetica,sans-serif">\n' +
    '<div role="article" aria-label="' + escapeHtml(subject) + '" lang="' + escapeHtml(lang) + '" style="max-width:600px;margin:0 auto;padding:24px 20px;background:#ffffff">\n' +
    body.join("\n") + "\n</div>\n</body>\n</html>\n";
}

export function renderEmail(lang: string, subject: string, blocks: Block[]): RenderedEmail {
  return { subject, text: renderText(blocks), html: renderHtml(lang, subject, blocks) };
}
