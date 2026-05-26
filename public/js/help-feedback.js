// Help & Feedback Modal System
window.Aura.HelpFeedback = {
  state: {
    feedbackRating: 0,
    selectedFeedbackFile: null,
    selectedHelpFile: null,
  },

  init: function () {
    const helpFeedbackBtn = document.getElementById("helpFeedbackBtn");
    const closeFeedbackBtn = document.getElementById("closeFeedbackBtn");
    const overlay = document.getElementById("helpFeedbackOverlay");

    if (helpFeedbackBtn) {
      helpFeedbackBtn.addEventListener("click", () => this.openModal());
    }
    if (closeFeedbackBtn) {
      closeFeedbackBtn.addEventListener("click", () => this.closeModal());
    }
    if (overlay) {
      overlay.addEventListener("click", () => this.closeModal());
    }

    // Tab switching
    document.querySelectorAll(".tab-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => this.switchTab(e.target.dataset.tab));
    });

    // Rating selector
    document.querySelectorAll(".star-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => this.setRating(e.target.dataset.rating));
    });

    // File uploads
    this.setupFileUpload("feedbackUploadArea", "feedbackScreenshot", "feedbackFileName");
    this.setupFileUpload("helpUploadArea", "helpScreenshot", "helpFileName");

    // Form submissions
    const feedbackForm = document.getElementById("feedbackForm");
    const helpForm = document.getElementById("helpForm");

    if (feedbackForm) {
      feedbackForm.addEventListener("submit", (e) => this.submitFeedback(e));
    }
    if (helpForm) {
      helpForm.addEventListener("submit", (e) => this.submitHelp(e));
    }
  },

  openModal: function () {
    const modal = document.getElementById("helpFeedbackModal");
    if (modal) {
      modal.classList.remove("hidden");
      document.body.style.overflow = "hidden";
    }
  },

  closeModal: function () {
    const modal = document.getElementById("helpFeedbackModal");
    if (modal) {
      modal.classList.add("hidden");
      document.body.style.overflow = "";
      this.resetModal();
    }
  },

  resetModal: function () {
    this.state.feedbackRating = 0;
    this.state.selectedFeedbackFile = null;
    this.state.selectedHelpFile = null;

    document.getElementById("feedbackForm")?.reset();
    document.getElementById("helpForm")?.reset();
    document.getElementById("feedbackRating").value = "";
    document.getElementById("feedbackFileName").classList.add("hidden");
    document.getElementById("helpFileName").classList.add("hidden");

    document.querySelectorAll(".star-btn").forEach((btn) => {
      btn.classList.remove("selected");
    });
  },

  switchTab: function (tab) {
    document.querySelectorAll(".tab-btn").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.tab === tab);
    });

    document.querySelectorAll(".tab-content").forEach((content) => {
      content.classList.toggle("hidden", !content.id.startsWith(tab));
    });
  },

  setRating: function (rating) {
    this.state.feedbackRating = parseInt(rating);
    document.getElementById("feedbackRating").value = rating;

    document.querySelectorAll(".star-btn").forEach((btn, index) => {
      btn.classList.toggle("selected", index < this.state.feedbackRating);
    });
  },

  setupFileUpload: function (uploadAreaId, inputId, fileNameId) {
    const uploadArea = document.getElementById(uploadAreaId);
    const fileInput = document.getElementById(inputId);
    const fileName = document.getElementById(fileNameId);

    if (!uploadArea || !fileInput) return;

    uploadArea.addEventListener("click", () => fileInput.click());

    fileInput.addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (file) {
        this.handleFileSelect(file, fileNameId, uploadAreaId);
      }
    });

    // Drag & drop
    uploadArea.addEventListener("dragover", (e) => {
      e.preventDefault();
      uploadArea.classList.add("dragover");
    });

    uploadArea.addEventListener("dragleave", () => {
      uploadArea.classList.remove("dragover");
    });

    uploadArea.addEventListener("drop", (e) => {
      e.preventDefault();
      uploadArea.classList.remove("dragover");
      const file = e.dataTransfer.files[0];
      if (file && this.isValidFile(file)) {
        fileInput.files = e.dataTransfer.files;
        this.handleFileSelect(file, fileNameId, uploadAreaId);
      }
    });
  },

  isValidFile: function (file) {
    const allowed = ["image/png", "image/jpeg", "image/webp"];
    const maxSize = 5 * 1024 * 1024; // 5MB

    if (!allowed.includes(file.type)) {
      alert("Invalid file type. Please upload PNG, JPG, JPEG, or WEBP.");
      return false;
    }

    if (file.size > maxSize) {
      alert("File size exceeds 5MB limit.");
      return false;
    }

    return true;
  },

  handleFileSelect: function (file, fileNameId, uploadAreaId) {
    if (!this.isValidFile(file)) return;

    const fileName = document.getElementById(fileNameId);
    if (fileName) {
      fileName.textContent = `✓ ${file.name} (${(file.size / 1024).toFixed(1)} KB)`;
      fileName.classList.remove("hidden");
    }

    const uploadArea = document.getElementById(uploadAreaId);
    if (uploadArea) {
      uploadArea.classList.add("hidden");
    }
  },

  submitFeedback: async function (e) {
    e.preventDefault();

    const rating = document.getElementById("feedbackRating").value;
    const message = document.getElementById("feedbackMessage").value.trim();
    const screenshotInput = document.getElementById("feedbackScreenshot");

    if (!rating) {
      alert("Please select a rating.");
      return;
    }

    if (!message) {
      alert("Please enter your feedback.");
      return;
    }

    await this.submitTicket("feedback", { rating, message }, screenshotInput, e.currentTarget);
  },

  submitHelp: async function (e) {
    e.preventDefault();

    const category = document.getElementById("helpCategory").value;
    const message = document.getElementById("helpMessage").value.trim();
    const screenshotInput = document.getElementById("helpScreenshot");

    if (!category) {
      alert("Please select a category.");
      return;
    }

    if (!message) {
      alert("Please describe your issue.");
      return;
    }

    await this.submitTicket("help", { category, message }, screenshotInput, e.currentTarget);
  },

  submitTicket: async function (type, data, screenshotInput, form) {
    const submitBtn = form?.querySelector("button[type='submit']");
    const originalText = submitBtn?.textContent;

    try {
      if (submitBtn) submitBtn.textContent = "Sending...";
      if (submitBtn) submitBtn.disabled = true;

      const formData = new FormData();
      formData.append("type", type);
      formData.append("message", data.message);

      if (type === "feedback") {
        formData.append("rating", data.rating);
      } else if (type === "help") {
        formData.append("category", data.category);
      }

      if (screenshotInput?.files[0]) {
        formData.append("screenshot", screenshotInput.files[0]);
      }

      const response = await fetch("/api/support/submit", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${window.Aura.getToken()}`,
        },
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const result = await response.json();

      if (result.success) {
        window.Aura.Analytics?.trackEvent("support_submission");
        alert(`${type === "feedback" ? "Thank you for your feedback!" : "Your help request has been submitted!"}\n\nTicket ID: ${result.ticketId}`);
        this.closeModal();
      } else {
        alert("Error: " + (result.error || "Failed to submit"));
      }
    } catch (error) {
      console.error("Submission error:", error);
      alert("Failed to submit: " + error.message);
    } finally {
      if (submitBtn) {
        submitBtn.textContent = originalText;
        submitBtn.disabled = false;
      }
    }
  },
};

// Initialize when DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    window.Aura.HelpFeedback.init();
  });
} else {
  window.Aura.HelpFeedback.init();
}
