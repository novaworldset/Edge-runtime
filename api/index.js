// Edge-runtime CDN-like Proxy - Version 4
export const config = { runtime: "edge" };

const TARGET_BASE = (process.env.TARGET_DOMAIN || "").replace(/\/$/, "");

const STRIP_HEADERS = new Set([
  "host", "connection", "keep-alive", "proxy-authenticate",
  "proxy-authorization", "te", "trailer", "transfer-encoding",
  "upgrade", "forwarded", "x-forwarded-host", "x-forwarded-port"
]);

export default async function handler(req) {
  if (!TARGET_BASE) {
    return new Response("Misconfigured: TARGET_DOMAIN is not set", { 
      status: 500 
    });
  }

  try {
    const url = new URL(req.url);
    
    // بهبود مدیریت مسیر صفحه اول (Homepage)
    let pathname = url.pathname;
    if (pathname === "" || pathname === "/") {
      pathname = "/"; // مطمئن شدن از root path
    }

    const targetUrl = TARGET_BASE + pathname + url.search;

    const headers = new Headers();

    for (const [k, v] of req.headers) {
      const key = k.toLowerCase();
      if (STRIP_HEADERS.has(key) || key.startsWith("x-vercel-") || key.startsWith("x-next-")) continue;
      
      if (key === "x-real-ip" || key === "x-forwarded-for") {
        headers.set("x-forwarded-for", v);
        continue;
      }
      headers.set(k, v);
    }

    // هدرهای CDN-like
    headers.set("x-forwarded-host", url.host);
    headers.set("x-forwarded-proto", "https");
    headers.set("x-vercel-proxied", "true"); // کمک به دیباگ

    const response = await fetch(targetUrl, {
      method: req.method,
      headers,
      body: ["GET", "HEAD"].includes(req.method) ? undefined : req.body,
      duplex: "half",
      redirect: "manual",   // مهم: manual برای مدیریت ریدایرکت‌ها
    });

    const outHeaders = new Headers(response.headers);
    
    // هدرهای شبیه CDN واقعی
    outHeaders.set("server", "Vercel-Edge");
    outHeaders.set("via", "1.1 Vercel-Edge-CDN");
    outHeaders.set("x-cdn", "Vercel-Edge");
    outHeaders.set("x-proxy-version", "4");

    // پاک کردن هدرهای مشکل‌ساز برای Vercel
    outHeaders.delete("content-encoding");
    outHeaders.delete("transfer-encoding");
    outHeaders.delete("content-length");

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: outHeaders,
    });

  } catch (err) {
    console.error("Proxy error:", err);
    return new Response("Service Unavailable", { status: 503 });
  }
}
