# E-mails de relance IASHARK du mardi 20/10/2026 (4 segments x fr/en).
# Sortie : emailing/sortie/<segment>-<langue>.html (+ apercu-*.html avec liens de test)
# et emailing/sortie/sujets.json. Aucune emoticone, aucune promesse de gain.
import json, os, html

ICI = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(ICI, "sortie")
os.makedirs(OUT, exist_ok=True)

SITE = "https://iashark.com"
IMG = SITE + "/assets/emails/2026-10-20/banniere-{l}.jpg"
TG = "https://t.me/iasharkdata"
UTM = "utm_source=email&utm_medium=email&utm_campaign=relance-20-10-{s}"

MATCHS = [  # heure de Paris, id, domicile, exterieur (fr), domicile, exterieur (en)
    ("18h45", 1635661, "Fenerbahçe", "Slavia Prague", "Fenerbahce", "Slavia Prague", True),
    ("18h45", 1635719, "Sabah", "Dortmund", "Sabah", "Dortmund", False),
    ("21h00", 1635702, "PSG", "FC Barcelone", "PSG", "Barcelona", False),
    ("21h00", 1635688, "Liverpool", "Villarreal", "Liverpool", "Villarreal", False),
    ("21h00", 1635693, "Manchester City", "AEK Athènes", "Manchester City", "AEK Athens", False),
    ("21h00", 1635700, "Naples", "Bodø/Glimt", "Napoli", "Bodø/Glimt", False),
    ("21h00", 1635738, "Stuttgart", "Atlético Madrid", "Stuttgart", "Atlético Madrid", False),
    ("21h00", 1635655, "FC Porto", "PSV Eindhoven", "FC Porto", "PSV Eindhoven", False),
    ("21h00", 1635617, "AS Rome", "Slovan Bratislava", "AS Roma", "Slovan Bratislava", False),
]

T = {
 "fr": {
  "date": "Mardi 20 octobre", "soir": "Ce soir en Ligue des champions", "offert": "OFFERT",
  "heure_en": "", "tg_t": "La chaîne Telegram gratuite",
  "tg_p": "Chaque jour : le match offert, les résultats de la veille, gagnés et perdus, et un sondage sur l'affiche du soir.",
  "tg_b": "Rejoindre la chaîne", "sig": "À ce soir,", "nom": "Clément, IASHARK",
  "rep": "Une question ? Réponds simplement à cet e-mail, c'est moi qui lis.",
  "desinscr": "Se désinscrire", "voir": "Voir le match",
 },
 "es": {
  "date": "Martes 20 de octubre", "soir": "Esta noche en la Champions League", "offert": "GRATIS",
  "heure_en": "", "tg_t": "El canal de Telegram gratuito",
  "tg_p": "Cada día: el partido gratis, los resultados del día anterior, ganados y perdidos, y una encuesta sobre el partido de la noche.",
  "tg_b": "Unirme al canal", "sig": "Hasta esta noche,", "nom": "Clément, IASHARK",
  "rep": "¿Alguna pregunta? Responde a este correo, lo leo yo.",
  "desinscr": "Darse de baja", "voir": "Ver el partido",
 },
 "en": {
  "date": "Tuesday 20 October", "soir": "Tonight in the Champions League", "offert": "FREE",
  "heure_en": " (Paris time)", "tg_t": "The free Telegram channel",
  "tg_p": "Every day: the free match, yesterday's results, won and lost, and a poll on the evening's big game.",
  "tg_b": "Join the channel", "sig": "See you tonight,", "nom": "Clément, IASHARK",
  "rep": "Any question? Just reply to this email, I read every one.",
  "desinscr": "Unsubscribe", "voir": "See the match",
 },
}

SEG = {
 "accord": {
  "fr": dict(sujet="Ce soir, PSG – Barça : l'analyse est en ligne",
    pre="9 matchs de Ligue des champions ce soir, et un match offert dès 18h45.",
    titre="Grosse soirée de Ligue des champions",
    corps=["PSG – FC Barcelone à 21h, et huit autres matchs ce soir. Toutes les analyses sont prêtes : la chance de chaque issue, les scores les plus probables, les buteurs.",
           "Le match offert du jour : <b>Fenerbahçe – Slavia Prague</b>, 18h45. Son analyse complète est gratuite avec ton compte."],
    cta="Voir les matchs du soir", lien="/fr/", bonus=None,
    pied="Tu reçois cet e-mail parce que tu as accepté les e-mails d'IASHARK à ton inscription."),
  "es": dict(sujet="Esta noche, PSG – Barcelona: el análisis ya está",
    pre="9 partidos de Champions League esta noche, y un partido gratis desde las 18:45.",
    titre="Gran noche de Champions League",
    corps=["PSG – Barcelona a las 21:00, y ocho partidos más esta noche. Todos los análisis están listos: la probabilidad de cada resultado, los marcadores más probables, los goleadores.",
           "El partido gratis de hoy: <b>Fenerbahçe – Slavia Praga</b>, 18:45. Su análisis completo es gratis con tu cuenta."],
    cta="Ver los partidos de esta noche", lien="/es/", bonus=None,
    pied="Recibes este correo porque aceptaste los correos de IASHARK al registrarte."),
  "en": dict(sujet="Tonight: PSG vs Barcelona, the analysis is live",
    pre="9 Champions League games tonight, and one free match from 6:45pm (Paris).",
    titre="Big Champions League night",
    corps=["PSG vs Barcelona at 9pm (Paris), plus eight more games tonight. Every analysis is ready: the chance of each outcome, the most likely scores, the scorers.",
           "Today's free match: <b>Fenerbahce vs Slavia Prague</b>, 6:45pm (Paris). Its full analysis is free with your account."],
    cta="See tonight's games", lien="/en/", bonus=None,
    pied="You are receiving this email because you agreed to IASHARK emails when you signed up."),
 },
 "pro": {
  "fr": dict(sujet="Ta soirée Pro : PSG – Barça et 8 autres matchs",
    pre="Le pari de chaque match, la Sélection du jour, les buteurs : tout est prêt dans ton espace Pro.",
    titre="Tout est prêt dans ton espace Pro",
    corps=["Ce soir, 9 matchs de Ligue des champions, dont PSG – FC Barcelone à 21h.",
           "Dans ton espace Pro : le pari retenu pour chaque match avec sa cote, la Sélection du jour, les buteurs les plus probables et la chance d'un but par quart d'heure.",
           "Bientôt : le VIP Telegram, tes paris en privé, dans tes championnats."],
    cta="Ouvrir mon espace Pro", lien="/fr/pro.html", bonus=None,
    pied="Tu reçois cet e-mail parce que tu es abonné Pro à IASHARK."),
  "es": dict(sujet="Tu noche Pro: PSG – Barcelona y 8 partidos más",
    pre="La apuesta de cada partido, la Selección del día, los goleadores: todo está listo en tu espacio Pro.",
    titre="Todo está listo en tu espacio Pro",
    corps=["Esta noche, 9 partidos de Champions League, entre ellos PSG – Barcelona a las 21:00.",
           "En tu espacio Pro: la apuesta elegida para cada partido con su cuota, la Selección del día, los goleadores más probables y la probabilidad de gol por cuarto de hora.",
           "Muy pronto: el VIP de Telegram, tus apuestas en privado, en tus ligas."],
    cta="Abrir mi espacio Pro", lien="/es/pro.html", bonus=None,
    pied="Recibes este correo porque eres suscriptor Pro de IASHARK."),
  "en": dict(sujet="Your Pro night: PSG vs Barcelona and 8 more games",
    pre="The pick for every game, the Selection of the day, the scorers: it is all ready in your Pro space.",
    titre="Everything is ready in your Pro space",
    corps=["Tonight, 9 Champions League games, including PSG vs Barcelona at 9pm (Paris).",
           "In your Pro space: the pick for every game with its odds, the Selection of the day, the most likely scorers and the chance of a goal in each 15-minute window.",
           "Coming soon: VIP Telegram, your picks in private, for your leagues."],
    cta="Open my Pro space", lien="/en/pro.html", bonus=None,
    pied="You are receiving this email because you are an IASHARK Pro subscriber."),
 },
 "ancien": {
  "fr": dict(sujet="Une semaine de Pro offerte, déjà activée sur ton compte",
    pre="7 jours de Pro sans payer, jusqu'au mardi 27 octobre. Ensuite 19,95 € par mois si tu veux rester.",
    titre="Ta semaine Pro est offerte",
    corps=["IASHARK a changé depuis ton départ : nouveau moteur de calcul, 30 championnats suivis, un pari affiché sur chaque match avec sa cote, et une chaîne Telegram gratuite.",
           "Pour que tu voies la différence, je t'offre <b>une semaine de Pro</b>. Elle est déjà activée sur ton compte, jusqu'au mardi 27 octobre. Rien à payer, aucune carte à donner.",
           "Ensuite, si tu veux rester, c'est 19,95 € par mois, sans engagement. Sinon, ton compte repasse simplement en gratuit.",
           "Ce soir, PSG – FC Barcelone et 8 autres matchs de Ligue des champions : tout est ouvert pour toi."],
    cta="Ouvrir mon espace Pro", lien="/fr/pro.html", bonus=None,
    pied="Tu reçois cet e-mail parce que tu as été abonné à IASHARK."),
  "es": dict(sujet="Una semana de Pro gratis, ya activada en tu cuenta",
    pre="7 días de Pro sin pagar, hasta el martes 27 de octubre. Después 19,95 € al mes si quieres seguir.",
    titre="Tu semana Pro es gratis",
    corps=["IASHARK ha cambiado desde que te fuiste: nuevo motor de cálculo, 30 ligas, una apuesta en cada partido con su cuota, y un canal de Telegram gratuito.",
           "Para que veas la diferencia, te regalo <b>una semana de Pro</b>. Ya está activada en tu cuenta, hasta el martes 27 de octubre. Nada que pagar, ninguna tarjeta.",
           "Después, si quieres seguir, son 19,95 € al mes, sin permanencia. Si no, tu cuenta vuelve a ser gratuita, sin más.",
           "Esta noche, PSG – Barcelona y 8 partidos más de Champions League: todo está abierto para ti."],
    cta="Abrir mi espacio Pro", lien="/es/pro.html", bonus=None,
    pied="Recibes este correo porque fuiste suscriptor de IASHARK."),
  "en": dict(sujet="A free week of Pro, already active on your account",
    pre="7 days of Pro at no cost, until Tuesday 27 October. Then 19.95 EUR a month if you want to stay.",
    titre="Your Pro week is on us",
    corps=["IASHARK has changed since you left: new calculation engine, 30 leagues covered, a pick on every game with its odds, and a free Telegram channel.",
           "So you can see the difference, I am giving you <b>a free week of Pro</b>. It is already active on your account, until Tuesday 27 October. Nothing to pay, no card needed.",
           "After that, if you want to stay, it is 19.95 EUR a month, cancel anytime. Otherwise your account simply goes back to free.",
           "Tonight, PSG vs Barcelona and 8 more Champions League games: everything is open for you."],
    cta="Open my Pro space", lien="/en/pro.html", bonus=None,
    pied="You are receiving this email because you were an IASHARK subscriber."),
 },
 "sans_accord": {
  "fr": dict(sujet="Ton compte IASHARK : ce soir, PSG – Barça",
    pre="Ton compte est toujours actif. Ce soir, 9 matchs de Ligue des champions et un match offert.",
    titre="Ton compte IASHARK t'attend",
    corps=["Tu as créé un compte sur IASHARK. Ce soir, PSG – FC Barcelone et 8 autres matchs de Ligue des champions, avec leur analyse complète.",
           "Chaque jour, un match est offert. Aujourd'hui : <b>Fenerbahçe – Slavia Prague</b>, 18h45."],
    cta="Voir les matchs du soir", lien="/fr/",
    bonus=("Recevoir les analyses par e-mail ?", "Active-les en un clic dans ton compte. Sinon, tu ne recevras plus rien de notre part.", "Activer les e-mails", "/fr/compte.html"),
    pied="Tu reçois ce message parce que tu as un compte IASHARK."),
  "es": dict(sujet="Tu cuenta IASHARK: esta noche, PSG – Barcelona",
    pre="Tu cuenta sigue activa. Esta noche, 9 partidos de Champions League y un partido gratis.",
    titre="Tu cuenta IASHARK te espera",
    corps=["Creaste una cuenta en IASHARK. Esta noche, PSG – Barcelona y 8 partidos más de Champions League, cada uno con su análisis completo.",
           "Cada día, un partido es gratis. Hoy: <b>Fenerbahçe – Slavia Praga</b>, 18:45."],
    cta="Ver los partidos de esta noche", lien="/es/",
    bonus=("¿Recibir los análisis por correo?", "Actívalos con un clic en tu cuenta. Si no, no volverás a saber de nosotros.", "Activar los correos", "/es/compte.html"),
    pied="Recibes este mensaje porque tienes una cuenta IASHARK."),
  "en": dict(sujet="Your IASHARK account: PSG vs Barcelona tonight",
    pre="Your account is still active. Tonight, 9 Champions League games and one free match.",
    titre="Your IASHARK account is waiting",
    corps=["You created an account on IASHARK. Tonight, PSG vs Barcelona and 8 more Champions League games, each with its full analysis.",
           "Every day, one match is free. Today: <b>Fenerbahce vs Slavia Prague</b>, 6:45pm (Paris)."],
    cta="See tonight's games", lien="/en/",
    bonus=("Want the analysis by email?", "Turn it on in one click in your account. Otherwise you will not hear from us again.", "Turn on emails", "/en/compte.html"),
    pied="You are receiving this message because you have an IASHARK account."),
 },
}

C = dict(fond="#060b12", carte="#0a1420", bord="#16222f", cyan="#20d5ef", blanc="#f4f7fb", gris="#91a0b3", gris2="#c9d3de")
POLICE = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif"


def bouton(texte, url, plein=True):
    fond = C["cyan"] if plein else "transparent"
    coul = "#04121a" if plein else C["cyan"]
    return (f'<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" bgcolor="{fond}" '
            f'style="border-radius:10px;border:1.5px solid {C["cyan"]};">'
            f'<a href="{url}" target="_blank" style="display:inline-block;padding:15px 28px;font-family:{POLICE};font-size:16px;'
            f'font-weight:700;line-height:1;color:{coul};text-decoration:none;border-radius:10px;">{html.escape(texte)}</a></td></tr></table>')


def rendre(seg, l, desinscr):
    s, t = SEG[seg][l], T[l]
    u = UTM.format(s=seg)
    lien = lambda p: f"{SITE}{p}{'&' if '?' in p else '?'}{u}"
    lignes = []
    for h, mid, d_fr, e_fr, d_en, e_en, offert in MATCHS:
        d, e = (d_fr, e_fr) if l == "fr" else (d_en, e_en)
        if l == "es":
            d, e = {"Napoli": "Nápoles", "Fenerbahce": "Fenerbahçe"}.get(d, d), {"Slavia Prague": "Slavia Praga", "AEK Athens": "AEK Atenas"}.get(e, e)
        heure = h if l == "fr" else ({"18h45": "18:45", "21h00": "21:00"}[h] if l == "es" else {"18h45": "6:45pm", "21h00": "9pm"}[h])
        badge = (f'&nbsp;<span style="display:inline-block;padding:2px 7px;border-radius:5px;background:{C["cyan"]};color:#04121a;'
                 f'font-size:11px;font-weight:700;letter-spacing:.5px;vertical-align:1px;">{t["offert"]}</span>') if offert else ""
        lignes.append(
            f'<tr><td style="padding:11px 0;border-top:1px solid {C["bord"]};font-family:{POLICE};font-size:14px;color:{C["cyan"]};'
            f'font-weight:700;width:64px;vertical-align:top;">{heure}</td>'
            f'<td style="padding:11px 0;border-top:1px solid {C["bord"]};font-family:{POLICE};font-size:15px;line-height:1.35;">'
            f'<a href="{lien(f"/{l}/match.html?id={mid}")}" style="color:{C["blanc"]};text-decoration:none;font-weight:600;">'
            f'{html.escape(d)} – {html.escape(e)}</a>{badge}</td></tr>')
    corps = "".join(f'<p style="margin:0 0 14px;font-family:{POLICE};font-size:16px;line-height:1.6;color:{C["gris2"]};">{p}</p>' for p in s["corps"])
    bonus = ""
    if s["bonus"]:
        bt, bp, bb, bl = s["bonus"]
        bonus = (f'<tr><td style="padding:0 32px 28px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" '
                 f'style="border:1px solid {C["bord"]};border-radius:12px;"><tr><td style="padding:22px 22px 24px;">'
                 f'<p style="margin:0 0 6px;font-family:{POLICE};font-size:16px;font-weight:700;color:{C["blanc"]};">{bt}</p>'
                 f'<p style="margin:0 0 16px;font-family:{POLICE};font-size:14px;line-height:1.55;color:{C["gris"]};">{bp}</p>'
                 f'{bouton(bb, lien(bl), plein=False)}</td></tr></table></td></tr>')
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
<tr><td><a href="{lien(f"/{l}/match.html?id=1635702")}" target="_blank"><img src="{IMG.format(l=l)}" width="600" alt="{ {'fr': 'PSG – FC Barcelone, ce soir 21h00', 'en': 'PSG vs Barcelona, tonight 9pm (Paris)', 'es': 'PSG – Barcelona, esta noche 21:00'}[l] }" style="display:block;width:100%;max-width:600px;height:auto;border:0;border-radius:18px 18px 0 0;"></a></td></tr>
<tr><td class="pad" style="padding:30px 32px 10px;">
<h1 class="h1" style="margin:0 0 16px;font-family:{POLICE};font-size:28px;line-height:1.2;font-weight:800;color:{C["blanc"]};">{html.escape(s["titre"])}</h1>
{corps}</td></tr>
<tr><td class="pad" style="padding:6px 32px 28px;">{bouton(s["cta"], lien(s["lien"]))}</td></tr>
<tr><td class="pad" style="padding:0 32px 26px;">
<p style="margin:0 0 4px;font-family:{POLICE};font-size:12px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:{C["gris"]};">{t["soir"]}</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">{"".join(lignes)}</table>
<p style="margin:10px 0 0;font-family:{POLICE};font-size:12px;color:{C["gris"]};">{ {'fr': 'Heures de Paris.', 'en': 'Paris time.', 'es': 'Hora de París.'}[l] }</p></td></tr>
{bonus}
<tr><td class="pad" style="padding:0 32px 30px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid {C["bord"]};"><tr><td style="padding-top:24px;">
<p style="margin:0 0 6px;font-family:{POLICE};font-size:16px;font-weight:700;color:{C["blanc"]};">{t["tg_t"]}</p>
<p style="margin:0 0 16px;font-family:{POLICE};font-size:14px;line-height:1.55;color:{C["gris"]};">{t["tg_p"]}</p>
{bouton(t["tg_b"], TG, plein=False)}</td></tr></table></td></tr>
<tr><td class="pad" style="padding:0 32px 32px;">
<p style="margin:0;font-family:{POLICE};font-size:15px;line-height:1.6;color:{C["gris2"]};">{t["sig"]}<br><b style="color:{C["blanc"]};">{t["nom"]}</b></p>
<p style="margin:12px 0 0;font-family:{POLICE};font-size:13px;line-height:1.55;color:{C["gris"]};">{t["rep"]}</p></td></tr>
</table></td></tr>
<tr><td class="pad" style="padding:22px 32px 0;font-family:{POLICE};font-size:12px;line-height:1.6;color:{C["gris"]};text-align:center;">
{html.escape(s["pied"])}<br><a href="{desinscr}" style="color:{C["gris"]};text-decoration:underline;">{t["desinscr"]}</a> &nbsp;·&nbsp; <a href="{SITE}/{l}/?{u}" style="color:{C["gris"]};text-decoration:underline;">iashark.com</a></td></tr>
</table></td></tr></table></body></html>'''


import re
def texte(h):
    h = re.sub(r"<(br|/p|/tr|/h1)[^>]*>", "\n", h)
    h = re.sub(r"<[^>]+>", "", h)
    h = html.unescape(h)
    return "\n".join(x.strip() for x in h.splitlines() if x.strip())

paquet = {}
for seg in SEG:
    for l in SEG[seg]:
        page = rendre(seg, l, "%%DESINSCRIPTION%%")
        open(os.path.join(OUT, f"{seg}-{l}.html"), "w").write(page)
        apercu = rendre(seg, l, "#").replace(IMG.format(l=l), f"../banniere-{l}.jpg")
        open(os.path.join(OUT, f"apercu-{seg}-{l}.html"), "w").write(apercu)
        corps_txt = texte(page[page.index("<body"):]).replace("%%DESINSCRIPTION%%", "")
        paquet[f"{seg}-{l}"] = {"sujet": SEG[seg][l]["sujet"], "pre": SEG[seg][l]["pre"], "html": page,
                                "texte": corps_txt + "\n" + T[l]["desinscr"] + " : %%DESINSCRIPTION%%"}
json.dump(paquet, open(os.path.join(OUT, "paquet.json"), "w"), ensure_ascii=False)
print("ok", len(paquet), sorted(paquet))
