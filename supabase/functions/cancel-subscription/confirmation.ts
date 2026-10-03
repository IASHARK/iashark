// E-mail de confirmation de resiliation (30/09/2026) — module PUR (aucune
// dependance Deno/npm : reseau, horloge et variables injectes), teste par
// tests/pro-accueil.test.js, branche par index.ts.
//
// Pourquoi : article L215-1-1 du Code de la consommation (resiliation « en
// trois clics », en vigueur depuis le 1er juin 2023). Quand le consommateur
// resilie en ligne, le professionnel lui CONFIRME la reception de sa demande
// sur un support durable (un e-mail), et l'informe de la date a laquelle le
// contrat prend fin et des effets de la resiliation.
//
// Ce que dit l'e-mail : la date de la demande, la date de fin, ce qui se passe
// (acces garde jusque-la, aucun nouveau prelevement ; pendant l'essai : rien
// n'est preleve), comment revenir en arriere. Aucune promesse de gain, aucun
// chiffre de resultat, aucune relance commerciale.
//
// E-mail TRANSACTIONNEL : envoye meme sans consentement marketing.
// RESEND_API_KEY ou EMAIL_FROM absent = rien n'est envoye, et la reponse de
// cancel-subscription le dit (email_sent: false) : jamais « un e-mail t'a ete
// envoye » quand ce n'est pas vrai.

export type GetEnv = (name: string) => string | undefined | null;
export type Logger = { info: (m: string) => void; warn: (m: string) => void; error: (m: string) => void };
export type SendDeps = { env: GetEnv; fetch: typeof fetch; log: Logger };
export type CancellationInput = {
  email: string;
  locale?: string | null;
  market?: string | null;
  requestedAt: string; // heure de la demande (ISO)
  endsAt: string | null; // fin du contrat (ISO)
  trial: boolean; // resiliation pendant l'essai gratuit
};

export const RESEND_API_URL = "https://api.resend.com/emails";

const MARKET_LOCALE: Record<string, string> = { fr: "fr", gb: "en", za: "en", us: "en", mx: "es-mx" };
const LOCALE_INTL: Record<string, string> = { fr: "fr-FR", en: "en-GB", es: "es-ES", "es-mx": "es-MX", de: "de-DE", it: "it-IT", pt: "pt-PT" };
const LOCALE_DIR: Record<string, string> = { fr: "fr", en: "en", es: "es", "es-mx": "mx", de: "en", it: "en", pt: "en" };
const MARKET_TIMEZONE: Record<string, string> = {
  fr: "Europe/Paris", gb: "Europe/London", za: "Africa/Johannesburg", mx: "America/Mexico_City", us: "America/New_York",
};

type Texts = {
  subject: string; hello: string; received: string; endsPaid: string; endsTrial: string;
  undo: string; keep: string; button: string; legal: string; footer: string;
};
export const TEXTS: Record<string, Texts> = {
  fr: {
    subject: "Ta résiliation IASHARK Pro est bien enregistrée",
    hello: "Bonjour,",
    received: "Nous avons bien reçu ta demande de résiliation le {requested}.",
    endsPaid: "Ton abonnement IASHARK Pro prend fin le {date}. Tu gardes l'accès Pro jusqu'à cette date. Aucun nouveau prélèvement ne sera fait.",
    endsTrial: "Ton essai gratuit de IASHARK Pro prend fin le {date}. Tu gardes l'accès Pro jusqu'à cette date. Rien ne sera prélevé.",
    undo: "Tu as changé d'avis ? Tu peux reprendre avant cette date, en 1 clic, dans ton compte, rubrique Abonnement.",
    keep: "Garde cet e-mail : il confirme ta résiliation.",
    button: "Voir mon abonnement",
    legal: "Confirmation envoyée en application de l'article L215-1-1 du Code de la consommation.",
    footer: "Cet e-mail concerne ton abonnement : il est envoyé même si tu ne reçois pas nos autres e-mails.",
  },
  en: {
    subject: "Your IASHARK Pro cancellation is confirmed",
    hello: "Hello,",
    received: "We received your cancellation request on {requested}.",
    endsPaid: "Your IASHARK Pro subscription ends on {date}. You keep Pro access until then. You will not be charged again.",
    endsTrial: "Your free IASHARK Pro trial ends on {date}. You keep Pro access until then. Nothing will be charged.",
    undo: "Changed your mind? You can resume before that date in 1 click, in your account, under Subscription.",
    keep: "Keep this email: it confirms your cancellation.",
    button: "View my subscription",
    legal: "Confirmation sent under Article L215-1-1 of the French Consumer Code.",
    footer: "This email concerns your subscription, so it's sent even if you don't receive our other emails.",
  },
  es: {
    subject: "Tu cancelación de IASHARK Pro está registrada",
    hello: "Hola:",
    received: "Hemos recibido tu solicitud de cancelación el {requested}.",
    endsPaid: "Tu suscripción a IASHARK Pro termina el {date}. Conservas el acceso Pro hasta esa fecha. No se hará ningún cobro más.",
    endsTrial: "Tu prueba gratuita de IASHARK Pro termina el {date}. Conservas el acceso Pro hasta esa fecha. No se cobrará nada.",
    undo: "¿Has cambiado de opinión? Puedes reanudarla antes de esa fecha, en 1 clic, en tu cuenta, apartado Suscripción.",
    keep: "Guarda este correo: confirma tu cancelación.",
    button: "Ver mi suscripción",
    legal: "Confirmación enviada conforme al artículo L215-1-1 del Código de Consumo francés.",
    footer: "Este correo se refiere a tu suscripción: se envía aunque no recibas nuestros otros correos.",
  },
  "es-mx": {
    subject: "Tu cancelación de IASHARK Pro quedó registrada",
    hello: "Hola:",
    received: "Recibimos tu solicitud de cancelación el {requested}.",
    endsPaid: "Tu suscripción a IASHARK Pro termina el {date}. Conservas el acceso Pro hasta esa fecha. No se hará ningún cargo más.",
    endsTrial: "Tu prueba gratis de IASHARK Pro termina el {date}. Conservas el acceso Pro hasta esa fecha. No se hará ningún cargo.",
    undo: "¿Cambiaste de opinión? Puedes reactivarla antes de esa fecha, en 1 clic, en tu cuenta, sección Suscripción.",
    keep: "Guarda este correo: confirma tu cancelación.",
    button: "Ver mi suscripción",
    legal: "Confirmación enviada conforme al artículo L215-1-1 del Código de Consumo de Francia.",
    footer: "Este correo tiene que ver con tu suscripción: se envía aunque no recibas nuestros otros correos.",
  },
  de: {
    subject: "Deine Kündigung von IASHARK Pro ist bestätigt",
    hello: "Hallo,",
    received: "Wir haben deine Kündigung am {requested} erhalten.",
    endsPaid: "Dein IASHARK-Pro-Abo endet am {date}. Bis dahin behältst du den Pro-Zugang. Es wird nichts mehr abgebucht.",
    endsTrial: "Dein kostenloser IASHARK-Pro-Test endet am {date}. Bis dahin behältst du den Pro-Zugang. Es wird nichts abgebucht.",
    undo: "Du hast es dir anders überlegt? Du kannst vor diesem Datum mit 1 Klick weitermachen, in deinem Konto unter Abonnement.",
    keep: "Bewahre diese E-Mail auf: Sie bestätigt deine Kündigung.",
    button: "Mein Abo ansehen",
    legal: "Bestätigung gemäß Artikel L215-1-1 des französischen Verbrauchergesetzbuchs.",
    footer: "Diese E-Mail betrifft dein Abo und wird auch gesendet, wenn du unsere anderen E-Mails nicht erhältst.",
  },
  it: {
    subject: "La tua disdetta di IASHARK Pro è registrata",
    hello: "Ciao,",
    received: "Abbiamo ricevuto la tua richiesta di disdetta il {requested}.",
    endsPaid: "Il tuo abbonamento IASHARK Pro termina il {date}. Mantieni l'accesso Pro fino a quella data. Non verrà fatto nessun altro addebito.",
    endsTrial: "La tua prova gratuita di IASHARK Pro termina il {date}. Mantieni l'accesso Pro fino a quella data. Non verrà addebitato nulla.",
    undo: "Hai cambiato idea? Puoi riprendere prima di quella data, con 1 clic, nel tuo account, sezione Abbonamento.",
    keep: "Conserva questa e-mail: conferma la tua disdetta.",
    button: "Vedi il mio abbonamento",
    legal: "Conferma inviata ai sensi dell'articolo L215-1-1 del Codice del consumo francese.",
    footer: "Questa e-mail riguarda il tuo abbonamento: viene inviata anche se non ricevi le nostre altre e-mail.",
  },
  pt: {
    subject: "O cancelamento do teu IASHARK Pro está registado",
    hello: "Olá,",
    received: "Recebemos o teu pedido de cancelamento a {requested}.",
    endsPaid: "A tua assinatura IASHARK Pro termina a {date}. Manténs o acesso Pro até essa data. Não será feita mais nenhuma cobrança.",
    endsTrial: "O teu teste gratuito do IASHARK Pro termina a {date}. Manténs o acesso Pro até essa data. Nada será cobrado.",
    undo: "Mudaste de ideias? Podes retomar antes dessa data, em 1 clique, na tua conta, secção Assinatura.",
    keep: "Guarda este e-mail: confirma o teu cancelamento.",
    button: "Ver a minha assinatura",
    legal: "Confirmação enviada nos termos do artigo L215-1-1 do Código do Consumo francês.",
    footer: "Este e-mail diz respeito à tua assinatura: é enviado mesmo que não recebas os nossos outros e-mails.",
  },
};

export function localeFor(input: { locale?: string | null; market?: string | null }): string {
  const l = String(input.locale || "").toLowerCase();
  if (l === "es" && String(input.market || "").toLowerCase() === "mx") return "es-mx";
  if (TEXTS[l]) return l;
  return MARKET_LOCALE[String(input.market || "fr").toLowerCase()] || "fr";
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}

export function renderCancellation(input: CancellationInput, siteUrl: string) {
  if (!input.endsAt || isNaN(Date.parse(input.endsAt)) || isNaN(Date.parse(input.requestedAt))) return null; // jamais une date inventee
  const locale = localeFor(input);
  const t = TEXTS[locale];
  const intl = LOCALE_INTL[locale] || "fr-FR";
  const timeZone = MARKET_TIMEZONE[String(input.market || "fr").toLowerCase()] || "Europe/Paris";
  const date = new Intl.DateTimeFormat(intl, { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone }).format(new Date(input.endsAt));
  const requested = new Intl.DateTimeFormat(intl, { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone }).format(new Date(input.requestedAt));
  const link = siteUrl.replace(/\/$/, "") + "/" + (LOCALE_DIR[locale] || "fr") + "/compte.html#abonnement";
  const lines = [
    t.hello,
    t.received.replace("{requested}", requested),
    (input.trial ? t.endsTrial : t.endsPaid).replace("{date}", date),
    t.undo,
    t.keep,
  ];
  // Mention du droit francais : seulement pour le marche francais (vendeur francais,
  // client en France). Ailleurs, l'e-mail confirme sans citer un texte etranger.
  const legal = String(input.market || "fr").toLowerCase() === "fr" ? t.legal : "";
  const text = lines.join("\n\n") + "\n\n" + t.button + " : " + link + "\n\n—\n" + (legal ? legal + "\n" : "") + t.footer;
  const html = '<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#0f172a;max-width:560px">'
    + lines.map((l) => "<p>" + esc(l) + "</p>").join("")
    + '<p><a href="' + esc(link) + '" style="display:inline-block;background:#20d5ef;color:#04141b;font-weight:700;padding:12px 20px;border-radius:10px;text-decoration:none">' + esc(t.button) + "</a></p>"
    + '<p style="font-size:12px;color:#64748b">' + (legal ? esc(legal) + "<br>" : "") + esc(t.footer) + "</p></div>";
  return { locale, subject: t.subject, text, html, link };
}

// Une demande = un e-mail : la cle d'idempotence (Resend, 24 h) porte
// l'abonnement et la minute de la demande (un double clic n'envoie qu'un
// e-mail ; une nouvelle resiliation plus tard en envoie un nouveau).
export function idempotencyKey(subscriptionId: string, requestedAt: string): string {
  return ("cancel-confirm-" + subscriptionId + "-" + String(requestedAt).slice(0, 16)).replace(/[^A-Za-z0-9_:-]/g, "-").slice(0, 200);
}

export async function sendCancellation(deps: SendDeps, input: CancellationInput & { subscriptionId: string }): Promise<{ sent: boolean; reason?: string }> {
  const apiKey = deps.env("RESEND_API_KEY");
  const from = deps.env("EMAIL_FROM");
  if (!apiKey || !from) {
    deps.log.warn("[cancel-subscription] e-mail de confirmation NON envoye : Resend pas configure.");
    return { sent: false, reason: "email_not_configured" };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(input.email || ""))) return { sent: false, reason: "no_email" };
  const mail = renderCancellation(input, deps.env("SITE_URL") || "https://iashark.com");
  if (!mail) return { sent: false, reason: "no_end_date" };
  try {
    const res = await deps.fetch(RESEND_API_URL, {
      method: "POST",
      headers: { "Authorization": "Bearer " + apiKey, "Content-Type": "application/json", "Idempotency-Key": idempotencyKey(input.subscriptionId, input.requestedAt) },
      body: JSON.stringify({ from, to: [input.email], subject: mail.subject, html: mail.html, text: mail.text, tags: [{ name: "category", value: "cancellation_confirmation" }] }),
    });
    if (!res.ok) throw new Error("resend_http_" + res.status);
    return { sent: true };
  } catch (e) {
    deps.log.error("[cancel-subscription] e-mail de confirmation en echec : " + String((e as Error).message).slice(0, 120));
    return { sent: false, reason: "send_failed" };
  }
}
