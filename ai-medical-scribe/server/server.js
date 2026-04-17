const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
require('dotenv').config();

const app = express();

const defaultAllowedOrigins = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:5174',
  'http://127.0.0.1:5174',
];

const envAllowedOrigins = (process.env.CORS_ORIGIN || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const allowedOrigins = new Set([...defaultAllowedOrigins, ...envAllowedOrigins]);

// Middleware
app.use(cors({
  origin(origin, callback) {
    // Allow server-to-server or curl requests with no Origin header.
    if (!origin) {
      return callback(null, true);
    }

    if (allowedOrigins.has(origin)) {
      return callback(null, true);
    }

    return callback(new Error(`CORS blocked for origin: ${origin}`));
  },
  credentials: true
}));
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '50mb' }));

// Import routes
const authRoutes = require('./routes/auth');
const patientRoutes = require('./routes/patients');
const consultationRoutes = require('./routes/consultations');
const userRoutes = require('./routes/users');
const notesRoutes = require('./routes/notes');
const transcribeRoutes = require('./routes/transcribe');
const diarizeRoutes = require('./routes/diarize');
const { requireAuth } = require('./middleware/auth');

// Use routes
app.use('/api/auth', authRoutes);
app.use('/api/patients', requireAuth, patientRoutes);
app.use('/api/consultations', requireAuth, consultationRoutes);
app.use('/api/users', requireAuth, userRoutes);
app.use('/api/notes', requireAuth, notesRoutes);
app.use('/api/transcribe', requireAuth, transcribeRoutes);
app.use('/api/diarize', requireAuth, diarizeRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'AI Medical Scribe API Server Running',
    timestamp: new Date().toISOString()
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error'
  });
});

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════╗
║   🏥 AI Medical Scribe API Server                ║
║   🚀 Server running on port ${PORT}                  ║
║   📡 API: http://localhost:${PORT}/api            ║
║   🗄️  Database: ${process.env.DB_NAME}           ║
║   ✅ Status: Ready                                ║
╚═══════════════════════════════════════════════════╝
  `);
});

module.exports = app;
