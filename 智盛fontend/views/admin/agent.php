<?php
require_once __DIR__ . '/../../auth.php';
$currentUser = checkAdmin();
?>
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>VIVARILY · Agent 工作流</title>
    <link href="/vendor/bootstrap/css/bootstrap.min.css" rel="stylesheet" />
    <link href="/vendor/font-awesome/css/all.min.css" rel="stylesheet" />
    <link href="/css/style.css" rel="stylesheet" />
    <script src="/vendor/echarts/echarts.min.js"></script>
    <script src="/vendor/marked/marked.min.js"></script>
    <script src="/vendor/dompurify/purify.min.js"></script>
</head>
<body data-portal-role="<?php echo htmlspecialchars($currentUser['role'], ENT_QUOTES); ?>">
<div class="vivarly-frame">
    <div class="view-pane">
        <?php $page = 'agent'; include PROJECT_ROOT . '/templates/navbar.php'; ?>

        <div class="agent-container">

            <!-- ===== 头部 ===== -->
            <div class="agent-header">
                <div class="left">
                    <div class="agent-title">
                        <i class="fas fa-robot text-primary me-2"></i>
                        <span>Agent 工作流</span>
                        <span class="badge bg-light text-dark border ms-2">智能体管理</span>
                    </div>
                </div>
                <div class="right">
                    <span class="status-badge" id="statusBadge">
                        <span class="dot idle" id="statusDot"></span>
                        <span id="statusText">空闲</span>
                    </span>
                    <button class="btn-run" id="btnRun" onclick="toggleRun()">
                        <i class="fas fa-play"></i> <span id="btnText">运行</span>
                    </button>
                </div>
            </div>

            <!-- ===== 主体 ===== -->
            <div class="agent-body">

                <!-- ===== 左侧：Agent 列表 ===== -->
                <div class="agent-sidebar">
                    <div class="sidebar-header">
                        <span class="title"><i class="fas fa-robot text-primary me-1"></i>Agent 列表</span>
                        <button class="btn-new" onclick="showCreateAgentModal()"><i class="fas fa-plus"></i> 新建</button>
                    </div>
                    <div class="agent-list" id="agentList">
                        <div class="text-center text-muted py-3 small"><i class="fas fa-spinner fa-spin me-1"></i>加载中...</div>
                    </div>
                </div>

                <!-- ===== 中间：工作流树形图 ===== -->
                <div class="agent-workflow">
                    <div class="workflow-header">
                        <span class="title"><i class="fas fa-sitemap text-primary me-1"></i> 执行流程</span>
                        <span class="step-indicator" id="stepIndicator">
                            共 <span id="totalSteps">0</span> 个节点
                        </span>
                    </div>

                    <div class="agent-info-bar" id="agentInfoBar">
                        <div class="avatar-sm" id="agentAvatarSm">A</div>
                        <span class="name-sm" id="agentNameSm">选择 Agent</span>
                        <span class="desc-sm" id="agentDescSm">从左侧选择一个 Agent</span>
                        <span class="spacer"></span>
                        <span class="status-sm" id="agentStatusSm">● 空闲</span>
                        <span class="legend-hint">
                            <span class="legend-item"><span class="legend-dot" style="background:#1e293b;"></span>Begin</span>
                            <span class="legend-item"><span class="legend-dot" style="background:#dbeafe;border-color:#3b82f6;"></span>Agent</span>
                            <span class="legend-item"><span class="legend-dot" style="background:#fef3c7;border-color:#f59e0b;"></span>Retrieval</span>
                            <span class="legend-item"><span class="legend-dot" style="background:#dcfce7;border-color:#22c55e;"></span>CodeExec</span>
                            <span class="legend-item"><span class="legend-dot" style="background:#fce7f3;border-color:#ec4899;"></span>Message</span>
                            <span class="legend-item"><span class="legend-dot" style="background:#3b82f6;"></span>运行中</span>
                            <span class="legend-item"><span class="legend-dot" style="background:#22c55e;"></span>已完成</span>
                        </span>
                    </div>

                    <!-- 树形图容器 -->
                    <!-- 树形图容器 -->
                    <div id="treeChart" style="min-height:500px;"></div>

                    <!-- 底部操作提示 -->
                    <div class="workflow-tips">
                        <span><i class="fas fa-mouse-pointer"></i> 点击节点展开/收起</span>
                        <span><i class="fas fa-arrows-alt"></i> 拖拽移动</span>
                        <span><i class="fas fa-search-plus"></i> 滚轮缩放</span>
                    </div>
                </div>

                <!-- ===== 右侧：日志 ===== -->
                <div class="agent-log" id="logContainer">
                    <div class="log-header">
                        <span class="log-title"><i class="fas fa-terminal text-primary me-1"></i>运行日志</span>
                        <span class="log-count" id="logCount">0 条</span>
                    </div>
                    <div class="log-body" id="logBody">
                        <div class="log-empty">
                            <i class="fas fa-terminal"></i>
                            <span>等待执行...</span>
                        </div>
                    </div>
                </div>

            </div>
        </div>
    </div>
    <?php include PROJECT_ROOT . '/templates/footer.php'; ?>
</div>

<!-- ===== 新建 Agent 模态框 ===== -->
<div class="modal fade" id="createAgentModal" tabindex="-1" aria-hidden="true">
    <div class="modal-dialog modal-sm">
        <div class="modal-content border-0 rounded-4 shadow">
            <div class="modal-header">
                <h6 class="modal-title fw-bold"><i class="fas fa-robot text-primary me-2"></i>新建 Agent</h6>
                <button type="button" class="btn-close" onclick="closeCreateModal()"></button>
            </div>
            <div class="modal-body">
                <div class="mb-3">
                    <label class="form-label small fw-semibold">Agent 名称 <span class="text-danger">*</span></label>
                    <input type="text" id="newAgentName" class="form-control" placeholder="例如：数据分析助手" style="border-radius:0.75rem;">
                </div>
                <div class="mb-2">
                    <label class="form-label small fw-semibold">描述</label>
                    <textarea id="newAgentDesc" class="form-control" rows="2" placeholder="简要描述 Agent 功能..." style="border-radius:0.75rem;"></textarea>
                </div>
            </div>
            <div class="modal-footer">
                <button type="button" class="btn btn-light rounded-pill px-3" onclick="closeCreateModal()">取消</button>
                <button type="button" class="btn btn-dark rounded-pill px-3" onclick="confirmCreateAgent()"><i class="fas fa-check me-1"></i>创建</button>
            </div>
        </div>
    </div>
</div>

<script src="/vendor/bootstrap/js/bootstrap.bundle.min.js"></script>
<script src="/js/main.js"></script>
<script src="/js/app.js"></script>
<script src="/js/agent.js"></script>
</body>
</html>
