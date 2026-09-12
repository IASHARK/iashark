# Research methods protocol for Shanon

`editorial_calendar.csv`'s `research_method` column must be one of the slugs
defined here — not a vague free-text description like "football research."
The slug tells you exactly which concrete process to run before writing
anything. This expands `script-writing-protocol.md`'s "Research pipeline by
content category" section into fully operational, step-by-step procedures;
where a method below matches one of those eight pipelines, this is the same
method under its canonical slug, made more concrete.

Validated slugs (`RESEARCH_METHODS` in `pipeline.py`):

```
prono_data_analysis
breaking_news_research
reaction_context_research
transfer_rumor_analysis
post_match_analysis
match_preview_analysis
opinion_fact_research
education_explanation_research
community_comment_analysis
persona_only_storytelling
trend_discovery_research
```

If a real need arises for a content type that doesn't fit any of these,
design its process the same way (sources → data → comparison → selection
criteria → abandon threshold) and add it here with a new slug — the same
open-ended instruction as `script-writing-protocol.md`'s closing principle.

---

## `prono_data_analysis`

**The most important one — read this whole section, not just the steps.**

### The seven-step workflow

1. **Identify every available event** for the relevant period (today's
   fixtures, or the relevant window). Don't start from "there's a big match
   tonight" — start from the full list.
2. **For each event, gather the needed data**: recent form (last ~5-10
   matches, weighted toward recent), home/away split, underlying performance
   (xG/xGA if available, not just goals), key absences/suspensions, rest/
   schedule congestion, head-to-head only as light context (see below), and
   odds from at least two bookmakers for the markets under consideration.
3. **Eliminate events without enough real data.** No verifiable recent form,
   no odds found, or a squad situation too unclear (major line-up doubt) —
   drop it. An event with thin data doesn't get a weaker pick, it gets
   dropped entirely.
4. **Generate several candidate markets per remaining event** — not one.
   1X2, over/under, BTTS, handicap/DNB, a specific player prop if the data
   supports it. Looking at only one market per match is how you miss the
   actual value.
5. **Compare every candidate market against the data**: for each, compute
   the market's implied probability (see calculations below) and set it
   against your own read of the data. Do this across events and markets, not
   just within one match.
6. **Find where the real justification is** — the candidate(s) where your
   independent read and the market price actually disagree, and where you
   can explain *why* in one or two concrete factors (not five vague ones).
   That disagreement, with a real explanation, is the edge.
7. **Decide**: either select the strongest justified pick, or — if nothing
   clears the bar — **no prono today**, produce a different content type for
   that slot instead. This is `editorial-calendar-protocol.md`'s "never force
   a prono" rule; this is the workflow that actually implements it.

### Calculations that are real and worth using

- **Implied probability from decimal odds** = `1 / odds`. Plain, correct math.
- **De-vig / removing the bookmaker's margin**: sum the implied probabilities
  across all outcomes of a market; if it's above 100%, that's the overround.
  Normalize each outcome (`implied_prob / sum_of_implied_probs`) to get the
  market's "fair" probability estimate. Standard practice, defensible.
- **Comparing odds across bookmakers** for the same market — the best
  available price for a side matters, and disagreement between bookmakers is
  itself a signal worth noting.
- **xG / underlying performance over goals alone** — goals are a small,
  noisy sample; shot quality and xG trends are a better read of true form
  over a short window, when the data is available.
- **Home/away splits** — a real, moderate effect, worth factoring in.
- **Edge = your estimated probability − the market's de-vigged probability.**
  This is literally what "finding value" means, and it's only as good as the
  estimate feeding it — which is why steps 1-4 have to be real, not skipped.
- **EV = (your probability × the offered odds) − 1** — correct formula,
  same caveat: only as good as the input probability.

### What NOT to do — false precision

**Never build a composite "power score" or "confidence percentage" out of
many arbitrary weighted stats (10, 20, 47 — doesn't matter).** A formula like
`form × 0.2 + xG × 0.15 + home × 0.1 + injuries × 0.1 + ...` with weights that
were never actually validated against real outcomes is not more rigorous than
a gut read — it's a gut read wearing a lab coat. It creates a false sense of
scientific precision without earning it. Concretely:

- Don't output a fabricated confidence number ("73.2% chance") unless it
  traces directly to the de-vig math above — a made-up-sounding-precise
  number is worse than an honest qualitative one.
- Don't treat head-to-head history as a strong signal — small samples,
  squads change season to season, it's context at most, never a deciding
  factor on its own.
- Don't treat a small recent-form sample (e.g. "won the last 3") as strongly
  predictive on its own — pair it with underlying performance data or don't
  use it.
- State the reasoning in plain language (the one or two concrete factors that
  actually drove the pick), not a score. That's what makes the pick
  explicable — and defensible — later.

The goal is a reproducible way to compare real opportunities honestly, not a
model that pretends to predict football.

---

## `breaking_news_research`

Aggregate several recent sources → identify the original source → verify
date/context/citations → separate confirmed from rumor → compare what the
different sources actually say → determine what's genuinely new → gauge how
much it matters to the audience → find 3-5 possible angles (an unexpected
consequence, a contradiction, "what this actually changes", a detail everyone
missed, a debate) → pick the angle with the best mix of novelty, credibility,
and social potential → script. Abandon if nothing verifiable and genuinely
new is found — an old story re-told isn't "breaking."

## `reaction_context_research`

Lighter than `breaking_news_research` — for reacting to something already
known/public (a result, a public statement, a widely-seen clip), not breaking
it. Confirm the event actually happened as described (primary source, not a
screenshot of a screenshot) → gather just enough context to react
intelligently (what led to it, why people care) → find Shanon's genuine angle
on it (agreement, disagreement, a detail others are missing) → don't pad with
background the audience already has. Abandon if the "reaction" would just be
restating the news with no real point of view.

## `transfer_rumor_analysis`

Original source → that journalist's/outlet's track record for reliability →
independent confirmations → the player's contract situation → time remaining
on it → value / playing time → both clubs' needs → financial feasibility →
competition from other clubs → separate interest / talks / a formal offer /
an agreement — these are not the same thing → produce a confidence level
rather than presenting a rumor as a certainty → find the angle. Abandon (or
clearly frame as low-confidence) if there's only one uncorroborated source.

## `post_match_analysis`

The score alone isn't enough → xG → clear-cut chances → shots / shots on
target → useful possession → attacking zones → tactical changes → individual
performances → the moments that actually swung the match → compare the
result against what really happened on the pitch → find "what the score
doesn't tell you" → script.

## `match_preview_analysis`

Recent form weighted by opponent quality → home/away → tactical styles →
absences → rest/fatigue → what's at stake → individual matchups → offensive/
defensive data → likely scenarios → identify the one key to the match instead
of reciting fifteen stats → script.

## `opinion_fact_research`

Identify the real debate → gather the facts needed to frame it → for/against
arguments → spot the too-simplistic argument that's circulating → build
Shanon's actual personal position → find a formulation sharp enough to
provoke comments without manufacturing a fake controversy → script.

## `education_explanation_research`

Identify a genuinely common misconception or knowledge gap (not an obscure
one nobody has) → research the correct explanation precisely enough to state
it confidently → simplify without becoming inaccurate → find the single
clearest example or comparison that makes it click → build toward the "aha
moment" as the payoff, not the opener. Abandon if the correct explanation
itself is genuinely contested/unclear — don't teach something shaky as fact.

## `community_comment_analysis`

Start from a real question or objection an actual follower asked (not an
invented one) → make sure it's representative (more than one person asking
something similar is a stronger signal than a single comment) → answer it
directly and specifically → let expertise or personality carry the answer,
not a generic reply. Abandon if no real recurring question/objection exists
to respond to — don't invent a comment to react to.

## `persona_only_storytelling`

No statistical research needed: consult `PERSONA.md` + the continuity of
previous videos → identify only personal facts already established → choose
a relatable situation → tension/problem → personal detail → resolution/
payoff → above all, never invent a memory to make the story better. Abandon
or go back to the user if the story needs a fact not in `PERSONA.md` — that's
a conversation to have, not something to invent.

## `trend_discovery_research`

Identify current TikTok/Instagram trends that are actually relevant → check
whether the trend genuinely fits Shanon → understand *why* the format works
→ adapt it to her world instead of copying it → find the intersection of
"trend + Shanon's personality + football/daily life" → script. Abandon if the
trend doesn't survive that intersection test — a trend that only works by
force-fitting Shanon into it isn't worth doing.
