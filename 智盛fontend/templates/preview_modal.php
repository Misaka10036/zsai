<div class="modal fade" id="previewModal" tabindex="-1" aria-hidden="true">
  <div class="modal-dialog modal-xl modal-dialog-centered" style="height: 90vh;">
    <div class="modal-content h-100 border-0 rounded-4 shadow-lg overflow-hidden">
      <div class="modal-header py-3 bg-light">
        <h6 class="modal-title text-truncate fw-bold" id="previewModalTitle"><i class="fas fa-eye text-primary me-2"></i>文件预览</h6>
        <div class="d-flex align-items-center gap-2">
          <a id="btnDownloadFile" href="#" target="_blank" class="btn btn-outline-primary btn-sm rounded-pill px-3"><i class="fas fa-download me-1"></i>下载原始文件</a>
          <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
        </div>
      </div>
      <div id="previewChunkHighlightBar" class="bg-primary-subtle text-primary px-3 py-2 small border-bottom fw-semibold" style="display: none;">
        <i class="fas fa-location-crosshair me-2"></i>定位切片原文：<span id="previewChunkHighlightText" class="fw-normal text-dark"></span>
      </div>
      <div class="modal-body p-0 d-flex justify-content-center align-items-center" id="previewModalBody" style="background: #f8fafc;">
        <div class="text-center text-muted">
          <i class="fas fa-file-alt" style="font-size: 3rem; opacity: 0.3;"></i>
          <div class="mt-2">正在读取文件...</div>
        </div>
      </div>
    </div>
  </div>
</div>