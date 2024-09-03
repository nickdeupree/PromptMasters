const socket = io();

const roomSetupDiv = document.getElementById('room-setup');
const gameControlsDiv = document.getElementById('game-controls');
const gameAreaDiv = document.getElementById('game-area');
const pairPromptDiv = document.getElementById('pair-prompt');
const imageGenerationDiv = document.getElementById('image-generation');
const generatedImageDiv = document.getElementById('generated-image');
const submitImageButton = document.getElementById('submit-image');
const votingAreaDiv = document.getElementById('voting-area');
const voteImagesDiv = document.getElementById('vote-images');
const resultsDiv = document.getElementById('results');
const winnerSpan = document.getElementById('winner');
const playerListDiv = document.getElementById('player-list');
const resultsContinueButton = document.getElementById('results-continue-button');
const leaderboardDiv = document.getElementById('leaderboard');
const leaderboardContinueButton = document.getElementById('leaderboard-continue-button');
const leaderboardList = document.getElementById('leaderboard-list');
const winnerDiv = document.getElementById('final-winner-section');
const winner = document.getElementById('final-winner');
const newGameButton = document.getElementById('new-game-button');
const maxRoundsDropDown = document.getElementById('max-rounds');
const bonusAmountDropDown = document.getElementById('bonus-amount');
const maxGenerationsDropDown = document.getElementById('max-generations');

function emitOptionChange() {
    const maxRounds = parseInt(maxRoundsDropDown.value, 10);
    const bonusAmount = parseInt(bonusAmountDropDown.value, 10);
    const maxGenerations = parseInt(maxGenerationsDropDown.value, 10);
    socket.emit('option_change', {roomId: currentRoomId, maxRounds, bonusAmount, maxGenerations});
}

maxRoundsDropDown.addEventListener('change', emitOptionChange);
bonusAmountDropDown.addEventListener('change', emitOptionChange);
maxGenerationsDropDown.addEventListener('change', emitOptionChange);

socket.on('update_options', ({ maxRounds, bonusAmount, maxGenerations }) => {
    maxRoundsDropDown.value = maxRounds;
    bonusAmountDropDown.value = bonusAmount;
    maxGenerationsDropDown.value = maxGenerations;
});



let currentRoomId = null;
let currentImage = '';
let playerName = null;
let remainingGenerations = parseInt(document.getElementById('max-generations').value, 10);
let score = 0;

document.getElementById('join-room').addEventListener('click', () => {
    currentRoomId = document.getElementById('room-id').value;
    playerName = document.getElementById('player-name').value;
    if (currentRoomId && playerName) {
        checkPlayerName(currentRoomId, playerName, (isNameTaken) => {
            console.log("final isNameTaken: ", isNameTaken);
            if (!isNameTaken) {
                socket.emit('join_room', { roomId: currentRoomId, name: playerName });
                roomSetupDiv.style.display = 'none';
                gameControlsDiv.style.display = 'block';
            } else {
                console.log("Name is taken");
                alert("Player name is taken. Please choose another name.");
            }
        });
    }
});

document.getElementById('start-game').addEventListener('click', () => {
    const maxRounds = parseInt(document.getElementById('max-rounds').value, 10);
    const bonusAmount = parseInt(document.getElementById('bonus-amount').value, 10);
    const maxGenerations = parseInt(document.getElementById('max-generations').value, 10);

    console.log('Start Game button clicked for room:', currentRoomId, "maxRounds:", maxRounds, "bonusAmount:", bonusAmount, "maxGenerations:", maxGenerations);
    console.log("currentRoomId: ", currentRoomId);
    socket.emit('start_game', {roomId: currentRoomId, maxRounds, bonusAmount, maxGenerations});
});

document.getElementById('generate-image').addEventListener('click', () => {
    const prompt = document.getElementById('user-prompt').value;
    if (prompt) {
        socket.emit('generate_image', prompt);
    } else {
        alert('Please enter a prompt.');
    }
});



submitImageButton.addEventListener('click', () => {
    console.log("submitting image");
    socket.emit('submit_image', currentRoomId, currentImage);
    imageGenerationDiv.style.display = 'none';
});

document.getElementById('vote-first').addEventListener('click', () => {
    socket.emit('vote', currentRoomId, 'first');
    hideVotingButtons();
});

document.getElementById('vote-second').addEventListener('click', () => {
    socket.emit('vote', currentRoomId, 'second');
    hideVotingButtons();
});

document.getElementById('leaderboard-continue-button').addEventListener('click', () => {
    leaderboardDiv.style.display = 'none';
    socket.emit('player_pressed_leaderboard_continue', currentRoomId);
});

resultsContinueButton.addEventListener('click', () => {
    resultsDiv.style.display = 'none';
    voteImagesDiv.innerHTML = '';
    winnerSpan.textContent = '';
    //socket.emit('get_leaderboard', currentRoomId);
    //socket.emit('advance_pair');
    socket.emit('player_pressed_result_continue', currentRoomId);
});

socket.on('advance_pair', (roomId) => {
    console.log("client advance pair");
    socket.emit('advance_pair_server');
});

function hideVotingButtons(){
    document.getElementById('vote-first').style.display = 'none';
    document.getElementById('vote-second').style.display = 'none';
}

socket.on('ensureVotingGone', () => {
    votingAreaDiv.style.display = 'none';
    hideVotingButtons();
});

socket.on('show_next_pair', () => {
    //imageGenerationDiv.style.display = 'block';
    gameAreaDiv.style.display = 'block';
    votingAreaDiv.style.display = 'block';
    voteImagesDiv.style.display = 'block';
    resultsDiv.style.display = 'none'; // Ensure results are hidden
    leaderboardDiv.style.display = 'none'; 
    console.log("advancing to next pair");
});

socket.on('update_players', (players) => {
    playerListDiv.innerHTML = '';
    players.forEach(player => {
        const playerItem = document.createElement('div');
        playerItem.textContent = player.name;
        playerListDiv.appendChild(playerItem);
    });
});

socket.on('start_round', (data) => {
    updateGenerationLabel();
    remainingGenerations = data.gens;
    gameControlsDiv.style.display = 'none';
    gameAreaDiv.style.display = 'block';
    //data.round++;
    pairPromptDiv.innerHTML = `<h2>Round ${data.round}</h2>`;
    generatedImageDiv.innerHTML = '';
    submitImageButton.style.display = 'none';
});

socket.on('your_turn', (prompt) => {
    pairPromptDiv.innerHTML += `<p>${prompt}</p>`;
    imageGenerationDiv.style.display = 'block';
    updateGenerationLabel(); 
});

socket.on('image_generated', ({imageUrl, remainingGenerations: newRemainingGenerations}) => {
    currentImage = imageUrl;
    remainingGenerations = newRemainingGenerations;
    //socket.emit('save_image', currentRoomId, imageUrl);
    if (imageUrl.startsWith('data:image')) {
        generatedImageDiv.innerHTML = `<img src="${imageUrl}" alt="Generated Image">`;
        submitImageButton.style.display = 'block';
    } else {
        generatedImageDiv.innerHTML = `<p>${imageUrl}</p>`; // Display error message
        submitImageButton.style.display = 'none';
    }
    updateGenerationLabel();
});

function updateGenerationLabel() {
    const generationLabel = document.getElementById('generation-label');
    if (!generationLabel) {
        const label = document.createElement('div');
        label.id = 'generation-label';
        imageGenerationDiv.insertBefore(label, generatedImageDiv);
    }
    document.getElementById('generation-label').textContent = `Generations left: ${remainingGenerations}`;
}


socket.on('vote_pair', ({images,prompt}) => {
    votingAreaDiv.style.display = 'block';
    pairPromptDiv.innerHTML = `<p>Prompt: ${prompt}</p>`;
    voteImagesDiv.innerHTML = `
        <img src="${images[0]}" alt="First Image">
        <img src="${images[1]}" alt="Second Image">
    `;
    document.getElementById('vote-first').style.display = 'inline-block';
    document.getElementById('vote-second').style.display = 'inline-block';
});

socket.on('vote_result', ({winner, voteDetails, images}) => {

    resultsDiv.style.display = 'block';
    winnerSpan.textContent = `Winner: ${winner}`;
    voteImagesDiv.innerHTML = `
        <div>
            <img src="${images[Object.keys(images)[0]]}" alt="First Image">
            <ul>${voteDetails.first.map(voter => `<li>${voter}</li>`).join('')}</ul>
        </div>
        <div>
            <img src="${images[Object.keys(images)[1]]}" alt="Second Image">
            <ul>${voteDetails.second.map(voter => `<li>${voter}</li>`).join('')}</ul>
        </div>
    `;
    resultsContinueButton.style.display = 'block';
});

socket.on('end_round', () => {
    imageGenerationDiv.style.display = 'none';
    votingAreaDiv.style.display = 'none';
    resultsDiv.style.display = 'none';
    //update the round number
    const maxRounds = parseInt(document.getElementById('max-rounds').value, 10);
    const bonusAmount = parseInt(document.getElementById('bonus-amount').value, 10);
    const maxGenerations = parseInt(document.getElementById('max-generations').value, 10);

    socket.emit('start_game', {roomId: currentRoomId, maxRounds, bonusAmount, maxGenerations}); //GOtta be a problem
});

socket.on('show_leaderboard', (room) => {
    leaderboardDiv.style.display = 'block';
    leaderboardContinueButton.style.display = 'block';
    updateLeaderboard(room);
    
});

socket.on('final_winner', ({ name }) => {
    console.log("final winner: ", name);
    winnerDiv.style.display = 'block'; // Now we're accessing the style property here
    newGameButton.style.display = 'block';
    winner.textContent = `Final Winner: ${name}`;
});

socket.on('hide_final_winner', () =>{
    winnerDiv.style.display = 'none';
});

newGameButton.addEventListener('click', () => {
    // Reset the game
    socket.emit('start_game', {
        roomId: currentRoomId,
        maxRounds: parseInt(document.getElementById('max-rounds').value, 10),
        bonusAmount: parseInt(document.getElementById('bonus-amount').value, 10),
        maxGenerations: parseInt(document.getElementById('max-generations').value, 10)
    });
});

function updateLeaderboard(room) {
    const players = room.players;

    leaderboardList.innerHTML = ''; // Clear the leaderboard before adding new standings

    players.forEach((player) => {
        const playerItem = document.createElement('div');
        playerItem.textContent = `${player.name}: ${room.playersScore[player.id]} points`;
        leaderboardList.appendChild(playerItem);
    });  
}


function checkPlayerName(roomId, playerName, callback) {
    // Remove any previous listener for 'player_name_check'
    socket.off('player_name_check');
    
    // Emit the event to check the player name
    socket.emit('check_player_name', { roomId, playerName });
    
    // Set up a new listener for 'player_name_check'
    socket.once('player_name_check', (isNameTaken) => {
        console.log("isNameTaken: ", isNameTaken);
        callback(isNameTaken);
    });
}

