const express = require('express');
const http = require('http');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const FacebookCore = require('./lib/facebook-core');
const createApiRouter = require('./routes/api');
const { initWebSocket } = require('./websocket/logger');

const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 3000;

// Enable CORS and JSON body parser
app.use(cors());
app.use(express.json());

// Serve static frontend dashboard
const frontendPath = path.join(__dirname, '..', 'frontend');
app.use(express.static(frontendPath));

// Instantiate Facebook Core Engine
const fbEngine = new FacebookCore();
app.locals.fbEngine = fbEngine;

// Initialize WebSocket Logger stream
initWebSocket(server, fbEngine);

// Mount API Routes
app.use('/api', createApiRouter(fbEngine));

// Start Server
server.listen(PORT, () => {
    console.log(`====================================================`);
    console.log(`🚀 Facebook Login & Automation Dashboard: http://localhost:${PORT}`);
    console.log(`📡 WebSocket Log Stream: ws://localhost:${PORT}/ws/logs`);
    console.log(`====================================================`);
});

module.exports = { app, server, fbEngine };
