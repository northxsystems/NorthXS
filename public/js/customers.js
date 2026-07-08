let currentClientId = null;
let currentUserId = null;
let customers = [];
let quoteRequests = [];
let quotes = [];
let customerNotes = [];
let selectedCustomerId = null;

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
    currency: "USD"
  }).format(Number(value) || 0);
}

function getCustomerStatus(customer, requests, customerQuotes) {
  if ((customer.status || "").trim()) return customer.status;
  if (customerQuotes.some((quote) => quote.status === "accepted")) return "Won";
  if (customerQuotes.some((quote) => quote.status === "sent")) return "Quoted";
  if (requests.some((request) => (request.status || "new") === "new")) return "New";
  if (requests.length > 0 || customerQuotes.length > 0) return "Active";
  return "No activity";
}

function latestDate(values) {
  const dates = values
    .filter(Boolean)
    .map((value) => new Date(value).getTime())
    .filter((value) => Number.isFinite(value));

  if (dates.length === 0) return null;

  return new Date(Math.max(...dates)).toISOString();
}

async function protectPage() {
  const { data } = await supabaseClient.auth.getSession();

  if (!data.session) {
    window.location.href = "login.html";
  }

  currentUserId = data.session ? data.session.user.id : null;
  return data.session;
}

async function getCurrentClientId(session) {
  const { data: profile, error } = await supabaseClient
    .from("profiles")
    .select("client_id")
    .eq("id", session.user.id)
    .single();

  if (error) {
    console.error("Error loading profile:", error);
    return null;
  }

  return profile.client_id;
}

function setTableMessage(message) {
  document.getElementById("customers-table-body").innerHTML = `
    <tr>
      <td colspan="8">
        <div class="quote-empty-state">
          <strong>${escapeHtml(message)}</strong>
          <span>Submitted quote requests will create customer records automatically.</span>
        </div>
      </td>
    </tr>
  `;
}

async function loadCustomerData() {
  setTableMessage("Loading customers...");

  const [customersResult, requestsResult, quotesResult, notesResult] = await Promise.all([
    supabaseClient
      .from("customers")
      .select("*")
      .eq("client_id", currentClientId)
      .order("updated_at", { ascending: false }),
    supabaseClient
      .from("quote_requests")
      .select("*")
      .eq("client_id", currentClientId)
      .order("created_at", { ascending: false }),
    supabaseClient
      .from("quotes")
      .select("*")
      .eq("client_id", currentClientId)
      .order("created_at", { ascending: false }),
    supabaseClient
      .from("customer_notes")
      .select("*")
      .eq("client_id", currentUserId)
      .order("created_at", { ascending: false })
  ]);

  const error = customersResult.error || requestsResult.error || quotesResult.error || notesResult.error;

  if (error) {
    console.error("Error loading customers:", {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
      raw: error
    });
    setTableMessage("Could not load customers. Run the Customers SQL, then refresh.");
    return;
  }

  customers = customersResult.data || [];
  quoteRequests = requestsResult.data || [];
  quotes = quotesResult.data || [];
  customerNotes = notesResult.data || [];
  renderCustomers();
}

function getCustomerStats(customerId) {
  const requests = quoteRequests.filter((request) => String(request.customer_id) === String(customerId));
  const customerQuotes = quotes.filter((quote) => String(quote.customer_id) === String(customerId));
  const notes = customerNotes.filter((note) => String(note.customer_id) === String(customerId));
  const latestActivity = latestDate([
    ...requests.map((request) => request.created_at),
    ...customerQuotes.map((quote) => quote.updated_at || quote.created_at),
    ...notes.map((note) => note.created_at)
  ]);

  return {
    requests,
    customerQuotes,
    notes,
    latestActivity
  };
}

function renderCustomers() {
  const searchTerm = document.getElementById("customer-search").value.toLowerCase();
  const tableBody = document.getElementById("customers-table-body");
  const filteredCustomers = customers.filter((customer) => {
    return (
      (customer.name || "").toLowerCase().includes(searchTerm) ||
      (customer.phone || "").toLowerCase().includes(searchTerm) ||
      (customer.email || "").toLowerCase().includes(searchTerm) ||
      (customer.address || "").toLowerCase().includes(searchTerm) ||
      (customer.status || "").toLowerCase().includes(searchTerm)
    );
  });

  if (filteredCustomers.length === 0) {
    setTableMessage("No customers match your search.");
    return;
  }

  tableBody.innerHTML = "";

  filteredCustomers.forEach((customer) => {
    const { requests, customerQuotes, latestActivity } = getCustomerStats(customer.id);
    const status = getCustomerStatus(customer, requests, customerQuotes);

    tableBody.innerHTML += `
      <tr class="customer-row" data-customer-id="${customer.id}">
        <td>
          <strong class="quote-customer-name">${escapeHtml(customer.name || "Unknown Customer")}</strong>
          <span class="quote-customer-meta">${escapeHtml(customer.id)}</span>
        </td>
        <td>${escapeHtml(customer.phone || "-")}</td>
        <td>${escapeHtml(customer.email || "-")}</td>
        <td>${escapeHtml(customer.address || "-")}</td>
        <td>${requests.length}</td>
        <td>${customerQuotes.length}</td>
        <td>${formatDate(latestActivity || customer.updated_at || customer.created_at)}</td>
        <td>${escapeHtml(status)}</td>
      </tr>
    `;
  });
}

function renderMiniList(elementId, items, emptyMessage, renderItem) {
  const element = document.getElementById(elementId);

  if (items.length === 0) {
    element.innerHTML = `<div class="customer-empty-mini">${escapeHtml(emptyMessage)}</div>`;
    return;
  }

  element.innerHTML = items.map(renderItem).join("");
}

function buildTimeline(customer, requests, customerQuotes, notes) {
  return [
    ...requests.map((request) => ({
      date: request.created_at,
      title: "Quote request submitted",
      detail: request.service_requested || request.problem_description || "New request"
    })),
    ...customerQuotes.map((quote) => ({
      date: quote.updated_at || quote.created_at,
      title: `Quote ${quote.status || "draft"}`,
      detail: `${formatCurrency(quote.grand_total)} total`
    })),
    ...notes.map((note) => ({
      date: note.created_at,
      title: "Note added",
      detail: note.note
    })),
    {
      date: customer.created_at,
      title: "Customer created",
      detail: customer.name || "Customer record created"
    }
  ]
    .filter((item) => item.date)
    .sort((a, b) => new Date(b.date) - new Date(a.date));
}

function openCustomerDetails(customerId) {
  const customer = customers.find((item) => String(item.id) === String(customerId));

  if (!customer) return;

  selectedCustomerId = customer.id;
  const { requests, customerQuotes, notes, latestActivity } = getCustomerStats(customer.id);
  const status = getCustomerStatus(customer, requests, customerQuotes);

  document.getElementById("customer-detail-name").textContent = customer.name || "Unknown Customer";
  document.getElementById("customer-detail-phone").textContent = customer.phone || "-";
  document.getElementById("customer-detail-email").textContent = customer.email || "-";
  document.getElementById("customer-detail-status").textContent = status;
  document.getElementById("customer-detail-latest").textContent =
    formatDate(latestActivity || customer.updated_at || customer.created_at);
  document.getElementById("customer-detail-address").textContent = customer.address || "-";
  document.getElementById("customer-note-input").value = "";

  renderMiniList(
    "customer-requests-list",
    requests,
    "No quote requests yet.",
    (request) => `
      <article class="customer-mini-item">
        <strong>${escapeHtml(request.service_requested || "Quote request")}</strong>
        <span>${escapeHtml(request.status || "new")} | ${formatDate(request.created_at)}</span>
        <p>${escapeHtml(request.problem_description || "")}</p>
      </article>
    `
  );

  renderMiniList(
    "customer-quotes-list",
    customerQuotes,
    "No quotes yet.",
    (quote) => `
      <article class="customer-mini-item">
        <strong>${formatCurrency(quote.grand_total)}</strong>
        <span>${escapeHtml(quote.status || "draft")} | ${formatDate(quote.updated_at || quote.created_at)}</span>
        <p>${escapeHtml(quote.service_requested || "")}</p>
      </article>
    `
  );

  renderMiniList(
    "customer-notes-list",
    notes,
    "No notes yet.",
    (note) => `
      <article class="customer-mini-item">
        <strong>${formatDate(note.created_at)}</strong>
        <p>${escapeHtml(note.note)}</p>
      </article>
    `
  );

  const timeline = buildTimeline(customer, requests, customerQuotes, notes);
  renderMiniList(
    "customer-timeline-list",
    timeline,
    "No activity yet.",
    (item) => `
      <article class="customer-timeline-item">
        <span>${formatDate(item.date)}</span>
        <strong>${escapeHtml(item.title)}</strong>
        <p>${escapeHtml(item.detail || "")}</p>
      </article>
    `
  );

  document.getElementById("customer-modal").classList.add("open");
}

async function addCustomerNote(event) {
  event.preventDefault();

  if (!selectedCustomerId) return;

  const noteInput = document.getElementById("customer-note-input");
  const note = noteInput.value.trim();

  if (!note) return;

  const submitButton = event.target.querySelector("button[type='submit']");
  submitButton.disabled = true;
  submitButton.textContent = "Adding...";

  const { error } = await supabaseClient
    .from("customer_notes")
    .insert({
      client_id: currentUserId,
      customer_id: selectedCustomerId,
      note
    });

  submitButton.disabled = false;
  submitButton.textContent = "Add Note";

  if (error) {
    console.error("Error adding customer note:", {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
      raw: error
    });
    alert("Could not add note.");
    return;
  }

  await loadCustomerData();
  openCustomerDetails(selectedCustomerId);
}

document.getElementById("customer-search").addEventListener("input", renderCustomers);

document.getElementById("customers-table-body").addEventListener("click", function (event) {
  const row = event.target.closest(".customer-row");

  if (!row) return;

  openCustomerDetails(row.dataset.customerId);
});

document.getElementById("customer-note-form").addEventListener("submit", addCustomerNote);

document.getElementById("customer-modal-close").addEventListener("click", function () {
  document.getElementById("customer-modal").classList.remove("open");
});

document.getElementById("customer-modal").addEventListener("click", function (event) {
  if (event.target.id === "customer-modal") {
    document.getElementById("customer-modal").classList.remove("open");
  }
});

const logoutButton = document.getElementById("logout-button");

if (logoutButton) {
  logoutButton.addEventListener("click", async function () {
    await supabaseClient.auth.signOut();
    window.location.href = "login.html";
  });
}

async function initCustomersPage() {
  const session = await protectPage();

  if (!session) return;

  currentClientId = await getCurrentClientId(session);

  if (!currentClientId) return;

  await loadCustomerData();
}

initCustomersPage();
