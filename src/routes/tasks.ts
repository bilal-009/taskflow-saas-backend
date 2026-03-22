import express from 'express';
import { z } from 'zod';
import mongoose from 'mongoose';
import { Task } from '../models/Task';
import { protect, AuthRequest } from '../middleware/auth';
import { requireRole } from '../middleware/role';

const router = express.Router();

// Validation schemas
const createTaskSchema = z.object({
    title: z.string().min(1, 'Title is required').max(100),
    description: z.string().max(1000).optional(),
    status: z.enum(['pending', 'in-progress', 'completed']).optional(),
    priority: z.enum(['low', 'medium', 'high']).optional(),
    labels: z.array(z.string()).optional(),
    dueDate: z.string().optional().transform(val => val ? new Date(val) : undefined),
    assignedTo: z.string().optional(),
});

const updateTaskSchema = createTaskSchema.partial();

// Apply auth middleware to all task routes
router.use(protect);

// @route   GET /api/tasks
// @desc    Get tasks (admin: all tasks, user: own tasks)
// @access  Private
router.get('/', async (req: AuthRequest, res, next) => {
    try {
        const { status, priority, search, page = '1', limit = '10', sortBy = 'createdAt', order = 'desc' } = req.query;

        const query: Record<string, unknown> = {};

        // If not admin, only show user's own tasks
        if (req.user?.role !== 'admin') {
            query.createdBy = req.user?._id;
        }

        // Filters
        if (status) query.status = status;
        if (priority) query.priority = priority;
        if (search) {
            query.$or = [
                { title: { $regex: search, $options: 'i' } },
                { description: { $regex: search, $options: 'i' } },
            ];
        }

        const pageNum = parseInt(page as string, 10);
        const limitNum = parseInt(limit as string, 10);
        const skip = (pageNum - 1) * limitNum;
        const sortOrder = order === 'asc' ? 1 : -1;

        const [tasks, total] = await Promise.all([
            Task.find(query)
                .populate('assignedTo', 'name email')
                .populate('createdBy', 'name email')
                .sort({ [sortBy as string]: sortOrder })
                .skip(skip)
                .limit(limitNum),
            Task.countDocuments(query),
        ]);

        res.json({
            success: true,
            data: tasks,
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

// @route   GET /api/tasks/:id
// @desc    Get single task
// @access  Private
router.get('/:id', async (req: AuthRequest, res, next) => {
    try {
        const task = await Task.findById(req.params.id)
            .populate('assignedTo', 'name email')
            .populate('createdBy', 'name email');

        if (!task) {
            res.status(404).json({ success: false, message: 'Task not found' });
            return;
        }

        // Non-admin can only view their own tasks
        if (req.user?.role !== 'admin' && task.createdBy._id.toString() !== req.user?._id.toString()) {
            res.status(403).json({ success: false, message: 'Not authorized to view this task' });
            return;
        }

        res.json({ success: true, data: task });
    } catch (error) {
        next(error);
    }
});

// @route   POST /api/tasks
// @desc    Create a task
// @access  Private
router.post('/', async (req: AuthRequest, res, next) => {
    try {
        const data = createTaskSchema.parse(req.body);

        const task = await Task.create({
            ...data,
            createdBy: req.user?._id,
            assignedTo: data.assignedTo || req.user?._id,
        });

        const populated = await task.populate([
            { path: 'assignedTo', select: 'name email' },
            { path: 'createdBy', select: 'name email' },
        ]);

        res.status(201).json({ success: true, data: populated });
    } catch (error) {
        if (error instanceof z.ZodError) {
            res.status(400).json({ success: false, message: error.errors[0].message });
            return;
        }
        next(error);
    }
});

// @route   PUT /api/tasks/:id
// @desc    Update a task
// @access  Private
router.put('/:id', async (req: AuthRequest, res, next) => {
    try {
        const data = updateTaskSchema.parse(req.body);

        let task = await Task.findById(req.params.id);
        if (!task) {
            res.status(404).json({ success: false, message: 'Task not found' });
            return;
        }

        // Non-admin can only update own tasks
        if (req.user?.role !== 'admin' && task.createdBy.toString() !== req.user?._id.toString()) {
            res.status(403).json({ success: false, message: 'Not authorized to update this task' });
            return;
        }

        task = await Task.findByIdAndUpdate(req.params.id, data, {
            new: true,
            runValidators: true,
        })
            .populate('assignedTo', 'name email')
            .populate('createdBy', 'name email');

        res.json({ success: true, data: task });
    } catch (error) {
        if (error instanceof z.ZodError) {
            res.status(400).json({ success: false, message: error.errors[0].message });
            return;
        }
        next(error);
    }
});

// @route   DELETE /api/tasks/:id
// @desc    Delete a task
// @access  Private
router.delete('/:id', async (req: AuthRequest, res, next) => {
    try {
        const task = await Task.findById(req.params.id);
        if (!task) {
            res.status(404).json({ success: false, message: 'Task not found' });
            return;
        }

        // Non-admin can only delete own tasks
        if (req.user?.role !== 'admin' && task.createdBy.toString() !== req.user?._id.toString()) {
            res.status(403).json({ success: false, message: 'Not authorized to delete this task' });
            return;
        }

        await task.deleteOne();
        res.json({ success: true, message: 'Task deleted successfully' });
    } catch (error) {
        next(error);
    }
});

// @route   DELETE /api/tasks (bulk delete — admin only)
// @desc    Bulk delete tasks
// @access  Admin
router.delete('/', requireRole('admin'), async (req, res, next) => {
    try {
        const { ids } = req.body;
        if (!Array.isArray(ids) || ids.length === 0) {
            res.status(400).json({ success: false, message: 'Provide an array of task IDs' });
            return;
        }

        const validIds = ids.filter(id => mongoose.Types.ObjectId.isValid(id));
        await Task.deleteMany({ _id: { $in: validIds } });
        res.json({ success: true, message: `${validIds.length} tasks deleted` });
    } catch (error) {
        next(error);
    }
});

export default router;
