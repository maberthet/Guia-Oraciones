module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=43200, stale-while-revalidate=3600');
  res.setHeader('Content-Type', 'application/json');

  // Display date in Guatemala time
  const date = new Date().toLocaleDateString('es-ES', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    timeZone: 'America/Guatemala'
  });
  // Guatemala date string for matching RSS items (e.g. "2026-06-16")
  const todayGT = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Guatemala' });

  function decodeEntities(s) {
    return s
      .replace(/&aacute;/g,'á').replace(/&eacute;/g,'é').replace(/&iacute;/g,'í')
      .replace(/&oacute;/g,'ó').replace(/&uacute;/g,'ú').replace(/&ntilde;/g,'ñ')
      .replace(/&Aacute;/g,'Á').replace(/&Eacute;/g,'É').replace(/&Iacute;/g,'Í')
      .replace(/&Oacute;/g,'Ó').replace(/&Uacute;/g,'Ú').replace(/&Ntilde;/g,'Ñ')
      .replace(/&uuml;/g,'ü').replace(/&ouml;/g,'ö').replace(/&auml;/g,'ä')
      .replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>')
      .replace(/&nbsp;/g,' ').replace(/&ldquo;|&rdquo;/g,'"')
      .replace(/&laquo;/g,'«').replace(/&raquo;/g,'»')
      .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
      .replace(/&[a-z]+;/g, '');
  }

  function stripHtml(s) {
    return s
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<p[^>]*>/gi, '\n')
      .replace(/<\/p>/gi, '')
      .replace(/<[^>]+>/g, '')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  function cleanText(s) { return stripHtml(decodeEntities(s)); }

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

    // Find the item whose Vatican date (Rome/+0200) matches Guatemala's today.
    // Vatican publishes at Rome midnight (+0200). Because Rome is UTC+2 and
    // Guatemala is UTC-6, the June 17 Vatican item has pubDate that converts
    // to June 16 afternoon in Guatemala — so we match Vatican date to Guatemala date.
    const allItems = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)].map(m => m[1]);
    if (!allItems.length) throw new Error('No items in RSS');

    let item = allItems[0]; // fallback: latest item
    for (const it of allItems) {
      const pubM = it.match(/<pubDate>([\s\S]*?)<\/pubDate>/i);
      if (pubM) {
        try {
          // Convert pubDate to Rome date ("2026-06-17") and compare with Guatemala today
          const romeDate = new Date(pubM[1]).toLocaleDateString('en-CA', { timeZone: 'Europe/Rome' });
          if (romeDate === todayGT) { item = it; break; }
        } catch (_) {}
      }
    }

    // Title
    const titleM = item.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/i)
                || item.match(/<title>([\s\S]*?)<\/title>/i);
    const title = titleM ? cleanText(titleM[1]) : 'Evangelio del día';

    // Description
    const descM = item.match(/<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>/i)
               || item.match(/<description>([\s\S]*?)<\/description>/i);
    if (!descM) throw new Error('No description in RSS item');

    let text = cleanText(descM[1]);
    if (text.length < 80) throw new Error('Description too short');

    // Keep only the Gospel — trim first reading/psalm before it
    const gospelIdx = text.search(/Lectura del( santo)? evangelio/i);
    if (gospelIdx > 0) text = text.substring(gospelIdx);

    // Remove Pope's reflection that follows
    const papasIdx = text.search(/Las palabras de los (Papas|Papa)/i);
    if (papasIdx > 0) text = text.substring(0, papasIdx).trim();

    res.end(JSON.stringify({ title, date, text }));
  } catch (e) {
    res.statusCode = 500;
    res.end(JSON.stringify({ error: 'No se pudo cargar el evangelio', detail: e.message }));
  }
};
