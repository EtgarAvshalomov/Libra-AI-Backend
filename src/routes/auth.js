// src/routes/auth.js - Authentication routes
import { Router } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '../generated/prisma/index.js';
import { authenticateToken } from '../middleware/userAuth.js';

const router = Router();
const prisma = new PrismaClient();

const JWT_SECRET = process.env.JWT_SECRET;

// POST /api/auth/register - Register a new user
router.post('/register', async (req, res) => {
    try {
        const { firstName, lastName, email, password } = req.body;

        if (!firstName || !lastName || !email || !password) {
            return res.status(400).send('All fields are required');
        }

        const passwordByteLength = new TextEncoder().encode(password).length;

        if(firstName.length > 50) return res.status(400).send({message: 'First name too long'});
        if(lastName.length > 50) return res.status(400).send({message: 'Last name too long'});
        if(email.length > 320) return res.status(400).send({message: 'E-mail too long'});
        if(passwordByteLength > 72) return res.status(400).send({message: 'Password too long'});

        // Check if email already exists
        const existingUser = await prisma.users.findUnique({ where: { email } });
        if (existingUser) return res.status(400).send({message: 'E-mail already exists'});

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);
        await prisma.users.create({
            data: { first_name: firstName.toLowerCase(), last_name: lastName.toLowerCase(), email: email.toLowerCase(), password_hash: hashedPassword }
        });

        // Find user
        const user = await prisma.users.findUnique({ where: { email } });
        if (!user) return res.status(400).send({message: 'Error creating user'});

        /// Login user
        const token = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });

        res.cookie('token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'Strict',
            maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
        });

        res.status(201).json({ message: 'User registered successfully' });
    } catch (error) {
        res.status(500).json({ error: 'Server error ' + error.message, stack: error.stack || '' });
    }
});

// POST /api/auth/login - Login a user
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).send('Email and password are required');
        }

        // Find user
        const user = await prisma.users.findUnique({ where: { email } });
        if (!user) return res.status(400).send({message: 'Invalid credentials' });

        // Check if password is correct
        const valid = await bcrypt.compare(password, user.password_hash);
        if (!valid) return res.status(400).send({message: 'Invalid credentials' });

        // Login user
        const token = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });

        res.cookie('token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'Strict',
            maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
        });

        res.status(200).json({ message: 'Login successful' });
    } catch (error) {
        res.status(500).json({ error: 'Server error ' + error.message, stack: error.stack || '' });
    }
});

// POST /api/auth/logout - Logout a user
router.post('/logout', (req, res) => {
    if (!req.cookies.token) {
        return res.status(401).json({ message: 'Not logged in' });
    }

    res.clearCookie('token', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'Strict',
    });

    res.status(200).json({ message: 'Logged out successfully' });
});

// GET /api/auth/verify - Verify logged-in user
router.get('/verify', authenticateToken, (req, res) => {
    res.status(200).json({ message: 'Authenticated' });
});

// GET /api/auth/profile - Get user profile
router.get('/profile', authenticateToken, async (req, res) => {
    try {
        const user = await prisma.users.findUnique({ where: { id: req.user.userId } });
        if (!user) return res.status(404).json({ error: 'User not found' });

        res.status(200).json({ id: user.id, firstName: user.first_name, lastName: user.last_name, email: user.email });
    } catch (error) {
        res.status(500).json({ error: 'Server error: ' + error.message, stack: error.stack || '' });
    }
});

export default router;