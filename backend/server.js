const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const path = require('path');
const { 
    initializeDatabase, 
    getAllPixels, 
    getPixelInfo,
    setPixel, 
    deletePixel, 
    getPixelCount 
} = require('./database');

require('dotenv').config();

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend')));

// Store connected clients
const clients = new Set();

// WebSocket connection handling
wss.on('connection', (ws) => {
    console.log('New client connected');
    clients.add(ws);
    
    // Send current user count to all clients
    broadcastUserCount();
    
    ws.on('close', () => {
        console.log('Client disconnected');
        clients.delete(ws);
        broadcastUserCount();
    });
    
    ws.on('error', (error) => {
        console.error('WebSocket error:', error);
        clients.delete(ws);
    });
});

// Broadcast user count to all connected clients
function broadcastUserCount() {
    const userCount = clients.size;
    const message = JSON.stringify({
        type: 'user_count',
        count: userCount
    });
    
    clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(message);
        }
    });
}

// Broadcast pixel update to all connected clients
function broadcastPixelUpdate(x, y, color, insertedBy, updatedAt) {
    const message = JSON.stringify({
        type: 'pixel_update',
        x,
        y,
        color,
        insertedBy,
        updatedAt
    });
    
    clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(message);
        }
    });
}

// Broadcast pixel deletion to all connected clients
function broadcastPixelDelete(x, y) {
    const message = JSON.stringify({
        type: 'pixel_delete',
        x,
        y
    });
    
    clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(message);
        }
    });
}

// API Routes

// Get all pixels with metadata
app.get('/api/pixels-with-metadata', async (req, res) => {
    try {
        const pixels = await getAllPixels();
        res.json(pixels);
    } catch (error) {
        console.error('Error fetching pixels:', error);
        res.status(500).json({ error: 'Failed to fetch pixels' });
    }
});

// Place or update a pixel
app.post('/api/pixel', async (req, res) => {
    try {
        const { x, y, color, insertedBy } = req.body;
        
        // Validate input
        if (typeof x !== 'number' || typeof y !== 'number' || typeof color !== 'string') {
            return res.status(400).json({ error: 'Invalid input data' });
        }
        
        // Validate coordinates (0-999 for 3000x3000 grid)
        if (x < 0 || x >= 3000 || y < 0 || y >= 3000) {
            return res.status(400).json({ error: 'Coordinates out of bounds' });
        }
        
        // Validate color format (hex color)
        if (!/^#[0-9A-Fa-f]{6}$/.test(color)) {
            return res.status(400).json({ error: 'Invalid color format' });
        }
        
        const pixel = await setPixel(x, y, color, insertedBy || 'Anonymous');
        
        // Broadcast to all connected clients with metadata
        broadcastPixelUpdate(x, y, color, insertedBy || 'Anonymous', pixel.updatedAt);
        
        res.json(pixel);
    } catch (error) {
        console.error('Error setting pixel:', error);
        res.status(500).json({ error: 'Failed to set pixel' });
    }
});

// Delete a pixel
app.delete('/api/pixel', async (req, res) => {
    try {
        const { x, y } = req.body;
        
        // Validate input
        if (typeof x !== 'number' || typeof y !== 'number') {
            return res.status(400).json({ error: 'Invalid input data' });
        }
        
        // Validate coordinates
        if (x < 0 || x >= 3000 || y < 0 || y >= 3000) {
            return res.status(400).json({ error: 'Coordinates out of bounds' });
        }
        
        const deletedPixel = await deletePixel(x, y);
        
        if (deletedPixel) {
            // Broadcast to all connected clients
            broadcastPixelDelete(x, y);
            res.json({ message: 'Pixel deleted successfully' });
        } else {
            res.status(404).json({ error: 'Pixel not found' });
        }
    } catch (error) {
        console.error('Error deleting pixel:', error);
        res.status(500).json({ error: 'Failed to delete pixel' });
    }
});

// Get canvas statistics
app.get('/api/stats', async (req, res) => {
    try {
        const pixelCount = await getPixelCount();
        const userCount = clients.size;
        
        res.json({
            totalPixels: pixelCount,
            activeUsers: userCount,
            canvasSize: '3000x3000'
        });
    } catch (error) {
        console.error('Error fetching stats:', error);
        res.status(500).json({ error: 'Failed to fetch statistics' });
    }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'healthy', 
        timestamp: new Date().toISOString(),
        activeConnections: clients.size
    });
});

// Serve frontend
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// Error handling middleware
app.use((error, req, res, next) => {
    console.error('Server error:', error);
    res.status(500).json({ error: 'Internal server error' });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({ error: 'Route not found' });
});

// Initialize database and start server
async function startServer() {
    try {
        await initializeDatabase();
        
        server.listen(PORT, () => {
            console.log(`Server running on port ${PORT}`);
            console.log(`Frontend available at http://localhost:${PORT}`);
            console.log(`API available at http://localhost:${PORT}/api`);
        });
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\nShutting down server...');
    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
});

process.on('SIGTERM', () => {
    console.log('\nShutting down server...');
    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
});

startServer();