// Transactional emails — English. Withdrawal/cancellation clauses taken from
// legal/en/cgv.html (EU, art. 8-9), legal/gb/cgv.html (UK, s7-8) and
// legal/za/cgv.html (South Africa, s7-8), version 13/09/2026.
// STATUS: REVIEW (lawyer validation pending, see EMAILS.md).
import type { EmailStrings } from "../types.ts";

export const en: EmailStrings = {
  locale: "en",
  htmlLang: "en",
  common: {
    greeting: "Hello,",
    signature: "The IASHARK team",
    autoNotice: "This email was sent automatically following an operation on your subscription. For any question or complaint: {email}.",
    placeholder: "[to be completed]",
    companyTitle: "Supplier information",
    company: {
      tradingName: "Trading name",
      legalStatus: "Legal status",
      operatorName: "Operator",
      address: "Address",
      registration: "Registration number (SIREN / SIRET)",
      vat: "VAT",
      phone: "Telephone",
      email: "Email",
      mediator: "Consumer mediator / ADR",
    },
    helplineTitle: "Safer gambling",
    helplineText: "IASHARK is not a bookmaker: no bets are taken and no winnings are guaranteed. Gambling can cause harm. 18+ only. Free support:",
    accountLabel: "My account",
    periodMonth: "monthly (every month)",
    periodYear: "annual (every year)",
    periodMonths: "every {n} months",
    periodYears: "every {n} years",
  },
  purchase: {
    subject: "Your {plan} subscription is confirmed",
    title: "Subscription confirmation",
    intro: "Thank you for subscribing. This email confirms your contract on a durable medium: please keep it for your records.",
    orderTitle: "Summary",
    plan: "Plan",
    amountPaid: "Total amount paid",
    recurringPrice: "Subscription price",
    billingPeriod: "Billing frequency",
    startDate: "Subscription date",
    nextRenewal: "Next renewal",
    account: "Account",
    renewalTerms: "Your subscription has no minimum term and renews automatically at the end of each billing period, at the price then in force, until you cancel it. We will tell you about any price change before it applies, and you can cancel before then.",
    cancelTitle: "Cancelling your subscription",
    cancelTerms: "You can cancel at any time, free of charge, online from “My account” ({accountUrl}) or by emailing {email}. Cancellation takes effect at the end of the current billing period: you keep access until then and you will not be charged again.",
    consentTitle: "Your consent at checkout",
    consentIntro: "Before paying, you ticked the following boxes:",
    consentInfoShown: "The following information was also shown to you:",
    consentRecordedAt: "Consent recorded on {date} (terms version: {version}; language: {locale}).",
    consentNotRecorded: "No consent is recorded for this subscription in our payment records. Please contact us at {email} if you think this is a mistake.",
    termsTitle: "Terms and conditions",
    termsText: "Terms that apply to your subscription (version of {version}): {termsUrl}",
  },
  reminder: {
    subject: "Your IASHARK subscription renews on {date}",
    title: "Upcoming automatic renewal",
    intro: "Your {plan} subscription will renew automatically on {date}.",
    amount: "Amount to be charged",
    date: "Charge date",
    period: "Billing frequency",
    cancelText: "You can cancel immediately and without penalty from your account: {accountUrl}",
    noCharge: "If you cancel before that date, you will not be charged again.",
    legalNote: "Advance notice of automatic renewal (Mexican Federal Consumer Protection Law, art. 76 Bis).",
  },
  paymentFailed: {
    subject: "Payment failed for your IASHARK subscription",
    title: "Your subscription payment did not go through",
    intro: "The payment of {amount} to renew your {plan} subscription did not go through.",
    retryText: "Our payment provider may retry the payment automatically.",
    graceText: "Your paid access continues for {days} days after the end of the paid period. If payment is still not made, your account will return to the free plan, on {date} at the earliest.",
    updateText: "To update your payment method or manage your subscription: {accountUrl}",
  },
  withdrawal: {
    eu: {
      title: "Right of withdrawal",
      intro: [
        "You have 14 days from subscribing ({startDate}) to withdraw without giving a reason (French Consumer Code, art. L221-18).",
      ],
      waiverGiven: "At checkout you expressly asked for your subscription to start immediately (art. L221-25). This request does not remove your right of withdrawal: if you withdraw within that period, we refund you within 14 days of your request, less an amount proportionate to the service provided until you informed us, calculated pro rata to the access period within the paid period.",
      waiverMissing: "No express request for immediate start is recorded for this subscription: if you withdraw within that period, nothing is owed and we refund you in full within 14 days of your request.",
      howTo: [
        "To withdraw, send us an unequivocal statement by email to {email} before the deadline, for example using the model below. You will be refunded using the same means of payment as for your subscription.",
      ],
      formTitle: "Model withdrawal form",
      formLines: [
        "To IASHARK, {email}:",
        "I hereby give notice that I withdraw from the contract for the {plan} subscription taken out on [date], in the name of [name], account email address: [email].",
        "Date and signature (if sent on paper).",
      ],
    },
    uk: {
      title: "Your right to cancel within 14 days",
      intro: [
        "You may cancel within 14 days of subscribing ({startDate}) without giving a reason (Consumer Contracts Regulations 2013).",
      ],
      waiverGiven: "At checkout you asked for your subscription to start immediately and acknowledged that you lose the right to cancel once you get access to the digital content (reg. 37). If any part of the subscription is treated as a service and you cancel within 14 days, you pay a proportionate amount for what was supplied until you told us (reg. 36) and we refund the rest within 14 days. Your rights under the Consumer Rights Act 2015 are not affected.",
      waiverMissing: "No request for immediate start is recorded for this subscription: if you cancel within 14 days, you bear no cost and we refund you in full within 14 days.",
      howTo: [
        "How to cancel: email {email} with a clear statement that you are cancelling, before the 14 days end. You can use the model form below, but you do not have to. We will refund you without undue delay and no later than 14 days after we are told of your decision, using the payment method you used.",
      ],
      formTitle: "Model cancellation form",
      formLines: [
        "To: IASHARK, {email}",
        "I hereby give notice that I cancel my contract for the supply of the following service: IASHARK subscription {plan}.",
        "Ordered on: [date]",
        "Name: [name]",
        "Account email address: [email]",
        "Signature (only if this form is sent on paper) and date.",
      ],
    },
    za: {
      title: "Cooling-off period (ECT Act)",
      intro: [
        "Under section 44 of the Electronic Communications and Transactions Act 25 of 2002 (ECT Act), you may normally cancel an electronic transaction within 7 days without reason or penalty.",
      ],
      waiverGiven: "At checkout you consented to your subscription starting immediately, before the end of the 7-day cooling-off period (subscription date: {startDate}). Under section 42(2)(d) of the ECT Act, the cooling-off right no longer applies once the service has begun. If the information required by section 43(1) was not provided to you, you may cancel within 14 days of receiving the service (s43(3)).",
      waiverMissing: "No consent to immediate start is recorded for this subscription: you may cancel within 7 days of {startDate} without reason or penalty, and we will refund your payment within 30 days of cancellation (s44).",
      howTo: [
        "If you subscribed as a result of direct marketing, you may also cancel within 5 business days after the agreement was concluded, under section 16 of the Consumer Protection Act 68 of 2008.",
        "How to cancel: send a written notice by email to {email} stating that you are cancelling, with your account email address and the date of your subscription. You can also stop your subscription at any time from your account ({accountUrl}), effective at the end of the paid period.",
        "If you are not satisfied with how we handle a complaint, you may contact the National Consumer Commission (thencc.org.za, 012 065 1940).",
      ],
    },
  },
};
