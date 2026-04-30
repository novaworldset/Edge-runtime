// Edge-runtime CDN
export const config = { runtime: "edge" };

const TARGET_BASE = (process.env.TARGET_DOMAIN || "").replace(/\/$/, "");

const STRIP_HEADERS = new Set([
  "host", "connection", "keep-alive", "proxy-authenticate",
  "proxy-authorization", "te", "trailer", "transfer-encoding",
  "upgrade", "forwarded", "x-forwarded-host", "x-forwarded-port"
]);

export default async function handler(req) {
  if (!TARGET_BASE) {
    return new Response("Misconfigured", { status: 500 });
  }

  try {
    const url = new URL(req.url);
    const targetUrl = TARGET_BASE + url.pathname + url.search;

    const headers = new Headers();

    for (const [k, v] of req.headers) {
      const key = k.toLowerCase();
      if (STRIP_HEADERS.has(key) || key.startsWith("x-vercel-")) continue;
      
      if (key === "x-real-ip" || key === "x-forwarded-for") {
        headers.set("x-forwarded-for", v);
        continue;
      }
      headers.set(k, v);
    }

    // Headers شبیه CDN
    headers.set("x-forwarded-host", url.host);
    headers.set("x-forwarded-proto", "https");

    const response = await fetch(targetUrl, {
      method: req.method,
      headers,
      body: ["GET", "HEAD"].includes(req.method) ? undefined : req.body,
      duplex: "half",
      redirect: "manual",
    });

    const outHeaders = new Headers(response.headers);

    // هدرهای CDN-like
    outHeaders.set("server", "Vercel-Edge");
    outHeaders.set("via", "1.1 Vercel-Edge");
    outHeaders.set("x-cdn", "Vercel-Edge-CDN");
    outHeaders.set("cache-control", response.headers.get("cache-control") || "public, max-age=0, must-revalidate");

    // حذف هدرهای مشکل‌ساز برای Vercel
    outHeaders.delete("content-encoding");
    outHeaders.delete("transfer-encoding");
    outHeaders.delete("content-length"); // Vercel خودش مدیریت می‌کنه

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: outHeaders,
    });

  } catch (err) {
    console.error("Proxy error:", err);
    return new Response("Service Unavailable", { 
      status: 503,
      headers: { "content-type": "text/plain" }
    });
  }
}
