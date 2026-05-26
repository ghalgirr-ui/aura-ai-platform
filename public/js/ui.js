window.Aura.addMessage = (text, type) => {
  const box = document.getElementById("chatBox");
  if (!box) return;
  if (type === "user") window.Aura.state.lastUserPrompt = text;

  const msg = document.createElement("div");
  msg.className = "message " + type;

  const content = document.createElement("div");
  content.className = "msg-content";
  window.Aura.renderMessageContent(content, text, { copyCode: type === "bot" });

  msg.appendChild(content);
  if (type === "bot") {
    window.Aura.attachAssistantActions(msg, text);
  }
  box.appendChild(msg);
  box.scrollTop = box.scrollHeight;
};

window.Aura.attachAssistantActions = (msg, responseText = "") => {
  if (!msg) return;
  msg.querySelector(".message-actions")?.remove();

  const actions = document.createElement("div");
  actions.className = "message-actions";

  const stopBtn = document.createElement("button");
  stopBtn.type = "button";
  stopBtn.className = "message-action-btn stop-response-btn";
  stopBtn.innerText = "Stop";
  stopBtn.title = "Stop generation";
  stopBtn.onclick = window.Aura.stopGeneration;

  const regenBtn = document.createElement("button");
  regenBtn.type = "button";
  regenBtn.className = "message-action-btn regenerate-btn";
  regenBtn.innerText = "Regenerate";
  regenBtn.title = "Generate again";
  regenBtn.setAttribute("aria-label", "Generate again");
  regenBtn.onclick = () => window.Aura.regenerateResponse(msg);

  const speakBtn = document.createElement("button");
  speakBtn.type = "button";
  speakBtn.className = "message-action-btn voice-output-btn";
  speakBtn.innerText = "🔊";
  speakBtn.title = "Read aloud";
  speakBtn.setAttribute("aria-label", "Read aloud");
  speakBtn.onclick = () => window.Aura.speakAssistantMessage(msg);

  const copyBtn = document.createElement("button");
  copyBtn.type = "button";
  copyBtn.className = "message-action-btn copy-response-btn";
  copyBtn.innerText = "📋 Copy";
  copyBtn.title = "Copy response";
  copyBtn.setAttribute("aria-label", "Copy response");
  copyBtn.onclick = () => window.Aura.copyAssistantResponse(msg);

  actions.appendChild(stopBtn);
  actions.appendChild(regenBtn);
  actions.appendChild(speakBtn);
  actions.appendChild(copyBtn);
  msg.appendChild(actions);
  msg.dataset.responseText = responseText || msg.dataset.responseText || "";
  if (!msg.dataset.prompt) msg.dataset.prompt = window.Aura.state?.lastUserPrompt || "";
  window.Aura.updateGenerationControls();
};

window.Aura.copyAssistantResponse = async (msg) => {
  if (!msg) return;
  const responseText = String(msg.dataset.responseText || msg.querySelector(".msg-content")?.innerText || "").trim();
  if (!responseText) return;
  try {
    await window.Aura.copyText(responseText);
    window.Aura.showToast("Response copied");
  } catch (err) {
    console.error("Copy failed:", err);
    window.Aura.showToast("Unable to copy response");
  }
};

window.Aura.showToast = (message) => {
  let container = document.getElementById("auraToastContainer");
  if (!container) {
    container = document.createElement("div");
    container.id = "auraToastContainer";
    container.className = "aura-toast-container";
    document.body.appendChild(container);
  }

  const toast = document.createElement("div");
  toast.className = "aura-toast";
  toast.innerText = message;
  container.appendChild(toast);

  requestAnimationFrame(() => toast.classList.add("visible"));
  window.setTimeout(() => {
    toast.classList.remove("visible");
    window.setTimeout(() => toast.remove(), 250);
  }, 2400);
};

window.Aura.updateAssistantMessage = (msg, text) => {
  if (!msg) return;
  const content = msg.querySelector(".msg-content");
  if (content) window.Aura.renderMessageContent(content, text, { copyCode: true });
  msg.dataset.responseText = text || "";
  window.Aura.attachAssistantActions(msg, text);
};

window.Aura.updateGenerationControls = () => {
  const isStreaming = Boolean(window.Aura.state?.isStreaming);
  document.querySelectorAll(".stop-response-btn").forEach((btn) => {
    btn.hidden = !isStreaming || !btn.closest(".message")?.isSameNode(window.Aura.state.activeAssistantMessage);
  });
  document.querySelectorAll(".regenerate-btn").forEach((btn) => {
    btn.disabled = isStreaming;
  });
  const sendBtn = document.getElementById("sendBtn");
  if (sendBtn) sendBtn.disabled = isStreaming;
  const voiceBtn = document.getElementById("voiceInputBtn");
  if (voiceBtn) voiceBtn.disabled = isStreaming;
};

window.Aura.stopGeneration = () => {
  if (!window.Aura.state?.isStreaming || !window.Aura.state.currentAbortController) return;
  window.Aura.state.currentAbortController.abort();
  window.Aura.state.currentAbortController = null;
  window.Aura.state.currentRequestId = null;
  window.Aura.state.isStreaming = false;
  window.Aura.state.activeAssistantMessage = null;
  window.Aura.removeTyping();
  window.Aura.updateGenerationControls();
};

window.Aura.regenerateResponse = async (assistantMessage) => {
  if (window.Aura.state?.isStreaming) return;
  const prompt = (assistantMessage?.dataset?.prompt || window.Aura.state?.lastUserPrompt || "").trim();
  if (!prompt) return;
  const assistantMessages = [...document.querySelectorAll(".message.bot")];
  const isLatestAssistant = assistantMessages.at(-1) === assistantMessage;
  await window.Aura.sendMessage({
    regenerate: isLatestAssistant,
    prompt,
    assistantMessage: isLatestAssistant ? assistantMessage : null,
  });
};

window.Aura.addFileMessage = (file, type, message) => {
  const box = document.getElementById("chatBox");
  if (!box) return;

  const msg = document.createElement("div");
  msg.className = "message user file-message";

  const content = document.createElement("div");
  content.className = "msg-content";

  const card = document.createElement("div");
  card.className = `file-preview-card ${type}`;

  const details = document.createElement("div");
  const name = document.createElement("strong");
  name.innerText = file.name;
  const label = document.createElement("span");
  label.innerText = type === "image" ? "Image attachment" : "PDF attachment";
  details.appendChild(name);
  details.appendChild(label);

  const meta = document.createElement("div");
  meta.className = "file-meta";
  meta.innerText = `${(file.size / 1024 / 1024).toFixed(2)} MB`;

  const question = document.createElement("div");
  question.className = "file-question";
  window.Aura.renderMessageContent(question, message, { copyCode: false });

  card.appendChild(details);
  card.appendChild(meta);
  content.appendChild(card);
  content.appendChild(question);

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

  if (message.file) {
    const fileLabel = message.file.type === "image" ? "Image" : "PDF";
    const card = document.createElement("div");
    card.className = `file-preview-card ${message.file.type}`;

    const details = document.createElement("div");
    const name = document.createElement("strong");
    name.innerText = message.file.originalName || "Uploaded file";
    const label = document.createElement("span");
    label.innerText = `${fileLabel} attachment`;
    details.appendChild(name);
    details.appendChild(label);

    const meta = document.createElement("div");
    meta.className = "file-meta";
    meta.innerText = message.file.size ? `${(message.file.size / 1024 / 1024).toFixed(2)} MB` : "";

    card.appendChild(details);
    card.appendChild(meta);
    content.appendChild(card);
  }

  const question = document.createElement("div");
  question.className = "file-question";
  window.Aura.renderMessageContent(question, message.content || "", { copyCode: false });
  content.appendChild(question);

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
  typing.innerText = "...";
  box.appendChild(typing);
};

window.Aura.removeTyping = () => {
  document.getElementById("typing")?.remove();
};

window.Aura.isVoiceInputSupported = () => {
  return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
};

window.Aura.isVoiceOutputSupported = () => {
  return typeof window.speechSynthesis !== "undefined";
};

window.Aura.toggleVoiceRecognition = () => {
  if (window.Aura.state.voiceRecognitionActive) {
    window.Aura.stopVoiceRecognition();
  } else {
    window.Aura.startVoiceRecognition();
  }
};

window.Aura.startVoiceRecognition = () => {
  if (!window.Aura.isVoiceInputSupported()) {
    alert("Voice input is not supported in this browser.");
    return;
  }

  const recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.lang = "en-US";
  recognition.maxAlternatives = 1;

  const input = document.getElementById("userInput");
  if (!input) return;

  let finalTranscript = "";

  recognition.onstart = () => {
    window.Aura.state.voiceRecognitionActive = true;
    const voiceBtn = document.getElementById("voiceInputBtn");
    voiceBtn?.classList.add("active");
    voiceBtn?.setAttribute("aria-pressed", "true");
  };

  recognition.onresult = (event) => {
    let interimTranscript = "";
    for (let i = event.resultIndex; i < event.results.length; i += 1) {
      const transcript = event.results[i][0].transcript;
      if (event.results[i].isFinal) {
        finalTranscript += transcript;
      } else {
        interimTranscript += transcript;
      }
    }
    const displayText = `${finalTranscript} ${interimTranscript}`.trim();
    input.value = displayText;
  };

  recognition.onerror = (event) => {
    console.error("Speech recognition error:", event.error);
    window.Aura.state.voiceRecognitionActive = false;
    const voiceBtn = document.getElementById("voiceInputBtn");
    voiceBtn?.classList.remove("active");
    voiceBtn?.setAttribute("aria-pressed", "false");
    if (event.error !== "no-speech" && event.error !== "aborted") {
      alert(`Voice input error: ${event.error}`);
    }
  };

  recognition.onend = () => {
    window.Aura.state.voiceRecognitionActive = false;
    const voiceBtn = document.getElementById("voiceInputBtn");
    voiceBtn?.classList.remove("active");
    voiceBtn?.setAttribute("aria-pressed", "false");
    const inputValue = input.value.trim();
    if (inputValue) {
      if (!window.Aura.state.isStreaming) {
        window.Aura.sendMessage();
      }
    }
  };

  window.Aura.state.voiceRecognitionActive = true;
  window.Aura.state.speechRecognition = recognition;
  try {
    recognition.start();
  } catch (error) {
    console.error("Unable to start speech recognition:", error);
    window.Aura.state.voiceRecognitionActive = false;
    const voiceBtn = document.getElementById("voiceInputBtn");
    voiceBtn?.classList.remove("active");
    voiceBtn?.setAttribute("aria-pressed", "false");
    alert("Unable to start voice recognition. Please try again.");
  }
};

window.Aura.stopVoiceRecognition = () => {
  if (!window.Aura.state.voiceRecognitionActive || !window.Aura.state.speechRecognition) return;
  window.Aura.state.speechRecognition.stop();
  window.Aura.state.voiceRecognitionActive = false;
  const voiceBtn = document.getElementById("voiceInputBtn");
  voiceBtn?.classList.remove("active");
  voiceBtn?.setAttribute("aria-pressed", "false");
};

window.Aura.stopSpeaking = () => {
  if (!window.Aura.isVoiceOutputSupported()) return;
  window.speechSynthesis.cancel();
  window.Aura.state.speechUtterance = null;
  document.querySelectorAll(".message-action-btn.voice-output-btn.active").forEach((btn) => btn.classList.remove("active"));
};

window.Aura.speakAssistantMessage = (msg) => {
  if (!window.Aura.isVoiceOutputSupported()) {
    alert("Voice output is not supported in this browser.");
    return;
  }

  if (!msg) return;
  const text = msg.dataset.responseText?.trim();
  if (!text) return;

  window.Aura.stopSpeaking();

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "en-US";
  utterance.volume = 1;
  utterance.rate = 1;
  utterance.pitch = 1;

  const speakBtn = msg.querySelector(".voice-output-btn");
  const cleanup = () => {
    speakBtn?.classList.remove("active");
    window.Aura.state.speechUtterance = null;
  };

  utterance.onend = cleanup;
  utterance.onerror = (event) => {
    console.error("Speech synthesis error:", event.error);
    cleanup();
  };

  window.Aura.state.speechUtterance = utterance;
  speakBtn?.classList.add("active");
  window.speechSynthesis.speak(utterance);
};
