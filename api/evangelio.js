module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=43200, stale-while-revalidate=3600');
  res.setHeader('Content-Type', 'application/json');

  const date = new Date().toLocaleDateString('es-ES', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });

  try {
    const response = await fetch('https://www.vaticannews.va/es/evangelio-de-hoy.html', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'es-ES,es;q=0.9',
      }
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const html = await response.text();

    // Title / reference
    const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
    const title = h1Match
      ? h1Match[1].replace(/<[^>]+>/g, '').trim()
      : 'Evangelio del día';

    // Subtitle (e.g. "Jn 3, 16–21")
    const subtitleMatch = html.match(/<(?:h2|h3|span)[^>]*class="[^"]*(?:subtitle|reference|reading)[^"]*"[^>]*>([\s\S]*?)<\/(?:h2|h3|span)>/i);
    const subtitle = subtitleMatch
      ? subtitleMatch[1].replace(/<[^>]+>/g, '').trim()
      : '';

    // Article body — try common Vatican News selectors
    let raw = '';
    const selectors = [
      /class="[^"]*article-text[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
      /class="[^"]*article__text[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
      /class="[^"]*entry-content[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
      /<article[^>]*>([\s\S]*?)<\/article>/i,
    ];

    for (const re of selectors) {
      const m = html.match(re);
      if (m && m[1].length > 200) { raw = m[1]; break; }
    }

    // Convert paragraphs to plain text
    const text = raw
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&laquo;/g, '«').replace(/&raquo;/g, '»')
      .replace(/&ldquo;/g, '"').replace(/&rdquo;/g, '"')
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&#\d+;/g, '').replace(/&[a-z]+;/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    res.end(JSON.stringify({ title, subtitle, date, text }));

  } catch (err) {
    res.statusCode = 500;
    res.end(JSON.stringify({ error: err.message }));
  }
};
