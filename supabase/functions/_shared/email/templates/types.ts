// Types des chaines d'e-mails. Placeholders entre accolades, remplis par
// format.ts fill() : {plan} {amount} {date} {email} {accountUrl} {termsUrl}
// {version} {locale} {startDate} {days} {n}.

export type LocaleId = "fr" | "en" | "es" | "es-mx" | "de" | "it" | "pt";
export type RegimeId = "eu" | "uk" | "za" | "mx";

export type WithdrawalStrings = {
  title: string;
  // Paragraphes toujours affiches, avant la variante de consentement.
  intro: string[];
  // Variante quand la case d'execution immediate a ete cochee (eu/uk/za).
  waiverGiven?: string;
  // Variante quand aucun consentement d'execution immediate n'est enregistre.
  waiverMissing?: string;
  // Paragraphes affiches apres la variante (comment exercer le droit...).
  howTo: string[];
  // Formulaire type (eu : C. conso. L221-13 al. 1 et annexe ; uk : CCR 2013
  // Schedule 3 part B). Absent pour za et mx (non exige).
  formTitle?: string;
  formLines?: string[];
};

export type EmailStrings = {
  locale: LocaleId;
  htmlLang: string;
  common: {
    greeting: string;
    signature: string;
    autoNotice: string;
    placeholder: string;
    companyTitle: string;
    company: {
      tradingName: string;
      legalStatus: string;
      operatorName: string;
      address: string;
      registration: string;
      vat: string;
      phone: string;
      email: string;
      mediator: string;
    };
    helplineTitle: string;
    helplineText: string;
    accountLabel: string;
    periodMonth: string;
    periodYear: string;
    periodMonths: string;
    periodYears: string;
  };
  purchase: {
    subject: string;
    title: string;
    intro: string;
    orderTitle: string;
    plan: string;
    amountPaid: string;
    recurringPrice: string;
    billingPeriod: string;
    startDate: string;
    nextRenewal: string;
    account: string;
    renewalTerms: string;
    cancelTitle: string;
    cancelTerms: string;
    consentTitle: string;
    consentIntro: string;
    consentInfoShown: string;
    consentRecordedAt: string;
    consentNotRecorded: string;
    termsTitle: string;
    termsText: string;
  };
  reminder: {
    subject: string;
    title: string;
    intro: string;
    amount: string;
    date: string;
    period: string;
    cancelText: string;
    noCharge: string;
    legalNote: string;
  };
  paymentFailed: {
    subject: string;
    title: string;
    intro: string;
    retryText: string;
    graceText: string;
    updateText: string;
  };
  withdrawal: Partial<Record<RegimeId, WithdrawalStrings>>;
};
