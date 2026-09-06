<div class="modal fade" id="createDatasetModal" tabindex="-1" aria-hidden="true">
  <div class="modal-dialog">
    <div class="modal-content border-0 rounded-4 shadow">
      <div class="modal-header">
        <h5 class="modal-title fw-bold"><i class="fas fa-folder-plus text-primary me-2"></i>新建知识库</h5>
        <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
      </div>
      <div class="modal-body">
        <div class="mb-3">
          <label for="datasetNameInput" class="form-label fw-semibold small">知识库名称 <span class="text-danger">*</span></label>
          <input type="text" class="form-control" id="datasetNameInput" placeholder="例如：产品研发中心" style="border-radius: 0.75rem;">
        </div>
        <div class="mb-3">
          <label for="datasetDescInput" class="form-label fw-semibold small">描述</label>
          <textarea class="form-control" id="datasetDescInput" rows="3" placeholder="填写简要说明" style="border-radius: 0.75rem;"></textarea>
        </div>
      </div>
      <div class="modal-footer">
        <button type="button" class="btn btn-light rounded-pill px-4" data-bs-dismiss="modal">取消</button>
        <button type="button" class="btn btn-dark rounded-pill px-4" id="btnSubmitCreateDataset"><i class="fas fa-check me-1"></i>提交创建</button>
      </div>
    </div>
  </div>
</div>