var express = require('express');
var router = express.Router();
var {
    database
} = require('../database/database');

router.use(function getGameInfo(req, res, next) {
    const gameID = parseInt(req.query.gameID);
    console.log("calling game functions");
    res.locals.gameID = gameID;
    console.log("gameID = ", gameID);
    const getGameInfoQuery = `select * from Games where game_id = $1`;
    database.oneOrNone(getGameInfoQuery, [gameID])
        .then(function(data) {
            console.log("running query");
            res.locals.gameRoomName = data.game_room_name;
            res.locals.gameID = data.game_id;
            res.locals.max_players = data.max_players;
            res.locals.current_players = data.current_players;
            next();
        })
        .catch(function(error) {
            console.log("ERROR:", error);
            return res.send(error);
        });
});

function getPlayersGameInfo(req, res, next) {
    const playersInGame = [];
    for (var i = 0; i < 4; i++) {
        var player = new Object();
        player.player_number = i + 1;
        playersInGame[i] = player;
    }
    res.locals.playersInGame = playersInGame;;
    next();
}

function getPlayersInfo(req, res, next) {
    const gameID = parseInt(req.query.gameID);
    const getPlayersInGameQuery = `SELECT * FROM registeredUsers WHERE player_id IN (Select player_id FROM Players WHERE game_id = $1)`;
    const playersInGame = [];

    database.any(getPlayersInGameQuery, [gameID])
        .then(function(data) {
            if (data != null && data.length > 0) {
                for (var index = 0; index < data.length; index++) {
                    playersInGame[index] = data[index].username;
                }
            }
            res.locals.playersInGame = playersInGame;
            next();
        })
        .catch(function(error) {
            console.log("ERROR:", error);
            return res.send(error);
        });
}

router.use(getPlayersGameInfo);

function getPlayerIDByPlayerName(req, res, next) {
    const playerName = req.session.passport.user;

    const playerIDQuery = `SELECT player_id FROM registeredUsers WHERE username = $1`;

    database.oneOrNone(playerIDQuery, [playerName])
        .then(function(data) {
            res.locals.playerID = data.player_id;
            console.log("playerID fetched = ", res.locals.playerID);
            next();
        })
        .catch(function(error) {
            console.log("ERROR:", error);
            return res.send(error);
        });
}

router.use(getPlayerIDByPlayerName);

function checkIfGameFull(req, res, next) {
    const gameID = res.locals.gameID;
    console.log("check if game full function, gameid = ", gameID);

    const gameQuery = `SELECT * FROM Games WHERE game_id = $1`;

    database.oneOrNone(gameQuery, [gameID])
        .then(function(data) {
            if (data.max_players == data.current_players) {
                res.locals.gameFullFlag = 1;
                console.log("game full!");
                next();
            } else {
                console.log("game is not full!");
                res.locals.gameFullFlag = 0;
                next();
            }
        })
        .catch(function(error) {
            console.log("ERROR:", error);
            return res.send(error);
        });
}

router.use(checkIfGameFull);

function getPlayerNumber(req, res, next) {
    const playerID = res.locals.playerID;
    const gameID = res.locals.gameID;

    const getPlayerNumberQuery = `SELECT player_number FROM players WHERE game_id = $1
                                AND player_id = $2`;
    database.oneOrNone(getPlayerNumberQuery, [gameID, playerID])
        .then(function(data) {
            res.locals.player_number = data.player_number;
            console.log("player number query returns = ", res.locals.player_number);
            next();
        })
        .catch(function(error) {
            console.log("ERROR:", error);
            return res.send(error);
        });
}

router.use(getPlayerNumber);

function getPlayerIDNumbers(req, res, next) {
    if (res.locals.gameFullFlag) {
        console.log("fetching player_id numbers");
        var playerIDNumbers = [];
        const query = `SELECT * FROM players WHERE game_id = $1 ORDER BY player_number ASC`;
        database.any(query, [res.locals.gameID])
            .then(function(data) {
                for (var index = 0; index < data.length; index++) {
                    playerIDNumbers[index + 1] = data[index].player_id;
                }
                res.locals.playerIDNumbers = playerIDNumbers;
                res.locals.readyToDealFlag = 1;
                next();
            })
            .catch(function(error) {
                console.log("ERROR:", error);
                return res.send(error);
            });
    } else {
        res.locals.readyToDealFlag = 0;
        next();
    }
}

function dealCards(req, res, next) {
    if (res.locals.readyToDealFlag) {
        const maxPlayers = res.locals.max_players;
        const gameID = res.locals.gameID;
        var playerIDNumbers = [];
        playerIDNumbers = res.locals.playerIDNumbers;
        console.log('ready to deal');
        console.log('max players = ', maxPlayers);
        console.log('gameID = ', gameID);

        const dealCardQuery = `UPDATE cards_in_play SET player_id = $1 WHERE card_id IN
                            (SELECT card_id FROM cards_in_play WHERE game_id = $2
                              AND player_id = -1 ORDER BY random() LIMIT 7)`;
        if (maxPlayers == 2) {
            database.tx(t => {
                return t.batch([
                    t.none(dealCardQuery, [playerIDNumbers[1], gameID]),
                    t.none(dealCardQuery, [playerIDNumbers[2], gameID])
                ]);
            })
        }

        if (maxPlayers == 3) {
            database.tx(t => {
                return t.batch([
                    t.none(dealCardQuery, [playerIDNumbers[1], gameID]),
                    t.none(dealCardQuery, [playerIDNumbers[2], gameID]),
                    t.none(dealCardQuery, [playerIDNumbers[3], gameID])
                ]);
            })
        }

        if (maxPlayers == 4) {
            database.tx(t => {
                return t.batch([
                    t.none(dealCardQuery, [playerIDNumbers[1], gameID]),
                    t.none(dealCardQuery, [playerIDNumbers[2], gameID]),
                    t.none(dealCardQuery, [playerIDNumbers[3], gameID]),
                    t.none(dealCardQuery, [playerIDNumbers[4], gameID])
                ]);
            })
        }
        next();
    } else {
        console.log("not ready to deal");
        next();
    }
}

router.get('/', function(req, res, next) {
    res.render('gameroom', {
        username: req.session.passport.user,
        gameID: res.locals.gameID,
        playerID: res.locals.playerID,
        gameRoomName: res.locals.gameRoomName,
        playerNumber: res.locals.player_number,
        players: res.locals.playersInGame,
        playerIDNumbers: res.locals.playerIDNumbers
    });
});

module.exports = router;
