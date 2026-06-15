let currentClientId = null;
let allScheduledMessages = [];
let bulkDeleteMode = false;
let currentProfile = null;

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
    .select("client_id, plan, monthly_sms_limit, sms_sent_this_month")
    .eq("id", userId)
    .single();

  if (error) {
    console.error("Error loading profile:", error);
    return null;
  }

  currentProfile = profile;

  return profile.client_id;
}

async function loadLeadPhones() {
  const phoneList = document.getElementById("sms-phone-list");

  const { data, error } = await supabaseClient
    .from("leads")
    .select("name, phone")
    .eq("client_id", currentClientId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error loading lead phones:", error);
    return;
  }

  if (data.length === 0) {
    phoneList.innerHTML = `<p>No lead phone numbers found.</p>`;
    return;
  }

  phoneList.innerHTML = "";

  data.forEach((lead) => {
    const label = document.createElement("label");
    label.className = "phone-option";

    label.innerHTML = `
      <input type="checkbox" value="${lead.phone}">
      <span>${lead.name || "Unknown Lead"} — ${lead.phone}</span>
    `;

    phoneList.appendChild(label);
  });
}

const dropdownBtn = document.getElementById("phone-dropdown-btn");
const dropdown = document.getElementById("sms-phone-list");

dropdownBtn.addEventListener("click", () => {
  dropdown.classList.toggle("hidden");
});

document.addEventListener("click", (e) => {
  if (
    !dropdown.contains(e.target) &&
    !dropdownBtn.contains(e.target)
  ) {
    dropdown.classList.add("hidden");
  }
});

document.addEventListener("change", () => {
  const checked = document.querySelectorAll(
    "#sms-phone-list input:checked"
  );

  if (checked.length === 0) {
    dropdownBtn.textContent = "Select Phone Numbers";
  } else {
    dropdownBtn.textContent = `${checked.length} phone number(s) selected`;
  }
});

async function loadScheduledMessages() {
  const tableBody = document.getElementById("scheduled-table-body");

  tableBody.innerHTML = `
    <tr>
      <td colspan="5" style="text-align:center; padding:40px;">
        Loading scheduled messages...
      </td>
    </tr>
  `;

  const { data, error } = await supabaseClient
    .from("scheduled_messages")
    .select("*")
    .eq("client_id", currentClientId)
    .order("send_at", { ascending: false });

  if (error) {
    console.error("Error loading scheduled messages:", error);
    return;
  }

  allScheduledMessages = data;
  updateAutomationStats(data);
  renderScheduledMessages(data);
}

function updateAutomationStats(messages) {
  const pending = messages.filter((msg) => msg.status === "pending").length;
  const sent = messages.filter((msg) => msg.status === "sent").length;

  document.getElementById("pending-sms").textContent = pending;
  document.getElementById("sent-sms").textContent = sent;
}

function updateUsageDisplay() {
  const used = currentProfile.sms_sent_this_month || 0;
  const limit = currentProfile.monthly_sms_limit || 0;
  const plan = currentProfile.plan || "starter";

  const remaining = Math.max(limit - used, 0);
  const percentUsed = limit > 0 ? Math.min((used / limit) * 100, 100) : 0;

  document.getElementById("usage-plan-text").textContent = `Plan: ${plan}`;
  document.getElementById("usage-count-text").textContent = `${used} / ${limit} SMS`;
  document.getElementById("usage-remaining-text").textContent =
    `${remaining} SMS remaining this month`;
  document.getElementById("usage-bar-fill").style.width = `${percentUsed}%`;
}

function renderScheduledMessages(messages) {
  const tableBody = document.getElementById("scheduled-table-body");

  if (messages.length === 0) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="5" style="text-align:center; padding:40px;">
          No scheduled messages found.
        </td>
      </tr>
    `;
    return;
  }

  tableBody.innerHTML = "";

  messages.forEach((msg) => {
    let badgeClass = "new";

    if (msg.status === "sent") badgeClass = "booked";
    if (msg.status === "failed") badgeClass = "lost";
    if (msg.status === "cancelled") badgeClass = "lost";

    const actionButton = bulkDeleteMode
      ? `<input type="checkbox" class="bulk-delete-checkbox" value="${msg.id}">`
      : msg.status === "pending"
        ? `<button class="cancel-sms-btn" data-id="${msg.id}">Cancel</button>`
        : `<span class="muted-action">—</span>`;

    const row = `
      <tr>
        <td>${msg.phone || "-"}</td>
        <td>${msg.message || "-"}</td>
        <td>${new Date(msg.send_at).toLocaleString()}</td>
        <td>
          <span class="badge ${badgeClass}">
            ${msg.status || "pending"}
          </span>
        </td>
        <td>${actionButton}</td>
      </tr>
    `;

    tableBody.innerHTML += row;
  });

  document.querySelectorAll(".cancel-sms-btn").forEach((button) => {
    button.addEventListener("click", async function () {
      const messageId = this.dataset.id;
      await cancelScheduledMessage(messageId);
    });
  });
}

async function cancelScheduledMessage(messageId) {
  const confirmCancel = confirm("Cancel this scheduled SMS?");

  if (!confirmCancel) return;

  const { error } = await supabaseClient
    .from("scheduled_messages")
    .update({ status: "cancelled" })
    .eq("id", messageId)
    .eq("client_id", currentClientId);

  if (error) {
    console.error("Error cancelling scheduled SMS:", error);
    alert("Could not cancel scheduled SMS.");
    return;
  }

  await loadScheduledMessages();
}

async function bulkDeleteMessages() {
  const selectedIds = Array.from(
    document.querySelectorAll(".bulk-delete-checkbox:checked")
  ).map((checkbox) => checkbox.value);

  if (selectedIds.length === 0) {
    alert("Select at least one message to delete.");
    return;
  }

  const confirmDelete = confirm(`Delete ${selectedIds.length} scheduled message(s)?`);

  if (!confirmDelete) return;

  const { error } = await supabaseClient
    .from("scheduled_messages")
    .delete()
    .in("id", selectedIds)
    .eq("client_id", currentClientId);

  if (error) {
    console.error("Error deleting messages:", error);
    alert("Could not delete selected messages.");
    return;
  }

  bulkDeleteMode = false;

  const bulkButton = document.getElementById("bulk-delete-toggle");
  bulkButton.textContent = "Bulk Delete";

  await loadScheduledMessages();
}

function applyScheduledFilter() {
  const filter = document.getElementById("scheduled-filter").value;

  const filtered = allScheduledMessages.filter((msg) => {
    return filter === "All" || msg.status === filter;
  });

  renderScheduledMessages(filtered);
}

document.getElementById("bulk-delete-toggle").addEventListener("click", async function () {
  if (!bulkDeleteMode) {
    bulkDeleteMode = true;
    this.textContent = "Delete Selected";
    renderScheduledMessages(allScheduledMessages);
  } else {
    await bulkDeleteMessages();
  }
});

document
  .getElementById("scheduled-filter")
  .addEventListener("change", applyScheduledFilter);

document
  .getElementById("scheduled-message-form")
  .addEventListener("submit", async function (event) {
    event.preventDefault();

    const selectedPhones = Array.from(
      document.querySelectorAll("#sms-phone-list input:checked")
    ).map((input) => input.value);

    if (selectedPhones.length === 0) {
      alert("Please select at least one phone number.");
      return;
    }

    const currentUsage = currentProfile.sms_sent_this_month || 0;
    const monthlyLimit = currentProfile.monthly_sms_limit || 0;
    const requestedMessages = selectedPhones.length;

    if (currentUsage + requestedMessages > monthlyLimit) {
      alert(`SMS limit reached. You have used ${currentUsage}/${monthlyLimit} SMS this month.`);
  return;
}

    const message = document.getElementById("sms-message").value;
    const sendAtInput = document.getElementById("sms-send-at").value;
    const sendAt = new Date(sendAtInput).toISOString();

    const rowsToInsert = selectedPhones.map((phone) => ({
      client_id: currentClientId,
      phone: phone,
      message: message,
      send_at: sendAt,
      status: "pending"
    }));

    const { error } = await supabaseClient
      .from("scheduled_messages")
      .insert(rowsToInsert);

    if (error) {
      console.error("Error scheduling SMS:", error);
      alert("Could not schedule SMS.");
      return;
    }

    document.getElementById("scheduled-message-form").reset();

    await loadScheduledMessages();

    alert("SMS scheduled successfully.");
  });

const logoutButton = document.getElementById("logout-button");

if (logoutButton) {
  logoutButton.addEventListener("click", async function () {
    await supabaseClient.auth.signOut();
    window.location.href = "login.html";
  });
}

async function initAutomationsPage() {
  await protectPage();

  currentClientId = await getCurrentClientId();

  if (!currentClientId) return;

  updateUsageDisplay();

  await loadLeadPhones();
  await loadScheduledMessages();
}

supabaseClient
  .channel("scheduled-messages-realtime")
  .on(
    "postgres_changes",
    {
      event: "*",
      schema: "public",
      table: "scheduled_messages"
    },
    function () {
      loadScheduledMessages();
    }
  )
  .subscribe();

initAutomationsPage();