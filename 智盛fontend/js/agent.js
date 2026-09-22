/**
 * VIVARILY · Agent 工作流
 * 版本: 16.2 - 层次化浮动拓扑图（点击邻域高亮 + 微动飘动 + 自由拖拽与缩放共存）
 * 特点: 层次化排布 + 增量动画更新 + 支持画布缩放平移/节点拖拽 + 点击邻居高亮
 */

// ============================================================
// 全局状态
// ============================================================

var currentAgentId = null;
var currentAgents = [];
var isRunning = false;
var currentStep = -1;
var stepTimers = [];
var logEntries = [];
var rawGraphData = { nodes: [], edges: [] };
var currentSessionId = null;
var agentRun = null;
var agentReady = false;
var agentDialogueMode = 'conversational';
var agentDetailVersion = 0;
var allNodesMap = {};
var treeChart = null;
var treeStatus = 'idle';
var treeActiveId = null;
var nodeRunState = {};
var agentLogs = {};
var agentCanvasState = {};
var AGENT_VIEW_KEY = 'vivarly-agent-views';
var containerId = 'treeChart';

// 力导向/微动布局相关状态
var forceLayoutNodes = [];
var forceLayoutEdges = [];
var animationFrameId = null;
var isForceLayoutRunning = false;
var basePositions = {}; // 记录节点微动动画的基准坐标

// 当前高亮选中的节点ID
var highlightedNodeId = null;

// ============================================================
// DOM 引用
// ============================================================

var agentListEl = document.getElementById('agentList');
var logBody = document.getElementById('logBody');
var logCount = document.getElementById('logCount');
var btnRun = document.getElementById('btnRun');
var btnText = document.getElementById('btnText');
var statusBadge = document.getElementById('statusBadge');
var statusDot = document.getElementById('statusDot');
var statusText = document.getElementById('statusText');
var totalSteps = document.getElementById('totalSteps');
var agentAvatarSm = document.getElementById('agentAvatarSm');
var agentNameSm = document.getElementById('agentNameSm');
var agentDescSm = document.getElementById('agentDescSm');
var agentStatusSm = document.getElementById('agentStatusSm');

// ============================================================
// 初始化
// ============================================================

document.addEventListener('DOMContentLoaded', function() {
    loadAgentViews();
    loadAgents();
    addLog('info', '🟢 Agent 已就绪，点击"运行"开始执行');
    console.log('%c VIVARILY · Agent 工作流 v16.2 ', 'background:#f8fafc;color:#1e293b;font-size:14px;padding:6px 14px;border-radius:4px;border:1px solid #e9edf2;');
    
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' || e.key === ' ') {
            if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
                e.preventDefault();
                toggleRun();
            }
        }
        if (e.key === 'Escape') {
            closeCreateModal();
        }
    });
});

// ============================================================
// Agent 列表管理
// ============================================================

async function loadAgents() {
    agentListEl.textContent = '加载中...';
    try {
        currentAgents = await portalList('agent_list', ['canvas', 'list']);
        renderAgentList();
        if (currentAgents.length && !currentAgentId) selectAgent(currentAgents[0].id);
        else if (!currentAgents.length) showEmptyState();
    } catch (error) {
        agentListEl.textContent = 'Agent 加载失败：' + error.message;
        agentReady = false;
        btnRun.disabled = true;
    }
}

function renderAgentList() {
    var agents = currentAgents;
    if (!agents || agents.length === 0) {
        agentListEl.innerHTML = '<div class="text-center text-muted py-3 small">暂无 Agent</div>';
        return;
    }

    var html = '';
    for (var i = 0; i < agents.length; i++) {
        var agent = agents[i];
        var isActive = agent.id === currentAgentId;
        var agentName = agent.title || agent.name || '未命名';
        var agentDesc = agent.description || '';
        var agentIcon = agentName.charAt(0).toUpperCase();

        html += '<div class="agent-item' + (isActive ? ' active' : '') + '" onclick="selectAgent(\'' + agent.id + '\')" data-id="' + escapeHtml(agent.id) + '">';
        html += '  <div class="agent-icon">' + escapeHtml(agentIcon) + '</div>';
        html += '  <div class="info">';
        html += '    <div class="name">' + escapeHtml(agentName) + '</div>';
        if (agentDesc) {
            html += '    <div class="desc">' + escapeHtml(agentDesc) + '</div>';
        }
        html += '  </div>';
        html += '  <span class="status-dot' + listDotClass(agent.id) + '"></span>';
        html += '  <div class="agent-actions">';
        html += '    <button class="danger" onclick="event.stopPropagation();deleteAgent(\'' + agent.id + '\')" title="删除"><i class="fas fa-trash"></i></button>';
        html += '  </div>';
        html += '</div>';
    }
    agentListEl.innerHTML = html;
}

// ============================================================
// 选择 Agent
// ============================================================

function selectAgent(agentId) {
    if (isRunning) {
        alert('请先停止任务并等待结束后再切换 Agent');
        return;
    }
    if (agentId === currentAgentId) return;

    persistAgentViews();
    currentAgentId = agentId;
    currentSessionId = null;
    restoreAgentView(agentId);
    var agent = currentAgents.find(function(a) { return a.id === agentId; });

    var items = agentListEl.querySelectorAll('.agent-item');
    for (var i = 0; i < items.length; i++) {
        items[i].classList.toggle('active', items[i].getAttribute('data-id') === agentId);
    }

    if (agent) {
        var agentName = agent.title || agent.name || '未命名';
        agentAvatarSm.textContent = agentName.charAt(0).toUpperCase();
        agentNameSm.textContent = agentName;
        agentDescSm.textContent = agent.description || '点击运行执行任务';
    }

    renderAgentList();
    loadAgentDetail(agentId);
}

// ============================================================
// 加载 Agent 详情并解析 DSL
// ============================================================

function readDialogueMode(dsl) {
    var components = (dsl && dsl.components) || {};
    var params = components.begin && components.begin.obj && components.begin.obj.params;
    if (!params) {
        for (var key in components) {
            var obj = components[key] && components[key].obj;
            if (obj && obj.component_name === 'Begin') {
                params = obj.params;
                break;
            }
        }
    }
    var mode = params && params.mode;
    if (!mode && dsl && dsl.graph && dsl.graph.nodes) {
        for (var i = 0; i < dsl.graph.nodes.length; i++) {
            var node = dsl.graph.nodes[i];
            var data = node.data || {};
            if (node.id === 'begin' || data.label === 'Begin') {
                mode = data.form && data.form.mode;
                break;
            }
        }
    }
    return mode || 'conversational';
}

async function loadAgentDetail(agentId) {
    var version = ++agentDetailVersion;
    agentReady = false;
    agentDialogueMode = 'conversational';
    btnRun.disabled = true;
    rawGraphData = { nodes: [], edges: [] };
    if (treeChart) treeChart.clear();
    try {
        var data = await portalRequest('agent_detail&agent_id=' + encodeURIComponent(agentId));
        if (version !== agentDetailVersion) return;
        var dsl = typeof data.dsl === 'string' ? JSON.parse(data.dsl) : data.dsl;
        parseDAGFromDSL(dsl);
        agentReady = true;
        btnRun.disabled = false;
    } catch (error) {
        if (version !== agentDetailVersion) return;
        totalSteps.textContent = '0';
        updateStatus('error');
        addLog('error', '工作流加载失败：' + error.message);
    }
}

function parseDAGFromDSL(dsl) {
    if (!dsl || !dsl.components) {
        throw new Error('工作流缺少 components');
    }

    var components = dsl.components;
    var graphNodes = (dsl.graph && dsl.graph.nodes) ? dsl.graph.nodes : [];
    var graphEdges = (dsl.graph && dsl.graph.edges) ? dsl.graph.edges : [];

    allNodesMap = {};
    var edges = [];

    for (var key in components) {
        var comp = components[key];
        var gn = graphNodes.find(function(n) { return n.id === key; });
        var displayName = gn && gn.data && gn.data.name ? gn.data.name : (gn && gn.data ? gn.data.label : key);
        var compType = comp.obj ? comp.obj.component_name : 'Unknown';
        
        var shortName = displayName || key;
        if (shortName.length > 22) {
            shortName = shortName.substring(0, 20) + '…';
        }

        allNodesMap[key] = {
            id: key,
            name: shortName,
            fullName: displayName || key,
            type: compType,
            desc: comp.obj && comp.obj.params ? (comp.obj.params.description || comp.obj.params.sys_prompt || '') : ''
        };
    }

    if (graphEdges.length > 0) {
        for (var i = 0; i < graphEdges.length; i++) {
            var ge = graphEdges[i];
            if (allNodesMap[ge.source] && allNodesMap[ge.target]) {
                edges.push({ source: ge.source, target: ge.target });
            }
        }
    } else {
        for (var k in components) {
            var c = components[k];
            if (c.downstream && Array.isArray(c.downstream)) {
                for (var d = 0; d < c.downstream.length; d++) {
                    var tId = c.downstream[d];
                    if (allNodesMap[k] && allNodesMap[tId]) {
                        edges.push({ source: k, target: tId });
                    }
                }
            }
        }
    }

    agentDialogueMode = readDialogueMode(dsl);
    rawGraphData = {
        nodes: Object.values(allNodesMap),
        edges: edges
    };

    totalSteps.textContent = rawGraphData.nodes.length;
    treeActiveId = null;
    highlightedNodeId = null;
    updateProgress();
    
    stopForceLayout();
    renderHierarchicalGraph(rawGraphData, treeStatus, treeActiveId);
    
    updateStatus('idle');
    addLog('info', '🔄 已加载 Agent 工作流，共 ' + rawGraphData.nodes.length + ' 个节点');
}

// ============================================================
// 层次化布局算法 + 力导向微调
// ============================================================

function calculateHierarchicalLayout(nodes, edges, width, height) {
    if (!nodes || nodes.length === 0) return { layoutNodes: [] };
    
    var inDegree = {};
    var adjList = {};
    var reverseAdj = {};
    
    for (var i = 0; i < nodes.length; i++) {
        var id = nodes[i].id;
        inDegree[id] = 0;
        adjList[id] = [];
        reverseAdj[id] = [];
    }
    
    for (var e = 0; e < edges.length; e++) {
        var u = edges[e].source;
        var v = edges[e].target;
        if (adjList[u]) adjList[u].push(v);
        if (reverseAdj[v]) reverseAdj[v].push(u);
        if (inDegree[v] !== undefined) inDegree[v]++;
    }
    
    var levelMap = {};
    var queue = [];
    
    for (var idKey in inDegree) {
        if (inDegree[idKey] === 0) {
            queue.push(idKey);
            levelMap[idKey] = 0;
        }
    }
    
    if (queue.length === 0 && nodes.length > 0) {
        queue.push(nodes[0].id);
        levelMap[nodes[0].id] = 0;
    }
    
    while (queue.length > 0) {
        var curr = queue.shift();
        var currLevel = levelMap[curr];
        var neighbors = adjList[curr] || [];
        
        for (var n = 0; n < neighbors.length; n++) {
            var nxt = neighbors[n];
            if (levelMap[nxt] === undefined || levelMap[nxt] < currLevel + 1) {
                levelMap[nxt] = currLevel + 1;
            }
            inDegree[nxt]--;
            if (inDegree[nxt] === 0) {
                queue.push(nxt);
            }
        }
    }
    
    for (var i = 0; i < nodes.length; i++) {
        var id = nodes[i].id;
        if (levelMap[id] === undefined) {
            levelMap[id] = 0;
        }
    }
    
    var levels = {};
    var maxLevel = 0;
    for (var nId in allNodesMap) {
        var lvl = levelMap[nId] !== undefined ? levelMap[nId] : 0;
        if (!levels[lvl]) levels[lvl] = [];
        levels[lvl].push(allNodesMap[nId]);
        if (lvl > maxLevel) maxLevel = lvl;
    }
    
    var marginX = 100;
    var marginY = 80;
    var usableWidth = Math.max(width - marginX * 2, 600);
    var usableHeight = Math.max(height - marginY * 2, 500);
    
    var layoutNodes = [];
    var nodePositions = {};
    
    for (var l = 0; l <= maxLevel; l++) {
        var columnNodes = levels[l] || [];
        var count = columnNodes.length;
        
        var x = marginX + (l / Math.max(maxLevel, 1)) * usableWidth;
        var dynamicRowStep = usableHeight / Math.max(count + 1, 2);
        dynamicRowStep = Math.max(dynamicRowStep, 110);
        
        var totalColumnHeight = (count - 1) * dynamicRowStep;
        var startY = (height - totalColumnHeight) / 2;
        
        for (var idx = 0; idx < count; idx++) {
            var nodeObj = columnNodes[idx];
            var y = startY + idx * dynamicRowStep;
            
            var xOffset = 0;
            if (count > 1) {
                xOffset = (idx % 2 === 0 ? -1 : 1) * Math.min(30, (count - 1) * 8);
            }
            
            var finalX = x + xOffset;
            var finalY = y;
            
            layoutNodes.push({
                node: nodeObj,
                x: finalX,
                y: finalY
            });
            
            nodePositions[nodeObj.id] = { x: finalX, y: finalY };
        }
    }
    
    var iterations = 120;
    var repulsionForce = 1.2;
    var minDist = 130;
    
    for (var iter = 0; iter < iterations; iter++) {
        var forces = {};
        for (var i = 0; i < layoutNodes.length; i++) {
            var id = layoutNodes[i].node.id;
            forces[id] = { fx: 0, fy: 0 };
        }
        
        for (var i = 0; i < layoutNodes.length; i++) {
            for (var j = i + 1; j < layoutNodes.length; j++) {
                var n1 = layoutNodes[i];
                var n2 = layoutNodes[j];
                var p1 = nodePositions[n1.node.id];
                var p2 = nodePositions[n2.node.id];
                
                var dx = p2.x - p1.x;
                var dy = p2.y - p1.y;
                var dist = Math.sqrt(dx * dx + dy * dy);
                
                if (dist < minDist && dist > 0) {
                    var force = repulsionForce * ((minDist - dist) / minDist);
                    var angle = Math.atan2(dy, dx);
                    
                    forces[n1.node.id].fx -= Math.cos(angle) * force * 12;
                    forces[n1.node.id].fy -= Math.sin(angle) * force * 12;
                    forces[n2.node.id].fx += Math.cos(angle) * force * 12;
                    forces[n2.node.id].fy += Math.sin(angle) * force * 12;
                }
            }
        }
        
        for (var i = 0; i < layoutNodes.length; i++) {
            var id = layoutNodes[i].node.id;
            var p = nodePositions[id];
            var f = forces[id];
            
            p.x += f.fx * 0.3;
            p.y += f.fy * 0.3;
            
            p.x = Math.max(marginX / 2, Math.min(width - marginX / 2, p.x));
            p.y = Math.max(marginY / 2, Math.min(height - marginY / 2, p.y));
        }
    }
    
    for (var i = 0; i < layoutNodes.length; i++) {
        var id = layoutNodes[i].node.id;
        var p = nodePositions[id];
        layoutNodes[i].x = p.x;
        layoutNodes[i].y = p.y;
    }
    
    return {
        layoutNodes: layoutNodes,
        nodePositions: nodePositions,
        width: width,
        height: height
    };
}

// ============================================================
// 拓扑图主渲染入口
// ============================================================

function renderHierarchicalGraph(data, status, activeId) {
    var container = document.getElementById(containerId);
    if (!container) {
        setTimeout(function() { renderHierarchicalGraph(data, status, activeId); }, 200);
        return;
    }
    
    stopForceLayout();
    
    var parentElem = container.parentElement;
    var width = parentElem ? parentElem.clientWidth - 40 : 900;
    var height = parentElem ? Math.max(parentElem.clientHeight - 40, 600) : 700;
    
    container.style.width = width + 'px';
    container.style.height = height + 'px';
    
    if (treeChart) {
        treeChart.dispose();
        treeChart = null;
    }
    
    if (typeof echarts === 'undefined') return;
    
    treeChart = echarts.init(container);
    
    var layoutResult = calculateHierarchicalLayout(data.nodes, data.edges, width, height);
    var layoutNodes = layoutResult.layoutNodes;
    var nodePositions = layoutResult.nodePositions;
    
    forceLayoutNodes = layoutNodes;
    forceLayoutEdges = data.edges;
    isForceLayoutRunning = true;
    
    var resizeHandler = function() {
        if (treeChart) treeChart.resize();
    };
    window.addEventListener('resize', resizeHandler);
    if (window._chartResizeHandler) {
        window.removeEventListener('resize', window._chartResizeHandler);
    }
    window._chartResizeHandler = resizeHandler;
    
    // 首次渲染图表
    renderEChartsGraph(layoutNodes, data.edges, status, activeId, width, height, true);
    // 启动微动飘动动画
    startFloatingAnimation(layoutNodes, nodePositions, data, status, activeId);
}

// ============================================================
// ECharts 核心渲染（已完美融合：自由缩放/平移/拖拽 + 点击邻居高亮）
// ============================================================

function renderEChartsGraph(layoutNodes, edges, status, activeId, width, height, isFirstInit) {
    if (!treeChart) return;
    status = treeStatus || status;
    activeId = treeActiveId;

    var typeStyles = {
        'Begin': { bg: '#1e293b', border: '#1e293b', textColor: '#ffffff', symbolSize: 52, isRoot: true },
        'Root': { bg: '#1e293b', border: '#1e293b', textColor: '#ffffff', symbolSize: 56, isRoot: true },
        'Retrieval': { bg: '#ffffff', border: '#f59e0b', textColor: '#1e293b', symbolSize: 44, isRoot: false },
        'CodeExec': { bg: '#ffffff', border: '#10b981', textColor: '#1e293b', symbolSize: 44, isRoot: false },
        'Message': { bg: '#ffffff', border: '#ec4899', textColor: '#1e293b', symbolSize: 44, isRoot: false },
        'Agent': { bg: '#ffffff', border: '#8b5cf6', textColor: '#1e293b', symbolSize: 44, isRoot: false },
        'default': { bg: '#ffffff', border: '#3b82f6', textColor: '#1e293b', symbolSize: 42, isRoot: false }
    };

    // 1. 计算当前选中节点的邻居节点集合
    var adjacentNodeSet = new Set();
    if (highlightedNodeId) {
        adjacentNodeSet.add(highlightedNodeId);
        for (var e = 0; e < edges.length; e++) {
            if (edges[e].source === highlightedNodeId) {
                adjacentNodeSet.add(edges[e].target);
            } else if (edges[e].target === highlightedNodeId) {
                adjacentNodeSet.add(edges[e].source);
            }
        }
    }

    // 2. 构建节点数据 (eNodes)
    var eNodes = [];
    for (var i = 0; i < layoutNodes.length; i++) {
        var item = layoutNodes[i];
        var node = item.node;
        var runState = nodeRunState[node.id] || '';
        var isActive = runState === 'running' || node.id === activeId;
        var isSelected = (node.id === highlightedNodeId);
        var isNeighbor = adjacentNodeSet.has(node.id) && !isSelected;
        
        var isDimmed = highlightedNodeId && !adjacentNodeSet.has(node.id);
        var opacity = isDimmed ? 0.2 : 1;

        var style = typeStyles[node.type] || typeStyles['default'];
        var bgColor = style.bg;
        var borderColor = style.border;
        var symbolSize = style.symbolSize;
        var shadowBlur = 0;
        var shadowColor = 'transparent';
        var borderWidth = style.isRoot ? 0 : 3;

        if (runState === 'done') {
            bgColor = '#dcfce7';
            borderColor = '#22c55e';
            borderWidth = 4;
        } else if (runState === 'error') {
            bgColor = '#fee2e2';
            borderColor = '#ef4444';
            borderWidth = 4;
        }
        if (isActive && (status === 'running' || runState === 'running')) {
            bgColor = '#3b82f6';
            borderColor = '#3b82f6';
            shadowBlur = 30;
            shadowColor = 'rgba(59,130,246,0.6)';
            symbolSize += 10;
            borderWidth = 4;
        }

        if (isSelected) {
            borderColor = '#10b981'; // 选中节点绿框加粗
            borderWidth = 5;
            shadowBlur = 20;
            shadowColor = 'rgba(16, 185, 129, 0.4)';
            symbolSize += 6;
        } else if (isNeighbor) {
            borderColor = '#8b5cf6'; // 邻居关联节点紫框
            borderWidth = 4;
        }

        eNodes.push({
            id: node.id,
            name: node.name,
            fullName: node.fullName,
            desc: node.desc,
            type: node.type,
            x: item.x,
            y: item.y,
            symbol: 'circle',
            symbolSize: symbolSize,
            itemStyle: {
                color: bgColor,
                borderColor: borderColor,
                borderWidth: borderWidth,
                shadowBlur: shadowBlur,
                shadowColor: shadowColor,
                opacity: opacity
            },
            label: {
                show: true,
                position: 'bottom',
                distance: 12,
                color: isDimmed ? 'rgba(30, 41, 59, 0.2)' : (runState === 'error' ? '#ef4444' : runState === 'done' ? '#15803d' : isActive ? '#1d4ed8' : isSelected ? '#10b981' : '#1e293b'),
                fontSize: isSelected ? 13 : 12,
                fontWeight: isSelected ? 700 : 500,
                formatter: function(params) {
                    var state = nodeRunState[params.data.id];
                    var mark = state === 'running' ? ' ●' : state === 'done' ? ' ✓' : state === 'error' ? ' !' : '';
                    return params.data.name + mark;
                }
            }
        });
    }

    // 3. 构建连线数据 (eLinks)
    var eLinks = [];
    for (var j = 0; j < edges.length; j++) {
        var edge = edges[j];
        var isConnected = highlightedNodeId && (edge.source === highlightedNodeId || edge.target === highlightedNodeId);
        var isEdgeDimmed = highlightedNodeId && !isConnected;
        var srcState = nodeRunState[edge.source];
        var tgtState = nodeRunState[edge.target];
        var edgeColor = isConnected ? '#8b5cf6' : '#c8d0da';
        var edgeWidth = isConnected ? 2.5 : 1.5;
        if (!isConnected && srcState === 'done' && (tgtState === 'done' || tgtState === 'running' || tgtState === 'error')) {
            edgeColor = tgtState === 'running' ? '#3b82f6' : tgtState === 'error' ? '#ef4444' : '#22c55e';
            edgeWidth = 2.5;
        }

        eLinks.push({
            source: edge.source,
            target: edge.target,
            lineStyle: {
                color: edgeColor,
                width: edgeWidth,
                opacity: isEdgeDimmed ? 0.1 : 0.9,
                curveness: 0.15
            }
        });
    }

    // 4. ECharts Option 配置
    var option = {
        backgroundColor: '#fafcfe',
        tooltip: {
            trigger: 'item',
            formatter: function(params) {
                if (params.dataType === 'node') {
                    return '<div style="font-weight:600;font-size:14px;color:#0f172a;margin-bottom:4px;">' + (params.data.fullName || params.data.name) + '</div>' +
                           '<div style="color:#3b82f6;font-size:12px;margin-bottom:2px;">类型: ' + (params.data.type || 'Unknown') + '</div>' +
                           '<div style="color:#64748b;font-size:12px;max-width:240px;white-space:pre-wrap;">' + (params.data.desc || '无描述') + '</div>' +
                           '<div style="color:#0f172a;font-size:12px;margin-top:4px;">状态: ' + runStateLabel(nodeRunState[params.data.id]) + '</div>';
                }
                return '';
            },
            backgroundColor: 'rgba(255, 255, 255, 0.96)',
            borderColor: '#e9edf2',
            borderWidth: 1,
            borderRadius: 8,
            padding: [10, 14],
            extraCssText: 'box-shadow: 0 4px 16px rgba(0,0,0,0.08);'
        },
        series: [{
            type: 'graph',
            layout: 'none',
            data: eNodes,
            links: eLinks,
            roam: true,       // 允许拖动画布与滚轮缩放
            draggable: true,  // 允许单节点自由拖拽移动
            edgeSymbol: ['none', 'arrow'],
            edgeSymbolSize: [0, 8],
            emphasis: {
                disabled: true
            }
        }]
    };

    // 关键点：首次初始化时配置初始 zoom，后续微动更新使用 notMerge: false 增量模式，避免抹掉用户的缩放/平移
    if (isFirstInit) {
        option.series[0].zoom = 0.85;
        treeChart.setOption(option, true);
    } else {
        treeChart.setOption(option, false);
    }

    treeChart.resize();

    // 5. 点击交互逻辑
    if (treeChart._clickHandler) {
        treeChart.off('click', treeChart._clickHandler);
    }

    treeChart._clickHandler = function(params) {
        if (params.dataType === 'node' && params.data) {
            var nodeId = params.data.id;
            highlightedNodeId = (highlightedNodeId === nodeId) ? null : nodeId;
            renderEChartsGraph(forceLayoutNodes, edges, status, activeId, width, height, false);
        } else {
            if (highlightedNodeId !== null) {
                highlightedNodeId = null;
                renderEChartsGraph(forceLayoutNodes, edges, status, activeId, width, height, false);
            }
        }
    };

    treeChart.on('click', treeChart._clickHandler);

    // 6. 【关键修复】监听节点拖拽结束事件，把拖拽后的新坐标更新为微动动画的基准坐标（防止节点复位）
    if (!treeChart._dragEndHandler) {
        treeChart._dragEndHandler = function(params) {
            if (params.dataType === 'node' && params.data && params.event) {
                var id = params.data.id;
                // 获取拖拽后的实际位置并覆写基准点
                if (basePositions[id] && typeof params.data.x === 'number') {
                    basePositions[id].x = params.data.x;
                    basePositions[id].y = params.data.y;
                }
            }
        };
        treeChart.on('dragend', treeChart._dragEndHandler);
    }
}

// ============================================================
// 浮动动画（完美适配缩放与拖拽）
// ============================================================

function startFloatingAnimation(layoutNodes, nodePositions, data, status, activeId) {
    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
    }
    
    var time = 0;
    var amplitudes = {};
    
    for (var i = 0; i < layoutNodes.length; i++) {
        var id = layoutNodes[i].node.id;
        amplitudes[id] = {
            ampX: 2 + Math.random() * 4,
            ampY: 2 + Math.random() * 4,
            phaseX: Math.random() * Math.PI * 2,
            phaseY: Math.random() * Math.PI * 2,
            speed: 0.004 + Math.random() * 0.008
        };
    }
    
    basePositions = {};
    for (var i = 0; i < layoutNodes.length; i++) {
        var id = layoutNodes[i].node.id;
        var pos = nodePositions[id];
        if (pos) {
            basePositions[id] = { x: pos.x, y: pos.y };
        } else {
            basePositions[id] = { x: layoutNodes[i].x, y: layoutNodes[i].y };
        }
    }
    
    var container = document.getElementById(containerId);
    var width = container ? container.clientWidth : 900;
    var height = container ? container.clientHeight : 700;
    
    function animate() {
        if (!isForceLayoutRunning || !treeChart) return;
        
        time += 1;
        
        var updatedNodes = [];
        for (var i = 0; i < layoutNodes.length; i++) {
            var item = layoutNodes[i];
            var id = item.node.id;
            var base = basePositions[id];
            var amp = amplitudes[id];
            
            if (base) {
                var floatX = Math.sin(time * amp.speed + amp.phaseX) * amp.ampX;
                var floatY = Math.cos(time * amp.speed * 0.8 + amp.phaseY) * amp.ampY;
                
                updatedNodes.push({
                    node: item.node,
                    x: base.x + floatX,
                    y: base.y + floatY
                });
            } else {
                updatedNodes.push({
                    node: item.node,
                    x: item.x,
                    y: item.y
                });
            }
        }
        
        forceLayoutNodes = updatedNodes;
        // 增量渲染模式：传入 isFirstInit = false，保留当前的视口 zoom 和 center 偏移
        renderEChartsGraph(updatedNodes, data.edges, treeStatus, treeActiveId, width, height, false);
        
        animationFrameId = requestAnimationFrame(animate);
    }
    
    animate();
}

function stopForceLayout() {
    isForceLayoutRunning = false;
    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
    }
}

// ============================================================
// 运行与控制辅助逻辑
// ============================================================

function escapeHtml(text) {
    if (!text) return '';
    var div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function loadAgentViews() {
    try {
        var raw = sessionStorage.getItem(AGENT_VIEW_KEY);
        if (!raw) return;
        var data = JSON.parse(raw);
        agentLogs = data.logs || {};
        agentCanvasState = data.canvas || {};
    } catch (error) {
        agentLogs = {};
        agentCanvasState = {};
    }
}

function persistAgentViews() {
    if (currentAgentId) {
        agentLogs[currentAgentId] = logEntries.slice();
        agentCanvasState[currentAgentId] = {
            nodeRunState: Object.assign({}, nodeRunState),
            treeStatus: treeStatus
        };
    }
    try {
        sessionStorage.setItem(AGENT_VIEW_KEY, JSON.stringify({ logs: agentLogs, canvas: agentCanvasState }));
    } catch (error) { /* 日志过大时放弃写入，内存中仍然保留。 */ }
}

function restoreAgentView(agentId) {
    var saved = agentCanvasState[agentId] || {};
    nodeRunState = Object.assign({}, saved.nodeRunState || {});
    treeStatus = saved.treeStatus && saved.treeStatus !== 'running' ? saved.treeStatus : 'idle';
    treeActiveId = null;
    logEntries = (agentLogs[agentId] || []).slice();
    paintLog();
    updateStatus(treeStatus === 'error' ? 'error' : treeStatus === 'done' ? 'done' : 'idle');
    updateProgress();
}

function listDotState(agentId) {
    if (isRunning && agentId === currentAgentId) return 'running';
    var saved = agentId === currentAgentId
        ? { nodeRunState: nodeRunState, treeStatus: treeStatus }
        : (agentCanvasState[agentId] || {});
    if (saved.treeStatus === 'error') return 'error';
    var states = saved.nodeRunState || {};
    var anyDone = false;
    for (var key in states) {
        if (states[key] === 'error') return 'error';
        if (states[key] === 'done') anyDone = true;
    }
    if (saved.treeStatus === 'done' || anyDone) return 'done';
    return 'idle';
}

function listDotClass(agentId) {
    var state = listDotState(agentId);
    return state === 'idle' ? '' : ' ' + state;
}

function syncListDots() {
    if (!agentListEl) return;
    var items = agentListEl.querySelectorAll('.agent-item');
    for (var i = 0; i < items.length; i++) {
        var dot = items[i].querySelector('.status-dot');
        if (!dot) continue;
        var state = listDotState(items[i].getAttribute('data-id'));
        dot.className = 'status-dot' + (state === 'idle' ? '' : ' ' + state);
    }
}

function runStateLabel(state) {
    if (state === 'running') return '执行中';
    if (state === 'done') return '已完成';
    if (state === 'error') return '失败';
    return '未开始';
}

function updateProgress() {
    var nodes = rawGraphData.nodes || [];
    var done = 0;
    var running = 0;
    var failed = 0;
    var runningName = '';
    for (var i = 0; i < nodes.length; i++) {
        var state = nodeRunState[nodes[i].id];
        if (state === 'done') done++;
        else if (state === 'error') failed++;
        else if (state === 'running') {
            running++;
            runningName = nodes[i].name || nodes[i].fullName || nodes[i].id;
        }
    }
    var text = document.getElementById('runProgress');
    var bar = document.getElementById('workflowProgress');
    var fill = document.getElementById('workflowProgressFill');
    var total = nodes.length;
    var active = done + running + failed;
    if (text) {
        text.textContent = active
            ? ' · 已完成 ' + done + '/' + total + (runningName ? ' · 当前 ' + runningName : '') + (failed ? ' · 失败 ' + failed : '')
            : '';
    }
    if (bar && fill) {
        bar.hidden = !active;
        fill.style.width = total ? Math.min(100, ((done + failed + running * 0.45) / total) * 100) + '%' : '0';
        fill.className = 'workflow-progress-fill' + (failed ? ' error' : running ? ' running' : ' done');
    }
}

function noteNodeEvent(kind, data) {
    var id = data.component_id;
    if (!id) return;
    if (kind === 'node_started') {
        nodeRunState[id] = 'running';
        treeStatus = 'running';
        treeActiveId = id;
    } else {
        nodeRunState[id] = data.error ? 'error' : 'done';
        treeActiveId = null;
        for (var key in nodeRunState) {
            if (nodeRunState[key] === 'running') treeActiveId = key;
        }
    }
    updateProgress();
    syncListDots();
}

function updateStatus(status) {
    var statusMap = {
        'idle': { dot: 'idle', text: '空闲', color: '#94a3b8' },
        'running': { dot: 'running', text: '运行中', color: '#22c55e' },
        'done': { dot: 'done', text: '已完成', color: '#3b82f6' },
        'error': { dot: 'error', text: '错误', color: '#ef4444' }
    };

    var info = statusMap[status] || statusMap['idle'];
    statusDot.className = 'dot ' + info.dot;
    statusText.textContent = info.text;
    agentStatusSm.textContent = '● ' + info.text;
    agentStatusSm.style.color = info.color;
}

function upsertAnswerLog(text) {
    var index = -1;
    for (var i = logEntries.length - 1; i >= 0; i--) {
        if (logEntries[i].kind === 'answer') {
            index = i;
            break;
        }
    }
    var item = {
        time: index >= 0 ? logEntries[index].time : new Date().toLocaleTimeString(),
        level: 'info',
        kind: 'answer',
        message: text
    };
    if (index >= 0) logEntries[index] = item;
    else logEntries.push(item);
    if (currentAgentId) agentLogs[currentAgentId] = logEntries.slice();
}

function paintLog() {
    if (!logBody) return;
    logBody.innerHTML = '';
    if (!logEntries.length) {
        logBody.innerHTML = '<div class="log-empty"><i class="fas fa-terminal"></i><span>等待执行...</span></div>';
        logCount.textContent = '0 条';
        return;
    }
    for (var i = 0; i < logEntries.length; i++) {
        var item = logEntries[i];
        var entry = document.createElement('div');
        entry.className = 'log-entry ' + item.level;
        entry.innerHTML =
            '<span class="log-time">[' + escapeHtml(item.time) + ']</span>' +
            '<span class="log-level">' + escapeHtml(item.level) + '</span>' +
            '<span class="log-msg">' + escapeHtml(String(item.message)) + '</span>';
        logBody.appendChild(entry);
    }
    logBody.scrollTop = logBody.scrollHeight;
    logCount.textContent = logEntries.length + ' 条';
}

function addLog(level, message) {
    var time = new Date().toLocaleTimeString();
    logEntries.push({ time: time, level: level, message: message });
    if (currentAgentId) agentLogs[currentAgentId] = logEntries.slice();

    var empty = logBody.querySelector('.log-empty');
    if (empty) empty.remove();

    var entry = document.createElement('div');
    entry.className = 'log-entry ' + level;
    entry.innerHTML =
        '<span class="log-time">[' + time + ']</span>' +
        '<span class="log-level">' + level + '</span>' +
        '<span class="log-msg">' + escapeHtml(String(message)) + '</span>';

    logBody.appendChild(entry);
    logBody.scrollTop = logBody.scrollHeight;
    logCount.textContent = logEntries.length + ' 条';
}

function clearLog() {
    logEntries = [];
    if (currentAgentId) agentLogs[currentAgentId] = [];
    paintLog();
}

function resetAll() {
    if (isRunning) stopAgent();
    isRunning = false;
    currentStep = -1;
    stepTimers = [];
    clearLog();
    updateStatus('idle');
    btnRun.className = 'btn-run';
    btnText.textContent = '运行';
    btnRun.querySelector('i').className = 'fas fa-play';
    
    highlightedNodeId = null;
    
    if (rawGraphData.nodes.length > 0) {
        treeStatus = 'idle';
        treeActiveId = null;
        stopForceLayout();
        renderHierarchicalGraph(rawGraphData, treeStatus, treeActiveId);
    }
}

function toggleRun() {
    if (isRunning) stopAgent();
    else startAgent();
}

async function startAgent() {
    if (isRunning || !currentAgentId || !agentReady) return;
    var query = '';
    if (agentDialogueMode === 'conversational') {
        var entered = prompt('请输入您的提问:', '');
        if (!entered || !entered.trim()) return;
        query = entered.trim();
    }
    var run = { agentId: currentAgentId, sessionId: currentSessionId, cancelled: false, cancelPromise: null };
    agentRun = run;
    isRunning = true;
    nodeRunState = {};
    treeStatus = 'running';
    treeActiveId = null;
    btnRun.disabled = true;
    btnText.textContent = '准备会话...';
    updateStatus('running');
    updateProgress();
    syncListDots();
    clearLog();
    addLog('info', query || '开始执行任务');
    try {
        if (!run.sessionId) {
            var session = await portalRequest('agent_session_create', { agent_id: run.agentId });
            if (!session?.id) throw new Error('未返回 Agent 会话 ID');
            run.sessionId = session.id;
            currentSessionId = session.id;
        }
        btnRun.disabled = false;
        btnRun.className = 'btn-run running';
        btnText.textContent = '停止';
        var content = '', thinking = '', inThinking = false, reference = null;
        var output = document.createElement('div');
        output.className = 'log-entry';
        var waitingForInput = false, workflowFinished = false;
        await portalStream('agent_converse', { agent_id: run.agentId, session_id: run.sessionId, query: query.trim() }, function(event) {
            if (run.cancelled) return;
            var data = event.data || {};
            if (event.event === 'message') {
                if (data.start_to_think) inThinking = true;
                if (data.end_to_think) inThinking = false;
                if (inThinking) thinking += data.content || '';
                else content += data.content || '';
            }
            if (data.reference) reference = data.reference;
            if (event.event === 'message' || event.event === 'message_end') {
                if (content) upsertAnswerLog(content);
                if (event.event === 'message_end') persistAgentViews();
                if (!output.parentNode) logBody.appendChild(output);
                output.innerHTML = '<div class="log-msg">' +
                    (thinking ? '<details><summary>思考过程</summary>' + renderSafeMarkdown(thinking) + '</details>' : '') +
                    renderSafeMarkdown(content) + renderChatReferences(reference) + '</div>';
                logBody.scrollTop = logBody.scrollHeight;
            }
            if (event.event === 'node_started' || event.event === 'node_finished') {
                noteNodeEvent(event.event, data);
                addLog(data.error ? 'warning' : 'info', (data.component_name || data.component_id || '节点') +
                    (event.event === 'node_started' ? ' 开始执行' : ' 执行结束') + (data.error ? '：' + data.error : ''));
                if (data.error) run.nodeError = String(data.error);
            }
            if (event.event === 'user_inputs') {
                waitingForInput = true;
                addLog('warning', '工作流等待补充输入：' + (data.tips || JSON.stringify(data.inputs || {})));
            }
            if (event.event === 'workflow_finished') {
                workflowFinished = true;
                treeActiveId = null;
                treeStatus = data.outputs === 'Task has been canceled' ? 'idle' : 'done';
                if (data.outputs === 'Task has been canceled') run.cancelled = true;
                updateProgress();
                syncListDots();
            }
        });
        if (run.cancelPromise) await run.cancelPromise;
        if (run.cancelled) return;
        if (run.nodeError && !workflowFinished && !waitingForInput) throw new Error(run.nodeError);
        if (!content && !waitingForInput) addLog('info', '本轮结束，未返回文本内容');
        finishAgent(true, waitingForInput);
    } catch (error) {
        if (run.cancelPromise) await run.cancelPromise;
        if (!run.cancelled) { addLog('error', '运行失败：' + error.message); finishAgent(false); }
    } finally {
        if (run.cancelled) {
            currentSessionId = null;
            isRunning = false;
            btnText.textContent = '运行';
            btnRun.className = 'btn-run';
            updateStatus('idle');
            addLog('warning', '取消请求已确认，本轮请求已结束');
        }
        agentRun = null;
        btnRun.disabled = false;
    }
}

function finishAgent(success, waitingForInput) {
    isRunning = false;
    treeActiveId = null;
    for (var i = 0; i < stepTimers.length; i++) clearTimeout(stepTimers[i]);
    stepTimers = [];
    if (!success) treeStatus = 'error';
    else if (!waitingForInput) treeStatus = 'done';
    updateProgress();
    syncListDots();

    if (success) {
        btnRun.className = 'btn-run done';
        btnText.textContent = '完成';
        btnRun.querySelector('i').className = 'fas fa-check';
        updateStatus('done');
        if (waitingForInput) {
            btnText.textContent = '继续';
            statusText.textContent = '等待输入';
            agentStatusSm.textContent = '● 等待输入';
        } else addLog('success', '🎉 Agent 任务执行完成！');
    } else {
        btnRun.className = 'btn-run error';
        btnText.textContent = '错误';
        btnRun.querySelector('i').className = 'fas fa-exclamation-circle';
        updateStatus('error');
    }
    persistAgentViews();

    setTimeout(function() {
        if (!isRunning) {
            btnRun.className = 'btn-run';
            btnText.textContent = waitingForInput ? '继续' : '运行';
            btnRun.querySelector('i').className = 'fas fa-play';
        }
    }, 2500);
}

async function stopAgent() {
    var run = agentRun;
    if (!run || !run.sessionId || run.cancelPromise) return;
    btnRun.disabled = true;
    btnText.textContent = '取消中...';
    run.cancelPromise = (async function() {
        try {
            await portalRequest('agent_cancel', { agent_id: run.agentId, session_id: run.sessionId });
            run.cancelled = true;
            btnText.textContent = '等待任务结束';
            addLog('warning', '已向后端发送取消请求');
        } catch (error) {
            addLog('error', '取消失败：' + error.message);
            btnText.textContent = '停止';
            btnRun.disabled = false;
        }
    })();
    await run.cancelPromise;
    if (!run.cancelled) run.cancelPromise = null;
}

function deleteAgent(agentId) {
    if (isRunning) return alert('请等待当前任务结束后再删除');
    if (!confirm('确定要删除该 Agent 吗？')) return;
    fetch('/api.php?action=agent_delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agent_id: agentId })
    })
    .then(function(r) { return r.json(); })
    .then(function(res) {
        if (res.code === 0) {
            var wasCurrent = currentAgentId === agentId;
            delete agentLogs[agentId];
            delete agentCanvasState[agentId];
            currentAgents = currentAgents.filter(function(a) { return a.id !== agentId; });
            if (wasCurrent) currentAgentId = null;
            persistAgentViews();
            renderAgentList();
            if (wasCurrent) {
                resetAll();
                if (currentAgents.length > 0) selectAgent(currentAgents[0].id);
                else showEmptyState();
            }
        }
    });
}

function showCreateAgentModal() {
    document.getElementById('newAgentName').value = '';
    document.getElementById('newAgentDesc').value = '';
    var modal = new bootstrap.Modal(document.getElementById('createAgentModal'));
    modal.show();
}

function closeCreateModal() {
    var modal = bootstrap.Modal.getInstance(document.getElementById('createAgentModal'));
    if (modal) modal.hide();
}

function confirmCreateAgent() {
    var name = document.getElementById('newAgentName').value.trim();
    var desc = document.getElementById('newAgentDesc').value.trim();
    if (!name) return alert('请输入 Agent 名称');

    fetch('/api.php?action=agent_create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: name, description: desc || '' })
    })
    .then(function(r) { return r.json(); })
    .then(function(res) {
        if (res.code === 0) {
            closeCreateModal();
            loadAgents();
        }
    });
}

function showEmptyState() {
    currentAgentId = null;
    currentSessionId = null;
    agentReady = false;
    btnRun.disabled = true;
    rawGraphData = { nodes: [], edges: [] };
    if (treeChart) treeChart.clear();
    agentAvatarSm.textContent = '?';
    agentNameSm.textContent = '无 Agent';
    agentDescSm.textContent = '请创建新的 Agent';
    agentStatusSm.textContent = '● 空闲';
    agentStatusSm.style.color = '#94a3b8';
    totalSteps.textContent = '0';
}

// 全局暴露接口
window.toggleRun = toggleRun;
window.showCreateAgentModal = showCreateAgentModal;
window.closeCreateModal = closeCreateModal;
window.confirmCreateAgent = confirmCreateAgent;
window.deleteAgent = deleteAgent;
window.selectAgent = selectAgent;
