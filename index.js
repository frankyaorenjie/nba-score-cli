#!/usr/bin/env node

const blessed = require('blessed');
const notifier = require('node-notifier');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { exec } = require('child_process');

const NBA_API_URL = 'https://cdn.nba.com/static/json/liveData/scoreboard/todaysScoreboard_00.json';
const BOXSCORE_URL = 'https://cdn.nba.com/static/json/liveData/boxscore/boxscore_GAMEID.json';
const PLAYBYPLAY_URL = 'https://cdn.nba.com/static/json/liveData/playbyplay/playbyplay_GAMEID.json';
const ESPN_STANDINGS_URL = 'https://site.api.espn.com/apis/v2/sports/basketball/nba/standings';
const ESPN_TRANSACTIONS_BASE_URL = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/transactions';
const ESPN_PLAYER_SEARCH_URL = 'https://site.web.api.espn.com/apis/common/v3/search?type=player&sport=basketball&league=nba&limit=10&query=';
const SUBSCRIPTIONS_FILE = path.join(os.homedir(), '.nba-score-tui-subscriptions.json');
const REFRESH_INTERVAL = 5000;
const STANDINGS_REFRESH_INTERVAL = 60000;
const NEWS_REFRESH_INTERVAL = 60000;
const UPDATE_CHECK_INTERVAL = 3600000; // Check for updates every hour

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

function loadSubscriptions() {
  try {
    if (fs.existsSync(SUBSCRIPTIONS_FILE)) {
      const data = fs.readFileSync(SUBSCRIPTIONS_FILE, 'utf8');
      subscribedPlayers = JSON.parse(data);
    }
  } catch (error) {
    subscribedPlayers = [];
  }
}

function saveSubscriptions() {
  try {
    fs.writeFileSync(SUBSCRIPTIONS_FILE, JSON.stringify(subscribedPlayers, null, 2));
  } catch (error) {
    // Ignore save errors
  }
}

function addSubscription(player) {
  if (!subscribedPlayers.find(p => p.id === player.id)) {
    subscribedPlayers.push(player);
    saveSubscriptions();
    return true;
  }
  return false;
}

function removeSubscription(playerId) {
  const index = subscribedPlayers.findIndex(p => p.id === playerId);
  if (index !== -1) {
    subscribedPlayers.splice(index, 1);
    saveSubscriptions();
    return true;
  }
  return false;
}

async function searchPlayers(query) {
  if (!query || query.length < 2) return [];
  try {
    const response = await fetch(ESPN_PLAYER_SEARCH_URL + encodeURIComponent(query));
    if (!response.ok) return [];
    const data = await response.json();
    return (data.items || []).map(item => ({
      id: item.id,
      name: item.displayName,
      shortName: item.shortName
    }));
  } catch (error) {
    return [];
  }
}

function checkSubscribedPlayerTransactions(transactions) {
  if (!transactions || subscribedPlayers.length === 0) return;

  for (const tx of transactions) {
    const desc = tx.description || '';
    const txKey = `${tx.date}-${tx.team?.abbreviation}-${desc}`;

    if (notifiedTransactions.has(txKey)) continue;

    for (const player of subscribedPlayers) {
      // Check if player name appears in transaction
      const playerNames = [player.name, player.shortName].filter(Boolean);
      for (const name of playerNames) {
        if (desc.includes(name)) {
          notifiedTransactions.add(txKey);
          notifier.notify({
            title: 'NBA Transaction Alert',
            message: `${player.name}: ${desc}`,
            sound: true
          });
          break;
        }
      }
    }
  }
}

function execPromise(command, options = {}) {
  return new Promise((resolve, reject) => {
    exec(command, { cwd: appDirectory, ...options }, (error, stdout, stderr) => {
      if (error) {
        reject(error);
      } else {
        resolve(stdout.trim());
      }
    });
  });
}

async function checkForUpdates() {
  try {
    // Fetch latest from remote
    await execPromise('git fetch origin main');

    // Get local and remote commit hashes
    const localHash = await execPromise('git rev-parse HEAD');
    const remoteHash = await execPromise('git rev-parse origin/main');

    if (localHash !== remoteHash) {
      // Get commit count behind
      const behindCount = await execPromise('git rev-list HEAD..origin/main --count');
      const count = parseInt(behindCount) || 0;

      if (count > 0 && !updateAvailable) {
        updateAvailable = true;
        notifier.notify({
          title: 'NBA Score TUI Update Available',
          message: `${count} new update(s) available. Press 'u' to update.`,
          sound: true
        });
        updateFooter();
      }
    }
  } catch (error) {
    // Silently ignore update check errors (e.g., no git, no network)
  }
}

async function performUpdate() {
  try {
    // Pull latest changes
    await execPromise('git pull origin main');

    // Notify user
    notifier.notify({
      title: 'NBA Score TUI Updated',
      message: 'Update complete. Please restart the app to apply changes.',
      sound: true
    });

    updateAvailable = false;

    // Show restart dialog
    showUpdateCompleteDialog();
  } catch (error) {
    notifier.notify({
      title: 'Update Failed',
      message: `Error: ${error.message}`,
      sound: true
    });
  }
}

function toNumber(value, fallback = 0) {
  const n = typeof value === 'number' ? value : parseFloat(value);
  return Number.isFinite(n) ? n : fallback;
}

function formatWinPct(value) {
  const n = toNumber(value, 0);
  return n.toFixed(3).slice(1);
}

let currentGames = [];
let mainView = 'scores'; // 'scores', 'standings', or 'tradeNews'
let detailView = null; // null or gameId when viewing game details
let detailFocus = 'boxScore'; // 'gameFlow' or 'boxScore'
let scoresData = null;
let standingsData = null;
let tradeNewsData = null;
let subscribedPlayers = []; // Array of {id, name}
let notifiedTransactions = new Set(); // Track notified transactions to avoid duplicates
let searchResults = []; // Current player search results
let transactionsFocusLeft = true; // Track which panel is focused
let updateAvailable = false; // Track if update is available
let appDirectory = __dirname; // App installation directory

const TEAM_COLORS = {
  'ATL': '#FF4D4F', 'BKN': '#FFFFFF', 'BOS': '#00FF66', 'CHA': '#4B2BBF', 'CHI': '#FF2D55',
  'CLE': '#B3004B', 'DAL': '#007FFF', 'DEN': '#1A3F7A', 'DET': '#FF1D3D', 'GSW': '#2B63CF',
  'HOU': '#FF2D55', 'IND': '#004799', 'LAC': '#FF1D3D', 'LAL': '#8C3DCC', 'MEM': '#839FD9',
  'MIA': '#CC003D', 'MIL': '#007A2E', 'MIN': '#153D70', 'NOP': '#153D70', 'NYK': '#1A8CFF',
  'OKC': '#1AB0FF', 'ORL': '#1AA3FF', 'PHI': '#1A8CFF', 'PHX': '#2B1A8F', 'POR': '#FF4D4F',
  'SAC': '#8E47CC', 'SAS': '#E6E9ED', 'TOR': '#FF2D55', 'UTA': '#004799', 'WAS': '#004799'
};

const screen = blessed.screen({
  smartCSR: true,
  title: 'NBA Scores'
});

// Menu bar for switching views
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

// Main list view components
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

const gameList = blessed.list({
  top: 3,
  left: 0,
  width: '100%',
  height: '100%-6',
  keys: true,
  vi: true,
  mouse: true,
  tags: true,
  scrollable: true,
  scrollbar: {
    ch: ' ',
    style: { bg: 'yellow' }
  },
  style: {
    fg: 'white',
    bg: 'black',
    selected: {
      fg: 'black',
      bg: 'white'
    }
  }
});

const standingsContent = blessed.box({
  top: 3,
  left: 0,
  width: '100%',
  height: '100%-6',
  keys: true,
  vi: true,
  mouse: true,
  tags: true,
  scrollable: true,
  hidden: true,
  scrollbar: {
    ch: ' ',
    style: { bg: 'yellow' }
  },
  style: {
    fg: 'white',
    bg: 'black'
  }
});

// Transactions view - left panel (transactions list)
const transactionsLeftPanel = blessed.box({
  top: 3,
  left: 0,
  width: '70%',
  height: '100%-6',
  keys: true,
  vi: true,
  mouse: true,
  tags: true,
  scrollable: true,
  hidden: true,
  scrollbar: {
    ch: ' ',
    style: { bg: 'yellow' }
  },
  border: {
    type: 'line'
  },
  label: ' Transactions ',
  style: {
    fg: 'white',
    bg: 'black',
    border: { fg: 'cyan' }
  }
});

// Transactions view - right panel (subscriptions)
const transactionsRightPanel = blessed.box({
  top: 3,
  left: '70%',
  width: '30%',
  height: '100%-6',
  tags: true,
  hidden: true,
  border: {
    type: 'line'
  },
  label: ' Watch List ',
  style: {
    fg: 'white',
    bg: 'black',
    border: { fg: 'gray' }
  }
});

// Subscribed players list
const subscribedList = blessed.list({
  top: 0,
  left: 0,
  width: '100%-2',
  height: '50%-1',
  keys: true,
  vi: true,
  mouse: true,
  tags: true,
  scrollable: true,
  style: {
    fg: 'white',
    bg: 'black',
    selected: {
      fg: 'black',
      bg: 'yellow'
    }
  }
});

// Search input
const searchInput = blessed.textbox({
  top: '50%',
  left: 0,
  width: '100%-2',
  height: 3,
  keys: true,
  mouse: true,
  inputOnFocus: true,
  border: {
    type: 'line'
  },
  label: ' Search Player (Enter to search) ',
  style: {
    fg: 'white',
    bg: 'black',
    border: { fg: 'green' }
  }
});

// Search results dropdown
const searchResultsList = blessed.list({
  top: '50%+3',
  left: 0,
  width: '100%-2',
  height: '50%-4',
  keys: true,
  vi: true,
  mouse: true,
  tags: true,
  scrollable: true,
  style: {
    fg: 'white',
    bg: 'black',
    selected: {
      fg: 'black',
      bg: 'green'
    }
  }
});

transactionsRightPanel.append(subscribedList);
transactionsRightPanel.append(searchInput);
transactionsRightPanel.append(searchResultsList);

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

// Detail view components
const detailHeader = blessed.box({
  top: 0,
  left: 0,
  width: '100%',
  height: 3,
  content: '',
  tags: true,
  hidden: true,
  style: {
    fg: 'white',
    bg: 'blue',
    bold: true
  }
});

const gameFlowBox = blessed.box({
  top: 3,
  left: 0,
  width: '100%',
  height: '40%',
  tags: true,
  hidden: true,
  scrollable: true,
  alwaysScroll: true,
  keys: true,
  vi: true,
  mouse: true,
  scrollbar: {
    ch: '█',
    style: { bg: 'cyan' }
  },
  border: {
    type: 'line'
  },
  label: ' Game Flow ',
  style: {
    fg: 'white',
    bg: 'black',
    border: { fg: 'cyan' }
  }
});

const boxScoreBox = blessed.box({
  top: '40%+3',
  left: 0,
  width: '100%',
  height: '60%-6',
  tags: true,
  hidden: true,
  scrollable: true,
  alwaysScroll: true,
  scrollbar: {
    ch: '█',
    style: { bg: 'yellow' }
  },
  keys: true,
  vi: true,
  mouse: true,
  border: {
    type: 'line'
  },
  label: ' Box Score ',
  style: {
    fg: 'white',
    bg: 'black',
    border: { fg: 'cyan' }
  }
});

const detailFooter = blessed.box({
  bottom: 0,
  left: 0,
  width: '100%',
  height: 3,
  tags: true,
  hidden: true,
  style: {
    fg: 'white',
    bg: 'gray'
  }
});

// Quit confirmation dialog
const confirmDialog = blessed.box({
  top: 'center',
  left: 'center',
  width: 40,
  height: 7,
  tags: true,
  hidden: true,
  border: {
    type: 'line'
  },
  style: {
    fg: 'white',
    bg: 'black',
    border: { fg: 'yellow' }
  }
});

confirmDialog.setContent(`{center}Quit NBA Scores?{/center}\n\n{center}{green-fg}[Y/Q]{/green-fg} Yes    {red-fg}[N/Esc]{/red-fg} No{/center}`);

// Update complete dialog
const updateCompleteDialog = blessed.box({
  top: 'center',
  left: 'center',
  width: 50,
  height: 9,
  tags: true,
  hidden: true,
  border: {
    type: 'line'
  },
  style: {
    fg: 'white',
    bg: 'black',
    border: { fg: 'green' }
  }
});

updateCompleteDialog.setContent(`{center}{green-fg}Update Complete!{/green-fg}{/center}\n\n{center}Please restart the app to apply changes.{/center}\n\n{center}{green-fg}[R]{/green-fg} Restart    {yellow-fg}[L]{/yellow-fg} Later{/center}`);

screen.append(menuBar);
screen.append(header);
screen.append(gameList);
screen.append(standingsContent);
screen.append(transactionsLeftPanel);
screen.append(transactionsRightPanel);
screen.append(footer);
screen.append(detailHeader);
screen.append(gameFlowBox);
screen.append(boxScoreBox);
screen.append(detailFooter);
screen.append(confirmDialog);
screen.append(updateCompleteDialog);

let confirmVisible = false;
let updateDialogVisible = false;

function showConfirmDialog() {
  confirmVisible = true;
  confirmDialog.show();
  confirmDialog.focus();
  screen.render();
}

function hideConfirmDialog() {
  confirmVisible = false;
  confirmDialog.hide();
  if (mainView === 'scores') {
    gameList.focus();
  } else if (mainView === 'standings') {
    standingsContent.focus();
  } else {
    transactionsLeftPanel.focus();
  }
  screen.render();
}

function showUpdateCompleteDialog() {
  updateDialogVisible = true;
  updateCompleteDialog.show();
  updateCompleteDialog.focus();
  screen.render();
}

function hideUpdateCompleteDialog() {
  updateDialogVisible = false;
  updateCompleteDialog.hide();
  if (mainView === 'scores') {
    gameList.focus();
  } else if (mainView === 'standings') {
    standingsContent.focus();
  } else {
    transactionsLeftPanel.focus();
  }
  screen.render();
}

// Confirm dialog key bindings
confirmDialog.key(['y', 'Y', 'q', 'Q', 'enter'], () => {
  process.exit(0);
});

confirmDialog.key(['n', 'N', 'escape'], () => {
  hideConfirmDialog();
});

// Update complete dialog key bindings
updateCompleteDialog.key(['r', 'R'], () => {
  // Restart the app
  const { spawn } = require('child_process');
  spawn(process.argv[0], process.argv.slice(1), {
    cwd: appDirectory,
    detached: true,
    stdio: 'inherit'
  }).unref();
  process.exit(0);
});

updateCompleteDialog.key(['l', 'L', 'escape'], () => {
  hideUpdateCompleteDialog();
});

// Key bindings
screen.key(['escape'], () => {
  if (confirmVisible) {
    hideConfirmDialog();
  } else if (detailView) {
    showListView();
  }
});

screen.key(['q'], () => {
  if (confirmVisible) return;
  if (detailView) {
    showListView();
  } else {
    showConfirmDialog();
  }
});

screen.key(['C-c'], () => {
  process.exit(0);
});

// Update key binding
screen.key(['u', 'U'], () => {
  if (confirmVisible || updateDialogVisible || detailView) return;
  if (updateAvailable) {
    performUpdate();
  } else {
    // Manual check for updates
    checkForUpdates();
  }
});

gameList.key(['space', 'enter'], () => {
  const selectedIndex = gameList.selected;
  if (currentGames[selectedIndex]) {
    showDetailView(currentGames[selectedIndex]);
  }
});

boxScoreBox.key(['escape', 'q'], () => {
  showListView();
});

gameFlowBox.key(['escape', 'q'], () => {
  showListView();
});

// Click to focus sections
gameFlowBox.on('click', () => {
  if (detailFocus !== 'gameFlow') {
    detailFocus = 'gameFlow';
    updateDetailFocus();
  }
});

boxScoreBox.on('click', () => {
  if (detailFocus !== 'boxScore') {
    detailFocus = 'boxScore';
    updateDetailFocus();
  }
});

// Click to focus transaction panels
transactionsLeftPanel.on('click', () => {
  if (!transactionsFocusLeft) {
    transactionsFocusLeft = true;
    updateTransactionsPanelFocus();
  }
});

transactionsRightPanel.on('click', () => {
  if (transactionsFocusLeft) {
    transactionsFocusLeft = false;
    updateTransactionsPanelFocus();
  }
});

// Function to update detail view focus and highlight
function updateDetailFocus() {
  if (detailFocus === 'gameFlow') {
    gameFlowBox.style.border.fg = 'yellow';
    boxScoreBox.style.border.fg = 'cyan';
    gameFlowBox.focus();
  } else {
    gameFlowBox.style.border.fg = 'cyan';
    boxScoreBox.style.border.fg = 'yellow';
    boxScoreBox.focus();
  }
  updateDetailFooter();
  screen.render();
}

function updateDetailFooter() {
  const section = detailFocus === 'gameFlow' ? 'Game Flow' : 'Box Score';
  detailFooter.setContent(`{center}{green-fg}●{/green-fg} {yellow-fg}[${section}]{/yellow-fg} | jk/↑↓ scroll | Tab switch section | q/Esc back{/center}`);
}

// Tab to switch focus between sections
screen.key(['tab'], () => {
  if (detailView) {
    detailFocus = detailFocus === 'gameFlow' ? 'boxScore' : 'gameFlow';
    updateDetailFocus();
  } else if (mainView === 'tradeNews') {
    transactionsFocusLeft = !transactionsFocusLeft;
    updateTransactionsPanelFocus();
  }
});

screen.key(['1'], () => {
  if (confirmVisible || detailView) return;
  mainView = 'scores';
  updateMenu();
  renderCurrentView();
});

screen.key(['left', 'h'], () => {
  if (confirmVisible || detailView) return;
  if (mainView === 'standings') {
    mainView = 'scores';
  } else if (mainView === 'tradeNews') {
    mainView = 'standings';
  }
  updateMenu();
  renderCurrentView();
});

screen.key(['2'], () => {
  if (confirmVisible || detailView) return;
  mainView = 'standings';
  updateMenu();
  renderCurrentView();
});

screen.key(['3'], () => {
  if (confirmVisible || detailView) return;
  mainView = 'tradeNews';
  updateMenu();
  renderCurrentView();
});

screen.key(['right', 'l'], () => {
  if (confirmVisible || detailView) return;
  if (mainView === 'scores') {
    mainView = 'standings';
  } else if (mainView === 'standings') {
    mainView = 'tradeNews';
  }
  updateMenu();
  renderCurrentView();
});

// Search input submit handler
searchInput.on('submit', async (value) => {
  if (value && value.length >= 2) {
    // Show loading status
    searchResultsList.setItems(['{yellow-fg}Searching...{/yellow-fg}']);
    screen.render();

    searchResults = await searchPlayers(value);

    if (searchResults.length === 0) {
      searchResultsList.setItems(['{gray-fg}No players found{/gray-fg}']);
    } else {
      renderSubscriptionPanel();
      searchResultsList.focus();
      searchResultsList.select(0);
    }
    screen.render();
  }
});

// Search input cancel
searchInput.key(['escape'], () => {
  searchInput.clearValue();
  transactionsFocusLeft = true;
  updateTransactionsPanelFocus();
});

// Search results - select player to subscribe
searchResultsList.on('select', (item, index) => {
  if (searchResults[index]) {
    const player = searchResults[index];
    if (addSubscription(player)) {
      renderSubscriptionPanel();
      // Send mock notification to preview
      notifier.notify({
        title: 'Player Subscribed',
        message: `You will be notified when ${player.name} appears in transactions.`,
        sound: true
      });
    }
  }
});

searchResultsList.key(['escape'], () => {
  searchInput.focus();
});

// Subscribed list - remove player
subscribedList.on('select', (item, index) => {
  if (subscribedPlayers[index]) {
    removeSubscription(subscribedPlayers[index].id);
    renderSubscriptionPanel();
  }
});

subscribedList.key(['escape', 'd', 'backspace'], () => {
  const index = subscribedList.selected;
  if (subscribedPlayers[index]) {
    removeSubscription(subscribedPlayers[index].id);
    renderSubscriptionPanel();
  }
});

subscribedList.key(['tab'], () => {
  searchInput.focus();
});

function updateMenu() {
  const scoresStyle = mainView === 'scores' ? '{bold}{white-bg}{black-fg}' : '{white-fg}';
  const scoresEnd = mainView === 'scores' ? '{/black-fg}{/white-bg}{/bold}' : '{/white-fg}';
  const standingsStyle = mainView === 'standings' ? '{bold}{white-bg}{black-fg}' : '{white-fg}';
  const standingsEnd = mainView === 'standings' ? '{/black-fg}{/white-bg}{/bold}' : '{/white-fg}';
  const newsStyle = mainView === 'tradeNews' ? '{bold}{white-bg}{black-fg}' : '{white-fg}';
  const newsEnd = mainView === 'tradeNews' ? '{/black-fg}{/white-bg}{/bold}' : '{/white-fg}';

  menuBar.setContent(` ${scoresStyle} [1] Scores ${scoresEnd}  ${standingsStyle} [2] Standings ${standingsEnd}  ${newsStyle} [3] Transactions ${newsEnd}`);
  screen.render();
}

async function fetchScores() {
  try {
    const response = await fetch(NBA_API_URL);
    if (!response.ok) throw new Error(`HTTP error: ${response.status}`);
    return await response.json();
  } catch (error) {
    return null;
  }
}

async function fetchBoxScore(gameId) {
  try {
    const url = BOXSCORE_URL.replace('GAMEID', gameId);
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP error: ${response.status}`);
    return await response.json();
  } catch (error) {
    return null;
  }
}

async function fetchPlayByPlay(gameId) {
  try {
    const url = PLAYBYPLAY_URL.replace('GAMEID', gameId);
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP error: ${response.status}`);
    return await response.json();
  } catch (error) {
    return null;
  }
}

async function fetchStandings() {
  try {
    const response = await fetch(ESPN_STANDINGS_URL);
    if (!response.ok) throw new Error(`HTTP error: ${response.status}`);
    return await response.json();
  } catch (error) {
    return null;
  }
}

function getTransactionsUrl() {
  const today = new Date();
  const threeMonthsAgo = new Date(today);
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

  const formatDate = (d) => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}${month}${day}`;
  };

  const startDate = formatDate(threeMonthsAgo);
  const endDate = formatDate(today);

  return `${ESPN_TRANSACTIONS_BASE_URL}?dates=${startDate}-${endDate}&limit=500`;
}

async function fetchTradeNews() {
  try {
    const url = getTransactionsUrl();
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP error: ${response.status}`);
    return await response.json();
  } catch (error) {
    return null;
  }
}

function parseGameClock(clockStr) {
  if (!clockStr) return { minutes: 0, seconds: 0 };
  const isoMatch = clockStr.match(/PT(\d+)M([\d.]+)S/);
  if (isoMatch) {
    return { minutes: parseInt(isoMatch[1]) || 0, seconds: parseFloat(isoMatch[2]) || 0 };
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
      if (period === 2) return `{yellow-fg}Halftime{/yellow-fg}`;
      else if (period <= 4) return `{yellow-fg}End of Q${period}{/yellow-fg}`;
      else return `{yellow-fg}End of OT${period - 4}{/yellow-fg}`;
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
  return `${parts[0][0]}. ${parts.slice(1).join(' ')}`;
}

function getGameMVP(game) {
  const leaders = game.gameLeaders;
  if (!leaders || game.gameStatus === 1) return null;
  const homeLeader = leaders.homeLeaders;
  const awayLeader = leaders.awayLeaders;
  if (!homeLeader?.points || !awayLeader?.points) return null;

  const homePts = parseInt(homeLeader.points) || 0;
  const awayPts = parseInt(awayLeader.points) || 0;
  const leader = homePts >= awayPts ? homeLeader : awayLeader;
  const team = homePts >= awayPts ? game.homeTeam.teamTricode : game.awayTeam.teamTricode;

  return {
    name: formatPlayerName(leader.name),
    jerseyNum: leader.jerseyNum || '',
    team,
    pts: parseInt(leader.points) || 0,
    reb: parseInt(leader.rebounds) || 0,
    ast: parseInt(leader.assists) || 0
  };
}

function stripTags(str) {
  return str.replace(/\{[^}]+\}/g, '');
}

function padWithTags(str, width) {
  const plainLen = stripTags(str).length;
  return str + ' '.repeat(Math.max(0, width - plainLen));
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
    const jerseyStr = mvp.jerseyNum ? ` #${mvp.jerseyNum}` : '';
    mvpCol = `{yellow-fg}${mvp.name}${jerseyStr} - ${mvp.team} (${stats.slice(0, 3).join(', ')}){/yellow-fg}`;
  }

  return { scoreCol, status, mvpCol };
}

function renderScoresView() {
  const data = scoresData;
  if (!data) {
    gameList.setItems(['{red-fg}Failed to fetch scores. Retrying...{/red-fg}']);
    screen.render();
    return;
  }

  const games = data.scoreboard.games;
  currentGames = games;
  const gameDate = data.scoreboard.gameDate;

  header.setContent(`{center}NBA Scores - ${gameDate}{/center}`);

  if (games.length === 0) {
    gameList.setItems(['No games scheduled for today.']);
    screen.render();
    return;
  }

  const tableWidth = 90;
  const leftPad = Math.max(0, Math.floor((screen.width - tableWidth) / 2));
  const pad = ' '.repeat(leftPad);

  const headerRow = `${pad}{bold}${'SCORE'.padEnd(30)}${'STATUS'.padEnd(24)}${'TOP PERFORMER'}{/bold}`;
  const separator = `${pad}{gray-fg}${'─'.repeat(tableWidth)}{/gray-fg}`;

  const items = [headerRow, separator];

  for (const game of games) {
    const row = buildGameRow(game);
    const scoreFormatted = padWithTags(row.scoreCol, 30);
    const statusFormatted = padWithTags(row.status, 24);
    items.push(`${pad}${scoreFormatted}${statusFormatted}${row.mvpCol}`);
  }

  const prevSelected = gameList.selected;
  gameList.setItems(items);
  gameList.select(Math.max(2, prevSelected)); // Skip header rows
  screen.render();
}

function renderStandingsView() {
  const data = standingsData;

  header.setContent(`{center}NBA Standings - 2025-26 Season{/center}`);

  if (!data) {
    standingsContent.setContent('\n{center}{red-fg}Loading standings...{/red-fg}{/center}');
    screen.render();
    return;
  }

  const conferences = data.children;
  if (!conferences || conferences.length === 0) {
    standingsContent.setContent('\n{center}{red-fg}No standings data available{/red-fg}{/center}');
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
      const winsRaw = stats.find(s => s.name === 'wins')?.value;
      const lossesRaw = stats.find(s => s.name === 'losses')?.value;
      const winPctRaw = stats.find(s => s.name === 'winPercent')?.value;

      const teamData = {
        teamAbbr,
        wins: Math.floor(toNumber(winsRaw, 0)),
        losses: Math.floor(toNumber(lossesRaw, 0)),
        winPct: formatWinPct(winPctRaw)
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

  const centerText = (text, width) => {
    const leftPadding = Math.floor((width - text.length) / 2);
    const rightPadding = width - text.length - leftPadding;
    return ' '.repeat(leftPadding) + text + ' '.repeat(rightPadding);
  };

  let content = '\n';
  content += `${pad}{bold}{cyan-fg}${centerText('EASTERN CONFERENCE', colWidth)}    ${centerText('WESTERN CONFERENCE', colWidth)}{/cyan-fg}{/bold}\n`;
  const headerRow = ' #  TEAM   W-L   PCT   GB';
  content += `${pad}{gray-fg}${headerRow.padEnd(colWidth)}    ${headerRow}{/gray-fg}\n`;
  content += `${pad}{gray-fg}${'─'.repeat(colWidth)}    ${'─'.repeat(colWidth)}{/gray-fg}\n`;

  const maxTeams = Math.max(eastTeams.length, westTeams.length);
  for (let i = 0; i < Math.min(maxTeams, 15); i++) {
    const eastTeam = eastTeams[i];
    const westTeam = westTeams[i];

    const eastHighlight = i < 6 ? '{green-fg}' : i < 10 ? '{yellow-fg}' : '{white-fg}';
    const eastEnd = i < 6 ? '{/green-fg}' : i < 10 ? '{/yellow-fg}' : '{/white-fg}';
    const westHighlight = i < 6 ? '{green-fg}' : i < 10 ? '{yellow-fg}' : '{white-fg}';
    const westEnd = i < 6 ? '{/green-fg}' : i < 10 ? '{/yellow-fg}' : '{/white-fg}';

    const rank = String(i + 1).padEnd(2);

    let eastCol = '';
    if (eastTeam) {
      const record = `${eastTeam.wins}-${eastTeam.losses}`;
      const gb = i === 0 ? '-   ' : ((eastLeader.wins - eastTeam.wins + eastTeam.losses - eastLeader.losses) / 2).toFixed(1).padEnd(4);
      eastCol = `${eastHighlight}${rank}. ${eastTeam.teamAbbr.padEnd(4)} ${record.padEnd(5)}  ${eastTeam.winPct}  ${gb}${eastEnd}`;
    }

    let westCol = '';
    if (westTeam) {
      const record = `${westTeam.wins}-${westTeam.losses}`;
      const gb = i === 0 ? '-   ' : ((westLeader.wins - westTeam.wins + westTeam.losses - westLeader.losses) / 2).toFixed(1).padEnd(4);
      westCol = `${westHighlight}${rank}. ${westTeam.teamAbbr.padEnd(4)} ${record.padEnd(5)}  ${westTeam.winPct}  ${gb}${westEnd}`;
    }

    const eastPlain = stripTags(eastCol);
    const eastPadded = eastCol + ' '.repeat(Math.max(0, colWidth - eastPlain.length));

    content += `${pad}${eastPadded}    ${westCol}\n`;
  }

  const legendPlain = 'GB = Games Behind | Green: Playoff (1-6) | Yellow: Play-in (7-10) | White: Lottery';
  const legendPad = ' '.repeat(Math.max(0, Math.floor((screen.width - legendPlain.length) / 2)));
  content += `\n${legendPad}{gray-fg}GB = Games Behind | {/gray-fg}{green-fg}Green{/green-fg}{gray-fg}: Playoff (1-6) | {/gray-fg}{yellow-fg}Yellow{/yellow-fg}{gray-fg}: Play-in (7-10) | {/gray-fg}{white-fg}White{/white-fg}{gray-fg}: Lottery{/gray-fg}\n`;

  standingsContent.setContent(content);
  screen.render();
}

function renderTradeNewsView() {
  const data = tradeNewsData;

  const season = data?.season?.displayName || '2025-26';
  header.setContent(`{center}NBA Transactions - ${season} Season{/center}`);

  if (!data) {
    transactionsLeftPanel.setContent('\n{center}{red-fg}Loading transactions...{/red-fg}{/center}');
    screen.render();
    return;
  }

  const transactions = data.transactions;
  if (!transactions || transactions.length === 0) {
    transactionsLeftPanel.setContent('\n{center}{gray-fg}No recent transactions{/gray-fg}{/center}');
    screen.render();
    return;
  }

  const pad = ' ';

  // Group all transactions by date
  const txByDate = new Map();

  for (const tx of transactions) {
    const desc = tx.description;
    const teamAbbr = normalizeTeamAbbr(tx.team?.abbreviation || '');
    const date = tx.date;
    const dateKey = date.split('T')[0];

    if (!txByDate.has(dateKey)) {
      txByDate.set(dateKey, []);
    }
    txByDate.get(dateKey).push({ desc, teamAbbr, date });
  }

  let content = '\n';

  // Sort dates descending (most recent first)
  const sortedDates = Array.from(txByDate.keys()).sort((a, b) => b.localeCompare(a));

  for (const dateKey of sortedDates) {
    const txList = txByDate.get(dateKey);
    const date = new Date(dateKey + 'T12:00:00Z');
    const dateStr = date.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric'
    });

    content += `${pad}{bold}{white-fg}${dateStr}{/white-fg}{/bold}\n`;
    content += `${pad}{gray-fg}${'─'.repeat(60)}{/gray-fg}\n`;

    for (const tx of txList) {
      // Color code by transaction type
      let typeColor = '{white-fg}';
      let typeEnd = '{/white-fg}';
      if (tx.desc.includes('Acquired')) {
        typeColor = '{yellow-fg}';
        typeEnd = '{/yellow-fg}';
      } else if (tx.desc.includes('Waived')) {
        typeColor = '{red-fg}';
        typeEnd = '{/red-fg}';
      } else if (tx.desc.includes('Signed')) {
        typeColor = '{green-fg}';
        typeEnd = '{/green-fg}';
      }

      content += `${pad}  {cyan-fg}${tx.teamAbbr.padEnd(4)}{/cyan-fg} ${typeColor}${tx.desc}${typeEnd}\n`;
    }

    content += '\n';
  }

  transactionsLeftPanel.setContent(content);
  screen.render();
}

function renderSubscriptionPanel() {
  // Update subscribed players list
  if (subscribedPlayers.length === 0) {
    subscribedList.setItems(['{gray-fg}No players subscribed{/gray-fg}', '{gray-fg}Search below to add{/gray-fg}']);
  } else {
    const items = subscribedPlayers.map(p => `{yellow-fg}${p.name}{/yellow-fg}`);
    subscribedList.setItems(items);
  }

  // Update search results
  if (searchResults.length === 0) {
    searchResultsList.setItems(['{gray-fg}Type to search players{/gray-fg}']);
  } else {
    const items = searchResults.map(p => {
      const subscribed = subscribedPlayers.find(s => s.id === p.id);
      return subscribed ? `{green-fg}✓{/green-fg} ${p.name}` : `  ${p.name}`;
    });
    searchResultsList.setItems(items);
  }

  screen.render();
}

function updateTransactionsPanelFocus() {
  if (transactionsFocusLeft) {
    transactionsLeftPanel.style.border.fg = 'yellow';
    transactionsRightPanel.style.border.fg = 'gray';
    transactionsLeftPanel.focus();
  } else {
    transactionsLeftPanel.style.border.fg = 'cyan';
    transactionsRightPanel.style.border.fg = 'yellow';
    searchInput.focus();
  }
  screen.render();
}

function renderGameFlow(boxScore, playByPlay) {
  const game = boxScore.game;
  const homeTeam = game.homeTeam.teamTricode;
  const awayTeam = game.awayTeam.teamTricode;

  // Extract score difference data from play-by-play
  const diffData = []; // { time: 0-1 normalized, diff: homeScore - awayScore }
  diffData.push({ time: 0, diff: 0 });

  let leadChanges = 0;
  let lastLead = 0;
  const numPeriods = Math.max(4, game.homeTeam.periods?.length || 4);
  const totalGameMinutes = numPeriods * 12;

  if (playByPlay?.game?.actions) {
    let lastHomeScore = 0, lastAwayScore = 0;
    const rawMinuteData = new Map(); // minute -> latest diff

    for (const action of playByPlay.game.actions) {
      if (action.scoreHome !== undefined && action.scoreAway !== undefined) {
        const homeScore = parseInt(action.scoreHome) || 0;
        const awayScore = parseInt(action.scoreAway) || 0;

        // Even if score didn't change, we want to know the score at this time
        lastHomeScore = homeScore;
        lastAwayScore = awayScore;

        const period = action.period || 1;
        const clock = action.clock || 'PT12M00.00S';

        const clockMatch = clock.match(/PT(\d+)M([\d.]+)S/);
        let minutesLeft = 12, secondsLeft = 0;
        if (clockMatch) {
          minutesLeft = parseInt(clockMatch[1]) || 0;
          secondsLeft = parseFloat(clockMatch[2]) || 0;
        }

        const periodStartMinute = (period - 1) * 12;
        const minutesElapsedInPeriod = 12 - minutesLeft - secondsLeft / 60;
        const totalMinutesElapsed = periodStartMinute + minutesElapsedInPeriod;

        const minuteKey = Math.floor(totalMinutesElapsed);
        const diff = homeScore - awayScore;

        if ((lastLead > 0 && diff < 0) || (lastLead < 0 && diff > 0)) {
          leadChanges++;
        }
        if (diff !== 0) lastLead = diff;

        rawMinuteData.set(minuteKey, diff);
      }
    }

    // Fill every minute from 0 to current max minute or totalGameMinutes
    let currentDiff = 0;
    const maxMinute = Math.max(...Array.from(rawMinuteData.keys()), 0);
    // If the game is finished, we go up to totalGameMinutes.
    // If it's live, we might go up to the latest action's minute.
    const endMinute = game.gameStatus === 3 ? totalGameMinutes : maxMinute;

    for (let m = 0; m <= endMinute; m++) {
      if (rawMinuteData.has(m)) {
        currentDiff = rawMinuteData.get(m);
      }
      diffData.push({ time: m / totalGameMinutes, diff: currentDiff, minute: m });
    }
  } else {
    // If no play-by-play yet, just show start
    diffData.push({ time: 0, diff: 0, minute: 0 });
  }

  // Calculate Y-axis range based on actual data
  const diffs = diffData.map(d => d.diff);
  const dataMax = Math.max(...diffs, 0);
  const dataMin = Math.min(...diffs, 0);

  // Add small padding and ensure at least some range
  const maxAbsDiff = Math.max(Math.abs(dataMax), Math.abs(dataMin));
  const interval = maxAbsDiff > 20 ? 4 : 2;

  const yMax = Math.ceil(Math.max(dataMax, 1) / interval) * interval;
  const yMin = Math.floor(Math.min(dataMin, -1) / interval) * interval;

  // chartHeight in terms of rows, each row represents 'interval' points
  const chartHeight = ((yMax - yMin) / interval) + 1;
  // Make the chart width more compact
  const maxPossibleWidth = gameFlowBox.width - 15;
  const compactWidth = totalGameMinutes * 1.8; // Use 1.8 characters per minute as requested
  const chartWidth = Math.floor(Math.min(maxPossibleWidth, compactWidth));

  // Create chart grid
  const chart = new Array(chartHeight).fill(null).map(() => new Array(chartWidth).fill(' '));

  // Plot points (single data point per x-axis point)
  // Since we now have minute-by-minute data, we can plot each minute
  for (const data of diffData) {
    const x = Math.floor(data.time * (chartWidth - 1));
    // Normalize diff to the nearest interval for plotting
    const normalizedDiff = Math.round(data.diff / interval) * interval;
    const y = (yMax - normalizedDiff) / interval;

    if (y >= 0 && y < chartHeight && x >= 0 && x < chartWidth) {
      // Clear the column first to ensure only one point per x
      for (let row = 0; row < chartHeight; row++) {
        chart[row][x] = ' ';
      }
      chart[y][x] = '○';
    }
  }

  // Find y-coordinate for zero line
  const yZero = yMax / interval;

  // Build content
  let content = '\n';

  const homeColor = TEAM_COLORS[homeTeam] || '{green-fg}';
  const awayColor = TEAM_COLORS[awayTeam] || '{red-fg}';
  const homeColorTag = homeColor.startsWith('#') ? `{${homeColor}-fg}` : homeColor;
  const awayColorTag = awayColor.startsWith('#') ? `{${awayColor}-fg}` : awayColor;

  content += `  {yellow-fg}${leadChanges} Lead Changes{/yellow-fg}  |  ${homeColorTag}○${homeColorTag === homeColor ? '' : '{/}'} ${homeTeam} leading  |  ${awayColorTag}○${awayColorTag === awayColor ? '' : '{/}'} ${awayTeam} leading\n\n`;

  // Draw chart with Y-axis (dynamic interval)
  for (let y = 0; y < chartHeight; y++) {
    const diffValue = yMax - (y * interval);
    const labelStr = diffValue === 0 ? '  0' : (diffValue > 0 ? `+${diffValue}` : String(diffValue));
    const labelDisplay = labelStr.padStart(4);

    content += ` ${labelDisplay} │`;

    for (let x = 0; x < chartWidth; x++) {
      const char = chart[y][x];
      if (char === '○') {
        // 4. Find a way to let user know who is leading
        // If diff > 0, home team leads. If diff < 0, away team leads.
        if (y < yZero) {
          // Home leading (positive diff)
          content += `${homeColorTag}${char}${homeColorTag === homeColor ? '' : '{/}'}`;
        } else if (y > yZero) {
          // Away leading (negative diff)
          content += `${awayColorTag}${char}${awayColorTag === awayColor ? '' : '{/}'}`;
        } else {
          // Tied
          content += `{white-fg}${char}{/white-fg}`;
        }
      } else if (y === yZero) {
        // 1. add vertical line in grey in y=0 (Horizontal line at y=0)
        content += `{gray-fg}─{/gray-fg}`;
      } else {
        content += ' ';
      }
    }
    content += '\n';
  }

  // X-axis
  content += `      └${'─'.repeat(chartWidth)}\n`;

  // X-axis labels (Q1, Q2, Q3, Q4, OT1, OT2...)
  const labelRow = new Array(chartWidth + 10).fill(' ');
  const labels = [
    { name: 'Q1', minute: 0 },
    { name: 'Q2', minute: 12 },
    { name: 'Q3', minute: 24 },
    { name: 'Q4', minute: 36 }
  ];

  if (totalGameMinutes > 48) {
    let otMinute = 48;
    let otCount = 1;
    while (otMinute < totalGameMinutes) {
      labels.push({ name: `OT${otCount}`, minute: otMinute });
      otMinute += 5;
      otCount++;
    }
  }

  for (const label of labels) {
    const x = Math.floor((label.minute / totalGameMinutes) * (chartWidth - 1));
    if (x >= 0 && x < chartWidth) {
      const pos = x + 7; // Offset for '      └'
      const labelStr = label.name;
      for (let i = 0; i < labelStr.length; i++) {
        if (pos + i < labelRow.length) {
          labelRow[pos + i] = labelStr[i];
        }
      }
    }
  }
  content += labelRow.join('').trimEnd() + '\n';

  // Add recent play-by-play actions
  if (playByPlay?.game?.actions) {
    content += '\n  {bold}Recent Plays:{/bold}\n';
    content += `  ${'─'.repeat(chartWidth)}\n`;

    const actions = [...playByPlay.game.actions].reverse().slice(0, 5); // Show latest 5
    for (const action of actions) {
      if (action.description) {
        const clock = action.clock ? action.clock.match(/PT(\d+)M([\d.]+)S/) : null;
        let timeStr = '';
        if (clock) {
          const min = clock[1].padStart(2, '0');
          const sec = Math.floor(parseFloat(clock[2])).toString().padStart(2, '0');
          timeStr = `{gray-fg}[Q${action.period} ${min}:${sec}]{/gray-fg}`;
        }
        const scoreStr = action.scoreHome !== undefined ? `{cyan-fg}${action.scoreAway}-${action.scoreHome}{/cyan-fg}` : '';
        content += `  ${timeStr} ${scoreStr.padEnd(15)} ${action.description}\n`;
      }
    }
  }

  gameFlowBox.setContent(content);
  gameFlowBox.scrollTo(0);
}

function renderBoxScore(boxScore) {
  const game = boxScore.game;

  const formatPlayerStats = (players, teamAbbr) => {
    let content = `\n  {bold}{cyan-fg}${teamAbbr}{/bold}{/cyan-fg}\n`;
    content += `  {bold}${'PLAYER'.padEnd(20)}${'MIN'.padStart(6)}${'PTS'.padStart(5)}${'REB'.padStart(5)}${'AST'.padStart(5)}${'STL'.padStart(5)}${'BLK'.padStart(5)}${'FG'.padStart(10)}${'3PT'.padStart(8)}${'FT'.padStart(8)}${'+/-'.padStart(6)}{/bold}\n`;
    content += `  ${'─'.repeat(91)}\n`;

    let playersCount = 0;
    for (const player of players) {
      if (!player.played || player.played === '0') continue;
      playersCount++;
      const stats = player.statistics;
      const playerName = player.name;
      const displayName = formatPlayerName(playerName).padEnd(20).slice(0, 20);
      const min = (stats.minutes || '00:00').replace('PT', '').replace('M', ':').replace('S', '').split('.')[0].padStart(6);
      const pts = stats.points || 0;
      const reb = stats.reboundsTotal || 0;
      const ast = stats.assists || 0;
      const stl = stats.steals || 0;
      const blk = stats.blocks || 0;
      const fg = `${stats.fieldGoalsMade || 0}-${stats.fieldGoalsAttempted || 0}`;
      const tpt = `${stats.threePointersMade || 0}-${stats.threePointersAttempted || 0}`;
      const ft = `${stats.freeThrowsMade || 0}-${stats.freeThrowsAttempted || 0}`;
      const pm = stats.plusMinusPoints || 0;
      const pmStr = pm > 0 ? `+${pm}` : String(pm);

      content += `  ${displayName}${min}${String(pts).padStart(5)}${String(reb).padStart(5)}${String(ast).padStart(5)}${String(stl).padStart(5)}${String(blk).padStart(5)}${fg.padStart(10)}${tpt.padStart(8)}${ft.padStart(8)}${pmStr.padStart(6)}\n`;

      if (playersCount === 5) {
        content += `  {gray-fg}${'─'.repeat(91)}{/gray-fg}\n`;
      }
    }
    return content;
  };

  let content = '';
  content += formatPlayerStats(game.awayTeam.players, game.awayTeam.teamTricode);
  content += '\n';
  content += formatPlayerStats(game.homeTeam.players, game.homeTeam.teamTricode);

  boxScoreBox.setContent(content);
  boxScoreBox.scrollTo(0);
}

async function showDetailView(game) {
  detailView = game.gameId;

  // Hide main views
  menuBar.hide();
  header.hide();
  gameList.hide();
  standingsContent.hide();
  transactionsLeftPanel.hide();
  transactionsRightPanel.hide();
  footer.hide();

  // Show detail view
  detailHeader.show();
  gameFlowBox.show();
  boxScoreBox.show();
  detailFooter.show();

  const row = buildGameRow(game);
  const cleanScoreCol = stripTags(row.scoreCol);
  const cleanStatus = stripTags(row.status);
  detailHeader.setContent(`{center}{white-fg}${cleanScoreCol}  |  ${cleanStatus}{/white-fg}{/center}`);

  gameFlowBox.setContent('\n  Loading game data...');
  boxScoreBox.setContent('\n  Loading box score...');

  // Set initial focus to box score
  detailFocus = 'boxScore';
  updateDetailFocus();

  const [boxScore, playByPlay] = await Promise.all([
    fetchBoxScore(game.gameId),
    fetchPlayByPlay(game.gameId)
  ]);

  if (boxScore) {
    renderGameFlow(boxScore, playByPlay);
    renderBoxScore(boxScore);
  } else {
    gameFlowBox.setContent('\n  {red-fg}Failed to load game data{/red-fg}');
    boxScoreBox.setContent('\n  {red-fg}Failed to load box score{/red-fg}');
  }

  updateDetailFocus();
}

function showListView() {
  detailView = null;

  // Hide detail view
  detailHeader.hide();
  gameFlowBox.hide();
  boxScoreBox.hide();
  detailFooter.hide();

  // Show main views
  menuBar.show();
  header.show();
  footer.show();

  if (mainView === 'scores') {
    gameList.show();
    standingsContent.hide();
    transactionsLeftPanel.hide();
    transactionsRightPanel.hide();
    gameList.focus();
  } else if (mainView === 'standings') {
    gameList.hide();
    standingsContent.show();
    transactionsLeftPanel.hide();
    transactionsRightPanel.hide();
    standingsContent.focus();
  } else {
    gameList.hide();
    standingsContent.hide();
    transactionsLeftPanel.show();
    transactionsRightPanel.show();
    transactionsLeftPanel.focus();
  }

  screen.render();
}

function renderCurrentView() {
  if (mainView === 'scores') {
    gameList.show();
    standingsContent.hide();
    transactionsLeftPanel.hide();
    transactionsRightPanel.hide();
    renderScoresView();
    gameList.focus();
  } else if (mainView === 'standings') {
    gameList.hide();
    standingsContent.show();
    transactionsLeftPanel.hide();
    transactionsRightPanel.hide();
    renderStandingsView();
    standingsContent.focus();
  } else {
    gameList.hide();
    standingsContent.hide();
    transactionsLeftPanel.show();
    transactionsRightPanel.show();
    renderTradeNewsView();
    renderSubscriptionPanel();
    transactionsLeftPanel.focus();
  }
}

function updateFooter() {
  const now = new Date().toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
  const updateIndicator = updateAvailable ? ' | {yellow-fg}[U] Update available{/yellow-fg}' : '';
  if (mainView === 'scores') {
    footer.setContent(`{center}{green-fg}●{/green-fg} ${now} | jk/↑↓ navigate | SPACE details | 1-3 views${updateIndicator} | q quit{/center}`);
  } else if (mainView === 'tradeNews') {
    footer.setContent(`{center}{green-fg}●{/green-fg} ${now} | Tab panels | Enter subscribe${updateIndicator} | q quit{/center}`);
  } else {
    footer.setContent(`{center}{green-fg}●{/green-fg} ${now} | jk/↑↓ scroll | 1-3 views${updateIndicator} | q quit{/center}`);
  }
  screen.render();
}

async function refreshScores() {
  scoresData = await fetchScores();
  if (!detailView && mainView === 'scores') {
    renderScoresView();
  } else if (detailView && scoresData) {
    // Update detail view header with latest score
    const game = scoresData.scoreboard.games.find(g => g.gameId === detailView);
    if (game) {
      const row = buildGameRow(game);
      const cleanScoreCol = stripTags(row.scoreCol);
      const cleanStatus = stripTags(row.status);
      detailHeader.setContent(`{center}{white-fg}${cleanScoreCol}  |  ${cleanStatus}{/white-fg}{/center}`);

      // Update detail view data
      const [boxScore, playByPlay] = await Promise.all([
        fetchBoxScore(detailView),
        fetchPlayByPlay(detailView)
      ]);
      if (boxScore) {
        renderGameFlow(boxScore, playByPlay);
        renderBoxScore(boxScore);
      }
      screen.render();
    }
  }
}

async function refreshStandings() {
  standingsData = await fetchStandings();
  if (!detailView && mainView === 'standings') {
    renderStandingsView();
  }
}

async function refreshTradeNews() {
  tradeNewsData = await fetchTradeNews();

  // Check for subscribed player transactions
  if (tradeNewsData?.transactions) {
    checkSubscribedPlayerTransactions(tradeNewsData.transactions);
  }

  if (!detailView && mainView === 'tradeNews') {
    renderTradeNewsView();
    renderSubscriptionPanel();
  }
}

async function main() {
  loadSubscriptions();
  updateMenu();
  gameList.setItems(['Loading NBA data...']);
  screen.render();

  await Promise.all([refreshScores(), refreshStandings(), refreshTradeNews()]);
  renderCurrentView();

  setInterval(refreshScores, REFRESH_INTERVAL);
  setInterval(refreshStandings, STANDINGS_REFRESH_INTERVAL);
  setInterval(refreshTradeNews, NEWS_REFRESH_INTERVAL);
  setInterval(updateFooter, 1000);
  updateFooter();

  // Check for updates on startup and periodically
  checkForUpdates();
  setInterval(checkForUpdates, UPDATE_CHECK_INTERVAL);

  gameList.focus();
  gameList.select(2); // Start at first game row
}

main();
