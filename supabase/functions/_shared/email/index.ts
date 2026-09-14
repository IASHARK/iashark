// Point d'entree du module e-mails transactionnels (voir EMAILS.md).
export { readEmailConfig, missingCompanyFields, RESEND_API_URL } from "./config.ts";
export type { EmailConfig, CompanyIdentity } from "./config.ts";
export { supabaseEmailLogStore, EMAIL_LOG_TABLE } from "./store.ts";
export { deliverEmail, maskEmail } from "./sender.ts";
export type { DeliveryResult, EmailLogStore } from "./sender.ts";
export { handleStripeEventEmails, planEmailsForEvent, purchaseKey, reminderKey, paymentFailedKey } from "./stripe-events.ts";
export type { StripeEventLike, StripeEmailDeps } from "./stripe-events.ts";
export { TEMPLATE_VERSION } from "./templates/index.ts";
