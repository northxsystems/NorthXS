let quoteLinkUrl = "";
let quoteLinkEmbed = "";
let currentUser = null;
let currentSettings = null;

function setStatus(elementId, message, type = "") {
  const status = document.getElementById(elementId);

  if (!status) return;

  status.textContent = message;
  status.classList.toggle("success", type === "success");
  status.classList.toggle("error", type === "error");
}

function setQuoteLinkStatus(message, type = "") {
  setStatus("quote-link-status", message, type);
}

function setCustomizationStatus(message, type = "") {
  setStatus("quote-customization-status", message, type);
}

function setQuoteLinkControls(disabled) {
  ["copy-link-button", "preview-link-button", "copy-embed-button"].forEach((id) => {
    const button = document.getElementById(id);
    if (button) button.disabled = disabled;
  });
}

function setCustomizationControls(disabled) {
  const saveButton = document.getElementById("save-customization-button");
  if (!saveButton) return;

  saveButton.disabled = disabled;
  saveButton.textContent = disabled ? "Saving..." : "Save Customization";
}

async function protectPage() {
  const { data } = await supabaseClient.auth.getSession();

  if (!data.session) {
    window.location.href = "login.html";
  }

  return data.session;
}

function slugifyCompanyPrefix(email) {
  const prefix = String(email || "company").split("@")[0] || "company";
  const slug = prefix
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 36);

  return slug || "company";
}

function generateCompanySlug(user) {
  const randomNumber = Math.floor(1000 + Math.random() * 9000);
  return `${slugifyCompanyPrefix(user.email)}-${randomNumber}`;
}

function buildAbsoluteQuoteUrl(companySlug) {
  const quoteUrl = new URL("quote-intake.html", window.location.href);
  quoteUrl.searchParams.set("company", companySlug);
  return quoteUrl.href;
}

function buildEmbedCode(url) {
  return `<iframe src="${url}" width="100%" height="760" style="border:0;" loading="lazy" title="Quote Request Form"></iframe>`;
}

function getFieldValue(id) {
  const field = document.getElementById(id);
  return field ? field.value.trim() : "";
}

function sanitizeFileName(fileName) {
  return String(fileName || "logo")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "logo";
}

async function loadOrCreateClientSettings(user) {
  const { data, error } = await supabaseClient
    .from("client_settings")
    .select("*")
    .eq("client_id", user.id)
    .maybeSingle();

  if (error) {
    console.error("Error loading client settings:", {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
      raw: error
    });
    throw error;
  }

  if (data) return data;

  const settingsPayload = {
    client_id: user.id,
    company_name: "Your Company",
    company_slug: generateCompanySlug(user),
    quote_form_enabled: true
  };

  const { data: createdSettings, error: insertError } = await supabaseClient
    .from("client_settings")
    .insert(settingsPayload)
    .select("*")
    .single();

  if (insertError) {
    console.error("Error creating client settings:", {
      message: insertError.message,
      details: insertError.details,
      hint: insertError.hint,
      code: insertError.code,
      raw: insertError
    });
    throw insertError;
  }

  return createdSettings;
}

function renderQuoteLink(settings) {
  quoteLinkUrl = buildAbsoluteQuoteUrl(settings.company_slug);
  quoteLinkEmbed = buildEmbedCode(quoteLinkUrl);

  document.getElementById("quote-link-url").value = quoteLinkUrl;
  document.getElementById("quote-link-embed").value = quoteLinkEmbed;
}

function renderLogoPreview(logoUrl) {
  const previewWrap = document.querySelector(".quote-logo-preview");
  const previewImage = document.getElementById("custom-logo-preview");

  if (!previewWrap || !previewImage) return;

  previewWrap.classList.toggle("has-logo", Boolean(logoUrl));
  previewImage.src = logoUrl || "";
}

function populateCustomizationForm(settings) {
  document.getElementById("custom-company-name").value = settings.company_name || "";
  document.getElementById("custom-business-phone").value = settings.business_phone || "";
  document.getElementById("custom-business-email").value = settings.business_email || "";
  document.getElementById("custom-business-website").value = settings.business_website || "";
  document.getElementById("custom-form-intro").value = settings.form_intro || "";
  document.getElementById("custom-accent-color").value = settings.accent_color || "#4f8cff";
  renderLogoPreview(settings.logo_url);
}

async function uploadLogoIfSelected(user) {
  const fileInput = document.getElementById("custom-logo-file");
  const file = fileInput && fileInput.files ? fileInput.files[0] : null;

  if (!file) return null;

  const logoPath = `${user.id}/logo-${Date.now()}-${sanitizeFileName(file.name)}`;
  const { error: uploadError } = await supabaseClient.storage
    .from("client-logos")
    .upload(logoPath, file, { upsert: true });

  if (uploadError) {
    console.error("Logo upload failed:", {
      message: uploadError.message,
      details: uploadError.details,
      hint: uploadError.hint,
      code: uploadError.code,
      raw: uploadError
    });
    throw uploadError;
  }

  const { data } = supabaseClient.storage
    .from("client-logos")
    .getPublicUrl(logoPath);

  return data.publicUrl;
}

function buildCustomizationPayload(logoUrl) {
  const payload = {
    company_name: getFieldValue("custom-company-name") || "Your Company",
    business_phone: getFieldValue("custom-business-phone") || null,
    business_email: getFieldValue("custom-business-email") || null,
    business_website: getFieldValue("custom-business-website") || null,
    form_intro: getFieldValue("custom-form-intro") || null,
    accent_color: getFieldValue("custom-accent-color") || "#4f8cff"
  };

  if (logoUrl) {
    payload.logo_url = logoUrl;
  }

  return payload;
}

async function saveCustomization(event) {
  event.preventDefault();

  if (!currentUser) return;

  setCustomizationControls(true);
  setCustomizationStatus("");

  try {
    const logoUrl = await uploadLogoIfSelected(currentUser);
    const payload = buildCustomizationPayload(logoUrl);

    const { data, error } = await supabaseClient
      .from("client_settings")
      .update(payload)
      .eq("client_id", currentUser.id)
      .select("*")
      .single();

    if (error) {
      console.error("Error saving quote form customization:", {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code,
        raw: error
      });
      throw error;
    }

    currentSettings = data;
    populateCustomizationForm(currentSettings);
    renderQuoteLink(currentSettings);

    const fileInput = document.getElementById("custom-logo-file");
    if (fileInput) fileInput.value = "";

    setCustomizationStatus("Customization saved.", "success");
  } catch (error) {
    setCustomizationStatus("Could not save customization. Check the settings table and logo bucket.", "error");
  } finally {
    setCustomizationControls(false);
  }
}

async function copyText(value, successMessage) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(value);
    } else {
      const copyField = document.createElement("textarea");
      copyField.value = value;
      copyField.setAttribute("readonly", "");
      copyField.style.position = "fixed";
      copyField.style.opacity = "0";
      document.body.appendChild(copyField);
      copyField.select();
      document.execCommand("copy");
      document.body.removeChild(copyField);
    }

    setQuoteLinkStatus(successMessage, "success");
  } catch (error) {
    console.error("Clipboard copy failed:", error);
    setQuoteLinkStatus("Could not copy. Select the text and copy it manually.", "error");
  }
}

function wireQuoteLinkActions() {
  document.getElementById("copy-link-button").addEventListener("click", function () {
    copyText(quoteLinkUrl, "Quote request link copied.");
  });

  document.getElementById("preview-link-button").addEventListener("click", function () {
    if (quoteLinkUrl) window.open(quoteLinkUrl, "_blank", "noopener");
  });

  document.getElementById("copy-embed-button").addEventListener("click", function () {
    copyText(quoteLinkEmbed, "Embed code copied.");
  });

  document.getElementById("quote-form-customization-form").addEventListener("submit", saveCustomization);
}

async function initQuoteLinkPage() {
  setQuoteLinkControls(true);
  setCustomizationControls(true);
  wireQuoteLinkActions();

  const session = await protectPage();

  if (!session) return;

  currentUser = session.user;

  try {
    currentSettings = await loadOrCreateClientSettings(currentUser);
    renderQuoteLink(currentSettings);
    populateCustomizationForm(currentSettings);
    setQuoteLinkStatus("");
    setCustomizationStatus("");
    setQuoteLinkControls(false);
    setCustomizationControls(false);
  } catch (error) {
    document.getElementById("quote-link-url").value = "Unable to load quote link.";
    document.getElementById("quote-link-embed").value = "Unable to load embed code.";
    setQuoteLinkStatus("Could not load quote link settings. Check the client_settings table.", "error");
    setCustomizationStatus("Could not load customization fields.", "error");
  }
}

const logoutButton = document.getElementById("logout-button");

if (logoutButton) {
  logoutButton.addEventListener("click", async function () {
    await supabaseClient.auth.signOut();
    window.location.href = "login.html";
  });
}

initQuoteLinkPage();
