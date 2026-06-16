module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=43200, stale-while-revalidate=3600');
  res.setHeader('Content-Type', 'application/json');

  const date = new Date().toLocaleDateString('es-ES', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    timeZone: 'America/Guatemala'
  });

  function cleanText(raw) {
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

  const urls = [
    'https://www.vaticannews.va/amp/es/evangelio-de-hoy.html',
    'https://www.vaticannews.va/es/evangelio-de-hoy.html',
  ];

  for (const url of urls) {
    try {
      const r = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15',
          'Accept': 'text/html',
          'Accept-Language': 'es-ES,es;q=0.9',
        },
        signal: AbortSignal.timeout(10000),
      });

      if (!r.ok) continue;
      const html = await r.text();

      // Title from h1
      const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
      const title = h1 ? cleanText(h1[1]) : 'Evangelio del día';

      // Collect all paragraph text — robust against any HTML structure
      const paragraphs = [];
      const pRe = /<p[^>]*>([\s\S]*?)<\/p>/gi;
      let m;
      while ((m = pRe.exec(html)) !== null) {
        const t = cleanText(m[1]).trim();
        // Skip nav/footer/cookie noise: must be substantial prose
        if (t.length > 50 && !/cookie|privacidad|suscrib|©|newsletter|compartir/i.test(t)) {
          paragraphs.push(t);
        }
      }

      if (paragraphs.length >= 2) {
        res.end(JSON.stringify({ title, date, text: paragraphs.join('\n\n') }));
        return;
      }
    } catch (_) { continue; }
  }

  res.statusCode = 500;
  res.end(JSON.stringify({ error: 'No se pudo cargar el evangelio' }));
};
