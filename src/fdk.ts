'use strict';

import * as path from "jsr:@std/path";

const fdkVersion = 'fdk-deno/1.1.0';
const runtimeTag = 'deno/' + Deno.version.deno;

function canonHeader(h: string): string {
  return h.replace(/_/g, '-').split('-').map((part) => {
    return part ? part.charAt(0).toUpperCase() + part.slice(1).toLowerCase() : '';
  }).join('-');
}

/**
 * Helper to handle API Gateway specific headers
 */
class HTTPGatewayContext {
  private _headers: Record<string, string[]>;

  constructor(private ctx: Context) {
    const gatewayHeaders: Record<string, string[]> = {};
    for (const [key, value] of Object.entries(ctx.headers)) {
      if (key.startsWith('Fn-Http-H-') && key.length > 'Fn-Http-H-'.length) {
        gatewayHeaders[canonHeader(key.substring('Fn-Http-H-'.length))] = value;
      }
    }
    this._headers = gatewayHeaders;
  }

  get requestURL() { return this.ctx.getHeader('Fn-Http-Request-Url') || "/"; }
  get method() { return this.ctx.getHeader('Fn-Http-Method') || "GET"; }
  get headers() {
    const h = new Headers();
    for (const [key, values] of Object.entries(this._headers)) {
      values.forEach(v => h.append(key, v));
    }
    return h;
  }
}

export class Context {
  public _responseHeaders: Headers = new Headers();

  constructor(
    public config: Record<string, string>,
    public body: any,
    public headers: Record<string, string[]>
  ) {}

  getHeader(key: string) {
    const h = this.headers[canonHeader(key)];
    return h ? h[0] : null;
  }

  set responseContentType(type: string) {
    this._responseHeaders.set('Content-Type', type);
  }

  get responseHeaders() { return this._responseHeaders; }

  // This was the missing piece!
  get httpGateway() {
    return new HTTPGatewayContext(this);
  }
}

export async function handle(fnFunction: Function, options: { inputMode?: 'json' | 'string' | 'buffer' } = {}) {
  const listenPort = Deno.env.get("FN_LISTENER");
  const inputMode = options.inputMode || 'json';

  if (!listenPort?.startsWith('unix:')) {
    console.error('Error: FN_LISTENER must be a unix socket.');
    Deno.exit(2);
  }

  const socketPath = listenPort.substring(5);
  try { await Deno.remove(socketPath); } catch { /* ignore */ }

  const handler = async (request: Request): Promise<Response> => {
    try {
      const url = new URL(request.url);
      // Fn health checks/pings
      if (url.pathname !== "/call" && url.pathname !== "/invoke") {
        return new Response("OK");
      }

      let body;
      if (inputMode === 'buffer') body = new Uint8Array(await request.arrayBuffer());
      else if (inputMode === 'json') body = await request.json();
      else body = await request.text();

      const headers: Record<string, string[]> = {};
      request.headers.forEach((value, key) => {
        const ck = canonHeader(key);
        if (!headers[ck]) headers[ck] = [];
        headers[ck].push(value);
      });

      const ctx = new Context(Deno.env.toObject(), body, headers);
      const result = await fnFunction(body, ctx);

      // If the user returns a standard Response object, we wrap it for OCI
      if (result instanceof Response) {
        const bodyBuffer = await result.arrayBuffer();
        const ociHeaders = new Headers();
        
        // Protocol: Status goes into Fn-Http-Status
        ociHeaders.set("Fn-Http-Status", result.status.toString());
        
        // Protocol: All original headers get Fn-Http-H- prefix
        result.headers.forEach((val, key) => {
          ociHeaders.set(`Fn-Http-H-${key}`, val);
          if (key.toLowerCase() === "content-type") ociHeaders.set(key, val);
        });

        ociHeaders.set('Fn-Fdk-Version', fdkVersion);
        return new Response(bodyBuffer, { status: 200, headers: ociHeaders });
      }

      // Fallback for simple object returns
      return Response.json(result, {
        headers: { "Fn-Http-Status": "200", "Fn-Fdk-Version": fdkVersion }
      });

    } catch (e: any) {
      return new Response(e.stack, { 
        status: 200, 
        headers: { "Fn-Http-Status": "500", "Content-Type": "text/plain" } 
      });
    }
  };

  Deno.serve({ path: socketPath, onListen: ({ path }) => { Deno.chmodSync(path, 0o666); } }, handler);
}