-- Panneau Lolly Bet a l'arrivee (lib/lolly-panneau.js, 15/11/2026, demande de Clement).
-- Trois evenements de plus dans funnel_events pour suivre son effet :
--   lolly_panneau_vu, lolly_panneau_clic, lolly_panneau_ferme
--   metadata : { inscrit: bool, how: 'bouton'|'offre' (clic) | 'croix'|'echap'|'fond' (ferme) }.
-- Meme liste que 0052_admin_diagnostics.sql (identique a la base au 15/11/2026), plus ces trois-la.
alter table public.funnel_events drop constraint if exists funnel_events_event_type_check;
alter table public.funnel_events add constraint funnel_events_event_type_check check (event_type in (
  'landing_view', 'signup_started', 'signup_completed', 'login_completed', 'onboarding_dismissed',
  'tool_page_view', 'paywall_view', 'checkout_started', 'checkout_unavailable', 'checkout_success_view',
  'checkout_cancel_view', 'page_view', 'page_leave', 'click', 'gate_view',
  'js_error', 'signup_form_started', 'signup_submitted', 'signup_failed', 'checkout_failed',
  'lolly_panneau_vu', 'lolly_panneau_clic', 'lolly_panneau_ferme'));
