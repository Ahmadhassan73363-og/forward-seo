# Structured data (Schema tab)

The audit crawl reads every schema.org item in each crawled page's HTML, checks it, and compares what it finds with a checklist of what each page type should carry. Nothing extra is fetched during an audit: the scan reuses the HTML the crawler already downloaded.

## What is scanned

| Format | Where it is found |
| --- | --- |
| JSON-LD | `<script type="application/ld+json">`, including arrays and `@graph` (each graph node is its own item) |
| Microdata | `itemscope` / `itemtype` / `itemprop`, nested items included |
| RDFa (Lite) | `typeof` / `property` with the schema.org vocabulary |

- `@id` references (`{"@id": "#org"}`) are resolved across all formats on the page.
- Blocks that are not valid JSON are reported with the parser error and the first characters of the block.
- Schema added by JavaScript after load is not in the HTML. When browser tests ran, the Schema tab points out types that only appear after rendering.

## Checks

Each item gets three counts: valid fields, warnings and errors.

- **Errors** stop the item from being used for rich results.
- **Warnings** are recommended properties, or values worth fixing.

Rules (`lib/engine/schema/validate.ts`) follow Google's structured data documentation for these types:

- Product, ProductGroup, Offer, AggregateOffer
- AggregateRating, Review
- BreadcrumbList, Organization (and OnlineStore, LocalBusiness / Store), WebSite
- Article / BlogPosting, FAQPage, VideoObject, Event, Recipe
- MerchantReturnPolicy, OfferShippingDetails

On top of the per-type rules, these value formats are checked:

- prices are plain numbers;
- currency is a 3-letter ISO 4217 code;
- availability and item condition are schema.org values;
- dates are ISO 8601, and a `priceValidUntil` date has not passed;
- URLs are absolute;
- GTINs have 8, 12, 13 or 14 digits;
- ratings fall within their scale and are not based on 0 reviews;
- type names use the right case;
- `@context` is present;
- names and descriptions contain no HTML.

These patterns are also flagged:

- duplicate Product items;
- the same type marked up in both Microdata and JSON-LD;
- retired Google features: the sitelinks search box, HowTo, and FAQ rich results outside government and health sites.

An item lists the Google features it can make the page eligible for (Product snippets, Merchant listings, Breadcrumbs, Site name, Organization logo, Article, Video …). This only happens when the item has no errors.

Errors other than Product's required fields also become the **Structured data errors** finding (`schema_value_errors`) on the Issues tab.

## Checklist

The defaults are in `DEFAULT_CHECKLIST` in `lib/engine/schema/report.ts`.

| Page | Required | Recommended |
| --- | --- | --- |
| Homepage | Organization (or a subtype), WebSite | |
| Product | Product, Offer | BreadcrumbList, AggregateRating / Review, MerchantReturnPolicy, OfferShippingDetails |
| Collection | | BreadcrumbList, CollectionPage / ItemList |
| Blog post | Article / BlogPosting | BreadcrumbList |
| Pages with FAQ content | | FAQPage |

- Return policy and shipping also count as present when they are set once on the Organization.
- The tab can remove default rules and add new ones (page type + any-of types + level).
- Those edits are kept in the viewer's browser (localStorage). To change the defaults for everyone, edit `DEFAULT_CHECKLIST`.

For a missing item, **Fix** shows a starter snippet (`lib/engine/schema/snippets.ts`):

- **Shopify:** Liquid that reads the store's own objects, such as `{{ product | structured_data }}`, breadcrumbs built from `collection` / `product`, and Organization from `shop`.
- **Other platforms:** a JSON-LD template with the store URL and name filled in.
- **Placeholders:** values only the merchant knows (social profiles, return and shipping policy) are marked `REPLACE`.

## Test a URL

`POST /api/schema { "url": "https://…" }` fetches one page now and returns the same scan. Nothing is stored.

- The usual SSRF guard applies: local and private addresses are refused, and every redirect is re-checked.
- It is limited per IP (`SCHEMA_TESTS_PER_HOUR`, default 120).

## Storage

Item data is kept with the crawl so the tree and code views work later. Long arrays (variants, offers, reviews) and long strings are shortened to about 12 KB per item. The checks run on the full markup before it is shortened, and the tab says when an item was shortened.
