module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=43200, stale-while-revalidate=3600');
  res.setHeader('Content-Type', 'application/json');

  const date = new Date().toLocaleDateString('es-ES', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    timeZone: 'America/Guatemala'
  });

  const log = [];

  function clean(raw) {
    return raw
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&ldquo;|&rdquo;/g, '"').replace(/&laquo;/g, '«').replace(/&raquo;/g, '»')
      .replace(/&#\d+;/g, '').replace(/&[a-z]+;/g, '')
      .replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  }

  function extractPs(html, minLen = 50) {
    const out = [];
    const re = /<p[^>]*>([\s\S]*?)<\/p>/gi;
    let m;
    while ((m = re.exec(html)) !== null) {
      const t = clean(m[1]).trim();
      if (t.length >= minLen && !/cookie|privacidad|suscrib|©|newsletter|compartir|registr/i.test(t)) {
        out.push(t);
      }
    }
    return out;
  }

  const H = {
    'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'es-ES,es;q=0.9',
  };

  async function get(url) {
    try {
      const r = await fetch(url, { headers: H, signal: AbortSignal.timeout(9000), redirect: 'follow' });
      const body = await r.text();
      log.push({ url, status: r.status, len: body.length });
      return r.ok ? body : null;
    } catch (e) {
      log.push({ url, err: e.message });
      return null;
    }
  }

  function getH1(html) {
    const m = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
    return m ? clean(m[1]) : 'Evangelio del día';
  }

  // 1) Vatican News RSS
  const rssBody = await get('https://www.vaticannews.va/es/evangelio-de-hoy.rss');
  if (rssBody) {
    const cdataM = rssBody.match(/<!\[CDATA\[([\s\S]*?)\]\]>/g);
    // Second CDATA in RSS is usually the description
    const raw = cdataM && cdataM.length > 1 ? cdataM[1].replace(/<!\[CDATA\[/, '').replace(/\]\]>/, '') : null;
    if (raw) {
      const text = clean(raw);
      if (text.length > 100) {
        const titleCdata = cdataM && cdataM[0] ? cdataM[0].replace(/<!\[CDATA\[/, '').replace(/\]\]>/, '') : null;
        const title = titleCdata ? clean(titleCdata) : 'Evangelio del día';
        res.end(JSON.stringify({ title, date, text })); return;
      }
    }
  }

  // 2) Vatican News AMP
  const ampBody = await get('https://www.vaticannews.va/amp/es/evangelio-de-hoy.html');
  if (ampBody) {
    const ps = extractPs(ampBody);
    if (ps.length >= 2) {
      res.end(JSON.stringify({ title: getH1(ampBody), date, text: ps.join('\n\n') })); return;
    }
  }

  // 3) evangelio.blog (WordPress — simple static HTML)
  const blogBody = await get('https://evangelio.blog/');
  if (blogBody) {
    const ps = extractPs(blogBody, 40);
    if (ps.length >= 2) {
      const h = blogBody.match(/<h[12][^>]*>([\s\S]*?)<\/h[12]>/i);
      const title = h ? clean(h[1]) : 'Evangelio del día';
      res.end(JSON.stringify({ title, date, text: ps.join('\n\n') })); return;
    }
  }

  // 4) Vatican News main page (SPA — low probability, last resort)
  const mainBody = await get('https://www.vaticannews.va/es/evangelio-de-hoy.html');
  if (mainBody) {
    const ps = extractPs(mainBody);
    if (ps.length >= 2) {
      res.end(JSON.stringify({ title: getH1(mainBody), date, text: ps.join('\n\n') })); return;
    }
  }

  res.statusCode = 500;
  res.end(JSON.stringify({ error: 'No se pudo cargar el evangelio', debug: log }));
};
