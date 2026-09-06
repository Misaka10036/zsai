/**
 * VIVARILY · 文件管理JS逻辑
 * 版本: 2.0 (支持文件夹上传、链接到知识库)
 */

var currentParentId = null;
var currentPath = [];
var selectedFiles = [];
var allFiles = [];
var renameTargetId = null;
var currentPage = 1;
var totalPages = 1;
var uploadMode = 'file';
var pendingUploadFiles = [];
var linkTargetFiles = [];
var selectedDatasetId = null;

document.addEventListener('DOMContentLoaded', function() {
    loadFolderTree();
    loadFiles();

    var dropZone = document.getElementById('fileListWrap');
    if (dropZone) {
        dropZone.addEventListener('dragover', function(e) {
            e.preventDefault();
            this.classList.add('dragover');
        });
        dropZone.addEventListener('dragleave', function(e) {
            e.preventDefault();
            this.classList.remove('dragover');
        });
        dropZone.addEventListener('drop', function(e) {
            e.preventDefault();
            this.classList.remove('dragover');
            var items = e.dataTransfer.items;
            if (items) {
                handleDropItems(items);
            }
        });
    }

    // 点击其他地方取消选中
    document.addEventListener('click', function(e) {
        if (!e.target.closest('.file-item') && !e.target.closest('.file-actions')) {
            // 不取消选中，保持复选框控制
        }
    });
});

// ===== 上传模式切换 =====
function setUploadMode(mode) {
    uploadMode = mode;
    document.getElementById('uploadModeFile').classList.toggle('active', mode === 'file');
    document.getElementById('uploadModeFolder').classList.toggle('active', mode === 'folder');
}

function triggerUpload() {
    if (uploadMode === 'file') {
        document.getElementById('uploadFileInput').click();
    } else {
        document.getElementById('uploadFolderInput').click();
    }
}

// ===== 处理文件选择 =====
function handleFileSelect(files) {
    if (!files || files.length === 0) return;
    pendingUploadFiles = [];
    for (var i = 0; i < files.length; i++) {
        pendingUploadFiles.push({
            file: files[i],
            relativePath: files[i].name,
            type: 'file'
        });
    }
    showUploadProgress();
    startUpload();
}

function handleFolderSelect(files) {
    if (!files || files.length === 0) return;
    pendingUploadFiles = [];
    for (var i = 0; i < files.length; i++) {
        var file = files[i];
        var relativePath = file.webkitRelativePath || file.name;
        pendingUploadFiles.push({
            file: file,
            relativePath: relativePath,
            type: 'folder'
        });
    }
    showUploadProgress();
    startUpload();
}

function handleDropItems(items) {
    pendingUploadFiles = [];
    var entries = [];
    for (var i = 0; i < items.length; i++) {
        var item = items[i];
        if (item.webkitGetAsEntry) {
            entries.push(item.webkitGetAsEntry());
        } else if (item.getAsEntry) {
            entries.push(item.getAsEntry());
        }
    }

    if (entries.length > 0) {
        traverseEntries(entries, '');
        setTimeout(function() {
            if (pendingUploadFiles.length > 0) {
                showUploadProgress();
                startUpload();
            } else {
                alert('没有找到可上传的文件');
            }
        }, 500);
    }
}

function traverseEntries(entries, basePath) {
    basePath = basePath || '';
    for (var i = 0; i < entries.length; i++) {
        var entry = entries[i];
        if (entry.isFile) {
            entry.file(function(file) {
                var path = basePath ? basePath + '/' + file.name : file.name;
                pendingUploadFiles.push({
                    file: file,
                    relativePath: path,
                    type: 'folder'
                });
            });
        } else if (entry.isDirectory) {
            var reader = entry.createReader();
            reader.readEntries(function(subEntries) {
                var newPath = basePath ? basePath + '/' + entry.name : entry.name;
                traverseEntries(subEntries, newPath);
            });
        }
    }
}

// ===== 上传进度对话框 =====
function showUploadProgress() {
    var overlay = document.getElementById('uploadProgressOverlay');
    var bar = document.getElementById('uploadProgressBarMain');
    overlay.style.display = 'flex';
    bar.style.width = '0%';
    document.getElementById('uploadStatusText').textContent = '准备上传...';
    document.getElementById('uploadPercentText').textContent = '0%';
    document.getElementById('uploadFileList').innerHTML = '<div class="text-muted small text-center py-2">准备上传...</div>';
    document.getElementById('btnUploadConfirm').style.display = 'none';
}

function closeUploadProgress() {
    document.getElementById('uploadProgressOverlay').style.display = 'none';
    pendingUploadFiles = [];
}

function confirmUpload() {
    closeUploadProgress();
    refreshFiles();
    loadFolderTree();
}

// ===== 开始上传 =====
function startUpload() {
    if (pendingUploadFiles.length === 0) {
        alert('没有文件需要上传');
        return;
    }

    var bar = document.getElementById('uploadProgressBarMain');
    var statusText = document.getElementById('uploadStatusText');
    var percentText = document.getElementById('uploadPercentText');
    var fileListEl = document.getElementById('uploadFileList');
    var btnConfirm = document.getElementById('btnUploadConfirm');

    bar.style.width = '0%';
    statusText.textContent = '准备上传...';
    percentText.textContent = '0%';
    fileListEl.innerHTML = '';
    btnConfirm.style.display = 'none';

    var total = pendingUploadFiles.length;
    var completed = 0;
    var failed = 0;
    var successList = [];
    var failList = [];

    // 显示文件列表
    var listHtml = '';
    var showCount = Math.min(total, 100);
    for (var i = 0; i < showCount; i++) {
        var item = pendingUploadFiles[i];
        var displayName = item.relativePath.length > 40 ? '...' + item.relativePath.slice(-37) : item.relativePath;
        listHtml += '<div class="file-item-row" data-index="' + i + '">' +
            '<span class="name" title="' + escapeHtml(item.relativePath) + '">' + escapeHtml(displayName) + '</span>' +
            '<span class="status pending"><i class="fas fa-circle"></i> 等待</span>' +
            '</div>';
    }
    if (total > 100) {
        listHtml += '<div class="file-item-row"><span class="name text-muted">...还有 ' + (total - 100) + ' 个文件</span></div>';
    }
    fileListEl.innerHTML = listHtml;

    function updateFileStatus(index, status, text) {
        var rows = fileListEl.querySelectorAll('.file-item-row');
        if (rows && rows[index]) {
            var statusEl = rows[index].querySelector('.status');
            if (statusEl) {
                statusEl.className = 'status ' + status;
                statusEl.innerHTML = text;
            }
        }
    }

    function uploadNext(index) {
        if (index >= pendingUploadFiles.length) {
            var msg = '上传完成！成功 ' + successList.length + ' 个文件';
            if (failed > 0) {
                msg += '，失败 ' + failed + ' 个';
            }
            statusText.textContent = msg;
            bar.style.width = '100%';
            percentText.textContent = '100%';
            if (failed === 0) {
                btnConfirm.style.display = 'inline-block';
                btnConfirm.textContent = '✅ 完成，关闭';
            } else {
                btnConfirm.style.display = 'inline-block';
                btnConfirm.textContent = '⚠️ 部分失败，关闭';
                // 显示失败详情
                var failHtml = '';
                for (var f = 0; f < failList.length; f++) {
                    failHtml += '<div class="file-item-row"><span class="name text-danger">' + escapeHtml(failList[f]) + '</span><span class="status fail"><i class="fas fa-times"></i> 失败</span></div>';
                }
                fileListEl.innerHTML += failHtml;
            }
            return;
        }

        var item = pendingUploadFiles[index];
        var file = item.file;
        var relativePath = item.relativePath;

        var progress = Math.round((index / total) * 100);
        bar.style.width = progress + '%';
        percentText.textContent = progress + '%';
        statusText.textContent = '正在上传: ' + (relativePath.length > 50 ? '...' + relativePath.slice(-47) : relativePath);

        updateFileStatus(index, 'uploading', '<i class="fas fa-spinner fa-spin"></i> 上传中...');

        var pathParts = relativePath.split('/');
        var fileName = pathParts.pop();
        var folderPath = pathParts.join('/');

        var formData = new FormData();
        formData.append('files[]', file);

        function doUpload(targetParentId) {
            if (targetParentId !== null && targetParentId !== undefined) {
                formData.append('parent_id', targetParentId);
            } else if (currentParentId !== null && currentParentId !== '') {
                formData.append('parent_id', currentParentId);
            }

            fetch('/api.php?action=files_upload', {
                method: 'POST',
                body: formData
            })
            .then(function(r) { return r.json(); })
            .then(function(res) {
                completed++;
                if (res.code === 0) {
                    updateFileStatus(index, 'success', '<i class="fas fa-check-circle"></i> 成功');
                    successList.push(relativePath);
                } else {
                    updateFileStatus(index, 'fail', '<i class="fas fa-times-circle"></i> ' + (res.message || '失败'));
                    failed++;
                    failList.push(relativePath + ': ' + (res.message || '未知错误'));
                }
                uploadNext(index + 1);
            })
            .catch(function(e) {
                completed++;
                failed++;
                failList.push(relativePath + ': ' + e.message);
                updateFileStatus(index, 'fail', '<i class="fas fa-times-circle"></i> 网络错误');
                uploadNext(index + 1);
            });
        }

        if (folderPath) {
            createFolderPath(folderPath, function(targetParentId) {
                doUpload(targetParentId);
            });
        } else {
            doUpload(null);
        }
    }

    function createFolderPath(folderPath, callback) {
        var parts = folderPath.split('/').filter(function(p) { return p !== ''; });
        var currentParent = currentParentId;

        function createNext(partsIndex) {
            if (partsIndex >= parts.length) {
                callback(currentParent);
                return;
            }
            var folderName = parts[partsIndex];
            var payload = { name: folderName };
            if (currentParent !== null && currentParent !== '') {
                payload.parent_id = currentParent;
            }

            fetch('/api.php?action=files_create_folder', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            })
            .then(function(r) { return r.json(); })
            .then(function(res) {
                if (res.code === 0 && res.data && res.data.id) {
                    currentParent = res.data.id;
                    createNext(partsIndex + 1);
                } else {
                    findOrCreateFolder(folderName, currentParent, function(foundId) {
                        if (foundId) {
                            currentParent = foundId;
                            createNext(partsIndex + 1);
                        } else {
                            callback(null);
                        }
                    });
                }
            })
            .catch(function() {
                findOrCreateFolder(folderName, currentParent, function(foundId) {
                    if (foundId) {
                        currentParent = foundId;
                        createNext(partsIndex + 1);
                    } else {
                        callback(null);
                    }
                });
            });
        }

        createNext(0);
    }

    function findOrCreateFolder(folderName, parentId, callback) {
        var url = '/api.php?action=files_list&page=1&page_size=100';
        if (parentId !== null && parentId !== '') {
            url += '&parent_id=' + encodeURIComponent(parentId);
        }

        fetch(url)
        .then(function(r) { return r.json(); })
        .then(function(res) {
            if (res.code === 0) {
                var files = res.data?.files || [];
                var found = null;
                for (var i = 0; i < files.length; i++) {
                    if (files[i].type === 'folder' && files[i].name === folderName) {
                        found = files[i];
                        break;
                    }
                }
                if (found) {
                    callback(found.id);
                    return;
                }
            }
            var payload = { name: folderName };
            if (parentId !== null && parentId !== '') {
                payload.parent_id = parentId;
            }
            fetch('/api.php?action=files_create_folder', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            })
            .then(function(r) { return r.json(); })
            .then(function(res) {
                if (res.code === 0 && res.data && res.data.id) {
                    callback(res.data.id);
                } else {
                    callback(null);
                }
            })
            .catch(function() { callback(null); });
        })
        .catch(function() { callback(null); });
    }

    uploadNext(0);
}

// ===== 加载文件夹树 =====
function loadFolderTree() {
    var container = document.getElementById('folderTree');
    container.innerHTML = '<div class="text-center text-muted py-3 small"><i class="fas fa-spinner fa-spin me-1"></i>加载中...</div>';

    fetch('/api.php?action=files_list&page=1&page_size=100')
        .then(function(r) { return r.json(); })
        .then(function(res) {
            if (res.code === 0) {
                var files = res.data?.files || [];
                var folders = files.filter(function(f) { return f.type === 'folder'; });
                renderFolderTree(folders);
            } else {
                container.innerHTML = '<div class="text-center text-muted py-3 small">加载失败</div>';
            }
        })
        .catch(function() {
            container.innerHTML = '<div class="text-center text-muted py-3 small">加载失败</div>';
        });
}

function renderFolderTree(folders) {
    var container = document.getElementById('folderTree');
    var html = '';

    html += '<div class="folder-item' + (currentParentId === null ? ' active' : '') + '" onclick="navigateToFolder(null)">';
    html += '  <span class="icon"><i class="fas fa-home"></i></span>';
    html += '  <span class="name">根目录</span>';
    html += '</div>';

    if (folders.length === 0) {
        container.innerHTML = html + '<div class="text-center text-muted py-2 small">暂无文件夹</div>';
        return;
    }

    for (var i = 0; i < folders.length; i++) {
        var f = folders[i];
        var isActive = f.id === currentParentId;
        html += '<div class="folder-item' + (isActive ? ' active' : '') + '" onclick="navigateToFolder(\'' + f.id + '\')">';
        html += '  <span class="icon"><i class="fas fa-folder"></i></span>';
        html += '  <span class="name">' + escapeHtml(f.name) + '</span>';
        html += '  <span class="folder-actions">';
        html += '    <button onclick="event.stopPropagation();showRenameModal(\'' + f.id + '\', \'' + escapeJsString(f.name) + '\')" title="重命名"><i class="fas fa-edit"></i></button>';
        html += '    <button class="danger" onclick="event.stopPropagation();deleteFile(\'' + f.id + '\')" title="删除"><i class="fas fa-trash"></i></button>';
        html += '  </span>';
        html += '</div>';
    }
    container.innerHTML = html;
}

// ===== 加载文件列表 =====
function loadFiles(parentId, keywords, page) {
    parentId = parentId || currentParentId;
    keywords = keywords || '';
    page = page || 1;
    currentPage = page;

    var grid = document.getElementById('fileGrid');
    grid.innerHTML = '<div class="text-center text-muted py-5"><i class="fas fa-spinner fa-spin me-2"></i>加载中...</div>';

    var url = '/api.php?action=files_list&page=' + page + '&page_size=100';
    if (parentId !== null && parentId !== '') {
        url += '&parent_id=' + encodeURIComponent(parentId);
    }
    if (keywords) {
        url += '&keywords=' + encodeURIComponent(keywords);
    }

    fetch(url)
        .then(function(r) { return r.json(); })
        .then(function(res) {
            if (res.code === 0) {
                allFiles = res.data?.files || [];
                var total = res.data?.total || allFiles.length;
                totalPages = Math.ceil(total / 100);
                renderFiles(allFiles);
                renderPagination(total, page);
                updateBreadcrumb(res.data?.parent_folder);
            } else {
                grid.innerHTML = '<div class="text-center text-muted py-5">加载失败: ' + escapeHtml(res.message || '') + '</div>';
            }
        })
        .catch(function(e) {
            grid.innerHTML = '<div class="text-center text-muted py-5">加载失败: ' + escapeHtml(e.message) + '</div>';
        });
}

function renderFiles(files) {
    var grid = document.getElementById('fileGrid');
    if (files.length === 0) {
        grid.innerHTML = '<div class="file-empty"><i class="fas fa-folder-open"></i><div>此文件夹为空</div><div class="small text-muted">点击上方"上传"按钮添加文件</div></div>';
        return;
    }

    var html = '';
    for (var i = 0; i < files.length; i++) {
        var f = files[i];
        var isFolder = f.type === 'folder';
        var iconClass = isFolder ? 'folder fas fa-folder' : getFileIconClass(f.name);
        var sizeText = isFolder ? '' : formatBytes(f.size || 0);
        var isSelected = selectedFiles.indexOf(f.id) !== -1;

        html += '<div class="file-item" data-id="' + escapeHtml(f.id) + '" onclick="handleFileClick(\'' + f.id + '\', \'' + isFolder + '\')">';
        html += '  <input type="checkbox" class="file-checkbox" ' + (isSelected ? 'checked' : '') + ' onclick="event.stopPropagation();toggleFileSelection(\'' + f.id + '\')">';
        html += '  <div class="file-actions">';
        html += '    <button onclick="event.stopPropagation();showRenameModal(\'' + f.id + '\', \'' + escapeJsString(f.name) + '\')" title="重命名"><i class="fas fa-edit"></i></button>';
        if (isFolder) {
            html += '    <button class="success" onclick="event.stopPropagation();showLinkToDataset([\'' + f.id + '\'])" title="链接到知识库"><i class="fas fa-link"></i></button>';
        } else {
            html += '    <button class="success" onclick="event.stopPropagation();showLinkToDataset([\'' + f.id + '\'])" title="链接到知识库"><i class="fas fa-link"></i></button>';
        }
        html += '    <button class="danger" onclick="event.stopPropagation();deleteFile(\'' + f.id + '\')" title="删除"><i class="fas fa-trash"></i></button>';
        html += '  </div>';
        html += '  <span class="file-icon ' + iconClass + '"></span>';
        html += '  <div class="file-name" title="' + escapeHtml(f.name) + '">' + escapeHtml(f.name) + '</div>';
        if (!isFolder) {
            html += '  <div class="file-size">' + sizeText + '</div>';
        }
        html += '</div>';
    }
    grid.innerHTML = html;
    updateSelectedCount();
}

function getFileIconClass(filename) {
    if (!filename) return 'fas fa-file';
    var ext = filename.split('.').pop().toLowerCase();
    var map = {
        'pdf': 'pdf fas fa-file-pdf',
        'doc': 'doc fas fa-file-word',
        'docx': 'docx fas fa-file-word',
        'txt': 'txt fas fa-file-alt',
        'md': 'md fas fa-file-alt',
        'xls': 'xls fas fa-file-excel',
        'xlsx': 'xlsx fas fa-file-excel',
        'ppt': 'ppt fas fa-file-powerpoint',
        'pptx': 'pptx fas fa-file-powerpoint',
        'jpg': 'image fas fa-file-image',
        'jpeg': 'image fas fa-file-image',
        'png': 'image fas fa-file-image',
        'gif': 'image fas fa-file-image',
        'webp': 'image fas fa-file-image',
        'zip': 'zip fas fa-file-archive',
        'rar': 'zip fas fa-file-archive',
        '7z': 'zip fas fa-file-archive'
    };
    return map[ext] || 'fas fa-file';
}

// ===== 文件选择 =====
function toggleFileSelection(id) {
    var index = selectedFiles.indexOf(id);
    if (index === -1) {
        selectedFiles.push(id);
    } else {
        selectedFiles.splice(index, 1);
    }
    updateSelectedCount();
    // 更新复选框状态
    var checkboxes = document.querySelectorAll('.file-checkbox');
    for (var i = 0; i < checkboxes.length; i++) {
        var cb = checkboxes[i];
        var fileId = cb.closest('.file-item').getAttribute('data-id');
        cb.checked = selectedFiles.indexOf(fileId) !== -1;
    }
}

function updateSelectedCount() {
    var countEl = document.getElementById('selectedCount');
    var btnDelete = document.getElementById('btnDeleteSelected');
    if (selectedFiles.length > 0) {
        countEl.textContent = '已选 ' + selectedFiles.length + ' 项';
        btnDelete.style.display = 'inline-block';
    } else {
        countEl.textContent = '';
        btnDelete.style.display = 'none';
    }
}

// ===== 分页 =====
function renderPagination(total, page) {
    var container = document.getElementById('paginationContainer');
    var infoEl = document.getElementById('paginationInfo');

    if (infoEl) infoEl.textContent = '共 ' + total + ' 项';

    if (totalPages <= 1) {
        container.innerHTML = '';
        return;
    }

    var html = '';
    var startPage = Math.max(1, page - 2);
    var endPage = Math.min(totalPages, page + 2);

    if (page > 1) {
        html += '<span class="page-item" onclick="loadFiles(null, \'\', ' + (page - 1) + ')"><i class="fas fa-chevron-left"></i></span>';
    }

    for (var i = startPage; i <= endPage; i++) {
        html += '<span class="page-item' + (i === page ? ' active' : '') + '" onclick="loadFiles(null, \'\', ' + i + ')">' + i + '</span>';
    }

    if (page < totalPages) {
        html += '<span class="page-item" onclick="loadFiles(null, \'\', ' + (page + 1) + ')"><i class="fas fa-chevron-right"></i></span>';
    }

    container.innerHTML = html;
}

// ===== 导航 =====
function navigateToFolder(folderId) {
    currentParentId = folderId;
    selectedFiles = [];
    updateSelectedCount();
    currentPage = 1;
    loadFiles(folderId);
    loadFolderTree();
}

function navigateToRoot() {
    navigateToFolder(null);
}

function updateBreadcrumb(parentFolder) {
    var nav = document.getElementById('breadcrumbNav');
    var html = '<span class="crumb" onclick="navigateToRoot()"><i class="fas fa-home me-1"></i>根目录</span>';
    if (parentFolder && parentFolder.id) {
        html += '<span class="sep"> / </span>';
        html += '<span class="crumb current">' + escapeHtml(parentFolder.name) + '</span>';
    }
    nav.innerHTML = html;
}

// ===== 文件点击 =====
function handleFileClick(id, isFolder) {
    if (isFolder === 'true' || isFolder === true) {
        navigateToFolder(id);
    } else {
        window.open('/api.php?action=files_download&file_id=' + encodeURIComponent(id), '_blank');
    }
}

// ===== 刷新 =====
function refreshFiles() {
    var searchVal = document.getElementById('fileSearchInput').value;
    loadFiles(currentParentId, searchVal, currentPage);
    loadFolderTree();
}

// ===== 搜索 =====
function searchFiles(keywords) {
    currentPage = 1;
    loadFiles(currentParentId, keywords, 1);
}

// ===== 创建文件夹 =====
function showCreateFolderModal() {
    document.getElementById('newFolderName').value = '';
    var modal = new bootstrap.Modal(document.getElementById('createFolderModal'));
    modal.show();
}

function confirmCreateFolder() {
    var name = document.getElementById('newFolderName').value.trim();
    if (!name) {
        alert('请输入文件夹名称');
        return;
    }

    var payload = { name: name };
    if (currentParentId !== null && currentParentId !== '') {
        payload.parent_id = currentParentId;
    }

    fetch('/api.php?action=files_create_folder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    })
    .then(function(r) { return r.json(); })
    .then(function(res) {
        if (res.code === 0) {
            var modal = bootstrap.Modal.getInstance(document.getElementById('createFolderModal'));
            if (modal) modal.hide();
            refreshFiles();
        } else {
            alert('创建失败: ' + (res.message || '未知错误'));
        }
    })
    .catch(function(e) {
        alert('创建失败: ' + e.message);
    });
}

// ===== 重命名 =====
function showRenameModal(id, name) {
    renameTargetId = id;
    document.getElementById('renameInput').value = name;
    var modal = new bootstrap.Modal(document.getElementById('renameModal'));
    modal.show();
}

function confirmRename() {
    var newName = document.getElementById('renameInput').value.trim();
    if (!newName) {
        alert('请输入新名称');
        return;
    }

    fetch('/api.php?action=files_move', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            src_file_ids: [renameTargetId],
            new_name: newName
        })
    })
    .then(function(r) { return r.json(); })
    .then(function(res) {
        if (res.code === 0) {
            var modal = bootstrap.Modal.getInstance(document.getElementById('renameModal'));
            if (modal) modal.hide();
            refreshFiles();
        } else {
            alert('重命名失败: ' + (res.message || '未知错误'));
        }
    })
    .catch(function(e) {
        alert('重命名失败: ' + e.message);
    });
}

// ===== 删除文件 =====
function deleteFile(id) {
    if (!confirm('确定要删除该文件/文件夹吗？此操作不可恢复！')) return;

    fetch('/api.php?action=files_delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file_ids: [id] })
    })
    .then(function(r) { return r.json(); })
    .then(function(res) {
        if (res.code === 0) {
            refreshFiles();
        } else {
            alert('删除失败: ' + (res.message || '未知错误'));
        }
    })
    .catch(function(e) {
        alert('删除失败: ' + e.message);
    });
}

function deleteSelected() {
    if (selectedFiles.length === 0) return;
    if (!confirm('确定要删除选中的 ' + selectedFiles.length + ' 个文件/文件夹吗？此操作不可恢复！')) return;

    fetch('/api.php?action=files_delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file_ids: selectedFiles })
    })
    .then(function(r) { return r.json(); })
    .then(function(res) {
        if (res.code === 0) {
            selectedFiles = [];
            updateSelectedCount();
            refreshFiles();
        } else {
            alert('删除失败: ' + (res.message || '未知错误'));
        }
    })
    .catch(function(e) {
        alert('删除失败: ' + e.message);
    });
}

// ===== 链接到知识库 =====
function showLinkToDataset(fileIds) {
    linkTargetFiles = fileIds || selectedFiles;
    if (linkTargetFiles.length === 0) {
        alert('请至少选择一个文件或文件夹');
        return;
    }

    selectedDatasetId = null;
    var modal = new bootstrap.Modal(document.getElementById('linkDatasetModal'));
    modal.show();

    // 加载知识库列表
    var listEl = document.getElementById('datasetListForLink');
    listEl.innerHTML = '<div class="text-center text-muted py-3 small"><i class="fas fa-spinner fa-spin me-1"></i>加载知识库...</div>';

    fetch('/api.php?action=dataset_list&page=1&page_size=50')
        .then(function(r) { return r.json(); })
        .then(function(res) {
            var datasets = res.data?.datasets || res.data?.list || (Array.isArray(res.data) ? res.data : []);
            if (datasets.length === 0) {
                listEl.innerHTML = '<div class="text-center text-muted py-3 small">暂无可用知识库，请先创建知识库</div>';
                return;
            }

            var html = '';
            for (var i = 0; i < datasets.length; i++) {
                var ds = datasets[i];
                var docCount = ds.document_count || 0;
                html += '<div class="dataset-item" onclick="selectDatasetForLink(\'' + ds.id + '\', this)" data-id="' + escapeHtml(ds.id) + '">';
                html += '  <span class="check"><i class="fas fa-check-circle"></i></span>';
                html += '  <span class="name">' + escapeHtml(ds.name) + '</span>';
                html += '  <span class="doc-count">' + docCount + ' 文档</span>';
                html += '</div>';
            }
            listEl.innerHTML = html;
        })
        .catch(function() {
            listEl.innerHTML = '<div class="text-center text-muted py-3 small">加载知识库失败</div>';
        });
}

function selectDatasetForLink(id, el) {
    selectedDatasetId = id;
    var items = document.querySelectorAll('#datasetListForLink .dataset-item');
    for (var i = 0; i < items.length; i++) {
        items[i].classList.toggle('selected', items[i].getAttribute('data-id') === id);
    }
}

function confirmLinkToDataset() {
    if (!selectedDatasetId) {
        alert('请选择一个目标知识库');
        return;
    }
    if (linkTargetFiles.length === 0) {
        alert('没有可链接的文件');
        return;
    }

    var btn = document.getElementById('btnConfirmLink');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i>链接中...';

    fetch('/api.php?action=files_link_to_dataset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            file_ids: linkTargetFiles,
            dataset_id: selectedDatasetId
        })
    })
    .then(function(r) { return r.json(); })
    .then(function(res) {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-link me-1"></i>确认链接';
        if (res.code === 0) {
            var modal = bootstrap.Modal.getInstance(document.getElementById('linkDatasetModal'));
            if (modal) modal.hide();
            alert('链接成功！文件/文件夹已导入到知识库，正在后台解析...');
            refreshFiles();
        } else {
            alert('链接失败: ' + (res.message || '未知错误'));
        }
    })
    .catch(function(e) {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-link me-1"></i>确认链接';
        alert('链接失败: ' + e.message);
    });
}