const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const sharp = require('sharp');
const os = require('os');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const POLLINATIONS_API_URL = 'https://image.pollinations.ai/prompt/';
let BONUS = 2;

app.use(express.static(path.join(__dirname, '/')));

let rooms = {};
let prompts = [];

// Load prompts from file
fs.readFile(path.join(__dirname, 'prompts.txt'), 'utf-8', (err, data) => {
    if (err) {
        console.error('Error reading prompts file:', err);
    } else {
        prompts = data.split('\n').filter(line => line.trim() !== '');
    }
});

io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    socket.on('join_room', ({ roomId, name }) => {
        socket.join(roomId);
        if (!rooms[roomId]) {
            rooms[roomId] = {
                players: [],
                playersScore: {},
                pairs: [],
                currentPairIndex: 0,
                round: 1,
                images: {},
                votes: {},
                prompts: {},
                continueCount: 0,
            };
        }
        rooms[roomId].players.push({ id: socket.id, name });
        rooms[roomId].playersScore[socket.id] = 0;
        io.to(roomId).emit('update_players', rooms[roomId].players);
        console.log(`${name} joined room: ${roomId}`);
    });

    socket.on('player_pressed_result_continue', (roomId) => {
        const room = rooms[roomId];
        if (room) {
            room.continueCount++;
            if (room.continueCount === room.players.length) {
                room.continueCount = 0;
                console.log("Showing leaderboard");
                io.to(roomId).emit('show_leaderboard', room);
            }
        }
    });

    socket.on('player_pressed_leaderboard_continue', (roomId) => {
        const room = rooms[roomId];
        if (room) {
            room.continueCount++;
            if (room.continueCount === room.players.length) {
                room.continueCount = 0;
                io.to(roomId).emit('show_next_pair');
                io.to(roomId).emit('advance_pair', roomId);
            }
        }
    });

    socket.on('option_change', ({ roomId, maxRounds, bonusAmount, maxGenerations }) => {
        socket.to(roomId).emit('update_options', { maxRounds, bonusAmount, maxGenerations });
    });

    socket.on('start_game', ({ roomId, maxRounds, bonusAmount, maxGenerations }) => {
        console.log("Starting game in room:", roomId);
        io.to(roomId).emit('ensureVotingGone');
        io.to(roomId).emit('hide_final_winner');
        const room = rooms[roomId];
        if (room && room.players.length > 1) {
            console.log("Starting game with", room.players.length, "players");
            room.pairs = pairPlayers(room.players);
            room.currentPairIndex = 0;
            room.round = 1;
            room.images = {};
            room.votes = {};
            room.generations = {};
            room.maxRounds = maxRounds;
            BONUS = bonusAmount;
            room.maxGenerations = maxGenerations;
            room.players.forEach(player => {
                room.generations[player.id] = maxGenerations;
            });

            io.to(roomId).emit('start_round', {
                round: room.round,
                pairs: room.pairs.map(pair => pair.map(player => player.name)),
                gens: room.maxGenerations
            });
            room.pairs.forEach(pair => {
                const randomPrompt = prompts[Math.floor(Math.random() * prompts.length)];
                room.prompts[pair.map(player => player.id).join('-')] = randomPrompt;
                pair.forEach(player => {
                    io.to(player.id).emit('your_turn', 'Generate an image based on this prompt: ' + randomPrompt);
                });
            });
        }
    });

    socket.on('generate_image', async (prompt) => {
        const room = rooms[Object.keys(rooms).find(roomId => rooms[roomId].players.some(player => player.id === socket.id))];
        const remainingGenerations = room.generations[socket.id];

        if (remainingGenerations > 0) {
            try {
                const encodedPrompt = encodeURIComponent(prompt);
                const response = await axios.get(`${POLLINATIONS_API_URL}${encodedPrompt}`, {
                    params: {
                        model: 'flux',
                        width: 800,
                        height: 800,
                        nologo: true,
                        enhance: true
                    },
                    responseType: 'arraybuffer'
                });

                const resizedImageBuffer = await sharp(response.data)
                    .resize(300, 300)
                    .toBuffer();

                const imageUrl = `data:image/jpeg;base64,${resizedImageBuffer.toString('base64')}`;
                room.generations[socket.id]--;
                socket.emit('image_generated', { imageUrl, remainingGenerations: room.generations[socket.id] });
            } catch (error) {
                console.error('Error generating image:', error);
                socket.emit('image_generated', 'Error generating image');
            }
        } else {
            socket.emit('no_generations_left', 'You have no more generations left');
        }
    });

    socket.on('check_player_name', ({ roomId, playerName }) => {
        console.log(`Checking player name: ${playerName} in room: ${roomId}`);
        const room = rooms[roomId];
        if (room) {
            const isNameTaken = room.players.some(player => player.name === playerName);
            socket.emit('player_name_check', isNameTaken);
        } else {
            socket.emit('player_name_check', false);
        }
    });

    socket.on('submit_image', (roomId, imageUrl) => {
        console.log("Received image submission from", socket.id);
        const room = rooms[roomId];
        room.images[socket.id] = imageUrl;
        if (Object.keys(room.images).length === room.players.length) {
            console.log("All images submitted");
            startVoting(roomId);
        }
    });

    socket.on('vote', (roomId, vote) => {
        const room = rooms[roomId];
        const currentPair = room.pairs[room.currentPairIndex];
        console.log("voting on pair", currentPair);
        const [firstPlayer, secondPlayer] = currentPair.map(player => player.id);

        console.log("Voting on pair: ", currentPair);
        room.votes[socket.id] = vote;

        if (Object.keys(room.votes).length === room.players.length) {
            const voteCount = { first: 0, second: 0 };
            const voteDetails = { first: [], second: [] };
            for (const [voterId, vote] of Object.entries(room.votes)) {
                if (vote === 'first') {
                    voteCount.first++;
                    voteDetails.first.push(room.players.find(player => player.id === voterId).name);
                } else if (vote === 'second') {
                    voteCount.second++;
                    voteDetails.second.push(room.players.find(player => player.id === voterId).name);
                } else {
                    console.log("they are presenting");
                }
            }

            if (voteCount.first > 0) {
                rooms[roomId].playersScore[firstPlayer]++;
                if (voteCount.second === 0) {
                    rooms[roomId].playersScore[firstPlayer] += BONUS;
                }
            }
            if (voteCount.second > 0) {
                rooms[roomId].playersScore[secondPlayer]++;
                if (voteCount.first === 0) {
                    rooms[roomId].playersScore[secondPlayer] += BONUS;
                }
            }

            const winner = voteCount.first > voteCount.second ? currentPair[0].name : currentPair[1].name;
            const currentPairImages = {
                first: room.images[firstPlayer],
                second: room.images[secondPlayer]
            };

            io.to(roomId).emit('vote_result', { winner, voteDetails, images: currentPairImages });

            socket.once('advance_pair_server', () => {
                console.log("Advancing pair");
                room.currentPairIndex++;
                room.votes = {};

                if (room.currentPairIndex < room.pairs.length) {
                    console.log("Starting next round of voting");
                    startVoting(roomId);
                } else if (room.round >= room.maxRounds) {
                    console.log("Final round over, determining winner");
                    const finalWinner = Object.keys(room.playersScore).reduce((a, b) => room.playersScore[a] > room.playersScore[b] ? a : b);
                    const finalWinnerName = room.players.find(player => player.id === finalWinner).name;
                    io.to(roomId).emit('final_winner', { name: finalWinnerName });
                } else {
                    console.log("End of round");
                    room.round++;
                    room.currentPairIndex = 0;
                    room.pairs = pairPlayers(room.players);
                    room.images = {};
                    io.to(roomId).emit('end_round');
                    io.to(roomId).emit('start_round', {
                        round: room.round,
                        pairs: room.pairs.map(pair => pair.map(player => player.name)),
                        gens: room.maxGenerations
                    });
                    room.pairs.forEach(pair => {
                        pair.forEach(player => {
                            const randomPrompt = prompts[Math.floor(Math.random() * prompts.length)];
                            io.to(player.id).emit('your_turn', randomPrompt);
                        });
                    });
                }
            });
        }
    });

    socket.on('disconnect', () => {
        console.log('A user disconnected:', socket.id);
        for (const roomId in rooms) {
            const room = rooms[roomId];
            room.players = room.players.filter(player => player.id !== socket.id);
            if (room.players.length === 0) {
                delete rooms[roomId];
            } else {
                io.to(roomId).emit('update_players', room.players);
            }
        }
    });
});

function pairPlayers(players) {
    for (let i = players.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [players[i], players[j]] = [players[j], players[i]];
    }

    const pairs = [];
    for (let i = 0; i < players.length; i += 2) {
        if (i + 1 < players.length) {
            pairs.push([players[i], players[i + 1]]);
        } else {
            pairs.push([players[i]]);
        }
    }
    return pairs;
}

function startVoting(roomId) {
    const room = rooms[roomId];
    const currentPair = room.pairs[room.currentPairIndex];
    const images = currentPair.map(player => room.images[player.id]);
    const prompt = room.prompts[currentPair.map(player => player.id).join('-')];
    io.to(roomId).emit('vote_pair', { images, prompt,currentPair: currentPair.map(player => player.id)});
}

function getLocalIpAddy() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const interface of interfaces[name]) {
            if (interface.family === 'IPv4' && !interface.internal) {
                return interface.address;
            }
        }
    }
}

server.listen(3000, '0.0.0.0', () => {
    const localIp = getLocalIpAddy();
    console.log('Server is listening on port 3000');
    console.log(`Access the server at http://${localIp}:3000`);
});