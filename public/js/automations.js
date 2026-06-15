let currentClientId = null;
let allScheduledMessages = [];

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

async function loadLeadPhones() {
  const phoneSelect = document.getElementById("sms-phone");

  const { data, error } = await supabaseClient
    .from("leads")
    .select("name, phone")
    .eq("client_id", currentClientId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error loading lead phones:", error);
    return;
  }

  phoneSelect.innerHTML = `
    <option value="">Select a lead phone number</option>
  `;

  data.forEach((lead) => {
    const option = document.createElement("option");
    option.value = lead.phone;
    option.textContent = `${lead.name || "Unknown Lead"} — ${lead.phone}`;
    phoneSelect.appendChild(option);
  });
}

async function loadScheduledMessages() {
  const tableBody = document.getElementById("scheduled-table-body");

  tableBody.innerHTML = `
    <tr>
      <td colspan="4" style="text-align:center; padding:40px;">
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

function renderScheduledMessages(messages) {
  const tableBody = document.getElementById("scheduled-table-body");

  if (messages.length === 0) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="4" style="text-align:center; padding:40px;">
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
      </tr>
    `;

    tableBody.innerHTML += row;
  });
}

function applyScheduledFilter() {
  const filter = document.getElementById("scheduled-filter").value;

  const filtered = allScheduledMessages.filter((msg) => {
    return filter === "All" || msg.status === filter;
  });

  renderScheduledMessages(filtered);
}

document.getElementById("scheduled-filter").addEventListener("change", applyScheduledFilter);

document.getElementById("scheduled-message-form").addEventListener("submit", async function(event) {
  event.preventDefault();

  const phone = document.getElementById("sms-phone").value;
  const message = document.getElementById("sms-message").value;
  const sendAtInput = document.getElementById("sms-send-at").value;
  const sendAt = new Date(sendAtInput).toISOString();

  const { error } = await supabaseClient
    .from("scheduled_messages")
    .insert([
      {
        client_id: currentClientId,
        phone: phone,
        message: message,
        send_at: sendAt,
        status: "pending"
      }
    ]);

  if (error) {
    console.error("Error scheduling SMS:", error);
    alert("Could not schedule SMS.");
    return;
  }

  document.getElementById("scheduled-message-form").reset();

  loadScheduledMessages();

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

  await loadLeadPhones();
  await loadScheduledMessages();
}

initAutomationsPage();