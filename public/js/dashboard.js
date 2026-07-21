let currentClientId = null;
let currentProfile = null;
let quotePdfSettings = null;
let smsSettings = null;
let overviewData = {
  leads: [],
  quoteRequests: [],
  quotes: [],
  messages: [],
  scheduledMessages: [],
  customers: []
};

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatCurrency(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  }).format(Number(value) || 0);
}

function formatTime(value) {
  if (!value) return "";
  return new Date(value).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit"
  });
}

function formatRelativeTime(value) {
  if (!value) return "";

  const diffMs = Date.now() - new Date(value).getTime();
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diffMs < minute) return "Just now";
  if (diffMs < hour) return `${Math.floor(diffMs / minute)} min ago`;
  if (diffMs < day) return `${Math.floor(diffMs / hour)} hr ago`;
  if (diffMs < 7 * day) return `${Math.floor(diffMs / day)} days ago`;

  return new Date(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric"
  });
}

function startOfDay(date = new Date()) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function endOfDay(date = new Date()) {
  const copy = new Date(date);
  copy.setHours(23, 59, 59, 999);
  return copy;
}

function daysAgo(days) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date;
}

function isAfter(value, date) {
  return value && new Date(value) >= date;
}

function isBefore(value, date) {
  return value && new Date(value) < date;
}

function isSameDay(value, date = new Date()) {
  if (!value) return false;
  const itemDate = new Date(value);
  return itemDate >= startOfDay(date) && itemDate <= endOfDay(date);
}

async function protectPage() {
  const { data } = await supabaseClient.auth.getSession();

  if (!data.session) {
    window.location.href = "login.html";
    return null;
  }

  return data.session;
}

async function loadProfile(session) {
  const { data: profile, error } = await supabaseClient
    .from("profiles")
    .select("*")
    .eq("id", session.user.id)
    .single();

  if (error) {
    console.error("Error loading profile:", error);
    return null;
  }

  currentProfile = profile;
  currentClientId = profile.client_id;
  return profile;
}

async function safeSelect(label, queryBuilder) {
  const { data, error } = await queryBuilder;

  if (error) {
    console.warn(`Could not load ${label}:`, {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code
    });
    return [];
  }

  return data || [];
}

async function safeMaybeSingle(label, queryBuilder) {
  const { data, error } = await queryBuilder;

  if (error) {
    console.warn(`Could not load ${label}:`, {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code
    });
    return null;
  }

  return data || null;
}

async function loadSettings() {
  const [pdfSettings, currentSmsSettings] = await Promise.all([
    safeMaybeSingle(
      "quote PDF settings",
      supabaseClient
        .from("client_quote_pdf_settings")
        .select("*")
        .eq("client_id", currentClientId)
        .maybeSingle()
    ),
    safeMaybeSingle(
      "SMS settings",
      supabaseClient
        .from("client_sms_settings")
        .select("*")
        .eq("client_id", currentClientId)
        .maybeSingle()
    )
  ]);

  quotePdfSettings = pdfSettings;
  smsSettings = currentSmsSettings;
}

async function loadOverviewData() {
  const [leads, quoteRequests, quotes, messages, scheduledMessages, customers] = await Promise.all([
    safeSelect(
      "leads",
      supabaseClient
        .from("leads")
        .select("*")
        .eq("client_id", currentClientId)
        .order("created_at", { ascending: false })
        .limit(200)
    ),
    safeSelect(
      "quote requests",
      supabaseClient
        .from("quote_requests")
        .select("*")
        .eq("client_id", currentClientId)
        .order("created_at", { ascending: false })
        .limit(200)
    ),
    safeSelect(
      "quotes",
      supabaseClient
        .from("quotes")
        .select("*")
        .eq("client_id", currentClientId)
        .order("created_at", { ascending: false })
        .limit(200)
    ),
    safeSelect(
      "messages",
      supabaseClient
        .from("messages")
        .select("*")
        .eq("client_id", currentClientId)
        .order("created_at", { ascending: false })
        .limit(200)
    ),
    safeSelect(
      "scheduled follow-ups",
      supabaseClient
        .from("scheduled_messages")
        .select("*")
        .eq("client_id", currentClientId)
        .order("send_at", { ascending: true })
        .limit(200)
    ),
    safeSelect(
      "customers",
      supabaseClient
        .from("customers")
        .select("*")
        .eq("client_id", currentClientId)
        .order("updated_at", { ascending: false })
        .limit(200)
    )
  ]);

  overviewData = { leads, quoteRequests, quotes, messages, scheduledMessages, customers };
}

function getCompanyDisplayName() {
  return (
    (quotePdfSettings && quotePdfSettings.company_display_name) ||
    currentProfile.company_name ||
    currentProfile.business_name ||
    currentProfile.client_name ||
    currentProfile.client_id ||
    "your business"
  );
}

function getOwnerName() {
  const name =
    currentProfile.first_name ||
    currentProfile.full_name ||
    currentProfile.name ||
    currentProfile.owner_name ||
    "";

  return String(name).trim().split(" ")[0] || "";
}

function greetingPrefix() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function quoteValue(quote) {
  return Number(quote.grand_total || quote.estimated_value || quote.value || 0) || 0;
}

function leadValue(lead) {
  return Number(lead.estimated_value || lead.value || 0) || 0;
}

function getOpenQuoteRequests() {
  return overviewData.quoteRequests.filter((quote) =>
    !["booked", "lost"].includes(quote.status || "new")
  );
}

function getOpenQuotes() {
  return overviewData.quotes.filter((quote) =>
    !["accepted", "declined", "expired"].includes(quote.status || "draft")
  );
}

function getUncontactedLeads() {
  return overviewData.leads.filter((lead) => {
    const status = String(lead.status || lead.follow_up_status || lead.call_status || "new").toLowerCase();
    return !["contacted", "booked", "won", "lost"].some((closed) => status.includes(closed));
  });
}

function getDueFollowUps() {
  return overviewData.scheduledMessages.filter((message) =>
    message.status === "pending" && isBefore(message.send_at, endOfDay())
  );
}

function getAwaitingQuotes() {
  return getOpenQuoteRequests().filter((quote) =>
    ["quote_sent", "reviewing"].includes(quote.status || "new")
  );
}

function getMissedCalls() {
  return getUncontactedLeads().filter((lead) =>
    String(lead.call_status || "").toLowerCase().includes("missed")
  );
}

function renderHeader() {
  const ownerName = getOwnerName();
  const companyName = getCompanyDisplayName();
  const attentionCount = buildAttentionItems().length;

  document.getElementById("overview-date").textContent = new Date().toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric"
  });
  document.getElementById("overview-greeting").textContent =
    ownerName ? `${greetingPrefix()}, ${ownerName}` : greetingPrefix();
  document.getElementById("overview-summary").textContent =
    attentionCount > 0
      ? `Here is what is happening with ${companyName} today.`
      : `${companyName} is caught up. New leads, replies, and quote activity will appear here.`;

  const workspaceName = document.getElementById("shell-workspace-name");
  if (workspaceName) workspaceName.textContent = companyName;
}

function renderMetrics() {
  const weekStart = daysAgo(7);
  const yesterdayStart = startOfDay(daysAgo(1));
  const yesterdayEnd = endOfDay(daysAgo(1));
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const newLeads = overviewData.leads.filter((lead) => isAfter(lead.created_at, weekStart));
  const yesterdayLeads = overviewData.leads.filter((lead) =>
    isAfter(lead.created_at, yesterdayStart) && isBefore(lead.created_at, yesterdayEnd)
  );
  const missedCalls = overviewData.leads.filter((lead) =>
    String(lead.call_status || "").toLowerCase().includes("missed") && isAfter(lead.created_at, weekStart)
  );
  const awaitingResponse = getAwaitingQuotes();
  const monthlyRevenue = overviewData.quotes
    .filter((quote) => quote.status === "accepted" && isAfter(quote.updated_at || quote.created_at, monthStart))
    .reduce((sum, quote) => sum + quoteValue(quote), 0);
  const dueFollowUps = getDueFollowUps();

  document.getElementById("metric-new-leads").textContent = newLeads.length;
  document.getElementById("metric-new-leads-context").textContent =
    newLeads.length >= yesterdayLeads.length
      ? `+${Math.max(newLeads.length - yesterdayLeads.length, 0)} vs yesterday`
      : `${yesterdayLeads.length - newLeads.length} fewer than yesterday`;

  document.getElementById("metric-missed-calls").textContent = missedCalls.length;
  document.getElementById("metric-missed-calls-context").textContent =
    missedCalls.length ? "Recovery available" : "None waiting";

  document.getElementById("metric-quotes-awaiting").textContent = awaitingResponse.length;
  document.getElementById("metric-quotes-awaiting-context").textContent =
    `${formatCurrency(awaitingResponse.reduce((sum, quote) => sum + quoteValue(quote), 0))} potential`;

  document.getElementById("metric-appointments-today").textContent = "0";
  document.getElementById("metric-appointments-today-context").textContent = "No appointments scheduled";

  document.getElementById("metric-revenue-month").textContent = formatCurrency(monthlyRevenue);
  document.getElementById("metric-revenue-month-context").textContent = "Accepted quote value";

  document.getElementById("metric-followups").textContent = dueFollowUps.length;
  document.getElementById("metric-followups-context").textContent =
    dueFollowUps.length ? "Needs review today" : "Nothing due today";
}

function buildAttentionItems() {
  const twoDaysAgo = daysAgo(2);
  const staleQuotes = getOpenQuoteRequests().filter((quote) =>
    isBefore(quote.updated_at || quote.created_at, twoDaysAgo) &&
    ["quote_sent", "reviewing"].includes(quote.status || "new")
  );
  const missedCalls = getMissedCalls();
  const newUncontactedLeads = getUncontactedLeads();
  const unreadReplies = overviewData.messages.filter((message) =>
    message.direction === "received" && isAfter(message.created_at, daysAgo(3))
  );
  const dueFollowUps = getDueFollowUps();
  const items = [];

  if (missedCalls.length > 0) {
    const value = missedCalls.reduce((sum, lead) => sum + leadValue(lead), 0);
    items.push({
      icon: "phone-missed",
      title: `${missedCalls.length} missed call${missedCalls.length === 1 ? "" : "s"}`,
      detail: "These callers have not been contacted yet.",
      meta: value > 0 ? `${formatCurrency(value)} potential revenue` : "High-intent leads",
      action: "Review calls",
      href: "leads.html",
      tone: "red"
    });
  }

  if (staleQuotes.length > 0) {
    const value = staleQuotes.reduce((sum, quote) => sum + quoteValue(quote), 0);
    items.push({
      icon: "file-clock",
      title: `${staleQuotes.length} quote${staleQuotes.length === 1 ? "" : "s"} need follow-up`,
      detail: "Quotes older than 48 hours without a response.",
      meta: value > 0 ? `${formatCurrency(value)} potential revenue` : "Decision waiting",
      action: "View quotes",
      href: "quote-requests.html",
      tone: "amber"
    });
  }

  if (newUncontactedLeads.length > 0) {
    items.push({
      icon: "user-plus",
      title: `${newUncontactedLeads.length} new lead${newUncontactedLeads.length === 1 ? "" : "s"}`,
      detail: "New opportunities still need first contact.",
      meta: "Speed matters",
      action: "Open leads",
      href: "leads.html",
      tone: "blue"
    });
  }

  if (unreadReplies.length > 0) {
    items.push({
      icon: "message-circle",
      title: `${unreadReplies.length} customer repl${unreadReplies.length === 1 ? "y" : "ies"}`,
      detail: "Recent replies are waiting in the Inbox.",
      meta: "Customer response",
      action: "Open Inbox",
      href: "messages.html",
      tone: "green"
    });
  }

  if (dueFollowUps.length > 0) {
    items.push({
      icon: "bell-ring",
      title: `${dueFollowUps.length} follow-up${dueFollowUps.length === 1 ? "" : "s"} due`,
      detail: "Scheduled follow-ups need review today.",
      meta: "Due today",
      action: "Review",
      href: "messages.html",
      tone: "blue"
    });
  }

  return items.slice(0, 5);
}

function renderAttention() {
  const list = document.getElementById("attention-list");
  const items = buildAttentionItems();

  if (items.length === 0) {
    list.innerHTML = `
      <div class="empty-state compact-empty">
        <strong>No urgent work right now.</strong>
        <span>Leads, replies, and quote follow-ups will appear here when they need attention.</span>
        <a href="messages.html" class="secondary-action compact-action">Open Inbox</a>
      </div>
    `;
    return;
  }

  list.innerHTML = items.map((item) => `
    <div class="attention-item compact-list-row">
      <span class="row-icon ${item.tone}"><i data-lucide="${item.icon}" aria-hidden="true"></i></span>
      <div>
        <strong>${escapeHtml(item.title)}</strong>
        <p>${escapeHtml(item.detail)}</p>
        <span class="row-meta ${item.tone}">${escapeHtml(item.meta)}</span>
      </div>
      <a href="${item.href}" class="secondary-action compact-action">${escapeHtml(item.action)}</a>
    </div>
  `).join("");
}

function buildOpportunities() {
  const openQuoteValue = getOpenQuotes().reduce((sum, quote) => sum + quoteValue(quote), 0);
  const awaitingQuotes = getAwaitingQuotes();
  const missedCalls = getMissedCalls();
  const leadPipelineValue = overviewData.leads.reduce((sum, lead) => sum + leadValue(lead), 0);
  const dueFollowUps = getDueFollowUps();

  return [
    {
      icon: "kanban-square",
      title: "Open pipeline value",
      detail: "Total active opportunities",
      value: formatCurrency(openQuoteValue + leadPipelineValue)
    },
    {
      icon: "file-clock",
      title: "Quotes waiting",
      detail: `${awaitingQuotes.length} customer decision${awaitingQuotes.length === 1 ? "" : "s"}`,
      value: formatCurrency(awaitingQuotes.reduce((sum, quote) => sum + quoteValue(quote), 0))
    },
    {
      icon: "phone-missed",
      title: "Missed-call recovery",
      detail: `${missedCalls.length} call${missedCalls.length === 1 ? "" : "s"} need attention`,
      value: missedCalls.length
    },
    {
      icon: "bell-ring",
      title: "Follow-ups due",
      detail: "Scheduled customer touches",
      value: dueFollowUps.length
    }
  ];
}

function renderOpportunities() {
  const list = document.getElementById("opportunity-list");
  const opportunities = buildOpportunities();

  list.innerHTML = opportunities.map((item) => `
    <div class="opportunity-item compact-list-row">
      <span class="row-icon blue"><i data-lucide="${item.icon}" aria-hidden="true"></i></span>
      <div>
        <strong>${escapeHtml(item.title)}</strong>
        <p>${escapeHtml(item.detail)}</p>
      </div>
      <span class="opportunity-value">${escapeHtml(item.value)}</span>
    </div>
  `).join("");
}

function getScheduleType(message) {
  if (message.message_type === "quote_follow_up") return "Follow-up";
  if ((message.message || "").toLowerCase().includes("review")) return "Reminder";
  if ((message.message || "").toLowerCase().includes("offer")) return "Campaign";
  return "Follow-up";
}

function renderToday() {
  const list = document.getElementById("today-list");
  const todayMessages = overviewData.scheduledMessages
    .filter((message) => isSameDay(message.send_at))
    .sort((a, b) => new Date(a.send_at) - new Date(b.send_at))
    .slice(0, 7);

  if (todayMessages.length === 0) {
    list.innerHTML = `
      <div class="empty-state compact-empty">
        <strong>No appointments scheduled today.</strong>
        <span>Upcoming appointments, estimates, and follow-ups will appear here.</span>
        <a href="calendar.html" class="secondary-action compact-action">View calendar</a>
      </div>
    `;
    return;
  }

  list.innerHTML = todayMessages.map((message) => `
    <div class="today-item schedule-row">
      <time>${formatTime(message.send_at)}</time>
      <div>
        <strong>${escapeHtml(message.customer_name || message.phone || "Customer follow-up")}</strong>
        <p>${escapeHtml(message.message || "Follow-up scheduled")}</p>
      </div>
      <span class="status-pill blue">${escapeHtml(getScheduleType(message))}</span>
    </div>
  `).join("");
}

function buildActivityItems() {
  const { leads, quoteRequests, quotes, messages, scheduledMessages } = overviewData;

  return [
    ...leads.map((lead) => ({
      icon: String(lead.call_status || "").toLowerCase().includes("missed") ? "phone-missed" : "user-plus",
      title: String(lead.call_status || "").toLowerCase().includes("missed")
        ? "Missed call recovered"
        : "New lead received",
      detail: lead.name || lead.phone || "Lead captured for follow-up",
      date: lead.created_at,
      href: "leads.html"
    })),
    ...quoteRequests.map((quote) => ({
      icon: "clipboard-list",
      title: "Quote request received",
      detail: `${quote.customer_name || "Customer"} - ${quote.service_requested || "Service request"}`,
      date: quote.created_at,
      href: "quote-requests.html"
    })),
    ...quotes.map((quote) => ({
      icon: quote.status === "accepted" ? "badge-check" : "file-text",
      title: quote.status === "accepted" ? "Customer accepted quote" : "Quote updated",
      detail: `${quote.customer_name || "Customer"} - ${formatCurrency(quoteValue(quote))}`,
      date: quote.updated_at || quote.created_at,
      href: "quote-requests.html"
    })),
    ...messages.map((message) => ({
      icon: message.direction === "received" ? "message-circle" : "send",
      title: message.direction === "received" ? "Customer replied" : "Follow-up sent",
      detail: message.phone || "Customer conversation",
      date: message.created_at,
      href: "messages.html"
    })),
    ...scheduledMessages.map((message) => ({
      icon: message.status === "sent" ? "check-circle-2" : "clock",
      title: message.status === "sent" ? "Follow-up sent automatically" : "Follow-up scheduled",
      detail: message.customer_name || message.phone || "Customer touchpoint",
      date: message.updated_at || message.created_at || message.send_at,
      href: "messages.html"
    }))
  ]
    .filter((item) => item.date)
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 9);
}

function renderActivity() {
  const feed = document.getElementById("activity-feed");
  const items = buildActivityItems();

  if (items.length === 0) {
    feed.innerHTML = `
      <div class="empty-state compact-empty">
        <strong>No activity yet.</strong>
        <span>New leads, quote requests, customer replies, and automated follow-ups will appear here.</span>
      </div>
    `;
    return;
  }

  feed.innerHTML = items.map((item) => `
    <a class="os-activity-item compact-list-row" href="${item.href}">
      <span class="row-icon blue"><i data-lucide="${item.icon}" aria-hidden="true"></i></span>
      <div>
        <strong>${escapeHtml(item.title)}</strong>
        <p>${escapeHtml(item.detail)}</p>
      </div>
      <time>${escapeHtml(formatRelativeTime(item.date))}</time>
    </a>
  `).join("");
}

function renderBusinessHealth() {
  const container = document.getElementById("business-health");
  const hasEnoughActivity =
    overviewData.leads.length +
    overviewData.quoteRequests.length +
    overviewData.quotes.length +
    overviewData.messages.length >= 8;

  if (!hasEnoughActivity) {
    container.innerHTML = `
      <div class="health-empty">
        <strong>Business Health will appear once enough activity has been recorded.</strong>
        <p>NorthX needs more leads, replies, quotes, and follow-ups before it can score this honestly.</p>
      </div>
      <div class="health-factor-list">
        ${renderHealthFactor("Response Time", "Collecting data", "neutral")}
        ${renderHealthFactor("Quote Conversion", "Collecting data", "neutral")}
        ${renderHealthFactor("Customer Satisfaction", "Not connected yet", "neutral")}
        ${renderHealthFactor("Missed Call Recovery", "Collecting data", "neutral")}
      </div>
    `;
    return;
  }

  const missedCallsWaiting = getMissedCalls().length;
  const awaitingQuotes = getAwaitingQuotes().length;
  const dueFollowUps = getDueFollowUps().length;
  const customerReplies = overviewData.messages.filter((message) => message.direction === "received").length;
  const score = Math.max(0, 100 - missedCallsWaiting * 10 - awaitingQuotes * 5 - dueFollowUps * 4);
  const status = score >= 85 ? "Strong" : score >= 70 ? "Good" : "Needs Attention";

  container.innerHTML = `
    <div class="health-score">
      <strong>${score}</strong>
      <span>${status}</span>
      <p>Based on active opportunities NorthX can measure today.</p>
    </div>
    <div class="health-factor-list">
      ${renderHealthFactor("Response Time", customerReplies ? "Replies active" : "No recent replies", customerReplies ? "green" : "neutral")}
      ${renderHealthFactor("Quote Conversion", awaitingQuotes ? `${awaitingQuotes} waiting` : "No quotes waiting", awaitingQuotes ? "amber" : "green")}
      ${renderHealthFactor("Customer Satisfaction", "Not connected yet", "neutral")}
      ${renderHealthFactor("Missed Call Recovery", missedCallsWaiting ? `${missedCallsWaiting} need review` : "Clear", missedCallsWaiting ? "red" : "green")}
    </div>
  `;
}

function renderHealthFactor(label, value, tone) {
  return `
    <div class="health-factor">
      <span>${escapeHtml(label)}</span>
      <strong class="${tone}">${escapeHtml(value)}</strong>
    </div>
  `;
}

function renderLaunchChecklist() {
  const card = document.getElementById("launch-checklist-card");
  const checklist = [
    {
      label: "Business information",
      complete: Boolean(quotePdfSettings && quotePdfSettings.company_display_name),
      href: "settings.html"
    },
    {
      label: "Missed-call message",
      complete: Boolean(smsSettings && smsSettings.missed_call_auto_reply_message),
      href: "messages.html"
    },
    {
      label: "Quote request link",
      complete: overviewData.quoteRequests.length > 0,
      href: "quote-link.html"
    },
    {
      label: "First customers",
      complete: overviewData.customers.length > 0,
      href: "customers.html"
    },
    {
      label: "Follow-up automation",
      complete: overviewData.scheduledMessages.length > 0,
      href: "messages.html"
    }
  ];
  const incomplete = checklist.filter((item) => !item.complete);

  if (incomplete.length === 0) {
    card.classList.add("hidden");
    return;
  }

  card.classList.remove("hidden");
  document.getElementById("launch-progress-text").textContent =
    `${incomplete.length} setup step${incomplete.length === 1 ? "" : "s"} left.`;
  document.getElementById("launch-checklist").innerHTML = incomplete.slice(0, 3).map((item) => `
    <a href="${item.href}" class="checklist-item">
      <span>${escapeHtml(item.label)}</span>
      <span>Set up</span>
    </a>
  `).join("");
}

function refreshIcons() {
  if (window.lucide) {
    window.lucide.createIcons();
  }
}

function renderOverview() {
  renderHeader();
  renderMetrics();
  renderLaunchChecklist();
  renderAttention();
  renderOpportunities();
  renderToday();
  renderActivity();
  renderBusinessHealth();
  refreshIcons();
}

async function refreshOverview() {
  await loadOverviewData();
  renderOverview();
}

const logoutButton = document.getElementById("logout-button");

if (logoutButton) {
  logoutButton.addEventListener("click", async function () {
    await supabaseClient.auth.signOut();
    window.location.href = "login.html";
  });
}

async function initOverview() {
  const session = await protectPage();

  if (!session) return;

  const profile = await loadProfile(session);

  if (!profile || !currentClientId) return;

  await loadSettings();
  await refreshOverview();
}

["leads", "quote_requests", "quotes", "messages", "scheduled_messages", "customers"].forEach((table) => {
  supabaseClient
    .channel(`overview-${table}-realtime`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table
      },
      function () {
        refreshOverview();
      }
    )
    .subscribe();
});

initOverview();
