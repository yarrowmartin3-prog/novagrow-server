export const config = { runtime: "edge" };
export default async function handler(req){
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || "";
  const proto = req.headers.get("x-forwarded-proto") || "https";
  const origin = `${proto}://${host}`;
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${origin}/</loc></url>
  <url><loc>${origin}/api/posts</loc></url>
  <url><loc>${origin}/api/curate</loc></url>
</urlset>`;
  return new Response(xml,{status:200,headers:{ "Content-Type":"application/xml" }});
}
