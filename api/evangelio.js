module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=43200, stale-while-revalidate=3600');
  res.setHeader('Content-Type', 'application/json');

  const date = new Date().toLocaleDateString('es-ES', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    timeZone: 'America/Guatemala'
  });

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

  function cleanText(s) {
    return stripHtml(decodeEntities(s));
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

    // Extract first <item>
    const itemM = xml.match(/<item>([\s\S]*?)<\/item>/i);
    if (!itemM) throw new Error('No item in RSS');
    const item = itemM[1];

    // Title (plain text or CDATA)
    const titleM = item.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/i)
                || item.match(/<title>([\s\S]*?)<\/title>/i);
    const title = titleM ? cleanText(titleM[1]) : 'Evangelio del día';

    // Description (CDATA with HTML)
    const descM = item.match(/<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>/i)
               || item.match(/<description>([\s\S]*?)<\/description>/i);
    if (!descM) throw new Error('No description in RSS item');

    const text = cleanText(descM[1]);
    if (text.length < 80) throw new Error('Description too short');

    res.end(JSON.stringify({ title, date, text }));
  } catch (e) {
    res.statusCode = 500;
    res.end(JSON.stringify({ error: 'No se pudo cargar el evangelio', detail: e.message }));
  }
};
