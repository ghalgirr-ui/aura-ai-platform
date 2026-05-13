window.addEventListener("DOMContentLoaded", async () => {
  if (!window.Aura.getToken()) {
    window.location.href = "/auth.html";
    return;
  }

  window.Aura.state = {
    currentChatId: localStorage.getItem("chatId"),
    historyVisible: false,
    currentFile: null,
    currentFileType: null,
  };

  const userName = window.Aura.getUsername();
  const welcomeText = document.getElementById("welcomeText");
  if (welcomeText) {
    welcomeText.textContent = userName ? `Welcome back, ${userName}` : "Welcome back";
  }

  document.getElementById("sendBtn")?.addEventListener("click", window.Aura.sendMessage);
  document.getElementById("userInput")?.addEventListener("keypress", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      window.Aura.sendMessage();
    }
  });

  const fileInput = document.getElementById("fileInput");
  document.getElementById("uploadBtn")?.addEventListener("click", () => fileInput?.click());
  fileInput?.addEventListener("change", window.Aura.handleFileSelection);
  document.getElementById("clearFileBtn")?.addEventListener("click", window.Aura.clearFilePreview);
  document.getElementById("newChatBtn").onclick = window.Aura.createNewChat;
  document.getElementById("homeBtn").onclick = window.Aura.createNewChat;

  document.getElementById("logoutBtn")?.addEventListener("click", () => {
    window.Aura.clearSession();
    window.location.href = "/auth.html";
  });

  document.getElementById("historyBtn").onclick = async () => {
    const panel = document.getElementById("history");
    window.Aura.state.historyVisible = !window.Aura.state.historyVisible;

    if (window.Aura.state.historyVisible) {
      panel?.classList.add("show");
      await window.Aura.loadChats();
    } else {
      panel?.classList.remove("show");
    }
  };

  document.addEventListener("click", (e) => {
    const panel = document.getElementById("history");
    const btn = document.getElementById("historyBtn");
    if (!panel || !btn) return;
    if (!panel.contains(e.target) && !btn.contains(e.target)) {
      panel.classList.remove("show");
      window.Aura.state.historyVisible = false;
    }
  });

  window.Aura.initializeTheme();
  window.Aura.loadChats();

  if (window.Aura.state.currentChatId) {
    await window.Aura.loadChat(window.Aura.state.currentChatId);
  } else {
    document.body.classList.remove("chat-active");
  }
});
