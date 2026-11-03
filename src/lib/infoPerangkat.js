// Info perangkat untuk log (siapa memakai perangkat apa). Tidak memakai izin khusus;
// hanya data yang sudah dikirim browser. device_id = ID acak yang disimpan di browser
// (localStorage), jadi perangkat/browser yang sama selalu punya ID yang sama.
const KUNCI_ID = "selma-device-id";

function idPerangkat() {
  try {
    let id = localStorage.getItem(KUNCI_ID);
    if (!id) {
      id = (crypto.randomUUID && crypto.randomUUID()) || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
      localStorage.setItem(KUNCI_ID, id);
    }
    return id;
  } catch {
    return "tanpa-penyimpanan";
  }
}

function bacaOs(ua) {
  let m;
  if ((m = ua.match(/Android\s([\d.]+)/))) return `Android ${m[1]}`;
  if ((m = ua.match(/(?:iPhone|CPU) OS ([\d_]+)/))) return `iOS ${m[1].replace(/_/g, ".")}`;
  if (/iPad/.test(ua)) return "iPadOS";
  if ((m = ua.match(/Windows NT ([\d.]+)/))) return `Windows ${{ "10.0": "10/11", "6.3": "8.1", "6.1": "7" }[m[1]] || m[1]}`;
  if (/Mac OS X/.test(ua)) return "macOS";
  if (/CrOS/.test(ua)) return "ChromeOS";
  if (/Linux/.test(ua)) return "Linux";
  return "OS tidak dikenal";
}

function bacaBrowser(ua) {
  const cocok = [
    [/Edg(?:e|A|iOS)?\/([\d.]+)/, "Edge"],
    [/OPR\/([\d.]+)/, "Opera"],
    [/SamsungBrowser\/([\d.]+)/, "Samsung Internet"],
    [/(?:Firefox|FxiOS)\/([\d.]+)/, "Firefox"],
    [/(?:Chrome|CriOS)\/([\d.]+)/, "Chrome"],
    [/Version\/([\d.]+).*Safari/, "Safari"],
  ];
  for (const [re, nama] of cocok) {
    const m = ua.match(re);
    if (m) return `${nama} ${m[1].split(".")[0]}`;
  }
  return "Browser tidak dikenal";
}

export async function ambilInfoPerangkat() {
  const ua = navigator.userAgent || "";
  const os = bacaOs(ua);
  const browser = bacaBrowser(ua);
  const tipe = /iPad|Tablet/i.test(ua) || (/Android/i.test(ua) && !/Mobile/i.test(ua))
    ? "Tablet"
    : /Android|iPhone|iPod|Mobile/i.test(ua) ? "HP" : "Komputer";

  // Model HP: UA lama memuatnya ("; SM-A525F Build"), Chrome baru lewat userAgentData.
  let model = (ua.match(/Android\s[\d.]+;\s*([^;)]+?)(?:\sBuild|\))/) || [])[1] || "";
  if (/^K$/.test(model) || !model) model = /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) ? "iPad" : "";
  try {
    const t = await navigator.userAgentData?.getHighEntropyValues?.(["model"]);
    if (t?.model) model = t.model;
  } catch {
    /* abaikan */
  }

  return {
    device_id: idPerangkat(),
    perangkat: [model, os, browser].filter(Boolean).join(" · "),
    tipe_perangkat: tipe,
    os,
    browser,
    layar: `${window.screen?.width || 0}x${window.screen?.height || 0} @${window.devicePixelRatio || 1}x`,
    bahasa: navigator.language || "",
    zona_waktu: (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ""; } catch { return ""; } })(),
    user_agent: ua.slice(0, 400),
  };
}
