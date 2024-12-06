const mongoose = require('mongoose');

// Définition du schéma de message
const messageSchema = new mongoose.Schema({
    isMe: { type: Boolean, required: true }, // Indique si le message a été envoyé par l'utilisateur
    text: { type: String, required: true },  // Contenu du message
    time: { type: Date, default: Date.now },  // Heure d'envoi du message
    userId: { type: String, required: true }  // ID de l'utilisateur qui a envoyé le message
});

// Création du modèle
const Message = mongoose.model('Message', messageSchema);

module.exports = Message; 