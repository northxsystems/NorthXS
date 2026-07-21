# Homepage Redesign Notes

## Audit Summary

The previous public homepage positioned NorthX as `AI-Powered Lead Recovery` and sold disconnected capabilities: chatbot, quote intake, SMS campaigns, customer timeline, and missed-call text-back. That no longer matched the product direction established by the new Overview and sidebar.

The homepage had these issues:

- Messaging led with AI/features instead of business outcomes.
- Pricing used three old plans: Starter, Growth, and AI Front Desk.
- The hero visual was a small missed-call card rather than the product command center.
- Navigation used Services/Demo/Contact language rather than Product/How It Works/Solutions/Pricing.
- The page did not explain how NorthX replaces several disconnected tools.
- There were no real product screenshot image assets in the repo.
- The public contact form had no connected backend script.

## New Homepage Direction

The redesigned page positions NorthX as the operating system for local service businesses. It now explains consolidation, daily business command, lead and customer workflows, revenue recovery, automation, campaigns, roadmap integrations, pricing, FAQ, and final CTA.

## Pricing Data

Homepage pricing is rendered from `public/js/pricing-config.js` so plan names, prices, SMS allowances, and feature lists are not scattered through the homepage HTML.

## Current Placeholders and Roadmap Labels

- Product visuals are controlled HTML/CSS previews based on the current Overview direction because no screenshot assets were present in the repo.
- Email campaigns are labeled `Coming soon`.
- AI Business Manager is labeled `Coming to Pro`.
- Facebook, Instagram, advertising, payment, and accounting integrations are labeled `Planned`.
- The public demo form is still not connected to a production booking backend in this repo. The script gives a clear status instead of pretending a request was submitted.
- Footer Privacy and Terms links are intentional placeholders because no Privacy or Terms routes exist in the current project.
