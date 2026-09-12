import type {MatchCardProps} from "./Composition";
export const generatedMatchProps = {
  "homeTeam": "FC Porto",
  "awayTeam": "Manchester City",
  "homeLogo": "logos/team-212.png",
  "awayLogo": "logos/team-50.png",
  "goals": [
    {
      "minute": 45,
      "displayMinute": "45+1",
      "player": "A. Semenyo",
      "side": "away"
    },
    {
      "minute": 83,
      "player": "P. Rosario",
      "side": "home"
    },
    {
      "minute": 90,
      "displayMinute": "90+2",
      "player": "Borja Sainz",
      "side": "home"
    }
  ],
  "accentColor": "#08d9ff"
} satisfies MatchCardProps;
