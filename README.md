# True Link Token Desk

Customers scan a QR code, enter their name, mobile and email, and reception sends back a token number that appears on the customer's phone.

| Page | Who | What |
|---|---|---|
| `/queue.html` | Customer (opened from the QR code) | Details form, waiting screen, big token pop-up, review pop-up |
| `/reception.html` | Reception (password protected) | See customers, copy details into the ERP, send the token |
| `/qr.html` | Reception | Printable QR poster for the desk |

After the customer presses **Exit** on the token pop-up, they get a button to the review page:
https://truelink-review.netlify.app/customer (change it in one place: `REVIEW` in `public/queue.html`).
The token stays viewable on the page for 4 hours.

## Rules built in

- Mobile number must start with `05` and have exactly 10 digits (checked on the phone and again on the server).
- Reception sees the mobile number without the leading 0 (0501234567 is shown and copied as 501234567). The full number is still stored, and tap-to-call still dials it.
- Customer name is stored and shown in CAPITAL LETTERS; email in small letters; token numbers typed by reception in capitals.
- The form asks for the **mobile number first**. If that number has registered before, the name and email fill in automatically. The email is shown partly hidden (`a***@gmail.com`) so a stranger cannot read someone's email by typing their number; reception still receives the full email. Customers can type over any field to change it, and the change is remembered.
- Returning customers are remembered permanently (years), so they are recognised next month or next year. Only the daily queue is cleared after 24 hours. The saved list lives in the site's Netlify storage: it survives redeploys and renaming, but it is lost if the Netlify site is deleted or you create a new site from the repo.
- One customer can take more than one token: after getting a token they press **Get another token** (details are prefilled). Reception sees each request separately and is told "Request 2 of 3" for the same mobile number. A mobile number can have at most 5 requests waiting at once (`MAX_WAITING` in `api.mjs`).
- The customer's phone plays a short chime and vibrates when the token arrives (customers can switch the sound off with the 🔔 button). Vibration works on Android; iPhones do not allow web pages to vibrate. The page must stay open for the alert to work.
- Reception hears a loud 4-burst alert when a new customer arrives (use **Test sound**; click once on the page after opening it, as browsers require).

## Deploy (GitHub + Netlify, same way as the review site)

GitHub Pages alone cannot be used: this needs a small server function to store customer details and deliver tokens.

1. Create a new GitHub repository and upload everything in this folder.
2. In Netlify: **Add new site > Import an existing project > GitHub**, choose the repo, and deploy. No build command is needed.
3. In Netlify go to **Site configuration > Environment variables** and add `RECEPTION_PASSWORD` (your chosen password). Redeploy.
4. Open `https://YOUR-SITE.netlify.app/qr.html` and print it. Reception works at `/reception.html` (bookmark it).

## Settings (in `netlify/functions/api.mjs`)

- `TOKEN_HOURS = 4`: how long a customer can re-open their token.
- `QUEUE_KEEP`: customer records are deleted after 24 hours.
