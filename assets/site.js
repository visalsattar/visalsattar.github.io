const $ = s => document.querySelector(s);
const REDUCE = matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ---------- terminal ---------- */
// base64 of the flag; decoding it is the challenge
const FLAG_B64 = "ZmxhZ3t2MXNhbF9zNHlzX2gzbGwwfQ==";
const CMDS = {
  help: () => [["h","commands:"],"  whoami     who I am","  projects   what I've built","  certs      certifications","  path       where I'm headed","  contact    how to reach me","  clear      clear the screen"],
  whoami: () => ["Visal Sattar. CS graduate (BS, 2026), Peshawar.","I build network security tools and test where they break.","Looking for an entry-level security role.","Working toward offensive security and AI red teaming."],
  projects: () => [["h","[1] AI-based intrusion detection"],"    live capture, Random Forest + Autoencoder, 99.50% F1 (DDoS)",["h","[2] Underwater trash detection"],"    YOLOv8s segmentation, 0.712 box mAP@50","scroll down to run the IDS demo."],
  certs: () => ["Google Cybersecurity Professional Certificate  [done, May 2026]","CompTIA Security+                             [in progress, early 2027]"],
  path: () => ["foundations  [done]","web hacking  [now]","certs -> AI red teaming -> real-world proof"],
  contact: () => ["email     visalsattar.dev@gmail.com","github    github.com/visalsattar","linkedin  linkedin.com/in/visalsattar"],
  ls: a => a === "-a" || a === "-la" ? ["about.txt  projects/  writeups/  .flag.b64"] : ["about.txt  projects/  writeups/"],
  cat: a => a === ".flag.b64" ? [FLAG_B64, ["h","decode it, then send it to me."]]
          : a === "about.txt" ? CMDS.whoami() : [["e",`cat: ${a || "missing file"}: no such file`]],
  sudo: () => [["e","nice try. this incident will be reported."]],
};
const out = $("#termOut");
function print(lines){
  for (const l of lines){
    const d = document.createElement("div");
    if (Array.isArray(l)){ d.className = l[0]; d.textContent = l[1]; } else d.textContent = l;
    out.appendChild(d);
  }
  out.scrollTop = out.scrollHeight;
}
function run(raw){
  const line = raw.trim();
  if (!line) return;
  const d = document.createElement("div"); d.className = "c"; d.textContent = line; out.appendChild(d);
  const [cmd, arg] = line.split(/\s+/);
  if (cmd === "clear"){ out.textContent = ""; return; }
  const f = CMDS[cmd.toLowerCase()];
  print(f ? f(arg) : [["e",`${cmd}: command not found. type help`]]);
}
$("#termForm").addEventListener("submit", e => { e.preventDefault(); const i = $("#termIn"); run(i.value); i.value = ""; });
document.querySelectorAll(".chips button").forEach(b => b.addEventListener("click", () => run(b.dataset.cmd)));
print([["h","boot: capture interface up · models loaded · 0 alerts"]]);
run("whoami");

/* ---------- IDS demo ---------- */
const N = id => $("#" + id);
const ALL = ["n-cap","n-feat","n-rf","n-ae","n-rule","n-dash","a1","a2","a3"];
const SCEN = {
  replay: [
    ["n-cap a1", "[capture] replaying CIC's raw Friday pcap through the live pipeline"],
    ["n-feat a2", "[features] rebuilding 78 flow features from packet headers and timing"],
    ["n-rf:hit", "[rf] DDoS flows match the training data: flagged", "hit"],
    ["n-ae:on", "[ae] scoring anomalies alongside the forest"],
    ["n-rule:on", "[rule] connection rate checked, no extra alert needed"],
    ["a3 n-dash", "[dash] alerts pushed with GeoIP and AbuseIPDB enrichment"],
    ["", "[result] recall 99.4% at 100% precision", "ok"],
    ["", "[note] first run was 52% recall; three extractor bugs fixed", "w"],
  ],
  flood: [
    ["n-cap a1", "[capture] my phone floods the laptop over the LAN"],
    ["n-feat a2", "[features] flows extracted, but they look nothing like CICIDS2017"],
    ["n-rf:miss", "[rf] no match to known patterns: no alert", "w"],
    ["n-ae:miss", "[ae] anomaly score below threshold: no alert", "w"],
    ["n-rule:hit", "[rule] connection rate spikes: ALERT within 1 second", "hit"],
    ["a3 n-dash", "[dash] alert reaches the dashboard"],
    ["", "[lesson] ML missed it. A model-independent rule caught it.", "ok"],
  ],
};
const log = $("#log"), status = $("#idsStatus"), btns = [$("#runReplay"), $("#runFlood")];
let timer = null;
function play(key, btn){
  // aria-disabled, not disabled: a disabled button drops keyboard focus to <body>
  if (btn.getAttribute("aria-disabled") === "true") return;
  clearTimeout(timer);
  ALL.forEach(id => N(id).classList.remove("on","hit","miss"));
  btns.forEach(b => { b.setAttribute("aria-pressed", b === btn); b.setAttribute("aria-disabled", !REDUCE); });
  log.textContent = ""; status.textContent = "";
  const steps = SCEN[key]; let i = 0;
  const step = () => {
    const [targets, msg, cls] = steps[i];
    targets.split(" ").filter(Boolean).forEach(t => {
      const [id, st] = t.split(":");
      N(id).classList.add("on"); if (st && st !== "on") N(id).classList.add(st);
    });
    const d = document.createElement("div"); d.textContent = msg; if (cls) d.className = cls;
    log.appendChild(d); log.scrollTop = log.scrollHeight;
    if (++i < steps.length) timer = REDUCE ? (step(), null) : setTimeout(step, 650);
    else {
      btns.forEach(b => b.setAttribute("aria-disabled", false));
      // the target-less steps are the conclusion; announce only those, not every log line
      status.textContent = steps.filter(s => !s[0]).map(s => s[1]).join(" ");
    }
  };
  step();
}
btns[0].addEventListener("click", () => play("replay", btns[0]));
btns[1].addEventListener("click", () => play("flood", btns[1]));

// 3D view: fetched only after the page has loaded and the pipeline scrolls into view.
// ids3d.js reads the classes play() sets on the nodes above, so it has no scenario logic of its own.
addEventListener("load", () => {
  const wrap = $(".pipe-wrap");
  if (!wrap || !("IntersectionObserver" in window)) return;
  const io = new IntersectionObserver(es => {
    if (!es.some(e => e.isIntersecting)) return;
    io.disconnect();
    const s = document.createElement("script"); s.src = "/assets/ids3d.js"; document.body.appendChild(s);
  });
  io.observe(wrap);
});

/* ---------- copy email ---------- */
$("#copyMail").addEventListener("click", async e => {
  const b = e.currentTarget;
  try { await navigator.clipboard.writeText($("#mail").textContent); b.textContent = "Copied"; }
  catch { const r = document.createRange(); r.selectNodeContents($("#mail")); const s = getSelection(); s.removeAllRanges(); s.addRange(r); b.textContent = "Selected"; }
  setTimeout(() => b.textContent = "Copy", 1600);
});

console.log("%cvisal@sec", "color:#00E5FF;font:700 16px monospace", "\nLooking at the source? Good instinct. The terminal has a hidden file.");
