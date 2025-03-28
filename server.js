const express = require('express');
const fileUpload = require('express-fileupload');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
const fs = require('fs');
const config = require('./config.json');
const winston = require('winston');

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3000;

// Configure logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' })
  ]
});

// Add console transport in development
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.simple()
  }));
}

// CORS configuration
const corsOptions = {
  origin: '*', // Allow all origins for development
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
};

// Middleware
app.use(helmet({
  contentSecurityPolicy: false // Disable CSP for development
}));
app.use(cors(corsOptions));
app.use(express.json());
app.use(morgan('combined'));
app.use(fileUpload({
  limits: { fileSize: config.maxFileSize },
  useTempFiles: true,
  tempFileDir: '/tmp/',
  createParentPath: true
}));

// Serve static files
app.use(express.static('public'));
app.use('/shared', express.static(config.sharePath));

// Create shared directory if it doesn't exist
if (!fs.existsSync(config.sharePath)) {
  fs.mkdirSync(config.sharePath, { recursive: true });
  console.log(`Created shared directory at ${path.resolve(config.sharePath)}`);
} else {
  console.log(`Shared directory exists at ${path.resolve(config.sharePath)}`);
  // List files in shared directory
  try {
    const files = fs.readdirSync(config.sharePath);
    console.log('Files in shared directory:', files);
  } catch (err) {
    console.error('Error reading shared directory:', err);
  }
}

// Routes
app.use('/api/files', require('./routes/files'));
app.use('/api/folders', require('./routes/folders'));

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error(err.stack);
  console.error('Server error:', err);
  res.status(500).json({
    success: false,
    message: 'Internal Server Error',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  console.log(`Access at http://localhost:${PORT}`);
  logger.info(`Server started on port ${PORT}`);
}); 