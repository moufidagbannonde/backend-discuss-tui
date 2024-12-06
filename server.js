const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const Message = require("./model/Message")
const mongoose = require("mongoose");
const { error } = require("console");

async function connectToMongo() {
    await mongoose.connect("mongodb://localhost:27017/chat");
}
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

// ajouter le message en base de données

io.on('connection', (socket) => {
    console.log("Un utilisateur est connecté");

    socket.on('message', async (message) => {
        // Diffuser le message à tous les autres clients
        socket.broadcast.emit('message', message);
        await connectToMongo();

        // Ajouter le champ isMe au message
        const messageWithIsMe = {
            ...message,
            isMe: true,
        };

        // ajouter le message en base de données
        Message.create(messageWithIsMe);
    });

    // Ajout de la gestion de modification de message
    socket.on('editMessage', async (data) => {
        // se connecter à la base de données
        await connectToMongo();
        
        const { text, userId, newContent } = data; // Assurez-vous que data contient text, userId et newContent
        // console.log("message à modifier", data);
        
        const updatingMessage = await Message.findOne({ text, userId });
        // console.log("message trouvé", updatingMessage);
        const result = await updatingMessage.updateOne({ text: newContent })
        console.log("message modifié", result);


        // modifier le message en base de données
        // const result = await Message.findOneAndUpdate(
        //     { text, userId }, // Critères de recherche
        //     { text: newContent }, // Nouveau contenu
        //     { new: true } // Retourner le document modifié
        // );
        
        // if (result) {
        //     socket.broadcast.emit("messageEdited", { text, userId, newContent }); // Émettre l'événement avec le message modifié
        //     console.log("Message modifié avec succès :", result);
        // } else {
        //     console.log("Erreur lors de la modification du message");
        // }
    });

    // Ajout de la gestion de suppression de message
    socket.on('deleteMessage', async (data) => {
        // se connecter à la base de données
        await connectToMongo();

        const { text, userId } = data;

        // supprimer le message en base de données en utilisant le texte et l'ID de l'utilisateur
        const result = await Message.findOneAndDelete({ text, userId });

        if (result) {
            console.log("Message supprimé avec succès :", result);
            // Informer tous les clients de la suppression
            io.emit('messageDeleted', result._id); // Émettre l'ID du message supprimé à tous les clients
        } else {
            console.log("Aucun message trouvé à supprimer.");
        }
    });

    // Ajout de la gestion des réponses aux messages
    socket.on('replyMessage', (data) => {
        // Diffuser la réponse à tous les clients
        socket.broadcast.emit('messageReplied', {
            replyTo: data.replyTo,
            message: data.message
        });
    });

    socket.on("deleteMessageForEveryone", (messageId) => {
        // Émettre un événement à tous les clients pour supprimer le message
        io.emit("messageDeleted", messageId);
    });

    socket.on("deleteMessage", (messageId) => {
        // Émettre un événement uniquement à l'utilisateur qui a demandé la suppression
        socket.emit("messageDeleted", messageId);
    });

    socket.on('disconnect', () => {
        console.log('Un utilisateur est déconnecté');
    });
});

server.listen(8080, () => {
    console.log('Serveur en écoute sur le port 8080');
});
