import type {MatchCardProps} from "./Composition";
export const generatedMatchProps = {
  "homeTeam": "Real Madrid",
  "awayTeam": "Inter",
  "homeLogo": "logos/real-madrid.png",
  "awayLogo": "logos/inter.png",
  "goals": [
    {
      "minute": 26,
      "player": "A. Diouf",
      "side": "away"
    },
    {
      "minute": 36,
      "player": "Kylian Mbappé",
      "side": "home"
    },
    {
      "minute": 50,
      "player": "Kylian Mbappé",
      "side": "home"
    },
    {
      "minute": 66,
      "player": "Lautaro Martínez",
      "side": "away"
    }
  ],
  "accentColor": "#08d9ff"
} satisfies MatchCardProps;
