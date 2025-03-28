const express = require('express');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs'); // For synchronous operations
const mime = require('mime-types');
const archiver = require('archiver');
const { pipeline } = require('stream');
const util = require('util');

// Export a function that accepts the config object
module.exports = function(config) {
  const router = express.Router();

  // Validate path to prevent directory traversal attacks
  const isPathSafe = (requestedPath) => {
    const normalizedPath = path.normalize(requestedPath);
    return !normalizedPath.includes('..');
  };

  // Get file list
  router.get('/', async (req, res) => {
    try {
      const directory = req.query.path || '';
      
      // Security check for path traversal
      if (!isPathSafe(directory)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid path'
        });
      }
      
      const fullPath = path.join(config.sharePath, directory);
      
      // Check if directory exists
      try {
        const stats = await fs.stat(fullPath);
        if (!stats.isDirectory()) {
          return res.status(400).json({
            success: false,
            message: 'Path is not a directory'
          });
        }
      } catch (err) {
        return res.status(404).json({
          success: false,
          message: 'Directory not found'
        });
      }
      
      const files = await fs.readdir(fullPath, { encoding: 'utf8' });
      
      const fileList = await Promise.all(files.map(async (file) => {
        try {
          const filePath = path.join(fullPath, file);
          const stats = await fs.stat(filePath);
          const isDirectory = stats.isDirectory();
          
          // Skip excluded files if configured
          if (config.excludedFiles && config.excludedFiles.includes(file)) {
            return null;
          }

          return {
            name: file,
            path: path.join(directory, file),
            size: stats.size,
            modified: stats.mtime,
            isDirectory,
            type: isDirectory ? 'folder' : mime.lookup(file) || 'application/octet-stream'
          };
        } catch (error) {
          // Skip files with errors (e.g., permission issues)
          console.error(`Error processing file ${file}:`, error);
          return null;
        }
      }));

      const result = {
        success: true,
        files: fileList.filter(file => file !== null)
      };
      
      res.json(result);
    } catch (error) {
      console.error('Error getting file list:', error);
      res.status(500).json({
        success: false,
        message: 'Error getting file list',
        error: process.env.NODE_ENV !== 'production' ? error.message : undefined
      });
    }
  });

  // Upload file
  router.post('/upload', async (req, res) => {
    try {
      // Permission check
      if (!config.permissions || !config.permissions.upload) {
        return res.status(403).json({
          success: false,
          message: 'Upload not allowed'
        });
      }

      if (!req.files || Object.keys(req.files).length === 0) {
        return res.status(400).json({
          success: false,
          message: 'No files were uploaded'
        });
      }

      const uploadPath = req.query.path || '';
      
      // Security check for path traversal
      if (!isPathSafe(uploadPath)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid upload path'
        });
      }
      
      // Ensure upload directory exists
      const fullUploadPath = path.join(config.sharePath, uploadPath);
      try {
        await fs.mkdir(fullUploadPath, { recursive: true });
      } catch (err) {
        console.error('Error creating upload directory:', err);
        return res.status(500).json({
          success: false,
          message: 'Could not create upload directory'
        });
      }
      
      const files = Array.isArray(req.files.files) ? req.files.files : [req.files.files];

      const uploadPromises = files.map(async (file) => {
        try {
          // Fix for Chinese filenames - properly decode the filename
          let originalName = Buffer.from(file.name, 'binary').toString('utf8');
          
          // If the name is still garbled, try additional decoding
          try {
            if (/%[0-9A-F]{2}/.test(originalName)) {
              originalName = decodeURIComponent(originalName);
            }
          } catch (e) {
            console.error('Error decoding filename:', e);
            // Keep the original name if decoding fails
          }
          
          const targetPath = path.join(config.sharePath, uploadPath, originalName);
          await file.mv(targetPath);

          return {
            name: originalName,
            size: file.size,
            type: file.mimetype
          };
        } catch (error) {
          console.error(`Error uploading file ${file.name}:`, error);
          return {
            name: file.name,
            error: error.message
          };
        }
      });

      const uploadedFiles = await Promise.all(uploadPromises);
      
      // Check if any files failed to upload
      const hasErrors = uploadedFiles.some(file => file.error);
      
      res.status(hasErrors ? 207 : 200).json({
        success: !hasErrors,
        files: uploadedFiles
      });
    } catch (error) {
      console.error('Error uploading files:', error);
      res.status(500).json({
        success: false,
        message: 'Error uploading files',
        error: process.env.NODE_ENV !== 'production' ? error.message : undefined
      });
    }
  });

  // Delete file
  router.delete('/:filename', async (req, res) => {
    try {
      // Permission check
      if (!config.permissions || !config.permissions.delete) {
        return res.status(403).json({
          success: false,
          message: 'Delete not allowed'
        });
      }

      const filename = decodeURIComponent(req.params.filename);
      const filePath = req.query.path || '';
      
      // Security check for path traversal
      if (!isPathSafe(filePath) || !isPathSafe(filename)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid path'
        });
      }
      
      const fullPath = path.join(config.sharePath, filePath, filename);
      
      // Check if file exists
      try {
        await fs.access(fullPath);
      } catch (err) {
        return res.status(404).json({
          success: false,
          message: 'File not found'
        });
      }
      
      await fs.unlink(fullPath);

      res.json({
        success: true,
        message: 'File deleted successfully'
      });
    } catch (error) {
      console.error('Error deleting file:', error);
      res.status(500).json({
        success: false,
        message: 'Error deleting file',
        error: process.env.NODE_ENV !== 'production' ? error.message : undefined
      });
    }
  });

  // Rename file
  router.put('/rename/:filename', async (req, res) => {
    try {
      // Permission check
      if (!config.permissions || !config.permissions.rename) {
        return res.status(403).json({
          success: false,
          message: 'Rename not allowed'
        });
      }

      const oldFilename = decodeURIComponent(req.params.filename);
      const newFilename = decodeURIComponent(req.body.newName);
      const filePath = req.query.path || '';
      
      // Security check for path traversal
      if (!isPathSafe(filePath) || !isPathSafe(oldFilename) || !isPathSafe(newFilename)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid path'
        });
      }
      
      const oldPath = path.join(config.sharePath, filePath, oldFilename);
      const newPath = path.join(config.sharePath, filePath, newFilename);
      
      // Check if source file exists
      try {
        await fs.access(oldPath);
      } catch (err) {
        return res.status(404).json({
          success: false,
          message: 'Source file not found'
        });
      }
      
      // Check if destination file already exists
      try {
        await fs.access(newPath);
        return res.status(409).json({
          success: false,
          message: 'Destination file already exists'
        });
      } catch (err) {
        // This is good - we want the destination to not exist
      }

      await fs.rename(oldPath, newPath);

      res.json({
        success: true,
        message: 'File renamed successfully'
      });
    } catch (error) {
      console.error('Error renaming file:', error);
      res.status(500).json({
        success: false,
        message: 'Error renaming file',
        error: process.env.NODE_ENV !== 'production' ? error.message : undefined
      });
    }
  });

  // Move file
  router.put('/move/:filename', async (req, res) => {
    try {
      // Permission check
      if (!config.permissions || !config.permissions.move) {
        return res.status(403).json({
          success: false,
          message: 'Move not allowed'
        });
      }

      const filename = decodeURIComponent(req.params.filename);
      const sourcePath = req.query.path || '';
      const targetPath = decodeURIComponent(req.body.targetPath || '');
      
      // Security check for path traversal
      if (!isPathSafe(sourcePath) || !isPathSafe(targetPath) || !isPathSafe(filename)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid path'
        });
      }
      
      const oldPath = path.join(config.sharePath, sourcePath, filename);
      const newPath = path.join(config.sharePath, targetPath, filename);
      
      // Check if source file exists
      try {
        await fs.access(oldPath);
      } catch (err) {
        return res.status(404).json({
          success: false,
          message: 'Source file not found'
        });
      }
      
      // Ensure target directory exists
      try {
        await fs.mkdir(path.join(config.sharePath, targetPath), { recursive: true });
      } catch (err) {
        console.error('Error creating target directory:', err);
        return res.status(500).json({
          success: false,
          message: 'Could not create target directory'
        });
      }
      
      // Check if destination file already exists
      try {
        await fs.access(newPath);
        return res.status(409).json({
          success: false,
          message: 'Destination file already exists'
        });
      } catch (err) {
        // This is good - we want the destination to not exist
      }

      await fs.rename(oldPath, newPath);

      res.json({
        success: true,
        message: 'File moved successfully'
      });
    } catch (error) {
      console.error('Error moving file:', error);
      res.status(500).json({
        success: false,
        message: 'Error moving file',
        error: process.env.NODE_ENV !== 'production' ? error.message : undefined
      });
    }
  });

  // Download file
  router.get('/download/:filename', async (req, res) => {
    try {
      // Permission check
      if (!config.permissions || !config.permissions.download) {
        return res.status(403).json({
          success: false,
          message: 'Download not allowed'
        });
      }

      const filename = decodeURIComponent(req.params.filename);
      const filePath = req.query.path || '';
      
      // Security check for path traversal
      if (!isPathSafe(filePath) || !isPathSafe(filename)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid path'
        });
      }
      
      const fullPath = path.join(config.sharePath, filePath, filename);
      
      // Check if file exists
      try {
        const stats = await fs.stat(fullPath);
        if (stats.isDirectory()) {
          return res.status(400).json({
            success: false,
            message: 'Cannot download a directory'
          });
        }
      } catch (err) {
        return res.status(404).json({
          success: false,
          message: 'File not found'
        });
      }

      res.download(fullPath, filename, (err) => {
        if (err) {
          console.error('Error downloading file:', err);
          // Only send error if headers haven't been sent yet
          if (!res.headersSent) {
            res.status(500).json({
              success: false,
              message: 'Error downloading file',
              error: process.env.NODE_ENV !== 'production' ? err.message : undefined
            });
          }
        }
      });
    } catch (error) {
      console.error('Error downloading file:', error);
      res.status(500).json({
        success: false,
        message: 'Error downloading file',
        error: process.env.NODE_ENV !== 'production' ? error.message : undefined
      });
    }
  });

  // Download folder as zip
  router.get('/download-folder', async (req, res) => {
    try {
      // Permission check
      if (!config.permissions || !config.permissions.download) {
        return res.status(403).json({
          success: false,
          message: 'Download not allowed'
        });
      }

      const folderPath = req.query.path || '';
      
      // Security check for path traversal
      if (!isPathSafe(folderPath)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid path'
        });
      }
      
      const fullPath = path.join(config.sharePath, folderPath);
      
      // Check if folder exists
      try {
        const stats = await fs.stat(fullPath);
        if (!stats.isDirectory()) {
          return res.status(400).json({
            success: false,
            message: 'Path is not a directory'
          });
        }
      } catch (err) {
        return res.status(404).json({
          success: false,
          message: 'Folder not found'
        });
      }

      // Set appropriate headers
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="${path.basename(folderPath) || 'download'}.zip"`);

      // Create zip archive
      const archive = archiver('zip', {
        zlib: { level: 6 } // Compression level
      });

      // Handle archive warnings
      archive.on('warning', (err) => {
        if (err.code === 'ENOENT') {
          console.warn('Archive warning:', err);
        } else {
          console.error('Archive error:', err);
          // Only end response if headers haven't been sent
          if (!res.headersSent) {
            res.end();
          }
        }
      });

      // Handle archive errors
      archive.on('error', (err) => {
        console.error('Archive error:', err);
        // Only end response if headers haven't been sent
        if (!res.headersSent) {
          res.status(500).json({
            success: false,
            message: 'Error creating zip archive',
            error: process.env.NODE_ENV !== 'production' ? err.message : undefined
          });
        }
      });

      // Pipe archive data to response
      archive.pipe(res);

      // Add folder contents to archive
      archive.directory(fullPath, path.basename(folderPath) || 'folder');

      // Finalize archive
      await archive.finalize();
    } catch (error) {
      console.error('Error downloading folder:', error);
      // Only send error if headers haven't been sent yet
      if (!res.headersSent) {
        res.status(500).json({
          success: false,
          message: 'Error downloading folder',
          error: process.env.NODE_ENV !== 'production' ? error.message : undefined
        });
      }
    }
  });

  // Preview file
  router.get('/preview/:filename', async (req, res) => {
    try {
      // Permission check
      if (!config.permissions || !config.permissions.preview) {
        return res.status(403).json({
          success: false,
          message: 'Preview not allowed'
        });
      }

      const filename = decodeURIComponent(req.params.filename);
      const filePath = req.query.path || '';
      
      // Security check for path traversal
      if (!isPathSafe(filePath) || !isPathSafe(filename)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid path'
        });
      }
      
      const fullPath = path.join(config.sharePath, filePath, filename);
      
      // Check if file exists and get its size
      let stats;
      try {
        stats = await fs.stat(fullPath);
        if (stats.isDirectory()) {
          return res.status(400).json({
            success: false,
            message: 'Cannot preview a directory'
          });
        }
      } catch (err) {
        return res.status(404).json({
          success: false,
          message: 'File not found'
        });
      }
      
      // Determine content type
      const contentType = mime.lookup(filename) || 'application/octet-stream';
      const fileExtension = path.extname(filename).toLowerCase();
      
      // Set different size limits based on file type
      let maxPreviewSize = config.maxPreviewSize || 5 * 1024 * 1024; // Default 5MB
      
      // For text files, we can allow larger files
      const textFileExtensions = ['.txt', '.md', '.csv', '.json', '.xml', '.html', '.htm', '.css', '.js', '.log', '.ini', '.conf', '.yaml', '.yml'];
      const imageFileExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg'];
      
      if (textFileExtensions.includes(fileExtension) || contentType.startsWith('text/')) {
        maxPreviewSize = config.maxTextPreviewSize || 10 * 1024 * 1024; // Default 10MB for text files
      }
      
      if (stats.size > maxPreviewSize) {
        return res.status(413).json({
          success: false,
          message: 'File too large for preview'
        });
      }

      // Set appropriate headers for preview
      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', 'inline');
      
      // Special handling for different file types
      if (textFileExtensions.includes(fileExtension) || contentType.startsWith('text/')) {
        // For text files, read with encoding to preserve characters
        try {
          const content = await fs.readFile(fullPath, 'utf8');
          return res.send(content);
        } catch (err) {
          console.error('Error reading text file:', err);
          return res.status(500).json({
            success: false,
            message: 'Error reading text file',
            error: process.env.NODE_ENV !== 'production' ? err.message : undefined
          });
        }
      } else if (imageFileExtensions.includes(fileExtension) || contentType.startsWith('image/')) {
        // For images, just stream the file
        const fileStream = fsSync.createReadStream(fullPath);
        fileStream.pipe(res);
        
        // Handle stream errors
        fileStream.on('error', (err) => {
          console.error('Error streaming image file:', err);
          if (!res.headersSent) {
            res.status(500).json({
              success: false,
              message: 'Error streaming image file',
              error: process.env.NODE_ENV !== 'production' ? err.message : undefined
            });
          }
        });
      } else if (contentType === 'application/pdf') {
        // For PDFs, stream with appropriate headers
        const fileStream = fsSync.createReadStream(fullPath);
        fileStream.pipe(res);
        
        // Handle stream errors
        fileStream.on('error', (err) => {
          console.error('Error streaming PDF file:', err);
          if (!res.headersSent) {
            res.status(500).json({
              success: false,
              message: 'Error streaming PDF file',
              error: process.env.NODE_ENV !== 'production' ? err.message : undefined
            });
          }
        });
      } else {
        // For other file types, just stream the file
        const fileStream = fsSync.createReadStream(fullPath);
        fileStream.pipe(res);
        
        // Handle stream errors
        fileStream.on('error', (err) => {
          console.error('Error streaming file:', err);
          if (!res.headersSent) {
            res.status(500).json({
              success: false,
              message: 'Error streaming file',
              error: process.env.NODE_ENV !== 'production' ? err.message : undefined
            });
          }
        });
      }
    } catch (error) {
      console.error('Error previewing file:', error);
      res.status(500).json({
        success: false,
        message: 'Error previewing file',
        error: process.env.NODE_ENV !== 'production' ? error.message : undefined
      });
    }
  });

  return router;
};