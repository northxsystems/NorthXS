let currentClientId = null;
let currentUserId = null;
let allQuoteRequests = [];
let allQuoteFollowUps = [];
let quoteFollowUpColumnsAvailable = true;
let selectedQuoteId = null;
let selectedQuoteRequest = null;
let selectedSavedQuoteId = null;
let quotePdfSettings = {};
let useDefaultTaxRate = false;

const quoteStatuses = [
  { value: "new", label: "New", className: "new" },
  { value: "reviewing", label: "Contacted", className: "contacted" },
  { value: "quote_sent", label: "Quoted", className: "quoted" },
  { value: "booked", label: "Won", className: "booked" },
  { value: "lost", label: "Lost", className: "lost" }
];

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function getQuoteStatus(status) {
  return quoteStatuses.find((item) => item.value === status) || quoteStatuses[0];
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

function toMoney(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function sanitizeFileName(value) {
  return String(value || "quote")
    .replace(/[^a-z0-9-]+/gi, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
}

function standardQuoteTerms() {
  return "This quote is valid for 30 days from the created date. Work may be scheduled after written approval. Material pricing and scope may change if site conditions differ from the information provided.";
}

function getPdfSetting(key, fallback = "") {
  return quotePdfSettings && quotePdfSettings[key] ? quotePdfSettings[key] : fallback;
}

function hexToRgb(hex, fallback = [79, 140, 255]) {
  const normalized = String(hex || "").trim().replace("#", "");

  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) {
    return fallback;
  }

  return [
    parseInt(normalized.slice(0, 2), 16),
    parseInt(normalized.slice(2, 4), 16),
    parseInt(normalized.slice(4, 6), 16)
  ];
}

async function protectPage() {
  const { data } = await supabaseClient.auth.getSession();

  if (!data.session) {
    window.location.href = "login.html";
  }
}

async function getCurrentClientId() {
  const { data: sessionData } = await supabaseClient.auth.getSession();
  const userId = sessionData.session.user.id;
  currentUserId = userId;

  const { data: profile, error } = await supabaseClient
    .from("profiles")
    .select("client_id")
    .eq("id", userId)
    .single();

  if (error) {
    console.error("Error loading profile:", error);
    return null;
  }

  return profile.client_id;
}

async function createCustomerTimelineEvent(event) {
  if (!currentUserId) return;

  const { error } = await supabaseClient
    .from("customer_timeline")
    .insert({
      client_id: currentUserId,
      customer_id: event.customer_id || null,
      lead_id: event.lead_id || null,
      quote_request_id: event.quote_request_id || null,
      event_type: event.event_type,
      event_title: event.event_title,
      event_description: event.event_description
    });

  if (error) {
    console.warn("Could not add customer timeline event:", {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code
    });
  }
}

async function loadQuotePdfSettings() {
  const { data, error } = await supabaseClient
    .from("client_quote_pdf_settings")
    .select("*")
    .eq("client_id", currentClientId)
    .maybeSingle();

  if (error) {
    console.error("Error loading quote PDF settings:", {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
      raw: error
    });
    quotePdfSettings = {};
    return;
  }

  quotePdfSettings = data || {};
}

function setTableMessage(message) {
  const tableBody = document.getElementById("quote-table-body");

  tableBody.innerHTML = `
    <tr>
      <td colspan="7">
        <div class="quote-empty-state">
          <strong>${escapeHtml(message)}</strong>
          <span>New customer submissions will appear here automatically.</span>
        </div>
      </td>
    </tr>
  `;
}

async function loadQuoteRequests() {
  setTableMessage("Loading quote requests...");

  const { data, error } = await supabaseClient
    .from("quote_requests")
    .select("*")
    .eq("client_id", currentClientId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error loading quote requests:", error);
    setTableMessage("Could not load quote requests.");
    return;
  }

  allQuoteRequests = data || [];
  updateQuoteStats(allQuoteRequests);
  applyQuoteFilters();
}

function countByStatus(quotes, status) {
  return quotes.filter((quote) => (quote.status || "new") === status).length;
}

function updateQuoteStats(quotes) {
  document.getElementById("new-quotes").textContent = countByStatus(quotes, "new");
  document.getElementById("contacted-quotes").textContent = countByStatus(quotes, "reviewing");
  document.getElementById("quoted-quotes").textContent = countByStatus(quotes, "quote_sent");
  document.getElementById("won-quotes").textContent = countByStatus(quotes, "booked");
  document.getElementById("lost-quotes").textContent = countByStatus(quotes, "lost");
}

function renderStatusBadge(status) {
  const statusMeta = getQuoteStatus(status);
  return `<span class="badge quote-badge ${statusMeta.className}">${statusMeta.label}</span>`;
}

function getQuoteFollowUps(quoteRequestId) {
  return allQuoteFollowUps.filter(
    (message) => String(message.quote_request_id) === String(quoteRequestId)
  );
}

function getLatestQuoteFollowUp(quoteRequestId) {
  return getQuoteFollowUps(quoteRequestId)[0] || null;
}

function getPendingQuoteFollowUp(quoteRequestId) {
  return getQuoteFollowUps(quoteRequestId).find((message) => message.status === "pending") || null;
}

function getFollowUpStatusMeta(quote) {
  if ((quote.status || "new") === "booked") {
    return { label: "Won", className: "won" };
  }

  if ((quote.status || "new") === "lost") {
    return { label: "Lost", className: "lost" };
  }

  const followUp = getLatestQuoteFollowUp(quote.id);

  if (followUp && followUp.status === "sent") {
    return { label: "Followed up", className: "followed" };
  }

  if (followUp && followUp.status === "pending") {
    return { label: "Follow-up scheduled", className: "scheduled" };
  }

  return { label: "No follow-up scheduled", className: "none" };
}

function renderFollowUpBadge(quote) {
  const followUpMeta = getFollowUpStatusMeta(quote);
  return `<span class="badge follow-up-badge ${followUpMeta.className}">${followUpMeta.label}</span>`;
}

function renderStatusButtons(quote) {
  const currentStatus = quote.status || "new";

  return quoteStatuses
    .filter((status) => status.value !== currentStatus && !["booked", "lost"].includes(status.value))
    .map((status) => `
      <button
        type="button"
        class="quote-inline-status"
        data-quote-id="${quote.id}"
        data-status="${status.value}"
      >
        ${status.label}
      </button>
    `)
    .join("");
}

function renderFollowUpButtons(quote) {
  if (!quoteFollowUpColumnsAvailable) {
    return "";
  }

  const pendingFollowUp = getPendingQuoteFollowUp(quote.id);
  const isClosed = ["booked", "lost"].includes(quote.status || "new");

  if (pendingFollowUp) {
    return `
      <button
        type="button"
        class="quote-follow-up-action cancel"
        data-quote-id="${quote.id}"
        data-follow-up-id="${pendingFollowUp.id}"
        data-action="cancel-follow-up"
      >
        Cancel Follow-Up
      </button>
    `;
  }

  return `
    <button
      type="button"
      class="quote-follow-up-action"
      data-quote-id="${quote.id}"
      data-action="schedule-follow-up"
      ${isClosed ? "disabled" : ""}
    >
      Schedule Follow-Up
    </button>
  `;
}

function renderQuoteRequests(quotes) {
  const tableBody = document.getElementById("quote-table-body");

  if (quotes.length === 0) {
    setTableMessage("No quote requests match your filters.");
    return;
  }

  tableBody.innerHTML = "";

  quotes.forEach((quote) => {
    const serviceRequested = quote.service_requested || "-";

    const row = `
      <tr class="quote-row" data-quote-id="${quote.id}">
        <td>
          <strong class="quote-customer-name">${escapeHtml(quote.customer_name || "Unknown Customer")}</strong>
          <span class="quote-customer-meta">${escapeHtml(quote.email || "No email provided")}</span>
        </td>
        <td>${escapeHtml(quote.phone || "-")}</td>
        <td>${escapeHtml(serviceRequested)}</td>
        <td>${renderStatusBadge(quote.status)}</td>
        <td>${renderFollowUpBadge(quote)}</td>
        <td>${formatDate(quote.created_at)}</td>
        <td>
          <div class="quote-row-actions">
            <div class="quote-primary-actions">
              <button class="view-quote-btn" type="button" data-quote-id="${quote.id}">View</button>
              <button class="create-row-quote-btn" type="button" data-quote-id="${quote.id}">Create Quote</button>
            </div>
            <div class="quote-quick-actions">
              <button
                type="button"
                class="quote-inline-status"
                data-quote-id="${quote.id}"
                data-status="booked"
                ${quote.status === "booked" ? "disabled" : ""}
              >
                Mark Won
              </button>
              <button
                type="button"
                class="quote-inline-status lost"
                data-quote-id="${quote.id}"
                data-status="lost"
                ${quote.status === "lost" ? "disabled" : ""}
              >
                Mark Lost
              </button>
              ${renderFollowUpButtons(quote)}
            </div>
            <div class="quote-quick-actions">${renderStatusButtons(quote)}</div>
          </div>
        </td>
      </tr>
    `;

    tableBody.innerHTML += row;
  });
}

async function loadQuoteFollowUps() {
  const { data, error } = await supabaseClient
    .from("scheduled_messages")
    .select("*")
    .eq("client_id", currentClientId)
    .eq("message_type", "quote_follow_up")
    .order("send_at", { ascending: false });

  if (error) {
    quoteFollowUpColumnsAvailable = false;
    allQuoteFollowUps = [];
    console.warn("Quote follow-up fields are not available on scheduled_messages:", {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code
    });
    return;
  }

  quoteFollowUpColumnsAvailable = true;
  allQuoteFollowUps = data || [];
}

function buildQuoteFollowUpMessage(quote) {
  const customerName = quote.customer_name || "there";
  const companyName = getPdfSetting("company_display_name", "NorthX Systems");
  return `Hey ${customerName}, just checking in on your quote from ${companyName}. Did you want to move forward?`;
}

async function scheduleQuoteFollowUp(quote, options = {}) {
  if (!quote || !quote.phone) {
    if (!options.silent) alert("This quote request needs a customer phone number first.");
    return null;
  }

  if (!quoteFollowUpColumnsAvailable) {
    if (!options.silent) {
      alert("Quote follow-up scheduling needs the scheduled_messages migration notes applied first.");
    }
    return null;
  }

  const existingPending = getPendingQuoteFollowUp(quote.id);

  if (existingPending) {
    return existingPending;
  }

  const sendAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const payload = {
    client_id: currentClientId,
    phone: quote.phone,
    customer_name: quote.customer_name || null,
    quote_request_id: quote.id,
    message: buildQuoteFollowUpMessage(quote),
    status: "pending",
    send_at: sendAt,
    message_type: "quote_follow_up"
  };

  const { data, error } = await supabaseClient
    .from("scheduled_messages")
    .insert(payload)
    .select()
    .single();

  if (error) {
    console.error("Error scheduling quote follow-up:", {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
      raw: error
    });

    if (!options.silent) alert("Could not schedule quote follow-up.");
    return null;
  }

  allQuoteFollowUps = [data, ...allQuoteFollowUps];
  await createCustomerTimelineEvent({
    customer_id: quote.customer_id,
    quote_request_id: quote.id,
    event_type: "follow_up_scheduled",
    event_title: "Follow-Up Scheduled",
    event_description: "follow-up SMS was scheduled for the customer"
  });
  applyQuoteFilters();
  return data;
}

async function scheduleQuoteFollowUpById(quoteId) {
  const quote = allQuoteRequests.find((item) => String(item.id) === String(quoteId));
  const followUp = await scheduleQuoteFollowUp(quote);

  if (followUp) {
    alert("Follow-up scheduled for 24 hours from now.");
  }
}

async function cancelQuoteFollowUp(followUpId) {
  const confirmCancel = confirm("Cancel this quote follow-up SMS?");

  if (!confirmCancel) return;

  const { error } = await supabaseClient
    .from("scheduled_messages")
    .update({ status: "cancelled" })
    .eq("id", followUpId)
    .eq("client_id", currentClientId)
    .eq("message_type", "quote_follow_up");

  if (error) {
    console.error("Error cancelling quote follow-up:", error);
    alert("Could not cancel quote follow-up.");
    return;
  }

  await loadQuoteFollowUps();
  applyQuoteFilters();
}

async function updateQuoteStatus(quoteId, newStatus) {
  const { error } = await supabaseClient
    .from("quote_requests")
    .update({ status: newStatus })
    .eq("id", quoteId)
    .eq("client_id", currentClientId);

  if (error) {
    console.error("Error updating quote status:", error);
    alert("Could not update quote status.");
    return;
  }

  if (["booked", "lost"].includes(newStatus)) {
    const pendingFollowUp = getPendingQuoteFollowUp(quoteId);

    if (pendingFollowUp) {
      await supabaseClient
        .from("scheduled_messages")
        .update({ status: "cancelled" })
        .eq("id", pendingFollowUp.id)
        .eq("client_id", currentClientId)
        .eq("message_type", "quote_follow_up");
    }
  }

  await loadQuoteRequests();

  if (selectedQuoteId && String(selectedQuoteId) === String(quoteId)) {
    openQuoteDetails(quoteId);
  }
}

function applyQuoteFilters() {
  const searchTerm = document.getElementById("quote-search").value.toLowerCase();
  const selectedFilter = document.getElementById("quote-filter").value;

  const filtered = allQuoteRequests.filter((quote) => {
    const statusMeta = getQuoteStatus(quote.status);
    const matchesSearch =
      (quote.customer_name || "").toLowerCase().includes(searchTerm) ||
      (quote.phone || "").toLowerCase().includes(searchTerm) ||
      (quote.email || "").toLowerCase().includes(searchTerm) ||
      (quote.trade || "").toLowerCase().includes(searchTerm) ||
      (quote.service_requested || "").toLowerCase().includes(searchTerm) ||
      (quote.problem_description || "").toLowerCase().includes(searchTerm) ||
      statusMeta.label.toLowerCase().includes(searchTerm);

    const matchesFilter =
      selectedFilter === "All" || (quote.status || "new") === selectedFilter;

    return matchesSearch && matchesFilter;
  });

  renderQuoteRequests(filtered);
}

function openQuoteDetails(quoteId) {
  const quote = allQuoteRequests.find((item) => String(item.id) === String(quoteId));

  if (!quote) return;

  selectedQuoteId = quote.id;
  selectedQuoteRequest = quote;

  document.getElementById("modal-quote-name").textContent =
    quote.customer_name || "Unknown Customer";
  document.getElementById("modal-quote-phone").textContent = quote.phone || "-";
  document.getElementById("modal-quote-email").textContent = quote.email || "-";
  document.getElementById("modal-quote-trade").textContent = quote.trade || "-";
  document.getElementById("modal-quote-job").textContent = quote.service_requested || "-";
  document.getElementById("modal-quote-urgency").textContent = quote.urgency || "-";
  document.getElementById("modal-quote-status").textContent = getQuoteStatus(quote.status).label;
  document.getElementById("modal-quote-address").textContent = quote.address || "-";
  document.getElementById("modal-quote-description").textContent =
    quote.problem_description || "-";

  document.querySelectorAll(".quote-status-action").forEach((button) => {
    button.disabled = button.dataset.status === (quote.status || "new");
  });

  document.getElementById("quote-modal").classList.add("open");
}

function createLineItem(item = {}) {
  const lineItem = document.createElement("div");
  lineItem.className = "quote-line-item";

  lineItem.innerHTML = `
    <input class="line-description" type="text" placeholder="Description" value="${escapeHtml(item.description || "")}" required />
    <input class="line-quantity" type="number" min="0" step="0.01" value="${item.quantity || 1}" required />
    <input class="line-unit-price" type="number" min="0" step="0.01" value="${item.unit_price || 0}" required />
    <strong class="line-total">$0.00</strong>
    <button type="button" class="remove-line-item">Remove</button>
  `;

  document.getElementById("quote-line-items").appendChild(lineItem);
  updateQuoteBuilderTotals();
}

function getLineItems() {
  return Array.from(document.querySelectorAll(".quote-line-item")).map((item) => {
    const description = item.querySelector(".line-description").value.trim();
    const quantity = toMoney(item.querySelector(".line-quantity").value);
    const unitPrice = toMoney(item.querySelector(".line-unit-price").value);
    const total = toMoney(quantity * unitPrice);

    return {
      description,
      quantity,
      unit_price: unitPrice,
      total
    };
  });
}

function getQuotePayload(statusOverride) {
  const lineItems = getLineItems().filter((item) => item.description);

  if (lineItems.length === 0) {
    throw new Error("Add at least one line item before saving.");
  }

  const totals = updateQuoteBuilderTotals();
  const quoteId = selectedSavedQuoteId || crypto.randomUUID();

  return {
    id: quoteId,
    quote_request_id: selectedQuoteRequest.id,
    customer_id: selectedQuoteRequest.customer_id || null,
    client_id: currentClientId,
    customer_name: selectedQuoteRequest.customer_name || null,
    phone: selectedQuoteRequest.phone || null,
    email: selectedQuoteRequest.email || null,
    service_requested: selectedQuoteRequest.service_requested || null,
    problem_description: selectedQuoteRequest.problem_description || null,
    line_items: lineItems,
    subtotal: totals.subtotal,
    tax: totals.tax,
    grand_total: totals.grandTotal,
    status: statusOverride || document.getElementById("builder-status").value
  };
}

function updateQuoteBuilderTotals() {
  let subtotal = 0;

  document.querySelectorAll(".quote-line-item").forEach((item) => {
    const quantity = toMoney(item.querySelector(".line-quantity").value);
    const unitPrice = toMoney(item.querySelector(".line-unit-price").value);
    const total = toMoney(quantity * unitPrice);

    subtotal += total;
    item.querySelector(".line-total").textContent = formatCurrency(total);
  });

  const defaultTaxRate = Number(quotePdfSettings.default_tax_rate);

  if (useDefaultTaxRate && Number.isFinite(defaultTaxRate)) {
    document.getElementById("builder-tax").value = toMoney(subtotal * (defaultTaxRate / 100));
  }

  const tax = toMoney(document.getElementById("builder-tax").value);
  const grandTotal = toMoney(subtotal + tax);

  document.getElementById("builder-subtotal").textContent = formatCurrency(subtotal);
  document.getElementById("builder-tax-total").textContent = formatCurrency(tax);
  document.getElementById("builder-grand-total").textContent = formatCurrency(grandTotal);

  return {
    subtotal: toMoney(subtotal),
    tax,
    grandTotal
  };
}

async function loadExistingQuoteForRequest(quoteRequestId) {
  const { data, error } = await supabaseClient
    .from("quotes")
    .select("*")
    .eq("quote_request_id", quoteRequestId)
    .eq("client_id", currentClientId)
    .order("created_at", { ascending: false })
    .limit(1);

  if (error) {
    console.error("Error loading existing quote:", {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
      raw: error
    });
    return null;
  }

  return data && data.length > 0 ? data[0] : null;
}

async function openQuoteBuilder(quoteId = selectedQuoteId) {
  const quote = allQuoteRequests.find((item) => String(item.id) === String(quoteId));

  if (!quote) return;

  selectedQuoteId = quote.id;
  selectedQuoteRequest = quote;

  document.getElementById("builder-customer-name").textContent =
    quote.customer_name || "Unknown Customer";
  document.getElementById("builder-phone").textContent = quote.phone || "-";
  document.getElementById("builder-email").textContent = quote.email || "-";
  document.getElementById("builder-service").textContent =
    quote.service_requested || "-";
  document.getElementById("builder-problem-description").textContent =
    quote.problem_description || "-";

  const existingQuote = await loadExistingQuoteForRequest(quote.id);
  selectedSavedQuoteId = existingQuote ? existingQuote.id : null;
  document.getElementById("builder-status").value = existingQuote ? existingQuote.status : "draft";
  useDefaultTaxRate = !existingQuote && quotePdfSettings.default_tax_rate !== null &&
    quotePdfSettings.default_tax_rate !== undefined &&
    quotePdfSettings.default_tax_rate !== "";
  document.getElementById("builder-tax").value = existingQuote ? existingQuote.tax : "0";
  document.getElementById("download-pdf-button").disabled = false;
  document.getElementById("quote-line-items").innerHTML = "";

  const savedLineItems = existingQuote && Array.isArray(existingQuote.line_items)
    ? existingQuote.line_items
    : [];
  const lineItems = savedLineItems.length > 0
    ? savedLineItems
    : [{
      description: quote.service_requested || "Service work",
      quantity: 1,
      unit_price: 0
    }];

  lineItems.forEach((item) => createLineItem(item));

  document.getElementById("quote-modal").classList.remove("open");
  document.getElementById("quote-builder-modal").classList.add("open");
}

async function saveQuoteRecord(options = {}) {
  if (!selectedQuoteRequest) return;

  let payload;

  try {
    payload = getQuotePayload(options.statusOverride);
  } catch (error) {
    alert(error.message);
    return null;
  }

  const saveButton = document.querySelector(".quote-save-btn");
  const downloadButton = document.getElementById("download-pdf-button");
  const isExistingQuote = Boolean(selectedSavedQuoteId);

  saveButton.disabled = true;
  saveButton.textContent = "Saving Quote...";
  downloadButton.disabled = true;

  const query = supabaseClient.from("quotes");
  const { id, ...updatePayload } = payload;
  const { error } = isExistingQuote
    ? await query
      .update({ ...updatePayload, updated_at: new Date().toISOString() })
      .eq("id", selectedSavedQuoteId)
      .eq("client_id", currentClientId)
    : await query.insert(payload);

  saveButton.disabled = false;
  saveButton.textContent = "Save Quote";
  downloadButton.disabled = false;

  if (error) {
    console.error("Error saving quote:", {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
      raw: error
    });
    alert("Could not save quote. Check the quotes table setup.");
    return null;
  }

  selectedSavedQuoteId = payload.id;
  document.getElementById("builder-status").value = payload.status;

  return payload;
}

async function saveBuiltQuote(event) {
  event.preventDefault();

  const quote = await saveQuoteRecord();

  if (quote) {
    alert("Quote saved.");
  }
}

function addWrappedText(doc, text, x, y, maxWidth, lineHeight) {
  const lines = doc.splitTextToSize(text || "-", maxWidth);
  doc.text(lines, x, y);
  return y + lines.length * lineHeight;
}

function loadImageDataUrl(url) {
  return new Promise((resolve) => {
    if (!url) {
      resolve(null);
      return;
    }

    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        const maxWidth = 260;
        const scale = Math.min(1, maxWidth / image.width);
        canvas.width = image.width * scale;
        canvas.height = image.height * scale;
        const context = canvas.getContext("2d");
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve({
          dataUrl: canvas.toDataURL("image/png"),
          width: canvas.width,
          height: canvas.height
        });
      } catch (error) {
        console.warn("Could not render logo in quote PDF:", error);
        resolve(null);
      }
    };
    image.onerror = () => resolve(null);
    image.src = url;
  });
}

async function generateQuotePdf(quote) {
  if (!window.jspdf || !window.jspdf.jsPDF) {
    alert("PDF generator did not load. Check your connection and try again.");
    return;
  }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 48;
  const contentWidth = pageWidth - margin * 2;
  const createdDate = formatDate(new Date().toISOString());
  const quoteNumber = String(quote.id).slice(0, 8).toUpperCase();
  const companyName = getPdfSetting("company_display_name", "NorthX Systems");
  const businessPhone = getPdfSetting("business_phone");
  const businessEmail = getPdfSetting("business_email");
  const website = getPdfSetting("website");
  const businessAddress = getPdfSetting("business_address");
  const terms = getPdfSetting("default_quote_terms", standardQuoteTerms());
  const accentColor = hexToRgb(getPdfSetting("pdf_accent_color", "#4f8cff"));
  const logo = await loadImageDataUrl(getPdfSetting("logo_url"));

  function ensureSpace(y, needed = 72) {
    if (y + needed <= pageHeight - margin) return y;
    doc.addPage();
    return margin;
  }

  doc.setFillColor(8, 13, 23);
  doc.rect(0, 0, pageWidth, 116, "F");
  doc.setFillColor(accentColor[0], accentColor[1], accentColor[2]);
  doc.rect(0, 112, pageWidth, 4, "F");
  doc.setTextColor(255, 255, 255);

  if (logo) {
    const logoWidth = Math.min(112, logo.width);
    const logoHeight = logo.height * (logoWidth / logo.width);
    doc.addImage(logo.dataUrl, "PNG", margin, 30, logoWidth, Math.min(44, logoHeight));
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(logo ? 16 : 22);
  doc.text(companyName, margin, logo ? 88 : 54);
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text("Professional Service Quote", margin, logo ? 104 : 76);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("QUOTE", pageWidth - margin, 54, { align: "right" });
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(`#${quoteNumber}`, pageWidth - margin, 74, { align: "right" });
  doc.text(createdDate, pageWidth - margin, 90, { align: "right" });
  doc.setFontSize(7);
  doc.text(`ID: ${quote.id}`, pageWidth - margin, 104, { align: "right" });

  let y = 152;
  const contactLines = [
    businessPhone,
    businessEmail,
    website,
    businessAddress
  ].filter(Boolean);

  if (contactLines.length > 0) {
    doc.setTextColor(51, 65, 85);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    y = addWrappedText(doc, contactLines.join(" | "), margin, y, contentWidth, 12) + 22;
  }

  doc.setTextColor(15, 23, 42);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("Customer", margin, y);
  doc.text("Service", margin + contentWidth / 2, y);

  y += 20;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(51, 65, 85);
  doc.text(quote.customer_name || "-", margin, y);
  doc.text(quote.service_requested || "-", margin + contentWidth / 2, y);
  y += 16;
  doc.text(quote.phone || "-", margin, y);
  y += 16;
  doc.text(quote.email || "-", margin, y);

  y += 38;
  doc.setFont("helvetica", "bold");
  doc.setTextColor(15, 23, 42);
  doc.text("Problem Description", margin, y);
  y += 18;
  doc.setFont("helvetica", "normal");
  doc.setTextColor(51, 65, 85);
  y = addWrappedText(doc, quote.problem_description || "-", margin, y, contentWidth, 14) + 24;

  y = ensureSpace(y, 120);
  doc.setFillColor(241, 245, 249);
  doc.roundedRect(margin, y, contentWidth, 28, 4, 4, "F");
  doc.setFillColor(accentColor[0], accentColor[1], accentColor[2]);
  doc.roundedRect(margin, y, 5, 28, 4, 4, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(15, 23, 42);
  doc.text("Description", margin + 12, y + 18);
  doc.text("Qty", pageWidth - 210, y + 18, { align: "right" });
  doc.text("Unit Price", pageWidth - 128, y + 18, { align: "right" });
  doc.text("Total", pageWidth - margin - 12, y + 18, { align: "right" });
  y += 44;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(51, 65, 85);

  quote.line_items.forEach((item) => {
    y = ensureSpace(y, 48);
    const descriptionLines = doc.splitTextToSize(item.description || "-", contentWidth - 250);
    doc.text(descriptionLines, margin + 12, y);
    doc.text(String(item.quantity || 0), pageWidth - 210, y, { align: "right" });
    doc.text(formatCurrency(item.unit_price), pageWidth - 128, y, { align: "right" });
    doc.text(formatCurrency(item.total), pageWidth - margin - 12, y, { align: "right" });
    y += Math.max(28, descriptionLines.length * 14 + 10);
    doc.setDrawColor(226, 232, 240);
    doc.line(margin, y - 8, pageWidth - margin, y - 8);
  });

  y = ensureSpace(y + 12, 120);
  const totalsX = pageWidth - margin - 220;
  doc.setFont("helvetica", "normal");
  doc.setTextColor(51, 65, 85);
  doc.text("Subtotal", totalsX, y);
  doc.text(formatCurrency(quote.subtotal), pageWidth - margin, y, { align: "right" });
  y += 22;
  doc.text("Tax", totalsX, y);
  doc.text(formatCurrency(quote.tax), pageWidth - margin, y, { align: "right" });
  y += 26;
  doc.setDrawColor(203, 213, 225);
  doc.line(totalsX, y - 12, pageWidth - margin, y - 12);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(accentColor[0], accentColor[1], accentColor[2]);
  doc.text("Grand Total", totalsX, y);
  doc.text(formatCurrency(quote.grand_total), pageWidth - margin, y, { align: "right" });

  y = ensureSpace(y + 52, 120);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text("Terms", margin, y);
  y += 18;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(71, 85, 105);
  addWrappedText(
    doc,
    terms,
    margin,
    y,
    contentWidth,
    13
  );

  const fileName = `${sanitizeFileName(quote.customer_name)}-${quoteNumber}-northx-quote.pdf`;
  doc.save(fileName);
}

async function downloadQuotePdf() {
  if (!selectedQuoteRequest) return;

  const downloadButton = document.getElementById("download-pdf-button");
  downloadButton.disabled = true;
  downloadButton.textContent = "Preparing PDF...";

  const quote = await saveQuoteRecord({ statusOverride: "sent" });

  if (!quote) {
    downloadButton.textContent = "Download PDF";
    downloadButton.disabled = false;
    return;
  }

  const { error: requestStatusError } = await supabaseClient
    .from("quote_requests")
    .update({ status: "quote_sent" })
    .eq("id", selectedQuoteRequest.id)
    .eq("client_id", currentClientId);

  downloadButton.textContent = "Download PDF";
  downloadButton.disabled = false;

  if (requestStatusError) {
    console.error("Error marking quote request quoted:", {
      message: requestStatusError.message,
      details: requestStatusError.details,
      hint: requestStatusError.hint,
      code: requestStatusError.code,
      raw: requestStatusError
    });
    alert("Quote was saved, but the related request could not be marked quoted.");
    return;
  }

  const followUp = await scheduleQuoteFollowUp(selectedQuoteRequest, { silent: true });

  await createCustomerTimelineEvent({
    customer_id: selectedQuoteRequest.customer_id,
    quote_request_id: selectedQuoteRequest.id,
    event_type: "quote_sent",
    event_title: "Quote Sent",
    event_description: "quote was sent to the customer"
  });

  await generateQuotePdf(quote);
  await loadQuoteRequests();
  selectedQuoteRequest = allQuoteRequests.find(
    (item) => String(item.id) === String(quote.quote_request_id)
  ) || selectedQuoteRequest;

  alert(
    followUp
      ? "Quote PDF downloaded, marked as sent, and follow-up scheduled for 24 hours from now."
      : "Quote PDF downloaded and marked as sent. Follow-up scheduling needs the scheduled_messages migration notes applied."
  );
}

document.getElementById("quote-search").addEventListener("input", applyQuoteFilters);
document.getElementById("quote-filter").addEventListener("change", applyQuoteFilters);

document.addEventListener("click", function (event) {
  const inlineStatusButton = event.target.closest(".quote-inline-status");

  if (inlineStatusButton) {
    updateQuoteStatus(inlineStatusButton.dataset.quoteId, inlineStatusButton.dataset.status);
    return;
  }

  const followUpButton = event.target.closest(".quote-follow-up-action");

  if (followUpButton) {
    if (followUpButton.dataset.action === "schedule-follow-up") {
      scheduleQuoteFollowUpById(followUpButton.dataset.quoteId);
      return;
    }

    if (followUpButton.dataset.action === "cancel-follow-up") {
      cancelQuoteFollowUp(followUpButton.dataset.followUpId);
      return;
    }
  }

  const createQuoteButton = event.target.closest(".create-row-quote-btn");

  if (createQuoteButton) {
    openQuoteBuilder(createQuoteButton.dataset.quoteId);
    return;
  }

  const viewButton = event.target.closest(".view-quote-btn");

  if (viewButton) {
    openQuoteDetails(viewButton.dataset.quoteId);
    return;
  }

  const row = event.target.closest(".quote-row");

  if (!row) return;

  window.location.href = `customer-details.html?quote_request_id=${encodeURIComponent(row.dataset.quoteId)}`;
});

document.querySelectorAll(".quote-status-action").forEach((button) => {
  button.addEventListener("click", function () {
    if (!selectedQuoteId) return;
    updateQuoteStatus(selectedQuoteId, this.dataset.status);
  });
});

document.getElementById("create-quote-button").addEventListener("click", function () {
  openQuoteBuilder();
});

document.getElementById("add-line-item").addEventListener("click", function () {
  createLineItem();
});

document.getElementById("quote-line-items").addEventListener("input", function (event) {
  if (
    event.target.classList.contains("line-quantity") ||
    event.target.classList.contains("line-unit-price")
  ) {
    updateQuoteBuilderTotals();
  }
});

document.getElementById("quote-line-items").addEventListener("click", function (event) {
  const removeButton = event.target.closest(".remove-line-item");

  if (!removeButton) return;

  removeButton.closest(".quote-line-item").remove();

  if (document.querySelectorAll(".quote-line-item").length === 0) {
    createLineItem();
    return;
  }

  updateQuoteBuilderTotals();
});

document.getElementById("builder-tax").addEventListener("input", function () {
  useDefaultTaxRate = false;
  updateQuoteBuilderTotals();
});

document.getElementById("quote-builder-form").addEventListener("submit", saveBuiltQuote);

document.getElementById("download-pdf-button").addEventListener("click", downloadQuotePdf);

document.getElementById("quote-modal-close").addEventListener("click", function () {
  document.getElementById("quote-modal").classList.remove("open");
});

document.getElementById("quote-modal").addEventListener("click", function (event) {
  if (event.target.id === "quote-modal") {
    document.getElementById("quote-modal").classList.remove("open");
  }
});

document.getElementById("quote-builder-close").addEventListener("click", function () {
  document.getElementById("quote-builder-modal").classList.remove("open");
});

document.getElementById("quote-builder-modal").addEventListener("click", function (event) {
  if (event.target.id === "quote-builder-modal") {
    document.getElementById("quote-builder-modal").classList.remove("open");
  }
});

const logoutButton = document.getElementById("logout-button");

if (logoutButton) {
  logoutButton.addEventListener("click", async function () {
    await supabaseClient.auth.signOut();
    window.location.href = "login.html";
  });
}

supabaseClient
  .channel("quote-requests-realtime")
  .on(
    "postgres_changes",
    {
      event: "*",
      schema: "public",
      table: "quote_requests"
    },
    function () {
      loadQuoteRequests();
    }
  )
  .subscribe();

supabaseClient
  .channel("quote-follow-ups-realtime")
  .on(
    "postgres_changes",
    {
      event: "*",
      schema: "public",
      table: "scheduled_messages"
    },
    function () {
      loadQuoteFollowUps().then(applyQuoteFilters);
    }
  )
  .subscribe();

async function initQuoteRequestsPage() {
  await protectPage();

  currentClientId = await getCurrentClientId();

  if (!currentClientId) return;

  await loadQuotePdfSettings();
  await loadQuoteFollowUps();
  await loadQuoteRequests();
}

initQuoteRequestsPage();
