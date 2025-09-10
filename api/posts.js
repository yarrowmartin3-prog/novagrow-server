export const config = { runtime: "edge" };

// --- utils ---
function parseJSON(env, fallback){ try { return JSON.parse(env||""); } catch { return fallback; } }
function seededSort(arr, seed){ let x=seed; return [...arr].sort(()=>{ x=(x*1664525+1013904223)%4294967296; return (x/4294967296)-0.5; }); }
function todaySeed(){ const d=new Date(); const k=`${d.getUTCFullYear()}-${d.getUTCMonth()+1}-${d.getUTCDate()}`;
  let h=2166136261; for(const c of k){ h^=c.charCodeAt(0); h+=(h<<1)+(h<<4)+(h<<7)+(h<<8)+(h<<24); } return Math.abs(h>>>0); }
const clean = s => (s||"").replace(/[<>]/g,"");

// --- core ---
export default async function handler(req){
  try{
    const { searchParams } = new URL(req.url);
    const site = (searchParams.get("site") || "hydro").toLowerCase();

    const apiKey = process.env.OPENAI_API_KEY;
    if(!apiKey) return new Response(JSON.stringify({ ok:false, error:"OPENAI_API_KEY missing" }), { status:500 });

    const MAP_TOPICS = parseJSON(process.env.SITES_TOPICS_JSON, {});
    let topics = MAP_TOPICS[site];
    if(!topics || !topics.length){
      // fallback: mono-site vars si jamais
      topics = (process.env.SITE_TOPICS || "hydroponie, domotique").split(",").map(s=>s.trim()).filter(Boolean);
    }

    const tag = process.env.AFFILIATE_AMAZON_TAG || "";
    const lang = (process.env.SITE_LANG || "fr").toLowerCase();

    // sélection déterministe du jour (1-3 posts)
    const seed = todaySeed();
    const n = 1 + (seed % 3);
    const chosen = seededSort(topics, seed).slice(0, Math.max(1, n));

    const system = lang.startsWith("fr")
      ? "Tu es un rédacteur SEO FR. 700-900 mots, 2-3 sous-titres <h2>/<h3>, étapes si pertinent, PAS d'images ni pub. Renvoie un JSON d’articles."
      : "You are a concise SEO writer (EN). 700-900 words, 2-3 subheads, steps if useful, NO images/ads. Return JSON array of articles.";

    const user = lang.startsWith("fr")
      ? `Génère ${n} articles en français sur: ${chosen.join(", ")}. Retourne un tableau JSON:
[{ "title":"...", "slug":"...", "excerpt":"...", "html":"<h2>...</h2> ...", "tags":["..."], "products":["k1","k2","k3"] }]`
      : `Generate ${n} English articles about: ${chosen.join(", ")}. Return JSON:
[{ "title":"...", "slug":"...", "excerpt":"...", "html":"<h2>...</h2> ...", "tags":["..."], "products":["k1","k2","k3"] }]`;

    const r = await fetch("https://api.openai.com/v1/chat/completions",{
      method:"POST",
      headers:{ "Authorization":`Bearer ${apiKey}`, "Content-Type":"application/json" },
      body: JSON.stringify({ model:"gpt-4o-mini", temperature:0.6, messages:[ {role:"system",content:system}, {role:"user",content:user} ] })
    });
    if(!r.ok) return new Response(JSON.stringify({ ok:false, error:"openai "+r.status, detail: await r.text() }), { status:500 });

    let txt = (await r.json()).choices?.[0]?.message?.content?.trim() || "[]";
    txt = txt.replace(/^```json\s*/i,"").replace(/```$/,"");
    let posts = []; try{ posts = JSON.parse(txt); }catch{}
    posts = Array.isArray(posts) ? posts : [];

    for(const p of posts){
      p.title = clean(p.title);
      p.slug  = (p.slug||"").toLowerCase().replace(/[^a-z0-9\-]/g,"-").replace(/-+/g,"-").replace(/^-|-$/g,"") || "post";
      p.excerpt = clean(p.excerpt||"");
      p.tags = Array.isArray(p.tags) ? p.tags.slice(0,6) : [];
      p.products = Array.isArray(p.products) ? p.products.slice(0,3) : [];
      p.affiliate = (tag && p.products.length) ? p.products.map(k => ({
        label: k, url: `https://www.amazon.ca/s?k=${encodeURIComponent(k)}&tag=${tag}`
      })) : [];
    }

    return new Response(JSON.stringify({ ok:true, site, posts }, null, 2), {
      status:200,
      headers:{ "Content-Type":"application/json", "Cache-Control":"public, max-age=900" }
    });

  }catch(e){
    return new Response(JSON.stringify({ ok:false, error:String(e) }), { status:500 });
  }
}
