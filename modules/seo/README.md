# seo

Universal Hugo SEO module. Drop one partial call into your `baseof.html` `<head>` and the module emits the complete SEO head surface -- `<title>`, meta description, canonical, robots, feed discovery, hreflang plus x-default, all Open Graph (with article/profile/product/video extras), all Twitter Card, site verification -- plus every applicable Google-eligible JSON-LD `<script>` block (WebSite, Organization, WebPage, BreadcrumbList, Article/BlogPosting/NewsArticle, Product, ProfilePage, SoftwareApplication, VideoObject), each self-gating against Google's placement rules and cross-linked by a precise `@id` entity graph. The output is style-agnostic and ships ZERO CSS: SEO metadata is invisible head content, so there is nothing to style. Because AI crawlers read the same static HTML, JSON-LD, and Open Graph that Google does, a complete structured-data surface is also the most AI-crawler-friendly surface -- no AI-specific meta tag exists, and none is emitted. The module never breaks a build over SEO data: every misconfiguration degrades to a deduplicated `warnf` and a safe fallback, so a broken schema declaration costs you one rich result, never the site.

## Installation

Import the module in your site's Hugo configuration:

```toml
# hugo.toml

[[module.imports]]
path = "github.com/alex-feel/hugo-artifacts/modules/seo"
```

Then fetch it:

```bash
hugo mod get github.com/alex-feel/hugo-artifacts/modules/seo
```

Confirm resolution with `hugo mod graph`. For local development against a checkout of this repo, use a `hugo.work` workspace or a `[module.replacements]` block per the repo convention.

**Important -- template lookup precedence:** every partial the module ships is overridable by same-name placement. If your site has a file at `layouts/_partials/seo/<file>.html`, Hugo uses your local copy instead of the module's. This is the primary extension mechanism (see [Extension Hooks](#extension-hooks)); it also means a stray local `seo/` partial silently shadows the module, so delete any leftover copies you do not intend to override.

## Requirements

- Hugo v0.160.0+ (extended edition)
- Go 1.22+

## Usage

Place exactly one line inside your site `<head>` (in `layouts/baseof.html`, after `<meta charset>` and viewport, before your own head content):

```go-html-template
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  {{ partial "seo/head.html" . }}
  {{/* site stylesheets, scripts, favicons live here */}}
</head>
```

The dot MUST be the current `Page`; passing anything else is the module's single build-failing error. The partial needs no other arguments -- it reads everything from `params.seo.*` (via the `.Param` cascade) and page front matter. That single call emits the complete surface: `<title>`, meta description, canonical, robots, feed discovery, hreflang plus x-default, all Open Graph (with article/profile/product/video extras), all Twitter Card, site verification, and every applicable JSON-LD `<script>` block -- all in `<head>`, never `<body>`. Because the module owns the entire SEO head surface, you delete your own hand-rolled `<title>`, description, canonical, OG, Twitter, hreflang, robots, verification, and JSON-LD markup.

**Out of scope (the module deliberately never emits these):** `<meta charset>`, viewport, favicons, `apple-touch-icon`, `theme-color`, `<html lang>`, `<base href>`, `<meta name="keywords">`, the XML sitemap, `X-Robots-Tag` headers, `robots.txt`, and `llms.txt`. Those belong to your base layout or to Hugo itself. `<base href>` is never emitted by design (it breaks relative URLs); the module relies on absolute `.Permalink` throughout. AI training and citation access is a `robots.txt` concern and is out of scope. Only `seo/head.html`'s "pass the page, get the complete head SEO surface" contract is the stable public API; internal partials may change between minor versions, though same-name overrides are supported and documented.

## Configuration

All site-level configuration lives under `[params.seo]`, read via `.Param` so per-page front matter (also under `seo.*`) overrides it through Hugo's normal cascade. Every key is OPTIONAL: a site that sets zero `seo.*` keys still gets correct `<title>`, description, canonical, robots, OG, Twitter, hreflang, WebSite, WebPage, and BreadcrumbList output from Hugo-native fields (`title`, `baseURL`, `languages.*`) -- the zero-config baseline. For multilingual sites, place `[params.seo]` under each language's params block (`[languages.en.params.seo]`, `[languages.de.params.seo]`); keys not overridden inherit the root.

The full annotated surface:

```toml
# hugo.toml (or config/_default/params.toml). Every key OPTIONAL.

[params.seo]
  enable              = true               # Global kill switch. false => the module emits NOTHING anywhere. Default: true.
  title_suffix        = " | Acme Docs"     # Appended to <title> only (never og:title/headline). Default: "". Home page never gets the suffix.
  description         = "Acme builds developer tooling for Hugo sites."  # Site-wide fallback description (last link of the chain).
  default_image       = "images/og-default.png"  # Global resource path (assets/ or static/) OR absolute URL; site-wide image fallback, applied only when no page-level image resolves.
  image_alt           = "Acme logo on dark"      # Default og:image:alt when a page image resolves no alt of its own.
  image_params        = ["tile_image"]     # Extra top-level front-matter params whose values (string or list per key) join the page-image candidates.
  keywords            = ["hugo", "seo", "static site"]  # JSON-LD keywords fallback ONLY; NO <meta name=keywords> is ever emitted.

  # --- Robots ---
  robots              = "max-image-preview:large"  # Site baseline directive; token-unioned with page seo.robots; most-restrictive wins per axis.

  # --- JSON-LD emission behavior ---
  jsonld_container    = "separate"         # "separate" (default: one <script> per node) or "graph" (one @graph block). Node dicts are identical either way.
  jsonld_on_noindex   = true               # Default true: noindex pages STILL emit JSON-LD (noindex pages remain crawlable and AI-citable). Set false to suppress JSON-LD on noindex pages.
  webpage_on_lists    = false              # Default false: taxonomy/term list pages emit no CollectionPage node. Section lists always emit one.
  disable             = []                 # Node suppression list, e.g. ["VideoObject", "BreadcrumbList"]; head-jsonld.html skips listed node types.

  # --- Twitter / X ---
  twitter_site        = "@acme"            # twitter:site. Leading @ optional; the module normalizes. Legacy alias: params.twitter.
  twitter_creator     = "@acme"            # Default twitter:creator when neither the page nor its first author supplies one.

  # --- WebSite node (home page only) ---
  [params.seo.website]
    name                = "Acme Documentation"   # WebSite.name override; else params.seo.organization.name; else site.Title.
    alternate_name      = "acme.example"   # WebSite.alternateName (Google suggests the lowercase domain as a backup site name).
    search_url_template = "https://acme.example/search/?q={search_term_string}"  # Enables SearchAction (Sitelinks Search Box). MUST contain the literal {search_term_string}; relative values are absolutized with absURL.

  # --- Organization / publisher node (home + optional flagged About page) ---
  [params.seo.organization]
    type              = "Organization"     # One of: Organization, OnlineStore, LocalBusiness, Person. Default: Organization. OnlineStore unlocks merchant policies; Person makes the publisher a Person node for solo-author sites (keeps the #organization @id as the publisher anchor).
    name              = "Acme Inc."        # Organization.name / publisher name. Falls back to site.Title.
    alternate_name    = "Acme"
    legal_name        = "Acme Incorporated"
    description       = "Developer tooling company."
    url               = "https://acme.example/"   # Defaults to the language home Permalink.
    logo              = "images/logo.png"  # >=112x112, crawlable, white-background-safe. Global resource path OR absolute URL.
    email             = "hello@acme.example"
    telephone         = "+1-555-0100"      # Include country + area code.
    founding_date     = "2015-03-01"       # ISO 8601 date.
    vat_id            = "GB123456789"      # Trust signal; must match the address country.
    tax_id            = "12-3456789"
    iso6523_code      = "0060:123456789"   # PREFERRED identifier, format ICD:identifier (0060 DUNS, 0088 GLN, 0199 LEI). When set, duns and lei_code are NOT emitted (duplicate-identifier dedup).
    duns              = "123456789"        # Emitted only when iso6523_code is absent.
    lei_code          = "5493001KJTIIGC8Y1R12"  # Emitted only when iso6523_code is absent.
    global_location_number = "0614141000005"
    naics             = "541511"
    same_as           = ["https://github.com/acme", "https://www.linkedin.com/company/acme"]  # sameAs[]; unioned with [params.seo.social] URLs, deduped.
    [params.seo.organization.number_of_employees]
      value           = 42                 # QuantitativeValue.value; OR min_value/max_value for a range.
      # min_value = 10
      # max_value = 50
    [params.seo.organization.address]
      street_address  = "1 Market St"
      address_locality = "San Francisco"
      address_region  = "CA"
      postal_code     = "94105"
      address_country = "US"               # ISO 3166-1 alpha-2.
    [[params.seo.organization.contact_point]]     # Repeatable ContactPoint.
      contact_type    = "customer support"
      telephone       = "+1-555-0100"
      email           = "support@acme.example"
    # OnlineStore-only merchant defaults, referenced by Offer via @id. Emitted only when type = "OnlineStore".
    [params.seo.organization.return_policy]
      applicable_country = "US"
      category           = "MerchantReturnFiniteReturnWindow"   # Enum-validated.
      merchant_return_days = 30
      return_method      = "ReturnByMail"
      return_fees        = "FreeReturn"
    [params.seo.organization.shipping]
      name               = "Standard"
      origin_country     = "US"        # -> shippingConditions.shippingOrigin (DefinedRegion)
      destination_country = "US"       # -> shippingConditions.shippingDestination (DefinedRegion)
      rate               = 0           # -> shippingConditions.shippingRate (MonetaryAmount); 0 = free shipping

  # --- Social profiles (folded into Organization.sameAs and, on profile pages, mainEntity.sameAs) ---
  [params.seo.social]
    github            = "https://github.com/acme"
    linkedin          = "https://www.linkedin.com/company/acme"
    mastodon          = "https://fosstodon.org/@acme"
    youtube           = "https://youtube.com/@acme"
    # Any key whose value is an absolute URL is added to sameAs[]. Keys are free-form.

  # --- Author defaults (used when a page names no author) ---
  [params.seo.author]
    path_prefix       = "/authors/"        # Section where author profile pages live; authors[] slugs resolve via site.GetPage. Default "/authors/".
    name              = "Acme Editorial Team"  # Fallback author when a page declares none and no author page resolves.
    url               = "https://acme.example/about/"
    type              = "Organization"     # Person (default) or Organization.

  # --- Site verification ---
  [params.seo.verification]
    google            = "abcdEFGH1234"     # <meta name="google-site-verification">
    bing              = "0011AABB"         # <meta name="msvalidate.01">
    baidu             = "code"             # <meta name="baidu-site-verification">
    facebook          = "code"             # <meta name="facebook-domain-verification">
    pinterest         = "code"             # <meta name="p:domain_verify">
    mastodon          = "https://fosstodon.org/@acme"  # <link rel="me">

  # --- Type dispatch ---
  [params.seo.types]
    default           = ""                 # Site-wide content-type default for page-kind pages. UNSET/"" by default => NO content node unless a page or section opts in (arbitrary pages are never mislabeled as Article). Set e.g. "Article" to opt in globally.
    [params.seo.types.sections]
      blog            = "BlogPosting"      # Top-level section name -> JSON-LD type. Overridden by page seo.type and by contract-key auto-detect.
      news            = "NewsArticle"
      docs            = "Article"
      authors         = "ProfilePage"

  # --- Feed discovery ---
  [params.seo.feed]
    enable            = true               # Emit <link rel="alternate" type="application/rss+xml"> for the page's (or its section's) RSS output, if any. Default: true.
```

### Top-level keys (`params.seo.*`)

| Key | Type | Default | Purpose |
| --- | --- | --- | --- |
| `enable` | bool | `true` | Global kill switch. `false` emits nothing anywhere. |
| `title_suffix` | string | `""` | Appended to `<title>` only, never to `og:title` or `headline`. The home page never gets the suffix. |
| `description` | string | `""` | Site-wide fallback description, last link of the description chain. |
| `default_image` | string | `""` | Site-wide image fallback. Resource path (`assets/` or `static/`) or absolute URL. Applied only when no page-level image resolves. |
| `image_alt` | string | `""` | Default `og:image:alt` when a page image resolves no alt of its own. |
| `image_params` | array | `[]` | Names of extra top-level front-matter params (e.g. `["tile_image"]`) whose values (string or list per key) join the page-image candidates -- after `seo.images`/`seo.image`/`meta_image`, before native `images`. |
| `keywords` | array | `[]` | JSON-LD `keywords` fallback ONLY. No `<meta name="keywords">` is ever emitted. |
| `robots` | string | `"max-image-preview:large"` (shipped baseline) | Site baseline robots directive; token-unioned with page `seo.robots`, most-restrictive per axis wins. |
| `jsonld_container` | string | `"separate"` | `"separate"` (one `<script>` per node) or `"graph"` (one `@graph` block). Node dicts are identical either way. |
| `jsonld_on_noindex` | bool | `true` | When `true`, noindex pages STILL emit JSON-LD. Set `false` to suppress JSON-LD on noindex pages. |
| `webpage_on_lists` | bool | `false` | When `true`, taxonomy/term list pages emit a `CollectionPage` node. Section lists always emit one regardless. |
| `disable` | array | `[]` | Node-type suppression list, e.g. `["VideoObject", "BreadcrumbList"]`. |
| `twitter_site` | string | `""` | `twitter:site` handle. Leading `@` optional. Deprecated alias: `params.twitter`. |
| `twitter_creator` | string | `""` | Default `twitter:creator` when neither the page nor its first author supplies one. |

### WebSite (`params.seo.website.*`, home page only)

| Key | Type | Default | Purpose |
| --- | --- | --- | --- |
| `name` | string | `params.seo.organization.name` -> `site.Title` | `WebSite.name` override. |
| `alternate_name` | string | `""` | `WebSite.alternateName`. Google suggests the lowercase domain as a backup site name. |
| `search_url_template` | string | `""` | Enables the SearchAction / Sitelinks Search Box. MUST contain the literal `{search_term_string}`; relative values are absolutized with `absURL`. Missing the placeholder emits a site-wide warn and no SearchAction. |

### Organization (`params.seo.organization.*`, home + optional flagged About page)

| Key | Type | Default | Purpose |
| --- | --- | --- | --- |
| `type` | string | `"Organization"` | One of `Organization`, `OnlineStore`, `LocalBusiness`, `Person`. `OnlineStore` unlocks merchant-policy properties; `Person` turns the publisher into a Person node for solo-author sites while keeping the `#organization` `@id` anchor. |
| `name` | string | `site.Title` | `Organization.name` / publisher name. |
| `alternate_name` / `legal_name` / `description` | string | `""` | `alternateName` / `legalName` / `description`. `legalName` is dropped when `type = "Person"`. |
| `url` | string | language home Permalink | `Organization.url`. |
| `logo` | string | `""` | Logo image (`>=112x112`, crawlable, white-background-safe). Resource path or absolute URL. Emitted at its native aspect, never cropped. |
| `email` / `telephone` | string | `""` | `email` / `telephone` (include country and area code). |
| `founding_date` | string | `""` | `foundingDate` (ISO 8601). Dropped when `type = "Person"`. |
| `vat_id` / `tax_id` | string | `""` | `vatID` / `taxID` trust signals; must match the address country. Dropped when `type = "Person"`. |
| `iso6523_code` | string | `""` | PREFERRED identifier, format `ICD:identifier` (`0060` DUNS, `0088` GLN, `0199` LEI). When set, `duns` and `lei_code` are NOT emitted. Dropped when `type = "Person"`. |
| `duns` / `lei_code` | string | `""` | Emitted only when `iso6523_code` is absent. Dropped when `type = "Person"`. |
| `global_location_number` / `naics` | string | `""` | `globalLocationNumber` / `naics`. `naics` dropped when `type = "Person"`. |
| `same_as` | array | `[]` | `sameAs[]`, unioned with absolute-URL values from `[params.seo.social]`, deduped. |
| `number_of_employees.{value,min_value,max_value}` | int | -- | `numberOfEmployees` QuantitativeValue (single `value` or a `min_value`/`max_value` range). Dropped when `type = "Person"`. |
| `address.*` | table | -- | PostalAddress: `street_address`, `address_locality`, `address_region`, `postal_code`, `address_country` (ISO 3166-1 alpha-2). |
| `[[contact_point]]` | array of table | -- | Repeatable ContactPoint: `contact_type`, `telephone`, `email`. |
| `return_policy.*` / `shipping.*` | table | -- | Merchant return policy / shipping service, referenced by Offer via `@id`. Emitted only when `type = "OnlineStore"`. `return_policy.category` is enum-validated. |

### Social, author defaults, verification, type dispatch, feed

| Table | Keys | Purpose |
| --- | --- | --- |
| `[params.seo.social]` | free-form keys (`github`, `linkedin`, `mastodon`, `youtube`, ...) | Any value that is an absolute URL is added to `Organization.sameAs[]` and, on profile pages that opt in via `seo.profile.is_site_owner: true`, to `mainEntity.sameAs[]` (deduped). |
| `[params.seo.author]` | `path_prefix` (default `/authors/`), `name`, `url`, `type` (`Person` default or `Organization`) | Author-page location and the fallback author used when a page names none and no author page resolves. |
| `[params.seo.verification]` | `google`, `bing`, `baidu`, `facebook`, `pinterest`, `mastodon` | Site-verification meta tags (`mastodon` emits a `<link rel="me">`). Deprecated alias: `params.site_verification.*`. |
| `[params.seo.types]` | `default` (shipped `""`), `[params.seo.types.sections]` map | Content-type dispatch. `default` shipped UNSET so arbitrary pages get no content node; the sections map assigns a JSON-LD type per top-level section. |
| `[params.seo.feed]` | `enable` (default `true`) | Feed-discovery `<link rel="alternate" type="application/rss+xml">` for the page's or its section's RSS output. |

### Deprecated site-param aliases

Read only when the `params.seo.*` equivalent is absent; `params.seo.*` always wins; all deprecated, all silent (no warn). Migrating removes the deprecation.

| Deprecated alias                                                 | Maps to              |
| ---------------------------------------------------------------- | -------------------- |
| `params.metadata.title_suffix`                                   | `seo.title_suffix`   |
| `params.metadata.description`                                    | `seo.description`    |
| `params.metadata.image`                                          | `seo.default_image`  |
| `params.metadata.keywords`                                       | `seo.keywords`       |
| `params.twitter`                                                 | `seo.twitter_site`   |
| `params.site_verification.{google,bing,baidu,facebook,mastodon}` | `seo.verification.*` |

## Front Matter Contract

The module reads Hugo-native front-matter fields FIRST wherever they carry the right meaning, and defines new keys only where no native field exists. Every new key lives under a single `seo:` map (mirroring the site namespace) -- no new top-level key is introduced. Resolution order for every aliased field is `seo.<key>` -> legacy alias -> Hugo native (where applicable) -> site default.

### Reused native fields

| Native field | Feeds |
| --- | --- |
| `title` | `<title>`, `og:title`, `twitter:title`, `Article.headline`, `WebPage.name`, `Product.name`, `VideoObject.name`, `SoftwareApplication.name`, `mainEntity.name` |
| `description` | meta description, `og:description`, `twitter:description`, JSON-LD `description` |
| `summary` (or `.Summary`) | description fallback when `description` is empty (plainified, truncated) |
| `date` | `article:published_time`, `datePublished`, `uploadDate`, `dateCreated` (fallback) |
| `lastmod` (or `.Lastmod`) | `article:modified_time`, `dateModified` (only when it differs from `date`) |
| `images` (`[]string`) | `og:image` set, JSON-LD `image[]`, `twitter:image`, `thumbnailUrl` fallback |
| `keywords` | JSON-LD `keywords` (fallback to `tags`) |
| `tags` | `article:tag`, JSON-LD `keywords` (fallback) |
| `categories` | `article:section`, `Article.articleSection` (fallback to `.Section`) |
| `authors` (`[]string`) / `author` (string) | `Article.author` / ProfilePage resolution |
| `expiryDate` | optional `unavailable_after` robots token (opt-in) |
| Page resources named `*feature*` / `*cover*` / `*thumbnail*` | `og:image` and JSON-LD `image[]` (deterministic priority: feature beats cover beats thumbnail) |

### The `seo.*` front-matter surface

The full new-key surface under `seo:` is: `title`, `description`, `canonical`, `robots`, `robots_bots`, `type`, `og_type`, `image`, `images`, `image_alt`, `same_as`, `authors`, `breadcrumb_trails`, `disable`, `allow_index_nonprod`, `robots_expiry`, `organization.on_page`, the four type tables `product`, `offer`, `software`, `video`, `profile`, and the `date_published`/`date_modified` overrides. The examples below show each page shape.

Note: `seo.disable` is type-dependent. As a boolean, `seo.disable: true` on a page is the per-page kill switch -- it suppresses the ENTIRE SEO head surface for that page (title, canonical, OG, Twitter, robots, and all JSON-LD), the per-page counterpart to the site-level `params.seo.enable = false`, intended for hand-templated pages. As a slice, `params.seo.disable = ["VideoObject", ...]` in the site config suppresses individual JSON-LD node types only (see Configuration and Extension Hooks).

### Plain page (no content schema -- WebPage + BreadcrumbList only)

```yaml
---
title: 'Contact Us'
description: 'Reach the Acme team by email or phone.'
# No seo.type, no type table => NO Article/Product node.
# The module still emits the full classic head + WebPage + BreadcrumbList.
seo:
  robots: 'max-snippet:-1' # optional; token-unioned with the site baseline
  image: 'images/contact-hero.jpg' # optional explicit page image (bundle-relative or global resource path, or absolute URL)
---
```

### Article (Article / BlogPosting / NewsArticle)

```yaml
---
title: 'Shipping Faster with Hugo Modules'
description: 'How we cut build time 40% by splitting our theme into modules.'
date: 2026-06-27T09:00:00+03:00 # -> datePublished (native)
lastmod: 2026-07-01T12:30:00+03:00 # -> dateModified (native; emitted because it differs from date)
images: ['images/hero.png'] # -> og:image + Article.image (native; bundle *feature* auto-detected too)
tags: ['hugo', 'modules', 'performance'] # -> article:tag + keywords (native)
categories: ['Engineering'] # -> article:section (native)
authors: ['jane-doe'] # -> resolved via /authors/jane-doe (native)
seo:
  type: 'BlogPosting' # NEW: overrides section mapping and site default. One of Article/BlogPosting/NewsArticle. Omit when the section map already covers it.
  same_as: ['https://medium.com/@acme/shipping-faster'] # NEW: Article.sameAs[] (syndication links; read by AI crawlers)
---
```

### Product page (contract-key auto-detect: no `seo.type` needed)

```yaml
---
title: 'Acme Widget Pro'
description: 'The professional-grade widget with lifetime warranty.'
images: ['images/widget-16x9.png', 'images/widget-1x1.png'] # -> Product.image[] (native; multi-ratio recommended)
seo:
  # Writing seo.product IS declaring the Product type. seo.type: "Product" is optional and only needed to disambiguate.
  product: # NEW: all Product-specific data.
    sku: 'WGT-PRO-001'
    mpn: 'AC-9910'
    gtin13: '0012345678905'
    brand: 'Acme'
    color: 'Graphite'
    material: 'Aluminum'
    condition: 'NewCondition' # -> Offer.itemCondition (enum-validated)
    aggregate_rating: # optional; enables the Product Snippet track even without offers
      rating_value: 4.6
      review_count: 128
  offer: # NEW: the Offer (Merchant Listing track requires price > 0 + currency)
    price: 149.00 # NUMBER preferred; a quoted decimal string also parses (never octal); anything unparseable warns and counts as missing
    price_currency: 'USD' # ISO 4217
    availability: 'InStock' # enum-validated ItemAvailability
    condition: 'NewCondition' # alias location; seo.product.condition wins
    price_valid_until: 2026-12-31
    url: 'https://acme.example/buy/widget-pro/'
---
```

### Profile page (author / about / employee)

```yaml
---
title: 'Jane Doe'
description: 'Staff engineer, Hugo core contributor.' # -> mainEntity.description
date: 2020-01-15 # -> ProfilePage.dateCreated (native fallback)
lastmod: 2026-05-01 # -> ProfilePage.dateModified (native; genuine human edits only)
images: ['images/jane.jpg'] # -> mainEntity.image (native)
seo:
  profile: # NEW; presence auto-detects ProfilePage (seo.type optional)
    entity_type: 'Person' # Person (default) or Organization
    given_name: 'Jane' # -> profile:first_name (OG)
    family_name: 'Doe' # -> profile:last_name (OG)
    username: 'janedoe' # -> profile:username (OG) + mainEntity.alternateName
    gender: 'female' # -> profile:gender (OG, optional; enum-validated for suggestedGender uses)
    identifier: 'user-4821' # internal id -> mainEntity.identifier
    same_as: ['https://github.com/janedoe', 'https://fosstodon.org/@janedoe'] # mainEntity.sameAs
    is_site_owner: true # -> union seo.social.* absolute URLs into mainEntity.sameAs (deduped)
    job_title: 'Staff Engineer' # -> nested Person.jobTitle (NOT on ProfilePage per Google)
    twitter: '@janedoe' # -> twitter:creator on pages this person authors
    interaction_statistic: # THIS platform only -> mainEntity.interactionStatistic
      - type: 'FollowAction'
        count: 5400
    agent_interaction_statistic: # owner's own actions -> mainEntity.agentInteractionStatistic
      - type: 'WriteAction'
        count: 213
---
```

### Software-application page

```yaml
---
title: 'Acme CLI'
description: 'Command-line companion for Acme Widget.'
images: ['images/cli-screenshot.png'] # -> screenshot + og:image
seo:
  software: # NEW; presence auto-detects SoftwareApplication
    app_type: ['SoftwareApplication'] # co-typing allowed, e.g. ["VideoGame", "MobileApplication"]. VideoGame alone warns and is co-typed.
    application_category: 'DeveloperApplication' # enum-validated (Google's 22 values)
    operating_system: ['macOS', 'Linux', 'Windows'] # string or array
    software_version: '2.4.0'
    download_url: 'https://acme.example/download/cli'
    file_size: '18MB'
    feature_list: ['Auto-sync', 'Offline mode']
    aggregate_rating: # one of aggregate_rating / review REQUIRED for the rich result
      rating_value: 4.8
      rating_count: 342
  offer: # REQUIRED for the rich result: price (0 for free) + currency when price > 0
    price: 0
    price_currency: 'USD'
---
```

### Video page

```yaml
---
title: 'Building a Hugo Module in 10 Minutes'
description: 'A screencast walking through modules/seo from scratch.'
date: 2026-06-20T18:00:00+03:00 # -> uploadDate (native)
images: ['images/video-thumb-16x9.jpg'] # thumbnailUrl fallback when seo.video.thumbnail_url is absent
seo:
  video: # NEW; presence auto-detects VideoObject (Hugo has no native video metadata)
    thumbnail_url:
      ['https://cdn.acme.example/thumb-16x9.jpg', 'https://cdn.acme.example/thumb-1x1.jpg']
    content_url: 'https://cdn.acme.example/build-module.mp4' # direct media file, NOT the watch page
    embed_url: 'https://cdn.acme.example/player/build-module' # player src, NOT the watch page
    duration: 'PT10M14S' # ISO 8601 duration
    expires: 2027-06-20T18:00:00+03:00
    watch_count: 15200 # -> interactionStatistic WatchAction
    clips: # -> hasPart[] Key Moments (unique start_offsets; mutually exclusive with seek_url_template)
      - name: 'Scaffolding go.mod'
        start_offset: 30
        end_offset: 95
        url: 'https://acme.example/watch/build-module/?t=30'
    regions_allowed: ['US', 'GB', 'DE'] # XOR ineligible_region (both set warns; regions_allowed wins)
---
```

### Deprecated legacy aliases

These aliases exist for sites migrating from an older `meta_*`-style front-matter vocabulary. The module reads each as a documented, deprecated alias; `seo.*` always wins when both are present; the alias is consulted only when `seo.<key>` is unset, so a site migrates key-by-key with zero content rewrites. Reading an alias is silent.

| Deprecated key | Alias for | Notes |
| --- | --- | --- |
| `meta_title` | `seo.title` | title override |
| `meta_description` | `seo.description` | description override |
| `meta_image` | `seo.image` | single explicit SEO image, prepended to the image set |
| `meta_type` | `seo.type` + `seo.og_type` | mapped: `article` -> `Article` + og `article`; `profile` -> `ProfilePage` + og `profile`; anything else -> og `website`, no content node. The legacy value whitelist is not re-imposed on `seo.og_type`. |
| `noindex` (bool `true`) | contributes to `seo.robots` | folded in as `noindex, nofollow`; `noindex: false` is a no-op (not an "index" assertion) |
| `canonical` | `seo.canonical` | absolute canonical override |
| `video_id` | seeds `seo.video.embed_url` + `seo.video.thumbnail_url` | YouTube; VideoObject still emits only when its three required properties resolve |
| `twitter_username` | `twitter:creator` | author-page front-matter key; read when the author page's `seo.profile.twitter` is unset |
| `same_as` (bare top-level) | `seo.same_as` | syndication / profile links |

## Structured Data Types

Every emitted JSON-LD node is designed to pass the Rich Results Test: no schema type is emitted on a page kind Google forbids; every Google-required property is present before any recommended one; a node whose required property is unresolvable is suppressed whole (never emitted half-formed); and nodes are linked by a precise `@id` entity graph so Google associates related nodes. Beyond-Google schema.org properties (for AI crawlers) are emitted only when they cannot invalidate a Google rich result.

### Content-type dispatch ladder (first match wins)

`resolve/types.html` picks the single content-schema type for the page. Foundational nodes (WebSite, Organization, WebPage, BreadcrumbList) are decided independently by page-kind rules, not by this ladder.

1. **Explicit `seo.type`** in page front matter (or the mapped `meta_type` alias). Highest precedence, the per-page escape hatch. An unsupported value (e.g. `Recipe`) warns and falls through to step 2. An explicit empty string `seo.type: ""` suppresses the content node entirely.
2. **Contract-key auto-detect.** With `seo.type` unset, the presence of a type-defining sub-table IS the declaration: `seo.product` -> `Product`, `seo.software` -> `SoftwareApplication`, `seo.video` -> `VideoObject`, `seo.profile` -> `ProfilePage`. (`seo.offer` alone does not auto-detect; it is shared.) Two or more type tables without `seo.type` warns and picks the first in the fixed priority Product, SoftwareApplication, VideoObject, ProfilePage.
3. **Section mapping** `params.seo.types.sections.<section>` against the page's top-level section -- the zero-annotation "everything under /blog is BlogPosting" case. Applies to regular (kind `page`) pages only, so a section's own list page never inherits the content type meant for the pages under it.
4. **Site default** `params.seo.types.default`, applied only to regular (kind `page`) pages. SHIPPED UNSET, so an arbitrary leaf page gets no content node -- docs, landing, and contact pages are never mislabeled.
5. **Nothing.** WebPage + BreadcrumbList and the full classic head still emit.

`og:type` derives from the resolved type (`Article`/`BlogPosting`/`NewsArticle` -> `article`; `ProfilePage` -> `profile`; `Product` -> `product`; `VideoObject` -> `video.other`; otherwise `website`), overridable by `seo.og_type`.

### Per-type emission conditions and Google-required fields

Each builder self-gates: it returns an empty dict (no emission) when the page kind is wrong or a Google-required property is unresolvable, so the dispatcher structurally cannot emit an ineligible node.

| Node | Emitted on | Suppressed (builder returns empty) on |
| --- | --- | --- |
| WebSite | home page only (`.IsHome`) | every non-home page |
| Organization | home page, OR the single page flagged `seo.organization.on_page: true` (typically About) | everywhere else (never per-article) |
| WebPage | home + every `page`-kind page; section lists as `CollectionPage` | taxonomy/term lists unless `webpage_on_lists = true` |
| BreadcrumbList | any non-home page whose trail yields `>= 2` items, plus each `seo.breadcrumb_trails` entry with `>= 2` items | home; any page with `< 2` items (silent) |
| Article/BlogPosting/NewsArticle | `page` kind with the chosen type AND resolvable headline | lists, home, taxonomy, term; empty headline |
| Product | `page` kind AND name resolves AND at least one of offers/review/aggregateRating present | home, lists; missing all three (warns) |
| ProfilePage | `page` kind AND `mainEntity.name` resolves | home, lists; unresolvable name (warns) |
| SoftwareApplication | `page` kind AND name AND `offer.price` set (0 allowed) AND (aggregateRating OR review) | any required field missing (warns); lists, home |
| VideoObject | `page` kind AND name AND thumbnailUrl AND uploadDate all resolve | any of the three missing (warns); lists, home |

Google-required properties per type: **Product Merchant Listing** needs `name`, `image`, `offers.price` (`> 0`), `offers.priceCurrency`; the **Snippet** track needs `name` plus one of `offers`/`review`/`aggregateRating`. **SoftwareApplication** needs `name`, `offers.price` (`0` allowed for free apps), `offers.priceCurrency` when price `> 0`, and one of `aggregateRating`/`review`. **VideoObject** needs `name`, `thumbnailUrl`, `uploadDate`. **BreadcrumbList** needs at least two `ListItem`s, each with `@type`, `position`, `name`, and `item` (the last item's `item` omitted so Google substitutes the page URL); each BreadcrumbList node also carries a `name` (its final crumb's name), and ancestors without a URL (sections built with `build.render = "never"`) are skipped so no empty `item` is ever emitted. **ProfilePage** needs `mainEntity.name`. Article, Organization, and WebSite have no hard-required properties per Google -- only recommended ones -- but WebSite/Organization site-name features need `name` and `url`.

### The `@id` entity graph

All `@id`s are absolute URLs with a stable URL-fragment discriminator -- globally unique, stable across builds, and per-language by construction. `resolve/id.html` computes them; every node references the exact strings.

| Node | `@id` |
| --- | --- |
| WebSite | `{site.Home.Permalink}#website` |
| Organization (or Person publisher) | `{site.Home.Permalink}#organization` (kept as `#organization` even when `type = "Person"`) |
| WebPage / CollectionPage | `{.Permalink}#webpage` |
| BreadcrumbList | `{.Permalink}#breadcrumb`; extra trails `#breadcrumb-2`, `#breadcrumb-3`, ... (gapless; the derived trail is trail 1) |
| Content node | `{.Permalink}#article` (all Article subtypes), `#product`, `#profilepage`, `#softwareapplication`, `#videoobject` |
| Person (author) | `{author-page.Permalink}#person` when an author page resolves; else no `@id` (inline anonymous Person) |
| Offer / AggregateRating / Review / ImageObject | no top-level `@id` (nested inline) |

Cross-references wire the graph: WebPage `isPartOf` -> WebSite, `breadcrumb` -> BreadcrumbList, `mainEntity` -> content node; Article `mainEntityOfPage` -> WebPage as an `@id` reference OBJECT (never the string `"true"`), `publisher` -> Organization, `author` -> array of Person nodes each carrying its own `@id` when resolvable; ProfilePage `mainEntity` -> nested Person carrying `#person`, so when the same person authors articles those `Article.author` entries reference the identical `@id` and Google connects author to profile.

### Emission behavior options

- `jsonld_container`: `"separate"` (default) emits one self-contained `<script type="application/ld+json">` per node, each with `@context: "https://schema.org"`, linked by `@id`. `"graph"` wraps the identical node dicts in a single `{"@context": ..., "@graph": [...]}` block. Google treats both as equivalent and merges by `@id` regardless; separate blocks are the more-tested shape and let you suppress or override exactly one node.
- `jsonld_on_noindex`: default `true` -- a noindex page still emits canonical, OG, Twitter, AND all JSON-LD, because noindex pages remain crawlable, shareable, and AI-citable. Set `false` for Google's stricter reading. JSON-LD is always suppressed on `404`-kind pages (structured data on error pages is noise); the classic head still emits there.
- `webpage_on_lists`: default `false` -- taxonomy/term list pages emit no `CollectionPage`. Section lists always emit one.

### Per-type property notes

- **Images:** `og:image`/`twitter:image` and the page-level JSON-LD `image[]` use a content-aware 1200x630 (1.91:1) smart crop with real dimensions; entity images -- `Organization.logo`, ProfilePage `mainEntity.image`, and author `Person.image` -- keep the source image's native aspect, so a logo or portrait is never force-cropped.
- **Organization / publisher:** `type` selects `Organization` (default), `OnlineStore` (unlocks `hasMerchantReturnPolicy`/`hasShippingService`, referenced by Offers via `@id`), `LocalBusiness`, or `Person` (solo-author sites; the node becomes a Person while keeping the `#organization` anchor, dropping org-only and merchant-only properties). `iso6523Code` is Google's PREFERRED identifier; when set, `duns` and `leiCode` are omitted (duplicate-identifier dedup).
- **Product:** two tracks. Merchant Listing (`offer.price > 0` and currency) enforces `image` and a single `Offer` (never `AggregateOffer`). Snippet track allows empty image and permits `AggregateOffer` via `seo.offer.aggregate: true`, but needs at least one of offers/review/aggregateRating or the node is suppressed.
- **ProfilePage:** `url`, `email`, `telephone`, and `jobTitle` are NOT placed on the ProfilePage node (Google ignores them there); `sameAs` and `jobTitle` sit on `mainEntity`; `dateCreated`/`dateModified` sit on ProfilePage.
- **SoftwareApplication:** `applicationCategory` is validated against Google's 22-value set; `app_type` co-typing is allowed and `VideoGame` alone is co-typed with `MobileApplication` (with a warn) because Google does not support `VideoGame` alone.
- **VideoObject:** `hasPart[]` Key Moments and a `SeekToAction` (`seek_url_template`) are mutually exclusive (clips win, warns when both set); Key Moments require unique `start_offset`s (a collision drops the whole `hasPart`, warns). A `publication` BroadcastEvent (LIVE badge) requires `isLiveBroadcast` + `startDate` + `endDate` AND the Google Indexing API -- the LIVE badge does not appear from markup alone; the Indexing-API integration is outside this module's scope and is documented here as the prerequisite.
- **Person (nested only):** `@type` is `Person` (default) or `Organization`, NEVER `Thing`; `name` carries the name only (no honorifics or job titles). Multiple authors each become their own array entry, never merged.

## Robots

`resolve/robots.html` produces the single `<meta name="robots">` content string (and the per-bot map), merging four inputs with token union and most-restrictive-wins per axis.

1. **Site baseline** `params.seo.robots` (shipped default `max-image-preview:large`, the Discover-friendly baseline).
2. **Page directive** `seo.robots` (a free-form string via `.Param`); its tokens are UNIONED with the baseline, so a page adding `noindex` keeps the baseline's `max-image-preview:large` unless it overrides that same token family.
3. **Legacy `noindex: true` alias** folds `noindex, nofollow` into the set (consulted only when `seo.robots` is absent; `noindex: false` is a no-op).
4. **Structural overrides:** when `hugo.IsProduction` is false, `noindex, nofollow` is force-added so staging and preview builds are never indexed -- overridable only by the explicit page escape hatch `seo.allow_index_nonprod: true`; on `404`-kind pages `noindex` is force-added unconditionally; and, opt-in, when `seo.robots_expiry: true` and `.ExpiryDate` is set and in the future, `unavailable_after: <RFC 3339>` is appended (default off, because many sites use `expiryDate` purely for build filtering).

Merge semantics: on the index axis any `noindex` wins, on the follow axis any `nofollow` wins, `none` expands to `noindex, nofollow`, and for parameterized families the more restrictive value wins (`max-snippet:0` beats `max-snippet:-1`; `max-image-preview:none` beats `standard` beats `large`). The `max-snippet:` and `max-video-preview:` values parse as signed DECIMAL integers (`-1` is the valid unlimited sentinel; `max-snippet:010` reads as 10, never octal 8); an unparseable value drops that single token with a deduplicated warn while the rest of the directive keeps merging. When the merged set is empty (production, no directives anywhere) NO robots tag is emitted -- default crawler behavior needs no tag.

**Supported pass-through tokens:** `noindex`, `nofollow`, `none`, `nosnippet`, `noimageindex`, `notranslate`, `indexifembedded` (only meaningful alongside `noindex`), `max-snippet:N`, `max-image-preview:{none|standard|large}`, `max-video-preview:N`, `unavailable_after:DATE`.

**Deprecated tokens are actively STRIPPED** from consumer-supplied strings, each with a deduplicated warn: `noarchive`, `nocache`, `nositelinkssearchbox`, `noodp` (all dead in 2026). `rel=next`/`rel=prev` pagination links are never emitted (Google dropped support). No `<meta name="keywords">`, ever. No `<base href>`, ever.

**Per-bot targeting** uses the dedicated `seo.robots_bots` map (e.g. `{googlebot: "noindex", bingbot: "nosnippet"}`); each key emits its own `<meta name="<bot>" content="...">` alongside the generic tag, with the same merge semantics applied per bot.

## Multilingual

All multilingual output is gated on `hugo.IsMultilingual`. On a monolingual site NO hreflang and NO `og:locale:alternate` are emitted (Google discourages self-only hreflang); `og:locale` alone emits.

- **hreflang + x-default:** `head-meta.html` iterates `.AllTranslations` (which includes the current page, so one range yields the full symmetric set) and emits `<link rel="alternate" hreflang="{{ .Language.Locale }}" href="{{ .Permalink }}">` per translation -- absolute URLs, hreflang from `.Language.Locale` (RFC 5646 language-TERRITORY, e.g. `en-US`, `de-DE`). A translation whose resolved robots directive contains `noindex` is skipped, so Google never sees an hreflang pointing at a noindexed URL; when the current page itself is noindex, the whole hreflang block is suppressed. x-default targets the DEFAULT-LANGUAGE variant, selected by `.Language.IsDefault` (ordering-independent); when no default-language translation of the page exists, x-default is omitted -- never fabricated, never self-pointed.
- **og:locale / og:locale:alternate:** `og:locale` is `.Language.Locale` underscore-normalized (`en_US`). `og:locale:alternate` is emitted per other translation, only under `hugo.IsMultilingual`.
- **`locale` recommendation:** when a language's `locale` is unconfigured, `.Language.Locale` falls back to `.Language.Name` (e.g. `en`) -- valid but region-less. Set `locale` per language (`[languages.en] locale = "en-US"`, `[languages.de] locale = "de-DE"`) for the full `ll_TT` `og:locale` and hreflang form. (`locale` replaced the `languageCode` key, which Hugo deprecated in v0.158.0.)
- **Per-language params:** because `[params.seo]` can be declared per language and everything reads through the `.Param` cascade, the Organization name, description, default image, title suffix, twitter handle, and verification codes can all differ per language. The WebSite/Organization `@id`s derive from the per-language `site.Home.Permalink`, so each language site has its own entity -- correct, since names and descriptions legitimately differ per language.

## Extension Hooks

Three documented override tiers plus a config-level suppression switch, so you can add, replace, and remove without forking the module.

1. **Same-name override of any module partial** (no guard needed): Hugo's template precedence makes your `layouts/_partials/seo/<same path>.html` win over the module's. The partials form three tiers so the target is obvious -- override a RENDERER (`seo/head-meta.html`, `seo/head-jsonld.html`) to change what is output, a RESOLVER (`seo/resolve/images.html`, `seo/resolve/robots.html`) to change how a value is chosen, or a NODE BUILDER (`seo/jsonld/product.html`) to reshape exactly one schema type. Each file has one responsibility, so an override never forces reimplementing anything else. Internal partial names are stable within a major version.
2. **Additive head hook:** author `layouts/_partials/seo/head-extra.html`. The module calls it behind a `templates.Exists` guard and passes the full `$ctx` (`{page, seo}`), so extra `<meta>`/`<link>` tags (app-store cards, additional verification, alternate feeds) can reuse the already-resolved title, description, images, and `@id`s. Purely additive, runs last, zero cost until you create the file.
3. **JSON-LD node hook:** author `layouts/_partials/seo/jsonld-extra.html` that RETURNS a slice of node dicts. The module appends them to its node list before serialization, so you can add FAQPage/Course/Recipe nodes with correct `@id` cross-linking (referencing `$ctx.seo.ids.webpage`, `.organization`, etc.) without the module shipping those builders -- extra `<script>` blocks in separate mode, extra `@graph` members in graph mode. Returned dicts must be container-agnostic (no `@context`).

Plus the config switch `params.seo.disable[]` (a slice of node-type names, e.g. `["VideoObject", "BreadcrumbList"]`): the zero-code way to say "emit everything except X".

Site-invariant nodes (WebSite, Organization) are built once per language via `partialCached`, so overriding their builders and referencing them by `@id` on every other page stays cheap. Non-home pages reference `#website`/`#organization` purely by `@id` string; the full nodes serialize only in the home page's output (and the flagged About page's), and Google merges the references by `@id`.

## Validation & Degradation

The module NEVER breaks a build over SEO data -- SEO is decoration on top of content. `errorf` is reserved for the single unrecoverable wiring error (`seo/head.html` called with a non-Page context); everything else is a deduplicated `warnf` (a misconfiguration a maintainer should fix) or silent omission (a legitimately absent optional field). A page with a broken or partial schema declaration degrades to: full classic head (always) + WebPage + BreadcrumbList, with the broken content node absent and one deduplicated warn logged. The build always completes.

Warnings are prefixed `[seo]`, identify the page by its relative permalink, and state the missing requirement; each is deduplicated via a `hugo.Store` sentinel (once per page per issue, or once per build for config-class warnings). Catalog:

| Condition | Action |
| --- | --- |
| A page declares a schema type but a Google-required property is unresolvable | `warnf` + node suppressed by the self-gating builder |
| Enum value invalid (`applicationCategory`, `availability`, `itemCondition`, gender, interaction type, return-policy category) | `warnf` + that single property dropped; node still emits |
| Numeric value unparseable (offer prices, `offer_count`, rating values and counts, audience ages, clip offsets, `watch_count`, interaction counts, `number_of_employees`, `merchant_return_days`, shipping `rate`) | `warnf` naming the page and field, deduplicated per field + value + page (two pages with the same bad number each warn) + that single property dropped; node still emits. An explicit 0 is a VALID value nearly everywhere (presence checks use `isset`, so a native unquoted `0` -- a free-tier `low_price`, a `worst_rating` of 0, a from-birth `suggested_min_age` -- parses and emits, never silently drops). Unquoted native numbers are accepted directly within the parser's bounds: a JSON `2500000` or `0.000001` parses without a warn, but a non-finite float (NaN, an infinity) is rejected, and an integer-context value must fit int64 (range-checked against about 9.2e18). Quoted strings parse as DECIMAL (a `"010"` reads as 10, never octal 8) and cap at fifteen integer digits (plus ten fractional digits in float contexts). Required-value exceptions: an unparseable `seo.offer.price` counts as missing, so SoftwareApplication suppresses its node, Product falls back to the Snippet track gate, and the `product:price:amount` meta is dropped; an unparseable `rating_value` drops the WHOLE AggregateRating/Review fragment (never a hollow rating node), so the node-level gates degrade; an unparseable clip `start_offset` drops that whole clip entry (startOffset is Google-required on Clip) |
| `max-snippet:`/`max-video-preview:` robots value unparseable | `warnf` + that single token dropped; the rest of the directive keeps merging (`-1` stays the valid unlimited sentinel) |
| Date value unparseable (`seo.date_published`/`seo.date_modified`, `seo.profile.date_created`, review `date_published`, `price_valid_until`, `founding_date`, `upload_date`, `expires`, broadcast dates) | `warnf` naming the page and field, deduplicated per field + value + page (two pages with the same bad date each warn) + that date property omitted. A bare native number (an unquoted `price_valid_until = 2026`) is rejected the same way -- never read as epoch seconds, so no silent 1970-era date |
| Mutually exclusive fields both set (`regions_allowed`+`ineligible_region`; `clips`+`seek_url_template`; `priceType`+`validForMemberTier`) | `warnf` + documented first-listed-wins tiebreak |
| Multiple type tables without `seo.type` | `warnf` + fixed priority Product, SoftwareApplication, VideoObject, ProfilePage |
| Unsupported `seo.type` value | `warnf` (keyed by the bad value) + fall through to auto-detect |
| Deprecated robots token supplied | `warnf` + token stripped |
| An optional property is empty; a node is inapplicable to the page kind; a breadcrumb trail is short; an author slug resolves to no page | SILENT omission -- absence of an optional field is normal |

Enum validation is inlined in the module (not shipped as `data/` files) so a consuming site's `data/` mounts cannot accidentally shadow the allowed-value lists.

## Migration

Adopt the module in three steps: import it, add the single `{{ partial "seo/head.html" . }}` line, and delete your hand-rolled SEO head. Legacy `meta_*`/`noindex`/`canonical` front matter keeps working via aliases, so NO content files change on day one; a half-migrated state (module imported, config not yet moved) still produces correct output from the legacy keys, so migration is incremental, and rollback is deleting the import and restoring the old partial call.

### From a hand-rolled head

1. **Import.** Add the `[[module.imports]]` block and run `hugo mod get github.com/alex-feel/hugo-artifacts/modules/seo`; confirm with `hugo mod graph`.
2. **Replace the head region.** In `baseof.html`, replace your site's entire SEO head (title, description, canonical, OG, Twitter, hreflang, robots, verification, and all inline JSON-LD -- whether in `<head>` or `<body>`) with the one partial call inside `<head>`. This alone moves JSON-LD out of `<body>`, removes duplicate canonicals, and closes the common `og:site_name`/`og:locale`/`og:image:alt` gaps. Keep your `<html lang>` attribute and viewport tag (outside the module's scope).
3. **Map site params (optional, removes deprecation).** `params.metadata.{title_suffix,description,image,keywords}` -> `params.seo.{title_suffix,description,default_image,keywords}`; `params.twitter` -> `params.seo.twitter_site`; `params.site_verification.*` -> `params.seo.verification.*`. The module reads the old locations as aliases, so this step can be deferred.
4. **Populate the publisher.** Fill `[params.seo.organization]` (name/url/logo/same_as at minimum) and `[params.seo.website]` (alternate_name, search_url_template). This is usually net-new eligibility: the site-name feature, the Sitelinks Search Box, and the knowledge-panel logo.
5. **Configure type dispatch.** Because the shipped default emits no content node on unmapped pages, set `[params.seo.types.sections]` for your article-bearing sections (e.g. `blog = "BlogPosting"`) -- one line replaces per-page `seo.type` annotations.
6. **Remove `<base href>` and `<meta name="keywords">`** from your templates. The module never emits either and relies on absolute `.Permalink` throughout.

### From a legacy `meta_*` vocabulary

Sites carrying legacy `meta_*`-style front matter (`meta_title`, `meta_description`, `meta_image`, `meta_type`, `noindex`, `canonical`) migrate with zero content rewrites: every one of those keys is read as a deprecated alias, and `seo.*` wins whenever both are present, so you can move content to the clean namespace key-by-key at your own pace. Specific upgrades adoption brings:

- **Authors:** if your site already follows the `/authors/<slug>` page pattern, `authors: [slug]` front matter maps directly with no change; move each author's handle into the author page's `seo.profile.twitter` (a legacy `twitter_username` key on the author page is read as its alias and feeds `twitter:creator`). Author pages gain a real ProfilePage node, and `Article.author` shares the `#person` `@id` with the profile so Google connects author to profile.
- **`same_as`:** `seo.same_as` works for all content types; the bare legacy top-level `same_as` front-matter key is read as its alias.
- **Video:** a YouTube `video_id` iframe stays as-is for display; the `video_id` alias seeds `seo.video.embed_url`/`thumbnail_url`, and adding `seo.video.duration` plus a `date` (uploadDate) closes the VideoObject gap. Metadata and player stay decoupled.
- **Course and other non-shipped types:** Course is intentionally not a module-shipped type (the universal module stays universal). Keep Course (or Recipe, FAQPage, ...) JSON-LD via the `jsonld-extra` hook, returning a node whose `provider` references the module's `#organization` `@id` and whose `@id` the WebPage can reference -- it joins the same entity graph without a site fork.
- **`.Scratch` cleanup:** any `.Scratch` usage inside the SEO partials you replace leaves with them (the module uses `hugo.Store` exclusively). Residual `.Scratch` in non-SEO partials is outside this module's scope; fix it separately.

## Module Structure

The module ships only `layouts/` plus the two identity files and this README; it needs no `assets/`, `static/`, `data/`, `i18n/`, `content/`, or `archetypes/` (SEO metadata is fully derived from consumer front matter and site params). All partials live under `layouts/_partials/seo/` in three override tiers: RENDERERS at the `seo/` root change WHAT is output, RESOLVERS under `seo/resolve/` change HOW a value is chosen, NODE BUILDERS under `seo/jsonld/` change ONE schema type's shape; `seo/lib/` holds internal cross-cutting utilities.

```text
modules/seo/
  go.mod                                   # module github.com/alex-feel/hugo-artifacts/modules/seo ; go 1.22
  hugo.toml                                # [module.hugoVersion] min = "0.160.0" ; no imports ; no mounts
  README.md                                # This file.
  layouts/
    _partials/
      seo/
        head.html                          # PUBLIC ENTRY (renderer). Resolves $seo once, renders head-meta + head-jsonld, then the guarded head-extra hook.
        context.html                       # Resolver-of-resolvers. Returns the canonical $seo dict consumed by every downstream partial.
        head-meta.html                     # Renderer. Classic head: title, description, canonical, robots, hreflang, OG (+type extras), Twitter, verification, feed discovery.
        head-jsonld.html                   # Renderer/dispatcher. Collects node dicts from jsonld/* + the jsonld-extra hook, emits separate <script> blocks (default) or one @graph block.
        resolve/
          title.html                       # Returns {title, titleFull} via the title fallback chain.
          description.html                 # Returns the unified description string shared by meta, OG, Twitter, and JSON-LD.
          canonical.html                   # Returns the absolute canonical URL.
          images.html                      # Returns the ordered slice of normalized image dicts.
          image.html                       # Returns one normalized image dict {url,width,height,type,alt,natural} from a candidate (og crop or natural variant).
          author.html                      # Returns the ordered slice of author descriptor dicts.
          dates.html                       # Returns {published, modified, created} RFC 3339 strings.
          robots.html                      # Returns {robots, bots} -- the merged robots directive string and the per-bot map.
          types.html                       # Returns {typeSet, ogType} via the dispatch ladder.
          id.html                          # Returns the canonical @id string for a node kind.
        lib/
          warn.html                        # Emits one deduplicated warnf per (warning-key, page) via a hugo.Store sentinel.
          enum.html                        # Returns the validated enum value or "" for applicationCategory, availability, itemCondition, gender, interaction types, return-policy category.
          time.html                        # Returns an RFC 3339 string for any time.Time value, or "" (with a deduplicated warn) when unparseable, or "" silently when zero; the single date-format authority.
          num.html                         # Returns the parsed decimal number (int or float) for any author-fed numeric value, or "" (with a deduplicated warn) when unparseable; octal-safe, overflow-safe.
        jsonld/
          website.html                     # Returns the WebSite node dict (home only; self-gates). Called via partialCached.
          organization.html                # Returns the Organization/OnlineStore/LocalBusiness/Person publisher node dict. Called via partialCached.
          webpage.html                     # Returns the WebPage/CollectionPage node dict (every eligible page; self-gates).
          breadcrumb.html                  # Returns a slice of BreadcrumbList node dicts; empty slice when < 2 items.
          article.html                     # Returns the Article/BlogPosting/NewsArticle node dict (self-gates to page kind + headline).
          product.html                     # Returns the Product node dict (Merchant Listing vs Snippet track; self-gates).
          offer.html                       # Returns an Offer or AggregateOffer node dict (shared by product and softwareapplication).
          rating.html                      # Returns an AggregateRating or Review node fragment (shared by product and softwareapplication).
          person.html                      # Returns a Person (or Organization) node dict from an author/profile descriptor.
          profilepage.html                 # Returns the ProfilePage node dict with nested mainEntity (self-gates to mainEntity.name).
          softwareapplication.html         # Returns the SoftwareApplication node dict (co-typing, enum-validated applicationCategory; self-gates).
          videoobject.html                 # Returns the VideoObject node dict (self-gates to name + thumbnailUrl + uploadDate).
          image-object.html                # Returns an ImageObject dict (or bare URL string) from a normalized image dict; reused by every image-carrying node.
```

Two consumer-authored hook files (`layouts/_partials/seo/head-extra.html` and `layouts/_partials/seo/jsonld-extra.html`) are intentionally NOT shipped; the module calls them only behind `templates.Exists` guards, so both are zero-cost until you opt in.
