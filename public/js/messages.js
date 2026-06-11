let allMessages = [];

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

async function loadMessages() {
  const tableBody = document.getElementById("messages-table-body");

  tableBody.innerHTML = `
    <tr>
      <td colspan="4" style="text-align:center; padding:40px;">
        Loading messages...
      </td>
    </tr>
  `;

  const clientId = await getCurrentClientId();

  if (!clientId) return;

  const { data, error } = await supabaseClient
    .from("messages")
    .select("*")
    .eq("client_id", clientId)
    .order("created_at", { ascending: false });

    console.log("Client ID:", clientId);
    console.log("Messages data:", data);
    console.log("Messages error:", error);


  if (error) {
    console.error("Error loading messages:", error);
    return;
  }

  allMessages = data;
  renderMessages(data);
}

function renderMessages(messages) {
  const tableBody = document.getElementById("messages-table-body");

  if (messages.length === 0) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="4" style="text-align:center; padding:40px;">
          No messages found.
        </td>
      </tr>
    `;
    return;
  }

  tableBody.innerHTML = "";

  messages.forEach((msg) => {
    const directionClass = msg.direction === "received" ? "booked" : "new";

    const row = `
      <tr>
        <td>${msg.phone || "-"}</td>
        <td>
          <span class="badge ${directionClass}">
            ${msg.direction || "-"}
          </span>
        </td>
        <td>${msg.message || "-"}</td>
        <td>${new Date(msg.created_at).toLocaleString()}</td>
      </tr>
    `;

    tableBody.innerHTML += row;
  });
}

function applyMessageFilters() {
  const searchInput = document.getElementById("message-search");
  const filter = document.getElementById("message-filter");

  const searchTerm = searchInput.value.toLowerCase();
  const selectedFilter = filter.value;

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

document.getElementById("message-search").addEventListener("input", applyMessageFilters);
document.getElementById("message-filter").addEventListener("change", applyMessageFilters);

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

protectPage();
loadMessages();