async function protectPage() {
  const { data } = await supabaseClient.auth.getSession();

  if (!data.session) {
    window.location.href = "login.html";
  }
}

protectPage();

async function loadPlanData() {
  const { data: sessionData } = await supabaseClient.auth.getSession();

  const userId = sessionData.session.user.id;

  const { data: profile, error } = await supabaseClient
    .from("profiles")
    .select(`
      plan,
      sms_sent_this_month,
      monthly_sms_limit
    `)
    .eq("id", userId)
    .single();

  if (error) {
    console.error("Error loading plan:", error);
    return;
  }

  const plan = profile.plan || "starter";
  const smsSent = profile.sms_sent_this_month || 0;
  const smsLimit = profile.monthly_sms_limit || 500;

  document.getElementById("current-plan").textContent =
    plan.charAt(0).toUpperCase() + plan.slice(1);

  document.getElementById("plans-usage-text").textContent =
    `${smsSent} / ${smsLimit}`;

  if (plan === "starter") {
    document.getElementById("current-plan-price").textContent =
      "$99/month";
  }

  if (plan === "growth") {
    document.getElementById("current-plan-price").textContent =
      "$199/month";
  }

  if (plan === "ai") {
    document.getElementById("current-plan-price").textContent =
      "$399/month";
  }

  const usagePercent = (smsSent / smsLimit) * 100;

  const usageStatus =
    document.getElementById("plans-usage-status");

  if (usagePercent >= 100) {
    usageStatus.textContent = "Limit reached";
    usageStatus.style.color = "#ef4444";
  } else if (usagePercent >= 80) {
    usageStatus.textContent = "Approaching limit";
    usageStatus.style.color = "#f59e0b";
  } else {
    usageStatus.textContent = "Within limits";
    usageStatus.style.color = "#22c55e";
  }
}

const logoutButton = document.getElementById("logout-button");

if (logoutButton) {
  logoutButton.addEventListener("click", async function () {
    await supabaseClient.auth.signOut();
    window.location.href = "login.html";
  });
}

loadPlanData();