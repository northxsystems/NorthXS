let currentClientId = null;
let allLeads = [];
let selectedLeadId = null;

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

function getLeadStatusBadgeClass(status) {
  const normalized = String(status || "new").toLowerCase();

  if (normalized.includes("book") || normalized.includes("won")) return "success";
  if (normalized.includes("lost") || normalized.includes("missed")) return "danger";
  if (normalized.includes("contact") || normalized.includes("follow")) return "warning";
  return "new";
}

function renderLeadStatusBadge(status) {
  const label = status || "New";
  return `<span class="badge ${getLeadStatusBadgeClass(label)}">${escapeHtml(label)}</span>`;
}

async function protectPage() {
  const { data } = await supabaseClient.auth.getSession();

  if (!data.session) {
    window.location.href = "login.html";
    return null;
  }

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
  const isLoading = message.toLowerCase().includes("loading");

  document.getElementById("leads-table-body").innerHTML = `
    <tr>
      <td colspan="6">
        <div class="quote-empty-state nx-empty-state">
          ${isLoading ? '<span class="nx-skeleton" style="width: 42px; height: 42px;"></span>' : ""}
          <strong>${escapeHtml(message)}</strong>
          <span>Your new leads will appear here. Connect your phone or share your quote request link to begin capturing opportunities.</span>
        </div>
      </td>
    </tr>
  `;
}

async function loadLeads() {
  setTableMessage("Loading leads...");

  const { data, error } = await supabaseClient
    .from("leads")
    .select("*")
    .eq("client_id", currentClientId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error loading leads:", error);
    setTableMessage("Could not load leads.");
    return;
  }

  allLeads = data || [];
  renderLeads();
}

function getFilteredLeads() {
  const searchInput = document.getElementById("lead-search");
  const filterSelect = document.getElementById("lead-filter");
  const searchTerm = searchInput ? searchInput.value.toLowerCase() : "";
  const selectedFilter = filterSelect ? filterSelect.value : "All Leads";

  return allLeads.filter((lead) => {
    const status = lead.status || lead.call_status || "New";
    const matchesSearch =
      (lead.name || "").toLowerCase().includes(searchTerm) ||
      (lead.phone || "").toLowerCase().includes(searchTerm) ||
      (lead.call_status || "").toLowerCase().includes(searchTerm) ||
      (lead.follow_up_status || "").toLowerCase().includes(searchTerm) ||
      (lead.notes || "").toLowerCase().includes(searchTerm);
    const matchesFilter =
      selectedFilter === "All Leads" ||
      status.toLowerCase() === selectedFilter.toLowerCase();

    return matchesSearch && matchesFilter;
  });
}

function renderLeads() {
  const leads = getFilteredLeads();
  const tableBody = document.getElementById("leads-table-body");

  if (leads.length === 0) {
    setTableMessage("No leads match your filters.");
    return;
  }

  tableBody.innerHTML = "";

  leads.forEach((lead) => {
    tableBody.innerHTML += `
      <tr class="lead-row" data-lead-id="${lead.id}">
        <td>
          <a class="customer-detail-link" href="customer-details.html?lead_id=${encodeURIComponent(lead.id)}">
            <strong class="quote-customer-name">${escapeHtml(lead.name || "Unknown Lead")}</strong>
          </a>
          <span class="quote-customer-meta">${escapeHtml(lead.source || "Lead")}</span>
        </td>
        <td>${escapeHtml(lead.phone || "-")}</td>
        <td>${renderLeadStatusBadge(lead.call_status || lead.status || "New")}</td>
        <td>${formatDate(lead.created_at)}</td>
        <td>${lead.follow_up_status ? renderLeadStatusBadge(lead.follow_up_status) : "-"}</td>
        <td>${escapeHtml(lead.notes || "-")}</td>
      </tr>
    `;
  });
}

function openLeadDetails(leadId) {
  window.location.href = `customer-details.html?lead_id=${encodeURIComponent(leadId)}`;
}

async function saveLeadNotes() {
  if (!selectedLeadId) return;

  const notes = document.getElementById("modal-lead-notes").value;

  const { error } = await supabaseClient
    .from("leads")
    .update({ notes })
    .eq("id", selectedLeadId)
    .eq("client_id", currentClientId);

  if (error) {
    console.error("Error saving lead notes:", error);
    alert("Could not save notes.");
    return;
  }

  await loadLeads();
  document.getElementById("lead-modal").classList.remove("open");
}

document.getElementById("leads-table-body").addEventListener("click", function (event) {
  const row = event.target.closest(".lead-row");

  if (!row) return;

  openLeadDetails(row.dataset.leadId);
});

const leadSearch = document.getElementById("lead-search");

if (leadSearch) {
  leadSearch.addEventListener("input", renderLeads);
}

document.getElementById("lead-filter").addEventListener("change", renderLeads);

const modalClose = document.getElementById("modal-close");

if (modalClose) {
  modalClose.addEventListener("click", function () {
    document.getElementById("lead-modal").classList.remove("open");
  });
}

const saveNotesButton = document.getElementById("modal-save-notes");

if (saveNotesButton) {
  saveNotesButton.addEventListener("click", saveLeadNotes);
}

const logoutButton = document.getElementById("logout-button");

if (logoutButton) {
  logoutButton.addEventListener("click", async function () {
    await supabaseClient.auth.signOut();
    window.location.href = "login.html";
  });
}

supabaseClient
  .channel("leads-page-realtime")
  .on(
    "postgres_changes",
    {
      event: "*",
      schema: "public",
      table: "leads"
    },
    function () {
      loadLeads();
    }
  )
  .subscribe();

async function initLeadsPage() {
  const session = await protectPage();

  if (!session) return;

  currentClientId = await getCurrentClientId(session);

  if (!currentClientId) return;

  await loadLeads();
}

initLeadsPage();
