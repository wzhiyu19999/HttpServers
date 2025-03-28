# 文件共享中心 (File Sharing System)

一个基于 Express.js 的文件共享应用，提供简洁美观的用户界面和丰富的文件管理功能。

## 功能特点

- 文件上传（支持单个/多个文件上传）
- 文件预览（支持图片、PDF、文本等常用格式）
- 文件/文件夹管理（删除、重命名、移动）
- 拖放支持（拖放上传、拖拽移动）
- 响应式设计（适配桌面端、平板端和移动端）
- 暗色主题支持

## 技术栈

- 后端：Express.js, Node.js
- 前端：Vanilla JavaScript, CSS3, HTML5
- 存储：本地文件系统

## 安装与使用

1. 克隆仓库：
```
git clone <repository-url>
```

2. 安装依赖：
```
npm install
```

3. 配置 `config.json`（可选）：
```json
{
  "sharePath": "./shared",  // 共享文件存储路径
  "maxFileSize": 100000000, // 100MB
  "permissions": {
    "upload": true,
    "delete": true,
    "download": true,
    "rename": true,
    "createFolder": true,
    "move": true,
    "dragAndDrop": true
  }
}
```

4. 启动服务器：
```
npm start
```

5. 打开浏览器访问：
```
http://localhost:3000
```

## 配置说明

可以通过编辑 `config.json` 文件来调整应用配置：

- `sharePath`: 共享文件存储位置
- `maxFileSize`: 允许上传的最大文件大小（字节）
- `permissions`: 权限控制开关
- `excludedFiles`: 不显示的文件/文件夹列表
- `allowedFileTypes`: 允许上传的文件类型
- `thumbnailSize`: 缩略图大小设置
- `cacheDuration`: 缓存持续时间（秒）

## 使用许可

MIT 