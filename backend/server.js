const express = require("express");
const cors = require("cors");
const bcrypt = require("bcrypt");
const { Pool } = require("pg");
const path = require("path");
const http = require("http");
const WebSocket = require("ws");

require("dotenv").config();

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "FRONTEND"))); // Serve frontend

// PostgreSQL DB setup
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// === AUTHENTICATION ROUTES ===

// Register
app.post("/register", async (req, res) => {
  const { username, password, dob, gender, profilePic = "" } = req.body;
  try {
    const hash = await bcrypt.hash(password, 10);
    await pool.query(
      `INSERT INTO users (username, password, dob, gender, profile_pic) VALUES ($1, $2, $3, $4, $5)`,
      [username, hash, dob, gender, profilePic]
    );
    res.status(201).json({ message: "User registered!" });
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: "Username already exists or bad input." });
  }
});

// Login
app.post("/login", async (req, res) => {
  const { username, password } = req.body;
  try {
    const result = await pool.query(`SELECT * FROM users WHERE username = $1`, [username]);
    if (result.rows.length === 0) return res.status(401).json({ error: "Invalid credentials" });

    const user = result.rows[0];
    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ error: "Invalid credentials" });

    res.status(200).json({ message: "Login successful", username: user.username });
  } catch (err) {
    res.status(500).json({ error: "Login failed" });
  }
});

// === WEBSOCKET HANDLING ===

let clients = {};
let groups = {};

wss.on("connection", (ws) => {
  let username = null;

  ws.on("message", (data) => {
    let message;
    try {
      message = JSON.parse(data);
    } catch (error) {
      console.error("Invalid JSON:", error);
      return;
    }

    // User connects
    if (message.type === "connect") {
      username = message.username;
      if (clients[username]) {
        ws.send(JSON.stringify({ type: "error", message: "Username already taken" }));
        ws.close();
        return;
      }
      clients[username] = ws;
      console.log(`${username} connected`);
      broadcastUserList();
    }

    // Group creation
    else if (message.type === "group-create") {
      const { groupId, groupName, members } = message;
      groups[groupId] = members;
      console.log(`Group ${groupId} created:`, members);

      members.forEach(member => {
        if (clients[member]?.readyState === WebSocket.OPEN) {
          clients[member].send(JSON.stringify({
            type: "group-available",
            groupId,
            groupName,
            members
          }));
        }
      });
    }

    // Chat message
    else if (message.type === "message") {
      const isGroup = message.recipient.startsWith("group-");
      const payload = {
        type: "message",
        sender: message.sender,
        recipient: message.recipient,
        message: message.message,
        timestamp: new Date().toLocaleString()
      };

      if (isGroup && groups[message.recipient]) {
        groups[message.recipient].forEach(member => {
          if (member !== message.sender && clients[member]) {
            clients[member].send(JSON.stringify(payload));
          }
        });
      } else if (clients[message.recipient]) {
        clients[message.recipient].send(JSON.stringify(payload));
      }
    }

    // Typing indicator
    else if (message.type === "typing") {
      if (clients[message.recipient]) {
        clients[message.recipient].send(JSON.stringify({ type: "typing", sender: message.sender }));
      }
    }

    // Seen
    else if (message.type === "seen") {
      if (clients[message.sender]) {
        clients[message.sender].send(JSON.stringify({
          type: "seen",
          recipient: message.recipient,
          timestamp: new Date().toLocaleString()
        }));
      }
    }

    // WebRTC signaling
    else if (
      ["call-offer", "call-answer", "ice-candidate"].includes(message.type)
    ) {
      if (clients[message.recipient]) {
        clients[message.recipient].send(JSON.stringify(message));
      }
    }
  });

  ws.on("error", (err) => {
    console.error(`WebSocket error for ${username}:`, err);
  });

  ws.on("close", () => {
    if (username && clients[username]) {
      console.log(`${username} disconnected`);
      delete clients[username];
      broadcastUserList();
    }
  });
});

// Broadcast updated user list
function broadcastUserList() {
  const users = Object.keys(clients);
  const msg = JSON.stringify({ type: "updateUsers", users });

  for (let user in clients) {
    if (clients[user].readyState === WebSocket.OPEN) {
      clients[user].send(msg);
    }
  }
}

// Start the combined server
const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
  console.log(`Server (HTTP + WS) running on port ${PORT}`);
});
