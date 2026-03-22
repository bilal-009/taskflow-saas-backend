import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { User, IUser } from '../models/User';

export interface AuthRequest extends Request {
    user?: IUser;
}

interface JwtPayload {
    id: string;
    role: string;
}

export const protect = async (
    req: AuthRequest,
    res: Response,
    next: NextFunction
): Promise<void> => {
    try {
        // Get token from httpOnly cookie
        const token = req.cookies?.token;

        if (!token) {
            res.status(401).json({ success: false, message: 'Not authorized - no token' });
            return;
        }

        // Verify token
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret') as JwtPayload;

        // Attach user to request
        const user = await User.findById(decoded.id).select('-password');
        if (!user) {
            res.status(401).json({ success: false, message: 'User not found' });
            return;
        }

        req.user = user;
        next();
    } catch {
        res.status(401).json({ success: false, message: 'Not authorized - invalid token' });
    }
};
