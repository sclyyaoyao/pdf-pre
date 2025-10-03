const form = document.getElementById('convert-form');
const statusSection = document.getElementById('status');
const statusMessage = document.getElementById('status-message');
const submitButton = document.getElementById('submit-btn');
const cancelButton = document.getElementById('cancel-btn');
const statusCancelButton = document.getElementById('status-cancel-btn');
const cancelButtons = [cancelButton, statusCancelButton];

const MAX_SIZE = 20 * 1024 * 1024; // 20MB
let currentController = null;

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const fileInput = form.file;
  const selectedFile = fileInput.files[0];

  if (!selectedFile) {
    showStatus('请先选择一个 PDF 文件。', true);
    return;
  }
  if (!selectedFile.name.toLowerCase().endsWith('.pdf')) {
    showStatus('仅支持 .pdf 文件。', true);
    return;
  }
  if (selectedFile.size > MAX_SIZE) {
    showStatus('文件超过 20MB 限制，请压缩或拆分后再试。', true);
    return;
  }

  const formData = new FormData(form);
  showStatus('正在转换，请稍候…', false, true);
  toggleSubmit(true);
  toggleCancel(true);

  if (currentController) {
    currentController.abort();
  }
  const controller = new AbortController();
  currentController = controller;

  try {
    const response = await fetch('/api/convert', {
      method: 'POST',
      body: formData,
      signal: controller.signal,
    });

    if (!response.ok) {
      const error = await safeJson(response);
      throw new Error(error?.error || '转换失败，请稍后重试。');
    }

    const blob = await response.blob();
    const format = formData.get('format') || 'txt';
    const filename = buildDownloadName(selectedFile.name, format);
    triggerDownload(blob, filename);
    showStatus(`转换完成！文件已下载为 ${filename}。`, false);
  } catch (error) {
    if (error.name === 'AbortError') {
      showStatus('已取消转换。', false);
    } else {
      showStatus(error.message, true);
    }
  } finally {
    toggleSubmit(false);
    toggleCancel(false);
    currentController = null;
  }
});

cancelButtons.forEach((button) => {
  if (!button) {
    return;
  }
  button.addEventListener('click', () => {
    if (!currentController) {
      return;
    }
    disableCancelButtons();
    showStatus('正在取消，请稍候…', false, true);
    currentController.abort();
  });
});

function showStatus(message, isError = false, isLoading = false) {
  statusSection.hidden = false;
  statusSection.classList.toggle('error', isError);
  statusMessage.textContent = message;
  if (isLoading) {
    statusSection.classList.add('loading');
  } else {
    statusSection.classList.remove('loading');
  }
}

function toggleSubmit(disabled) {
  submitButton.disabled = disabled;
  submitButton.textContent = disabled ? '处理中…' : '开始转换';
}

function toggleCancel(active) {
  cancelButtons.forEach((button) => {
    if (!button) {
      return;
    }
    button.hidden = !active;
    button.disabled = !active;
  });
}

function disableCancelButtons() {
  cancelButtons.forEach((button) => {
    if (!button) {
      return;
    }
    button.disabled = true;
  });
}

function buildDownloadName(original, format) {
  return original.replace(/\.pdf$/i, '') + `.${format}`;
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

async function safeJson(response) {
  try {
    return await response.json();
  } catch (error) {
    return null;
  }
}
