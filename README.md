# nba-score-cli

A terminal UI (TUI) application that displays live NBA scores, standings, and game details with auto-refresh.

## Features

### Scores View
- Live NBA scores updated every 5 seconds
- Clean single-row layout for each game
- Team abbreviations (GSW, LAL, BOS, etc.)
- Game status: scheduled time, live quarter/clock, or final
- Top performer for each game (highest scorer)
- Color-coded display:
  - Leading team in bold white
  - Trailing team in gray
  - Live games clock in red
  - Top performer in yellow

### Standings View
- Eastern and Western Conference standings
- Updated every 60 seconds
- Color-coded playoff positions:
  - Green: Playoff spots (1-6)
  - Yellow: Play-in tournament (7-10)
  - White: Lottery teams (11-15)
- Shows wins, losses, win percentage, and games behind

### Game Detail View
- Game flow chart showing score differential over time
- Lead changes tracking
- Play-by-play feed (latest 5 plays)
- Full box score with player statistics
- Switch between Game Flow and Box Score sections with Tab
- Active section highlighted with yellow border

## Installation

```bash
git clone https://github.com/frankyaorenjie/nba-score-cli.git
cd nba-score-cli
npm install
```

## Usage

```bash
npm start
# or
node index.js
```

## Controls

### Main Views (Scores / Standings)
| Key | Action |
|-----|--------|
| `1` / `h` / `←` | Switch to Scores view |
| `2` / `l` / `→` | Switch to Standings view |
| `j` / `↓` | Move down / Scroll |
| `k` / `↑` | Move up / Scroll |
| `Space` / `Enter` | Open game details (from Scores) |
| `q` | Quit (with confirmation, press twice to exit) |
| `Ctrl+C` | Quit immediately |

### Game Detail View
| Key | Action |
|-----|--------|
| `Tab` | Switch focus between Game Flow and Box Score |
| `j` / `↓` | Scroll down in focused section |
| `k` / `↑` | Scroll up in focused section |
| `q` / `Esc` | Go back to main view |

### Quit Confirmation Dialog
| Key | Action |
|-----|--------|
| `Y` / `Q` / `Enter` | Confirm quit |
| `N` / `Esc` | Cancel |

## Screenshots

### Scores View
```
 [1] Scores   [2] Standings

              NBA Scores - 2025-01-29
  SCORE                   STATUS            TOP PERFORMER
  ──────────────────────────────────────────────────────────
  POR 111  -  WAS 115     Final             J. Poole (39 PTS)
  SAC  87  -  NYK 103     Final             J. Brunson (33 PTS)
  GSW  87  -  LAL  92     Q3 04:32          L. James (28 PTS)
```

### Standings View
```
 [1] Scores   [2] Standings

           EASTERN CONFERENCE              WESTERN CONFERENCE
  #  TEAM   W-L   PCT   GB        #  TEAM   W-L   PCT   GB
  ────────────────────────────    ────────────────────────────
  1. CLE  36-9  .800  -           1. OKC  36-8  .818  -
  2. BOS  32-14 .696  4.5         2. HOU  32-14 .696  5.0
  ...
```

### Game Detail View
```
         GSW 102  -  LAL 108  |  Final

  ┌─ Game Flow ─────────────────────────────────┐
  │  12 Lead Changes                            │
  │  +10 │      ○○                              │
  │    0 │────────────○───────────              │
  │  -10 │              ○○○○○                   │
  │      └──────────────────────                │
  │       Q1    Q2    Q3    Q4                  │
  └─────────────────────────────────────────────┘
  ┌─ Box Score (focused) ───────────────────────┐
  │  PLAYER             MIN  PTS  REB  AST  ... │
  │  L. James           38   32   8    11   ... │
  │  A. Davis           36   28   14   3    ... │
  └─────────────────────────────────────────────┘

  ● [Box Score] | jk/↑↓ scroll | Tab switch section | q/Esc back
```

## Data Sources

- Scores: Official NBA API
- Standings: ESPN API

## License

MIT
