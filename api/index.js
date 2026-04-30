// Edge-runtime for API Performance and Latency Testing
export const config = { runtime: "edge" };

const UPSTREAM_ENDPOINT = (process.env.TARGET_DOMAIN || "").replace(/\/$/, "");

const IGNORED_HEADERS = new Set([
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
]);

export default async function handler(req) {
  const url = new URL(req.url);

  // Health check endpoint for the professional UI monitoring tools
  if (url.pathname === "/api/health") {
    return new Response(JSON.stringify({ 
      status: "active", 
      latency: "normal",
      node: "Vercel-Edge-Cluster",
      timestamp: Date.now()
    }), {
      headers: { 
        "content-type": "application/json",
        "Access-Control-Allow-Origin": "*" 
      }
    });
  }

  if (!UPSTREAM_ENDPOINT) {
    return new Response("Configuration Missing", { status: 500 });
  }

  try {
    // Standardize request path for endpoint testing
    // This removes the /api prefix before forwarding to the target
    const internalPath = url.pathname.replace(/^\/api/, "");
    const requestUrl = UPSTREAM_ENDPOINT + internalPath + url.search;

    const filteredHeaders = new Headers();
    for (const [key, value] of req.headers) {
      if (IGNORED_HEADERS.has(key.toLowerCase()) || key.startsWith("x-vercel-")) continue;
      filteredHeaders.set(key, value);
    }

    // Set standard User-Agent for consistent diagnostic results
    filteredHeaders.set("User-Agent", "DevTools-Network-Analyzer/1.0");

    const response = await fetch(requestUrl, {
      method: req.method,
      headers: filteredHeaders,
      body: req.method !== "GET" && req.method !== "HEAD" ? req.body : undefined,
      duplex: "half",
      redirect: "follow",
    });

    const outputHeaders = new Headers(response.headers);
    
    // Remove content-encoding to allow Vercel to optimize the delivery
    outputHeaders.delete("content-encoding");

    return new Response(response.body, {
      status: response.status,
      headers: outputHeaders,
    });
  } catch (error) {
    console.error("Diagnostic Failure:", error);
    return new Response("Service Unavailable", { status: 503 });
  }
}
