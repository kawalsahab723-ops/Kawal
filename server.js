import express from "express";
import sqlite3 from "sqlite3";
import cors from "cors";
import path from "path";
import { fileURLToPath } from 'url';
import multer from "multer";
import fs from "fs";

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

const DB_PATH = process.env.DATABASE_URL || './database.sqlite';
const db = new sqlite3.Database(DB_PATH);
const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "index.html"));
});

// Initialize Database Tables
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        name TEXT,
        links TEXT,
        goal INTEGER,
        details TEXT,
        status TEXT DEFAULT 'active',
        clicks INTEGER DEFAULT 0,
        completes INTEGER DEFAULT 0,
        terminates INTEGER DEFAULT 0,
        quotafulls INTEGER DEFAULT 0,
        securities INTEGER DEFAULT 0,
        cpi REAL DEFAULT 0,
        createdAt TEXT
    )`);
    db.run("ALTER TABLE projects ADD COLUMN cpi REAL DEFAULT 0", (err) => {});
    db.run("ALTER TABLE projects ADD COLUMN createdAt TEXT", (err) => {});
    db.run("ALTER TABLE projects ADD COLUMN completes INTEGER DEFAULT 0", (err) => {});
    db.run("ALTER TABLE projects ADD COLUMN terminates INTEGER DEFAULT 0", (err) => {});
    db.run("ALTER TABLE projects ADD COLUMN quotafulls INTEGER DEFAULT 0", (err) => {});
    db.run("ALTER TABLE projects ADD COLUMN securities INTEGER DEFAULT 0", (err) => {});

    db.run(`CREATE TABLE IF NOT EXISTS interviews (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        projectId TEXT,
        linkIndex INTEGER,
        respId TEXT,
        outcome TEXT,
        loi INTEGER,
        entryTime TEXT,
        exitTime TEXT,
        ip TEXT,
        timestamp TEXT
    )`);
    db.run("ALTER TABLE interviews ADD COLUMN entryTime TEXT", (err) => {});
    db.run("ALTER TABLE interviews ADD COLUMN exitTime TEXT", (err) => {});
    db.run("ALTER TABLE interviews ADD COLUMN ip TEXT", (err) => {});

    db.run(`CREATE TABLE IF NOT EXISTS users (
        username TEXT PRIMARY KEY,
        password TEXT,
        role TEXT,
        isBlocked INTEGER DEFAULT 0,
        assignedTL TEXT
    )`);
    // Ensure column exists for older databases
    db.run(`ALTER TABLE users ADD COLUMN isBlocked INTEGER DEFAULT 0`, (err) => {
        // Silently ignore if column already exists
    });

    db.run(`CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sender TEXT,
        receiver TEXT DEFAULT 'global',
        content TEXT,
        timestamp TEXT
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS daily_status (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT,
        role TEXT,
        content TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS activities (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        projectId TEXT,
        content TEXT,
        image TEXT,
        timestamp TEXT
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS attendance (
        username TEXT,
        date TEXT,
        status TEXT,
        PRIMARY KEY (username, date)
    )`);
    
    db.run("ALTER TABLE messages ADD COLUMN receiver TEXT DEFAULT 'global'", (err) => {});
    db.run("ALTER TABLE messages ADD COLUMN receiver TEXT DEFAULT 'global'", (err) => {});
    db.run("ALTER TABLE users ADD COLUMN assignedTL TEXT", (err) => {});
    db.run(`CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT
    )`, (err) => {
        if (!err) {
            // First ensure row exists, then force update to the requested domain
            const defaultBase = process.env.BASE_URL ? `${process.env.BASE_URL}/redirect.html` : 'http://localhost:5000/redirect.html';
            db.run("INSERT OR IGNORE INTO settings (key, value) VALUES ('base_redirect', ?)", [defaultBase]);
            if (process.env.BASE_URL) {
                db.run("UPDATE settings SET value = ? WHERE key = 'base_redirect'", [defaultBase]);
            }
        }
    });
});

/* ======================
   🔐 AUTH ROUTES
====================== */

// Login
app.post("/api/auth/login", (req, res) => {
    const { username, password } = req.body;
    db.get("SELECT * FROM users WHERE username = ? AND password = ?", [username, password], (err, user) => {
        if (err || !user) {
            return res.status(401).json({ message: "Invalid credentials" });
        }
        if (user.isBlocked) {
            return res.status(403).json({ blocked: true, message: "bhadwe tu block hai ghar nikal" });
        }
        res.json({
            username: user.username,
            role: user.role,
            fullName: user.username.toUpperCase()
        });
    });
});

/* ======================
   🔐 AUTH ROUTES
====================== */

// Send all users
app.get("/api/users", (req, res) => {
    db.all("SELECT username, role, isBlocked, assignedTL FROM users", [], (err, rows) => {
        if (err) {
            // If column is missing, add it and retry once
            if (err.message.includes("no such column: assignedTL")) {
                db.run("ALTER TABLE users ADD COLUMN assignedTL TEXT", (alterErr) => {
                    if (alterErr) return res.status(500).json({ error: alterErr.message });
                    db.all("SELECT username, role, isBlocked, assignedTL FROM users", [], (err2, rows2) => {
                        if (err2) return res.status(500).json({ error: err2.message });
                        res.json(rows2 || []);
                    });
                });
                return;
            }
            console.error("GET /api/users Error:", err.message);
            return res.status(500).json({ error: err.message });
        }
        res.json(rows || []);
    });
});

app.post("/api/users", (req, res) => {
    const { username, password, role, assignedTL } = req.body;
    const finalRole = role || 'employee';
    db.run("INSERT INTO users (username, password, role, assignedTL) VALUES (?, ?, ?, ?)", [username, password, finalRole, assignedTL || ''], function(err) {
        if (err) return res.status(400).json({ error: "Username already exists or error: " + err.message });
        res.json({ success: true, username, role: finalRole });
    });
});

app.delete("/api/users/:username", (req, res) => {
    const { username } = req.params;
    db.run("DELETE FROM users WHERE username = ?", [username], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

app.put("/api/users/:oldUsername", (req, res) => {
    const { oldUsername } = req.params;
    const { newUsername, newPassword, newRole, assignedTL } = req.body;
    
    if (oldUsername !== newUsername) {
        db.get("SELECT username FROM users WHERE username = ?", [newUsername], (err, row) => {
            if (row) return res.status(400).json({ error: "New username already exists" });
            updateUser();
        });
    } else {
        updateUser();
    }

    function updateUser() {
        if (newPassword) {
            db.run("UPDATE users SET username = ?, password = ?, role = ?, assignedTL = ? WHERE username = ?", [newUsername, newPassword, newRole, assignedTL || '', oldUsername], finalizeUpdate);
        } else {
            db.run("UPDATE users SET username = ?, role = ?, assignedTL = ? WHERE username = ?", [newUsername, newRole, assignedTL || '', oldUsername], finalizeUpdate);
        }
    }

    function finalizeUpdate(err) {
        if (err) return res.status(500).json({ error: err.message });
        if (oldUsername !== newUsername) {
            db.run("UPDATE daily_status SET username = ? WHERE username = ?", [newUsername, oldUsername]);
        }
        res.json({ success: true });
    }
});

app.put("/api/users/:username/block", (req, res) => {
    const { username } = req.params;
    const { isBlocked } = req.body;
    db.run("UPDATE users SET isBlocked = ? WHERE username = ?", [isBlocked ? 1 : 0, username], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

// Settings
app.get("/api/settings", (req, res) => {
    db.all("SELECT * FROM settings", [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        const settings = {};
        rows.forEach(r => settings[r.key] = r.value);
        res.json(settings);
    });
});

app.post("/api/settings", (req, res) => {
    const { key, value } = req.body;
    db.run("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", [key, value], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

/* ======================
   📊 PROJECT ROUTES
====================== */

app.get("/api/projects", (req, res) => {
    db.all("SELECT * FROM projects", [], (err, rows) => {
        res.json(rows || []);
    });
});

app.post("/api/projects", (req, res) => {
    const { id, name, links, goal, details, cpi } = req.body;
    const linksStr = typeof links === 'string' ? links : JSON.stringify(links || []);

    db.run("INSERT INTO projects (id, name, links, goal, details, cpi, status, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        [id, name, linksStr, goal || 0, details || '', cpi || 0, 'active', new Date().toISOString()], (err) => {
            if (err) {
                console.error("DB Error:", err.message);
                return res.status(400).json({ message: "Error saving project: " + err.message });
            }
            res.json({ id, name, status: 'active' });
        });
});

app.get("/api/activities", (req, res) => {
    db.all("SELECT * FROM activities ORDER BY id DESC LIMIT 50", [], (err, rows) => {
        res.json(rows || []);
    });
});

app.post("/api/activities", upload.single('image'), (req, res) => {
    const { projectId, content } = req.body;
    const image = req.file ? `/uploads/${req.file.filename}` : null;
    const timestamp = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });

    db.run("INSERT INTO activities (projectId, content, image, timestamp) VALUES (?, ?, ?, ?)",
        [projectId, content, image, timestamp], function (err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true, id: this.lastID, image });
        });
});

app.delete("/api/activities", (req, res) => {
    db.run("DELETE FROM activities", [], () => {
        res.json({ message: "All activities deleted" });
    });
});

app.delete("/api/activities/:id", (req, res) => {
    db.run("DELETE FROM activities WHERE id = ?", [req.params.id], () => {
        res.json({ message: "Activity deleted" });
    });
});

app.put("/api/projects/:id", (req, res) => {
    const { id } = req.params;
    const { status, links, name, goal, details, cpi } = req.body;
    
    let updates = [];
    let params = [];

    if (status) { updates.push("status = ?"); params.push(status); }
    if (name) { updates.push("name = ?"); params.push(name); }
    if (goal !== undefined) { updates.push("goal = ?"); params.push(goal); }
    if (details !== undefined) { updates.push("details = ?"); params.push(details); }
    if (cpi !== undefined) { updates.push("cpi = ?"); params.push(cpi); }
    if (links) {
        const linksStr = typeof links === 'string' ? links : JSON.stringify(links);
        updates.push("links = ?");
        params.push(linksStr);
    }

    if (updates.length === 0) return res.json({ success: true, message: "No updates provided" });

    params.push(id);
    const sql = `UPDATE projects SET ${updates.join(", ")} WHERE id = ?`;

    db.run(sql, params, function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, id });
    });
});

app.delete("/api/projects/:id", (req, res) => {
    const { id } = req.params;
    db.serialize(() => {
        db.run("DELETE FROM projects WHERE id = ?", [id]);
        db.run("DELETE FROM interviews WHERE projectId = ?", [id]);
    });
    res.json({ message: "Project and its data deleted permanently" });
});

/* ======================
   📈 INTERVIEW ROUTES
====================== */

app.get("/api/interviews", (req, res) => {
    const { projectId } = req.query;
    let sql = "SELECT * FROM interviews";
    let params = [];
    if (projectId && projectId !== "All") {
        sql += " WHERE projectId = ?";
        params.push(projectId);
    }
    db.all(sql, params, (err, rows) => {
        res.json(rows || []);
    });
});

app.post("/api/interviews", (req, res) => {
    const { projectId, linkIndex, respId, outcome, loi, timestamp, entryTime, exitTime, ip } = req.body;
    const finalTimestamp = timestamp || new Date().toLocaleString();
    db.run("INSERT INTO interviews (projectId, linkIndex, respId, outcome, loi, entryTime, exitTime, ip, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [projectId, linkIndex || 0, respId, outcome, loi || 0, entryTime || '', exitTime || '', ip || '', finalTimestamp], async function (err) {
            if (err) return res.status(500).json({ error: err.message });

            // 🚀 Update Project counters in real-time
            const status = (outcome || '').toLowerCase();
            let column = "";
            if (status === 'complete') column = "completes";
            else if (status === 'terminate') column = "terminates";
            else if (status.includes('quota')) column = "quotafulls";
            else if (status.includes('security')) column = "securities";

            if (column) {
                db.run(`UPDATE projects SET ${column} = ${column} + 1 WHERE id = ?`, [projectId]);
            }

            res.json({ id: this.lastID, ...req.body });
        });
});

app.delete("/api/interviews", (req, res) => {
    db.serialize(() => {
        db.run("DELETE FROM interviews");
        db.run("UPDATE projects SET completes = 0, terminates = 0, quotafulls = 0, securities = 0, clicks = 0");
    });
    res.json({ message: "All interviews deleted and project stats reset" });
});

// 🔐 PRO Redirect Save Endpoint (Server-side IP capture)
app.post("/api/save", (req, res) => {
    const { status, projectId, userId, ip: clientIp } = req.body;

    // 🚨 Basic validation
    if (!status || !projectId || !userId) {
        return res.status(400).json({ error: "Missing data" });
    }

    // 🔐 Final IP: Prioritize public IP from client (ipify), fallback to server detection
    const finalIp = clientIp || req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'Unknown';

    // Map status to outcome format used by dashboard
    let outcome = 'Complete';
    if (status === 'terminate') outcome = 'Terminate';
    if (status === 'quota') outcome = 'QuotaFull';
    if (status === 'security') outcome = 'Security Terminate';

    const now = new Date();
    const exitTime = now.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' });
    const timestamp = now.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });

    // Save into interviews table so dashboard shows everything
    db.run(
        "INSERT INTO interviews (projectId, linkIndex, respId, outcome, loi, entryTime, exitTime, ip, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [projectId, 0, userId, outcome, 0, '', exitTime, finalIp, timestamp],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });

            // 🚀 Update Project counters in real-time
            let column = "";
            if (status === 'complete') column = "completes";
            else if (status === 'terminate') column = "terminates";
            else if (status === 'quota') column = "quotafulls";
            else if (status === 'security') column = "securities";

            if (column) {
                db.run(`UPDATE projects SET ${column} = ${column} + 1 WHERE id = ?`, [projectId]);
            }

            res.json({ message: "Saved successfully", id: this.lastID, ip: finalIp });
        }
    );
});

app.post("/api/projects/:id/click", (req, res) => {
    db.run("UPDATE projects SET clicks = clicks + 1 WHERE id = ?", [req.params.id], (err) => {
        res.json({ success: true });
    });
});

// 📊 Statistics & IR Calculation
app.get("/api/stats", (req, res) => {
    db.all("SELECT outcome FROM interviews", [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        
        let stats = {
            complete: 0,
            terminate: 0,
            quota: 0,
            security: 0,
            ir: 0
        };

        rows.forEach(r => {
            const status = (r.outcome || '').toLowerCase();
            if (status === 'complete') stats.complete++;
            else if (status === 'terminate') stats.terminate++;
            else if (status.includes('quota')) stats.quota++;
            else if (status.includes('security')) stats.security++;
        });

        const totalAttempt = stats.complete + stats.terminate;
        if (totalAttempt > 0) {
            stats.ir = ((stats.complete / totalAttempt) * 100).toFixed(2);
        }

        res.json(stats);
    });
});

const PORT = process.env.PORT || 5000;
// Daily Status Routes
app.get("/api/daily-status", (req, res) => {
    db.all("SELECT * FROM daily_status ORDER BY timestamp DESC", [], (err, rows) => {
        res.json(rows || []);
    });
});

app.get("/api/daily-status/monthly", (req, res) => {
    const { month } = req.query; // format: YYYY-MM
    db.all("SELECT username, timestamp, content FROM daily_status WHERE timestamp LIKE ?", [`${month}%`], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows || []);
    });
});

app.delete("/api/daily-status/monthly", (req, res) => {
    const { month } = req.query;
    if (!month) return res.status(400).json({ error: "Month required" });
    db.run("DELETE FROM daily_status WHERE timestamp LIKE ?", [`${month}%`], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, deleted: this.changes });
    });
});

app.post("/api/daily-status", (req, res) => {
    const { username, content, timestamp } = req.body;
    const finalTS = timestamp || new Date().toISOString();
    db.run("INSERT INTO daily_status (username, content, timestamp) VALUES (?, ?, ?)", [username, content, finalTS], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ id: this.lastID, username, content, timestamp: finalTS });
    });
});

app.delete("/api/daily-status/:id", (req, res) => {
    db.run("DELETE FROM daily_status WHERE id = ?", [req.params.id], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

app.delete("/api/daily-status", (req, res) => {
    db.run("DELETE FROM daily_status", [], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

app.get("/api/messages", (req, res) => {
    const { user1, user2 } = req.query;
    if (user1 && user2) {
        // Private chat between two users
        db.all(`
            SELECT m.*, u.role as senderRole 
            FROM messages m 
            LEFT JOIN users u ON m.sender = u.username 
            WHERE (m.sender = ? AND m.receiver = ?) OR (m.sender = ? AND m.receiver = ?) 
            ORDER BY m.id ASC`, [user1, user2, user2, user1], (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(rows || []);
        });
    } else {
        // Global chat (where receiver is 'global')
        db.all(`
            SELECT m.*, u.role as senderRole 
            FROM messages m 
            LEFT JOIN users u ON m.sender = u.username 
            WHERE m.receiver = 'global' 
            ORDER BY m.id ASC`, [], (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(rows || []);
        });
    }
});

app.get("/api/messages/unread-counts-per-user", (req, res) => {
    const { username, lastId } = req.query;
    if (!username) return res.status(400).json({ error: "username missing" });
    
    db.all(`
        SELECT sender, COUNT(*) as count 
        FROM messages 
        WHERE receiver = ? AND id > ? AND sender != ?
        GROUP BY sender
    `, [username, lastId || 0, username], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        const counts = {};
        rows.forEach(r => counts[r.sender] = r.count);
        res.json(counts);
    });
});

app.get("/api/messages/unread-count", (req, res) => {
    const { username, lastId } = req.query;
    if (!username) return res.status(400).json({ error: "username missing" });
    db.get("SELECT COUNT(*) as count FROM messages WHERE (receiver = ? OR receiver = 'global') AND id > ? AND sender != ?", [username, lastId || 0, username], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ newCount: row ? row.count : 0 });
    });
});

app.post("/api/messages", (req, res) => {
    const { sender, receiver, content } = req.body;
    const dest = receiver || 'global';
    db.run("INSERT INTO messages (sender, receiver, content, timestamp) VALUES (?, ?, ?, ?)", [sender, dest, content, new Date().toISOString()], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ id: this.lastID, sender, receiver: dest, content, timestamp: new Date().toISOString() });
    });
});

app.delete("/api/messages/clear-my", (req, res) => {
    const { sender, receiver } = req.body;
    if (!sender || !receiver) return res.status(400).json({ error: "sender and receiver required" });
    
    if (receiver === 'global') {
        db.run("DELETE FROM messages WHERE sender = ? AND receiver = 'global'", [sender], function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true, deleted: this.changes });
        });
    } else {
        db.run("DELETE FROM messages WHERE sender = ? AND receiver = ?", [sender, receiver], function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true, deleted: this.changes });
        });
    }
});

app.delete("/api/messages/:id", (req, res) => {
    const id = req.params.id;
    db.run("DELETE FROM messages WHERE id = ?", [id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, deleted: this.changes });
    });
});

app.delete("/api/messages", (req, res) => {
    db.run("DELETE FROM messages WHERE receiver = 'global'", [], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, deleted: this.changes });
    });
});

app.get("/api/attendance", (req, res) => {
    const { date } = req.query;
    db.all("SELECT * FROM attendance WHERE date = ?", [date], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows || []);
    });
});

app.post("/api/attendance", (req, res) => {
    const { username, date, status } = req.body;
    db.run("INSERT OR REPLACE INTO attendance (username, date, status) VALUES (?, ?, ?)", [username, date, status], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

app.get("/api/attendance/monthly", (req, res) => {
    const { month } = req.query; // format: YYYY-MM
    db.all("SELECT * FROM attendance WHERE date LIKE ?", [`${month}%`], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows || []);
    });
});

app.delete("/api/attendance/monthly", (req, res) => {
    const { month } = req.query; // format: YYYY-MM
    if (!month) return res.status(400).json({ error: "Month required" });
    db.run("DELETE FROM attendance WHERE date LIKE ?", [`${month}%`], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, deleted: this.changes });
    });
});

app.listen(PORT, () => {
    db.run("CREATE INDEX IF NOT EXISTS idx_status_ts ON daily_status(timestamp)");
    db.run("CREATE INDEX IF NOT EXISTS idx_att_date ON attendance(date)");

    // Improved Auto-seed: Check and add missing users one by one
    const defaultUsers = [
        { u: "admin", p: "admin123", r: "owner" },
        { u: "kawal", p: "kawal123", r: "employee" },
        { u: "Ram", p: "ram123", r: "owner" },
        { u: "Amit", p: "amit123", r: "teamleader" },
        { u: "Pratham", p: "pratham123", r: "teamleader" },
        { u: "Anshul", p: "anshul123", r: "teamleader" },
        { u: "Naveen", p: "naveen123", r: "employee" },
        { u: "Piyush", p: "piyush123", r: "employee" }
    ];

    defaultUsers.forEach(user => {
        db.get("SELECT username FROM users WHERE username = ?", [user.u], (err, row) => {
            if (!row) {
                console.log(`Adding missing user: ${user.u}`);
                db.run("INSERT INTO users (username, password, role) VALUES (?, ?, ?)", [user.u, user.p, user.r]);
            }
        });
    });
});
