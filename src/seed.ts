import mongoose from 'mongoose';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/taskflow';

// ─── Helpers ─────────────────────────────────────────────────────────────────
const randomDate = (start: Date, end: Date) =>
    new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));

const randomFrom = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

// ─── Seed Data ────────────────────────────────────────────────────────────────
const users = [
    { name: 'Alex Admin', email: 'admin@taskflow.com', password: 'Admin123!', role: 'admin' },
    { name: 'Alice Johnson', email: 'alice@taskflow.com', password: 'User123!', role: 'user' },
    { name: 'Bob Williams', email: 'bob@taskflow.com', password: 'User123!', role: 'user' },
    { name: 'Carol Davis', email: 'carol@taskflow.com', password: 'User123!', role: 'user' },
    { name: 'David Martinez', email: 'david@taskflow.com', password: 'User123!', role: 'user' },
];

const taskTemplates = [
    // Design
    { title: 'Design new landing page mockup', description: 'Create updated Figma designs for the marketing homepage with fresh branding.', labels: ['design', 'ui'] },
    { title: 'Create brand style guide', description: 'Document color palette, typography, spacing system, and component guidelines.', labels: ['design', 'branding'] },
    { title: 'Design mobile navigation pattern', description: 'Evaluate and design the best mobile navigation UX for the app.', labels: ['design', 'mobile'] },
    { title: 'Update icon library', description: 'Replace legacy icons with a consistent, modern icon set throughout the app.', labels: ['design', 'ui'] },

    // Development
    { title: 'Implement OAuth 2.0 login', description: 'Add Google and GitHub OAuth sign-in options alongside email/password.', labels: ['dev', 'auth'] },
    { title: 'Optimize database queries', description: 'Identify N+1 queries and add appropriate indexes for performance.', labels: ['dev', 'performance'] },
    { title: 'Set up CI/CD pipeline', description: 'Configure GitHub Actions for automated testing, building, and deployment.', labels: ['dev', 'devops'] },
    { title: 'Refactor API response format', description: 'Standardize all API responses to follow a consistent envelope format.', labels: ['dev', 'api'] },
    { title: 'Add real-time notifications', description: 'Implement WebSocket-based push notifications for task updates.', labels: ['dev', 'feature'] },
    { title: 'Write unit tests for auth module', description: 'Achieve 80%+ test coverage for authentication logic.', labels: ['dev', 'testing'] },
    { title: 'Upgrade to Next.js 15', description: 'Migrate from Next.js 14 to 15 adopting the new App Router features.', labels: ['dev', 'migration'] },
    { title: 'Implement file upload feature', description: 'Allow users to attach files and images to tasks (S3 integration).', labels: ['dev', 'feature'] },

    // Marketing
    { title: 'Write Q2 blog content calendar', description: 'Plan and schedule 12 blog posts for the upcoming quarter.', labels: ['marketing', 'content'] },
    { title: 'Set up email drip campaign', description: 'Create automated onboarding email sequence for new signups.', labels: ['marketing', 'email'] },
    { title: 'A/B test pricing page', description: 'Run experiments on pricing page layout to improve conversion rate.', labels: ['marketing', 'growth'] },

    // Operations
    { title: 'Update privacy policy and ToS', description: 'Revise legal documents to comply with new GDPR requirements.', labels: ['ops', 'legal'] },
    { title: 'Conduct user interviews', description: 'Schedule and conduct 10 user interviews for next sprint planning.', labels: ['ops', 'research'] },
    { title: 'Set up error monitoring (Sentry)', description: 'Integrate Sentry for frontend and backend error tracking.', labels: ['ops', 'monitoring'] },
    { title: 'Create onboarding checklist', description: 'Design in-app onboarding flow with interactive checklist for new users.', labels: ['ops', 'ux'] },

    // Admin Tasks
    { title: 'Review Q1 analytics report', description: 'Analyze product usage metrics and prepare executive summary.', labels: ['admin', 'analytics'] },
    { title: 'Plan team offsite agenda', description: 'Coordinate logistics and agenda for the quarterly team meetup.', labels: ['admin', 'team'] },
    { title: 'Audit tool subscriptions', description: 'Review and optimize SaaS tool spending for the team.', labels: ['admin', 'finance'] },
    { title: 'Set up backup strategy', description: 'Implement automated database backups to S3 with 30-day retention.', labels: ['admin', 'devops'] },
    { title: 'Create API documentation', description: 'Write comprehensive Swagger/OpenAPI docs for all public endpoints.', labels: ['dev', 'docs'] },
    { title: 'Performance audit and optimization', description: 'Run Lighthouse audits and fix performance issues across all pages.', labels: ['dev', 'performance'] },
];

const statuses: Array<'pending' | 'in-progress' | 'completed'> = ['pending', 'in-progress', 'completed'];
const priorities: Array<'low' | 'medium' | 'high'> = ['low', 'medium', 'high'];

async function seed() {
    try {
        await mongoose.connect(MONGODB_URI);
        console.log('✅ Connected to MongoDB');

        // Get models after connection
        const { User } = await import('./models/User');
        const { Task } = await import('./models/Task');

        // Clear existing data
        await User.deleteMany({});
        await Task.deleteMany({});
        console.log('🗑️ Cleared existing data');

        // Create users — passwords will be hashed by the User model's pre-save hook
        const createdUsers = [];
        for (const userData of users) {
            const user = await User.create(userData);
            createdUsers.push(user);
            console.log(`👤 Created user: ${user.name} (${user.role})`);
        }

        // Create tasks — assign to non-admin users
        const regularUsers = createdUsers.filter(u => u.role === 'user');
        const adminUser = createdUsers.find(u => u.role === 'admin')!;

        for (let i = 0; i < taskTemplates.length; i++) {
            const template = taskTemplates[i];
            const owner = randomFrom(regularUsers);
            const status = statuses[i % 3]; // Distribute statuses evenly
            const priority = randomFrom(priorities);
            const dueDate = randomDate(new Date(), new Date(Date.now() + 60 * 24 * 60 * 60 * 1000));

            await Task.create({
                ...template,
                status,
                priority,
                dueDate,
                createdBy: owner._id,
                assignedTo: Math.random() > 0.3 ? owner._id : adminUser._id,
                createdAt: randomDate(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), new Date()),
            });
        }

        console.log(`✅ Created ${taskTemplates.length} tasks`);
        console.log('\n🎉 Seed complete! Login credentials:');
        console.log('   Admin: admin@taskflow.com / Admin123!');
        console.log('   User:  alice@taskflow.com / User123!');
        console.log('   User:  bob@taskflow.com / User123!');

        await mongoose.disconnect();
        process.exit(0);
    } catch (error) {
        console.error('❌ Seed failed:', error);
        await mongoose.disconnect();
        process.exit(1);
    }
}

seed();
