import express, { Response } from 'express';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { User } from '../models/User';
import { protect, AuthRequest } from '../middleware/auth';

const router = express.Router();

// Helper: generate token and set cookie
const sendTokenResponse = (userId: string, role: string, res: Response) => {
    const token = jwt.sign(
        { id: userId, role },
        process.env.JWT_SECRET || 'secret',
        { expiresIn: process.env.JWT_EXPIRES_IN || '7d' } as jwt.SignOptions
    );

    const isProduction = process.env.NODE_ENV === 'production';

    res.cookie('token', token, {
        httpOnly: true,
        secure: isProduction,
        sameSite: isProduction ? 'none' : 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    return token;
};

// Validation schemas
const signupSchema = z.object({
    name: z.string().min(2, 'Name must be at least 2 characters').max(50),
    email: z.string().email('Invalid email address'),
    password: z.string().min(6, 'Password must be at least 6 characters'),
});

const loginSchema = z.object({
    email: z.string().email('Invalid email address'),
    password: z.string().min(1, 'Password is required'),
});

// @route   POST /api/auth/signup
// @desc    Register a new user
// @access  Public
router.post('/signup', async (req, res, next) => {
    try {
        const { name, email, password } = signupSchema.parse(req.body);

        // Check if user exists
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            res.status(400).json({ success: false, message: 'Email already in use' });
            return;
        }

        // Create user
        const user = await User.create({ name, email, password, role: 'user' });

        sendTokenResponse(user._id.toString(), user.role, res);

        res.status(201).json({
            success: true,
            message: 'Account created successfully',
            user: {
                _id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
                createdAt: user.createdAt,
            },
        });
    } catch (error) {
        if (error instanceof z.ZodError) {
            res.status(400).json({ success: false, message: error.errors[0].message });
            return;
        }
        next(error);
    }
});

// @route   POST /api/auth/login
// @desc    Login user
// @access  Public
router.post('/login', async (req, res, next) => {
    try {
        const { email, password } = loginSchema.parse(req.body);

        // Find user with password
        const user = await User.findOne({ email }).select('+password');
        if (!user) {
            res.status(401).json({ success: false, message: 'Invalid email or password' });
            return;
        }

        // Check password
        const isMatch = await user.comparePassword(password);
        if (!isMatch) {
            res.status(401).json({ success: false, message: 'Invalid email or password' });
            return;
        }

        sendTokenResponse(user._id.toString(), user.role, res);

        res.json({
            success: true,
            message: 'Logged in successfully',
            user: {
                _id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
                createdAt: user.createdAt,
            },
        });
    } catch (error) {
        if (error instanceof z.ZodError) {
            res.status(400).json({ success: false, message: error.errors[0].message });
            return;
        }
        next(error);
    }
});

// @route   GET /api/auth/me
// @desc    Get current user
// @access  Private
router.get('/me', protect, async (req: AuthRequest, res) => {
    res.json({
        success: true,
        user: req.user,
    });
});

// @route   POST /api/auth/logout
// @desc    Logout user
// @access  Private
router.post('/logout', protect, (_req, res) => {
    res.cookie('token', '', {
        httpOnly: true,
        expires: new Date(0),
    });

    res.json({ success: true, message: 'Logged out successfully' });
});

export default router;
