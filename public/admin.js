/* ── State ── */
const socket = io();
let adminPassword = null;
let currentState = null;

/* ── DOM refs ── */
const loginGate       = document.getElementById('login-gate');
const dashboard       = document.getElementById('dashboard');
const adminPwdInput   = document.getElementById('admin-password');
const adminLoginBtn   = document.getElementById('admin-login-btn');
const adminLoginError = document.getElementById('admin-login-error');

const positionTitle    = document.getElementById('position-title');
const positionProgress = document.getElementById('position-progress');
const voteCounter      = document.getElementById('vote-counter');
const statusMessage    = document.getElementById('status-message');

const btnOpenVoting   = document.getElementById('btn-open-voting');
const btnCloseVoting  = document.getElementById('btn-close-voting');
const btnReopenVoting = document.getElementById('btn-reopen-voting');
const btnReset        = document.getElementById('btn-reset');
const liveTally       = document.getElementById('live-tally');
const tallyBody       = document.getElementById('tally-body');

const resultsList    = document.getElementById('results-list');
const completeBanner = document.getElementById('complete-banner');

/* ── Login ── */
adminLoginBtn.addEventListener('click', () => {
  const pwd = adminPwdInput.value.trim();
  if (!pwd) return;
  adminPassword = pwd;
  socket.emit('admin:getState', pwd);
});

adminPwdInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') adminLoginBtn.click();
});

/* ── Controls ── */
btnOpenVoting.addEventListener('click', () => {
  socket.emit('admin:openVoting', adminPassword);
});

btnCloseVoting.addEventListener('click', () => {
  if (confirm('Close voting and tally the results now?')) {
    socket.emit('admin:closeVoting', adminPassword);
  }
});

btnReopenVoting.addEventListener('click', () => {
  if (confirm('Re-open voting for this position? Current votes will be cleared.')) {
    socket.emit('admin:reopenVoting', adminPassword);
  }
});

btnReset.addEventListener('click', () => {
  if (confirm('Reset the entire election? This cannot be undone.')) {
    socket.emit('admin:reset', adminPassword);
  }
});

/* ── Socket events ── */
socket.on('adminState', (state) => {
  loginGate.classList.add('hidden');
  dashboard.classList.remove('hidden');
  adminLoginError.classList.add('hidden');
  currentState = state;
  renderDashboard(state);
});

socket.on('adminTallyUpdate', ({ votes, votersWhoVoted }) => {
  liveTally.classList.remove('hidden');
  renderTally(votes, currentState ? currentState.candidates : []);
  if (currentState) {
    currentState.votes = votes;
    currentState.votersWhoVoted = votersWhoVoted;
    currentState.voteCount = votersWhoVoted.length;
    voteCounter.textContent = `${votersWhoVoted.length} / ${currentState.totalVoters} votes cast`;
  }
});

socket.on('error', () => {
  adminLoginError.classList.remove('hidden');
  adminPassword = null;
});

/* ── Renderers ── */
function renderDashboard(state) {
  renderPositionBanner(state);
  refreshControls(state);
  renderResults(state);
  if (state.votes) renderTally(state.votes, state.candidates);
  if (state.electionComplete) completeBanner.classList.remove('hidden');
}

function renderPositionBanner(state) {
  if (state.electionComplete) {
    positionTitle.textContent = 'Election Complete!';
    positionProgress.textContent = `All ${state.totalPositions} positions filled`;
    voteCounter.textContent = '';
    return;
  }
  const suffix = state.isTiebreaker ? ' — Tiebreaker' : '';
  positionTitle.textContent = (state.currentPosition || '—') + suffix;
  positionProgress.textContent = `Position ${state.currentPositionIndex + 1} of ${state.totalPositions}`;
  voteCounter.textContent = state.votingOpen
    ? `${state.voteCount} / ${state.totalVoters} votes cast`
    : 'Voting closed';
}

function refreshControls(state) {
  if (state.electionComplete) {
    btnOpenVoting.disabled = true;
    btnCloseVoting.disabled = true;
    btnReopenVoting.classList.add('hidden');
    liveTally.classList.add('hidden');
    showStatus('Election is complete. All positions have been filled.', 'success');
    return;
  }
  if (state.votingOpen) {
    btnOpenVoting.disabled = true;
    btnCloseVoting.disabled = false;
    btnReopenVoting.classList.add('hidden');
    liveTally.classList.remove('hidden');
    renderTally(state.votes || {}, state.candidates);
    const openMsg = state.isTiebreaker
      ? `Tiebreaker round open for: ${state.currentPosition}`
      : `Voting is open for: ${state.currentPosition}`;
    showStatus(openMsg, 'info');
  } else {
    btnOpenVoting.disabled = false;
    btnCloseVoting.disabled = true;
    if (state.isTiebreaker) {
      btnReopenVoting.classList.add('hidden');
      const names = state.tiedCandidates.join(', ');
      showStatus(`Tie detected between: ${names}. Open voting to start the tiebreaker round.`, 'error');
    } else {
      if (state.results && state.results.length > 0) {
        btnReopenVoting.classList.remove('hidden');
      }
      showStatus('Voting is closed. Open voting to begin the next round.', 'warning');
    }
    liveTally.classList.add('hidden');
  }
}

function renderResults(state) {
  if (!state.results || state.results.length === 0) {
    resultsList.innerHTML = '<p class="hint">Results will appear here as positions are filled.</p>';
    return;
  }
  resultsList.innerHTML = '';
  state.results.forEach((r, i) => {
    const item = document.createElement('div');
    item.className = 'result-item fadeIn';
    item.innerHTML = `
      <div><div class="result-badge">#${i + 1}</div></div>
      <div>
        <div class="result-position">${r.position}</div>
        <div class="result-winner">${r.winner}</div>
      </div>`;
    resultsList.appendChild(item);
  });
}

function renderTally(votes, candidates) {
  tallyBody.innerHTML = '';
  if (!candidates || candidates.length === 0) return;
  const maxVotes = Math.max(0, ...Object.values(votes));
  candidates.forEach((name) => {
    const count = votes[name] || 0;
    const tr = document.createElement('tr');
    if (count === maxVotes && count > 0) tr.classList.add('tally-leading');
    tr.innerHTML = `<td>${name}</td><td>${count}</td>`;
    tallyBody.appendChild(tr);
  });
}

function showStatus(msg, type = 'info') {
  statusMessage.textContent = msg;
  statusMessage.className = `status-msg ${type}`;
  statusMessage.classList.remove('hidden');
}
