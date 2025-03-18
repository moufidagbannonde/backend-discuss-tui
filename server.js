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

// Au début du fichier, après les imports
const activeCallsMap = new Map();
const pendingCalls = new Map();
// Ajouter une map pour suivre les clients prêts pour les appels
const readyClients = new Map();

io.on('connection', (socket) => {
    // Améliorer l'événement user-connected
    socket.on('user-connected', (userId) => {
        if (!userId) {
            console.error('ID utilisateur invalide');
            return;
        }
        console.log('Utilisateur connecté avec ID:', userId);
        users.set(userId, socket.id);
        socket.userId = userId; // Stocker l'ID sur l'objet socket

        // Informer l'utilisateur qu'il est bien connecté
        socket.emit('connection-confirmed', {
            userId,
            connectedUsers: Array.from(users.keys())
        });
        
        // Amélioration: Envoyer plus d'informations lors de la notification de connexion
        // Inclure le type d'utilisateur (client/agent) dans la notification
        const userType = socket.handshake.query.role || 'unknown';
        socket.userType = userType; // Stocker le type d'utilisateur sur l'objet socket
        
        // Diffuser à tous les utilisateurs avec plus d'informations
        socket.broadcast.emit('user-connected', {
            userId,
            userType,
            timestamp: new Date().toISOString()
        });
        
        console.log(`Utilisateur ${userId} (${userType}) connecté et notifié à tous`);
        console.log('Liste des utilisateurs:', Array.from(users.entries()));
    });

    socket.on('register', (data) => {
        try {
            console.log('Utilisateur enregistré:', data);
    
            const userId = data.userId;
            const userType = data.userType || 'unknown';
            
            users.set(userId, socket.id);
            console.log("Un utilisateur enregistré avec l'id ", userId);
            
            // Stocker l'ID utilisateur et le type dans l'objet socket
            socket.userId = userId;
            socket.userType = userType;
    
            console.log(`Utilisateur ${userId} (${userType}) enregistré avec succès`);
    
            // Informer l'utilisateur que l'enregistrement a réussi
            socket.emit('registered', { 
                success: true,
                userId,
                userType,
                connectedUsers: Array.from(users.keys())
            });
            
            // Informer tous les autres utilisateurs de cette connexion
            socket.broadcast.emit('user-connected', {
                userId,
                userType,
                timestamp: new Date().toISOString()
            });
            
            console.log(`Notification de connexion envoyée pour ${userId} (${userType})`);
            
            // Émettre la liste mise à jour des utilisateurs connectés
            io.emit('online_users', Array.from(users.keys()));
        } catch (error) {
            console.error('Erreur lors de l\'enregistrement de l\'utilisateur:', error);
            socket.emit('registered', { success: false, error: error.message });
        }
    });
    
    // Améliorer l'événement register-video-call (s'il est utilisé dans le frontend)
    socket.on('register-video-call', (data) => {
        try {
            const { userId, userType } = data;
            
            if (!userId) {
                console.error('ID utilisateur invalide dans register-video-call');
                return;
            }
            
            console.log(`Utilisateur enregistré pour appel vidéo: ${userId} (${userType})`);
            
            // Stocker l'utilisateur avec son type
            users.set(userId, socket.id);
            
            // Associer l'ID utilisateur et le type au socket
            socket.userId = userId;
            socket.userType = userType;
            
            // Informer l'utilisateur qu'il est bien enregistré
            socket.emit('video-call-registered', {
                userId,
                userType,
                connectedUsers: Array.from(users.keys())
            });
            
            // Amélioration: Informer tous les autres utilisateurs de cette connexion
            socket.broadcast.emit('user-connected', {
                userId,
                userType,
                timestamp: new Date().toISOString()
            });
            
            console.log(`Notification de connexion envoyée pour ${userId} (${userType})`);
            
            // Émettre la liste mise à jour des utilisateurs connectés
            io.emit('online_users', Array.from(users.keys()));
            
            console.log('Liste des utilisateurs après enregistrement:', Array.from(users.entries()));
        } catch (error) {
            console.error('Erreur lors de l\'enregistrement pour appel vidéo:', error);
        }
    });

    // Nouvel événement pour indiquer qu'un client est prêt pour un appel
    socket.on('client-ready-for-call', (data) => {
        try {
          const { clientId, userType } = data;
          console.log(`Client ${clientId} est prêt pour un appel (type: ${userType})`);
          
          readyClients.set(clientId, {
            socketId: socket.id,
            userType,
            readyAt: new Date().toISOString()
          });
          
          // Trouver l'agent connecté (si agentId est passé via URL ou autre mécanisme)
          const agentSocket = Array.from(users.entries()).find(([userId, socketId]) => 
            userId.startsWith('agent') // Supposons que les agentId commencent par "agent"
          );
          
          if (agentSocket) {
            const [agentId, agentSocketId] = agentSocket;
            // Envoyer l'événement spécifiquement à l'agent
            io.to(agentSocketId).emit('client-ready', {
              clientId,
              userType,
              timestamp: new Date().toISOString()
            });
            console.log(`Notification envoyée à l'agent ${agentId} : client ${clientId} est prêt`);
          } else {
            // Si aucun agent spécifique n'est trouvé, diffuser à tous 
            io.emit('client-ready', {
              clientId,
              userType,
              timestamp: new Date().toISOString()
            });
            console.log(`Aucun agent spécifique trouvé, notification diffusée à tous`);
          }
        } catch (error) {
          console.error('Erreur lors de la notification de client prêt:', error);
        }
      });
    // À l'arrivée de l'offre
    socket.on('call-offer', (data) => {
        try {
            console.log('Offre d\'appel reçue:', data);
            
            // Vérifier que les données nécessaires sont présentes
            if (!data.to || !data.offer) {
                console.error('Données d\'offre incomplètes:', data);
                return;
            }
            
            // S'assurer que le champ from est défini
            if (!data.from || data.from === '') {
                data.from = socket.userId;
                console.log('Champ "from" manquant ou vide, utilisation de socket.userId:', socket.userId);
            }
            
            // Trouver le socket du destinataire
            const targetSocketId = users.get(data.to);
            
            if (targetSocketId) {
                console.log(`Transmission de l'offre d'appel de ${data.from} à ${data.to}`);
                // Transmettre l'offre au destinataire
                io.to(targetSocketId).emit('call-offer', data);
            } else {
                console.log(`Utilisateur ${data.to} non connecté, impossible de transmettre l'offre`);
                // Informer l'appelant que le destinataire n'est pas disponible
                socket.emit('call-rejected', {
                    from: data.to,
                    reason: 'user-unavailable'
                });
            }
        } catch (error) {
            console.error('Erreur lors de la réception de l\'offre:', error);
        }
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

    // Gérer l'enregistrement des utilisateurs
    socket.on('register', (data) => {
        try {
            console.log('Utilisateur enregistré:', data);

            const userId = data.userId;
            users.set(userId, socket.id);
            console.log("Un utilisateur enregistré avec l'id ", userId);
            // Stocker l'ID utilisateur dans l'objet socket
            socket.userId = data.userId;
            socket.userType = data.userType || 'unknown';

            console.log(`Utilisateur ${data.userId} (${socket.userType}) enregistré avec succès`);

            // Informer l'utilisateur que l'enregistrement a réussi
            socket.emit('registered', { success: true });
        } catch (error) {
            console.error('Erreur lors de l\'enregistrement de l\'utilisateur:', error);
            socket.emit('registered', { success: false, error: error.message });
        }
    });
   


    // Dans votre fichier server.js
    socket.on('call-metadata', (data) => {
        const targetSocketId = users.get(data.to);
        if (targetSocketId) {
            console.log(`Préparation d'appel de ${data.from} à ${data.to} avec vidéo: ${data.withVideo}`);
            // Stocker temporairement les informations d'appel
            const callInfo = {
                from: data.from,
                to: data.to,
                withVideo: data.withVideo,
                status: 'pending'
            };
            io.to(targetSocketId).emit("call-metadata", {
                from: data.from,
                to: data.to,
                withVideo: data.withVideo,
                callInfo
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
        try {
            // Vérifier que les données nécessaires sont présentes
            if (!data.candidate) {
                console.error('Données de candidat ICE incomplètes: candidat manquant');
                return;
            }
            
            // S'assurer que le champ from est défini
            if (!data.from || data.from === '') {
                data.from = socket.userId;
                console.log('Champ "from" manquant ou vide dans le candidat ICE, utilisation de socket.userId:', socket.userId);
            }
            
            // S'assurer que le champ to est défini
            if (!data.to) {
                console.error('Champ "to" manquant dans le candidat ICE, impossible de transmettre');
                return;
            }
            
            console.log(`Candidat ICE reçu de ${data.from} pour ${data.to}`);
            
            // Trouver le socket du destinataire en utilisant d'abord la Map users
            const targetSocketId = users.get(data.to);
            
            if (targetSocketId) {
                console.log(`Transmission du candidat ICE de ${data.from} à ${data.to} via socketId`);
                io.to(targetSocketId).emit('ice-candidate', data);
            } else {
                // Essayer de trouver le socket directement
                const targetSocket = findSocketByUserId(data.to);
                if (targetSocket) {
                    console.log(`Transmission du candidat ICE de ${data.from} à ${data.to} via socket direct`);
                    targetSocket.emit('ice-candidate', data);
                } else {
                    console.log(`Utilisateur ${data.to} non connecté, impossible de transmettre le candidat ICE`);
                }
            }
        } catch (error) {
            console.error('Erreur lors de la transmission du candidat ICE:', error);
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

    // Améliorer l'événement call-answer
    socket.on('call-answer', (data) => {
        console.log('Réponse d\'appel reçue:', data);

        // Vérifier si l'objet data est valide
        if (!data || !data.answer) {
            console.error('Données de réponse invalides - format incorrect');
            return;
        }

        // Extraire les IDs des utilisateurs de la session active
        const from = socket.userId;
        const to = data.to;

        // Vérifier que l'appelant et l'appelé sont différents
        if (from === to) {
            console.error('L\'appelant et l\'appelé ne peuvent pas être identiques');
            socket.emit('call-error', {
                type: 'INVALID_CALL',
                message: 'Appel invalide : même utilisateur'
            });
            return;
        }

        console.log('Transmission de la réponse:', { from, to });
        const targetSocketId = users.get(to);

        if (!targetSocketId) {
            console.error(`Socket non trouvé pour l'utilisateur: ${to}`);
            socket.emit('call-answer-received', {
                success: false,
                error: 'Utilisateur non trouvé'
            });
            return;
        }

        // Envoyer la réponse avec les IDs corrects
        io.to(targetSocketId).emit("call-answer", {
            answer: data.answer,
            from: from,
            to: to,
            withVideo: data.withVideo,
            timestamp: Date.now() // Ajouter un timestamp pour le suivi
        });

        // Mettre à jour l'état de l'appel
        if (activeCallsMap.has(to)) {
            activeCallsMap.set(to, {
                ...activeCallsMap.get(to),
                status: 'connected',
                answeredAt: Date.now()
            });
        }

        // Confirmer la réception
        socket.emit('call-answer-received', {
            success: true,
            timestamp: Date.now()
        });
    });

    // Ajouter un nouvel événement pour la synchronisation
    socket.on('call-state-sync', (data) => {
        const { userId, state } = data;
        if (activeCallsMap.has(userId)) {
            const callInfo = activeCallsMap.get(userId);
            socket.emit('call-state-update', {
                ...callInfo,
                currentState: state
            });
        }
    });

    // Gérer les demandes de nouvelle offre
    socket.on('request-offer', (data) => {
        try {
            console.log(`Demande de nouvelle offre de ${data.from} à ${data.to}`);
            
            // Vérifier que les données nécessaires sont présentes
            if (!data.to || !data.from) {
                console.error('Données de demande d\'offre incomplètes:', data);
                return;
            }
            
            // Trouver le socket du destinataire
            const targetSocketId = users.get(data.to);
            
            if (targetSocketId) {
                console.log(`Transmission de la demande d'offre de ${data.from} à ${data.to}`);
                // Transmettre la demande au destinataire
                io.to(targetSocketId).emit('offer-requested', {
                    from: data.from,
                    to: data.to
                });
            } else {
                console.log(`Utilisateur ${data.to} non connecté, impossible de transmettre la demande d'offre`);
                // Informer l'appelant que le destinataire n'est pas disponible
                socket.emit('request-offer-failed', {
                    to: data.to,
                    reason: 'user-unavailable'
                });
            }
        } catch (error) {
            console.error('Erreur lors de la transmission de la demande d\'offre:', error);
            socket.emit('request-offer-failed', {
                error: error.message
            });
        }
    });
    // Améliorer la déconnexion
    socket.on('disconnect', () => {
        const userId = socket.userId;
        if (userId) {
            console.log(`Déconnexion de l'utilisateur: ${userId}`);
            users.delete(userId);
            socket.broadcast.emit('user-disconnected', { userId });

            // Nettoyer les appels actifs
            if (activeCallsMap.has(userId)) {
                activeCallsMap.delete(userId);
            }
            
            // Nettoyer les clients prêts
            if (readyClients.has(userId)) {
                readyClients.delete(userId);
                // Informer que ce client n'est plus disponible
                socket.broadcast.emit('client-unavailable', { clientId: userId });
            }
            
            // Nettoyer les connexions de partage d'écran
            for (const [id, socketId] of connections.entries()) {
                if (socketId === socket.id) {
                    connections.delete(id);
                    socket.broadcast.emit('screen-share-ended', { agentId: id });
                    break;
                }
            }
        }
        console.log('Utilisateurs restants:', Array.from(users.entries()));
    });
});
    server.listen(8080, () => {
        console.log('Serveur en écoute sur le port 8080');
    });

    // Fonction pour trouver un socket par ID utilisateur
    function findSocketByUserId(userId) {
        // D'abord essayer de trouver le socketId dans la Map users
        const socketId = users.get(userId);
        if (socketId) {
            const socket = io.sockets.sockets.get(socketId);
            if (socket) {
                return socket;
            }
        }
        
        // Si non trouvé, parcourir tous les sockets connectés
        for (const [id, socket] of io.sockets.sockets) {
            if (socket.userId === userId) {
                // Mettre à jour la Map users pour les prochaines recherches
                users.set(userId, id);
                return socket;
            }
        }
        return null;

    }