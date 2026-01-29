#!/usr/bin/env node

const blessed = require('blessed');

const NBA_API_URL = 'https://cdn.nba.com/static/json/liveData/scoreboard/todaysScoreboard_00.json';
const ESPN_STANDINGS_URL = 'https://site.api.espn.com/apis/v2/sports/basketball/nba/standings';
const REFRESH_INTERVAL = 5000;
const STANDINGS_REFRESH_INTERVAL = 60000;

const TEAM_ABBR_MAP = {
  'GS': 'GSW',
  'NO': 'NOP',
  'NY': 'NYK',
  'SA': 'SAS',
  'UTAH': 'UTA',
  'WSH': 'WAS'
};

function normalizeTeamAbbr(abbr) {
  return TEAM_ABBR_MAP[abbr] || abbr;
}

let currentView = 'scores';
let scoresData = null;
let standingsData = null;

const screen = blessed.screen({
  smartCSR: true,
  title: 'NBA Scores'
});

const menuBar = blessed.box({
  top: 0,
  left: 0,
  width: '100%',
  height: 1,
  tags: true,
  style: {
    fg: 'white',
    bg: 'gray'
  }
});

const header = blessed.box({
  top: 1,
  left: 0,
  width: '100%',
  height: 2,
  content: '',
  tags: true,
  style: {
    fg: 'white',
    bg: 'blue',
    bold: true
  }
});

const mainContent = blessed.box({
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

screen.append(menuBar);
screen.append(header);
screen.append(mainContent);
screen.append(footer);

screen.key(['escape', 'q', 'C-c'], () => {
  process.exit(0);
});

screen.key(['1'], () => {
  currentView = 'scores';
  updateMenu();
  renderCurrentView();
});

screen.key(['2'], () => {
  currentView = 'standings';
  updateMenu();
  renderCurrentView();
});

function updateMenu() {
  const scoresStyle = currentView === 'scores' ? '{bold}{white-bg}{black-fg}' : '{white-fg}';
  const scoresEnd = currentView === 'scores' ? '{/black-fg}{/white-bg}{/bold}' : '{/white-fg}';
  const standingsStyle = currentView === 'standings' ? '{bold}{white-bg}{black-fg}' : '{white-fg}';
  const standingsEnd = currentView === 'standings' ? '{/black-fg}{/white-bg}{/bold}' : '{/white-fg}';
  
  menuBar.setContent(` ${scoresStyle} [1] Scores ${scoresEnd}  ${standingsStyle} [2] Standings ${standingsEnd}`);
  screen.render();
}

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

async function fetchStandings() {
  try {
    const response = await fetch(ESPN_STANDINGS_URL);
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

  const isoMatch = clockStr.match(/PT(\d+)M([\d.]+)S/);
  if (isoMatch) {
    const minutes = parseInt(isoMatch[1]) || 0;
    const seconds = parseFloat(isoMatch[2]) || 0;
    return { minutes, seconds };
  }

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
      const wholeSec = Math.floor(seconds).toString().padStart(2, '0');
      const decimalPart = Math.round((seconds % 1) * 100).toString().padStart(2, '0');
      return `{red-fg}${periodName} ${wholeSec}.${decimalPart}{/red-fg}`;
    } else {
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

function renderScoresView() {
  const data = scoresData;
  if (!data) {
    header.setContent(`{center}NBA Scores{/center}`);
    mainContent.setContent('{center}{red-fg}Failed to fetch scores. Retrying...{/red-fg}{/center}');
    screen.render();
    return;
  }

  const games = data.scoreboard.games;
  const gameDate = data.scoreboard.gameDate;

  header.setContent(`{center}NBA Scores - ${gameDate}{/center}`);

  if (games.length === 0) {
    mainContent.setContent('\n{center}No games scheduled for today.{/center}');
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

  mainContent.setContent(content);
  screen.render();
}

function renderStandingsView() {
  const data = standingsData;
  
  header.setContent(`{center}NBA Standings - 2025-26 Season{/center}`);
  
  if (!data) {
    mainContent.setContent('{center}{red-fg}Loading standings...{/red-fg}{/center}');
    screen.render();
    return;
  }

  const conferences = data.children;
  if (!conferences || conferences.length === 0) {
    mainContent.setContent('{center}{red-fg}No standings data available{/red-fg}{/center}');
    screen.render();
    return;
  }

  const eastTeams = [];
  const westTeams = [];

  for (const conf of conferences) {
    const confName = conf.name || '';
    const entries = conf.standings?.entries || [];

    for (const entry of entries) {
      const team = entry.team || {};
      const stats = entry.stats || [];
      const rawAbbr = team.abbreviation || '';
      const teamAbbr = normalizeTeamAbbr(rawAbbr);
      const wins = stats.find(s => s.name === 'wins')?.value || 0;
      const losses = stats.find(s => s.name === 'losses')?.value || 0;
      const winPct = stats.find(s => s.name === 'winPercent')?.value || 0;

      const teamData = { 
        teamAbbr, 
        wins: Math.floor(wins), 
        losses: Math.floor(losses),
        winPct: winPct.toFixed(3).slice(1)
      };

      if (confName.includes('East')) {
        eastTeams.push(teamData);
      } else if (confName.includes('West')) {
        westTeams.push(teamData);
      }
    }
  }

  eastTeams.sort((a, b) => b.wins - a.wins || a.losses - b.losses);
  westTeams.sort((a, b) => b.wins - a.wins || a.losses - b.losses);

  const eastLeader = eastTeams[0];
  const westLeader = westTeams[0];

  const colWidth = 28;
  const totalWidth = colWidth * 2 + 6;
  const leftPad = Math.max(0, Math.floor((screen.width - totalWidth) / 2));
  const pad = ' '.repeat(leftPad);

  let content = '\n';
  content += `${pad}{bold}{cyan-fg}${'EASTERN CONFERENCE'.padEnd(colWidth)}    ${'WESTERN CONFERENCE'}{/cyan-fg}{/bold}\n`;
  const headerRow = '    TEAM   W-L    PCT   GB';
  content += `${pad}{gray-fg}${headerRow}    ${headerRow}{/gray-fg}\n`;
  content += `${pad}{gray-fg}${'─'.repeat(colWidth)}    ${'─'.repeat(colWidth)}{/gray-fg}\n`;

  const maxTeams = Math.max(eastTeams.length, westTeams.length);
  for (let i = 0; i < Math.min(maxTeams, 15); i++) {
    const eastTeam = eastTeams[i];
    const westTeam = westTeams[i];

    const eastHighlight = i < 6 ? '{green-fg}' : i < 10 ? '{yellow-fg}' : '{gray-fg}';
    const eastEnd = i < 6 ? '{/green-fg}' : i < 10 ? '{/yellow-fg}' : '{/gray-fg}';
    const westHighlight = i < 6 ? '{green-fg}' : i < 10 ? '{yellow-fg}' : '{gray-fg}';
    const westEnd = i < 6 ? '{/green-fg}' : i < 10 ? '{/yellow-fg}' : '{/gray-fg}';

    const rank = String(i + 1).padStart(2);
    
    let eastCol = '';
    if (eastTeam) {
      const record = `${eastTeam.wins}-${eastTeam.losses}`;
      const gb = i === 0 ? '  -' : ((eastLeader.wins - eastTeam.wins + eastTeam.losses - eastLeader.losses) / 2).toFixed(1).padStart(4);
      eastCol = `${eastHighlight}${rank}. ${eastTeam.teamAbbr.padEnd(4)} ${record.padStart(6)} ${eastTeam.winPct} ${gb}${eastEnd}`;
    }

    let westCol = '';
    if (westTeam) {
      const record = `${westTeam.wins}-${westTeam.losses}`;
      const gb = i === 0 ? '  -' : ((westLeader.wins - westTeam.wins + westTeam.losses - westLeader.losses) / 2).toFixed(1).padStart(4);
      westCol = `${westHighlight}${rank}. ${westTeam.teamAbbr.padEnd(4)} ${record.padStart(6)} ${westTeam.winPct} ${gb}${westEnd}`;
    }

    const eastPlain = stripTags(eastCol);
    const eastPadded = eastCol + ' '.repeat(Math.max(0, colWidth - eastPlain.length));
    
    content += `${pad}${eastPadded}    ${westCol}\n`;
  }

  content += `\n${pad}{gray-fg}GB = Games Behind | Green: Playoff (1-6) | Yellow: Play-in (7-10) | Gray: Lottery{/gray-fg}\n`;

  mainContent.setContent(content);
  screen.render();
}

function renderCurrentView() {
  if (currentView === 'scores') {
    renderScoresView();
  } else if (currentView === 'standings') {
    renderStandingsView();
  }
}

function updateFooter() {
  const now = new Date().toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
  footer.setContent(`{center}{green-fg}●{/green-fg} ${now} | Press 1/2 to switch views | q to quit{/center}`);
  screen.render();
}

async function refreshScores() {
  scoresData = await fetchScores();
  if (currentView === 'scores') {
    renderScoresView();
  }
}

async function refreshStandings() {
  standingsData = await fetchStandings();
  if (currentView === 'standings') {
    renderStandingsView();
  }
}

async function main() {
  updateMenu();
  mainContent.setContent('\n{center}Loading NBA data...{/center}');
  screen.render();

  await Promise.all([refreshScores(), refreshStandings()]);
  renderCurrentView();
  
  setInterval(refreshScores, REFRESH_INTERVAL);
  setInterval(refreshStandings, STANDINGS_REFRESH_INTERVAL);
  setInterval(updateFooter, 1000);
  updateFooter();
}

main();
