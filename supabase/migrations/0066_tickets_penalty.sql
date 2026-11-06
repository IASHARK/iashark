-- 0066 (06/11/2026) : rubrique Pro « le match a penalty » de la page combines, figee comme les autres tickets du jour
-- (lib/run-output/extras-du-jour.js#penaltyDuJour). Ecrite seulement si config/verdicts-maths.json tickets.penalty_du_jour = GO.
alter table public.tickets_du_jour drop constraint if exists tickets_du_jour_type_check;
alter table public.tickets_du_jour add constraint tickets_du_jour_type_check
  check (type in ('x5', 'x10', 'or', 'buteur', 'nul', 'loto', 'penalty'));
