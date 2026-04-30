// Edge-runtime CDN-like Proxy - Version 5
export const config = { runtime: "edge" };

const TARGET_BASE = (process.env.TARGET_DOMAIN || "").replace(/\/$/, "");

const STRIP_HEADERS = new Set([
  "host", "connection", "keep-alive", "proxy-authenticate",
  "proxy-authorization", "te", "trailer", "transfer-encoding",
  "upgrade", "forwarded", "x-forwarded-host", "x-forwarded-port"
]);

export default async function handler(req) {
  if (!TARGET_BASE) {
    return new Response("Misconfigured: TARGET_DOMAIN is not set", { status: 500 });
  }

  try {
    const url = new URL(req.url);
    let targetPath = url.pathname + url.search;

    // مهم: مدیریت صفحه اصلی
    if (targetPath === "" || targetPath === "/" || targetPath === "/?") {
      targetPath = "/";
    }

    const targetUrl = TARGET_BASE + targetPath;

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

    // هدرهای مهم برای صفحه اصلی
    headers.set("x-forwarded-host", url.host);
    headers.set("x-forwarded-proto", "https");
    headers.set("host", new URL(TARGET_BASE).host);   // ← این خط خیلی مهمه

    const response = await fetch(targetUrl, {
      method: req.method,
      headers,
      body: ["GET", "HEAD"].includes(req.method) ? undefined : req.body,
      duplex: "half",
      redirect: "manual",
    });

    const outHeaders = new Headers(response.headers);

    // شبیه CDN
    outHeaders.set("server", "Vercel-Edge");
    outHeaders.set("via", "1.1 Vercel-Edge-CDN");
    outHeaders.set("x-cdn", "Vercel-Edge");
    outHeaders.set("x-proxy-version", "5");

    // پاک‌سازی هدرهای مشکل‌ساز
    outHeaders.delete("content-encoding");
    outHeaders.delete("transfer-encoding");
    outHeaders.delete("content-length");

    // مدیریت ریدایرکت (مهم برای صفحه اصلی)
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (location) {
        // اگر ریدایرکت داخلی باشد، آن را درست کنیم
        if (location.startsWith("/")) {
          outHeaders.set("location", location);
        } else if (location.startsWith(TARGET_BASE)) {
          outHeaders.set("location", location.replace(TARGET_BASE, ""));
        }
      }
    }

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
