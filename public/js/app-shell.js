(function () {
  const designSystemHref = "css/northx-design-system.css";

  const navItems = [
    { key: "overview", label: "Overview", href: "dashboard.html", icon: "layout-dashboard" },
    { key: "inbox", label: "Inbox", href: "messages.html", icon: "inbox" },
    { key: "leads", label: "Leads", href: "leads.html", icon: "users-round" },
    { key: "customers", label: "Customers", href: "customers.html", icon: "contact-round" },
    { key: "pipeline", label: "Pipeline", href: "quote-requests.html", icon: "kanban-square" },
    { key: "calendar", label: "Calendar", href: "calendar.html", icon: "calendar-days" },
    { key: "automations", label: "Automations", href: "automations.html", icon: "workflow" },
    { key: "growth", label: "Growth", href: "growth.html", icon: "trending-up" },
    { key: "analytics", label: "Analytics", href: "analytics.html", icon: "chart-no-axes-combined" }
  ];

  const pathMap = {
    "dashboard.html": "overview",
    "messages.html": "inbox",
    "leads.html": "leads",
    "customers.html": "customers",
    "customer-details.html": "customers",
    "quote-requests.html": "pipeline",
    "quote-link.html": "growth",
    "calendar.html": "calendar",
    "automations.html": "automations",
    "chatbot.html": "automations",
    "growth.html": "growth",
    "analytics.html": "analytics",
    "settings.html": "settings",
    "plans.html": "settings",
    "contact.html": "settings"
  };

  function getActiveSection() {
    const explicit = document.body.dataset.section;
    if (explicit) return explicit;

    const page = window.location.pathname.split("/").pop() || "dashboard.html";
    return pathMap[page] || "overview";
  }

  function createIcon(name) {
    return `<i data-lucide="${name}" aria-hidden="true"></i>`;
  }

  function ensureDesignSystemStyles() {
    const existing = Array.from(document.styleSheets).some((sheet) => {
      return sheet.href && sheet.href.endsWith(designSystemHref);
    });

    if (existing || document.querySelector(`link[href="${designSystemHref}"]`)) return;

    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = designSystemHref;
    document.head.appendChild(link);
  }

  function navMarkup(activeSection) {
    return navItems.map((item) => {
      const isActive = item.key === activeSection;
      const badge = item.badge ? `<span class="nav-badge">${item.badge}</span>` : "";
      return `
        <a href="${item.href}" class="${isActive ? "active" : ""}" data-nav-key="${item.key}">
          ${createIcon(item.icon)}
          <span>${item.label}</span>
          ${badge}
        </a>
      `;
    }).join("");
  }

  function renderShell() {
    ensureDesignSystemStyles();
    document.body.classList.add("nx-shell-ready");

    const activeSection = getActiveSection();
    const existingSidebar = document.querySelector(".sidebar");

    if (existingSidebar) {
      existingSidebar.classList.add("nx-app-sidebar");
      existingSidebar.innerHTML = `
        <div class="sidebar-main">
          <a href="dashboard.html" class="sidebar-brand" aria-label="NorthX Overview">
            <span class="brand-mark">NX</span>
            <span>
              <strong>NorthX</strong>
              <small>Operating System</small>
            </span>
          </a>

          <div class="workspace-card">
            <span>Workspace</span>
            <strong id="shell-workspace-name">Local Service Business</strong>
          </div>

          <nav class="sidebar-nav" aria-label="NorthX navigation">
            ${navMarkup(activeSection)}
          </nav>
        </div>

        <div class="sidebar-footer">
          <a href="settings.html" class="user-profile-link">
            ${createIcon("circle-user-round")}
            <span>
              <strong id="shell-account-name">Business Owner</strong>
              <small>Settings and account</small>
            </span>
          </a>
          <button id="logout-button" class="sidebar-logout" type="button">
            ${createIcon("log-out")}
            <span>Logout</span>
          </button>
        </div>
      `;
    }

    if (!document.querySelector(".mobile-shell-bar")) {
      const mobileBar = document.createElement("div");
      mobileBar.className = "mobile-shell-bar";
      mobileBar.innerHTML = `
        <a href="dashboard.html" class="mobile-brand">
          <span class="brand-mark">NX</span>
          <strong>NorthX</strong>
        </a>
        <button type="button" id="mobile-nav-toggle" aria-expanded="false" aria-controls="mobile-nav-drawer">
          ${createIcon("menu")}
          <span>Menu</span>
        </button>
      `;
      document.body.prepend(mobileBar);
    }

    if (!document.querySelector("#mobile-nav-drawer")) {
      const drawer = document.createElement("div");
      drawer.id = "mobile-nav-drawer";
      drawer.className = "mobile-nav-drawer";
      drawer.innerHTML = `
        <div class="mobile-drawer-header">
          <strong>Navigation</strong>
          <button type="button" id="mobile-nav-close" aria-label="Close menu">
            ${createIcon("x")}
          </button>
        </div>
        <nav class="mobile-nav-list" aria-label="Mobile navigation">
          ${navMarkup(activeSection)}
        </nav>
        <a href="settings.html" class="user-profile-link mobile-account-link">
          ${createIcon("circle-user-round")}
          <span>
            <strong>Settings</strong>
            <small>Account and workspace</small>
          </span>
        </a>
      `;
      document.body.appendChild(drawer);
    }

    const toggle = document.getElementById("mobile-nav-toggle");
    const close = document.getElementById("mobile-nav-close");
    const drawer = document.getElementById("mobile-nav-drawer");

    function setDrawer(open) {
      drawer.classList.toggle("open", open);
      toggle.setAttribute("aria-expanded", String(open));
      document.body.classList.toggle("mobile-nav-open", open);
    }

    if (toggle && drawer) {
      toggle.addEventListener("click", () => setDrawer(!drawer.classList.contains("open")));
    }

    if (close) {
      close.addEventListener("click", () => setDrawer(false));
    }

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") setDrawer(false);
    });

    if (window.lucide) {
      window.lucide.createIcons();
    }
  }

  renderShell();
})();
