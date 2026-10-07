# Lovely

A boutique storefront with customer accounts, a shopping bag, order requests, private customer/admin messaging and a product management studio.

## Choose a backend

- **PHP-JSON/** — standalone PHP API with locked JSON storage. Start here for PHP hosting. Setup instructions are in `PHP-JSON/README.md`.
- **Worker-D1/** — JavaScript Worker API with a D1 SQL database. Includes schema, SQL migrations and an independent build script. Setup details are in `Worker-D1/README.md`.

These are alternative implementations of the same shop. Each contains its own frontend and sample assets; their databases are separate.

## Features

- Registration with name, email, Armenian phone number (`+374` followed by eight digits) and password.
- Sign in using email or phone number and password; optional remembered sessions.
- Four-image product galleries, colors, sizes, prices and discounts.
- Contact requests containing the selected bag items, with administrator alerts and status updates.
- Private conversations between customers and the administrator.
- Admin product creation and editing, categories, product types, sizes, colors and visibility.
- Responsive charcoal (`#1c1c1c`), green (`#1f7b35`) and white (`#ffffff`) theme with reduced-motion support.

## GitHub

Extract this archive and upload the **contents** of this folder into your repository. The repository contains source, sample catalog and image credits. Build output, local credentials and private customer records are excluded. Keep those files out of future commits using the included ignore rules.

No administrator account is bundled. Create your own administrator following the selected backend's instructions. Hosting the source in a repository does not run its backend: use a PHP server or a Worker runtime with D1.

## Sample content

Replace the sample catalog with your actual products before accepting orders. Image sources and attribution details are preserved in `PHP-JSON/ASSET-SOURCES.json`. The samples do not establish commercial image rights. Keep any third-party notices when reusing assets.

The shop records requests for manual confirmation; it does not process payments or send email/SMS. Password recovery and email verification are not implemented. JSON storage is intended for small installations; use an appropriate database for larger workloads.
