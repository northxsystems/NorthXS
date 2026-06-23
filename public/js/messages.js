let allMessages = [];
let allScheduledMessages = [];
let currentClientId = null;
let currentProfile = null;
let bulkDeleteMode = false;

const defaultAutoReplyMessage =
  "Hey, sorry we missed your call. Reply here and our team will get back to you shortly.";

async function protectPage() {
  const { data } = await supabaseClient.auth.getSession();

  if (!data.session) {
    window.location.href = "login.html";
  }

  return data.session;
}

async function getCurrentClientId(session) {
  const { data: profile, error } = await supabaseClient
    .from("profiles")
    .select("client_id, plan, monthly_sms_limit, sms_sent_this_month")
    .eq("id", session.user.id)
    .single();

  if (error) {
    console.error("Error loading profile:", error);
    return null;
  }

  currentProfile = profile;
  return profile.client_id;
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function setTableMessage(tableBodyId, colspan, message) {
  document.getElementById(tableBodyId).innerHTML = `
    <tr>
      <td colspan="${colspan}">
        <div class="quote-empty-state">
          <strong>${escapeHtml(message)}</strong>
        </div>
      </td>
    </tr>
  `;
}

function updateAutoReplyPreview() {
  const messageInput = document.getElementById("auto-reply-message");
  const count = messageInput.value.length;
  const message = messageInput.value || defaultAutoReplyMessage;

  document.getElementById("auto-reply-count").textContent = `${count} / 320 characters`;
  document.getElementById("auto-reply-preview").textContent = message;
}

function setAutoReplyStatus(message, isError = false) {
  const status = document.getElementById("auto-reply-status");

  status.textContent = message;
  status.classList.toggle("error", isError);
}

async function loadAutoReplySettings() {
  const { data, error } = await supabaseClient
    .from("client_sms_settings")
    .select("*")
    .eq("client_id", currentClientId)
    .maybeSingle();

  if (error) {
    console.error("Error loading SMS settings:", {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
      raw: error
    });
    document.getElementById("auto-reply-message").value = defaultAutoReplyMessage;
    setAutoReplyStatus("Run the SMS settings SQL, then refresh.", true);
    updateAutoReplyPreview();
    return;
  }

  document.getElementById("auto-reply-message").value =
    data && data.missed_call_auto_reply_message
      ? data.missed_call_auto_reply_message
      : defaultAutoReplyMessage;
  updateAutoReplyPreview();
}

async function saveAutoReplySettings(event) {
  event.preventDefault();

  const saveButton = document.getElementById("auto-reply-save");
  const message = document.getElementById("auto-reply-message").value.trim() ||
    defaultAutoReplyMessage;

  saveButton.disabled = true;
  saveButton.textContent = "Saving...";
  setAutoReplyStatus("");

  const { error } = await supabaseClient
    .from("client_sms_settings")
    .upsert({
      client_id: currentClientId,
      missed_call_auto_reply_message: message,
      updated_at: new Date().toISOString()
    }, { onConflict: "client_id" });

  saveButton.disabled = false;
  saveButton.textContent = "Save Changes";

  if (error) {
    console.error("Error saving SMS settings:", {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
      raw: error
    });
    setAutoReplyStatus("Could not save auto-reply message.", true);
    return;
  }

  document.getElementById("auto-reply-message").value = message;
  updateAutoReplyPreview();
  setAutoReplyStatus("Auto-reply message saved.");
}

function updateSmsOverview() {
  const used = currentProfile ? currentProfile.sms_sent_this_month || 0 : 0;
  const limit = currentProfile ? currentProfile.monthly_sms_limit || 0 : 0;
  const plan = currentProfile ? currentProfile.plan || "starter" : "starter";
  const remaining = Math.max(limit - used, 0);
  const percentUsed = limit > 0 ? Math.min((used / limit) * 100, 100) : 0;
  const pending = allScheduledMessages.filter((msg) => msg.status === "pending").length;
  const sentScheduled = allScheduledMessages.filter((msg) => msg.status === "sent").length;
  const sentHistory = allMessages.filter((msg) => msg.direction === "sent").length;
  const scheduleButton = document.querySelector("#scheduled-message-form button[type='submit']");
  const usagePanel = document.querySelector(".usage-panel");

  document.getElementById("sms-used-card").textContent = used;
  document.getElementById("sms-remaining-card").textContent = remaining;
  document.getElementById("pending-sms").textContent = pending;
  document.getElementById("sent-sms").textContent = sentHistory || sentScheduled;
  document.getElementById("usage-plan-text").textContent = `Plan: ${plan}`;
  document.getElementById("usage-count-text").textContent = `${used} / ${limit} SMS`;
  document.getElementById("usage-remaining-text").textContent =
    `${remaining} SMS remaining this month`;
  document.getElementById("usage-bar-fill").style.width = `${percentUsed}%`;

  usagePanel.classList.remove("usage-good", "usage-warning", "usage-danger");

  if (percentUsed >= 100) {
    usagePanel.classList.add("usage-danger");
    document.getElementById("usage-remaining-text").textContent =
      "SMS limit reached. Upgrade your plan to continue.";
    scheduleButton.disabled = true;
    scheduleButton.textContent = "SMS Limit Reached";
  } else if (percentUsed >= 80) {
    usagePanel.classList.add("usage-warning");
    scheduleButton.disabled = false;
    scheduleButton.textContent = "Schedule SMS";
  } else {
    usagePanel.classList.add("usage-good");
    scheduleButton.disabled = false;
    scheduleButton.textContent = "Schedule SMS";
  }
}

async function loadMessages() {
  setTableMessage("messages-table-body", 4, "Loading messages...");

  if (!currentClientId) return;

  const { data, error } = await supabaseClient
    .from("messages")
    .select("*")
    .eq("client_id", currentClientId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error loading messages:", error);
    setTableMessage("messages-table-body", 4, "Could not load messages.");
    return;
  }

  allMessages = data || [];
  renderMessages(allMessages);
  updateSmsOverview();
}

function renderMessages(messages) {
  const tableBody = document.getElementById("messages-table-body");

  if (messages.length === 0) {
    setTableMessage("messages-table-body", 4, "No messages found.");
    return;
  }

  tableBody.innerHTML = "";

  messages.forEach((msg) => {
    const directionClass = msg.direction === "received" ? "booked" : "new";

    tableBody.innerHTML += `
      <tr>
        <td>${escapeHtml(msg.phone || "-")}</td>
        <td>
          <span class="badge ${directionClass}">
            ${escapeHtml(msg.direction || "-")}
          </span>
        </td>
        <td>${escapeHtml(msg.message || "-")}</td>
        <td>${new Date(msg.created_at).toLocaleString()}</td>
      </tr>
    `;
  });
}

function applyMessageFilters() {
  const searchTerm = document.getElementById("message-search").value.toLowerCase();
  const selectedFilter = document.getElementById("message-filter").value;

  const filtered = allMessages.filter((msg) => {
    const matchesSearch =
      (msg.phone || "").toLowerCase().includes(searchTerm) ||
      (msg.direction || "").toLowerCase().includes(searchTerm) ||
      (msg.message || "").toLowerCase().includes(searchTerm);

    const matchesFilter =
      selectedFilter === "All" || msg.direction === selectedFilter;

    return matchesSearch && matchesFilter;
  });

  renderMessages(filtered);
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
    phoneList.innerHTML = `<p>Could not load phone numbers.</p>`;
    return;
  }

  if (!data || data.length === 0) {
    phoneList.innerHTML = `<p>No lead phone numbers found.</p>`;
    return;
  }

  phoneList.innerHTML = "";

  data.forEach((lead) => {
    const label = document.createElement("label");
    label.className = "phone-option";

    label.innerHTML = `
      <input type="checkbox" value="${escapeHtml(lead.phone)}">
      <span>${escapeHtml(lead.name || "Unknown Lead")} - ${escapeHtml(lead.phone)}</span>
    `;

    phoneList.appendChild(label);
  });
}

async function loadScheduledMessages() {
  setTableMessage("scheduled-table-body", 5, "Loading scheduled messages...");

  const { data, error } = await supabaseClient
    .from("scheduled_messages")
    .select("*")
    .eq("client_id", currentClientId)
    .order("send_at", { ascending: false });

  if (error) {
    console.error("Error loading scheduled messages:", error);
    setTableMessage("scheduled-table-body", 5, "Could not load scheduled messages.");
    return;
  }

  allScheduledMessages = data || [];
  renderScheduledMessages(allScheduledMessages);
  updateSmsOverview();
}

function renderScheduledMessages(messages) {
  const tableBody = document.getElementById("scheduled-table-body");

  if (messages.length === 0) {
    setTableMessage("scheduled-table-body", 5, "No scheduled messages found.");
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
        : `<span class="muted-action">-</span>`;

    tableBody.innerHTML += `
      <tr>
        <td>${escapeHtml(msg.phone || "-")}</td>
        <td>${escapeHtml(msg.message || "-")}</td>
        <td>${new Date(msg.send_at).toLocaleString()}</td>
        <td>
          <span class="badge ${badgeClass}">
            ${escapeHtml(msg.status || "pending")}
          </span>
        </td>
        <td>${actionButton}</td>
      </tr>
    `;
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
  document.getElementById("bulk-delete-toggle").textContent = "Bulk Delete";
  await loadScheduledMessages();
}

function applyScheduledFilter() {
  const filter = document.getElementById("scheduled-filter").value;
  const filtered = allScheduledMessages.filter((msg) => {
    return filter === "All" || msg.status === filter;
  });

  renderScheduledMessages(filtered);
}

function switchSmsTab(tabName) {
  document.querySelectorAll(".sms-tab").forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.smsTab === tabName);
  });

  document.getElementById("sms-history-panel").classList.toggle("active", tabName === "history");
  document.getElementById("sms-scheduled-panel").classList.toggle("active", tabName === "scheduled");
}

async function scheduleSms(event) {
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
    phone,
    message,
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
  document.getElementById("phone-dropdown-btn").textContent = "Select Phone Numbers";
  document.getElementById("sms-phone-list").classList.add("hidden");

  await loadScheduledMessages();
  switchSmsTab("scheduled");
  alert("SMS scheduled successfully.");
}

document.getElementById("message-search").addEventListener("input", applyMessageFilters);
document.getElementById("message-filter").addEventListener("change", applyMessageFilters);
document.getElementById("auto-reply-message").addEventListener("input", updateAutoReplyPreview);
document.getElementById("auto-reply-form").addEventListener("submit", saveAutoReplySettings);
document.getElementById("scheduled-filter").addEventListener("change", applyScheduledFilter);
document.getElementById("scheduled-message-form").addEventListener("submit", scheduleSms);

document.getElementById("phone-dropdown-btn").addEventListener("click", () => {
  document.getElementById("sms-phone-list").classList.toggle("hidden");
});

document.addEventListener("click", (event) => {
  const dropdown = document.getElementById("sms-phone-list");
  const dropdownBtn = document.getElementById("phone-dropdown-btn");

  if (!dropdown.contains(event.target) && !dropdownBtn.contains(event.target)) {
    dropdown.classList.add("hidden");
  }
});

document.getElementById("sms-phone-list").addEventListener("change", () => {
  const checked = document.querySelectorAll("#sms-phone-list input:checked");
  const dropdownBtn = document.getElementById("phone-dropdown-btn");

  dropdownBtn.textContent = checked.length === 0
    ? "Select Phone Numbers"
    : `${checked.length} phone number(s) selected`;
});

document.getElementById("scheduled-table-body").addEventListener("click", async (event) => {
  const cancelButton = event.target.closest(".cancel-sms-btn");

  if (!cancelButton) return;

  await cancelScheduledMessage(cancelButton.dataset.id);
});

document.getElementById("bulk-delete-toggle").addEventListener("click", async function () {
  if (!bulkDeleteMode) {
    bulkDeleteMode = true;
    this.textContent = "Delete Selected";
    renderScheduledMessages(allScheduledMessages);
    return;
  }

  await bulkDeleteMessages();
});

document.querySelectorAll(".sms-tab").forEach((tab) => {
  tab.addEventListener("click", () => switchSmsTab(tab.dataset.smsTab));
});

const logoutButton = document.getElementById("logout-button");

if (logoutButton) {
  logoutButton.addEventListener("click", async function () {
    await supabaseClient.auth.signOut();
    window.location.href = "login.html";
  });
}

supabaseClient
  .channel("messages-realtime")
  .on(
    "postgres_changes",
    {
      event: "*",
      schema: "public",
      table: "messages"
    },
    function () {
      loadMessages();
    }
  )
  .subscribe();

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

async function initSmsControlCenter() {
  const session = await protectPage();

  if (!session) return;

  currentClientId = await getCurrentClientId(session);

  if (!currentClientId) return;

  updateSmsOverview();
  await loadAutoReplySettings();
  await loadLeadPhones();
  await Promise.all([
    loadMessages(),
    loadScheduledMessages()
  ]);
}

initSmsControlCenter();
