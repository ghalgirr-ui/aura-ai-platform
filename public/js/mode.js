window.Aura = window.Aura || {};

window.Aura.initModes = () => {
  const modeSelect = document.getElementById("modeSelect");
  const modeButtons = document.querySelectorAll(".features .feature-btn[data-mode]");

  const activateModeButton = (selectedMode) => {
    modeButtons.forEach((button) => {
      button.classList.toggle("active", button.dataset.mode === selectedMode);
    });
  };

  modeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const selectedMode = button.dataset.mode || "general";
      if (modeSelect) modeSelect.value = selectedMode;
      activateModeButton(selectedMode);
    });
  });

  modeSelect?.addEventListener("change", () => activateModeButton(modeSelect.value || "general"));
  activateModeButton(modeSelect?.value || "general");
};
