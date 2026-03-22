import express from 'express';
import { User } from '../models/User';
import { Task } from '../models/Task';
import { protect } from '../middleware/auth';
import { requireRole } from '../middleware/role';

const router = express.Router();

// @route   GET /api/dashboard/stats
// @desc    Get admin dashboard stats
// @access  Admin
router.get('/stats', protect, requireRole('admin'), async (_req, res, next) => {
    try {
        const now = new Date();
        const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

        // Parallel fetching for performance
        const [
            totalUsers,
            totalTasks,
            tasksByStatus,
            tasksByPriority,
            recentUsers,
            tasksPerDay,
            newTasksThisWeek,
            newUsersThisMonth,
        ] = await Promise.all([
            User.countDocuments({ role: 'user' }),
            Task.countDocuments(),
            Task.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
            Task.aggregate([{ $group: { _id: '$priority', count: { $sum: 1 } } }]),
            User.find({ role: 'user' }).sort({ createdAt: -1 }).limit(5).select('name email createdAt'),
            // Tasks per day for the last 30 days (line chart data)
            Task.aggregate([
                { $match: { createdAt: { $gte: thirtyDaysAgo } } },
                {
                    $group: {
                        _id: {
                            $dateToString: { format: '%Y-%m-%d', date: '$createdAt' },
                        },
                        count: { $sum: 1 },
                        completed: {
                            $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] },
                        },
                    },
                },
                { $sort: { _id: 1 } },
            ]),
            Task.countDocuments({ createdAt: { $gte: sevenDaysAgo } }),
            User.countDocuments({ createdAt: { $gte: thirtyDaysAgo }, role: 'user' }),
        ]);

        // Format task status stats
        const statusMap: Record<string, number> = { pending: 0, 'in-progress': 0, completed: 0 };
        tasksByStatus.forEach((s: { _id: string; count: number }) => {
            statusMap[s._id] = s.count;
        });

        const completionRate = totalTasks > 0
            ? Math.round((statusMap.completed / totalTasks) * 100)
            : 0;

        // Format priority stats
        const priorityMap: Record<string, number> = { low: 0, medium: 0, high: 0 };
        tasksByPriority.forEach((p: { _id: string; count: number }) => {
            priorityMap[p._id] = p.count;
        });

        res.json({
            success: true,
            data: {
                overview: {
                    totalUsers,
                    totalTasks,
                    completionRate,
                    newTasksThisWeek,
                    newUsersThisMonth,
                },
                tasksByStatus: statusMap,
                tasksByPriority: priorityMap,
                recentUsers,
                chartData: tasksPerDay,
            },
        });
    } catch (error) {
        next(error);
    }
});

export default router;
