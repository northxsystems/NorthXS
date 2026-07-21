(function () {
  const menuToggle = document.getElementById("mobile-menu-toggle");
  const menu = document.getElementById("marketing-menu");
  const pricingGrid = document.getElementById("pricing-grid");
  const pricingComparison = document.getElementById("pricing-comparison");
  const contactForm = document.getElementById("contact-form");
  const contactStatus = document.getElementById("contact-status");

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  if (menuToggle && menu) {
    menuToggle.addEventListener("click", () => {
      const isOpen = menu.classList.toggle("open");
      menuToggle.setAttribute("aria-expanded", String(isOpen));
    });

    menu.querySelectorAll("a").forEach((link) => {
      link.addEventListener("click", () => {
        menu.classList.remove("open");
        menuToggle.setAttribute("aria-expanded", "false");
      });
    });
  }

  function renderPricing() {
    const config = window.NORTHX_PRICING;
    if (!config || !pricingGrid || !pricingComparison) return;

    pricingGrid.innerHTML = config.plans.map((plan) => `
      <article class="pricing-card-new ${plan.featured ? "featured" : ""}">
        ${plan.featured ? '<span class="plan-pill">Most complete</span>' : ""}
        <p class="plan-name">${escapeHtml(plan.name)}</p>
        <h3>${escapeHtml(config.currency)}${escapeHtml(plan.price)}<span>${escapeHtml(config.billingInterval)}</span></h3>
        <p>${escapeHtml(plan.positioning)}</p>
        <strong class="sms-allowance">${escapeHtml(plan.smsAllowance)}</strong>
        <ul>
          ${plan.features.map((feature) => `<li>${escapeHtml(feature)}</li>`).join("")}
        </ul>
        <a href="${escapeHtml(plan.href)}" class="${plan.featured ? "primary-action" : "secondary-action"}">${escapeHtml(plan.cta)}</a>
      </article>
    `).join("");

    pricingComparison.innerHTML = `
      <strong>Simple comparison</strong>
      <p>Starter gives small businesses the core operating system for leads, customers, quotes, missed-call recovery, and basic follow-up. Pro expands NorthX into the fuller company command center with advanced automations, campaigns, analytics, more users, and priority support.</p>
      <span>${escapeHtml(config.smsOverageNote)}</span>
    `;
  }

  renderPricing();

  if (contactForm && contactStatus) {
    contactForm.addEventListener("submit", (event) => {
      event.preventDefault();
      contactStatus.textContent = "Thanks. Demo scheduling is currently handled directly; NorthX will connect this request to the active booking workflow before launch.";
      contactForm.reset();
    });
  }
})();
