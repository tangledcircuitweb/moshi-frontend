const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Serve static files
app.use(express.static('.'));

// CORS headers for WebRTC
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    next();
});

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'healthy' });
});

// Start server
app.listen(PORT, () => {
    console.log(`Frontend server running on port ${PORT}`);
    console.log(`Open http://localhost:${PORT} to view the interface`);
});