"use strict";
// Suivi des pages vues des inscrits connectes : politique de confidentialite
// de chaque version (paragraphe, reference legale, chemin reel vers
// l'interrupteur, date), cles i18n de la carte « Confidentialite » de
// compte.html, et droit d'acces (export « Mes donnees »).
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");
const dict = (locale) => JSON.parse(read("i18n/dict/" + locale + ".json"));
const KEYS = ["privacy_heading", "privacy_opt_out_title", "privacy_opt_out_detail", "privacy_policy_link", "privacy_opt_out_saved", "privacy_opt_in_saved", "privacy_opt_out_device_only"];
const LOCALES = ["fr", "en", "es", "es-mx", "de", "it", "pt"];

// dir -> [langue du dictionnaire, titre du paragraphe, reference legale, date du jour de la mise a jour, titre de l'item precedent]
const PAGES = {
  fr: ["fr", "Suivi des pages consultées par les utilisateurs connectés", /article 6\.1\.f du RGPD/, "15 septembre 2026", "Mesure interne du parcours"],
  en: ["en", "Tracking of pages viewed by signed-in users", /Art\. 6\(1\)\(f\) GDPR/, "15 September 2026", "Internal journey measurement"],
  gb: ["en", "Tracking of pages viewed by signed-in users", /Article 6\(1\)\(f\) UK GDPR/, "15 September 2026", "Internal journey measurement"],
  za: ["en", "Tracking of pages viewed by signed-in users", /section 11\(1\)\(f\) of POPIA/, "15 September 2026", "Internal journey measurement"],
  es: ["es", "Seguimiento de las páginas consultadas por los usuarios con sesión iniciada", /art\. 6\.1\.f del RGPD/, "15 de septiembre de 2026", "Medición interna del recorrido"],
  mx: ["es-mx", "Seguimiento de las páginas que consultan los usuarios con sesión iniciada", /LFPDPPP/, "15 de septiembre de 2026", "Medición interna del recorrido"],
  de: ["de", "Erfassung der von angemeldeten Nutzern aufgerufenen Seiten", /Art\. 6 Abs\. 1 lit\. f DSGVO/, "15. September 2026", "Interne Messung der Nutzerwege"],
  it: ["it", "Tracciamento delle pagine consultate dagli utenti che hanno effettuato l'accesso", /art\. 6, par\. 1, lett\. f\), GDPR/, "15 settembre 2026", "Misurazione interna del percorso"],
  pt: ["pt", "Registo das páginas consultadas pelos utilizadores com sessão iniciada", /art\. 6\.º, n\.º 1, alínea f\), do RGPD/, "15 de setembro de 2026", "Medição interna do percurso"],
};

test("politique de confidentialite : paragraphe dans les 9 versions, section « donnees collectees », juste apres la mesure interne", () => {
  for (const [dir, [, title, legalRef, date, previous]] of Object.entries(PAGES)) {
    const html = read("legal/" + dir + "/confidentialite.html");
    const at = html.indexOf("<li><strong>" + title + "</strong>");
    assert.ok(at !== -1, dir + " : paragraphe present");
    assert.equal(html.split("<strong>" + title + "</strong>").length, 2, dir + " : une seule fois");
    const prev = html.indexOf("<li><strong>" + previous + "</strong>");
    assert.ok(prev !== -1 && prev < at && html.indexOf("</li>", prev) + 5 < at + 1, dir + " : place apres la mesure interne du parcours");
    assert.ok(html.lastIndexOf("<h2>2.", at) !== -1 && html.indexOf("<h2>3.", 0) > at, dir + " : dans la section 2");
    const li = html.slice(at, html.indexOf("</li>", at));
    assert.match(li, legalRef, dir + " : reference legale");
    assert.match(li, /13 /, dir + " : 13 mois de conservation (purge pg_cron hebdomadaire)");
    assert.match(li, /Supabase/, dir + " : hebergeur cite");
    assert.ok(!/@/.test(li), dir + " : aucune adresse");
    assert.ok(html.includes('<div class="page-date">') && html.slice(html.indexOf('<div class="page-date">'), html.indexOf("</div>", html.indexOf('<div class="page-date">'))).includes(date), dir + " : date de mise a jour");
  }
});

test("politique de confidentialite : chemin reel vers l'interrupteur (compte > onglet Donnees > carte Confidentialite > libelle)", () => {
  for (const [dir, [locale, title]] of Object.entries(PAGES)) {
    const html = read("legal/" + dir + "/confidentialite.html");
    const at = html.indexOf("<li><strong>" + title + "</strong>");
    const li = html.slice(at, html.indexOf("</li>", at));
    const c = dict(locale).compte_page;
    for (const label of [c.nav_data, c.privacy_heading, c.privacy_opt_out_title]) {
      assert.ok(label && li.includes(label), dir + " : libelle « " + label + " » du compte cite tel qu'affiche");
    }
  }
});

test("i18n : 7 cles compte_page.privacy_* dans les 7 langues, parts dediees fusionnees, plus de repli francais", () => {
  const fr = dict("fr").compte_page;
  for (const locale of LOCALES) {
    const part = JSON.parse(read("i18n/parts/compte_privacy." + locale + ".json"));
    assert.deepEqual(Object.keys(part), ["compte_page"], locale);
    assert.deepEqual(Object.keys(part.compte_page).sort(), KEYS.slice().sort(), locale);
    const c = dict(locale).compte_page;
    for (const k of KEYS) {
      assert.equal(c[k], part.compte_page[k], locale + " : " + k + " fusionnee dans i18n/dict");
      if (locale !== "fr" && k !== "privacy_heading") assert.notEqual(c[k], fr[k], locale + " : " + k + " traduite");
    }
  }
  const js = read("account-page.js");
  for (const k of KEYS) assert.ok(js.includes("'compte_page." + k + "'"), k + " utilisee par account-page.js");
});

test("droit d'acces : l'export « Mes donnees » inclut les visites liees au compte, via la politique RLS de lecture de 0025", () => {
  const js = read("account-page.js");
  const exporter = js.slice(js.indexOf("async function exporter"), js.indexOf("function brancherDialogues"));
  assert.match(exporter, /sb\.from\('funnel_events'\)\.select\('created_at,event_type,page,locale,session_id,metadata'\)\s*\.eq\('user_id', ctx\.user\.id\)/);
  assert.match(exporter, /visites_liees_au_compte: res\[4\]\.error \? 'indisponible pour le moment'/);
  const sql = read("supabase/migrations/0025_admin_members.sql");
  assert.match(sql, /create policy funnel_events_select_own on public\.funnel_events\s+for select to authenticated\s+using \(user_id is not null and user_id = \(select auth\.uid\(\)\)\);/);
  assert.ok(!/grant[^;]*funnel_events[^;]*\banon\b/i.test(sql), "jamais de lecture pour anon");
});
