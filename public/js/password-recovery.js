(() => {
  const page = document.body.dataset.recoveryPage;
  const sendRequest = async (path, payload) => {
    const response = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    return { response };
  };

  const setStatus = (element, message, type = "") => {
    element.textContent = message;
    element.className = "recovery-status";
    if (type) element.classList.add(type);
  };

  if (page === "forgot") {
    const form = document.getElementById("forgotPasswordForm");
    const emailInput = document.getElementById("recoveryEmail");
    const status = document.getElementById("recoveryStatus");
    const submitButton = form.querySelector('button[type="submit"]');

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const email = emailInput.value.trim();

      if (!emailInput.validity.valid || !email) {
        setStatus(status, "Enter a valid email address.", "error");
        emailInput.focus();
        return;
      }

      submitButton.disabled = true;
      submitButton.textContent = "Sending…";
      setStatus(status, "Submitting your request…");

      try {
        const { response } = await sendRequest("/api/auth/forgot-password", { email });
        if (response.status === 429) {
          setStatus(status, "Too many requests. Please try again in a few minutes.", "error");
        } else if (response.status >= 500) {
          setStatus(status, "We couldn’t process your request right now. Please try again later.", "error");
        } else if (response.ok) {
          setStatus(
            status,
            "If an account exists for this email, a reset link will arrive shortly. Check your spam folder; if it doesn’t arrive, try again later.",
            "success"
          );
        } else {
          setStatus(status, "Enter a valid email address.", "error");
        }
      } catch {
        setStatus(status, "We couldn’t reach Aura right now. Check your connection and try again.", "error");
      } finally {
        submitButton.disabled = false;
        submitButton.textContent = "Send reset link";
      }
    });

    return;
  }

  if (page !== "reset") return;

  const form = document.getElementById("resetPasswordForm");
  const status = document.getElementById("resetStatus");
  const description = document.getElementById("resetDescription");
  const requestNewLink = document.getElementById("requestNewLink");
  const submitButton = document.getElementById("resetSubmitButton");
  const hashToken = new URLSearchParams(window.location.hash.slice(1)).get("token");
  let token = hashToken || new URLSearchParams(window.location.search).get("token") || "";
  window.history.replaceState(null, document.title, window.location.pathname);

  const showInvalidLink = () => {
    form.hidden = true;
    setStatus(status, "This password reset link is invalid, expired, or has already been used. Request a new link to continue.", "error");
    requestNewLink.hidden = false;
  };

  const verifyLink = async () => {
    if (!/^[a-f\d]{64}$/i.test(token)) {
      showInvalidLink();
      return;
    }

    try {
      const { response } = await sendRequest("/api/auth/verify-reset-token", { token });
      if (!response.ok) {
        showInvalidLink();
        return;
      }

      form.hidden = false;
      status.hidden = true;
      description.textContent = "Create a strong password with at least 8 characters.";
    } catch {
      setStatus(status, "We couldn’t verify this link right now. Check your connection and reload the page.", "error");
      requestNewLink.hidden = false;
    }
  };

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const passwordInput = document.getElementById("newPassword");
    const confirmInput = document.getElementById("confirmPassword");
    const password = passwordInput.value;

    if (password.length < 8) {
      passwordInput.setCustomValidity("Use at least 8 characters.");
      passwordInput.reportValidity();
      passwordInput.setCustomValidity("");
      return;
    }

    if (password !== confirmInput.value) {
      status.hidden = false;
      setStatus(status, "Your passwords don’t match. Please check both fields.", "error");
      confirmInput.focus();
      return;
    }

    submitButton.disabled = true;
    submitButton.textContent = "Updating…";
    setStatus(status, "");
    status.hidden = false;

    try {
      const { response } = await sendRequest("/api/auth/reset-password", { token, password });
      if (response.status === 429) {
        setStatus(status, "Too many requests. Please wait a few minutes and try again.", "error");
      } else if (response.status === 422) {
        setStatus(status, "Use a password of at least 8 characters and no more than 72 UTF-8 bytes.", "error");
      } else if (response.status === 400) {
        token = "";
        showInvalidLink();
      } else if (response.ok) {
        token = "";
        form.hidden = true;
        requestNewLink.hidden = true;
        description.textContent = "Your Aura AI password has been updated.";
        setStatus(status, "Password updated successfully. You can now sign in with your new password.", "success");
        document.getElementById("loginLink").focus();
      } else {
        setStatus(status, "We couldn’t update your password right now. Please try again later.", "error");
      }
    } catch {
      setStatus(status, "We couldn’t reach Aura right now. Check your connection and try again.", "error");
    } finally {
      if (token) {
        submitButton.disabled = false;
        submitButton.textContent = "Update password";
      }
    }
  });

  document.querySelectorAll(".password-toggle").forEach((button) => {
    button.addEventListener("click", () => {
      const input = document.getElementById(button.dataset.target);
      if (!input) return;

      const showPassword = input.type === "password";
      input.type = showPassword ? "text" : "password";
      button.textContent = showPassword ? "Hide" : "Show";
      button.setAttribute("aria-label", `${showPassword ? "Hide" : "Show"} ${input.id === "newPassword" ? "new" : "confirmation"} password`);
      button.setAttribute("aria-pressed", String(showPassword));
    });
  });

  verifyLink();
})();
