# NorthX Remaining Page Migration Checklist

Use this checklist after the Stage 1 foundation. Complexity estimates assume current static HTML/CSS/JS architecture remains in place.

| Page | Existing issues | Adopt next | Complexity | Functionality risk |
| --- | --- | --- | --- | --- |
| `dashboard.html` | Mostly aligned with approved Overview direction; still has page-specific component names. | Keep as source of truth, replace local classes with shared aliases over time. | Low | Medium because realtime overview data is active. |
| `messages.html` | SMS language is technical; forms, dropdown, tabs, and tables use custom classes. | PageHeader, FilterBar, DataTable, shared form controls, dropdown, badges, outcome copy. | Medium | High because SMS settings and scheduled message creation must stay intact. |
| `leads.html` | Migrated representative shell/header/table/modal/form surface; generated rows still plain status text. | StatusBadge helper and responsive row-card fallback. | Low | Medium because notes save flow is user-facing. |
| `customers.html` | Customer table, detail modal, and mini lists use one-off styles. | Customer Summary Panel, DataTable, Modal, ActivityItem. | Medium | High because customer notes/history cross-link records. |
| `customer-details.html` | Separate CSS file and timeline details can drift from app shell. | Customer/Lead Summary Panel, ActivityItem, SectionHeader, shared cards. | Medium | High because it combines lead/customer/quote data. |
| `quote-requests.html` | Multiple modal patterns, quote builder controls, inline status buttons, and duplicated table actions. | DataTable, Modal, StatusBadge, shared form grid, Button variants, ErrorState. | High | High because quote PDF generation and status updates are complex. |
| `quote-link.html` | Growth/settings hybrid page; brand customization controls use one-off layout. | PageHeader, Form controls, EmptyState, Copy button pattern, Status messages. | Medium | Medium because Supabase storage upload must stay untouched. |
| `quote-intake.html` | Public intake style intentionally differs but uses separate CSS and raw values. | Public form token bridge, shared form focus/error styles where brand-safe. | Medium | High because anon quote submission is public. |
| `chatbot.html` | Automation/settings page with embed copy and custom controls. | AutomationCard, Form controls, Code/Copy card pattern, Toast. | Medium | Medium because embed settings must remain stable. |
| `chatbot-widget.html` | Public embedded widget should stay isolated from authenticated app styling. | Separate public-widget tokens only. | Low | High because external embeds can break if globals leak. |
| `calendar.html` | Likely foundation page with sparse state. | PageHeader, EmptyState, ActivityItem, FilterBar. | Low | Low. |
| `automations.html` | Redirect/foundation page; old SMS automation language may linger. | AutomationCard and outcome naming. | Low | Low. |
| `growth.html` | Mixed quote-link/campaign direction likely needs IA cleanup. | PageHeader, AutomationCard, MetricCard, EmptyState. | Medium | Medium. |
| `analytics.html` | Needs consistent metric and chart containers. | MetricCard, DataTable, SectionHeader, LoadingState. | Medium | Medium because reporting queries can be brittle. |
| `settings.html` | Account/PDF settings use forms and status messages with custom styles. | PageHeader, SectionHeader, Form controls, Status/Toast, account card pattern. | Medium | High because settings writes affect branded quotes. |
| `plans.html` | Billing display uses plan cards and usage bars with custom treatment. | Card variants, MetricCard, Progress/Usage pattern. | Low | Medium because plan/SMS usage must stay correct. |
| `contact.html` | Support form duplicates public/app form styles. | PageHeader, shared form controls, ErrorState, Success toast. | Low | Medium. |
| `login.html` | Auth page has dark public styling and can remain distinct. | Optional auth-specific tokens later. | Low | High because auth flow must not regress. |

## Safe Migration Order

1. Finish Leads generated row badges and mobile table fallback.
2. Migrate Settings form/status patterns.
3. Migrate Messages table, dropdown, and scheduled-message form.
4. Migrate Quote Requests modals and quote builder controls.
5. Migrate Customers and Customer Details together.
6. Normalize Growth, Automations, Analytics, Plans, and Contact.
7. Review public quote intake and chatbot widget separately.
