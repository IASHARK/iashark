# Décision 5 : la promesse « une analyse offerte chaque jour »

À décider par Clément pour le reste du site. **Option A appliquée en partie le 30/09/2026** (contrôle des chiffres publics de la fusion V3) sur : le bouton de l'accueil (`HOME_V4.cta1`, « Voir le match offert »), la landing (`landing_page.hero_cta`, `landing_page.hero_cta_note_b`, `landing_v2.cta_note`, `landing_page.plan_free_feat1`, `geo.meta.landing.description` et les 3 landings pays `gb/landing.html`, `za/landing.html`, `mx/landing.html`), l'inscription (`auth.signup_bullet_analysis`), la page d'exemple (`demo_page.*`), l'espace Pro (`pro_space.free_match_*`), le détecteur (`tools_page.scan_kpi_free`) et les CGV des 9 versions (article 4 du 01/10/2026 : « l'analyse d'un match offert, certains jours »). Le reste de la liste ci-dessous n'est pas encore appliqué.

## Pourquoi il faut décider

Avec le moteur v3, le match offert est le match le plus probable du jour, **seulement s'il y en a un**. Certains jours, aucun match n'est offert. La FAQ de l'accueil le dit déjà (« Certains jours, aucun match n'est offert »). Mais d'autres textes promettent encore une analyse gratuite **chaque jour**.

## Déjà corrigé (30/09/2026) : le mot « complète »

Sur le match offert, la simulation par quart d'heure reste réservée aux abonnés Pro. Dire « analyse complète » était donc faux. Le mot est retiré dans les 7 langues : `home_app.free_card_cta`, `match_page.gate_free_text`, `match_page.cta_recall_free`, `tools_page.scan_kpi_free`, `compte_page.benefit_free_analysis`, `auth.signup_bullet_analysis`, `landing_page.plan_free_feat1`, `geo.meta.index.description`, `demo_page.bar_text`, `HOME_V4.ff1` (7 accueils), le message Telegram du match gratuit et 3 guides du blog.

Corrigé aussi le 30/09 (ronde 4.1) : les 3 landings pays écrites à la main (`gb/landing.html`, `za/landing.html`, `mx/landing.html`) disaient « 1 full analysis every day » et « 1 análisis completo cada día ». Elles disent maintenant « 1 analysis offered every day » et « 1 análisis gratis cada día », comme les autres landings.

Il reste « complète » dans deux endroits qui ne se changent pas comme une page :

- **Les e-mails** (`emails/lifecycle/copy.*.json`, 7 langues) : « L'analyse complète d'un match reste offerte chaque jour… ». Il faut changer le texte, refaire le paquet des e-mails (`supabase/functions/_shared/lifecycle-email-bundle.generated.mjs`) puis redéployer la fonction. Le redéploiement se fait avec ton accord.
- **Les CGV, dans les 9 versions** : c'est un texte juridique. Il faut une nouvelle version datée dans chaque version, l'ancienne étant archivée. Les pages concernées :

| Version | Pages | Texte actuel |
|---|---|---|
| fr | `fr/cgv.html`, `legal/fr/cgv.html` | l'analyse complète d'un match par jour |
| en | `en/cgv.html`, `legal/en/cgv.html` | the full analysis of one match per day |
| es | `es/cgv.html`, `legal/es/cgv.html` | el análisis completo de un partido al día |
| de | `legal/de/cgv.html` | die vollständige Analyse eines Spiels pro Tag |
| it | `legal/it/cgv.html` | l'analisi completa di una partita al giorno |
| pt | `legal/pt/cgv.html` | a análise completa de um jogo por dia |
| gb | `gb/cgv.html`, `legal/gb/cgv.html` | A free account includes one full match analysis per day |
| za | `za/cgv.html`, `legal/za/cgv.html` | A free account includes one full match analysis per day |
| mx | `mx/cgv.html`, `legal/mx/cgv.html` | La cuenta gratuita incluye un análisis completo de un partido al día |

Les versions archivées (`legal/*/archives/*.html`) ne se modifient jamais. Ces CGV promettent aussi une analyse **par jour** : la nouvelle version doit suivre ton choix ci-dessous (option A ou B).

## Tes deux options

- **Option A (prudente, prête, pas appliquée)** : on retire « chaque jour », « par jour » et « du jour » de tous les textes ci-dessous. Les textes proposés sont dans la dernière colonne (en français ; les 6 autres langues seront traduites au moment de l'appliquer).
- **Option B** : on garde la promesse. Il faut alors un match offert tous les jours, même quand le v3 ne publie rien. Cette règle de secours reste à définir avec trader-de-cotes et le mathématicien.

## La liste complète (site)

Chaque texte qui promet une analyse gratuite chaque jour est ici. Un test (`tests/match-offert-textes.test.js`) vérifie que la liste reste complète : un nouveau texte de ce genre le fait échouer tant qu'il n'est pas ajouté ici.

| Clé | Texte actuel | Texte proposé (option A) |
|---|---|---|
| `auth.signup_bullet_analysis` | L’analyse offerte chaque jour | L’analyse du match offert |
| `auth.meta_signup_description` | Créez votre compte IASHARK gratuitement et accédez à l’analyse offerte du jour. | Créez votre compte IASHARK gratuitement et accédez à l’analyse du match offert. |
| `account.plan_free_desc` | Tu utilises la version gratuite d'IASHARK — le match à la plus forte probabilité modèle du jour est accessible gratuitement. | Tu utilises la version gratuite d'IASHARK — le match offert, quand il y en a un, est accessible gratuitement. |
| `match_page.gate_free_title` | Match gratuit du jour | Match offert |
| `match_page.gate_pro_text` | (…) Le match du jour, lui, reste gratuit avec un compte. | (…) Le match offert, quand il y en a un, reste gratuit avec un compte. |
| `match_page.recovery_free_cta` | Voir le match gratuit du jour | Voir le match offert |
| `tools_page.scan_kpi_free` | Analyse offerte par jour | Retirer ce chiffre « 1 » |
| `compte_page.onboarding_body` | Ton compte est prêt. Commence par le match du jour en accès gratuit, puis découvre l'espace Outils quand tu veux aller plus loin. | Ton compte est prêt. Commence par le match offert s'il y en a un aujourd'hui, puis découvre l'espace Outils. |
| `compte_page.plan_free_detail` | L’analyse offerte du jour, le blog et les outils en découverte. | L’analyse du match offert, le blog et les outils en découverte. |
| `compte_page.benefit_free_analysis` | L’analyse offerte chaque jour | L’analyse du match offert |
| `landing_page.description` et `geo.meta.landing.description` | Buts attendus, probabilité de chaque marché, écart avec la cote : IASHARK analyse chaque match avec un vrai modèle statistique. Un match gratuit chaque jour. | (…) Un match offert avec un compte gratuit. |
| `landing_page.hero_cta` | VOIR LE MATCH GRATUIT DU JOUR | VOIR LE MATCH OFFERT |
| `landing_page.hero_cta_note_b` | 1 analyse offerte chaque jour | Le match offert, quand il y en a un |
| `landing_page.plan_free_feat1` | 1 analyse offerte chaque jour | L’analyse du match offert |
| `landing_v2.cta_note` | Sans carte bancaire · 1 analyse offerte chaque jour | Sans carte bancaire · le match offert, quand il y en a un |
| `geo.meta.index.description` | Probabilités de match calculées par des modèles statistiques, comparées aux cotes du marché. Une analyse offerte chaque jour. | (…) Un match offert avec un compte gratuit. |
| `geo.meta.inscription.description` | Créez votre compte IASHARK gratuitement et accédez à l'analyse offerte du jour. | Créez votre compte IASHARK gratuitement et accédez à l'analyse du match offert. |
| `demo_page.cta` | Voir l'analyse gratuite du jour | Voir le match offert |
| `demo_page.foot_title` | Chaque jour, une analyse comme celle-ci est gratuite. | Le match offert, quand il y en a un, s’affiche comme celui-ci. |
| `demo_page.bar_text` | Voici un exemple d’analyse IASHARK. L'analyse du jour est gratuite. | Voici un exemple d’analyse IASHARK. Le match offert est gratuit avec un compte. |
| `blog_hub.cta_text` | (…) L'analyse du jour est gratuite, en permanence. | (…) Le match offert est gratuit avec un compte. |
| `clubs.free_link` | L'analyse offerte du jour | Le match offert |
| `pro_offer.daily_all_matches` | Tous les matchs analysés de nos 48 compétitions, au lieu d’un seul match offert par jour | Tous les matchs analysés de nos 48 compétitions, au lieu du seul match offert |
| `pro_offer.free_matches` | 1 match offert par jour, avec un compte gratuit | Le match offert, quand il y en a un, avec un compte gratuit |
| `pro_space.sub_free` (espace Pro, fusion V3 du 30/09) | Ton journal, ton garde-fou et l'analyse offerte du jour. Les blocs Pro sont en aperçu. | Ton journal, ton garde-fou et le match offert, quand il y en a un. Les blocs Pro sont en aperçu. |
| `pro_space.free_match_title` | L'analyse offerte du jour | Le match offert |
| `pro_space.free_match_text` | Chaque jour, un match analysé en entier, gratuitement. | Le match offert, quand il y en a un, avec un compte gratuit. |
| `HOME_V4.cta1` (accueil, `scripts/i18n-manifest.js`) | Voir l'analyse gratuite du jour | Voir le match offert |
| `HOME_V4.ff1` (7 accueils, `scripts/i18n-manifest.js`) | Analyse gratuite du jour, avec un compte gratuit | Le match offert, quand il y en a un, avec un compte gratuit |
| `HOME_V2.statFree` (`scripts/i18n-manifest.js`) | Analyse offerte par jour | Rien à faire : ce texte n'est plus affiché (à supprimer au passage) |
| Description de l'accueil (`scripts/i18n-manifest.js`) et `meta.index.description` (`i18n/seo/*.json`) | Pronostics football calculés par des modèles statistiques : probabilités 1X2, buts et BTTS comparées aux cotes du marché. Une analyse offerte par jour. 18+ | (…) Un match offert avec un compte gratuit. 18+ |
| `league.free_link` et `match.free_link` (`i18n/seo/*.json`) | L'analyse offerte du jour | Le match offert |
| `match.about` (`i18n/seo/*.json`) | (…) Une analyse est offerte chaque jour ; les autres font partie d'IASHARK Pro. | (…) Un match est offert avec un compte gratuit ; les autres font partie d'IASHARK Pro. |

## Toutes les pages concernées, dans toutes les langues

Le tableau ci-dessus donne les textes par clé (en français). Voici, en plus, **chaque groupe de pages** qui fait la même promesse dans une autre langue ou dans un texte écrit à la main. Un test (`tests/match-offert-textes.test.js`) relit toutes les pages publiées (7 langues, hors pages de match, qui viennent d'une clé déjà listée) : une page qui promet une analyse gratuite chaque jour et qui n'est dans aucun groupe ci-dessous le fait échouer.

| Pages | D'où vient le texte | Exemple actuel | Avec l'option A |
|---|---|---|---|
| `gb/landing.html`, `za/landing.html`, `mx/landing.html` | Écrites à la main (pas de dictionnaire) | No card required · 1 free analysis every day ; 1 analysis offered every day ; 1 análisis gratis cada día | The offered match, when there is one ; El partido ofrecido, cuando lo hay |
| `*/cgv.html`, `legal/*/cgv.html` | CGV, texte juridique (liste plus haut) | one full match analysis per day | nouvelle version datée |
| `legal/*/archives/*.html` | CGV archivées | idem | ne jamais modifier |
| `landing.html`, `*/landing.html` | `landing_page.*`, `landing_v2.cta_note`, `geo.meta.landing.description` | 1 analyse offerte chaque jour | voir le tableau |
| `index.html`, `*/index.html` | `HOME_V4.cta1`, `HOME_V4.ff1`, description de l'accueil, `geo.meta.index.description` | Analyse gratuite du jour, avec un compte gratuit | voir le tableau |
| `inscription.html`, `*/inscription.html` | `auth.signup_bullet_analysis`, `geo.meta.inscription.description` | L’analyse offerte chaque jour | voir le tableau |
| `exemple-analyse.html`, `*/exemple-analyse.html` | `demo_page.*` | Chaque jour, une analyse comme celle-ci est gratuite. | voir le tableau |
| `abonnement.html`, `*/abonnement.html` | `pro_offer.*` | au lieu d’un seul match offert par jour | voir le tableau |
| `blog.html`, `*/blog/index.html`, `blog/guides/index.html`, `*/blog/guides/index.html` | `blog_hub.cta_text` | L'analyse du jour est gratuite, en permanence. | voir le tableau |
| `blog/guides/*.html`, `*/blog/guides/*.html` | Guides écrits à la main (fr, en, es, mx) | Une analyse est offerte chaque jour avec un compte gratuit ; Le match du jour est gratuit, en permanence. | Le match offert, quand il y en a un, est gratuit avec un compte. |
| `fr/articles/*.html`, `es/articulos/*.html`, `mx/articulos/*.html`, `gb/articles/*.html`, `za/articles/*.html` | Articles écrits à la main (gb et za : 3 articles chacun, ajoutés le 30/09, ronde 5) | Le match du jour est gratuit, en permanence. ; El partido del día siempre es gratuito. ; The match of the day is always free. | Le match offert, quand il y en a un, est gratuit avec un compte. ; The offered match, when there is one, is free with an account. |
| `*/leagues/*.html` | `league.free_link` (pages refaites par le calcul du matin) | L'analyse offerte du jour | Le match offert |
| `fr/clubs/*.html`, `*/clubs/*.html`, `*/equipos/*.html` | `clubs.free_link` (pages clubs fr, en, gb, za ; equipos es, mx) | L'analyse offerte du jour ; Today's free analysis (25 pages en/gb/za, ajoutées le 30/09, ronde 4.2) ; El análisis gratuito del día | Le match offert ; The offered match ; El partido ofrecido |
| `match/*.html`, `*/match/*.html` | `match.about`, `match.free_link` (pages refaites par le calcul du matin) | Une analyse est offerte chaque jour | voir le tableau |

Hors site : l'e-mail « Le match offert du jour » ne part pas s'il n'y a aucun match offert publié (`lib/lifecycle-email.js`, texte vrai). Le message Telegram « Match gratuit du jour » ne part que le jour même du match (vérifié le 30/09). Les autres e-mails (« reste offerte chaque jour ») sont à changer avec l'option A.
