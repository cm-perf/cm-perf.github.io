# Markdown blog

Write posts in `content/posts/<url-slug>.md`. Run `npm run build`; the existing
website build produces `/blog/`, one static page per post, an RSS feed and sitemap
entries. No blog server, database or browser Markdown runtime is required.

Each post also gets an automatic 1200×630 PNG share card with its title, tag,
date, CM branding and optional cover photo. OpenGraph/Twitter image URLs are
absolute and present in the built HTML, so crawlers do not need JavaScript.
Changing the title/cover produces a new image filename. No separate social
artwork or metadata step is required. Share previews work publicly once deployed;
social networks cannot fetch the local preview server.

Optional `readerCodes` front matter lists five distinct, already-created Stripe
promotion codes for $50 USD off 2-step (letters and digits only, for URL prefilling).
Set `readerCheckout` to their shared `https://buy.stripe.com/…` Payment Link.
Each Use code link opens that checkout with `prefilled_promo_code` set.
Configure each coupon and code for one total redemption in Stripe before adding
it. Restrict the coupon’s `applies_to.products` to the BMW 2-step Rev-Limiter
product. Remapping must remain full price, including in a combined order.
The reward appears at the bottom after the reader scrolls through at least 50% of the page's scrollable distance. This is local
visibility tracking, with no analytics or cookies; it does not prove reading or
reserve a code. Codes remain public in page source. Stripe enforces redemption
limits, and checkout confirms availability. No live availability is claimed on
the static page. Remove the section when the campaign is over.

```markdown
---
title: "Your post title"
date: "2026-10-26"
description: "A short summary for the index and share preview."
tag: "Workshop notes"
image: "/assets/gallery/flames/test-car-428i_optimized_.jpg"
imageAlt: "Describe the image"
imageCaption: "Optional caption"
draft: true
---

Opening paragraph.

## A section

Normal Markdown: paragraphs, lists, links, images, quotes and tables.
```

`title`, quoted ISO `date`, and `description` are required. Image fields are
optional; an image needs alt text and must exist under `/assets/`. Use `##` for
sections because the title supplies the page's `h1`. Link to `/site-paths`,
`https://…`, `mailto:…` or `#anchors`. Raw HTML is displayed as text.

Drafts and future-dated posts are omitted from production output. To preview
them locally, run `npm run build:preview`; draft articles have a visible label
and `noindex`, and are omitted from RSS/sitemap. Source Markdown is not copied
to the public build.

Local preview: `npm run preview`, then open `http://localhost:4173/blog/`.
It rebuilds once; after an edit, run `npm run build:preview` and refresh.
The preview server serves `dist/` only. Publishing remains the existing reviewed
GitHub Pages deployment from `main`.
