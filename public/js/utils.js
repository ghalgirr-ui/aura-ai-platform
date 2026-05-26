window.Aura = window.Aura || {};

window.Aura.getToken = () => localStorage.getItem("token");
window.Aura.getUser = () => {
  try {
    return JSON.parse(localStorage.getItem("user") || "null");
  } catch {
    return null;
  }
};
window.Aura.getUsername = () => localStorage.getItem("username");
window.Aura.decodeToken = () => {
  const token = window.Aura.getToken();
  if (!token) return null;
  try {
    const payload = token.split(".")[1] || "";
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const json = decodeURIComponent(
      atob(base64)
        .split("")
        .map((c) => `%${(`00${c.charCodeAt(0).toString(16)}`).slice(-2)}`)
        .join("")
    );
    return JSON.parse(json);
  } catch {
    return null;
  }
};
window.Aura.getUserRole = () => {
  return localStorage.getItem("userRole") || window.Aura.decodeToken()?.role || "user";
};
window.Aura.isAdmin = () => window.Aura.getUserRole() === "admin";
window.Aura.setSession = ({ token, user }) => {
  localStorage.setItem("token", token);
  localStorage.setItem("user", JSON.stringify(user));
  localStorage.setItem("userId", user.id);
  localStorage.setItem("username", user.username);
  localStorage.setItem("userRole", user.role || window.Aura.decodeToken()?.role || "user");
};
window.Aura.clearSession = () => {
  localStorage.removeItem("token");
  localStorage.removeItem("user");
  localStorage.removeItem("userId");
  localStorage.removeItem("username");
  localStorage.removeItem("userRole");
  localStorage.removeItem("chatId");
};
window.Aura.getAuthHeaders = () => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${window.Aura.getToken()}`,
});

window.Aura.escapeHTML = (value = "") =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

window.Aura.sanitizeUrl = (url = "") => {
  const trimmed = String(url).trim();
  if (/^(https?:|mailto:|tel:|\/|#)/i.test(trimmed)) return trimmed;
  return "#";
};

window.Aura.restoreInlineTokens = (html, tokens) =>
  tokens.reduce((output, token, index) => output.replaceAll(`@@AURA_TOKEN_${index}@@`, token), html);

window.Aura.formatInlineMarkdown = (text = "") => {
  const tokens = [];
  const token = (html) => {
    tokens.push(html);
    return `@@AURA_TOKEN_${tokens.length - 1}@@`;
  };

  let masked = String(text)
    .replace(/`([^`\n]+)`/g, (_, code) =>
      token(`<code class="inline-code">${window.Aura.escapeHTML(code)}</code>`)
    )
    .replace(/\[([^\]\n]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, (_, label, href) => {
      const safeHref = window.Aura.escapeHTML(window.Aura.sanitizeUrl(href));
      return token(`<a href="${safeHref}" target="_blank" rel="noopener noreferrer">${window.Aura.escapeHTML(label)}</a>`);
    });

  let html = window.Aura.escapeHTML(masked)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*(?!\s)(.+?)(?!\s)\*/g, "$1<em>$2</em>");

  html = html
    .replace(/(?<!<strong>)(\b(?:1st|2nd|3rd|4th|5th|6th|7th|8th|9th|10th|Rank(?:s)?\s*\d+|Score(?:s)?\s*[:\-]?\s*\d+(?:\.\d+)?|Rating(?:s)?\s*[:\-]?\s*\d+(?:\.\d+)?|Top\s*\d+|Best|Worst|Important|Warning|Summary|Overview|Highlights)\b)(?!<\/strong>)/gi,
      "<strong>$1</strong>");

  return window.Aura.restoreInlineTokens(html, tokens);
};

window.Aura.formatMessage = (text = "") => window.Aura.formatInlineMarkdown(text);

window.Aura.copyText = async (text) => {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
};

window.Aura.createCodeCopyButton = (code, language = "") => {
  const btn = document.createElement("button");
  const languageLabels = {
    html: "HTML",
    css: "CSS",
    js: "JS",
    javascript: "JS",
    jsx: "JSX",
    ts: "TS",
    typescript: "TS",
    tsx: "TSX",
  };
  const normalizedLanguage = language.toLowerCase();
  const displayLanguage = languageLabels[normalizedLanguage] || language;
  const label = displayLanguage ? `Copy ${displayLanguage}` : "Copy Code";
  btn.type = "button";
  btn.className = "code-copy-btn";
  btn.innerText = label;
  btn.onclick = async () => {
    await window.Aura.copyText(code);
    btn.innerText = "Copied";
    btn.classList.add("copied");
    setTimeout(() => {
      btn.innerText = label;
      btn.classList.remove("copied");
    }, 1000);
  };
  return btn;
};

window.Aura.normalizeLanguage = (language = "") => {
  const normalized = language.toLowerCase().trim();
  const aliases = {
    htm: "html",
    javascript: "js",
    jsx: "js",
    typescript: "ts",
    shell: "bash",
    sh: "bash",
    zsh: "bash",
    ps1: "powershell",
  };
  return aliases[normalized] || normalized;
};

window.Aura.highlightCode = (code = "", language = "") => {
  const lang = window.Aura.normalizeLanguage(language);
  let html = window.Aura.escapeHTML(code);

  if (["html", "xml"].includes(lang)) {
    html = html
      .replace(/(&lt;!--[\s\S]*?--&gt;)/g, '<span class="tok-comment">$1</span>')
      .replace(/(&lt;\/?)([a-zA-Z][\w:-]*)/g, '$1<span class="tok-keyword">$2</span>')
      .replace(/\s([a-zA-Z_:][\w:.-]*)(=)/g, ' <span class="tok-attr">$1</span>$2')
      .replace(/(&quot;.*?&quot;|&#39;.*?&#39;)/g, '<span class="tok-string">$1</span>');
    return html;
  }

  if (["js", "ts", "json"].includes(lang)) {
    html = html
      .replace(/(\/\/.*?$|\/\*[\s\S]*?\*\/)/gm, '<span class="tok-comment">$1</span>')
      .replace(/(&quot;.*?&quot;|&#39;.*?&#39;|`.*?`)/g, '<span class="tok-string">$1</span>')
      .replace(/\b(const|let|var|function|return|if|else|for|while|class|new|await|async|try|catch|throw|import|from|export|default|true|false|null|undefined)\b/g, '<span class="tok-keyword">$1</span>')
      .replace(/\b(\d+(?:\.\d+)?)\b/g, '<span class="tok-number">$1</span>');
    return html;
  }

  if (lang === "css") {
    html = html
      .replace(/(\/\*[\s\S]*?\*\/)/g, '<span class="tok-comment">$1</span>')
      .replace(/([.#]?[a-zA-Z_-][\w-]*)(\s*\{)/g, '<span class="tok-selector">$1</span>$2')
      .replace(/([a-zA-Z-]+)(\s*:)/g, '<span class="tok-attr">$1</span>$2')
      .replace(/(:\s*)([^;{}]+)(;?)/g, '$1<span class="tok-string">$2</span>$3');
    return html;
  }

  if (["bash", "powershell"].includes(lang)) {
    html = html
      .replace(/(^|\s)(#.*$)/gm, '$1<span class="tok-comment">$2</span>')
      .replace(/\b(npm|node|git|cd|ls|mkdir|curl|echo|cat|Get-ChildItem|Select-String)\b/g, '<span class="tok-keyword">$1</span>')
      .replace(/(&quot;.*?&quot;|&#39;.*?&#39;)/g, '<span class="tok-string">$1</span>');
    return html;
  }

  return html;
};

window.Aura.isMarkdownBlockStart = (line = "", nextLine = "") =>
  /^(#{1,6})\s+/.test(line) ||
  /^\s*([-*+])\s+/.test(line) ||
  /^\s*\d+\.\s+/.test(line) ||
  /^>\s?/.test(line) ||
  (line.includes("|") && /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(nextLine || ""));

window.Aura.isHeadingCandidate = (line = "") => {
  const trimmed = String(line).trim();
  return (
    trimmed.length > 15 &&
    trimmed.length < 90 &&
    !/[.!?]$/.test(trimmed) &&
    /^(Top|Best|Worst|Summary|Overview|Key|Highlights|Recommended|Ranked)\b/i.test(trimmed)
  );
};

window.Aura.splitTableRow = (line = "") =>
  line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());

window.Aura.renderMarkdownText = (text = "") => {
  // Normalize newlines and collapse stray blank lines between numbered list items
  let normalized = String(text).replace(/\r\n?/g, "\n");
  normalized = normalized.replace(/(\d+\.\s+[^\n]+)\n\s*\n(?=\d+\.\s+[^\n]+)/g, "$1\n");
  const lines = normalized.split("\n");
  const output = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const nextLine = lines[i + 1] || "";

    if (!line.trim()) {
      i += 1;
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      const level = heading[1].length;
      output.push(`<h${level}>${window.Aura.formatInlineMarkdown(heading[2])}</h${level}>`);
      i += 1;
      continue;
    }

    if (window.Aura.isHeadingCandidate(line)) {
      output.push(`<h2>${window.Aura.formatInlineMarkdown(line.trim())}</h2>`);
      i += 1;
      continue;
    }

    if (/^\s*(Sources?|References?):/i.test(line)) {
      const citations = [line];
      i += 1;
      while (i < lines.length && lines[i].trim()) {
        citations.push(lines[i]);
        i += 1;
      }
      output.push(`<div class="citation-block">${window.Aura.formatInlineMarkdown(citations.join("<br>"))}</div>`);
      continue;
    }

    if (line.includes("|") && /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(nextLine)) {
      const headers = window.Aura.splitTableRow(line);
      i += 2;
      const rows = [];
      while (i < lines.length && lines[i].includes("|") && lines[i].trim()) {
        rows.push(window.Aura.splitTableRow(lines[i]));
        i += 1;
      }
      output.push(
        `<div class="markdown-table-wrap"><table><thead><tr>${headers
          .map((cell) => `<th>${window.Aura.formatInlineMarkdown(cell)}</th>`)
          .join("")}</tr></thead><tbody>${rows
          .map((row) => `<tr>${row.map((cell) => `<td>${window.Aura.formatInlineMarkdown(cell)}</td>`).join("")}</tr>`)
          .join("")}</tbody></table></div>`
      );
      continue;
    }

    if (/^>\s?/.test(line)) {
      const quotes = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        quotes.push(lines[i].replace(/^>\s?/, ""));
        i += 1;
      }
      output.push(`<blockquote>${window.Aura.renderMarkdownText(quotes.join("\n"))}</blockquote>`);
      continue;
    }

    if (/^\s*([-*+])\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*([-*+])\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*([-*+])\s+/, ""));
        i += 1;
      }
      output.push(`<ul>${items.map((item) => `<li>${window.Aura.formatInlineMarkdown(item)}</li>`).join("")}</ul>`);
      continue;
    }

    if (/^\s*\d+\.\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+\.\s+/, ""));
        i += 1;
      }
      output.push(`<ol>${items.map((item) => `<li>${window.Aura.formatInlineMarkdown(item)}</li>`).join("")}</ol>`);
      continue;
    }

    const paragraph = [line];
    i += 1;
    while (
      i < lines.length &&
      lines[i].trim() &&
      !window.Aura.isMarkdownBlockStart(lines[i], lines[i + 1] || "")
    ) {
      paragraph.push(lines[i]);
      i += 1;
    }
    output.push(`<p>${window.Aura.formatInlineMarkdown(paragraph.join("\n")).replace(/\n/g, "<br>")}</p>`);
  }

  return output.join("");
};

window.Aura.renderMessageContent = (container, text = "", options = {}) => {
  if (!container) return;
  container.textContent = "";

  const source = String(text);
  const codeBlockPattern = /```([a-zA-Z0-9_+#.-]*)[ \t]*\n?([\s\S]*?)```/g;
  let lastIndex = 0;
  let match;

  const appendText = (value) => {
    if (!value) return;
    const part = document.createElement("div");
    part.className = "markdown-body";
    part.innerHTML = window.Aura.renderMarkdownText(value);
    container.appendChild(part);
  };

  while ((match = codeBlockPattern.exec(source)) !== null) {
    appendText(source.slice(lastIndex, match.index));

    const language = (match[1] || "").trim();
    const code = match[2] || "";
    const block = document.createElement("div");
    block.className = "code-block";

    const header = document.createElement("div");
    header.className = "code-block-header";

    const label = document.createElement("span");
    label.className = "code-language";
    label.innerText = language || "code";
    header.appendChild(label);

    if (options.copyCode !== false) {
      header.appendChild(window.Aura.createCodeCopyButton(code, language));
    }

    const pre = document.createElement("pre");
    const codeEl = document.createElement("code");
    const normalizedLanguage = window.Aura.normalizeLanguage(language);
    if (normalizedLanguage) codeEl.className = `language-${normalizedLanguage}`;
    codeEl.innerHTML = window.Aura.highlightCode(code, normalizedLanguage);
    pre.appendChild(codeEl);

    block.appendChild(header);
    block.appendChild(pre);
    container.appendChild(block);

    lastIndex = codeBlockPattern.lastIndex;
  }

  appendText(source.slice(lastIndex));
};

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
