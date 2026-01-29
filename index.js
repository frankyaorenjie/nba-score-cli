#!/usr/bin/env node

const blessed = require('blessed');

const NBA_API_URL = 'https://cdn.nba.com/static/json/liveData/scoreboard/todaysScoreboard_00.json';
const REFRESH_INTERVAL = 5000;

const screen = blessed.screen({
  smartCSR: true,
  title: 'NBA Scores'
});

const header = blessed.box({
  top: 0,
  left: 0,
  width: '100%',
  height: 3,
  content: '',
  tags: true,
  style: {
    fg: 'white',
    bg: 'blue',
    bold: true
  }
});

const scoreList = blessed.box({
  top: 3,
  left: 0,
  width: '100%',
  height: '100%-6',
  scrollable: true,
  alwaysScroll: true,
  scrollbar: {
    ch: ' ',
    style: { bg: 'yellow' }
  },
  keys: true,
  vi: true,
  mouse: true,
  tags: true,
  style: {
    fg: 'white',
    bg: 'black'
  }
});

const footer = blessed.box({
  bottom: 0,
  left: 0,
  width: '100%',
  height: 3,
  tags: true,
  style: {
    fg: 'white',
    bg: 'gray'
  }
});

screen.append(header);
screen.append(scoreList);
screen.append(footer);

screen.key(['escape', 'q', 'C-c'], () => {
  process.exit(0);
});

async function fetchScores() {
  try {
    const response = await fetch(NBA_API_URL);
    if (!response.ok) {
      throw new Error(`HTTP error: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    return null;
  }
}

function parseGameClock(clockStr) {
  if (!clockStr) return { minutes: 0, seconds: 0 };

  // Handle ISO 8601 duration format: PT05M30.00S
  const isoMatch = clockStr.match(/PT(\d+)M([\d.]+)S/);
  if (isoMatch) {
    const minutes = parseInt(isoMatch[1]) || 0;
    const seconds = parseFloat(isoMatch[2]) || 0;
    return { minutes, seconds };
  }

  // Handle MM:SS format
  const parts = clockStr.replace(/[^\d:]/g, '').split(':');
  if (parts.length === 2) {
    return { minutes: parseInt(parts[0]) || 0, seconds: parseFloat(parts[1]) || 0 };
  }

  return { minutes: 0, seconds: 0 };
}

function formatGameStatus(game) {
  const status = game.gameStatus;
  if (status === 1) {
    const gameTime = new Date(game.gameTimeUTC).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
    return `{gray-fg}Starts at ${gameTime}{/gray-fg}`;
  } else if (status === 2) {
    const period = game.period;
    const { minutes, seconds } = parseGameClock(game.gameClock);

    // Check for end of quarter (clock at 0:00)
    if (minutes === 0 && seconds === 0) {
      if (period === 2) {
        return `{yellow-fg}Halftime{/yellow-fg}`;
      } else if (period <= 4) {
        return `{yellow-fg}End of Q${period}{/yellow-fg}`;
      } else {
        return `{yellow-fg}End of OT${period - 4}{/yellow-fg}`;
      }
    }

    const periodName = period <= 4 ? `Q${period}` : `OT${period - 4}`;

    if (minutes < 1) {
      // Less than 1 minute: use period separator, red highlight
      const wholeSec = Math.floor(seconds).toString().padStart(2, '0');
      const decimalPart = Math.round((seconds % 1) * 100).toString().padStart(2, '0');
      return `{red-fg}${periodName} ${wholeSec}.${decimalPart}{/red-fg}`;
    } else {
      // More than 1 minute: use colon separator
      const minDisplay = minutes.toString().padStart(2, '0');
      const secDisplay = Math.floor(seconds).toString().padStart(2, '0');
      return `${periodName} ${minDisplay}:${secDisplay}`;
    }
  } else {
    return `{green-fg}Final{/green-fg}`;
  }
}

function formatPlayerName(fullName) {
  if (!fullName) return '';
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  const firstName = parts[0];
  const lastName = parts.slice(1).join(' ');
  return `${firstName[0]}. ${lastName}`;
}

function getGameMVP(game) {
  const leaders = game.gameLeaders;
  if (!leaders || game.gameStatus === 1) {
    return null;
  }

  const homeLeader = leaders.homeLeaders;
  const awayLeader = leaders.awayLeaders;

  if (!homeLeader?.points || !awayLeader?.points) {
    return null;
  }

  const homePts = parseInt(homeLeader.points) || 0;
  const awayPts = parseInt(awayLeader.points) || 0;

  const leader = homePts >= awayPts ? homeLeader : awayLeader;
  const team = homePts >= awayPts ? game.homeTeam.teamTricode : game.awayTeam.teamTricode;

  const pts = parseInt(leader.points) || 0;
  const reb = parseInt(leader.rebounds) || 0;
  const ast = parseInt(leader.assists) || 0;

  return {
    name: formatPlayerName(leader.name),
    jerseyNum: leader.jerseyNum || '',
    team,
    pts,
    reb,
    ast
  };
}

function buildGameRow(game) {
  const away = game.awayTeam;
  const home = game.homeTeam;
  const gameStarted = game.gameStatus !== 1;

  const awayAbbr = away.teamTricode;
  const homeAbbr = home.teamTricode;
  const awayScore = gameStarted ? String(away.score).padStart(3) : '  -';
  const homeScore = gameStarted ? String(home.score).padStart(3) : '  -';

  const awayLeading = gameStarted && away.score > home.score;
  const homeLeading = gameStarted && home.score > away.score;

  let awayDisplay = awayLeading ? `{bold}{white-fg}${awayAbbr} ${awayScore}{/white-fg}{/bold}` : `{gray-fg}${awayAbbr} ${awayScore}{/gray-fg}`;
  let homeDisplay = homeLeading ? `{bold}{white-fg}${homeAbbr} ${homeScore}{/white-fg}{/bold}` : `{gray-fg}${homeAbbr} ${homeScore}{/gray-fg}`;

  const scoreCol = `${awayDisplay}  -  ${homeDisplay}`;

  const status = formatGameStatus(game);

  const mvp = getGameMVP(game);
  let mvpCol = '';
  if (mvp) {
    const stats = [`${mvp.pts} PTS`];
    if (mvp.reb >= 5) stats.push(`${mvp.reb} REB`);
    if (mvp.ast >= 5) stats.push(`${mvp.ast} AST`);
    const statsStr = stats.slice(0, 3).join(', ');
    const jerseyStr = mvp.jerseyNum ? ` #${mvp.jerseyNum}` : '';
    mvpCol = `{yellow-fg}${mvp.name}${jerseyStr} - ${mvp.team} (${statsStr}){/yellow-fg}`;
  }

  return { scoreCol, status, mvpCol };
}

function stripTags(str) {
  return str.replace(/\{[^}]+\}/g, '');
}

function padWithTags(str, width) {
  const plainLen = stripTags(str).length;
  const padding = Math.max(0, width - plainLen);
  return str + ' '.repeat(padding);
}

function renderScores(data) {
  if (!data) {
    scoreList.setContent('{center}{red-fg}Failed to fetch scores. Retrying...{/red-fg}{/center}');
    screen.render();
    return;
  }

  const games = data.scoreboard.games;
  const gameDate = data.scoreboard.gameDate;

  header.setContent(`{center}NBA Scores - ${gameDate}{/center}`);

  if (games.length === 0) {
    scoreList.setContent('\n{center}No games scheduled for today.{/center}');
    screen.render();
    return;
  }

  const tableWidth = 90;
  const leftPad = Math.max(0, Math.floor((screen.width - tableWidth) / 2));
  const pad = ' '.repeat(leftPad);

  let content = '\n';
  content += `${pad}{bold}${'SCORE'.padEnd(30)}${'STATUS'.padEnd(24)}${'TOP PERFORMER'}{/bold}\n`;
  content += `${pad}{gray-fg}${'─'.repeat(tableWidth)}{/gray-fg}\n`;

  for (const game of games) {
    const row = buildGameRow(game);
    const scoreFormatted = padWithTags(row.scoreCol, 30);
    const statusFormatted = padWithTags(row.status, 24);
    content += `${pad}${scoreFormatted}${statusFormatted}${row.mvpCol}\n`;
  }

  scoreList.setContent(content);
  screen.render();
}

function updateFooter() {
  const now = new Date().toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
  footer.setContent(`{center}{green-fg}●{/green-fg} ${now} | q to quit{/center}`);
  screen.render();
}

async function refresh() {
  const data = await fetchScores();
  renderScores(data);
}

async function main() {
  scoreList.setContent('\n{center}Loading NBA scores...{/center}');
  screen.render();

  await refresh();
  setInterval(refresh, REFRESH_INTERVAL);
  setInterval(updateFooter, 1000);
  updateFooter();
}

main();
