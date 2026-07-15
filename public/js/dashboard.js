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

function formatDate(value, options) {
  if (!value) return "-";
  return new Date(value).toLocaleString(undefined, options);
}

function formatCurrency(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  }).format(Number(value) || 0);
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

function renderHeader() {
  const ownerName = getOwnerName();
  const companyName = getCompanyDisplayName();
  const dateText = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric"
  });

  document.getElementById("overview-date").textContent = dateText;
  document.getElementById("overview-greeting").textContent =
    ownerName ? `${greetingPrefix()}, ${ownerName}.` : `${greetingPrefix()}.`;

  const attentionCount = buildAttentionItems().length;
  document.getElementById("overview-summary").textContent =
    attentionCount > 0
      ? `Here is what needs your attention at ${companyName} today.`
      : `${companyName} is caught up. New leads, replies, and quote activity will appear here as they arrive.`;

  const workspaceName = document.getElementById("shell-workspace-name");
  if (workspaceName) workspaceName.textContent = companyName;
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

function quoteValue(quote) {
  return Number(quote.grand_total || quote.estimated_value || quote.value || 0) || 0;
}

function leadValue(lead) {
  return Number(lead.estimated_value || lead.value || 0) || 0;
}

function renderMetrics() {
  const weekStart = daysAgo(7);
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const newLeads = overviewData.leads.filter((lead) => isAfter(lead.created_at, weekStart));
  const missedCalls = overviewData.leads.filter((lead) =>
    (lead.call_status || "").toLowerCase().includes("missed") && isAfter(lead.created_at, weekStart)
  );
  const awaitingResponse = getOpenQuoteRequests().filter((quote) =>
    ["quote_sent", "reviewing"].includes(quote.status || "new")
  );
  const monthlyRevenue = overviewData.quotes
    .filter((quote) => quote.status === "accepted" && isAfter(quote.updated_at || quote.created_at, monthStart))
    .reduce((sum, quote) => sum + quoteValue(quote), 0);
  const dueFollowUps = overviewData.scheduledMessages.filter((message) =>
    message.status === "pending" && isBefore(message.send_at, endOfDay())
  );

  document.getElementById("metric-new-leads").textContent = newLeads.length;
  document.getElementById("metric-new-leads-context").textContent =
    `${overviewData.leads.length} total captured opportunities`;

  document.getElementById("metric-missed-calls").textContent = missedCalls.length;
  document.getElementById("metric-missed-calls-context").textContent =
    missedCalls.length === 1 ? "Recovered automatically this week" : "Recovered automatically this week";

  document.getElementById("metric-quotes-awaiting").textContent = awaitingResponse.length;
  document.getElementById("metric-quotes-awaiting-context").textContent =
    `${formatCurrency(awaitingResponse.reduce((sum, quote) => sum + quoteValue(quote), 0))} connected to open quote records`;

  document.getElementById("metric-revenue-month").textContent = formatCurrency(monthlyRevenue);
  document.getElementById("metric-revenue-month-context").textContent = "Accepted quote value this month";

  document.getElementById("metric-followups").textContent = dueFollowUps.length;
  document.getElementById("metric-followups-context").textContent =
    dueFollowUps.length ? "Pending follow-ups due by end of day" : "No scheduled follow-ups due today";
}

function buildAttentionItems() {
  const twoDaysAgo = daysAgo(2);
  const newUncontactedLeads = overviewData.leads.filter((lead) => {
    const status = String(lead.status || lead.follow_up_status || lead.call_status || "new").toLowerCase();
    return !["contacted", "booked", "won", "lost"].some((closed) => status.includes(closed));
  });
  const missedCalls = newUncontactedLeads.filter((lead) =>
    String(lead.call_status || "").toLowerCase().includes("missed")
  );
  const staleQuotes = getOpenQuoteRequests().filter((quote) =>
    isBefore(quote.updated_at || quote.created_at, twoDaysAgo) &&
    ["quote_sent", "reviewing"].includes(quote.status || "new")
  );
  const unreadReplies = overviewData.messages.filter((message) =>
    message.direction === "received" && isAfter(message.created_at, daysAgo(3))
  );
  const dueFollowUps = overviewData.scheduledMessages.filter((message) =>
    message.status === "pending" && isBefore(message.send_at, endOfDay())
  );

  const items = [];

  if (staleQuotes.length > 0) {
    const value = staleQuotes.reduce((sum, quote) => sum + quoteValue(quote), 0);
    items.push({
      title: `${staleQuotes.length} quote${staleQuotes.length === 1 ? "" : "s"} need a response follow-up.`,
      detail: value > 0
        ? `${formatCurrency(value)} in open quote value has been waiting for more than 48 hours.`
        : "These customers have already raised their hand and may need one more nudge.",
      action: "Follow up",
      href: "quote-requests.html",
      value: value > 0 ? formatCurrency(value) : "Revenue at risk",
      tone: "amber"
    });
  }

  if (missedCalls.length > 0) {
    items.push({
      title: `${missedCalls.length} missed caller${missedCalls.length === 1 ? "" : "s"} still need attention.`,
      detail: "Missed calls are often high-intent leads. Confirm someone followed up before they call a competitor.",
      action: "Review missed calls",
      href: "leads.html",
      value: "Fast response",
      tone: "red"
    });
  }

  if (newUncontactedLeads.length > 0) {
    items.push({
      title: `${newUncontactedLeads.length} lead${newUncontactedLeads.length === 1 ? "" : "s"} may be waiting for first contact.`,
      detail: "New leads should be contacted quickly while the job is still urgent.",
      action: "Open leads",
      href: "leads.html",
      value: "Speed matters",
      tone: "blue"
    });
  }

  if (unreadReplies.length > 0) {
    items.push({
      title: `${unreadReplies.length} recent customer repl${unreadReplies.length === 1 ? "y" : "ies"} in your Inbox.`,
      detail: "Customer replies should be handled from one place so conversations do not get lost.",
      action: "View Inbox",
      href: "messages.html",
      value: "Customer response",
      tone: "green"
    });
  }

  if (dueFollowUps.length > 0) {
    items.push({
      title: `${dueFollowUps.length} follow-up${dueFollowUps.length === 1 ? "" : "s"} scheduled for today.`,
      detail: "Review upcoming follow-ups and make sure important customers are being reached.",
      action: "Review follow-ups",
      href: "messages.html",
      value: "Due today",
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
      <div class="empty-state">
        <strong>Nothing urgent needs attention right now.</strong>
        <span>When a lead waits too long, a quote needs follow-up, or a customer replies, NorthX will surface it here.</span>
        <a href="messages.html" class="secondary-action">Open Inbox</a>
      </div>
    `;
    return;
  }

  list.innerHTML = items.map((item) => `
    <div class="attention-item">
      <div>
        <strong>${escapeHtml(item.title)}</strong>
        <p>${escapeHtml(item.detail)}</p>
        <div class="attention-meta">
          <span class="status-pill ${item.tone}">${escapeHtml(item.value)}</span>
        </div>
      </div>
      <a href="${item.href}" class="primary-action">${escapeHtml(item.action)}</a>
    </div>
  `).join("");
}

function buildOpportunities() {
  const openQuoteValue = getOpenQuotes().reduce((sum, quote) => sum + quoteValue(quote), 0);
  const quoteRequestCount = getOpenQuoteRequests().length;
  const leadPipelineValue = overviewData.leads.reduce((sum, lead) => sum + leadValue(lead), 0);
  const pendingQuoteFollowUps = overviewData.scheduledMessages.filter((message) =>
    message.status === "pending" && message.message_type === "quote_follow_up"
  ).length;

  return [
    {
      title: "Open quote value",
      detail: `${getOpenQuotes().length} saved quote${getOpenQuotes().length === 1 ? "" : "s"} still in play.`,
      value: formatCurrency(openQuoteValue),
      href: "quote-requests.html"
    },
    {
      title: "Quote requests to convert",
      detail: `${quoteRequestCount} request${quoteRequestCount === 1 ? "" : "s"} can move through your pipeline.`,
      value: String(quoteRequestCount),
      href: "quote-requests.html"
    },
    {
      title: "Lead pipeline value",
      detail: leadPipelineValue > 0
        ? "Estimated value captured on current lead records."
        : "Add estimated values to leads to make pipeline value visible.",
      value: leadPipelineValue > 0 ? formatCurrency(leadPipelineValue) : "Add values",
      href: "leads.html"
    },
    {
      title: "Quote follow-ups ready",
      detail: "Scheduled reminders help recover quotes that would otherwise go quiet.",
      value: String(pendingQuoteFollowUps),
      href: "quote-requests.html"
    }
  ];
}

function renderOpportunities() {
  const list = document.getElementById("opportunity-list");
  const opportunities = buildOpportunities();

  list.innerHTML = opportunities.map((item) => `
    <a href="${item.href}" class="opportunity-item">
      <span class="item-dot"></span>
      <span>
        <strong>${escapeHtml(item.title)}</strong>
        <p>${escapeHtml(item.detail)}</p>
      </span>
      <span class="opportunity-value">${escapeHtml(item.value)}</span>
    </a>
  `).join("");
}

function renderToday() {
  const list = document.getElementById("today-list");
  const todayMessages = overviewData.scheduledMessages
    .filter((message) => isSameDay(message.send_at))
    .slice(0, 6);

  if (todayMessages.length === 0) {
    list.innerHTML = `
      <div class="empty-state">
        <strong>No follow-ups scheduled for today.</strong>
        <span>Upcoming quote reminders, retention messages, and appointment reminders will appear here as they are connected.</span>
        <a href="messages.html" class="secondary-action">Schedule a follow-up</a>
      </div>
      <div class="placeholder-note">Appointments and job scheduling are planned for the Calendar foundation and are not connected to a backend table yet.</div>
    `;
    return;
  }

  list.innerHTML = todayMessages.map((message) => `
    <div class="today-item">
      <span class="item-dot"></span>
      <span>
        <strong>${escapeHtml(message.customer_name || message.phone || "Customer follow-up")}</strong>
        <p>${escapeHtml(message.message || "Follow-up scheduled")} · ${formatDate(message.send_at, { hour: "numeric", minute: "2-digit" })}</p>
      </span>
      <span class="status-pill blue">${escapeHtml(message.status || "pending")}</span>
    </div>
  `).join("");
}

function buildActivityItems() {
  const { leads, quoteRequests, quotes, messages, scheduledMessages } = overviewData;

  return [
    ...leads.map((lead) => ({
      title: lead.name || lead.phone || "New lead captured",
      detail: String(lead.call_status || "").toLowerCase().includes("missed")
        ? "Missed call recovered and saved as a lead."
        : "New lead captured for follow-up.",
      date: lead.created_at,
      href: "leads.html"
    })),
    ...quoteRequests.map((quote) => ({
      title: quote.customer_name || "Quote request received",
      detail: `${quote.service_requested || "Service request"} moved into the sales pipeline.`,
      date: quote.created_at,
      href: "quote-requests.html"
    })),
    ...quotes.map((quote) => ({
      title: quote.customer_name || "Quote updated",
      detail: `Quote ${quote.status || "draft"} for ${formatCurrency(quoteValue(quote))}.`,
      date: quote.updated_at || quote.created_at,
      href: "quote-requests.html"
    })),
    ...messages.map((message) => ({
      title: message.phone || "Customer message",
      detail: message.direction === "received"
        ? "Customer replied in the Inbox."
        : "Follow-up sent to a customer.",
      date: message.created_at,
      href: "messages.html"
    })),
    ...scheduledMessages.map((message) => ({
      title: message.customer_name || message.phone || "Follow-up scheduled",
      detail: message.status === "sent"
        ? "Follow-up sent automatically."
        : "Upcoming follow-up is scheduled.",
      date: message.updated_at || message.created_at || message.send_at,
      href: "messages.html"
    }))
  ]
    .filter((item) => item.date)
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 12);
}

function renderActivity() {
  const feed = document.getElementById("activity-feed");
  const items = buildActivityItems();

  if (items.length === 0) {
    feed.innerHTML = `
      <div class="empty-state">
        <strong>No customer activity yet.</strong>
        <span>New leads, quote requests, customer replies, and automated follow-ups will appear here in plain language.</span>
      </div>
    `;
    return;
  }

  feed.innerHTML = items.map((item) => `
    <a class="os-activity-item" href="${item.href}">
      <span class="item-dot"></span>
      <span>
        <strong>${escapeHtml(item.title)}</strong>
        <p>${escapeHtml(item.detail)}</p>
      </span>
      <time>${formatDate(item.date)}</time>
    </a>
  `).join("");
}

function renderLaunchChecklist() {
  const checklist = [
    {
      label: "Business information added",
      complete: Boolean(quotePdfSettings && quotePdfSettings.company_display_name),
      href: "settings.html"
    },
    {
      label: "Missed-call recovery message configured",
      complete: Boolean(smsSettings && smsSettings.missed_call_auto_reply_message),
      href: "messages.html"
    },
    {
      label: "Quote request system receiving submissions",
      complete: overviewData.quoteRequests.length > 0,
      href: "quote-link.html"
    },
    {
      label: "First customer records created",
      complete: overviewData.customers.length > 0,
      href: "customers.html"
    },
    {
      label: "Follow-up automation scheduled",
      complete: overviewData.scheduledMessages.length > 0,
      href: "messages.html"
    }
  ];

  const completed = checklist.filter((item) => item.complete).length;
  document.getElementById("launch-progress-text").textContent =
    `${completed} of ${checklist.length} setup steps complete.`;

  document.getElementById("launch-checklist").innerHTML = checklist.map((item) => `
    <a href="${item.href}" class="checklist-item ${item.complete ? "complete" : ""}">
      <span>${escapeHtml(item.label)}</span>
      <span>${item.complete ? "Done" : "Set up"}</span>
    </a>
  `).join("");
}

function renderOverview() {
  renderHeader();
  renderMetrics();
  renderAttention();
  renderOpportunities();
  renderToday();
  renderActivity();
  renderLaunchChecklist();
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
