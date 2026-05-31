window.addEventListener("DOMContentLoaded", async () => {
  if (!window.Aura.getToken()) {
    window.location.href = "/auth.html";
    return;
  }

  if (typeof window.Aura.initState === "function") {
    window.Aura.initState();
  } else {
    console.error("Aura initState missing");
  }

  if (typeof window.Aura.initUiState === "function") {
    window.Aura.initUiState();
  } else {
    console.error("Aura initUiState missing");
  }

  if (typeof window.Aura.initAdminTrigger === "function") {
    await window.Aura.initAdminTrigger();
  } else {
    console.error("Aura initAdminTrigger missing");
  }

  if (typeof window.Aura.initModes === "function") {
    window.Aura.initModes();
  } else {
    console.error("Aura initModes missing");
  }

  if (typeof window.Aura.initVoice === "function") {
    window.Aura.initVoice();
  } else {
    console.error("Aura initVoice missing");
  }

  document.getElementById("sendBtn")?.addEventListener("click", window.Aura.sendMessage);
  document.getElementById("userInput")?.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      window.Aura.sendMessage();
    }
  });

  const fileInput = document.getElementById("fileInput");
  document.getElementById("uploadBtn")?.addEventListener("click", () => fileInput?.click());
  fileInput?.addEventListener("change", window.Aura.handleFileSelection);
  document.getElementById("clearFileBtn")?.addEventListener("click", window.Aura.clearFilePreview);
  window.Aura.initializeDragDropUploads?.();

  document.getElementById("newChatBtn").onclick = window.Aura.createNewChat;
  document.getElementById("homeBtn").onclick = window.Aura.createNewChat;

  document.getElementById("logoutBtn")?.addEventListener("click", () => {
    window.Aura.Analytics?.flushEvents();
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

  document.addEventListener("click", (event) => {
    const panel = document.getElementById("history");
    const hamburgerBtn = document.getElementById("hamburgerBtn");
    const historyBtn = document.getElementById("historyBtn");
    if (!panel || !hamburgerBtn) return;

    if (
      !panel.contains(event.target) &&
      !hamburgerBtn.contains(event.target) &&
      !(historyBtn && historyBtn.contains(event.target))
    ) {
      panel.classList.remove("show");
      hamburgerBtn.classList.remove("active");
      window.Aura.state.historyVisible = false;
    }
  });
const userInput = document.getElementById("userInput");

userInput.addEventListener("input", () => {
  userInput.style.height = "24px";

  userInput.style.height =
    Math.min(userInput.scrollHeight, 180) + "px";

  if (userInput.scrollHeight > 180) {
    userInput.style.overflowY = "auto";
  } else {
    userInput.style.overflowY = "hidden";
  }
});

userInput?.addEventListener("keydown", (event) => {

  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    window.Aura.sendMessage();
  }

});
const modelBtn = document.getElementById("modelMenuBtn");
const modelMenu = document.getElementById("modelMenu");

modelBtn.addEventListener("click", () => {
  modelMenu.classList.toggle("show");
});

document.querySelectorAll("#modelMenu div")
.forEach(item => {

  item.addEventListener("click", () => {

    currentModel = item.dataset.model;

    document.getElementById(
      "currentModelLabel"
    ).textContent = item.textContent;

    modelMenu.classList.remove("show");
  });

});

  window.Aura.initializeTheme();
  window.Aura.loadChats();

  if (window.Aura.state.currentChatId) {
    await window.Aura.loadChat(window.Aura.state.currentChatId);
  } else {
    document.body.classList.remove("chat-active");
  }
});
