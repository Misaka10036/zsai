/**
 * VIVARILY · 知识库管理专用逻辑
 * 版本: 3.2 (纯净版，无HTML混入)
 */

var pageSize = 30;
var currentPage = 1;

document.addEventListener('DOMContentLoaded', function() {
    if (typeof fetchDatasets === 'function') {
        fetchDatasets();
    }
});

function selectDataset(id, name) {
    window.currentDataset = { id: id, name: name };
    currentPage = 1;
    
    var fileSection = document.getElementById('fileManagementSection');
    if (fileSection) fileSection.style.display = 'block';

    var cards = document.querySelectorAll('#datasetListContainer .stat-card');
    for (var i = 0; i < cards.length; i++) {
        var card = cards[i];
        var onclickAttr = card.getAttribute('onclick') || '';
        if (onclickAttr.indexOf(id) !== -1) {
            card.classList.add('active');
        } else {
            card.classList.remove('active');
        }
    }

    if (typeof fetchFileList === 'function') {
        fetchFileList(currentPage);
    }
}

document.addEventListener('datasetLoaded', function() {
    if (typeof adjustTableHeight === 'function') {
        setTimeout(adjustTableHeight, 100);
    }
});

function fetchFileList(page) {
    if (!window.currentDataset) return;
    if (page === undefined) page = currentPage || 1;
    currentPage = page;
    var tbody = document.getElementById('fileTableBody');
    if (!tbody) return;

    var runStatus = document.getElementById('filterRunStatus') ? document.getElementById('filterRunStatus').value : '';
    var suffix = document.getElementById('filterSuffix') ? document.getElementById('filterSuffix').value : '';
    var keywords = document.getElementById('filterKeywords') ? document.getElementById('filterKeywords').value.trim() : '';

    var url = '/api.php?action=file_list&dataset_id=' + encodeURIComponent(window.currentDataset.id) + '&page=' + page + '&page_size=' + pageSize;
    if (runStatus) url += '&run=' + encodeURIComponent(runStatus);
    if (suffix) url += '&suffix=' + encodeURIComponent(suffix);
    if (keywords) url += '&keywords=' + encodeURIComponent(keywords);

    tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted py-4"><i class="fas fa-spinner fa-spin me-2"></i>加载中...</td></tr>';

    fetch(url)
        .then(function(r) { return r.json(); })
        .then(function(res) {
            var files = res.data?.docs || res.data?.documents || (Array.isArray(res.data) ? res.data : []);
            var total = res.data?.total || res.data?.total_datasets || files.length;

            if (files.length === 0) {
                tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted py-4">当前知识库暂无文档</td></tr>';
                renderPagination(0, page);
                setTimeout(adjustTableHeight, 50);
                return;
            }

            var rowsHtml = '';
            for (var i = 0; i < files.length; i++) {
                var file = files[i];
                var name = file.name || file.filename || '未命名文件';
                var size = formatBytes(getValidFileSize(file));
                var runStatusText = file.run || file.status || 'UNSTART';
                var chunkNum = file.chunk_count || file.chunk_num || 0;
                var createTime = file.create_time ? new Date(file.create_time).toLocaleString() : (file.create_date || '-');
                var enabled = file.status == 1 || file.status === '1' || file.status === true;
                var isRunning = runStatusText === 'RUNNING' || runStatusText === '1';
                var isDone = runStatusText === 'DONE' || runStatusText === '3';
                var isFail = runStatusText === 'FAIL' || runStatusText === '4';
                var isCancel = runStatusText === 'CANCEL' || runStatusText === '2';

                var statusBadgeClass = 'bg-secondary-subtle text-secondary border';
                var statusText = '未解析';
                if (isRunning) { statusBadgeClass = 'bg-warning-subtle text-warning border'; statusText = '解析中'; }
                else if (isDone) { statusBadgeClass = 'bg-success-subtle text-success border'; statusText = '解析完成'; }
                else if (isFail) { statusBadgeClass = 'bg-danger-subtle text-danger border'; statusText = '解析失败'; }
                else if (isCancel) { statusBadgeClass = 'bg-secondary-subtle text-secondary border'; statusText = '已取消'; }

                var chunkMethod = file.chunk_method || 'naive';
                var parserConfig = file.parser_config || {};
                var chunkTokenNum = parserConfig.chunk_token_num || 128;
                var layoutRecognize = parserConfig.layout_recognize !== false;

                var progressHtml = '';
                if (file.progress !== undefined && file.progress > 0 && isRunning) {
                    progressHtml = ' <span class="parse-progress"><span class="bar" style="width:' + (file.progress * 100) + '%;"></span></span>';
                }

                rowsHtml += '<tr>';
                rowsHtml += '  <td><input type="checkbox" class="file-checkbox" value="' + escapeHtml(file.id) + '"></td>';
                rowsHtml += '  <td class="file-name" title="' + escapeHtml(name) + '">';
                rowsHtml += '    <i class="' + getFileIcon(name) + ' me-1"></i> ' + escapeHtml(name);
                rowsHtml += '  </td>';
                rowsHtml += '  <td>' + size + '</td>';
                rowsHtml += '  <td><span class="badge ' + (enabled ? 'bg-success-subtle text-success border' : 'bg-danger-subtle text-danger border') + ' status-badge">' + (enabled ? '已启用' : '已禁用') + '</span></td>';
                rowsHtml += '  <td><span class="badge ' + statusBadgeClass + ' status-badge">' + statusText + '</span>' + progressHtml + '</td>';
                rowsHtml += '  <td>' + chunkNum + ' 块</td>';
                rowsHtml += '  <td>' + createTime + '</td>';
                rowsHtml += '  <td class="text-nowrap">';
                rowsHtml += '    <a href="javascript:void(0)" class="btn btn-sm btn-outline-primary btn-action-sm me-1" onclick="previewFile(\'' + escapeHtml(window.currentDataset.id) + '\', \'' + escapeHtml(file.id) + '\', \'' + escapeJsString(name) + '\')"><i class="fas fa-eye"></i> 预览</a>';
                rowsHtml += '    <a href="javascript:void(0)" class="btn btn-sm btn-outline-secondary btn-action-sm me-1" onclick="openEditDocument(\'' + escapeHtml(window.currentDataset.id) + '\',\'' + escapeHtml(file.id) + '\',\'' + escapeJsString(name) + '\',\'' + chunkMethod + '\',' + chunkTokenNum + ',' + (layoutRecognize ? 'true' : 'false') + ',' + (enabled ? 1 : 0) + ')"><i class="fas fa-edit"></i> 编辑</a>';
                if (isRunning) {
                    rowsHtml += '    <a href="javascript:void(0)" class="btn btn-sm btn-outline-warning btn-action-sm me-1" onclick="stopParsing(\'' + escapeHtml(file.id) + '\')"><i class="fas fa-stop"></i> 停止</a>';
                }
                rowsHtml += '  </td>';
                rowsHtml += '</tr>';
            }
            tbody.innerHTML = rowsHtml;

            renderPagination(total, page);
            setTimeout(adjustTableHeight, 50);
        })
        .catch(function(err) {
            tbody.innerHTML = '<tr><td colspan="8" class="text-center text-danger">读取文档列表失败: ' + escapeHtml(err.message) + '</td></tr>';
        });
}

function renderPagination(total, page) {
    var container = document.getElementById('paginationContainer');
    var infoEl = document.getElementById('paginationInfo');

    if (infoEl) infoEl.innerText = '共 ' + total + ' 条';
    if (!container) return;

    var totalPages = Math.ceil(total / pageSize);
    if (totalPages <= 1) {
        container.innerHTML = '';
        return;
    }

    page = Math.max(1, Math.min(page, totalPages));
    var html = '<div class="pagination">';

    var prevDisabled = (page === 1) ? 'disabled' : '';
    var prevClick = (page > 1) ? 'onclick="fetchFileList(' + (page - 1) + ')"' : '';
    html += '<span class="page-item prev ' + prevDisabled + '" ' + prevClick + ' title="上一页"><i class="fas fa-chevron-left"></i></span>';

    for (var i = 1; i <= totalPages; i++) {
        if (i === 1 || i === totalPages || (i >= page - 1 && i <= page + 1)) {
            html += '<span class="page-item ' + (i === page ? 'active' : '') + '" onclick="fetchFileList(' + i + ')">' + i + '</span>';
        } else if (i === page - 2 || i === page + 2) {
            html += '<span class="page-ellipsis">...</span>';
        }
    }

    var nextDisabled = (page === totalPages) ? 'disabled' : '';
    var nextClick = (page < totalPages) ? 'onclick="fetchFileList(' + (page + 1) + ')"' : '';
    html += '<span class="page-item next ' + nextDisabled + '" ' + nextClick + ' title="下一页"><i class="fas fa-chevron-right"></i></span></div>';

    container.innerHTML = html;
}

function applyFilters() {
    currentPage = 1;
    fetchFileList(currentPage);
}

function resetFilters() {
    var runStatus = document.getElementById('filterRunStatus');
    var suffix = document.getElementById('filterSuffix');
    var keywords = document.getElementById('filterKeywords');
    if (runStatus) runStatus.value = '';
    if (suffix) suffix.value = '';
    if (keywords) keywords.value = '';
    currentPage = 1;
    fetchFileList(currentPage);
}

function toggleSelectAll() {
    var checked = document.getElementById('selectAllFiles').checked;
    var checkboxes = document.querySelectorAll('#fileTableBody .file-checkbox');
    for (var i = 0; i < checkboxes.length; i++) {
        checkboxes[i].checked = checked;
    }
}

function getSelectedFileIds() {
    var ids = [];
    var checkboxes = document.querySelectorAll('#fileTableBody .file-checkbox:checked');
    for (var i = 0; i < checkboxes.length; i++) {
        ids.push(checkboxes[i].value);
    }
    return ids;
}

function parseSelectedFiles() {
    var ids = getSelectedFileIds();
    if (ids.length === 0) {
        alert('请至少选择一个文件');
        return;
    }
    if (!window.currentDataset) {
        alert('请先选择一个知识库');
        return;
    }
    if (!confirm('确定要解析选中的 ' + ids.length + ' 个文件吗？')) return;

    fetch('/api.php?action=file_parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dataset_id: window.currentDataset.id, document_ids: ids })
    }).then(function(r) { return r.json(); }).then(function(res) {
        if (res.code === 0 || res.code === 200) {
            alert('解析任务已启动！');
            fetchFileList(currentPage);
        } else {
            alert('解析失败: ' + (res.message || '未知错误'));
        }
    }).catch(function(e) {
        alert('请求失败: ' + e.message);
    });
}

function deleteSelectedFiles() {
    var ids = getSelectedFileIds();
    if (ids.length === 0) {
        alert('请至少选择一个文件');
        return;
    }
    if (!window.currentDataset) {
        alert('请先选择一个知识库');
        return;
    }
    if (!confirm('确定要删除选中的 ' + ids.length + ' 个文件吗？此操作不可恢复！')) return;

    fetch('/api.php?action=file_delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dataset_id: window.currentDataset.id, document_ids: ids })
    }).then(function(r) { return r.json(); }).then(function(res) {
        if (res.code === 0 || res.code === 200) {
            alert('删除成功！');
            fetchFileList(currentPage);
        } else {
            alert('删除失败: ' + (res.message || '未知错误'));
        }
    }).catch(function(e) {
        alert('请求失败: ' + e.message);
    });
}

function stopParsing(docId) {
    if (!confirm('确定要停止解析该文件吗？')) return;
    if (!window.currentDataset) return;
    
    fetch('/api.php?action=file_stop_parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dataset_id: window.currentDataset.id, document_ids: [docId] })
    }).then(function(r) { return r.json(); }).then(function(res) {
        if (res.code === 0 || res.code === 200) {
            alert('已停止解析！');
            fetchFileList(currentPage);
        } else {
            alert('操作失败: ' + (res.message || '未知错误'));
        }
    }).catch(function(e) {
        alert('请求失败: ' + e.message);
    });
}

function openEditDocument(datasetId, docId, docName, chunkMethod, chunkTokenNum, layoutRecognize, enabled) {
    var nameInput = document.getElementById('editDocName');
    var methodSelect = document.getElementById('editChunkMethod');
    var tokenInput = document.getElementById('editChunkTokenNum');
    var layoutSelect = document.getElementById('editLayoutRecognize');
    var enabledSelect = document.getElementById('editEnabled');
    var datasetIdInput = document.getElementById('editDocDatasetId');
    var docIdInput = document.getElementById('editDocId');
    
    if (datasetIdInput) datasetIdInput.value = datasetId;
    if (docIdInput) docIdInput.value = docId;
    if (nameInput) nameInput.value = docName || '';
    if (methodSelect) methodSelect.value = chunkMethod || 'naive';
    if (tokenInput) tokenInput.value = chunkTokenNum || 128;
    if (layoutSelect) layoutSelect.value = layoutRecognize !== false ? 'true' : 'false';
    if (enabledSelect) enabledSelect.value = enabled == 1 ? '1' : '0';
    
    var modalEl = document.getElementById('editDocumentModal');
    if (modalEl) {
        var modal = new bootstrap.Modal(modalEl);
        modal.show();
    }
}

function editDataset(datasetId, name, description) {
    var newName = prompt('请输入新的知识库名称:', name);
    if (!newName || newName.trim() === '') return;
    var newDesc = prompt('请输入新的描述:', description || '');
    
    fetch('/api.php?action=dataset_update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dataset_id: datasetId, name: newName.trim(), description: newDesc || '' })
    }).then(function(r) { return r.json(); }).then(function(res) {
        if (res.code === 0 || res.code === 200) {
            alert('知识库更新成功！');
            fetchDatasets();
        } else {
            alert('更新失败: ' + (res.message || '未知错误'));
        }
    }).catch(function(e) {
        alert('请求失败: ' + e.message);
    });
}

function deleteDataset(datasetId, name) {
    if (!confirm('确定要删除知识库 "' + name + '" 吗？此操作将删除所有文件且不可恢复！')) return;
    
    fetch('/api.php?action=dataset_delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dataset_id: datasetId })
    }).then(function(r) { return r.json(); }).then(function(res) {
        if (res.code === 0 || res.code === 200) {
            alert('知识库删除成功！');
            window.currentDataset = null;
            var fileSection = document.getElementById('fileManagementSection');
            if (fileSection) fileSection.style.display = 'none';
            fetchDatasets();
        } else {
            alert('删除失败: ' + (res.message || '未知错误'));
        }
    }).catch(function(e) {
        alert('请求失败: ' + e.message);
    });
}

document.addEventListener('DOMContentLoaded', function() {
    var btnConfirmEdit = document.getElementById('btnConfirmEdit');
    if (btnConfirmEdit) {
        btnConfirmEdit.addEventListener('click', function() {
            var datasetId = document.getElementById('editDocDatasetId').value;
            var docId = document.getElementById('editDocId').value;
            var name = document.getElementById('editDocName').value.trim();
            var chunkMethod = document.getElementById('editChunkMethod').value;
            var chunkTokenNum = parseInt(document.getElementById('editChunkTokenNum').value) || 128;
            var layoutRecognize = document.getElementById('editLayoutRecognize').value === 'true';
            var enabled = parseInt(document.getElementById('editEnabled').value);

            if (!name) {
                alert('文档名称不能为空');
                return;
            }

            var payload = {
                dataset_id: datasetId,
                document_id: docId,
                name: name,
                chunk_method: chunkMethod,
                parser_config: {
                    chunk_token_num: chunkTokenNum,
                    layout_recognize: layoutRecognize
                },
                enabled: enabled
            };

            fetch('/api.php?action=file_update', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            }).then(function(r) { return r.json(); }).then(function(res) {
                if (res.code === 0 || res.code === 200) {
                    alert('文档更新成功！');
                    var modal = bootstrap.Modal.getInstance(document.getElementById('editDocumentModal'));
                    if (modal) modal.hide();
                    fetchFileList(currentPage);
                } else {
                    alert('更新失败: ' + (res.message || '未知错误'));
                }
            }).catch(function(e) {
                alert('请求失败: ' + e.message);
            });
        });
    }

    // 文件上传相关
    var uploadZone = document.getElementById('uploadZone');
    var fileInput = document.getElementById('fileInput');
    var selectedFiles = [];

    if (uploadZone && fileInput) {
        uploadZone.addEventListener('click', function() {
            fileInput.click();
        });

        fileInput.addEventListener('change', function() {
            if (this.files.length > 0) {
                selectedFiles = Array.from(this.files);
                updateSelectedFilesList(selectedFiles);
            }
        });

        uploadZone.addEventListener('dragover', function(e) {
            e.preventDefault();
            this.classList.add('dragover');
        });

        uploadZone.addEventListener('dragleave', function(e) {
            e.preventDefault();
            this.classList.remove('dragover');
        });

        uploadZone.addEventListener('drop', function(e) {
            e.preventDefault();
            this.classList.remove('dragover');
            if (e.dataTransfer.files.length > 0) {
                selectedFiles = Array.from(e.dataTransfer.files);
                updateSelectedFilesList(selectedFiles);
            }
        });
    }

    function updateSelectedFilesList(files) {
        var listEl = document.getElementById('selectedFilesList');
        var container = document.getElementById('uploadedFileList');
        if (files.length > 0 && listEl && container) {
            container.style.display = 'block';
            var html = '';
            for (var i = 0; i < files.length; i++) {
                var f = files[i];
                var size = formatBytes(f.size);
                html += '<li class="py-1 border-bottom d-flex justify-content-between align-items-center">' +
                    '<span><i class="' + getFileIcon(f.name) + ' me-2"></i>' + escapeHtml(f.name) + '</span>' +
                    '<span class="text-muted small">' + size + '</span>' +
                    '</li>';
            }
            listEl.innerHTML = html;
        } else if (container) {
            container.style.display = 'none';
        }
    }

    var btnConfirmUpload = document.getElementById('btnConfirmUpload');
    if (btnConfirmUpload) {
        btnConfirmUpload.addEventListener('click', function() {
            if (!window.currentDataset || !window.currentDataset.id) {
                alert('请先选择一个知识库');
                return;
            }
            if (selectedFiles.length === 0) {
                alert('请选择要上传的文件');
                return;
            }

            var formData = new FormData();
            for (var i = 0; i < selectedFiles.length; i++) {
                formData.append('files[]', selectedFiles[i]);
            }

            var progressEl = document.getElementById('uploadProgress');
            var progressBar = document.getElementById('uploadProgressBar');
            var statusText = document.getElementById('uploadStatusText');
            var percentText = document.getElementById('uploadPercentText');
            
            if (progressEl) progressEl.style.display = 'block';
            if (progressBar) progressBar.style.width = '30%';
            if (percentText) percentText.textContent = '30%';
            if (statusText) statusText.textContent = '正在上传...';

            var xhr = new XMLHttpRequest();
            xhr.open('POST', '/api.php?action=file_upload&dataset_id=' + window.currentDataset.id);
            
            xhr.upload.onprogress = function(e) {
                if (e.lengthComputable) {
                    var percent = Math.round((e.loaded / e.total) * 70) + 30;
                    if (progressBar) progressBar.style.width = percent + '%';
                    if (percentText) percentText.textContent = percent + '%';
                }
            };

            xhr.onload = function() {
                if (progressBar) progressBar.style.width = '100%';
                if (percentText) percentText.textContent = '100%';
                if (statusText) statusText.textContent = '上传完成！';
                
                try {
                    var res = JSON.parse(xhr.responseText);
                    if (res.code === 0 || res.code === 200) {
                        setTimeout(function() {
                            var modal = bootstrap.Modal.getInstance(document.getElementById('uploadFileModal'));
                            if (modal) modal.hide();
                            fetchFileList(currentPage);
                            selectedFiles = [];
                            var container = document.getElementById('uploadedFileList');
                            if (container) container.style.display = 'none';
                            if (progressEl) progressEl.style.display = 'none';
                            if (progressBar) progressBar.style.width = '0%';
                        }, 800);
                    } else {
                        alert('上传失败: ' + (res.message || '未知错误'));
                        if (progressEl) progressEl.style.display = 'none';
                    }
                } catch(e) {
                    alert('上传失败: ' + e.message);
                    if (progressEl) progressEl.style.display = 'none';
                }
            };

            xhr.onerror = function() {
                alert('上传失败: 网络错误');
                if (progressEl) progressEl.style.display = 'none';
            };

            xhr.send(formData);
        });
    }

    var uploadModal = document.getElementById('uploadFileModal');
    if (uploadModal) {
        uploadModal.addEventListener('hidden.bs.modal', function() {
            selectedFiles = [];
            var container = document.getElementById('uploadedFileList');
            var progressEl = document.getElementById('uploadProgress');
            var progressBar = document.getElementById('uploadProgressBar');
            if (container) container.style.display = 'none';
            if (progressEl) progressEl.style.display = 'none';
            if (progressBar) progressBar.style.width = '0%';
            if (fileInput) fileInput.value = '';
        });
    }
});