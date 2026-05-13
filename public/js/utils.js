window.Aura = window.Aura || {};

window.Aura.getToken = () => localStorage.getItem("token");
window.Aura.getUsername = () => localStorage.getItem("username");
window.Aura.setSession = ({ token, user }) => {
  localStorage.setItem("token", token);
  localStorage.setItem("userId", user.id);
  localStorage.setItem("username", user.username);
};
window.Aura.clearSession = () => {
  localStorage.removeItem("token");
  localStorage.removeItem("userId");
  localStorage.removeItem("username");
  localStorage.removeItem("chatId");
};
window.Aura.getAuthHeaders = () => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${window.Aura.getToken()}`,
});

window.Aura.formatMessage = (text) =>
  text
    .replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>')
    .replace(/\*\*(.*?)\*\*/g, "<b>$1</b>")
    .replace(/\*(.*?)\*/g, "<i>$1</i>")
    .replace(/\n/g, "<br>");

window.Aura.handleUnauthorized = async (response) => {
  if (response.status === 401 || response.status === 403) {
    window.Aura.clearSession();
    window.location.href = "/auth.html";
    return true;
  }
  return false;
};

window.Aura.sanitizeInput = (value) =>
  typeof value === "string" ? value.trim() : value;
