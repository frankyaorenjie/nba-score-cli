# nba-score-cli

A terminal UI (TUI) application that displays live NBA scores with auto-refresh.

## Features

- Live NBA scores updated every 5 seconds
- Clean single-row layout for each game
- Team abbreviations (GSW, LAL, BOS, etc.)
- Game status: scheduled time, live quarter/clock, or final
- Top performer for each game (highest scorer)
- Color-coded display:
  - Winner in bold white
  - Loser in gray
  - Live games in red
  - Top performer in yellow
- Keyboard and mouse navigation
- Scrollable game list

## Installation

```bash
git clone https://github.com/bytedance/nba-score-cli.git
cd nba-score-cli
npm install
```

## Usage

```bash
npm start
# or
node index.js
```

### Controls

- `q` or `Esc` - Quit
- `Ctrl+C` - Quit
- Arrow keys / Mouse - Scroll

## Display

```
  SCORE                   STATUS            TOP PERFORMER
  ──────────────────────────────────────────────────────────────────────
  POR 111  -  WAS 115     Final             Jordan Poole (39 PTS)
  SAC  87  -  NYK 103     Final             Jalen Brunson (33 PTS)
  GSW  87  -  LAL  92     LIVE Q3 4:32      LeBron James (28 PTS)
  BOS   -  -  MIA   -     Starts at 7:30 PM
```

## Data Source

Scores are fetched from the official NBA API.

## License

MIT
