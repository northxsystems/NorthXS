let currentClientId = null;
let currentProfile = null;
let quotePdfSettings = null;
let dashboardData = {
  leads: [],
  quoteRequests: [],
  quotes: [],
  messages: []
};

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatDate(value) {
  if (!value) return "-";
  return new Date(value).toLocaleString();
}

function formatCurrency(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  }).format(Number(value) || 0);
}

async function protectPage() {
  const { data } = await supabaseClient.auth.getSession();

  if (!data.session) {
    window.location.href = "login.html";
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

async function loadQuotePdfSettings() {
  const { data, error } = await supabaseClient
    .from("client_quote_pdf_settings")
    .select("*")
    .eq("client_id", currentClientId)
    .maybeSingle();

  if (error) {
    console.error("Error loading dashboard PDF settings:", error);
    quotePdfSettings = null;
    return;
  }

  quotePdfSettings = data;
}

function getCompanyDisplayName() {
  return (
    (quotePdfSettings && quotePdfSettings.company_display_name) ||
    currentProfile.company_name ||
    currentProfile.business_name ||
    currentProfile.client_name ||
    currentProfile.client_id ||
    "NorthX Systems"
  );
}

function renderWelcome() {
  const companyName = getCompanyDisplayName();
  document.getElementById("dashboard-welcome").textContent = `Welcome back, ${companyName}`;
  document.getElementById("dashboard-subtitle").textContent =
    "Your quote pipeline, SMS activity, and missed-call recovery at a glance.";
}

async function safeSelect(table, queryBuilder) {
  const { data, error } = await queryBuilder;

  if (error) {
    console.error(`Error loading ${table}:`, {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
      raw: error
    });
    return [];
  }

  return data || [];
}

async function loadDashboardData() {
  const [leads, quoteRequests, quotes, messages] = await Promise.all([
    safeSelect(
      "leads",
      supabaseClient
        .from("leads")
        .select("*")
        .eq("client_id", currentClientId)
        .order("created_at", { ascending: false })
        .limit(25)
    ),
    safeSelect(
      "quote_requests",
      supabaseClient
        .from("quote_requests")
        .select("*")
        .eq("client_id", currentClientId)
        .order("created_at", { ascending: false })
        .limit(25)
    ),
    safeSelect(
      "quotes",
      supabaseClient
        .from("quotes")
        .select("*")
        .eq("client_id", currentClientId)
        .order("created_at", { ascending: false })
        .limit(25)
    ),
    safeSelect(
      "messages",
      supabaseClient
        .from("messages")
        .select("*")
        .eq("client_id", currentClientId)
        .order("created_at", { ascending: false })
        .limit(25)
    )
  ]);

  dashboardData = { leads, quoteRequests, quotes, messages };
}

function renderSnapshotCards() {
  const { leads, quoteRequests, quotes } = dashboardData;
  const newQuoteRequests = quoteRequests.filter((quote) => (quote.status || "new") === "new").length;
  const quotesSent = quotes.filter((quote) => quote.status === "sent").length;
  const quotesWon = quotes.filter((quote) => quote.status === "accepted").length;
  const estimatedRevenue = quotes.reduce((sum, quote) => sum + (Number(quote.grand_total) || 0), 0);
  const missedCallsRecovered = leads.filter((lead) => lead.call_status === "Missed Call").length;
  const smsUsed = currentProfile.sms_sent_this_month || 0;
  const smsLimit = currentProfile.monthly_sms_limit || 0;

  document.getElementById("new-quote-requests").textContent = newQuoteRequests;
  document.getElementById("quotes-sent").textContent = quotesSent;
  document.getElementById("quotes-won").textContent = quotesWon;
  document.getElementById("estimated-revenue").textContent = formatCurrency(estimatedRevenue);
  document.getElementById("missed-calls-recovered").textContent = missedCallsRecovered;
  document.getElementById("sms-used-month").textContent = smsUsed;
  document.getElementById("sms-used-limit").textContent = `${smsUsed} / ${smsLimit} SMS`;
}

function buildActivityItems() {
  const { leads, quoteRequests, quotes, messages } = dashboardData;

  return [
    ...quoteRequests.map((quote) => ({
      type: "Quote Request",
      title: quote.customer_name || "New quote request",
      detail: quote.service_requested || quote.problem_description || "Customer submitted a request",
      date: quote.created_at,
      href: "quote-requests.html"
    })),
    ...quotes.map((quote) => ({
      type: "Quote",
      title: quote.customer_name || "Quote created",
      detail: `${quote.status || "draft"} - ${formatCurrency(quote.grand_total)}`,
      date: quote.updated_at || quote.created_at,
      href: "quote-requests.html"
    })),
    ...messages.map((message) => ({
      type: "SMS",
      title: message.phone || "SMS activity",
      detail: `${message.direction || "message"} - ${message.message || ""}`,
      date: message.created_at,
      href: "messages.html"
    })),
    ...leads
      .filter((lead) => lead.call_status === "Missed Call")
      .map((lead) => ({
        type: "Missed Call",
        title: lead.name || lead.phone || "Missed call",
        detail: lead.follow_up_status || "Recovered automatically",
        date: lead.created_at,
        href: "leads.html"
      }))
  ]
    .filter((item) => item.date)
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 10);
}

function renderActivityFeed() {
  const feed = document.getElementById("activity-feed");
  const items = buildActivityItems();

  if (items.length === 0) {
    feed.innerHTML = `
      <div class="activity-empty">
        <strong>No recent activity yet.</strong>
        <span>New quote requests, SMS messages, and missed calls will appear here.</span>
      </div>
    `;
    return;
  }

  feed.innerHTML = items.map((item) => `
    <a class="activity-item" href="${item.href}">
      <span class="activity-type">${escapeHtml(item.type)}</span>
      <div>
        <strong>${escapeHtml(item.title)}</strong>
        <p>${escapeHtml(item.detail)}</p>
      </div>
      <time>${formatDate(item.date)}</time>
    </a>
  `).join("");
}

async function refreshDashboard() {
  await loadDashboardData();
  renderSnapshotCards();
  renderActivityFeed();
}

const logoutButton = document.getElementById("logout-button");

if (logoutButton) {
  logoutButton.addEventListener("click", async function () {
    await supabaseClient.auth.signOut();
    window.location.href = "login.html";
  });
}

async function initDashboard() {
  const session = await protectPage();

  if (!session) return;

  const profile = await loadProfile(session);

  if (!profile || !currentClientId) return;

  await loadQuotePdfSettings();
  renderWelcome();
  await refreshDashboard();
}

["leads", "quote_requests", "quotes", "messages"].forEach((table) => {
  supabaseClient
    .channel(`dashboard-${table}-realtime`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table
      },
      function () {
        refreshDashboard();
      }
    )
    .subscribe();
});

initDashboard();
