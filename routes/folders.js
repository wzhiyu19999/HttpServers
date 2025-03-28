const express = require('express');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');

module.exports = function(config) {
  const router = express.Router();

  // Validate path to prevent directory traversal attacks
  const isPathSafe = (requestedPath) => {
    const normalizedPath = path.normalize(requestedPath);
    return !normalizedPath.includes('..');
  };

  // Create folder
  router.post('/', async (req, res) => {
    try {
      // Permission check
      if (!config.permissions || !config.permissions.createFolder) {
        return res.status(403).json({
          success: false,
          message: 'Creating folders not allowed'
        });
      }

      const { name } = req.body;
      const folderPath = req.query.path || '';
      
      // Validate input
      if (!name || typeof name !== 'string' || name.trim() === '') {
        return res.status(400).json({
          success: false,
          message: 'Invalid folder name'
        });
      }
      
      // Security check for path traversal
      if (!isPathSafe(folderPath) || !isPathSafe(name)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid path'
        });
      }
      
      const fullPath = path.join(config.sharePath, folderPath, name);
      
      // Check if folder already exists
      try {
        await fs.access(fullPath);
        return res.status(409).json({
          success: false,
          message: 'Folder already exists'
        });
      } catch (err) {
        // This is good - we want the folder to not exist yet
      }

      await fs.mkdir(fullPath, { recursive: true });

      res.json({
        success: true,
        message: 'Folder created successfully',
        folder: {
          name,
          path: folderPath,
          type: 'folder'
        }
      });
    } catch (error) {
      console.error('Error creating folder:', error);
      res.status(500).json({
        success: false,
        message: 'Error creating folder',
        error: process.env.NODE_ENV !== 'production' ? error.message : undefined
      });
    }
  });

  // Delete folder
  router.delete('/:foldername', async (req, res) => {
    try {
      // Permission check
      if (!config.permissions || !config.permissions.delete) {
        return res.status(403).json({
          success: false,
          message: 'Delete not allowed'
        });
      }

      const foldername = decodeURIComponent(req.params.foldername);
      const folderPath = req.query.path || '';
      
      // Security check for path traversal
      if (!isPathSafe(folderPath) || !isPathSafe(foldername)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid path'
        });
      }
      
      const fullPath = path.join(config.sharePath, folderPath, foldername);
      
      // Check if folder exists and is a directory
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
      
      // Use recursive option to delete non-empty folders
      await fs.rm(fullPath, { recursive: true, force: true });

      res.json({
        success: true,
        message: 'Folder deleted successfully'
      });
    } catch (error) {
      console.error('Error deleting folder:', error);
      res.status(500).json({
        success: false,
        message: 'Error deleting folder',
        error: process.env.NODE_ENV !== 'production' ? error.message : undefined
      });
    }
  });

  // Rename folder
  router.put('/rename/:foldername', async (req, res) => {
    try {
      // Permission check
      if (!config.permissions || !config.permissions.rename) {
        return res.status(403).json({
          success: false,
          message: 'Rename not allowed'
        });
      }

      const oldFoldername = decodeURIComponent(req.params.foldername);
      const newFoldername = decodeURIComponent(req.body.newName);
      const folderPath = req.query.path || '';
      
      // Validate input
      if (!newFoldername || typeof newFoldername !== 'string' || newFoldername.trim() === '') {
        return res.status(400).json({
          success: false,
          message: 'Invalid new folder name'
        });
      }
      
      // Security check for path traversal
      if (!isPathSafe(folderPath) || !isPathSafe(oldFoldername) || !isPathSafe(newFoldername)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid path'
        });
      }
      
      const oldPath = path.join(config.sharePath, folderPath, oldFoldername);
      const newPath = path.join(config.sharePath, folderPath, newFoldername);
      
      // Check if source folder exists and is a directory
      try {
        const stats = await fs.stat(oldPath);
        if (!stats.isDirectory()) {
          return res.status(400).json({
            success: false,
            message: 'Source path is not a directory'
          });
        }
      } catch (err) {
        return res.status(404).json({
          success: false,
          message: 'Source folder not found'
        });
      }
      
      // Check if destination folder already exists
      try {
        await fs.access(newPath);
        return res.status(409).json({
          success: false,
          message: 'Destination folder already exists'
        });
      } catch (err) {
        // This is good - we want the destination to not exist
      }

      await fs.rename(oldPath, newPath);

      res.json({
        success: true,
        message: 'Folder renamed successfully'
      });
    } catch (error) {
      console.error('Error renaming folder:', error);
      res.status(500).json({
        success: false,
        message: 'Error renaming folder',
        error: process.env.NODE_ENV !== 'production' ? error.message : undefined
      });
    }
  });

  // Move folder
  router.put('/move/:foldername', async (req, res) => {
    try {
      // Permission check
      if (!config.permissions || !config.permissions.move) {
        return res.status(403).json({
          success: false,
          message: 'Move not allowed'
        });
      }

      const foldername = decodeURIComponent(req.params.foldername);
      const sourcePath = req.query.path || '';
      const targetPath = decodeURIComponent(req.body.targetPath || '');
      
      // Security check for path traversal
      if (!isPathSafe(sourcePath) || !isPathSafe(targetPath) || !isPathSafe(foldername)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid path'
        });
      }
      
      // Prevent moving a folder into itself
      if (targetPath.startsWith(path.join(sourcePath, foldername))) {
        return res.status(400).json({
          success: false,
          message: 'Cannot move a folder into itself'
        });
      }
      
      const oldPath = path.join(config.sharePath, sourcePath, foldername);
      const newPath = path.join(config.sharePath, targetPath, foldername);
      
      // Check if source folder exists and is a directory
      try {
        const stats = await fs.stat(oldPath);
        if (!stats.isDirectory()) {
          return res.status(400).json({
            success: false,
            message: 'Source path is not a directory'
          });
        }
      } catch (err) {
        return res.status(404).json({
          success: false,
          message: 'Source folder not found'
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
      
      // Check if destination folder already exists
      try {
        await fs.access(newPath);
        return res.status(409).json({
          success: false,
          message: 'Destination folder already exists'
        });
      } catch (err) {
        // This is good - we want the destination to not exist
      }

      await fs.rename(oldPath, newPath);

      res.json({
        success: true,
        message: 'Folder moved successfully'
      });
    } catch (error) {
      console.error('Error moving folder:', error);
      res.status(500).json({
        success: false,
        message: 'Error moving folder',
        error: process.env.NODE_ENV !== 'production' ? error.message : undefined
      });
    }
  });

  return router;
};