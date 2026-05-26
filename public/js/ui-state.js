window.Aura = window.Aura || {};

window.Aura.initState = () => {
  window.Aura.state = {
    currentChatId: localStorage.getItem("chatId"),
    historyVisible: false,
    currentFile: null,
    currentFileType: null,
    currentPreviewUrl: null,
    currentAbortController: null,
    currentRequestId: null,
    isStreaming: false,
    lastUserPrompt: "",
    activeAssistantMessage: null,
    webSearchEnabled: false,
    voiceRecognitionActive: false,
    speechRecognition: null,
    speechUtterance: null,
    voiceTimeout: null,
  };
};

window.Aura.initUiState = () => {
  const userName = window.Aura.getUsername();
  const welcomeText = document.getElementById("welcomeText");
  if (welcomeText) {
    welcomeText.textContent = userName ? `Welcome back, ${userName}` : "Welcome back";
  }

  const settingsBtn = document.getElementById("settingsBtn");
  const toolsPopup = document.getElementById("toolsPopup");
  if (settingsBtn && toolsPopup) {
    settingsBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      toolsPopup.classList.toggle("hidden");
    });

    document.addEventListener("click", (event) => {
      if (!settingsBtn.contains(event.target) && !toolsPopup.contains(event.target)) {
        toolsPopup.classList.add("hidden");
      }
    });
  }

  const webSearchToggle = document.getElementById("webSearchToggle");
  if (webSearchToggle) {
    webSearchToggle.addEventListener("click", () => {
      window.Aura.state.webSearchEnabled = !window.Aura.state.webSearchEnabled;
      webSearchToggle.classList.toggle("active", window.Aura.state.webSearchEnabled);
      webSearchToggle.style.opacity = window.Aura.state.webSearchEnabled ? "1" : "0.5";
    });
  }

  const hamburgerBtn = document.getElementById("hamburgerBtn");
  const sidebarMini = document.querySelector(".sidebar-mini");
  if (hamburgerBtn && sidebarMini) {
    hamburgerBtn.addEventListener("click", () => {
      sidebarMini.classList.toggle("show");
      hamburgerBtn.classList.toggle("active");
    });

    document.addEventListener("click", (event) => {
      if (
        window.innerWidth <= 768 &&
        !sidebarMini.contains(event.target) &&
        !hamburgerBtn.contains(event.target)
      ) {
        sidebarMini.classList.remove("show");
        hamburgerBtn.classList.remove("active");
      }
    });
  }
};
