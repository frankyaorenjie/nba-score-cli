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

### Transactions View
- All NBA transactions from ESPN (last 3 months)
- Updated every 60 seconds
- Grouped by date, showing team and transaction details
- Color-coded: Yellow (trades), Green (signings), Red (waivers)
- **Player Watch List**: Subscribe to players to get notifications
  - Tab to switch between transactions and watch list panels
  - Search players by name with autocomplete
  - Preview notification when subscribing to confirm setup
  - Desktop notifications when subscribed players appear in transactions
  - Subscriptions saved to `~/.nba-score-tui-subscriptions.json`

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

### Main Views (Scores / Standings / Transactions)
| Key | Action |
|-----|--------|
| `1` | Switch to Scores view |
| `2` | Switch to Standings view |
| `3` | Switch to Transactions view |
| `h` / `←` | Switch to previous view |
| `l` / `→` | Switch to next view |

| `j` / `↓` | Move down / Scroll |
| `k` / `↑` | Move up / Scroll |
| `Space` / `Enter` | Open game details (from Scores) |
| `q` | Quit (with confirmation) |
| `Ctrl+C` | Quit immediately |

### Transactions View (Watch List)
| Key | Action |
|-----|--------|
| `Tab` | Switch between transactions and watch list panels |
| `Enter` | Search players / Subscribe / Remove from list |
| `d` / `Backspace` | Remove selected player from watch list |
| `Esc` | Cancel search / Go back |

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

### Transactions View
```
 [1] Scores   [2] Standings   [3] Transactions

┌─ Transactions ─────────────────────────┐┌─ Watch List ────────────┐
│                                        ││ LeBron James            │
│  Tuesday, January 27                   ││ Trae Young              │
│  ──────────────────────────────────    ││                         │
│    WSH  Signed F Skal Labissiere...    │├─ Search Player ─────────┤
│    CLE  Waived F Chris Livingston.     ││ > lebron                │
│                                        │├─────────────────────────┤
│  Friday, January 9                     ││ ✓ LeBron James          │
│  ──────────────────────────────────    ││   LeBron James Jr.      │
│    WSH  Acquired G Trae Young...       ││                         │
│    ATL  Acquired G CJ McCollum...      ││                         │
└────────────────────────────────────────┘└─────────────────────────┘

  ● 14:32:15 | Tab switch panels | Enter subscribe/remove | q quit
```

### Game Detail View
<img width="1546" height="1812" alt="image" src="https://github.com/user-attachments/assets/1d120c79-2e6f-46d9-8e12-2c311c5007a8" />

## Data Sources

- Scores: Official NBA API
- Standings: ESPN API
- Transactions: ESPN Transactions API
- Player Search: ESPN Search API

## License

MIT
