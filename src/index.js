import { Filter } from "bad-words";
const filter = new Filter();

export default {
  async fetch(request, env) {
    const ADMIN_PASS = env.ADMIN_PASS || 'admin'; // IF YOU DEPLOY THIS PLEASE SET ADMIN PASS TO YOUR OWN!!!
    const url = new URL(request.url);
    const ip = request.headers.get("CF-Connecting-IP") || "unknown";
    const origin = request.headers.get("Origin") || "";
    
    // Check if we are in dev mode (localhost)
    const isDev = origin.includes("localhost") || url.hostname === "127.0.0.1";
    const cacheHeader = isDev 
      ? "no-store, no-cache, must-revalidate, proxy-revalidate" 
      : "public, max-age=259200"; // 72 Hours

    // 🌐 CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors() });
    }

    // 📦 EXTENSION FILE (No Rate Limit)
    if (url.pathname === "/extension.js") {
      const file = await env.DB.get("extension.js");
      if (!file) return new Response("// extension.js not found", { status: 404 });
      return new Response(file, { 
        headers: { 
          ...cors(), 
          "content-type": "text/javascript",
          "Cache-Control": cacheHeader
        } 
      });
    }

    // 🛡️ RATE LIMIT (Applies to all API and Mod routes)
    if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/CTDBv2/") || url.pathname.startsWith("/moderate")) {
      const { success } = await env.RATE_LIMITER.limit({ key: ip });
      if (!success) return new Response(JSON.stringify({error: "Too many requests"}), { status: 429 });
    }

    // 🏠 ROOT INDEX
    if (url.pathname === "/") {
      return new Response(getIndexHtml(), { 
        headers: { 
          "content-type": "text/html",
          "Cache-Control": cacheHeader
        } 
      });
    }

    // 🌐 MODERATION UI
    if (url.pathname === "/moderate") {
      const html = await env.DB.get("admin.html");
      return new Response(html || "admin.html missing from KV", {
        status: html ? 200 : 404,
        headers: { 
          ...cors(), 
          "content-type": "text/html",
          "Cache-Control": cacheHeader
        }
      });
    }

    // 📦 MOD LIST (Admin)
	if (url.pathname === "/moderate/list") {
	  // const pass = request.headers.get("x-pass");
	  // if (!ADMIN_PASS || pass !== ADMIN_PASS) return new Response("Unauthorized", { status: 403 });

	  const list = await env.DB.list();
	  let html = "";
	  for (const key of list.keys.slice(0, 50)) {
	    const val = await env.DB.get(key.name);
	    
	    // Escape values for safe HTML rendering
	    const safeKeyName = escapeHtml(key.name);
	    const safeKeyAttr = escapeHtml(JSON.stringify(key.name)); // Safely stringify for JSON attributes
	    const safeVal = escapeHtml(val);

	    html += `
	      <div class="item p-6 hover:bg-gray-50 transition-colors">
	        <div class="flex justify-between items-start mb-2">
	          <span class="font-mono text-sm font-bold text-indigo-600 bg-indigo-50 px-2 py-1 rounded">${safeKeyName}</span>
	          <button hx-post="/moderate/delete" 
	                  hx-vals='{"key": ${safeKeyAttr}, "pass": "${escapeHtml(pass)}"}' 
	                  hx-target="closest .item" 
	                  hx-swap="outerHTML"
	                  class="text-red-500 hover:bg-red-50 px-3 py-1 rounded text-xs font-semibold border border-red-200">
	            Delete
	          </button>
	        </div>
	        <pre class="bg-gray-800 text-green-400 p-4 rounded-lg text-xs overflow-x-auto shadow-inner">${safeVal}</pre>
	      </div>`;
	  }
	  return new Response(html || '<p class="p-10 text-center">Empty.</p>', { headers: { "content-type": "text/html" } });
	}

    // 🗑 MOD DELETE ACTION (HTMX)
    if (url.pathname === "/moderate/delete" && request.method === "POST") {
      const form = await request.formData();
      const pass = form.get("pass");
      const key = form.get("key");
      if (!ADMIN_PASS || pass !== ADMIN_PASS) return json({ error: "Unauthorized" }, 403);
      await env.DB.delete(key);
      return new Response("", { status: 204 });
    }

    // 🧠 LEGACY API (v1)
    if (url.pathname.startsWith("/api/")) {
      const rawKey = decodeURIComponent(url.pathname.slice(5));
      const fullKey = "CTDB:" + rawKey;

      if (request.method === "GET") {
        const value = await env.DB.get(fullKey);
        if (!value) return json({ error: "Not found" }, 404);
        return new Response(value, { headers: { ...cors(), "content-type": "application/json" } });
      }

      if (request.method === "POST") {
        const data = await request.json();
        const safe = JSON.parse(JSON.stringify(data).replace(/(\w+)/g, m => filter.isProfane(m) ? "***" : m));
        await env.DB.put(fullKey, JSON.stringify(safe));
        return json({ ok: true, stored: safe });
      }

      if (request.method === "DELETE") {
        await env.DB.delete(fullKey);
        return json({ ok: true });
      }
    }

    // 🧠 SCOPED API (v2)
    if (url.pathname === "/CTDBv2/Key") {
      const rawKey = url.searchParams.get("name");
      const scope = url.searchParams.get("scope") || "CT"; 
      
      if (!rawKey) return json({ error: "Missing 'name' parameter" }, 400);
      if (new TextEncoder().encode(rawKey).length > 256) return json({ error: "Key too long" }, 400);

      const fullKey = `${scope}DB:${rawKey}`;
      if (filter.isProfane(rawKey) || filter.isProfane(scope)) return json({ error: "Profane content" }, 400);

      if (request.method === "GET") {
        const value = await env.DB.get(fullKey);
        if (!value) return json({ error: "Not found" }, 404);
        return new Response(value, { headers: { ...cors(), "content-type": "application/json" } });
      }

      if (request.method === "POST") {
        const bodyText = await request.text();
        if (new TextEncoder().encode(bodyText).length > 8 * 1024 * 1024) return json({ error: "Value too large" }, 413);

        const data = JSON.parse(bodyText);
        const safe = JSON.parse(JSON.stringify(data).replace(/(\w+)/g, m => filter.isProfane(m) ? "***" : m));
        await env.DB.put(fullKey, JSON.stringify(safe));
        return json({ ok: true, scope, key: rawKey, stored: safe });
      }

      if (request.method === "DELETE") {
        const pass = request.headers.get("x-pass");
        if (!ADMIN_PASS || pass !== ADMIN_PASS) return json({ error: "Unauthorized" }, 403);
        await env.DB.delete(fullKey);
        return json({ ok: true, deleted: rawKey });
      }
    }

    return json({ error: "Not found" }, 404);
  }
};

// --- Helpers ---

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: cors() });
}

function cors() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, x-pass"
  };
}

function getIndexHtml() {
  return `
    <!DOCTYPE html>
    <html>
    <head><title>CTDB Index</title><style>body{font-family:sans-serif;line-height:1.6;padding:2rem;max-width:800px;margin:auto;}</style></head>
    <body>
      <h1>Welcome to CTDB</h1>
      <p>Powering the CTDBAPI extension for CodeTorch and Worldwide Database for AmpMod/OmniBlocks!</p>
      <hr/>
      <h3>APIs</h3>
      <p><strong>v2 (Recommended):</strong> <code>/CTDBv2/Key?name=test&scope=myProject</code></p>
      <p><strong>v1 (Legacy):</strong> <code>/api/{key}</code></p>
      <hr/>
      <h3>Terms of Use</h3>
      <ol>
        <li>Please do NOT overuse this, I am on a free plan and can barely survive a few thousand writes.</li>
        <li>Do not attempt to hack into the moderator panel. If you do this, you will be IP banned.</li>
        <li>Do not put personal info or swear words into keys or values. Swear words are automatically censored.</li>
        <li>Just don't be a jerk.</li>
      </ol>
    </body>
    </html>
  `;
}
function escapeHtml(str) {
  if (!str) return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
