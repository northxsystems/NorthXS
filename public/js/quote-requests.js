let currentClientId = null;
let allQuoteRequests = [];

async function protectPage() {
  const { data } = await supabaseClient.auth.getSession();

  if (!data.session) {
    window.location.href = "login.html";
  }
}

async function getCurrentClientId() {
  const { data: sessionData } = await supabaseClient.auth.getSession();
  const userId = sessionData.session.user.id;

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

async function loadQuoteRequests() {
  const tableBody = document.getElementById("quote-table-body");

  tableBody.innerHTML = `
    <tr>
      <td colspan="6" style="text-align:center; padding:40px;">
        Loading quote requests...
      </td>
    </tr>
  `;

  const { data, error } = await supabaseClient
    .from("quote_requests")
    .select("*")
    .eq("client_id", currentClientId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error loading quote requests:", error);
    return;
  }

  allQuoteRequests = data;
  updateQuoteStats(data);
  renderQuoteRequests(data);
}

function updateQuoteStats(quotes) {
  document.getElementById("total-quotes").textContent = quotes.length;

  document.getElementById("new-quotes").textContent =
    quotes.filter((quote) => quote.status === "new").length;

  document.getElementById("sent-quotes").textContent =
    quotes.filter((quote) => quote.status === "quote_sent").length;

  document.getElementById("booked-quotes").textContent =
    quotes.filter((quote) => quote.status === "booked").length;
}

function renderQuoteRequests(quotes) {
  const tableBody = document.getElementById("quote-table-body");

  if (quotes.length === 0) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="6" style="text-align:center; padding:40px;">
          No quote requests found.
        </td>
      </tr>
    `;
    return;
  }

  tableBody.innerHTML = "";

  quotes.forEach((quote) => {
    const badgeClass = getQuoteBadgeClass(quote.status);

    const row = `
      <tr class="quote-row" data-quote-id="${quote.id}">
        <td>${quote.customer_name || "Unknown Customer"}</td>
        <td>${quote.phone || "-"}</td>
        <td>${quote.job_type || "-"}</td>
        <td>${quote.urgency || "-"}</td>
        <td>
          <select class="status-select quote-status-select" data-quote-id="${quote.id}">
            <option value="new" ${quote.status === "new" ? "selected" : ""}>New</option>
            <option value="reviewing" ${quote.status === "reviewing" ? "selected" : ""}>Reviewing</option>
            <option value="quote_sent" ${quote.status === "quote_sent" ? "selected" : ""}>Quote Sent</option>
            <option value="booked" ${quote.status === "booked" ? "selected" : ""}>Booked</option>
            <option value="lost" ${quote.status === "lost" ? "selected" : ""}>Lost</option>
          </select>
        </td>
        <td>${new Date(quote.created_at).toLocaleString()}</td>
      </tr>
    `;

    tableBody.innerHTML += row;
  });
}

function getQuoteBadgeClass(status) {
  if (status === "quote_sent") return "contacted";
  if (status === "booked") return "booked";
  if (status === "lost") return "lost";
  return "new";
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

  await loadQuoteRequests();
}

document.addEventListener("change", function (event) {
  if (event.target.classList.contains("quote-status-select")) {
    const quoteId = event.target.dataset.quoteId;
    const newStatus = event.target.value;

    updateQuoteStatus(quoteId, newStatus);
  }
});

function applyQuoteFilters() {
  const searchTerm = document.getElementById("quote-search").value.toLowerCase();
  const selectedFilter = document.getElementById("quote-filter").value;

  const filtered = allQuoteRequests.filter((quote) => {
    const matchesSearch =
      (quote.customer_name || "").toLowerCase().includes(searchTerm) ||
      (quote.phone || "").toLowerCase().includes(searchTerm) ||
      (quote.email || "").toLowerCase().includes(searchTerm) ||
      (quote.trade || "").toLowerCase().includes(searchTerm) ||
      (quote.job_type || "").toLowerCase().includes(searchTerm) ||
      (quote.problem_description || "").toLowerCase().includes(searchTerm);

    const matchesFilter =
      selectedFilter === "All" || quote.status === selectedFilter;

    return matchesSearch && matchesFilter;
  });

  renderQuoteRequests(filtered);
}

document.getElementById("quote-search").addEventListener("input", applyQuoteFilters);
document.getElementById("quote-filter").addEventListener("change", applyQuoteFilters);

document.addEventListener("click", function (event) {
  const row = event.target.closest(".quote-row");

  if (!row || event.target.classList.contains("quote-status-select")) {
    return;
  }

  const quoteId = row.dataset.quoteId;
  const quote = allQuoteRequests.find((item) => String(item.id) === String(quoteId));

  if (!quote) return;

  document.getElementById("modal-quote-name").textContent =
    quote.customer_name || "Unknown Customer";
  document.getElementById("modal-quote-phone").textContent = quote.phone || "-";
  document.getElementById("modal-quote-email").textContent = quote.email || "-";
  document.getElementById("modal-quote-trade").textContent = quote.trade || "-";
  document.getElementById("modal-quote-job").textContent = quote.job_type || "-";
  document.getElementById("modal-quote-urgency").textContent = quote.urgency || "-";
  document.getElementById("modal-quote-status").textContent = quote.status || "-";
  document.getElementById("modal-quote-address").textContent = quote.address || "-";
  document.getElementById("modal-quote-description").textContent =
    quote.problem_description || "-";

  document.getElementById("quote-modal").classList.add("open");
});

document.getElementById("quote-modal-close").addEventListener("click", function () {
  document.getElementById("quote-modal").classList.remove("open");
});

document.getElementById("quote-modal").addEventListener("click", function (event) {
  if (event.target.id === "quote-modal") {
    document.getElementById("quote-modal").classList.remove("open");
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

async function initQuoteRequestsPage() {
  await protectPage();

  currentClientId = await getCurrentClientId();

  if (!currentClientId) return;

  await loadQuoteRequests();
}

initQuoteRequestsPage();