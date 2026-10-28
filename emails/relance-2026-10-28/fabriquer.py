# E-mails de relance IASHARK du mercredi 28/10/2026 (5 segments x fr/en/es), envoyes a 11 h (Paris).
# Segments : partenaire (a clique « Devenir partenaire » sans candidater), accord / sans_accord
# (comptes gratuits jamais abonnes : essai de 7 jours propose), ancien (ancien abonne : pas d'essai).
# Aucun e-mail aux abonnes en cours (regle dans supabase/functions/relance-emails/index.ts).
#
# Sorties :
#   supabase/functions/relance-emails/paquet.ts  (textes et gabarits lus par la fonction)
#   emails/relance-2026-10-28/sortie/             (pages et apercus, non suivis par git)
# Repere %%DIR%% : dossier du site de la personne (fr, en, es, gb, za, mx), remplace a l'envoi.
# Repere %%DESINSCRIPTION%% : lien de desinscription signe, remplace a l'envoi.
# Aucune emoticone, aucune promesse de gain, aucun chiffre de resultats, aucune fausse urgence.
import json, os, html, re

ICI = os.path.dirname(os.path.abspath(__file__))
RACINE = os.path.abspath(os.path.join(ICI, "..", ".."))
OUT = os.path.join(ICI, "sortie")
os.makedirs(OUT, exist_ok=True)
PAQUET_TS = os.path.join(RACINE, "supabase", "functions", "relance-emails", "paquet.ts")

SITE = "https://iashark.com"
IMG = SITE + "/assets/emails/2026-10-28/banniere-{l}.jpg"
IMG_LOCALE = os.path.join(RACINE, "assets", "emails", "2026-10-28", "banniere-{l}.jpg")
TG = "https://t.me/iasharkdata"
UTM = "utm_source=email&utm_medium=email&utm_campaign=relance-28-10-{s}"
OFFERT_ID = 1550172  # Monza - Naples, match offert du jour (data-home.json : is_free)

LIGUES = {
    "dfb": {"fr": "Coupe d'Allemagne", "en": "German Cup", "es": "Copa de Alemania"},
    "seriea": {"fr": "Serie A", "en": "Serie A", "es": "Serie A"},
    "efl": {"fr": "Coupe de la Ligue anglaise", "en": "League Cup", "es": "Copa de la Liga inglesa"},
    "sco": {"fr": "Championnat d'Écosse", "en": "Scottish Premiership", "es": "Liga escocesa"},
}

# Heure de Paris, identifiant (data-home.json du 28/10), noms par langue, ligue, match offert.
MATCHS = [
    ("18:00", 1638564, {"fr": ("SC Fribourg", "Wolfsburg"), "en": ("SC Freiburg", "Wolfsburg"), "es": ("Friburgo", "Wolfsburgo")}, "dfb", False),
    ("18:30", 1550167, {"fr": ("AC Milan", "Bologne"), "en": ("AC Milan", "Bologna"), "es": ("AC Milan", "Bolonia")}, "seriea", False),
    ("20:30", 1640575, {"fr": ("Manchester City", "Brighton"), "en": ("Manchester City", "Brighton"), "es": ("Manchester City", "Brighton")}, "efl", False),
    ("20:45", 1550172, {"fr": ("Monza", "Naples"), "en": ("Monza", "Napoli"), "es": ("Monza", "Nápoles")}, "seriea", True),
    ("20:45", 1550171, {"fr": ("Genoa", "Juventus"), "en": ("Genoa", "Juventus"), "es": ("Génova", "Juventus")}, "seriea", False),
    ("21:00", 1640388, {"fr": ("Liverpool", "Chelsea"), "en": ("Liverpool", "Chelsea"), "es": ("Liverpool", "Chelsea")}, "efl", False),
    ("21:00", 1556691, {"fr": ("Hearts", "Rangers"), "en": ("Hearts", "Rangers"), "es": ("Hearts", "Rangers")}, "sco", False),
]


def heure(h, l):
    hh, mm = h.split(":")
    if l == "fr":
        return f"{int(hh)}h{mm}"
    if l == "es":
        return h
    h12 = int(hh) - 12 if int(hh) > 12 else int(hh)
    return f"{h12}{'' if mm == '00' else ':' + mm}pm"


def affiche(mid, l):
    for _, i, noms, _, _ in MATCHS:
        if i == mid:
            d, e = noms[l]
            return f"{d} vs {e}" if l == "en" else f"{d} – {e}"
    raise KeyError(mid)


T = {
 "fr": {
  "date": "Mercredi 28 octobre", "soir": "Ce soir", "offert": "OFFERT", "heures": "Heures de Paris.",
  "tg_t": "La chaîne Telegram gratuite",
  "tg_p": "Chaque jour : le match offert et les résultats de la veille, gagnés et perdus.",
  "tg_b": "Rejoindre la chaîne Telegram", "suivre": "Suis IASHARK partout", "sig": "À ce soir,", "nom": "Clément, IASHARK",
  "rep": "Une question, un avis ? Réponds simplement à cet e-mail, c'est moi qui lis.",
  "desinscr": "Se désinscrire",
  "alt": "Ce soir, Monza – Naples est offert, 20h45",
 },
 "en": {
  "date": "Wednesday 28 October", "soir": "Tonight", "offert": "FREE", "heures": "Paris time.",
  "tg_t": "The free Telegram channel",
  "tg_p": "Every day: the free match and yesterday's results, won and lost.",
  "tg_b": "Join the Telegram channel", "suivre": "Follow IASHARK", "sig": "See you tonight,", "nom": "Clément, IASHARK",
  "rep": "A question, some feedback? Just reply to this email, I read every one myself.",
  "desinscr": "Unsubscribe",
  "alt": "Tonight, Monza vs Napoli is free, 8:45pm Paris time",
 },
 "es": {
  "date": "Miércoles 28 de octubre", "soir": "Esta noche", "offert": "GRATIS", "heures": "Hora de París.",
  "tg_t": "El canal de Telegram gratuito",
  "tg_p": "Cada día: el partido gratis y los resultados del día anterior, ganados y perdidos.",
  "tg_b": "Unirme al canal de Telegram", "suivre": "Sigue a IASHARK", "sig": "Hasta esta noche,", "nom": "Clément, IASHARK",
  "rep": "¿Una pregunta, una opinión? Responde a este correo, lo leo yo mismo.",
  "desinscr": "Darse de baja",
  "alt": "Esta noche, Monza – Nápoles es gratis, 20:45",
 },
}

# Ce qui a change sur IASHARK ces dernieres semaines (vrai pour tous les comptes gratuits).
CHANGE = {
 "fr": ["pour chaque match analysé, <b>un pari avec sa cote et sa chance calculée</b> ;",
        "<b>les combinés du jour</b> : un petit et un grand ;",
        "<b>un match offert chaque jour</b>, avec son analyse complète ;",
        "<b>une chaîne Telegram gratuite</b> pour tout suivre au quotidien."],
 "en": ["for every match we analyse, <b>a pick with its odds and its calculated chance</b>;",
        "<b>the combos of the day</b>: a small one and a big one;",
        "<b>one free match every day</b>, with its full analysis;",
        "<b>a free Telegram channel</b> to follow it all, day by day."],
 "es": ["para cada partido analizado, <b>una apuesta con su cuota y su probabilidad calculada</b>;",
        "<b>las combinadas del día</b>: una pequeña y una grande;",
        "<b>un partido gratis cada día</b>, con su análisis completo;",
        "<b>un canal de Telegram gratuito</b> para seguirlo todo a diario."],
}
GRATUIT_PRO = {
 "fr": "Avec ton compte gratuit : le match offert de chaque jour et le Petit combiné. Avec Pro : le pari de chaque match, le Grand combiné et la Sélection en or.",
 "en": "With your free account: the free match every day and the small combo. With Pro: the pick for every match, the big combo and the Gold selection.",
 "es": "Con tu cuenta gratuita: el partido gratis de cada día y la combinada pequeña. Con Pro: la apuesta de cada partido, la combinada grande y la Selección de oro.",
}
# Essai : seulement pour un premier abonnement au mois (supabase/functions/create-checkout-session/trial.ts).
ESSAI = {
 "fr": ("Envie de tout voir ? 7 jours de Pro offerts",
        "L'essai de 7 jours est réservé à un premier abonnement au mois : ta carte est demandée, rien n'est prélevé pendant l'essai. "
        "Ensuite, le prix du mois affiché sur la page, prélevé automatiquement sauf résiliation avant la fin de l'essai, en ligne depuis Mon compte.",
        "Démarrer mon essai gratuit", "/%%DIR%%/abonnement.html?duree=month"),
 "en": ("Want to see everything? Try Pro free for 7 days",
        "The 7-day trial is for a first monthly subscription: your card is requested, nothing is charged during the trial. "
        "Then the monthly price shown on the page, charged automatically unless you cancel before the trial ends, online from your account.",
        "Start my free trial", "/%%DIR%%/abonnement.html?duree=month"),
 "es": ("¿Quieres verlo todo? 7 días de Pro gratis",
        "La prueba de 7 días es para una primera suscripción mensual: se pide tu tarjeta, no se cobra nada durante la prueba. "
        "Después, el precio mensual que aparece en la página, cobrado automáticamente salvo que canceles antes del final de la prueba, en línea desde tu cuenta.",
        "Empezar mi prueba gratis", "/%%DIR%%/abonnement.html?duree=month"),
}
MATCH_OFFERT = f"/%%DIR%%/match.html?id={OFFERT_ID}"

SEG = {
 "partenaire": {
  "fr": dict(sujet="Le programme Partenaires IASHARK : candidature en deux minutes",
    pre="40 % de chaque paiement de tes abonnés Pro, à chaque renouvellement. Français, anglais et espagnol acceptés.",
    titre="Deviens partenaire d'IASHARK",
    corps=["Bonjour, c'est Clément, le créateur d'IASHARK. Merci pour ton intérêt pour le programme Partenaires. Voici comment ça marche :",
           ["<b>40 % de chaque paiement</b> des abonnés Pro que tu amènes, à chaque renouvellement ;",
            "la candidature prend <b>deux minutes</b>, depuis la page Partenaires ;",
            "chaque candidature est <b>étudiée à la main</b>, et tu reçois la réponse par e-mail ;",
            "français, anglais et espagnol sont acceptés."]],
    cta="Candidater en deux minutes", lien="/%%DIR%%/partenaires.html#candidature", bonus=None,
    pied="Tu reçois cet e-mail parce que tu as cliqué sur « Déposer ma candidature » dans ton compte IASHARK."),
  "en": dict(sujet="The IASHARK Partner programme: apply in two minutes",
    pre="40% of every payment from your Pro subscribers, at every renewal. English, French and Spanish accepted.",
    titre="Become an IASHARK partner",
    corps=["Hi, it's Clément, the founder of IASHARK. Thank you for your interest in our Partner programme. Here is how it works:",
           ["<b>40% of every payment</b> from the Pro subscribers you bring, at every renewal;",
            "applying takes <b>two minutes</b>, from the Partners page;",
            "every application is <b>reviewed by hand</b>, and you get the answer by email;",
            "English, French and Spanish are all accepted."]],
    cta="Apply in two minutes", lien="/%%DIR%%/partenaires.html#candidature", bonus=None,
    pied="You are receiving this email because you clicked “Apply now” in the Partners section of your IASHARK account."),
  "es": dict(sujet="El programa IASHARK Partners: solicitud en dos minutos",
    pre="El 40 % de cada pago de tus suscriptores Pro, en cada renovación. Se aceptan español, francés e inglés.",
    titre="Hazte partner de IASHARK",
    corps=["Hola, soy Clément, el creador de IASHARK. Gracias por tu interés en el programa IASHARK Partners. Así funciona:",
           ["<b>el 40 % de cada pago</b> de los suscriptores Pro que traigas, en cada renovación;",
            "la solicitud lleva <b>dos minutos</b>, desde la página Partners;",
            "cada solicitud se <b>revisa a mano</b>, y recibes la respuesta por correo;",
            "se aceptan español, francés e inglés."]],
    cta="Enviar mi solicitud", lien="/%%DIR%%/partenaires.html#candidature", bonus=None,
    pied="Recibes este correo porque hiciste clic en «Enviar mi solicitud» en tu cuenta IASHARK."),
 },
 "accord": {
  "fr": dict(sujet="Ton match offert ce soir : Monza – Naples",
    pre="Et aussi Liverpool – Chelsea, Manchester City – Brighton, Genoa – Juventus. Tout est prêt sur ton compte.",
    titre="Ce soir, Monza – Naples est offert",
    corps=["Bonjour, c'est Clément, le créateur d'IASHARK. Ces dernières semaines, le site a beaucoup changé :",
           CHANGE["fr"], GRATUIT_PRO["fr"],
           "Pour voir le pari de <b>Monza – Naples</b>, sa cote et sa chance calculée, il suffit de te connecter à ton compte."],
    cta="Voir le match offert", lien=MATCH_OFFERT, bonus=ESSAI["fr"],
    pied="Tu reçois cet e-mail parce que tu as accepté les e-mails d'IASHARK à ton inscription."),
  "en": dict(sujet="Your free match tonight: Monza vs Napoli",
    pre="Plus Liverpool vs Chelsea, Manchester City vs Brighton, Genoa vs Juventus. Everything is ready on your account.",
    titre="Tonight, Monza vs Napoli is on us",
    corps=["Hi, it's Clément, the founder of IASHARK. A lot has changed on the site in the last few weeks:",
           CHANGE["en"], GRATUIT_PRO["en"],
           "To see the pick for <b>Monza vs Napoli</b>, its odds and its calculated chance, just log in to your account."],
    cta="See the free match", lien=MATCH_OFFERT, bonus=ESSAI["en"],
    pied="You are receiving this email because you agreed to IASHARK emails when you signed up."),
  "es": dict(sujet="Tu partido gratis esta noche: Monza – Nápoles",
    pre="Y también Liverpool – Chelsea, Manchester City – Brighton, Génova – Juventus. Todo está listo en tu cuenta.",
    titre="Esta noche, Monza – Nápoles es gratis",
    corps=["Hola, soy Clément, el creador de IASHARK. En las últimas semanas el sitio ha cambiado mucho:",
           CHANGE["es"], GRATUIT_PRO["es"],
           "Para ver la apuesta de <b>Monza – Nápoles</b>, su cuota y su probabilidad calculada, solo tienes que iniciar sesión en tu cuenta."],
    cta="Ver el partido gratis", lien=MATCH_OFFERT, bonus=ESSAI["es"],
    pied="Recibes este correo porque aceptaste los correos de IASHARK al registrarte."),
 },
 "sans_accord": {
  "fr": dict(sujet="Ton compte IASHARK : ce soir, Liverpool – Chelsea",
    pre="Ton compte est toujours actif. Ce soir, un match offert : Monza – Naples, 20h45.",
    titre="Ton compte IASHARK t'attend",
    corps=["Bonjour, c'est Clément, le créateur d'IASHARK. Tu as un compte chez nous, et ces dernières semaines le site a beaucoup changé :",
           CHANGE["fr"], GRATUIT_PRO["fr"],
           "Ce soir : Liverpool – Chelsea, Manchester City – Brighton, Genoa – Juventus, et <b>Monza – Naples</b>, le match offert du jour (Serie A, 20h45)."],
    cta="Voir le match offert", lien=MATCH_OFFERT, bonus=ESSAI["fr"],
    pied="Tu reçois ce message parce que tu as un compte IASHARK."),
  "en": dict(sujet="Your IASHARK account: Liverpool vs Chelsea tonight",
    pre="Your account is still active. Tonight's free match: Monza vs Napoli, 8:45pm Paris time.",
    titre="Your IASHARK account is waiting",
    corps=["Hi, it's Clément, the founder of IASHARK. You have an account with us, and a lot has changed on the site in the last few weeks:",
           CHANGE["en"], GRATUIT_PRO["en"],
           "Tonight: Liverpool vs Chelsea, Manchester City vs Brighton, Genoa vs Juventus, and <b>Monza vs Napoli</b>, today's free match (Serie A, 8:45pm Paris time)."],
    cta="See the free match", lien=MATCH_OFFERT, bonus=ESSAI["en"],
    pied="You are receiving this message because you have an IASHARK account."),
  "es": dict(sujet="Tu cuenta IASHARK: esta noche, Liverpool – Chelsea",
    pre="Tu cuenta sigue activa. El partido gratis de esta noche: Monza – Nápoles, 20:45.",
    titre="Tu cuenta IASHARK te espera",
    corps=["Hola, soy Clément, el creador de IASHARK. Tienes una cuenta con nosotros, y en las últimas semanas el sitio ha cambiado mucho:",
           CHANGE["es"], GRATUIT_PRO["es"],
           "Esta noche: Liverpool – Chelsea, Manchester City – Brighton, Génova – Juventus, y <b>Monza – Nápoles</b>, el partido gratis del día (Serie A, 20:45)."],
    cta="Ver el partido gratis", lien=MATCH_OFFERT, bonus=ESSAI["es"],
    pied="Recibes este mensaje porque tienes una cuenta IASHARK."),
 },
 # Ancien abonne : sa semaine de Pro offerte (relance du 20/10) a pris fin le mardi 27/10.
 # Prix reel du mois en euros : 14,99 EUR depuis le 25/10/2026 (19,95 EUR avant), config/markets.json.
 # Pas d'essai : deja abonne une fois (trial.ts).
 "ancien": {
  "fr": dict(sujet="Ta semaine Pro est terminée : le mois passe à 14,99 €",
    pre="Avant 19,95 € par mois, maintenant 14,99 €, sans engagement. Ce soir, Liverpool – Chelsea et Monza – Naples offert.",
    titre="Merci d'avoir essayé ta semaine Pro",
    corps=["Bonjour, c'est Clément, le créateur d'IASHARK. Ta semaine de Pro offerte s'est terminée hier, mardi 27 octobre, et ton compte est repassé en gratuit. Rien ne t'a été prélevé pour cette semaine.",
           "Si tu veux rester en Pro : depuis le 25 octobre, le mois coûte <b>14,99 €</b> au lieu de 19,95 €, sans engagement, résiliable en ligne depuis Mon compte.",
           "Avec Pro : le pari de chaque match avec sa cote et sa chance calculée, le Grand combiné et la Sélection en or. Ce soir : Liverpool – Chelsea, Manchester City – Brighton, Genoa – Juventus, et d'autres.",
           "Et si quelque chose ne t'a pas plu pendant ta semaine, réponds à cet e-mail : je veux le savoir."],
    cta="Rester en Pro à 14,99 € par mois", lien="/%%DIR%%/abonnement.html?duree=month", bonus=None,
    pied="Tu reçois cet e-mail parce que tu as été abonné à IASHARK."),
  # Anglais : pas de prix ecrit (livre, rand ou dollar selon le pays ; prix du Royaume-Uni inchange).
  "en": dict(sujet="Your Pro week is over: thank you for trying it",
    pre="Your account is back to free. If you want to stay with Pro, it is monthly and you can cancel anytime.",
    titre="Thank you for trying your Pro week",
    corps=["Hi, it's Clément, the founder of IASHARK. Your free week of Pro ended yesterday, Tuesday 27 October, and your account is back to free. You were not charged anything for that week.",
           "If you want to stay with Pro: monthly, no commitment, cancel online from your account. The price is shown on the page before you pay.",
           "With Pro: the pick for every match with its odds and its calculated chance, the big combo and the Gold selection. Tonight: Liverpool vs Chelsea, Manchester City vs Brighton, Genoa vs Juventus, and more.",
           "And if something did not convince you during your week, reply to this email: I want to know."],
    cta="Stay with Pro", lien="/%%DIR%%/abonnement.html?duree=month", bonus=None,
    pied="You are receiving this email because you were an IASHARK subscriber."),
  "es": dict(sujet="Tu semana Pro ha terminado: el mes pasa a 14,99 €",
    pre="Antes 19,95 € al mes, ahora 14,99 €, sin permanencia. Esta noche, Liverpool – Chelsea y Monza – Nápoles gratis.",
    titre="Gracias por probar tu semana Pro",
    corps=["Hola, soy Clément, el creador de IASHARK. Tu semana de Pro gratis terminó ayer, martes 27 de octubre, y tu cuenta ha vuelto a ser gratuita. No se te ha cobrado nada por esa semana.",
           "Si quieres seguir con Pro: desde el 25 de octubre, el mes cuesta <b>14,99 €</b> en lugar de 19,95 €, sin permanencia, y puedes cancelar en línea desde tu cuenta.",
           "Con Pro: la apuesta de cada partido con su cuota y su probabilidad calculada, la combinada grande y la Selección de oro. Esta noche: Liverpool – Chelsea, Manchester City – Brighton, Génova – Juventus, y más.",
           "Y si algo no te convenció durante tu semana, responde a este correo: quiero saberlo."],
    cta="Seguir con Pro a 14,99 € al mes", lien="/%%DIR%%/abonnement.html?duree=month", bonus=None,
    pied="Recibes este correo porque fuiste suscriptor de IASHARK."),
 },
}

C = dict(fond="#060b12", carte="#0a1420", bord="#16222f", cyan="#20d5ef", blanc="#f4f7fb", gris="#91a0b3", gris2="#c9d3de")
POLICE = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif"

ICONES = SITE + "/assets/emails/icones"
RESEAUX = [("youtube", "YouTube", "@IASHARK", "https://www.youtube.com/@IASHARK"),
           ("x", "X", "@IASHARK1", "https://x.com/IASHARK1"),
           ("instagram", "Instagram", "@IASHARK", "https://www.instagram.com/iashark/"),
           ("tiktok", "TikTok", "@iashark_data", "https://www.tiktok.com/@iashark_data"),
           ("tiktok", "TikTok", "@iasharkdata", "https://www.tiktok.com/@iasharkdata")]


def reseaux():
    return "".join(
        f'<td align="center" style="padding:0 7px;vertical-align:top;width:72px;"><a href="{u}" target="_blank" style="text-decoration:none;">'
        f'<img src="{ICONES}/{i}.png" width="36" height="36" alt="{n}" style="display:block;margin:0 auto 6px;border:0;"></a>'
        f'<a href="{u}" target="_blank" style="font-family:{POLICE};font-size:10px;line-height:1.3;color:{C["gris"]};text-decoration:none;">{h}</a></td>'
        for i, n, h, u in RESEAUX)


def bouton(texte, url, plein=True):
    fond = C["cyan"] if plein else "transparent"
    coul = "#04121a" if plein else C["cyan"]
    return (f'<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" bgcolor="{fond}" '
            f'style="border-radius:10px;border:1.5px solid {C["cyan"]};">'
            f'<a href="{url}" target="_blank" style="display:inline-block;padding:15px 28px;font-family:{POLICE};font-size:16px;'
            f'font-weight:700;line-height:1;color:{coul};text-decoration:none;border-radius:10px;">{html.escape(texte)}</a></td></tr></table>')


def puces(items):
    return ('<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 14px;">' + "".join(
        f'<tr><td style="width:18px;padding:3px 0 7px;vertical-align:top;font-family:{POLICE};font-size:16px;line-height:1.55;color:{C["cyan"]};font-weight:700;">&#8211;</td>'
        f'<td style="padding:3px 0 7px;font-family:{POLICE};font-size:16px;line-height:1.55;color:{C["gris2"]};">{it}</td></tr>'
        for it in items) + '</table>')


def rendre(seg, l, desinscr):
    s, t = SEG[seg][l], T[l]
    u = UTM.format(s=seg)

    def lien(p):
        base, _, ancre = p.partition("#")
        return f"{SITE}{base}{'&' if '?' in base else '?'}{u}" + (f"#{ancre}" if ancre else "")

    partenaire = seg == "partenaire"
    lignes = []
    for h, mid, noms, lg, offert in MATCHS:
        d, e = noms[l]
        sep = " vs " if l == "en" else " – "
        badge = (f'&nbsp;<span style="display:inline-block;padding:2px 7px;border-radius:5px;background:{C["cyan"]};color:#04121a;'
                 f'font-size:11px;font-weight:700;letter-spacing:.5px;vertical-align:1px;">{t["offert"]}</span>') if offert else ""
        lignes.append(
            f'<tr><td style="padding:11px 0;border-top:1px solid {C["bord"]};font-family:{POLICE};font-size:14px;color:{C["cyan"]};'
            f'font-weight:700;width:70px;vertical-align:top;">{heure(h, l)}</td>'
            f'<td style="padding:11px 0;border-top:1px solid {C["bord"]};font-family:{POLICE};font-size:15px;line-height:1.35;">'
            f'<a href="{lien(f"/%%DIR%%/match.html?id={mid}")}" style="color:{C["blanc"]};text-decoration:none;font-weight:600;">'
            f'{html.escape(d)}{sep}{html.escape(e)}</a>{badge}'
            f'<br><span style="font-size:12px;color:{C["gris"]};">{html.escape(LIGUES[lg][l])}</span></td></tr>')
    corps = "".join(puces(p) if isinstance(p, list) else
                    f'<p style="margin:0 0 14px;font-family:{POLICE};font-size:16px;line-height:1.6;color:{C["gris2"]};">{p}</p>'
                    for p in s["corps"])
    bonus = ""
    if s["bonus"]:
        bt, bp, bb, bl = s["bonus"]
        bonus = (f'<tr><td class="pad" style="padding:0 32px 28px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" '
                 f'style="border:1px solid {C["bord"]};border-radius:12px;"><tr><td style="padding:22px 22px 24px;">'
                 f'<p style="margin:0 0 8px;font-family:{POLICE};font-size:17px;font-weight:700;line-height:1.35;color:{C["blanc"]};">{html.escape(bt)}</p>'
                 f'<p style="margin:0 0 18px;font-family:{POLICE};font-size:14px;line-height:1.6;color:{C["gris"]};">{html.escape(bp)}</p>'
                 f'{bouton(bb, lien(bl), plein=False)}</td></tr></table></td></tr>')
    banniere = "" if partenaire else (
        f'<tr><td><a href="{lien(MATCH_OFFERT)}" target="_blank"><img src="{IMG.format(l=l)}" width="600" alt="{html.escape(t["alt"])}" '
        f'style="display:block;width:100%;max-width:600px;height:auto;border:0;border-radius:18px 18px 0 0;"></a></td></tr>')
    soiree = "" if partenaire else (
        f'<tr><td class="pad" style="padding:0 32px 26px;">'
        f'<p style="margin:0 0 6px;font-family:{POLICE};font-size:17px;font-weight:700;color:{C["blanc"]};">{t["soir"]}</p>'
        f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">{"".join(lignes)}</table>'
        f'<p style="margin:10px 0 0;font-family:{POLICE};font-size:12px;color:{C["gris"]};">{t["heures"]}</p></td></tr>')
    telegram = "" if partenaire else (
        f'<tr><td class="pad" style="padding:0 32px 28px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid {C["bord"]};"><tr><td style="padding-top:22px;">'
        f'<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding-right:14px;vertical-align:top;"><a href="{TG}" target="_blank"><img src="{ICONES}/telegram.png" width="40" height="40" alt="Telegram" style="display:block;border:0;"></a></td>'
        f'<td style="vertical-align:top;"><p style="margin:0 0 4px;font-family:{POLICE};font-size:16px;font-weight:700;line-height:1.3;color:{C["blanc"]};">{t["tg_t"]}</p>'
        f'<p style="margin:0 0 6px;font-family:{POLICE};font-size:14px;line-height:1.55;color:{C["gris"]};">{t["tg_p"]}</p>'
        f'<a href="{TG}" target="_blank" style="font-family:{POLICE};font-size:14px;font-weight:700;color:{C["cyan"]};text-decoration:none;">{t["tg_b"]} &#8594;</a></td></tr></table>'
        f'</td></tr></table></td></tr>')
    return f'''<!doctype html>
<html lang="{l}" xmlns="http://www.w3.org/1999/xhtml"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark"><meta name="supported-color-schemes" content="dark">
<title>{html.escape(s["sujet"])}</title>
<style>body{{margin:0;padding:0;background:{C["fond"]};}} a{{color:{C["cyan"]};}} @media (max-width:620px){{.pad{{padding-left:20px!important;padding-right:20px!important;}} .h1{{font-size:24px!important;}}}}</style>
</head><body style="margin:0;padding:0;background:{C["fond"]};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:{C["fond"]};">{html.escape(s["pre"])}&#8199;&#847;&#8199;&#847;&#8199;&#847;&#8199;&#847;&#8199;&#847;&#8199;&#847;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="{C["fond"]}" style="background:{C["fond"]};"><tr><td align="center" style="padding:24px 12px 40px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;">
<tr><td class="pad" align="right" style="padding:0 32px 12px;font-family:{POLICE};font-size:13px;color:{C["gris"]};">{t["date"]}</td></tr>
<tr><td bgcolor="{C["carte"]}" style="background:{C["carte"]};border:1px solid {C["bord"]};border-radius:18px;overflow:hidden;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
{banniere}
<tr><td class="pad" style="padding:30px 32px 10px;">
<h1 class="h1" style="margin:0 0 16px;font-family:{POLICE};font-size:28px;line-height:1.2;font-weight:800;color:{C["blanc"]};">{html.escape(s["titre"])}</h1>
{corps}</td></tr>
<tr><td class="pad" style="padding:6px 32px 28px;">{bouton(s["cta"], lien(s["lien"]))}</td></tr>
{soiree}
{bonus}
{telegram}
<tr><td class="pad" style="padding:0 32px 32px;">
<p style="margin:0;font-family:{POLICE};font-size:15px;line-height:1.6;color:{C["gris2"]};">{t["sig"] if not partenaire else {"fr": "À bientôt,", "en": "Speak soon,", "es": "Hasta pronto,"}[l]}<br><b style="color:{C["blanc"]};">{t["nom"]}</b></p>
<p style="margin:12px 0 0;font-family:{POLICE};font-size:13px;line-height:1.55;color:{C["gris"]};">{t["rep"]}</p></td></tr>
</table></td></tr>
<tr><td class="pad" align="center" style="padding:28px 20px 4px;">
<!--reseaux--><p style="margin:0 0 14px;font-family:{POLICE};font-size:13px;font-weight:700;color:{C["gris2"]};">{t["suivre"]}</p>
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>{reseaux()}</tr></table><!--/reseaux--></td></tr>
<tr><td class="pad" style="padding:22px 32px 0;font-family:{POLICE};font-size:12px;line-height:1.6;color:{C["gris"]};text-align:center;">
{html.escape(s["pied"])}<br><a href="{desinscr}" style="color:{C["gris"]};text-decoration:underline;">{t["desinscr"]}</a> &nbsp;·&nbsp; <a href="{SITE}/%%DIR%%/?{u}" style="color:{C["gris"]};text-decoration:underline;">iashark.com</a></td></tr>
</table></td></tr></table></body></html>'''


def texte(h):
    # Liens gardes en clair dans la version texte : « libelle : adresse ».
    def ancre(m):
        libelle = re.sub(r"<[^>]+>", "", m.group(2)).strip()
        return f"{libelle} : {m.group(1)}" if libelle else ""
    h = re.sub(r"<!--reseaux-->.*?<!--/reseaux-->", "", h, flags=re.S)  # logos des reseaux : pas en texte
    h = re.sub(r'<div style="display:none[^"]*">.*?</div>', "", h, flags=re.S)  # texte d'apercu cache
    h = re.sub(r'<a href="([^"]+)"[^>]*>(.*?)</a>', ancre, h, flags=re.S)
    h = re.sub(r"</td>", " ", h)
    h = re.sub(r"<(br|/p|/tr|/h1)[^>]*>", "\n", h)
    h = re.sub(r"<[^>]+>", "", h)
    h = html.unescape(h)
    return "\n".join(re.sub(r"[ \t]+", " ", x).strip() for x in h.splitlines() if x.strip())


# Garde-fous de redaction (verifies a chaque fabrication).
INTERDITS = [r"garanti", r"guarant", r"\bsûrs?\b", r"safe bet", r"risque", r"risk", r"riesgo", r"gagn[ée]s? \d", r"\d+ ?(gagn|won|ganad)",
             r"derni[eè]re chance", r"last chance", r"[uú]ltima oportunidad", r"vite\b", r"hurry", r"date limite"]
EMOJI = re.compile("[\U0001F300-\U0001FAFF☀-➿]")

paquet = {}
for seg in SEG:
    for l in ("fr", "en", "es"):
        s = SEG[seg][l]
        mots = len([m for m in re.split(r"[\s:–]+", s["sujet"]) if m and m not in ("vs", "€")])
        assert 6 <= mots <= 10, (seg, l, "objet de 6 a 10 mots", mots, s["sujet"])
        page = rendre(seg, l, "%%DESINSCRIPTION%%")
        visible = texte(page[page.index("<body"):])
        for motif in INTERDITS:
            assert not re.search(motif, visible + " " + s["sujet"], re.I), (seg, l, "mot interdit", motif)
        assert not EMOJI.search(page + s["sujet"]), (seg, l, "emoticone")
        open(os.path.join(OUT, f"{seg}-{l}.html"), "w").write(page)
        apercu = rendre(seg, l, "#").replace(IMG.format(l=l), "file://" + IMG_LOCALE.format(l=l)).replace("%%DIR%%", l if seg != "partenaire" or l != "en" else "gb")
        open(os.path.join(OUT, f"apercu-{seg}-{l}.html"), "w").write(apercu)
        paquet[f"{seg}-{l}"] = {"sujet": s["sujet"], "pre": s["pre"], "html": page,
                                "texte": visible}

json.dump(paquet, open(os.path.join(OUT, "paquet.json"), "w"), ensure_ascii=False)
with open(PAQUET_TS, "w") as f:
    f.write("// Fabrique par emails/relance-2026-10-28/fabriquer.py : ne pas modifier a la main.\n")
    f.write("export const PAQUET = " + json.dumps(paquet, ensure_ascii=False) + ";\n")
print("ok", len(paquet), sorted(paquet))
for k in sorted(paquet):
    print(f"  {k:16} {paquet[k]['sujet']}")
