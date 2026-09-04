"use strict";
// ISO 8601 semaine/annee - necessaire pour block_key = league_id + season +
// ISO_YEAR_WEEK(kickoff) exige par la SPEC (bootstrap par blocs
// semaine x league-season, pas par jour). Algorithme standard : la
// semaine 1 est celle qui contient le premier jeudi de l'annee
// (equivalent : celle qui contient le 4 janvier).

function getIsoYearWeek(dateInput) {
  const d = new Date(Date.UTC(
    new Date(dateInput).getUTCFullYear(),
    new Date(dateInput).getUTCMonth(),
    new Date(dateInput).getUTCDate()
  ));
  const dayNum = (d.getUTCDay() + 6) % 7; // lundi=0 ... dimanche=6
  d.setUTCDate(d.getUTCDate() - dayNum + 3); // jeudi de cette semaine
  const isoYear = d.getUTCFullYear();
  const yearStart = Date.UTC(isoYear, 0, 1);
  const isoWeek = Math.ceil(((d.getTime() - yearStart) / 86400000 + 1) / 7);
  return { isoYear, isoWeek };
}

module.exports = { getIsoYearWeek };
