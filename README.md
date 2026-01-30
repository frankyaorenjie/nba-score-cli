# nba-score-tui

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
git clone https://github.com/frankyaorenjie/nba-score-tui.git
cd nba-score-tui
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
<img width="1520" height="638" alt="image" src="https://github.com/user-attachments/assets/b1d5a2ce-9c79-440d-a65f-eece76433f84" />

### Standings View
<img width="1410" height="960" alt="image" src="https://github.com/user-attachments/assets/bff130d9-5395-4b09-83c7-b804a9d14b79" />

### Game Detail View
<img width="1546" height="1812" alt="image" src="https://github.com/user-attachments/assets/1d120c79-2e6f-46d9-8e12-2c311c5007a8" />

## Data Sources

- Scores: Official NBA API
- Standings: ESPN API

## License

MIT
