import express from 'express';
import { User } from '../models/User';
import { Task } from '../models/Task';
import { protect } from '../middleware/auth';
import { requireRole } from '../middleware/role';

const router = express.Router();

// All user routes require admin
router.use(protect, requireRole('admin'));

// @route   GET /api/users
// @desc    Get all users
// @access  Admin
router.get('/', async (req, res, next) => {
    try {
        const { search, role, page = '1', limit = '10' } = req.query;

        const query: Record<string, unknown> = {};
        if (role) query.role = role;
        if (search) {
            query.$or = [
                { name: { $regex: search, $options: 'i' } },
                { email: { $regex: search, $options: 'i' } },
            ];
        }

        const pageNum = parseInt(page as string, 10);
        const limitNum = parseInt(limit as string, 10);
        const skip = (pageNum - 1) * limitNum;

        const [users, total] = await Promise.all([
            User.find(query).sort({ createdAt: -1 }).skip(skip).limit(limitNum),
            User.countDocuments(query),
        ]);

        // Attach task counts to each user
        const usersWithStats = await Promise.all(
            users.map(async (user) => {
                const taskCount = await Task.countDocuments({ createdBy: user._id });
                const completedCount = await Task.countDocuments({ createdBy: user._id, status: 'completed' });
                return {
                    ...user.toObject(),
                    taskCount,
                    completedCount,
                };
            })
        );

        res.json({
            success: true,
            data: usersWithStats,
            pagination: {
                total,
                page: pageNum,
                limit: limitNum,
                pages: Math.ceil(total / limitNum),
            },
        });
    } catch (error) {
        next(error);
    }
});

// @route   GET /api/users/:id
// @desc    Get single user details
// @access  Admin
router.get('/:id', async (req, res, next) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) {
            res.status(404).json({ success: false, message: 'User not found' });
            return;
        }

        const tasks = await Task.find({ createdBy: user._id }).sort({ createdAt: -1 }).limit(10);
        const taskStats = await Task.aggregate([
            { $match: { createdBy: user._id } },
            { $group: { _id: '$status', count: { $sum: 1 } } },
        ]);

        res.json({
            success: true,
            data: {
                ...user.toObject(),
                tasks,
                taskStats,
            },
        });
    } catch (error) {
        next(error);
    }
});

// @route   DELETE /api/users/:id
// @desc    Delete a user and their tasks
// @access  Admin
router.delete('/:id', async (req, res, next) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) {
            res.status(404).json({ success: false, message: 'User not found' });
            return;
        }

        if (user.role === 'admin') {
            res.status(400).json({ success: false, message: 'Cannot delete an admin user' });
            return;
        }

        // Delete user's tasks first
        await Task.deleteMany({ createdBy: user._id });
        await user.deleteOne();

        res.json({ success: true, message: 'User and their tasks deleted successfully' });
    } catch (error) {
        next(error);
    }
});

export default router;
