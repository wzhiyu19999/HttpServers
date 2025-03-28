const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs').promises;
const config = require('../config.json');

// Create folder
router.post('/', async (req, res) => {
  try {
    if (!config.permissions.createFolder) {
      return res.status(403).json({
        success: false,
        message: 'Creating folders not allowed'
      });
    }

    const { name } = req.body;
    const folderPath = path.join(config.sharePath, req.query.path || '', name);

    await fs.mkdir(folderPath, { recursive: true });

    res.json({
      success: true,
      message: 'Folder created successfully',
      folder: {
        name,
        path: req.query.path || '',
        type: 'folder'
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error creating folder',
      error: error.message
    });
  }
});

// Delete folder
router.delete('/:foldername', async (req, res) => {
  try {
    if (!config.permissions.delete) {
      return res.status(403).json({
        success: false,
        message: 'Delete not allowed'
      });
    }

    const folderPath = path.join(config.sharePath, req.query.path || '', req.params.foldername);
    await fs.rmdir(folderPath, { recursive: true });

    res.json({
      success: true,
      message: 'Folder deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error deleting folder',
      error: error.message
    });
  }
});

// Rename folder
router.put('/rename/:foldername', async (req, res) => {
  try {
    if (!config.permissions.rename) {
      return res.status(403).json({
        success: false,
        message: 'Rename not allowed'
      });
    }

    const oldPath = path.join(config.sharePath, req.query.path || '', req.params.foldername);
    const newPath = path.join(config.sharePath, req.query.path || '', req.body.newName);

    await fs.rename(oldPath, newPath);

    res.json({
      success: true,
      message: 'Folder renamed successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error renaming folder',
      error: error.message
    });
  }
});

// Move folder
router.put('/move/:foldername', async (req, res) => {
  try {
    if (!config.permissions.move) {
      return res.status(403).json({
        success: false,
        message: 'Move not allowed'
      });
    }

    const sourcePath = path.join(config.sharePath, req.query.path || '', req.params.foldername);
    const targetPath = path.join(config.sharePath, req.body.targetPath, req.params.foldername);

    await fs.rename(sourcePath, targetPath);

    res.json({
      success: true,
      message: 'Folder moved successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error moving folder',
      error: error.message
    });
  }
});

module.exports = router; 