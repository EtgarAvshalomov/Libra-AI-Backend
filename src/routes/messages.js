// src/routes/messages.js - Messages routes
import { Router } from 'express';
import { PrismaClient } from '../generated/prisma/index.js';
import openaiService from '../services/openRouterService.js';
import { validateChatParams } from '../middleware/chatValidation.js';
import { authenticateToken } from '../middleware/userAuth.js';

const router = Router();
const prisma = new PrismaClient();

// POST /api/messages/user?chatId={uuid} - Add new user response
router.post('/user', validateChatParams, authenticateToken, async (req, res) => {
    try {
        const { prompt, model } = req.body;

        const chatId = req.query.chatId;
        if (!chatId) {
            return res.status(400).json({ error: "Invalid chat id" });
        }

        const user = await prisma.users.findUnique({ where: { id: req.user.userId } });
        if (!user) return res.status(404).json({ error: 'User not found' });

        const chat = await prisma.chats.findUnique({ where: { id: chatId } });
        if (!chat) return res.status(404).json({ error: 'Chat not found' });

        if(chat.user_id !== user.id) return res.status(403).json({ error: 'Unauthorized' });

        if(chat.is_deleted) return res.status(400).json({ error: 'Chat is deleted' });

        let response = await prisma.models.findUnique({
            where: { value: model },
            select: { id: true }
        });
        const model_id = response.id;

        // Add the new user message
        await prisma.messages.create({
            data: { chat_id: chatId, role: 'user', content: prompt, model_id }
        });

        await prisma.chats.update({
            where: { id: chatId },
            data: { last_updated: new Date() }
        });
        
        res.status(201).json({
            data: {
                prompt: prompt,
                model: response.model,
            }
        });
    } catch (error) {
        res.status(500).json({
            error: error.message
        });
    }
});

// POST /api/messages/assistant?chatId={uuid} - Add new assistant response
router.post('/assistant', validateChatParams, authenticateToken, async (req, res) => {
    try {
        const { model, max_tokens, temperature } = req.body;

        const chatId = req.query.chatId;
        if (!chatId) {
            return res.status(400).json({ error: "Invalid chat id" });
        }

        const user = await prisma.users.findUnique({ where: { id: req.user.userId } });
        if (!user) return res.status(404).json({ error: 'User not found' });

        const chat = await prisma.chats.findUnique({ where: { id: chatId } });
        if (!chat) return res.status(404).json({ error: 'Chat not found' });

        if(chat.user_id !== user.id) return res.status(403).json({ error: 'Unauthorized' });

        if(chat.is_deleted) return res.status(400).json({ error: 'Chat is deleted' });

        let response = await prisma.models.findUnique({
            where: { value: model },
            select: { id: true }
        });
        const model_id = response.id;
        
        // Get the assistant's response
        const messages = await prisma.messages.findMany({
            where: { chat_id: chatId },
            orderBy: { created_at: 'asc' },
            select: { role: true, content: true }
        });

        response = await openaiService.chatCompletion(messages, {
            model,
            max_tokens,
            temperature
        });

        console.log(`User: ${messages[messages.length - 1].content}`);
        console.log(`Assistant: ${response.message}`);

        // Add the assistant's response to the conversation history
        await prisma.messages.create({
            data: { chat_id: chatId, role: 'assistant', content: response.message, model_id }
        });

        await prisma.chats.update({
            where: { id: chatId },
            data: { last_updated: new Date() }
        });
        
        res.status(201).json({
            data: {
                response: response.message,
                model: response.model,
                usage: response.usage
            }
        });
    } catch (error) {
        res.status(500).json({
            error: error.message
        });
    }
});

// GET /api/messages?chatId={uuid} - Get all messages
router.get('/', authenticateToken, async (req, res) => {
    try {
        const chatId = req.query.chatId;
        if (!chatId) {
            return res.status(400).json({ error: "Invalid chat id" });
        }
        const user = await prisma.users.findUnique({ where: { id: req.user.userId } });
        if (!user) return res.status(404).json({ error: 'User not found' });

        const chat = await prisma.chats.findUnique({ where: { id: chatId } });
        if (!chat) return res.status(404).json({ error: 'Chat not found' });

        if(chat.user_id !== user.id) return res.status(403).json({ error: 'Unauthorized' });

        if(chat.is_deleted) return res.status(400).json({ error: 'Chat is deleted' });

        const messages = await prisma.messages.findMany({
            where: { chat_id: chatId,  },
            orderBy: { created_at: 'asc' },
            select: { role: true, content: true }
        });
        res.status(200).json({ data: { messages } });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

export default router;