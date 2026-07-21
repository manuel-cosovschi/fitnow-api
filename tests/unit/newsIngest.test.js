import { describe, it, expect, vi } from 'vitest';

vi.mock('../../src/db.js', () => ({ query: vi.fn(), queryOne: vi.fn(), transaction: vi.fn() }));
vi.mock('../../src/utils/openai.js', () => ({ chatJSON: vi.fn(), isAiEnabled: vi.fn(), getModel: () => 'gpt-test' }));

import { parseRss, looksRelevant, feedUrls } from '../../src/services/newsIngest.service.js';

const RSS = `<?xml version="1.0"?><rss><channel>
<item><title><![CDATA[Robo a mano armada en Villa Primera]]></title>
<link>https://ejemplo.com/nota-1</link>
<description><![CDATA[Un hombre fue <b>asaltado</b> en la vía pública.]]></description></item>
<item><title>Aumenta la tasa municipal</title><link>https://ejemplo.com/nota-2</link>
<description>Debate en el concejo por las tasas.</description></item>
<item><title>Cuadras sin luz por el recambio de luminarias</title>
<link>https://ejemplo.com/nota-3</link><description>Reclamo por el alumbrado en Los Pinares.</description></item>
</channel></rss>`;

describe('parseRss', () => {
  it('extrae título, link y descripción, limpiando CDATA y HTML', () => {
    const items = parseRss(RSS);
    expect(items).toHaveLength(3);
    expect(items[0].title).toBe('Robo a mano armada en Villa Primera');
    expect(items[0].link).toBe('https://ejemplo.com/nota-1');
    expect(items[0].description).toContain('asaltado');
    expect(items[0].description).not.toContain('<b>');
  });

  it('devuelve vacío para XML sin items', () => {
    expect(parseRss('<rss><channel></channel></rss>')).toEqual([]);
  });
});

describe('looksRelevant', () => {
  const items = parseRss(RSS);
  it('las notas de robos y alumbrado pasan el filtro', () => {
    expect(looksRelevant(items[0])).toBe(true);
    expect(looksRelevant(items[2])).toBe(true);
  });
  it('las notas de tasas municipales no pasan', () => {
    expect(looksRelevant(items[1])).toBe(false);
  });
});

describe('feedUrls', () => {
  it('usa los feeds del entorno si están configurados', () => {
    const prev = process.env.NEWS_FEEDS;
    process.env.NEWS_FEEDS = 'https://a.com/rss, https://b.com/rss';
    expect(feedUrls()).toEqual(['https://a.com/rss', 'https://b.com/rss']);
    if (prev === undefined) delete process.env.NEWS_FEEDS;
    else process.env.NEWS_FEEDS = prev;
  });
});
