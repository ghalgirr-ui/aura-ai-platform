// Admin Dashboard JavaScript
const AdminDashboard = {
  token: localStorage.getItem("token") || "",
  apiBase: "/api/admin",
  currentSection: "dashboard",

  init: function () {
    // Check auth
    if (!this.token) {
      console.warn("No token found. Redirecting to login...");
      window.location.href = "/auth.html";
      return;
    }

    // Verify admin access with a test request
    this.verifyAdminAccess();

    // Setup navigation
    document.querySelectorAll(".admin-nav-item").forEach((item) => {
      item.addEventListener("click", (e) => this.switchSection(e.currentTarget.dataset.section));
    });

    // Setup logout
    document.getElementById("logoutAdminBtn")?.addEventListener("click", () => this.logout());

    // Load initial data
    this.loadDashboard();
    this.loadUsers();
    this.loadAnalytics();
    this.loadSupport();
    this.loadPayments();

    // Setup search and filters
    document.getElementById("usersSearch")?.addEventListener("input", (e) => this.searchUsers(e.target.value));
    document.getElementById("supportSearch")?.addEventListener("input", (e) => this.searchSupport(e.target.value));
    document.getElementById("supportTypeFilter")?.addEventListener("change", () => this.loadSupport());
    document.getElementById("supportStatusFilter")?.addEventListener("change", () => this.loadSupport());
  },

  verifyAdminAccess: async function () {
    // Make a test request to verify admin access
    try {
      const response = await fetch(`${this.apiBase}/dashboard`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.token}`,
        },
      });

      if (response.status === 401) {
        console.error("Unauthorized: Invalid or expired token");
        this.logout();
        return;
      }

      if (response.status === 403) {
        console.error("Access Denied: User is not an admin");
        alert("⛔ Access Denied!\n\nYou do not have admin permissions.\nIf you should be an admin, contact the system administrator.");
        window.location.href = "/dashboard.html";
        return;
      }

      if (!response.ok) {
        console.error(`Error: HTTP ${response.status}`);
        alert("Error verifying admin access");
        this.logout();
        return;
      }
    } catch (error) {
      console.error("Failed to verify admin access:", error);
      alert("Error connecting to server");
      this.logout();
    }
  },

  switchSection: function (section) {
    // Hide all sections
    document.querySelectorAll(".admin-section").forEach((s) => s.classList.add("hidden"));

    // Show selected section
    const sectionEl = document.getElementById(section + "Section");
    if (sectionEl) {
      sectionEl.classList.remove("hidden");
    }

    // Update nav
    document.querySelectorAll(".admin-nav-item").forEach((item) => {
      item.classList.toggle("active", item.dataset.section === section);
    });

    this.currentSection = section;
  },

  request: async function (endpoint, options = {}) {
    const headers = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.token}`,
      ...options.headers,
    };

    try {
      const response = await fetch(`${this.apiBase}${endpoint}`, {
        ...options,
        headers,
      });

      if (!response.ok) {
        if (response.status === 401) {
          this.logout();
          return null;
        }
        throw new Error(`HTTP ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error("API Error:", error);
      return null;
    }
  },

  // DASHBOARD
  loadDashboard: async function () {
    const data = await this.request("/dashboard");
    if (data) {
      document.getElementById("totalUsersValue").textContent = data.totalUsers;
      document.getElementById("verifiedUsersValue").textContent = data.verifiedUsers;
      document.getElementById("paidUsersValue").textContent = data.paidUsers;
      document.getElementById("activeUsersValue").textContent = data.activeUsers;
      document.getElementById("openTicketsValue").textContent = data.supportTickets || 0;
      document.getElementById("totalChatsValue").textContent = data.totalChats || 0;
    }
  },

  // USERS
  loadUsers: async function () {
    const data = await this.request("/users?limit=100");
    if (data && data.users) {
      const tbody = document.getElementById("usersTableBody");
      tbody.innerHTML = data.users
        .map(
          (u) => `
        <tr>
          <td>${u.username}</td>
          <td>${u.email}</td>
          <td>${u.role}</td>
          <td>${u.isVerified ? "✓ Verified" : "Pending"}</td>
          <td>${new Date(u.createdAt).toLocaleDateString()}</td>
          <td>
            <div class="action-buttons">
              <button class="action-btn" onclick="AdminDashboard.viewUserDetail('${u.id}')">View</button>
              <button class="action-btn" onclick="AdminDashboard.editUserRole('${u.id}')">Role</button>
            </div>
          </td>
        </tr>
      `
        )
        .join("");
    }
  },

  searchUsers: async function (query) {
    const data = await this.request(`/users?q=${encodeURIComponent(query)}`);
    if (data && data.users) {
      const tbody = document.getElementById("usersTableBody");
      tbody.innerHTML = data.users
        .map(
          (u) => `
        <tr>
          <td>${u.username}</td>
          <td>${u.email}</td>
          <td>${u.role}</td>
          <td>${u.isVerified ? "✓ Verified" : "Pending"}</td>
          <td>${new Date(u.createdAt).toLocaleDateString()}</td>
          <td>
            <div class="action-buttons">
              <button class="action-btn" onclick="AdminDashboard.viewUserDetail('${u.id}')">View</button>
              <button class="action-btn" onclick="AdminDashboard.editUserRole('${u.id}')">Role</button>
            </div>
          </td>
        </tr>
      `
        )
        .join("");
    }
  },

  viewUserDetail: async function (userId) {
    const data = await this.request(`/users/${userId}`);
    if (data) {
      const analytics = data.analytics || {};
      document.getElementById("modalTitle").textContent = `User: ${data.user.username}`;
      document.getElementById("modalBody").innerHTML = `
        <div style="display: grid; gap: 12px;">
          <div>
            <label style="font-size: 11px; color: #94a3b8; text-transform: uppercase;">Email</label>
            <p style="margin: 4px 0; color: #e2e8f0;">${data.user.email}</p>
          </div>
          <div>
            <label style="font-size: 11px; color: #94a3b8; text-transform: uppercase;">Role</label>
            <p style="margin: 4px 0; color: #e2e8f0;">${data.user.role}</p>
          </div>
          <div>
            <label style="font-size: 11px; color: #94a3b8; text-transform: uppercase;">Status</label>
            <p style="margin: 4px 0; color: #e2e8f0;">${data.user.isVerified ? "✓ Verified" : "Pending Verification"}</p>
          </div>
          <div>
            <label style="font-size: 11px; color: #94a3b8; text-transform: uppercase;">Subscription</label>
            <p style="margin: 4px 0; color: #e2e8f0;">${data.user.isPaid ? "✓ Premium" : "Free"}</p>
          </div>
          <div>
            <label style="font-size: 11px; color: #94a3b8; text-transform: uppercase;">Joined</label>
            <p style="margin: 4px 0; color: #e2e8f0;">${new Date(data.user.createdAt).toLocaleDateString()}</p>
          </div>
          <hr style="border: none; border-top: 1px solid rgba(139, 92, 246, 0.1); margin: 12px 0;">
          <div>
            <label style="font-size: 11px; color: #94a3b8; text-transform: uppercase;">Activity</label>
            <p style="margin: 4px 0; color: #e2e8f0; font-size: 12px;">
              Logins: ${analytics.loginCount || 0} | Messages: ${analytics.messagesSent || 0} | Responses: ${analytics.aiResponses || 0}
            </p>
          </div>
        </div>
      `;
      document.getElementById("detailModal").classList.remove("hidden");
    }
  },

  editUserRole: async function (userId) {
    const newRole = prompt("Enter new role (user/admin):", "user");
    if (!newRole) return;

    const result = await this.request(`/users/${userId}`, {
      method: "PATCH",
      body: JSON.stringify({ role: newRole }),
    });

    if (result) {
      alert("User role updated");
      this.loadUsers();
    }
  },

  // ANALYTICS
  loadAnalytics: async function () {
    const data = await this.request("/analytics?limit=100");
    if (data && data.analytics) {
      const tbody = document.getElementById("analyticsTableBody");
      tbody.innerHTML = data.analytics
        .map(
          (a) => `
        <tr>
          <td>${a.userId?.username || "Unknown"}</td>
          <td>${a.dashboardOpens || 0}</td>
          <td>${a.messagesSent || 0}</td>
          <td>${a.aiResponses || 0}</td>
          <td>${a.webSearchCount || 0}</td>
          <td>${a.lastSeen ? new Date(a.lastSeen).toLocaleDateString() : "Never"}</td>
        </tr>
      `
        )
        .join("");
    }
  },

  // SUPPORT TICKETS
  loadSupport: async function () {
    const type = document.getElementById("supportTypeFilter")?.value || "";
    const status = document.getElementById("supportStatusFilter")?.value || "";

    let query = "?limit=100";
    if (type) query += `&type=${type}`;
    if (status) query += `&status=${status}`;

    const data = await this.request(`/support${query}`);
    if (data && data.tickets) {
      const tbody = document.getElementById("supportTableBody");
      tbody.innerHTML = data.tickets
        .map(
          (t) => `
        <tr>
          <td>${t.userId?.username || "Unknown"}</td>
          <td>${t.type === "feedback" ? "📝 Feedback" : "❓ Help"}</td>
          <td>${t.category || "-"}</td>
          <td>${t.rating ? "⭐ " + t.rating : "-"}</td>
          <td><span style="color: ${t.status === "open" ? "#fca5a5" : "#86efac"};">${t.status}</span></td>
          <td>${new Date(t.createdAt).toLocaleDateString()}</td>
          <td>
            <div class="action-buttons">
              <button class="action-btn" onclick="AdminDashboard.viewTicket('${t._id}')">View</button>
              <button class="action-btn" onclick="AdminDashboard.updateTicketStatus('${t._id}', 'reviewed')">Mark Reviewed</button>
              <button class="action-btn" onclick="AdminDashboard.updateTicketStatus('${t._id}', 'resolved')">Resolve</button>
              <button class="action-btn delete" onclick="AdminDashboard.deleteTicket('${t._id}')">Delete</button>
            </div>
          </td>
        </tr>
      `
        )
        .join("");
    }
  },

  viewTicket: async function (ticketId) {
    const data = await this.request(`/support/${ticketId}`);
    if (data) {
      const screenshotHtml = data.screenshot
        ? `<img src="${data.screenshot}" style="max-width: 100%; border-radius: 8px; margin-top: 12px; max-height: 200px;">`
        : "";

      document.getElementById("modalTitle").textContent = `${data.type === "feedback" ? "Feedback" : "Help"} Ticket`;
      document.getElementById("modalBody").innerHTML = `
        <div style="display: grid; gap: 12px;">
          <div>
            <label style="font-size: 11px; color: #94a3b8; text-transform: uppercase;">From</label>
            <p style="margin: 4px 0; color: #e2e8f0;">${data.userId?.username} (${data.userId?.email})</p>
          </div>
          <div>
            <label style="font-size: 11px; color: #94a3b8; text-transform: uppercase;">Status</label>
            <p style="margin: 4px 0; color: #e2e8f0;">${data.status}</p>
          </div>
          ${data.rating ? `<div><label style="font-size: 11px; color: #94a3b8; text-transform: uppercase;">Rating</label><p style="margin: 4px 0; color: #e2e8f0;">⭐ ${data.rating}/5</p></div>` : ""}
          ${data.category ? `<div><label style="font-size: 11px; color: #94a3b8; text-transform: uppercase;">Category</label><p style="margin: 4px 0; color: #e2e8f0;">${data.category}</p></div>` : ""}
          <div>
            <label style="font-size: 11px; color: #94a3b8; text-transform: uppercase;">Message</label>
            <p style="margin: 4px 0; color: #e2e8f0; line-height: 1.5;">${window.Aura.escapeHTML(data.message)}</p>
          </div>
          ${screenshotHtml}
        </div>
      `;
      document.getElementById("detailModal").classList.remove("hidden");
    }
  },

  searchSupport: async function (query) {
    const type = document.getElementById("supportTypeFilter")?.value || "";
    const status = document.getElementById("supportStatusFilter")?.value || "";

    let endpoint = `?q=${encodeURIComponent(query)}`;
    if (type) endpoint += `&type=${type}`;
    if (status) endpoint += `&status=${status}`;

    const data = await this.request(`/support${endpoint}`);
    if (data && data.tickets) {
      const tbody = document.getElementById("supportTableBody");
      tbody.innerHTML = data.tickets
        .map(
          (t) => `
        <tr>
          <td>${t.userId?.username || "Unknown"}</td>
          <td>${t.type === "feedback" ? "📝 Feedback" : "❓ Help"}</td>
          <td>${t.category || "-"}</td>
          <td>${t.rating ? "⭐ " + t.rating : "-"}</td>
          <td><span style="color: ${t.status === "open" ? "#fca5a5" : "#86efac"};">${t.status}</span></td>
          <td>${new Date(t.createdAt).toLocaleDateString()}</td>
          <td>
            <div class="action-buttons">
              <button class="action-btn" onclick="AdminDashboard.viewTicket('${t._id}')">View</button>
              <button class="action-btn" onclick="AdminDashboard.updateTicketStatus('${t._id}', 'reviewed')">Mark Reviewed</button>
              <button class="action-btn" onclick="AdminDashboard.updateTicketStatus('${t._id}', 'resolved')">Resolve</button>
              <button class="action-btn delete" onclick="AdminDashboard.deleteTicket('${t._id}')">Delete</button>
            </div>
          </td>
        </tr>
      `
        )
        .join("");
    }
  },

  updateTicketStatus: async function (ticketId, status) {
    const result = await this.request(`/support/${ticketId}`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    });

    if (result) {
      alert("Ticket updated");
      this.loadSupport();
      document.getElementById("detailModal").classList.add("hidden");
    }
  },

  deleteTicket: async function (ticketId) {
    if (!confirm("Delete this ticket?")) return;

    const result = await this.request(`/support/${ticketId}`, {
      method: "PATCH",
      body: JSON.stringify({ action: "delete" }),
    });

    if (result) {
      alert("Ticket deleted");
      this.loadSupport();
    }
  },

  // PAYMENTS
  loadPayments: async function () {
    const data = await this.request("/analytics/payments");
    if (data) {
      document.getElementById("totalPaidValue").textContent = data.totalPaid;
      document.getElementById("conversionRateValue").textContent = data.conversionRate;
    }
  },

  logout: function () {
    localStorage.removeItem("token");
    localStorage.removeItem("userId");
    localStorage.removeItem("username");
    window.location.href = "/auth.html";
  },
};

// Modal helper
function closeDetailModal() {
  document.getElementById("detailModal").classList.add("hidden");
}

// Initialize when ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => AdminDashboard.init());
} else {
  AdminDashboard.init();
}
