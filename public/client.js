/* ── State ── */
const socket = io();
let myName = null;
let hasVotedThisRound = false;
let currentState = null;

/* ── DOM refs ── */
const voterSelect        = document.getElementById('voter-select');
const confirmIdentityBtn = document.getElementById('confirm-identity-btn');
const identityConfirmed  = document.getElementById('identity-confirmed');
const identityPanel      = document.getElementById('identity-panel');

const positionTitle    = document.getElementById('position-title');
const positionProgress = document.getElementById('position-progress');
const voteCounter      = document.getElementById('vote-counter');

const statusMessage    = document.getElementById('status-message');
const candidateSection = document.getElementById('candidate-section');
const candidateGrid    = document.getElementById('candidate-grid');

const winnerBanner   = document.getElementById('winner-banner');
const winnerPosition = document.getElementById('winner-position');
const winnerName     = document.getElementById('winner-name');
const completeBanner = document.getElementById('complete-banner');

const resultsList = document.getElementById('results-list');

/* ── Identity ── */
voterSelect.addEventListener('change', () => {
  confirmIdentityBtn.disabled = voterSelect.value === '';
});

confirmIdentityBtn.addEventListener('click', () => {
  if (!voterSelect.value) return;
  myName = voterSelect.value;
  identityConfirmed.textContent = `Logged in as: ${myName}`;
  identityConfirmed.classList.remove('hidden');
  confirmIdentityBtn.disabled = true;
  voterSelect.disabled = true;
  identityPanel.querySelector('h2').textContent = 'Identity Confirmed';
  renderVoterUI(currentState);
});

/* ── Socket events ── */
socket.on('stateUpdate', (state) => {
  currentState = state;
  renderVoterUI(state);
  renderResults(state);
});

socket.on('voteSuccess', (candidate) => {
  hasVotedThisRound = true;
  showStatus(`Your vote for ${candidate} has been recorded.`, 'success');
  renderCandidates(currentState, true);
});

socket.on('voteError', (msg) => {
  showStatus(msg, 'error');
});

/* ── Voter UI renderer ── */
function renderVoterUI(state) {
  if (!state) return;

  if (voterSelect.options.length <= 1 && state.allAttendees) {
    state.allAttendees.forEach((name) => {
      const opt = document.createElement('option');
      opt.value = name;
      opt.textContent = name;
      voterSelect.appendChild(opt);
    });
  }

  if (state.lastWinner && !state.votingOpen) {
    winnerBanner.classList.remove('hidden');
    winnerBanner.classList.add('fadeIn');
    winnerPosition.textContent = state.results.length > 0
      ? state.results[state.results.length - 1].position
      : '';
    winnerName.textContent = state.lastWinner;
  } else {
    winnerBanner.classList.add('hidden');
  }

  if (state.electionComplete) {
    completeBanner.classList.remove('hidden');
    candidateSection.classList.add('hidden');
    positionTitle.textContent = 'Election Complete!';
    positionProgress.textContent = `All ${state.totalPositions} positions filled`;
    voteCounter.textContent = '';
    showStatus('All positions have been filled. Congratulations to all elected officers!', 'success');
    return;
  } else {
    completeBanner.classList.add('hidden');
  }

  positionTitle.textContent = state.currentPosition
    ? `Voting for: ${state.currentPosition}`
    : 'Waiting to begin…';
  positionProgress.textContent = `Position ${state.currentPositionIndex + 1} of ${state.totalPositions}`;
  voteCounter.textContent = state.votingOpen
    ? `${state.voteCount} / ${state.totalVoters} votes cast`
    : '';

  if (state.votingOpen && myName && !state.votersWhoVoted.includes(myName)) {
    hasVotedThisRound = false;
  }

  if (state.votingOpen && myName) {
    candidateSection.classList.remove('hidden');
    renderCandidates(state, hasVotedThisRound);
    const openMsg = state.isTiebreaker
      ? 'Tiebreaker round! Vote again from the candidates below.'
      : 'Voting is open! Select your candidate below.';
    showStatus(openMsg, 'info');
  } else if (!state.votingOpen && !state.electionComplete) {
    candidateSection.classList.add('hidden');
    if (state.isTiebreaker) {
      showStatus('It\'s a tie! A tiebreaker round will begin shortly.', 'warning');
    } else if (myName) {
      showStatus('Waiting for the admin to open voting…', 'warning');
    } else {
      hideStatus();
    }
  }
}

function renderCandidates(state, voted) {
  candidateGrid.innerHTML = '';
  state.candidates.forEach((name) => {
    const btn = document.createElement('button');
    btn.className = 'candidate-btn';
    btn.textContent = name;
    if (voted || !myName) {
      btn.disabled = true;
      if (voted) btn.classList.add('voted');
    } else {
      btn.addEventListener('click', () => castVote(name));
    }
    candidateGrid.appendChild(btn);
  });
}

function castVote(candidate) {
  if (!myName) {
    showStatus('Please select your identity first.', 'error');
    return;
  }
  socket.emit('vote', { voter: myName, candidate });
}

/* ── Results renderer ── */
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

/* ── Status helpers ── */
function showStatus(msg, type = 'info') {
  statusMessage.textContent = msg;
  statusMessage.className = `status-msg ${type}`;
  statusMessage.classList.remove('hidden');
}
function hideStatus() {
  statusMessage.classList.add('hidden');
}
