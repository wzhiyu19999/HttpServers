document.addEventListener('DOMContentLoaded', function() {
    // 主题切换
    const themeToggle = document.querySelector('.theme-toggle');
    const body = document.body;
    
    // 从 localStorage 加载主题设置
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark') {
        body.setAttribute('data-theme', 'dark');
        themeToggle.querySelector('i').classList.remove('fa-moon');
        themeToggle.querySelector('i').classList.add('fa-sun');
    }
    
    themeToggle.addEventListener('click', function() {
        const isDark = body.getAttribute('data-theme') === 'dark';
        const icon = this.querySelector('i');
        
        if (isDark) {
            body.removeAttribute('data-theme');
            icon.classList.remove('fa-sun');
            icon.classList.add('fa-moon');
            localStorage.setItem('theme', 'light');
        } else {
            body.setAttribute('data-theme', 'dark');
            icon.classList.remove('fa-moon');
            icon.classList.add('fa-sun');
            localStorage.setItem('theme', 'dark');
        }
    });

    // 文件上传
    const uploadBtn = document.getElementById('uploadFileBtn');
    const fileInput = document.getElementById('fileInput');
    
    uploadBtn.addEventListener('click', function() {
        fileInput.click();
    });
    
    fileInput.addEventListener('change', function(e) {
        const files = Array.from(e.target.files);
        if (files.length > 0) {
            uploadFiles(files);
        }
    });

    // 拖放上传 - 修改为整个窗口
    const fileContainer = document.getElementById('fileContainer');
    const container = document.querySelector('.container');
    
    // 阻止默认的拖放行为
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        document.body.addEventListener(eventName, preventDefaults, false);
    });
    
    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }
    
    // 拖放反馈 - 在整个窗口上显示
    ['dragenter', 'dragover'].forEach(eventName => {
        document.body.addEventListener(eventName, highlightWindow, false);
    });
    
    ['dragleave', 'drop'].forEach(eventName => {
        document.body.addEventListener(eventName, unhighlightWindow, false);
    });
    
    // 创建全屏拖放提示
    const fullscreenDragIndicator = document.createElement('div');
    fullscreenDragIndicator.className = 'fullscreen-drag-indicator';
    fullscreenDragIndicator.innerHTML = `
        <div class="drag-message-content">
            <i class="fa-solid fa-cloud-arrow-up fa-3x"></i>
            <p>拖放文件到此处上传</p>
        </div>
    `;
    document.body.appendChild(fullscreenDragIndicator);
    
    function highlightWindow(e) {
        // 忽略从子元素传出的事件
        const isFromChild = e.relatedTarget && document.body.contains(e.relatedTarget);
        if (e.type === 'dragenter' && isFromChild) return;
        
        fullscreenDragIndicator.classList.add('active');
    }
    
    function unhighlightWindow(e) {
        // 忽略进入子元素的事件
        if (e.type === 'dragleave') {
            const isToChild = e.relatedTarget && document.body.contains(e.relatedTarget);
            if (isToChild) return;
        }
        
        fullscreenDragIndicator.classList.remove('active');
    }
    
    // 处理拖放 - 全窗口
    document.body.addEventListener('drop', handleDrop, false);
    
    function handleDrop(e) {
        const dt = e.dataTransfer;
        const files = Array.from(dt.files);
        
        if (files.length > 0) {
            uploadFiles(files);
        }
    }

    // 搜索功能
    const searchInput = document.getElementById('searchInput');
    const searchBtn = document.getElementById('searchBtn');
    
    searchInput.addEventListener('input', debounce(function() {
        filterFiles(this.value);
    }, 300));
    
    searchBtn.addEventListener('click', function() {
        filterFiles(searchInput.value);
    });

    // 预览模态框
    const modal = document.getElementById('previewModal');
    const closeBtn = modal.querySelector('.close');
    
    closeBtn.addEventListener('click', function() {
        modal.style.display = 'none';
    });
    
    window.addEventListener('click', function(e) {
        if (e.target === modal) {
            modal.style.display = 'none';
        }
    });

    // 工具函数
    function debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func.apply(this, args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    function filterFiles(query) {
        const fileItems = document.querySelectorAll('.file-item');
        const normalizedQuery = query.toLowerCase();
        
        fileItems.forEach(item => {
            const fileName = item.querySelector('.file-name').textContent.toLowerCase();
            item.style.display = fileName.includes(normalizedQuery) ? '' : 'none';
        });
    }

    // 添加 Toast 通知功能
    function showToast(message, type = 'info', duration = 3000) {
        const toastContainer = document.getElementById('toastContainer');
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        
        // 根据类型添加不同图标
        let icon = 'fa-info-circle';
        if (type === 'success') icon = 'fa-check-circle';
        if (type === 'error') icon = 'fa-exclamation-circle';
        
        toast.innerHTML = `
            <i class="fa-solid ${icon}" style="margin-right: 10px;"></i>
            <span>${message}</span>
        `;
        
        toastContainer.appendChild(toast);
        
        // 自动移除
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(40px)';
            setTimeout(() => {
                toastContainer.removeChild(toast);
            }, 300);
        }, duration);
    }

    function uploadFiles(files) {
        // 创建表单数据
        const formData = new FormData();
        files.forEach(file => {
            formData.append('files', file);
        });
        
        // 获取当前路径
        const currentPath = document.querySelector('.breadcrumb').getAttribute('data-path') || '';
        
        // 显示上传进度
        const fileContainer = document.getElementById('fileContainer');
        const uploadStatus = document.createElement('div');
        uploadStatus.className = 'upload-status';
        uploadStatus.innerHTML = `
            <div class="upload-info">正在上传 ${files.length} 个文件...</div>
            <div class="progress-bar"><div class="progress"></div></div>
        `;
        fileContainer.appendChild(uploadStatus);
        
        // 显示 Toast 通知
        showToast(`正在上传 ${files.length} 个文件...`, 'info');
        
        // 发送上传请求
        fetch(`/api/files/upload?path=${currentPath}`, {
            method: 'POST',
            body: formData
        })
        .then(response => {
            if (!response.ok) {
                throw new Error(`上传失败: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            if (data.success) {
                // 上传成功，重新加载文件列表
                showToast(`成功上传 ${files.length} 个文件`, 'success');
                loadFileList(currentPath);
            } else {
                showToast(`上传失败: ${data.message}`, 'error');
                fileContainer.removeChild(uploadStatus);
            }
        })
        .catch(error => {
            console.error('Error:', error);
            showToast(`上传失败: ${error.message}`, 'error');
            fileContainer.removeChild(uploadStatus);
        });
    }

    function formatFileSize(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    function formatDate(date) {
        return new Date(date).toLocaleString('zh-CN', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    function getFileIcon(fileName) {
        if (!fileName) return 'fa-file';
        
        const extension = fileName.split('.').pop().toLowerCase();
        
        const iconMap = {
            // Documents
            'pdf': 'fa-file-pdf',
            'doc': 'fa-file-word',
            'docx': 'fa-file-word',
            'xls': 'fa-file-excel',
            'xlsx': 'fa-file-excel',
            'ppt': 'fa-file-powerpoint',
            'pptx': 'fa-file-powerpoint',
            'txt': 'fa-file-lines',
            
            // Images
            'jpg': 'fa-file-image',
            'jpeg': 'fa-file-image',
            'png': 'fa-file-image',
            'gif': 'fa-file-image',
            'svg': 'fa-file-image',
            
            // Code
            'html': 'fa-file-code',
            'css': 'fa-file-code',
            'js': 'fa-file-code',
            'jsx': 'fa-file-code',
            'ts': 'fa-file-code',
            'tsx': 'fa-file-code',
            'json': 'fa-file-code',
            'php': 'fa-file-code',
            'py': 'fa-file-code',
            
            // Archives
            'zip': 'fa-file-zipper',
            'rar': 'fa-file-zipper',
            '7z': 'fa-file-zipper',
            'tar': 'fa-file-zipper',
            'gz': 'fa-file-zipper',
            
            // Audio/Video
            'mp3': 'fa-file-audio',
            'wav': 'fa-file-audio',
            'mp4': 'fa-file-video',
            'mov': 'fa-file-video',
            'avi': 'fa-file-video'
        };
        
        return iconMap[extension] || 'fa-file';
    }

    function addFileToList(file) {
        const fileContainer = document.getElementById('fileContainer');
        const fileItem = document.createElement('div');
        fileItem.className = 'file-item';
        fileItem.dataset.path = file.path;
        fileItem.dataset.name = file.name;
        fileItem.dataset.isDirectory = file.isDirectory;
        
        const icon = file.isDirectory ? 'fa-folder' : getFileIcon(file.name);
        
        fileItem.innerHTML = `
            <div class="file-name">
                <div class="file-icon">
                    <i class="fa-regular ${icon}"></i>
                </div>
                ${file.name}
            </div>
            <div class="modified">${formatDate(file.modified)}</div>
            <div class="size">${formatFileSize(file.size)}</div>
            <div class="file-actions">
                ${!file.isDirectory ? `
                <button class="action-btn download-btn" title="下载">
                    <i class="fa-solid fa-download"></i>
                </button>
                ` : ''}
                <button class="action-btn delete-btn" title="删除">
                    <i class="fa-solid fa-trash"></i>
                </button>
            </div>
        `;
        
        fileContainer.appendChild(fileItem);
        
        // 添加文件下载事件
        if (!file.isDirectory) {
            const downloadBtn = fileItem.querySelector('.download-btn');
            downloadBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                downloadFile(file);
            });
        }
        
        // 添加文件删除事件
        const deleteBtn = fileItem.querySelector('.delete-btn');
        deleteBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            deleteFile(file);
        });
    }

    // 下载文件
    function downloadFile(file) {
        const currentPath = document.querySelector('.breadcrumb').getAttribute('data-path') || '';
        const filePath = currentPath ? `${currentPath}/${file.name}` : file.name;
        
        // 显示 Toast 通知
        showToast(`正在下载 ${file.name}...`, 'info');
        
        // 创建一个隐藏的链接元素，设置下载属性，然后点击它
        const a = document.createElement('a');
        a.href = `/shared/${encodeURIComponent(filePath)}`;
        a.download = file.name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    }

    // 删除文件或文件夹
    function deleteFile(file) {
        if (!confirm(`确定要删除 "${file.name}" 吗？此操作不可撤销。`)) {
            return;
        }
        
        const currentPath = document.querySelector('.breadcrumb').getAttribute('data-path') || '';
        const endpoint = file.isDirectory ? 'folders' : 'files';
        
        // 查找并添加动画效果
        const fileItems = document.querySelectorAll('.file-item');
        let targetItem;
        fileItems.forEach(item => {
            if (item.dataset.name === file.name) {
                targetItem = item;
                item.classList.add('removing');
            }
        });
        
        showToast(`正在删除 ${file.name}...`, 'info');
        
        fetch(`/api/${endpoint}/${encodeURIComponent(file.name)}?path=${encodeURIComponent(currentPath)}`, {
            method: 'DELETE'
        })
        .then(response => {
            if (!response.ok) {
                throw new Error(`删除失败: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            if (data.success) {
                // 删除成功，重新加载文件列表
                showToast(`成功删除 ${file.name}`, 'success');
                
                // 等待动画完成后再刷新列表
                setTimeout(() => {
                    loadFileList(currentPath);
                }, 300);
            } else {
                showToast(`删除失败: ${data.message}`, 'error');
                if (targetItem) targetItem.classList.remove('removing');
            }
        })
        .catch(error => {
            console.error('Error:', error);
            showToast(`删除失败: ${error.message}`, 'error');
            if (targetItem) targetItem.classList.remove('removing');
        });
    }

    // 加载文件列表函数
    function loadFileList(path = '') {
        const fileContainer = document.getElementById('fileContainer');
        fileContainer.innerHTML = '<div class="loading">加载中...</div>';
        
        console.log('Fetching files from path:', path);
        
        fetch(`/api/files?path=${path}`)
            .then(response => {
                console.log('Response status:', response.status);
                if (!response.ok) {
                    throw new Error(`网络请求失败: ${response.status}`);
                }
                return response.json();
            })
            .then(data => {
                console.log('Received data:', data);
                fileContainer.innerHTML = ''; // 清空容器
                
                if (data.success) {
                    if (data.files.length === 0) {
                        fileContainer.innerHTML = '<div class="empty-folder">此文件夹为空</div>';
                    } else {
                        data.files.forEach(file => addFileToList(file));
                    }
                } else {
                    fileContainer.innerHTML = `<div class="error">获取文件列表失败: ${data.message}</div>`;
                    showToast(`获取文件列表失败: ${data.message}`, 'error');
                }
            })
            .catch(error => {
                console.error('Error fetching files:', error);
                fileContainer.innerHTML = `<div class="error">获取文件列表失败: ${error.message}</div>`;
                showToast(`获取文件列表失败: ${error.message}`, 'error');
            });
    }

    // 页面加载时获取文件列表
    loadFileList();

    // 文件夹点击事件处理
    document.addEventListener('click', function(e) {
        const fileItem = e.target.closest('.file-item');
        if (fileItem) {
            const fileName = fileItem.querySelector('.file-name').textContent.trim();
            const isFolder = fileItem.querySelector('.file-icon i').classList.contains('fa-folder');
            
            if (isFolder) {
                // 获取当前路径
                const currentPath = document.querySelector('.breadcrumb').getAttribute('data-path') || '';
                const newPath = currentPath ? `${currentPath}/${fileName}` : fileName;
                
                // 更新面包屑导航
                updateBreadcrumb(newPath);
                
                // 加载新文件夹的内容
                loadFileList(newPath);
            }
        }
    });

    // 更新面包屑导航
    function updateBreadcrumb(path) {
        const breadcrumb = document.querySelector('.breadcrumb');
        breadcrumb.setAttribute('data-path', path);
        
        // 清除旧的路径项
        const homeLink = breadcrumb.querySelector('.home');
        breadcrumb.innerHTML = '';
        breadcrumb.appendChild(homeLink);
        
        if (path) {
            const parts = path.split('/');
            let currentPath = '';
            
            parts.forEach((part, index) => {
                currentPath += (index === 0 ? part : '/' + part);
                
                const separator = document.createElement('span');
                separator.textContent = '/';
                breadcrumb.appendChild(separator);
                
                const link = document.createElement('a');
                link.textContent = part;
                link.href = '#';
                link.setAttribute('data-path', currentPath);
                breadcrumb.appendChild(link);
            });
        }
    }

    // 面包屑导航点击事件
    document.querySelector('.breadcrumb').addEventListener('click', function(e) {
        e.preventDefault();
        
        if (e.target.tagName === 'A') {
            const path = e.target.getAttribute('data-path') || '';
            
            // 主目录特殊处理
            if (e.target.classList.contains('home')) {
                updateBreadcrumb('');
                loadFileList('');
            } else if (path) {
                updateBreadcrumb(path);
                loadFileList(path);
            }
        }
    });

    // 添加 CSS 样式
    const style = document.createElement('style');
    style.textContent = `
        .loading, .empty-folder, .error {
            padding: 20px;
            text-align: center;
            color: var(--secondary-text);
        }
        
        .error {
            color: #ff4444;
        }
        
        .file-container.highlight {
            border: 2px dashed var(--primary-color);
            background-color: rgba(26, 115, 232, 0.05);
        }
        
        .fullscreen-drag-indicator {
            display: none;
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background-color: rgba(26, 115, 232, 0.1);
            z-index: 9999;
            align-items: center;
            justify-content: center;
        }
        
        .fullscreen-drag-indicator.active {
            display: flex;
        }
        
        .drag-message-content {
            text-align: center;
            padding: 30px 50px;
            background-color: rgba(255, 255, 255, 0.9);
            border-radius: 12px;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
        }
        
        .drag-message-content i {
            color: var(--primary-color);
            margin-bottom: 16px;
        }
        
        .drag-message-content p {
            font-size: 20px;
            font-weight: bold;
            color: var(--text-color);
        }
        
        .upload-status {
            padding: 15px;
            margin: 10px 0;
            background-color: #f5f5f5;
            border-radius: 4px;
        }
        
        .progress-bar {
            height: 4px;
            background-color: #e0e0e0;
            border-radius: 2px;
            margin-top: 8px;
        }
        
        .progress {
            height: 100%;
            background-color: var(--primary-color);
            border-radius: 2px;
            width: 0%;
            animation: progress 2s ease infinite;
        }
        
        @keyframes progress {
            0% { width: 0%; }
            50% { width: 100%; }
            100% { width: 0%; }
        }
    `;
    document.head.appendChild(style);
}); 