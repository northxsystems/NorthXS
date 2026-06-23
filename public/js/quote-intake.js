const NORTHX_QUOTE_CLIENT_ID = "demo-client";

const quoteIntakeForm = document.getElementById("quote-intake-form");

function getFieldValue(id) {
  return document.getElementById(id).value.trim();
}

function setSubmitState(button, isSubmitting) {
  button.disabled = isSubmitting;
  button.textContent = isSubmitting ? "Submitting..." : "Submit Quote Request";
}

if (quoteIntakeForm) {
  quoteIntakeForm.addEventListener("submit", async function (event) {
    event.preventDefault();

    const submitButton = quoteIntakeForm.querySelector("button[type='submit']");

    setSubmitState(submitButton, true);

    const payload = {
      client_id: NORTHX_QUOTE_CLIENT_ID,
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

    console.log(
      "Submitting quote request payload:",
      JSON.stringify(payload, null, 2)
    );

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
      console.error(
        "Quote request Supabase insert failed JSON:",
        JSON.stringify(error, null, 2)
      );
      alert("Could not submit your quote request. Please try again.");
      return;
    }

    console.log("Quote request inserted successfully.");

    quoteIntakeForm.reset();
    alert("Quote request submitted. The NorthX team will review it shortly.");
  });
}
