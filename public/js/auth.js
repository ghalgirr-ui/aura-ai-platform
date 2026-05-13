const authFeedback = document.getElementById("authFeedback");
const devOtp = document.getElementById("devOtp");
const loginTab = document.getElementById("loginTab");
const signupTab = document.getElementById("signupTab");
const loginPanel = document.getElementById("loginPanel");
const signupPanel = document.getElementById("signupPanel");
const otpPanel = document.getElementById("otpPanel");
const loginForm = document.getElementById("loginForm");
const signupForm = document.getElementById("signupForm");
const otpForm = document.getElementById("otpForm");
const otpEmailInput = document.getElementById("otpEmail");
const resendOtpBtn = document.getElementById("resendOtpBtn");
const backToLoginBtn = document.getElementById("backToLoginBtn");

const AUTH_REDIRECT = "/dashboard.html";
const STORAGE_KEY = "auraPendingAuth";

const setPanel = (panel) => {
  loginTab.classList.toggle("active", panel === "login");
  signupTab.classList.toggle("active", panel === "signup");

  loginTab.setAttribute("aria-selected", panel === "login");
  signupTab.setAttribute("aria-selected", panel === "signup");

  loginPanel.classList.toggle("active", panel === "login");
  signupPanel.classList.toggle("active", panel === "signup");
  otpPanel.classList.toggle("active", panel === "verify");

  loginPanel.setAttribute("aria-hidden", panel !== "login");
  signupPanel.setAttribute("aria-hidden", panel !== "signup");
  otpPanel.setAttribute("aria-hidden", panel !== "verify");
};

const setFeedback = (message = "", type = "") => {
  authFeedback.textContent = message;
  authFeedback.className = "feedback";
  if (type) {
    authFeedback.classList.add(type);
  }
};

const updateDevOtp = (code) => {
  devOtp.textContent = code ? `Dev OTP: ${code}` : "";
};

const getPendingAuth = () => {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "null") || {};
  } catch {
    return {};
  }
};

const setPendingAuth = (payload) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
};

const clearPendingAuth = () => {
  localStorage.removeItem(STORAGE_KEY);
};

const storeSession = (data) => {
  localStorage.setItem("token", data.token);
  localStorage.setItem("userId", data.user.id);
  localStorage.setItem("username", data.user.username);
};

const redirectDashboard = () => {
  window.location.href = AUTH_REDIRECT;
};

const apiRequest = async (path, body) => {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await response.json();
  return { response, json };
};

const showVerifyScreen = (email, devOtpCode) => {
  otpEmailInput.value = email;
  setPendingAuth({ email });
  updateDevOtp(devOtpCode);
  setPanel("verify");
  setFeedback("OTP sent. Enter the code we emailed to your inbox.", "success");
};

const handleLogin = async (event) => {
  event.preventDefault();
  setFeedback("");

  const email = document.getElementById("loginEmail").value.trim().toLowerCase();
  const password = document.getElementById("loginPassword").value;

  if (!email || !password) {
    setFeedback("Please enter email and password.", "error");
    return;
  }

  try {
    const { response, json } = await apiRequest("/api/auth/login", { email, password });
    if (!response.ok) {
      setFeedback(json.error || "Unable to login.", "error");
      return;
    }

    storeSession(json);
    clearPendingAuth();
    redirectDashboard();
  } catch (error) {
    setFeedback("Server unavailable. Try again later.", "error");
  }
};

const handleSignup = async (event) => {
  event.preventDefault();
  setFeedback("");

  const username = document.getElementById("signupUsername").value.trim();
  const email = document.getElementById("signupEmail").value.trim().toLowerCase();
  const password = document.getElementById("signupPassword").value;

  if (!username || !email || !password) {
    setFeedback("Complete every field to create an account.", "error");
    return;
  }

  try {
    const { response, json } = await apiRequest("/api/auth/signup", { username, email, password });
    if (!response.ok) {
      setFeedback(json.error || "Signup failed.", "error");
      return;
    }

    showVerifyScreen(json.email, json.devOtp);
  } catch (error) {
    setFeedback("Server unavailable. Try again later.", "error");
  }
};

const handleVerify = async (event) => {
  event.preventDefault();
  setFeedback("");

  const email = otpEmailInput.value.trim().toLowerCase();
  const otp = document.getElementById("otpCode").value.trim();

  if (!email || !otp) {
    setFeedback("Enter your email and OTP code.", "error");
    return;
  }

  try {
    const { response, json } = await apiRequest("/api/auth/verify", { email, otp });
    if (!response.ok) {
      setFeedback(json.error || "OTP verification failed.", "error");
      return;
    }

    storeSession(json);
    clearPendingAuth();
    redirectDashboard();
  } catch (error) {
    setFeedback("Server unavailable. Try again later.", "error");
  }
};

const handleResendOtp = async () => {
  setFeedback("");
  const pending = getPendingAuth();
  const email = pending.email || otpEmailInput.value.trim().toLowerCase();

  if (!email) {
    setFeedback("Email is required to resend the OTP.", "error");
    return;
  }

  try {
    const { response, json } = await apiRequest("/api/auth/resend-otp", { email });
    if (!response.ok) {
      setFeedback(json.error || "Unable to resend OTP.", "error");
      return;
    }

    updateDevOtp(json.devOtp);
    setFeedback(json.message || "OTP resent successfully.", "success");
  } catch (error) {
    setFeedback("Server unavailable. Try again later.", "error");
  }
};

window.addEventListener("load", () => {
  const token = localStorage.getItem("token");
  if (token) {
    redirectDashboard();
    return;
  }

  const pending = getPendingAuth();
  if (pending.email) {
    otpEmailInput.value = pending.email;
    setPanel("verify");
  }
});

loginTab.addEventListener("click", () => {
  setPanel("login");
  setFeedback("");
  updateDevOtp("");
});

signupTab.addEventListener("click", () => {
  setPanel("signup");
  setFeedback("");
  updateDevOtp("");
});

loginForm.addEventListener("submit", handleLogin);
signupForm.addEventListener("submit", handleSignup);
otpForm.addEventListener("submit", handleVerify);
resendOtpBtn.addEventListener("click", handleResendOtp);
backToLoginBtn.addEventListener("click", () => {
  setPanel("login");
  setFeedback("");
  updateDevOtp("");
  clearPendingAuth();
});
