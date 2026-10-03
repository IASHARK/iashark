// Essai gratuit de 7 jours (decision du 29/09/2026, remis le 02/10/2026) — module PUR
// (aucun import Deno/npm, environnement injecte) : teste par node --test
// (tests/pro-trial.test.js et tests/pro-accueil.test.js), importe par index.ts. Meme discipline que
// pricing.ts et consent.ts.
//
// Regles :
// - 7 jours offerts, UNE fois par personne : seulement si le compte n'a
//   jamais eu d'abonnement (table subscriptions, tous statuts) ET si le client
//   Stripe relie n'a jamais eu d'abonnement ;
// - carte demandee a l'inscription (payment_method_collection "always") :
//   0 EUR aujourd'hui, premier prelevement a la fin de l'essai, au prix de la
//   duree choisie (6,99 EUR/semaine, 19,95 EUR/mois, 199 EUR/an en France) ;
// - si la carte manque a la fin de l'essai, l'abonnement s'arrete (jamais une
//   facture impayee laissee ouverte) ;
// - TRIAL_DAYS (secret Supabase) : ABSENT = 7 JOURS (essai remis le
//   02/10/2026, decision de Clement). "0" coupe l'essai sans redeploiement ;
//   borne a 1..30. Ordre de mise en route : rappel 2 jours avant la fin
//   d'abord (fonction trial-reminder + tache planifiee
//   0042_schedule_trial_reminder.sql), puis cette fonction : sans rappel, la
//   promesse « un e-mail te previent » ne serait pas tenue.
// - abonne actif, en essai ou en impaye : jamais un second abonnement ni un
//   essai (reason "already_subscribed") ; ancien abonne ou ancien essai, meme
//   annule : paiement direct, sans essai (reason "already_had_subscription").
// - ABONNEMENT MENSUEL SEULEMENT (decision de Clement du 02/10/2026, soir) :
//   la semaine et l'annee sont payees tout de suite, jamais d'essai, meme si
//   le navigateur bricole sa requete (reason "interval_not_eligible"). La
//   duree vient du Price resolu cote serveur (pricing.ts#resolvePriceId).

export type GetEnv = (name: string) => string | undefined | null;

export const TRIAL_DAYS_DEFAULT = 7;

export function trialDays(getEnv: GetEnv): number {
  const raw = getEnv("TRIAL_DAYS");
  if (raw === undefined || raw === null || String(raw).trim() === "") return TRIAL_DAYS_DEFAULT;
  const n = Number(String(raw).trim());
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(30, Math.max(1, Math.round(n)));
}

// Durees qui ont droit a l'essai : le mois, et rien d'autre.
export const TRIAL_INTERVALS = ["month"];
export function trialAllowedForInterval(interval: unknown): boolean {
  return typeof interval === "string" && TRIAL_INTERVALS.includes(interval);
}

export type TrialInput = {
  days: number;
  // Duree resolue cote serveur ("week" | "month" | "year"). Absente = refus
  // (jamais d'essai par defaut sur une duree inconnue).
  interval?: unknown;
  // Lignes de public.subscriptions du compte (tous statuts confondus).
  priorSubscriptionCount: number;
  // Le client Stripe relie a deja eu au moins un abonnement (null = inconnu).
  stripeHasHistory: boolean | null;
};

export type TrialDecision = { trial: true; days: number } | { trial: false; reason: "disabled" | "interval_not_eligible" | "already_had_subscription" | "already_subscribed" };

export function trialDecision(input: TrialInput): TrialDecision {
  if (!(input.days > 0)) return { trial: false, reason: "disabled" };
  if (!trialAllowedForInterval(input.interval)) return { trial: false, reason: "interval_not_eligible" };
  if (input.priorSubscriptionCount > 0) return { trial: false, reason: "already_had_subscription" };
  if (input.stripeHasHistory === true) return { trial: false, reason: "already_had_subscription" };
  return { trial: true, days: input.days };
}

// Abonnements qui interdisent une seconde souscription (aucun double
// paiement : changer de duree passe par le portail client).
export const LIVE_STATUSES = ["active", "trialing", "past_due"];
export function isLiveStatus(status: unknown): boolean {
  return LIVE_STATUSES.includes(String(status));
}

// Decision complete pour un compte, a partir de TOUTES ses lignes de
// public.subscriptions (statuts, lues sous RLS ; null = lecture impossible) :
// - abonnement vivant (actif, essai, impaye) : rien a vendre ("already_subscribed") ;
// - au moins une ligne passee (annulee, expiree, ancien essai) : pas d'essai ;
// - lecture impossible : pas d'essai (jamais deux essais par erreur) ;
// - semaine ou annee : pas d'essai ("interval_not_eligible") ;
// - sinon : historique Stripe (meme adresse e-mail), puis TRIAL_DAYS.
export function trialForAccount(input: { days: number; interval: unknown; statuses: string[] | null; stripeHasHistory: boolean | null }): TrialDecision {
  if (input.statuses && input.statuses.some(isLiveStatus)) return { trial: false, reason: "already_subscribed" };
  return trialDecision({
    days: input.days,
    interval: input.interval,
    priorSubscriptionCount: input.statuses ? input.statuses.length : 1,
    stripeHasHistory: input.stripeHasHistory,
  });
}

// Parametres ajoutes a la session Stripe Checkout.
export function trialSessionParams(days: number, subscriptionMetadata: Record<string, string>) {
  return {
    payment_method_collection: "always" as const,
    subscription_data: {
      trial_period_days: days,
      trial_settings: { end_behavior: { missing_payment_method: "cancel" as const } },
      metadata: { ...subscriptionMetadata, trial_days: String(days) },
    },
  };
}
