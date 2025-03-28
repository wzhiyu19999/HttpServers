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
    
    const files = await fs.readdir(fullPath);
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
      const targetPath = path.join(config.sharePath, uploadPath, file.name);
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
          .toFile(path.join(thumbPath, file.name));
      }

      return {
        name: file.name,
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

    const filePath = path.join(config.sharePath, req.query.path || '', req.params.filename);
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

    const oldPath = path.join(config.sharePath, req.query.path || '', req.params.filename);
    const newPath = path.join(config.sharePath, req.query.path || '', req.body.newName);

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

    const sourcePath = path.join(config.sharePath, req.query.path || '', req.params.filename);
    const targetPath = path.join(config.sharePath, req.body.targetPath, req.params.filename);

    await fs.rename(sourcePath, targetPath);

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