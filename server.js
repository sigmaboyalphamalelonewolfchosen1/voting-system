const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const ADMIN_PASSWORD = 'admin2025';

const POSITIONS = [
  'President',
  'Vice President',
  'Secretary',
  'Treasurer',
  'Auditor',
  'Board of Directors #1',
  'Board of Directors #2',
  'Board of Directors #3',
  'Board of Directors #4',
  'Board of Directors #5',
  'Board of Directors #6',
];

const ALL_ATTENDEES = [
  'May Therese A. Malongayon',
  'Gregorio P. Lopez, Jr.',
  'Jessie May L. Buctolan',
  'Richelle Vine J. Cadungog',
  'Jose Simeon C. Sindingan',
  'Sharon S. Cadigal',
  'Christopher Severino M. Pastor',
  'Lorenzo C. Tindugan, Jr.',
  'Aubrey V. Bastareche-Lucero',
  'Ethyl Mae Paredes-Vasquez',
  'Jasten Aires Ledesma',
];

function createFreshState() {
  return {
    currentPositionIndex: 0,
    remainingCandidates: [...ALL_ATTENDEES],
    votes: {},
    votersWhoVoted: [],
    results: [],
    votingOpen: false,
    electionComplete: false,
    lastWinner: null,
    isTiebreaker: false,
    tiedCandidates: [],
  };
}

let state = createFreshState();

function getPublicState(isAdmin = false) {
  const base = {
    currentPosition: POSITIONS[state.currentPositionIndex] || null,
    currentPositionIndex: state.currentPositionIndex,
    totalPositions: POSITIONS.length,
    candidates: state.isTiebreaker ? state.tiedCandidates : state.remainingCandidates,
    votingOpen: state.votingOpen,
    voteCount: state.votersWhoVoted.length,
    totalVoters: state.remainingCandidates.length,
    votersWhoVoted: state.votersWhoVoted,
    results: state.results,
    electionComplete: state.electionComplete,
    lastWinner: state.lastWinner,
    isTiebreaker: state.isTiebreaker,
    tiedCandidates: state.tiedCandidates,
    allAttendees: ALL_ATTENDEES,
  };
  if (isAdmin) {
    base.votes = state.votes;
  }
  return base;
}

function tallyVotes() {
  const tally = state.votes;
  const pool = state.isTiebreaker ? state.tiedCandidates : state.remainingCandidates;
  if (Object.keys(tally).length === 0) return { winner: null, tied: [] };
  const maxVotes = Math.max(...pool.map(c => tally[c] || 0));
  if (maxVotes === 0) return { winner: null, tied: [] };
  const tied = pool.filter(c => (tally[c] || 0) === maxVotes);
  return tied.length > 1 ? { winner: null, tied } : { winner: tied[0], tied: [] };
}

app.use(express.static(path.join(__dirname, 'public')));

io.on('connection', (socket) => {
  socket.emit('stateUpdate', getPublicState(false));

  socket.on('admin:openVoting', (password) => {
    if (password !== ADMIN_PASSWORD) {
      socket.emit('error', 'Invalid admin password.');
      return;
    }
    if (state.electionComplete) return;
    state.votingOpen = true;
    state.votes = {};
    state.votersWhoVoted = [];
    if (!state.isTiebreaker) state.lastWinner = null;
    io.emit('stateUpdate', getPublicState(false));
    socket.emit('adminState', getPublicState(true));
  });

  socket.on('admin:closeVoting', (password) => {
    if (password !== ADMIN_PASSWORD) {
      socket.emit('error', 'Invalid admin password.');
      return;
    }
    if (!state.votingOpen) return;
    state.votingOpen = false;

    const { winner, tied } = tallyVotes();
    if (tied.length > 1) {
      state.isTiebreaker = true;
      state.tiedCandidates = tied;
      state.lastWinner = null;
      state.votes = {};
      state.votersWhoVoted = [];
    } else if (winner) {
      state.isTiebreaker = false;
      state.tiedCandidates = [];
      state.lastWinner = winner;
      state.results.push({
        position: POSITIONS[state.currentPositionIndex],
        winner,
        votes: { ...state.votes },
      });
      state.remainingCandidates = state.remainingCandidates.filter((c) => c !== winner);
      state.currentPositionIndex += 1;
      if (state.currentPositionIndex >= POSITIONS.length) {
        state.electionComplete = true;
      }
    }

    io.emit('stateUpdate', getPublicState(false));
    socket.emit('adminState', getPublicState(true));
  });

  socket.on('admin:reopenVoting', (password) => {
    if (password !== ADMIN_PASSWORD) {
      socket.emit('error', 'Invalid admin password.');
      return;
    }
    if (state.electionComplete) return;
    state.isTiebreaker = false;
    state.tiedCandidates = [];
    state.votingOpen = true;
    state.votes = {};
    state.votersWhoVoted = [];
    io.emit('stateUpdate', getPublicState(false));
    socket.emit('adminState', getPublicState(true));
  });

  socket.on('admin:getState', (password) => {
    if (password !== ADMIN_PASSWORD) {
      socket.emit('error', 'Invalid admin password.');
      return;
    }
    socket.emit('adminState', getPublicState(true));
  });

  socket.on('admin:reset', (password) => {
    if (password !== ADMIN_PASSWORD) {
      socket.emit('error', 'Invalid admin password.');
      return;
    }
    state = createFreshState();
    io.emit('stateUpdate', getPublicState(false));
    socket.emit('adminState', getPublicState(true));
  });

  socket.on('vote', ({ voter, candidate }) => {
    if (!state.votingOpen) {
      socket.emit('voteError', 'Voting is not open right now.');
      return;
    }
    if (!ALL_ATTENDEES.includes(voter)) {
      socket.emit('voteError', 'Unrecognized voter identity.');
      return;
    }
    const validCandidates = state.isTiebreaker ? state.tiedCandidates : state.remainingCandidates;
    if (!validCandidates.includes(candidate)) {
      socket.emit('voteError', 'Invalid candidate.');
      return;
    }
    if (state.votersWhoVoted.includes(voter)) {
      socket.emit('voteError', 'You have already voted in this round.');
      return;
    }

    state.votes[candidate] = (state.votes[candidate] || 0) + 1;
    state.votersWhoVoted.push(voter);

    socket.emit('voteSuccess', candidate);
    io.emit('stateUpdate', getPublicState(false));

    // Broadcast updated tally to all admin sockets (those who have authenticated)
    io.emit('adminTallyUpdate', { votes: state.votes, votersWhoVoted: state.votersWhoVoted });
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log('');
  console.log('==============================================');
  console.log('   EMPLOYEES UNION VOTING SYSTEM');
  console.log('==============================================');
  console.log(`   Server running at: http://localhost:${PORT}`);
  console.log(`   Admin password:    admin2025`);
  console.log('==============================================');
  console.log('');
});
