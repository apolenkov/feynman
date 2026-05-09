Before touching any pixels, I'd want to understand the *why* behind the redesign and the constraints around it. Here's what I'd ask first, roughly in priority order:

## 1. Goals & Motivation
- **Why redesign now?** Is the current page broken, ugly, confusing, off-brand, or missing functionality? Or is this part of a broader rebrand?
- **What does success look like?** Fewer support tickets? Higher plan upgrades? Lower churn on the page? Faster checkout? "Looks better" is hard to measure — pick something you can.
- **What's failing today?** Do you have analytics, session recordings, or support themes that point to specific pain points?

## 2. Audience & Use Cases
- **Who uses this page?** End users on a self-serve plan, finance teams at enterprise customers, admins managing seats, or all of the above?
- **What are they actually trying to do here?** The big jobs usually split into: view current plan, change plan, update payment method, download invoices, manage seats, see usage, handle a failed payment.
- **Which of those jobs matter most?** Optimize for the top 1–2; let the rest be discoverable but not loud.

## 3. Business Model Realities
- **What plans/pricing structures exist?** Flat tiers, usage-based, hybrid, add-ons, annual vs. monthly, regional pricing?
- **What can users self-serve vs. what requires sales/support?** Cancellations, downgrades, refunds, plan changes mid-cycle — each has a UX implication.
- **Are there compliance constraints?** Tax display, currency, GDPR, SCA/3DS, invoicing requirements per region.

## 4. Current State
- **Can I see the current page** (screenshots or a link)? And the surrounding flows it connects to (signup, settings, admin)?
- **What's the tech stack and design system?** Are you working inside an existing component library or starting fresh? This shapes how ambitious the redesign can be.
- **What does your payment provider give you?** Stripe Customer Portal, Chargebee, Paddle, or fully custom — each constrains what you build vs. embed.

## 5. Scope & Constraints
- **Is this a visual refresh or an information-architecture overhaul?** They're very different projects.
- **What's the timeline and team size?** A two-week polish and a two-quarter rebuild start from very different places.
- **What's explicitly out of scope?** Worth naming, so the redesign doesn't quietly grow.

---

If I had to pick the **single most important question** to start with, it would be: **what specific user behavior or business metric are you trying to change?** Everything else — layout, components, tone, density — is downstream of that answer. A page optimized for "reduce involuntary churn from failed cards" looks different from one optimized for "increase annual plan adoption," even if both are "the billing page."

Want to start there, and I can help you work backward into the design?
