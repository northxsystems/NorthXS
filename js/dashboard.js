async function protectPage() {
  const { data } = await supabaseClient.auth.getSession();

  if (!data.session) {
    window.location.href = "login.html";
  }
}

protectPage();


let allLeads = [];

async function loadLeads() {
  const tableBody = document.getElementById("leads-table-body");

  tableBody.innerHTML = `
    <tr>
      <td colspan="6" style="text-align:center; padding:40px;">
        Loading leads...
      </td>
    </tr>
  `;

  const { data, error } = await supabaseClient
    .from("leads")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error loading leads:", error);
    return;
  }

  allLeads = data;

  if (document.getElementById("total-leads")) {
  updateStats(data);
}

renderLeads(data);
}

function updateStats(data) {
  const totalLeads = data.length;

  const missedCalls = data.filter((lead) =>
    lead.call_status === "Missed Call"
  ).length;

  const contactedLeads = data.filter((lead) =>
    lead.follow_up_status === "Contacted"
  ).length;

  const bookedLeads = data.filter((lead) =>
    lead.follow_up_status === "Booked"
  ).length;

  const currentMonth = new Date().getMonth();
  const currentYear = new Date().getFullYear();

  const monthlyLeads = data.filter((lead) => {
    const leadDate = new Date(lead.created_at);
    return (
      leadDate.getMonth() === currentMonth &&
      leadDate.getFullYear() === currentYear
    );
  }).length;

  document.getElementById("total-leads").textContent = totalLeads;
  document.getElementById("missed-calls").textContent = missedCalls;
  document.getElementById("contacted-leads").textContent = contactedLeads;
  document.getElementById("booked-leads").textContent = bookedLeads;

  document.getElementById("monthly-leads-text").textContent = `+${monthlyLeads} this month`;
  document.getElementById("recovered-text").textContent = `${missedCalls} recovered automatically`;
  document.getElementById("followups-text").textContent = `${contactedLeads} follow-ups started`;
  document.getElementById("converted-text").textContent = `${bookedLeads} converted leads`;
}

function renderLeads(leads) {
  const tableBody = document.getElementById("leads-table-body");

  if (leads.length === 0) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="6" style="text-align:center; padding:40px;">
          No leads found.
        </td>
      </tr>
    `;
    return;
  }

  tableBody.innerHTML = "";

  leads.forEach((lead) => {
    const status = lead.call_status || "New";
    let badgeClass = "new";

    if (status === "Contacted") badgeClass = "contacted";
    if (status === "Booked") badgeClass = "booked";
    if (status === "Lost") badgeClass = "lost";

    const row = `
      <tr class="lead-row" data-lead-id="${lead.id}">
        <td>${lead.name || "Unknown Lead"}</td>
        <td>${lead.phone || "-"}</td>
        <td><span class="badge ${badgeClass}">${status}</span></td>
        <td>${new Date(lead.created_at).toLocaleString()}</td>
        <td>
          <select class="status-select" data-lead-id="${lead.id}">
            <option value="New" ${lead.follow_up_status === "New" ? "selected" : ""}>New</option>
            <option value="Contacted" ${lead.follow_up_status === "Contacted" ? "selected" : ""}>Contacted</option>
            <option value="Booked" ${lead.follow_up_status === "Booked" ? "selected" : ""}>Booked</option>
            <option value="Lost" ${lead.follow_up_status === "Lost" ? "selected" : ""}>Lost</option>
          </select>
        </td>
        <td>${lead.notes || "-"}</td>
      </tr>
    `;

    tableBody.innerHTML += row;
  });
}

async function updateLeadStatus(leadId, newStatus) {
  const { error } = await supabaseClient
    .from("leads")
    .update({ follow_up_status: newStatus })
    .eq("id", leadId);

  if (error) {
    console.error("Error updating lead:", error);
    return;
  }

  loadLeads();
}

document.addEventListener("change", function(event) {
  if (event.target.classList.contains("status-select")) {
    const leadId = event.target.dataset.leadId;
    const newStatus = event.target.value;
    updateLeadStatus(leadId, newStatus);
  }
});

const searchInput = document.querySelector(".topbar-actions input");
const leadFilter = document.getElementById("lead-filter");

function applyFilters() {
  const searchTerm = searchInput.value.toLowerCase();
  const selectedFilter = leadFilter ? leadFilter.value : "All Leads";

  const filteredLeads = allLeads.filter((lead) => {
    const matchesSearch =
      (lead.name || "").toLowerCase().includes(searchTerm) ||
      (lead.phone || "").toLowerCase().includes(searchTerm) ||
      (lead.call_status || "").toLowerCase().includes(searchTerm) ||
      (lead.follow_up_status || "").toLowerCase().includes(searchTerm) ||
      (lead.notes || "").toLowerCase().includes(searchTerm);

    const matchesFilter =
      selectedFilter === "All Leads" ||
      lead.follow_up_status === selectedFilter;

    return matchesSearch && matchesFilter;
  });

  renderLeads(filteredLeads);
}

searchInput.addEventListener("input", applyFilters);

if (leadFilter) {
  leadFilter.addEventListener("change", applyFilters);
}

const leadsChannel = supabaseClient
  .channel("leads-realtime")
  .on(
    "postgres_changes",
    {
      event: "*",
      schema: "public",
      table: "leads"
    },
    function(payload) {
      console.log("Realtime update:", payload);
      loadLeads();
    }
  )
  .subscribe((status) => {
    console.log("Realtime status:", status);
  });


  let selectedLeadId = null;

document.addEventListener("click", function(event) {
  const row = event.target.closest(".lead-row");

  if (!row || event.target.classList.contains("status-select")) {
    return;
  }

  const leadId = row.dataset.leadId;
  const lead = allLeads.find((item) => String(item.id) === String(leadId));

  if (!lead) return;

  selectedLeadId = lead.id;

  document.getElementById("modal-lead-name").textContent = lead.name || "Unknown Lead";
  document.getElementById("modal-lead-phone").textContent = lead.phone || "-";
  document.getElementById("modal-lead-status").textContent = lead.call_status || "-";
  document.getElementById("modal-lead-followup").textContent = lead.follow_up_status || "-";
  document.getElementById("modal-lead-created").textContent = new Date(lead.created_at).toLocaleString();
  document.getElementById("modal-lead-notes").value = lead.notes || "";

  document.getElementById("lead-modal").classList.add("open");
});

document.getElementById("modal-close").addEventListener("click", function() {
  document.getElementById("lead-modal").classList.remove("open");
});

document.getElementById("lead-modal").addEventListener("click", function(event) {
  if (event.target.id === "lead-modal") {
    document.getElementById("lead-modal").classList.remove("open");
  }
});

document.getElementById("modal-save-notes").addEventListener("click", async function() {
  const notes = document.getElementById("modal-lead-notes").value;

  const { error } = await supabaseClient
    .from("leads")
    .update({ notes: notes })
    .eq("id", selectedLeadId);

  if (error) {
    console.error("Error saving notes:", error);
    return;
  }

  document.getElementById("lead-modal").classList.remove("open");
  loadLeads();
});


const exportButton = document.getElementById("export-csv");

if (exportButton) {
  exportButton.addEventListener("click", function () {
    const headers = ["Name", "Phone", "Call Status", "Follow-Up Status", "Created At", "Notes"];

    const rows = allLeads.map((lead) => [
      lead.name || "Unknown Lead",
      `="${lead.phone || ""}"`,
      lead.call_status || "",
      lead.follow_up_status || "",
      lead.created_at || "",
      lead.notes || ""
    ]);

    const csvContent = [
      headers,
      ...rows
    ]
      .map((row) =>
        row.map((item) => `"${String(item).replace(/"/g, '""')}"`).join(",")
      )
      .join("\n");

    const blob = new Blob([csvContent], {
      type: "text/csv;charset=utf-8;"
    });

    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    link.download = "northx-leads.csv";
    link.click();

    URL.revokeObjectURL(url);
  });
}


const logoutButton = document.getElementById("logout-button");

if (logoutButton) {

  logoutButton.addEventListener("click", async function () {

    await supabaseClient.auth.signOut();

    window.location.href = "login.html";
  });

}


loadLeads();