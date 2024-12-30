// Import required modules
const express = require('express');
const router = express.Router();
const Message = require('../model/Message');

const io = require('socket.io')(server, {
  cors: {
    origin: "http://localhost:5173",
    methods: ["GET", "POST"],
    credentials: true
  }
});
// création d'un message en base de donnée
router.post('/', async (req, res) => {
  try {
    await connectToMongo();
    const message = await Message.create(req.body);
    // Émettre le message aux autres clients
    io.emit('message', {
      ...req.body,
      id: message._id,
      isMe: false,
      isRead: false
    });
    res.json(message);
  } catch (error) {
    console.error("Erreur lors de la création du message:", error);
    res.status(500).json({ error: error.message });
  }
});




module.exports = router;
