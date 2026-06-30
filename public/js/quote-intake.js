let activeClientSettings = null;

const quoteIntakeForm = document.getElementById("quote-intake-form");

function getFieldValue(id) {
  return document.getElementById(id).value.trim();
}

function setSubmitState(button, isSubmitting) {
  button.disabled = isSubmitting;
  button.textContent = isSubmitting ? "Submitting..." : "Submit Quote Request";
}

function getCompanySlugFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get("company");
}

function normalizeUrl(url) {
  if (!url) return "";
  if (/^https?:\/\//i.test(url)) return url;
  return `https://${url}`;
}

function setAccentColor(accentColor) {
  const color = accentColor || "#4f8cff";
  const submitButton = quoteIntakeForm ? quoteIntakeForm.querySelector("button[type='submit']") : null;
  const eyebrow = document.getElementById("quote-intake-eyebrow");

  if (submitButton) {
    submitButton.style.background = color;
  }

  if (eyebrow) {
    eyebrow.style.color = color;
  }
}

function renderBusinessContact(settings) {
  const contactWrap = document.getElementById("quote-business-contact");

  if (!contactWrap) return;

  contactWrap.innerHTML = "";

  if (settings.business_phone) {
    const phoneLink = document.createElement("a");
    phoneLink.href = `tel:${settings.business_phone}`;
    phoneLink.textContent = settings.business_phone;
    contactWrap.appendChild(phoneLink);
  }

  if (settings.business_email) {
    const emailLink = document.createElement("a");
    emailLink.href = `mailto:${settings.business_email}`;
    emailLink.textContent = settings.business_email;
    contactWrap.appendChild(emailLink);
  }

  if (settings.business_website) {
    const websiteLink = document.createElement("a");
    const websiteUrl = normalizeUrl(settings.business_website);
    websiteLink.href = websiteUrl;
    websiteLink.target = "_blank";
    websiteLink.rel = "noopener";
    websiteLink.textContent = settings.business_website;
    contactWrap.appendChild(websiteLink);
  }

  contactWrap.classList.toggle("visible", contactWrap.children.length > 0);
}

function applyClientSettings(settings) {
  const companyName = settings.company_name || "Tell us what you need help with";
  const logo = document.getElementById("quote-company-logo");

  document.title = `Get a Quote | ${companyName}`;
  document.getElementById("quote-intake-heading").textContent = companyName;
  document.getElementById("quote-intake-subtitle").textContent =
    settings.form_intro || "Fill out the details below and the team will review your request.";

  if (logo) {
    logo.src = settings.logo_url || "";
    logo.classList.toggle("visible", Boolean(settings.logo_url));
  }

  setAccentColor(settings.accent_color);
  renderBusinessContact(settings);
}

function hideUnavailableForm(message) {
  const card = document.querySelector(".quote-intake-card");

  if (!card) return;

  card.innerHTML = `
    <p class="eyebrow">Quote Request</p>
    <h1>Form unavailable</h1>
    <p class="quote-intake-subtext">${message}</p>
  `;
}

async function loadClientFromCompanySlug() {
  const companySlug = getCompanySlugFromUrl();
  const submitButton = quoteIntakeForm ? quoteIntakeForm.querySelector("button[type='submit']") : null;

  if (submitButton) {
    submitButton.disabled = true;
    submitButton.textContent = "Loading...";
  }

  if (!companySlug) {
    hideUnavailableForm("This quote request link is missing a company identifier.");
    return;
  }

  const { data, error } = await supabaseClient
    .from("client_settings")
    .select("*")
    .eq("company_slug", companySlug)
    .eq("quote_form_enabled", true)
    .maybeSingle();

  if (error) {
    console.error("Error loading client settings for quote form:", {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
      raw: error
    });
    hideUnavailableForm("Could not load this quote request form.");
    return;
  }

  if (!data) {
    hideUnavailableForm("This quote request form is not available.");
    return;
  }

  activeClientSettings = data;
  applyClientSettings(activeClientSettings);

  if (submitButton) {
    submitButton.disabled = false;
    submitButton.textContent = "Submit Quote Request";
  }
}

if (quoteIntakeForm) {
  quoteIntakeForm.addEventListener("submit", async function (event) {
    event.preventDefault();

    if (!activeClientSettings) {
      alert("This quote request form is still loading. Please try again.");
      return;
    }

    const submitButton = quoteIntakeForm.querySelector("button[type='submit']");

    setSubmitState(submitButton, true);

    const payload = {
      client_id: activeClientSettings.client_id,
      customer_name: getFieldValue("quote-name"),
      phone: getFieldValue("quote-phone"),
      email: getFieldValue("quote-email") || null,
      service_requested: getFieldValue("quote-service-requested"),
      trade: getFieldValue("quote-trade") || null,
      urgency: getFieldValue("quote-urgency") || null,
      address: getFieldValue("quote-address") || null,
      problem_description: getFieldValue("quote-description"),
      status: "new"
    };

    const { error } = await supabaseClient
      .from("quote_requests")
      .insert(payload);

    setSubmitState(submitButton, false);

    if (error) {
      console.error("Quote request Supabase insert failed:", {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code,
        raw: error
      });
      alert("Could not submit your quote request. Please try again.");
      return;
    }

    quoteIntakeForm.reset();
    alert("Quote request submitted. The team will review it shortly.");
  });
}

loadClientFromCompanySlug();
