# Viral mechanics protocol for Shanon

This goes deeper than `script-writing-protocol.md`'s step 7 (hook →
progression/retention → payoff) and step 10 (optimize for social
performance) — those say *what* to aim for; this says *how* to actually
build it. Read both; this one doesn't replace the central rule in the other
file: never sacrifice credibility, naturalness, or coherence with Shanon for
virality.

A strong subject creates the opportunity; the construction below decides
whether that opportunity actually converts into attention. A great angle or
a genuinely big piece of news helps enormously — but the mechanics still have
to shape the writing from the angle choice onward, because the same subject
told flat gets scrolled past. Virality isn't a CTA bolted on at the end.

**Important distinction, don't conflate these two:** this file is about the
emotion the *viewer* feels watching (curiosity, surprise, doubt...). That's
different from the ONE dominant vocal `emotion` chosen for the TTS call in
`script-writing-protocol.md` step 6 (confiante/intriguée/chaleureuse/
provocatrice) — Shanon's voice carries one emotion; the video can still make
the viewer feel something else or several things across its length.

## 1. Find the reason to stop scrolling

Before writing the hook, identify what can create an immediate reaction in
someone who doesn't necessarily know Shanon: a surprising fact, a
contradiction, an unexpected opinion, a mistake a lot of people make, an
intriguing question, an important consequence, a relatable situation, a real
debate, a promise of an explanation or reveal.

The hook doesn't announce the subject. It creates a reason to want the next
sentence.
- ❌ "Aujourd'hui on va parler du match de ce soir."
- ✅ "Le marché que tout le monde regarde pour ce match, c'est justement celui
  que je toucherais pas."

**The hook has to come from this specific video's research, not a reusable
template.** It's easy for a hook to sound strong in isolation while actually
being interchangeable — "Personne ne parle de ça...", "Je vais vous dire un
truc...", "Vous allez être surpris...", "Attendez de voir ça..." all sound
viral individually, but thirty videos deep, that pattern reads as mechanical
rather than as Shanon. Never reach for a generic-sounds-viral opener just
because it sounds viral — build the hook out of the actual tension,
contradiction, fact, opinion, or consequence this specific research turned
up. A useful test: if the hook could be dropped unchanged onto five unrelated
videos, it's too generic — go back to the research and find what's actually
specific here.

## 2. Open a real question in the viewer's head

After the hook, the viewer should naturally want to know something: why did
she say that, what's the catch, what will she pick instead, is she right,
what actually happened.

Don't hand over the whole answer immediately if doing so leaves the video no
reason to keep watching. But don't artificially withhold information for 30
seconds just to fake suspense either — the progression has to keep adding
real information or real reasons to continue, not just delay.

## 2bis. Decide the exact payoff before writing a single sentence

**Before writing, state the payoff in one sentence: exactly what the viewer
gets at the end.** Not "elle donne son avis" or "elle explique pourquoi" —
the actual content of the reveal. If you can't write that one sentence,
the video isn't designed yet, only the hook is.

- Prono: hook "Le marché que tout le monde joue, je le toucherais pas" →
  payoff decided up front = the specific alternative market, and the one
  concrete reason it's better.
- Storytelling: hook "J'ai compris un truc assez gênant sur moi cette
  semaine" → payoff decided up front = the specific personal realization or
  turn, stated plainly, not vaguely gestured at.

This is what stops a video from opening strong and fizzling — a hook without
a decided payoff behind it tends to wander until it just... stops.

## 3. Every sentence has a job

At least one of: raise curiosity, deliver information, create an emotion,
advance the reasoning, create surprise, reinforce identification, or set up
the payoff. A sentence with none of these jobs gets cut. No filler, no long
intro, no needless repetition.

## 4. Pick a retention mechanic on purpose, and vary it

Choose one consciously before writing — don't default to the same one every
time:

- **Révélation progressive** — open with an intriguing claim, reveal why
  progressively.
- **Erreur → correction** — "Si tu fais X, voilà pourquoi c'est une erreur."
- **Contradiction** — "Tout le monde pense X. Le problème, c'est que…"
- **Question → réponse** — one strong question drives the whole video to
  its answer.
- **Histoire → retournement** — set up a situation, then something changes.
- **Opinion → justification** — Shanon states a position, then builds the
  reasoning behind it.
- **Analyse → découverte** — start from a fact or data point, arrive at a
  surprising conclusion.

**Vary the mechanic across the day's videos, and don't fall back into the
same one habitually across days either** — 30 videos into this, a Shanon who
always opens the same way is a Shanon who's become predictable, and
predictable stops working as a hook. Before picking today's mechanic for each
slot, check the `viral_mechanic` column of recent rows in
`editorial_calendar.csv` (not just today's — the last several days), not only
the same-day coherence check in `script-writing-protocol.md` step 13.

## 5. Choose the emotion the viewer should feel

Before writing: curiosité, surprise, amusement, identification, frustration,
admiration, doute, envie de répondre, confiance. A video doesn't need to be
aggressive or polarizing to provoke a reaction. Keep the choice coherent with
Shanon's personality and the subject (`PERSONA.md`) — this is a separate
decision from the vocal emotion in `script-writing-protocol.md` step 6, not a
duplicate of it, and also separate from the retention mechanic in §4 above —
log it in the calendar's `viewer_emotion` column, distinct from
`viral_mechanic`, so the two decisions stay visibly distinct instead of
blurring into one vague "vibe" call.

## 6. Build a real reason to comment or share

Ask: why would someone send this to a friend, or leave a comment? Reasons
look like "tu as vu ça ?", "je suis totalement d'accord / pas d'accord",
"c'est exactement moi", "je dois envoyer ça à mon pote", "je veux répondre à
son avis", "je ne savais pas ça". **Don't force engagement with a generic
"vous en pensez quoi ?" tacked onto every video** — if the video already gives
a real reason to react, that line is redundant; if it doesn't, that line
won't fix it. This is the concrete version of `script-writing-protocol.md`'s
"CTA chosen per objective, not defaulted" rule from the calendar protocol.

## 7. Match the virality mechanics to the content type

A conversion video and a storytelling video aren't built the same way:

| Content type | What drives its virality |
|---|---|
| Prono / Conversion | curiosité + expertise + confiance + tension |
| Actualité / Réaction | rapidité + surprise + opinion + réaction |
| Opinion / Débat | position claire + vrai point de friction + argument |
| Storytelling | identification + curiosité + progression émotionnelle |
| Éducation | erreur fréquente + simplicité + "aha moment" |
| Personnel / Lifestyle | authenticité + proximité + situation reconnaissable |

## The final rule

Don't try to make every single sentence "viral." Build one complete
experience: **STOP → CURIOSITÉ → PROGRESSION → PAYOFF → RÉACTION.**

Before calling the script done, ask (in addition to `script-writing-protocol.md`'s
six final-QC questions, not instead of them):

- Est-ce que le hook donne réellement envie de s'arrêter ?
- Est-ce que ce hook est spécifique à cette vidéo, ou pourrait-il être collé
  tel quel sur cinq autres sujets sans rien perdre ?
- Est-ce qu'il existe une raison de rester après les 3 premières secondes ?
- Est-ce que la curiosité ou la tension progresse réellement ?
- Est-ce que je peux formuler le payoff en une phrase claire, décidée avant
  l'écriture — pas juste "elle explique pourquoi" ?
- Est-ce que le payoff récompense le temps du spectateur ?
- Est-ce que quelqu'un aurait une vraie raison de commenter ou partager ?
- Est-ce que cette vidéo pourrait intéresser quelqu'un qui ne connaît pas
  encore Shanon ?
