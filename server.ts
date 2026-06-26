import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import Database from "better-sqlite3";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";

dotenv.config();

const db = new Database("dermscan.db");
const JWT_SECRET = process.env.JWT_SECRET || "dermscan-secret-key-2026";

// Initialize database
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE,
    password TEXT,
    name TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS scans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    condition_name TEXT,
    confidence REAL,
    description TEXT,
    symptoms TEXT,
    recommendations TEXT,
    urgency TEXT,
    image_data TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );
`);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '10mb' }));

  // Middleware to verify JWT
  const authenticateToken = (req: any, res: any, next: any) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) return res.sendStatus(401);

    jwt.verify(token, JWT_SECRET, (err: any, user: any) => {
      if (err) return res.sendStatus(403);
      req.user = user;
      next();
    });
  };

  // Auth Routes
  app.post("/api/register", async (req, res) => {
    const { email, password, name } = req.body;
    
    try {
      const hashedPassword = await bcrypt.hash(password, 10);
      const stmt = db.prepare("INSERT INTO users (email, password, name) VALUES (?, ?, ?)");
      const result = stmt.run(email, hashedPassword, name);
      
      const token = jwt.sign({ userId: result.lastInsertRowid, email, name }, JWT_SECRET);
      res.status(201).json({ token, user: { id: result.lastInsertRowid, email, name } });
    } catch (error: any) {
      if (error.message.includes("UNIQUE constraint failed")) {
        return res.status(400).json({ error: "Email already exists" });
      }
      res.status(500).json({ error: "Failed to register user" });
    }
  });

  app.post("/api/login", async (req, res) => {
    const { email, password } = req.body;
    
    try {
      const stmt = db.prepare("SELECT * FROM users WHERE email = ?");
      const user = stmt.get(email) as any;
      
      if (!user || !(await bcrypt.compare(password, user.password))) {
        return res.status(401).json({ error: "Invalid email or password" });
      }
      
      const token = jwt.sign({ userId: user.id, email: user.email, name: user.name }, JWT_SECRET);
      res.json({ token, user: { id: user.id, email: user.email, name: user.name } });
    } catch (error) {
      res.status(500).json({ error: "Failed to login" });
    }
  });

  // Scan History Routes
  app.post("/api/scans", authenticateToken, async (req: any, res) => {
    const { conditionName, confidence, description, symptoms, recommendations, urgency, imageData } = req.body;
    const userId = req.user.userId;

    try {
      const stmt = db.prepare(`
        INSERT INTO scans (user_id, condition_name, confidence, description, symptoms, recommendations, urgency, image_data)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const result = stmt.run(
        userId, 
        conditionName, 
        confidence, 
        description, 
        JSON.stringify(symptoms), 
        JSON.stringify(recommendations), 
        urgency, 
        imageData
      );
      res.status(201).json({ id: result.lastInsertRowid });
    } catch (error) {
      console.error("Failed to save scan:", error);
      res.status(500).json({ error: "Failed to save scan" });
    }
  });

  app.get("/api/scans", authenticateToken, async (req: any, res) => {
    const userId = req.user.userId;

    try {
      const stmt = db.prepare("SELECT * FROM scans WHERE user_id = ? ORDER BY created_at DESC");
      const scans = stmt.all(userId).map((scan: any) => ({
        ...scan,
        symptoms: JSON.parse(scan.symptoms),
        recommendations: JSON.parse(scan.recommendations)
      }));
      res.json(scans);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch scans" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
