# legal/ — Pages légales localisées IAShark

**Statut : BROUILLON (DRAFT), aucune page n'a été validée par un juriste.** Rédaction du 13 septembre 2026.
Les pages `gb/`, `za/` et `mx/` portent en tête le commentaire HTML `<!-- DRAFT: pending review by a qualified lawyer in <pays> -->`.
Les manques factuels sont signalés par des commentaires HTML invisibles `<!-- LEGAL REVIEW: … -->` et `<!-- BLOCKED_DECISION: … -->`. Aucune valeur fictive n'a été ajoutée (pas de SIRET, d'adresse ou de numéro inventés).

## 1. Fichiers

Chaque dossier contient les 5 mêmes fichiers autonomes. Le tableau indique le `<title>` de chaque page.

| Dossier | `lang` | Cadre juridique | `mentions-legales.html` | `cgv.html` | `confidentialite.html` | `cookies.html` | `jeu-responsable.html` |
|---|---|---|---|---|---|---|---|
| `fr` | fr | Droit français / RGPD | Mentions légales | Conditions générales de vente | Politique de confidentialité | Politique cookies | Jeu responsable |
| `en` | en | Traduction FR/UE | Legal notice | Terms of sale | Privacy policy | Cookie policy | Responsible gambling |
| `es` | es | Traduction FR/UE | Aviso legal | Condiciones generales de venta | Política de privacidad | Política de cookies | Juego responsable |
| `de` | de | Traduction FR/UE | Impressum | Allgemeine Verkaufsbedingungen | Datenschutzerklärung | Cookie-Richtlinie | Verantwortungsvolles Spielen |
| `it` | it | Traduction FR/UE | Note legali | Condizioni generali di vendita | Informativa sulla privacy | Informativa sui cookie | Gioco responsabile |
| `pt` | pt (PT-PT) | Traduction FR/UE | Aviso legal | Condições gerais de venda | Política de privacidade | Política de cookies | Jogo responsável |
| `gb` | en-GB | UK GDPR, DPA 2018, PECR, CRA 2015, CCR 2013 | Legal notice | Terms of service and sale | Privacy notice | Cookie policy | Safer gambling |
| `za` | en-ZA | POPIA, CPA, ECT Act | Legal notice and supplier information | Terms of service and sale | Privacy notice (POPIA) | Cookie policy | Responsible gambling |
| `mx` | es-MX | LFPDPPP 2025, LFPC / PROFECO | Aviso legal | Términos y condiciones | Aviso de privacidad integral | Política de cookies | Juego responsable |

### Intégration (générateur de l'agent A)
- Copie prévue : `legal/<dir>/<file>.html` vers `<dir>/<file>.html`.
- Les liens entre pages légales sont relatifs (`href="cgv.html"`). Le lien vers l'accueil est `href="./"`.
- Les ressources partagées ont des chemins absolus : `/assets/bottom-navigation.css`, `/i18n/i18n.js`, `/site-prefs.js`, `/bottom-navigation.js`.
  - `i18n.js` est chargé pour que la barre de navigation et le bandeau cookies s'affichent dans la bonne langue.
- `canonical` et `og:url` pointent vers `https://iashark.com/<dir>/<file>.html`. Si la version FR reste servie à la racine, il faut ajuster ces deux balises pour `fr/`.
- Deux textes français restent visibles sur les pages non françaises. Ils ne relèvent pas de `legal/` et doivent être corrigés dans les scripts concernés :
  - `site-prefs.js` : le lien « En savoir plus » du bandeau cookies pointe vers `/confidentialite.html`, la page française à la racine.
  - `bottom-navigation.js` : l'attribut `aria-label="Navigation principale"` est codé en dur en français.

## 2. Écarts avec les pages FR d'origine (racine du dépôt)

1. **Offre mise à jour** d'après `abonnement.html` et `supabase/functions/create-checkout-session`.
   - Retiré : SAFE/VALEUR/AUDACE, Kelly et l'essai gratuit de 3 jours, qui n'existent plus (cf. doc 18 §6).
   - Conservé : Pro à 19,95 € TTC par mois sans engagement ; accès gratuit limité à 1 match par jour.
2. **Adresse de Netlify corrigée** : « 44 Montgomery Street » devient « 101 2nd Street, San Francisco, CA 94105-2239 », d'après les conditions d'utilisation de Netlify.
3. **Horaires de Joueurs Info Service corrigés** : « 24h/24 » devient « de 8h à 2h, 7j/7 ».
4. **Durée Google Analytics corrigée** : « 26 mois » (valeur de l'ancien Universal Analytics) devient « 2 ou 14 mois », les deux seules options d'une propriété GA4 standard.
5. **Données et prestataires alignés sur le code réel** :
   - données ajoutées : préférences et journal (migration 0010), événements de parcours `funnel_events` (0008), adresse IP pour limiter les tentatives de connexion (0003) ;
   - prestataires ajoutés : Google Fonts, jsDelivr, API-SPORTS ;
   - fonctionnalités mentionnées : portail de facturation Stripe, délai de grâce de 4 jours en cas d'impayé (0011), export et suppression du compte ;
   - Supabase est hébergé dans la région `eu-west-3` (Paris), vérifié via l'API du projet.
6. **Rétractation réécrite** : le paiement ne recueille pas l'accord exprès ni la renonciation au droit de rétractation, donc la page ne présente plus la renonciation comme acquise.
7. **Clause « tribunaux de Paris »** : ajout de « sous réserve des règles impératives applicables aux consommateurs ».
8. **Aucune mention d'un historique ou d'un track record public.**

## 3. Lois, régulateurs et services d'aide cités — sources de vérification (consultées le 13/09/2026)

### France / UE (`fr`, `en`, `es`, `de`, `it`, `pt`)
| Élément cité | Source |
|---|---|
| Code de la consommation L221-18 et L221-28 13° (rétractation, contenu numérique) | https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000044563170 |
| L215-1-1 (résiliation en ligne) | https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000046190107 |
| L612-1 et L616-1 (médiateur de la consommation) | https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000032224805 · https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000032224762 |
| CNIL, mesure d'audience exemptée (13 mois / 25 mois) | https://www.cnil.fr/fr/cookies-solutions-pour-les-outils-de-mesure-daudience |
| Data Privacy Framework UE–États-Unis (arrêt Latombe du 3/09/2025, pourvoi C-703/25 P pendant) | https://www.hunton.com/privacy-and-cybersecurity-law-blog/eus-general-court-confirms-adequacy-of-eu-u-s-data-privacy-framework · https://www.wilmerhale.com/en/insights/blogs/wilmerhale-privacy-and-cybersecurity-law/20251201-european-court-of-justice-to-review-challenge-to-eu-us-data-privacy-framework |
| Plateforme européenne de règlement en ligne des litiges fermée le 20/07/2025 (volontairement non citée) | https://portal-cec.consumo.gob.es/en/comunicacion/noticias/2025/european-platform-online-dispute-resolution-will-cease-be-operational-20 |
| ANJ, interdiction volontaire de jeux (3 ans minimum, en ligne) | https://anj.fr/interdiction-volontaire-de-jeux-un-nouveau-service-en-ligne-avec-une-experience-plus-fluide · https://interdictiondejeux.anj.fr |
| Joueurs Info Service, 09 74 75 13 13, de 8h à 2h, 7j/7 | https://www.joueurs-info-service.fr · https://lannuaire.service-public.gouv.fr/centres-contact/R2428 |
| Gambling Therapy (Gordon Moody), gratuit, en ligne | https://gamblingtherapy.org/about-us/what-is-gambling-therapy/ |
| Google Analytics : Google Ireland Limited ; cookies `_ga` d'une durée de 2 ans ; conservation GA4 de 2 ou 14 mois | https://marketingplatform.google.com/about/analytics/terms/gb/ · https://usercentrics.com/knowledge-hub/google-analytics-cookies/ · https://www.analyticsmania.com/post/2-month-data-in-google-analytics-4/ |
| Stripe, prestataire certifié PCI DSS niveau 1 | https://stripe.com/security |
| Adresse de Netlify, Inc. | https://www.netlify.com/legal/terms-of-use/ |

### Royaume-Uni (`gb`)
| Élément cité | Source |
|---|---|
| Consumer Rights Act 2015 (Part 1, Chapter 3 : digital content) | https://www.legislation.gov.uk/ukpga/2015/15/contents |
| Consumer Contracts Regulations 2013, reg. 37 (digital content, express consent et acknowledgement) | https://www.legislation.gov.uk/uksi/2013/3134/regulation/37 |
| Data Protection Act 2018 | https://www.legislation.gov.uk/ukpga/2018/12/contents |
| PECR 2003 (reg. 6, stockage sur le terminal) | https://www.legislation.gov.uk/uksi/2003/2426/contents |
| Data (Use and Access) Act 2025 : exemption « statistical purposes » de PECR, en vigueur le 05/02/2026, droit d'opposition requis | https://www.blakemorgan.co.uk/data-use-and-access-act-2025-cookies/ |
| Electronic Commerce Regulations 2002, reg. 6 (mentions obligatoires du prestataire) | https://www.legislation.gov.uk/uksi/2002/2013/note/data.htm?view=plain |
| ICO : plainte en ligne et helpline 0303 123 1113 | https://ico.org.uk/make-a-complaint/ · https://ico.org.uk/global/privacy-notice/how-you-can-contact-us/ |
| Adéquation UK pour l'EEE ; UK–US data bridge ; IDTA et UK Addendum | https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/international-transfers/adequacy-regulations/is-the-restricted-transfer-covered-by-adequacy-regulations/ · https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/international-transfers/adequacy-regulations/how-does-the-uk-extension-to-the-eu-us-data-privacy-framework-work/ · https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/international-transfers/appropriate-safeguards/what-are-standard-data-protection-clauses-the-uk-idta-and-the-addendum/ |
| UK GDPR art. 27 (représentant au Royaume-Uni) | https://legalvision.co.uk/data-privacy-it/uk-gdpr-article-27-representatives/ |
| Âge minimum de 18 ans (Gambling Act 2005) ; registre public de la Gambling Commission | https://www.gamblingcommission.gov.uk/guidance/guidance-to-licensing-authorities/part-16-age-restrictions · https://www.gamblingcommission.gov.uk/public-register |
| National Gambling Helpline 0808 8020 133, gratuite, 24h/24 et 7j/7, gérée par GamCare | https://www.gambleaware.org/tools-and-support/support-in-your-area/service-finder-results/gamcare-national-gambling-helpline/ · https://www.gamcare.org.uk/ |
| GAMSTOP (auto-exclusion gratuite des sites de jeu sous licence en Grande-Bretagne) | https://www.gamstop.co.uk/ |
| GambleAware : begambleaware.org redirige en 301 vers gambleaware.org ; site actif en 2026 malgré la fermeture annoncée | https://www.gambleaware.org/what-we-do/news/news-articles/gambleaware-statement-on-the-new-statutory-gambling-harms-system-and-the-future-of-the-charity/ |
| Régime des abonnements du DMCC Act 2024, application attendue au printemps 2027 (non cité dans les pages) | https://www.taylorwessing.com/en/insights-and-events/insights/2026/04/subscription-contracts |

### Afrique du Sud (`za`)
| Élément cité | Source |
|---|---|
| POPIA 4 of 2013 : s5 (droits), s11 (bases licites et opposition), s18 (information), s23 (accès), s24 (correction), s69 (marketing direct), s72 (transferts), s74 (plaintes), s99 (actions civiles) | https://www.saflii.org/za/legis/consol_act/popia4o2013399/ · https://popia.co.za/section-5-rights-of-data-subjects/ · https://popia.co.za/section-11-consent-justification-and-objection/ · https://popia.co.za/section-72-transfers-of-personal-information-outside-republic/ · https://popia.co.za/section-74-complaints/ |
| Information Regulator : portail eServices, enquiries@inforegulator.org.za, 010 023 5200, numéro gratuit 0800 017 160, adresse à Woodmead | https://inforegulator.org.za/complaints/ |
| ECT Act 25 of 2002 : s42(2) (exclusions), s43 (informations et 14 jours), s44 (7 jours, remboursement sous 30 jours), s47, s48, s49 | https://www.internet.org.za/ect_act.html |
| CPA 68 of 2008 : s14 (préavis de 20 jours ouvrables ; notice entre 80 et 40 jours ouvrables avant l'échéance ; poursuite au mois) | https://source.acts.co.za/consumer-protection-act-2008/14_expiry_and_renewal_of_fixed_term_agreements.php · https://www.thedtic.gov.za/wp-content/uploads/Consumer_Protection_Act.pdf |
| CPA s16 (5 jours ouvrables après démarchage direct, remboursement sous 15 jours ouvrables) | https://www.seesa.co.za/blog/direct-marketing-is-allowed-in-terms-of-the-consumer-protection-act-68-of-2008/ |
| National Consumer Commission : complaints@thencc.org.za, 012 065 1940 | https://thencc.org.za/contact-us/ |
| National Gambling Act 7 of 2004 (interdiction aux mineurs) | https://www.thedtic.gov.za/wp-content/uploads/National_Gambling.pdf |
| NRGP / SARGF : 0800 006 008 (24h/24), WhatsApp et SMS 076 675 0710, helpline@responsiblegambling.org.za | https://responsiblegambling.org.za/ |
| National Register of Excluded Persons (National Gambling Board) | https://www.ngb.org.za/faqs/ · https://responsiblegambling.org.za/self-exclusion-2/ |

### Mexique (`mx`)
| Élément cité | Source |
|---|---|
| LFPDPPP publiée au DOF le 20/03/2025, en vigueur le 21/03/2025, abrogeant la loi de 2010 ; autorité : Secretaría Anticorrupción y Buen Gobierno | https://www.diputados.gob.mx/LeyesBiblio/ref/lfpdppp/LFPDPPP_orig_20mar25.pdf (non consultable depuis ce poste : connexion refusée) · https://www.ey.com/es_mx/technical/tax/boletines-fiscales/nueva-ley-federal-proteccion-datos-personal-posesion-particulares · https://www.gob.mx/buengobierno |
| LFPC art. 1 (dispositions irrenunciables), art. 51 et 56 (révocation sous 5 jours ouvrables), art. 76 BIS (commerce électronique) | https://www.diputados.gob.mx/LeyesBiblio/pdf/LFPC.pdf · http://www.ordenjuridico.gob.mx/Documentos/Federal/html/wo120869.html · https://leyes-mx.com/ley_federal_de_proteccion_al_consumidor/56.htm |
| PROFECO, Teléfono del Consumidor : 800 468 8722 et 55 5568 8722 | https://www.gob.mx/profeco/prensa/profeco-cerca-de-la-poblacion-consumidora-que-requiera-presentar-quejas-y-denuncias-en-el-hot-sale · https://concilianet.profeco.gob.mx/ |
| Ley Federal de Juegos y Sorteos et son règlement (mineurs exclus ; compétence de la SEGOB) | https://www.ordenjuridico.gob.mx/Documentos/Federal/html/wo88470.html · https://www.diputados.gob.mx/LeyesBiblio/pdf/109.pdf |
| Línea de la Vida 800 911 2000 : CONASAMA / Secretaría de Salud, gratuite, 24h/24 et 365 jours par an | https://www.gob.mx/conasama/articulos/linea-de-la-vida-800-911-2000 |
| Prise en charge du trouble lié aux jeux d'argent par la Línea de la Vida (communications de la CONASAMA, août 2026, relayées par la presse) | https://lasalud.mx/2026/08/10/conasama-refuerza-la-prevencion-del-trastorno-por-juego-de-apuestas/ · https://www.cronica.com.mx/nacional/2026/08/10/continua-exposicion-a-plataformas-digitales-de-apuestas-podria-derivar-en-un-problema-de-salud-mental/ |

## 4. Points à faire confirmer par un juriste, et décisions bloquées

### Tous marchés
1. **BLOCKED_DECISION : identité légale incomplète.**
   - Manquent : nom de l'exploitant, SIREN/SIRET, adresse complète, téléphone, régime de TVA.
   - Textes en cause : mentions légales FR, ECT Act s43 (ZA), Electronic Commerce Regulations 2002 reg. 6 (UK), LFPC art. 76 BIS (MX).
2. **BLOCKED_DECISION : médiateur de la consommation à désigner** (articles L612-1 et L616-1 du Code de la consommation).
3. **Parcours de paiement non conforme en l'état.** Il ne recueille pas :
   - l'accord exprès pour l'exécution immédiate et la renonciation au droit de rétractation (L221-28 13°, CCR reg. 37, ECT s42(2)) ;
   - l'acceptation des conditions générales (aucune case à cocher) ;
   - la confirmation du contrat sur support durable.
   Tant que ce n'est pas corrigé, les pages présentent le droit de rétractation ou le cooling-off comme pleinement applicable.
4. **Qualification du service** à trancher : « contenu numérique » ou « service numérique ». Le régime de rétractation en dépend.
5. **Mesure de parcours sans consentement.**
   - L'identifiant `iashark_funnel_sid` est déposé sans consentement et peut être relié au `user_id`. L'exemption CNIL pour la mesure d'audience n'est donc probablement pas remplie.
   - Au Royaume-Uni, l'exemption statistique du DUAA 2025 exige un moyen d'opposition, qui n'existe pas encore dans le produit.
6. **Durées de conservation.**
   - Le choix de consentement est conservé sans limite de durée.
   - Les cookies `_ga` durent 2 ans, au-delà des 13 mois recommandés par la CNIL.
   - Les tables `funnel_events` et `rate_limit_buckets` (qui contient des IP) ne sont jamais purgées.
   - La durée « fin d'abonnement + 1 an » annoncée n'est appliquée par aucune tâche automatique.
7. **Transferts vers les États-Unis.** Vérifier la certification DPF de chaque prestataire. Le pourvoi Latombe (C-703/25 P) est toujours pendant.
8. **TVA et fiscalité** : franchise en base en France, TVA britannique sur les services numériques, TVA sud-africaine sur les e-services, IVA mexicaine sur les services numériques fournis depuis l'étranger.
9. **Loi applicable.** Vérifier la validité de la clause « droit français » face aux protections impératives des consommateurs de chaque pays.
10. **Qualification de l'activité (le point le plus important).** Il faut un avis juridique par pays confirmant qu'un abonnement d'information sur les paris n'exige aucune licence :
    - Royaume-Uni : guidance « betting intermediary » de la UKGC ;
    - Afrique du Sud : National Gambling Act et lois provinciales ;
    - Mexique : Ley Federal de Juegos y Sorteos.
    Les pages disent seulement « IAShark ne détient aucune licence », qui est un constat, et jamais « aucune licence n'est requise ».
11. **Traductions** : termes signalés par les traducteurs.
    - es : « desistimiento » ;
    - pt : « livre resolução », « mediador de consumo » ;
    - it : « mediatore dei consumatori » ;
    - de : le libellé « Impressum » est associé au droit allemand (DDG), alors que l'éditeur est français.

### Royaume-Uni
12. **Représentant au Royaume-Uni** (UK GDPR art. 27) non désigné. Vérifier aussi si la redevance ICO (data protection fee) est due.
13. **Régime des abonnements du DMCC Act 2024**, attendu au printemps 2027 : il imposera des rappels de renouvellement, une sortie facile et un cooling-off à chaque renouvellement.
14. **Informations sur les modes alternatifs de règlement des litiges (ADR)** à confirmer. Vérifier aussi la règle « aucun remboursement au prorata sur l'annuel » au regard des clauses abusives (CRA 2015, Part 2).
15. **Couverture de l'Irlande du Nord.** La National Gambling Helpline et GAMSTOP visent la Grande-Bretagne ; il faut identifier une ressource propre à l'Irlande du Nord.
16. **Prix en GBP** non configurés dans Stripe (`STRIPE_PRICE_ID_GB_WEEK`, `_MONTH`, `_YEAR`).

### Afrique du Sud
17. **Information Officer** : son nom n'est pas renseigné et il n'est pas enregistré auprès de l'Information Regulator. Confirmer aussi que POPIA s'applique à un responsable établi hors d'Afrique du Sud (POPIA s3), et documenter la base s72 de chaque transfert.
18. **CPA s14 et plan annuel (BLOCKED_DECISION).**
    - À l'échéance, un contrat à durée déterminée se poursuit au mois, sauf demande contraire du consommateur. Or la durée annuelle de l'offre Pro (R1 999/an, proposition du 15/09/2026) suppose un renouvellement annuel. Options (a)/(b) : voir la proposition de CGV ZA du plan tarifaire.
    - Il faut implémenter la notice d'échéance (entre 80 et 40 jours ouvrables avant la fin du terme).
    - Il faut décider de la politique de pénalité ou de remboursement en cas de résiliation anticipée.
19. **Plaintes ECT s49** : confirmer l'organe compétent actuel (« Consumer Affairs Committee »). Confirmer aussi que CPA s16 ne s'applique qu'en cas de démarchage direct.
20. **Prix en ZAR** non configurés dans Stripe (`STRIPE_PRICE_ID_ZA_WEEK`, `_MONTH`, `_YEAR`) ; TVA sur les e-services à vérifier.

### Mexique
21. **Règlement de la nouvelle LFPDPPP** : vérifier s'il a été publié.
    - Délais de réponse ARCO à indiquer en chiffres. Ils ne sont pas cités car le texte officiel n'a pas pu être consulté ; les sources secondaires divergent.
    - Nom exact de la procédure devant la Secretaría Anticorrupción y Buen Gobierno à confirmer.
    - Mécanisme de limitation de l'usage ou de la divulgation des données (liste d'exclusion) à mettre en place.
22. **Consommation.**
    - Vérifier si le droit de révocation de 5 jours ouvrables (LFPC art. 51 à 56) s'applique aux abonnements numériques ; il est rédigé au conditionnel.
    - Vérifier si le contrat d'adhésion doit être enregistré auprès de la PROFECO.
    - Vérifier la clause « droit français » face à l'art. 1 LFPC (dispositions irrenunciables).
23. **Validation juridique locale** du modèle « service d'information sur les paris » avant tout paiement réel (exigence du doc 07). Le prix en MXN n'est pas configuré dans Stripe.
24. **Ressource d'aide.** La Línea de la Vida (800 911 2000) est confirmée sur gob.mx comme ligne officielle de santé mentale et d'addictions. Son orientation sur le trouble lié aux jeux d'argent ressort de communications de la CONASAMA d'août 2026 relayées par la presse ; à confirmer directement auprès de la CONASAMA.
    - `config/markets.json` (`mx.compliance.responsibleGamblingHelpline: null`) n'a pas été modifié, car ce fichier sort du périmètre de `legal/`.
