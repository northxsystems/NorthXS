let currentUser = null;
let clientSettings = null;
let chatbotSettings = null;
let chatbotWidgetUrl = "";
let chatbotEmbedCode = "";

const defaultChatbotSettings = {
  bot_enabled: true,
  welcome_message: "Hi! How can we help today?",
  primary_color: "#4f8cff",
  collect_quotes: true,
  collect_callbacks: true,
  business_faq: ""
};

function setStatus(message, type = "") {
  const status = document.getElementById("chatbot-settings-status");
  status.textContent = message;
  status.classList.toggle("success", type === "success");
  status.classList.toggle("error", type === "error");
}

function setSavingState(isSaving) {
  const button = document.getElementById("save-chatbot-settings");
  button.disabled = isSaving;
  button.textContent = isSaving ? "Saving..." : "Save Settings";
}

async function protectPage() {
  const { data } = await supabaseClient.auth.getSession();

  if (!data.session) {
    window.location.href = "login.html";
    return null;
  }

  return data.session;
}

function slugifyCompanyPrefix(email) {
  const prefix = String(email || "company").split("@")[0] || "company";
  return prefix
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 36) || "company";
}

function generateCompanySlug(user) {
  return `${slugifyCompanyPrefix(user.email)}-${Math.floor(1000 + Math.random() * 9000)}`;
}

async function loadOrCreateClientSettings(user) {
  const { data, error } = await supabaseClient
    .from("client_settings")
    .select("*")
    .eq("client_id", user.id)
    .maybeSingle();

  if (error) throw error;
  if (data) return data;

  const payload = {
    client_id: user.id,
    company_name: "Your Company",
    company_slug: generateCompanySlug(user),
    quote_form_enabled: true
  };

  const { data: created, error: insertError } = await supabaseClient
    .from("client_settings")
    .insert(payload)
    .select("*")
    .single();

  if (insertError) throw insertError;
  return created;
}

async function loadOrCreateChatbotSettings(user) {
  const { data, error } = await supabaseClient
    .from("chatbot_settings")
    .select("*")
    .eq("client_id", user.id)
    .maybeSingle();

  if (error) throw error;
  if (data) return data;

  const { data: created, error: insertError } = await supabaseClient
    .from("chatbot_settings")
    .insert({
      client_id: user.id,
      ...defaultChatbotSettings
    })
    .select("*")
    .single();

  if (insertError) throw insertError;
  return created;
}

function buildWidgetUrl(companySlug) {
  const url = new URL("chatbot-widget.html", window.location.href);
  url.searchParams.set("company", companySlug);
  return url.href;
}

function buildEmbedScriptUrl() {
  return new URL("chatbot-embed.js", window.location.href).href;
}

function buildInstallCode(companySlug) {
  return `<script>
  window.NorthXChatbotConfig = {
    company: "${companySlug}"
  };
</script>
<script src="${buildEmbedScriptUrl()}"></script>`;
}

function renderEmbed(settings) {
  chatbotWidgetUrl = buildWidgetUrl(settings.company_slug);
  chatbotEmbedCode = buildInstallCode(settings.company_slug);
  document.getElementById("chatbot-embed-code").value = chatbotEmbedCode;
  document.getElementById("chatbot-preview").src = chatbotWidgetUrl;
}

function populateForm(settings) {
  document.getElementById("bot-enabled").checked = settings.bot_enabled !== false;
  document.getElementById("welcome-message").value =
    settings.welcome_message || defaultChatbotSettings.welcome_message;
  document.getElementById("primary-color").value =
    settings.primary_color || defaultChatbotSettings.primary_color;
  document.getElementById("collect-quotes").checked = settings.collect_quotes !== false;
  document.getElementById("collect-callbacks").checked = settings.collect_callbacks !== false;
  document.getElementById("business-faq").value = settings.business_faq || "";
}

function buildSettingsPayload() {
  return {
    bot_enabled: document.getElementById("bot-enabled").checked,
    welcome_message: document.getElementById("welcome-message").value.trim() ||
      defaultChatbotSettings.welcome_message,
    primary_color: document.getElementById("primary-color").value || defaultChatbotSettings.primary_color,
    collect_quotes: document.getElementById("collect-quotes").checked,
    collect_callbacks: document.getElementById("collect-callbacks").checked,
    business_faq: document.getElementById("business-faq").value.trim()
  };
}

async function saveSettings(event) {
  event.preventDefault();

  if (!currentUser) return;

  setSavingState(true);
  setStatus("");

  const { data, error } = await supabaseClient
    .from("chatbot_settings")
    .upsert({
      client_id: currentUser.id,
      ...buildSettingsPayload(),
      updated_at: new Date().toISOString()
    }, { onConflict: "client_id" })
    .select("*")
    .single();

  setSavingState(false);

  if (error) {
    console.error("Error saving chatbot settings:", error);
    setStatus("Could not save chatbot settings. Check the chatbot_settings table.", "error");
    return;
  }

  chatbotSettings = data;
  populateForm(chatbotSettings);
  setStatus("Chatbot settings saved.", "success");
}

async function copyEmbedCode() {
  try {
    await navigator.clipboard.writeText(chatbotEmbedCode);
    setStatus("Install code copied.", "success");
  } catch (error) {
    const field = document.getElementById("chatbot-embed-code");
    field.select();
    document.execCommand("copy");
    setStatus("Install code copied.", "success");
  }
}

function wireActions() {
  document.getElementById("chatbot-settings-form").addEventListener("submit", saveSettings);
  document.getElementById("copy-chatbot-embed").addEventListener("click", copyEmbedCode);
  document.getElementById("preview-chatbot-widget").addEventListener("click", function () {
    if (chatbotWidgetUrl) window.open(chatbotWidgetUrl, "_blank", "noopener");
  });
}

const logoutButton = document.getElementById("logout-button");

if (logoutButton) {
  logoutButton.addEventListener("click", async function () {
    await supabaseClient.auth.signOut();
    window.location.href = "login.html";
  });
}

async function initChatbotPage() {
  wireActions();
  setSavingState(true);

  const session = await protectPage();
  if (!session) return;

  currentUser = session.user;

  try {
    [clientSettings, chatbotSettings] = await Promise.all([
      loadOrCreateClientSettings(currentUser),
      loadOrCreateChatbotSettings(currentUser)
    ]);

    populateForm(chatbotSettings);
    renderEmbed(clientSettings);
    setStatus("");
  } catch (error) {
    console.error("Error initializing chatbot page:", error);
    setStatus("Could not load chatbot settings. Run the chatbot SQL, then refresh.", "error");
  } finally {
    setSavingState(false);
  }
}

initChatbotPage();
