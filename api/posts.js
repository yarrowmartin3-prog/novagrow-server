export const config = { runtime: "edge" };

function seededSort(arr, seed){ let x=seed; return [...arr].sort(()=>{ x=(x*1664525+1013904223)%4294967296; return (x/4294967296)-0.5; }); }
function todaySeed(){ const d=new Date(); const k=`${d.getUTCFullYear()}-${d.getUTCMonth()+1}-${d.getUTCDate()}`;
  let h=2166136261; for(const c of k){ h^=c.charCodeAt(0); h+=(h<<1)+(h<<4)+(h<<7)+(h<<8)+(h<<24);} return Math.abs(h>>>0); }
const clean = s => (s||"").replace(/[<>]/g,"");

export default async function handler(req){
  try{
    const { searchParams } = new URL(req.url);
    const site = (searchParams.get("site") || "hydro").toLowerCase();

    const apiKey = process.env.OPENAI_API_KEY;
    if(!apiKey) return new Response(JSON.stringify({ ok:false, error:"OPENAI_API_KEY missing" }), { status:500 });

    const topicsMap = JSON.parse(process.env.SITES_TOPICS_JSON || "{}");
    let topics = topicsMap[site];
    if(!topics || !topics.length){
      topics = (process.env.SITE_TOPICS || "hydroponie, domotique").split(",").map(s=>s.trim()).filter(Boolean);
    }

    const tag  = process.env.AFFILIATE_AMAZON_TAG || "";
    const lang = (process.env.SITE_LANG || "fr").toLowerCase();

    const seed = todaySeed();
    const n = 1 + (seed % 3);
    const chosen = seededSort(topics, seed).slice(0, Math.max(1, n));

    const system = lang.startsWith("fr")
      ? "Rédacteur SEO FR. 700-900 mots, 2-3 <h2>/<h3>, étapes si utile, pas d'images/pub. Renvoie un tableau JSON d’articles."
      : "Concise SEO writer EN. 700-900 words, 2-3 subheads, steps if useful, no images/ads. Return JSON array of articles.";
    const user = lang.startsWith("fr")
      ? `Génère ${n} articles en français sur: ${chosen.join(", ")}. JSON:
[{ "title":"...", "slug":"...", "excerpt":"...", "html":"<h2>...</h2> ...", "tags":["..."], "products":["k1","k2","k3"] }]`
      : `Generate ${n} English articles about: ${chosen.join(", ")}. JSON:
[{ "title":"...", "slug":"...", "excerpt":"...", "html":"<h2>...</h2> ...", "tags":["..."], "products":["k1","k2","k3"] }]`;

    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method:"POST",
      headers:{ "Authorization":`Bearer ${apiKey}`, "Content-Type":"application/json" },
      body: JSON.stringify({ model:"gpt-4o-mini", temperature:0.6, messages:[ {role:"system",content:system}, {role:"user",content:user} ] })
