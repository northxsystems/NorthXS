async function protectFoundationPage() {
  const { data } = await supabaseClient.auth.getSession();

  if (!data.session) {
    window.location.href = "login.html";
    return null;
  }

  return data.session;
}

async function loadFoundationProfile(session) {
  const { data: profile, error } = await supabaseClient
    .from("profiles")
    .select("*")
    .eq("id", session.user.id)
    .single();

  if (error) {
    console.warn("Could not load profile for shell page:", error);
    return null;
  }

  const workspaceName = document.getElementById("shell-workspace-name");
  if (workspaceName) {
    workspaceName.textContent =
      profile.company_name ||
      profile.business_name ||
      profile.client_name ||
      profile.client_id ||
      "Local Service Business";
  }

  return profile;
}

function wireFoundationLogout() {
  const logoutButton = document.getElementById("logout-button");

  if (!logoutButton) return;

  logoutButton.addEventListener("click", async function () {
    await supabaseClient.auth.signOut();
    window.location.href = "login.html";
  });
}

async function initFoundationPage() {
  wireFoundationLogout();
  const session = await protectFoundationPage();
  if (!session) return;
  await loadFoundationProfile(session);
}

initFoundationPage();
