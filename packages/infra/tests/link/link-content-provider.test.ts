import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * FEAT-LINK-002: LinkContentProvider — HTTP fetcher + Readability parser
 *
 * Implements the LinkContentProvider interface from @axel/core/types.
 * Uses DI for HTTP fetching and HTML parsing (Readability + linkedom).
 *
 * TDD RED phase: tests written before implementation.
 */

// Will import from implementation once created
// import { ReadabilityContentProvider, type HttpFetcher, type HtmlParser } from '../../src/link/index.js';

// --- DI interfaces (mirrored from implementation) ---

interface HttpFetchResult {
  readonly status: number;
  readonly body: string;
  readonly contentType: string;
  readonly url: string;
}

interface HttpFetcher {
  readonly fetch: (
    url: string,
    options?: { readonly timeoutMs?: number; readonly maxRedirects?: number },
  ) => Promise<HttpFetchResult>;
}

interface ParsedContent {
  readonly title: string | null;
  readonly content: string;
  readonly textContent: string;
  readonly excerpt: string | null;
  readonly byline: string | null;
  readonly siteName: string | null;
  readonly length: number;
}

interface HtmlParser {
  readonly parse: (html: string, url: string) => ParsedContent | null;
}

interface LinkProviderConfig {
  readonly timeoutMs: number;
  readonly maxRedirects: number;
  readonly maxContentChars: number;
  readonly userAgent: string;
}

// --- Mock factories ---

function createMockFetcher(overrides?: Partial<HttpFetcher>): HttpFetcher {
  return {
    fetch: vi.fn().mockResolvedValue({
      status: 200,
      body: '<html><head><title>Test</title></head><body><article><p>Test content paragraph that is long enough to be useful for extraction purposes.</p></article></body></html>',
      contentType: 'text/html; charset=utf-8',
      url: 'https://example.com/article',
    }),
    ...overrides,
  };
}

function createMockParser(overrides?: Partial<HtmlParser>): HtmlParser {
  return {
    parse: vi.fn().mockReturnValue({
      title: 'Test Article',
      content: '<p>Test content paragraph that is long enough to be useful.</p>',
      textContent: 'Test content paragraph that is long enough to be useful.',
      excerpt: 'Test content paragraph',
      byline: 'Author Name',
      siteName: 'Example Site',
      length: 57,
    }),
    ...overrides,
  };
}

describe('ReadabilityContentProvider', () => {
  // Placeholder until implementation exists
  // let provider: ReadabilityContentProvider;
  let mockFetcher: HttpFetcher;
  let mockParser: HtmlParser;

  beforeEach(() => {
    mockFetcher = createMockFetcher();
    mockParser = createMockParser();
  });

  describe('fetchContent — happy path', () => {
    it('should fetch URL and parse content via Readability', async () => {
      const { ReadabilityContentProvider } = await import('../../src/link/index.js');
      const provider = new ReadabilityContentProvider(mockFetcher, mockParser);

      const result = await provider.fetchContent('https://example.com/article');

      expect(result).toBeDefined();
      expect(result?.title).toBe('Test Article');
      expect(result?.content).toBe('Test content paragraph that is long enough to be useful.');
      expect(result?.byline).toBe('Author Name');
      expect(result?.siteName).toBe('Example Site');
      expect(result?.excerpt).toBe('Test content paragraph');
      expect(result?.wordCount).toBeGreaterThan(0);

      expect(mockFetcher.fetch).toHaveBeenCalledWith('https://example.com/article', expect.any(Object));
      expect(mockParser.parse).toHaveBeenCalledWith(
        expect.any(String),
        'https://example.com/article',
      );
    });

    it('should use textContent for the content field', async () => {
      const { ReadabilityContentProvider } = await import('../../src/link/index.js');
      const provider = new ReadabilityContentProvider(mockFetcher, mockParser);

      const result = await provider.fetchContent('https://example.com/article');

      // content should be the text (not HTML) version
      expect(result?.content).not.toContain('<p>');
      expect(result?.content).not.toContain('</p>');
    });

    it('should calculate wordCount from textContent', async () => {
      const parser = createMockParser({
        parse: vi.fn().mockReturnValue({
          title: 'T',
          content: '<p>a b c d e</p>',
          textContent: 'a b c d e',
          excerpt: null,
          byline: null,
          siteName: null,
          length: 9,
        }),
      });
      const { ReadabilityContentProvider } = await import('../../src/link/index.js');
      const provider = new ReadabilityContentProvider(mockFetcher, parser);

      const result = await provider.fetchContent('https://example.com');

      expect(result?.wordCount).toBe(5);
    });
  });

  describe('fetchContent — content truncation', () => {
    it('should truncate content exceeding maxContentChars', async () => {
      const longText = 'a'.repeat(60_000);
      const parser = createMockParser({
        parse: vi.fn().mockReturnValue({
          title: 'Long',
          content: `<p>${longText}</p>`,
          textContent: longText,
          excerpt: null,
          byline: null,
          siteName: null,
          length: 60_000,
        }),
      });
      const config: LinkProviderConfig = {
        timeoutMs: 10_000,
        maxRedirects: 3,
        maxContentChars: 50_000,
        userAgent: 'TestAgent/1.0',
      };
      const { ReadabilityContentProvider } = await import('../../src/link/index.js');
      const provider = new ReadabilityContentProvider(mockFetcher, parser, config);

      const result = await provider.fetchContent('https://example.com');

      expect(result?.content.length).toBeLessThanOrEqual(50_000);
    });
  });

  describe('fetchContent — error handling', () => {
    it('should return undefined when HTTP fetch fails with network error', async () => {
      const fetcher = createMockFetcher({
        fetch: vi.fn().mockRejectedValue(new Error('ECONNREFUSED')),
      });
      const { ReadabilityContentProvider } = await import('../../src/link/index.js');
      const provider = new ReadabilityContentProvider(fetcher, mockParser);

      const result = await provider.fetchContent('https://unreachable.example.com');

      expect(result).toBeUndefined();
    });

    it('should return undefined when HTTP status is not 200', async () => {
      const fetcher = createMockFetcher({
        fetch: vi.fn().mockResolvedValue({
          status: 404,
          body: 'Not Found',
          contentType: 'text/html',
          url: 'https://example.com/missing',
        }),
      });
      const { ReadabilityContentProvider } = await import('../../src/link/index.js');
      const provider = new ReadabilityContentProvider(fetcher, mockParser);

      const result = await provider.fetchContent('https://example.com/missing');

      expect(result).toBeUndefined();
    });

    it('should return undefined when content-type is not HTML', async () => {
      const fetcher = createMockFetcher({
        fetch: vi.fn().mockResolvedValue({
          status: 200,
          body: '{"data": true}',
          contentType: 'application/json',
          url: 'https://api.example.com/data',
        }),
      });
      const { ReadabilityContentProvider } = await import('../../src/link/index.js');
      const provider = new ReadabilityContentProvider(fetcher, mockParser);

      const result = await provider.fetchContent('https://api.example.com/data');

      expect(result).toBeUndefined();
    });

    it('should return undefined when Readability returns null', async () => {
      const parser = createMockParser({
        parse: vi.fn().mockReturnValue(null),
      });
      const { ReadabilityContentProvider } = await import('../../src/link/index.js');
      const provider = new ReadabilityContentProvider(mockFetcher, parser);

      const result = await provider.fetchContent('https://example.com/noarticle');

      expect(result).toBeUndefined();
    });

    it('should return undefined when parser throws', async () => {
      const parser = createMockParser({
        parse: vi.fn().mockImplementation(() => {
          throw new Error('DOM parse error');
        }),
      });
      const { ReadabilityContentProvider } = await import('../../src/link/index.js');
      const provider = new ReadabilityContentProvider(mockFetcher, parser);

      const result = await provider.fetchContent('https://example.com/broken');

      expect(result).toBeUndefined();
    });
  });

  describe('fetchContent — URL validation', () => {
    it('should reject non-http(s) URLs', async () => {
      const { ReadabilityContentProvider } = await import('../../src/link/index.js');
      const provider = new ReadabilityContentProvider(mockFetcher, mockParser);

      const result = await provider.fetchContent('ftp://example.com/file');

      expect(result).toBeUndefined();
      expect(mockFetcher.fetch).not.toHaveBeenCalled();
    });

    it('should reject invalid URLs', async () => {
      const { ReadabilityContentProvider } = await import('../../src/link/index.js');
      const provider = new ReadabilityContentProvider(mockFetcher, mockParser);

      const result = await provider.fetchContent('not-a-url');

      expect(result).toBeUndefined();
      expect(mockFetcher.fetch).not.toHaveBeenCalled();
    });

    it('should reject private IP addresses (SSRF prevention)', async () => {
      const { ReadabilityContentProvider } = await import('../../src/link/index.js');
      const provider = new ReadabilityContentProvider(mockFetcher, mockParser);

      const privateUrls = [
        'http://127.0.0.1/admin',
        'http://localhost/secret',
        'http://10.0.0.1/internal',
        'http://192.168.1.1/router',
        'http://172.16.0.1/private',
        'http://[::1]/ipv6local',
        'http://0.0.0.0/zero',
      ];

      for (const url of privateUrls) {
        const result = await provider.fetchContent(url);
        expect(result).toBeUndefined();
      }

      expect(mockFetcher.fetch).not.toHaveBeenCalled();
    });
  });

  describe('fetchContent — config defaults', () => {
    it('should use default config when not provided', async () => {
      const { ReadabilityContentProvider } = await import('../../src/link/index.js');
      const provider = new ReadabilityContentProvider(mockFetcher, mockParser);

      await provider.fetchContent('https://example.com');

      expect(mockFetcher.fetch).toHaveBeenCalledWith(
        'https://example.com',
        expect.objectContaining({
          timeoutMs: 10_000,
          maxRedirects: 3,
        }),
      );
    });

    it('should use custom config when provided', async () => {
      const config: LinkProviderConfig = {
        timeoutMs: 5_000,
        maxRedirects: 1,
        maxContentChars: 10_000,
        userAgent: 'CustomBot/2.0',
      };
      const { ReadabilityContentProvider } = await import('../../src/link/index.js');
      const provider = new ReadabilityContentProvider(mockFetcher, mockParser, config);

      await provider.fetchContent('https://example.com');

      expect(mockFetcher.fetch).toHaveBeenCalledWith(
        'https://example.com',
        expect.objectContaining({
          timeoutMs: 5_000,
          maxRedirects: 1,
        }),
      );
    });
  });

  describe('fetchContent — content type handling', () => {
    it('should accept text/html content type', async () => {
      const { ReadabilityContentProvider } = await import('../../src/link/index.js');
      const provider = new ReadabilityContentProvider(mockFetcher, mockParser);

      const result = await provider.fetchContent('https://example.com');
      expect(result).toBeDefined();
    });

    it('should accept application/xhtml+xml content type', async () => {
      const fetcher = createMockFetcher({
        fetch: vi.fn().mockResolvedValue({
          status: 200,
          body: '<html><body><p>xhtml</p></body></html>',
          contentType: 'application/xhtml+xml',
          url: 'https://example.com',
        }),
      });
      const { ReadabilityContentProvider } = await import('../../src/link/index.js');
      const provider = new ReadabilityContentProvider(fetcher, mockParser);

      const result = await provider.fetchContent('https://example.com');
      expect(result).toBeDefined();
    });
  });

  describe('LinkContentProvider interface compliance', () => {
    it('should implement the fetchContent method from LinkContentProvider', async () => {
      const { ReadabilityContentProvider } = await import('../../src/link/index.js');
      const provider = new ReadabilityContentProvider(mockFetcher, mockParser);

      expect(typeof provider.fetchContent).toBe('function');
    });

    it('should return ContentSummary-compatible object', async () => {
      const { ReadabilityContentProvider } = await import('../../src/link/index.js');
      const provider = new ReadabilityContentProvider(mockFetcher, mockParser);

      const result = await provider.fetchContent('https://example.com');

      // ContentSummary fields from core/types/link.ts
      expect(result).toEqual(
        expect.objectContaining({
          content: expect.any(String),
        }),
      );
      if (result) {
        // Optional fields
        if (result.title !== undefined) expect(typeof result.title).toBe('string');
        if (result.byline !== undefined) expect(typeof result.byline).toBe('string');
        if (result.excerpt !== undefined) expect(typeof result.excerpt).toBe('string');
        if (result.siteName !== undefined) expect(typeof result.siteName).toBe('string');
        if (result.wordCount !== undefined) expect(typeof result.wordCount).toBe('number');
      }
    });
  });
});
