(function () {
  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function icon(name) {
    return `<i data-lucide="${escapeHtml(name)}" aria-hidden="true"></i>`;
  }

  function badge(label, variant = "neutral") {
    return `<span class="nx-badge nx-badge-${escapeHtml(variant)}">${escapeHtml(label)}</span>`;
  }

  function emptyState({ iconName = "circle-help", title, message, actionHref, actionLabel }) {
    const action = actionHref && actionLabel
      ? `<a class="primary-action" href="${escapeHtml(actionHref)}">${escapeHtml(actionLabel)}</a>`
      : "";

    return `
      <div class="nx-empty-state">
        <span class="nx-metric-icon">${icon(iconName)}</span>
        <strong>${escapeHtml(title)}</strong>
        <span>${escapeHtml(message)}</span>
        ${action}
      </div>
    `;
  }

  function pageLoading(message = "Loading your workspace...") {
    return `
      <div class="nx-empty-state" aria-live="polite">
        <span class="nx-skeleton" style="width: 42px; height: 42px;"></span>
        <strong>${escapeHtml(message)}</strong>
        <span class="nx-skeleton" style="width: min(100%, 320px); height: 12px;"></span>
      </div>
    `;
  }

  window.NorthXUI = {
    badge,
    emptyState,
    escapeHtml,
    icon,
    pageLoading
  };
})();
