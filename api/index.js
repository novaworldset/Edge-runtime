// Edge-runtime  - Optimized for Vercel
export const config = { runtime: "edge" };

const TARGET_BASE = (process.env.TARGET_DOMAIN || "").replace(/\/$/, "");

if (!TARGET_BASE) {
  console.error("TARGET_DOMAIN environment variable is not set!");
}

const FORBIDDEN_HEADERS = new Set([
  "host",
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "forwarded",
  "x-forwarded-host",
  "x-forwarded-proto",
  "x-forwarded-port",
  "x-vercel-",
]);

export default async function handler(req) {
  if (!TARGET_BASE) {
    return new Response("Misconfigured: TARGET_DOMAIN is not set", { 
      status: 500,
      headers: { "content-type": "text/plain" }
    });
  }

  try {
    // Extract path
    const url = new URL(req.url);
    const targetUrl = `${TARGET_BASE}${url.pathname}${url.search}`;

    const headers = new Headers();

    // Copy headers with filtering
    for (const [key, value] of req.headers) {
      const lowerKey = key.toLowerCase();
      
      if (FORBIDDEN_HEADERS.has(lowerKey) || lowerKey.startsWith("x-vercel-")) {
        continue;
      }

      if (lowerKey === "x-real-ip" || lowerKey === "x-forwarded-for") {
        headers.set("x-forwarded-for", value);
        continue;
      }

      headers.set(key, value);
    }

    // Add original host for backend
    headers.set("x-forwarded-host", url.host);
    headers.set("x-forwarded-proto", "https");

    const hasBody = !["GET", "HEAD"].includes(req.method);

    const response = await fetch(targetUrl, {
      method: req.method,
      headers,
      body: hasBody ? req.body : undefined,
      duplex: "half",
      redirect: "manual",
    });

    // Return response with original headers (except restricted ones)
    const outHeaders = new Headers(response.headers);
    
    // Remove problematic headers for Vercel
    outHeaders.delete("content-encoding"); // Vercel usually handles this
    outHeaders.delete("transfer-encoding");

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: outHeaders,
    });

  } catch (err) {
    console.error("Proxy error:", err);
    return new Response("Bad Gateway", { status: 502 });
  }
}
