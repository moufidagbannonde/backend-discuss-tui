const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");


const app = express();
const server = http.createServer(app);
const io = require('socket.io')(server, {
    cors: {
      origin: "http://localhost:5173", // URL de votre app Vue.js
      methods: ["GET", "POST"],
        credentials: true
    }
});
app.use(cors());


io.on('connection', (socket) => {
    console.log("Un utilisateur est connecté");

    socket.on('message', (message) => {
        // Diffuser le message à tous les autres clients
        socket.broadcast.emit('message', message);
    });

    socket.on('disconnect', () => {
        console.log('Un utilisateur est déconnecté');
    });
});

server.listen(8080, () => {
    console.log('Serveur en écoute sur le port 8080');
});
