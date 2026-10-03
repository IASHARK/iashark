(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.IasharkChance = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  // UNE SEULE SOURCE DE CHIFFRES (regle de Clement, 01/10/2026).
  //
  // Le client voit EXACTEMENT les memes chiffres sur la page match, dans l'espace Pro
  // (combine, detecteur d'ecarts, accueil Pro), dans le Canal Pro, dans le canal gratuit
  // Telegram et sur l'image a partager. Ce module est le SEUL endroit ou ces chiffres
  // sont calcules et arrondis. Il est appele UNE FOIS, par le pipeline
  // (.github/workflows/update-data.yml et lib/moteur-v3.js, puis
  // scripts/canal-pro/deposer-sortie-v3.mjs pour le Canal Pro) ; les pages et les
  // messages lisent les champs qu'il a ecrits et ne recalculent rien.
  //
  //  1. chance_iashark (champ d'un match, en % entier) : la chance du pari retenu.
  //     = le plus bas entre la probabilite du modele (model_probability) et la cote
  //       sans marge du meme pari (consensus de sa ligne dans markets_compared,
  //       marge du bookmaker retiree) ;
  //     = la probabilite du modele seule s'il n'y a pas de cote sans marge (la regle
  //       « modele seul » deja en place decide ensuite si elle peut etre publiee :
  //       lib/telegram-posts.js#pariV3Calibre, lib/match-view-model.js#frequenceCalibree).
  //     Aucune probabilite du moteur n'est modifiee : model_probability, p1/pn/p2,
  //     v3_marches restent ceux du moteur ; seul le chiffre AFFICHE pour le pari change.
  //  2. chanceButeur : la chance d'un buteur du moteur v3 (p_marque), arrondie VERS LE
  //     BAS a 5 points, plafonnee a 45 %, rien sous 10 % (condition 3 du mathematicien,
  //     la meme que le Canal Pro). Le calcul buteur du site (lib/insights.js#scorerModel)
  //     ne donne plus aucun chiffre affiche.
  //  3. arrondi1 : l'arrondi a une decimale (buts attendus), le meme dans tous les blocs.

  const SOURCE_AVEC_COTE = 'le plus bas entre le modèle et la cote sans marge';
  const SOURCE_MODELE = 'modèle (pas de cote sans marge)';
  const BUTEUR = Object.freeze({ pas: 5, plafond: 45, plancher: 10 });

  function nombre(v) {
    if (v === null || v === undefined || v === '') return null;
    const x = Number(String(v).replace(',', '.'));
    return Number.isFinite(x) ? x : null;
  }
  // Arrondi a une decimale, moitie vers le haut sur l'ecriture decimale (1,45 -> 1,5 ;
  // Math.round(1.45 * 10) donnerait 1,4 a cause de l'ecriture binaire).
  function arrondi1(x) {
    const v = nombre(x);
    if (v === null) return null;
    return Math.round(Number((v * 10).toPrecision(12))) / 10;
  }

  // Cote sans marge du pari retenu : consensus de SA ligne dans markets_compared.
  // Absente, nulle ou hors 0-100 : null (1 / cote garde la marge du bookmaker).
  // UNE SEULE COTE (01/10/2026, lib/cote-anj.js) : quand la cote affichee vient des
  // bookmakers agrees ANJ (cote_source « anj »), la cote sans marge vient de la MEME source
  // (sans_marge_anj) ; sinon (cote indicative), celle du pipeline comme avant.
  function sansMargeDuPari(m) {
    const id = m && m.market_id != null && m.market_id !== '' ? String(m.market_id) : null;
    if (!id) return null;
    if (m.cote_source === 'anj' && m.sans_marge_anj && typeof m.sans_marge_anj === 'object') {
      const a = arrondi1(m.sans_marge_anj[id]);
      if (a !== null && a > 0 && a < 100) return a;
    }
    const row = (Array.isArray(m.markets_compared) ? m.markets_compared : []).find(function (r) { return r && r.id != null && String(r.id) === id; });
    const f = row ? arrondi1(row.consensus) : null;
    return f !== null && f > 0 && f < 100 ? f : null;
  }

  // (modele en %, cote sans marge en % ou null) -> { chance (entier, %), modele, sans_marge, source } ou null.
  function chanceIashark(modelePct, sansMargePct) {
    const m = arrondi1(modelePct);
    if (m === null || !(m > 0) || m > 100) return null;
    const f0 = arrondi1(sansMargePct);
    const f = f0 !== null && f0 > 0 && f0 < 100 ? f0 : null;
    const base = f === null ? m : Math.min(m, f);
    // Entier, moitie vers le haut (base a une decimale : 58,5 -> 59), jamais 0 ni 100 %.
    const chance = Math.max(1, Math.min(99, Math.round(base)));
    return { chance: chance, modele: m, sans_marge: f, source: f === null ? SOURCE_MODELE : SOURCE_AVEC_COTE };
  }

  // Pipeline : pose chance_iashark (et sa source) sur un match qui a un pari retenu,
  // les retire sinon. A appeler APRES le gel des paris et la SAFE_PICK (le chiffre
  // suit le pari reellement affiche). -> la chance (entier) ou null.
  function poserChance(m) {
    if (!m || typeof m !== 'object') return null;
    const aUnPari = !!(String(m.pari_rec || '').trim() || (m.market_id != null && m.market_id !== '')) && m.no_signal !== true;
    const c = aUnPari ? chanceIashark(m.model_probability, sansMargeDuPari(m)) : null;
    if (!c) { delete m.chance_iashark; delete m.chance_iashark_source; return null; }
    m.chance_iashark = c.chance;
    m.chance_iashark_source = c.source;
    return c.chance;
  }

  // Lecture seule (pages, messages) : la chance publiee du pari, ou null. Jamais recalculee.
  function chanceDuPari(m) {
    const c = m ? nombre(m.chance_iashark) : null;
    return c !== null && c > 0 && c < 100 ? c : null;
  }

  // Buteur du moteur v3 : p_marque (0-1) -> chance affichee en % entier (vers le bas a
  // 5 points, 45 % au plus), ou null sous 10 %.
  function chanceButeur(p) {
    const x = nombre(p);
    if (x === null || !(x > 0) || x >= 1) return null;
    const c = Math.min(Math.floor(x * 100 / BUTEUR.pas + 1e-9) * BUTEUR.pas, BUTEUR.plafond);
    return c >= BUTEUR.plancher ? c : null;
  }

  return {
    SOURCE_AVEC_COTE: SOURCE_AVEC_COTE,
    SOURCE_MODELE: SOURCE_MODELE,
    BUTEUR: BUTEUR,
    arrondi1: arrondi1,
    sansMargeDuPari: sansMargeDuPari,
    chanceIashark: chanceIashark,
    poserChance: poserChance,
    chanceDuPari: chanceDuPari,
    chanceButeur: chanceButeur,
  };
});
