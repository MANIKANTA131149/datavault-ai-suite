/* Querify Embed Widget Loader (F8)
 *
 * Usage on any website:
 *   <script src="https://www.querify.in/embed.js"
 *           data-deploy-id="YOUR_DEPLOY_ID"
 *           async></script>
 *
 * Renders a floating chat launcher that opens the deployed Querify chat in an
 * isolated iframe. No CSS bleed: everything lives in fixed-position elements
 * with inline styles and a unique namespace.
 */
(function () {
  "use strict";
  if (window.__querifyEmbedLoaded) return;
  window.__querifyEmbedLoaded = true;

  var script = document.currentScript || (function () {
    var all = document.getElementsByTagName("script");
    for (var i = all.length - 1; i >= 0; i--) {
      if (all[i].src && all[i].src.indexOf("embed.js") !== -1) return all[i];
    }
    return null;
  })();
  if (!script) return;

  var deployId = script.getAttribute("data-deploy-id");
  if (!deployId) {
    console.error("[Querify Embed] data-deploy-id attribute is required");
    return;
  }

  var origin = (function () {
    try {
      var u = new URL(script.src);
      return u.origin;
    } catch (e) {
      return "https://www.querify.in";
    }
  })();

  var apiBase = script.getAttribute("data-api-base") || origin;

  function mount(config) {
    var position = config.position === "bottom-left" ? "left" : "right";
    var color = config.primaryColor || "#3b82f6";

    // Launcher button
    var btn = document.createElement("button");
    btn.setAttribute("aria-label", "Open " + (config.title || "Querify chat"));
    btn.style.cssText =
      "position:fixed;bottom:20px;" + position + ":20px;z-index:2147483646;" +
      "width:56px;height:56px;border-radius:50%;border:none;cursor:pointer;" +
      "background:" + color + ";box-shadow:0 4px 14px rgba(0,0,0,.25);" +
      "display:flex;align-items:center;justify-content:center;transition:transform .15s ease;";
    btn.onmouseenter = function () { btn.style.transform = "scale(1.06)"; };
    btn.onmouseleave = function () { btn.style.transform = "scale(1)"; };
    btn.innerHTML =
      '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>';

    // Panel containing the iframe
    var panel = document.createElement("div");
    panel.style.cssText =
      "position:fixed;bottom:88px;" + position + ":20px;z-index:2147483647;" +
      "width:min(400px,calc(100vw - 32px));height:min(620px,calc(100vh - 120px));" +
      "border-radius:16px;overflow:hidden;box-shadow:0 12px 40px rgba(0,0,0,.3);" +
      "display:none;background:#fff;";

    var iframe = document.createElement("iframe");
    iframe.src = origin + "/deploy/" + encodeURIComponent(deployId) + "?embed=1";
    iframe.title = config.title || "Querify chat";
    iframe.allow = "clipboard-write";
    iframe.style.cssText = "width:100%;height:100%;border:none;";
    panel.appendChild(iframe);

    var open = false;
    btn.addEventListener("click", function () {
      open = !open;
      panel.style.display = open ? "block" : "none";
      btn.innerHTML = open
        ? '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>'
        : '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>';
    });

    document.body.appendChild(btn);
    document.body.appendChild(panel);
  }

  function boot() {
    fetch(apiBase + "/api/embed/" + encodeURIComponent(deployId) + "/config")
      .then(function (r) { return r.ok ? r.json() : Promise.reject(new Error("HTTP " + r.status)); })
      .then(mount)
      .catch(function (err) {
        console.error("[Querify Embed] Failed to load widget config:", err.message);
      });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
