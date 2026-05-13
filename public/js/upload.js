window.Aura.supportedFileTypes = {
  image: ["image/png", "image/jpeg", "image/jpg", "image/webp"],
  pdf: ["application/pdf"],
};

window.Aura.getFileType = (file) => {
  if (window.Aura.supportedFileTypes.image.includes(file.type)) return "image";
  if (window.Aura.supportedFileTypes.pdf.includes(file.type)) return "pdf";
  return null;
};

window.Aura.showFilePreview = (file, type) => {
  window.Aura.state.currentFile = file;
  window.Aura.state.currentFileType = type;

  const preview = document.getElementById("uploadPreview");
  const previewInfo = document.getElementById("previewInfo");
  if (!preview || !previewInfo) return;

  preview.classList.remove("hidden");
  previewInfo.innerHTML = `
    <strong>${file.name}</strong>
    <span>${type === "image" ? "Image ready for analysis" : "PDF ready for document analysis"}</span>
    <span>${(file.size / 1024 / 1024).toFixed(2)} MB</span>
  `;
};

window.Aura.clearFilePreview = () => {
  window.Aura.state.currentFile = null;
  window.Aura.state.currentFileType = null;

  const preview = document.getElementById("uploadPreview");
  if (preview) preview.classList.add("hidden");
  const fileInput = document.getElementById("fileInput");
  if (fileInput) fileInput.value = "";
};

window.Aura.handleFileSelection = async (event) => {
  const file = event.target.files?.[0];
  if (!file) {
    window.Aura.clearFilePreview();
    return;
  }

  const type = window.Aura.getFileType(file);
  if (!type) {
    alert("Unsupported file type. Please upload PNG, JPG, JPEG, WEBP, or PDF.");
    window.Aura.clearFilePreview();
    return;
  }

  if (file.size > 10 * 1024 * 1024) {
    alert("File too large. Maximum size is 10MB.");
    window.Aura.clearFilePreview();
    return;
  }

  window.Aura.showFilePreview(file, type);
};
