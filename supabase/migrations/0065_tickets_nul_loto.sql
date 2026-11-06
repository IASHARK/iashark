-- 0065 (06/11/2026) : deux rubriques Pro de la page combines, figees comme les autres tickets du jour :
-- « nul » (le nul du jour) et « loto » (la grille Loto Foot du jour), lib/run-output/extras-du-jour.js.
-- Ecrites seulement avec le GO du mathematicien (config/verdicts-maths.json : tickets.nul_du_jour, tickets.loto_grille).
alter table public.tickets_du_jour drop constraint if exists tickets_du_jour_type_check;
alter table public.tickets_du_jour add constraint tickets_du_jour_type_check
  check (type in ('x5', 'x10', 'or', 'buteur', 'nul', 'loto'));
