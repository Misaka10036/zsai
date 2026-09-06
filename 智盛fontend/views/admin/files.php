<?php
require_once __DIR__ . '/../../auth.php';
$currentUser = checkAdmin();
?>
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>VIVARILY · 文件管理</title>
    <link href="https://cdn.bootcdn.net/ajax/libs/twitter-bootstrap/5.3.0/css/bootstrap.min.css" rel="stylesheet" />
    <link href="https://cdn.bootcdn.net/ajax/libs/font-awesome/6.4.0/css/all.min.css" rel="stylesheet" />
    <link href="/css/style.css" rel="stylesheet" />
    <style>
        /* ===== 文件管理器布局 ===== */
        .file-manager {
            display: flex;
            gap: 1rem;
            flex: 1;
            min-height: 0;
            overflow: hidden;
        }

        /* ===== 左侧边栏 ===== */
        .file-sidebar {
            width: 260px;
            flex-shrink: 0;
            background: var(--bg-panel, #f8fafc);
            border-radius: var(--radius-card, 1.25rem);
            border: 1px solid var(--border-color, #e9edf2);
            padding: 0.8rem 0.6rem;
            display: flex;
            flex-direction: column;
            overflow: hidden;
        }
        .file-sidebar .sidebar-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 0 0.2rem 0.5rem;
            border-bottom: 1px solid var(--border-color, #e9edf2);
            flex-shrink: 0;
        }
        .file-sidebar .sidebar-header .title {
            font-weight: 600;
            font-size: 0.8rem;
            color: var(--text-muted, #64748b);
            text-transform: uppercase;
            letter-spacing: 0.3px;
        }
        .file-sidebar .sidebar-header .title i {
            color: var(--blue, #3b82f6);
        }
        .file-sidebar .sidebar-header .btn-new-folder {
            background: var(--dark, #1e293b);
            color: var(--text-white, #f8fafc);
            border: none;
            padding: 0.15rem 0.6rem;
            border-radius: var(--radius-full, 9999px);
            font-size: 0.65rem;
            cursor: pointer;
            transition: background 0.15s;
        }
        .file-sidebar .sidebar-header .btn-new-folder:hover {
            background: var(--dark-hover, #0f172a);
        }
        .file-sidebar .folder-tree {
            flex: 1;
            overflow-y: auto;
            padding: 0.3rem 0.1rem 0.3rem 0;
        }
        .file-sidebar .folder-tree::-webkit-scrollbar {
            width: 3px;
        }
        .file-sidebar .folder-tree::-webkit-scrollbar-thumb {
            background: #d1d9e6;
            border-radius: 10px;
        }

        .folder-item {
            display: flex;
            align-items: center;
            padding: 0.3rem 0.5rem;
            border-radius: var(--radius-sm, 0.5rem);
            cursor: pointer;
            transition: all 0.15s;
            gap: 0.4rem;
            font-size: 0.82rem;
            color: var(--text-secondary, #1e293b);
        }
        .folder-item:hover {
            background: var(--bg-hover, #f1f5f9);
        }
        .folder-item.active {
            background: var(--dark, #1e293b);
            color: var(--text-white, #f8fafc);
        }
        .folder-item .icon {
            width: 18px;
            text-align: center;
            flex-shrink: 0;
            color: var(--text-muted, #64748b);
            font-size: 0.75rem;
        }
        .folder-item.active .icon {
            color: rgba(255, 255, 255, 0.6);
        }
        .folder-item .name {
            flex: 1;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        .folder-item .badge-count {
            font-size: 0.55rem;
            background: var(--bg-card, #ffffff);
            padding: 0.05rem 0.4rem;
            border-radius: var(--radius-full, 9999px);
            color: var(--text-muted, #64748b);
        }
        .folder-item.active .badge-count {
            background: rgba(255, 255, 255, 0.15);
            color: rgba(255, 255, 255, 0.6);
        }
        .folder-item .folder-actions {
            display: flex;
            gap: 0.2rem;
            opacity: 0;
            transition: opacity 0.15s;
        }
        .folder-item:hover .folder-actions {
            opacity: 1;
        }
        .folder-item.active .folder-actions {
            opacity: 1;
        }
        .folder-item .folder-actions button {
            background: transparent;
            border: none;
            color: var(--text-light, #94a3b8);
            font-size: 0.55rem;
            padding: 0.05rem 0.15rem;
            cursor: pointer;
            border-radius: 3px;
            transition: all 0.15s;
        }
        .folder-item .folder-actions button:hover {
            color: var(--blue, #3b82f6);
            background: rgba(0,0,0,0.04);
        }
        .folder-item.active .folder-actions button:hover {
            color: rgba(255,255,255,0.8);
            background: rgba(255,255,255,0.08);
        }
        .folder-item .folder-actions button.danger:hover {
            color: var(--red, #ef4444);
        }

        /* ===== 主内容区 ===== */
        .file-main {
            flex: 1;
            min-width: 0;
            background: var(--bg-panel, #f8fafc);
            border-radius: var(--radius-card, 1.25rem);
            border: 1px solid var(--border-color, #e9edf2);
            display: flex;
            flex-direction: column;
            overflow: hidden;
        }

        /* ===== 工具栏 ===== */
        .file-toolbar {
            padding: 0.5rem 1rem;
            border-bottom: 1px solid var(--border-color, #e9edf2);
            background: var(--bg-card, #ffffff);
            display: flex;
            flex-wrap: wrap;
            gap: 0.4rem;
            align-items: center;
            flex-shrink: 0;
        }
        .file-toolbar .breadcrumb-nav {
            flex: 1;
            min-width: 0;
            display: flex;
            align-items: center;
            gap: 0.3rem;
            font-size: 0.78rem;
            color: var(--text-muted, #64748b);
            overflow: hidden;
            flex-wrap: wrap;
        }
        .file-toolbar .breadcrumb-nav .sep {
            color: var(--text-light, #94a3b8);
            font-size: 0.6rem;
        }
        .file-toolbar .breadcrumb-nav .crumb {
            cursor: pointer;
            transition: color 0.15s;
            white-space: nowrap;
        }
        .file-toolbar .breadcrumb-nav .crumb:hover {
            color: var(--blue, #3b82f6);
        }
        .file-toolbar .breadcrumb-nav .crumb.current {
            color: var(--text-primary, #0f172a);
            font-weight: 500;
        }
        .file-toolbar .search-input {
            border: 1px solid var(--border-light, #e2e8f0);
            border-radius: var(--radius-full, 9999px);
            padding: 0.15rem 0.8rem;
            font-size: 0.72rem;
            outline: none;
            background: var(--bg-card, #ffffff);
            width: 150px;
            transition: border-color 0.2s, box-shadow 0.2s;
        }
        .file-toolbar .search-input:focus {
            border-color: var(--border-focus, #3b82f6);
            box-shadow: var(--shadow-focus, 0 0 0 3px rgba(59,130,246,0.12));
        }
        .file-toolbar .btn-action {
            font-size: 0.7rem;
            padding: 0.2rem 0.7rem;
            border-radius: var(--radius-full, 9999px);
            border: 1px solid var(--border-color, #e9edf2);
            background: var(--bg-card, #ffffff);
            cursor: pointer;
            transition: all 0.15s;
            color: var(--text-secondary, #1e293b);
            display: inline-flex;
            align-items: center;
            gap: 4px;
        }
        .file-toolbar .btn-action:hover {
            border-color: #94a3b8;
            background: var(--bg-hover, #f1f5f9);
        }
        .file-toolbar .btn-action.primary {
            background: var(--dark, #1e293b);
            color: var(--text-white, #f8fafc);
            border-color: var(--dark, #1e293b);
        }
        .file-toolbar .btn-action.primary:hover {
            background: var(--dark-hover, #0f172a);
        }
        .file-toolbar .btn-action.danger {
            color: var(--red, #ef4444);
            border-color: var(--red, #ef4444);
        }
        .file-toolbar .btn-action.danger:hover {
            background: var(--red, #ef4444);
            color: var(--text-white, #f8fafc);
        }
        .file-toolbar .btn-action.success {
            color: var(--green, #22c55e);
            border-color: var(--green, #22c55e);
        }
        .file-toolbar .btn-action.success:hover {
            background: var(--green, #22c55e);
            color: var(--text-white, #f8fafc);
        }
        .file-toolbar .upload-mode-selector {
            display: flex;
            align-items: center;
            gap: 0.2rem;
            background: var(--bg-panel, #f8fafc);
            border-radius: var(--radius-full, 9999px);
            padding: 0.1rem 0.2rem;
            border: 1px solid var(--border-color, #e9edf2);
        }
        .file-toolbar .upload-mode-selector .mode-btn {
            font-size: 0.6rem;
            padding: 0.1rem 0.5rem;
            border-radius: var(--radius-full, 9999px);
            border: none;
            background: transparent;
            cursor: pointer;
            transition: all 0.15s;
            color: var(--text-muted, #64748b);
        }
        .file-toolbar .upload-mode-selector .mode-btn.active {
            background: var(--dark, #1e293b);
            color: var(--text-white, #f8fafc);
        }
        .file-toolbar .upload-mode-selector .mode-btn:hover:not(.active) {
            background: var(--bg-hover, #f1f5f9);
        }
        .file-toolbar .upload-mode-selector .mode-label {
            font-size: 0.6rem;
            color: var(--text-muted, #64748b);
            padding: 0 0.2rem;
        }
        .file-toolbar .selected-count {
            font-size: 0.7rem;
            color: var(--text-muted, #64748b);
        }

        /* ===== 文件网格 ===== */
        .file-list-wrap {
            flex: 1;
            overflow-y: auto;
            padding: 0.6rem;
        }
        .file-list-wrap::-webkit-scrollbar {
            width: 4px;
        }
        .file-list-wrap::-webkit-scrollbar-thumb {
            background: #d1d9e6;
            border-radius: 10px;
        }
        .file-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
            gap: 0.6rem;
        }
        .file-item {
            background: var(--bg-card, #ffffff);
            border-radius: 0.8rem;
            border: 1px solid var(--border-color, #e9edf2);
            padding: 0.8rem 0.6rem 0.6rem;
            text-align: center;
            cursor: pointer;
            transition: all 0.15s;
            position: relative;
        }
        .file-item:hover {
            border-color: #94a3b8;
            box-shadow: var(--shadow-hover, 0 4px 16px rgba(0,0,0,0.06));
            transform: translateY(-2px);
        }
        .file-item .file-icon {
            font-size: 2.2rem;
            color: var(--text-muted, #64748b);
            margin-bottom: 0.2rem;
            display: block;
        }
        .file-item .file-icon.folder {
            color: #fbbf24;
        }
        .file-item .file-icon.pdf { color: #ef4444; }
        .file-item .file-icon.doc, .file-item .file-icon.docx { color: #3b82f6; }
        .file-item .file-icon.txt, .file-item .file-icon.md { color: #8b5cf6; }
        .file-item .file-icon.xls, .file-item .file-icon.xlsx { color: #22c55e; }
        .file-item .file-icon.ppt, .file-item .file-icon.pptx { color: #f97316; }
        .file-item .file-icon.image { color: #ec4899; }
        .file-item .file-icon.zip { color: #6b7280; }
        .file-item .file-name {
            font-size: 0.74rem;
            font-weight: 500;
            color: var(--text-primary, #0f172a);
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        .file-item .file-size {
            font-size: 0.58rem;
            color: var(--text-light, #94a3b8);
            margin-top: 0.05rem;
        }
        .file-item .file-actions {
            position: absolute;
            top: 0.25rem;
            right: 0.25rem;
            display: flex;
            gap: 0.15rem;
            opacity: 0;
            transition: opacity 0.15s;
        }
        .file-item:hover .file-actions {
            opacity: 1;
        }
        .file-item .file-actions button {
            background: var(--bg-card, #ffffff);
            border: 1px solid var(--border-color, #e9edf2);
            border-radius: 3px;
            padding: 0.05rem 0.25rem;
            font-size: 0.55rem;
            cursor: pointer;
            color: var(--text-muted, #64748b);
            transition: all 0.15s;
        }
        .file-item .file-actions button:hover {
            border-color: #94a3b8;
            background: var(--bg-hover, #f1f5f9);
        }
        .file-item .file-actions button.danger:hover {
            border-color: var(--red, #ef4444);
            color: var(--red, #ef4444);
        }
        .file-item .file-actions button.success:hover {
            border-color: var(--green, #22c55e);
            color: var(--green, #22c55e);
        }
        .file-item .file-checkbox {
            position: absolute;
            top: 0.25rem;
            left: 0.25rem;
            cursor: pointer;
        }
        .file-empty {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            height: 100%;
            min-height: 200px;
            color: var(--text-light, #94a3b8);
        }
        .file-empty i {
            font-size: 3rem;
            margin-bottom: 0.5rem;
            opacity: 0.3;
        }

        /* ===== 分页 ===== */
        .pagination-bar {
            padding: 0.4rem 0.8rem;
            border-top: 1px solid var(--border-color, #e9edf2);
            background: var(--bg-card, #ffffff);
            display: flex;
            justify-content: space-between;
            align-items: center;
            flex-shrink: 0;
            font-size: 0.72rem;
            color: var(--text-muted, #64748b);
        }
        .pagination-bar .pagination {
            display: flex;
            gap: 0.15rem;
        }
        .pagination-bar .pagination .page-item {
            padding: 0.05rem 0.5rem;
            border-radius: var(--radius-full, 9999px);
            cursor: pointer;
            font-size: 0.7rem;
            border: 1px solid transparent;
            transition: all 0.15s;
            color: var(--text-secondary, #1e293b);
        }
        .pagination-bar .pagination .page-item:hover {
            border-color: var(--border-color, #e9edf2);
            background: var(--bg-hover, #f1f5f9);
        }
        .pagination-bar .pagination .page-item.active {
            background: var(--dark, #1e293b);
            color: var(--text-white, #f8fafc);
            border-color: var(--dark, #1e293b);
        }
        .pagination-bar .pagination .page-item.disabled {
            opacity: 0.4;
            cursor: default;
        }

        /* ===== 上传进度对话框 (重新设计) ===== */
        .upload-progress-overlay {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(15, 23, 42, 0.6);
            backdrop-filter: blur(4px);
            z-index: 9999;
            display: none;
            align-items: center;
            justify-content: center;
            padding: 1rem;
        }
        .upload-progress-overlay .progress-card {
            background: var(--bg-card, #ffffff);
            border-radius: var(--radius-card, 1.25rem);
            padding: 1.5rem 2rem;
            max-width: 560px;
            width: 100%;
            box-shadow: 0 25px 60px rgba(0, 0, 0, 0.3);
            max-height: 90vh;
            display: flex;
            flex-direction: column;
        }
        .upload-progress-overlay .progress-card .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding-bottom: 0.8rem;
            border-bottom: 1px solid var(--border-color, #e9edf2);
        }
        .upload-progress-overlay .progress-card .header .title {
            font-weight: 600;
            font-size: 1rem;
            color: var(--text-primary, #0f172a);
            display: flex;
            align-items: center;
            gap: 0.5rem;
        }
        .upload-progress-overlay .progress-card .header .title .spinner {
            color: var(--blue, #3b82f6);
        }
        .upload-progress-overlay .progress-card .header .close-btn {
            background: transparent;
            border: none;
            color: var(--text-light, #94a3b8);
            cursor: pointer;
            font-size: 1.2rem;
            transition: color 0.15s;
        }
        .upload-progress-overlay .progress-card .header .close-btn:hover {
            color: var(--text-secondary, #1e293b);
        }
        .upload-progress-overlay .progress-card .progress-section {
            padding: 0.8rem 0;
        }
        .upload-progress-overlay .progress-card .progress-section .progress-track {
            width: 100%;
            height: 6px;
            background: var(--border-color, #e9edf2);
            border-radius: 6px;
            overflow: hidden;
        }
        .upload-progress-overlay .progress-card .progress-section .progress-track .bar {
            height: 100%;
            background: var(--blue, #3b82f6);
            border-radius: 6px;
            transition: width 0.4s ease;
            width: 0%;
        }
        .upload-progress-overlay .progress-card .progress-section .stats {
            display: flex;
            justify-content: space-between;
            margin-top: 0.4rem;
            font-size: 0.75rem;
            color: var(--text-muted, #64748b);
        }
        .upload-progress-overlay .progress-card .progress-section .stats .count {
            font-weight: 500;
        }
        .upload-progress-overlay .progress-card .file-list {
            flex: 1;
            overflow-y: auto;
            max-height: 240px;
            margin: 0.2rem 0 0.6rem;
            border-radius: 0.6rem;
            background: var(--bg-panel, #f8fafc);
            padding: 0.4rem 0.6rem;
        }
        .upload-progress-overlay .progress-card .file-list::-webkit-scrollbar {
            width: 3px;
        }
        .upload-progress-overlay .progress-card .file-list::-webkit-scrollbar-thumb {
            background: #d1d9e6;
            border-radius: 10px;
        }
        .upload-progress-overlay .progress-card .file-list .file-item-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 0.2rem 0.2rem;
            border-bottom: 1px solid var(--border-color, #e9edf2);
            font-size: 0.75rem;
        }
        .upload-progress-overlay .progress-card .file-list .file-item-row:last-child {
            border-bottom: none;
        }
        .upload-progress-overlay .progress-card .file-list .file-item-row .name {
            flex: 1;
            min-width: 0;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            color: var(--text-secondary, #1e293b);
        }
        .upload-progress-overlay .progress-card .file-list .file-item-row .status {
            font-size: 0.65rem;
            font-weight: 500;
            flex-shrink: 0;
            margin-left: 0.5rem;
        }
        .upload-progress-overlay .progress-card .file-list .file-item-row .status.pending {
            color: var(--text-light, #94a3b8);
        }
        .upload-progress-overlay .progress-card .file-list .file-item-row .status.uploading {
            color: var(--blue, #3b82f6);
        }
        .upload-progress-overlay .progress-card .file-list .file-item-row .status.success {
            color: var(--green, #22c55e);
        }
        .upload-progress-overlay .progress-card .file-list .file-item-row .status.fail {
            color: var(--red, #ef4444);
        }
        .upload-progress-overlay .progress-card .footer-actions {
            display: flex;
            justify-content: flex-end;
            gap: 0.5rem;
            padding-top: 0.6rem;
            border-top: 1px solid var(--border-color, #e9edf2);
        }
        .upload-progress-overlay .progress-card .footer-actions .btn-close-progress {
            padding: 0.2rem 1.2rem;
            border-radius: var(--radius-full, 9999px);
            border: 1px solid var(--border-color, #e9edf2);
            background: var(--bg-card, #ffffff);
            cursor: pointer;
            font-size: 0.75rem;
            transition: all 0.15s;
            color: var(--text-secondary, #1e293b);
        }
        .upload-progress-overlay .progress-card .footer-actions .btn-close-progress:hover {
            background: var(--bg-hover, #f1f5f9);
        }
        .upload-progress-overlay .progress-card .footer-actions .btn-close-progress.primary {
            background: var(--dark, #1e293b);
            color: var(--text-white, #f8fafc);
            border-color: var(--dark, #1e293b);
        }
        .upload-progress-overlay .progress-card .footer-actions .btn-close-progress.primary:hover {
            background: var(--dark-hover, #0f172a);
        }

        /* ===== 链接到知识库模态框 ===== */
        .link-dataset-modal .dataset-list {
            max-height: 200px;
            overflow-y: auto;
        }
        .link-dataset-modal .dataset-list .dataset-item {
            padding: 0.4rem 0.6rem;
            border-radius: 0.5rem;
            cursor: pointer;
            transition: all 0.15s;
            display: flex;
            align-items: center;
            gap: 0.5rem;
            border: 1px solid transparent;
        }
        .link-dataset-modal .dataset-list .dataset-item:hover {
            background: var(--bg-hover, #f1f5f9);
        }
        .link-dataset-modal .dataset-list .dataset-item.selected {
            border-color: var(--blue, #3b82f6);
            background: var(--bg-active, #eef2ff);
        }
        .link-dataset-modal .dataset-list .dataset-item .name {
            flex: 1;
            font-size: 0.85rem;
            color: var(--text-secondary, #1e293b);
        }
        .link-dataset-modal .dataset-list .dataset-item .doc-count {
            font-size: 0.7rem;
            color: var(--text-light, #94a3b8);
        }
        .link-dataset-modal .dataset-list .dataset-item .check {
            color: var(--blue, #3b82f6);
            display: none;
        }
        .link-dataset-modal .dataset-list .dataset-item.selected .check {
            display: block;
        }

        /* ===== 响应式 ===== */
        @media (max-width: 820px) {
            .file-manager {
                flex-direction: column;
            }
            .file-sidebar {
                width: 100%;
                max-height: 160px;
                flex-direction: row;
                flex-wrap: wrap;
                overflow-y: visible;
                padding: 0.5rem;
            }
            .file-sidebar .sidebar-header {
                width: 100%;
                border-bottom: 1px solid var(--border-color, #e9edf2);
                padding-bottom: 0.3rem;
            }
            .file-sidebar .folder-tree {
                display: flex;
                flex-wrap: wrap;
                gap: 0.2rem;
                overflow-y: visible;
                padding: 0.2rem 0;
                flex: none;
            }
            .folder-item {
                padding: 0.15rem 0.6rem;
                border-radius: var(--radius-full, 9999px);
                border: 1px solid var(--border-color, #e9edf2);
                background: var(--bg-card, #ffffff);
                font-size: 0.72rem;
                flex-shrink: 0;
            }
            .folder-item .badge-count {
                display: none;
            }
            .folder-item .folder-actions {
                opacity: 1;
            }
            .folder-item.active {
                background: var(--dark, #1e293b);
                color: var(--text-white, #f8fafc);
                border-color: var(--dark, #1e293b);
            }
            .file-grid {
                grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
            }
            .file-item .file-icon {
                font-size: 1.8rem;
            }
            .file-toolbar .search-input {
                width: 100px;
            }
            .upload-progress-overlay .progress-card {
                padding: 1rem 1.2rem;
                margin: 0.5rem;
            }
        }
        @media (max-width: 480px) {
            .file-grid {
                grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
            }
            .file-item {
                padding: 0.4rem 0.3rem;
            }
            .file-item .file-icon {
                font-size: 1.5rem;
            }
            .file-item .file-name {
                font-size: 0.65rem;
            }
            .file-toolbar .btn-action {
                font-size: 0.6rem;
                padding: 0.1rem 0.4rem;
            }
            .file-toolbar .search-input {
                width: 80px;
                font-size: 0.65rem;
            }
            .upload-progress-overlay .progress-card .file-list .file-item-row {
                font-size: 0.68rem;
            }
        }
    </style>
</head>
<body>
<div class="vivarly-frame">
    <div class="view-pane">
        <?php $page = 'files'; include PROJECT_ROOT . '/templates/navbar.php'; ?>

        <div class="file-manager">

            <!-- ===== 左侧：文件夹树 ===== -->
            <div class="file-sidebar">
                <div class="sidebar-header">
                    <span class="title"><i class="fas fa-folder-open me-1"></i>文件夹</span>
                    <button class="btn-new-folder" onclick="showCreateFolderModal()"><i class="fas fa-plus me-1"></i>新建</button>
                </div>
                <div class="folder-tree" id="folderTree">
                    <div class="text-center text-muted py-3 small"><i class="fas fa-spinner fa-spin me-1"></i>加载中...</div>
                </div>
            </div>

            <!-- ===== 右侧：文件列表 ===== -->
            <div class="file-main">
                <div class="file-toolbar">
                    <div class="breadcrumb-nav" id="breadcrumbNav">
                        <span class="crumb" onclick="navigateToRoot()"><i class="fas fa-home me-1"></i>根目录</span>
                    </div>

                    <input type="text" class="search-input" id="fileSearchInput" placeholder="搜索文件..." onkeyup="searchFiles(this.value)">

                    <button class="btn-action" onclick="refreshFiles()" title="刷新"><i class="fas fa-rotate-right"></i></button>
                    <button class="btn-action" onclick="showCreateFolderModal()" title="新建文件夹"><i class="fas fa-folder-plus"></i></button>

                    <div class="upload-mode-selector">
                        <span class="mode-label"><i class="fas fa-upload"></i></span>
                        <button class="mode-btn active" id="uploadModeFile" onclick="setUploadMode('file')">文件</button>
                        <button class="mode-btn" id="uploadModeFolder" onclick="setUploadMode('folder')">文件夹</button>
                    </div>

                    <button class="btn-action primary" onclick="triggerUpload()"><i class="fas fa-upload"></i> 上传</button>
                    <button class="btn-action danger" id="btnDeleteSelected" onclick="deleteSelected()" style="display:none;"><i class="fas fa-trash"></i> 删除</button>

                    <input type="file" id="uploadFileInput" multiple style="display:none;" onchange="handleFileSelect(this.files)">
                    <input type="file" id="uploadFolderInput" multiple webkitdirectory mozdirectory style="display:none;" onchange="handleFolderSelect(this.files)">

                    <span class="selected-count" id="selectedCount"></span>
                </div>

                <div class="file-list-wrap" id="fileListWrap" style="position:relative;">
                    <div class="file-grid" id="fileGrid">
                        <div class="text-center text-muted py-5"><i class="fas fa-spinner fa-spin me-2"></i>加载中...</div>
                    </div>
                </div>

                <div class="pagination-bar" id="paginationBar">
                    <span id="paginationInfo">共 0 项</span>
                    <div class="pagination" id="paginationContainer"></div>
                </div>
            </div>
        </div>
    </div>
    <?php include PROJECT_ROOT . '/templates/footer.php'; ?>
</div>

<!-- ===== 创建文件夹模态框 ===== -->
<div class="modal fade" id="createFolderModal" tabindex="-1" aria-hidden="true">
    <div class="modal-dialog modal-sm">
        <div class="modal-content border-0 rounded-4 shadow">
            <div class="modal-header">
                <h6 class="modal-title fw-bold"><i class="fas fa-folder-plus text-primary me-2"></i>新建文件夹</h6>
                <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body">
                <div class="mb-2">
                    <label class="form-label small fw-semibold">文件夹名称</label>
                    <input type="text" id="newFolderName" class="form-control" placeholder="输入名称..." style="border-radius:0.75rem;">
                </div>
                <div class="text-muted small">将在当前目录创建</div>
            </div>
            <div class="modal-footer">
                <button type="button" class="btn btn-light rounded-pill px-3" data-bs-dismiss="modal">取消</button>
                <button type="button" class="btn btn-dark rounded-pill px-3" onclick="confirmCreateFolder()"><i class="fas fa-check me-1"></i>创建</button>
            </div>
        </div>
    </div>
</div>

<!-- ===== 重命名模态框 ===== -->
<div class="modal fade" id="renameModal" tabindex="-1" aria-hidden="true">
    <div class="modal-dialog modal-sm">
        <div class="modal-content border-0 rounded-4 shadow">
            <div class="modal-header">
                <h6 class="modal-title fw-bold"><i class="fas fa-edit text-primary me-2"></i>重命名</h6>
                <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body">
                <div class="mb-2">
                    <label class="form-label small fw-semibold">新名称</label>
                    <input type="text" id="renameInput" class="form-control" style="border-radius:0.75rem;">
                </div>
            </div>
            <div class="modal-footer">
                <button type="button" class="btn btn-light rounded-pill px-3" data-bs-dismiss="modal">取消</button>
                <button type="button" class="btn btn-dark rounded-pill px-3" onclick="confirmRename()"><i class="fas fa-check me-1"></i>确认</button>
            </div>
        </div>
    </div>
</div>

<!-- ===== 链接到知识库模态框 ===== -->
<div class="modal fade link-dataset-modal" id="linkDatasetModal" tabindex="-1" aria-hidden="true">
    <div class="modal-dialog">
        <div class="modal-content border-0 rounded-4 shadow">
            <div class="modal-header">
                <h6 class="modal-title fw-bold"><i class="fas fa-link text-primary me-2"></i>链接到知识库</h6>
                <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body">
                <div class="mb-3">
                    <label class="form-label small fw-semibold">选择目标知识库</label>
                    <div class="dataset-list" id="datasetListForLink">
                        <div class="text-center text-muted py-3 small"><i class="fas fa-spinner fa-spin me-1"></i>加载知识库...</div>
                    </div>
                </div>
                <div class="text-muted small">
                    <i class="fas fa-info-circle me-1"></i>
                    选中的文件夹/文件将被导入到知识库中，作为文档进行解析。
                </div>
            </div>
            <div class="modal-footer">
                <button type="button" class="btn btn-light rounded-pill px-3" data-bs-dismiss="modal">取消</button>
                <button type="button" class="btn btn-primary rounded-pill px-3" id="btnConfirmLink" onclick="confirmLinkToDataset()"><i class="fas fa-link me-1"></i>确认链接</button>
            </div>
        </div>
    </div>
</div>

<!-- ===== 上传进度覆盖层（重新设计） ===== -->
<div class="upload-progress-overlay" id="uploadProgressOverlay">
    <div class="progress-card">
        <div class="header">
            <div class="title">
                <i class="fas fa-upload spinner"></i>
                上传文件
            </div>
            <button class="close-btn" onclick="closeUploadProgress()">&times;</button>
        </div>

        <div class="progress-section">
            <div class="progress-track">
                <div class="bar" id="uploadProgressBarMain"></div>
            </div>
            <div class="stats">
                <span id="uploadStatusText">准备上传...</span>
                <span class="count" id="uploadPercentText">0%</span>
            </div>
        </div>

        <div class="file-list" id="uploadFileList">
            <div class="text-muted small text-center py-2">等待上传...</div>
        </div>

        <div class="footer-actions">
            <button class="btn-close-progress" onclick="closeUploadProgress()">关闭</button>
            <button class="btn-close-progress primary" id="btnUploadConfirm" onclick="confirmUpload()" style="display:none;">确认</button>
        </div>
    </div>
</div>

<script src="https://cdn.bootcdn.net/ajax/libs/twitter-bootstrap/5.3.0/js/bootstrap.bundle.min.js"></script>
<script src="/js/main.js"></script>
<script src="/js/app.js"></script>
<script src="/js/files.js"></script>
</body>
</html>