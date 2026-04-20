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

// Ensure uploads directory exists
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
}

// Multer Config
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'uploads/'),
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + '-' + file.originalname);
    }
});
const upload = multer({ storage: storage });

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

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
    ip: { type: String, default: '' },
    timestamp: { type: String, default: () => new Date().toLocaleString() }
});
const Interview = mongoose.model('Interview', interviewSchema);

const messageSchema = new mongoose.Schema({
    sender: String,
    receiver: { type: String, default: 'global' },
    content: String,
    timestamp: { type: String, default: () => new Date().toISOString() }
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

mongoose.connect(MONGODB_URI)
    .then(async () => {
        console.log("🚀 Connected to MongoDB Atlas");
        await seedUsers();
        await seedSettings();
    })
    .catch(err => console.error("❌ MongoDB Connection Error:", err));

async function seedUsers() {
    const defaultUsers = [
        { username: "admin", password: "admin123", role: "owner" },
        { username: "kawal", password: "kawal123", role: "employee" },
        { username: "Ram", password: "ram123", role: "owner" },
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
    await Activity.deleteOne({ _id: req.params.id });
    res.json({ message: "Activity deleted" });
});

app.put("/api/projects/:id", async (req, res) => {
    const { id } = req.params;
    const updateData = req.body;
    if (updateData.links && typeof updateData.links !== 'string') {
        updateData.links = JSON.stringify(updateData.links);
    }
    try {
        await Project.updateOne({ id }, updateData);
        res.json({ success: true, id });
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

    const finalIp = clientIp || req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'Unknown';
    let outcome = 'Complete';
    if (status === 'terminate') outcome = 'Terminate';
    if (status === 'quota') outcome = 'QuotaFull';
    if (status === 'security') outcome = 'Security Terminate';

    const now = new Date();
    const exitTime = now.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' });
    const timestamp = now.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });

    try {
        const interview = await Interview.create({ projectId, respId: userId, outcome, exitTime, ip: finalIp, timestamp });
        
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
    const statuses = await DailyStatus.find({ timestamp: { $regex: new RegExp(`^${month}`) } });
    res.json(statuses);
});

app.post("/api/daily-status", async (req, res) => {
    const { username, content, timestamp } = req.body;
    const status = await DailyStatus.create({ username, content, timestamp: timestamp || new Date().toISOString() });
    res.json(status);
});

app.delete("/api/daily-status/:id", async (req, res) => {
    await DailyStatus.deleteOne({ _id: req.params.id });
    res.json({ success: true });
});

app.get("/api/messages", async (req, res) => {
    const { user1, user2 } = req.query;
    let filter = { receiver: 'global' };
    if (user1 && user2) {
        filter = { $or: [{ sender: user1, receiver: user2 }, { sender: user2, receiver: user1 }] };
    }
    const messages = await Message.find(filter).sort({ _id: 1 });
    res.json(messages);
});

app.post("/api/messages", async (req, res) => {
    const { sender, receiver, content } = req.body;
    const msg = await Message.create({ sender, receiver: receiver || 'global', content });
    res.json(msg);
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

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "index.html"));
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`📡 Server running on port ${PORT}`);
});
