# IASHARK — Activation Stripe (MASTER V2.1 §3.2)

Ce document décrit exactement ce qu'il reste à faire pour activer un vrai paiement Stripe. Le code est prêt et déployé en mode **désactivé** — rien de ce qui suit n'a été exécuté par Claude, et ne doit être fait que par l'utilisateur, avec ses propres identifiants Stripe.

## État actuel (vérifié, 2026-08-29)

- Edge Function `stripe-webhook` déployée sur le projet Supabase `ksvjraqitxouwiabecai`, statut `ACTIVE`.
- Testée en direct par requête HTTP réelle : reçoit un événement, répond `{"ok":true,"billing_mode":"disabled","processed":false}`, **aucune ligne écrite** dans `billing_customers`/`subscriptions`/`billing_events` (vérifié par requête SQL directe après le test).
- Tables `billing_customers`, `subscriptions`, `billing_events` créées (`supabase/migrations/0006_billing_scaffold.sql`), RLS activé, écriture réservée au service role.
- **Jamais testé contre un vrai webhook Stripe** (signature réelle, structure d'événement réelle) — seulement contre une requête HTTP simulée basique. La logique de traitement (`checkout.session.completed`, `customer.subscription.*`) n'a donc pas de preuve d'exécution réelle au-delà d'une relecture de code.

## Étapes pour activer (à faire par vous, pas par Claude — MASTER §"aucun secret client")

1. **Créer le produit et le prix dans le dashboard Stripe** (mode test d'abord) : abonnement mensuel récurrent, 19,95 €.
2. **Récupérer les secrets** : `STRIPE_SECRET_KEY` (clé secrète), `STRIPE_PRICE_PRO_MONTHLY` (id du prix créé), la clé publique si le checkout utilise Stripe.js côté client.
3. **Configurer le webhook côté Stripe** : URL = `https://ksvjraqitxouwiabecai.supabase.co/functions/v1/stripe-webhook`, événements à écouter au minimum : `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`. Stripe génère alors `STRIPE_WEBHOOK_SECRET`.
4. **Ajouter les secrets à Supabase** (dashboard projet → Edge Functions → Secrets, ou `supabase secrets set`) : `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, et `BILLING_MODE=stripe` (bascule le webhook de désactivé à actif — **avant cette étape, le webhook ne traite jamais rien, quoi qu'il reçoive**).
5. **Tester en mode test Stripe d'abord** : `stripe listen --forward-to https://ksvjraqitxouwiabecai.supabase.co/functions/v1/stripe-webhook`, déclencher un checkout de test, vérifier dans les logs Supabase (`get_edge_function`/dashboard) que l'événement est traité et que `users.plan` passe à `pro`.
6. **Créer le flux de checkout côté frontend** (n'existe pas encore) : `compte.html` doit créer une session Stripe Checkout avec `client_reference_id = user.id` (obligatoire — c'est ce qui permet au webhook d'associer le paiement au bon compte IASHARK sans faire confiance à une donnée du navigateur) et rediriger vers l'URL Stripe retournée.
7. **Créer le portail client** (gestion abonnement/annulation par l'utilisateur) — non fait, à construire avec le Stripe Customer Portal.
8. **Une fois tout vérifié en mode test** : basculer les clés Stripe de test vers les clés live, garder `BILLING_MODE=stripe`.

## Ce qui N'A PAS été fait (honnêtement, hors périmètre de ce jalon)

- Le flux de checkout frontend (bouton "Passer PRO" qui crée réellement une session Stripe) — `compte.html` a aujourd'hui un CTA qui pointe simplement vers `/pro.html`, pas de checkout réel.
- Le portail client Stripe.
- Tout test contre de vraies clés Stripe (test ou live) — impossible sans compte Stripe accessible depuis cette session.
- La distinction `BILLING_MODE=test` (mentionnée par le MASTER comme mode intermédiaire) n'est pas implémentée séparément de `stripe` dans le code actuel — seule la bascule binaire désactivé/activé existe. À affiner si un mode "test visible mais non payant" est souhaité en plus du mode test Stripe lui-même.
