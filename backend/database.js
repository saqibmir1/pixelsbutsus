const { Pool } = require('pg');
require('dotenv').config();

// Database connection configuration
const pool = new Pool({
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'pixel_canvas',
    password: process.env.DB_PASSWORD || 'your_password',
    port: process.env.DB_PORT || 5432,
});

// Test database connection
pool.on('connect', () => {
    console.log('Connected to PostgreSQL database');
});

pool.on('error', (err) => {
    console.error('PostgreSQL connection error:', err);
});

// Initialize database tables
async function initializeDatabase() {
    try {
        // Create pixels table if it doesn't exist
        await pool.query(`
            CREATE TABLE IF NOT EXISTS pixels (
                id SERIAL PRIMARY KEY,
                x INTEGER NOT NULL,
                y INTEGER NOT NULL,
                color VARCHAR(7) NOT NULL,
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(x, y)
            );
        `);
        
        // Create index for faster lookups
        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_pixels_coordinates ON pixels(x, y);
        `);
        
        console.log('Database tables initialized successfully');
    } catch (error) {
        console.error('Error initializing database:', error);
        throw error;
    }
}

// Get all pixels from database
async function getAllPixels() {
    try {
        const result = await pool.query('SELECT x, y, color FROM pixels ORDER BY timestamp ASC');
        return result.rows;
    } catch (error) {
        console.error('Error fetching pixels:', error);
        throw error;
    }
}

// Add or update a pixel
async function setPixel(x, y, color) {
    try {
        const result = await pool.query(
            `INSERT INTO pixels (x, y, color) 
             VALUES ($1, $2, $3) 
             ON CONFLICT (x, y) 
             DO UPDATE SET color = $3, timestamp = CURRENT_TIMESTAMP
             RETURNING *`,
            [x, y, color]
        );
        return result.rows[0];
    } catch (error) {
        console.error('Error setting pixel:', error);
        throw error;
    }
}

// Delete a pixel
async function deletePixel(x, y) {
    try {
        const result = await pool.query('DELETE FROM pixels WHERE x = $1 AND y = $2 RETURNING *', [x, y]);
        return result.rows[0];
    } catch (error) {
        console.error('Error deleting pixel:', error);
        throw error;
    }
}

// Clear all pixels (admin function)
async function clearAllPixels() {
    try {
        await pool.query('DELETE FROM pixels');
        console.log('All pixels cleared');
    } catch (error) {
        console.error('Error clearing pixels:', error);
        throw error;
    }
}

// Get pixel count
async function getPixelCount() {
    try {
        const result = await pool.query('SELECT COUNT(*) FROM pixels');
        return parseInt(result.rows[0].count);
    } catch (error) {
        console.error('Error getting pixel count:', error);
        throw error;
    }
}

module.exports = {
    pool,
    initializeDatabase,
    getAllPixels,
    setPixel,
    deletePixel,
    clearAllPixels,
    getPixelCount
};
