"use strict";
// RUN_OUTPUT_ENGINE (2026-09-06), item 6 : timeline immuable
// T168 -> T72 -> T24 -> T6 -> T1 -> CLOSE. Chaque RUN produit un
// snapshot fige (jamais reecrit en place) ; ce module compare DEUX
// snapshots deja generes (jamais recalcule de probabilite) et explique
// tout changement de selection par slot avec une raison standardisee.

const SNAPSHOT_LABELS = ["T168", "T72", "T24", "T6", "T1", "CLOSE"];

const CHANGE_REASONS = [
  "ODDS_MOVED",
  "MODEL_PROBABILITY_CHANGED",
  "LINEUP_UPDATE",
  "MIN_ODDS_FILTER",
  "DATA_QUALITY_CHANGED",
  "BETTER_SELECTION_AVAILABLE",
];

function selectionKeyOf(slot) {
  if (!slot) return null;
  if (slot.player_id != null) return `PLAYER:${slot.player_id}:${slot.fixture_id}`;
  if (slot.combo_id != null && slot.legs) return `COMBO:${slot.legs.map((l) => `${l.fixture_id}|${l.market}|${l.selection}`).sort().join(",")}`;
  if (slot.selection != null && slot.market != null) return `SAFE:${slot.fixture_id}|${slot.market}|${slot.selection}`;
  return JSON.stringify(slot);
}

function probabilityOf(slot) {
  if (!slot) return null;
  return slot.scorer_probability ?? slot.model_probability ?? slot.estimated_combo_probability ?? null;
}

function oddsOf(slot) {
  if (!slot) return null;
  return slot.decimal_odds ?? slot.combo_total_odds ?? null;
}

// Compare un slot previous/current (meme "emplacement" logique : meme
// rang Top5, meme combo_id, ou l'unique slot SAFE_PICK). explicitReason
// permet d'attacher une raison connue par l'appelant (ex: disparition
// pour cause de filtre cote) plutot que de la deviner.
function diffSlot(slotId, previous, current, explicitReason) {
  if (!previous && !current) return null;
  if (!previous && current) {
    return { slot_id: slotId, change_reason: explicitReason || "BETTER_SELECTION_AVAILABLE", previous_selection: null, new_selection: selectionKeyOf(current), previous_probability: null, new_probability: probabilityOf(current), previous_odds: null, new_odds: oddsOf(current) };
  }
  if (previous && !current) {
    return { slot_id: slotId, change_reason: explicitReason || "MIN_ODDS_FILTER", previous_selection: selectionKeyOf(previous), new_selection: null, previous_probability: probabilityOf(previous), new_probability: null, previous_odds: oddsOf(previous), new_odds: null };
  }

  const sameSelection = selectionKeyOf(previous) === selectionKeyOf(current);
  if (!sameSelection) {
    return { slot_id: slotId, change_reason: explicitReason || "BETTER_SELECTION_AVAILABLE", previous_selection: selectionKeyOf(previous), new_selection: selectionKeyOf(current), previous_probability: probabilityOf(previous), new_probability: probabilityOf(current), previous_odds: oddsOf(previous), new_odds: oddsOf(current) };
  }

  if (oddsOf(previous) !== oddsOf(current)) {
    return { slot_id: slotId, change_reason: "ODDS_MOVED", previous_selection: selectionKeyOf(previous), new_selection: selectionKeyOf(current), previous_probability: probabilityOf(previous), new_probability: probabilityOf(current), previous_odds: oddsOf(previous), new_odds: oddsOf(current) };
  }
  if (probabilityOf(previous) !== probabilityOf(current)) {
    return { slot_id: slotId, change_reason: "MODEL_PROBABILITY_CHANGED", previous_selection: selectionKeyOf(previous), new_selection: selectionKeyOf(current), previous_probability: probabilityOf(previous), new_probability: probabilityOf(current), previous_odds: oddsOf(previous), new_odds: oddsOf(current) };
  }
  if ((previous.lineup_status ?? null) !== (current.lineup_status ?? null)) {
    return { slot_id: slotId, change_reason: "LINEUP_UPDATE", previous_selection: selectionKeyOf(previous), new_selection: selectionKeyOf(current), previous_probability: probabilityOf(previous), new_probability: probabilityOf(current), previous_odds: oddsOf(previous), new_odds: oddsOf(current) };
  }
  if ((previous.data_quality_status ?? null) !== (current.data_quality_status ?? null)) {
    return { slot_id: slotId, change_reason: "DATA_QUALITY_CHANGED", previous_selection: selectionKeyOf(previous), new_selection: selectionKeyOf(current), previous_probability: probabilityOf(previous), new_probability: probabilityOf(current), previous_odds: oddsOf(previous), new_odds: oddsOf(current) };
  }
  return null; // aucun changement detectable entre les deux snapshots pour ce slot
}

// previousSlots/currentSlots : Map<slot_id, slotObject>. explicitReasons
// (optionnel) : Map<slot_id, reason> pour les cas de disparition/
// apparition dont l'appelant connait deja la cause exacte.
function diffSnapshots(previousSlots, currentSlots, explicitReasons) {
  const reasons = explicitReasons || new Map();
  const allSlotIds = new Set([...previousSlots.keys(), ...currentSlots.keys()]);
  const changes = [];
  for (const slotId of allSlotIds) {
    const change = diffSlot(slotId, previousSlots.get(slotId) || null, currentSlots.get(slotId) || null, reasons.get(slotId));
    if (change) changes.push(change);
  }
  changes.sort((a, b) => String(a.slot_id).localeCompare(String(b.slot_id)));
  return changes;
}

module.exports = { diffSnapshots, diffSlot, selectionKeyOf, SNAPSHOT_LABELS, CHANGE_REASONS };
