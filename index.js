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
    const clock = game.gameClock || '';
    const periodName = period <= 4 ? `Q${period}` : `OT${period - 4}`;
    return `{red-fg}{bold}LIVE{/bold} ${periodName} ${clock}{/red-fg}`;
  } else {
    return `{green-fg}Final{/green-fg}`;
  }
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

  if (homePts >= awayPts) {
    return { name: homeLeader.name, points: homePts };
  }
  return { name: awayLeader.name, points: awayPts };
}

function buildGameRow(game) {
  const away = game.awayTeam;
  const home = game.homeTeam;
  const gameStarted = game.gameStatus !== 1;
  const gameEnded = game.gameStatus === 3;

  const awayAbbr = away.teamTricode;
  const homeAbbr = home.teamTricode;
  const awayScore = gameStarted ? String(away.score).padStart(3) : '  -';
  const homeScore = gameStarted ? String(home.score).padStart(3) : '  -';

  const awayWon = gameEnded && away.score > home.score;
  const homeWon = gameEnded && home.score > away.score;

  let awayDisplay = awayWon ? `{bold}{white-fg}${awayAbbr} ${awayScore}{/white-fg}{/bold}` : `{gray-fg}${awayAbbr} ${awayScore}{/gray-fg}`;
  let homeDisplay = homeWon ? `{bold}{white-fg}${homeAbbr} ${homeScore}{/white-fg}{/bold}` : `{gray-fg}${homeAbbr} ${homeScore}{/gray-fg}`;

  const scoreCol = `${awayDisplay}  -  ${homeDisplay}`;

  const status = formatGameStatus(game);

  const mvp = getGameMVP(game);
  const mvpCol = mvp ? `{yellow-fg}${mvp.name} (${mvp.points} PTS){/yellow-fg}` : '';

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

  let content = '\n';
  content += `  {bold}${'SCORE'.padEnd(24)}${'STATUS'.padEnd(18)}${'TOP PERFORMER'}{/bold}\n`;
  content += `  {gray-fg}${'─'.repeat(70)}{/gray-fg}\n`;

  for (const game of games) {
    const row = buildGameRow(game);
    const scoreFormatted = padWithTags(row.scoreCol, 24);
    const statusFormatted = padWithTags(row.status, 18);
    content += `  ${scoreFormatted}${statusFormatted}${row.mvpCol}\n`;
  }

  scoreList.setContent(content);
  screen.render();
}

function updateFooter() {
  const now = new Date().toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true
  });
  footer.setContent(`{center}Last updated: ${now} | Refreshes every 5s | Press q to quit{/center}`);
  screen.render();
}

async function refresh() {
  const data = await fetchScores();
  renderScores(data);
  updateFooter();
}

async function main() {
  scoreList.setContent('\n{center}Loading NBA scores...{/center}');
  screen.render();

  await refresh();
  setInterval(refresh, REFRESH_INTERVAL);
}

main();
