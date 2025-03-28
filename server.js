const express = require('express');
const fileUpload = require('express-fileupload');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
const fs = require('fs');
const winston = require('winston');
const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');

// --- Configuration Loading ---
const argv = yargs(hideBin(process.argv))
    .option('sharePath', {
        alias: 's',
        type: 'string',
        description: 'Path to the directory to share'
    })
    .option('port', {
        alias: 'p',
        type: 'number',
        description: 'Port to run the server on'
    })
    .help()
    .alias('help', 'h')
    .argv;

// Determine base path (for packaged app vs. local dev)
const basePath = process.pkg ? path.dirname(process.execPath) : __dirname;
const configPath = path.join(basePath, 'config.json');

// Load default config from file
let appConfig = {};
try {
    if (fs.existsSync(configPath)) {
        appConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        console.log(`Loaded configuration from ${configPath}`);
    } else {
        console.warn(`Warning: config.json not found at ${configPath}. Using defaults and command-line args.`);
        // Set essential defaults if config is missing
        appConfig = {
            sharePath: './shared',
            port: 80,
            maxFileSize: 50 * 1024 * 1024, // Default 50MB
            permissions: { 
                upload: true, 
                download: true, 
                delete: true, 
                rename: true,
                createFolder: true,
                move: true,
                dragAndDrop: true,
                preview: true
            }
        };
    }
} catch (error) {
    console.error(`Error reading config file at ${configPath}:`, error);
    process.exit(1); // Exit if config is crucial and unreadable
}

// Merge command-line arguments (they override config file)
if (argv.sharePath) {
    appConfig.sharePath = argv.sharePath;
    console.log(`Using sharePath from command line: ${appConfig.sharePath}`);
}
const PORT = argv.port || process.env.PORT || appConfig.port || 3000; // Priority: CLI > ENV > Config > Default

// Resolve sharePath to absolute path relative to basePath if it's relative
if (!path.isAbsolute(appConfig.sharePath)) {
    appConfig.sharePath = path.resolve(basePath, appConfig.sharePath);
    console.log(`Resolved relative sharePath to: ${appConfig.sharePath}`);
}
// --- End Configuration Loading ---

// Initialize Express app
const app = express();

// Configure logger (using basePath for log files)
const logDir = path.join(basePath, 'logs');
try {
    if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
    }
} catch (err) {
    console.error("Could not create log directory:", err);
    // Continue without file logging if directory creation fails
}

const logger = winston.createLogger({
    level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
    ),
    transports: [
        new winston.transports.File({ filename: path.join(logDir, 'error.log'), level: 'error' }),
        new winston.transports.File({ filename: path.join(logDir, 'combined.log') })
    ],
    exitOnError: false // Don't crash on logger errors
});

// Add console transport in development
if (process.env.NODE_ENV !== 'production') {
    logger.add(new winston.transports.Console({
        format: winston.format.simple()
    }));
}

// CORS configuration - restrict in production
const corsOptions = {
    origin: process.env.NODE_ENV === 'production' ? [/localhost$/] : '*', // Restrict in production
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
};

// Middleware
app.use(helmet({
    contentSecurityPolicy: process.env.NODE_ENV === 'production' // Enable CSP in production
}));
app.use(cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Setup morgan logging through winston
app.use(morgan('combined', { 
    stream: { 
        write: message => logger.info(message.trim()) 
    } 
}));

// File upload configuration with proper error handling
app.use(fileUpload({
    limits: { fileSize: appConfig.maxFileSize },
    useTempFiles: true,
    createParentPath: true,
    abortOnLimit: true,
    responseOnLimit: 'File size limit exceeded',
    limitHandler: (req, res, next) => {
        return res.status(413).json({
            success: false,
            message: 'File too large'
        });
    }
}));

// Serve static files from the correct path for pkg
const publicPath = process.pkg ? path.join(basePath, 'public') : path.join(__dirname, 'public');
app.use(express.static(publicPath, {
    maxAge: process.env.NODE_ENV === 'production' ? '1d' : 0 // Cache for 1 day in production
}));
console.log(`Serving static files from: ${publicPath}`);

// Add route for root path to serve index.html
app.get('/', (req, res) => {
    const indexPath = path.join(publicPath, 'index.html');
    if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
    } else {
        res.status(404).json({
            success: false,
            message: 'index.html not found. Please ensure the public directory exists next to the executable.'
        });
    }
});

// Serve shared files (use merged, absolute path)
app.use('/shared', express.static(appConfig.sharePath));

// Create shared directory if it doesn't exist
if (!fs.existsSync(appConfig.sharePath)) {
    try {
        fs.mkdirSync(appConfig.sharePath, { recursive: true });
        console.log(`Created shared directory at ${appConfig.sharePath}`);
    } catch (err) {
        console.error(`Failed to create shared directory at ${appConfig.sharePath}:`, err);
        process.exit(1);
    }
} else {
    console.log(`Shared directory exists at ${appConfig.sharePath}`);
}

// Routes - Pass the merged config object to the routes
const filesRouter = require('./routes/files')(appConfig);
const foldersRouter = require('./routes/folders')(appConfig);
app.use('/api/files', filesRouter);
app.use('/api/folders', foldersRouter);

// 404 handler
app.use((req, res, next) => {
    res.status(404).json({
        success: false,
        message: 'Resource not found'
    });
});

// Error handling middleware
app.use((err, req, res, next) => {
    logger.error(`${err.message}\n${err.stack}`);
    
    // Don't expose stack traces in production
    res.status(err.status || 500).json({
        success: false,
        message: err.message || 'Internal Server Error',
        error: process.env.NODE_ENV !== 'production' ? err.stack : undefined
    });
});

// Start server with error handling
const server = app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    console.log(`Access at http://localhost:${PORT}`);
    logger.info(`Server started on port ${PORT}`);
});

// Handle server errors
server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
        logger.error(`Port ${PORT} is already in use`);
        console.error(`Port ${PORT} is already in use`);
    } else {
        logger.error(`Server error: ${error.message}`);
        console.error(`Server error: ${error.message}`);
    }
    process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

function gracefulShutdown() {
    console.log('Received shutdown signal, closing server...');
    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
    
    // Force close after 10 seconds
    setTimeout(() => {
        console.error('Could not close connections in time, forcefully shutting down');
        process.exit(1);
    }, 10000);
}