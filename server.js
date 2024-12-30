const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const Message = require("./model/Message")
const mongoose = require("mongoose");
const userSocketMap = new Map();

async function connectToMongo() {
    await mongoose.connect("mongodb://localhost:27017/chat");
}
const app = express();
const server = http.createServer(app);
const io = require('socket.io')(server, {
    cors: {
        origin: "http://localhost:5173",
        methods: ["GET", "POST"],
        credentials: true
    }
});
app.use(cors());

// ajouter le message en base de données

io.on('connection', (socket) => {

    // événement pour l'identification du user connecté
    socket.on('user-connected', (userId) => {
        console.log('Utilisateur connecté avec ID:', userId);
        userSocketMap.set(userId, socket.id);
        console.log('userSocketMap mis à jour:', Array.from(userSocketMap.entries()));
    });

    // événement pour l'invitation à un appel
    socket.on('invite-to-call', (data) => {
        const { inviteeID, roomID, callerID } = data;
        console.log('Invitation reçue:', { inviteeID, roomID, callerID });
        
        const inviteeSocketId = userSocketMap.get(inviteeID);
        if (inviteeSocketId) {
            console.log('Envoi de l\'invitation à:', inviteeSocketId);
            io.to(inviteeSocketId).emit('call-invitation', {
                callerID,
                roomID
            });
        } else {
            console.log('Utilisateur non trouvé:', inviteeID);
            // Informer l'appelant que l'utilisateur n'est pas connecté
            socket.emit('invitation-error', {
                message: 'Utilisateur non connecté'
            });
        }
    });

    // événement pour l'envoi d'un message
    socket.on('message', async (message) => {
        // Diffuser le message à tous les autres clients
        socket.broadcast.emit('message', message);
        await connectToMongo();

        // formatter le contenu de l'objet Message 
        const messageWithIsMe = {
            ...message,
            isMe: true,
            isRead: false
        };

        // insérer le message en base de données
        Message.create(messageWithIsMe);
    });

    // événement pour l'édition d'un message
    socket.on('editMessage', async (data) => {
        // se connecter à la base de données
        await connectToMongo();

        const { text, userId, newContent } = data;
        // console.log("message à modifier", data);

        // récupérer le message à modifier
        const updatingMessage = await Message.findOne({ text, userId });
        // mettre à jour le message récupéré
        if (updatingMessage) {
            const result = await updatingMessage.updateOne({ text: newContent });
            if (result) {
                socket.broadcast.emit("messageEdited", { text, userId, newContent });
                return { message: "Message modifié avec succès :", data: result }
            } else {
                return { message: "Erreur lors de la modification du message" };
            }
        } else {
            return { message: "Message non trouvé" }
        }


    });

    // événement pour la suppression de message
    socket.on('deleteMessage', async (data) => {
        await connectToMongo();

        const { text, userId, forEveryOne } = data;

        const deletingMessage = await Message.findOne({ text, userId });
        console.log("message à supprimer", deletingMessage);
        if (deletingMessage) {
            const result = await deletingMessage.deleteOne();

            if (result.deletedCount > 0) {
                console.log("Message supprimé avec succès :", result);
                if (!forEveryOne) {
                    socket.broadcast.emit('messageDeleted', deletingMessage._id);
                } else {
                    socket.broadcast.emit('deleteMessageForEveryOne', deletingMessage._id);
                }
            } else {
                console.log("Erreur lors de la suppression du message.");
            }
        } else {
            console.log("Aucun message trouvé à supprimer.");
        }
    });

    // Ajout de la gestion des réponses aux messages
    socket.on('replyMessage', (data) => {
        // Diffuser la réponse à tous les clients
        socket.broadcast.emit('messageReplied', {
            replyTo: data.replyTo,
            message: data.message,
            userId: data.userId
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
        for (const [userId, socketId] of userSocketMap.entries()) {
            if (socketId === socket.id) {
                userSocketMap.delete(userId);
                break;
            }
        }
    });
});

server.listen(8080, () => {
    console.log('Serveur en écoute sur le port 8080');
});
