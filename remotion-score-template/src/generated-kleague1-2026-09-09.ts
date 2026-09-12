import type {MatchCardProps} from "./Composition";

export const kLeague1September9 = [
  {
    "id": "KLeague1DaejeonAnyang",
    "slug": "daejeon-anyang",
    "props": {
      "homeTeam": "Daejeon Citizen",
      "awayTeam": "FC Anyang",
      "homeLogo": "logos/team-2750.png",
      "awayLogo": "logos/team-2748.png",
      "goals": [
        {
          "minute": 27,
          "displayMinute": "27",
          "player": "",
          "side": "away"
        },
        {
          "minute": 71,
          "displayMinute": "71",
          "player": "",
          "side": "home"
        },
        {
          "minute": 90,
          "displayMinute": "90+1",
          "player": "",
          "side": "home"
        }
      ],
      "accentColor": "#08d9ff"
    }
  },
  {
    "id": "KLeague1GangwonJeonbuk",
    "slug": "gangwon-jeonbuk",
    "props": {
      "homeTeam": "Gangwon FC",
      "awayTeam": "Jeonbuk Motors",
      "homeLogo": "logos/team-2746.png",
      "awayLogo": "logos/team-2762.png",
      "goals": [
        {
          "minute": 48,
          "displayMinute": "48",
          "player": "",
          "side": "home"
        },
        {
          "minute": 90,
          "displayMinute": "90+1",
          "player": "",
          "side": "away"
        }
      ],
      "accentColor": "#08d9ff"
    }
  },
  {
    "id": "KLeague1GwangjuJeju",
    "slug": "gwangju-jeju",
    "props": {
      "homeTeam": "Gwangju FC",
      "awayTeam": "Jeju United FC",
      "homeLogo": "logos/team-2759.png",
      "awayLogo": "logos/team-2761.png",
      "goals": [
        {
          "minute": 53,
          "displayMinute": "53",
          "player": "",
          "side": "home"
        },
        {
          "minute": 75,
          "displayMinute": "75",
          "player": "",
          "side": "away"
        },
        {
          "minute": 78,
          "displayMinute": "78",
          "player": "",
          "side": "away"
        }
      ],
      "accentColor": "#08d9ff"
    }
  },
  {
    "id": "KLeague1PohangGimcheon",
    "slug": "pohang-gimcheon",
    "props": {
      "homeTeam": "Pohang Steelers",
      "awayTeam": "Gimcheon Sangmu FC",
      "homeLogo": "logos/team-2764.png",
      "awayLogo": "logos/team-2768.png",
      "goals": [
        {
          "minute": 80,
          "displayMinute": "80",
          "player": "",
          "side": "home"
        },
        {
          "minute": 90,
          "displayMinute": "90+3",
          "player": "",
          "side": "away"
        }
      ],
      "accentColor": "#08d9ff"
    }
  }
] satisfies Array<{id: string; slug: string; props: MatchCardProps}>;
