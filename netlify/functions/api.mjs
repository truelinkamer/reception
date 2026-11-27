import { getStore } from "@netlify/blobs";
import crypto from "node:crypto";

// Reception dashboard password. Set RECEPTION_PASSWORD in Netlify (Site configuration > Environment variables).
// If it is not set, the dashboard is open to anyone who knows the link, so always set it.
const PW = process.env.RECEPTION_PASSWORD || "";
const TOKEN_HOURS = 4;            // how long a customer can re-open their token
const QUEUE_KEEP = 24 * 3600e3;   // queue records are deleted after 24 hours
const CUSTOMER_KEEP = 365 * 24 * 3600e3; // saved customers (for auto-fill) are forgotten after 1 year without a visit
const MAX_WAITING = 5;            // one customer (mobile number) can have at most this many requests waiting at once

const J = (d, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
const sign = (e) => crypto.createHmac("sha256", PW).update(String(e)).digest("hex");
const eq = (a, b) => { a = Buffer.from(a); b = Buffer.from(b); return a.length === b.length && crypto.timingSafeEqual(a, b); };
const authed = (req) => {
  if (!PW) return true;
  const [e, s] = (req.headers.get("authorization") || "").replace("Bearer ", "").split(".");
  return !!(e && s && +e > Date.now() && eq(s, sign(e)));
};
const clip = (v, n) => String(v || "").trim().slice(0, n);
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const AL = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const digits = (v) => String(v || "").replace(/[٠-٩]/g, (d) => "٠١٢٣٤٥٦٧٨٩".indexOf(d)).replace(/\D/g, "");
// a***@gmail.com : the public lookup never reveals a full email address
const maskEmail = (e) => { const [l, d] = String(e).split("@"); return l && d ? l[0] + "***@" + d : ""; };
const rid = () => Array.from(crypto.randomBytes(16), (b) => AL[b % 32]).join("");

export default async (req) => {
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/api\//, "");
  const POST = req.method === "POST";
  const body = POST ? await req.json().catch(() => ({})) : {};
  const queue = getStore({ name: "queue", consistency: "strong" });
  const customers = getStore({ name: "customers", consistency: "strong" }); // returning-customer directory, keyed by mobile number

  // ---- Customer side (opened from the QR code) ----
  // Returning customer: mobile number -> saved name + masked email, so the form can fill itself in.
  if (path === "queue/lookup") {
    const phone = digits(url.searchParams.get("phone"));
    if (!/^05\d{8}$/.test(phone)) return J({ found: false });
    const c = await customers.get(phone, { type: "json" });
    if (!c) return J({ found: false });
    if (Date.now() - new Date(c.updatedAt).getTime() > CUSTOMER_KEEP) { await customers.delete(phone); return J({ found: false }); }
    return J({ found: true, name: c.name, emailMasked: maskEmail(c.email) });
  }

  if (path === "queue/join" && POST) {
    if (body.bot) return J({ ok: true }); // honeypot
    // Customer entries are stored in capital letters. Mobile must be 05XXXXXXXX (10 digits).
    const name = clip(body.name, 80).toUpperCase();
    const phone = digits(body.phone);
    if (!name) return J({ error: "invalid", field: "name" }, 400);
    if (!/^05\d{8}$/.test(phone)) return J({ error: "invalid", field: "phone" }, 400);
    // Email is stored in small letters. A returning customer who did not change the saved (masked) email sends useSaved.
    const saved = await customers.get(phone, { type: "json" });
    let email = clip(body.email, 120).toLowerCase();
    if (body.useSaved && saved) email = saved.email;
    if (!EMAIL.test(email)) return J({ error: "invalid", field: "email" }, 400);
    // The same customer may take more than one token; only stop obvious spamming.
    const { blobs } = await queue.list();
    const all = (await Promise.all(blobs.map((b) => queue.get(b.key, { type: "json" })))).filter(Boolean);
    if (all.filter((i) => i.phone === phone && i.status === "waiting").length >= MAX_WAITING) return J({ error: "toomany" }, 429);
    const id = rid(); // unguessable: it is the customer's only key to their token
    await queue.setJSON(id, {
      id, name, phone, email, language: body.language === "ar" ? "ar" : "en",
      createdAt: new Date().toISOString(), status: "waiting", token: "", issuedAt: null,
    });
    await customers.setJSON(phone, { phone, name, email, updatedAt: new Date().toISOString(), visits: ((saved && saved.visits) || 0) + 1 });
    return J({ id });
  }

  if (path === "queue/status") {
    const id = (url.searchParams.get("id") || "").trim().toUpperCase();
    const it = /^[A-Z0-9]{16}$/.test(id) ? await queue.get(id, { type: "json" }) : null;
    if (!it) return J({ error: "notfound" }, 404);
    const t = it.issuedAt ? new Date(it.issuedAt).getTime() : 0;
    return J({
      status: it.status, token: it.token, name: it.name, issuedAt: it.issuedAt,
      visibleUntil: t ? new Date(t + TOKEN_HOURS * 3600e3).toISOString() : null,
      now: new Date().toISOString(),
    });
  }

  // ---- Reception side ----
  if (path === "reception/login" && POST) {
    if (!PW) return J({ token: "open" });
    if (eq(String(body.password || ""), PW)) {
      const e = Date.now() + 12 * 3600e3;
      return J({ token: e + "." + sign(e) });
    }
    return J({ error: "bad" }, 401);
  }
  if (path.startsWith("reception/")) {
    if (!authed(req)) return J({ error: "auth" }, 401);
    if (path === "reception/list") {
      const { blobs } = await queue.list();
      const all = (await Promise.all(blobs.map((b) => queue.get(b.key, { type: "json" })))).filter(Boolean);
      const old = all.filter((i) => Date.now() - new Date(i.createdAt).getTime() > QUEUE_KEEP);
      await Promise.all(old.map((i) => queue.delete(i.id)));
      const items = all.filter((i) => !old.includes(i)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      return J({ items });
    }
    if (path === "reception/issue" && POST) {
      const it = await queue.get(String(body.id), { type: "json" });
      if (!it) return J({ error: "notfound" }, 404);
      const token = clip(body.token, 20).toUpperCase(); // always stored and shown in capitals
      if (!/^[A-Z0-9][A-Z0-9\- ]{0,19}$/.test(token)) return J({ error: "badtoken" }, 400);
      it.token = token; it.status = "issued"; it.issuedAt = new Date().toISOString();
      await queue.setJSON(it.id, it);
      return J({ item: it });
    }
    if (path === "reception/delete" && POST) {
      await queue.delete(String(body.id));
      return J({ ok: true });
    }
  }
  return J({ error: "not found" }, 404);
};

export const config = { path: "/api/*" };
