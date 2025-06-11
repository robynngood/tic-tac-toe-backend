const { Server } = require("socket.io");
const registerGameSocket = require("./gameSocket");

function setupSocket(server) {
  const io = new Server(server, {
    cors: {
      origin: process.env.FRONTEND_URL,
      credentials: true,
    },
  });

  const rooms = {}; // You can pass this to any submodule
  io.on("connection", (socket) => {
    console.log("User connected:", socket.id);

    // Call sub-modules
    registerGameSocket(io, socket, rooms);
  });
}

module.exports = setupSocket;

