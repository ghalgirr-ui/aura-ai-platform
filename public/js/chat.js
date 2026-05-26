window.Aura.sendMessage = async (options = {}) => {
  const input = document.getElementById("userInput");
  if (!input || window.Aura.state.isStreaming) return;

  const isRegenerate = Boolean(options.regenerate);
  const text = (options.prompt ?? input.value).trim();
  const selectedModel = document.getElementById("modelSelect")?.value || "aura";
  const selectedMode = document.getElementById("modeSelect")?.value || "general";
  const webSearchEnabled = window.Aura.state.webSearchEnabled || false;

  if (!text && !window.Aura.state.currentFile) return;
  if (isRegenerate && !text) return;
  if (!window.Aura.state.currentChatId) await window.Aura.createNewChat();

  document.body.classList.add("chat-active");
  document.getElementById("history")?.classList.remove("show");
  window.Aura.state.historyVisible = false;

  // ANALYTICS: Track message sent
  if (window.Aura.Analytics) {
    window.Aura.Analytics.trackMessageSent();
    if (webSearchEnabled) {
      window.Aura.Analytics.trackWebSearch();
    }
  }

  if (window.Aura.state.currentFile && !isRegenerate) {
    const message = text || (window.Aura.state.currentFileType === "image" ? "Please analyze this image." : "Please summarize this document.");
    const uploadType = window.Aura.state.currentFileType;
    const fileToUpload = window.Aura.state.currentFile;

    if (!uploadType) {
      window.Aura.addMessage("Unsupported file type selected.", "bot");
      return;
    }

    // ANALYTICS: Track file upload
    if (window.Aura.Analytics) {
      window.Aura.Analytics.trackFileUpload();
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
        data = { error: textBody || "Unable to analyze file." };
      }

      if (!res.ok) {
        window.Aura.addMessage(data.error || "Unable to analyze file.", "bot");
        return;
      }

      window.Aura.state.currentChatId = data.chatId || window.Aura.state.currentChatId;
      localStorage.setItem("chatId", window.Aura.state.currentChatId);
      window.Aura.addMessage(data.message || "File analysis complete.", "bot");
      window.Aura.loadChats();
    } catch (err) {
      console.error(err);
      window.Aura.removeTyping();
      window.Aura.addMessage("Error connecting to server", "bot");
    }

    return;
  }

  if (!isRegenerate) {
    window.Aura.state.lastUserPrompt = text;
    window.Aura.addMessage(text, "user");
    input.value = "";
  }

  window.Aura.showTyping();
  const controller = new AbortController();
  const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  window.Aura.state.currentRequestId = requestId;
  window.Aura.state.currentAbortController = controller;
  window.Aura.state.isStreaming = true;
  window.Aura.updateGenerationControls();

  let assistantMessage = options.assistantMessage || null;

  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: window.Aura.getAuthHeaders(),
      signal: controller.signal,
      body: JSON.stringify({
        chatId: window.Aura.state.currentChatId,
        message: text,
        model: selectedModel,
        mode: selectedMode,
        webSearch: webSearchEnabled,
        regenerate: isRegenerate,
      }),
    });

    if (await window.Aura.handleUnauthorized(res)) return;
    window.Aura.removeTyping();

    if (!res.body) {
      window.Aura.addMessage("No response from server", "bot");
      return;
    }

    const box = document.getElementById("chatBox");
    if (!box) return;

    if (!assistantMessage || !box.contains(assistantMessage)) {
      assistantMessage = document.createElement("div");
      assistantMessage.className = "message bot";
      const content = document.createElement("div");
      content.className = "msg-content";
      assistantMessage.appendChild(content);
      box.appendChild(assistantMessage);
    } else {
      assistantMessage.querySelector(".msg-content")?.replaceChildren();
    }

    window.Aura.state.activeAssistantMessage = assistantMessage;
    window.Aura.attachAssistantActions(assistantMessage, "");
    window.Aura.updateGenerationControls();

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let result = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      result += decoder.decode(value, { stream: true });
      window.Aura.updateAssistantMessage(assistantMessage, result);
      box.scrollTop = box.scrollHeight;
    }

    result += decoder.decode();
    window.Aura.updateAssistantMessage(assistantMessage, result);
    window.Aura.loadChats();

    // ANALYTICS: Track AI response received
    if (window.Aura.Analytics) {
      window.Aura.Analytics.trackAIResponse();
    }
  } catch (err) {
    if (err.name !== "AbortError") {
      console.error(err);
      window.Aura.addMessage("Error connecting to server", "bot");
    }
  } finally {
    if (window.Aura.state.currentRequestId === requestId) {
      window.Aura.removeTyping();
      window.Aura.state.currentAbortController = null;
      window.Aura.state.currentRequestId = null;
      window.Aura.state.isStreaming = false;
      window.Aura.state.activeAssistantMessage = null;
      window.Aura.updateGenerationControls();
    }
  }
};
