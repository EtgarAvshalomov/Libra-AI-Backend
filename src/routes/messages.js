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
                model: response.name,
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
            data: { chat_id: chatId, role: 'assistant', content: response.message, model_id, temperature }
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

// POST /api/messages/assistant-stream?chatId={uuid} - Add new assistant response
router.post('/assistant-stream', authenticateToken, async (req, res) => {
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
        
        // Get the conversation history
        const messages = await prisma.messages.findMany({
            where: { chat_id: chatId },
            orderBy: { created_at: 'asc' },
            select: { role: true, content: true }
        });

        // Get the assistant's response
        const { stream, controller } = await openaiService.streamChat({
            messages,
            model,
            max_tokens,
            temperature
        });

        // Create new assistant message in the database
        await prisma.messages.create({
            data: { chat_id: chatId, role: 'assistant', content: '', model_id, temperature }
        })

        // Find newly created assistant message
        const newMessage = await prisma.messages.findFirst({
            where: { chat_id: chatId, role: 'assistant' },
            orderBy: { created_at: 'desc' },
            select: { id: true }
        });

        let buffer = '';

        // Save the response to the database every second
        const saveInterval = setInterval(async () => {
        if (buffer.text) {
            await prisma.messages.update({
                where: { id: newMessage.id },
                data: { content: buffer }
            });
        }
        }, 1000);

        let clientAborted = false;

        // Enable SSE
        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");

        // Listen for client disconnection and manual abort
        req.socket.on('close', () => {
            clientAborted = true;
            controller.abort();
            clearInterval(saveInterval);
        });

        // Streaming response and saving to buffer
        for await (const chunk of stream) {
            if (clientAborted) break;
            
            const content = chunk.choices?.[0]?.delta?.content;
            if (content) {
                res.write(`data: ${JSON.stringify({type: 'content', data: content})}\n\n`);
                buffer += content;
            }
        }

        clearInterval(saveInterval);
        
        if (buffer) {
            console.log(buffer);
            await prisma.messages.update({
                where: { id: newMessage.id },
                data: { content: buffer }
            });
        }

        res.write(`data: ${JSON.stringify({type: 'done'})}\n\n`);
        res.end();
    } catch (error) {
        console.error("🔴 Stream error:", error);
        res.writeHead(500);
        res.end();
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
            select: { role: true, content: true, model_id: true, temperature: true }
        });
        res.status(200).json({ data: { messages } });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

export default router;