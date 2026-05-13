window.Aura.sendMessage = async () => {
  const input = document.getElementById("userInput");
  if (!input) return;

  const text = input.value.trim();
  const selectedModel = document.getElementById("modelSelect")?.value || "openrouter";

  if (!text && !window.Aura.state.currentFile) return;
  if (!window.Aura.state.currentChatId) await window.Aura.createNewChat();

  document.body.classList.add("chat-active");
  document.getElementById("history")?.classList.remove("show");
  window.Aura.state.historyVisible = false;

  if (window.Aura.state.currentFile) {
    const message = text || (window.Aura.state.currentFileType === "image" ? "Please analyze this image." : "Please summarize this document.");
    const uploadType = window.Aura.state.currentFileType;
    const fileToUpload = window.Aura.state.currentFile;

    if (!uploadType) {
      window.Aura.addMessage("⚠️ Unsupported file type selected.", "bot");
      return;
    }

    window.Aura.addFileMessage(fileToUpload, uploadType, message);
    input.value = "";
    window.Aura.showTyping();

    try {
      const formData = new FormData();
      formData.append("file", fileToUpload);
      formData.append("question", message);
      formData.append("chatId", window.Aura.state.currentChatId || "");

      const res = await fetch(`/api/upload/${uploadType}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${window.Aura.getToken()}` },
        body: formData,
      });

      if (await window.Aura.handleUnauthorized(res)) return;
      window.Aura.removeTyping();
      window.Aura.clearFilePreview();

      const contentType = res.headers.get("content-type") || "";
      let data;
      if (contentType.includes("application/json")) {
        data = await res.json();
      } else {
        const textBody = await res.text();
        data = { error: textBody || "⚠️ Unable to analyze file." };
      }

      if (!res.ok) {
        window.Aura.addMessage(data.error || "⚠️ Unable to analyze file.", "bot");
        return;
      }

      window.Aura.state.currentChatId = data.chatId || window.Aura.state.currentChatId;
      localStorage.setItem("chatId", window.Aura.state.currentChatId);
      window.Aura.addMessage(data.message || "File analysis complete.", "bot");
      window.Aura.loadChats();
    } catch (err) {
      console.error(err);
      window.Aura.removeTyping();
      window.Aura.addMessage("⚠️ Error connecting to server", "bot");
    }

    return;
  }

  window.Aura.addMessage(text, "user");
  input.value = "";
  window.Aura.showTyping();

  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: window.Aura.getAuthHeaders(),
      body: JSON.stringify({ chatId: window.Aura.state.currentChatId, message: text, provider: selectedModel }),
    });

    if (await window.Aura.handleUnauthorized(res)) return;
    window.Aura.removeTyping();

    if (!res.body) {
      window.Aura.addMessage("⚠️ No response from server", "bot");
      return;
    }

    const box = document.getElementById("chatBox");
    const msg = document.createElement("div");
    msg.className = "message bot";
    const content = document.createElement("div");
    content.className = "msg-content";
    msg.appendChild(content);
    box.appendChild(msg);

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let result = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      result += decoder.decode(value);
      content.innerHTML = window.marked ? marked.parse(result) : window.Aura.formatMessage(result);
      box.scrollTop = box.scrollHeight;
    }

    window.Aura.addCopyButton(msg, result);
    window.Aura.loadChats();
  } catch (err) {
    console.error(err);
    window.Aura.removeTyping();
    window.Aura.addMessage("⚠️ Error connecting to server", "bot");
  }
};
