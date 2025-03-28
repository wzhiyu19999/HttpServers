const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs').promises;
const mime = require('mime-types');
const sharp = require('sharp');
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

      // Generate thumbnail for images
      if (file.mimetype.startsWith('image/')) {
        const thumbPath = path.join(config.sharePath, uploadPath, '.thumbs');
        await fs.mkdir(thumbPath, { recursive: true });
        await sharp(targetPath)
          .resize(config.thumbnailSize.width, config.thumbnailSize.height, {
            fit: 'inside',
            withoutEnlargement: true
          })
          .toFile(path.join(thumbPath, originalName));
      }

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

module.exports = router;