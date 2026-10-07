# Lovely — PHP + JSON boutique

A responsive fashion storefront with customer accounts, a remembered shopping bag, contact requests, private customer/admin messages, and a restricted admin studio.

## Start locally (Windows, macOS or Linux)

1. Install PHP 8.3 or newer (XAMPP on Windows includes PHP), then extract this folder.
2. Open a terminal inside `PHP-JSON`. On Windows with XAMPP, replace `php` below with `C:\xampp\php\php.exe` if PHP is not on PATH.
3. Create your administrator account:

   ```sh
   php bin/create-admin.php your-email@gmail.com "Your Name"
   ```

   Enter a unique password of 10–72 characters when prompted. This package starts without user accounts. This command creates an administrator or replaces the password of an existing administrator. On Windows the terminal may show the password as you type; use a private terminal.

4. Start the local website:

   ```sh
   php -S localhost:8000 -t public
   ```

5. Open http://localhost:8000. Click **Admin studio** in the footer and use the separate admin sign-in form. To test the customer journey, use a separate browser profile and register a customer.

The PHP development server is for local testing only.

## Publish on PHP hosting

- Use PHP 8.3+ with JSON, sessions, filter and password hashing (normally included).
- Upload the project and set the domain's **document root to `PHP-JSON/public`**. Keep `app`, `bin`, and `data` outside the publicly accessible directory. Do not upload the whole project under an exposed web root.
- On shared hosting, put the contents of `public` in `public_html` and place `app` and `data` alongside `public_html`; the relative PHP paths then work. Put `bin` alongside them too, or create the admin locally before uploading the private data folder.
- The PHP process needs read/write permissions for the private `data` directory. Prefer directory mode 0700 and files 0600 when the PHP process owns them. Do not use 0777.
- Use HTTPS. Cookies use the Secure flag when PHP detects HTTPS. If TLS terminates at a reverse proxy, configure the server to set HTTPS correctly; do not blindly trust browser-provided forwarded headers.
- Create the admin through the command line, then sign in normally. Only CLI-created admins can access administration. Re-running the command for an email resets that account password, promotes it to admin and revokes its existing sessions.
- Apache security headers are in `public/.htaccess`. If using Nginx, configure equivalent headers and disable directory listings. The root `.htaccess` is defense in depth; **the document root remains the security boundary**. If inherited Apache authorization blocks the public directory, explicitly allow your `PHP-JSON/public` directory in the virtual host while keeping parent folders private.
- Back up `data/store.json` regularly. Copy it while holding the `data/store.lock` lock; never modify a live store by hand.

## Customer flow

Browse → open a product's four-photo gallery → choose size and color → **Add to bag** → sign in or register if needed → review bag → **Contact me about these pieces**.

If an email already has a Lovely account, **Create account** automatically switches to **Sign in** and keeps the email filled in. Use the password from that existing account; registering the same email a second time is intentionally rejected.

The server saves a request with customer name/email, selected options, quantities, catalog prices and an optional note. No online payment is collected. Admins see new requests and reply in the website's messages to confirm availability and delivery. The customer sees status changes under their account.

Email is accepted as an email address; Gmail is not required. Entering an email does not verify ownership. This version does not send emails, SMS, browser push notifications, or password reset links. Admin alerts refresh every 12 seconds while the signed-in admin page is open. Customer conversations refresh every 12 seconds while open. Use **Customers → Message** to initiate a conversation.

## Admin studio

- Requests: customer identity, selected items, totals, notes, status changes and message action.
- Inbox: private conversations with unread counts and replies.
- Customers: names, emails, join dates and roles; never passwords or hashes.
- Catalog: add/edit pieces, price and original price, category, sizes, named hex colors, at least four image URLs, badge and visibility. Hiding a piece removes it from the shop without removing old order snapshots.
- Each list supports search and 20-record pagination. Search applies when you finish editing the search field (Enter or blur).

There is no uploaded-file endpoint. For new photos, upload them through your hosting file manager into `public/assets` and enter `assets/filename.jpg`, or use HTTPS image URLs you control. Different color options use one shared product gallery in this version.

## Files and storage

- `public/index.html`, `styles.css`, `app.js`: responsive frontend and animations.
- `public/api.php`: authenticated JSON API.
- `app/bootstrap.php`: locked file storage, session token and user helpers.
- `app/catalog.json`: initial seed used only when the private store does not exist.
- `data/store.json`: created on first request, containing users, password hashes, hashed login tokens, orders, messages, catalog and rate limits.
- `bin/create-admin.php`: command-line-only account provisioning.
- `public/catalog.json`: public sample catalog used only by preview mode; it contains no user data.
- `public/config.js`: `LOVELY_PREVIEW = false` in the real project. Keep it false on PHP hosting.

Passwords use PHP `password_hash` / `password_verify` (bcrypt). Raw passwords are never written to JSON or browser storage. Auth cookies are HttpOnly, SameSite=Lax and Secure on HTTPS. Login tokens are random; only token hashes are stored server-side. Remember me lasts 30 days; unchecked creates a browser-session cookie with a 12-hour server lifetime. Logout revokes the token. The bag alone is stored on the device, with no names, emails or passwords.

POST requests require a server-session CSRF token. Customer data access and admin roles are enforced on the server. Prices are recalculated from the catalog. Contact requests have an idempotency key. JSON mutations are serialized with `flock` and committed by an atomic same-directory rename, preventing concurrent writes from overwriting each other. Do not host on a network filesystem without reliable locking and atomic rename.

## Before taking real orders

Replace the sample catalog, photos, prices, sizes, colors and descriptions with your verified products. Current imagery comes from a demo catalog and an existing retailer as visual references, not evidence that Lovely stocks these items; no redistribution or commercial-use license was verified. Source URLs are in `ASSET-SOURCES.json`. Product descriptions explicitly identify sample items. Remove the “sample edit” label only after replacing the sample catalog. Add your store's actual delivery, return and privacy information.

JSON storage is a launch-scale implementation, **not a large database**. Each API call currently locks and reads the whole file; pagination limits the response, not database memory or disk work. For a large catalog, many customers or high concurrent traffic, migrate to MySQL/PostgreSQL before scaling. The API/frontend separation makes that migration straightforward. Email verification and password recovery are not included; customer password recovery currently requires a trusted server operator to add a controlled recovery process. Do not use the admin-creation command to reset a customer password, because it also grants admin access.

## Motion and accessibility

Animated panels, gallery transitions, product reveals, hover interactions and a charcoal, green and white theme. System “reduced motion” is respected. Native modal dialogs provide focus containment and Escape dismissal; controls have labels, keyboard support and accessible live feedback. Layouts adapt to phones and desktops. Google Fonts are optional; system fallbacks keep the site functional if unavailable.
