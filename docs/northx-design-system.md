# NorthX Design System

NorthX is a daily command center for local service businesses. The interface should feel calm, premium, dependable, and easy to scan while still supporting dense business workflows.

## Visual Principles

- Use neutral app backgrounds, white surfaces, subtle borders, and restrained blue-purple accents.
- Make the next useful action obvious without making every action look primary.
- Keep headings compact inside the authenticated app.
- Prefer clear business language over technical implementation terms.
- Build new pages from shared shell, page, card, table, form, badge, empty, loading, modal, and dropdown patterns.

## File Structure

- `public/css/tokens.css`: semantic color, type, spacing, sizing, radius, shadow, and timing tokens.
- `public/css/base.css`: authenticated app base styles, typography, and focus states.
- `public/css/layout.css`: app shell, page container, page header, section header, and grid layouts.
- `public/css/components.css`: buttons, icon buttons, cards, metrics, badges, tables, forms, modals, empty states, skeletons, alerts, and toasts.
- `public/css/utilities.css`: restrained flex/grid/stack/text helpers.
- `public/css/responsive.css`: shared desktop, tablet, and mobile behavior.
- `public/css/northx-design-system.css`: imports the full design system.
- `public/js/app-shell.js`: renders the authenticated shell and injects the design system.
- `public/js/northx-ui.js`: optional framework-free HTML helpers.

## Token Usage

Use semantic tokens such as `--color-bg-app`, `--color-bg-surface`, `--color-border`, `--color-text-primary`, `--color-brand-primary`, `--color-success-soft`, and `--space-4`. Avoid new raw hex values in page-specific CSS unless a unique visual asset genuinely requires one.

Typography uses `Inter` with compact app sizes:

- Page title: `--font-size-page-title`
- Section title: `--font-size-section-title`
- Card title: `--font-size-card-title`
- Body: `--font-size-body`
- Label/caption: `--font-size-label` and `--font-size-caption`

Spacing should come from `--space-1` through `--space-12`. Radius should come from `--radius-sm`, `--radius-md`, `--radius-lg`, `--radius-xl`, or `--radius-pill`.

## Standard Page Pattern

```html
<aside class="sidebar"></aside>
<main class="dashboard-main">
  <div class="nx-page-container nx-page-stack">
    <header class="page-header">
      <div class="page-header-row">
        <div>
          <p class="eyebrow">Section</p>
          <h1>Page Title</h1>
          <p class="page-subtitle">Short outcome-focused description.</p>
        </div>
        <div class="topbar-actions">
          <a class="primary-action" href="#">Primary Action</a>
        </div>
      </div>
    </header>

    <section class="dashboard-panel">
      <div class="panel-header">
        <div>
          <h2>Section Title</h2>
          <p>Helpful explanation.</p>
        </div>
      </div>
    </section>
  </div>
</main>
```

## Component Standards

Buttons:

- Primary: `.primary-action` or `.nx-btn nx-btn-primary`
- Secondary: `.secondary-action` or `.nx-btn nx-btn-secondary`
- Ghost/tertiary: `.nx-btn nx-btn-ghost`
- Danger: `.nx-btn nx-btn-danger`
- Icon-only: `.nx-icon-btn` with `aria-label`

Cards:

- Standard: `.nx-card` or existing `.dashboard-panel`
- Compact: `.nx-card nx-card-compact`
- Metric: `.metric-card` with `.metric-icon`
- Highlighted: `.nx-card nx-card-highlighted`
- Warning: `.nx-card nx-card-warning`
- Empty state: `.nx-empty-state`

Badges:

- Neutral: `.nx-badge`
- New/active/info: `.nx-badge nx-badge-new`
- Success/completed: `.nx-badge nx-badge-success`
- Warning/paused: `.nx-badge nx-badge-warning`
- Danger: `.nx-badge nx-badge-danger`

Tables:

Use `.nx-table-wrap` around `.nx-table`. Existing `.table-wrap` and `.leads-table` are mapped to the same system for safe migration.

Forms:

Use real labels, `for` attributes when possible, `.nx-input`, `.nx-select`, `.nx-textarea`, `.nx-help-text`, and `.nx-validation-message`. Never expose raw Supabase or JavaScript errors to customers.

Modals:

Use `.nx-modal` and `.nx-modal-card`, or existing `.lead-modal` and `.lead-modal-card` while migrating. Icon close buttons need `aria-label`.

## Language Standards

Write like a calm operator helping a business owner make decisions.

Prefer:

- `Recover Missed Calls`
- `Upcoming Follow-Ups`
- `Customer Activity`
- `Bring Customers Back`
- `Needs Your Attention`
- `Revenue Opportunities`

Avoid:

- Raw database names
- Webhook/API terminology
- Automation IDs
- Vague labels like `Tools` or `Miscellaneous`
- Excessive exclamation marks

## Responsive Rules

- Desktop: full sidebar, multi-column dashboards, full tables.
- Tablet: collapse multi-column grids predictably, allow filters to wrap.
- Mobile: hide sidebar, use mobile drawer, stack page headers/actions, keep buttons tap-friendly, let modals use near-full-screen height.

Do not add page-specific mobile fixes until shared responsive utilities are insufficient.

## What Not To Do

- Do not create new card, button, badge, table, or modal styles for each page.
- Do not use oversized app headings for ordinary dashboard panels.
- Do not mix emoji, one-off inline SVG, and unrelated icon styles.
- Do not scatter brand gradients across routine actions.
- Do not use raw hex values when a semantic token exists.
