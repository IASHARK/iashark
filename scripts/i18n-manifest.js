"use strict";
// Manifeste des pages localisees pour scripts/build-locales.js. Chaque regle
// "find" doit correspondre EXACTEMENT au nombre d'occurrences attendu dans
// le fichier source FR (verifie par le build - echoue plutot que generer
// une traduction partielle silencieuse). Les predicats de correspondance
// JS qui matchent le contenu brut de data.json (ex. getMarketKey() dans
// marches.html) ne sont volontairement PAS traduits : data.json reste une
// ressource globale non localisee (memes valeurs quelle que soit la langue
// de la page qui l'affiche).

function marketNames(d) { return d.market_names; }

var jsStr = require("./js-escape.js").jsStr;
var FR_DICT = require("../i18n/dict/fr.json");

// Donnees des championnats affiches sur l'Accueil (index.html). "name" est
// un identifiant sportif propre (Premier League, La Liga, Bundesliga...)
// et reste IDENTIQUE dans toutes les langues (voir consigne explicite :
// "les noms propres d'equipes/joueurs/competitions restent coherents, on
// traduit l'interface pas les identifiants sportifs") - sauf 'ldc'/'other'
// qui sont deja des libelles en francais dans la source (pas de vrais noms
// propres internationaux), traduits via i18n/dict/*.json#special_competitions.
// "country" est un nom de pays, traduit via #countries.
var LEAGUE_META = [
  {key:'premier', flag:'🏴󠁧󠁢󠁥󠁮󠁧󠁿', name:'Premier League', country:'Angleterre'},
  {key:'champ', flag:'🏴󠁧󠁢󠁥󠁮󠁧󠁿', name:'Championship', country:'Angleterre'},
  {key:'ligue1', flag:'🇫🇷', name:'Ligue 1', country:'France'},
  {key:'ligue2', flag:'🇫🇷', name:'Ligue 2', country:'France'},
  {key:'laliga', flag:'🇪🇸', name:'La Liga', country:'Espagne'},
  {key:'laliga2', flag:'🇪🇸', name:'La Liga 2', country:'Espagne'},
  {key:'seriea', flag:'🇮🇹', name:'Serie A', country:'Italie'},
  {key:'bundesliga', flag:'🇩🇪', name:'Bundesliga', country:'Allemagne'},
  {key:'ldc', flag:'🏆', name:'Ligue des Champions', country:null, specialKey:'ldc'},
  {key:'el', flag:'🏆', name:'Europa League', country:null},
  {key:'wc', flag:'🌍', name:'World Cup', country:null},
  {key:'other', flag:'🏆', name:'Coupe du Monde', country:null, specialKey:'other'},
  {key:'atp', flag:'🎾', name:'ATP', country:null},
  {key:'wta', flag:'🎾', name:'WTA', country:null},
  {key:'chine', flag:'🇨🇳', name:'Super League', country:'Chine'},
  {key:'finlande', flag:'🇫🇮', name:'Veikkausliiga', country:'Finlande'},
  {key:'maroc', flag:'🇲🇦', name:'Botola Pro', country:'Maroc'},
  {key:'canada', flag:'🇨🇦', name:'Canadian Premier', country:'Canada'},
  {key:'lettonie', flag:'🇱🇻', name:'Virsliga', country:'Lettonie'},
  {key:'islande', flag:'🇮🇸', name:'Úrvalsdeild', country:'Islande'},
  {key:'equateur', flag:'🇪🇨', name:'Liga Pro', country:'Équateur'},
  {key:'lituanie', flag:'🇱🇹', name:'A Lyga', country:'Lituanie'},
  {key:'eredivisie', flag:'🇳🇱', name:'Eredivisie', country:'Pays-Bas'},
  {key:'primeira', flag:'🇵🇹', name:'Primeira Liga', country:'Portugal'},
  {key:'superlig', flag:'🇹🇷', name:'Süper Lig', country:'Turquie'},
  {key:'superliga-dk', flag:'🇩🇰', name:'Superliga', country:'Danemark'},
  {key:'scottish', flag:'🏴󠁧󠁢󠁳󠁣󠁴󠁿', name:'Premiership', country:'Écosse'},
  {key:'belgique', flag:'🇧🇪', name:'Jupiler Pro League', country:'Belgique'},
  {key:'kleague', flag:'🇰🇷', name:'K League 1', country:'Corée du Sud'},
  {key:'coupe-france', flag:'🇫🇷', name:'Coupe de France', country:'France'},
  {key:'saudi', flag:'🇸🇦', name:'Saudi Pro League', country:'Arabie Saoudite'},
  {key:'copa-rey', flag:'🇪🇸', name:'Copa del Rey', country:'Espagne'},
  {key:'coppa-italia', flag:'🇮🇹', name:'Coppa Italia', country:'Italie'},
  {key:'dfb-pokal', flag:'🇩🇪', name:'DFB-Pokal', country:'Allemagne'},
  {key:'irlande', flag:'🇮🇪', name:'Premier Division', country:'Irlande'},
  {key:'suede', flag:'🇸🇪', name:'Allsvenskan', country:'Suède'},
  {key:'bresil', flag:'🇧🇷', name:'Brasileirão Série A', country:'Brésil'},
  {key:'mls', flag:'🇺🇸', name:'MLS', country:'USA'},
  {key:'ligamx', flag:'🇲🇽', name:'Liga MX', country:'Mexique'}
];

function renderLeagueLabels(dict) {
  var lines = LEAGUE_META.map(function (entry) {
    var name = entry.specialKey ? dict.special_competitions[entry.specialKey] : entry.name;
    var country = entry.country ? "'" + jsStr(dict.countries[entry.country]) + "'" : "null";
    return "  '" + entry.key + "':{flag:'" + entry.flag + "',name:'" + jsStr(name) + "',country:" + country + "},";
  });
  return "var LEAGUE_LABELS={\n" + lines.join("\n") + "\n};";
}
var LEAGUE_LABELS_FR_TEXT = renderLeagueLabels(FR_DICT);

// Nouveau chrome de l'accueil premium. Les textes sont regroupes ici pour
// que la refonte visuelle reste reellement localisee dans les six langues.
var HOME_V2 = {
  fr:{heroTagline:'Le football, en probabilités',matches:'Matchs',markets:'Marchés',method:'Méthode',guides:'Guides',start:'Commencer',eyebrow:"L'ANALYSE SPORTIVE, SANS LE BRUIT",title1:'Comprenez le match.',title2:'Identifiez le marché juste.',sub:'IASHARK transforme les statistiques des deux équipes en une probabilité claire, expliquée et comparée à la cote.',discover:'Découvrir la méthode',updated:'Données actualisées',multi:'Analyse multi-facteurs',explained:'Décision expliquée',featureLoading:'SÉLECTION DU MATCH À SUIVRE…',decisions:'Les décisions du jour',decisionsSub:'Un marché prioritaire par match, choisi selon la convergence des données.',recommended:'MARCHÉ RECOMMANDÉ',modelConfidence:"Probabilité estimée",reading:'Lecture IASHARK',priority:'Prioritaire',recent:'Forme récente',advanced:'Données avancées',context:'Contexte du match',insight:"Ouvrez l'analyse pour voir les facteurs, limites et risques de cette sélection.",confidence:'CONFIANCE',preliminary:'Analyse préliminaire',view:'Voir l\'analyse →',locked:'Analyse réservée aux membres Pro',upgrade:'Deviens Pro →',today:"Aujourd'hui",noHero:'AUCUN MATCH DISPONIBLE',noOtherToday:'AUCUN AUTRE MATCH TROUVÉ',noOtherTomorrow:'AUCUN AUTRE MATCH DEMAIN',otherLeague:'Essaie un autre championnat.',priceMonth:"/mois",priceNote:"Sans engagement · résiliable en un clic",freeFeatAll:"Tous les matchs du jour visibles",proFeatTools:"Les outils Pro : détecteur d’écarts sur les matchs réels, combiné sur les analyses, journal synchronisé",tomorrow:"Demain",badgeLeagues:"19 compétitions",badgeRest:"analyse publiée avant le coup d'envoi",statLeagues:"Compétitions couvertes",statModels:"Modèles statistiques",statFree:"Analyse offerte par jour"},
  en:{heroTagline:'Football, in probabilities',matches:'Matches',markets:'Markets',method:'Method',guides:'Guides',start:'Get started',eyebrow:'SPORTS ANALYSIS, WITHOUT THE NOISE',title1:'Understand the match.',title2:'Find the right market.',sub:'IASHARK turns both teams\' statistics into a clear, explained probability, compared with the odds.',discover:'Discover the method',updated:'Updated data',multi:'Multi-factor analysis',explained:'Explained decision',featureLoading:'SELECTING THE MATCH TO WATCH…',decisions:"Today's decisions",decisionsSub:'One priority market per match, selected when the data converges.',recommended:'RECOMMENDED MARKET',modelConfidence:'Estimated probability',reading:'IASHARK reading',priority:'Priority',recent:'Recent form',advanced:'Advanced data',context:'Match context',insight:'Open the analysis to see the factors, limitations and risks behind this selection.',confidence:'CONFIDENCE',preliminary:'Preliminary analysis',view:'View analysis →',locked:'Analysis reserved for Pro members',upgrade:'Go Pro →',today:'Today',noHero:'NO MATCH AVAILABLE',noOtherToday:'NO OTHER MATCH FOUND',noOtherTomorrow:'NO OTHER MATCH TOMORROW',otherLeague:'Try another competition.',priceMonth:"/month",priceNote:"No commitment · cancel in one click",freeFeatAll:"Every match of the day, visible",proFeatTools:"Pro tools: gap detector on real matches, accumulator built on the analyses, synced journal",tomorrow:"Tomorrow",badgeLeagues:"19 competitions",badgeRest:"analysis published before kick-off",statLeagues:"Competitions covered",statModels:"Statistical models",statFree:"Free analysis per day"},
  es:{heroTagline:'El fútbol, en probabilidades',matches:'Partidos',markets:'Mercados',method:'Método',guides:'Guías',start:'Empezar',eyebrow:'ANÁLISIS DEPORTIVO, SIN RUIDO',title1:'Entiende el partido.',title2:'Encuentra el mercado adecuado.',sub:'IASHARK transforma las estadísticas de los dos equipos en una probabilidad clara, explicada y comparada con la cuota.',discover:'Descubrir el método',updated:'Datos actualizados',multi:'Análisis multifactorial',explained:'Decisión explicada',featureLoading:'SELECCIONANDO EL PARTIDO DESTACADO…',decisions:'Las decisiones del día',decisionsSub:'Un mercado prioritario por partido, elegido cuando convergen los datos.',recommended:'MERCADO RECOMENDADO',modelConfidence:'Probabilidad estimada',reading:'Lectura IASHARK',priority:'Prioritario',recent:'Forma reciente',advanced:'Datos avanzados',context:'Contexto del partido',insight:'Abre el análisis para ver los factores, límites y riesgos de esta selección.',confidence:'CONFIANZA',preliminary:'Análisis preliminar',view:'Ver análisis →',today:'Hoy',noHero:'NINGÚN PARTIDO DISPONIBLE',noOtherToday:'NO SE ENCONTRARON MÁS PARTIDOS',noOtherTomorrow:'NO HAY OTRO PARTIDO MAÑANA',otherLeague:'Prueba otra competición.',priceMonth:"/mes",priceNote:"Sin compromiso · cancela en un clic",freeFeatAll:"Todos los partidos del día, visibles",proFeatTools:"Herramientas Pro: detector de diferencias en partidos reales, combinada sobre los análisis, diario sincronizado",tomorrow:"Mañana",badgeLeagues:"19 competiciones",badgeRest:"análisis publicado antes del inicio",statLeagues:"Competiciones cubiertas",statModels:"Modelos estadísticos",statFree:"Análisis gratis al día"},
  de:{heroTagline:'Fußball, in Wahrscheinlichkeiten',matches:'Spiele',markets:'Märkte',method:'Methode',guides:'Guides',start:'Starten',eyebrow:'SPORTANALYSE, OHNE ABLENKUNG',title1:'Verstehe das Spiel.',title2:'Finde den richtigen Markt.',sub:'IASHARK verwandelt die Statistiken beider Teams in eine klare, erklärte Wahrscheinlichkeit, verglichen mit der Quote.',discover:'Methode entdecken',updated:'Aktuelle Daten',multi:'Multifaktor-Analyse',explained:'Erklärte Entscheidung',featureLoading:'TOPSPIEL WIRD AUSGEWÄHLT…',decisions:'Die Entscheidungen des Tages',decisionsSub:'Ein vorrangiger Markt pro Spiel, ausgewählt wenn die Daten übereinstimmen.',recommended:'EMPFOHLENER MARKT',modelConfidence:'Geschätzte Wahrscheinlichkeit',reading:'IASHARK Einschätzung',priority:'Prioritär',recent:'Aktuelle Form',advanced:'Erweiterte Daten',context:'Spielkontext',insight:'Öffne die Analyse, um Faktoren, Grenzen und Risiken dieser Auswahl zu sehen.',confidence:'KONFIDENZ',preliminary:'Vorläufige Analyse',view:'Analyse ansehen →',today:'Heute',noHero:'KEIN SPIEL VERFÜGBAR',noOtherToday:'KEIN WEITERES SPIEL GEFUNDEN',noOtherTomorrow:'MORGEN KEIN WEITERES SPIEL',otherLeague:'Versuche einen anderen Wettbewerb.',priceMonth:"/Monat",priceNote:"Keine Bindung · Kündigung mit einem Klick",freeFeatAll:"Alle Spiele des Tages sichtbar",proFeatTools:"Pro-Tools: Abweichungs-Detektor für echte Spiele, Kombiwette auf Basis der Analysen, synchronisiertes Journal",tomorrow:"Morgen",badgeLeagues:"19 Wettbewerbe",badgeRest:"Analyse vor dem Anpfiff veröffentlicht",statLeagues:"Abgedeckte Wettbewerbe",statModels:"Statistische Modelle",statFree:"Gratis-Analyse pro Tag"},
  it:{heroTagline:'Il calcio, in probabilità',matches:'Partite',markets:'Mercati',method:'Metodo',guides:'Guide',start:'Inizia',eyebrow:'ANALISI SPORTIVA, SENZA RUMORE',title1:'Comprendi la partita.',title2:'Trova il mercato giusto.',sub:'IASHARK trasforma le statistiche delle due squadre in una probabilità chiara, spiegata e confrontata con la quota.',discover:'Scopri il metodo',updated:'Dati aggiornati',multi:'Analisi multifattoriale',explained:'Decisione spiegata',featureLoading:'SELEZIONE DEL MATCH DA SEGUIRE…',decisions:'Le decisioni del giorno',decisionsSub:'Un mercato prioritario per partita, scelto quando i dati convergono.',recommended:'MERCATO CONSIGLIATO',modelConfidence:"Probabilità stimata",reading:'Lettura IASHARK',priority:'Prioritario',recent:'Forma recente',advanced:'Dati avanzati',context:'Contesto partita',insight:"Apri l'analisi per vedere fattori, limiti e rischi di questa selezione.",confidence:'FIDUCIA',preliminary:'Analisi preliminare',view:"Vedi l'analisi →",today:'Oggi',noHero:'NESSUNA PARTITA DISPONIBILE',noOtherToday:'NESSUN ALTRO MATCH TROVATO',noOtherTomorrow:'NESSUN ALTRO MATCH DOMANI',otherLeague:"Prova un'altra competizione.",priceMonth:"/mese",priceNote:"Nessun vincolo · disdici con un clic",freeFeatAll:"Tutte le partite del giorno, visibili",proFeatTools:"Strumenti Pro: rilevatore di scarti sulle partite reali, multipla basata sulle analisi, diario sincronizzato",tomorrow:"Domani",badgeLeagues:"19 competizioni",badgeRest:"analisi pubblicata prima del fischio d'inizio",statLeagues:"Competizioni coperte",statModels:"Modelli statistici",statFree:"Analisi gratuita al giorno"},
  pt:{heroTagline:'O futebol, em probabilidades',matches:'Jogos',markets:'Mercados',method:'Método',guides:'Guias',start:'Começar',eyebrow:'ANÁLISE DESPORTIVA, SEM RUÍDO',title1:'Compreenda o jogo.',title2:'Encontre o mercado certo.',sub:'A IASHARK transforma as estatísticas das duas equipas numa probabilidade clara, explicada e comparada com a odd.',discover:'Descobrir o método',updated:'Dados atualizados',multi:'Análise multifatorial',explained:'Decisão explicada',featureLoading:'A SELECIONAR O JOGO EM DESTAQUE…',decisions:'As decisões do dia',decisionsSub:'Um mercado prioritário por jogo, escolhido quando os dados convergem.',recommended:'MERCADO RECOMENDADO',modelConfidence:'Probabilidade estimada',reading:'Leitura IASHARK',priority:'Prioritário',recent:'Forma recente',advanced:'Dados avançados',context:'Contexto do jogo',insight:'Abra a análise para ver os fatores, limites e riscos desta seleção.',confidence:'CONFIANÇA',preliminary:'Análise preliminar',view:'Ver análise →',today:'Hoje',noHero:'NENHUM JOGO DISPONÍVEL',noOtherToday:'NENHUM OUTRO JOGO ENCONTRADO',noOtherTomorrow:'NENHUM OUTRO JOGO AMANHÃ',otherLeague:'Experimente outra competição.',priceMonth:"/mês",priceNote:"Sem compromisso · cancele num clique",freeFeatAll:"Todos os jogos do dia, visíveis",proFeatTools:"Ferramentas Pro: detetor de diferenças em jogos reais, múltipla baseada nas análises, diário sincronizado",tomorrow:"Amanhã",badgeLeagues:"19 competições",badgeRest:"análise publicada antes do apito inicial",statLeagues:"Competições cobertas",statModels:"Modelos estatísticos",statFree:"Análise grátis por dia"}
};

var HOME_V3 = {"fr":{"railLbl":"19 COMPÉTITIONS COUVERTES","anaLbl":"CE QUE TU REÇOIS","anaT1":"Une analyse, ","anaT2":"pas un pronostic","anaT3":" balancé sans explication.","c1t":"Le signal","c1d":"Le marché retenu, sa probabilité selon le modèle, celle du marché, et l’écart entre les deux — affiché même quand il est défavorable.","c2t":"Notre lecture du match","c2d":"Ce que le modèle a vu, écrit en français, avec le facteur qui a fait pencher la décision.","c3t":"Ce que dit le modèle","c3d":"Buts attendus par équipe et scores les plus probables, en clair.","c4t":"Comparatif des deux équipes","c4d":"Tirs, tirs cadrés, possession, corners — avec les lignes qui pèsent sur le marché recommandé mises en avant.","c5t":"Scénario probable","c5d":"La probabilité de but tranche de 15 minutes par tranche de 15 minutes.","c6t":"Les limites","c6d":"Les stats à ne pas surinterpréter, et ce que la donnée ne permet pas d’affirmer.","trLbl":"CE QU’ON NE FERA PAS","trT1":"On préfère te dire ","trT2":"quand on ne sait pas.","t1t":"Aucune promesse de gain","t1d":"Le pari reste un pari. On calcule des probabilités, on ne garantit aucun résultat.","t2t":"L’écart s’affiche même quand il te dessert","t2d":"Si la cote proposée est moins intéressante que notre estimation, c’est écrit noir sur blanc.","t3t":"Rien ne change après le coup d’envoi","t3d":"Recalculée chaque jour tant que le match n’a pas commencé, l’analyse n’est plus modifiée après le coup d’envoi.","t4t":"La fiabilité affichée","t4d":"Chaque analyse indique la fiabilité de ses données : un échantillon mince est signalé comme tel.","faqLbl":"QUESTIONS FRÉQUENTES","faqT1":"Ce que tu te demandes ","faqT2":"avant de payer.","q1":"Je peux essayer avant de payer ?","a1":"Oui. Une analyse complète est offerte chaque jour avec un compte gratuit, sans carte bancaire : le même contenu que pour un abonné. Elle est choisie parmi les écarts les plus favorables du jour ; les autres analyses ne le sont pas toutes.","q2":"Je vais gagner de l’argent ?","a2":"Personne ne peut te le promettre, et on ne le fera pas. Le modèle estime des probabilités puis les compare aux cotes. C’est une méthode, pas une garantie.","q3":"Je peux résilier quand je veux ?","a3":"Oui, en ligne depuis ton compte, à tout moment. Sans engagement, sans préavis, sans justification.","q4":"D’où viennent les données ?","a4":"Des données officielles de match : compositions, historiques de confrontation, statistiques de tirs et de buts attendus, et les cotes réelles des bookmakers.","q5":"Combien de matchs par jour ?","a5":"Tous les matchs des 19 compétitions couvertes. Le nombre varie selon le calendrier — tu vois la liste complète du jour sur cette page."},"en":{"railLbl":"19 COMPETITIONS COVERED","anaLbl":"WHAT YOU GET","anaT1":"An analysis, ","anaT2":"not a tip","anaT3":" thrown at you with no explanation.","c1t":"The signal","c1d":"The selected market, its model probability, the market's, and the gap between them — shown even when it works against you.","c2t":"Our read on the match","c2d":"What the model saw, in plain words, with the factor that tipped the decision.","c3t":"What the model says","c3d":"Expected goals per team and the most likely scorelines, in plain view.","c4t":"Head-to-head comparison","c4d":"Shots, shots on target, possession, corners — with the rows that drive the recommended market highlighted.","c5t":"Likely scenario","c5d":"Goal probability, fifteen minutes at a time.","c6t":"The limits","c6d":"The stats not to over-read, and what the data simply cannot claim.","trLbl":"WHAT WE WON'T DO","trT1":"We'd rather tell you ","trT2":"when we don't know.","t1t":"No promise of profit","t1d":"A bet stays a bet. We compute probabilities; we guarantee no outcome.","t2t":"The gap shows even when it hurts you","t2d":"If the offered odds are worse than our estimate, we say so in black and white.","t3t":"Nothing changes after kick-off","t3d":"Recalculated every day until the match starts, the analysis is no longer changed after kick-off.","t4t":"Reliability on display","t4d":"Every analysis shows how reliable its data is: a thin sample is flagged as such.","faqLbl":"FREQUENTLY ASKED","faqT1":"What you're wondering ","faqT2":"before you pay.","q1":"Can I try before paying?","a1":"Yes. One full analysis is free every day with a free account, no card required: the same content a subscriber gets. It is picked among the day's most favourable gaps; not every other analysis is as favourable.","q2":"Will I make money?","a2":"Nobody can promise you that, and we won't. The model estimates probabilities, then compares them with the odds. It is a method, not a guarantee.","q3":"Can I cancel any time?","a3":"Yes, online from your account, at any time. No commitment, no notice, no reason needed.","q4":"Where does the data come from?","a4":"From official match data: line-ups, head-to-head history, shot and expected-goals statistics, and real bookmaker odds.","q5":"How many matches per day?","a5":"Every match across the 19 competitions we cover. The count varies with the fixture list — you see today's full list on this page."},"es":{"railLbl":"19 COMPETICIONES CUBIERTAS","anaLbl":"LO QUE RECIBES","anaT1":"Un análisis, ","anaT2":"no un pronóstico","anaT3":" lanzado sin explicación.","c1t":"La señal","c1d":"El mercado elegido, su probabilidad según el modelo, la del mercado y la diferencia entre ambas — mostrada incluso cuando te perjudica.","c2t":"Nuestra lectura del partido","c2d":"Lo que vio el modelo, en lenguaje claro, con el factor que inclinó la decisión.","c3t":"Lo que dice el modelo","c3d":"Goles esperados por equipo y los marcadores más probables, a la vista.","c4t":"Comparativa de los dos equipos","c4d":"Tiros, tiros a puerta, posesión, córners — con las líneas que pesan en el mercado recomendado destacadas.","c5t":"Escenario probable","c5d":"La probabilidad de gol, tramo de 15 minutos a tramo de 15 minutos.","c6t":"Los límites","c6d":"Las estadísticas que no hay que sobreinterpretar, y lo que el dato no permite afirmar.","trLbl":"LO QUE NO HAREMOS","trT1":"Preferimos decirte ","trT2":"cuando no lo sabemos.","t1t":"Ninguna promesa de ganancia","t1d":"Una apuesta sigue siendo una apuesta. Calculamos probabilidades, no garantizamos ningún resultado.","t2t":"La diferencia se muestra aunque te perjudique","t2d":"Si la cuota ofrecida es peor que nuestra estimación, está escrito negro sobre blanco.","t3t":"Nada cambia tras el inicio","t3d":"Se recalcula cada día hasta que empieza el partido y ya no se modifica tras el inicio.","t4t":"La fiabilidad, a la vista","t4d":"Cada análisis indica la fiabilidad de sus datos: una muestra escasa se señala como tal.","faqLbl":"PREGUNTAS FRECUENTES","faqT1":"Lo que te preguntas ","faqT2":"antes de pagar.","q1":"¿Puedo probar antes de pagar?","a1":"Sí. Un análisis completo gratis cada día con una cuenta gratuita, sin tarjeta: el mismo contenido que recibe un suscriptor. Se elige entre las diferencias más favorables del día; no todos los demás análisis lo son tanto.","q2":"¿Voy a ganar dinero?","a2":"Nadie puede prometértelo, y nosotros no lo haremos. El modelo estima probabilidades y luego las compara con las cuotas. Es un método, no una garantía.","q3":"¿Puedo cancelar cuando quiera?","a3":"Sí, en línea desde tu cuenta, en cualquier momento. Sin compromiso, sin preaviso, sin justificación.","q4":"¿De dónde vienen los datos?","a4":"De datos oficiales de partido: alineaciones, historial de enfrentamientos, estadísticas de tiros y goles esperados, y las cuotas reales de las casas.","q5":"¿Cuántos partidos al día?","a5":"Todos los partidos de las 19 competiciones cubiertas. El número varía según el calendario — ves la lista completa del día en esta página."},"de":{"railLbl":"19 WETTBEWERBE ABGEDECKT","anaLbl":"WAS DU BEKOMMST","anaT1":"Eine Analyse, ","anaT2":"kein Tipp","anaT3":" ohne jede Erklärung.","c1t":"Das Signal","c1d":"Der gewählte Markt, seine Modellwahrscheinlichkeit, die des Marktes und die Abweichung — auch wenn sie gegen dich spricht.","c2t":"Unsere Einschätzung des Spiels","c2d":"Was das Modell gesehen hat, in klaren Worten, mit dem ausschlaggebenden Faktor.","c3t":"Was das Modell sagt","c3d":"Erwartete Tore pro Team und die wahrscheinlichsten Ergebnisse, klar dargestellt.","c4t":"Vergleich beider Teams","c4d":"Schüsse, Schüsse aufs Tor, Ballbesitz, Ecken — mit hervorgehobenen Zeilen, die den empfohlenen Markt bestimmen.","c5t":"Wahrscheinliches Szenario","c5d":"Die Torwahrscheinlichkeit, 15-Minuten-Abschnitt für 15-Minuten-Abschnitt.","c6t":"Die Grenzen","c6d":"Die Statistiken, die man nicht überbewerten sollte, und was die Daten nicht hergeben.","trLbl":"WAS WIR NICHT TUN","trT1":"Wir sagen dir lieber, ","trT2":"wann wir es nicht wissen.","t1t":"Kein Gewinnversprechen","t1d":"Eine Wette bleibt eine Wette. Wir berechnen Wahrscheinlichkeiten, garantieren aber kein Ergebnis.","t2t":"Die Abweichung wird auch dann gezeigt, wenn sie gegen dich spricht","t2d":"Ist die angebotene Quote schlechter als unsere Schätzung, steht das schwarz auf weiß da.","t3t":"Nach dem Anpfiff ändert sich nichts","t3d":"Bis zum Anpfiff täglich neu berechnet, wird die Analyse danach nicht mehr geändert.","t4t":"Die Verlässlichkeit steht dabei","t4d":"Jede Analyse zeigt, wie belastbar ihre Daten sind: Eine dünne Datenbasis wird als solche markiert.","faqLbl":"HÄUFIGE FRAGEN","faqT1":"Was du dich fragst, ","faqT2":"bevor du zahlst.","q1":"Kann ich vor dem Kauf testen?","a1":"Ja. Eine vollständige Analyse ist täglich gratis, mit kostenlosem Konto und ohne Karte: derselbe Inhalt wie für Abonnenten. Sie wird unter den günstigsten Abweichungen des Tages gewählt; nicht alle anderen Analysen sind so günstig.","q2":"Werde ich Geld verdienen?","a2":"Das kann dir niemand versprechen, und wir tun es nicht. Das Modell schätzt Wahrscheinlichkeiten und vergleicht sie dann mit den Quoten. Eine Methode, keine Garantie.","q3":"Kann ich jederzeit kündigen?","a3":"Ja, online in deinem Konto, jederzeit. Ohne Bindung, ohne Frist, ohne Begründung.","q4":"Woher kommen die Daten?","a4":"Aus offiziellen Spieldaten: Aufstellungen, Direktvergleiche, Schuss- und Expected-Goals-Statistiken sowie echte Buchmacherquoten.","q5":"Wie viele Spiele pro Tag?","a5":"Alle Spiele der 19 abgedeckten Wettbewerbe. Die Zahl hängt vom Spielplan ab — die vollständige Tagesliste siehst du auf dieser Seite."},"it":{"railLbl":"19 COMPETIZIONI COPERTE","anaLbl":"COSA RICEVI","anaT1":"Un'analisi, ","anaT2":"non un pronostico","anaT3":" buttato lì senza spiegazioni.","c1t":"Il segnale","c1d":"Il mercato scelto, la sua probabilità secondo il modello, quella del mercato e lo scarto — mostrato anche quando è sfavorevole.","c2t":"La nostra lettura della partita","c2d":"Ciò che il modello ha visto, in parole chiare, con il fattore decisivo.","c3t":"Cosa dice il modello","c3d":"Gol attesi per squadra e i risultati più probabili, in chiaro.","c4t":"Confronto tra le due squadre","c4d":"Tiri, tiri in porta, possesso, calci d'angolo — con in evidenza le righe che pesano sul mercato consigliato.","c5t":"Scenario probabile","c5d":"La probabilità di gol, blocco di 15 minuti dopo blocco di 15 minuti.","c6t":"I limiti","c6d":"Le statistiche da non sopravvalutare, e ciò che il dato non permette di affermare.","trLbl":"COSA NON FAREMO","trT1":"Preferiamo dirti ","trT2":"quando non lo sappiamo.","t1t":"Nessuna promessa di guadagno","t1d":"Una scommessa resta una scommessa. Calcoliamo probabilità, non garantiamo alcun risultato.","t2t":"Lo scarto si vede anche quando ti penalizza","t2d":"Se la quota proposta è peggiore della nostra stima, lo scriviamo nero su bianco.","t3t":"Nulla cambia dopo il fischio d'inizio","t3d":"Ricalcolata ogni giorno fino all'inizio della partita, l'analisi non viene più modificata dopo il fischio d'inizio.","t4t":"L'affidabilità in chiaro","t4d":"Ogni analisi indica l'affidabilità dei suoi dati: un campione ridotto viene segnalato come tale.","faqLbl":"DOMANDE FREQUENTI","faqT1":"Quello che ti chiedi ","faqT2":"prima di pagare.","q1":"Posso provare prima di pagare?","a1":"Sì. Un'analisi completa è offerta ogni giorno con un account gratuito, senza carta: lo stesso contenuto che riceve un abbonato. È scelta tra gli scarti più favorevoli del giorno; non tutte le altre analisi lo sono altrettanto.","q2":"Guadagnerò dei soldi?","a2":"Nessuno può promettertelo, e noi non lo faremo. Il modello stima delle probabilità e poi le confronta con le quote. È un metodo, non una garanzia.","q3":"Posso disdire quando voglio?","a3":"Sì, online dal tuo account, in qualsiasi momento. Senza vincoli, senza preavviso, senza giustificazioni.","q4":"Da dove vengono i dati?","a4":"Da dati ufficiali delle partite: formazioni, storico dei confronti, statistiche di tiri e gol attesi, e le quote reali dei bookmaker.","q5":"Quante partite al giorno?","a5":"Tutte le partite delle 19 competizioni coperte. Il numero varia col calendario — vedi l'elenco completo del giorno in questa pagina."},"pt":{"railLbl":"19 COMPETIÇÕES COBERTAS","anaLbl":"O QUE RECEBES","anaT1":"Uma análise, ","anaT2":"não um palpite","anaT3":" atirado sem explicação.","c1t":"O sinal","c1d":"O mercado escolhido, a sua probabilidade segundo o modelo, a do mercado e a diferença — mostrada mesmo quando te desfavorece.","c2t":"A nossa leitura do jogo","c2d":"O que o modelo viu, em linguagem clara, com o fator que decidiu.","c3t":"O que diz o modelo","c3d":"Golos esperados por equipa e os resultados mais prováveis, à vista.","c4t":"Comparação das duas equipas","c4d":"Remates, remates à baliza, posse, cantos — com as linhas que pesam no mercado recomendado destacadas.","c5t":"Cenário provável","c5d":"A probabilidade de golo, faixa de 15 minutos a faixa de 15 minutos.","c6t":"Os limites","c6d":"As estatísticas a não sobre-interpretar, e o que os dados não permitem afirmar.","trLbl":"O QUE NÃO FAREMOS","trT1":"Preferimos dizer-te ","trT2":"quando não sabemos.","t1t":"Nenhuma promessa de ganho","t1d":"Uma aposta continua a ser uma aposta. Calculamos probabilidades, não garantimos resultados.","t2t":"A diferença aparece mesmo quando te prejudica","t2d":"Se a odd proposta for pior do que a nossa estimativa, está escrito preto no branco.","t3t":"Nada muda depois do apito inicial","t3d":"Recalculada todos os dias até o jogo começar, a análise deixa de ser alterada depois do apito inicial.","t4t":"A fiabilidade à vista","t4d":"Cada análise indica a fiabilidade dos seus dados: uma amostra reduzida é assinalada como tal.","faqLbl":"PERGUNTAS FREQUENTES","faqT1":"O que te perguntas ","faqT2":"antes de pagares.","q1":"Posso experimentar antes de pagar?","a1":"Sim. Uma análise completa é oferecida todos os dias com uma conta gratuita, sem cartão: o mesmo conteúdo que recebe um assinante. É escolhida entre as diferenças mais favoráveis do dia; nem todas as outras análises o são tanto.","q2":"Vou ganhar dinheiro?","a2":"Ninguém te pode prometer isso, e nós não o faremos. O modelo estima probabilidades e depois compara-as com as odds. É um método, não uma garantia.","q3":"Posso cancelar quando quiser?","a3":"Sim, online a partir da tua conta, a qualquer momento. Sem compromisso, sem aviso prévio, sem justificação.","q4":"De onde vêm os dados?","a4":"De dados oficiais de jogo: alinhamentos, histórico de confrontos, estatísticas de remates e golos esperados, e as odds reais das casas.","q5":"Quantos jogos por dia?","a5":"Todos os jogos das 19 competições cobertas. O número varia com o calendário — vês a lista completa do dia nesta página."}};

var HOME_V4 = {"fr":{"t2":"Identifiez le marché ","t3":"juste.","cta1":"Voir l'analyse gratuite du jour","cta2":"Voir un exemple d'analyse","price":"Essayer gratuitement · Pro à 19,95 € par mois, sans engagement","decSub":"Les matchs présentant aujourd’hui un écart exploitable entre le modèle et le marché.","b1t":"text-ink\">Le signal</h3>","b1d":"Le marché le plus probable parmi ceux qui sont cotés, avec l’écart entre notre estimation et la cote, favorable ou non.","b2t":"L’explication","b2d":"Les données et les facteurs qui ont conduit le modèle à cette conclusion, écrits en clair.","b3t":"L’incertitude","b3d":"Chaque analyse indique la fiabilité de ses données. Un échantillon mince est écrit, pas caché.","kpiEye":"CE QUE LE MOTEUR A DÉJÀ TRAITÉ","kpi1":"Analyses publiées","kpi3":"Simulations par match","kpi4":"Matchs analysés sur 3 jours","trLead":"Une probabilité ne vaut que par sa fiabilité : on affiche les deux, même quand elles sont modestes.","acc3":"quand tu veux tout voir.","pfName":"text-soft\">Gratuit</h3>","pfDesc":"Pour juger le produit sur pièce : compte gratuit, sans carte bancaire.","pfCta":"[0.05]\">Commencer</a>","ff1":"Analyse gratuite du jour, complète, avec un compte gratuit","ff2":"Marché identifié et probabilité estimée","ff3":"Explication détaillée du signal","pMonth":"/mois","pNote":"Sans engagement · résiliable en ligne à tout moment","pCta":"Débloquer Pro","pPlus":"Tout le plan Gratuit, plus :","mTitle3":"par match.","mLead":"Chaque étape répond à une question différente. Un seul marché en sort, choisi par une règle fixe.","m1d":"Ce que chaque équipe produit et concède, à domicile ou à l’extérieur.","m2d":"Avec peu de matchs joués, la saison précédente pèse davantage.","m3d":"Des buts attendus à la probabilité de chaque score, puis de chaque marché.","m4d":"Le match rejoué un grand nombre de fois, pour les scores les plus probables.","sigT":"Signal IASHARK","sigD":"Un marché prioritaire, une probabilité, et l’écart mesuré avec le prix du marché.","s1d":"Calendriers, classements, résultats récents, confrontations directes et absences annoncées, championnat par championnat.","s2t":"Le modèle calcule","s2d":"Buts attendus, probabilité de chaque score, puis de chaque marché — sans les cotes.","s3d":"Une fiche claire : probabilité, fiabilité, et l’écart détecté avec le marché réel.","q2":"Est-ce que IASHARK garantit des gains ?","a2":"Non, et personne ne le peut. Le modèle estime des probabilités puis les compare aux cotes. C’est une méthode, pas une garantie.","q3":"Comment le signal est-il calculé ?","a3":"Le système estime les buts attendus de chaque équipe, en déduit la probabilité de chaque score puis de chaque marché, et retient le marché le plus probable, sous une cote minimale et un plafond de probabilité. L’écart avec le prix du marché est calculé ensuite et affiché à part.","q4":"Que se passe-t-il quand les données ne suffisent pas ?","a4":"Aucun signal n’est publié sur ce match. C’est affiché explicitement plutôt que remplacé par un pari de remplissage.","q5":"Quels championnats sont couverts ?","a5":"Dix-neuf compétitions, dont la Ligue 1, la Premier League, la Liga, la Serie A, la Bundesliga, la Champions League, la Liga MX, la Premier Soccer League et les championnats d’Argentine, de Colombie, du Pérou et du Chili. La liste complète défile en haut de cette page.","q7":"À quelle fréquence les analyses sont-elles mises à jour ?","a7":"Chaque jour, tant que le match n’a pas commencé. Après le coup d’envoi, l’analyse n’est plus modifiée.","cCta1":"mc-cta\">Voir l\\'analyse complète<","cCta2":"Débloquer avec Pro","cFree":"mc-badge-free\">Analyse gratuite</span>","cConf":"PROBABILITÉ ESTIMÉE","cLockSr":"Réservé aux membres Pro","m1t":"Forces en présence","m2t":"Prudence en début de saison","m3t":"Probabilité de chaque marché","m4t":"Simulation du match"},"en":{"t2":"Find the right market ","t3":"that's fair.","cta1":"See today's free analysis","cta2":"See a sample analysis","price":"Try it free · Pro at €19.95 a month, no commitment","decSub":"Today's matches where the model and the market disagree enough to matter.","b1t":"text-ink\">The signal</h3>","b1d":"The most likely market among those with odds, with the gap between our estimate and the odds, favourable or not.","b2t":"The reasoning","b2d":"The data and factors that led the model there, written in plain words.","b3t":"The uncertainty","b3d":"Every analysis shows how reliable its data is. A thin sample is stated, not hidden.","kpiEye":"WHAT THE ENGINE HAS PROCESSED","kpi1":"Analyses published","kpi3":"Simulations per match","kpi4":"Matches analysed over 3 days","trLead":"A probability is only worth its reliability: we show both, even when they are modest.","acc3":"when you want to see everything.","pfName":"text-soft\">Free</h3>","pfDesc":"To judge the product for yourself: free account, no card required.","pfCta":"[0.05]\">Get started</a>","ff1":"Today's free analysis, in full, with a free account","ff2":"Identified market and estimated probability","ff3":"Detailed explanation of the signal","pMonth":"/month","pNote":"No commitment · cancel online anytime","pCta":"Unlock Pro","pPlus":"Everything in Free, plus:","mTitle3":"per match.","mLead":"Each step answers a different question. A single market comes out, chosen by a fixed rule.","m1d":"What each team produces and concedes, at home or away.","m2d":"With few matches played, the previous season weighs more.","m3d":"From expected goals to the probability of every scoreline, then of every market.","m4d":"The match replayed a large number of times, for the most likely scorelines.","sigT":"IASHARK signal","sigD":"One priority market, one probability, and the measured gap against the market price.","s1d":"Fixtures, standings, recent results, head-to-head history and announced absences, league by league.","s2t":"The model computes","s2d":"Expected goals, the probability of every scoreline, then of every market — without the odds.","s3d":"One clear sheet: probability, reliability, and the gap found against the real market.","q2":"Does IASHARK guarantee winnings?","a2":"No, and nobody can. The model estimates probabilities, then compares them with the odds. It is a method, not a guarantee.","q3":"How is the signal computed?","a3":"The system estimates each team's expected goals, derives the probability of every scoreline and then of every market, and keeps the most likely market, above a minimum price and below a probability cap. The gap with the market price is computed afterwards and shown separately.","q4":"What happens when the data isn't enough?","a4":"No signal is published for that match. It is stated explicitly rather than replaced by a filler bet.","q5":"Which competitions are covered?","a5":"Nineteen competitions, including Ligue 1, the Premier League, La Liga, Serie A, the Bundesliga, the Champions League, Liga MX, the Premier Soccer League and the top leagues of Argentina, Colombia, Peru and Chile. The full list scrolls at the top of this page.","q7":"How often are the analyses updated?","a7":"Every day, until the match starts. After kick-off, the analysis is no longer changed.","cCta1":"mc-cta\">See the full analysis<","cCta2":"Unlock with Pro","cFree":"mc-badge-free\">Free analysis</span>","cConf":"ESTIMATED PROBABILITY","cLockSr":"Reserved for Pro members","m1t":"Team strengths","m2t":"Caution early in the season","m3t":"Probability of every market","m4t":"Match simulation"},"es":{"t2":"Encuentra el mercado ","t3":"justo.","cta1":"Ver el análisis gratuito del día","cta2":"Ver un ejemplo de análisis","price":"Prueba gratis · Pro a 19,95 € al mes, sin compromiso","decSub":"Los partidos que hoy presentan una diferencia aprovechable entre el modelo y el mercado.","b1t":"text-ink\">La señal</h3>","b1d":"El mercado más probable entre los que tienen cuota, con la diferencia entre nuestra estimación y la cuota, favorable o no.","b2t":"La explicación","b2d":"Los datos y factores que llevaron al modelo a esa conclusión, en lenguaje claro.","b3t":"La incertidumbre","b3d":"Cada análisis indica la fiabilidad de sus datos. Una muestra escasa se dice, no se oculta.","kpiEye":"LO QUE EL MOTOR YA HA PROCESADO","kpi1":"Análisis publicados","kpi3":"Simulaciones por partido","kpi4":"Partidos analizados en 3 días","trLead":"Una probabilidad vale lo que vale su fiabilidad: mostramos ambas, aunque sean modestas.","acc3":"cuando quieras verlo todo.","pfName":"text-soft\">Gratis</h3>","pfDesc":"Para juzgar el producto por ti mismo: cuenta gratuita, sin tarjeta.","pfCta":"[0.05]\">Empezar</a>","ff1":"Análisis gratuito del día, completo, con una cuenta gratuita","ff2":"Mercado identificado y probabilidad estimada","ff3":"Explicación detallada de la señal","pMonth":"/mes","pNote":"Sin compromiso · cancela en línea cuando quieras","pCta":"Desbloquear Pro","pPlus":"Todo el plan Gratis, más:","mTitle3":"por partido.","mLead":"Cada etapa responde a una pregunta distinta. Sale un solo mercado, elegido por una regla fija.","m1d":"Lo que cada equipo produce y concede, en casa o fuera.","m2d":"Con pocos partidos jugados, la temporada anterior pesa más.","m3d":"De los goles esperados a la probabilidad de cada marcador y de cada mercado.","m4d":"El partido rejugado un gran número de veces, para los marcadores más probables.","sigT":"Señal IASHARK","sigD":"Un mercado prioritario, una probabilidad y la diferencia medida con el precio del mercado.","s1d":"Calendarios, clasificaciones, resultados recientes, enfrentamientos directos y bajas anunciadas, liga por liga.","s2t":"El modelo calcula","s2d":"Goles esperados, probabilidad de cada marcador y después de cada mercado, sin las cuotas.","s3d":"Una ficha clara: probabilidad, fiabilidad y la diferencia detectada con el mercado real.","q2":"¿IASHARK garantiza ganancias?","a2":"No, y nadie puede. El modelo estima probabilidades y luego las compara con las cuotas. Es un método, no una garantía.","q3":"¿Cómo se calcula la señal?","a3":"El sistema estima los goles esperados de cada equipo, deduce la probabilidad de cada marcador y después de cada mercado, y se queda con el mercado más probable, por encima de una cuota mínima y por debajo de un tope de probabilidad. La diferencia con el precio del mercado se calcula después y se muestra aparte.","q4":"¿Qué pasa cuando los datos no bastan?","a4":"No se publica ninguna señal para ese partido. Se indica explícitamente en vez de sustituirlo por una apuesta de relleno.","q5":"¿Qué competiciones están cubiertas?","a5":"Diecinueve competiciones, entre ellas la Ligue 1, la Premier League, La Liga, la Serie A, la Bundesliga, la Champions League, la Liga MX, la Premier Soccer League y las ligas de Argentina, Colombia, Perú y Chile. La lista completa se desplaza arriba en esta página.","q7":"¿Con qué frecuencia se actualizan los análisis?","a7":"Cada día, hasta que empieza el partido. Tras el inicio, el análisis ya no se modifica.","cCta1":"mc-cta\">Ver el análisis completo<","cCta2":"Desbloquear con Pro","cFree":"mc-badge-free\">Análisis gratuito</span>","cConf":"PROBABILIDAD ESTIMADA","cLockSr":"Reservado a los miembros Pro","m1t":"Fuerzas en juego","m2t":"Prudencia al inicio de temporada","m3t":"Probabilidad de cada mercado","m4t":"Simulación del partido"},"de":{"t2":"Finde den richtigen Markt ","t3":".","cta1":"Die heutige Gratis-Analyse ansehen","cta2":"Beispielanalyse ansehen","price":"Gratis testen · Pro für 19,95 € im Monat, ohne Bindung","decSub":"Die heutigen Spiele mit einer nutzbaren Abweichung zwischen Modell und Markt.","b1t":"text-ink\">Das Signal</h3>","b1d":"Der wahrscheinlichste Markt unter denen mit Quote, mit der Abweichung zwischen unserer Schätzung und der Quote, ob günstig oder nicht.","b2t":"Die Begründung","b2d":"Die Daten und Faktoren, die das Modell dorthin geführt haben, klar formuliert.","b3t":"Die Unsicherheit","b3d":"Jede Analyse zeigt, wie belastbar ihre Daten sind. Eine dünne Datenbasis steht da, sie wird nicht versteckt.","kpiEye":"WAS DIE ENGINE BEREITS VERARBEITET HAT","kpi1":"Veröffentlichte Analysen","kpi3":"Simulationen pro Spiel","kpi4":"Analysierte Spiele (3 Tage)","trLead":"Eine Wahrscheinlichkeit ist nur so viel wert wie ihre Verlässlichkeit: Wir zeigen beides, auch wenn es bescheiden ausfällt.","acc3":"wenn du alles sehen willst.","pfName":"text-soft\">Gratis</h3>","pfDesc":"Um das Produkt selbst zu beurteilen: kostenloses Konto, ohne Karte.","pfCta":"[0.05]\">Starten</a>","ff1":"Die heutige Gratis-Analyse, vollständig, mit kostenlosem Konto","ff2":"Identifizierter Markt und geschätzte Wahrscheinlichkeit","ff3":"Detaillierte Erklärung des Signals","pMonth":"/Monat","pNote":"Ohne Bindung · jederzeit online kündbar","pCta":"Pro freischalten","pPlus":"Alles aus Gratis, plus:","mTitle3":"pro Spiel.","mLead":"Jeder Schritt beantwortet eine andere Frage. Heraus kommt ein einziger Markt, gewählt nach einer festen Regel.","m1d":"Was jede Mannschaft erzielt und zulässt, zu Hause oder auswärts.","m2d":"Bei wenigen gespielten Partien wiegt die vorherige Saison schwerer.","m3d":"Von den erwarteten Toren zur Wahrscheinlichkeit jedes Ergebnisses und jedes Marktes.","m4d":"Das Spiel viele Male nachgespielt, für die wahrscheinlichsten Ergebnisse.","sigT":"IASHARK-Signal","sigD":"Ein vorrangiger Markt, eine Wahrscheinlichkeit und die gemessene Abweichung zum Marktpreis.","s1d":"Spielpläne, Tabellen, aktuelle Ergebnisse, direkte Vergleiche und gemeldete Ausfälle, Liga für Liga.","s2t":"Das Modell rechnet","s2d":"Erwartete Tore, Wahrscheinlichkeit jedes Ergebnisses und dann jedes Marktes – ohne die Quoten.","s3d":"Ein klares Blatt: Wahrscheinlichkeit, Verlässlichkeit und die Abweichung zum echten Markt.","q2":"Garantiert IASHARK Gewinne?","a2":"Nein, und das kann niemand. Das Modell schätzt Wahrscheinlichkeiten und vergleicht sie dann mit den Quoten. Eine Methode, keine Garantie.","q3":"Wie wird das Signal berechnet?","a3":"Das System schätzt die erwarteten Tore jeder Mannschaft, leitet daraus die Wahrscheinlichkeit jedes Ergebnisses und dann jedes Marktes ab und behält den wahrscheinlichsten Markt, oberhalb einer Mindestquote und unterhalb einer Wahrscheinlichkeitsobergrenze. Der Abstand zum Marktpreis wird danach berechnet und getrennt angezeigt.","q4":"Was passiert, wenn die Daten nicht reichen?","a4":"Für dieses Spiel wird kein Signal veröffentlicht. Das steht ausdrücklich da, statt durch eine Füllwette ersetzt zu werden.","q5":"Welche Wettbewerbe sind abgedeckt?","a5":"Neunzehn Wettbewerbe, darunter Ligue 1, Premier League, La Liga, Serie A, Bundesliga, Champions League, Liga MX, Premier Soccer League sowie die Ligen Argentiniens, Kolumbiens, Perus und Chiles. Die vollständige Liste läuft oben auf dieser Seite.","q7":"Wie oft werden die Analysen aktualisiert?","a7":"Täglich, bis das Spiel beginnt. Nach dem Anpfiff wird die Analyse nicht mehr geändert.","cCta1":"mc-cta\">Vollständige Analyse ansehen<","cCta2":"Mit Pro freischalten","cFree":"mc-badge-free\">Kostenlose Analyse</span>","cConf":"GESCHÄTZTE WAHRSCHEINLICHKEIT","cLockSr":"Nur für Pro-Mitglieder","m1t":"Kräfteverhältnis","m2t":"Vorsicht zu Saisonbeginn","m3t":"Wahrscheinlichkeit jedes Marktes","m4t":"Spielsimulation"},"it":{"t2":"Trova il mercato ","t3":" giusto.","cta1":"Vedi l'analisi gratuita del giorno","cta2":"Vedi un esempio di analisi","price":"Prova gratis · Pro a 19,95 € al mese, senza vincoli","decSub":"Le partite che oggi mostrano uno scarto sfruttabile tra modello e mercato.","b1t":"text-ink\">Il segnale</h3>","b1d":"Il mercato più probabile tra quelli quotati, con lo scarto tra la nostra stima e la quota, favorevole o no.","b2t":"La spiegazione","b2d":"I dati e i fattori che hanno portato il modello a quella conclusione, in parole chiare.","b3t":"L'incertezza","b3d":"Ogni analisi indica l'affidabilità dei suoi dati. Un campione ridotto è scritto, non nascosto.","kpiEye":"COSA HA GIÀ ELABORATO IL MOTORE","kpi1":"Analisi pubblicate","kpi3":"Simulazioni per partita","kpi4":"Partite analizzate su 3 giorni","trLead":"Una probabilità vale quanto la sua affidabilità: mostriamo entrambe, anche quando sono modeste.","acc3":"quando vuoi vedere tutto.","pfName":"text-soft\">Gratuito</h3>","pfDesc":"Per giudicare il prodotto di persona: account gratuito, senza carta.","pfCta":"[0.05]\">Inizia</a>","ff1":"Analisi gratuita del giorno, completa, con un account gratuito","ff2":"Mercato identificato e probabilità stimata","ff3":"Spiegazione dettagliata del segnale","pMonth":"/mese","pNote":"Nessun vincolo · disdici online quando vuoi","pCta":"Sblocca Pro","pPlus":"Tutto il piano Gratuito, più:","mTitle3":"per partita.","mLead":"Ogni fase risponde a una domanda diversa. Ne esce un solo mercato, scelto da una regola fissa.","m1d":"Ciò che ogni squadra produce e concede, in casa o in trasferta.","m2d":"Con poche partite giocate, la stagione precedente pesa di più.","m3d":"Dai gol attesi alla probabilità di ogni risultato, poi di ogni mercato.","m4d":"La partita rigiocata un gran numero di volte, per i risultati più probabili.","sigT":"Segnale IASHARK","sigD":"Un mercato prioritario, una probabilità e lo scarto misurato col prezzo di mercato.","s1d":"Calendari, classifiche, risultati recenti, scontri diretti e assenze annunciate, campionato per campionato.","s2t":"Il modello calcola","s2d":"Gol attesi, probabilità di ogni risultato e poi di ogni mercato, senza le quote.","s3d":"Una scheda chiara: probabilità, affidabilità e lo scarto rilevato col mercato reale.","q2":"IASHARK garantisce vincite?","a2":"No, e nessuno può farlo. Il modello stima delle probabilità e poi le confronta con le quote. È un metodo, non una garanzia.","q3":"Come viene calcolato il segnale?","a3":"Il sistema stima i gol attesi di ogni squadra, ne deduce la probabilità di ogni risultato e poi di ogni mercato, e tiene il mercato più probabile, sopra una quota minima e sotto un tetto di probabilità. Lo scarto con il prezzo del mercato è calcolato dopo e mostrato a parte.","q4":"Cosa succede quando i dati non bastano?","a4":"Nessun segnale viene pubblicato per quella partita. È indicato esplicitamente invece di essere sostituito da una scommessa di riempimento.","q5":"Quali competizioni sono coperte?","a5":"Diciannove competizioni, tra cui Ligue 1, Premier League, La Liga, Serie A, Bundesliga, Champions League, Liga MX, Premier Soccer League e i campionati di Argentina, Colombia, Perù e Cile. L’elenco completo scorre in cima a questa pagina.","q7":"Con quale frequenza vengono aggiornate le analisi?","a7":"Ogni giorno, finché la partita non è iniziata. Dopo il fischio d'inizio, l'analisi non viene più modificata.","cCta1":"mc-cta\">Vedi l\\'analisi completa<","cCta2":"Sblocca con Pro","cFree":"mc-badge-free\">Analisi gratuita</span>","cConf":"PROBABILITÀ STIMATA","cLockSr":"Riservato ai membri Pro","m1t":"Forze in campo","m2t":"Prudenza a inizio stagione","m3t":"Probabilità di ogni mercato","m4t":"Simulazione della partita"},"pt":{"t2":"Encontra o mercado ","t3":" certo.","cta1":"Ver a análise grátis do dia","cta2":"Ver um exemplo de análise","price":"Experimenta grátis · Pro a 19,95 € por mês, sem compromisso","decSub":"Os jogos que hoje apresentam uma diferença aproveitável entre o modelo e o mercado.","b1t":"text-ink\">O sinal</h3>","b1d":"O mercado mais provável entre os que têm odd, com a diferença entre a nossa estimativa e a odd, favorável ou não.","b2t":"A explicação","b2d":"Os dados e fatores que levaram o modelo a essa conclusão, em linguagem clara.","b3t":"A incerteza","b3d":"Cada análise indica a fiabilidade dos seus dados. Uma amostra reduzida está escrita, não escondida.","kpiEye":"O QUE O MOTOR JÁ PROCESSOU","kpi1":"Análises publicadas","kpi3":"Simulações por jogo","kpi4":"Jogos analisados em 3 dias","trLead":"Uma probabilidade vale o que vale a sua fiabilidade: mostramos as duas, mesmo quando são modestas.","acc3":"quando quiseres ver tudo.","pfName":"text-soft\">Grátis</h3>","pfDesc":"Para julgares o produto por ti: conta gratuita, sem cartão.","pfCta":"[0.05]\">Começar</a>","ff1":"Análise grátis do dia, completa, com uma conta gratuita","ff2":"Mercado identificado e probabilidade estimada","ff3":"Explicação detalhada do sinal","pMonth":"/mês","pNote":"Sem compromisso · cancela online a qualquer momento","pCta":"Desbloquear Pro","pPlus":"Tudo do plano Grátis, mais:","mTitle3":"por jogo.","mLead":"Cada etapa responde a uma pergunta diferente. Sai um único mercado, escolhido por uma regra fixa.","m1d":"O que cada equipa produz e sofre, em casa ou fora.","m2d":"Com poucos jogos disputados, a época anterior pesa mais.","m3d":"Dos golos esperados à probabilidade de cada resultado e de cada mercado.","m4d":"O jogo rejogado um grande número de vezes, para os resultados mais prováveis.","sigT":"Sinal IASHARK","sigD":"Um mercado prioritário, uma probabilidade e a diferença medida face ao preço de mercado.","s1d":"Calendários, classificações, resultados recentes, confrontos diretos e ausências anunciadas, liga a liga.","s2t":"O modelo calcula","s2d":"Golos esperados, probabilidade de cada resultado e depois de cada mercado — sem as odds.","s3d":"Uma ficha clara: probabilidade, fiabilidade e a diferença detetada face ao mercado real.","q2":"A IASHARK garante ganhos?","a2":"Não, e ninguém pode. O modelo estima probabilidades e depois compara-as com as odds. É um método, não uma garantia.","q3":"Como é calculado o sinal?","a3":"O sistema estima os golos esperados de cada equipa, deduz a probabilidade de cada resultado e depois de cada mercado, e fica com o mercado mais provável, acima de uma odd mínima e abaixo de um teto de probabilidade. A diferença face ao preço do mercado é calculada depois e mostrada à parte.","q4":"O que acontece quando os dados não chegam?","a4":"Nenhum sinal é publicado para esse jogo. É indicado explicitamente em vez de ser substituído por uma aposta de enchimento.","q5":"Que competições estão cobertas?","a5":"Dezanove competições, incluindo a Ligue 1, a Premier League, La Liga, a Serie A, a Bundesliga, a Champions League, a Liga MX, a Premier Soccer League e os campeonatos da Argentina, Colômbia, Peru e Chile. A lista completa passa no topo desta página.","q7":"Com que frequência são atualizadas as análises?","a7":"Todos os dias, até o jogo começar. Depois do apito inicial, a análise deixa de ser alterada.","cCta1":"mc-cta\">Ver a análise completa<","cCta2":"Desbloquear com Pro","cFree":"mc-badge-free\">Análise gratuita</span>","cConf":"PROBABILIDADE ESTIMADA","cLockSr":"Reservado aos membros Pro","m1t":"Forças em presença","m2t":"Prudência no início da época","m3t":"Probabilidade de cada mercado","m4t":"Simulação do jogo"}};

// es-mx (repertoire /mx/, scripts/build-locales.js) : memes tables de textes
// que "es", avec la terminologie mexicaine "momios" a la place de "cuota(s)"
// (config/markets.json#mx.compliance.note).
var ES_MX_TERMS = [
  [/\bla cuota ofrecida\b/g, "el momio ofrecido"], [/\bLa cuota ofrecida\b/g, "El momio ofrecido"],
  [/\blas cuotas\b/g, "los momios"], [/\bLas cuotas\b/g, "Los momios"],
  [/\bla cuota\b/g, "el momio"], [/\bLa cuota\b/g, "El momio"],
  [/\buna cuota\b/g, "un momio"], [/\bUna cuota\b/g, "Un momio"],
  [/\bcuotas\b/g, "momios"], [/\bCuotas\b/g, "Momios"], [/\bCUOTAS\b/g, "MOMIOS"],
  [/\bcuota\b/g, "momio"], [/\bCuota\b/g, "Momio"], [/\bCUOTA\b/g, "MOMIO"]
];
function toEsMx(v) {
  if (typeof v === "string") return ES_MX_TERMS.reduce(function (s, t) { return s.replace(t[0], t[1]); }, v);
  if (v && typeof v === "object") {
    var o = Array.isArray(v) ? [] : {};
    Object.keys(v).forEach(function (k) { o[k] = toEsMx(v[k]); });
    return o;
  }
  return v;
}
[HOME_V2, HOME_V3, HOME_V4].forEach(function (table) {
  if (table && table.es && !table["es-mx"]) table["es-mx"] = toEsMx(table.es);
});

var PAGES = [
  {
    file: "marches.html",
    metas: {
      fr: {title: "Marchés — IASHARK", description: "Analyse des marchés disponibles : probabilité modèle, probabilité de marché (retrait de marge), écart, qualité des données — par match et par catalogue de marchés."},
      en: {title: "Markets — IASHARK", description: "Analysis of available markets: model probability, market probability (margin removed), gap, data quality — per match and full market catalogue."},
      es: {title: "Mercados — IASHARK", description: "Análisis de los mercados disponibles: probabilidad del modelo, probabilidad de mercado (margen retirado), diferencia, calidad de los datos — por partido y catálogo completo de mercados."},
      de: {title: "Märkte — IASHARK", description: "Analyse der verfügbaren Märkte: Modellwahrscheinlichkeit, Marktwahrscheinlichkeit (ohne Marge), Differenz, Datenqualität — pro Spiel und vollständiger Marktkatalog."},
      it: {title: "Mercati — IASHARK", description: "Analisi dei mercati disponibili: probabilità del modello, probabilità di mercato (margine rimosso), differenza, qualità dei dati — per partita e catalogo completo dei mercati."},
      pt: {title: "Mercados — IASHARK", description: "Análise dos mercados disponíveis: probabilidade do modelo, probabilidade de mercado (margem removida), diferença, qualidade dos dados — por jogo e catálogo completo de mercados."}
    },
    replacements: [
      {find: 'class="btn-login">CONNEXION<', build: function(d){ return 'class="btn-login">' + d.cta.login + '<'; }},
      {find: "<h1>Analyse des <span>marchés</span></h1>", build: function(d){ return "<h1>" + d.markets_page.title_pre + "<span>" + d.markets_page.title_hl + "</span></h1>"; }},
      {find: '<p class="sub">Probabilité du modèle, probabilité de marché (marge retirée) et écart entre les deux — par match, et catalogue complet des marchés supportés par le moteur.</p>', build: function(d){ return '<p class="sub">' + d.markets_page.subtitle + "</p>"; }},
      {find: "<div class=\"sec-title\">MARCHÉS DU JOUR</div>", key: "markets_page.section_today", build: function(d){ return '<div class="sec-title">' + d.markets_page.section_today + "</div>"; }},
      {find: '<option value="">Tous les marchés</option>', build: function(d){ return '<option value="">' + d.markets_page.filter_all_markets + "</option>"; }},
      {find: '<option value="over25">Plus de 2,5 buts</option>', build: function(d){ return '<option value="over25">' + d.market_names.over25 + "</option>"; }},
      {find: '<option value="under25">Moins de 2,5 buts</option>', build: function(d){ return '<option value="under25">' + d.market_names.under25 + "</option>"; }},
      {find: '<option value="btts_oui">BTTS Oui</option>', build: function(d){ return '<option value="btts_oui">' + d.market_names.btts_oui + "</option>"; }},
      {find: '<option value="btts_non">BTTS Non</option>', build: function(d){ return '<option value="btts_non">' + d.market_names.btts_non + "</option>"; }},
      {find: '<option value="dc1x">DC 1X</option>', build: function(d){ return '<option value="dc1x">' + d.market_names.dc1x + "</option>"; }},
      {find: '<option value="dc_x2">DC X2</option>', build: function(d){ return '<option value="dc_x2">' + d.market_names.dc_x2 + "</option>"; }},
      {find: '<option value="victoire_dom">Victoire domicile</option>', build: function(d){ return '<option value="victoire_dom">' + d.market_names.victoire_dom + "</option>"; }},
      {find: '<option value="victoire_ext">Victoire extérieur</option>', build: function(d){ return '<option value="victoire_ext">' + d.market_names.victoire_ext + "</option>"; }},
      {find: '<option value="buteurs">Buteurs</option>', build: function(d, l, esc){ return '<option value="buteurs">' + esc(d.markets_page.filter_buteurs) + "</option>"; }},
      {find: '<option value="tirs">Tirs joueur</option>', build: function(d, l, esc){ return '<option value="tirs">' + esc(d.markets_page.filter_tirs) + "</option>"; }},
      {find: '<option value="tirs_cadres">Tirs cadrés</option>', build: function(d, l, esc){ return '<option value="tirs_cadres">' + esc(d.markets_page.filter_tirs_cadres) + "</option>"; }},
      {find: "var PLAYER_MARKET_LABELS={ANYTIME_GOALSCORER:'Buteur',PLAYER_SHOTS:'Tirs',PLAYER_SHOTS_ON_TARGET:'Tirs cadrés'};",
       build: function(d, l, esc){
        var p = d.match_page;
        return "var PLAYER_MARKET_LABELS={ANYTIME_GOALSCORER:'" + esc(p.player_engine_market_goalscorer) + "',PLAYER_SHOTS:'" + esc(p.player_engine_market_shots) + "',PLAYER_SHOTS_ON_TARGET:'" + esc(p.player_engine_market_shots_target) + "'};";
      }},
      {find: "var PM_TXT={empty_prefix:'AUCUN MARCHÉ',empty_suffix:'DISPONIBLE AUJOURD\\'HUI',empty_sub:'Composition officielle pas encore confirmée pour les matchs du jour, ou analyse limitée pour cette compétition.',th_player:'Joueur',th_match:'Match',th_status:'Statut',th_minutes:'Min. attendues',th_prob:'Probabilité IASHARK',th_quality:'Qualité données',th_sample:'Échantillon'};",
       build: function(d, l, esc){
        var p = d.markets_page;
        return "var PM_TXT={empty_prefix:'" + esc(p.pm_empty_prefix) + "',empty_suffix:'" + esc(p.pm_empty_suffix) + "',empty_sub:'" + esc(p.pm_empty_sub) + "',th_player:'" + esc(p.pm_th_player) + "',th_match:'" + esc(p.pm_th_match) + "',th_status:'" + esc(p.pm_th_status) + "',th_minutes:'" + esc(p.pm_th_minutes) + "',th_prob:'" + esc(p.pm_th_prob) + "',th_quality:'" + esc(p.pm_th_quality) + "',th_sample:'" + esc(p.pm_th_sample) + "'};";
      }},
      {find: '<option value="date">Trier : heure</option>', build: function(d){ return '<option value="date">' + d.markets_page.sort_time + "</option>"; }},
      {find: '<option value="ecart">Trier : écart modèle/marché</option>', build: function(d){ return '<option value="ecart">' + d.markets_page.sort_gap + "</option>"; }},
      {find: '<option value="qualite">Trier : qualité des données</option>', build: function(d){ return '<option value="qualite">' + d.markets_page.sort_quality + "</option>"; }},
      {find: '<div id="matchMarketsWrap"><div class="empty-state">CHARGEMENT…</div></div>', build: function(d){ return '<div id="matchMarketsWrap"><div class="empty-state">' + d.common.loading + "</div></div>"; }},
      {find: '<div class="sec-title">CATALOGUE DES MARCHÉS</div>', build: function(d){ return '<div class="sec-title">' + d.markets_page.section_catalog + "</div>"; }},
      {find: "<thead><tr><th>Marché</th><th>Catégorie</th><th>Statut</th></tr></thead>", build: function(d){ return "<thead><tr><th>" + d.markets_page.table_market + "</th><th>" + d.markets_page.table_category + "</th><th>" + d.markets_page.table_status + "</th></tr></thead>"; }},
      {find:
        '  <p style="font-family:\'Space Mono\',monospace;font-size:8px;color:var(--muted);margin-top:10px;line-height:1.8;">\n' +
        '    <b style="color:var(--green);">MODÉLISÉ ET VALIDÉ</b> : modèle + résolution automatique + tests — probabilité affichée sur les fiches match.<br>\n' +
        '    <b style="color:var(--amber);">EXPÉRIMENTAL</b> : modèle testé mathématiquement, résolution automatique pas encore implémentée.<br>\n' +
        "    <b style=\"color:var(--muted);\">NON SUPPORTÉ</b> : nécessite une donnée ou un modèle qui n'existe pas encore.\n" +
        "  </p>",
       build: function(d){
        var m = d.markets_page;
        return '  <p style="font-family:\'Space Mono\',monospace;font-size:8px;color:var(--muted);margin-top:10px;line-height:1.8;">\n' +
          '    <b style="color:var(--green);">' + m.status_validated + "</b> : " + m.legend_validated + "<br>\n" +
          '    <b style="color:var(--amber);">' + m.status_experimental + "</b> : " + m.legend_experimental + "<br>\n" +
          '    <b style="color:var(--muted);">' + m.status_unsupported + "</b> : " + m.legend_unsupported + "\n" +
          "  </p>";
      }},
      {find: '<div class="nav-lbl">ACCUEIL</div>', build: function(d){ return '<div class="nav-lbl">' + d.nav.home + "</div>"; }},
      {find: '<div class="nav-lbl">OUTILS</div>', build: function(d){ return '<div class="nav-lbl">' + d.nav.tools + "</div>"; }},
      {find: '<div class="nav-lbl">BLOG</div>', build: function(d){ return '<div class="nav-lbl">' + d.nav.guides + "</div>"; }},
      {find: '<div class="nav-lbl">COMPTE</div>', build: function(d){ return '<div class="nav-lbl">' + d.nav.account + "</div>"; }},
      {find:
        "    <div>⚠️ LE JEU PEUT ÊTRE DANGEREUX — JOUEZ RESPONSABLE · INTERDIT AUX MOINS DE 18 ANS</div>\n" +
        '    <div>Aide : <a data-market-helpline="url" href="https://www.joueurs-info-service.fr" style="color:#22d3ee;text-decoration:none;">joueurs-info-service.fr</a><span data-market-helpline-if="phone"> · <span data-market-helpline="phone">09 74 75 13 13</span></span></div>',
       build: function(d){
        var f = d.footer;
        return "    <div>⚠️ " + f.disclaimer_warning + "</div>\n" +
          "    <div>" + f.disclaimer_help_label + ' <a data-market-helpline="url" href="https://www.joueurs-info-service.fr" style="color:#22d3ee;text-decoration:none;">' + f.disclaimer_help_site + "</a><span data-market-helpline-if=\"phone\"> · <span data-market-helpline=\"phone\">" + f.disclaimer_help_phone + "</span></span></div>";
      }},
      {find: "var STATUS_LABEL={validated:'MODÉLISÉ ET VALIDÉ',experimental:'EXPÉRIMENTAL',unsupported:'NON SUPPORTÉ'};", build: function(d, l, esc){
        var m = d.markets_page;
        return "var STATUS_LABEL={validated:'" + esc(m.status_validated) + "',experimental:'" + esc(m.status_experimental) + "',unsupported:'" + esc(m.status_unsupported) + "'};";
      }},
      {find: "{label:'Résultat du match (1X2)',category:'1X2',status:'validated'},", build: function(d, l, esc){ return "{label:'" + esc(d.market_catalog.c1) + "',category:'1X2',status:'validated'},"; }},
      {find: "{label:'Double Chance (1X / X2 / 12)',category:'1X2',status:'validated'},", build: function(d, l, esc){ return "{label:'" + esc(d.market_catalog.c2) + "',category:'1X2',status:'validated'},"; }},
      {find: "{label:'Remboursé si match nul',category:'1X2',status:'experimental'},", build: function(d, l, esc){ return "{label:'" + esc(d.market_catalog.c3) + "',category:'1X2',status:'experimental'},"; }},
      {find: "{label:'Total de buts (O/U 0.5 à 6.5)',category:'BUTS',status:'validated'},", build: function(d, l, esc){ return "{label:'" + esc(d.market_catalog.c4) + "',category:'BUTS',status:'validated'},"; }},
      {find: "{label:'Totaux par équipe',category:'BUTS',status:'experimental'},", build: function(d, l, esc){ return "{label:'" + esc(d.market_catalog.c5) + "',category:'BUTS',status:'experimental'},"; }},
      {find: "{label:'BTTS',category:'BUTS',status:'validated'},", build: function(d, l, esc){ return "{label:'" + esc(d.market_catalog.c6) + "',category:'BUTS',status:'validated'},"; }},
      {find: "{label:'Clean sheet',category:'BUTS',status:'experimental'},", build: function(d, l, esc){ return "{label:'" + esc(d.market_catalog.c7) + "',category:'BUTS',status:'experimental'},"; }},
      {find: "{label:'Gagne sans encaisser',category:'BUTS',status:'experimental'},", build: function(d, l, esc){ return "{label:'" + esc(d.market_catalog.c8) + "',category:'BUTS',status:'experimental'},"; }},
      {find: "{label:'Score exact',category:'BUTS',status:'experimental'},", build: function(d, l, esc){ return "{label:'" + esc(d.market_catalog.c9) + "',category:'BUTS',status:'experimental'},"; }},
      {find: "{label:'Bandes de buts',category:'BUTS',status:'experimental'},", build: function(d, l, esc){ return "{label:'" + esc(d.market_catalog.c10) + "',category:'BUTS',status:'experimental'},"; }},
      {find: "{label:'Handicap (lignes entières/demi)',category:'HANDICAP',status:'validated'},", build: function(d, l, esc){ return "{label:'" + esc(d.market_catalog.c11) + "',category:'HANDICAP',status:'validated'},"; }},
      {find: "{label:'Handicap asiatique (quart .25/.75)',category:'HANDICAP',status:'unsupported'},", build: function(d, l, esc){ return "{label:'" + esc(d.market_catalog.c12) + "',category:'HANDICAP',status:'unsupported'},"; }},
      {find: "{label:'Marchés mi-temps',category:'TEMPS',status:'unsupported'},", build: function(d, l, esc){ return "{label:'" + esc(d.market_catalog.c13) + "',category:'TEMPS',status:'unsupported'},"; }},
      {find: "{label:'Corners',category:'CORNERS',status:'unsupported'},", build: function(d, l, esc){ return "{label:'" + esc(d.market_catalog.c14) + "',category:'CORNERS',status:'unsupported'},"; }},
      {find: "{label:'Cartons',category:'CARTONS',status:'unsupported'},", build: function(d, l, esc){ return "{label:'" + esc(d.market_catalog.c15) + "',category:'CARTONS',status:'unsupported'},"; }},
      {find: "{label:'Buteur',category:'JOUEURS',status:'experimental'},", build: function(d, l, esc){ return "{label:'" + esc(d.market_catalog.c17) + "',category:'JOUEURS',status:'experimental'},"; }},
      {find: "{label:'Tirs joueur',category:'JOUEURS',status:'experimental'},", build: function(d, l, esc){ return "{label:'" + esc(d.market_catalog.c18) + "',category:'JOUEURS',status:'experimental'},"; }},
      {find: "{label:'Tirs cadrés joueur',category:'JOUEURS',status:'experimental'},", build: function(d, l, esc){ return "{label:'" + esc(d.market_catalog.c19) + "',category:'JOUEURS',status:'experimental'},"; }},
      {find: "{label:'Autres player props (cartons, fautes, passes...)',category:'JOUEURS',status:'unsupported'},", build: function(d, l, esc){ return "{label:'" + esc(d.market_catalog.c20) + "',category:'JOUEURS',status:'unsupported'},"; }},
      {find: "var CATEGORY_LABEL={'1X2':'1X2','BUTS':'BUTS','HANDICAP':'HANDICAP','TEMPS':'TEMPS','CORNERS':'CORNERS','CARTONS':'CARTONS','JOUEURS':'JOUEURS'};", build: function(d, l, esc){
        var c = d.market_catalog_cat;
        return "var CATEGORY_LABEL={'1X2':'" + esc(c["1X2"]) + "','BUTS':'" + esc(c.BUTS) + "','HANDICAP':'" + esc(c.HANDICAP) + "','TEMPS':'" + esc(c.TEMPS) + "','CORNERS':'" + esc(c.CORNERS) + "','CARTONS':'" + esc(c.CARTONS) + "','JOUEURS':'" + esc(c.JOUEURS) + "'};";
      }},
      {find: "var DATA_QUALITY_LABELS={'Élevée':'ÉLEVÉE','Moyenne':'MOYENNE','Faible':'FAIBLE'};", build: function(d, l, esc){
        var q = d.data_quality;
        return "var DATA_QUALITY_LABELS={'Élevée':'" + esc(q["Élevée"]) + "','Moyenne':'" + esc(q["Moyenne"]) + "','Faible':'" + esc(q["Faible"]) + "'};";
      }},
      {find: "var MARKET_KEY_LABELS={over25:'Plus de 2,5 buts',under25:'Moins de 2,5 buts',btts_oui:'BTTS Oui',btts_non:'BTTS Non',dc1x:'DC 1X',dc_x2:'DC X2',victoire_dom:'Victoire domicile',victoire_ext:'Victoire extérieur'};", build: function(d, l, esc){
        var n = d.market_names;
        return "var MARKET_KEY_LABELS={over25:'" + esc(n.over25) + "',under25:'" + esc(n.under25) + "',btts_oui:'" + esc(n.btts_oui) + "',btts_non:'" + esc(n.btts_non) + "',dc1x:'" + esc(n.dc1x) + "',dc_x2:'" + esc(n.dc_x2) + "',victoire_dom:'" + esc(n.victoire_dom) + "',victoire_ext:'" + esc(n.victoire_ext) + "'};";
      }},
      {find: "wrap.innerHTML='<div class=\"empty-state\"><div class=\"empty-state-icon\"><svg viewBox=\"0 0 24 24\"><circle cx=\"11\" cy=\"11\" r=\"7\"/><path d=\"M21 21l-4.35-4.35\"/></svg></div>AUCUN MARCHÉ EXPLOITABLE AUJOURD\\'HUI<br><span style=\"color:rgba(74,101,128,0.6)\">Revenez plus tard, ou consultez le catalogue des marchés ci-dessous.</span></div>';", build: function(d, l, esc){
        var m = d.markets_page;
        return "wrap.innerHTML='<div class=\"empty-state\"><div class=\"empty-state-icon\"><svg viewBox=\"0 0 24 24\"><circle cx=\"11\" cy=\"11\" r=\"7\"/><path d=\"M21 21l-4.35-4.35\"/></svg></div>" + esc(m.empty_today) + "<br><span style=\"color:rgba(74,101,128,0.6)\">" + esc(m.empty_today_sub) + "</span></div>';";
      }},
      {find: "wrap.innerHTML='<table class=\"mtable\"><thead><tr><th>Match</th><th>Heure</th><th>Marché</th><th>Proba modèle</th><th>Cote</th><th>Écart</th><th>Qualité</th></tr></thead><tbody>'", build: function(d, l, esc){
        var m = d.markets_page;
        return "wrap.innerHTML='<table class=\"mtable\"><thead><tr><th>" + esc(m.table_match) + "</th><th>" + esc(m.table_time) + "</th><th>" + esc(m.table_market) + "</th><th>" + esc(m.table_prob) + "</th><th>" + esc(m.table_odds) + "</th><th>" + esc(m.table_gap) + "</th><th>" + esc(m.table_quality) + "</th></tr></thead><tbody>'";
      }}
    ]
  },
  {
    file: "index.html",
    metas: {
      fr: {title: "Pronostics foot : probabilités et stats par modèle | IASHARK", description: "Pronostics football calculés par des modèles statistiques : probabilités 1X2, buts et BTTS comparées aux cotes du marché. Une analyse offerte par jour. 18+"},
      en: {title: "IASHARK — AI Football Predictions", description: "Football predictions powered by artificial intelligence. Statistical analysis, AI edge and daily value bets."},
      es: {title: "IASHARK — Pronósticos de Fútbol con IA", description: "Pronósticos de fútbol impulsados por inteligencia artificial. Análisis estadístico, ventaja de IA y value bets diarios."},
      de: {title: "IASHARK — KI-Fußballvorhersagen", description: "Fußballvorhersagen, angetrieben von künstlicher Intelligenz. Statistische Analysen, KI-Edge und tägliche Value Bets."},
      it: {title: "IASHARK — Pronostici Calcio con IA", description: "Pronostici calcistici basati sull'intelligenza artificiale. Analisi statistiche, edge IA e value bet quotidiane."},
      pt: {title: "IASHARK — Previsões de Futebol com IA", description: "Previsões de futebol baseadas em inteligência artificial. Análises estatísticas, edge de IA e value bets diários."}
    },
    replacements: [
      // (22/09/2026) Regle du JSON-LD Organization retiree : l'accueil racine porte
      // desormais le @graph commun, remplace par homeJsonLd() dans chaque version.
      {find: 'class="btn-login">CONNEXION<', build: function(d){ return 'class="btn-login">' + d.cta.login + '<'; }},
      {find: '<a href="#decisions">Matchs</a>', build: function(d,l){ return '<a href="#decisions">' + HOME_V2[l].matches + '</a>'; }},
      {find: '<a href="/a-propos.html">Méthode</a>', build: function(d,l){ return '<a href="/a-propos.html">' + HOME_V2[l].method + '</a>'; }},
      {find: '<a href="/blog.html">Guides</a>', build: function(d,l){ return '<a href="/blog.html">' + HOME_V2[l].guides + '</a>'; }},
      {find: '<a href="#decisions" class="btn-start">Commencer</a>', build: function(d,l){ return '<a href="#decisions" class="btn-start">' + HOME_V2[l].start + '</a>'; }},
      {find: "19 COMPÉTITIONS COUVERTES", build: function(d,l){ return HOME_V3[l].railLbl; }},
      {find: "CE QUE TU REÇOIS", build: function(d,l){ return HOME_V3[l].anaLbl; }},
      {find: "Une analyse, ", build: function(d,l){ return HOME_V3[l].anaT1; }},
      {find: "pas un pronostic", build: function(d,l){ return HOME_V3[l].anaT2; }},
      {find: " balancé sans explication.", build: function(d,l){ return HOME_V3[l].anaT3; }},
      {find: "CE QU’ON NE FERA PAS", build: function(d,l){ return HOME_V3[l].trLbl; }},
      {find: "On préfère te dire ", build: function(d,l){ return HOME_V3[l].trT1; }},
      {find: "quand on ne sait pas.", build: function(d,l){ return HOME_V3[l].trT2; }},
      {find: "Aucune promesse de gain", build: function(d,l){ return HOME_V3[l].t1t; }},
      {find: "Le pari reste un pari. On calcule des probabilités, on ne garantit aucun résultat.", build: function(d,l){ return HOME_V3[l].t1d; }},
      {find: "L’écart s’affiche même quand il te dessert", build: function(d,l){ return HOME_V3[l].t2t; }},
      {find: "Si la cote proposée est moins intéressante que notre estimation, c’est écrit noir sur blanc.", build: function(d,l){ return HOME_V3[l].t2d; }},
      {find: "Rien ne change après le coup d’envoi", build: function(d,l){ return HOME_V3[l].t3t; }},
      {find: "Recalculée chaque jour tant que le match n’a pas commencé, l’analyse n’est plus modifiée après le coup d’envoi.", build: function(d,l){ return HOME_V3[l].t3d; }},
      {find: "La fiabilité affichée", build: function(d,l){ return HOME_V3[l].t4t; }},
      {find: "Chaque analyse indique la fiabilité de ses données : un échantillon mince est signalé comme tel.", build: function(d,l){ return HOME_V3[l].t4d; }},
      {find: "QUESTIONS FRÉQUENTES", build: function(d,l){ return HOME_V3[l].faqLbl; }},
      {find: "Ce que tu te demandes ", build: function(d,l){ return HOME_V3[l].faqT1; }},
      {find: "avant de payer.", build: function(d,l){ return HOME_V3[l].faqT2; }},
      {find: "Je peux essayer avant de payer ?", build: function(d,l){ return HOME_V3[l].q1; }},
      {find: "Oui. Une analyse complète est offerte chaque jour avec un compte gratuit, sans carte bancaire : le même contenu que pour un abonné. Elle est choisie parmi les écarts les plus favorables du jour ; les autres analyses ne le sont pas toutes.", build: function(d,l){ return HOME_V3[l].a1; }},
      {find: "Je peux résilier quand je veux ?", build: function(d,l){ return HOME_V3[l].q3; }},
      {find: "Oui, en ligne depuis ton compte, à tout moment. Sans engagement, sans préavis, sans justification.", build: function(d,l){ return HOME_V3[l].a3; }},
      {find: "Voir l'analyse gratuite du jour", build: function(d,l){ return HOME_V4[l].cta1; }},
      {find: "Voir un exemple d'analyse", build: function(d,l){ return HOME_V4[l].cta2; }},
      {find: "Essayer gratuitement · Pro à 19,95 € par mois, sans engagement", build: function(d,l){ return HOME_V4[l].price; }},
      {find: "text-ink\">Le signal</h3>", build: function(d,l){ return HOME_V4[l].b1t; }},
      {find: "Le marché le plus probable parmi ceux qui sont cotés, avec l’écart entre notre estimation et la cote, favorable ou non.", build: function(d,l){ return HOME_V4[l].b1d; }},
      {find: "L’explication", build: function(d,l){ return HOME_V4[l].b2t; }},
      {find: "Les données et les facteurs qui ont conduit le modèle à cette conclusion, écrits en clair.", build: function(d,l){ return HOME_V4[l].b2d; }},
      {find: "L’incertitude", build: function(d,l){ return HOME_V4[l].b3t; }},
      {find: "Chaque analyse indique la fiabilité de ses données. Un échantillon mince est écrit, pas caché.", build: function(d,l){ return HOME_V4[l].b3d; }},
      {find: "CE QUE LE MOTEUR A DÉJÀ TRAITÉ", build: function(d,l){ return HOME_V4[l].kpiEye; }},
      {find: "Analyses publiées", build: function(d,l){ return HOME_V4[l].kpi1; }},
      {find: "Simulations par match", build: function(d,l){ return HOME_V4[l].kpi3; }},
      {find: "Matchs analysés sur 3 jours", build: function(d,l){ return HOME_V4[l].kpi4; }},
      {find: "Une probabilité ne vaut que par sa fiabilité : on affiche les deux, même quand elles sont modestes.", build: function(d,l){ return HOME_V4[l].trLead; }},
      {find: "quand tu veux tout voir.", build: function(d,l){ return HOME_V4[l].acc3; }},
      {find: "text-soft\">Gratuit</h3>", build: function(d,l){ return HOME_V4[l].pfName; }},
      {find: "Pour juger le produit sur pièce : compte gratuit, sans carte bancaire.", build: function(d,l){ return HOME_V4[l].pfDesc; }},
      {find: "[0.05]\">Commencer</a>", build: function(d,l){ return HOME_V4[l].pfCta; }},
      {find: "Analyse gratuite du jour, complète, avec un compte gratuit", build: function(d,l){ return HOME_V4[l].ff1; }},
      {find: "Marché identifié et probabilité estimée", build: function(d,l){ return HOME_V4[l].ff2; }},
      {find: "Explication détaillée du signal", build: function(d,l){ return HOME_V4[l].ff3; }},
      {find: "/mois", build: function(d,l){ return HOME_V4[l].pMonth; }},
      {find: "Sans engagement · résiliable en ligne à tout moment", build: function(d,l){ return HOME_V4[l].pNote; }},
      {find: "Débloquer Pro", build: function(d,l){ return HOME_V4[l].pCta; }},
      {find: "Tout le plan Gratuit, plus :", build: function(d,l){ return HOME_V4[l].pPlus; }},
      {find: "par match.", build: function(d,l){ return HOME_V4[l].mTitle3; }},
      {find: "Chaque étape répond à une question différente. Un seul marché en sort, choisi par une règle fixe.", build: function(d,l){ return HOME_V4[l].mLead; }},
      {find: ">Forces en présence</div>", build: function(d,l){ return ">" + HOME_V4[l].m1t + "</div>"; }},
      {find: "Ce que chaque équipe produit et concède, à domicile ou à l’extérieur.", build: function(d,l){ return HOME_V4[l].m1d; }},
      {find: ">Prudence en début de saison</div>", build: function(d,l){ return ">" + HOME_V4[l].m2t + "</div>"; }},
      {find: "Avec peu de matchs joués, la saison précédente pèse davantage.", build: function(d,l){ return HOME_V4[l].m2d; }},
      {find: ">Probabilité de chaque marché</div>", build: function(d,l){ return ">" + HOME_V4[l].m3t + "</div>"; }},
      {find: "Des buts attendus à la probabilité de chaque score, puis de chaque marché.", build: function(d,l){ return HOME_V4[l].m3d; }},
      {find: ">Simulation du match</div>", build: function(d,l){ return ">" + HOME_V4[l].m4t + "</div>"; }},
      {find: "Le match rejoué un grand nombre de fois, pour les scores les plus probables.", build: function(d,l){ return HOME_V4[l].m4d; }},
      {find: "Signal IASHARK", build: function(d,l){ return HOME_V4[l].sigT; }},
      {find: "Un marché prioritaire, une probabilité, et l’écart mesuré avec le prix du marché.", build: function(d,l){ return HOME_V4[l].sigD; }},
      {find: "Calendriers, classements, résultats récents, confrontations directes et absences annoncées, championnat par championnat.", build: function(d,l){ return HOME_V4[l].s1d; }},
      {find: ">Le modèle calcule</h3>", build: function(d,l){ return ">" + HOME_V4[l].s2t + "</h3>"; }},
      {find: "Buts attendus, probabilité de chaque score, puis de chaque marché — sans les cotes.", build: function(d,l){ return HOME_V4[l].s2d; }},
      {find: "Une fiche claire : probabilité, fiabilité, et l’écart détecté avec le marché réel.", build: function(d,l){ return HOME_V4[l].s3d; }},
      {find: "Est-ce que IASHARK garantit des gains ?", build: function(d,l){ return HOME_V4[l].q2; }},
      {find: "Non, et personne ne le peut. Le modèle estime des probabilités puis les compare aux cotes. C’est une méthode, pas une garantie.", build: function(d,l){ return HOME_V4[l].a2; }},
      {find: "Comment le signal est-il calculé ?", build: function(d,l){ return HOME_V4[l].q3; }},
      {find: "Le système estime les buts attendus de chaque équipe, en déduit la probabilité de chaque score puis de chaque marché, et retient le marché le plus probable, sous une cote minimale et un plafond de probabilité. L’écart avec le prix du marché est calculé ensuite et affiché à part.", build: function(d,l){ return HOME_V4[l].a3; }},
      {find: "Que se passe-t-il quand les données ne suffisent pas ?", build: function(d,l){ return HOME_V4[l].q4; }},
      {find: "Aucun signal n’est publié sur ce match. C’est affiché explicitement plutôt que remplacé par un pari de remplissage.", build: function(d,l){ return HOME_V4[l].a4; }},
      {find: "Quels championnats sont couverts ?", build: function(d,l){ return HOME_V4[l].q5; }},
      {find: "Dix-neuf compétitions, dont la Ligue 1, la Premier League, la Liga, la Serie A, la Bundesliga, la Champions League, la Liga MX, la Premier Soccer League et les championnats d’Argentine, de Colombie, du Pérou et du Chili. La liste complète défile en haut de cette page.", build: function(d,l){ return HOME_V4[l].a5; }},
      {find: "À quelle fréquence les analyses sont-elles mises à jour ?", build: function(d,l){ return HOME_V4[l].q7; }},
      {find: "Chaque jour, tant que le match n’a pas commencé. Après le coup d’envoi, l’analyse n’est plus modifiée.", build: function(d,l){ return HOME_V4[l].a7; }},
      // Accueil « stade » du 25/09/2026 : seule phrase sous le titre IASHARK.
      {find: 'Le football, en probabilités', build: function(d,l){ return HOME_V2[l].heroTagline; }},
      // --- Tunnel de vente. La copie reutilise landing_page.*, deja traduit
      // dans les 6 langues, plutot que d'inventer une seconde version du
      // meme discours. Seules 4 chaines sont nouvelles (HOME_V2).
      {find: 'Compétitions couvertes', build: function(d,l){ return HOME_V2[l].statLeagues; }},
      {find: 'LA MÉTHODE', build: function(d){ return d.landing_page.lbl_method; }},
      
      {find: 'Quatre étapes, ', build: function(d){ return d.landing_page.title_method_pre; }},
      {find: 'un seul signal', build: function(d){ return d.landing_page.title_method_b; }},
      
      {find: 'EN PRATIQUE', build: function(d){ return d.landing_page.lbl_practice; }},
      
      {find: 'De la donnée brute au ', build: function(d){ return d.landing_page.title_practice_pre; }},
      {find: 'signal exploitable.', build: function(d){ return d.landing_page.title_practice_b; }},
      
      {find: '>On ingère la donnée<', build: function(d){ return '>' + d.landing_page.step1_title + '<'; }},
      {find: '>Tu reçois le signal<', build: function(d){ return '>' + d.landing_page.step3_title + '<'; }},
      {find: 'L\'ACCÈS', build: function(d){ return d.landing_page.lbl_access; }},
      
      {find: 'Commence gratuitement. ', build: function(d){ return d.landing_page.title_access_pre; }},
      {find: 'Passe à Pro', build: function(d){ return d.landing_page.title_access_b; }},
      
      
      {find: '>RECOMMANDÉ<', build: function(d){ return '>' + d.landing_page.plan_pro_badge + '<'; }},
      
      
      
      {find: 'Toutes les analyses, tous les championnats', build: function(d){ return d.landing_page.plan_pro_feat1; }},
      {find: 'Détecteur d’écarts du jour sur les matchs réels', build: function(d){ return d.landing_page.plan_pro_feat2; }},
      {find: 'Les outils Pro : détecteur d’écarts sur les matchs réels, combiné sur les analyses, journal synchronisé', build: function(d,l){ return HOME_V2[l].proFeatTools; }},
      {find: 'Résiliable à tout moment', build: function(d){ return d.landing_page.plan_pro_feat4; }},
      
      
      {find: 'Le prochain match a déjà ', build: function(d){ return d.landing_page.final_title_pre; }},
      {find: 'un signal.', build: function(d){ return d.landing_page.final_title_b; }},
      
      {find: "Va le voir, c'est gratuit.", build: function(d){ return d.landing_page.final_sub; }},
      
      
      {find: 'SÉLECTION DU MATCH À SUIVRE…', build: function(d,l){ return HOME_V2[l].featureLoading; }},
      // Buteurs du jour (home-scorers.js, 19/09/2026) : textes statiques de la
      // section, traduits au build (aucun flash francais) ; le rendu dynamique
      // passe par I18N.t (i18n/dict/*.json#home_scorers).
      {find: 'data-i18n="home_scorers.title">Buteurs du jour</h2>', build: function(d){ return 'data-i18n="home_scorers.title">' + d.home_scorers.title + '</h2>'; }},
      {find: "<p class=\"hs-sub\" data-hs-sub>Les 3 joueurs les plus susceptibles de marquer aujourd'hui, avant les compositions.</p>", build: function(d){ return '<p class="hs-sub" data-hs-sub>' + d.home_scorers.subtitle + '</p>'; }},
      {find: 'aria-label="Buteurs du jour, du plus probable au moins probable"', build: function(d){ return 'aria-label="' + String(d.home_scorers.list_aria).replace(/"/g, "&quot;") + '"'; }},
      {find: '<p class="hs-note">Estimation avant les compositions officielles, jamais une garantie.</p>', build: function(d){ return '<p class="hs-note">' + d.home_scorers.note + '</p>'; }},
      {find: 'data-track-kind="home_scorers_upsell">Voir l\'offre Pro <span', build: function(d){ return 'data-track-kind="home_scorers_upsell">' + d.home_scorers.cta + ' <span'; }},
      {find:
        '    <div>⚠️ LE JEU PEUT ÊTRE DANGEREUX — JOUEZ RESPONSABLE · INTERDIT AUX MOINS DE 18 ANS</div>\n' +
        '    <div>Aide : <a data-market-helpline="url" href="https://www.joueurs-info-service.fr" style="color:#22d3ee;text-decoration:none;">joueurs-info-service.fr</a><span data-market-helpline-if="phone"> · <span data-market-helpline="phone">09 74 75 13 13</span></span></div>\n' +
        '    <div style="margin-top:8px;">\n' +
        '      <a href="/mentions-legales.html" style="color:#22d3ee;text-decoration:underline;margin:0 8px;">Mentions légales</a>\n' +
        '      <a href="/cgv.html" style="color:#22d3ee;text-decoration:underline;margin:0 8px;">CGV</a>\n' +
        '      <a href="/confidentialite.html" style="color:#22d3ee;text-decoration:underline;margin:0 8px;">Confidentialité</a>\n' +
        '      <a href="/methodologie.html" data-requires-page="methodologie.html" style="color:#22d3ee;text-decoration:underline;margin:0 8px;">Méthodologie</a>\n' +
        '    </div>',
       build: function(d){
        var f = d.footer;
        return '    <div>⚠️ ' + f.disclaimer_warning + '</div>\n' +
          '    <div>' + f.disclaimer_help_label + ' <a data-market-helpline="url" href="https://www.joueurs-info-service.fr" style="color:#22d3ee;text-decoration:none;">' + f.disclaimer_help_site + '</a><span data-market-helpline-if="phone"> · <span data-market-helpline="phone">' + f.disclaimer_help_phone + '</span></span></div>\n' +
          '    <div style="margin-top:8px;">\n' +
          '      <a href="/mentions-legales.html" style="color:#22d3ee;text-decoration:underline;margin:0 8px;">' + f.mentions_legales + '</a>\n' +
          '      <a href="/cgv.html" style="color:#22d3ee;text-decoration:underline;margin:0 8px;">' + f.cgv + '</a>\n' +
          '      <a href="/confidentialite.html" style="color:#22d3ee;text-decoration:underline;margin:0 8px;">' + f.confidentialite + '</a>\n' +
          '      <a href="/methodologie.html" data-requires-page="methodologie.html" style="color:#22d3ee;text-decoration:underline;margin:0 8px;">' + f.methodology + '</a>\n' +
          '    </div>';
      }},
      {find: '<div class="nav-lbl">ACCUEIL</div>', build: function(d){ return '<div class="nav-lbl">' + d.nav.home + '</div>'; }},
      {find: '<div class="nav-lbl">OUTILS</div>', build: function(d){ return '<div class="nav-lbl">' + d.nav.tools + '</div>'; }},
      {find: '<div class="nav-lbl">BLOG</div>', build: function(d){ return '<div class="nav-lbl">' + d.nav.guides + '</div>'; }},
      {find: '<div class="nav-lbl">COMPTE</div>', build: function(d){ return '<div class="nav-lbl">' + d.nav.account + '</div>'; }},
      {find: LEAGUE_LABELS_FR_TEXT, build: function(d){ return renderLeagueLabels(d); }},
      {find: "return'Plus de 2,5 buts';if(s.includes('under 2.5'))return'Moins de 2,5 buts';if(s.includes('over 1.5'))return'Plus de 1,5 but';if(s.includes('btts non')||s.includes('une équipe ne marque'))return'Une équipe ne marque pas';if(s.includes('btts')||s.includes('les deux équipes'))return'Les deux équipes marquent';if(s.includes('dc 1x')||s==='1x')return'DC 1X';if(s.includes('dc x2')||s==='x2')return'DC X2';return r;}",
       build: function(d, l, esc){
        var n = d.market_names, nat = d.market_names_natural;
        return "return'" + esc(n.over25) + "';if(s.includes('under 2.5'))return'" + esc(n.under25) + "';if(s.includes('over 1.5'))return'" + esc(n.over15) + "';if(s.includes('btts non')||s.includes('une équipe ne marque'))return'" + esc(nat.btts_non_natural) + "';if(s.includes('btts')||s.includes('les deux équipes'))return'" + esc(nat.btts_oui_natural) + "';if(s.includes('dc 1x')||s==='1x')return'" + esc(n.dc1x) + "';if(s.includes('dc x2')||s==='x2')return'" + esc(n.dc_x2) + "';return r;}";
      }},
      {find: 'var DAY_LABELS={today:"Aujourd\'hui",tomorrow:\'Demain\'};', build: function(d,l,esc){ return 'var DAY_LABELS={today:\'' + esc(HOME_V2[l].today) + '\',tomorrow:\'' + esc(HOME_V2[l].tomorrow) + '\'};'; }},
      {find: "<div class=\"feature-meta-right\"><span class=\"feature-free\">Analyse gratuite</span><span>'+dayLabel(m)+' · '+heure+'</span></div>", build: function(d,l,esc){ var free={fr:'Analyse gratuite',en:'Free analysis',es:'Análisis gratuito',de:'Kostenlose Analyse',it:'Analisi gratuita',pt:'Análise gratuita'}; return '<div class="feature-meta-right"><span class="feature-free">'+free[l]+"</span><span>'+dayLabel(m)+' · '+heure+'</span></div>"; }},
      {find: '<div class="signal-label">Marché recommandé</div>', build: function(d,l){ return '<div class="signal-label">' + HOME_V2[l].recommended + '</div>'; }},
      {find: '<span>Probabilité estimée</span>', build: function(d,l,esc){ return '<span>' + esc(HOME_V2[l].modelConfidence) + '</span>'; }},
      {find: "'<div class=\"feature-loading\">AUCUN MATCH DISPONIBLE</div>'", build: function(d,l,esc){ return "'<div class=\"feature-loading\">" + esc(HOME_V2[l].noHero) + "</div>'"; }},
      {find: "if(el)el.innerHTML='<div class=\"empty-state\"><h3>ERREUR CHARGEMENT</h3><p>Réessaie dans un instant.</p></div>';",
       build: function(d, l, esc){
        var h = d.home_page;
        return "if(el)el.innerHTML='<div class=\"empty-state\"><h3>" + esc(h.error_loading_title) + "</h3><p>" + esc(h.error_loading_retry) + "</p></div>';";
      }}
    ]
  },
  {
    /* match.html : la structure/chrome (nav, sections, libelles, paywall,
       parties templatees de "POURQUOI CE PARI") est traduite. Le contenu
       narratif genere par le pipeline/LLM par match (m.verdict_shark,
       m.facteur_x, m.key_absences, etc.) reste volontairement en francais -
       c'est un texte dynamique, jamais connu au moment du build i18n, et
       le traduire necessiterait une generation LLM multilingue au niveau
       du pipeline (decision separee, hors scope ici). Ce template est
       aussi celui que generateMatchPages() (update-data.yml) utilise pour
       produire /match/{id}.html (FR uniquement pour l'instant) - cette
       regeneration n'est pas affectee par ce fichier puisqu'elle lit
       toujours la racine match.html, jamais /fr/match.html. Etendre
       /match/{id}.html a /{locale}/match/{id}.html est la suite logique
       de ce chantier, pas faite dans cette passe (voir IASHARK_V2_EXECUTION_STATE.md). */
    file: "match.html",
    noSitemap: true, // noindex
    metas: {
      fr: {title: "Analyse Match — IASHARK"},
      en: {title: "Match Analysis — IASHARK"},
      es: {title: "Análisis del Partido — IASHARK"},
      de: {title: "Spielanalyse — IASHARK"},
      it: {title: "Analisi Partita — IASHARK"},
      pt: {title: "Análise do Jogo — IASHARK"}
    },
    replacements: [
      {find: '<a class="hdr-back" href="javascript:history.back()">← RETOUR</a>', build: function(d){ return '<a class="hdr-back" href="javascript:history.back()">' + d.match_page.back + '</a>'; }},
      {find: '<span id="authHeaderSlot"><a class="btn-login" href="/compte.html">CONNEXION</a></span>', build: function(d){ return '<span id="authHeaderSlot"><a class="btn-login" href="/compte.html">' + d.cta.login + '</a></span>'; }},
      {find: '<div class="loading-lbl">CHARGEMENT...</div>', build: function(d){ return '<div class="loading-lbl">' + d.common.loading + '</div>'; }},
      {find:
        '    <div>⚠️ LE JEU PEUT ÊTRE DANGEREUX — JOUEZ RESPONSABLE · INTERDIT AUX MOINS DE 18 ANS</div>\n' +
        '    <div>Aide : <a href="https://www.joueurs-info-service.fr" style="color:rgba(34,211,238,0.4);text-decoration:none;">joueurs-info-service.fr</a> · 09 74 75 13 13</div>',
       build: function(d){
        var f = d.footer;
        return '    <div>⚠️ ' + f.disclaimer_warning + '</div>\n' +
          '    <div>' + f.disclaimer_help_label + ' <a href="https://www.joueurs-info-service.fr" style="color:rgba(34,211,238,0.4);text-decoration:none;">' + f.disclaimer_help_site + '</a> · ' + f.disclaimer_help_phone + '</div>';
      }},
      {find: '<div class="nav-lbl">ACCUEIL</div>', build: function(d){ return '<div class="nav-lbl">' + d.nav.home + '</div>'; }},
      {find: '<div class="nav-lbl">OUTILS</div>', build: function(d){ return '<div class="nav-lbl">' + d.nav.tools + '</div>'; }},
      {find: '<div class="nav-lbl">GUIDES</div>', build: function(d){ return '<div class="nav-lbl">' + d.nav.guides + '</div>'; }},
      {find: '<div class="nav-lbl">COMPTE</div>', build: function(d){ return '<div class="nav-lbl">' + d.nav.account + '</div>'; }},
      {find: "el.innerHTML='<div style=\"text-align:center;padding:60px 20px;font-family:Space Mono,monospace;font-size:10px;color:var(--muted)\">ID MANQUANT<br><br><a href=\"/\" style=\"color:var(--cyan)\">← RETOUR</a></div>';",
       build: function(d, l, esc){ return "el.innerHTML='<div style=\"text-align:center;padding:60px 20px;font-family:Space Mono,monospace;font-size:10px;color:var(--muted)\">" + esc(d.match_page.id_missing) + "<br><br><a href=\"/\" style=\"color:var(--cyan)\">" + esc(d.match_page.back) + "</a></div>';"; }},
      {find: "el.innerHTML='<div style=\"text-align:center;padding:60px 20px\"><div style=\"font-family:Space Mono,monospace;font-size:10px;color:var(--muted)\">MATCH INTROUVABLE · ID: '+fId+'</div><br><a href=\"/\" style=\"color:var(--cyan);font-family:Space Mono,monospace;font-size:9px\">← RETOUR</a></div>';",
       build: function(d, l, esc){ return "el.innerHTML='<div style=\"text-align:center;padding:60px 20px\"><div style=\"font-family:Space Mono,monospace;font-size:10px;color:var(--muted)\">" + esc(d.match_page.match_not_found_prefix) + "'+fId+'</div><br><a href=\"/\" style=\"color:var(--cyan);font-family:Space Mono,monospace;font-size:9px\">" + esc(d.match_page.back) + "</a></div>';"; }},
      {find: "el.innerHTML='<div style=\"text-align:center;padding:60px 20px;color:var(--muted)\">Erreur de chargement</div>';",
       build: function(d, l, esc){ return "el.innerHTML='<div style=\"text-align:center;padding:60px 20px;color:var(--muted)\">" + esc(d.common.error_loading) + "</div>';"; }},
      {find: "+'<button class=\"tab-btn active\" id=\"tab-btn-resume\" role=\"tab\" aria-selected=\"true\" aria-controls=\"tab-resume\" data-tab=\"resume\" onclick=\"switchTab(this,\\'resume\\')\">RÉSUMÉ</button>'\n    +'<button class=\"tab-btn\" id=\"tab-btn-donnees\" role=\"tab\" aria-selected=\"false\" aria-controls=\"tab-donnees\" data-tab=\"donnees\" onclick=\"switchTab(this,\\'donnees\\')\">DONNÉES AVANCÉES</button>'\n    +'<button class=\"tab-btn\" id=\"tab-btn-joueurs\" role=\"tab\" aria-selected=\"false\" aria-controls=\"tab-joueurs\" data-tab=\"joueurs\" onclick=\"switchTab(this,\\'joueurs\\')\">JOUEURS</button>'",
       build: function(d, l, esc){
        var t = d.match_page;
        return "+'<button class=\"tab-btn active\" id=\"tab-btn-resume\" role=\"tab\" aria-selected=\"true\" aria-controls=\"tab-resume\" data-tab=\"resume\" onclick=\"switchTab(this,\\'resume\\')\">" + esc(t.tab_summary) + "</button>'\n    +'<button class=\"tab-btn\" id=\"tab-btn-donnees\" role=\"tab\" aria-selected=\"false\" aria-controls=\"tab-donnees\" data-tab=\"donnees\" onclick=\"switchTab(this,\\'donnees\\')\">" + esc(t.tab_advanced_data) + "</button>'\n    +'<button class=\"tab-btn\" id=\"tab-btn-joueurs\" role=\"tab\" aria-selected=\"false\" aria-controls=\"tab-joueurs\" data-tab=\"joueurs\" onclick=\"switchTab(this,\\'joueurs\\')\">" + esc(t.tab_players) + "</button>'";
      }},
      {find: '<div class="stitle">PROBABILITÉS 1X2</div>', count: 2, build: function(d, l, esc){ return '<div class="stitle">' + esc(d.match_page.section_1x2) + '</div>'; }},
      {find: '<div class="stitle">CONSENSUS DES MARCHÉS</div>', build: function(d, l, esc){ return '<div class="stitle">' + esc(d.match_page.section_consensus) + '</div>'; }},
      {find: '<div class="stitle">SCORES SIMULÉS — MONTE-CARLO</div>', build: function(d, l, esc){ return '<div class="stitle">' + esc(d.match_page.section_montecarlo) + '</div>'; }},
      {find: '<div class="stitle">SCORES LES PLUS PROBABLES</div>', count: 3, build: function(d, l, esc){ return '<div class="stitle">' + esc(d.match_page.section_top_scores) + '</div>'; }},
      {find: '<div class="stitle">SCORE LE PLUS PROBABLE</div>', build: function(d, l, esc){ return '<div class="stitle">' + esc(d.match_page.section_top_score) + '</div>'; }},
      {find: '<div class="stitle">RADAR DE FORCES</div>', build: function(d, l, esc){ return '<div class="stitle">' + esc(d.match_page.section_radar) + '</div>'; }},
      {find: '<div class="stitle">STATS (MOYENNES 10 DERNIERS MATCHS)</div>', build: function(d, l, esc){ return '<div class="stitle">' + esc(d.match_page.section_stats) + '</div>'; }},
      {find: '<div class="stitle">PATTERNS DE JEU — 15 MIN</div>', build: function(d, l, esc){ return '<div class="stitle">' + esc(d.match_page.section_patterns) + '</div>'; }},
      {find: '<div class="stitle">ABSENTS &amp; RETOURS</div>', build: function(d, l, esc){ return '<div class="stitle">' + esc(d.match_page.section_absences) + '</div>'; }},
      {find: '<div class="stitle">HEAD TO HEAD</div>', count: 2, build: function(d, l, esc){ return '<div class="stitle">' + esc(d.match_page.section_h2h) + '</div>'; }},
      {find: '<div class="stitle">INDICE DE FORCE</div>', build: function(d, l, esc){ return '<div class="stitle">' + esc(d.match_page.section_force_index) + '</div>'; }},
      {find: '<div class="stitle">ARBITRE & DISCIPLINE — \'+esc(arb.nom)+\'</div>', build: function(d, l, esc){ return '<div class="stitle">' + esc(d.match_page.section_referee_prefix) + '\'+esc(arb.nom)+\'</div>'; }},
      {find: '<div class="stitle">MODÈLE IA SHARK — CM 2026</div>', build: function(d, l, esc){ return '<div class="stitle">' + esc(d.match_page.section_wc_model) + '</div>'; }},
      {find: '<div class="stitle">SCÉNARIO ATTENDU</div>', build: function(d, l, esc){ return '<div class="stitle">' + esc(d.match_page.section_scenario) + '</div>'; }},
      {find: '<div class="stitle">JOUEURS À SUIVRE — CLASSEMENT</div>', build: function(d, l, esc){ return '<div class="stitle">' + esc(d.match_page.section_players) + '</div>'; }},
      {find: "var PE_TXT={title:'PROJECTIONS JOUEURS',empty:'PAS ENCORE DE DONNÉES PLAYER ENGINE POUR CE MATCH',empty_sub:'(composition officielle pas encore confirmée, ou analyse limitée pour cette compétition)',disclaimer:'Modèle statistique dédié (Poisson, minutes attendues + contexte d\\'équipe) — jamais une cote transformée en probabilité. Statut : FORWARD_VALIDATION_ONLY tant qu\\'aucun backtest hors échantillon réel n\\'a été exécuté.',minutes:'Minutes attendues',quality:'Data quality',sample:'Échantillon',matches_suffix:'matchs',prob_iashark:'Probabilité IASHARK',odds:'Cote',market_prob:'Probabilité marché'};",
       build: function(d, l, esc){
        var p = d.match_page;
        return "var PE_TXT={title:'" + esc(p.player_engine_title) + "',empty:'" + esc(p.player_engine_empty) + "',empty_sub:'" + esc(p.player_engine_empty_sub) + "',disclaimer:'" + esc(p.player_engine_disclaimer) + "',minutes:'" + esc(p.player_engine_minutes) + "',quality:'" + esc(p.player_engine_quality) + "',sample:'" + esc(p.player_engine_sample) + "',matches_suffix:'" + esc(p.player_engine_matches_suffix) + "',prob_iashark:'" + esc(p.player_engine_prob_iashark) + "',odds:'" + esc(p.player_engine_odds) + "',market_prob:'" + esc(p.player_engine_market_prob) + "'};";
      }},
      {find: "var marketLabels={ANYTIME_GOALSCORER:'Buteur',PLAYER_SHOTS:'Tirs',PLAYER_SHOTS_ON_TARGET:'Tirs cadrés'};",
       build: function(d, l, esc){
        var p = d.match_page;
        return "var marketLabels={ANYTIME_GOALSCORER:'" + esc(p.player_engine_market_goalscorer) + "',PLAYER_SHOTS:'" + esc(p.player_engine_market_shots) + "',PLAYER_SHOTS_ON_TARGET:'" + esc(p.player_engine_market_shots_target) + "'};";
      }},
      {find: "var lineupLabels={confirmed_starter:'Titulaire confirmé',confirmed_bench:'Remplaçant confirmé',expected_starter:'Titulaire attendu',expected_bench:'Remplaçant attendu'};",
       build: function(d, l, esc){
        var p = d.match_page;
        return "var lineupLabels={confirmed_starter:'" + esc(p.player_engine_status_confirmed_starter) + "',confirmed_bench:'" + esc(p.player_engine_status_confirmed_bench) + "',expected_starter:'" + esc(p.player_engine_status_expected_starter) + "',expected_bench:'" + esc(p.player_engine_status_expected_bench) + "'};";
      }},
      {find: '+\'<div style="text-align:right;"><div style="font-family:Space Mono,monospace;font-size:15px;font-weight:700;color:var(--text);">\'+ratioSaison+\'%</div><div style="font-family:Space Mono,monospace;font-size:8px;color:var(--muted);margin-top:1px;">ratio buts/match (saison)</div></div>\'',
       build: function(d, l, esc){
        return '+\'<div style="text-align:right;"><div style="font-family:Space Mono,monospace;font-size:15px;font-weight:700;color:var(--text);">\'+ratioSaison+\'%</div><div style="font-family:Space Mono,monospace;font-size:8px;color:var(--muted);margin-top:1px;">' + esc(d.match_page.season_ratio_label) + '</div></div>\'';
      }},
      {find: '<div class="stitle">SURFACE — \'+surfLabel.toUpperCase()+\'</div>', build: function(d, l, esc){ return '<div class="stitle">' + esc(d.match_page.section_surface_prefix) + '\'+surfLabel.toUpperCase()+\'</div>'; }},
      {find: '<div class="stitle">PALMARÈS CE TOURNOI</div>', build: function(d, l, esc){ return '<div class="stitle">' + esc(d.match_page.section_palmares) + '</div>'; }},
      {find: '<div class="stitle">CONTEXTE</div>', build: function(d, l, esc){ return '<div class="stitle">' + esc(d.match_page.section_context) + '</div>'; }},
      {find: '<div class="stitle">POURQUOI CE PARI ?</div>', build: function(d, l, esc){ return '<div class="stitle">' + esc(d.match_page.section_why) + '</div>'; }},
      {find: "<div class=\"pm-lbl\">SÉLECTION IA DU JOUR</div>", build: function(d, l, esc){ return "<div class=\"pm-lbl\">" + esc(d.match_page.label_ia_pick) + "</div>"; }},
      {find: "<div class=\"pmm-lbl\">PROBABILITÉ MODÈLE</div>", build: function(d, l, esc){ return "<div class=\"pmm-lbl\">" + esc(d.match_page.label_model_prob) + "</div>"; }},
      {find: "<div class=\"pmm-lbl\">COTE IMPL.</div>", build: function(d, l, esc){ return "<div class=\"pmm-lbl\">" + esc(d.match_page.label_implied_odds) + "</div>"; }},
      {find: "<div class=\"pmm-lbl\">AVANTAGE</div>", build: function(d, l, esc){ return "<div class=\"pmm-lbl\">" + esc(d.match_page.label_edge) + "</div>"; }},
      {find: "<span class=\"pm-conf-lbl\">FIABILITÉ</span>", build: function(d, l, esc){ return "<span class=\"pm-conf-lbl\">" + esc(d.match_page.label_reliability) + "</span>"; }},
      {find: "'<div class=\"pm-warn\">⚠ Si cote passe sous '+coteMin+' — ne pas jouer</div>'",
       build: function(d, l, esc){ return "'<div class=\"pm-warn\">" + esc(d.match_page.warn_cote_below_prefix) + "'+coteMin+'" + esc(d.match_page.warn_cote_below_suffix) + "</div>'"; }},
      {find: "<div class=\"ir-lbl sig\">SIGNAL DÉCISIF</div>", build: function(d, l, esc){ return "<div class=\"ir-lbl sig\">" + esc(d.match_page.signal_decisif) + "</div>"; }},
      {find: "<div class=\"ir-lbl\" style=\"color:var(--red)\">PASSE TON TOUR</div><div class=\"ir-txt\">'+(m.no_signal_label||'Signaux contradictoires. Ne pas jouer.')+'</div>",
       build: function(d, l, esc){ return "<div class=\"ir-lbl\" style=\"color:var(--red)\">" + esc(d.match_page.passe_ton_tour) + "</div><div class=\"ir-txt\">'+(m.no_signal_label||'" + esc(d.match_page.no_signal_fallback) + "')+'</div>"; }},
      {find: "<div class=\"arb-l\">CARTONS/MATCH</div>", build: function(d, l, esc){ return "<div class=\"arb-l\">" + esc(d.match_page.arb_cards_per_match) + "</div>"; }},
      {find: "<div class=\"arb-l\">PÉNALTYS/MATCH</div>", build: function(d, l, esc){ return "<div class=\"arb-l\">" + esc(d.match_page.arb_penalties_per_match) + "</div>"; }},
      {find: "num:String(blocs.length+1), titre:'Le pari recommandé',\n    txt:'Le modèle statistique estime <strong>'+esc(marketFr)+'</strong> à <strong>'+modelProbTxt+'%</strong> de probabilité, à la cote de <strong>'+esc(paricote)+'</strong>'+(reliabilityTxt?' (fiabilité : <strong>'+esc(reliabilityTxt.toUpperCase())+'</strong>, mesurée par l\\'accord des modèles et la qualité des données disponibles — pas par la probabilité elle-même)':'')+'.'",
       build: function(d, l, esc){
        var w = d.match_page;
        return "num:String(blocs.length+1), titre:'" + esc(w.why1_title) + "',\n    txt:'" + esc(w.why1_a) + "<strong>'+esc(marketFr)+'</strong>" + esc(w.why1_b) + "<strong>'+modelProbTxt+'%</strong>" + esc(w.why1_c) + "<strong>'+esc(paricote)+'</strong>'+(reliabilityTxt?'" + esc(w.why1_d) + "<strong>'+esc(reliabilityTxt.toUpperCase())+'</strong>" + esc(w.why1_e) + "':'')+'.'";
      }},
      {find: "blocs.push({num:String(blocs.length+1), titre:'Impact des absences',\n      txt:absTxt+' Cet élément est pris en compte dans les données transmises au modèle — il ne remet pas en cause le pari en l\\'état, mais reste un facteur de risque à surveiller.'});",
       build: function(d, l, esc){ var w = d.match_page; return "blocs.push({num:String(blocs.length+1), titre:'" + esc(w.why2_title) + "',\n      txt:absTxt+'" + esc(w.why2_suffix) + "'});"; }},
      {find: "blocs.push({num:String(blocs.length+1), titre:'Le raisonnement', txt:esc(cleanJargon(m.verdict_shark))});",
       build: function(d, l, esc){ return "blocs.push({num:String(blocs.length+1), titre:'" + esc(d.match_page.why3_title) + "', txt:esc(cleanJargon(m.verdict_shark))});"; }},
      {find: "blocs.push({num:String(blocs.length+1), titre:'Le facteur décisif', txt:esc(cleanJargon(m.facteur_x))});",
       build: function(d, l, esc){ return "blocs.push({num:String(blocs.length+1), titre:'" + esc(d.match_page.why4_title) + "', txt:esc(cleanJargon(m.facteur_x))});"; }},
      {find: "blocs.push({num:String(blocs.length+1), titre:'Pourquoi cette cote est intéressante',\n      txt:'La probabilité estimée par le modèle est supérieure à celle impliquée par la cote du bookmaker, ce qui représente un avantage statistique d\\'environ <strong>+'+edgeNum.toFixed(1)+'%</strong> en faveur du parieur sur le long terme.'});",
       build: function(d, l, esc){
        var w = d.match_page;
        return "blocs.push({num:String(blocs.length+1), titre:'" + esc(w.why5_title) + "',\n      txt:'" + esc(w.why5_a) + "<strong>+'+edgeNum.toFixed(1)+'%</strong>" + esc(w.why5_b) + "'});";
      }},
      {find: "blocs.push({num:String(blocs.length+1), titre:'Mise conseillée',\n      txt:'Sur la base de cet avantage statistique, la mise recommandée est d\\'environ <strong>'+esc(m.kelly)+'% de la bankroll</strong> (méthode de Kelly fractionnée, pour limiter le risque de ruine en cas d\\'erreur du modèle).'});",
       build: function(d, l, esc){
        var w = d.match_page;
        return "blocs.push({num:String(blocs.length+1), titre:'" + esc(w.why6_title) + "',\n      txt:'" + esc(w.why6_a) + "<strong>'+esc(m.kelly)+'" + esc(w.why6_b) + "</strong>" + esc(w.why6_c) + "'});";
      }},
      {find: "if(s.includes('over 2.5'))return 'Plus de 2,5 buts';\n  if(s.includes('under 2.5'))return 'Moins de 2,5 buts';\n  if(s.includes('over 1.5'))return 'Plus de 1,5 but';\n  if(s.includes('under 1.5'))return 'Moins de 1,5 but';\n  if(s.includes('over 3.5'))return 'Plus de 3,5 buts';\n  if(s.includes('btts oui')||s.includes('btts yes'))return 'Les deux équipes marquent';\n  if(s.includes('btts non')||s.includes('btts no'))return 'Une équipe ne marque pas';\n  if(s.includes('dc 1x')||s==='1x')return 'Victoire ou nul (domicile)';\n  if(s.includes('dc x2')||s==='x2')return 'Victoire ou nul (extérieur)';\n  if(s.includes('match winner')||s==='1')return 'Victoire à domicile';",
       build: function(d, l, esc){
        var n = d.market_names, nat = d.market_names_natural, m = d.match_page;
        return "if(s.includes('over 2.5'))return '" + esc(n.over25) + "';\n  if(s.includes('under 2.5'))return '" + esc(n.under25) + "';\n  if(s.includes('over 1.5'))return '" + esc(n.over15) + "';\n  if(s.includes('under 1.5'))return '" + esc(m.under15) + "';\n  if(s.includes('over 3.5'))return '" + esc(m.over35) + "';\n  if(s.includes('btts oui')||s.includes('btts yes'))return '" + esc(nat.btts_oui_natural) + "';\n  if(s.includes('btts non')||s.includes('btts no'))return '" + esc(nat.btts_non_natural) + "';\n  if(s.includes('dc 1x')||s==='1x')return '" + esc(m.dc1x_long) + "';\n  if(s.includes('dc x2')||s==='x2')return '" + esc(m.dcx2_long) + "';\n  if(s.includes('match winner')||s==='1')return '" + esc(m.home_win_long) + "';";
      }}
    ]
  },
  {
    file: "pro.html",
    metas: {
      fr: {title: "IASHARK OUTILS", description: "Sélections à forte probabilité modèle, suivi automatique des paris et vérification de cote en un clic — l'espace Outils d'IASHARK."},
      en: {title: "IASHARK TOOLS", description: "High model-probability selections, automatic bet tracking and one-click odds check — the IASHARK Tools space."},
      es: {title: "IASHARK HERRAMIENTAS", description: "Selecciones con alta probabilidad de modelo, seguimiento automático de apuestas y verificación de cuota en un clic — el espacio Herramientas de IASHARK."},
      de: {title: "IASHARK TOOLS", description: "Tipps mit hoher Modellwahrscheinlichkeit, automatisches Wett-Tracking und Quotenprüfung mit einem Klick — der IASHARK-Tools-Bereich."},
      it: {title: "IASHARK STRUMENTI", description: "Selezioni ad alta probabilità di modello, tracciamento automatico delle scommesse e verifica quota in un clic — l'area Strumenti di IASHARK."},
      pt: {title: "IASHARK FERRAMENTAS", description: "Seleções com alta probabilidade de modelo, registo automático de apostas e verificação de odd num clique — o espaço Ferramentas do IASHARK."}
    },
    replacements: [
      {find: '<span id="authHeaderSlot"><a href="/compte.html" class="btn-login">CONNEXION</a></span>', build: function(d){ return '<span id="authHeaderSlot"><a href="/compte.html" class="btn-login">' + d.cta.login + '</a></span>'; }},
      {find: '<h1>Espace <span>OUTILS</span></h1>', build: function(d){ var t = d.tools_page; return '<h1>' + t.hero_title_pre + '<span>' + t.hero_title_hl + '</span></h1>'; }},
      {find: '<p>Sélections probabilité ≥ 70% · Suivi automatique · Vérification de cote</p>', build: function(d, l, esc){ return '<p>' + esc(d.tools_page.hero_sub) + '</p>'; }},
      {find: '<div class="hstat-lbl">WINRATE</div>', build: function(d){ return '<div class="hstat-lbl">' + d.tools_page.stat_winrate + '</div>'; }},
      {find: '<div class="hstat-lbl">ROI</div>', build: function(d){ return '<div class="hstat-lbl">' + d.tools_page.stat_roi + '</div>'; }},
      {find: '<div class="hstat-lbl">PARIS</div>', build: function(d){ return '<div class="hstat-lbl">' + d.tools_page.stat_total + '</div>'; }},
      {find: '<span class="capital-lbl">CAPITAL DE DÉPART</span>', build: function(d){ return '<span class="capital-lbl">' + d.tools_page.capital_start + '</span>'; }},
      {find: '<span class="capital-lbl">CAPITAL ACTUEL</span>', build: function(d){ return '<span class="capital-lbl">' + d.tools_page.capital_current + '</span>'; }},
      {find: '<button class="capital-edit-btn" id="capitalEditBtn" onclick="toggleCapitalEdit()">MODIFIER</button>', build: function(d){ return '<button class="capital-edit-btn" id="capitalEditBtn" onclick="toggleCapitalEdit()">' + d.tools_page.capital_edit + '</button>'; }},
      {find: '<input type="number" id="capitalInput" placeholder="Ex: 1000">', build: function(d){ return '<input type="number" id="capitalInput" placeholder="' + d.tools_page.capital_placeholder + '">'; }},
      {find: '<button class="sync-btn" onclick="saveCapital()">ENREGISTRER</button>', build: function(d){ return '<button class="sync-btn" onclick="saveCapital()">' + d.tools_page.capital_save + '</button>'; }},
      {find: '<button class="sync-btn" id="syncBtn" onclick="runSync()"><svg viewBox="0 0 24 24" width="12" height="12" style="vertical-align:-2px;margin-right:4px;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;"><path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg>SYNCHRONISER</button>',
       build: function(d, l, esc){ return '<button class="sync-btn" id="syncBtn" onclick="runSync()"><svg viewBox="0 0 24 24" width="12" height="12" style="vertical-align:-2px;margin-right:4px;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;"><path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg>' + esc(d.tools_page.sync_btn_default) + '</button>'; }},
      {find: '<div class="day-summary" id="daySummary">🦈 <div>Chargement du résumé du jour...</div></div>', build: function(d, l, esc){ return '<div class="day-summary" id="daySummary">🦈 <div>' + esc(d.common.loading) + '</div></div>'; }},
      {find: '<span class="capital-lbl">CALCULATEURS GRATUITS</span>', build: function(d, l, esc){ return '<span class="capital-lbl">' + esc(d.tools_page.free_calc_title) + '</span>'; }},
      {find: '<div class="capital-lbl" style="margin-bottom:4px;">COTE DÉCIMALE</div>', count: 2, build: function(d){ return '<div class="capital-lbl" style="margin-bottom:4px;">' + d.tools_page.calc_odds_label + '</div>'; }},
      {find: '<div class="capital-lbl" style="margin-bottom:4px;">PROBABILITÉ IMPLICITE (%)</div>', build: function(d){ return '<div class="capital-lbl" style="margin-bottom:4px;">' + d.tools_page.calc_prob_label + '</div>'; }},
      {find: '<div class="capital-hint" style="color:var(--muted);font-size:9px;">Probabilité implicite = 100 / cote décimale — inclut la marge du bookmaker, ce n\'est pas une probabilité "juste" (fair).</div>',
       build: function(d){ return '<div class="capital-hint" style="color:var(--muted);font-size:9px;">' + d.tools_page.calc_prob_hint + '</div>'; }},
      {find: '<span class="capital-lbl">MARGE BOOKMAKER (1X2)</span>', build: function(d, l, esc){ return '<span class="capital-lbl">' + esc(d.tools_page.margin_title) + '</span>'; }},
      {find: 'placeholder="Cote 1"', build: function(d){ return 'placeholder="' + d.tools_page.margin_odds1 + '"'; }},
      {find: 'placeholder="Cote N"', build: function(d){ return 'placeholder="' + d.tools_page.margin_oddsn + '"'; }},
      {find: 'placeholder="Cote 2"', build: function(d){ return 'placeholder="' + d.tools_page.margin_odds2 + '"'; }},
      {find: '<span class="capital-lbl">MARGE</span>', build: function(d){ return '<span class="capital-lbl">' + d.tools_page.margin_label + '</span>'; }},
      {find: "margePct>=0?'(marge normale du bookmaker)':'(anomalie : somme des probabilités < 100%, vérifie les cotes saisies)'",
       build: function(d, l, esc){ return "margePct>=0?'" + esc(d.tools_page.margin_hint_normal) + "':'" + esc(d.tools_page.margin_hint_anomaly) + "'"; }},
      {find: "<button class=\"tab-btn active\" onclick=\"switchTab('selections',this)\">SÉLECTIONS</button>", build: function(d, l, esc){ return "<button class=\"tab-btn active\" onclick=\"switchTab('selections',this)\">" + esc(d.tools_page.tab_selections) + "</button>"; }},
      {find: "<button class=\"tab-btn\" onclick=\"switchTab('suivi',this)\">MON SUIVI</button>", build: function(d, l, esc){ return "<button class=\"tab-btn\" onclick=\"switchTab('suivi',this)\">" + esc(d.tools_page.tab_tracking) + "</button>"; }},
      {find: "<button class=\"tab-btn\" onclick=\"switchTab('calc',this)\">CALCULATEURS</button>", build: function(d, l, esc){ return "<button class=\"tab-btn\" onclick=\"switchTab('calc',this)\">" + esc(d.tools_page.tab_calculators) + "</button>"; }},
      {find: '<span class="lock-badge"><svg viewBox="0 0 24 24" width="10" height="10" style="vertical-align:-1px;margin-right:3px;stroke:currentColor;fill:none;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round;"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>PROBA ≥ 70%</span>', build: function(d, l, esc){ return '<span class="lock-badge"><svg viewBox="0 0 24 24" width="10" height="10" style="vertical-align:-1px;margin-right:3px;stroke:currentColor;fill:none;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round;"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>' + esc(d.tools_page.lock_badge) + '</span>'; }},
      {find: '<option value="">Tous les marchés</option>', build: function(d){ return '<option value="">' + d.markets_page.filter_all_markets + '</option>'; }},
      {find: '<option value="over25">Plus de 2,5 buts</option>', build: function(d){ return '<option value="over25">' + d.market_names.over25 + '</option>'; }},
      {find: '<option value="under25">Moins de 2,5 buts</option>', build: function(d){ return '<option value="under25">' + d.market_names.under25 + '</option>'; }},
      {find: '<option value="btts_oui">Les deux équipes marquent</option>', build: function(d){ return '<option value="btts_oui">' + d.market_names_natural.btts_oui_natural + '</option>'; }},
      {find: '<option value="btts_non">Une équipe ne marque pas</option>', build: function(d){ return '<option value="btts_non">' + d.market_names_natural.btts_non_natural + '</option>'; }},
      {find: '<option value="dc1x">DC 1X</option>', build: function(d){ return '<option value="dc1x">' + d.market_names.dc1x + '</option>'; }},
      {find: '<option value="dc_x2">DC X2</option>', build: function(d){ return '<option value="dc_x2">' + d.market_names.dc_x2 + '</option>'; }},
      {find: '<option value="conf">Trier : probabilité modèle</option>', build: function(d){ return '<option value="conf">' + d.tools_page.sort_by_prob + '</option>'; }},
      {find: '<option value="cote">Trier : cote</option>', build: function(d){ return '<option value="cote">' + d.tools_page.sort_by_odds + '</option>'; }},
      {find: '<option value="date">Trier : date</option>', build: function(d){ return '<option value="date">' + d.tools_page.sort_by_date + '</option>'; }},
      {find: '<div id="selList"><div class="loading">CHARGEMENT...</div></div>', build: function(d, l, esc){ return '<div id="selList"><div class="loading">' + esc(d.common.loading) + '</div></div>'; }},
      {find: 'Les paris suivis depuis Sélections se résolvent automatiquement.', build: function(d, l, esc){ return esc(d.tools_page.sync_status_default); }},
      {find: '<span class="capital-lbl">MISE DE KELLY (FRACTIONNAIRE)</span>', build: function(d, l, esc){ return '<span class="capital-lbl">' + esc(d.tools_page.kelly_title) + '</span>'; }},
      {find: '<div class="capital-lbl" style="margin-bottom:4px;">BANKROLL (€)</div>', build: function(d){ return '<div class="capital-lbl" style="margin-bottom:4px;">' + d.tools_page.kelly_bankroll + '</div>'; }},
      {find: '<div class="capital-lbl" style="margin-bottom:4px;">PROBABILITÉ ESTIMÉE (%)</div>', build: function(d){ return '<div class="capital-lbl" style="margin-bottom:4px;">' + d.tools_page.kelly_prob + '</div>'; }},
      {find: '<div class="capital-lbl" style="margin-bottom:4px;">FRACTION KELLY</div>', build: function(d){ return '<div class="capital-lbl" style="margin-bottom:4px;">' + d.tools_page.kelly_fraction + '</div>'; }},
      {find: '<option value="0.25" selected>1/4 (prudent, standard)</option>', build: function(d){ return '<option value="0.25" selected>' + d.tools_page.kelly_frac_quarter + '</option>'; }},
      {find: '<option value="0.5">1/2</option>', build: function(d){ return '<option value="0.5">' + d.tools_page.kelly_frac_half + '</option>'; }},
      {find: '<option value="1">Plein (agressif)</option>', build: function(d){ return '<option value="1">' + d.tools_page.kelly_frac_full + '</option>'; }},
      {find: '<span class="capital-lbl">MISE RECOMMANDÉE</span>', build: function(d){ return '<span class="capital-lbl">' + d.tools_page.kelly_result_stake + '</span>'; }},
      {find: '<span class="capital-lbl">% DU BANKROLL</span>', build: function(d){ return '<span class="capital-lbl">' + d.tools_page.kelly_result_pct + '</span>'; }},
      {find: '<span class="capital-lbl">EV (valeur espérée)</span>', build: function(d){ return '<span class="capital-lbl">' + d.tools_page.kelly_result_ev + '</span>'; }},
      {find: '<div class="capital-hint" style="color:var(--muted);font-size:9px;">La probabilité que tu entres ici doit venir de ton propre jugement ou d\'une probabilité modèle IASHARK réelle (visible dans Sélections/Match) — ce calculateur ne fournit aucune probabilité, il applique seulement la formule de Kelly à ce que tu lui donnes. Mise plafonnée à 5% du bankroll par pari (même règle que le moteur), quel que soit l\'edge.</div>',
       build: function(d){ return '<div class="capital-hint" style="color:var(--muted);font-size:9px;">' + d.tools_page.kelly_hint_static + '</div>'; }},
      {find: '<span class="pw-top-lbl">CONTENU OUTILS</span>', build: function(d){ return '<span class="pw-top-lbl">' + d.tools_page.pw_badge + '</span>'; }},
      {find: '<div class="pw-title">Accès <span>complet</span></div>', build: function(d){ var t = d.tools_page; return '<div class="pw-title">' + t.pw_title_pre + '<span>' + t.pw_title_hl + '</span></div>'; }},
      {find: '<div class="pw-sub">Sélections à forte probabilité modèle, suivi automatique de tes paris, vérification de cote en un clic.</div>',
       build: function(d, l, esc){ return '<div class="pw-sub">' + esc(d.tools_page.pw_sub) + '</div>'; }},
      {find: '<div class="pw-feat-name">SÉLECTIONS PROBABILITÉ ≥ 70%</div><div class="pw-feat-desc">Les pronostics à plus forte probabilité modèle</div></div></div><span class="pw-badge">OUTILS</span></div>',
       build: function(d, l, esc){ var t = d.tools_page; return '<div class="pw-feat-name">' + esc(t.pw_feat1_name) + '</div><div class="pw-feat-desc">' + esc(t.pw_feat1_desc) + '</div></div></div><span class="pw-badge">' + esc(d.nav.tools) + '</span></div>'; }},
      {find: '<div class="pw-feat-name">SUIVI AUTOMATIQUE</div><div class="pw-feat-desc">Tracker de paris et résolution automatique</div></div></div><span class="pw-badge">OUTILS</span></div>',
       build: function(d, l, esc){ var t = d.tools_page; return '<div class="pw-feat-name">' + esc(t.pw_feat2_name) + '</div><div class="pw-feat-desc">' + esc(t.pw_feat2_desc) + '</div></div></div><span class="pw-badge">' + esc(d.nav.tools) + '</span></div>'; }},
      {find: '<button class="pw-cta" id="pwCtaBtn" onclick="handleProCta()">PASSER OUTILS — 19,95€/MOIS →</button>', build: function(d, l, esc){ return '<button class="pw-cta" id="pwCtaBtn" onclick="handleProCta()">' + esc(d.tools_page.pw_cta) + '</button>'; }},
      {find: "btn.disabled = true; btn.textContent = 'PATIENTE...';", build: function(d, l, esc){ return "btn.disabled = true; btn.textContent = '" + esc(d.tools_page.pw_cta_loading) + "';"; }},
      {find: "note.textContent = 'Le paiement en ligne n\\'est pas encore activé — reviens très bientôt. Écris-nous sur contact@iashark.com si tu veux être prévenu(e) dès l\\'ouverture.';",
       build: function(d, l, esc){ return "note.textContent = '" + esc(d.tools_page.pw_unavailable_msg) + "';"; }},
      {find: "note.textContent = 'Une erreur est survenue. Réessaie dans un instant.';", build: function(d, l, esc){ return "note.textContent = '" + esc(d.tools_page.pw_error_msg) + "';"; }},
      {find: "btn.disabled = false; btn.textContent = 'PASSER OUTILS — 19,95€/MOIS →';", build: function(d, l, esc){ return "btn.disabled = false; btn.textContent = '" + esc(d.tools_page.pw_cta) + "';"; }},
      {find: '<div class="modal-title">Ajout rapide</div>', build: function(d){ return '<div class="modal-title">' + d.tools_page.modal_title + '</div>'; }},
      {find: '<div class="modal-sub">Pour un pari pris sur le vif, sans passer par Sélections.</div>', build: function(d, l, esc){ return '<div class="modal-sub">' + esc(d.tools_page.modal_sub) + '</div>'; }},
      {find: '<label>MATCH</label><input type="text" class="finput" id="mMatch" style="width:100%" placeholder="Ex: PSG vs OM">',
       build: function(d){ var t = d.tools_page; return '<label>' + t.modal_match_label + '</label><input type="text" class="finput" id="mMatch" style="width:100%" placeholder="' + t.modal_match_placeholder + '">'; }},
      {find: '<label>MARCHÉ</label><input type="text" class="finput" id="mMarket" style="width:100%" placeholder="BTTS Oui">',
       build: function(d){ var t = d.tools_page; return '<label>' + t.modal_market_label + '</label><input type="text" class="finput" id="mMarket" style="width:100%" placeholder="' + t.modal_market_placeholder + '">'; }},
      {find: '<label>COTE</label><input type="number" class="finput" id="mCote" style="width:100%" step="0.01" placeholder="1.90">',
       build: function(d){ var t = d.tools_page; return '<label>' + t.modal_odds_label + '</label><input type="number" class="finput" id="mCote" style="width:100%" step="0.01" placeholder="' + t.modal_odds_placeholder + '">'; }},
      {find: '<label>MISE (€)</label><input type="number" class="finput" id="mMise" style="width:100%" value="10">',
       build: function(d){ return '<label>' + d.tools_page.modal_stake_label + '</label><input type="number" class="finput" id="mMise" style="width:100%" value="10">'; }},
      {find: '<button class="btnvalid" style="width:100%;text-align:center;" onclick="addFromModal()">+ AJOUTER À MON SUIVI</button>',
       build: function(d, l, esc){ return '<button class="btnvalid" style="width:100%;text-align:center;" onclick="addFromModal()">' + esc(d.tools_page.modal_add_btn) + '</button>'; }},
      {find:
        '    <div>⚠️ LE JEU PEUT ÊTRE DANGEREUX — JOUEZ RESPONSABLE · INTERDIT AUX MOINS DE 18 ANS</div>\n' +
        '    <div>Aide : <a href="https://www.joueurs-info-service.fr" style="color:rgba(34,211,238,0.4);text-decoration:none;">joueurs-info-service.fr</a> · 09 74 75 13 13</div>',
       build: function(d){
        var f = d.footer;
        return '    <div>⚠️ ' + f.disclaimer_warning + '</div>\n' +
          '    <div>' + f.disclaimer_help_label + ' <a href="https://www.joueurs-info-service.fr" style="color:rgba(34,211,238,0.4);text-decoration:none;">' + f.disclaimer_help_site + '</a> · ' + f.disclaimer_help_phone + '</div>';
      }},
      {find: '<div class="nav-lbl">ACCUEIL</div>', build: function(d){ return '<div class="nav-lbl">' + d.nav.home + '</div>'; }},
      {find: '<div class="nav-lbl">MARCHÉS</div>', build: function(d){ return '<div class="nav-lbl">' + d.nav.markets + '</div>'; }},
      {find: '<div class="nav-lbl">OUTILS</div>', build: function(d){ return '<div class="nav-lbl">' + d.nav.tools + '</div>'; }},
      {find: '<div class="nav-lbl">GUIDES</div>', build: function(d){ return '<div class="nav-lbl">' + d.nav.guides + '</div>'; }},
      {find: '<div class="nav-lbl">COMPTE</div>', build: function(d){ return '<div class="nav-lbl">' + d.nav.account + '</div>'; }},
      {find: "document.getElementById('daySummary').innerHTML='🦈 <div>Aujourd\\'hui : <b>'+(todayCount||allMatchs.length)+' sélection'+((todayCount||allMatchs.length)>1?'s':'')+'</b> probabilité ≥70%'\n    +(pendingCount?' · <span class=\"cy\">'+pendingCount+' pari'+(pendingCount>1?'s':'')+'</span> en attente de résultat dans ton suivi.':' · aucun pari en attente.')\n    +'</div>';",
       build: function(d, l, esc){
        var t = d.tools_page;
        return "document.getElementById('daySummary').innerHTML='🦈 <div>" + esc(t.day_today_prefix) + "<b>'+(todayCount||allMatchs.length)+' '+((todayCount||allMatchs.length)>1?'" + esc(t.selection_many) + "':'" + esc(t.selection_one) + "')+'</b>" + esc(t.day_prob_suffix) + "'\n    +(pendingCount?' · <span class=\"cy\">'+pendingCount+' '+(pendingCount>1?'" + esc(t.bet_many) + "':'" + esc(t.bet_one) + "')+'</span>" + esc(t.day_pending_suffix) + "':'" + esc(t.day_none_pending) + "')\n    +'</div>';";
      }},
      {find: "msgEl.textContent = 'Entre un montant valide.';", build: function(d, l, esc){ return "msgEl.textContent = '" + esc(d.tools_page.capital_msg_invalid) + "';"; }},
      {find: "msgEl.textContent = 'Connecte-toi pour enregistrer ton capital.';", build: function(d, l, esc){ return "msgEl.textContent = '" + esc(d.tools_page.capital_msg_login) + "';"; }},
      {find: "msgEl.textContent = 'Enregistrement...';", build: function(d, l, esc){ return "msgEl.textContent = '" + esc(d.tools_page.capital_msg_saving) + "';"; }},
      {find: "msgEl.textContent = 'Capital enregistré.';", build: function(d, l, esc){ return "msgEl.textContent = '" + esc(d.tools_page.capital_msg_saved) + "';"; }},
      {find: "msgEl.textContent = 'Erreur : '+(e.message||'réessaie');", build: function(d, l, esc){ return "msgEl.textContent = '" + esc(d.tools_page.capital_msg_error_prefix) + "'+(e.message||'réessaie');"; }},
      {find: "document.getElementById('capitalVal').textContent = Number(capital).toLocaleString('fr-FR')+' €';\n    document.getElementById('capitalInput').placeholder = 'Modifier ('+capital+'€ actuellement)';",
       build: function(d, l, esc){
        var t = d.tools_page;
        return "document.getElementById('capitalVal').textContent = Number(capital).toLocaleString('fr-FR')+' €';\n    document.getElementById('capitalInput').placeholder = '" + esc(t.capital_edit_placeholder_prefix) + "'+capital+'" + esc(t.capital_edit_placeholder_suffix) + "';";
      }},
      {find: "document.getElementById('capitalHint').textContent = pnl===0 ? '(aucun pari résolu encore)' : '('+(pnl>0?'+':'')+Math.round(pnl)+'€ sur tes paris suivis)';",
       build: function(d, l, esc){
        var t = d.tools_page;
        return "document.getElementById('capitalHint').textContent = pnl===0 ? '" + esc(t.capital_hint_none) + "' : '('+(pnl>0?'+':'')+Math.round(pnl)+'" + esc(t.capital_hint_pnl_suffix) + "';";
      }},
      {find: "document.getElementById('capitalVal').textContent = 'Non renseigné';", build: function(d, l, esc){ return "document.getElementById('capitalVal').textContent = '" + esc(d.tools_page.capital_not_set) + "';"; }},
      {find: "document.getElementById('kellyEvVal').textContent=(ev>=0?'+':'')+(ev*100).toFixed(1)+'% par unité misée';",
       build: function(d, l, esc){ return "document.getElementById('kellyEvVal').textContent=(ev>=0?'+':'')+(ev*100).toFixed(1)+'" + esc(d.tools_page.kelly_ev_suffix) + "';"; }},
      {find: "document.getElementById('kellyMiseVal').textContent='0 € (aucun edge)';\n    document.getElementById('kellyPctVal').textContent='0%';\n    document.getElementById('kellyHint').textContent=\"À cette cote et cette probabilité, le calcul de Kelly ne recommande aucune mise (pas d'avantage mathématique) — parier ici reviendrait à un pari négatif en espérance.\";",
       build: function(d, l, esc){
        var t = d.tools_page;
        return "document.getElementById('kellyMiseVal').textContent='" + esc(t.kelly_no_edge_stake) + "';\n    document.getElementById('kellyPctVal').textContent='0%';\n    document.getElementById('kellyHint').textContent=\"" + esc(t.kelly_no_edge_hint) + "\";";
      }},
      {find: "document.getElementById('kellyHint').textContent=pct>=5?'Plafonné à 5% du bankroll par pari (même règle que le moteur), même si le Kelly plein calculé est supérieur.':'Kelly '+(fraction===1?'plein':fraction===0.5?'demi':'quart')+' appliqué sur un edge réel détecté par la formule.';",
       build: function(d, l, esc){
        var t = d.tools_page;
        return "document.getElementById('kellyHint').textContent=pct>=5?'" + esc(t.kelly_capped_hint) + "':'" + esc(t.kelly_applied_prefix) + "'+(fraction===1?'" + esc(t.kelly_frac_full_word) + "':fraction===0.5?'" + esc(t.kelly_frac_half_word) + "':'" + esc(t.kelly_frac_quarter_word) + "')+'" + esc(t.kelly_applied_suffix) + "';";
      }},
      {find: "document.getElementById('selCount').textContent=list.length+' sélection'+(list.length>1?'s':'');",
       build: function(d, l, esc){
        var t = d.tools_page;
        return "document.getElementById('selCount').textContent=list.length+' '+(list.length>1?'" + esc(t.selection_many) + "':'" + esc(t.selection_one) + "');";
      }},
      {find: "document.getElementById('selList').innerHTML='<div class=\"empty-hint\">Aucune sélection pour ce filtre aujourd\\'hui.</div>';",
       build: function(d, l, esc){ return "document.getElementById('selList').innerHTML='<div class=\"empty-hint\">" + esc(d.tools_page.empty_no_selection) + "</div>';"; }},
      {find: "+'<div class=\"cbadge '+cc+'\" title=\"Probabilité modèle\">'+modelProbPct+'%</div>'\n      +'<button class=\"btn-follow'+(isFollowed?' done':'')+'\" id=\"followbtn-'+m.id+'\" onclick=\"togglePanel('+m.id+')\">'+(isFollowed?'✓ SUIVI':'GÉRER ▾')+'</button>'",
       build: function(d, l, esc){
        var t = d.tools_page;
        return "+'<div class=\"cbadge '+cc+'\" title=\"" + esc(t.model_prob_title) + "\">'+modelProbPct+'%</div>'\n      +'<button class=\"btn-follow'+(isFollowed?' done':'')+'\" id=\"followbtn-'+m.id+'\" onclick=\"togglePanel('+m.id+')\">'+(isFollowed?'" + esc(t.btn_followed) + "':'" + esc(t.btn_manage) + "')+'</button>'";
      }},
      {find: "+'<button class=\"chip active\" data-chip=\"suivre\" onclick=\"setChip('+m.id+',\\'suivre\\',this)\">SUIVRE CE PARI</button>'\n      +'<button class=\"chip\" data-chip=\"cote\" onclick=\"setChip('+m.id+',\\'cote\\',this)\">VÉRIFIER UNE COTE</button>'\n      +'<button class=\"chip\" data-chip=\"note\" onclick=\"setChip('+m.id+',\\'note\\',this)\">AJOUTER UNE NOTE</button>'",
       build: function(d, l, esc){
        var t = d.tools_page;
        return "+'<button class=\"chip active\" data-chip=\"suivre\" onclick=\"setChip('+m.id+',\\'suivre\\',this)\">" + esc(t.chip_follow) + "</button>'\n      +'<button class=\"chip\" data-chip=\"cote\" onclick=\"setChip('+m.id+',\\'cote\\',this)\">" + esc(t.chip_check_odds) + "</button>'\n      +'<button class=\"chip\" data-chip=\"note\" onclick=\"setChip('+m.id+',\\'note\\',this)\">" + esc(t.chip_add_note) + "</button>'";
      }},
      {find: "+(suggMise?'<div class=\"mise-sugg-hint\">Mise conseillée sur ta bankroll actuelle : <b>'+suggMise+'€</b></div>':'')",
       build: function(d, l, esc){ return "+(suggMise?'<div class=\"mise-sugg-hint\">" + esc(d.tools_page.mise_sugg_prefix) + "<b>'+suggMise+'€</b></div>':'')"; }},
      {find: "+'<div class=\"fg\"><label>MISE (€)</label><input type=\"number\" class=\"finput\" id=\"mise-'+m.id+'\" value=\"'+miseDefault+'\" style=\"width:80px\"></div>'",
       build: function(d, l, esc){ return "+'<div class=\"fg\"><label>" + esc(d.tools_page.modal_stake_label) + "</label><input type=\"number\" class=\"finput\" id=\"mise-'+m.id+'\" value=\"'+miseDefault+'\" style=\"width:80px\"></div>'"; }},
      {find: "+'<button class=\"btnvalid\" onclick=\"confirmFollow('+m.id+')\">✓ AJOUTER À MON SUIVI</button>'",
       build: function(d, l, esc){ return "+'<button class=\"btnvalid\" onclick=\"confirmFollow('+m.id+')\">" + esc(d.tools_page.modal_add_btn) + "</button>'"; }},
      {find: "+'<div class=\"fg\"><label>COTE VUE AILLEURS</label><input type=\"number\" step=\"0.01\" class=\"finput\" id=\"book-'+m.id+'\" placeholder=\"ex: 1.75\" oninput=\"calcEdge('+m.id+')\"></div>'",
       build: function(d, l, esc){
        var t = d.tools_page;
        return "+'<div class=\"fg\"><label>" + esc(t.lbl_odds_seen_elsewhere) + "</label><input type=\"number\" step=\"0.01\" class=\"finput\" id=\"book-'+m.id+'\" placeholder=\"" + esc(t.placeholder_odds_example) + "\" oninput=\"calcEdge('+m.id+')\"></div>'";
      }},
      {find: "+'<textarea class=\"ntextarea\" id=\"note-'+m.id+'\" placeholder=\"Pourquoi ce pari t\\'intéresse, ce que tu observes...\">'+(note||'')+'</textarea>'\n      +'<button class=\"btnvalid\" onclick=\"saveSelNote('+m.id+')\">✓ ENREGISTRER LA NOTE</button>'",
       build: function(d, l, esc){
        var t = d.tools_page;
        return "+'<textarea class=\"ntextarea\" id=\"note-'+m.id+'\" placeholder=\"" + esc(t.note_placeholder_sel) + "\">'+(note||'')+'</textarea>'\n      +'<button class=\"btnvalid\" onclick=\"saveSelNote('+m.id+')\">" + esc(t.btn_save_note) + "</button>'";
      }},
      {find: "el.innerHTML='Proba modèle <b>'+probIA+'%</b> vs proba cote <b>'+probImpl.toFixed(1)+'%</b> — avantage de <b style=\"color:'+(edge>0?'var(--green)':'var(--red)')+'\">'+(edge>0?'+':'')+edge+'%</b>. '+(edge>0?'Cote intéressante par rapport au modèle.':'Le modèle ne voit pas d\\'avantage à cette cote.');",
       build: function(d, l, esc){
        var t = d.tools_page;
        return "el.innerHTML='" + esc(t.edge_prefix) + "<b>'+probIA+'" + esc(t.edge_mid) + "<b>'+probImpl.toFixed(1)+'" + esc(t.edge_suffix) + "<b style=\"color:'+(edge>0?'var(--green)':'var(--red)')+'\">'+(edge>0?'+':'')+edge+'" + esc(t.edge_close) + "'+(edge>0?'" + esc(t.edge_positive) + "':'" + esc(t.edge_negative) + "');";
      }},
      {find: "showToast('Note enregistrée sur ce match');", build: function(d, l, esc){ return "showToast('" + esc(d.tools_page.toast_note_saved_sel) + "');"; }},
      {find: "if(PARIS.some(function(p){return p.fixtureId===id;})){showToast('Déjà suivi');return;}", build: function(d, l, esc){ return "if(PARIS.some(function(p){return p.fixtureId===id;})){showToast('" + esc(d.tools_page.toast_already_tracked) + "');return;}"; }},
      {find: "showToast('Ajouté à Mon suivi — se résoudra automatiquement');", build: function(d, l, esc){ return "showToast('" + esc(d.tools_page.toast_added_tracking) + "');"; }},
      {find: "'<div class=\"tstat\"><div class=\"tstat-lbl\">WINRATE</div><div class=\"tstat-val\" id=\"twr\">—</div></div>'\n    +'<div class=\"tstat\"><div class=\"tstat-lbl\">ROI</div><div class=\"tstat-val\" id=\"troi\">—</div></div>'\n    +'<div class=\"tstat\"><div class=\"tstat-lbl\">BILAN</div><div class=\"tstat-val cyan\" id=\"tbilan\">—</div></div>'\n    +'<div class=\"tstat\"><div class=\"tstat-lbl\">EN ATTENTE</div><div class=\"tstat-val\">'+pendingCount+'</div></div>';",
       build: function(d, l, esc){
        var t = d.tools_page;
        return "'<div class=\"tstat\"><div class=\"tstat-lbl\">" + esc(t.tstat_winrate) + "</div><div class=\"tstat-val\" id=\"twr\">—</div></div>'\n    +'<div class=\"tstat\"><div class=\"tstat-lbl\">" + esc(t.tstat_roi) + "</div><div class=\"tstat-val\" id=\"troi\">—</div></div>'\n    +'<div class=\"tstat\"><div class=\"tstat-lbl\">" + esc(t.tstat_balance) + "</div><div class=\"tstat-val cyan\" id=\"tbilan\">—</div></div>'\n    +'<div class=\"tstat\"><div class=\"tstat-lbl\">" + esc(t.tstat_pending) + "</div><div class=\"tstat-val\">'+pendingCount+'</div></div>';";
      }},
      {find: "?'<span class=\"result-lbl\" style=\"color:var(--muted)\">EN ATTENTE</span>'", build: function(d, l, esc){ return "?'<span class=\"result-lbl\" style=\"color:var(--muted)\">" + esc(d.tools_page.result_pending) + "</span>'"; }},
      {find: "resultHtml='<span class=\"result-lbl\" style=\"color:'+color+'\">'+(p.result==='win'?'GAGNÉ':'PERDU')+(p.score?' ('+p.score+')':'')+'</span>';",
       build: function(d, l, esc){
        var t = d.tools_page;
        return "resultHtml='<span class=\"result-lbl\" style=\"color:'+color+'\">'+(p.result==='win'?'" + esc(t.result_won) + "':'" + esc(t.result_lost) + "')+(p.score?' ('+p.score+')':'')+'</span>';";
      }},
      {find: "var srcTag=p.source==='auto'?'<span class=\"src-tag src-auto\">AUTO</span>':'<span class=\"src-tag src-manual\">✎ MANUEL</span>';",
       build: function(d, l, esc){
        var t = d.tools_page;
        return "var srcTag=p.source==='auto'?'<span class=\"src-tag src-auto\">" + esc(t.src_auto) + "</span>':'<span class=\"src-tag src-manual\">" + esc(t.src_manual) + "</span>';";
      }},
      {find: "+'<textarea class=\"ntextarea\" id=\"note-input-'+p.id+'\" placeholder=\"Ta note sur ce pari...\">'+p.note+'</textarea>'\n      +'<button class=\"btnvalid\" onclick=\"saveBetNote('+p.id+')\">✓ ENREGISTRER</button>'",
       build: function(d, l, esc){
        var t = d.tools_page;
        return "+'<textarea class=\"ntextarea\" id=\"note-input-'+p.id+'\" placeholder=\"" + esc(t.note_placeholder_bet) + "\">'+p.note+'</textarea>'\n      +'<button class=\"btnvalid\" onclick=\"saveBetNote('+p.id+')\">" + esc(t.btn_save) + "</button>'";
      }},
      {find: "'<div class=\"empty-hint\">Aucun pari suivi. Va dans Sélections et clique \"GÉRER\" sur une ligne pour commencer.</div>'",
       build: function(d, l, esc){ return "'<div class=\"empty-hint\">" + esc(d.tools_page.empty_no_bets) + "</div>'"; }},
      {find: "showToast('Note enregistrée sur ce pari');", build: function(d, l, esc){ return "showToast('" + esc(d.tools_page.toast_note_saved_bet) + "');"; }},
      {find: "if(!confirm('Supprimer ce pari de ton suivi ?'))return;", build: function(d, l, esc){ return "if(!confirm('" + esc(d.tools_page.confirm_delete_bet) + "'))return;"; }},
      {find: "btn.innerHTML='<span class=\"spin\"></span>SYNCHRO...';\n  status.innerHTML='Lecture de historique.json...';",
       build: function(d, l, esc){
        var t = d.tools_page;
        return "btn.innerHTML='<span class=\"spin\"></span>" + esc(t.sync_btn_syncing) + "';\n  status.innerHTML='" + esc(t.sync_reading) + "';";
      }},
      {find: "status.innerHTML=n>0?'<b>'+n+' pari(s)</b> résolu(s) automatiquement — 0 clic nécessaire.':'Rien de nouveau à résoudre pour l\\'instant.';\n    showToast(n>0?n+' résultat(s) synchronisés':'Aucun nouveau résultat');",
       build: function(d, l, esc){
        var t = d.tools_page;
        return "status.innerHTML=n>0?'" + esc(t.sync_result_prefix) + "'+n+'" + esc(t.sync_result_mid) + "':'" + esc(t.sync_nothing_new) + "';\n    showToast(n>0?n+'" + esc(t.toast_sync_suffix) + "':'" + esc(t.toast_sync_none) + "');";
      }},
      {find: "status.innerHTML='Synchronisation indisponible pour le moment — réessaie plus tard.';", build: function(d, l, esc){ return "status.innerHTML='" + esc(d.tools_page.sync_unavailable) + "';"; }},
      {find: "btn.innerHTML='<svg viewBox=\"0 0 24 24\" width=\"12\" height=\"12\" style=\"vertical-align:-2px;margin-right:4px;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;\"><path d=\"M23 4v6h-6\"/><path d=\"M1 20v-6h6\"/><path d=\"M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15\"/></svg>SYNCHRONISER';", build: function(d, l, esc){ return "btn.innerHTML='<svg viewBox=\"0 0 24 24\" width=\"12\" height=\"12\" style=\"vertical-align:-2px;margin-right:4px;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;\"><path d=\"M23 4v6h-6\"/><path d=\"M1 20v-6h6\"/><path d=\"M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15\"/></svg>' + esc(d.tools_page.sync_btn_default) + '';"; }},
      {find: "showToast('Pari ajouté depuis l\\'ajout rapide');", build: function(d, l, esc){ return "showToast('" + esc(d.tools_page.toast_modal_added) + "');"; }},
      {find: "+'<div class=\"bet-info\"><div class=\"mname\">'+esc(p.match)+srcTag+'</div><div class=\"mleague\">'+esc(p.market)+' · cote '+p.cote.toFixed(2)+' · '+p.mise+'€</div></div>'",
       build: function(d, l, esc){ return "+'<div class=\"bet-info\"><div class=\"mname\">'+esc(p.match)+srcTag+'</div><div class=\"mleague\">'+esc(p.market)+' · " + esc(d.tools_page.bet_odds_label) + "'+p.cote.toFixed(2)+' · '+p.mise+'€</div></div>'"; }},
      {find: "if(s.includes('over 2.5'))return 'Plus de 2,5 buts';\n  if(s.includes('under 2.5'))return 'Moins de 2,5 buts';\n  if(s.includes('over 1.5'))return 'Plus de 1,5 but';\n  if(s.includes('btts non')||s.includes('une équipe ne marque'))return 'Une équipe ne marque pas';\n  if(s.includes('btts')||s.includes('les deux équipes'))return 'Les deux équipes marquent';\n  if(s.includes('dc 1x')||s.includes('1x'))return 'DC 1X';\n  if(s.includes('dc x2')||s.includes('x2'))return 'DC X2';",
       build: function(d, l, esc){
        var n = d.market_names, nat = d.market_names_natural;
        return "if(s.includes('over 2.5'))return '" + esc(n.over25) + "';\n  if(s.includes('under 2.5'))return '" + esc(n.under25) + "';\n  if(s.includes('over 1.5'))return '" + esc(n.over15) + "';\n  if(s.includes('btts non')||s.includes('une équipe ne marque'))return '" + esc(nat.btts_non_natural) + "';\n  if(s.includes('btts')||s.includes('les deux équipes'))return '" + esc(nat.btts_oui_natural) + "';\n  if(s.includes('dc 1x')||s.includes('1x'))return '" + esc(n.dc1x) + "';\n  if(s.includes('dc x2')||s.includes('x2'))return '" + esc(n.dc_x2) + "';";
      }}
    ]
  },
  {
    file: "compte.html",
    noSitemap: true, // noindex
    metas: {
      fr: {title: "IASHARK — Mon Compte", description: "Gère ton compte, ton abonnement Outils et tes préférences IASHARK."},
      en: {title: "IASHARK — My Account", description: "Manage your account, your Tools subscription and your IASHARK preferences."},
      es: {title: "IASHARK — Mi Cuenta", description: "Gestiona tu cuenta, tu suscripción Herramientas y tus preferencias IASHARK."},
      de: {title: "IASHARK — Mein Konto", description: "Verwalte dein Konto, dein Tools-Abonnement und deine IASHARK-Einstellungen."},
      it: {title: "IASHARK — Il Mio Account", description: "Gestisci il tuo account, il tuo abbonamento Strumenti e le tue preferenze IASHARK."},
      pt: {title: "IASHARK — A Minha Conta", description: "Gere a tua conta, a tua subscrição Ferramentas e as tuas preferências IASHARK."}
    },
    replacements: [
      {find: '<div class="onboard-title">Bienvenue sur <span style="color:var(--cyan)">IASHARK</span> 🦈</div>',
       build: function(d, l, esc){ return '<div class="onboard-title">' + d.compte_page.onboarding_title_pre + ' <span style="color:var(--cyan)">IASHARK</span> 🦈</div>'; }},
      {find: "<div class=\"onboard-body\">Ton compte est prêt. Commence par le match du jour en accès gratuit, puis découvre l'espace Outils quand tu veux aller plus loin.</div>",
       build: function(d){ return '<div class="onboard-body">' + d.compte_page.onboarding_body + '</div>'; }},
      {find: '<a href="/" class="onboard-cta primary">VOIR LE MATCH DU JOUR →</a>', build: function(d){ return '<a href="/" class="onboard-cta primary">' + d.compte_page.onboarding_cta_home + '</a>'; }},
      {find: '<a href="/pro.html" class="onboard-cta">DÉCOUVRIR OUTILS →</a>', build: function(d){ return '<a href="/pro.html" class="onboard-cta">' + d.cta.discover_tools + '</a>'; }},
      {find: '<button class="onboard-dismiss" onclick="dismissOnboarding()">Masquer ce message</button>', build: function(d){ return '<button class="onboard-dismiss" onclick="dismissOnboarding()">' + d.compte_page.onboarding_dismiss + '</button>'; }},
      {find: '<span class="hdr-pill" id="hdrPill">MON COMPTE</span>', build: function(d){ return '<span class="hdr-pill" id="hdrPill">' + d.compte_page.hdr_pill_default + '</span>'; }},
      {find: '<div class="loading-lbl">VÉRIFICATION...</div>', build: function(d){ return '<div class="loading-lbl">' + d.compte_page.loading_verification + '</div>'; }},
      {find: '<div class="auth-title">Mon <span>Compte</span></div>', build: function(d, l, esc){
        var parts = d.auth.title.split(" ");
        var last = parts.pop();
        return '<div class="auth-title">' + (parts.join(" ") + " ") + '<span>' + last + '</span></div>';
      }},
      {find: '<div class="auth-sub">Accède à tes sélections Outils, ton tracker et tes statistiques personnalisées.</div>', build: function(d){ return '<div class="auth-sub">' + d.auth.subtitle + '</div>'; }},
      {find: '<button class="auth-tab active" id="tabLoginBtn" onclick="switchAuthTab(\'login\')">CONNEXION</button>', build: function(d){ return '<button class="auth-tab active" id="tabLoginBtn" onclick="switchAuthTab(\'login\')">' + d.auth.tab_login + '</button>'; }},
      {find: '<button class="auth-tab" id="tabSignupBtn" onclick="switchAuthTab(\'signup\')">INSCRIPTION</button>', build: function(d){ return '<button class="auth-tab" id="tabSignupBtn" onclick="switchAuthTab(\'signup\')">' + d.auth.tab_signup + '</button>'; }},
      {find: '<label>EMAIL</label>\n          <input type="email" class="form-input" id="loginEmail" placeholder="ton@email.com" autocomplete="email">',
       build: function(d){ return '<label>' + d.auth.email + '</label>\n          <input type="email" class="form-input" id="loginEmail" placeholder="' + d.compte_page.email_placeholder + '" autocomplete="email">'; }},
      {find: '<label>MOT DE PASSE</label>', build: function(d){ return '<label>' + d.auth.password + '</label>'; }},
      {find: '<button class="btn-primary" id="btnLogin" onclick="doLogin()">SE CONNECTER →</button>', build: function(d){ return '<button class="btn-primary" id="btnLogin" onclick="doLogin()">' + d.auth.login_btn + '</button>'; }},
      {find: '<div class="forgot-link" onclick="forgotPassword()">Mot de passe oublié ?</div>', build: function(d){ return '<div class="forgot-link" onclick="forgotPassword()">' + d.auth.forgot_password + '</div>'; }},
      {find: '<label>EMAIL</label>\n          <input type="email" class="form-input" id="signupEmail" placeholder="ton@email.com" autocomplete="email">',
       build: function(d){ return '<label>' + d.auth.email + '</label>\n          <input type="email" class="form-input" id="signupEmail" placeholder="' + d.compte_page.email_placeholder + '" autocomplete="email">'; }},
      {find: '<label>MOT DE PASSE (min. 8 caractères)</label>\n          <input type="password" class="form-input" id="signupPwd" placeholder="••••••••" autocomplete="new-password">',
       build: function(d){ return '<label>' + d.auth.password + ' (' + d.auth.min_chars + ')</label>\n          <input type="password" class="form-input" id="signupPwd" placeholder="••••••••" autocomplete="new-password">'; }},
      {find: '<label>CONFIRMER LE MOT DE PASSE</label>', build: function(d){ return '<label>' + d.auth.confirm_password + '</label>'; }},
      {find: '<button class="btn-primary" id="btnSignup" onclick="doSignup()">CRÉER MON COMPTE →</button>', build: function(d){ return '<button class="btn-primary" id="btnSignup" onclick="doSignup()">' + d.auth.signup_btn + '</button>'; }},
      {find: '<span class="ubadge free" id="planBadge">GRATUIT</span>', build: function(d){ return '<span class="ubadge free" id="planBadge">' + d.account.plan_free_badge + '</span>'; }},
      {find: "<span class=\"ubadge since\" id=\"sinceBadge\">MEMBRE DEPUIS —</span>", build: function(d){ return '<span class="ubadge since" id="sinceBadge">' + d.account.member_since + ' —</span>'; }},
      {find: '<div class="dash-card-title">MARCHÉS</div>', build: function(d){ return '<div class="dash-card-title">' + d.nav.markets + '</div>'; }},
      {find: '<div class="dash-card-val"><a href="/marches.html" style="color:var(--cyan);">VOIR →</a></div>', build: function(d){ return '<div class="dash-card-val"><a href="/marches.html" style="color:var(--cyan);">' + d.compte_page.dash_view + '</a></div>'; }},
      {find: '<div class="dash-card-title">ESPACE OUTILS</div>', build: function(d){ return '<div class="dash-card-title">' + d.account.dashboard_tools + '</div>'; }},
      {find: '<div class="dash-card-val"><a href="/pro.html" style="color:var(--amber);">ACCÈS →</a></div>', build: function(d){ return '<div class="dash-card-val"><a href="/pro.html" style="color:var(--amber);">' + d.compte_page.dash_access + '</a></div>'; }},
      {find: '<div class="section-title">ABONNEMENT</div>', build: function(d){ return '<div class="section-title">' + d.account.plan_section_title + '</div>'; }},
      {find: '<span class="plan-status free" id="planStatusTxt">Plan Gratuit</span>', build: function(d){ return '<span class="plan-status free" id="planStatusTxt">' + d.account.plan_free_status + '</span>'; }},
      {find: "<div class=\"plan-desc\" id=\"planDescTxt\">Tu utilises la version gratuite d'IASHARK — le match à la plus forte probabilité modèle du jour est accessible gratuitement.</div>",
       build: function(d){ return '<div class="plan-desc" id="planDescTxt">' + d.account.plan_free_desc + '</div>'; }},
      {find: '<div class="pro-feature"><span class="ck">＋</span> Toutes les sélections à forte probabilité modèle</div>', build: function(d){ return '<div class="pro-feature"><span class="ck">＋</span> ' + d.tools_page.pw_feat1_desc.replace("Les pronostics à plus forte", "Toutes les sélections à forte") + '</div>'; }},
      {find: '<div class="pro-feature"><span class="ck">＋</span> Historique complet et détaillé</div>', build: function(d, l, esc){
        var m = {en:"Full, detailed history",es:"Historial completo y detallado",de:"Vollständiger, detaillierter Verlauf",it:"Cronologia completa e dettagliata",pt:"Histórico completo e detalhado",fr:"Historique complet et détaillé"};
        return '<div class="pro-feature"><span class="ck">＋</span> ' + m[l] + '</div>';
      }},
      {find: '<div class="pro-feature"><span class="ck">＋</span> Analyses approfondies par match</div>', build: function(d, l, esc){
        var m = {en:"In-depth analysis per match",es:"Análisis en profundidad por partido",de:"Ausführliche Analysen pro Spiel",it:"Analisi approfondite per partita",pt:"Análises aprofundadas por jogo",fr:"Analyses approfondies par match"};
        return '<div class="pro-feature"><span class="ck">＋</span> ' + m[l] + '</div>';
      }},
      {find: '<a href="/pro.html" class="btn-amber" id="planCta">DÉCOUVRIR OUTILS →</a>', build: function(d){ return '<a href="/pro.html" class="btn-amber" id="planCta">' + d.cta.discover_tools + '</a>'; }},
      {find: '<div class="section-title">SÉCURITÉ</div>', build: function(d){ return '<div class="section-title">' + d.account.security_title + '</div>'; }},
      {find: "<button class=\"sec-form-toggle\" onclick=\"toggleSecPanel('pwd')\">Changer mon mot de passe <span>+</span></button>", build: function(d){ return "<button class=\"sec-form-toggle\" onclick=\"toggleSecPanel('pwd')\">" + d.account.change_password + " <span>+</span></button>"; }},
      {find: '<label>NOUVEAU MOT DE PASSE (min. 8 caractères)</label>', build: function(d){ return '<label>' + d.compte_page.new_password_label + ' (' + d.auth.min_chars + ')</label>'; }},
      {find: '<button class="btn-primary" id="btnChangePwd" onclick="changePassword()">METTRE À JOUR →</button>', build: function(d){ return '<button class="btn-primary" id="btnChangePwd" onclick="changePassword()">' + d.compte_page.update_btn + '</button>'; }},
      {find: "<button class=\"sec-form-toggle\" onclick=\"toggleSecPanel('email')\">Changer mon email <span>+</span></button>", build: function(d){ return "<button class=\"sec-form-toggle\" onclick=\"toggleSecPanel('email')\">" + d.account.change_email + " <span>+</span></button>"; }},
      {find: '<label>NOUVELLE ADRESSE EMAIL</label>\n          <input type="email" class="form-input" id="newEmail" placeholder="nouveau@email.com">',
       build: function(d){ return '<label>' + d.compte_page.new_email_label + '</label>\n          <input type="email" class="form-input" id="newEmail" placeholder="' + d.compte_page.new_email_placeholder + '">'; }},
      {find: '<button class="btn-primary" id="btnChangeEmail" onclick="changeEmail()">METTRE À JOUR →</button>', build: function(d){ return '<button class="btn-primary" id="btnChangeEmail" onclick="changeEmail()">' + d.compte_page.update_btn + '</button>'; }},
      {find: '<div class="section-title">AIDE &amp; SUPPORT</div>', build: function(d){ return '<div class="section-title">' + d.account.help_title + '</div>'; }},
      {find: '<a href="mailto:contact@iashark.com" class="help-row">Nous contacter <span class="arrow">→</span></a>', build: function(d){ return '<a href="mailto:contact@iashark.com" class="help-row">' + d.account.contact_us + ' <span class="arrow">→</span></a>'; }},
      {find: '<a href="/a-propos.html" class="help-row">Notre méthode <span class="arrow">→</span></a>', build: function(d){ return '<a href="/a-propos.html" class="help-row">' + d.account.our_method + ' <span class="arrow">→</span></a>'; }},
      {find: '<div class="section-title">MES DONNÉES</div>', build: function(d){ return '<div class="section-title">' + d.account.data_title + '</div>'; }},
      {find: '<div class="danger-txt">Télécharge une copie de tes données IASHARK (compte + historique de suivi local) au format JSON</div>',
       build: function(d){ return '<div class="danger-txt">' + d.account.export_desc + '</div>'; }},
      {find: '<button class="danger-btn" id="btnExport" onclick="exportMyData()" style="color:var(--cyan);border-color:var(--bc);">EXPORTER</button>',
       build: function(d){ return '<button class="danger-btn" id="btnExport" onclick="exportMyData()" style="color:var(--cyan);border-color:var(--bc);">' + d.account.export_btn + '</button>'; }},
      {find: '<div class="danger-txt">Demander la suppression de mon compte (traité manuellement sous 48h)</div>', build: function(d){ return '<div class="danger-txt">' + d.account.danger_delete_desc + '</div>'; }},
      {find: '<button class="danger-btn" onclick="requestDeletion()">DEMANDER</button>', build: function(d){ return '<button class="danger-btn" onclick="requestDeletion()">' + d.account.danger_delete_btn + '</button>'; }},
      {find: '<button class="btn-logout" onclick="doLogout()">SE DÉCONNECTER</button>', build: function(d){ return '<button class="btn-logout" onclick="doLogout()">' + d.cta.logout + '</button>'; }},
      {find:
        '    <div>⚠️ LE JEU PEUT ÊTRE DANGEREUX — JOUEZ RESPONSABLE · INTERDIT AUX MOINS DE 18 ANS</div>\n' +
        '    <div>Aide : <a href="https://www.joueurs-info-service.fr" style="color:rgba(34,211,238,0.4);text-decoration:none;">joueurs-info-service.fr</a> · 09 74 75 13 13</div>',
       build: function(d){
        var f = d.footer;
        return '    <div>⚠️ ' + f.disclaimer_warning + '</div>\n' +
          '    <div>' + f.disclaimer_help_label + ' <a href="https://www.joueurs-info-service.fr" style="color:rgba(34,211,238,0.4);text-decoration:none;">' + f.disclaimer_help_site + '</a> · ' + f.disclaimer_help_phone + '</div>';
      }},
      {find: '<div class="nav-lbl">ACCUEIL</div>', build: function(d){ return '<div class="nav-lbl">' + d.nav.home + '</div>'; }},
      {find: '<div class="nav-lbl">MARCHÉS</div>', build: function(d){ return '<div class="nav-lbl">' + d.nav.markets + '</div>'; }},
      {find: '<div class="nav-lbl">OUTILS</div>', build: function(d){ return '<div class="nav-lbl">' + d.nav.tools + '</div>'; }},
      {find: '<div class="nav-lbl">GUIDES</div>', build: function(d){ return '<div class="nav-lbl">' + d.nav.guides + '</div>'; }},
      {find: '<div class="nav-lbl">COMPTE</div>', build: function(d){ return '<div class="nav-lbl">' + d.nav.account + '</div>'; }},
      {find: "btn.disabled = true; btn.textContent = 'CONNEXION...';", build: function(d, l, esc){ return "btn.disabled = true; btn.textContent = '" + esc(d.compte_page.msg_connecting) + "';"; }},
      {find: "if(r.status===429){ showMsg(j.message||'Trop de tentatives.','error'); btn.disabled=false; btn.textContent='SE CONNECTER →'; return; }",
       build: function(d, l, esc){ return "if(r.status===429){ showMsg(j.message||'" + esc(d.auth_header.too_many_attempts) + "','error'); btn.disabled=false; btn.textContent='" + esc(d.auth.login_btn) + "'; return; }"; }},
      {find: "if(!r.ok) throw {message: j.msg||j.error_description||j.error||'Erreur de connexion'};", build: function(d, l, esc){ return "if(!r.ok) throw {message: j.msg||j.error_description||j.error||'" + esc(d.auth_header.generic_login_error) + "'};"; }},
      {find: "showMsg('Connexion réussie !','success');", build: function(d, l, esc){ return "showMsg('" + esc(d.compte_page.msg_login_success) + "','success');"; }},
      {find: "var msg = e.message||'Erreur de connexion';\n    if(msg.includes('Invalid login')) msg = 'Email ou mot de passe incorrect.';\n    if(msg.includes('Email not confirmed')) msg = 'Confirme ton email avant de te connecter.';",
       build: function(d, l, esc){
        var ah = d.auth_header;
        return "var msg = e.message||'" + esc(ah.generic_login_error) + "';\n    if(msg.includes('Invalid login')) msg = '" + esc(ah.invalid_login) + "';\n    if(msg.includes('Email not confirmed')) msg = '" + esc(ah.confirm_email) + "';";
      }},
      {find: "btn.disabled = false; btn.textContent = 'SE CONNECTER →';", build: function(d, l, esc){ return "btn.disabled = false; btn.textContent = '" + esc(d.auth.login_btn) + "';"; }},
      {find: "if(!email||!pwd){ showMsg('Remplis tous les champs.','error'); return; }\n  if(pwd.length<8){ showMsg('Le mot de passe doit contenir au moins 8 caractères.','error'); return; }\n  if(pwd!==pwd2){ showMsg('Les mots de passe ne correspondent pas.','error'); return; }",
       build: function(d, l, esc){
        var c = d.compte_page;
        return "if(!email||!pwd){ showMsg('" + esc(c.msg_fill_all_fields) + "','error'); return; }\n  if(pwd.length<8){ showMsg('" + esc(c.msg_password_min) + "','error'); return; }\n  if(pwd!==pwd2){ showMsg('" + esc(c.msg_passwords_mismatch) + "','error'); return; }";
      }},
      {find: "if(!email||!pwd){ showMsg('Remplis tous les champs.','error'); return; }\n  var btn = document.getElementById('btnLogin');",
       build: function(d, l, esc){ return "if(!email||!pwd){ showMsg('" + esc(d.compte_page.msg_fill_all_fields) + "','error'); return; }\n  var btn = document.getElementById('btnLogin');"; }},
      {find: "btn.disabled = true; btn.textContent = 'CRÉATION...';", build: function(d, l, esc){ return "btn.disabled = true; btn.textContent = '" + esc(d.compte_page.msg_creating) + "';"; }},
      {find: "showMsg('Compte créé ! Vérifie ton email pour confirmer ton inscription.','info');", build: function(d, l, esc){ return "showMsg('" + esc(d.compte_page.msg_account_created_check_email) + "','info');"; }},
      {find: "showMsg('Compte créé avec succès !','success');", build: function(d, l, esc){ return "showMsg('" + esc(d.compte_page.msg_account_created_success) + "','success');"; }},
      {find: "var msg = e.message||'Erreur lors de la création';\n    if(msg.includes('already registered')) msg = 'Cet email est déjà utilisé. Connecte-toi.';",
       build: function(d, l, esc){ var c = d.compte_page; return "var msg = e.message||'" + esc(c.msg_creation_error) + "';\n    if(msg.includes('already registered')) msg = '" + esc(c.msg_already_registered) + "';"; }},
      {find: "btn.disabled = false; btn.textContent = 'CRÉER MON COMPTE →';", build: function(d, l, esc){ return "btn.disabled = false; btn.textContent = '" + esc(d.auth.signup_btn) + "';"; }},
      {find: "if(!email){ showMsg('Entre ton email ci-dessus pour réinitialiser ton mot de passe.','info'); return; }", build: function(d, l, esc){ return "if(!email){ showMsg('" + esc(d.compte_page.msg_enter_email_reset) + "','info'); return; }"; }},
      {find: "showMsg('Email de réinitialisation envoyé à '+email,'success');", build: function(d, l, esc){ return "showMsg('" + esc(d.compte_page.msg_reset_sent_prefix) + "'+email,'success');"; }},
      {find: "showMsg('Erreur : '+(e.message||'réessaie'),'error');", count: 1, build: function(d, l, esc){ return "showMsg('" + esc(d.tools_page.capital_msg_error_prefix) + "'+(e.message||'réessaie'),'error');"; }},
      {find: "document.getElementById('hdrPill').textContent = 'MON COMPTE';", build: function(d, l, esc){ return "document.getElementById('hdrPill').textContent = '" + esc(d.compte_page.hdr_pill_default) + "';"; }},
      {find: "msgEl.textContent = 'Le mot de passe doit contenir au moins 8 caractères.';", build: function(d, l, esc){ return "msgEl.textContent = '" + esc(d.compte_page.msg_password_min) + "';"; }},
      {find: "btn.disabled = true; btn.textContent = 'MISE À JOUR...';", count: 2, build: function(d, l, esc){ return "btn.disabled = true; btn.textContent = '" + esc(d.compte_page.update_btn_loading) + "';"; }},
      {find: "msgEl.textContent = 'Mot de passe mis à jour avec succès.';", build: function(d, l, esc){ return "msgEl.textContent = '" + esc(d.compte_page.msg_password_updated) + "';"; }},
      {find: "msgEl.textContent = 'Erreur : '+(e.message||'réessaie');", count: 3, build: function(d, l, esc){ return "msgEl.textContent = '" + esc(d.tools_page.capital_msg_error_prefix) + "'+(e.message||'réessaie');"; }},
      {find: "btn.disabled = false; btn.textContent = 'METTRE À JOUR →';", count: 2, build: function(d, l, esc){ return "btn.disabled = false; btn.textContent = '" + esc(d.compte_page.update_btn) + "';"; }},
      {find: "msgEl.textContent = 'Entre une adresse email valide.';", build: function(d, l, esc){ return "msgEl.textContent = '" + esc(d.compte_page.msg_invalid_email) + "';"; }},
      {find: "msgEl.textContent = 'Un email de confirmation a été envoyé à '+email+'. Clique sur le lien pour valider le changement.';",
       build: function(d, l, esc){ var c = d.compte_page; return "msgEl.textContent = '" + esc(c.msg_email_confirmation_sent_prefix) + "'+email+'" + esc(c.msg_email_confirmation_sent_suffix) + "';"; }},
      {find: "btn.disabled = true; btn.textContent = 'EXPORT...';", build: function(d, l, esc){ return "btn.disabled = true; btn.textContent = '" + esc(d.compte_page.export_loading) + "';"; }},
      {find: "note: 'tracked_bets_local provient du suivi de paris stocke localement dans ton navigateur (jamais envoye a IASHARK) - il ne sera present que si tu exportes depuis le meme navigateur/appareil que celui utilise pour le suivi.'",
       build: function(d, l, esc){ return "note: '" + esc(d.compte_page.export_note) + "'"; }},
      {find: "msgEl.textContent = 'Export téléchargé.';", build: function(d, l, esc){ return "msgEl.textContent = '" + esc(d.compte_page.export_success) + "';"; }},
      {find: "btn.disabled = false; btn.textContent = 'EXPORTER';", build: function(d, l, esc){ return "btn.disabled = false; btn.textContent = '" + esc(d.account.export_btn) + "';"; }},
      {find: "var subject = encodeURIComponent('Demande de suppression de compte IASHARK');\n  var body = encodeURIComponent('Bonjour,\\n\\nJe souhaite supprimer mon compte IASHARK associe a l\\'adresse : '+currentUser.email+'\\n\\nMerci de confirmer la suppression.');",
       build: function(d, l, esc){
        var c = d.compte_page;
        return "var subject = encodeURIComponent('" + esc(c.deletion_subject) + "');\n  var body = encodeURIComponent('" + esc(c.deletion_body_greeting) + "'+currentUser.email+'" + esc(c.deletion_body_closing) + "');";
      }},
      {find: "document.getElementById('hdrPill').textContent = 'CONNECTÉ';", build: function(d, l, esc){ return "document.getElementById('hdrPill').textContent = '" + esc(d.compte_page.hdr_pill_connected) + "';"; }},
      {find: "var mois = ['JANV.','FÉVR.','MARS','AVR.','MAI','JUIN','JUIL.','AOÛT','SEPT.','OCT.','NOV.','DÉC.'];\n    document.getElementById('sinceBadge').textContent = 'MEMBRE DEPUIS '+mois[d.getMonth()]+' '+d.getFullYear();",
       build: function(d, l, esc){
        var months = d.compte_page.months.map(function(mo){ return "'" + esc(mo) + "'"; }).join(",");
        return "var mois = [" + months + "];\n    document.getElementById('sinceBadge').textContent = '" + esc(d.account.member_since) + " '+mois[d.getMonth()]+' '+d.getFullYear();";
      }},
      {find: "document.getElementById('planBadge').textContent = role==='admin'?'ADMIN':(isPro?'OUTILS':'GRATUIT');",
       build: function(d, l, esc){ return "document.getElementById('planBadge').textContent = role==='admin'?'" + esc(d.compte_page.role_admin) + "':(isPro?'" + esc(d.nav.tools) + "':'" + esc(d.account.plan_free_badge) + "');"; }},
      {find: "document.getElementById('planStatusTxt').textContent = role==='admin'?'Administrateur':(isPro?'Plan Outils':'Plan Gratuit');",
       build: function(d, l, esc){ var a = d.account, c = d.compte_page; return "document.getElementById('planStatusTxt').textContent = role==='admin'?'" + esc(c.role_admin_full) + "':(isPro?'" + esc(a.plan_pro_status) + "':'" + esc(a.plan_free_status) + "');"; }},
      {find: "document.getElementById('planDescTxt').textContent = 'Ton abonnement Outils est actif — tu as accès à toutes les sélections à forte probabilité modèle.';",
       build: function(d, l, esc){ return "document.getElementById('planDescTxt').textContent = '" + esc(d.account.plan_pro_desc) + "';"; }},
      {find: "cta.textContent = 'VOIR MON ESPACE OUTILS →';", build: function(d, l, esc){ return "cta.textContent = '" + esc(d.cta.view_full_tools) + "';"; }}
    ]
  },
  {
    /* landing.html : page marketing autonome, pas de <script> du tout (pur
       HTML/CSS) - aucune de ces regles n'a besoin de esc() JS, tout est du
       texte HTML brut. Utilise des URLs absolues (https://iashark.com/...)
       plutot que racine-relatives - voir rewriteInternalLinks() dans
       build-locales.js, etendu pour gerer aussi ce format. */
    file: "landing.html",
    noSitemap: true, // noindex (landing publicitaire)
    metas: {
      fr: {title: "IASHARK — Le modèle qui lit le match avant qu'il commence", description: "Buts attendus, probabilité de chaque marché, écart avec la cote : IASHARK analyse chaque match avec un vrai modèle statistique. Un match gratuit chaque jour."},
      en: {title: "IASHARK — The model that reads the match before kickoff", description: "Expected goals, probability of every market, gap with the odds: IASHARK analyses every match with a real statistical model. One free match every day."},
      es: {title: "IASHARK — El modelo que lee el partido antes de que empiece", description: "Goles esperados, probabilidad de cada mercado, diferencia con la cuota: IASHARK analiza cada partido con un modelo estadístico real. Un partido gratis cada día."},
      de: {title: "IASHARK — Das Modell, das das Spiel vor dem Anpfiff liest", description: "Erwartete Tore, Wahrscheinlichkeit jedes Marktes, Abstand zur Quote: IASHARK analysiert jedes Spiel mit einem echten statistischen Modell. Ein kostenloses Spiel jeden Tag."},
      it: {title: "IASHARK — Il modello che legge la partita prima del fischio d'inizio", description: "Gol attesi, probabilità di ogni mercato, scarto con la quota: IASHARK analizza ogni partita con un vero modello statistico. Una partita gratis ogni giorno."},
      pt: {title: "IASHARK — O modelo que lê o jogo antes do apito inicial", description: "Golos esperados, probabilidade de cada mercado, diferença face à odd: o IASHARK analisa cada jogo com um verdadeiro modelo estatístico. Um jogo grátis todos os dias."}
    },
    replacements: [
      {find: '<a href="https://iashark.com" class="btn-nav">VOIR LE SITE →</a>', build: function(d){ return '<a href="https://iashark.com" class="btn-nav">' + d.landing_page.nav_cta + '</a>'; }},
      {find: '<span class="dot"></span> MODÈLE STATISTIQUE · FOOTBALL', build: function(d){ return '<span class="dot"></span> ' + d.landing_page.eyebrow; }},
      {find: '<h1 class="reveal" style="animation-delay:.1s">Aucune émotion.<br><b>Que des probabilités.</b></h1>', build: function(d){ var h = d.home_page; return '<h1 class="reveal" style="animation-delay:.1s">' + h.hero_line1 + '<br><b>' + h.hero_line2 + '</b></h1>'; }},
      {find: '<a href="https://iashark.com" class="btn-primary">VOIR LE MATCH GRATUIT DU JOUR</a>', build: function(d){ return '<a href="https://iashark.com" class="btn-primary">' + d.landing_page.hero_cta + '</a>'; }},
      {find: '<div class="cta-note">Sans carte bancaire · <b>1 analyse offerte chaque jour</b></div>', build: function(d){ var l = d.landing_page; return '<div class="cta-note">' + l.hero_cta_note_pre + '<b>' + l.hero_cta_note_b + '</b></div>'; }},
      {find: '<div class="sec-lbl">LA MÉTHODE</div>', build: function(d){ return '<div class="sec-lbl">' + d.landing_page.lbl_method + '</div>'; }},
      {find: '<div class="sec-lbl">EN PRATIQUE</div>', build: function(d){ return '<div class="sec-lbl">' + d.landing_page.lbl_practice + '</div>'; }},
      {find: '<h2 class="sec-title">De la donnée brute au <b>signal exploitable.</b></h2>', build: function(d){ var l = d.landing_page; return '<h2 class="sec-title">' + l.title_practice_pre + '<b>' + l.title_practice_b + '</b></h2>'; }},
      {find: '<div class="step-title">Tu reçois le signal</div><div class="step-desc">Une fiche claire par match : probabilité, niveau de fiabilité, et le marché où le modèle détecte un écart avec le marché réel.</div>',
       build: function(d){ var l = d.landing_page; return '<div class="step-title">' + l.step3_title + '</div><div class="step-desc">' + l.step3_desc + '</div>'; }},
      {find: '<div class="sec-lbl">L\'ACCÈS</div>', build: function(d){ return '<div class="sec-lbl">' + d.landing_page.lbl_access + '</div>'; }},
      {find: '<h2 class="sec-title">Commence gratuitement. <b>Passe à Pro</b> quand tu veux tout voir.</h2>', build: function(d){ var l = d.landing_page; return '<h2 class="sec-title">' + l.title_access_pre + '<b>' + l.title_access_b + '</b>' + l.title_access_post + '</h2>'; }},
      {find: '<div class="plan-name">GRATUIT</div>', build: function(d){ return '<div class="plan-name">' + d.landing_page.plan_free_name + '</div>'; }},
      {find: '<div class="plan-price">0€</div>', build: function(d){ return '<div class="plan-price">' + d.landing_page.plan_free_price + '</div>'; }},
      {find: '1 analyse complète offerte chaque jour', build: function(d){ return d.landing_page.plan_free_feat1; }},
      {find: "<li>Accès à l'historique de performance</li>", build: function(){ return ''; } /* retire : aucun historique / track record sur le site public (decision 2026-09-13) */},
      {find: 'Notre méthode expliquée en détail', build: function(d){ return d.landing_page.plan_free_feat3; }},
      {find: '<a href="https://iashark.com" class="plan-cta free">COMMENCER</a>', build: function(d){ return '<a href="https://iashark.com" class="plan-cta free">' + d.landing_page.plan_free_cta + '</a>'; }},
      {find: "content:'RECOMMANDÉ';", build: function(d){ return "content:'" + d.landing_page.plan_pro_badge + "';"; }},
      {find: '<div class="plan-name">PRO</div>', build: function(d){ return '<div class="plan-name">' + d.landing_page.plan_pro_name + '</div>'; }},
      {find: '<div class="plan-price">Gratuit<span>les 3 premiers jours</span></div>', build: function(d){ var l = d.landing_page; return '<div class="plan-price">' + l.plan_pro_price_pre + '<span>' + l.plan_pro_price_span + '</span></div>'; }},
      {find: '<div class="plan-trial">Puis 19,95€/mois — résiliable à tout moment</div>', build: function(d){ return '<div class="plan-trial">' + d.landing_page.plan_pro_trial + '</div>'; }},
      {find: 'Toutes les analyses, tous les championnats', build: function(d){ return d.landing_page.plan_pro_feat1; }},
      {find: 'Détecteur d’écarts du jour sur les matchs réels', build: function(d){ return d.landing_page.plan_pro_feat2; }},
      {find: 'Journal des décisions synchronisé', build: function(d){ return d.landing_page.plan_pro_feat3; }},
      {find: 'Résiliable à tout moment', build: function(d){ return d.landing_page.plan_pro_feat4; }},
      {find: '<a href="https://iashark.com/pro.html" class="plan-cta pro">DÉBLOQUER PRO</a>', build: function(d){ return '<a href="https://iashark.com/pro.html" class="plan-cta pro">' + d.landing_page.plan_pro_cta + '</a>'; }},
      {find: '<h2>Le prochain match a déjà <b>un signal.</b></h2>', build: function(d){ var l = d.landing_page; return '<h2>' + l.final_title_pre + '<b>' + l.final_title_b + '</b></h2>'; }},
      {find: "<p>Va le voir, c'est gratuit.</p>", build: function(d){ return '<p>' + d.landing_page.final_sub + '</p>'; }},
      {find: '<a href="https://iashark.com" class="btn-primary">VOIR LE MATCH DU JOUR</a>', build: function(d){ return '<a href="https://iashark.com" class="btn-primary">' + d.landing_page.final_cta + '</a>'; }},
      {find: '<div>⚠️ INFORMATION À VISÉE STATISTIQUE — NE CONSTITUE PAS UN CONSEIL DE PARI · INTERDIT AUX MOINS DE 18 ANS</div>', build: function(d){ return '<div>⚠️ ' + d.landing_page.foot_disclaimer + '</div>'; }},
      {find: '<div>Aide : <a href="https://www.joueurs-info-service.fr">joueurs-info-service.fr</a> · 09 74 75 13 13</div>',
       build: function(d){ return '<div>' + d.landing_page.foot_help_label + ' <a href="https://www.joueurs-info-service.fr">' + d.footer.disclaimer_help_site + '</a> · ' + d.footer.disclaimer_help_phone + '</div>'; }},
      {find: '<a href="https://iashark.com/mentions-legales.html">Mentions légales</a>', build: function(d){ return '<a href="https://iashark.com/mentions-legales.html">' + d.footer.mentions_legales + '</a>'; }},
      {find: '<a href="https://iashark.com/cgv.html">CGV</a>', build: function(d){ return '<a href="https://iashark.com/cgv.html">' + d.footer.cgv + '</a>'; }},
      {find: '<a href="https://iashark.com/confidentialite.html">Confidentialité</a>', build: function(d){ return '<a href="https://iashark.com/confidentialite.html">' + d.footer.confidentialite + '</a>'; }}
    ]
  },
  // --- Pages ajoutees au generateur GEO (2026-09-13) : shells traduits au
  // runtime (data-i18n / I18N.t) par leurs propres scripts - aucune regle de
  // substitution. Titre/description : i18n/dict/<locale>.json#geo.meta.<page>
  // (i18n/parts/geo.<locale>.json). noSitemap = page noindex.
  {file: "joueur.html", noSitemap: true},
  {file: "connexion.html", noSitemap: true},
  {file: "inscription.html", noSitemap: true},
  {file: "mot-de-passe-oublie.html", noSitemap: true},
  {file: "reinitialiser-mot-de-passe.html", noSitemap: true},
  {file: "a-propos.html"},
  {file: "abonnement.html"},
  {file: "exemple-analyse.html"},
  {file: "checkout-annule.html", noSitemap: true},
  {file: "checkout-succes.html", noSitemap: true},
  {file: "404.html", noSitemap: true}
];

module.exports = PAGES;
