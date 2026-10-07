# Lovely — Worker + D1

This implementation serves the storefront and JSON API from a JavaScript Worker. It requires a D1 database exposed as `env.DB`. Choose this folder or the PHP version; they use separate databases.

## Build

Use Node.js 22 or newer. From this directory:

```sh
npm ci
npm run build
```

The build embeds the public frontend and catalog in `dist/server/index.js`. It does not depend on any previous deployment or repository. The file exports a Worker with `fetch(request, env, ctx)`.

## Runtime configuration

Configure these bindings and secrets in your hosting environment:

| Name | Value |
| --- | --- |
| `DB` | Your D1 database binding |
| `CSRF_SECRET` | A private random value of at least 32 bytes |
| `ADMIN_EMAIL` | Your administrator email address |
| `ADMIN_PASSWORD_HASH` | The password hash JSON generated below |

Generate the administrator password hash locally:

```sh
node scripts/create-admin-hash.mjs
```

The command reads the password from a prompt, hides terminal input, and prints a JSON hash for the `ADMIN_PASSWORD_HASH` secret. Store the entire JSON string as the value. Do not commit the output or any private configuration. It uses PBKDF2-SHA256, a random 32-byte salt, 100,000 iterations and a 32-byte output, matching the server verifier.

Generate a separate CSRF secret with:

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Create the database, apply the SQL files in `drizzle/` in filename order, and deploy `dist/server/index.js` with these bindings. Configure the entrypoint, database identifier and secrets in your provider account. This archive intentionally contains no provider account identifiers or credentials.

Requests use same-origin cookies and CSRF checks. Serve the frontend and API together on the same HTTPS origin. Open **Admin studio** in the footer after configuration. Customer accounts are created through registration; the configured administrator is created at first successful administrator login.

## Data and assets

`db/schema.ts` and `drizzle/` describe the schema; `public/catalog.json` is the initial sample catalog. New installations seed the sample products without replacing existing records. Product photos are bundled in `public/assets/`; sources are recorded in `../PHP-JSON/ASSET-SOURCES.json`.

Admin controls support order requests, customer conversations and product management. Messages are delivered inside the website. There is no payment processor, mail sender, email verification or password recovery service.
