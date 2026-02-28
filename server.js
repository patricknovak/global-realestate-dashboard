/**
 * Global Real Estate Dashboard - Express Server
 *
 * Main entry point. Sets up middleware, static file serving,
 * API routes, and database connection.
 */

require('dotenv').config();

const express = require('express');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

const { getDatabase, closeDatabase } = require('./server/db/database');

// ---------------------------------------------------------------
// Initialize Express
// ---------------------------------------------------------------
const app = express();
const PORT = parseInt(process.env.PORT, 10) || 3000;

// ---------------------------------------------------------------
// Initialize Database
// ---------------------------------------------------------------
const db = getDatabase();

// ---------------------------------------------------------------
// Security middleware
// ---------------------------------------------------------------
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://unpkg.com", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://unpkg.com", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdnjs.cloudflare.com", "https://cdn.jsdelivr.net"],
      imgSrc: ["'self'", "data:", "https:", "blob:"],
      connectSrc: ["'self'", "https://*.tile.openstreetmap.org", "https://api.mapbox.com"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));

// ---------------------------------------------------------------
// CORS - Allow all origins in development, restrict in production
// ---------------------------------------------------------------
app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? process.env.CORS_ORIGIN || false
    : true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// ---------------------------------------------------------------
// Request logging
// ---------------------------------------------------------------
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// ---------------------------------------------------------------
// Body parsing
// ---------------------------------------------------------------
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ---------------------------------------------------------------
// Rate limiting
// ---------------------------------------------------------------
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500,                  // 500 requests per window per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Too many requests. Please try again later.',
  },
});

// Apply rate limiting to API routes only
app.use('/api/', apiLimiter);

// ---------------------------------------------------------------
// Static file serving
// ---------------------------------------------------------------
// Serve index.html and frontend assets from project root
app.use(express.static(path.join(__dirname), {
  index: 'index.html',
  extensions: ['html'],
}));

// Serve data directory explicitly for direct JSON access
app.use('/data', express.static(path.join(__dirname, 'data')));

// Serve public directory for additional static assets
app.use('/public', express.static(path.join(__dirname, 'public')));

// ---------------------------------------------------------------
// API Routes - mounted at /api/v1/
// ---------------------------------------------------------------
const listingsRoutes = require('./server/routes/listings');
const viewingsRoutes = require('./server/routes/viewings');
const documentsRoutes = require('./server/routes/documents');
const dataRoutes = require('./server/routes/data');
const scraperRoutes = require('./server/routes/scraper');

app.use('/api/v1/listings', listingsRoutes(db));
app.use('/api/v1/viewings', viewingsRoutes(db));
app.use('/api/v1/documents', documentsRoutes(db));
app.use('/api/v1/data', dataRoutes(db));
app.use('/api/v1/scraper', scraperRoutes(db));

// ---------------------------------------------------------------
// API health check
// ---------------------------------------------------------------
app.get('/api/v1/health', (req, res) => {
  const dbCheck = (() => {
    try {
      db.prepare('SELECT 1').get();
      return 'ok';
    } catch {
      return 'error';
    }
  })();

  res.json({
    success: true,
    data: {
      status: 'running',
      database: dbCheck,
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development',
    },
  });
});

// ---------------------------------------------------------------
// 404 handler for API routes
// ---------------------------------------------------------------
app.use('/api/*', (req, res) => {
  res.status(404).json({
    success: false,
    error: `API endpoint not found: ${req.method} ${req.originalUrl}`,
  });
});

// ---------------------------------------------------------------
// Global error handler
// ---------------------------------------------------------------
app.use((err, req, res, _next) => {
  console.error('[SERVER] Unhandled error:', err);

  const statusCode = err.statusCode || 500;
  const message = process.env.NODE_ENV === 'production'
    ? 'Internal server error.'
    : err.message;

  res.status(statusCode).json({
    success: false,
    error: message,
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack }),
  });
});

// ---------------------------------------------------------------
// Start server
// ---------------------------------------------------------------
const server = app.listen(PORT, () => {
  console.log(`
  ==========================================
    Global Real Estate Dashboard
    Server running on http://localhost:${PORT}
    Environment: ${process.env.NODE_ENV || 'development'}
    Database: ${process.env.DB_PATH || './server/db/dashboard.db'}
  ==========================================
  `);
});

// ---------------------------------------------------------------
// Graceful shutdown
// ---------------------------------------------------------------
function shutdown(signal) {
  console.log(`\n[SERVER] ${signal} received. Shutting down gracefully...`);
  server.close(() => {
    closeDatabase();
    console.log('[SERVER] Server closed.');
    process.exit(0);
  });

  // Force shutdown after 10 seconds
  setTimeout(() => {
    console.error('[SERVER] Forced shutdown after timeout.');
    closeDatabase();
    process.exit(1);
  }, 10000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

module.exports = app;
