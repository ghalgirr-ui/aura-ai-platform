window.Aura.addCopyButton = (container, text) => {
  const btn = document.createElement("button");
  btn.innerText = "📋";
  btn.className = "copy-btn";

  btn.onclick = () => {
    navigator.clipboard.writeText(text);
    btn.innerText = "✅";
    setTimeout(() => (btn.innerText = "📋"), 1000);
  };

  container.appendChild(btn);
};

window.Aura.addMessage = (text, type) => {
  const box = document.getElementById("chatBox");
  if (!box) return;

  const msg = document.createElement("div");
  msg.className = "message " + type;

  const content = document.createElement("div");
  content.className = "msg-content";

  content.innerHTML = window.marked ? marked.parse(text) : window.Aura.formatMessage(text);
  msg.appendChild(content);

  if (type === "bot") {
    window.Aura.addCopyButton(msg, text);
  }

  box.appendChild(msg);
  box.scrollTop = box.scrollHeight;
};

window.Aura.addFileMessage = (file, type, message) => {
  const box = document.getElementById("chatBox");
  if (!box) return;

  const msg = document.createElement("div");
  msg.className = "message user file-message";

  const content = document.createElement("div");
  content.className = "msg-content";
  content.innerHTML = `
    <div class="file-preview-card ${type}">
      <div>
        <strong>${file.name}</strong>
        <span>${type === "image" ? "Image attachment" : "PDF attachment"}</span>
      </div>
      <div class="file-meta">${(file.size / 1024 / 1024).toFixed(2)} MB</div>
    </div>
    <div class="file-question">${window.Aura.formatMessage(message)}</div>
  `;

  msg.appendChild(content);
  box.appendChild(msg);
  box.scrollTop = box.scrollHeight;
};

window.Aura.addFileMessageFromHistory = (message) => {
  const box = document.getElementById("chatBox");
  if (!box) return;

  const msg = document.createElement("div");
  msg.className = "message user file-message";

  const content = document.createElement("div");
  content.className = "msg-content";

  let fileInfo = "";
  if (message.file) {
    const fileLabel = message.file.type === "image" ? "Image" : "PDF";
    fileInfo = `
      <div class="file-preview-card ${message.file.type}">
        <div>
          <strong>${message.file.originalName || "Uploaded file"}</strong>
          <span>${fileLabel} attachment</span>
        </div>
        <div class="file-meta">${message.file.size ? (message.file.size / 1024 / 1024).toFixed(2) + " MB" : ""}</div>
      </div>
    `;
  }

  content.innerHTML = `
    ${fileInfo}
    <div class="file-question">${window.Aura.formatMessage(message.content || "")}</div>
  `;

  msg.appendChild(content);
  box.appendChild(msg);
  box.scrollTop = box.scrollHeight;
};

window.Aura.showTyping = () => {
  const box = document.getElementById("chatBox");
  if (!box) return;

  const typing = document.createElement("div");
  typing.className = "message bot typing";
  typing.id = "typing";
  typing.innerHTML = "● ● ●";
  box.appendChild(typing);
};

window.Aura.removeTyping = () => {
  document.getElementById("typing")?.remove();
};
