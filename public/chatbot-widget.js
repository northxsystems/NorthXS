let clientSettings = null;
let chatbotSettings = null;
let conversationId = null;
let activeFlow = null;
let activeStepIndex = 0;
let flowAnswers = {};

const flowSteps = {
  quote: [
    { key: "service_requested", prompt: "What service do you need help with?" },
    { key: "customer_name", prompt: "What is your name?" },
    { key: "phone", prompt: "What phone number should the team use?" },
    { key: "email", prompt: "What email should they use?" },
    { key: "address", prompt: "What is the service address?" },
    { key: "problem_description", prompt: "Please share any details about the job." }
  ],
  callback: [
    { key: "name", prompt: "What is your name?" },
    { key: "phone", prompt: "What phone number should the team call?" },
    { key: "preferred_time", prompt: "What time works best for a callback?" }
  ]
};

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function getCompanySlug() {
  return new URLSearchParams(window.location.search).get("company");
}

function setWidgetUnavailable(message) {
  document.getElementById("chat-messages").innerHTML = `
    <div class="chat-message bot">${escapeHtml(message)}</div>
  `;
  document.getElementById("chat-quick-actions").innerHTML = "";
  document.getElementById("chat-input").disabled = true;
  document.querySelector("#chat-input-form button").disabled = true;
  document.getElementById("chat-status").textContent = "Unavailable";
}

function addMessage(sender, message, shouldLog = true) {
  const messages = document.getElementById("chat-messages");
  messages.innerHTML += `
    <div class="chat-message ${sender}">
      ${escapeHtml(message)}
    </div>
  `;
  messages.scrollTop = messages.scrollHeight;

  if (shouldLog) {
    logChatMessage(sender, message);
  }
}

function setQuickActions(actions = []) {
  const wrap = document.getElementById("chat-quick-actions");
  wrap.innerHTML = actions.map((action) => `
    <button type="button" data-action="${escapeHtml(action.action)}">${escapeHtml(action.label)}</button>
  `).join("");
}

function mainActions() {
  const actions = [];

  if (chatbotSettings.collect_quotes !== false) {
    actions.push({ label: "Request a Quote", action: "quote" });
  }

  if (chatbotSettings.collect_callbacks !== false) {
    actions.push({ label: "Book a Callback", action: "callback" });
  }

  actions.push({ label: "Ask a Question", action: "question" });
  setQuickActions(actions);
}

async function loadClientAndSettings() {
  const companySlug = getCompanySlug();

  if (!companySlug) {
    throw new Error("Missing company slug.");
  }

  const { data: client, error: clientError } = await supabaseClient
    .from("client_settings")
    .select("*")
    .eq("company_slug", companySlug)
    .maybeSingle();

  if (clientError || !client) {
    throw clientError || new Error("Company not found.");
  }

  const { data: settings, error: settingsError } = await supabaseClient
    .from("chatbot_settings")
    .select("*")
    .eq("client_id", client.client_id)
    .maybeSingle();

  if (settingsError) {
    throw settingsError;
  }

  clientSettings = client;
  chatbotSettings = settings || {
    bot_enabled: false,
    welcome_message: "Hi! How can we help today?",
    primary_color: "#4f8cff",
    collect_quotes: true,
    collect_callbacks: true,
    business_faq: ""
  };
}

async function createConversation() {
  conversationId = crypto.randomUUID();

  const { error } = await supabaseClient
    .from("chatbot_conversations")
    .insert({
      id: conversationId,
      client_id: clientSettings.client_id,
      company_slug: clientSettings.company_slug,
      status: "open"
    });

  if (error) {
    console.warn("Could not create chatbot conversation:", error);
    conversationId = null;
    return;
  }
}

async function logChatMessage(sender, message) {
  if (!conversationId || !clientSettings) return;

  const { error } = await supabaseClient
    .from("chatbot_messages")
    .insert({
      client_id: clientSettings.client_id,
      conversation_id: conversationId,
      sender,
      message
    });

  if (error) {
    console.warn("Could not log chatbot message:", error);
  }
}

function startFlow(flowName) {
  activeFlow = flowName;
  activeStepIndex = 0;
  flowAnswers = {};
  setQuickActions([]);
  addMessage("bot", flowSteps[activeFlow][activeStepIndex].prompt);
}

function resetFlow() {
  activeFlow = null;
  activeStepIndex = 0;
  flowAnswers = {};
  mainActions();
}

async function handleFlowAnswer(value) {
  const step = flowSteps[activeFlow][activeStepIndex];
  flowAnswers[step.key] = value;
  activeStepIndex += 1;

  if (activeStepIndex < flowSteps[activeFlow].length) {
    addMessage("bot", flowSteps[activeFlow][activeStepIndex].prompt);
    return;
  }

  if (activeFlow === "quote") {
    await submitQuoteRequest();
    addMessage("bot", "Thanks! The team will review your request and follow up soon.");
  }

  if (activeFlow === "callback") {
    await submitCallbackRequest();
    addMessage("bot", "Thanks! The team will reach out around your preferred callback time.");
  }

  resetFlow();
}

async function submitQuoteRequest() {
  const payload = {
    client_id: clientSettings.client_id,
    customer_name: flowAnswers.customer_name,
    phone: flowAnswers.phone,
    email: flowAnswers.email || null,
    service_requested: flowAnswers.service_requested,
    address: flowAnswers.address || null,
    problem_description: flowAnswers.problem_description,
    source: "chatbot",
    status: "new"
  };

  let { error } = await supabaseClient
    .from("quote_requests")
    .insert(payload);

  if (error && error.code === "PGRST204") {
    const { source, ...fallbackPayload } = payload;
    const fallback = await supabaseClient
      .from("quote_requests")
      .insert(fallbackPayload);
    error = fallback.error;
  }

  if (error) {
    console.warn("Could not insert chatbot quote request:", error);
    addMessage("bot", "I could not submit that request automatically. Please call or text the team directly.");
  }
}

async function submitCallbackRequest() {
  const payload = {
    client_id: clientSettings.client_id,
    name: flowAnswers.name,
    phone: flowAnswers.phone,
    call_status: "Callback Requested",
    follow_up_status: flowAnswers.preferred_time,
    notes: `Callback requested from chatbot. Preferred time: ${flowAnswers.preferred_time}`,
    source: "chatbot_callback"
  };

  let { error } = await supabaseClient
    .from("leads")
    .insert(payload);

  if (error && error.code === "PGRST204") {
    const { source, ...fallbackPayload } = payload;
    const fallback = await supabaseClient
      .from("leads")
      .insert(fallbackPayload);
    error = fallback.error;
  }

  if (error) {
    console.warn("Could not insert chatbot callback lead:", error);
    addMessage("bot", "I could not submit that callback automatically. Please call or text the team directly.");
  }
}

function answerQuestion() {
  const faq = chatbotSettings.business_faq ||
    "The team has not added FAQ details yet. You can still request a quote or book a callback.";

  addMessage("bot", faq);
  addMessage("bot", "Would you like to request a quote or book a callback?");
  mainActions();
}

function handleQuickAction(action) {
  if (action === "quote") {
    startFlow("quote");
    return;
  }

  if (action === "callback") {
    startFlow("callback");
    return;
  }

  if (action === "question") {
    answerQuestion();
  }
}

document.getElementById("chat-quick-actions").addEventListener("click", function (event) {
  const button = event.target.closest("button[data-action]");

  if (!button) return;

  addMessage("user", button.textContent.trim());
  handleQuickAction(button.dataset.action);
});

document.getElementById("chat-input-form").addEventListener("submit", async function (event) {
  event.preventDefault();

  const input = document.getElementById("chat-input");
  const value = input.value.trim();

  if (!value) return;

  input.value = "";
  addMessage("user", value);

  if (activeFlow) {
    await handleFlowAnswer(value);
    return;
  }

  addMessage("bot", "Please choose one of the options below.");
  mainActions();
});

async function initWidget() {
  try {
    await loadClientAndSettings();
  } catch (error) {
    console.error("Could not load chatbot widget:", error);
    setWidgetUnavailable("Chat is currently unavailable.");
    return;
  }

  document.documentElement.style.setProperty(
    "--bot-primary",
    chatbotSettings.primary_color || "#4f8cff"
  );
  document.getElementById("chat-company").textContent =
    clientSettings.company_name || "NorthX";

  if (chatbotSettings.bot_enabled === false) {
    setWidgetUnavailable("Chat is currently unavailable.");
    return;
  }

  await createConversation();
  addMessage("bot", chatbotSettings.welcome_message || "Hi! How can we help today?");
  mainActions();
}

initWidget();
