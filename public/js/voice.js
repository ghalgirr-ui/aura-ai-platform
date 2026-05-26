window.Aura = window.Aura || {};

window.Aura.voiceMessage = (message) => {
  const voiceBtn = document.getElementById("voiceInputBtn");
  if (voiceBtn) voiceBtn.title = message;
};

window.Aura.setVoiceState = (state, label) => {
  const voiceBtn = document.getElementById("voiceInputBtn");
  if (!voiceBtn) return;
  voiceBtn.classList.toggle("active", state === "listening");
  voiceBtn.classList.toggle("listening", state === "listening");
  voiceBtn.setAttribute("aria-pressed", state === "listening" ? "true" : "false");
  voiceBtn.textContent = label || (state === "listening" ? "Stop Voice" : "Voice Input");
};

window.Aura.isVoiceInputSupported = () => {
  return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
};

window.Aura.isVoiceOutputSupported = () => {
  return typeof window.speechSynthesis !== "undefined";
};

window.Aura.startVoiceRecognition = async () => {
  const input = document.getElementById("userInput");
  if (!input || window.Aura.state?.isStreaming) return;

  if (!window.Aura.isVoiceInputSupported()) {
    window.Aura.voiceMessage("Voice input is not supported in this browser.");
    window.Aura.addMessage?.("Voice input is not supported in this browser. Try Chrome on desktop or Android.", "bot");
    return;
  }

  if (navigator.mediaDevices?.getUserMedia) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
    } catch (error) {
      const denied = error?.name === "NotAllowedError" || error?.name === "SecurityError";
      const msg = denied
        ? "Microphone permission was blocked. Allow microphone access in your browser settings and try again."
        : "Microphone is unavailable on this device.";
      window.Aura.voiceMessage(msg);
      window.Aura.addMessage?.(msg, "bot");
      return;
    }
  }

  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const recognition = new Recognition();
  recognition.lang = "en-US";
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;

  let finalTranscript = "";
  let heardSpeech = false;

  const cleanup = () => {
    clearTimeout(window.Aura.state.voiceTimeout);
    window.Aura.state.voiceRecognitionActive = false;
    window.Aura.state.speechRecognition = null;
    window.Aura.setVoiceState("idle", "Voice Input");
  };

  recognition.onstart = () => {
    window.Aura.state.voiceRecognitionActive = true;
    window.Aura.state.speechRecognition = recognition;
    window.Aura.setVoiceState("listening", "Stop Voice");
    window.Aura.voiceMessage("Listening. Voice input is beta and may vary by browser.");
    window.Aura.state.voiceTimeout = window.setTimeout(() => {
      if (window.Aura.state.voiceRecognitionActive) recognition.stop();
    }, 12000);
  };

  recognition.onresult = (event) => {
    let interimTranscript = "";
    heardSpeech = true;
    for (let i = event.resultIndex; i < event.results.length; i += 1) {
      const transcript = event.results[i][0].transcript;
      if (event.results[i].isFinal) finalTranscript += transcript;
      else interimTranscript += transcript;
    }
    input.value = `${finalTranscript} ${interimTranscript}`.trim();
    if (window.Aura.Analytics) window.Aura.Analytics.trackVoiceInput();
  };

  recognition.onerror = (event) => {
    const messages = {
      "no-speech": "No speech detected. Tap Voice Input and try speaking after the browser prompt.",
      "audio-capture": "No microphone was found.",
      "not-allowed": "Microphone permission was blocked.",
      network: "Voice recognition network service is unavailable.",
    };
    const message = messages[event.error] || `Voice input error: ${event.error}`;
    if (event.error !== "aborted") {
      window.Aura.voiceMessage(message);
      if (event.error !== "no-speech" || !heardSpeech) window.Aura.addMessage?.(message, "bot");
    }
    cleanup();
  };

  recognition.onend = () => {
    const shouldSend = input.value.trim() && !window.Aura.state.isStreaming;
    cleanup();
    if (shouldSend) window.Aura.sendMessage();
  };

  try {
    recognition.start();
  } catch {
    cleanup();
    window.Aura.addMessage?.("Unable to start voice input. Please wait a moment and try again.", "bot");
  }
};

window.Aura.stopVoiceRecognition = () => {
  if (!window.Aura.state?.speechRecognition) return;
  window.Aura.state.speechRecognition.stop();
};

window.Aura.toggleVoiceRecognition = () => {
  if (window.Aura.state?.voiceRecognitionActive) window.Aura.stopVoiceRecognition();
  else window.Aura.startVoiceRecognition();
};

window.Aura.initVoice = () => {
  const voiceBtn = document.getElementById("voiceInputBtn");
  if (!voiceBtn) return;
  voiceBtn.setAttribute("aria-pressed", "false");
  voiceBtn.textContent = "Voice Input";
  if (!window.Aura.isVoiceInputSupported()) {
    voiceBtn.classList.add("unsupported");
    voiceBtn.title = "Voice input is not supported in this browser.";
  }
  voiceBtn.addEventListener("click", window.Aura.toggleVoiceRecognition);
};
