/* Chaff beacon — collects behavioral fingerprint, ships to /api/public/beacon */
(function () {
  if (window.__chaff_beacon) return;
  window.__chaff_beacon = true;

  var t0 = Date.now();
  var moves = [];
  var clicks = 0;
  var scrolls = 0;
  var keys = [];
  var maxScroll = 0;

  document.addEventListener(
    "mousemove",
    function (e) {
      if (moves.length < 200) moves.push([e.clientX, e.clientY, Date.now() - t0]);
    },
    { passive: true },
  );
  document.addEventListener(
    "click",
    function () {
      clicks++;
    },
    { passive: true },
  );
  document.addEventListener(
    "scroll",
    function () {
      scrolls++;
      maxScroll = Math.max(maxScroll, window.scrollY || 0);
    },
    { passive: true },
  );
  document.addEventListener(
    "keydown",
    function () {
      if (keys.length < 50) keys.push(Date.now() - t0);
    },
    { passive: true },
  );

  function canvasHash() {
    try {
      var c = document.createElement("canvas");
      c.width = 220;
      c.height = 30;
      var ctx = c.getContext("2d");
      ctx.textBaseline = "top";
      ctx.font = "14px 'Arial'";
      ctx.fillStyle = "#f60";
      ctx.fillRect(125, 1, 62, 20);
      ctx.fillStyle = "#069";
      ctx.fillText("Chaff:Cwm fjordbank glyphs vext quiz, 🐝", 2, 15);
      ctx.fillStyle = "rgba(102,204,0,0.7)";
      ctx.fillText("Chaff:Cwm fjordbank glyphs vext quiz, 🐝", 4, 17);
      var d = c.toDataURL();
      var h = 0;
      for (var i = 0; i < d.length; i++) {
        h = (h << 5) - h + d.charCodeAt(i);
        h |= 0;
      }
      return ("00000000" + (h >>> 0).toString(16)).slice(-8);
    } catch (e) {
      return "blocked";
    }
  }

  function webglInfo() {
    try {
      var c = document.createElement("canvas");
      var gl = c.getContext("webgl") || c.getContext("experimental-webgl");
      if (!gl) return { vendor: "none", renderer: "none" };
      var ext = gl.getExtension("WEBGL_debug_renderer_info");
      return {
        vendor: ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR),
        renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
      };
    } catch (e) {
      return { vendor: "err", renderer: "err" };
    }
  }

  function mouseEntropy() {
    if (moves.length < 5) return 0;
    // sum of angle variances between consecutive segments
    var sum = 0,
      count = 0;
    for (var i = 2; i < moves.length; i++) {
      var dx1 = moves[i - 1][0] - moves[i - 2][0];
      var dy1 = moves[i - 1][1] - moves[i - 2][1];
      var dx2 = moves[i][0] - moves[i - 1][0];
      var dy2 = moves[i][1] - moves[i - 1][1];
      var a1 = Math.atan2(dy1, dx1),
        a2 = Math.atan2(dy2, dx2);
      var d = Math.abs(a1 - a2);
      if (d > Math.PI) d = 2 * Math.PI - d;
      sum += d;
      count++;
    }
    return count ? +(sum / count).toFixed(4) : 0;
  }

  function send(reason) {
    var gl = webglInfo();
    var payload = {
      slug: window.__chaff_slug || null,
      origin: location.origin,
      path: location.pathname,
      referrer: document.referrer || null,
      dwell_ms: Date.now() - t0,
      reason: reason,
      navigator: {
        ua: navigator.userAgent,
        platform: navigator.platform,
        languages: (navigator.languages || []).slice(0, 5),
        hardwareConcurrency: navigator.hardwareConcurrency || 0,
        deviceMemory: navigator.deviceMemory || 0,
        webdriver: !!navigator.webdriver,
        plugins: navigator.plugins ? navigator.plugins.length : 0,
        pdfViewerEnabled: !!navigator.pdfViewerEnabled,
        hasChrome: !!window.chrome,
      },
      screen: {
        w: screen.width,
        h: screen.height,
        avail_w: screen.availWidth,
        avail_h: screen.availHeight,
        dpr: window.devicePixelRatio || 1,
        color_depth: screen.colorDepth,
      },
      tz: {
        name: Intl.DateTimeFormat().resolvedOptions().timeZone,
        offset: new Date().getTimezoneOffset(),
      },
      canvas_hash: canvasHash(),
      webgl_vendor: String(gl.vendor || "").slice(0, 120),
      webgl_renderer: String(gl.renderer || "").slice(0, 120),
      behavior: {
        mouse_moves: moves.length,
        mouse_entropy: mouseEntropy(),
        clicks: clicks,
        scrolls: scrolls,
        max_scroll: maxScroll,
        key_count: keys.length,
        key_intervals: keys
          .slice(1)
          .map(function (k, i) {
            return k - keys[i];
          })
          .slice(0, 20),
      },
    };
    var body = JSON.stringify(payload);
    try {
      if (navigator.sendBeacon) {
        navigator.sendBeacon("/api/public/beacon", new Blob([body], { type: "application/json" }));
      } else {
        fetch("/api/public/beacon", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: body,
          keepalive: true,
        });
      }
    } catch (e) {}
  }

  // Initial ping after 3s of observation; final ping on unload.
  setTimeout(function () {
    send("observe");
  }, 3000);
  window.addEventListener("pagehide", function () {
    send("pagehide");
  });

  // expose for inline demos
  window.__chaffSend = send;
})();
