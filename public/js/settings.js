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
    .select("client_id")
    .eq("id", session.user.id)
    .single();

  if (error) {
    console.error("Error loading profile:", error);
    return null;
  }

  return profile.client_id;
}

function setSettingsStatus(message, isError = false) {
  const status = document.getElementById("quote-pdf-settings-status");

  if (!status) return;

  status.textContent = message;
  status.classList.toggle("error", isError);
}

function getFieldValue(id) {
  const value = document.getElementById(id).value.trim();
  return value || null;
}

function fillQuotePdfSettings(settings) {
  document.getElementById("pdf-company-name").value = settings.company_display_name || "";
  document.getElementById("pdf-logo-url").value = settings.logo_url || "";
  document.getElementById("pdf-business-phone").value = settings.business_phone || "";
  document.getElementById("pdf-business-email").value = settings.business_email || "";
  document.getElementById("pdf-website").value = settings.website || "";
  document.getElementById("pdf-business-address").value = settings.business_address || "";
  document.getElementById("pdf-default-terms").value = settings.default_quote_terms || "";
  document.getElementById("pdf-default-tax-rate").value =
    settings.default_tax_rate === null || settings.default_tax_rate === undefined
      ? ""
      : settings.default_tax_rate;
  document.getElementById("pdf-accent-color").value = settings.pdf_accent_color || "#4f8cff";
}

async function loadQuotePdfSettings(clientId) {
  const { data, error } = await supabaseClient
    .from("client_quote_pdf_settings")
    .select("*")
    .eq("client_id", clientId)
    .maybeSingle();

  if (error) {
    console.error("Error loading quote PDF settings:", {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
      raw: error
    });
    setSettingsStatus("Run the quote PDF settings SQL, then refresh.", true);
    return;
  }

  fillQuotePdfSettings(data || {});
}

function buildSettingsPayload(clientId) {
  const taxRateValue = document.getElementById("pdf-default-tax-rate").value;

  return {
    client_id: clientId,
    company_display_name: getFieldValue("pdf-company-name"),
    logo_url: getFieldValue("pdf-logo-url"),
    business_phone: getFieldValue("pdf-business-phone"),
    business_email: getFieldValue("pdf-business-email"),
    website: getFieldValue("pdf-website"),
    business_address: getFieldValue("pdf-business-address"),
    default_quote_terms: getFieldValue("pdf-default-terms"),
    default_tax_rate: taxRateValue === "" ? null : Number(taxRateValue),
    pdf_accent_color: getFieldValue("pdf-accent-color") || "#4f8cff",
    updated_at: new Date().toISOString()
  };
}

async function initSettingsPage() {
  const session = await protectPage();

  if (!session) return;

  const currentClientId = await getCurrentClientId(session);

  if (!currentClientId) return;

  await loadQuotePdfSettings(currentClientId);

  document.getElementById("quote-pdf-settings-form").addEventListener("submit", async (event) => {
    event.preventDefault();

    const saveButton = document.getElementById("quote-pdf-settings-save");
    saveButton.disabled = true;
    saveButton.textContent = "Saving...";
    setSettingsStatus("");

    const { error } = await supabaseClient
      .from("client_quote_pdf_settings")
      .upsert(buildSettingsPayload(currentClientId), { onConflict: "client_id" });

    saveButton.disabled = false;
    saveButton.textContent = "Save PDF Settings";

    if (error) {
      console.error("Error saving quote PDF settings:", {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code,
        raw: error
      });
      setSettingsStatus("Could not save PDF settings.", true);
      return;
    }

    setSettingsStatus("PDF settings saved.");
  });
}

initSettingsPage();

const logoutButton = document.getElementById("logout-button");

if (logoutButton) {
  logoutButton.addEventListener("click", async function () {
    await supabaseClient.auth.signOut();
    window.location.href = "login.html";
  });
}
