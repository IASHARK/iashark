// ═══════════════════════════════════════════════════════
// DONNÉES STATIQUES COUPE DU MONDE 2026
// Liste exacte des 48 équipes qualifiées (source officielle)
// ═══════════════════════════════════════════════════════

const WC2026_STADIUMS = {
  'MetLife Stadium':         { lat: 40.8135, lng: -74.0745, tz: 0,  alt: 2,    city: 'New York/NJ',   country: 'USA' },
  'AT&T Stadium':            { lat: 32.7480, lng: -97.0929, tz: -1, alt: 186,  city: 'Dallas',        country: 'USA' },
  'SoFi Stadium':            { lat: 33.9535, lng: -118.3392,tz: -3, alt: 30,   city: 'Los Angeles',   country: 'USA' },
  "Levi's Stadium":          { lat: 37.4032, lng: -121.9698,tz: -3, alt: 12,   city: 'San Francisco', country: 'USA' },
  'Mercedes-Benz Stadium':   { lat: 33.7554, lng: -84.4010, tz: 0,  alt: 320,  city: 'Atlanta',       country: 'USA' },
  'Gillette Stadium':        { lat: 42.0909, lng: -71.2643, tz: 0,  alt: 16,   city: 'Boston',        country: 'USA' },
  'NRG Stadium':             { lat: 29.6847, lng: -95.4107, tz: -1, alt: 15,   city: 'Houston',       country: 'USA' },
  'Arrowhead Stadium':       { lat: 39.0490, lng: -94.4839, tz: -1, alt: 270,  city: 'Kansas City',   country: 'USA' },
  'Hard Rock Stadium':       { lat: 25.9580, lng: -80.2389, tz: 0,  alt: 2,    city: 'Miami',         country: 'USA' },
  'Lincoln Financial Field': { lat: 39.9008, lng: -75.1675, tz: 0,  alt: 8,    city: 'Philadelphia',  country: 'USA' },
  'Lumen Field':             { lat: 47.5952, lng: -122.3316,tz: -3, alt: 5,    city: 'Seattle',       country: 'USA' },
  'BC Place':                { lat: 49.2767, lng: -123.1118,tz: -3, alt: 5,    city: 'Vancouver',     country: 'Canada' },
  'BMO Field':               { lat: 43.6333, lng: -79.4186, tz: 0,  alt: 76,   city: 'Toronto',       country: 'Canada' },
  'Estadio Azteca':          { lat: 19.3028, lng: -99.1509, tz: -1, alt: 2240, city: 'Mexico City',   country: 'Mexico' },
  'Estadio BBVA':            { lat: 25.6694, lng: -100.2436,tz: -1, alt: 540,  city: 'Monterrey',     country: 'Mexico' },
  'Estadio Akron':           { lat: 20.6719, lng: -103.4680,tz: -2, alt: 1566, city: 'Guadalajara',   country: 'Mexico' },
};

// Équipes acclimatées à l'altitude
const ALTITUDE_ADAPTED = ['Mexico','Argentina','Colombia','Ecuador','Bolivia','Peru','Venezuela','Paraguay','Uruguay','Brazil'];

// ── 48 ÉQUIPES QUALIFIÉES (groupes officiels) ─────────
// Groupe A : Mexique, Afrique du Sud, Corée du Sud, Rép. tchèque
// Groupe B : Canada, Bosnie-Herzégovine, Qatar, Suisse
// Groupe C : Brésil, Maroc, Haïti, Écosse
// Groupe D : États-Unis, Paraguay, Australie, Turquie
// Groupe E : Allemagne, Curaçao, Côte d'Ivoire, Équateur
// Groupe F : Pays-Bas, Japon, Suède, Tunisie
// Groupe G : Belgique, Égypte, Iran, Nouvelle-Zélande
// Groupe H : Espagne, Cap-Vert, Arabie saoudite, Uruguay
// Groupe I : France, Sénégal, Irak, Norvège
// Groupe J : Argentine, Algérie, Autriche, Jordanie
// Groupe K : Portugal, RD Congo, Ouzbékistan, Colombie
// Groupe L : Angleterre, Croatie, Ghana, Panama

const FIFA_POINTS = {
  // Groupe A
  'Mexico':           1682, 'South Africa':     1487,
  'South Korea':      1619, 'Czech Republic':   1534,
  // Groupe B
  'Canada':           1571, 'Bosnia':           1498,
  'Qatar':            1414, 'Switzerland':      1654,
  // Groupe C
  'Brazil':           1791, 'Morocco':          1714,
  'Haiti':            1276, 'Scotland':         1401,
  // Groupe D
  'USA':              1690, 'Paraguay':         1476,
  'Australia':        1627, 'Turkey':           1608,
  // Groupe E
  'Germany':          1729, 'Curacao':          1298,
  'Ivory Coast':      1408, 'Ecuador':          1601,
  // Groupe F
  'Netherlands':      1735, 'Japan':            1708,
  'Sweden':           1598, 'Tunisia':          1485,
  // Groupe G
  'Belgium':          1742, 'Egypt':            1514,
  'Iran':             1594, 'New Zealand':      1421,
  // Groupe H
  'Spain':            1833, 'Cape Verde':       1254,
  'Saudi Arabia':     1578, 'Uruguay':          1695,
  // Groupe I
  'France':           1851, 'Senegal':          1671,
  'Iraq':             1445, 'Norway':           1612,
  // Groupe J
  'Argentina':        1885, 'Algeria':          1521,
  'Austria':          1641, 'Jordan':           1398,
  // Groupe K
  'Portugal':         1764, 'DR Congo':         1468,
  'Uzbekistan':       1478, 'Colombia':         1703,
  // Groupe L
  'England':          1807, 'Croatia':          1668,
  'Ghana':            1445, 'Panama':           1458,
};

const SQUAD_VALUE = {
  // Top tier
  'France':           1180, 'England':          1050, 'Brazil':           980,
  'Spain':             920, 'Germany':           870, 'Portugal':         820,
  'Netherlands':       750, 'Argentina':         720, 'Belgium':          620,
  // Tier 2
  'USA':               480, 'Colombia':          310, 'Uruguay':          320,
  'Denmark':           300, 'Croatia':           280, 'Switzerland':      270,
  'Morocco':           260, 'Japan':             240, 'Norway':           230,
  'South Korea':       210, 'Turkey':            200, 'Sweden':           195,
  'Austria':           170, 'Mexico':            160, 'Australia':        110,
  // Tier 3
  'Ecuador':           120, 'Senegal':           115, 'Ivory Coast':      290,
  'Ukraine':           105, 'Ghana':             95,  'Czech Republic':   95,
  'Scotland':          180, 'Serbia':            180, 'Bosnia':           85,
  'Tunisia':           80,  'Iran':              80,  'Canada':           75,
  'Saudi Arabia':      70,  'Egypt':             65,  'Algeria':          62,
  'Cameroon':          60,  'Nigeria':           55,  'Uzbekistan':       52,
  'DR Congo':          48,  'Jordan':            35,  'Iraq':             38,
  'South Africa':      45,  'Paraguay':          42,  'Venezuela':        40,
  'Panama':            35,  'Costa Rica':        30,  'Qatar':            25,
  'Jamaica':           22,  'New Zealand':       18,  'Cape Verde':       15,
  'Curacao':           8,   'Haiti':             10,
};

const TOP5_DENSITY = {
  'France':           92, 'England':          95, 'Portugal':         88,
  'Spain':            85, 'Germany':          82, 'Belgium':          90,
  'Netherlands':      78, 'Brazil':           72, 'Argentina':        68,
  'Croatia':          75, 'Switzerland':      65, 'Norway':           70,
  'Turkey':           60, 'Sweden':           58, 'Austria':          62,
  'Morocco':          62, 'Senegal':          58, 'Ivory Coast':      48,
  'Japan':            45, 'South Korea':      42, 'Colombia':         40,
  'Uruguay':          38, 'Ecuador':          25, 'Mexico':           22,
  'USA':              35, 'Canada':           40, 'Australia':        45,
  'Ghana':            50, 'Tunisia':          35, 'Algeria':          42,
  'Saudi Arabia':     10, 'Iran':              8, 'Egypt':            15,
  'South Africa':     20, 'Paraguay':         18, 'Bosnia':           38,
  'Panama':           12, 'Qatar':             5, 'New Zealand':      20,
  'Haiti':             8, 'Cape Verde':       55, 'Scotland':         65,
  'Czech Republic':   58, 'Iraq':             12, 'Jordan':           10,
  'DR Congo':         25, 'Uzbekistan':       15, 'Curacao':          30,
};

const QUALS_XG = {
  // Groupe A
  'Mexico':           { xg_for: 1.38, xg_against: 0.95 },
  'South Africa':     { xg_for: 1.15, xg_against: 1.05 },
  'South Korea':      { xg_for: 1.35, xg_against: 0.88 },
  'Czech Republic':   { xg_for: 1.42, xg_against: 0.95 },
  // Groupe B
  'Canada':           { xg_for: 1.44, xg_against: 0.98 },
  'Bosnia':           { xg_for: 1.32, xg_against: 1.02 },
  'Qatar':            { xg_for: 0.98, xg_against: 1.22 },
  'Switzerland':      { xg_for: 1.58, xg_against: 0.74 },
  // Groupe C
  'Brazil':           { xg_for: 1.87, xg_against: 0.94 },
  'Morocco':          { xg_for: 1.45, xg_against: 0.61 },
  'Haiti':            { xg_for: 0.92, xg_against: 1.28 },
  'Scotland':         { xg_for: 1.48, xg_against: 0.91 },
  // Groupe D
  'USA':              { xg_for: 1.54, xg_against: 0.92 },
  'Paraguay':         { xg_for: 1.22, xg_against: 0.98 },
  'Australia':        { xg_for: 1.32, xg_against: 0.98 },
  'Turkey':           { xg_for: 1.48, xg_against: 0.95 },
  // Groupe E
  'Germany':          { xg_for: 2.08, xg_against: 0.75 },
  'Curacao':          { xg_for: 0.95, xg_against: 1.25 },
  'Ivory Coast':      { xg_for: 1.42, xg_against: 0.85 },
  'Ecuador':          { xg_for: 1.28, xg_against: 0.91 },
  // Groupe F
  'Netherlands':      { xg_for: 1.98, xg_against: 0.88 },
  'Japan':            { xg_for: 1.62, xg_against: 0.78 },
  'Sweden':           { xg_for: 1.55, xg_against: 0.88 },
  'Tunisia':          { xg_for: 1.12, xg_against: 0.98 },
  // Groupe G
  'Belgium':          { xg_for: 1.76, xg_against: 0.99 },
  'Egypt':            { xg_for: 1.31, xg_against: 0.78 },
  'Iran':             { xg_for: 1.21, xg_against: 0.88 },
  'New Zealand':      { xg_for: 1.12, xg_against: 1.08 },
  // Groupe H
  'Spain':            { xg_for: 2.28, xg_against: 0.71 },
  'Cape Verde':       { xg_for: 1.18, xg_against: 0.95 },
  'Saudi Arabia':     { xg_for: 1.18, xg_against: 1.02 },
  'Uruguay':          { xg_for: 1.48, xg_against: 0.79 },
  // Groupe I
  'France':           { xg_for: 2.41, xg_against: 0.68 },
  'Senegal':          { xg_for: 1.42, xg_against: 0.82 },
  'Iraq':             { xg_for: 1.08, xg_against: 1.12 },
  'Norway':           { xg_for: 1.72, xg_against: 0.85 },
  // Groupe J
  'Argentina':        { xg_for: 1.92, xg_against: 0.85 },
  'Algeria':          { xg_for: 1.28, xg_against: 0.92 },
  'Austria':          { xg_for: 1.68, xg_against: 0.91 },
  'Jordan':           { xg_for: 1.05, xg_against: 1.15 },
  // Groupe K
  'Portugal':         { xg_for: 2.35, xg_against: 0.91 },
  'DR Congo':         { xg_for: 1.22, xg_against: 0.98 },
  'Uzbekistan':       { xg_for: 1.31, xg_against: 0.95 },
  'Colombia':         { xg_for: 1.71, xg_against: 0.88 },
  // Groupe L
  'England':          { xg_for: 2.15, xg_against: 0.82 },
  'Croatia':          { xg_for: 1.55, xg_against: 0.82 },
  'Ghana':            { xg_for: 1.28, xg_against: 1.05 },
  'Panama':           { xg_for: 1.08, xg_against: 1.12 },
};

const WC_EXPERIENCE = {
  'Brazil':           20, 'Mexico':           20, 'Argentina':        19,
  'France':           18, 'Uruguay':          18, 'Croatia':          17,
  'Germany':          16, 'Belgium':          16, 'Spain':            15,
  'Iran':             15, 'Portugal':         14, 'Japan':            14,
  'Scotland':         13, 'South Korea':      13, 'Senegal':          11,
  'Netherlands':      11, 'Poland':           11, 'Saudi Arabia':     12,
  'Morocco':          12, 'Switzerland':      12, 'Denmark':          10,
  'Ivory Coast':      10, 'Colombia':         10, 'Nigeria':           9,
  'Serbia':            8, 'Egypt':             8, 'Ecuador':           8,
  'USA':               8, 'South Africa':      5, 'Scotland':          5,
  'Turkey':            6, 'Czech Republic':    8, 'Algeria':           6,
  'Croatia':          17, 'Australia':        10, 'Norway':            5,
  'Ghana':             6, 'Tunisia':           6, 'DR Congo':          4,
  'Austria':           5, 'Sweden':            8, 'Bosnia':            2,
  'Panama':            3, 'Canada':            4, 'Cape Verde':        3,
  'New Zealand':       3, 'Qatar':             5, 'Paraguay':          8,
  'Venezuela':         4, 'Costa Rica':        7, 'Jamaica':           2,
  'Haiti':             2, 'Curacao':           0, 'Uzbekistan':        0,
  'Jordan':            0, 'Iraq':              2,
};

// Bonus pays hôte
const HOME_BONUS = {
  'Mexico': 8,
  'USA':    5,
  'Canada': 3,
};

module.exports = {
  WC2026_STADIUMS, FIFA_POINTS, SQUAD_VALUE, TOP5_DENSITY,
  QUALS_XG, WC_EXPERIENCE, HOME_BONUS, ALTITUDE_ADAPTED
};
