#!/usr/bin/env node
"use strict";
// EXP-003 M3 DATA GATE - probe REEL, 3 appels HTTP maximum au total :
//   1) date probe representative (2023-12-16, milieu de l'historique OOS)
//   2) D (2023-12-17, jour ou Arsenal-Brighton a ete joue)
//   3) D+1 (2023-12-18)
// Objectif : valider le schema reel de l'endpoint, faire passer la reponse
// dans parseClubEloCsv (lib/data/clubelo.js, DEJA auditee, jamais
// reimplementee ici), et observer la semantique temporelle du snapshot
// (avant/apres le match du 2023-12-17). Sauvegarde la reponse BRUTE
// (status, headers, corps, hash) dans un cache immuable dedie, distinct
// du cache "ratings parses" de lib/data/clubelo.js (qui est aussi
// alimente ici via son fetcher injectable, chemin deja audite).

const https = require("https");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { loadClubElo, parseClubEloCsv } = require("../lib/data/clubelo.js");

const RAW_ROOT = path.join(__dirname, "..", "raw_api", "clubelo_raw");

function get(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { "User-Agent": "iashark-lab-probe/1.0" } }, (res) => {
      let data = "";
      res.on("data", (c) => { data += c; });
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
    });
    req.on("error", reject);
    req.setTimeout(20000, () => req.destroy(new Error("timeout")));
  });
}

function saveRaw(referenceDate, response) {
  const dir = path.join(RAW_ROOT, referenceDate);
  fs.mkdirSync(dir, { recursive: true });
  const p = path.join(dir, "raw_response.json");
  if (fs.existsSync(p)) return { path: p, alreadyExisted: true, saved: JSON.parse(fs.readFileSync(p, "utf8")) };
  const raw_response_hash = crypto.createHash("sha256").update(response.body).digest("hex");
  const record = {
    reference_date: referenceDate,
    source: "https://api.clubelo.com/" + referenceDate,
    retrieved_at: new Date().toISOString(),
    http_status: response.status,
    content_type: response.headers["content-type"] || null,
    byte_length: Buffer.byteLength(response.body, "utf8"),
    raw_response_hash,
    body: response.body,
  };
  fs.writeFileSync(p, JSON.stringify(record, null, 2));
  return { path: p, alreadyExisted: false, saved: record };
}

async function probeOneDate(referenceDate) {
  const httpResp = await get(`https://api.clubelo.com/${referenceDate}`);
  const savedRaw = saveRaw(referenceDate, httpResp);
  // Alimente AUSSI le cache "ratings parses" audite (lib/data/clubelo.js),
  // via son fetcher injectable - jamais de reimplementation du parsing ici.
  const viaAuditedLoader = await loadClubElo(referenceDate, { fetcher: async () => savedRaw.saved.body });
  return { referenceDate, httpResp, savedRaw, viaAuditedLoader };
}

function analyzeSchema(body) {
  const lines = body.split("\n").filter((l) => l.trim().length > 0);
  const header = lines[0] || "";
  const columns = header.split(",").map((c) => c.trim());
  const firstDataLine = lines[1] || null;
  return {
    n_lines_total: lines.length,
    n_data_rows: Math.max(0, lines.length - 1),
    header_raw: header,
    columns,
    has_Club: columns.includes("Club"),
    has_Elo: columns.includes("Elo"),
    has_Country: columns.includes("Country"),
    has_Level: columns.includes("Level"),
    has_From: columns.includes("From"),
    has_To: columns.includes("To"),
    has_Rank: columns.includes("Rank"),
    first_data_row_raw: firstDataLine,
  };
}

function analyzeParse(body) {
  const lines = body.split("\n").filter((l) => l.trim().length > 0);
  const dataLines = lines.slice(1);
  const ratings = parseClubEloCsv(body);
  const parsedNames = Object.keys(ratings);
  const nameCounts = {};
  for (const n of parsedNames) nameCounts[n] = (nameCounts[n] || 0) + 1;
  const duplicates = Object.entries(nameCounts).filter(([, c]) => c > 1).map(([n]) => n);
  let nanCount = 0;
  for (const line of dataLines) {
    const parts = line.split(",");
    if (parts.length >= 5) {
      const elo = parseFloat(parts[4]);
      if (isNaN(elo)) nanCount++;
    }
  }
  return {
    rows_raw: dataLines.length,
    rows_parsed: parsedNames.length,
    rows_rejected: dataLines.length - parsedNames.length,
    nan_elo_count: nanCount,
    duplicate_club_names: duplicates,
  };
}

async function main() {
  console.log("=== STEP 2 : probe date representative 2023-12-16 (= D-1 pour le step 4) ===");
  const probe = await probeOneDate("2023-12-16");
  console.log("HTTP status:", probe.httpResp.status);
  console.log("Content-Type:", probe.httpResp.headers["content-type"]);
  console.log("byte_length:", probe.savedRaw.saved.byte_length);
  const schema = analyzeSchema(probe.httpResp.body);
  console.log("schema:", JSON.stringify(schema, null, 2));
  const parseReport = analyzeParse(probe.httpResp.body);
  console.log("parse:", JSON.stringify(parseReport, null, 2));
  const ratings = probe.viaAuditedLoader.ratings;
  const engLevel1Count = schema.columns.includes("Country") && schema.columns.includes("Level")
    ? probe.httpResp.body.split("\n").slice(1).filter((l) => { const p = l.split(","); return p[2] === "ENG" && p[3] === "1"; }).length
    : null;
  console.log("clubs ENG Level 1 (si colonnes presentes):", engLevel1Count);
  console.log("Arsenal Elo (D-1=2023-12-16):", ratings["arsenal"]);

  console.log("\n=== STEP 4 : semantique temporelle - D=2023-12-17 (Arsenal 2-0 Brighton), D+1=2023-12-18 ===");
  const probeD = await probeOneDate("2023-12-17");
  const probeDplus1 = await probeOneDate("2023-12-18");
  console.log("Arsenal Elo D-1 (2023-12-16):", ratings["arsenal"]);
  console.log("Arsenal Elo D   (2023-12-17):", probeD.viaAuditedLoader.ratings["arsenal"]);
  console.log("Arsenal Elo D+1 (2023-12-18):", probeDplus1.viaAuditedLoader.ratings["arsenal"]);
  console.log("Brighton Elo D-1:", ratings["brighton"], " D:", probeD.viaAuditedLoader.ratings["brighton"], " D+1:", probeDplus1.viaAuditedLoader.ratings["brighton"]);

  const summary = {
    probe_date: "2023-12-16",
    http_status: probe.httpResp.status,
    content_type: probe.httpResp.headers["content-type"] || null,
    byte_length: probe.savedRaw.saved.byte_length,
    schema,
    parse: parseReport,
    eng_level1_count: engLevel1Count,
    temporal_semantics: {
      match_date: "2023-12-17",
      match: "Arsenal 2-0 Brighton",
      arsenal_elo_d_minus_1: ratings["arsenal"],
      arsenal_elo_d: probeD.viaAuditedLoader.ratings["arsenal"],
      arsenal_elo_d_plus_1: probeDplus1.viaAuditedLoader.ratings["arsenal"],
      brighton_elo_d_minus_1: ratings["brighton"],
      brighton_elo_d: probeD.viaAuditedLoader.ratings["brighton"],
      brighton_elo_d_plus_1: probeDplus1.viaAuditedLoader.ratings["brighton"],
    },
  };
  fs.writeFileSync(path.join(__dirname, "..", "data", "gate-b1", "clubelo_probe_report.json"), JSON.stringify(summary, null, 2));
  console.log("\n=== RAPPORT ECRIT: data/gate-b1/clubelo_probe_report.json ===");
}

main().catch((e) => { console.error("ECHEC PROBE:", e.message, e.stack); process.exit(1); });
