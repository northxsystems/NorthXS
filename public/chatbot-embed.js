(function () {
  if (window.NorthXChatbotLoaded) return;

  window.NorthXChatbotLoaded = true;

  var config = window.NorthXChatbotConfig || {};
  var company = config.company || "";
  var script = document.currentScript;
  var baseUrl = config.baseUrl || new URL(".", script && script.src ? script.src : window.location.href).href;
  var widgetUrl = new URL("chatbot-widget.html", baseUrl);

  if (company) {
    widgetUrl.searchParams.set("company", company);
  }

  var style = document.createElement("style");
  style.textContent = [
    "#northx-chatbot-root{position:fixed;right:22px;bottom:22px;z-index:2147483647;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;}",
    "#northx-chatbot-root *{box-sizing:border-box;}",
    ".northx-chatbot-label{position:absolute;right:2px;bottom:76px;padding:8px 12px;border-radius:999px;background:#fff;color:#111827;border:1px solid #e5e7eb;box-shadow:0 14px 40px rgba(15,23,42,.12);font-size:13px;font-weight:800;white-space:nowrap;}",
    ".northx-chatbot-bubble{width:62px;height:62px;border:0;border-radius:999px;background:linear-gradient(135deg,#2563eb,#7c5cff);box-shadow:0 18px 46px rgba(37,99,235,.38);display:grid;place-items:center;color:white;cursor:pointer;transition:transform .18s ease,box-shadow .18s ease;}",
    ".northx-chatbot-bubble:hover{transform:translateY(-2px);box-shadow:0 22px 54px rgba(37,99,235,.46);}",
    ".northx-chatbot-bubble svg{width:30px;height:30px;}",
    ".northx-chatbot-window{position:absolute;right:0;bottom:84px;width:380px;height:580px;max-width:calc(100vw - 32px);max-height:calc(100vh - 120px);border:1px solid #e5e7eb;border-radius:20px;background:#fff;box-shadow:0 28px 90px rgba(15,23,42,.18);overflow:hidden;display:none;}",
    ".northx-chatbot-window.open{display:block;}",
    ".northx-chatbot-close{position:absolute;top:10px;right:10px;z-index:2;width:34px;height:34px;border:1px solid #e5e7eb;border-radius:999px;background:rgba(255,255,255,.94);color:#111827;cursor:pointer;font-size:22px;line-height:1;box-shadow:0 8px 20px rgba(15,23,42,.10);}",
    ".northx-chatbot-frame{width:100%;height:100%;border:0;display:block;}",
    "@media (max-width:640px){#northx-chatbot-root{right:12px;bottom:12px}.northx-chatbot-window{position:fixed;right:8px;left:8px;bottom:86px;width:auto;height:calc(100vh - 112px);max-width:none;max-height:none;border-radius:18px}.northx-chatbot-label{bottom:72px}.northx-chatbot-bubble{width:58px;height:58px}}"
  ].join("");

  var root = document.createElement("div");
  root.id = "northx-chatbot-root";
  root.innerHTML = [
    '<div class="northx-chatbot-label">Need help?</div>',
    '<div class="northx-chatbot-window" aria-hidden="true">',
    '<button type="button" class="northx-chatbot-close" aria-label="Close chat">&times;</button>',
    '<iframe class="northx-chatbot-frame" title="NorthX chatbot" loading="lazy"></iframe>',
    "</div>",
    '<button type="button" class="northx-chatbot-bubble" aria-label="Open chat">',
    '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 5.75C5 4.784 5.784 4 6.75 4h10.5C18.216 4 19 4.784 19 5.75v7.5c0 .966-.784 1.75-1.75 1.75H10l-4.2 3.15A.5.5 0 0 1 5 17.75v-12Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M8 8h8M8 11h5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
    "</button>"
  ].join("");

  document.head.appendChild(style);
  document.body.appendChild(root);

  var bubble = root.querySelector(".northx-chatbot-bubble");
  var label = root.querySelector(".northx-chatbot-label");
  var chatWindow = root.querySelector(".northx-chatbot-window");
  var frame = root.querySelector(".northx-chatbot-frame");
  var closeButton = root.querySelector(".northx-chatbot-close");

  function openChat() {
    if (!frame.src) {
      frame.src = widgetUrl.href;
    }

    chatWindow.classList.add("open");
    chatWindow.setAttribute("aria-hidden", "false");
    label.style.display = "none";
  }

  function closeChat() {
    chatWindow.classList.remove("open");
    chatWindow.setAttribute("aria-hidden", "true");
    label.style.display = "";
  }

  bubble.addEventListener("click", function () {
    if (chatWindow.classList.contains("open")) {
      closeChat();
      return;
    }

    openChat();
  });

  closeButton.addEventListener("click", closeChat);
})();
