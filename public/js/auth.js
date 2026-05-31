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
  if (type) authFeedback.classList.add(type);
};

const updateDevOtp = () => {
  devOtp.textContent = "";
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
  localStorage.setItem("user", JSON.stringify(data.user));
  localStorage.setItem("userId", data.user.id);
  localStorage.setItem("username", data.user.username);
  localStorage.setItem("userRole", data.user.role || "user");
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

/* LOGIN */
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
  } catch {
    setFeedback("Server unavailable. Try again later.", "error");
  }
};

/* SIGNUP + PAYMENT */
const handleSignup = async (event) => {
  event.preventDefault();
  setFeedback("");

  const username = document.getElementById("signupUsername").value.trim();
  const email = document.getElementById("signupEmail").value.trim().toLowerCase();
  const password = document.getElementById("signupPassword").value;
  const signupBtn = signupForm.querySelector('button[type="submit"]');

  if (!username || !email || !password) {
    setFeedback("Complete every field to create an account.", "error");
    return;
  }

  if (typeof Razorpay === "undefined") {
    setFeedback("Payment gateway unavailable. Refresh page and try again.", "error");
    return;
  }

  try {
    signupBtn.disabled = true;
    signupBtn.textContent = "Preparing payment...";

    setFeedback("Creating activation payment...", "info");

    const createOrderResp = await fetch("/api/auth/create-order", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        username,
        email,
        password,
      }),
    });

    const orderData = await createOrderResp.json();

    if (!createOrderResp.ok) {
      signupBtn.disabled = false;
      signupBtn.textContent = "Create Account (₹2)";
      setFeedback(orderData.error || "Payment creation failed.", "error");
      return;
    }

    const signupData = { username, email, password };

    const options = {
      key: orderData.keyId,
      order_id: orderData.orderId,
      amount: orderData.amount,
      currency: "INR",
      name: "Aura AI",
      description: "Aura Activation Fee (₹2)",

      prefill: {
        name: username,
        email: email,
      },

      handler: async (paymentResponse) => {
        await verifyPaymentAndSignup(paymentResponse, signupData);
      },

      modal: {
        ondismiss: () => {
          signupBtn.disabled = false;
          signupBtn.textContent = "Create Account (₹2)";
          setFeedback("One-time activation payment required only for new account creation.", "error");
        },
      },

      theme: {
        color: "#7c4dff",
      },
    };

    const razorpay = new Razorpay(options);
    razorpay.open();

  } catch (error) {
    console.error(error);
    signupBtn.disabled = false;
    signupBtn.textContent = "Create Account (₹2)";
    setFeedback("Server unavailable. Try again later.", "error");
  }
};

/* VERIFY PAYMENT */
const verifyPaymentAndSignup = async (paymentResponse, signupData) => {
  const signupBtn = signupForm.querySelector('button[type="submit"]');

  try {
    setFeedback("Verifying payment...", "info");

    const verifyResp = await fetch("/api/auth/verify-payment", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        razorpay_order_id: paymentResponse.razorpay_order_id,
        razorpay_payment_id: paymentResponse.razorpay_payment_id,
        razorpay_signature: paymentResponse.razorpay_signature,
        username: signupData.username,
        email: signupData.email,
        password: signupData.password,
      }),
    });

    const json = await verifyResp.json();

    if (!verifyResp.ok) {
      signupBtn.disabled = false;
      signupBtn.textContent = "Create Account (₹2)";
      setFeedback(json.error || "Payment verification failed.", "error");
      return;
    }

    signupBtn.disabled = false;
    signupBtn.textContent = "Create Account (₹2)";

    setFeedback(json.message || "Payment successful! OTP sent.", "success");
    showVerifyScreen(json.email, json.devOtp);

  } catch (error) {
    console.error(error);
    signupBtn.disabled = false;
    signupBtn.textContent = "Create Account (₹2)";
    setFeedback("Verification failed. Try again.", "error");
  }
};

/* OTP VERIFY */
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

  } catch {
    setFeedback("Server unavailable. Try again later.", "error");
  }
};

/* RESEND OTP */
const handleResendOtp = async () => {
  setFeedback("");

  const pending = getPendingAuth();
  const email = pending.email || otpEmailInput.value.trim().toLowerCase();

  if (!email) {
    setFeedback("Email required.", "error");
    return;
  }

  try {
    const { response, json } = await apiRequest("/api/auth/resend-otp", { email });

    if (!response.ok) {
      setFeedback(json.error || "Unable to resend OTP.", "error");
      return;
    }

    updateDevOtp(json.devOtp);
    setFeedback(json.message || "OTP resent.", "success");

  } catch {
    setFeedback("Server unavailable. Try again later.", "error");
  }
};

/* LOAD */
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

/* EVENTS */
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
  clearPendingAuth();
  setPanel("login");
  setFeedback("");
  updateDevOtp("");
});

// Dev test payment button (local only)
// const devTestBtn = document.getElementById("devTestPayBtn");
// if (devTestBtn) {
//   const hostname = window.location.hostname || "";
//   const isLocalhost = hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || hostname.endsWith(".local");
//   if (isLocalhost) {
//     devTestBtn.style.display = "block";
//   }

  devTestBtn.addEventListener("click", async () => {
    const username = document.getElementById("signupUsername").value.trim();
    const email = document.getElementById("signupEmail").value.trim().toLowerCase();
    const password = document.getElementById("signupPassword").value;

    if (!username || !email || !password) {
      setFeedback("Fill username, email and password first.", "error");
      return;
    }

    try {
      devTestBtn.disabled = true;
      setFeedback("Simulating dev payment...", "info");

      // const resp = await fetch("/api/auth/dev-payment-success", {
      //   method: "POST",
      //   headers: { "Content-Type": "application/json" },
      //   body: JSON.stringify({ username, email, password }),
      // });

      const json = await resp.json();
      devTestBtn.disabled = false;

      if (!resp.ok) {
        setFeedback(json.error || "Dev payment simulation failed.", "error");
        return;
      }

      setFeedback(json.message || "Dev payment simulated.", "success");
      setPendingAuth({ email: json.email });
      updateDevOtp(json.devOtp);
      setPanel("verify");
    } catch (err) {
      console.error(err);
      devTestBtn.disabled = false;
      setFeedback("Dev payment request failed.", "error");
    }
  });
