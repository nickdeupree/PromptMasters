const socket = io();

const elements = {
    roomSetupDiv: document.getElementById('room-setup'),
    instructionsDiv: document.getElementById('instructions'),
    instructionsButton: document.getElementById('show-instructions'),
    howToDiv: document.getElementById('how-to'),
    gameControlsDiv: document.getElementById('game-controls'),
    gameAreaDiv: document.getElementById('game-area'),
    pairPromptDiv: document.getElementById('pair-prompt'),
    imageGenerationDiv: document.getElementById('image-generation'),
    generatedImageDiv: document.getElementById('generated-image'),
    userPromptInput: document.getElementById('user-prompt'),
    submitImageButton: document.getElementById('submit-image'),
    votingAreaDiv: document.getElementById('voting-area'),
    voteImagesDiv: document.getElementById('vote-images'),
    resultsDiv: document.getElementById('results'),
    winnerSpan: document.getElementById('winner'),
    playerListDiv: document.getElementById('player-list'),
    resultsContinueButton: document.getElementById('results-continue-button'),
    leaderboardDiv: document.getElementById('leaderboard'),
    leaderboardContinueButton: document.getElementById('leaderboard-continue-button'),
    leaderboardList: document.getElementById('leaderboard-list'),
    winnerDiv: document.getElementById('final-winner-section'),
    winner: document.getElementById('final-winner'),
    newGameButton: document.getElementById('new-game-button'),
    maxRoundsDropDown: document.getElementById('max-rounds'),
    bonusAmountDropDown: document.getElementById('bonus-amount'),
    maxGenerationsDropDown: document.getElementById('max-generations'),
    devModeCheckbox: document.getElementById('dev-mode')
};

let currentRoomId = null;
let currentImage = '';
let playerName = null;
let remainingGenerations = parseInt(elements.maxGenerationsDropDown.value, 10);
let score = 0;
let generatedImages = [];
let devMode = false;
let instructions = false;

function emitOptionChange() {
    const maxRounds = parseInt(elements.maxRoundsDropDown.value, 10);
    const bonusAmount = parseInt(elements.bonusAmountDropDown.value, 10);
    const maxGenerations = parseInt(elements.maxGenerationsDropDown.value, 10);
    const dev = elements.devModeCheckbox.checked;
    devMode = dev;
    socket.emit('option_change', { roomId: currentRoomId, maxRounds, bonusAmount, maxGenerations, dev });
}

elements.maxRoundsDropDown.addEventListener('change', emitOptionChange);
elements.bonusAmountDropDown.addEventListener('change', emitOptionChange);
elements.maxGenerationsDropDown.addEventListener('change', emitOptionChange);
elements.devModeCheckbox.addEventListener('change', emitOptionChange);

socket.on('update_options', ({ maxRounds, bonusAmount, maxGenerations, dev }) => {
    elements.maxRoundsDropDown.value = maxRounds;
    elements.bonusAmountDropDown.value = bonusAmount;
    elements.maxGenerationsDropDown.value = maxGenerations;
    elements.devModeCheckbox.checked = dev;
});

socket.on('not_enough_players', () => {
    alert('Not enough players to start the game.');
});

document.getElementById('join-room').addEventListener('click', () => {
    currentRoomId = document.getElementById('room-id').value;
    playerName = document.getElementById('player-name').value;
    if (currentRoomId && playerName) {
        checkPlayerName(currentRoomId, playerName, (isNameTaken) => {
            if (!isNameTaken) {
                socket.emit('join_room', { roomId: currentRoomId, name: playerName });
                elements.roomSetupDiv.style.display = 'none';
                elements.instructionsDiv.style.display = 'none';
                elements.gameControlsDiv.style.display = 'block';
            } else {
                alert("Player name is taken. Please choose another name.");
            }
        });
    }
});

elements.instructionsButton.addEventListener('click', () => {
    if (!instructions){
        elements.howToDiv.style.display = 'block';
        elements.instructionsButton.textContent = 'Hide Instructions';
        instructions = true;
    }else{
        elements.howToDiv.style.display = 'none';
        elements.howToDiv.textContent = 'Show Instructions';
        instructions = false;
    }
});

document.getElementById('start-game').addEventListener('click', () => {
    const maxRounds = parseInt(elements.maxRoundsDropDown.value, 10);
    const bonusAmount = parseInt(elements.bonusAmountDropDown.value, 10);
    const maxGenerations = parseInt(elements.maxGenerationsDropDown.value, 10);

    socket.emit('start_game', { roomId: currentRoomId, maxRounds, bonusAmount, maxGenerations });
});

document.getElementById('generate-image').addEventListener('click', () => {
    const prompt = elements.userPromptInput.value;
    if (prompt) {
        socket.emit('generate_image', prompt);
    } else {
        alert('Please enter a prompt.');
    }
});


document.getElementById('vote-first').addEventListener('click', () => {
    socket.emit('vote', currentRoomId, 'first');
    hideVotingButtons();
});

document.getElementById('vote-second').addEventListener('click', () => {
    socket.emit('vote', currentRoomId, 'second');
    hideVotingButtons();
});

elements.leaderboardContinueButton.addEventListener('click', () => {
    elements.leaderboardDiv.style.display = 'none';
    socket.emit('player_pressed_leaderboard_continue', currentRoomId);
});

elements.resultsContinueButton.addEventListener('click', () => {
    elements.resultsDiv.style.display = 'none';
    elements.voteImagesDiv.innerHTML = '';
    elements.winnerSpan.textContent = '';
    socket.emit('player_pressed_result_continue', currentRoomId);
});

socket.on('advance_pair', () => {
    socket.emit('advance_pair_server');
});

function hideVotingButtons() {
    document.getElementById('vote-first').style.display = 'none';
    document.getElementById('vote-second').style.display = 'none';
}

socket.on('ensureVotingGone', () => {
    elements.votingAreaDiv.style.display = 'none';
    hideVotingButtons();
});

socket.on('show_next_pair', () => {
    elements.gameAreaDiv.style.display = 'block';
    elements.votingAreaDiv.style.display = 'block';
    elements.voteImagesDiv.style.display = 'block';
    elements.resultsDiv.style.display = 'none';
    elements.leaderboardDiv.style.display = 'none';
});

socket.on('update_players', (players) => {
    elements.playerListDiv.innerHTML = '';
    players.forEach(player => {
        const playerItem = document.createElement('div');
        playerItem.textContent = player.name;
        elements.playerListDiv.appendChild(playerItem);
    });
});

socket.on('start_round', (data) => {
    updateGenerationLabel();
    remainingGenerations = data.gens;
    elements.gameControlsDiv.style.display = 'none';
    elements.gameAreaDiv.style.display = 'block';
    elements.pairPromptDiv.innerHTML = `<h2>Round ${data.round}</h2>`;
    elements.generatedImageDiv.innerHTML = '';
    elements.submitImageButton.style.display = 'none';
    generatedImages = [];
});

socket.on('your_turn', (prompt) => {
    elements.pairPromptDiv.innerHTML += `<p>${prompt}</p>`;
    elements.imageGenerationDiv.style.display = 'block';
    updateGenerationLabel();
});

socket.on('image_generated', ({ imageUrl, remainingGenerations: newRemainingGenerations }) => {
    remainingGenerations = newRemainingGenerations;
    if (imageUrl.startsWith('data:image')) {
        generatedImages.unshift(imageUrl); // Prepend the new image
        displayGeneratedImages();
    } else {
        elements.generatedImageDiv.innerHTML = `<p>${imageUrl}</p>`; // Display error message
    }
    updateGenerationLabel();
});

function displayGeneratedImages() {
    elements.generatedImageDiv.innerHTML = generatedImages.map((image, index) => `
        <div style="margin: 10px;">
            <img src="${image}" alt="Generated Image ${index + 1}" style="max-width: 300px; cursor: pointer;" onclick="selectImage(${index})">
        </div>
    `).join('');
    elements.submitImageButton.style.display = 'block';
}

function selectImage(index) {
    currentImage = generatedImages[index];
    document.querySelectorAll('#generated-image img').forEach((img, imgIndex) => {
        img.style.border = imgIndex === index ? '2px solid blue' : 'none';
    });
}

elements.submitImageButton.addEventListener('click', () => {
    if (!currentImage && generatedImages.length > 0) {
        selectImage(0); // Select the most recent image (first in the array)
    }
    if (currentImage) {
        socket.emit('submit_image', currentRoomId, currentImage);
        elements.imageGenerationDiv.style.display = 'none';
    } else {
        alert('No images available to submit.');
    }
});

function updateGenerationLabel() {
    let generationLabel = document.getElementById('generation-label');
    if (!generationLabel) {
        generationLabel = document.createElement('div');
        generationLabel.id = 'generation-label';
        elements.imageGenerationDiv.insertBefore(generationLabel, elements.generatedImageDiv);
    }
    generationLabel.textContent = `Generations left: ${remainingGenerations}`;
}

socket.on('vote_pair', ({ images, prompt, currentPair, playerNames }) => {
    if (currentPair.includes(socket.id)){
        console.log("You are in the pair");
        elements.votingAreaDiv.style.display = 'block';
        elements.pairPromptDiv.innerHTML = `<p>Prompt: ${prompt}</p>`;
        elements.voteImagesDiv.innerHTML = `
            <div>
                <p>Artist: ${playerNames[0]}</p>
                <img src="${images[0]}" alt="First Image">
            </div>
            <div>
                <p>Artist: ${playerNames[1]}</p>
                <img src="${images[1]}" alt="Second Image">
            </div>
        `;
        socket.emit('vote', currentRoomId, 'abstain');
    } else {
        elements.votingAreaDiv.style.display = 'block';
        elements.pairPromptDiv.innerHTML = `<p>Prompt: ${prompt}</p>`;
        elements.voteImagesDiv.innerHTML = `
            <div>
                <p>Artist: ${playerNames[0]}</p>
                <img src="${images[0]}" alt="First Image">
            </div>
            <div>
                <p>Artist: ${playerNames[1]}</p>
                <img src="${images[1]}" alt="Second Image">
            </div>
        `;
        document.getElementById('vote-first').style.display = 'inline-block';
        document.getElementById('vote-second').style.display = 'inline-block';
    }
});

socket.on('vote_result', ({ winner, voteDetails, images, playerNames }) => {
    elements.resultsDiv.style.display = 'block';
    elements.winnerSpan.textContent = `Winner: ${winner}`;
    elements.voteImagesDiv.innerHTML = `
        <div style="display: flex; justify-content: space-around; align-items: flex-start;">
            <div style="margin: 10px;">
                <p>Artist: ${playerNames[Object.keys(images)[0]]}</p>
                <img src="${images[Object.keys(images)[0]]}" alt="First Image">
                <ul>${voteDetails.first.map(voter => `<li>${voter}</li>`).join('')}</ul>
            </div>
            <div style="margin: 10px;">
                <p>Artist: ${playerNames[Object.keys(images)[1]]}</p>
                <img src="${images[Object.keys(images)[1]]}" alt="Second Image">
                <ul>${voteDetails.second.map(voter => `<li>${voter}</li>`).join('')}</ul>
            </div>
        </div>
    `;
    elements.resultsContinueButton.style.display = 'block';
});

socket.on('end_round', () => {
    elements.imageGenerationDiv.style.display = 'none';
    elements.votingAreaDiv.style.display = 'none';
    elements.resultsDiv.style.display = 'none';
    elements.userPromptInput.value = '';
    const maxRounds = parseInt(elements.maxRoundsDropDown.value, 10);
    const bonusAmount = parseInt(elements.bonusAmountDropDown.value, 10);
    const maxGenerations = parseInt(elements.maxGenerationsDropDown.value, 10);
    socket.emit('start_game', { roomId: currentRoomId, maxRounds, bonusAmount, maxGenerations });
});

socket.on('show_leaderboard', (room) => {
    elements.leaderboardDiv.style.display = 'block';
    elements.leaderboardContinueButton.style.display = 'block';
    updateLeaderboard(room);
});

socket.on('final_winner', ({ name }) => {
    elements.winnerDiv.style.display = 'block';
    elements.newGameButton.style.display = 'block';
    if (name === "***Tie") {
        elements.winner.textContent = `Draw`;
    }else{
        elements.winner.textContent = `Final Winner: ${name}`;
    }
});

socket.on('hide_final_winner', () => {
    elements.winnerDiv.style.display = 'none';
});

elements.newGameButton.addEventListener('click', () => {
    socket.emit('start_game', {
        roomId: currentRoomId,
        maxRounds: parseInt(elements.maxRoundsDropDown.value, 10),
        bonusAmount: parseInt(elements.bonusAmountDropDown.value, 10),
        maxGenerations: parseInt(elements.maxGenerationsDropDown.value, 10)
    });
});

function updateLeaderboard(room) {
    elements.leaderboardList.innerHTML = '';
    room.players.forEach((player) => {
        const playerItem = document.createElement('div');
        playerItem.textContent = `${player.name}: ${room.playersScore[player.id]} points`;
        elements.leaderboardList.appendChild(playerItem);
    });
}

function checkPlayerName(roomId, playerName, callback) {
    socket.off('player_name_check');
    socket.emit('check_player_name', { roomId, playerName });
    socket.once('player_name_check', (isNameTaken) => {
        callback(isNameTaken);
    });
}