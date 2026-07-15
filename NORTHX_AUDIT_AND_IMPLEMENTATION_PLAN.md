# NorthX Platform Audit and Redesign Plan

## Current Architecture

NorthX is currently a static HTML/CSS/JavaScript application with one public landing page and multiple authenticated client portal pages in `public/`.

Authentication and client data separation are handled in page-level JavaScript:

- Supabase client is initialized in `public/js/config.js`.
- Authenticated pages call `supabaseClient.auth.getSession()`.
- Most client data is scoped through `profiles.client_id`.
- Logout uses `supabaseClient.auth.signOut()` and redirects to `login.html`.
- Realtime subscriptions are used on leads, quote requests, scheduled messages, messages, and dashboard tables.

The app should stay in the current stack for now. The redesign should add shared structure and reusable UI patterns without replacing the working Supabase integration.

## Existing Pages and Capabilities

| Existing page | Current role | Existing backend/data | New product section |
| --- | --- | --- | --- |
| `dashboard.html` | Client dashboard | `profiles`, `leads`, `quote_requests`, `quotes`, `messages`, PDF settings | Overview |
| `messages.html` | SMS settings, message history, scheduled SMS | `client_sms_settings`, `messages`, `scheduled_messages`, `leads`, `customer_timeline` | Inbox, Growth, Automations |
| `leads.html` | Lead table and lead details redirect | `leads` | Leads |
| `customers.html` | Customer directory, notes, quote history, timeline | `customers`, `quote_requests`, `quotes`, `customer_notes` | Customers |
| `customer-details.html` | Unified lead/customer/quote detail timeline | leads, customers, quotes, quote requests, notes, timeline | Customer / Lead profile |
| `quote-requests.html` | Quote request review, quote builder, PDF download, quote follow-up | `quote_requests`, `quotes`, `scheduled_messages`, `client_quote_pdf_settings`, `customer_timeline` | Pipeline |
| `quote-link.html` | Branded quote request link setup | `client_settings`, Supabase storage `client-logos` | Growth / Settings |
| `quote-intake.html` | Public quote intake | `client_settings`, `quote_requests`, optional timeline | Public capture flow |
| `chatbot.html` | Website chatbot settings and embed code | `chatbot_settings` | Automations / Growth / Settings |
| `chatbot-widget.html/js/css` | Public chatbot widget | `chatbot_settings`, `chatbot_conversations`, `chatbot_messages`, `quote_requests`, `leads` | Public capture flow / Inbox |
| `plans.html` | Billing plan display and SMS usage | `profiles` | Settings / Billing |
| `settings.html` | Quote PDF settings and account info | `client_quote_pdf_settings` | Settings |
| `contact.html` | Support contact | `contact_requests` or support flow if configured | Settings / Support |
| `automations.html` | Redirect to SMS Control Center | none directly | Automations |
| `login.html` | Supabase login | Supabase Auth | Auth |

## Existing Data Model and Integrations

Known tables used by the frontend:

- `profiles`: user profile, `client_id`, plan, SMS usage.
- `leads`: captured leads and missed call records.
- `messages`: SMS activity.
- `scheduled_messages`: scheduled SMS, quote follow-ups, campaign-like follow-ups.
- `client_sms_settings`: missed call auto-reply copy.
- `quote_requests`: website quote intake submissions.
- `quotes`: saved quote records and line items.
- `client_quote_pdf_settings`: quote PDF branding/defaults.
- `customers`: customer records auto-linked from quote requests.
- `customer_notes`: internal notes.
- `customer_timeline`: human-readable customer activity.
- `client_settings`: quote-link branding and public quote intake settings.
- `chatbot_settings`, `chatbot_conversations`, `chatbot_messages`: website assistant configuration and public conversations.

Important preservation notes:

- Do not change `profiles.client_id` assumptions without a migration plan.
- `customer_timeline.client_id` intentionally stores `auth.users.id` in existing code and SQL comments.
- Quote follow-ups reuse `scheduled_messages` with `message_type = 'quote_follow_up'`.
- Quote PDF generation is browser-side via jsPDF in `quote-requests.js`.
- Public quote and chatbot intake rely on anon insert policies and should not be disrupted.

## New Information Architecture Mapping

Primary navigation:

- Overview: new command center built from current dashboard data.
- Inbox: unified communication center; initially maps to current `messages.html` and should later include chatbot conversations.
- Leads: existing `leads.html`, redesigned around opportunity follow-up.
- Customers: existing `customers.html` and `customer-details.html`.
- Pipeline: quote requests, quote builder, open quote value, follow-up due work; initially maps to `quote-requests.html`.
- Calendar: foundation page using `scheduled_messages` and future appointments/jobs.
- Automations: outcome-based automation center; current SMS scheduling, missed-call recovery, quote follow-up, chatbot settings are capabilities.
- Growth: campaigns and customer reactivation; current scheduled SMS and quote link tools move here.
- Analytics: business-question reporting; initially built from leads, quotes, messages, and scheduled messages.
- Settings: business profile, messaging, quote PDF settings, chatbot/embed, billing, account/security.

## Implementation Phases

### Phase 1: Foundation

- Add shared app shell for authenticated portal pages.
- Replace duplicated sidebar markup with a shared sidebar/navigation renderer.
- Add a design-system layer for layout, cards, badges, empty states, tables, buttons, and responsive behavior.
- Rebuild `dashboard.html` and `dashboard.js` into the new Overview command center using existing Supabase queries.

### Phase 2: Core Daily Workflow

- Redesign Inbox, Leads, Customers, and Pipeline around business outcomes.
- Keep existing page scripts connected while improving layout and language.
- Move quote requests and quote builder into Pipeline.
- Make lead/customer detail views feel like one timeline-driven record.

### Phase 3: Operating Tools

- Build Calendar foundation from `scheduled_messages`.
- Convert Automations to outcome cards and keep technical setup behind secondary panels.
- Build Growth around campaign goals and existing SMS scheduling.
- Add Analytics with clear takeaways from existing data.
- Reorganize Settings into business-friendly sections.

### Phase 4: Cleanup and Verification

- Remove obsolete top-level navigation for technical tools.
- Keep old URLs as redirects or compatibility pages where needed.
- Test auth redirects, logout, client scoping, realtime updates, quote PDF generation, public quote intake, chatbot embed, and mobile layouts.

