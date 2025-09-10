export const config = { runtime: "edge" };

function parseJSON(env, fb){ try{ return JSON.parse(env||""); }catch{ return fb; } }
async function fetchText(url){
  const r = await fetch(url, { headers:{ "User-Agent":"NovaCurationBot/1.0 (+contact)" }});
  if(!r.ok) throw new Error("http "+r.status);
  return await r.text();
}
function stripHtml(html){
  return html.replace(/<script[\s\S]*?<\/script>/gi," ")
             .replace(/<style[\s\S]*?<\/style>/gi," ")
             .replace(/<[^>]+>/g," ")
             .replace(/\s+/g," ").trim();
}
function parseRSS(xml){
  const items=[]; const blocks=xml.match(/<item[\s\S]*?<\/item>/gi)||[];
  const val=(s,t)=>{ const m=s.match(new RegExp(`<${t}>([\\s\\S]*?)<\\/${t}>`,"i")); return m?m[1].replace(/<!\[CDATA\[|\]\]>/g,"").trim():""; };
  for(const it of blocks.slice(0,8)){
    const title=val(it,"title"), link=val(it,"link")||val(it,"guid"), desc=val(it,"description");
    if(title && link) items.push({ title, link, desc });
  } return items;
}
const clean = s => (s||"").replace(/[<>]/g,"");

export default async function handler(req){
  try{
    const { searchParams } = new URL(req.url);
    const site = (searchParams.get("site") || "hydro").toLowerCase();

    const apiKey = process.env.OPENAI_API_KEY;
    if(!apiKey) return new Response(JSON.stringify({ ok:false, error:"OPENAI_API_KEY missing" }), { status:500 });

    const feedsMap = parseJSON(process.env.SITES_FEEDS_JSON, {});
    let feeds = feedsMap[site];
    if(!feeds || !feeds.length){
      feeds = (process.env.CURATION_FEEDS || "").split(",").map(s=>s.trim()).filter(Boolean);
    }
    if(!feeds.length) return new Response(JSON.stringify({ ok:false, error:"no feeds for site" }), { status:200 });

    const lang = (process.env.CURATION_LANG || process.env.SITE_LANG || "fr").toLowerCase();
    const tag  = process.env.AFFILIATE_AMAZON_TAG || "";

    const all=[]; for(const f of feeds){ try{ const xml=await fetchText(f); all.push(...parseRSS(xml).slice(0,4)); }catch{} }
    if(!all.length) return new Response(JSON.stringify({ ok:false, error:"no items" }), { status:200 });

    const pick = all.slice(0,3);
    const out=[];
    for(const it of pick){
      let raw = it.desc || "";
      try{ raw = stripHtml(await fetchText(it.link)).slice(0,20000) || raw; }catch{}
      if(!raw || raw.length<400) continue;

      const system = lang.startsWith("fr")
        ? "Article ORIGINAL FR, 400-600 mots, 2-3 <h2>/<h3>, étapes si utile, puis 'Ce qu'il faut retenir' (3 puces). Pas d'images."
        : "ORIGINAL EN article, 400-600 words, 2-3 subheads, steps if useful, then 'Key takeaways' (3 bullets). No images.";
      const user = `Source: ${it.link}\nTitre: ${it.title}\nTexte brut:\n${raw}\n\nTâche: article conforme (${lang}).`;

      const r = await fetch("https://api.openai.com/v1/chat/completions", {
        method:"POST",
        headers:{ "Authorization":`Bearer ${apiKey}`, "Content-Type":"application/json" },
        body: JSON.stringify({ model:"gpt-4o-mini", temperature:0.6, messages:[ {role:"system",content:system}, {role:"user",content:user} ] })
      });
      if(!r.ok) continue;
      const data = await r.json();
      const html = data.choices?.[0]?.message?.content?.trim() || "";

      const products = tag ? [
        { label:"Pompe hydroponique silencieuse", url:`https://www.amazon.ca/s?k=${encodeURIComponent("hydroponic pump silent")}&tag=${tag}` },
        { label:"Capteur pH hydroponie",         url:`https://www.amazon.ca/s?k=${encodeURIComponent("ph sensor hydroponics")}&tag=${tag}` },
        { label:"LED horticole full spectrum",   url:`https://www.amazon.ca/s?k=${encodeURIComponent("full spectrum grow light")}&tag=${tag}` }
      ] : [];

      out.push({ title: clean(it.title), source: it.link, html, products });
    }

    return new Response(JSON.stringify({ ok:true, site, curated: out }, null, 2), {
      status:200, headers:{ "Content-Type":"application/json", "Cache-Control":"public, max-age=900" }
    });
  }catch(e){
    return new Response(JSON.stringify({ ok:false, error:String(e) }), { status:500 });
  }
}
