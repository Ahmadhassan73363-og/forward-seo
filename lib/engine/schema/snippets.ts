/*
 * Starter markup for a missing checklist item. On Shopify the snippets are Liquid that reads the
 * store's own objects (shop, product, collection, article), so nothing has to be typed by hand
 * except clearly marked REPLACE values (social profiles, return/shipping policy). Elsewhere they are
 * JSON-LD templates with the store's URL and name filled in and REPLACE placeholders for the rest.
 */

export interface Snippet {
  title: string;
  /** Where to put it */
  where: string;
  code: string;
  language: 'liquid' | 'json';
  note?: string;
}

export interface SnippetContext {
  shopify: boolean;
  homeUrl: string;
  siteName?: string;
}

const script = (body: string) => `<script type="application/ld+json">\n${body}\n</script>`;
const j = (v: unknown) => JSON.stringify(v, null, 2);

const RETURN_POLICY = {
  '@type': 'MerchantReturnPolicy',
  applicableCountry: 'US',
  returnPolicyCategory: 'https://schema.org/MerchantReturnFiniteReturnWindow',
  merchantReturnDays: 30,
  returnMethod: 'https://schema.org/ReturnByMail',
  returnFees: 'https://schema.org/FreeReturn',
};

const SHIPPING = {
  '@type': 'OfferShippingDetails',
  shippingRate: { '@type': 'MonetaryAmount', value: 0, currency: 'USD' },
  shippingDestination: { '@type': 'DefinedRegion', addressCountry: 'US' },
  deliveryTime: {
    '@type': 'ShippingDeliveryTime',
    handlingTime: { '@type': 'QuantitativeValue', minValue: 0, maxValue: 1, unitCode: 'DAY' },
    transitTime: { '@type': 'QuantitativeValue', minValue: 2, maxValue: 5, unitCode: 'DAY' },
  },
};

const POLICY_NOTE = 'The values are an example (US, 30-day free returns by mail / free 2–5 day shipping). Replace them with your real policy: Google compares them with your Merchant Center settings.';

const LIQUID: Record<string, Snippet> = {
  Organization: {
    title: 'Organization',
    where: 'layout/theme.liquid, inside <head>',
    language: 'liquid',
    code: `{%- if request.page_type == 'index' -%}
${script(`{
  "@context": "https://schema.org",
  "@type": "Organization",
  "@id": {{ request.origin | append: '/#organization' | json }},
  "name": {{ shop.name | json }},
  "url": {{ request.origin | append: routes.root_url | json }},
  {%- if settings.logo %}
  "logo": {{ settings.logo | image_url: width: 600 | prepend: 'https:' | json }},
  {%- endif %}
  "sameAs": [
    "https://www.instagram.com/REPLACE",
    "https://www.facebook.com/REPLACE"
  ]
}`)}
{%- endif -%}`,
    note: 'Replace the sameAs links with your real social profiles, or remove the ones you do not have. If your theme stores the logo under another setting name, change settings.logo.',
  },
  WebSite: {
    title: 'WebSite',
    where: 'layout/theme.liquid, inside <head>',
    language: 'liquid',
    code: `{%- if request.page_type == 'index' -%}
${script(`{
  "@context": "https://schema.org",
  "@type": "WebSite",
  "name": {{ shop.name | json }},
  "url": {{ request.origin | append: routes.root_url | json }}
}`)}
{%- endif -%}`,
  },
  Product: {
    title: 'Product (with offers)',
    where: 'sections/main-product.liquid',
    language: 'liquid',
    code: script(`{{ product | structured_data }}`),
    note: "Shopify's structured_data filter outputs Product with Offer, price, currency, availability, SKU/GTIN, brand and images for every variant.",
  },
  ProductBreadcrumb: {
    title: 'BreadcrumbList (product)',
    where: 'sections/main-product.liquid',
    language: 'liquid',
    code: script(`{
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  "itemListElement": [
    { "@type": "ListItem", "position": 1, "name": "Home", "item": {{ request.origin | append: routes.root_url | json }} },
    {%- if collection %}
    { "@type": "ListItem", "position": 2, "name": {{ collection.title | json }}, "item": {{ request.origin | append: collection.url | json }} },
    {%- endif %}
    { "@type": "ListItem", "position": {% if collection %}3{% else %}2{% endif %}, "name": {{ product.title | json }}, "item": {{ request.origin | append: product.url | json }} }
  ]
}`),
  },
  CollectionBreadcrumb: {
    title: 'BreadcrumbList (collection)',
    where: 'sections/main-collection-product-grid.liquid (or your collection template)',
    language: 'liquid',
    code: script(`{
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  "itemListElement": [
    { "@type": "ListItem", "position": 1, "name": "Home", "item": {{ request.origin | append: routes.root_url | json }} },
    { "@type": "ListItem", "position": 2, "name": {{ collection.title | json }}, "item": {{ request.origin | append: collection.url | json }} }
  ]
}`),
  },
  ArticleBreadcrumb: {
    title: 'BreadcrumbList (blog post)',
    where: 'sections/main-article.liquid',
    language: 'liquid',
    code: script(`{
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  "itemListElement": [
    { "@type": "ListItem", "position": 1, "name": "Home", "item": {{ request.origin | append: routes.root_url | json }} },
    { "@type": "ListItem", "position": 2, "name": {{ blog.title | json }}, "item": {{ request.origin | append: blog.url | json }} },
    { "@type": "ListItem", "position": 3, "name": {{ article.title | json }}, "item": {{ request.origin | append: article.url | json }} }
  ]
}`),
  },
  CollectionPage: {
    title: 'CollectionPage with ItemList',
    where: 'sections/main-collection-product-grid.liquid (or your collection template)',
    language: 'liquid',
    code: script(`{
  "@context": "https://schema.org",
  "@type": "CollectionPage",
  "name": {{ collection.title | json }},
  "url": {{ request.origin | append: collection.url | json }},
  "mainEntity": {
    "@type": "ItemList",
    "itemListElement": [
      {%- for p in collection.products limit: 24 %}
      { "@type": "ListItem", "position": {{ forloop.index }}, "url": {{ request.origin | append: p.url | json }} }{% unless forloop.last %},{% endunless %}
      {%- endfor %}
    ]
  }
}`),
  },
  Article: {
    title: 'Article',
    where: 'sections/main-article.liquid',
    language: 'liquid',
    code: script(`{{ article | structured_data }}`),
    note: "Shopify's structured_data filter outputs Article with headline, image, author and dates.",
  },
};

function jsonSnippet(type: string, template: string, c: SnippetContext): Snippet | null {
  const home = c.homeUrl.replace(/\/?$/, '/');
  const name = c.siteName || 'REPLACE: store name';
  const ctx = { '@context': 'https://schema.org' };
  switch (type) {
    case 'Organization':
      return { title: 'Organization', where: 'Homepage <head>', language: 'json', code: script(j({ ...ctx, '@type': 'Organization', name, url: home, logo: `${home}REPLACE-logo.png`, sameAs: ['https://www.instagram.com/REPLACE'] })) };
    case 'WebSite':
      return { title: 'WebSite', where: 'Homepage <head>', language: 'json', code: script(j({ ...ctx, '@type': 'WebSite', name, url: home })) };
    case 'Product':
      return {
        title: 'Product (with offer)',
        where: 'Every product page, filled from the product',
        language: 'json',
        code: script(j({ ...ctx, '@type': 'Product', name: 'REPLACE: product name', image: ['REPLACE: https://… image URL'], description: 'REPLACE', sku: 'REPLACE', brand: { '@type': 'Brand', name }, offers: { '@type': 'Offer', url: 'REPLACE: product URL', price: '0.00', priceCurrency: 'USD', availability: 'https://schema.org/InStock' } })),
        note: 'Generate this from the product data in your platform’s template; never hard-code one product on every page.',
      };
    case 'BreadcrumbList':
      return {
        title: 'BreadcrumbList',
        where: `Every ${template} page`,
        language: 'json',
        code: script(j({ ...ctx, '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: 'Home', item: home }, { '@type': 'ListItem', position: 2, name: 'REPLACE: category', item: `${home}REPLACE` }, { '@type': 'ListItem', position: 3, name: 'REPLACE: this page' }] })),
      };
    case 'CollectionPage':
      return { title: 'CollectionPage with ItemList', where: 'Every collection page', language: 'json', code: script(j({ ...ctx, '@type': 'CollectionPage', name: 'REPLACE: collection name', url: 'REPLACE: collection URL', mainEntity: { '@type': 'ItemList', itemListElement: [{ '@type': 'ListItem', position: 1, url: 'REPLACE: product URL' }] } })) };
    case 'Article':
      return { title: 'Article', where: 'Every blog post', language: 'json', code: script(j({ ...ctx, '@type': 'BlogPosting', headline: 'REPLACE', image: ['REPLACE: image URL'], datePublished: '2026-01-31T09:00:00+00:00', dateModified: '2026-01-31T09:00:00+00:00', author: { '@type': 'Person', name: 'REPLACE', url: 'REPLACE: author page' } })) };
    default:
      return null;
  }
}

/** Starter snippet for the first type of a checklist rule, or null when there is no template for it. */
export function snippetFor(types: string[], template: string, c: SnippetContext): Snippet | null {
  const t = types[0];
  if (t === 'MerchantReturnPolicy') {
    return { title: 'Return policy (store-wide)', where: 'Inside your Organization markup, as a property', language: 'json', code: `"hasMerchantReturnPolicy": ${j(RETURN_POLICY)}`, note: POLICY_NOTE };
  }
  if (t === 'OfferShippingDetails') {
    return { title: 'Shipping details', where: 'Inside each Offer of the Product markup, as a property', language: 'json', code: `"shippingDetails": ${j(SHIPPING)}`, note: POLICY_NOTE };
  }
  if (t === 'AggregateRating' || t === 'Review') {
    return null; // only a reviews app with real reviews can provide this
  }
  if (t === 'FAQPage') {
    return {
      title: 'FAQPage',
      where: 'The page that shows the questions',
      language: 'json',
      code: script(j({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: [{ '@type': 'Question', name: 'REPLACE: question exactly as shown on the page', acceptedAnswer: { '@type': 'Answer', text: 'REPLACE: answer exactly as shown on the page' } }] })),
      note: 'Only mark up questions and answers that are visible on the page.',
    };
  }
  const key = ['OnlineStore', 'OnlineBusiness', 'Corporation', 'LocalBusiness', 'Store'].includes(t) ? 'Organization'
    : ['ProductGroup', 'Offer', 'AggregateOffer'].includes(t) ? 'Product'
    : ['BlogPosting', 'NewsArticle'].includes(t) ? 'Article'
    : t === 'ItemList' ? 'CollectionPage'
    : t;
  if (c.shopify) {
    if (key === 'BreadcrumbList') return LIQUID[template === 'collection' ? 'CollectionBreadcrumb' : template === 'article' ? 'ArticleBreadcrumb' : 'ProductBreadcrumb'] || null;
    if (LIQUID[key]) return LIQUID[key];
  }
  return jsonSnippet(key, template, c);
}
