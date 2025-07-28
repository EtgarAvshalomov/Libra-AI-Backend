// src/routes/models.js - Model routes
import { Router } from 'express';
import { PrismaClient } from '../generated/prisma/index.js';

const router = Router();
const prisma = new PrismaClient();

// GET /api/models - Get available models
router.get('/', async (req, res) => {
    try {
        const models = await prisma.models.findMany();
        
        res.status(200).json({
            data: { models }
        });
    } catch (error) {
        res.status(500).json({
            error: error.message
        });
    }
})

// POST /api/models - Add new model
router.post('/', async (req, res) => {
    try {
        const { name, value } = req.body;

        if( !name || !value ) res.status(400).json({ error: 'Invalid parameters' });

        if( name.length > 100 ) res.status(400).json({ error: 'Name too long' });
        if( value.length > 100 ) res.status(400).json({ error: 'Value too long' });

        await prisma.models.create({
            data: { name, value }
        });

        res.status(201).json({ message: 'Model added successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

export default router;