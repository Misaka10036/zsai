/**
 * VIVARILY · 搜索应用管理JS逻辑
 * 版本: 2.12 (PDF.js定位高亮)
 */

var currentSearchId = null;
var currentSearchApps = [];
var mindmapData = null;
var currentChunks = [];
var pdfDoc = null;
var pdfPageNum = 1;
var pdfRendering = false;
var pdfCurrentTarget = null;

// 设置PDF.js worker
if (typeof pdfjsLib !== 'undefined') {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}

document.addEventListener('DOMContentLoaded', function() {
    loadSearchApps();
});

// ===== 加载搜索应用列表 =====
function loadSearchApps() {
    var container = document.getElementById('searchAppList');
    container.innerHTML = '<div class="text-center text-muted py-3 small"><i class="fas fa-spinner fa-spin me-1"></i>加载中...</div>';

    fetch('/api.php?action=search_app_list&page=1&page_size=50')
        .then(function(r) { return r.json(); })
        .then(function(res) {
            if (res.code === 0) {
                var apps = res.data?.search_apps || res.data || [];
                currentSearchApps = apps;
                renderAppList(apps);
                if (apps.length > 0 && !currentSearchId) {
                    selectApp(apps[0].id);
                } else if (apps.length === 0) {
                    showEmptyState();
                }
            } else {
                container.innerHTML = '<div class="text-center text-muted py-3 small">加载失败: ' + escapeHtml(res.message || '') + '</div>';
            }
        })
        .catch(function(e) {
            container.innerHTML = '<div class="text-center text-muted py-3 small">加载失败: ' + escapeHtml(e.message) + '</div>';
        });
}

function renderAppList(apps) {
    var container = document.getElementById('searchAppList');
    if (apps.length === 0) {
        container.innerHTML = '<div class="text-center text-muted py-3 small">暂无搜索应用</div>';
        return;
    }

    var html = '';
    for (var i = 0; i < apps.length; i++) {
        var app = apps[i];
        var isActive = app.id === currentSearchId;
        var displayName = app.name || app.id || '未命名';
        var desc = app.description || '';

        html += '<div class="app-item' + (isActive ? ' active' : '') + '" onclick="selectApp(\'' + app.id + '\')" data-id="' + escapeHtml(app.id) + '">';
        html += '  <div class="icon"><i class="fas fa-search"></i></div>';
        html += '  <div class="info">';
        html += '    <div class="name">' + escapeHtml(displayName) + '</div>';
        if (desc) {
            html += '    <div class="desc">' + escapeHtml(desc) + '</div>';
        }
        html += '  </div>';
        html += '  <div class="app-actions">';
        html += '    <button class="danger" onclick="event.stopPropagation();deleteApp(\'' + app.id + '\')" title="删除"><i class="fas fa-trash"></i></button>';
        html += '  </div>';
        html += '</div>';
    }
    container.innerHTML = html;
}

function selectApp(appId) {
    currentSearchId = appId;
    var items = document.querySelectorAll('#searchAppList .app-item');
    for (var i = 0; i < items.length; i++) {
        items[i].classList.toggle('active', items[i].getAttribute('data-id') === appId);
    }

    var app = currentSearchApps.find(function(a) { return a.id === appId; });
    var nameDisplay = document.getElementById('currentAppNameDisplay');
    if (nameDisplay) {
        nameDisplay.textContent = app ? (app.name || app.id) : '未选择';
    }

    showEmptyState();
    mindmapData = null;
    currentChunks = [];
}

function showEmptyState() {
    var area = document.getElementById('searchResultsArea');
    area.innerHTML = '<div class="empty-state">' +
        '<i class="fas fa-search"></i>' +
        '<div class="title">选择应用开始检索</div>' +
        '<div class="desc">左侧选择一个搜索应用，然后输入问题</div>' +
        '</div>';
}

function cleanThinkProcess(text) {
    if (!text) return '';
    return text.replace(/<think>[\s\S]*?<\/think>/gi, '')
               .replace(/<thinking>[\s\S]*?<\/thinking>/gi, '')
               .trim();
}

function executeSearch() {
    if (!currentSearchId) {
        alert('请先选择一个搜索应用');
        return;
    }

    var input = document.getElementById('searchQueryInput');
    var question = input.value.trim();
    if (!question) {
        alert('请输入问题');
        return;
    }

    var area = document.getElementById('searchResultsArea');
    area.innerHTML = '<div class="text-center text-muted py-5"><i class="fas fa-spinner fa-spin me-2"></i>检索中...</div>';

    fetch('/api.php?action=search_app_exec', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            search_id: currentSearchId,
            question: question
        })
    })
    .then(function(r) { return r.json(); })
    .then(function(res) {
        console.log('搜索响应:', res);
        
        if (res.code === 0) {
            var data = res.data || {};
            var answer = data.answer || '未找到匹配结果。';
            var chunks = data.reference?.chunks || data.chunks || [];
            var mindmap = data.mindmap || data.mind_map || null;
            var docAggs = data.reference?.doc_aggs || data.doc_aggs || [];
            
            answer = cleanThinkProcess(answer);
            
            if (chunks && typeof chunks === 'object' && !Array.isArray(chunks)) {
                chunks = Object.values(chunks);
            }
            if (docAggs && typeof docAggs === 'object' && !Array.isArray(docAggs)) {
                docAggs = Object.values(docAggs);
            }
            
            currentChunks = chunks || [];
            renderSearchResult(answer, currentChunks, mindmap, docAggs || []);
        } else {
            var errorMsg = res.message || '未知错误';
            console.error('搜索失败:', errorMsg);
            area.innerHTML = '<div class="text-danger text-center py-4">检索失败: ' + escapeHtml(errorMsg) + '<br><small class="text-muted">请检查搜索应用配置是否正确</small></div>';
        }
    })
    .catch(function(e) {
        console.error('搜索请求异常:', e);
        area.innerHTML = '<div class="text-danger text-center py-4">请求异常: ' + escapeHtml(e.message) + '</div>';
    });
}

function fillSearchQuery(text) {
    document.getElementById('searchQueryInput').value = text;
    executeSearch();
}

function renderSearchResult(answer, chunks, mindmap, docAggs) {
    var area = document.getElementById('searchResultsArea');

    var formattedAnswer = answer;
    if (typeof marked !== 'undefined' && marked.parse) {
        formattedAnswer = marked.parse(answer);
    } else {
        formattedAnswer = escapeHtml(answer).replace(/\n/g, '<br>');
    }

    var html = '';

    html += '<div class="result-answer">';
    html += '  <div class="answer-header">';
    html += '    <span><i class="far fa-check-circle me-1" style="color:var(--blue,#3b82f6);"></i>基于 <strong>' + chunks.length + '</strong> 篇文档生成</span>';
    html += '    <span class="badge-count">' + getCurrentTimeString() + '</span>';
    html += '  </div>';
    html += '  <div class="answer-content" id="answerContent">' + formattedAnswer + '</div>';
    html += '  <div class="answer-footer">';
    html += '    <span><i class="fas fa-file-alt me-1"></i>引用 <strong>' + chunks.length + '</strong> 个来源</span>';
    html += '    <span><i class="fas fa-robot me-1"></i>AI 生成</span>';
    html += '  </div>';
    html += '</div>';

    if (mindmap) {
        html += '<div class="result-mindmap">';
        html += '  <div class="mindmap-header">';
        html += '    <span class="mindmap-title"><i class="fas fa-project-diagram text-primary me-1"></i>查询思维导图</span>';
        html += '  </div>';
        html += '  <div class="mindmap-body" id="mindmapContainer">';
        html += renderMindmapTree(mindmap);
        html += '  </div>';
        html += '</div>';
    }

    html += '<div class="result-sources">';
    html += '  <div class="sources-header">';
    html += '    <span class="sources-title"><i class="fas fa-book text-primary me-1"></i>引用来源</span>';
    html += '    <span class="sources-count">共 ' + chunks.length + ' 个引用</span>';
    html += '  </div>';

    if (chunks.length === 0) {
        html += '  <div class="text-muted text-center py-3 small">暂无引用来源</div>';
    } else {
        if (docAggs && docAggs.length > 0) {
            html += '  <div class="doc-aggs">';
            html += '    <div class="doc-aggs-title"><i class="fas fa-file-alt me-1"></i>相关文档</div>';
            html += '    <div class="doc-aggs-list">';
            for (var d = 0; d < docAggs.length; d++) {
                var doc = docAggs[d];
                var docName = doc.doc_name || doc.document_name || '未知文档';
                var count = doc.count || 0;
                html += '      <span class="doc-aggs-item"><i class="fas fa-file me-1"></i>' + escapeHtml(docName) + ' (' + count + ')</span>';
            }
            html += '    </div>';
            html += '  </div>';
        }

        html += '  <div class="source-list">';
        for (var i = 0; i < Math.min(chunks.length, 20); i++) {
            var chunk = chunks[i];
            var docName = chunk.document_name || chunk.doc_name || chunk.filename || '来源文档';
            var score = chunk.similarity || chunk.score || 0;
            var scoreText = (score * 100).toFixed(0) + '%';
            var scoreClass = score >= 0.7 ? 'high' : (score >= 0.4 ? 'medium' : 'low');
            var content = chunk.content || chunk.text || '';
            var chunkId = chunk.id || chunk.chunk_id || 'chunk-' + i;
            var docId = chunk.document_id || chunk.doc_id || 'doc-' + i;
            var datasetId = chunk.dataset_id || chunk.kb_id || '';
            var pageNumber = chunk.page_num || chunk.page || chunk.page_number || 1;
            
            var previewText = content.substring(0, 120);
            if (content.length > 120) {
                previewText += '...';
            }

            html += '<div class="source-item" onclick="openPreviewWithHighlight(\'' + escapeJsString(datasetId) + '\', \'' + escapeJsString(docId) + '\', \'' + escapeJsString(docName) + '\', \'' + escapeJsString(content) + '\', \'' + escapeJsString(chunkId) + '\', ' + parseInt(pageNumber) + ')" data-chunk-id="' + escapeHtml(chunkId) + '">';
            html += '  <span class="index">' + (i + 1) + '</span>';
            html += '  <div class="info">';
            html += '    <div class="title" title="' + escapeHtml(docName) + '">' + escapeHtml(docName) + '</div>';
            html += '    <div class="meta">';
            html += '      <span class="preview-text">' + escapeHtml(previewText) + '</span>';
            html += '      <span class="page-info"><i class="fas fa-file-pdf me-1"></i>第 ' + pageNumber + ' 页</span>';
            html += '    </div>';
            html += '  </div>';
            html += '  <span class="score ' + scoreClass + '">' + scoreText + '</span>';
            html += '  <span class="goto-btn" title="定位到文档"><i class="fas fa-arrow-right"></i></span>';
            html += '</div>';
        }
        if (chunks.length > 20) {
            html += '<div class="text-muted small text-center pt-1">...还有 ' + (chunks.length - 20) + ' 个引用</div>';
        }
        html += '  </div>';
    }
    html += '</div>';

    area.innerHTML = html;

    if (mindmap) {
        setTimeout(function() {
            renderMindmapWithECharts(mindmap);
        }, 100);
    }
}

// ===== 打开预览并定位高亮 =====
function openPreviewWithHighlight(datasetId, docId, docName, chunkContent, chunkId, pageNum) {
    if (!docId) {
        alert('文档ID不存在，无法预览');
        return;
    }

    var modalEl = document.getElementById('previewModal');
    if (!modalEl) {
        modalEl = createPreviewModal();
    }

    var modalTitle = document.getElementById('previewModalTitle');
    var modalBody = document.getElementById('previewModalBody');
    var btnDownload = document.getElementById('btnDownloadFile');

    var isPDFFile = isPDF(docName);
    var isText = isTextFile(docName);

    // 设置标题
    if (modalTitle) {
        var fileTypeBadge = isPDFFile ? 
            '<span class="badge bg-danger ms-2">PDF</span>' : 
            (isText ? '<span class="badge bg-success ms-2">文本</span>' : '<span class="badge bg-secondary ms-2">文件</span>');
        var pageInfo = pageNum ? ' <span class="badge bg-primary-subtle text-primary ms-1">第 ' + pageNum + ' 页</span>' : '';
        modalTitle.innerHTML = '<i class="fas fa-file-alt text-primary me-2"></i>预览文档：' + escapeHtml(docName) + fileTypeBadge + pageInfo;
    }

    var fileUrl = '/api.php?action=file_preview&dataset_id=' + encodeURIComponent(datasetId) + '&doc_id=' + encodeURIComponent(docId);
    if (btnDownload) {
        btnDownload.href = fileUrl;
    }

    // PDF文件使用PDF.js渲染
    if (isPDFFile) {
        renderPDFWithPDFJS(fileUrl, pageNum || 1, chunkContent, modalEl, modalBody);
        return;
    }

    // 文本文件直接显示
    if (modalBody) {
        modalBody.innerHTML = '<div class="text-center py-5"><i class="fas fa-spinner fa-spin me-2" style="font-size:2rem;color:var(--blue,#3b82f6);"></i><div class="mt-2 text-muted">正在加载文档...</div></div>';
    }

    fetch(fileUrl)
        .then(function(response) {
            if (!response.ok) throw new Error('HTTP ' + response.status);
            return response.text();
        })
        .then(function(rawText) {
            if (rawText && (rawText.startsWith('%PDF') || rawText.includes('PDF'))) {
                renderPDFWithPDFJS(fileUrl, pageNum || 1, chunkContent, modalEl, modalBody);
                return;
            }
            
            var highlightedText = highlightTextInDocument(rawText, chunkContent, chunkId);
            if (modalBody) {
                modalBody.innerHTML = 
                    '<div style="width:100%; height:100%; min-height:500px; max-height:80vh; overflow-y:auto; background:#ffffff; padding:24px; position:relative;">' +
                    '<div id="previewContent" style="white-space:pre-wrap; word-break:break-all; font-size:0.88rem; line-height:1.8; color:#1e293b;">' + 
                    highlightedText + 
                    '</div>' +
                    '</div>';
            }
            showPreviewModal(modalEl);
        })
        .catch(function(err) {
            console.error('加载文档失败:', err);
            if (modalBody) {
                modalBody.innerHTML = '<div class="text-danger text-center p-5">加载文档失败: ' + escapeHtml(err.message) + '</div>';
            }
            showPreviewModal(modalEl);
        });
    return;
}

// ===== 使用PDF.js渲染PDF =====
function renderPDFWithPDFJS(pdfUrl, targetPage, searchText, modalEl, modalBody) {
    if (typeof pdfjsLib === 'undefined') {
        if (modalBody) {
            modalBody.innerHTML = '<div class="text-danger text-center p-5">PDF.js 未加载，请检查网络连接</div>';
        }
        showPreviewModal(modalEl);
        return;
    }

    // 显示加载状态
    if (modalBody) {
        modalBody.innerHTML = 
            '<div class="pdf-viewer-container">' +
            '  <div class="pdf-loading"><i class="fas fa-spinner fa-spin"></i><div>正在加载PDF...</div></div>' +
            '</div>';
    }

    // 先显示模态框
    showPreviewModal(modalEl);

    // 使用PDF.js加载
    var loadingTask = pdfjsLib.getDocument(pdfUrl);
    
    loadingTask.promise.then(function(pdf) {
        pdfDoc = pdf;
        var totalPages = pdf.numPages;
        var pageToShow = Math.min(targetPage || 1, totalPages);
        
        // 设置PDF控件
        var container = modalBody.querySelector('.pdf-viewer-container');
        if (container) {
            container.innerHTML = '';
            
            // 添加控件栏
            var controls = document.createElement('div');
            controls.className = 'pdf-controls';
            controls.innerHTML = 
                '<button class="btn-pdf" onclick="pdfPrevPage()"><i class="fas fa-chevron-left"></i></button>' +
                '<span class="page-info">第 <span id="pdfCurrentPage">' + pageToShow + '</span> / ' + totalPages + ' 页</span>' +
                '<button class="btn-pdf" onclick="pdfNextPage()"><i class="fas fa-chevron-right"></i></button>' +
                '<button class="btn-pdf primary" onclick="pdfGoToPage(' + pageToShow + ')"><i class="fas fa-search-location"></i> 定位到第 ' + pageToShow + ' 页</button>' +
                '<span class="search-highlight-info" id="pdfHighlightInfo"></span>';
            container.appendChild(controls);
            
            // 创建页面容器
            var pageContainer = document.createElement('div');
            pageContainer.id = 'pdfPageContainer';
            pageContainer.style.cssText = 'padding:0.5rem;text-align:center;';
            container.appendChild(pageContainer);
        }
        
        // 渲染页面
        renderPDFPage(pageToShow, searchText, modalBody);
        
    }).catch(function(err) {
        console.error('PDF加载失败:', err);
        if (modalBody) {
            modalBody.innerHTML = '<div class="text-danger text-center p-5">PDF加载失败: ' + escapeHtml(err.message) + '</div>';
        }
    });
}

// ===== 渲染PDF页面 =====
function renderPDFPage(pageNum, searchText, modalBody) {
    if (!pdfDoc) return;
    
    var container = document.getElementById('pdfPageContainer');
    if (!container) return;
    
    // 清除之前的内容
    container.innerHTML = '';
    
    // 显示加载状态
    container.innerHTML = '<div class="pdf-loading" style="height:200px;"><i class="fas fa-spinner fa-spin"></i><div>加载第 ' + pageNum + ' 页...</div></div>';
    
    pdfDoc.getPage(pageNum).then(function(page) {
        var viewport = page.getViewport({ scale: 1.5 });
        
        // 创建canvas
        var canvas = document.createElement('canvas');
        var context = canvas.getContext('2d');
        canvas.height = viewport.height;
        canvas.width = viewport.width;
        
        // 渲染页面
        var renderContext = {
            canvasContext: context,
            viewport: viewport
        };
        
        page.render(renderContext).promise.then(function() {
            // 移除加载状态
            container.innerHTML = '';
            
            // 添加页码标签
            var label = document.createElement('div');
            label.className = 'page-label';
            label.textContent = '第 ' + pageNum + ' 页';
            container.appendChild(label);
            
            // 添加canvas
            var canvasWrapper = document.createElement('div');
            canvasWrapper.style.cssText = 'position:relative;display:inline-block;';
            canvasWrapper.appendChild(canvas);
            container.appendChild(canvasWrapper);
            
            // 更新页码显示
            var pageDisplay = document.getElementById('pdfCurrentPage');
            if (pageDisplay) pageDisplay.textContent = pageNum;
            
            // 如果有搜索文本，在页面上高亮
            if (searchText && searchText.length > 0) {
                highlightPDFText(pageNum, searchText, canvasWrapper);
            }
        });
    }).catch(function(err) {
        console.error('页面渲染失败:', err);
        container.innerHTML = '<div class="text-danger text-center p-3">页面渲染失败</div>';
    });
}

// ===== 在PDF页面中高亮文本（通过覆盖层） =====
function highlightPDFText(pageNum, searchText, wrapper) {
    // 使用PDF.js的文本内容API获取文本位置
    if (!pdfDoc) return;
    
    pdfDoc.getPage(pageNum).then(function(page) {
        page.getTextContent().then(function(textContent) {
            var items = textContent.items;
            var found = false;
            var searchLower = searchText.toLowerCase().substring(0, 100);
            
            // 查找匹配的文本项
            for (var i = 0; i < items.length; i++) {
                var item = items[i];
                var itemText = item.str.toLowerCase();
                if (itemText.indexOf(searchLower) !== -1 || searchLower.indexOf(itemText.substring(0, 20)) !== -1) {
                    found = true;
                    
                    // 创建高亮覆盖层
                    var highlightDiv = document.createElement('div');
                    highlightDiv.style.cssText = 
                        'position:absolute;' +
                        'left:' + (item.transform[4] * 1.5) + 'px;' +
                        'top:' + (item.transform[5] * 1.5) + 'px;' +
                        'width:' + (item.width * 1.5) + 'px;' +
                        'height:' + (item.height * 1.5) + 'px;' +
                        'background:rgba(252,211,77,0.6);' +
                        'border:2px solid #fbbf24;' +
                        'border-radius:2px;' +
                        'pointer-events:none;' +
                        'animation:previewFlash 1.5s ease;' +
                        'z-index:10;';
                    highlightDiv.title = '匹配内容: ' + item.str;
                    wrapper.appendChild(highlightDiv);
                    
                    // 只高亮第一个匹配
                    break;
                }
            }
            
            // 如果没有精确匹配，尝试匹配关键词
            if (!found && searchText.length > 10) {
                var keywords = searchText.split(/\s+/).filter(function(w) { return w.length > 4; });
                for (var j = 0; j < keywords.length && j < 3; j++) {
                    var kw = keywords[j].toLowerCase();
                    for (var k = 0; k < items.length; k++) {
                        if (items[k].str.toLowerCase().indexOf(kw) !== -1) {
                            var highlightDiv2 = document.createElement('div');
                            highlightDiv2.style.cssText = 
                                'position:absolute;' +
                                'left:' + (items[k].transform[4] * 1.5) + 'px;' +
                                'top:' + (items[k].transform[5] * 1.5) + 'px;' +
                                'width:' + (items[k].width * 1.5) + 'px;' +
                                'height:' + (items[k].height * 1.5) + 'px;' +
                                'background:rgba(252,211,77,0.4);' +
                                'border:1.5px solid #fbbf24;' +
                                'border-radius:2px;' +
                                'pointer-events:none;' +
                                'z-index:9;';
                            wrapper.appendChild(highlightDiv2);
                            found = true;
                            break;
                        }
                    }
                    if (found) break;
                }
            }
            
            // 更新高亮信息
            var infoEl = document.getElementById('pdfHighlightInfo');
            if (infoEl) {
                infoEl.textContent = found ? '✓ 已定位到匹配内容' : '⚠ 未找到精确匹配，请查看页面内容';
                infoEl.style.color = found ? '#22c55e' : '#f59e0b';
            }
            
            // 如果没有找到匹配，显示提示
            if (!found) {
                var noMatchDiv = document.createElement('div');
                noMatchDiv.style.cssText = 
                    'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);' +
                    'background:rgba(255,255,255,0.9);padding:0.5rem 1rem;border-radius:8px;' +
                    'border:1px solid #fcd34d;font-size:0.8rem;color:#92400e;z-index:20;' +
                    'pointer-events:none;';
                noMatchDiv.textContent = '⚠ 未找到精确匹配，请浏览页面查找';
                wrapper.appendChild(noMatchDiv);
            }
        });
    }).catch(function(err) {
        console.error('获取文本内容失败:', err);
    });
}

// ===== PDF翻页 =====
function pdfPrevPage() {
    if (!pdfDoc) return;
    var currentPage = parseInt(document.getElementById('pdfCurrentPage').textContent) || 1;
    if (currentPage > 1) {
        var targetPage = currentPage - 1;
        renderPDFPage(targetPage, pdfCurrentTarget || '', document.getElementById('previewModalBody'));
    }
}

function pdfNextPage() {
    if (!pdfDoc) return;
    var currentPage = parseInt(document.getElementById('pdfCurrentPage').textContent) || 1;
    if (currentPage < pdfDoc.numPages) {
        var targetPage = currentPage + 1;
        renderPDFPage(targetPage, pdfCurrentTarget || '', document.getElementById('previewModalBody'));
    }
}

function pdfGoToPage(pageNum) {
    if (!pdfDoc) return;
    if (pageNum >= 1 && pageNum <= pdfDoc.numPages) {
        renderPDFPage(pageNum, pdfCurrentTarget || '', document.getElementById('previewModalBody'));
    }
}

// ===== 显示预览模态框 =====
function showPreviewModal(modalEl) {
    var previewModal = bootstrap.Modal.getInstance(modalEl) || new bootstrap.Modal(modalEl);
    previewModal.show();
}

// ===== 判断文件类型 =====
function isTextFile(filename) {
    if (!filename) return false;
    var ext = filename.split('.').pop().toLowerCase();
    var textExts = ['txt', 'md', 'log', 'csv', 'json', 'xml', 'html', 'htm', 'css', 'js', 'php', 'py', 'java', 'c', 'cpp', 'h', 'go', 'rs', 'ts', 'jsx', 'tsx', 'vue', 'sh', 'bat', 'ps1', 'yml', 'yaml', 'toml', 'ini', 'cfg', 'conf'];
    return textExts.indexOf(ext) !== -1;
}

function isPDF(filename) {
    if (!filename) return false;
    return filename.split('.').pop().toLowerCase() === 'pdf';
}

// ===== 创建预览模态框 =====
function createPreviewModal() {
    var modalHtml = 
        '<div class="modal fade" id="previewModal" tabindex="-1" aria-hidden="true">' +
        '  <div class="modal-dialog modal-xl modal-dialog-centered" style="height: 95vh; max-width:95vw;">' +
        '    <div class="modal-content h-100 border-0 rounded-4 shadow-lg overflow-hidden">' +
        '      <div class="modal-header py-2 bg-light flex-shrink-0">' +
        '        <h6 class="modal-title text-truncate fw-bold" id="previewModalTitle"><i class="fas fa-eye text-primary me-2"></i>文件预览</h6>' +
        '        <div class="d-flex align-items-center gap-2">' +
        '          <a id="btnDownloadFile" href="#" target="_blank" class="btn btn-outline-primary btn-sm rounded-pill px-3"><i class="fas fa-download me-1"></i>下载</a>' +
        '          <button type="button" class="btn-close" data-bs-dismiss="modal"></button>' +
        '        </div>' +
        '      </div>' +
        '      <div class="modal-body p-0 d-flex justify-content-center align-items-center" id="previewModalBody" style="background: #f1f4f9; overflow:hidden;">' +
        '        <div class="text-center text-muted">' +
        '          <i class="fas fa-file-alt" style="font-size: 3rem; opacity: 0.3;"></i>' +
        '          <div class="mt-2">正在读取文件...</div>' +
        '        </div>' +
        '      </div>' +
        '    </div>' +
        '  </div>' +
        '</div>';

    document.body.insertAdjacentHTML('beforeend', modalHtml);
    return document.getElementById('previewModal');
}

// ===== 在文本中高亮匹配 =====
function highlightTextInDocument(documentText, searchText, chunkId) {
    if (!documentText || !searchText) {
        return escapeHtml(documentText || '').replace(/\n/g, '<br>');
    }

    var escapedDoc = escapeHtml(documentText);
    var escapedSearch = searchText.substring(0, 200).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    
    var searchPattern = escapedSearch;
    if (searchPattern.length < 10 && searchText.length > 10) {
        searchPattern = searchText.substring(0, 50).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    var regex = new RegExp(searchPattern, 'i');
    var match = regex.exec(escapedDoc);
    
    if (match) {
        var start = match.index;
        var end = start + match[0].length;
        var contextStart = Math.max(0, start - 100);
        var contextEnd = Math.min(escapedDoc.length, end + 100);
        
        var before = escapedDoc.substring(contextStart, start);
        var highlight = escapedDoc.substring(start, end);
        var after = escapedDoc.substring(end, contextEnd);
        
        if (contextStart > 0) before = '...' + before;
        if (contextEnd < escapedDoc.length) after = after + '...';
        
        return before + 
            '<span class="text-highlight" data-chunk-id="' + escapeHtml(chunkId) + '">' + 
            highlight + 
            '</span>' + 
            after;
    } else {
        var words = searchText.split(/\s+/).filter(function(w) { return w.length > 3; });
        var bestMatch = null;
        var bestScore = 0;
        
        for (var i = 0; i < words.length && i < 5; i++) {
            var wordRegex = new RegExp(escapeHtml(words[i]), 'i');
            var wordMatch = wordRegex.exec(escapedDoc);
            if (wordMatch && wordMatch[0].length > bestScore) {
                bestScore = wordMatch[0].length;
                bestMatch = wordMatch;
            }
        }
        
        if (bestMatch) {
            var start2 = bestMatch.index;
            var end2 = start2 + bestMatch[0].length;
            var contextStart2 = Math.max(0, start2 - 80);
            var contextEnd2 = Math.min(escapedDoc.length, end2 + 80);
            
            var before2 = escapedDoc.substring(contextStart2, start2);
            var highlight2 = escapedDoc.substring(start2, end2);
            var after2 = escapedDoc.substring(end2, contextEnd2);
            
            if (contextStart2 > 0) before2 = '...' + before2;
            if (contextEnd2 < escapedDoc.length) after2 = after2 + '...';
            
            return before2 + 
                '<span class="text-highlight">' + 
                highlight2 + 
                '</span>' + 
                after2;
        }
        
        var preview = escapedDoc.substring(0, 500);
        if (escapedDoc.length > 500) preview += '...';
        return preview;
    }
}

// ===== 思维导图 =====
function renderMindmapTree(data, level) {
    level = level || 0;
    if (!data) return '';

    var html = '';

    if (typeof data === 'string') {
        html += '<div class="mindmap-node" style="padding-left:' + (level * 20) + 'px;">';
        html += '  <span class="mindmap-node-icon"><i class="fas fa-circle" style="font-size:0.4rem;"></i></span>';
        html += '  <span class="mindmap-node-text">' + escapeHtml(data) + '</span>';
        html += '</div>';
        return html;
    }

    if (data.name) {
        html += '<div class="mindmap-node" style="padding-left:' + (level * 20) + 'px;">';
        html += '  <span class="mindmap-node-icon"><i class="fas fa-' + (level === 0 ? 'dot-circle' : 'circle') + '" style="font-size:0.4rem;"></i></span>';
        html += '  <span class="mindmap-node-text' + (level === 0 ? ' root' : '') + '">' + escapeHtml(data.name) + '</span>';
        html += '</div>';
        if (data.children && data.children.length > 0) {
            for (var i = 0; i < data.children.length; i++) {
                html += renderMindmapTree(data.children[i], level + 1);
            }
        }
    } else if (Array.isArray(data)) {
        for (var j = 0; j < data.length; j++) {
            html += renderMindmapTree(data[j], level);
        }
    } else if (typeof data === 'object') {
        for (var key in data) {
            if (data.hasOwnProperty(key)) {
                html += '<div class="mindmap-node" style="padding-left:' + (level * 20) + 'px;">';
                html += '  <span class="mindmap-node-icon"><i class="fas fa-circle" style="font-size:0.4rem;"></i></span>';
                html += '  <span class="mindmap-node-text">' + escapeHtml(key) + '</span>';
                html += '</div>';
                html += renderMindmapTree(data[key], level + 1);
            }
        }
    }

    return html;
}

function renderMindmapWithECharts(data) {
    var container = document.getElementById('mindmapContainer');
    if (!container) return;
    if (typeof echarts === 'undefined') {
        container.innerHTML = '<div class="text-muted small">ECharts未加载</div>';
        return;
    }

    function convertToTree(node) {
        if (!node) return null;
        if (typeof node === 'string') { return { name: node }; }
        if (node.name) {
            var result = { name: node.name };
            if (node.children && node.children.length > 0) {
                result.children = [];
                for (var i = 0; i < node.children.length; i++) {
                    var child = convertToTree(node.children[i]);
                    if (child) result.children.push(child);
                }
            }
            return result;
        }
        if (Array.isArray(node)) {
            var arrResult = { name: '根节点', children: [] };
            for (var j = 0; j < node.length; j++) {
                var childItem = convertToTree(node[j]);
                if (childItem) arrResult.children.push(childItem);
            }
            return arrResult;
        }
        if (typeof node === 'object') {
            var objResult = { name: '对象', children: [] };
            for (var key in node) {
                if (node.hasOwnProperty(key)) {
                    var childObj = convertToTree(node[key]);
                    if (childObj) {
                        childObj.name = key + ': ' + childObj.name;
                        objResult.children.push(childObj);
                    }
                }
            }
            return objResult;
        }
        return { name: String(node) };
    }

    var treeData = convertToTree(data);
    if (!treeData) {
        container.innerHTML = '<div class="text-muted small">无法解析思维导图数据</div>';
        return;
    }

    if (window.mindmapChart) { window.mindmapChart.dispose(); }

    var chart = echarts.init(container);
    window.mindmapChart = chart;

    chart.setOption({
        tooltip: { trigger: 'item', triggerOn: 'mousemove' },
        series: [{
            type: 'tree',
            data: [treeData],
            top: '5%',
            left: '10%',
            bottom: '5%',
            right: '15%',
            symbolSize: 8,
            label: {
                position: 'right',
                verticalAlign: 'middle',
                align: 'left',
                fontSize: 12,
                color: '#1e293b'
            },
            leaves: { label: { position: 'right', verticalAlign: 'middle', align: 'left' } },
            expandAndCollapse: true,
            animationDuration: 550,
            animationDurationUpdate: 750
        }]
    });

    chart.on('click', function(params) {
        if (params.data && params.data.children) {
            chart.dispatchAction({ type: 'treeExpandAndCollapse', dataIndex: params.dataIndex });
        }
    });

    var resizeHandler = function() {
        if (window.mindmapChart) { window.mindmapChart.resize(); }
    };
    window.addEventListener('resize', resizeHandler);
    if (window.mindmapResizeHandler) {
        window.removeEventListener('resize', window.mindmapResizeHandler);
    }
    window.mindmapResizeHandler = resizeHandler;
}

// ===== 新建应用 =====
function showCreateAppModal() {
    document.getElementById('newAppName').value = '';
    document.getElementById('newAppDesc').value = '';
    var modal = new bootstrap.Modal(document.getElementById('createAppModal'));
    modal.show();
}

function confirmCreateApp() {
    var name = document.getElementById('newAppName').value.trim();
    var desc = document.getElementById('newAppDesc').value.trim();

    if (!name) {
        alert('请输入应用名称');
        return;
    }

    fetch('/api.php?action=search_app_create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name, description: desc })
    })
    .then(function(r) { return r.json(); })
    .then(function(res) {
        if (res.code === 0) {
            var modal = bootstrap.Modal.getInstance(document.getElementById('createAppModal'));
            if (modal) modal.hide();
            loadSearchApps();
            if (res.data && res.data.search_id) {
                setTimeout(function() { selectApp(res.data.search_id); }, 300);
            }
        } else {
            alert('创建失败: ' + (res.message || '未知错误'));
        }
    })
    .catch(function(e) { alert('创建失败: ' + e.message); });
}

// ===== 删除应用 =====
function deleteApp(appId) {
    if (!confirm('确定要删除该搜索应用吗？此操作不可恢复！')) return;

    fetch('/api.php?action=search_app_delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ search_id: appId })
    })
    .then(function(r) { return r.json(); })
    .then(function(res) {
        if (res.code === 0) {
            if (currentSearchId === appId) {
                currentSearchId = null;
                document.getElementById('currentAppNameDisplay').textContent = '未选择';
                showEmptyState();
            }
            loadSearchApps();
        } else {
            alert('删除失败: ' + (res.message || '未知错误'));
        }
    })
    .catch(function(e) { alert('删除失败: ' + e.message); });
}

function getCurrentTimeString() {
    var now = new Date();
    var pad = function(n) { return String(n).padStart(2, '0'); };
    return now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate());
}