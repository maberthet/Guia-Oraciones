module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=43200, stale-while-revalidate=3600');
  res.setHeader('Content-Type', 'application/json');

  const date = new Date().toLocaleDateString('es-ES', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    timeZone: 'America/Guatemala'
  });
  const todayGT = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Guatemala' });

  function decodeEntities(s) {
    return s
      .replace(/&aacute;/g,'á').replace(/&eacute;/g,'é').replace(/&iacute;/g,'í')
      .replace(/&oacute;/g,'ó').replace(/&uacute;/g,'ú').replace(/&ntilde;/g,'ñ')
      .replace(/&Aacute;/g,'Á').replace(/&Eacute;/g,'É').replace(/&Iacute;/g,'Í')
      .replace(/&Oacute;/g,'Ó').replace(/&Uacute;/g,'Ú').replace(/&Ntilde;/g,'Ñ')
      .replace(/&uuml;/g,'ü').replace(/&iquest;/g,'¿').replace(/&iexcl;/g,'¡')
      .replace(/&laquo;/g,'«').replace(/&raquo;/g,'»')
      .replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>')
      .replace(/&nbsp;/g,' ').replace(/&ldquo;|&rdquo;/g,'"')
      .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
      .replace(/&[a-z]+;/g, '');
  }

  function cleanParagraph(html) {
    return decodeEntities(html)
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  try {
    const r = await fetch(
      'https://www.vaticannews.va/content/vaticannews/es/evangelio-de-hoy.rss.xml',
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15',
          'Accept': 'application/rss+xml, application/xml, text/xml, */*',
        },
        redirect: 'follow',
        signal: AbortSignal.timeout(10000),
      }
    );
    if (!r.ok) throw new Error(`RSS status ${r.status}`);
    const xml = await r.text();

    // Find item matching Guatemala's current date (matched against Rome date)
    const allItems = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)].map(m => m[1]);
    if (!allItems.length) throw new Error('No items in RSS');

    let item = allItems[0];
    for (const it of allItems) {
      const pubM = it.match(/<pubDate>([\s\S]*?)<\/pubDate>/i);
      if (pubM) {
        try {
          const romeDate = new Date(pubM[1]).toLocaleDateString('en-CA', { timeZone: 'Europe/Rome' });
          if (romeDate === todayGT) { item = it; break; }
        } catch (_) {}
      }
    }

    // Description HTML (CDATA)
    const descM = item.match(/<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>/i)
               || item.match(/<description>([\s\S]*?)<\/description>/i);
    if (!descM) throw new Error('No description');

    // Extract each <p> as a clean paragraph
    const paragraphs = [];
    const pRe = /<p[^>]*>([\s\S]*?)<\/p>/gi;
    let m;
    while ((m = pRe.exec(descM[1])) !== null) {
      const p = cleanParagraph(m[1]);
      if (p) paragraphs.push(p);
    }

    // Find where Gospel section starts
    const gospelStart = paragraphs.findIndex(p => /Lectura del( santo)? evangelio/i.test(p));
    if (gospelStart === -1) throw new Error('Gospel section not found');

    // Take Gospel paragraphs only — stop when we hit the Pope's reflection.
    // Pope's paragraph ends with a year inside parens: "...2011)" or "...2024)"
    const gospelParas = [];
    for (let i = gospelStart; i < paragraphs.length; i++) {
      if (/\d{4}\)\s*$/.test(paragraphs[i])) break; // papal attribution → stop
      gospelParas.push(paragraphs[i]);
    }

    const text = gospelParas.join('\n\n');
    if (text.length < 50) throw new Error('Text too short');

    res.end(JSON.stringify({ date, text }));
  } catch (e) {
    res.statusCode = 500;
    res.end(JSON.stringify({ error: 'No se pudo cargar el evangelio', detail: e.message }));
  }
};
