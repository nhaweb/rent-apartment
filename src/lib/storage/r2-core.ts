/**
 * Cloudflare R2 through its S3 API, signed with aws4fetch (fetch only, so it
 * runs on Node/Fly.io and Vercel alike). Bound to a bucket by `createR2`.
 * App code uses `./r2.ts` (config from `astro:env`); scripts build their own.
 * No `astro:*` imports here.
 */
import { AwsClient } from 'aws4fetch';

export interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
}

export interface R2ObjectInfo {
  size: number;
  contentType: string | null;
}

export interface R2ListedObject {
  key: string;
  size: number;
  lastModified: Date;
}

export interface CorsRule {
  allowedOrigins: string[];
  allowedMethods: string[];
  allowedHeaders: string[];
  exposeHeaders?: string[];
  maxAgeSeconds?: number;
}

/** Decodes the five XML entities S3 uses in listings. */
const xmlText = (value: string) =>
  value
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&amp;', '&');

const xmlEscape = (value: string) =>
  value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

function tag(xml: string, name: string): string | undefined {
  const match = new RegExp(`<${name}>([\\s\\S]*?)</${name}>`).exec(xml);
  return match ? xmlText(match[1]!) : undefined;
}

export function createR2(config: R2Config) {
  const client = new AwsClient({
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    service: 's3',
    region: 'auto',
  });
  const bucketUrl = `https://${config.accountId}.r2.cloudflarestorage.com/${config.bucket}`;
  const objectUrl = (key: string) => `${bucketUrl}/${key.split('/').map(encodeURIComponent).join('/')}`;

  async function send(url: string, init: RequestInit = {}): Promise<Response> {
    return client.fetch(url, init);
  }

  async function fail(response: Response, what: string): Promise<never> {
    const body = await response.text().catch(() => '');
    throw new Error(`R2 ${what} failed: ${response.status} ${tag(body, 'Code') ?? ''} ${tag(body, 'Message') ?? ''}`.trim());
  }

  return {
    bucket: config.bucket,

    /**
     * Presigned PUT URL. `Content-Type` is part of the signature (allHeaders),
     * so the upload must send exactly `contentType` or R2 rejects it.
     */
    async presignPut(key: string, contentType: string, expiresSeconds: number): Promise<string> {
      const url = new URL(objectUrl(key));
      url.searchParams.set('X-Amz-Expires', String(expiresSeconds));
      const signed = await client.sign(new Request(url, { method: 'PUT', headers: { 'content-type': contentType } }), {
        aws: { signQuery: true, allHeaders: true },
      });
      return signed.url;
    },

    /** Size and type, or `undefined` when the object does not exist. */
    async head(key: string): Promise<R2ObjectInfo | undefined> {
      const response = await send(objectUrl(key), { method: 'HEAD' });
      if (response.status === 404) return undefined;
      if (!response.ok) await fail(response, `HEAD ${key}`);
      return {
        size: Number(response.headers.get('content-length') ?? 0),
        contentType: response.headers.get('content-type'),
      };
    },

    /** The first `length` bytes of an object. */
    async readStart(key: string, length: number): Promise<Uint8Array> {
      const response = await send(objectUrl(key), { headers: { range: `bytes=0-${length - 1}` } });
      if (!response.ok) await fail(response, `GET ${key}`);
      return new Uint8Array(await response.arrayBuffer());
    },

    async put(key: string, body: Uint8Array<ArrayBuffer>, contentType: string, cacheControl?: string): Promise<void> {
      const headers: Record<string, string> = { 'content-type': contentType };
      if (cacheControl) headers['cache-control'] = cacheControl;
      const response = await send(objectUrl(key), { method: 'PUT', headers, body });
      if (!response.ok) await fail(response, `PUT ${key}`);
    },

    /**
     * Rewrites an object's headers in place (CopyObject onto itself with
     * REPLACE). Used to add Cache-Control to browser uploads, whose presigned
     * PUT only signs Content-Type (the bucket CORS allows nothing else).
     */
    async setHeaders(key: string, contentType: string, cacheControl: string): Promise<void> {
      const source = `/${config.bucket}/${key.split('/').map(encodeURIComponent).join('/')}`;
      const response = await send(objectUrl(key), {
        method: 'PUT',
        headers: {
          'x-amz-copy-source': source,
          'x-amz-metadata-directive': 'REPLACE',
          'content-type': contentType,
          'cache-control': cacheControl,
        },
      });
      if (!response.ok) await fail(response, `COPY ${key}`);
    },

    /** Deletes each key (missing keys are fine). Returns the keys that could not be deleted. */
    async deleteMany(keys: string[]): Promise<string[]> {
      const failed: string[] = [];
      const queue = [...new Set(keys)];
      const worker = async () => {
        for (let key = queue.shift(); key !== undefined; key = queue.shift()) {
          try {
            const response = await send(objectUrl(key), { method: 'DELETE' });
            if (!response.ok && response.status !== 404) failed.push(key);
          } catch {
            failed.push(key);
          }
        }
      };
      await Promise.all(Array.from({ length: Math.min(6, queue.length) }, worker));
      return failed;
    },

    /** Every object under `prefix` (ListObjectsV2, all pages). */
    async list(prefix: string): Promise<R2ListedObject[]> {
      const objects: R2ListedObject[] = [];
      let token: string | undefined;
      do {
        const url = new URL(bucketUrl);
        url.searchParams.set('list-type', '2');
        url.searchParams.set('prefix', prefix);
        if (token) url.searchParams.set('continuation-token', token);
        const response = await send(url.toString());
        if (!response.ok) await fail(response, 'LIST');
        const xml = await response.text();
        for (const [, entry] of xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)) {
          objects.push({
            key: tag(entry!, 'Key') ?? '',
            size: Number(tag(entry!, 'Size') ?? 0),
            lastModified: new Date(tag(entry!, 'LastModified') ?? 0),
          });
        }
        token = tag(xml, 'IsTruncated') === 'true' ? tag(xml, 'NextContinuationToken') : undefined;
      } while (token);
      return objects;
    },

    /** Replaces the bucket CORS rules (needs a token allowed to edit bucket settings). */
    async putCors(rules: CorsRule[]): Promise<void> {
      const list = (name: string, values: string[] = []) => values.map((v) => `<${name}>${xmlEscape(v)}</${name}>`).join('');
      const body = `<?xml version="1.0" encoding="UTF-8"?><CORSConfiguration>${rules
        .map(
          (rule) =>
            `<CORSRule>${list('AllowedOrigin', rule.allowedOrigins)}${list('AllowedMethod', rule.allowedMethods)}${list(
              'AllowedHeader',
              rule.allowedHeaders,
            )}${list('ExposeHeader', rule.exposeHeaders)}${
              rule.maxAgeSeconds ? `<MaxAgeSeconds>${rule.maxAgeSeconds}</MaxAgeSeconds>` : ''
            }</CORSRule>`,
        )
        .join('')}</CORSConfiguration>`;
      const response = await send(`${bucketUrl}?cors`, { method: 'PUT', headers: { 'content-type': 'application/xml' }, body });
      if (!response.ok) await fail(response, 'PUT CORS');
    },
  };
}

export type R2 = ReturnType<typeof createR2>;
