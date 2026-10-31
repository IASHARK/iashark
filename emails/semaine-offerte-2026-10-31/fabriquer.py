# E-mail « semaine Pro offerte » du samedi 31/10/2026, 9 h (Paris), demande de Clement.
# Un seul message, deux pieds de page (accord / sans_accord : la raison de l'envoi), en fr/en/es.
# Destinataires (regles dans supabase/functions/relance-emails/index.ts) : comptes gratuits jamais
# abonnes. Jamais : abonnes en cours, plans « famille » / « pro » poses a la main, anciens abonnes
# (l'essai de 7 jours ne leur est pas ouvert : trial.ts), administrateurs, desinscrits, rebonds.
#
# Sorties :
#   supabase/functions/relance-emails/paquet.ts          (textes et gabarits lus par la fonction)
#   emails/semaine-offerte-2026-10-31/sortie/            (pages et apercus, non suivis par git)
# Repere %%DESINSCRIPTION%% : lien de desinscription signe, remplace a l'envoi.
#
# Chiffres : UNIQUEMENT des resultats verifies, gagnes ET perdus.
#   - vendredi 30/10, Ligue 1, paris publies avant le coup d'envoi (predictions_archive, publies le
#     28/10 et le 29/10) ; scores finaux API-Sports, concordance score / buts verifiee le 31/10 :
#     Le Havre 1-5 PSG (les deux equipes marquent, 1,70 : gagne), Lille 1-0 Lens (Lille ou nul, 1,40 :
#     gagne), Nice 5-2 Rennes (Rennes ou nul, 1,44 : perdu) ;
#   - montante n°1 : https://iashark.com/preuves/montantes.json (genere le 30/10) : 27, 28 et 29/10
#     gagnes, cote cumulee 2,78. Ecrit avec ses dates : reste vrai quoi qu'il arrive ensuite.
# Aucune emoticone, aucune promesse de gain, aucune mise, aucune fausse urgence.
import json, os, html, re

ICI = os.path.dirname(os.path.abspath(__file__))
RACINE = os.path.abspath(os.path.join(ICI, "..", ".."))
OUT = os.path.join(ICI, "sortie")
os.makedirs(OUT, exist_ok=True)
PAQUET_TS = os.path.join(RACINE, "supabase", "functions", "relance-emails", "paquet.ts")

SITE = "https://iashark.com"
TG = "https://t.me/iasharkdata"
UTM = "utm_source=email&utm_campaign=semaine-offerte-31-10"
PRO = "/{l}/pro.html"

T = {
 "fr": {
  "we_t": "Ce week-end, ça continue :", "we_n": "Nos paris sur ces matchs seront dans le Pro avant le coup d'envoi.", "we": [("Dimanche 17 h 30","Liverpool – Arsenal",40,42,""),("Dimanche 20 h 45","Juventus – Naples",496,492,""),("Dimanche 21 h","Athletic Bilbao – Real Sociedad",531,548,"le derby basque"),("Lundi 21 h","Newcastle – Everton",34,45,"")], "essai_c": "7 jours gratuits. Rien n'est prélevé pendant l'essai, tu annules en ligne quand tu veux.",
  "date": "Samedi 31 octobre",
  "sujet": "Découvre la semaine Pro offerte",
  "pre": "Liverpool – Arsenal, Juventus – Naples : nos paris seront dans le Pro avant le coup d'envoi.",
  "titre": "Découvre la semaine Pro offerte",
  "intro": "Bonjour, c'est Clément, le créateur d'IASHARK. Les paris Pro sont bien partis ces derniers jours : c'est le bon moment pour les voir de près, sans rien payer pendant 7 jours. Voici les derniers résultats, gagnés comme perdus.",
  "res_t": "Vendredi 30 octobre, Ligue 1",
  "res": [("Le Havre – PSG", "Les deux équipes marquent", "1,70", True, "1-5"),
          ("Lille – Lens", "Lille ou match nul", "1,40", True, "1-0"),
          ("Nice – Rennes", "Rennes ou match nul", "1,44", False, "5-2")],
  "gagne": "Gagné", "perdu": "Perdu", "bilan": "2 sur 3",
  "mont_t": "Montante n°1",
  "mont": "Du 27 au 29 octobre : 3 victoires de suite, cote cumulée 2,78.",
  "mont_p": "La montante enchaîne chaque jour le premier pari de la Sélection en or : chaque pari gagné fait monter la cote cumulée.",
  "liste_t": "Dans le Pro :",
  "liste": ["tous les paris du jour ;", "la Sélection en or ;", "les buteurs du jour ;", "les combinés ;", "les montantes."],
  "cta": "Activer ma semaine offerte",
  "essai_t": "Comment marche la semaine offerte",
  "essai": "7 jours gratuits sur l'abonnement au mois, pour un premier abonnement. Ta carte est demandée, mais rien n'est prélevé pendant l'essai. Tu annules quand tu veux, en ligne, depuis Mon compte. Sans annulation, le prix du mois affiché sur la page est prélevé à la fin de l'essai.",
  "tg_t": "La chaîne Telegram gratuite",
  "tg_p": "Chaque jour : le match offert et les résultats de la veille, gagnés et perdus.",
  "tg_b": "Rejoindre la chaîne Telegram", "suivre": "Suis IASHARK partout",
  "sig": "Bon week-end de foot,", "nom": "Clément, IASHARK",
  "rep": "Une question, un avis ? Réponds simplement à cet e-mail, c'est moi qui lis.",
  "desinscr": "Se désinscrire",
  "pied": {"accord": "Tu reçois cet e-mail parce que tu as accepté les e-mails d'IASHARK à ton inscription.",
           "sans_accord": "Tu reçois ce message parce que tu as un compte IASHARK."},
 },
 "en": {
  "we_t": "This weekend, it continues:", "we_n": "Our picks on these matches will be in Pro before kick-off.", "we": [("Sunday 5:30 pm","Liverpool vs Arsenal",40,42,""),("Sunday 8:45 pm","Juventus vs Napoli",496,492,""),("Sunday 9 pm","Athletic Bilbao vs Real Sociedad",531,548,"the Basque derby"),("Monday 9 pm","Newcastle vs Everton",34,45,"")], "essai_c": "7 days free. Nothing is charged during the trial, cancel online whenever you want.",
  "date": "Saturday 31 October",
  "sujet": "Discover the free Pro week",
  "pre": "Liverpool vs Arsenal, Juventus vs Napoli: our picks will be in Pro before kick-off.",
  "titre": "Discover the free Pro week",
  "intro": "Hi, it's Clément, the founder of IASHARK. Our Pro picks have had a good run these last few days: it is the right time to see them up close, without paying anything for 7 days. Here are the latest results, won and lost.",
  "res_t": "Friday 30 October, Ligue 1",
  "res": [("Le Havre vs PSG", "Both teams to score", "1.70", True, "1-5"),
          ("Lille vs Lens", "Lille or draw", "1.40", True, "1-0"),
          ("Nice vs Rennes", "Rennes or draw", "1.44", False, "5-2")],
  "gagne": "Won", "perdu": "Lost", "bilan": "2 out of 3",
  "mont_t": "Ladder no. 1",
  "mont": "From 27 to 29 October: 3 wins in a row, combined odds 2.78.",
  "mont_p": "The ladder follows the first pick of the Gold Selection every day: each winning pick raises the combined odds.",
  "liste_t": "In Pro:",
  "liste": ["every pick of the day;", "the Gold Selection;", "the scorers of the day;", "the combos;", "the ladders."],
  "cta": "Activate my free week",
  "essai_t": "How the free week works",
  "essai": "7 days free on the monthly plan, for a first subscription. Your card is requested, but nothing is charged during the trial. Cancel anytime, online, from your account. If you do not cancel, the monthly price shown on the page is charged when the trial ends.",
  "tg_t": "The free Telegram channel",
  "tg_p": "Every day: the free match and yesterday's results, won and lost.",
  "tg_b": "Join the Telegram channel", "suivre": "Follow IASHARK",
  "sig": "Enjoy the football weekend,", "nom": "Clément, IASHARK",
  "rep": "A question, some feedback? Just reply to this email, I read every one myself.",
  "desinscr": "Unsubscribe",
  "pied": {"accord": "You are receiving this email because you agreed to IASHARK emails when you signed up.",
           "sans_accord": "You are receiving this message because you have an IASHARK account."},
 },
 "es": {
  "we_t": "Este fin de semana, sigue:", "we_n": "Nuestras apuestas en estos partidos estarán en el Pro antes del inicio.", "we": [("Domingo 17:30","Liverpool – Arsenal",40,42,""),("Domingo 20:45","Juventus – Nápoles",496,492,""),("Domingo 21:00","Athletic Club – Real Sociedad",531,548,"el derbi vasco"),("Lunes 21:00","Newcastle – Everton",34,45,"")], "essai_c": "7 días gratis. No se cobra nada durante la prueba, cancelas en línea cuando quieras.",
  "date": "Sábado 31 de octubre",
  "sujet": "Descubre la semana Pro gratis",
  "pre": "Liverpool – Arsenal, Juventus – Nápoles: nuestras apuestas estarán en el Pro antes del inicio.",
  "titre": "Descubre la semana Pro gratis",
  "intro": "Hola, soy Clément, el creador de IASHARK. Las apuestas Pro van bien estos últimos días: es el momento de verlas de cerca, sin pagar nada durante 7 días. Estos son los últimos resultados, ganados y perdidos.",
  "res_t": "Viernes 30 de octubre, Ligue 1",
  "res": [("Le Havre – PSG", "Ambos equipos marcan", "1,70", True, "1-5"),
          ("Lille – Lens", "Lille o empate", "1,40", True, "1-0"),
          ("Niza – Rennes", "Rennes o empate", "1,44", False, "5-2")],
  "gagne": "Ganada", "perdu": "Perdida", "bilan": "2 de 3",
  "mont_t": "Escalera n.º 1",
  "mont": "Del 27 al 29 de octubre: 3 victorias seguidas, cuota acumulada 2,78.",
  "mont_p": "La escalera sigue cada día la primera apuesta de la Selección de oro: cada apuesta ganada sube la cuota acumulada.",
  "liste_t": "En el Pro:",
  "liste": ["todas las apuestas del día;", "la Selección de oro;", "los goleadores del día;", "las combinadas;", "las escaleras."],
  "cta": "Activar mi semana gratis",
  "essai_t": "Cómo funciona la semana gratis",
  "essai": "7 días gratis en la suscripción mensual, para una primera suscripción. Se pide tu tarjeta, pero no se cobra nada durante la prueba. Cancelas cuando quieras, en línea, desde tu cuenta. Si no cancelas, el precio mensual que aparece en la página se cobra al final de la prueba.",
  "tg_t": "El canal de Telegram gratuito",
  "tg_p": "Cada día: el partido gratis y los resultados del día anterior, ganados y perdidos.",
  "tg_b": "Unirme al canal de Telegram", "suivre": "Sigue a IASHARK",
  "sig": "Buen fin de semana de fútbol,", "nom": "Clément, IASHARK",
  "rep": "¿Una pregunta, una opinión? Responde a este correo, lo leo yo mismo.",
  "desinscr": "Darse de baja",
  "pied": {"accord": "Recibes este correo porque aceptaste los correos de IASHARK al registrarte.",
           "sans_accord": "Recibes este mensaje porque tienes una cuenta IASHARK."},
 },
}
SEGMENTS = ("accord", "sans_accord")

C = dict(fond="#060b12", carte="#0a1420", bord="#16222f", cyan="#20d5ef", blanc="#f4f7fb", gris="#91a0b3", gris2="#c9d3de", case="#0d1a28")
POLICE = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif"

ICONES = SITE + "/assets/emails/icones"
RESEAUX = [("youtube", "YouTube", "@IASHARK", "https://www.youtube.com/@IASHARK"),
           ("x", "X", "@IASHARK1", "https://x.com/IASHARK1"),
           ("instagram", "Instagram", "@IASHARK", "https://www.instagram.com/iashark/"),
           ("tiktok", "TikTok", "@iashark_data", "https://www.tiktok.com/@iashark_data")]


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
    return ('<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 6px;">' + "".join(
        f'<tr><td style="width:18px;padding:2px 0 6px;vertical-align:top;font-family:{POLICE};font-size:16px;line-height:1.5;color:{C["cyan"]};font-weight:700;">&#8211;</td>'
        f'<td style="padding:2px 0 6px;font-family:{POLICE};font-size:16px;line-height:1.5;color:{C["gris2"]};">{html.escape(it)}</td></tr>'
        for it in items) + '</table>')


def resultats(t):
    # Gagne : cyan plein. Perdu : gris, ecrit en toutes lettres (jamais cache).
    lignes = []
    for affiche, pari, cote, gagne, score in t["res"]:
        etat = (f'<span style="display:inline-block;padding:3px 8px;border-radius:6px;background:{C["cyan"]};color:#04121a;font-size:12px;font-weight:700;">{t["gagne"]}</span>'
                if gagne else
                f'<span style="display:inline-block;padding:2px 7px;border-radius:6px;border:1px solid {C["gris"]};color:{C["gris2"]};font-size:12px;font-weight:700;">{t["perdu"]}</span>')
        lignes.append(
            f'<tr><td style="padding:12px 0;border-top:1px solid {C["bord"]};font-family:{POLICE};vertical-align:top;">'
            f'<span style="font-size:15px;font-weight:700;color:{C["blanc"]};">{html.escape(affiche)}</span>'
            f'<span style="font-size:13px;color:{C["gris"]};">&nbsp;&nbsp;{score}</span><br>'
            f'<span style="font-size:14px;line-height:1.5;color:{C["gris2"]};">{html.escape(pari)} · {cote}</span></td>'
            f'<td align="right" style="padding:12px 0;border-top:1px solid {C["bord"]};font-family:{POLICE};vertical-align:middle;width:84px;">{etat}</td></tr>')
    return (f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="{C["case"]}" '
            f'style="background:{C["case"]};border:1px solid {C["bord"]};border-radius:12px;"><tr><td style="padding:18px 20px 8px;">'
            f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>'
            f'<td style="font-family:{POLICE};font-size:14px;font-weight:700;color:{C["gris2"]};padding-bottom:10px;">{html.escape(t["res_t"])}</td>'
            f'<td align="right" style="font-family:{POLICE};font-size:20px;font-weight:800;color:{C["cyan"]};padding-bottom:10px;">{html.escape(t["bilan"])}</td></tr></table>'
            f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">{"".join(lignes)}</table>'
            f'</td></tr></table>'
            f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="{C["case"]}" '
            f'style="background:{C["case"]};border:1px solid {C["bord"]};border-radius:12px;margin-top:12px;"><tr><td style="padding:18px 20px;">'
            f'<p style="margin:0 0 6px;font-family:{POLICE};font-size:14px;font-weight:700;color:{C["gris2"]};">{html.escape(t["mont_t"])}</p>'
            f'<p style="margin:0 0 8px;font-family:{POLICE};font-size:17px;line-height:1.45;font-weight:700;color:{C["blanc"]};">{html.escape(t["mont"])}</p>'
            f'<p style="margin:0;font-family:{POLICE};font-size:13px;line-height:1.55;color:{C["gris"]};">{html.escape(t["mont_p"])}</p>'
            f'</td></tr></table>')


def weekend(t):
    L = "https://media.api-sports.io/football/teams/{}.png"
    rows = ""
    for q, m, a, b, n in t["we"]:
        sous = f'<br><span style="font-size:12px;font-weight:400;color:{C["gris"]};">{html.escape(n)}</span>' if n else ""
        rows += (f'<tr><td style="padding:10px 0;border-top:1px solid {C["bord"]};"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>'
                 f'<td style="font-family:{POLICE};font-size:13px;color:{C["gris"]};width:120px;">{html.escape(q)}</td>'
                 f'<td style="width:30px;"><img src="{L.format(a)}" width="24" height="24" alt="" style="display:block;border:0;"></td>'
                 f'<td style="font-family:{POLICE};font-size:15px;font-weight:700;color:{C["blanc"]};">{html.escape(m)}{sous}</td>'
                 f'<td style="width:30px;" align="right"><img src="{L.format(b)}" width="24" height="24" alt="" style="display:block;border:0;"></td></tr></table></td></tr>')
    return f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">{rows}</table>'


def rendre(seg, l, desinscr):
    t = T[l]
    lien = lambda p: f"{SITE}{p}{'&' if '?' in p else '?'}{UTM}"
    pro = lien(PRO.format(l=l))
    return f'''<!doctype html>
<html lang="{l}" xmlns="http://www.w3.org/1999/xhtml"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark"><meta name="supported-color-schemes" content="dark">
<title>{html.escape(t["sujet"])}</title>
<style>body{{margin:0;padding:0;background:{C["fond"]};}} a{{color:{C["cyan"]};}} @media (max-width:620px){{.pad{{padding-left:20px!important;padding-right:20px!important;}} .h1{{font-size:25px!important;}}}}</style>
</head><body style="margin:0;padding:0;background:{C["fond"]};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:{C["fond"]};">{html.escape(t["pre"])}&#8199;&#847;&#8199;&#847;&#8199;&#847;&#8199;&#847;&#8199;&#847;&#8199;&#847;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="{C["fond"]}" style="background:{C["fond"]};"><tr><td align="center" style="padding:24px 12px 40px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;">
<tr><td class="pad" style="padding:0 32px 12px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
<td style="font-family:{POLICE};font-size:18px;font-weight:800;letter-spacing:.5px;color:{C["blanc"]};"><a href="{lien(f"/{l}/")}" target="_blank" style="color:{C["blanc"]};text-decoration:none;">IA<span style="color:{C["cyan"]};">SHARK</span></a></td>
<td align="right" style="font-family:{POLICE};font-size:13px;color:{C["gris"]};">{t["date"]}</td></tr></table></td></tr>
<tr><td bgcolor="{C["carte"]}" style="background:{C["carte"]};border:1px solid {C["bord"]};border-top:3px solid {C["cyan"]};border-radius:18px;overflow:hidden;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
<tr><td class="pad" style="padding:32px 32px 6px;">
<h1 class="h1" style="margin:0 0 16px;font-family:{POLICE};font-size:30px;line-height:1.2;font-weight:800;color:{C["blanc"]};">{html.escape(t["titre"])}</h1>
<p style="margin:8px 0 10px;font-family:{POLICE};font-size:18px;font-weight:800;color:{C["blanc"]};">{html.escape(t["we_t"])}</p>
{weekend(t)}
<p style="margin:12px 0 0;font-family:{POLICE};font-size:15px;line-height:1.6;color:{C["gris2"]};">{html.escape(t["we_n"])}</p></td></tr>
<tr><td class="pad" style="padding:24px 32px 6px;">
<p style="margin:0 0 10px;font-family:{POLICE};font-size:17px;font-weight:700;color:{C["blanc"]};">{html.escape(t["liste_t"])}</p>
{puces(t["liste"])}</td></tr>
<tr><td class="pad" style="padding:8px 32px 26px;">{bouton(t["cta"], pro)}</td></tr>
<tr><td class="pad" style="padding:0 32px 28px;"><p style="margin:0;font-family:{POLICE};font-size:14px;line-height:1.6;color:{C["gris"]};">{html.escape(t["essai_c"])}</p></td></tr>
<tr><td class="pad" style="padding:0 32px 28px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid {C["bord"]};"><tr><td style="padding-top:22px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding-right:14px;vertical-align:top;"><a href="{TG}" target="_blank"><img src="{ICONES}/telegram.png" width="40" height="40" alt="Telegram" style="display:block;border:0;"></a></td>
<td style="vertical-align:top;"><p style="margin:0 0 4px;font-family:{POLICE};font-size:16px;font-weight:700;line-height:1.3;color:{C["blanc"]};">{t["tg_t"]}</p>
<p style="margin:0 0 6px;font-family:{POLICE};font-size:14px;line-height:1.55;color:{C["gris"]};">{t["tg_p"]}</p>
<a href="{TG}" target="_blank" style="font-family:{POLICE};font-size:14px;font-weight:700;color:{C["cyan"]};text-decoration:none;">{t["tg_b"]} &#8594;</a></td></tr></table>
</td></tr></table></td></tr>
<tr><td class="pad" style="padding:0 32px 32px;">
<p style="margin:0;font-family:{POLICE};font-size:15px;line-height:1.6;color:{C["gris2"]};">{t["sig"]}<br><b style="color:{C["blanc"]};">{t["nom"]}</b></p>
<p style="margin:12px 0 0;font-family:{POLICE};font-size:13px;line-height:1.55;color:{C["gris"]};">{t["rep"]}</p></td></tr>
</table></td></tr>
<tr><td class="pad" align="center" style="padding:28px 20px 4px;">
<!--reseaux--><p style="margin:0 0 14px;font-family:{POLICE};font-size:13px;font-weight:700;color:{C["gris2"]};">{t["suivre"]}</p>
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>{reseaux()}</tr></table><!--/reseaux--></td></tr>
<tr><td class="pad" style="padding:22px 32px 0;font-family:{POLICE};font-size:12px;line-height:1.6;color:{C["gris"]};text-align:center;">
{html.escape(t["pied"][seg])}<br><a href="{desinscr}" style="color:{C["gris"]};text-decoration:underline;">{t["desinscr"]}</a> &nbsp;·&nbsp; <a href="{lien(f"/{l}/")}" style="color:{C["gris"]};text-decoration:underline;">iashark.com</a></td></tr>
</table></td></tr></table></body></html>'''


def texte(h):
    # Liens gardes en clair dans la version texte : « libelle : adresse ».
    def ancre(m):
        libelle = re.sub(r"<[^>]+>", "", m.group(2)).strip()
        return f"{libelle} : {m.group(1)}" if libelle else ""
    h = re.sub(r"<!--reseaux-->.*?<!--/reseaux-->", "", h, flags=re.S)
    h = re.sub(r'<div style="display:none[^"]*">.*?</div>', "", h, flags=re.S)
    h = re.sub(r'<a href="([^"]+)"[^>]*>(.*?)</a>', ancre, h, flags=re.S)
    h = re.sub(r"</td>", " ", h)
    h = re.sub(r"<(br|/p|/tr|/h1)[^>]*>", "\n", h)
    h = re.sub(r"<[^>]+>", "", h)
    h = html.unescape(h)
    return "\n".join(re.sub(r"[ \t]+", " ", x).strip() for x in h.splitlines() if x.strip())


# Garde-fous de redaction (verifies a chaque fabrication).
INTERDITS = [r"garanti", r"guarant", r"\bsûrs?\b", r"safe bet", r"seguro", r"\bmise", r"\bstake", r"apuesta m[ií]nima", r"\bunit",
             r"rentab", r"profit", r"benefici", r"bénéfice", r"esp[ée]rance", r"expected value", r"\broi\b",
             r"derni[eè]re chance", r"last chance", r"[uú]ltima oportunidad", r"\bvite\b", r"hurry", r"date limite"]
EMOJI = re.compile("[\U0001F300-\U0001FAFF☀-➿]")
# Les seuls chiffres de resultats autorises (verifies, voir l'en-tete).
ATTENDUS = {"fr": ["Liverpool", "Juventus", "Real Sociedad", "Everton"], "en": ["Liverpool", "Juventus", "Real Sociedad", "Everton"], "es": ["Liverpool", "Juventus", "Real Sociedad", "Everton"]}

paquet = {}
for seg in SEGMENTS:
    for l in ("fr", "en", "es"):
        t = T[l]
        page = rendre(seg, l, "%%DESINSCRIPTION%%")
        visible = texte(page[page.index("<body"):])
        for motif in INTERDITS:
            assert not re.search(motif, visible + " " + t["sujet"] + " " + t["pre"], re.I), (seg, l, "mot interdit", motif)
        assert not EMOJI.search(page + t["sujet"] + t["pre"]), (seg, l, "emoticone")
        for a in ATTENDUS[l]:
            assert a in visible, (seg, l, "chiffre attendu absent", a)
        assert f"{SITE}/{l}/pro.html?{UTM}" in page, (seg, l, "lien Pro")
        open(os.path.join(OUT, f"{seg}-{l}.html"), "w").write(page)
        open(os.path.join(OUT, f"apercu-{seg}-{l}.html"), "w").write(rendre(seg, l, "#"))
        paquet[f"{seg}-{l}"] = {"sujet": t["sujet"], "pre": t["pre"], "html": page, "texte": visible}

json.dump(paquet, open(os.path.join(OUT, "paquet.json"), "w"), ensure_ascii=False)
os.makedirs(os.path.dirname(PAQUET_TS), exist_ok=True)
with open(PAQUET_TS, "w") as f:
    f.write("// Fabrique par emails/semaine-offerte-2026-10-31/fabriquer.py : ne pas modifier a la main.\n")
    f.write("export const PAQUET = " + json.dumps(paquet, ensure_ascii=False) + ";\n")
print("ok", len(paquet), sorted(paquet))
for k in sorted(paquet):
    print(f"  {k:16} {paquet[k]['sujet']}")
