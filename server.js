const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const Message = require("./model/Message")
const mongoose = require("mongoose");
const userSocketMap = new Map();
const users = new Map();
const connections = new Map();

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
        users.set(userId, socket.id);
        socket.broadcast.emit('user-connected', userId);
        console.log('users mis à jour:', Array.from(users.entries()));
    });

    // événement pour l'invitation à un appel
    socket.on('invite-to-call', (data) => {
        const { inviteeID, roomID, callerID } = data;
        console.log('Invitation reçue:', { inviteeID, roomID, callerID });

        const inviteeSocketId = users.get(inviteeID);
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

    socket.on('register', (data) => {
        const userId = data.userId;
        users.set(userId, socket.id);
        console.log("Un utilisateur enregistré avec l'id ", userId);
    });
    // Remplacer les événements WebRTC existants par ceux-ci
    socket.on("call-offer", (data) => {
        const targetSocketId = users.get(data.to);
        if (targetSocketId) {
            console.log(`Envoi de call-offer à ${data.to} avec vidéo: ${data.withVideo}`);
            // Stocker temporairement les informations d'appel
            const callInfo = {
                from: data.from,
                to: data.to,
                withVideo: data.withVideo,
                status: 'pending'
            };
            io.to(targetSocketId).emit("call-offer", {
                ...data,
                callInfo
            });
        }
    });

    socket.on('call-answer', (data) => {
        console.log('Call-answer event received:', data);
        console.log('Searching target user in users map:', data.to, users.get(data.to));
        const targetSocketId = users.get(data.to);

        if (targetSocketId) {
            console.log(`Forwarding call-answer to socket: ${targetSocketId}`);
            io.to(targetSocketId).emit("call-answer", data);
            // Envoyer une confirmation à l'émetteur
            socket.emit('call-answer-received', { success: true });
        } else {
            console.error(`Target socket not found for user: ${data.to}`);
            socket.emit('call-answer-received', {
                success: false,
                error: 'Target user not found'
            });
        }
    });

    socket.on('call-accepted', (data) => {
        console.log('Appel accepté:', data);
        const { from, localDescription } = data;
        
        // Trouver le socket de l'appelant
        const callerSocketId = users.get(data.to);
        if (callerSocketId) {
            // Transmettre l'acceptation à l'appelant
            io.to(callerSocketId).emit('call-accepted', {
                from,
                localDescription,
                accepted: true
            });
        } else {
            socket.emit('call-error', {
                message: "L'appelant n'est plus connecté"
            });
        }
    });
    
    // Gestion des candidats ICE entre l'appelant et l'appelé
    socket.on('ice-candidate', (data) => {
        const targetSocketId = users.get(data.to);
        if (targetSocketId) {
            console.log(`Envoi de ICE candidate de ${data.from} à ${data.to}`);
            io.to(targetSocketId).emit('ice-candidate', data);
        }
    });
    // Evénement de fin d'appel
    socket.on('call-ended', (data) => {
        const targetSocketId = users.get(data.to);
        if (targetSocketId) {
            console.log(`Appel terminé entre ${data.from} et ${data.to}`);
            io.to(targetSocketId).emit('call-ended', data);
            // Notifier également l'appelant
            socket.emit('call-ended-confirmation', data);
        }
    });

    /**
     * événements de partage d'écran
     */

    // agent prêt à partager son écran
    socket.on('agent-ready', ({ agentId }) => {
        console.log(`Agent ${agentId} ready to share screen`);
        connections.set(agentId, socket.id);
        socket.broadcast.emit('agent-available', { agentId });
    });

    //  superviseur prêt à observer un agent
    socket.on('supervisor-connect', ({ agentId }) => {
        const agentSocketId = connections.get(agentId);
        if (agentSocketId) {
            io.to(agentSocketId).emit('supervisor-ready');
        }
    });

    // offre de partage d'écran
    socket.on('screen-offer', ({ agentId, offer }) => {
        socket.broadcast.emit('screen-offer', { agentId, offer });
    });

    //  réponse du superviseur
    socket.on('screen-answer', ({ agentId, answer }) => {
        const agentSocketId = connections.get(agentId);
        if (agentSocketId) {
            io.to(agentSocketId).emit('screen-answer', answer);
        }
    });

    // // Gérer les candidats ICE pour le partage d'écran
    // socket.on('ice-candidate', ({ agentId, candidate }) => {
    //     socket.broadcast.emit('ice-candidate', candidate);
    // });

    // Gérer l'arrêt du partage d'écran
    socket.on('screen-share-stopped', () => {
        // Trouver l'agentId associé à ce socket
        let agentId = null;
        for (const [id, socketId] of connections.entries()) {
            if (socketId === socket.id) {
                agentId = id;
                break;
            }
        }

        if (agentId) {
            socket.broadcast.emit('screen-share-ended', { agentId });
            connections.delete(agentId);
        }
    });

    // Ajouter cet événement pour gérer la déconnexion
    socket.on('disconnect', () => {
        let disconnectedUserId = null;
        for (const [userId, socketId] of users.entries()) {
            if (socketId === socket.id) {
                disconnectedUserId = userId;
                users.delete(userId);
                // Notifier les autres utilisateurs de la déconnexion
                socket.broadcast.emit('user-disconnected', {
                    userId: disconnectedUserId
                });
                break;
            }
        }
        console.log(`Utilisateur déconnecté: ${disconnectedUserId}`);
    });

    // socket.on('disconnect', () => {
    //     // Remove user from users map
    //     for (const [userId, socketId] of users.entries()) {
    //         if (socketId === socket.id) {
    //             users.delete(userId);
    //             break;
    //         }
    //     }
    // });



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
        for (const [userId, socketId] of users.entries()) {
            if (socketId === socket.id) {
                users.delete(userId);
                break;
            }
        }
    });
});

server.listen(8080, () => {
    console.log('Serveur en écoute sur le port 8080');
});
