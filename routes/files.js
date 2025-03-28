const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs'); // Use synchronous fs for archiver and checks
const mime = require('mime-types');
const archiver = require('archiver'); // Import archiver
const config = require('../config.json');

// Get file list
router.get('/', async (req, res) => {
  try {
    const directory = req.query.path || '';
    const fullPath = path.join(config.sharePath, directory);
    
    console.log('Requested directory:', directory);
    console.log('Full path:', fullPath);
    
    const files = await fs.readdir(fullPath, { encoding: 'utf8' });
    console.log('Files found:', files);
    
    const fileList = await Promise.all(files.map(async (file) => {
      const filePath = path.join(fullPath, file);
      const stats = await fs.stat(filePath);
      const isDirectory = stats.isDirectory();
      
      if (config.excludedFiles.includes(file)) {
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
    }));

    const result = {
      success: true,
      files: fileList.filter(file => file !== null)
    };
    
    console.log('Sending response:', result);
    res.json(result);
  } catch (error) {
    console.error('Error getting file list:', error);
    res.status(500).json({
      success: false,
      message: 'Error getting file list',
      error: error.message
    });
  }
});

// Upload file
router.post('/upload', async (req, res) => {
  try {
    if (!config.permissions.upload) {
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
    const files = Array.isArray(req.files.files) ? req.files.files : [req.files.files];

    const uploadPromises = files.map(async (file) => {
      // Fix for Chinese filenames - properly decode the filename
      // The filename may be URL encoded from the browser
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
      
      console.log('Original filename:', file.name);
      console.log('Decoded filename:', originalName);
      
      const targetPath = path.join(config.sharePath, uploadPath, originalName);
      await file.mv(targetPath);

      return {
        name: originalName,
        size: file.size,
        type: file.mimetype
      };
    });

    const uploadedFiles = await Promise.all(uploadPromises);

    res.json({
      success: true,
      files: uploadedFiles
    });
  } catch (error) {
    console.error('Error uploading files:', error);
    res.status(500).json({
      success: false,
      message: 'Error uploading files',
      error: error.message
    });
  }
});

// Delete file
router.delete('/:filename', async (req, res) => {
  try {
    if (!config.permissions.delete) {
      return res.status(403).json({
        success: false,
        message: 'Delete not allowed'
      });
    }

    const filename = decodeURIComponent(req.params.filename);
    const filePath = path.join(config.sharePath, req.query.path || '', filename);
    await fs.unlink(filePath);

    res.json({
      success: true,
      message: 'File deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error deleting file',
      error: error.message
    });
  }
});

// Rename file
router.put('/rename/:filename', async (req, res) => {
  try {
    if (!config.permissions.rename) {
      return res.status(403).json({
        success: false,
        message: 'Rename not allowed'
      });
    }

    const oldFilename = decodeURIComponent(req.params.filename);
    const newFilename = decodeURIComponent(req.body.newName);
    
    const oldPath = path.join(config.sharePath, req.query.path || '', oldFilename);
    const newPath = path.join(config.sharePath, req.query.path || '', newFilename);

    await fs.rename(oldPath, newPath);

    res.json({
      success: true,
      message: 'File renamed successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error renaming file',
      error: error.message
    });
  }
});

// Move file
router.put('/move/:filename', async (req, res) => {
  try {
    if (!config.permissions.move) {
      return res.status(403).json({
        success: false,
        message: 'Move not allowed'
      });
    }

    const filename = decodeURIComponent(req.params.filename);
    const targetPath = decodeURIComponent(req.body.targetPath);
    
    const sourcePath = path.join(config.sharePath, req.query.path || '', filename);
    const destinationPath = path.join(config.sharePath, targetPath, filename);

    await fs.rename(sourcePath, destinationPath);

    res.json({
      success: true,
      message: 'File moved successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error moving file',
      error: error.message
    });
  }
});

// Get file content for preview
router.get('/preview/:filename', async (req, res) => {
  try {
    if (!config.permissions.download) {
      return res.status(403).json({
        success: false,
        message: 'Preview not allowed'
      });
    }

    const filename = decodeURIComponent(req.params.filename);
    const filePath = path.join(config.sharePath, req.query.path || '', filename);
    
    // Check if file exists
    try {
      await fs.access(filePath);
    } catch (error) {
      return res.status(404).json({
        success: false,
        message: 'File not found'
      });
    }

    // Get file stats
    const stats = await fs.stat(filePath);
    if (stats.size > config.maxPreviewSize) {
      return res.status(413).json({
        success: false,
        message: 'File too large for preview'
      });
    }

    // Get file type
    const fileType = mime.lookup(filename) || 'application/octet-stream';
    const fileCategory = fileType.split('/')[0];

    // Read file content
    let content = null;
    let previewType = 'none';

    // Handle different file types
    if (fileType.startsWith('text/') || 
        fileType === 'application/json' || 
        fileType === 'application/javascript' ||
        fileType === 'application/xml') {
      // Text files
      content = await fs.readFile(filePath, 'utf8');
      previewType = 'text';
    } else if (fileCategory === 'image') {
      // Images - send base64 for small images, or just the URL for larger ones
      if (stats.size < 1024 * 1024) { // Less than 1MB
        const buffer = await fs.readFile(filePath);
        content = `data:${fileType};base64,${buffer.toString('base64')}`;
      } else {
        content = `/shared/${encodeURIComponent(req.query.path ? req.query.path + '/' + filename : filename)}`;
      }
      previewType = 'image';
    } else if (fileType === 'application/pdf') {
      // PDF files - send the URL
      content = `/shared/${encodeURIComponent(req.query.path ? req.query.path + '/' + filename : filename)}`;
      previewType = 'pdf';
    } else if (fileCategory === 'video') {
      // Video files - send the URL
      content = `/shared/${encodeURIComponent(req.query.path ? req.query.path + '/' + filename : filename)}`;
      previewType = 'video';
    } else if (fileCategory === 'audio') {
      // Audio files - send the URL
      content = `/shared/${encodeURIComponent(req.query.path ? req.query.path + '/' + filename : filename)}`;
      previewType = 'audio';
    }

    res.json({
      success: true,
      filename,
      fileType,
      previewType,
      content,
      size: stats.size
    });
  } catch (error) {
    console.error('Error previewing file:', error);
    res.status(500).json({
      success: false,
      message: 'Error previewing file',
      error: error.message
    });
  }
});

// Download folder as zip
router.get('/download-folder', async (req, res) => {
  try {
    if (!config.permissions.download) {
      return res.status(403).json({ success: false, message: 'Download not allowed' });
    }

    const folderRelativePath = req.query.path ? decodeURIComponent(req.query.path) : '';
    if (!folderRelativePath) {
      return res.status(400).json({ success: false, message: 'Folder path is required' });
    }

    const folderFullPath = path.join(config.sharePath, folderRelativePath);
    const folderName = path.basename(folderRelativePath) || 'shared_files'; // Use 'shared_files' if it's the root

    // Check if the path exists and is a directory using sync fs before proceeding
    if (!fsSync.existsSync(folderFullPath) || !fsSync.statSync(folderFullPath).isDirectory()) {
      console.error('Download folder path invalid or not found:', folderFullPath);
      return res.status(404).json({ success: false, message: 'Folder not found or is not a directory' });
    }

    const zipFileName = `${folderName}.zip`;
    res.attachment(zipFileName); // Set headers for zip download

    const archive = archiver('zip', {
      zlib: { level: config.zipCompressionLevel !== undefined ? config.zipCompressionLevel : 6 } // Default level 6
    });

    // Handle errors during archiving
    archive.on('warning', (err) => {
      if (err.code === 'ENOENT') {
        console.warn('Archiver warning:', err);
      } else {
        console.error('Archiver error:', err);
        // Don't try to send JSON if headers already sent
        if (!res.headersSent) {
            res.status(500).send({ error: 'Archive creation warning led to failure' });
        }
      }
    });

    archive.on('error', (err) => {
      console.error('Archiver fatal error:', err);
      if (!res.headersSent) {
          res.status(500).send({ error: 'Archive creation failed' });
      }
    });

    // Pipe archive data to the response
    archive.pipe(res);

    // Add folder contents
    // The second argument 'false' means files will be added directly to the zip root
    // Use the folderName if you want files inside a directory named after the folder within the zip
    archive.directory(folderFullPath, folderName); 

    // Finalize the archive
    await archive.finalize();
    console.log(`Successfully created and streamed zip archive for: ${folderRelativePath}`);

  } catch (error) {
    console.error('Error during zip archive creation process:', error);
    if (!res.headersSent) {
      res.status(500).json({ success: false, message: 'Error creating zip archive', error: error.message });
    }
  }
});

// Download single file
router.get('/download/:filename', async (req, res) => {
  try {
    if (!config.permissions.download) {
      return res.status(403).json({
        success: false,
        message: 'Download not allowed'
      });
    }

    const filename = decodeURIComponent(req.params.filename);
    const filePath = path.join(config.sharePath, req.query.path || '', filename);
    
    // Check if file exists
    try {
      await fs.access(filePath);
    } catch (error) {
      return res.status(404).json({
        success: false,
        message: 'File not found'
      });
    }

    // Get file stats
    const stats = await fs.stat(filePath);

    // Get file type
    const fileType = mime.lookup(filename) || 'application/octet-stream';

    // Set headers for file download
    res.attachment(filename);
    res.type(fileType);

    // Stream file content
    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);

    console.log(`File downloaded: ${filename}`);
  } catch (error) {
    console.error('Error downloading file:', error);
    res.status(500).json({
      success: false,
      message: 'Error downloading file',
      error: error.message
    });
  }
});

module.exports = router;