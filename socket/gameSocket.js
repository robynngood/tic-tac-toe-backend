const Room = require("../models/roomModel");
const Game = require("../models/gameModel");
const User = require("../models/userModel");
const {
  calculateWinner,
  isDraw,
  isGameOverOnTime,
  getTimeOverWinner,
  getRoundResult,
} = require("../utils/gameLogic");

// Map to store active timer intervals for each room
const roomTimers = new Map();

// Start a server-side timer for a room
function startServerTimer(
  io,
  roomId,
  currentTurn,
  round,
  timerDuration,
  delay = 0
) {
  if (!timerDuration) {
    console.log(`No timer for room ${roomId}: timerDuration is null`);
    return;
  }

  console.log(
    `startServerTimer: roomId=${roomId}, currentTurn=${currentTurn}, round=${round}, timerDuration=${timerDuration}, delay=${delay}`
  );

  setTimeout(() => {
    let timeLeft = timerDuration;
    const intervalId = setInterval(async () => {
      timeLeft -= 1;
      io.to(roomId).emit("updateTimer", { roomId, timeLeft, currentTurn });

      if (timeLeft <= 0) {
        clearInterval(intervalId);
        roomTimers.delete(roomId);

        const game = await Game.findOne({ roomId });
        if (!game) {
          console.error(`Game not found for room ${roomId} in timer callback`);
          io.to(roomId).emit("error", { roomId, message: "Game not found" });
          return;
        }

        // Check isGameEnding to prevent duplicate game-over
        if (game.isGameEnding) {
          console.log(
            `Timer: Ignoring time-over for room ${roomId}: game is already ending`
          );
          return;
        }
        game.isGameEnding = true;

        const timeResult = getTimeOverWinner(game.xIsNext);
        game.results.push({
          round: game.round,
          winner: timeResult.winner,
          reason: timeResult.reason,
          draw: false,
        });

        const roundResult = getRoundResult({
          winner: timeResult.winner,
          isDraw: false,
          round: game.round,
          reason: timeResult.reason,
        });

        // Log time-over round-ended
        console.log(
          `Timer: Emitting round-ended for room ${roomId} due to time-over`,
          {
            roomId,
            round: game.round,
            winner: timeResult.winner,
            reason: timeResult.reason,
            roundResult,
          }
        );

        // Cap currentRound at totalRounds
        const cappedRound = Math.min(game.round + 1, game.totalRounds);
        if (game.round + 1 > game.totalRounds) {
          console.warn(
            `Timer: Capped currentRound ${
              game.round + 1
            } to ${cappedRound} for room ${roomId}`
          );
        }

        io.to(roomId).emit("round-ended", {
          result: roundResult,
          currentRound: cappedRound,
          board: game.board,
          winningLine: [],
        });

        const isFinal = isGameOverOnTime(game.round, game.totalRounds);
        if (isFinal) {
          game.isFinished = true;
          try {
            await game.save();
            console.log(
              `Game saved as finished for room ${roomId}: round ${game.round}, totalRounds: ${game.totalRounds}`
            );
            const stats = {
              totalRounds: game.results.length,
              playerXWins: game.results.filter((r) => r.winner === "X").length,
              playerOWins: game.results.filter((r) => r.winner === "O").length,
              draws: game.results.filter((r) => r.draw).length,
            };
            io.to(roomId).emit("game-over", {
              results: game.results,
              stats: {
                playerX: game.playerX._id
                  ? {
                      wins: stats.playerXWins,
                      draws: stats.draws,
                      losses: stats.playerOWins,
                    }
                  : null,
                playerO: game.playerO._id
                  ? {
                      wins: stats.playerOWins,
                      draws: stats.draws,
                      losses: stats.playerXWins,
                    }
                  : null,
              },
              board: [...game.board],
              winningLine: [],
              roundResult,
            });
            console.log(`Game-over data for room ${roomId}:`, {
              playerX: game.playerX,
              playerO: game.playerO,
              results: game.results,
              board: [...game.board],
              winningLine: [],
              roundResult,
            });
          } catch (error) {
            console.error(
              `Failed to save game for room ${roomId}:`,
              error.message
            );
            io.to(roomId).emit("error", {
              roomId,
              message: "Failed to finalize game",
            });
          }
        } else {
          game.round = cappedRound;
          game.board = Array(game.boardSize * game.boardSize).fill(null);
          game.xIsNext = true;
          // Reset isGameEnding for non-final rounds
          game.isGameEnding = false;
          console.log(
            `Timer: Reset isGameEnding=false for room ${roomId} for next round ${cappedRound}`
          );
          try {
            await game.save();
            console.log(
              `Game saved after timer for room ${roomId}: round ${game.round}, isGameEnding: ${game.isGameEnding}`
            );
            startServerTimer(io, roomId, "X", game.round, timerDuration, 1500); // Delay for UX
          } catch (error) {
            console.error(
              `Failed to save game for room ${roomId}:`,
              error.message
            );
            io.to(roomId).emit("error", {
              roomId,
              message: "Failed to update game state",
            });
          }
        }
      }
    }, 1000);

    console.log(`Started timer for room ${roomId}: ${timerDuration}s`);
    roomTimers.set(roomId, intervalId);
  }, delay);
}

// Stop the timer for a room
function stopServerTimer(roomId) {
  const intervalId = roomTimers.get(roomId);
  if (intervalId) {
    clearInterval(intervalId);
    roomTimers.delete(roomId);
    console.log(`Stopped timer for room ${roomId}`);
  }
}

function registerGameSocket(io, socket, rooms) {
  console.log(`New socket connected: ${socket.id}`);

  socket.on("create-room", async ({ roomId, user, config }) => {
    console.log(`create-room user:`, user); // Debug user object
    console.log(`create-room socket.id:`, socket.id); // Debug socket.id

    // Validate socket.id
    if (!socket.id) {
      console.error(`Invalid socket.id for room ${roomId}: socket.id is null`);
      socket.emit("error", { roomId, message: "Socket not connected" });
      return;
    }

    // Validate timerDuration
    const validTimerDurations = [10, 30, null];
    if (!validTimerDurations.includes(config.timerDuration)) {
      console.error(
        `Invalid timerDuration for room ${roomId}: ${config.timerDuration}`
      );
      socket.emit("error", { roomId, message: "Invalid timerDuration" });
      return;
    }

    // Check if room already exists
    const existingRoom = await Room.findOne({ roomId });
    if (existingRoom) {
      if (existingRoom.host.id === user._id) {
        socket.join(roomId);
        rooms[roomId].host.socketId = socket.id;
        try {
          await Room.findOneAndUpdate(
            { roomId },
            { "host.socketId": socket.id, lastActivity: new Date() },
            { new: true }
          );
          console.log(`Host reconnected to room ${roomId}`);
          socket.emit("assign-symbol", { symbol: "X" });
          socket.emit("host-joined", {
            roomId,
            host: { ...rooms[roomId].host, symbol: "X" },
          });
        } catch (error) {
          console.error(
            `Failed to update room ${roomId} for reconnect:`,
            error.message
          );
          socket.emit("error", {
            roomId,
            message: "Failed to reconnect to room",
          });
        }
        return;
      }
      console.log(`Room ${roomId} already exists, skipping creation`);
      socket.emit("error", { roomId, message: "Room already exists" });
      return;
    }

    socket.join(roomId);

    // Save room to MongoDB
    try {
      await Room.findOneAndUpdate(
        { roomId },
        {
          roomId,
          host: {
            id: user._id,
            name: user.name,
            avatar: user.avatar || "", // Ensure avatar is included
            socketId: socket.id,
            symbol: "X",
          },
          guest: null,
          config: {
            boardSize: config.boardSize,
            lineLength: config.lineLength,
            rounds: config.rounds,
            timerDuration: config.timerDuration,
          },
          lastActivity: new Date(),
        },
        { upsert: true, new: true }
      );
    } catch (error) {
      console.error(`Failed to create room ${roomId}:`, error.message);
      socket.emit("error", { roomId, message: "Failed to create room" });
      return;
    }

    // Save to in-memory map
    rooms[roomId] = {
      host: {
        id: user._id,
        name: user.name,
        avatar: user.avatar || "", // Ensure avatar is included
        socketId: socket.id,
        symbol: "X",
      },
      guest: null,
      config: {
        boardSize: config.boardSize,
        lineLength: config.lineLength,
        rounds: config.rounds,
        timerDuration: config.timerDuration,
      },
      currentTurnSymbol: "X",
    };

    console.log(
      `${user.name} created room ${roomId}, rounds: ${config.rounds}`
    );
    socket.emit("assign-symbol", { symbol: "X" });
    socket.emit("host-joined", {
      roomId,
      host: rooms[roomId].host,
    });
  });

  socket.on("join-room", async ({ roomId, user }) => {
    let room = rooms[roomId];
    if (!room) {
      // Try to load from MongoDB
      const dbRoom = await Room.findOne({ roomId });

      if (!dbRoom) {
        console.log(`Room not found: ${roomId}`);
        return socket.emit("room-not-found", { roomId });
      }

      // Fetch host's avatar from User collection if missing
      let hostAvatar = dbRoom.host.avatar;
      if (!hostAvatar) {
        const hostUser = await User.findById(dbRoom.host.id);
        hostAvatar = hostUser?.avatar || "";
      }

      room = {
        host: {
          ...dbRoom.host,
          socketId: dbRoom.host.socketId,
          symbol: "X",
          avatar: hostAvatar,
        }, // won't be able to message host directly unless they reconnect
        guest: null,
        config: dbRoom.config,
        currentTurnSymbol: "X",
      };
      rooms[roomId] = room;
    }

    // Allow join if guest slot is empty or user matches existing guest
    if (room.guest && room.guest.id !== user._id) {
      console.log(`Guest already present in room ${roomId}, rejecting join`);
      socket.emit("room-full", { roomId });
      return;
    }

    socket.join(roomId);

    if (!room.guest) {
      room.guest = {
        id: user._id,
        name: user.name,
        avatar: user.avatar || "",
        socketId: socket.id,
        symbol: "O",
      };
    } else {
      // Update socketId for existing guest
      room.guest.socketId = socket.id;
    }

    // Update MongoDB
    try {
      await Room.findOneAndUpdate(
        { roomId },
        {
          guest: {
            id: user._id,
            name: user.name,
            avatar: user.avatar || "",
            socketId: socket.id,
            symbol: "O",
          },
          lastActivity: new Date(),
        },
        { new: true }
      );
      console.log(`Updated room ${roomId} with guest in MongoDB`, room.guest);
    } catch (error) {
      console.error(
        `Failed to update room ${roomId} with guest:`,
        error.message
      );
      socket.emit("error", { roomId, message: "Failed to join room" });
      return;
    }

    console.log(`Guest joined room ${roomId}:`, room.guest);

    // Emit to joining user the details (used by frontend for RoomInfoPopup)
    socket.emit("assign-symbol", { symbol: "O" });
    socket.emit("join-room-success", {
      playerX: room.host,
      playerO: room.guest,
      roomId,
    });

    // Emit start-game to both clients once both are present
    io.to(roomId).emit("both-players-joined", {
      roomId,
      playerX: room.host,
      playerO: room.guest,
      config: room.config,
    });
  });

  socket.on("start-game", async ({ roomId }) => {
    console.log("Backend received start-game for room:", roomId);

    const room = rooms[roomId]; // or however you're tracking rooms
    if (
      !room ||
      !room.config ||
      !room.guest ||
      !room.host.id ||
      !room.guest.id
    ) {
      console.log(
        `Invalid start-game: room=${!!room}, config=${!!room?.config}, hostId=${!!room
          ?.host?.id}, guest=${!!room?.guest}, guestId=${!!room?.guest?.id}`
      );
      socket.emit("error", { roomId, message: "Invalid room or player data" });
      return;
    }

    const { boardSize, lineLength, rounds, timerDuration } = room.config;
    const board = Array(boardSize * boardSize).fill(null);

    // Save initial game to MongoDB
    try {
      const game = await Game.findOneAndUpdate(
        { roomId },
        {
          roomId,
          playerX: {
            _id: room.host.id,
            name: room.host.name,
            email: room.host.email || null,
            image: room.host.avatar,
            symbol: "X",
          },
          playerO: {
            _id: room.guest.id,
            name: room.guest.name,
            email: room.guest.email || null,
            image: room.guest.avatar,
            symbol: "O",
          },
          board,
          totalRounds: rounds,
          round: 1,
          xIsNext: true,
          boardSize,
          lineLength,
          results: [],
          isGameEnding: false, // Initialize isGameEnding
        },
        { upsert: true, new: true }
      );
      console.log(`Game created/updated for room ${roomId}:`, {
        id: game._id,
        playerX: game.playerX,
        playerO: game.playerO,
        totalRounds: rounds,
      });
    } catch (error) {
      console.error(
        `Failed to create/update game for room ${roomId}:`,
        error.message
      );
      socket.emit("error", { roomId, message: "Failed to start game" });
      return;
    }

    const config = {
      board: boardSize,
      line: lineLength,
      rounds,
      timerDuration,
    };

    console.log(`Emitting game-started for room ${roomId}:`, {
      config,
      playerX: room.host,
      playerO: room.guest,
    });

    io.to(roomId).emit("game-started", {
      roomId,
      config,
      playerX: room.host,
      playerO: room.guest,
    });

    // Start server-side timer
    startServerTimer(io, roomId, "X", 1, timerDuration);
  });

  socket.on("playerMove", async ({ roomId, index, symbol }) => {
    const game = await Game.findOne({ roomId });
    const room = rooms[roomId];

    if (!game || !room) {
      console.error(`Invalid move: game=${!!game}, room=${!!room}`);
      socket.emit("error", { roomId, message: "Game or room not found" });
      return;
    }

    if (game.isFinished || game.round > game.totalRounds || game.isGameEnding) {
      console.log(`Invalid move for room ${roomId}:`, {
        isFinished: game.isFinished,
        roundExceedsTotal: game.round > game.totalRounds,
        round: game.round,
        totalRounds: game.totalRounds,
        isGameEnding: game.isGameEnding,
      });
      socket.emit("invalid-move", {
        roomId,
        message: `Game is over: ${
          game.isFinished
            ? "finished"
            : game.round > game.totalRounds
            ? "round exceeds total"
            : "game ending in progress"
        }`,
      });
      return;
    }

    const currentSymbol = game.xIsNext ? "X" : "O";
    console.log("playerMove: validation", {
      symbol,
      currentSymbol,
      xIsNext: game.xIsNext,
      socketId: socket.id,
      round: game.round,
      totalRounds: game.totalRounds,
    });

    if (symbol !== currentSymbol) {
      console.log(`Invalid move: not ${socket.id}'s turn`);
      socket.emit("invalid-move", { roomId, message: "Not your turn", index });
      return;
    }
    if (game.board[index]) {
      console.log(`Invalid move: square ${index} already taken`);
      socket.emit("invalid-move", {
        roomId,
        message: "Square already taken",
        index,
      });
      return;
    }

    const winnerCheck = calculateWinner(
      game.board,
      game.boardSize,
      game.lineLength
    );
    if (winnerCheck?.winner) {
      console.log(`Invalid move: game already won`);
      socket.emit("invalid-move", {
        roomId,
        message: "Game already won",
        index,
      });
      return;
    }

    game.board[index] = symbol;
    game.xIsNext = !game.xIsNext;

    let { winner, winningLine } = calculateWinner(
      game.board,
      game.boardSize,
      game.lineLength
    );
    let draw = isDraw(game.board);

    const updateBoardPayload = {
      index,
      symbol,
      xIsNext: game.xIsNext,
      currentRound: game.round,
      isGameFinished: game.isFinished,
      ...(winner || draw
        ? { winner, winningLine: winningLine || [], draw }
        : {}),
    };

    console.log(`Emitting updateBoard for room ${roomId}:`, updateBoardPayload);
    io.to(roomId).emit("updateBoard", updateBoardPayload);

    let roundResult = null;

    if (winner || draw) {
      // Set isGameEnding for line completion or draw
      game.isGameEnding = true;
      console.log(
        `playerMove: Set isGameEnding=true for room ${roomId} due to`,
        { winner, draw }
      );

      const reason = winner ? "Line Completion" : draw ? null : "";
      roundResult = getRoundResult({
        winner,
        isDraw: draw,
        round: game.round,
        reason,
      });

      console.log(`playerMove: round end`, {
        winner,
        draw,
        roundResult,
        currentRound: game.round + 1,
      });

      game.results.push({
        round: game.round,
        winner: winner || null,
        draw,
        reason,
      });

      const isFinalRound = game.round === game.totalRounds;

      if (isFinalRound) {
        game.isFinished = true;

        const stats = {
          totalRounds: game.results.length,
          playerXWins: game.results.filter((r) => r.winner === "X").length,
          playerOWins: game.results.filter((r) => r.winner === "O").length,
          draws: game.results.filter((r) => r.draw).length,
        };

        let matchWinner = null;
        let matchDraw = false;
        if (stats.playerXWins > stats.playerOWins) {
          matchWinner = "X";
        } else if (stats.playerOWins > stats.playerXWins) {
          matchWinner = "O";
        } else {
          matchDraw = true;
        }

        if (game.playerX._id) {
          console.log(
            `Attempting to update stats for playerX (${game.playerX._id})`,
            {
              matches: 1,
              rounds: stats.totalRounds,
              matchesWon: matchWinner === "X" ? 1 : 0,
              matchesLost: matchWinner === "O" ? 1 : 0,
              matchesDraw: matchDraw ? 1 : 0,
              wins: stats.playerXWins,
              draws: stats.draws,
              losses: stats.playerOWins,
            }
          );
          try {
            const updatedUser = await User.findByIdAndUpdate(
              game.playerX._id,
              {
                $inc: {
                  "stats.matches": 1,
                  "stats.rounds": stats.totalRounds,
                  "stats.matchesWon": matchWinner === "X" ? 1 : 0,
                  "stats.matchesLost": matchWinner === "O" ? 1 : 0,
                  "stats.matchesDraw": matchDraw ? 1 : 0,
                  "stats.wins": stats.playerXWins,
                  "stats.draws": stats.draws,
                  "stats.losses": stats.playerOWins,
                },
              },
              { new: true }
            );
            console.log(
              `Updated stats for playerX (${game.playerX._id})`,
              updatedUser.stats
            );
          } catch (error) {
            console.error(
              `Failed to update stats for playerX (${game.playerX._id}):`,
              error.message
            );
          }
        } else {
          console.warn(
            `Skipping stats update for playerX: No _id found`,
            game.playerX
          );
        }

        if (game.playerO._id) {
          console.log(
            `Attempting to update stats for playerO (${game.playerO._id})`,
            {
              matches: 1,
              rounds: stats.totalRounds,
              matchesWon: matchWinner === "O" ? 1 : 0,
              matchesLost: matchWinner === "X" ? 1 : 0,
              matchesDraw: matchDraw ? 1 : 0,
              wins: stats.playerOWins,
              draws: stats.draws,
              losses: stats.playerXWins,
            }
          );
          try {
            const updatedUser = await User.findByIdAndUpdate(
              game.playerO._id,
              {
                $inc: {
                  "stats.matches": 1,
                  "stats.rounds": stats.totalRounds,
                  "stats.matchesWon": matchWinner === "O" ? 1 : 0,
                  "stats.matchesLost": matchWinner === "X" ? 1 : 0,
                  "stats.matchesDraw": matchDraw ? 1 : 0,
                  "stats.wins": stats.playerOWins,
                  "stats.draws": stats.draws,
                  "stats.losses": stats.playerXWins,
                },
              },
              { new: true }
            );
            console.log(
              `Updated stats for playerO (${game.playerO._id})`,
              updatedUser.stats
            );
          } catch (error) {
            console.error(
              `Failed to update stats for playerO (${game.playerO._id}):`,
              error.message
            );
          }
        } else {
          console.warn(
            `Skipping stats update for playerO: No _id found`,
            game.playerO
          );
        }

        try {
          await game.save();
          console.log(
            `Game saved as finished for room ${roomId}: round ${game.round}, totalRounds: ${game.totalRounds}`
          );
          io.to(roomId).emit("game-over", {
            results: game.results,
            stats: {
              playerX: game.playerX._id
                ? {
                    wins: stats.playerXWins,
                    draws: stats.draws,
                    losses: stats.playerOWins,
                  }
                : null,
              playerO: game.playerO._id
                ? {
                    wins: stats.playerOWins,
                    draws: stats.draws,
                    losses: stats.playerXWins,
                  }
                : null,
            },
            board: [...game.board],
            winningLine: winningLine || [],
            roundResult,
          });
          console.log(`Game-over data for room ${roomId}:`, {
            playerX: game.playerX,
            playerO: game.playerO,
            results: game.results,
            board: [...game.board],
            winningLine: winningLine || [],
            roundResult,
          });
          return;
        } catch (error) {
          console.error(
            `Failed to save game as finished for room ${roomId}:`,
            error.message
          );
          socket.emit("error", { roomId, message: "Failed to finalize game" });
          return;
        }
      } else {
        // Reset isGameEnding for non-final rounds
        game.isGameEnding = false;
        console.log(
          `playerMove: Reset isGameEnding=false for room ${roomId} for next round ${
            game.round + 1
          }`
        );

        // Cap currentRound at totalRounds
        const cappedRound = Math.min(game.round + 1, game.totalRounds);
        if (game.round + 1 > game.totalRounds) {
          console.warn(
            `playerMove: Capped currentRound ${
              game.round + 1
            } to ${cappedRound} for room ${roomId}`
          );
        }

        console.log(`Emitting round-ended for room ${roomId}:`, {
          result: roundResult,
          currentRound: cappedRound,
          board: game.board,
          winningLine: winningLine || [],
        });
        io.to(roomId).emit("round-ended", {
          result: roundResult,
          currentRound: cappedRound,
          board: [...game.board],
          winningLine: winningLine || [],
        });

        game.board = Array(game.boardSize * game.boardSize).fill(null);
        game.xIsNext = true;
        game.round = cappedRound;
      }
    }

    try {
      await game.save();
      console.log(
        `Game saved after move for room ${roomId}: round ${game.round}, totalRounds: ${game.totalRounds}`
      );
    } catch (error) {
      console.error(
        `Failed to save game after move for room ${roomId}:`,
        error.message
      );
      socket.emit("error", { roomId, message: "Failed to update game state" });
      return;
    }

    stopServerTimer(roomId);

    if (room.config.timerDuration && !game.isGameEnding) {
      console.log(`Restarting timer for room ${roomId}:`, {
        winner,
        draw,
        roundResult,
        delay: winner ? 1500 : 0,
      });
      startServerTimer(
        io,
        roomId,
        winner || draw ? "X" : game.xIsNext ? "X" : "O",
        game.round,
        room.config.timerDuration,
        winner ? 1500 : 0
      );
    }
  });

  socket.on("reconnect", async ({ roomId, userId }) => {
    try {
      console.log("Processing reconnect for room:", roomId, "user:", userId);

      // Fallback for undefined userId
    if (!userId && socket.handshake.auth?.userId) {
      userId = socket.handshake.auth.userId;
      console.log("Using fallback userId from handshake:", userId);
    }
    if (!userId) {
      console.log("Missing userId for reconnect, requesting retry");
      socket.emit("error", { message: "Missing user ID, please retry", retry: true });
      return;
    }

    // Query Room and validate existence
      const room = await Room.findOne({ roomId: String(roomId) });
      if (!room) {
        console.log("Room not found:", roomId);
        socket.emit("room-not-found");
        return;
      }

      // Validate room expiry (30 minutes)
    const expiryThreshold = new Date(Date.now() - 30 * 60 * 1000);
    if (room.lastActivity < expiryThreshold) {
      console.log("Room expired:", roomId, "lastActivity:", room.lastActivity);
      await Room.deleteOne({ roomId: String(roomId) });
      await Game.deleteOne({ roomId: String(roomId) });
      socket.emit("room-not-found");
      return;
    }

      console.log("Room guest state:", room.guest); // Debug guest state

      // Validate user authorization
      const user = await User.findById(userId);
      if (
        !user ||
        (user._id.toString() !== room.host.id &&
          (!room.guest || user._id.toString() !== room.guest.id))
      ) {
        console.log("User not authorized for room:", roomId, "user:", userId);
        socket.emit("room-not-found");
        return;
      }

      const isHost = user._id.toString() === room.host.id;
      const playerX = {
        id: room.host.id,
        name: room.host.name || "Unknown",
        symbol: "X",
        avatar: room.host.avatar || user.avatar || "",
      };
      const playerO =
        room.guest && room.guest.id
          ? {
              id: room.guest.id,
              name: room.guest.name || "Unknown",
              symbol: "O",
              avatar: room.guest.avatar || "",
            }
          : null;

      // Update socket ID and lastActivity in Room document
      const update = isHost
        ? {
            "host.socketId": socket.id,
            "host.avatar": room.host.avatar || user.avatar || "",
            lastActivity: new Date(),
          }
        : {
            "guest.socketId": socket.id,
            "guest.avatar": room.guest.avatar || user.avatar || "",
            lastActivity: new Date(),
          };
      await Room.findOneAndUpdate(
        { roomId: String(roomId) },
        { $set: update },
        { new: true }
      );
      console.log("Updated room with new socket ID for room:", roomId);
      console.log(
        isHost ? "Host reconnected to room:" : "Guest reconnected to room:",
        roomId
      );

      socket.join(roomId);
      console.log("Socket joined room:", roomId);

      // Check if game exists (only relevant if guest has valid ID)
      const game =
        room.guest && room.guest.id
          ? await Game.findOne({ roomId: String(roomId) })
          : null;

      // Restore timer if game exists and timerDuration is set
    if (game && game.timerDuration && !roomTimers[roomId]) {
      console.log("Restoring timer for room:", roomId, "duration:", game.timerDuration);
      startServerTimer(roomId, game.timerDuration);
    }

      if (!game && room.guest && room.guest.id) {
        socket.emit("both-players-joined", {
          roomId,
          playerX,
          playerO,
          config: {
            board: room.config.boardSize || 3,
            line: room.config.lineLength || 3,
            rounds: room.config.rounds || 1,
            timer: room.config.timerDuration || null,
          },
        });
        console.log("Emitted both-players-joined for room:", roomId);
        return;
      }

      if (!game) {
        // Room is in "waiting for players" state, emit host-joined
        socket.emit("host-joined", {
          roomId,
          host: playerX,
        });
        console.log("Emitted host-joined for room:", roomId);
        return;
      }

      // Game exists, emit reconnect-success with full game state
      socket.emit("reconnect-success", {
        gameState: {
          mySymbol: isHost ? "X" : "O",
          isHost,
          playerX,
          playerO,
          squares: game.board,
          xIsNext: game.xIsNext,
          currentRound: game.round,
          gameOver: game.isFinished,
          isGameFinished: game.isFinished,
          winningLine: game.winningLine || [],
          results: game.results || [], // Include round results
          config: {
            board: game.boardSize || room.config.boardSize || 3,
            line: game.lineLength || room.config.lineLength || 3,
            rounds: game.totalRounds || room.config.rounds || 1,
            timerDuration:
              game.timerDuration || room.config.timerDuration || null,
          },
        },
      });
      console.log("Emitted reconnect-success for room:", roomId);
    } catch (err) {
      console.error("Reconnect error:", err.message);
      socket.emit("error", { message: "Failed to reconnect: " + err.message });
    }
  });

  socket.on("disconnect", async () => {
    console.log("User disconnected:", socket.id);
    console.log("Disconnect timestamp:", Date.now());
  
    try {
      const dbRoom = await Room.findOne({
        $or: [{ "host.socketId": socket.id }, { "guest.socketId": socket.id }],
      });
  
      if (!dbRoom) {
        console.log("No room found for socket:", socket.id);
        return;
      }
  
      const roomId = dbRoom.roomId;
      let isHost = dbRoom.host.socketId === socket.id;
  
      // Delay clearing socketId by 5 minutes
      setTimeout(async () => {
        try {
          // Check if socket has reconnected
          const currentRoom = await Room.findOne({ roomId });
          if (!currentRoom) {
            console.log("Room no longer exists:", roomId);
            return;
          }
          if (
            (isHost && currentRoom.host.socketId === socket.id) ||
            (!isHost && currentRoom.guest.socketId === socket.id)
          ) {
            // Socket hasn't changed, proceed to clear
            const update = isHost
              ? { "host.socketId": null, lastActivity: new Date() }
              : { "guest.socketId": null, lastActivity: new Date() };
  
            await Room.findOneAndUpdate(
              { roomId },
              { $set: update },
              { new: true }
            );
            if (rooms[roomId]) {
              if (isHost) {
                rooms[roomId].host.socketId = null;
              } else {
                rooms[roomId].guest.socketId = null;
              }
            }
            console.log(
              isHost
                ? `Cleared hostSocketId for room: ${roomId} after timeout`
                : `Cleared guestSocketId for room: ${roomId} after timeout`
            );
          } else {
            console.log(
              `Skipped clearing socketId for room: ${roomId}, socket reconnected`
            );
          }
        } catch (error) {
          console.error(
            `Failed to clear ${isHost ? "hostSocketId" : "guestSocketId"} for room ${roomId} after timeout:`,
            error.message
          );
        }
      }, 300000);
  
      // Existing inactivity cleanup logic
      setTimeout(async () => {
        const updatedRoom = await Room.findOne({ roomId });
        if (!updatedRoom) return;
  
        const inactivityDuration =
          updatedRoom.guest && updatedRoom.guest.id ? 900000 : 300000;
        const timeSinceLastActivity =
          new Date() - new Date(updatedRoom.lastActivity);
  
        if (
          !updatedRoom.host.socketId &&
          !updatedRoom.guest.socketId &&
          timeSinceLastActivity > inactivityDuration
        ) {
          const game = await Game.findOne({ roomId });
          if (!game) {
            console.log(
              "Deleted room:",
              roomId,
              "reason: no active sockets and inactive for",
              timeSinceLastActivity / 60000,
              "minutes"
            );
            delete rooms[roomId];
            await Room.deleteOne({ roomId });
            await Game.deleteOne({ roomId });
          } else {
            console.log(
              "Room deletion skipped:",
              roomId,
              "reason: active game found"
            );
          }
        }
      }, 300000);
    } catch (error) {
      console.error(`Failed to process disconnect for socket ${socket.id}:`, error.message);
    }
  });
}

module.exports = registerGameSocket;
