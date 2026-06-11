const MAX_HTML_BYTES = 512 * 1024;
const FETCH_TIMEOUT_MS = 8000;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Accept',
  'Access-Control-Max-Age': '86400'
};

const ENTITY_MAP = {
  amp: '&',
  apos: "'",
  gt: '>',
  lt: '<',
  nbsp: ' ',
  quot: '"',
  rsquo: '\u2019',
  lsquo: '\u2018',
  rdquo: '\u201d',
  ldquo: '\u201c',
  ndash: '\u2013',
  mdash: '\u2014'
};

const json = (body, status = 200, extraHeaders = {}) => new Response(JSON.stringify(body), {
  status,
  headers: {
    ...CORS_HEADERS,
    'Content-Type': 'application/json; charset=utf-8',
    ...extraHeaders
  }
});

const decodeEntities = value => String(value || '').replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (_, entity) => {
  const lower = entity.toLowerCase();
  if (lower[0] === '#') {
    const code = lower[1] === 'x'
      ? Number.parseInt(lower.slice(2), 16)
      : Number.parseInt(lower.slice(1), 10);
    return Number.isFinite(code) ? String.fromCodePoint(code) : _;
  }
  return ENTITY_MAP[lower] || _;
});

const cleanText = value => decodeEntities(value)
  .replace(/<[^>]*>/g, ' ')
  .replace(/\s*Continue Reading\s*$/i, '')
  .replace(/\s+/g, ' ')
  .trim();

const parseAttrs = tag => {
  const attrs = {};
  const attrPattern = /([^\s=/"'<>]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'<>]+))/g;
  for (const match of tag.matchAll(attrPattern)) {
    attrs[match[1].toLowerCase()] = decodeEntities(match[2] ?? match[3] ?? match[4] ?? '');
  }
  return attrs;
};

const first = (...values) => values.find(value => value && String(value).trim()) || '';

const toAbsoluteUrl = (value, baseUrl) => {
  if (!value) return '';
  try {
    return new URL(value, baseUrl).href;
  } catch {
    return cleanText(value);
  }
};

const arrayify = value => Array.isArray(value) ? value : (value ? [value] : []);

const jsonLdNodes = value => {
  const nodes = [];
  const visit = item => {
    if (!item || typeof item !== 'object') return;
    if (Array.isArray(item)) {
      item.forEach(visit);
      return;
    }
    nodes.push(item);
    if (item['@graph']) visit(item['@graph']);
  };
  visit(value);
  return nodes;
};

const typeIncludes = (item, type) => arrayify(item?.['@type'])
  .some(value => String(value).toLowerCase().includes(type));

const schemaImage = image => {
  const candidate = arrayify(image)[0];
  if (!candidate) return '';
  if (typeof candidate === 'string') return candidate;
  return candidate.url || candidate.contentUrl || '';
};

const schemaAddress = location => {
  const address = location?.address;
  if (!address) return '';
  if (typeof address === 'string') return cleanText(address);
  return [
    address.streetAddress,
    address.addressLocality,
    address.addressRegion,
    address.postalCode
  ].filter(Boolean).map(cleanText).join(', ');
};

const parseJsonLd = html => {
  const nodes = [];
  const scriptPattern = /<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  for (const match of html.matchAll(scriptPattern)) {
    try {
      nodes.push(...jsonLdNodes(JSON.parse(decodeEntities(match[1]).trim())));
    } catch {
      // JSON-LD is useful when present, but malformed blocks should not fail the fetch.
    }
  }

  const event = nodes.find(item => typeIncludes(item, 'event')) || {};
  const article = nodes.find(item => typeIncludes(item, 'article')) || {};
  const page = nodes.find(item => typeIncludes(item, 'webpage')) || {};
  return { event, article, page };
};

export const parseMetadata = (html, sourceUrl) => {
  const head = html.match(/<head\b[^>]*>([\s\S]*?)<\/head>/i)?.[1] || html.slice(0, MAX_HTML_BYTES);
  const meta = {};
  const links = {};

  for (const match of head.matchAll(/<meta\b[^>]*>/gi)) {
    const attrs = parseAttrs(match[0]);
    const key = String(attrs.property || attrs.name || attrs.itemprop || '').toLowerCase();
    if (key && attrs.content && !meta[key]) meta[key] = cleanText(attrs.content);
  }

  for (const match of head.matchAll(/<link\b[^>]*>/gi)) {
    const attrs = parseAttrs(match[0]);
    const rel = String(attrs.rel || '').toLowerCase().split(/\s+/);
    if (rel.includes('canonical')) links.canonical = attrs.href;
    if (rel.includes('image_src')) links.image = attrs.href;
  }

  const title = cleanText(head.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '');
  const { event, article, page } = parseJsonLd(html);
  const schema = event.name ? event : (article.name || article.headline ? article : page);
  const location = event.location || {};
  const image = first(
    meta['og:image:secure_url'],
    meta['og:image'],
    meta['twitter:image'],
    meta['twitter:image:src'],
    links.image,
    schemaImage(event.image),
    schemaImage(article.image),
    schemaImage(page.image),
    event.thumbnailUrl,
    article.thumbnailUrl,
    page.thumbnailUrl
  );

  return {
    title: first(meta['og:title'], meta['twitter:title'], schema.name, schema.headline, title),
    description: first(
      meta['og:description'],
      meta['twitter:description'],
      meta.description,
      schema.description
    ),
    image: toAbsoluteUrl(image, sourceUrl),
    siteName: first(meta['og:site_name'], page.name),
    type: first(meta['og:type'], arrayify(event['@type'])[0]),
    canonical: toAbsoluteUrl(first(meta['og:url'], links.canonical, sourceUrl), sourceUrl),
    startDate: event.startDate || '',
    endDate: event.endDate || '',
    locationName: cleanText(location.name || ''),
    locationAddress: schemaAddress(location)
  };
};

const readLimitedText = async response => {
  if (!response.body) return response.text();

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let html = '';

  while (bytes < MAX_HTML_BYTES) {
    const { done, value } = await reader.read();
    if (done) break;
    const remaining = MAX_HTML_BYTES - bytes;
    const chunk = value.byteLength > remaining ? value.slice(0, remaining) : value;
    bytes += chunk.byteLength;
    html += decoder.decode(chunk, { stream: true });
    if (/<\/head>/i.test(html)) break;
  }

  html += decoder.decode();
  try {
    await reader.cancel();
  } catch {
    // The stream may already be closed.
  }
  return html;
};

const isBlockedHost = hostname => {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
  if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) return true;

  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const parts = ipv4.slice(1).map(Number);
    if (parts.some(part => part > 255)) return true;
    const [a, b] = parts;
    return a === 0 ||
      a === 10 ||
      a === 127 ||
      a >= 224 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168);
  }

  if (host.includes(':')) {
    return host === '::1' ||
      host === '::' ||
      host.startsWith('fc') ||
      host.startsWith('fd') ||
      host.startsWith('fe80');
  }

  return false;
};

const targetFromRequest = async request => {
  if (request.method === 'GET') {
    return new URL(request.url).searchParams.get('url') || '';
  }

  if (request.method === 'POST') {
    const contentType = request.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const body = await request.json().catch(() => ({}));
      return body.url || '';
    }
    const form = await request.formData().catch(() => null);
    return form?.get('url') || '';
  }

  return '';
};

const validatedTargetUrl = rawUrl => {
  let target;
  try {
    target = new URL(rawUrl);
  } catch {
    const error = new Error('invalid_url');
    error.status = 400;
    throw error;
  }

  if (!['http:', 'https:'].includes(target.protocol) || target.username || target.password || isBlockedHost(target.hostname)) {
    const error = new Error('unsupported_url');
    error.status = 400;
    throw error;
  }

  return target.href;
};

const fetchHtml = async targetUrl => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(targetUrl, {
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.5',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    });

    if (!response.ok) {
      const error = new Error('fetch_failed');
      error.status = 502;
      throw error;
    }

    const contentType = response.headers.get('content-type') || '';
    if (contentType && !/html|xml|text\/plain/i.test(contentType)) {
      const error = new Error('not_html');
      error.status = 415;
      throw error;
    }

    return {
      html: await readLimitedText(response),
      finalUrl: response.url || targetUrl
    };
  } finally {
    clearTimeout(timeout);
  }
};

export const handleMetaRequest = async request => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS_HEADERS });

  const requestUrl = new URL(request.url);
  if (!['/', '/api/meta'].includes(requestUrl.pathname)) {
    return json({ ok: false, error: 'not_found' }, 404);
  }

  if (!['GET', 'POST'].includes(request.method)) {
    return json({ ok: false, error: 'method_not_allowed' }, 405, { Allow: 'GET, POST, OPTIONS' });
  }

  try {
    const targetUrl = validatedTargetUrl(await targetFromRequest(request));
    const { html, finalUrl } = await fetchHtml(targetUrl);
    const metadata = parseMetadata(html, finalUrl);

    return json({
      ok: true,
      url: finalUrl,
      metadata
    }, 200, {
      'Cache-Control': 'public, max-age=900'
    });
  } catch (error) {
    return json({
      ok: false,
      error: error.message || 'metadata_unavailable'
    }, error.status || 502);
  }
};
