const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
    isMe: { type: Boolean, required: true }, 
    text: { type: String, required: true },  
    time: { type: Date, default: Date.now },  
    userId: { type: String, required: true },
    // conversationId: { type: String, required: true },
    isRead: {type: Boolean, default: false},
    // receiverId: {type: String, required: true}
});


const Message = mongoose.model('Message', messageSchema);

module.exports = Message; 