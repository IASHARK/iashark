# Script-writing protocol for Shanon

This is a judgment process, not a Python check — read it and actually apply it
before writing a single line of script. It sits above the mechanical rules in
`/Users/clement/Desktop/Shanon avatar/SCRIPTS.md` (Annexe A: banned phrases,
duration, hook/info/payoff structure, pause-tag syntax) — those are the
grammar; this is what decides whether there's anything worth saying.

**Central rule, non-negotiable:** chase maximum viral potential — hook,
curiosity, emotion, identification, surprise, debate, share, comment — but
never at the cost of Shanon's credibility, naturalness, or coherence with who
she is (`PERSONA.md`). No fake scoop, no invented anecdote, no invented
certainty, no dishonest dramatization. If the choice is between more viral and
more honest, honest wins.

Think like a screenwriter + TikTok creator + editor, in that order, before you
write a single sentence.

## The full sequence

1. **Identify the content category** — prono du jour, actu foot, transfert/
   rumeur, analyse match après-match, préview match, opinion/débat,
   storytelling Shanon, or contenu lifestyle/tendance (see the research
   pipelines below; new categories get designed the same way). Each is
   researched and built differently — don't use one method for all of them.
2. **Decide the video's objective.** Categories share a research method, but
   not every video in a category wants the same thing: inform, provoke a
   reaction, create identification, deliver a prono, tell a story, reinforce
   proximity with Shanon, etc. Name it explicitly before researching further —
   chasing virality identically on every piece of content is how everything
   ends up sounding the same.
3. **Research, adapted to the category** (see below).
4. **Find several angles**, not one. Never just summarize — look for a
   tension, an opinion, a surprise, a contradiction, a popular misconception,
   a prediction, or something the audience probably doesn't know.
5. **Pick the angle with the strongest potential**, using the stop-scrolling
   test (see Final QC).
6. **Decide the video's overall tone, then pick ONE dominant emotion for the
   voice call — in that order.** The emotion follows from the angle, objective,
   and tone you just chose, not the other way around. Typical mappings (adapt,
   don't force):
   - Prono du jour → confiante / énergique
   - Grosse actu → intriguée / directe
   - Storytelling → naturelle / chaleureuse
   - Opinion / débat → assurée / provocatrice légère
7. **Build hook → progression/retention → payoff.** The opening creates a
   question in the viewer's head; don't answer it in sentence one. Build
   toward the payoff instead of front-loading it. Every sentence needs a job.
   **For the concrete craft of this — the stop-scroll reasons, the retention
   mechanic library, matching virality to content type — see
   `viral-mechanics-protocol.md`. Read it alongside this step, not after.**
   **Vary the intensity on purpose — a video is not 100% the whole way
   through.** Decide where it opens strong then eases off, where an anecdote
   gets room to breathe, where it accelerates into the payoff. A flat,
   constant energy level reads as fake as much as a flat, constant emotion
   does — this is the pacing counterpart of step 9's per-phrase emotional
   intention, and the two should be planned together.
8. **Write it in Shanon's voice** (`PERSONA.md`): her expertise level, her
   opinions, her personality — never generic, never interchangeable with
   another creator. Oral register only: short sentences, spoken vocabulary,
   natural breathing points, zero journalistic phrasing (see SCRIPTS.md
   Annexe A §4 for the exact banned list).
9. **Fold the emotional intention into the text itself, phrase by phrase —
   as a writing tool, not an API parameter.** Something like [intriguée] →
   [confiante] → [surprise] → [explication calme] → [conviction] → [petit
   sourire / provocation légère] → [chute] should shape word choice, sentence
   length, punctuation, repetition, natural pauses, rising intensity and
   rhythm — coherent with what she just said (she can't sound thrilled right
   after delivering bad news, or suddenly sharp with no setup). **This never
   becomes multiple TTS calls with different `emotion` values stitched
   together** — a same-night A/B test proved the seams between separately-
   generated segments are audible and flatten the result. One continuous
   voice call, one dominant emotion (from step 6); the phrase-by-phrase
   intention — and the intensity pacing from step 7 — lives in the writing,
   not in the API payload.
10. **Optimize for social performance**: hook strength, curiosity, emotion,
    identification, surprise, debate potential, shareability — while staying
    inside the central rule above. If hitting harder means inventing or
    exaggerating, don't.
11. **Fact-check.** Every number, odds figure, form record, or absence must
    trace back to a real source found during research. Never invent a stat —
    people bet real money on this content.
12. **Final QC — ask literally these six questions before calling the script
    done:**
    - Est-ce que je m'arrêterais de scroller pour ça ?
    - Est-ce que j'aurais envie de regarder jusqu'à la fin ?
    - Est-ce que ça ressemble vraiment à Shanon ?
    - Est-ce que ça donne envie de commenter / partager ?
    - Est-ce que chaque phrase mérite d'être là ?
    - **Est-ce qu'une vraie fille de 25 ans pourrait réellement filmer cette
      vidéo et la poster, sans que ça sente l'écrit-par-une-IA ou le fabriqué
      pour devenir viral ?** Weigh this one especially hard on storytelling /
      personal videos.
13. **Check same-day coherence.** Before writing the 2nd or 3rd video of the
    day, look at what's already been produced today (mood, hook pattern,
    content category, structural mechanic) and make sure this one doesn't
    repeat it. Vary the mechanic across the day's videos: opinion forte,
    révélation progressive, storytelling, analyse, réaction, question
    provocatrice, etc. — three videos with the same shape in one day is a
    failure of this step, not a coincidence. (Once `output/<date>/` folders
    exist for the day — see `pipeline.py`'s `output_paths()` — check what's
    already in there before starting the next script.)

Only after all of this does a script go to `check-script` (duration + banned
language) and then to voice generation.

## Research pipeline by content category

Every category has its own research-and-reasoning engine, with its own
sources, data, calculations, and selection criteria — worked through
**entirely before thinking about the script or the viral angle.** The
category decides *what to find out*; step 7 onward (this file, above) decides
*how to turn that into ten seconds someone watches to the end.* Don't collapse
these two phases — a great angle built on shallow research is still shallow.

**Research is redone from scratch for every single video, never recycled —
even for a topic you already know or already covered.** For a prono, the
matches, odds, and absences on the calendar have moved since the last time.
For an actu, the story has developed. For a trend, what works today may
already be different tomorrow. Knowing the general subject is not the same
as having done today's research on it — always run the category's pipeline
fresh, every time.

**Prono du jour**
Available matches → recent stats → home/away splits → xG/xGA → shots →
goals → absences/suspensions → schedule/fatigue → head-to-head if relevant →
odds from several bookmakers → convert odds to implied probabilities →
remove/estimate the bookmaker's margin → build your own probability estimate
from the data → compute the edge = estimated probability − market probability
→ optionally EV = (probability × odds) − 1 → compare several markets (1X2,
over/under, BTTS, handicaps, player props, etc.) → eliminate picks that are
too uncertain → select the best conviction/edge/explainability ratio → *only
then* work out how to turn that analysis into a video.

**Actu foot**
Aggregate several recent sources → identify the original source → verify
date/context/citations → separate confirmed from rumor → compare what the
different sources actually say → determine what's genuinely new → gauge how
much it matters to the audience → find 3–5 possible angles (an unexpected
consequence, a contradiction, "what this actually changes", a detail everyone
missed, a debate) → pick the angle with the best mix of novelty, credibility,
and social potential → script.

**Transfert / rumeur**
Original source → that journalist's/outlet's track record for reliability →
independent confirmations → the player's contract situation → time remaining
on it → value / playing time → both clubs' needs → financial feasibility →
competition from other clubs → separate interest / talks / a formal offer /
an agreement — these are not the same thing → produce a confidence level
rather than presenting a rumor as a certainty → find the viral angle.

**Analyse match après-match**
The score alone isn't enough → xG → clear-cut chances → shots / shots on
target → useful possession → attacking zones → tactical changes → individual
performances → the moments that actually swung the match → compare the
result against what really happened on the pitch → find "what the score
doesn't tell you" → script.

**Préview match**
Recent form weighted by opponent quality → home/away → tactical styles →
absences → rest/fatigue → what's at stake → individual matchups → offensive/
defensive data → likely scenarios → identify the one key to the match instead
of reciting fifteen stats → script.

**Opinion / débat**
Identify the real debate → gather the facts needed to frame it → for/against
arguments → spot the too-simplistic argument that's circulating → build
Shanon's actual personal position → find a formulation sharp enough to
provoke comments without manufacturing a fake controversy → script.

**Storytelling Shanon**
No statistical research needed: consult `PERSONA.md` + the continuity of
previous videos → identify only personal facts already established → choose
a relatable situation → tension/problem → personal detail → resolution/
payoff → above all, never invent a memory to make the story better.

**Contenu lifestyle / tendance**
Identify current TikTok/Instagram trends that are actually relevant →
check whether the trend genuinely fits Shanon → understand *why* the format
works → adapt it to her world instead of copying it → find the intersection
of "trend + Shanon's personality + football/daily life" → script.

**The governing principle for this section** (don't relitigate it, apply it):
"Je ne veux pas définir maintenant tous les calculs et toutes les sources. Je
veux que tu comprennes le principe : chaque thème du calendrier doit avoir
son propre research pipeline. À toi de déterminer et documenter, pour chaque
thème, quelles sources consulter, quelles données récupérer, quels calculs/
analyses effectuer, comment comparer les possibilités et quels critères
utiliser pour sélectionner le meilleur sujet/angle. Le script et
l'optimisation virale viennent APRÈS cette phase."
In other words: the eight pipelines above are a starting design, not a
locked spec. When a new content theme shows up that isn't one of these eight,
design its research pipeline the same way — sources, data, calculations,
comparison method, selection criteria — before writing anything, and document
it here so it's reusable next time.
