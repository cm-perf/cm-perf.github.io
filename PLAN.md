# CM Performance website redesign — plan

Status: **planned, not built.** Resume from here. Branch for the cleanup/redesign work:
`brand-cleanup-cmperf` (already has the new CM favicon set staged).

## Brief (owner, 2026-10-11)

> Standout, formal, clean and compact. We're an engineering company, no fancy business.

Decided:
- Brand mark: **new CM monogram** (white C, orange M, Barlow Condensed italic 900) across
  favicon, apple-touch-icon and email. Source: `../N20-428i-1BC9-secondary-limiter/marketing/cm-logo.html`.
- Deploy target: **cmperf.uk apex** (GitHub Pages custom domain).
- Apply website changes via a **branch + PR**, never straight to the live site.

## What CM Performance does (what the site must convey)

BMW diagnostics; retrofit & coding; product development (FlameLink, Performance Tracker,
PCBs/firmware, mobile apps); ECU / performance engineering (2-step rev limiters, Bootmod3 maps
for N20/N26/N55/S55). "We build systems that don't exist yet for BMW." Ghana based, worldwide
product. Track/race tuning, not street.

Read like a **precision instrument spec sheet**, not a tuning-shop flyer.

## Design direction — "engineering document"

- Monochrome base, one accent. Near-black + off-white; a single orange (`#e85d04`) used
  sparingly (one word, a rule, a live value). Restraint = confidence.
- Two typefaces, both technical: a clean grotesque for text (Geist, already in use) + a
  **monospace** for labels, specs, part numbers, data (`N20 · N26 · N55 · S55`, `CAN 500kbps`,
  `v1.5`). The monospace is what makes it read as engineering.
- Hard grid, tight spacing, thin hairline rules between sections — like a datasheet. Compact,
  dense, no giant hero gaps.
- Specs over adjectives. Each capability is a line item with a concrete detail, not a hype
  paragraph.
- CM monogram as the mark, small, top-left.
- Real artifacts as proof (gallery flames, a Bootmod3 screenshot, a PCB/firmware photo) shown
  small and captioned like figures, not glossy banners.

## Structure (single page, anchored nav, compact)

1. Header — CM mark · nav (Work / Capabilities / Products / Contact) · "Ghana · worldwide".
2. Statement — one tight sentence: what we build, for BMW. No video wall.
3. Capabilities — 4 hairline-ruled line items: Diagnostics · Retrofit & Coding · Product
   Development · Performance Engineering; each one line + a spec detail.
4. Products — FlameLink and Performance Tracker as two spec cards (what it is, key figures,
   status: shipping / in development).
5. Selected work — a few captioned figures (flames, a map, a board).
6. Contact — domain email, hours, location.

## Open decisions before building

- Site email: move off Gmail to the domain — proposed `contact@cmperf.uk` (add Cloudflare
  routing to the Gmail inbox, like `maps@cmperf.uk`). Confirm the exact address.
- Single page only, or dedicated pages for FlameLink/Products? Proposed: one page + keep the
  existing `flink/` microsite.
- Tuning tone: feature the 2-step / Bootmod3 work publicly, or keep it to the service side?
  It is track-only, so wording matters.

## Next step

Build the new homepage as a prototype on `brand-cleanup-cmperf`, review via PR, iterate.
Nothing touches the live site until approved. The favicon cleanup (CM monogram icons, fix the
missing favicon links on the `flink/` subpages, add the apex `CNAME`) folds into the same PR.
