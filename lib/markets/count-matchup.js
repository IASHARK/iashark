"use strict";

function validSample(sample) {
  return sample && sample.n >= 5 && Number.isFinite(Number(sample.mean)) && Number.isFinite(Number(sample.variance));
}

function combineCountMatchup(input) {
  input = input || {};
  const samples = [input.homeFor, input.awayAgainst, input.awayFor, input.homeAgainst];
  if (!samples.every(validSample)) return null;
  const homeExpected = (Number(input.homeFor.mean) + Number(input.awayAgainst.mean)) / 2;
  const awayExpected = (Number(input.awayFor.mean) + Number(input.homeAgainst.mean)) / 2;
  const variance = samples.reduce((sum, sample) => sum + Number(sample.variance) / 4, 0);
  return { mean: homeExpected + awayExpected, variance };
}

module.exports = { combineCountMatchup };
