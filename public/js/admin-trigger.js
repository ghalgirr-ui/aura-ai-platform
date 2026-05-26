window.Aura = window.Aura || {};

window.Aura.fetchUserFallback = async () => {
  const token = window.Aura.getToken();
  if (!token) return null;

  try {
    const response = await fetch("/api/auth/me", {
      headers: window.Aura.getAuthHeaders(),
    });
    if (!response.ok) return null;
    const data = await response.json();
    if (data.user) {
      window.Aura.setSession({ token, user: data.user });
      return data.user;
    }
  } catch {
    return null;
  }
  return null;
};

window.Aura.initAdminTrigger = async () => {
  let localUser = window.Aura.getUser();
  if (!localUser && window.Aura.getToken()) {
    localUser = await window.Aura.fetchUserFallback();
  }

  const isAdminUser = localUser?.role === "admin" || window.Aura.isAdmin?.();
  let auraLogoTapCount = 0;
  let auraLogoTapTimer = null;

  const resetAuraLogoTap = () => {
    auraLogoTapCount = 0;
    auraLogoTapTimer = null;
  };

  const openAdmin = () => {
    window.location.href = "/aura-control-center";
  };

  document.querySelector(".dashboard-header .aura-logo")?.addEventListener("click", () => {
    if (!isAdminUser) return;
    auraLogoTapCount += 1;
    clearTimeout(auraLogoTapTimer);
    auraLogoTapTimer = window.setTimeout(resetAuraLogoTap, 2000);
    if (auraLogoTapCount >= 5) {
      resetAuraLogoTap();
      openAdmin();
    }
  });

  window.addEventListener("keydown", (event) => {
    if (!isAdminUser) return;
    if (event.ctrlKey && event.altKey && event.code === "KeyA") {
      event.preventDefault();
      openAdmin();
    }
  });
};
