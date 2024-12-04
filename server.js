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

    // Ajout de la gestion de modification de message
    socket.on('editMessage', (data) => {
        // Diffuser le message modifié à tous les clients
        socket.broadcast.emit('messageEdited', {
            messageId: data.messageId,
            newContent: data.newContent
        });
    });

    // Ajout de la gestion de suppression de message
    socket.on('deleteMessage', (messageId) => {
        // Informer tous les clients de la suppression
        socket.broadcast.emit('messageDeleted', messageId);
    });

    // Ajout de la gestion des réponses aux messages
    socket.on('replyMessage', (data) => {
        // Diffuser la réponse à tous les clients
        socket.broadcast.emit('messageReplied', {
            replyTo: data.replyTo,
            message: data.message
        });
    });

    socket.on('disconnect', () => {
        console.log('Un utilisateur est déconnecté');
    });
});

server.listen(8080, () => {
    console.log('Serveur en écoute sur le port 8080');
});
