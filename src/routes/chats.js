// src/routes/chats.js - Chat routes
import { Router } from 'express';
import { PrismaClient } from '../generated/prisma/index.js';
import { authenticateToken } from '../middleware/userAuth.js';

const router = Router();
const prisma = new PrismaClient();

// POST /api/chats - Create new chat
router.post('/', authenticateToken, async (req, res) => {
    try {
        await prisma.chats.create({
            data: { user_id: req.user.userId }
        });

        const chat = await prisma.chats.findFirst({
            where: { user_id: req.user.userId },
            orderBy: { created_at: 'desc' }
        });

        res.status(201).json({ message: 'Chat created successfully', chat: { chat } });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// PUT /api/chats?chatId={uuid} - Update chat name
router.put('/', authenticateToken, async (req, res) => {
    try {
        const chatId = req.query.chatId;
        if (!chatId) {
            return res.status(400).json({ error: "Invalid chat id" });
        }

        if(req.body.name.length > 50) return res.status(400).json({ error: 'Name too long' });

        if(!req.body.name) return res.status(400).json({ error: 'Invalid parameters' });

        const chat = await prisma.chats.findUnique({ where: { id: chatId } });
        if (!chat) return res.status(404).json({ error: 'Chat not found' });

        if(chat.user_id !== req.user.userId) return res.status(403).json({ error: 'Unauthorized' });

        if(chat.is_deleted) return res.status(400).json({ error: 'Chat is deleted' });
        
        await prisma.chats.update({
            where: { id: chatId },
            data: { name: req.body.name }
        });

        res.status(200).json({ message: 'Chat name updated successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// GET /api/chats - Get user chats
router.get('/', authenticateToken, async (req, res) => {
    try {
        const chats = await prisma.chats.findMany({ 
            where: { user_id: req.user.userId, is_deleted: false },
            orderBy: { last_updated: 'desc' }
        });
        res.status(200).json({ data: { chats } });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// DELETE /api/chats?chatId={uuid} - Delete chat
router.delete('/', authenticateToken, async (req, res) => {
    try {
        const chatId = req.query.chatId;
        if (!chatId) {
            return res.status(400).json({ error: "Invalid chat id" });
        }

        const chat = await prisma.chats.findUnique({ where: { id: chatId } });
        if (!chat) return res.status(404).json({ error: 'Chat not found' });

        if(chat.is_deleted) return res.status(400).json({ error: 'Chat already deleted' });

        if(chat.user_id !== req.user.userId) return res.status(403).json({ error: 'Unauthorized' });
        
        await prisma.chats.update({
            where: { id: chatId },
            data: { is_deleted: true }
        });
        
        res.status(200).json({ message: 'Chat deleted successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

export default router;