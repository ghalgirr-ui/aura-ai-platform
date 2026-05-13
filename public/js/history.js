window.Aura.createNewChat = async () => {
  const res = await fetch("/api/chat/new", {
    method: "POST",
    headers: window.Aura.getAuthHeaders(),
  });

  if (await window.Aura.handleUnauthorized(res)) return;

  const data = await res.json();
  window.Aura.state.currentChatId = data.chatId;
  localStorage.setItem("chatId", data.chatId);
  document.getElementById("chatBox").innerHTML = "";
  document.body.classList.remove("chat-active");
};

window.Aura.loadChats = async () => {
  const res = await fetch("/api/chat", {
    headers: window.Aura.getAuthHeaders(),
  });

  if (await window.Aura.handleUnauthorized(res)) return;

  const chats = await res.json();
  const sidebar = document.getElementById("history");
  if (!sidebar) return;

  sidebar.innerHTML = "";

  chats.forEach((chat) => {
    const item = document.createElement("div");
    item.className = "chat-item";

    if (chat.chatId === window.Aura.state.currentChatId) {
      item.classList.add("active");
    }

    item.innerHTML = `
      <span class="chat-title">${chat.title || "New Chat"}</span>
      <div class="actions">
        <button class="rename-btn">✏️</button>
        <button class="delete-btn">🗑</button>
      </div>
    `;

    item.querySelector(".chat-title").onclick = () => window.Aura.loadChat(chat.chatId);
    item.querySelector(".rename-btn").onclick = (e) => {
      e.stopPropagation();
      window.Aura.renameChat(chat.chatId);
    };
    item.querySelector(".delete-btn").onclick = (e) => {
      e.stopPropagation();
      window.Aura.deleteChat(chat.chatId);
    };

    sidebar.appendChild(item);
  });
};

window.Aura.loadChat = async (chatId) => {
  window.Aura.state.currentChatId = chatId;
  localStorage.setItem("chatId", chatId);

  const res = await fetch(`/api/chat/${chatId}`, {
    headers: window.Aura.getAuthHeaders(),
  });

  if (await window.Aura.handleUnauthorized(res)) return;

  const data = await res.json();
  const box = document.getElementById("chatBox");
  if (!box) return;

  box.innerHTML = "";

  data.messages.forEach((msg) => {
    if (msg.file && msg.role === "user") {
      window.Aura.addFileMessageFromHistory(msg);
    } else {
      window.Aura.addMessage(msg.content, msg.role === "user" ? "user" : "bot");
    }
  });

  document.body.classList.add("chat-active");
  document.getElementById("history")?.classList.remove("show");
  window.Aura.state.historyVisible = false;
};

window.Aura.renameChat = async (chatId) => {
  const name = prompt("Enter new name:");
  if (!name) return;

  const res = await fetch(`/api/chat/${chatId}`, {
    method: "PUT",
    headers: window.Aura.getAuthHeaders(),
    body: JSON.stringify({ title: name }),
  });

  if (await window.Aura.handleUnauthorized(res)) return;

  window.Aura.loadChats();
};

window.Aura.deleteChat = async (chatId) => {
  if (!confirm("Delete chat?")) return;

  const res = await fetch(`/api/chat/${chatId}`, {
    method: "DELETE",
    headers: window.Aura.getAuthHeaders(),
  });

  if (await window.Aura.handleUnauthorized(res)) return;

  if (chatId === window.Aura.state.currentChatId) {
    window.Aura.state.currentChatId = null;
    localStorage.removeItem("chatId");
    document.getElementById("chatBox").innerHTML = "";
    document.body.classList.remove("chat-active");
  }

  window.Aura.loadChats();
};
