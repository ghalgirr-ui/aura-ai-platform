window.Aura.supportedFileTypes = {
  image: ["image/png", "image/jpeg", "image/jpg", "image/webp"],
  pdf: ["application/pdf"],
};

window.Aura.maxUploadSize = 10 * 1024 * 1024;

window.Aura.getFileType = (file) => {
  if (window.Aura.supportedFileTypes.image.includes(file.type)) return "image";
  if (window.Aura.supportedFileTypes.pdf.includes(file.type)) return "pdf";
  return null;
};

window.Aura.showFilePreview = (file, type) => {
  if (window.Aura.state.currentPreviewUrl) {
    URL.revokeObjectURL(window.Aura.state.currentPreviewUrl);
    window.Aura.state.currentPreviewUrl = null;
  }

  window.Aura.state.currentFile = file;
  window.Aura.state.currentFileType = type;

  const preview = document.getElementById("uploadPreview");
  const previewInfo = document.getElementById("previewInfo");
  if (!preview || !previewInfo) return;

  preview.classList.remove("hidden");
  previewInfo.textContent = "";

  const media = document.createElement("span");
  media.className = `preview-thumb ${type}`;
  if (type === "image") {
    const imageUrl = URL.createObjectURL(file);
    window.Aura.state.currentPreviewUrl = imageUrl;
    const img = document.createElement("img");
    img.src = imageUrl;
    img.alt = "";
    media.appendChild(img);
  } else {
    media.innerText = "PDF";
  }

  const details = document.createElement("span");
  details.className = "preview-details";

  const name = document.createElement("strong");
  name.innerText = file.name;
  const label = document.createElement("span");
  label.innerText = type === "image" ? "Image ready for analysis" : "PDF ready for document analysis";
  const size = document.createElement("span");
  size.innerText = `${(file.size / 1024 / 1024).toFixed(2)} MB`;

  details.appendChild(name);
  details.appendChild(label);
  details.appendChild(size);
  previewInfo.appendChild(media);
  previewInfo.appendChild(details);
};

window.Aura.clearFilePreview = () => {
  window.Aura.state.currentFile = null;
  window.Aura.state.currentFileType = null;
  if (window.Aura.state.currentPreviewUrl) {
    URL.revokeObjectURL(window.Aura.state.currentPreviewUrl);
    window.Aura.state.currentPreviewUrl = null;
  }

  const preview = document.getElementById("uploadPreview");
  if (preview) preview.classList.add("hidden");
  const fileInput = document.getElementById("fileInput");
  if (fileInput) fileInput.value = "";
};

window.Aura.validateAndPreviewFile = (file) => {
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

  if (file.size > window.Aura.maxUploadSize) {
    alert("File too large. Maximum size is 10MB.");
    window.Aura.clearFilePreview();
    return;
  }

  window.Aura.showFilePreview(file, type);
};

window.Aura.handleFileSelection = async (event) => {
  window.Aura.validateAndPreviewFile(event.target.files?.[0]);
};

window.Aura.handleDroppedFile = (file) => {
  window.Aura.validateAndPreviewFile(file);
};

window.Aura.initializeDragDropUploads = () => {
  const dropTarget = document.querySelector(".main");
  if (!dropTarget) return;

  let dragDepth = 0;
  const hasFiles = (event) => Array.from(event.dataTransfer?.types || []).includes("Files");
  const showDropState = () => document.body.classList.add("dragging-file");
  const hideDropState = () => document.body.classList.remove("dragging-file");

  ["dragenter", "dragover"].forEach((eventName) => {
    dropTarget.addEventListener(eventName, (event) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      if (eventName === "dragenter") dragDepth += 1;
      showDropState();
      event.dataTransfer.dropEffect = "copy";
    });
  });

  dropTarget.addEventListener("dragleave", (event) => {
    if (!hasFiles(event)) return;
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) hideDropState();
  });

  dropTarget.addEventListener("drop", (event) => {
    if (!event.dataTransfer?.files?.length) return;
    event.preventDefault();
    dragDepth = 0;
    hideDropState();
    window.Aura.handleDroppedFile(event.dataTransfer.files[0]);
  });
};
