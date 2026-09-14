// Libelles EXACTS des cases du checkout (i18n/parts/checkout.<locale>.json,
// cle checkout_consent.*), recopies pour que l e-mail de confirmation restitue
// mot pour mot le consentement donne. Genere depuis les dictionnaires ; toute
// divergence fait echouer tests/transactional-emails.test.js. Apres une
// modification des cases du checkout, mettre ce fichier a jour a l identique.
// {terms} et {privacy} = liens vers les CGV et la politique de confidentialite.

import type { LocaleId } from "./types.ts";

export type ConsentWording = {
  terms_label: string;
  terms_label_recurring: string;
  terms_link: string;
  privacy_link: string;
  waiver_eu: string;
  waiver_uk: string;
  waiver_za: string;
  info_mx: string;
};

export const CONSENT_WORDING: Record<LocaleId, ConsentWording> = {
  "fr": {
    "terms_label": "J’ai lu et j’accepte les {terms} et j’ai pris connaissance de la {privacy}.",
    "terms_label_recurring": "J’ai lu et j’accepte les {terms}, j’ai pris connaissance de la {privacy} et je consens expressément au prélèvement automatique récurrent de l’offre choisie, au montant et à la fréquence indiqués avant le paiement, jusqu’à ma résiliation.",
    "terms_link": "Conditions générales de vente",
    "privacy_link": "Politique de confidentialité",
    "waiver_eu": "Je demande que mon abonnement commence immédiatement, avant la fin du délai de rétractation de 14 jours. Je reconnais que, si je me rétracte pendant ce délai, je devrai payer un montant proportionnel au service fourni jusqu’à ma rétractation.",
    "waiver_uk": "Je demande que mon abonnement commence immédiatement et je reconnais perdre mon droit d’annulation de 14 jours dès que j’accède au contenu numérique. Si la loi traite une partie de l’abonnement comme un service et que j’annule dans les 14 jours, je paierai un montant proportionnel à ce qui a été fourni.",
    "waiver_za": "J’accepte que mon abonnement commence immédiatement, avant la fin du délai de réflexion de 7 jours, et je comprends que ce délai de réflexion prévu par l’ECT Act ne s’applique alors plus.",
    "info_mx": "Vous pouvez annuler votre abonnement à tout moment et immédiatement depuis votre compte. Rien de ce qui est accepté ici ne limite vos droits prévus par la Ley Federal de Protección al Consumidor."
  },
  "en": {
    "terms_label": "I have read and accept the {terms} and I have read the {privacy}.",
    "terms_label_recurring": "I have read and accept the {terms}, I have read the {privacy}, and I expressly consent to the automatic recurring charge for the plan I choose, at the amount and frequency shown before payment, until I cancel.",
    "terms_link": "Terms and Conditions",
    "privacy_link": "Privacy Policy",
    "waiver_eu": "I ask for my subscription to start immediately, before the end of the 14-day withdrawal period. I acknowledge that if I withdraw during that period, I will pay an amount proportionate to the service provided up to my withdrawal.",
    "waiver_uk": "I ask for my subscription to start immediately and I acknowledge that I lose my 14-day right to cancel once I get access to the digital content. If the law treats any part of the subscription as a service and I cancel within 14 days, I will pay a proportionate amount for what has been supplied.",
    "waiver_za": "I consent to my subscription starting immediately, before the 7-day cooling-off period ends, and I understand that the cooling-off right under the ECT Act then no longer applies.",
    "info_mx": "You can cancel your subscription at any time, with immediate effect, from your account. Nothing accepted here limits your rights under Mexico’s Federal Consumer Protection Law (LFPC)."
  },
  "es": {
    "terms_label": "He leído y acepto las {terms} y he leído la {privacy}.",
    "terms_label_recurring": "He leído y acepto las {terms}, he leído la {privacy} y consiento expresamente el cargo automático recurrente del plan elegido, por el importe y con la periodicidad indicados antes del pago, hasta que lo cancele.",
    "terms_link": "Condiciones generales de venta",
    "privacy_link": "Política de privacidad",
    "waiver_eu": "Solicito que mi suscripción comience de inmediato, antes de que finalice el plazo de desistimiento de 14 días. Reconozco que, si desisto durante ese plazo, deberé abonar un importe proporcional al servicio prestado hasta mi desistimiento.",
    "waiver_uk": "Solicito que mi suscripción comience de inmediato y reconozco que pierdo mi derecho de cancelación de 14 días en cuanto accedo al contenido digital. Si la ley trata alguna parte de la suscripción como un servicio y cancelo en un plazo de 14 días, pagaré un importe proporcional a lo ya suministrado.",
    "waiver_za": "Acepto que mi suscripción comience de inmediato, antes de que termine el periodo de reflexión de 7 días, y entiendo que el derecho de reflexión previsto en la ECT Act deja entonces de aplicarse.",
    "info_mx": "Puedes cancelar tu suscripción en cualquier momento y con efecto inmediato desde tu cuenta. Nada de lo aceptado aquí limita tus derechos conforme a la Ley Federal de Protección al Consumidor de México."
  },
  "es-mx": {
    "terms_label": "He leído y acepto los {terms} y conozco el {privacy}.",
    "terms_label_recurring": "He leído y acepto los {terms}, conozco el {privacy} y doy mi consentimiento expreso para el cobro automático recurrente del plan elegido, con el monto y la periodicidad indicados antes de pagar, hasta que cancele.",
    "terms_link": "Términos y condiciones",
    "privacy_link": "Aviso de privacidad",
    "waiver_eu": "Solicito que mi suscripción comience de inmediato, antes de que termine el plazo de desistimiento de 14 días. Reconozco que, si desisto durante ese plazo, pagaré un monto proporcional al servicio prestado hasta mi desistimiento.",
    "waiver_uk": "Solicito que mi suscripción comience de inmediato y reconozco que pierdo mi derecho de cancelación de 14 días en cuanto accedo al contenido digital. Si la ley considera alguna parte de la suscripción como un servicio y cancelo dentro de los 14 días, pagaré un monto proporcional a lo ya proporcionado.",
    "waiver_za": "Acepto que mi suscripción comience de inmediato, antes de que termine el periodo de reflexión de 7 días, y entiendo que el derecho de reflexión previsto en la ECT Act deja entonces de aplicar.",
    "info_mx": "Puedes cancelar tu suscripción en cualquier momento y de forma inmediata desde tu cuenta. Nada de lo aceptado aquí limita tus derechos conforme a la Ley Federal de Protección al Consumidor."
  },
  "de": {
    "terms_label": "Ich habe die {terms} gelesen und akzeptiere sie; die {privacy} habe ich zur Kenntnis genommen.",
    "terms_label_recurring": "Ich habe die {terms} gelesen und akzeptiere sie, habe die {privacy} zur Kenntnis genommen und stimme ausdrücklich der automatischen wiederkehrenden Abbuchung für den gewählten Tarif in der vor der Zahlung angegebenen Höhe und Häufigkeit bis zu meiner Kündigung zu.",
    "terms_link": "Allgemeinen Verkaufsbedingungen",
    "privacy_link": "Datenschutzerklärung",
    "waiver_eu": "Ich verlange ausdrücklich, dass mein Abonnement sofort und vor Ablauf der 14-tägigen Widerrufsfrist beginnt. Mir ist bekannt, dass ich bei einem Widerruf innerhalb dieser Frist einen Betrag zahlen muss, der dem Anteil der bis zu meinem Widerruf erbrachten Leistung entspricht.",
    "waiver_uk": "Ich verlange, dass mein Abonnement sofort beginnt, und nehme zur Kenntnis, dass ich mein 14-tägiges Kündigungsrecht verliere, sobald ich Zugang zu den digitalen Inhalten erhalte. Behandelt das Gesetz einen Teil des Abonnements als Dienstleistung und kündige ich innerhalb von 14 Tagen, zahle ich einen anteiligen Betrag für das bereits Bereitgestellte.",
    "waiver_za": "Ich bin damit einverstanden, dass mein Abonnement sofort und vor Ablauf der 7-tägigen Bedenkzeit beginnt, und mir ist bewusst, dass das Rücktrittsrecht nach dem ECT Act dann nicht mehr gilt.",
    "info_mx": "Sie können Ihr Abonnement jederzeit mit sofortiger Wirkung in Ihrem Konto kündigen. Nichts, was hier akzeptiert wird, schränkt Ihre Rechte nach dem mexikanischen Verbraucherschutzgesetz (LFPC) ein."
  },
  "it": {
    "terms_label": "Ho letto e accetto le {terms} e ho preso visione dell’{privacy}.",
    "terms_label_recurring": "Ho letto e accetto le {terms}, ho preso visione dell’{privacy} e acconsento espressamente all’addebito automatico ricorrente del piano scelto, per l’importo e con la frequenza indicati prima del pagamento, fino alla disdetta.",
    "terms_link": "Condizioni generali di vendita",
    "privacy_link": "Informativa sulla privacy",
    "waiver_eu": "Chiedo che il mio abbonamento inizi immediatamente, prima della scadenza del periodo di recesso di 14 giorni. Riconosco che, se recedo durante tale periodo, dovrò pagare un importo proporzionale al servizio fornito fino al mio recesso.",
    "waiver_uk": "Chiedo che il mio abbonamento inizi immediatamente e riconosco di perdere il diritto di annullamento di 14 giorni non appena accedo al contenuto digitale. Se la legge considera una parte dell’abbonamento come un servizio e annullo entro 14 giorni, pagherò un importo proporzionale a quanto già fornito.",
    "waiver_za": "Acconsento a che il mio abbonamento inizi immediatamente, prima della fine del periodo di ripensamento di 7 giorni, e comprendo che il diritto di ripensamento previsto dall’ECT Act non si applica più.",
    "info_mx": "Puoi annullare l’abbonamento in qualsiasi momento, con effetto immediato, dal tuo account. Nulla di quanto accettato qui limita i tuoi diritti ai sensi della legge federale messicana sulla tutela dei consumatori (LFPC)."
  },
  "pt": {
    "terms_label": "Li e aceito as {terms} e tomei conhecimento da {privacy}.",
    "terms_label_recurring": "Li e aceito as {terms}, tomei conhecimento da {privacy} e consinto expressamente na cobrança automática recorrente do plano escolhido, no montante e com a periodicidade indicados antes do pagamento, até ao cancelamento.",
    "terms_link": "Condições gerais de venda",
    "privacy_link": "Política de privacidade",
    "waiver_eu": "Solicito que a minha assinatura comece imediatamente, antes do fim do prazo de livre resolução de 14 dias. Reconheço que, se exercer o direito de livre resolução durante esse prazo, terei de pagar um montante proporcional ao serviço prestado até essa data.",
    "waiver_uk": "Solicito que a minha assinatura comece imediatamente e reconheço que perco o meu direito de cancelamento de 14 dias assim que acedo ao conteúdo digital. Se a lei tratar alguma parte da assinatura como um serviço e eu cancelar no prazo de 14 dias, pagarei um montante proporcional ao que já foi fornecido.",
    "waiver_za": "Aceito que a minha assinatura comece imediatamente, antes do fim do período de reflexão de 7 dias, e compreendo que o direito de reflexão previsto no ECT Act deixa então de se aplicar.",
    "info_mx": "Pode cancelar a sua assinatura a qualquer momento, com efeito imediato, a partir da sua conta. Nada do que é aceite aqui limita os seus direitos ao abrigo da lei federal mexicana de proteção do consumidor (LFPC)."
  }
};
