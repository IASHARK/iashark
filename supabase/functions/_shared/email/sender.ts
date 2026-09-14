// Envoi agnostique du prestataire, idempotent via public.transactional_emails
// (migration 0020). Module pur : le client base de donnees et fetch sont
// injectes (tests node sans reseau).
//
// Idempotence (un re-essai Stripe ne doit JAMAIS envoyer deux fois) :
// 1. On RESERVE la cle (insert, contrainte unique). Si la cle existe deja :
//    - sent / skipped            -> doublon, rien n'est envoye ;
//    - pending recent (<10 min)  -> un autre appel est en cours, rien envoye ;
//    - failed / missing / pending perime -> on la RECUPERE par une mise a jour
//      conditionnelle (statut + updated_at inchanges), un seul appel gagne.
// 2. Resend recoit la meme cle dans l'en-tete Idempotency-Key (fenetre de 24 h
//    cote Resend) : si un premier appel a expire cote reseau apres l'envoi
//    effectif, le re-essai renvoie la reponse d'origine sans second e-mail.
// 3. Si la base est injoignable au moment de reserver, on N'ENVOIE PAS (mieux
//    vaut un e-mail en retard, rattrape par un evenement suivant, qu'un doublon
//    sans trace).
import type { EmailConfig } from "./config.ts";
import { RESEND_API_URL } from "./config.ts";
import type { RenderedEmail } from "./document.ts";

export type EmailKind = "purchase_confirmation" | "renewal_reminder_mx" | "payment_failed";
export type EmailStatus = "pending" | "sent" | "skipped" | "failed" | "missing";

export type EmailLogRow = {
  idempotency_key: string;
  kind: EmailKind;
  status: EmailStatus;
  attempts: number;
  updated_at: string;
  provider_message_id?: string | null;
};

export type EmailLogWrite = {
  idempotency_key?: string;
  kind?: EmailKind;
  status?: EmailStatus;
  provider?: string;
  attempts?: number;
  user_id?: string | null;
  stripe_event_id?: string | null;
  stripe_event_type?: string | null;
  stripe_subscription_id?: string | null;
  stripe_invoice_id?: string | null;
  market?: string | null;
  regime?: string | null;
  locale?: string | null;
  to_email?: string | null;
  subject?: string | null;
  template_version?: string | null;
  render_data?: unknown;
  provider_message_id?: string | null;
  last_error?: string | null;
  sent_at?: string | null;
};

export type ReserveResult = { ok: true } | { ok: false; conflict: boolean; error?: string };

export type EmailLogStore = {
  get(key: string): Promise<EmailLogRow | null>;
  reserve(row: EmailLogWrite): Promise<ReserveResult>;
  reclaim(key: string, expected: { status: EmailStatus; updated_at: string }, patch: EmailLogWrite): Promise<boolean>;
  update(key: string, patch: EmailLogWrite): Promise<void>;
};

export type LogFn = (level: "info" | "warn" | "error", message: string) => void;

export type SenderDeps = {
  config: EmailConfig;
  store: EmailLogStore;
  fetch: typeof fetch;
  now: () => Date;
  log: LogFn;
};

export type OutgoingEmail = {
  idempotencyKey: string;
  kind: EmailKind;
  to: string | null;
  rendered: RenderedEmail;
  templateVersion: string;
  renderData: unknown;
  meta: {
    userId?: string | null;
    stripeEventId?: string | null;
    stripeEventType?: string | null;
    stripeSubscriptionId?: string | null;
    stripeInvoiceId?: string | null;
    market?: string | null;
    regime?: string | null;
    locale?: string | null;
  };
};

export type DeliveryStatus = "sent" | "skipped" | "failed" | "duplicate" | "in_progress" | "error" | "not_applicable";
export type DeliveryResult = { status: DeliveryStatus; key: string; kind?: EmailKind; messageId?: string | null; error?: string };

export const STALE_PENDING_MS = 10 * 60 * 1000;
export const MAX_ATTEMPTS = 10;
export const RESEND_TIMEOUT_MS = 10000;

export function maskEmail(email: string | null | undefined): string {
  if (!email || !email.includes("@")) return "(none)";
  const [local, domain] = email.split("@");
  return (local.slice(0, 1) || "*") + "***@" + domain;
}

function isValidEmail(email: string | null): email is string {
  return !!email && /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email);
}

function errorText(err: unknown): string {
  return String((err as Error)?.message || err).slice(0, 500);
}

export async function deliverEmail(email: OutgoingEmail, deps: SenderDeps): Promise<DeliveryResult> {
  const { config, store, log } = deps;
  const key = email.idempotencyKey;
  const base: EmailLogWrite = {
    kind: email.kind,
    status: "pending",
    provider: config.provider,
    user_id: email.meta.userId ?? null,
    stripe_event_id: email.meta.stripeEventId ?? null,
    stripe_event_type: email.meta.stripeEventType ?? null,
    stripe_subscription_id: email.meta.stripeSubscriptionId ?? null,
    stripe_invoice_id: email.meta.stripeInvoiceId ?? null,
    market: email.meta.market ?? null,
    regime: email.meta.regime ?? null,
    locale: email.meta.locale ?? null,
    to_email: email.to,
    subject: email.rendered.subject,
    template_version: email.templateVersion,
    render_data: email.renderData,
    last_error: null,
  };

  // 1. Reservation de la cle.
  const reserved = await store.reserve({ ...base, idempotency_key: key, attempts: 1 });
  if (!reserved.ok) {
    if (!reserved.conflict) {
      log("error", "[email] reservation impossible pour " + key + " (" + (reserved.error || "?") + ") - aucun envoi (anti-doublon).");
      return { status: "error", key, kind: email.kind, error: "reserve_failed" };
    }
    const existing = await store.get(key);
    if (!existing) return { status: "in_progress", key, kind: email.kind };
    if (existing.status === "sent" || existing.status === "skipped") {
      log("info", "[email] " + key + " deja " + existing.status + " - aucun nouvel envoi.");
      return { status: "duplicate", key, kind: email.kind, messageId: existing.provider_message_id ?? null };
    }
    const age = deps.now().getTime() - new Date(existing.updated_at).getTime();
    if (existing.status === "pending" && age < STALE_PENDING_MS) {
      return { status: "in_progress", key, kind: email.kind };
    }
    if (existing.attempts >= MAX_ATTEMPTS) {
      log("error", "[email] " + key + " abandonne apres " + existing.attempts + " tentatives.");
      return { status: "failed", key, kind: email.kind, error: "max_attempts" };
    }
    const won = await store.reclaim(key, { status: existing.status, updated_at: existing.updated_at }, { ...base, attempts: existing.attempts + 1 });
    if (!won) return { status: "in_progress", key, kind: email.kind };
  }

  const finish = async (patch: EmailLogWrite): Promise<void> => {
    try {
      await store.update(key, patch);
    } catch (err) {
      log("error", "[email] mise a jour du journal impossible pour " + key + ": " + errorText(err));
    }
  };

  // 2. Destinataire.
  if (!isValidEmail(email.to)) {
    await finish({ status: "failed", last_error: "no_valid_recipient" });
    log("error", "[email] " + key + " sans adresse destinataire valide.");
    return { status: "failed", key, kind: email.kind, error: "no_valid_recipient" };
  }

  // 3. Prestataire desactive : on journalise ce qui AURAIT ete envoye.
  if (config.provider !== "resend") {
    log("info", "[email] EMAIL_PROVIDER=disabled - NON envoye : kind=" + email.kind + " key=" + key + " to=" + maskEmail(email.to) +
      " locale=" + (email.meta.locale || "?") + " subject=\"" + email.rendered.subject + "\" (" + email.rendered.text.length + " caracteres texte).");
    await finish({ status: "skipped", last_error: "provider_disabled" });
    return { status: "skipped", key, kind: email.kind };
  }

  if (!config.resendApiKey || !config.from) {
    await finish({ status: "failed", last_error: "email_misconfigured:" + config.problems.join(",") });
    log("error", "[email] EMAIL_PROVIDER=resend mais configuration incomplete (" + config.problems.join(",") + ").");
    return { status: "failed", key, kind: email.kind, error: "email_misconfigured" };
  }

  // 4. Envoi Resend (POST https://api.resend.com/emails).
  try {
    const init: RequestInit = {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + config.resendApiKey,
        "Content-Type": "application/json",
        "Idempotency-Key": key.slice(0, 256),
      },
      body: JSON.stringify({
        from: config.from,
        to: [email.to],
        subject: email.rendered.subject,
        html: email.rendered.html,
        text: email.rendered.text,
        reply_to: config.replyTo,
        tags: [{ name: "category", value: email.kind }],
      }),
    };
    if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function") init.signal = AbortSignal.timeout(RESEND_TIMEOUT_MS);
    const res = await deps.fetch(RESEND_API_URL, init);
    const bodyText = await res.text().catch(() => "");
    if (!res.ok) {
      const err = "resend_http_" + res.status + ":" + bodyText.slice(0, 300);
      await finish({ status: "failed", last_error: err });
      log("error", "[email] Resend a refuse " + key + " (HTTP " + res.status + ").");
      return { status: "failed", key, kind: email.kind, error: err };
    }
    let messageId: string | null = null;
    try { messageId = (JSON.parse(bodyText) as { id?: string }).id || null; } catch (_e) { /* corps inattendu */ }
    await finish({ status: "sent", provider_message_id: messageId, sent_at: deps.now().toISOString(), last_error: null });
    log("info", "[email] envoye " + key + " to=" + maskEmail(email.to) + " id=" + (messageId || "?"));
    return { status: "sent", key, kind: email.kind, messageId };
  } catch (err) {
    const msg = "resend_network:" + errorText(err);
    await finish({ status: "failed", last_error: msg });
    log("error", "[email] echec reseau Resend pour " + key + ": " + errorText(err));
    return { status: "failed", key, kind: email.kind, error: msg };
  }
}
