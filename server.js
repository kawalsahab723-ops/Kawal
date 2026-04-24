import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import path from "path";
import { fileURLToPath } from 'url';
import multer from "multer";
import fs from "fs";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 5000;
const app = express();

// 1. START LISTENING IMMEDIATELY (Crucial for Cloud Services like Render)
app.listen(PORT, '0.0.0.0', () => {
    console.log(`📡 Server is now listening on port ${PORT}`);
    console.log(`🚀 Healthcheck ready at /healthcheck`);
});

// 2. MIDDLEWARE
app.use(cors());
app.use(express.json());

// Health Check for Render with Version & DB Status
app.get("/healthcheck", (req, res) => {
    res.status(200).json({
        status: "OK",
        version: "2.0-Bulletproof",
        database: mongoose.connection.readyState === 1 ? "Connected" : "Disconnected",
        time: new Date().toLocaleString()
    });
});
app.use(express.static(path.resolve(__dirname)));
app.use('/uploads', express.static(path.resolve(__dirname, 'uploads')));

// 4. DIRECTORY LOGIC
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    try { fs.mkdirSync(uploadDir); } catch(e) {}
}
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'uploads/'),
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + '-' + file.originalname);
    }
});
const upload = multer({ storage });

// Main Route - Move this up to ensure it catches the root request
app.get("/", (req, res) => {
    const indexPath = path.resolve(__dirname, "index.html");
    if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
    } else {
        res.status(404).send("index.html not found. Check directory structure.");
    }
});

// 3. STATIC FILES
app.use(express.static(path.resolve(__dirname)));
app.use('/uploads', express.static(path.resolve(__dirname, 'uploads')));

// Catch-all route for SPA (Redirects unknown paths to index.html)
app.get("*", (req, res, next) => {
    // If it's an API request, let it continue (it will 404 later if no route)
    if (req.path.startsWith('/api') || req.path.startsWith('/uploads') || req.path.startsWith('/start')) {
        return next();
    }
    res.sendFile(path.resolve(__dirname, "index.html"));
});

// 5. RESPONDENT ENTRY LINK (Start Survey)
app.get("/start", async (req, res) => {
    let { pid, uid, idx } = req.query;
    if (!pid || !uid) return res.status(400).send("<h1>Missing Parameters</h1><p>Project ID (pid) and Respondent UID (uid) are required.</p>");

    try {
        let project = await Project.findOne({ id: pid });
        let linkIndex = parseInt(idx) || 0;

        // If project not found by Main ID, try searching link-specific PIDs
        if (!project) {
            // Search in links string for the specific PID
            const subPidSearch = await Project.findOne({ links: { $regex: `\"pid\":\"${pid}\"`, $options: 'i' } });
            if (subPidSearch) {
                project = subPidSearch;
                let linksArr = [];
                try { linksArr = JSON.parse(project.links); } catch(e) {}
                const foundIdx = linksArr.findIndex(l => l.pid === pid);
                if (foundIdx !== -1) {
                    linkIndex = foundIdx;
                    // Switch pid to the main project id for subsequent tracking lookups
                    pid = project.id; 
                }
            }
        }

        if (!project || (project.status && project.status !== 'live')) {
            return res.status(403).send("<h1>Access Denied</h1><p>Survey is currently closed or paused.</p>");
        }

        let links = [];
        try { links = typeof project.links === 'string' ? JSON.parse(project.links) : (project.links || []); } catch(e) {}
        
        let targetUrl = '';
        if (Array.isArray(links) && links[linkIndex]) {
            targetUrl = typeof links[linkIndex] === 'string' ? links[linkIndex] : links[linkIndex].url;
        } else if (links.length > 0) {
            targetUrl = typeof links[0] === 'string' ? links[0] : links[0].url;
        }

        if (!targetUrl) return res.status(404).send("<h1>Error</h1><p>Survey link not found.</p>");

        let finalIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'Unknown';
        if (finalIp.includes(',')) finalIp = finalIp.split(',')[0].trim();

        const now = new Date();
        const entryTime = now.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' });
        const timestamp = now.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });

        await Interview.findOneAndUpdate(
            { projectId: pid, respId: uid },
            { 
               $setOnInsert: { linkIndex, outcome: 'In-Progress', entryTime, entryIp: finalIp, ip: finalIp, timestamp }
            },
            { upsert: true }
        );

        await Project.updateOne({ id: pid }, { $inc: { clicks: 1 } });

        targetUrl = targetUrl.trim();
        if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
            targetUrl = 'https://' + targetUrl;
        }

        let finalUrl = targetUrl.replace(/\[UID\]/gi, uid).replace(/\[ID\]/gi, uid);
        if (finalUrl === targetUrl && finalUrl.endsWith('=')) {
            finalUrl += uid;
        } 
        else if (finalUrl === targetUrl && !finalUrl.includes(uid)) {
            const separator = finalUrl.includes('?') ? '&' : '?';
            finalUrl += `${separator}uid=${uid}`;
        }

        res.redirect(finalUrl);
    } catch (err) {
        res.status(500).send("Server Error: " + err.message);
    }
});

/* ======================
   📦 MONGODB SCHEMAS
   ====================== */

const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: { type: String, default: 'employee' },
    isBlocked: { type: Boolean, default: false },
    assignedTL: { type: String, default: '' }
});
const User = mongoose.model('User', userSchema);

const projectSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true },
    name: String,
    links: String, // Stored as JSON string to match previous behavior
    goal: { type: Number, default: 0 },
    details: { type: String, default: '' },
    status: { type: String, default: 'active' },
    clicks: { type: Number, default: 0 },
    completes: { type: Number, default: 0 },
    terminates: { type: Number, default: 0 },
    quotafulls: { type: Number, default: 0 },
    securities: { type: Number, default: 0 },
    cpi: { type: Number, default: 0 },
    createdAt: { type: String, default: () => new Date().toISOString() }
});
const Project = mongoose.model('Project', projectSchema);

const interviewSchema = new mongoose.Schema({
    projectId: String,
    linkIndex: { type: Number, default: 0 },
    respId: String,
    outcome: String,
    loi: { type: Number, default: 0 },
    entryTime: { type: String, default: '' },
    exitTime: { type: String, default: '' },
    entryIp: { type: String, default: '' },
    exitIp: { type: String, default: '' },
    ip: { type: String, default: '' }, // Keep for legacy
    timestamp: { type: String, default: () => new Date().toLocaleString() }
});
const Interview = mongoose.model('Interview', interviewSchema);

const messageSchema = new mongoose.Schema({
    sender: String,
    receiver: { type: String, default: 'global' },
    content: String,
    timestamp: { type: String, default: () => new Date().toISOString() },
    createdAt: { type: Date, default: Date.now, expires: 86400 } // Auto-delete after 24 hours (86400 seconds)
});
const Message = mongoose.model('Message', messageSchema);

const dailyStatusSchema = new mongoose.Schema({
    username: String,
    role: String,
    content: String,
    timestamp: { type: String, default: () => new Date().toISOString() }
});
const DailyStatus = mongoose.model('DailyStatus', dailyStatusSchema);

const activitySchema = new mongoose.Schema({
    projectId: String,
    content: String,
    image: String,
    timestamp: { type: String, default: () => new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) }
});
const Activity = mongoose.model('Activity', activitySchema);

const attendanceSchema = new mongoose.Schema({
    username: String,
    date: String,
    status: String
});
attendanceSchema.index({ username: 1, date: 1 }, { unique: true });
const Attendance = mongoose.model('Attendance', attendanceSchema);

const settingSchema = new mongoose.Schema({
    key: { type: String, unique: true },
    value: String
});
const Setting = mongoose.model('Setting', settingSchema);

/* ======================
   🔌 DATABASE CONNECTION
   ====================== */

const MONGODB_URI = process.env.MONGODB_URI;

// Background Database Connection (Non-blocking)
console.log("🔌 Initiating background MongoDB connection...");
mongoose.set('bufferCommands', false); // Disable buffering to prevent hanging on operations
mongoose.connect(MONGODB_URI, {
    serverSelectionTimeoutMS: 5000, 
    socketTimeoutMS: 45000,
})
.then(async () => {
    console.log("🚀 Connected to MongoDB Atlas");
    try {
        await seedUsers();
        await seedSettings();
    } catch (e) {
        console.error("⚠️ Seeding Error (Non-fatal):", e.message);
    }
})
.catch(err => {
    console.error("❌ MongoDB Connection Error:", err.message);
    console.log("⚠️ Application will run in offline mode (DB features disabled).");
});

async function seedUsers() {
    // Remove default admin user as requested
    await User.deleteOne({ username: "admin" });

    const defaultUsers = [
        { username: "kawal", password: "kawal123", role: "employee" },
        { username: "Ram", password: "ram123", role: "owner" },
        { username: "anish", password: "anish123", role: "owner" },
        { username: "Amit", password: "amit123", role: "teamleader" },
        { username: "Pratham", password: "pratham123", role: "teamleader" },
        { username: "Anshul", password: "anshul123", role: "teamleader" },
        { username: "Naveen", password: "naveen123", role: "employee" },
        { username: "Piyush", password: "piyush123", role: "employee" }
    ];

    for (const u of defaultUsers) {
        const exists = await User.findOne({ username: u.username });
        if (!exists) {
            await User.create(u);
            console.log(`👤 Seeded user: ${u.username}`);
        } else if (u.username === 'anish' && exists.role !== 'owner') {
            exists.role = 'owner';
            await exists.save();
            console.log(`🆙 Updated anish to owner`);
        }
    }
}

async function seedSettings() {
    const defaultBase = process.env.BASE_URL ? `${process.env.BASE_URL}/redirect.html` : 'http://localhost:5000/redirect.html';
    const exists = await Setting.findOne({ key: 'base_redirect' });
    if (!exists) {
        await Setting.create({ key: 'base_redirect', value: defaultBase });
    }
}

/* ======================
   🔐 AUTH ROUTES
   ====================== */

app.post("/api/auth/login", async (req, res) => {
    const { username, password } = req.body;
    try {
        const user = await User.findOne({ username, password });
        if (!user) return res.status(401).json({ message: "Invalid credentials" });
        if (user.isBlocked) return res.status(403).json({ blocked: true, message: "bhadwe tu block hai ghar nikal" });
        
        res.json({
            username: user.username,
            role: user.role,
            fullName: user.username.toUpperCase()
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get("/api/users", async (req, res) => {
    try {
        const users = await User.find({}, 'username role isBlocked assignedTL');
        res.json(users);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post("/api/users", async (req, res) => {
    const { username, password, role, assignedTL } = req.body;
    try {
        const newUser = await User.create({ username, password, role: role || 'employee', assignedTL: assignedTL || '' });
        res.json({ success: true, username: newUser.username, role: newUser.role });
    } catch (err) {
        res.status(400).json({ error: "Username already exists or error: " + err.message });
    }
});

app.delete("/api/users/:username", async (req, res) => {
    try {
        await User.deleteOne({ username: req.params.username });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put("/api/users/:oldUsername", async (req, res) => {
    const { oldUsername } = req.params;
    const { newUsername, newPassword, newRole, assignedTL } = req.body;
    try {
        const updateData = { username: newUsername, role: newRole, assignedTL: assignedTL || '' };
        if (newPassword) updateData.password = newPassword;

        await User.updateOne({ username: oldUsername }, updateData);
        if (oldUsername !== newUsername) {
            await DailyStatus.updateMany({ username: oldUsername }, { username: newUsername });
        }
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put("/api/users/:username/block", async (req, res) => {
    try {
        await User.updateOne({ username: req.params.username }, { isBlocked: req.body.isBlocked });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Settings
app.get("/api/settings", async (req, res) => {
    try {
        const rows = await Setting.find({});
        const settings = {};
        rows.forEach(r => settings[r.key] = r.value);
        res.json(settings);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post("/api/settings", async (req, res) => {
    const { key, value } = req.body;
    try {
        await Setting.findOneAndUpdate({ key }, { value }, { upsert: true });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/* ======================
   📊 PROJECT ROUTES
   ====================== */

app.get("/api/projects", async (req, res) => {
    try {
        const projects = await Project.find({});
        res.json(projects);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post("/api/projects", async (req, res) => {
    const { id, name, links, goal, details, cpi } = req.body;
    try {
        const linksStr = typeof links === 'string' ? links : JSON.stringify(links || []);
        const project = await Project.create({ id, name, links: linksStr, goal: goal || 0, details: details || '', cpi: cpi || 0 });
        res.json(project);
    } catch (err) {
        res.status(400).json({ message: "Error saving project: " + err.message });
    }
});

app.get("/api/activities", async (req, res) => {
    try {
        const activities = await Activity.find({}).sort({ _id: -1 }).limit(50);
        res.json(activities);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post("/api/activities", upload.single('image'), async (req, res) => {
    const { projectId, content } = req.body;
    const image = req.file ? `/uploads/${req.file.filename}` : null;
    try {
        const activity = await Activity.create({ projectId, content, image });
        res.json({ success: true, id: activity._id, image });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete("/api/activities", async (req, res) => {
    await Activity.deleteMany({});
    res.json({ message: "All activities deleted" });
});

app.delete("/api/activities/:id", async (req, res) => {
    try {
        await Activity.deleteOne({ _id: req.params.id });
        res.json({ message: "Activity deleted" });
    } catch (err) {
        res.status(400).json({ error: "Invalid ID" });
    }
});

app.put("/api/projects/:id", async (req, res) => {
    const { id } = req.params;
    const updateData = req.body;
    if (updateData.links && typeof updateData.links !== 'string') {
        updateData.links = JSON.stringify(updateData.links);
    }
    try {
        const newId = updateData.id;
        await Project.updateOne({ id }, updateData);
        if (newId && newId !== id) {
            await Interview.updateMany({ projectId: id }, { projectId: newId });
            await Activity.updateMany({ projectId: id }, { projectId: newId });
        }
        res.json({ success: true, id: newId || id });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete("/api/projects/:id", async (req, res) => {
    const { id } = req.params;
    try {
        await Project.deleteOne({ id });
        await Interview.deleteMany({ projectId: id });
        res.json({ message: "Project and its data deleted permanently" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/* ======================
   📈 INTERVIEW ROUTES
   ====================== */

app.get("/api/interviews", async (req, res) => {
    const { projectId } = req.query;
    try {
        const filter = projectId && projectId !== "All" ? { projectId } : {};
        const interviews = await Interview.find(filter);
        res.json(interviews);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post("/api/interviews", async (req, res) => {
    const { projectId, outcome } = req.body;
    try {
        const interview = await Interview.create(req.body);
        
        // Update Project counters
        const status = (outcome || '').toLowerCase();
        let column = "";
        if (status === 'complete') column = "completes";
        else if (status === 'terminate') column = "terminates";
        else if (status.includes('quota')) column = "quotafulls";
        else if (status.includes('security')) column = "securities";

        if (column) {
            await Project.updateOne({ id: projectId }, { $inc: { [column]: 1 } });
        }
        res.json(interview);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete("/api/interviews", async (req, res) => {
    try {
        await Interview.deleteMany({});
        await Project.updateMany({}, { completes: 0, terminates: 0, quotafulls: 0, securities: 0, clicks: 0 });
        res.json({ message: "All interviews deleted and project stats reset" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post("/api/save", async (req, res) => {
    const { status, projectId, userId, ip: clientIp } = req.body;
    if (!status || !projectId || !userId) return res.status(400).json({ error: "Missing data" });

    let finalIp = clientIp || req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'Unknown';
    if (finalIp.includes(',')) finalIp = finalIp.split(',')[0].trim();
    let outcome = 'Complete';
    if (status === 'terminate') outcome = 'Terminate';
    if (status === 'quota') outcome = 'QuotaFull';
    if (status === 'security') outcome = 'Security Terminate';

    const now = new Date();
    const exitTime = now.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' });
    const timestamp = now.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });

    try {
        const query = { projectId, respId: userId };
        const update = { outcome, exitTime, exitIp: finalIp, ip: finalIp, timestamp };
        const interview = await Interview.findOneAndUpdate(query, update, { new: true, upsert: true });
        
        let column = "";
        if (status === 'complete') column = "completes";
        else if (status === 'terminate') column = "terminates";
        else if (status === 'quota') column = "quotafulls";
        else if (status === 'security') column = "securities";

        if (column) {
            await Project.updateOne({ id: projectId }, { $inc: { [column]: 1 } });
        }
        res.json({ message: "Saved successfully", id: interview._id, ip: finalIp });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post("/api/projects/:id/click", async (req, res) => {
    await Project.updateOne({ id: req.params.id }, { $inc: { clicks: 1 } });
    res.json({ success: true });
});

app.get("/api/stats", async (req, res) => {
    try {
        const rows = await Interview.find({}, 'outcome');
        let stats = { complete: 0, terminate: 0, quota: 0, security: 0, ir: 0 };

        rows.forEach(r => {
            const status = (r.outcome || '').toLowerCase();
            if (status === 'complete') stats.complete++;
            else if (status === 'terminate') stats.terminate++;
            else if (status.includes('quota')) stats.quota++;
            else if (status.includes('security')) stats.security++;
        });

        const totalAttempt = stats.complete + stats.terminate;
        if (totalAttempt > 0) stats.ir = ((stats.complete / totalAttempt) * 100).toFixed(2);
        res.json(stats);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/* ======================
   📉 DAILY STATUS & OTHERS
   ====================== */

app.get("/api/daily-status", async (req, res) => {
    const statuses = await DailyStatus.find({}).sort({ timestamp: -1 });
    res.json(statuses);
});

app.get("/api/daily-status/monthly", async (req, res) => {
    const { month } = req.query; // YYYY-MM
    if (!month) return res.json([]);
    try {
        const [year, monthVal] = month.split('-').map(Number);
        // Fetch from 1st of current month to 2nd of next month 
        // to cover the 1-day shift (e.g. May 1st status belongs to April 30th)
        const start = new Date(Date.UTC(year, monthVal - 1, 1)).toISOString();
        const end = new Date(Date.UTC(year, monthVal, 2)).toISOString();
        
        const statuses = await DailyStatus.find({
            timestamp: { $gte: start, $lt: end }
        });
        res.json(statuses);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post("/api/daily-status", async (req, res) => {
    const { username, content, timestamp } = req.body;
    const status = await DailyStatus.create({ username, content, timestamp: timestamp || new Date().toISOString() });
    res.json(status);
});

app.get("/api/daily-status/monthly", async (req, res) => {
    const { month } = req.query; // YYYY-MM
    if (!month) return res.status(400).json({ error: "Month required" });
    try {
        const regex = new RegExp(`^${month}`);
        await DailyStatus.deleteMany({ timestamp: { $regex: regex } });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete("/api/daily-status/:id", async (req, res) => {
    const { id } = req.params;
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ error: "Invalid ID format" });
    }
    
    // Check if DB is connected before trying to delete
    if (mongoose.connection.readyState !== 1) {
        return res.status(503).json({ error: "Database not connected. Please check Mongo Atlas IP whitelist." });
    }

    try {
        const result = await DailyStatus.deleteOne({ _id: id });
        if (result.deletedCount === 0) {
            return res.status(404).json({ error: "Status not found" });
        }
        res.json({ success: true });
    } catch (err) {
        console.error("Delete Error:", err.message);
        res.status(500).json({ error: "Database error during deletion" });
    }
});

// Global Delete DISABLED for safety (Anti-Mass Delete Lock)
/*
app.delete("/api/daily-status", async (req, res) => {
    try {
        await DailyStatus.deleteMany({});
        res.json({ success: true, message: "All statuses cleared" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});
*/

// Global Delete for Daily Status (Clear All) - Restored for Admin use
app.delete("/api/daily-status", async (req, res) => {
    try {
        await DailyStatus.deleteMany({});
        res.json({ success: true, message: "All statuses cleared" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get("/api/messages", async (req, res) => {
    try {
        // Explicitly delete messages older than 24 hours
        const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        await Message.deleteMany({ createdAt: { $lt: twentyFourHoursAgo } });

        const { user1, user2 } = req.query;
        let filter = { receiver: 'global' };
        if (user1 && user2) {
            filter = { $or: [{ sender: user1, receiver: user2 }, { sender: user2, receiver: user1 }] };
        }
        const messages = await Message.find(filter).sort({ _id: 1 });
        res.json(messages);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get("/api/messages/all-for-user", async (req, res) => {
    const { username } = req.query;
    if (!username) return res.json([]);
    try {
        const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        await Message.deleteMany({ createdAt: { $lt: twentyFourHoursAgo } });

        const filter = {
            $or: [
                { receiver: 'global' },
                { receiver: username },
                { sender: username }
            ]
        };
        const messages = await Message.find(filter).sort({ _id: 1 });
        res.json(messages);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post("/api/messages", async (req, res) => {
    const { sender, receiver, content } = req.body;
    const msg = await Message.create({ sender, receiver: receiver || 'global', content });
    res.json(msg);
});

app.delete("/api/messages/:id", async (req, res) => {
    try {
        await Message.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete("/api/messages", async (req, res) => {
    try {
        await Message.deleteMany({ receiver: 'global' });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete("/api/messages/clear-my", async (req, res) => {
    const { sender, receiver } = req.body;
    try {
        await Message.deleteMany({ sender, receiver });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get("/api/attendance", async (req, res) => {
    const attendance = await Attendance.find({ date: req.query.date });
    res.json(attendance);
});

app.post("/api/attendance", async (req, res) => {
    const { username, date, status } = req.body;
    await Attendance.findOneAndUpdate({ username, date }, { status }, { upsert: true });
    res.json({ success: true });
});

// Monthly Attendance Report
app.get("/api/attendance/monthly", async (req, res) => {
    const { month } = req.query; // YYYY-MM
    try {
        const regex = new RegExp(`^${month}`);
        const records = await Attendance.find({ date: { $regex: regex } });
        res.json(records);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Missing Monthly Delete for Attendance
app.delete("/api/attendance/monthly", async (req, res) => {
    const { month } = req.query; // YYYY-MM
    if (!month) return res.status(400).json({ error: "Month required" });
    try {
        await Attendance.deleteMany({ date: { $regex: new RegExp(`^${month}`) } });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


// Prevent server from crashing on unhandled errors
process.on('uncaughtException', (err) => {
    console.error('💥 CRITICAL: Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('💥 CRITICAL: Unhandled Rejection at:', promise, 'reason:', reason);
});
