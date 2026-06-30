let currentUserId = null;
let currentClientId = null;
let routeIds = {};
let activeCustomerRecord = null;

const eventMeta = {
  lead_created: { label: "New Lead", icon: "LD" },
  missed_call: { label: "Missed Call", icon: "MC" },
  sms_sent: { label: "SMS Sent", icon: "SMS" },
  quote_requested: { label: "Quote Requested", icon: "QR" },
  quote_sent: { label: "Quote Sent", icon: "QS" },
  follow_up_scheduled: { label: "Follow-Up Scheduled", icon: "FU" },
  follow_up_sent: { label: "Follow-Up Sent", icon: "FS" },
  note_added: { label: "Internal Note", icon: "NT" }
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

function getRouteIds() {
  const params = new URLSearchParams(window.location.search);

  return {
    customerId: params.get("customer_id"),
    leadId: params.get("lead_id"),
    quoteRequestId: params.get("quote_request_id")
  };
}

async function protectPage() {
  const { data } = await supabaseClient.auth.getSession();

  if (!data.session) {
    window.location.href = "login.html";
    return null;
  }

  currentUserId = data.session.user.id;
  return data.session;
}

async function loadProfile(session) {
  const { data: profile, error } = await supabaseClient
    .from("profiles")
    .select("client_id")
    .eq("id", session.user.id)
    .single();

  if (error) {
    console.error("Error loading profile:", error);
    return null;
  }

  currentClientId = profile.client_id;
  return profile;
}

function normalizeCustomerRecord(record, source) {
  if (!record) return null;

  if (source === "customer") {
    return {
      id: record.id,
      source,
      name: record.name,
      phone: record.phone,
      email: record.email,
      status: record.status || "Active",
      sourceLabel: record.source || "Customer",
      createdAt: record.created_at
    };
  }

  if (source === "quote_request") {
    return {
      id: record.id,
      customerId: record.customer_id,
      source,
      name: record.customer_name,
      phone: record.phone,
      email: record.email,
      status: record.status || "new",
      sourceLabel: "Quote Request",
      createdAt: record.created_at
    };
  }

  return {
    id: record.id,
    customerId: record.customer_id,
    source,
    name: record.name,
    phone: record.phone,
    email: record.email,
    status: record.status || record.call_status || "New",
    sourceLabel: record.source || "Lead",
    createdAt: record.created_at
  };
}

async function loadRecordFrom(table, id, source) {
  if (!id) return null;

  const { data, error } = await supabaseClient
    .from(table)
    .select("*")
    .eq("id", id)
    .eq("client_id", currentClientId)
    .maybeSingle();

  if (error) {
    console.error(`Error loading ${table}:`, {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
      raw: error
    });
    return null;
  }

  return normalizeCustomerRecord(data, source);
}

async function loadCustomerRecord() {
  if (routeIds.customerId) {
    return loadRecordFrom("customers", routeIds.customerId, "customer");
  }

  if (routeIds.quoteRequestId) {
    return loadRecordFrom("quote_requests", routeIds.quoteRequestId, "quote_request");
  }

  if (routeIds.leadId) {
    return loadRecordFrom("leads", routeIds.leadId, "lead");
  }

  return null;
}

function getStatusClass(status) {
  const normalized = String(status || "").toLowerCase();

  if (["booked", "won", "accepted", "active", "sent"].includes(normalized)) return "booked";
  if (["lost", "declined", "failed"].includes(normalized)) return "lost";
  if (["reviewing", "contacted", "pending"].includes(normalized)) return "contacted";
  if (["quote_sent", "quoted"].includes(normalized)) return "quoted";
  return "new";
}

function renderCustomerHeader(record) {
  document.getElementById("page-title").textContent = record.name || "Unknown Customer";
  document.getElementById("customer-source-label").textContent = record.sourceLabel || "Customer";
  document.getElementById("customer-name").textContent = record.name || "Unknown Customer";
  document.getElementById("customer-phone").textContent = record.phone || "-";
  document.getElementById("customer-email").textContent = record.email || "-";
  document.getElementById("customer-source").textContent = record.sourceLabel || "-";
  document.getElementById("customer-created").textContent = formatDate(record.createdAt);

  const statusBadge = document.getElementById("customer-status");
  statusBadge.textContent = record.status || "Active";
  statusBadge.className = `badge ${getStatusClass(record.status)}`;
}

function buildTimelineFilter() {
  const filters = [];

  if (routeIds.customerId) filters.push(`customer_id.eq.${routeIds.customerId}`);
  if (routeIds.leadId) filters.push(`lead_id.eq.${routeIds.leadId}`);
  if (routeIds.quoteRequestId) filters.push(`quote_request_id.eq.${routeIds.quoteRequestId}`);
  if (activeCustomerRecord && activeCustomerRecord.customerId) {
    filters.push(`customer_id.eq.${activeCustomerRecord.customerId}`);
  }

  return [...new Set(filters)];
}

async function loadTimelineEvents() {
  const filters = buildTimelineFilter();

  if (filters.length === 0) return [];

  const { data, error } = await supabaseClient
    .from("customer_timeline")
    .select("*")
    .eq("client_id", currentUserId)
    .or(filters.join(","))
    .order("created_at", { ascending: false });

  if (error) {
    console.warn("Could not load customer timeline:", {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code
    });
    return [];
  }

  return data || [];
}

function renderTimeline(events) {
  const timelineList = document.getElementById("timeline-list");

  if (events.length === 0) {
    timelineList.innerHTML = `
      <div class="customer-empty-mini">
        No activity yet.
      </div>
    `;
    return;
  }

  timelineList.innerHTML = events.map((event) => {
    const meta = eventMeta[event.event_type] || {
      label: event.event_title || "Timeline Event",
      icon: "EV"
    };

    return `
      <article class="customer-page-timeline-item">
        <span class="timeline-icon ${escapeHtml(event.event_type || "")}">${escapeHtml(meta.icon)}</span>
        <div class="timeline-content">
          <strong>${escapeHtml(event.event_title || meta.label)}</strong>
          <p>${escapeHtml(event.event_description || "")}</p>
          <time>${formatDate(event.created_at)}</time>
        </div>
      </article>
    `;
  }).join("");
}

function buildTimelinePayload(note) {
  return {
    client_id: currentUserId,
    customer_id: routeIds.customerId || activeCustomerRecord.customerId || null,
    lead_id: routeIds.leadId || null,
    quote_request_id: routeIds.quoteRequestId || null,
    event_type: "note_added",
    event_title: "Internal Note",
    event_description: note
  };
}

async function addTimelineNote(event) {
  event.preventDefault();

  const noteInput = document.getElementById("timeline-note-input");
  const note = noteInput.value.trim();

  if (!note) return;

  const submitButton = event.target.querySelector("button[type='submit']");
  submitButton.disabled = true;
  submitButton.textContent = "Adding...";

  const { error } = await supabaseClient
    .from("customer_timeline")
    .insert(buildTimelinePayload(note));

  submitButton.disabled = false;
  submitButton.textContent = "Add Note";

  if (error) {
    console.error("Error adding timeline note:", {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
      raw: error
    });
    alert("Could not add note. Check the customer_timeline table setup.");
    return;
  }

  noteInput.value = "";
  renderTimeline(await loadTimelineEvents());
}

function showCustomerNotFound() {
  document.getElementById("customer-empty").classList.remove("hidden");
  document.getElementById("customer-content").classList.add("hidden");
}

function showCustomerContent() {
  document.getElementById("customer-empty").classList.add("hidden");
  document.getElementById("customer-content").classList.remove("hidden");
}

const logoutButton = document.getElementById("logout-button");

if (logoutButton) {
  logoutButton.addEventListener("click", async function () {
    await supabaseClient.auth.signOut();
    window.location.href = "login.html";
  });
}

document.getElementById("timeline-note-form").addEventListener("submit", addTimelineNote);

async function initCustomerDetailsPage() {
  routeIds = getRouteIds();

  const session = await protectPage();

  if (!session) return;

  const profile = await loadProfile(session);

  if (!profile || !currentClientId) {
    showCustomerNotFound();
    return;
  }

  activeCustomerRecord = await loadCustomerRecord();

  if (!activeCustomerRecord) {
    showCustomerNotFound();
    return;
  }

  renderCustomerHeader(activeCustomerRecord);
  showCustomerContent();
  renderTimeline(await loadTimelineEvents());
}

initCustomerDetailsPage();
