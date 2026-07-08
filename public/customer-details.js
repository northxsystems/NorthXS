let currentUserId = null;
let currentClientId = null;
let routeIds = {};
let activeCustomerRecord = null;
let internalNotes = [];
let relatedTimelineIds = {
  customerIds: [],
  leadIds: [],
  quoteRequestIds: []
};

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

function addUniqueId(list, value) {
  if (!value) return;

  const stringValue = String(value);

  if (!list.some((item) => String(item) === stringValue)) {
    list.push(value);
  }
}

function getRecordPhone() {
  return activeCustomerRecord && activeCustomerRecord.phone
    ? activeCustomerRecord.phone.trim()
    : "";
}

function getRecordEmail() {
  return activeCustomerRecord && activeCustomerRecord.email
    ? activeCustomerRecord.email.trim()
    : "";
}

async function safeRelatedSelect(table, queryBuilder) {
  const { data, error } = await queryBuilder;

  if (error) {
    console.warn(`Could not load related ${table} records for timeline:`, {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code
    });
    return [];
  }

  return data || [];
}

async function loadRelatedTimelineIds() {
  relatedTimelineIds = {
    customerIds: [],
    leadIds: [],
    quoteRequestIds: []
  };

  addUniqueId(relatedTimelineIds.customerIds, routeIds.customerId);
  addUniqueId(relatedTimelineIds.leadIds, routeIds.leadId);
  addUniqueId(relatedTimelineIds.quoteRequestIds, routeIds.quoteRequestId);

  if (activeCustomerRecord) {
    addUniqueId(relatedTimelineIds.customerIds, activeCustomerRecord.customerId);

    if (activeCustomerRecord.source === "customer") {
      addUniqueId(relatedTimelineIds.customerIds, activeCustomerRecord.id);
    }

    if (activeCustomerRecord.source === "lead") {
      addUniqueId(relatedTimelineIds.leadIds, activeCustomerRecord.id);
    }

    if (activeCustomerRecord.source === "quote_request") {
      addUniqueId(relatedTimelineIds.quoteRequestIds, activeCustomerRecord.id);
    }
  }

  const phone = getRecordPhone();
  const email = getRecordEmail();
  const relatedQueries = [];

  if (phone) {
    relatedQueries.push(
      safeRelatedSelect(
        "customers",
        supabaseClient
          .from("customers")
          .select("id")
          .eq("client_id", currentClientId)
          .eq("phone", phone)
      ).then((records) => records.forEach((record) => addUniqueId(relatedTimelineIds.customerIds, record.id)))
    );
    relatedQueries.push(
      safeRelatedSelect(
        "leads",
        supabaseClient
          .from("leads")
          .select("id, customer_id")
          .eq("client_id", currentClientId)
          .eq("phone", phone)
      ).then((records) => records.forEach((record) => {
        addUniqueId(relatedTimelineIds.leadIds, record.id);
        addUniqueId(relatedTimelineIds.customerIds, record.customer_id);
      }))
    );
    relatedQueries.push(
      safeRelatedSelect(
        "quote_requests",
        supabaseClient
          .from("quote_requests")
          .select("id, customer_id")
          .eq("client_id", currentClientId)
          .eq("phone", phone)
      ).then((records) => records.forEach((record) => {
        addUniqueId(relatedTimelineIds.quoteRequestIds, record.id);
        addUniqueId(relatedTimelineIds.customerIds, record.customer_id);
      }))
    );
  }

  if (email) {
    relatedQueries.push(
      safeRelatedSelect(
        "customers",
        supabaseClient
          .from("customers")
          .select("id")
          .eq("client_id", currentClientId)
          .ilike("email", email)
      ).then((records) => records.forEach((record) => addUniqueId(relatedTimelineIds.customerIds, record.id)))
    );
    relatedQueries.push(
      safeRelatedSelect(
        "leads",
        supabaseClient
          .from("leads")
          .select("id, customer_id")
          .eq("client_id", currentClientId)
          .ilike("email", email)
      ).then((records) => records.forEach((record) => {
        addUniqueId(relatedTimelineIds.leadIds, record.id);
        addUniqueId(relatedTimelineIds.customerIds, record.customer_id);
      }))
    );
    relatedQueries.push(
      safeRelatedSelect(
        "quote_requests",
        supabaseClient
          .from("quote_requests")
          .select("id, customer_id")
          .eq("client_id", currentClientId)
          .ilike("email", email)
      ).then((records) => records.forEach((record) => {
        addUniqueId(relatedTimelineIds.quoteRequestIds, record.id);
        addUniqueId(relatedTimelineIds.customerIds, record.customer_id);
      }))
    );
  }

  await Promise.all(relatedQueries);
}

function buildTimelineFilter() {
  const filters = [];

  relatedTimelineIds.customerIds.forEach((id) => filters.push(`customer_id.eq.${id}`));
  relatedTimelineIds.leadIds.forEach((id) => filters.push(`lead_id.eq.${id}`));
  relatedTimelineIds.quoteRequestIds.forEach((id) => filters.push(`quote_request_id.eq.${id}`));

  return [...new Set(filters)];
}

function buildNoteFilter() {
  const filters = [];

  if (routeIds.customerId) filters.push(`customer_id.eq.${routeIds.customerId}`);
  if (routeIds.leadId) filters.push(`lead_id.eq.${routeIds.leadId}`);
  if (routeIds.quoteRequestId) filters.push(`quote_request_id.eq.${routeIds.quoteRequestId}`);

  if (filters.length === 0 && activeCustomerRecord && activeCustomerRecord.customerId) {
    filters.push(`customer_id.eq.${activeCustomerRecord.customerId}`);
  }

  return [...new Set(filters)];
}

async function loadTimelineEvents() {
  const filters = buildTimelineFilter();

  const [derivedEvents, contactFallbackEvents] = await Promise.all([
    loadDerivedTimelineEvents(),
    loadContactFallbackTimelineEvents()
  ]);

  if (filters.length === 0) {
    return sortTimelineEvents(dedupeTimelineEvents([
      ...derivedEvents,
      ...contactFallbackEvents
    ]));
  }

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
    return sortTimelineEvents(dedupeTimelineEvents([
      ...derivedEvents,
      ...contactFallbackEvents
    ]));
  }

  return sortTimelineEvents(dedupeTimelineEvents([
    ...(data || []),
    ...derivedEvents,
    ...contactFallbackEvents
  ]));
}

function sortTimelineEvents(events) {
  return events.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

function normalizePhone(value) {
  return String(value || "").replace(/\D/g, "");
}

async function loadContactFallbackTimelineEvents() {
  const phone = normalizePhone(getRecordPhone());
  const email = normalizeCompareText(getRecordEmail());

  if (!phone && !email) return [];

  const { data, error } = await supabaseClient
    .from("customer_timeline")
    .select("*")
    .eq("client_id", currentUserId)
    .order("created_at", { ascending: false })
    .limit(250);

  if (error) {
    console.warn("Could not load contact fallback timeline events:", {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code
    });
    return [];
  }

  return (data || []).filter((event) => {
    const eventPhone = normalizePhone(
      event.phone ||
      event.customer_phone ||
      event.contact_phone
    );
    const eventEmail = normalizeCompareText(
      event.email ||
      event.customer_email ||
      event.contact_email
    );

    return Boolean(
      (phone && eventPhone && eventPhone === phone) ||
      (email && eventEmail && eventEmail === email)
    );
  });
}

async function loadDerivedTimelineEvents() {
  const quoteRequestFilters = [];
  const quoteFilters = [];

  relatedTimelineIds.customerIds.forEach((id) => {
    quoteRequestFilters.push(`customer_id.eq.${id}`);
    quoteFilters.push(`customer_id.eq.${id}`);
  });
  relatedTimelineIds.quoteRequestIds.forEach((id) => {
    quoteRequestFilters.push(`id.eq.${id}`);
    quoteFilters.push(`quote_request_id.eq.${id}`);
  });

  const phone = getRecordPhone();
  const email = getRecordEmail();

  if (phone) {
    quoteRequestFilters.push(`phone.eq.${phone}`);
    quoteFilters.push(`phone.eq.${phone}`);
  }

  if (email) {
    quoteRequestFilters.push(`email.ilike.${email}`);
    quoteFilters.push(`email.ilike.${email}`);
  }

  const [requests, customerQuotes] = await Promise.all([
    quoteRequestFilters.length > 0
      ? safeRelatedSelect(
        "quote_requests",
        supabaseClient
          .from("quote_requests")
          .select("*")
          .eq("client_id", currentClientId)
          .or([...new Set(quoteRequestFilters)].join(","))
      )
      : Promise.resolve([]),
    quoteFilters.length > 0
      ? safeRelatedSelect(
        "quotes",
        supabaseClient
          .from("quotes")
          .select("*")
          .eq("client_id", currentClientId)
          .or([...new Set(quoteFilters)].join(","))
      )
      : Promise.resolve([])
  ]);

  return [
    ...requests.map((request) => ({
      created_at: request.created_at,
      event_type: "quote_requested",
      event_title: "Quote request submitted",
      event_description: request.service_requested || request.problem_description || "New request"
    })),
    ...customerQuotes.map((quote) => ({
      created_at: quote.updated_at || quote.created_at,
      event_type: "quote_sent",
      event_title: `Quote ${quote.status || "draft"}`,
      event_description: `${formatCurrency(quote.grand_total)} total`
    }))
  ].filter((event) => event.created_at);
}

function formatCurrency(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD"
  }).format(Number(value) || 0);
}

function normalizeCompareText(value) {
  return String(value || "").trim().replace(/\s+/g, " ").toLowerCase();
}

function dedupeTimelineEvents(events) {
  const visibleNoteDescriptions = new Set(
    internalNotes.map((note) => normalizeCompareText(note.note))
  );
  const seen = new Set();

  return events.filter((event) => {
    const normalizedDescription = normalizeCompareText(event.event_description);

    if (event.event_type === "note_added" && visibleNoteDescriptions.has(normalizedDescription)) {
      return false;
    }

    const key = [
      event.event_type || "",
      event.event_title || "",
      normalizedDescription,
      event.created_at || ""
    ].join("|");

    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
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
        <span>${formatDate(event.created_at)}</span>
        <strong>${escapeHtml(event.event_title || meta.label)}</strong>
        <p>${escapeHtml(event.event_description || "")}</p>
      </article>
    `;
  }).join("");
}

function buildNotePayload(note) {
  return {
    client_id: currentUserId,
    customer_id: routeIds.customerId || activeCustomerRecord.customerId || null,
    lead_id: routeIds.leadId || null,
    quote_request_id: routeIds.quoteRequestId || null,
    note
  };
}

async function loadInternalNotes() {
  const filters = buildNoteFilter();

  if (filters.length === 0) {
    internalNotes = [];
    return;
  }

  const { data, error } = await supabaseClient
    .from("customer_notes")
    .select("*")
    .eq("client_id", currentUserId)
    .or(filters.join(","))
    .order("created_at", { ascending: false });

  if (error) {
    console.warn("Could not load internal notes:", {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code
    });
    internalNotes = [];
    return;
  }

  internalNotes = data || [];
}

function renderInternalNotes() {
  const notesList = document.getElementById("internal-notes-list");

  if (internalNotes.length === 0) {
    notesList.innerHTML = `<div class="customer-empty-mini">No internal notes yet.</div>`;
    return;
  }

  notesList.innerHTML = internalNotes.map((note) => `
    <article class="internal-note-item">
      <p>${escapeHtml(note.note || "")}</p>
      <div class="internal-note-meta">
        <time>${formatDate(note.created_at)}</time>
        <button type="button" class="delete-note-btn" data-note-id="${escapeHtml(note.id)}">Delete</button>
      </div>
    </article>
  `).join("");
}

async function refreshInternalNotes() {
  await loadInternalNotes();
  renderInternalNotes();
}

async function createNoteTimelineEvent(note) {
  const { error } = await supabaseClient
    .from("customer_timeline")
    .insert({
      client_id: currentUserId,
      customer_id: routeIds.customerId || activeCustomerRecord.customerId || null,
      lead_id: routeIds.leadId || null,
      quote_request_id: routeIds.quoteRequestId || null,
      event_type: "note_added",
      event_title: "Note added",
      event_description: note
    });

  if (error) {
    console.warn("Could not add note timeline event:", {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code
    });
  }
}

async function addInternalNote(event) {
  event.preventDefault();

  const noteInput = document.getElementById("internal-note-input");
  const note = noteInput.value.trim();

  if (!note) return;

  const submitButton = event.target.querySelector("button[type='submit']");
  submitButton.disabled = true;
  submitButton.textContent = "Saving...";

  const { error } = await supabaseClient
    .from("customer_notes")
    .insert(buildNotePayload(note));

  submitButton.disabled = false;
  submitButton.textContent = "Save Note";

  if (error) {
    console.error("Error adding internal note:", {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
      raw: error
    });
    alert("Could not save note. Check the customer_notes table setup.");
    return;
  }

  noteInput.value = "";
  await createNoteTimelineEvent(note);
  await refreshInternalNotes();
  renderTimeline(await loadTimelineEvents());
}

async function deleteInternalNote(noteId) {
  const confirmDelete = confirm("Delete this internal note?");

  if (!confirmDelete) return;

  const { error } = await supabaseClient
    .from("customer_notes")
    .delete()
    .eq("id", noteId)
    .eq("client_id", currentUserId);

  if (error) {
    console.error("Error deleting internal note:", {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
      raw: error
    });
    alert("Could not delete note.");
    return;
  }

  await refreshInternalNotes();
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

document.getElementById("internal-note-form").addEventListener("submit", addInternalNote);
document.getElementById("internal-notes-list").addEventListener("click", function (event) {
  const deleteButton = event.target.closest(".delete-note-btn");

  if (!deleteButton) return;

  deleteInternalNote(deleteButton.dataset.noteId);
});

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
  await loadRelatedTimelineIds();
  await refreshInternalNotes();
  renderTimeline(await loadTimelineEvents());
}

initCustomerDetailsPage();
