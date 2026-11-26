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

## Deploy (GitHub + Netlify, same way as the review site)

GitHub Pages alone cannot be used: this needs a small server function to store customer details and deliver tokens.

1. Create a new GitHub repository and upload everything in this folder.
2. In Netlify: **Add new site > Import an existing project > GitHub**, choose the repo, and deploy. No build command is needed.
3. In Netlify go to **Site configuration > Environment variables** and add `RECEPTION_PASSWORD` (your chosen password). Redeploy.
4. Open `https://YOUR-SITE.netlify.app/qr.html` and print it. Reception works at `/reception.html` (bookmark it).

## Settings (in `netlify/functions/api.mjs`)

- `TOKEN_HOURS = 4`: how long a customer can re-open their token.
- `QUEUE_KEEP`: customer records are deleted after 24 hours.
