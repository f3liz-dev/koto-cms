import * as fdk from "./fdk.ts";
import { handleRequest } from "./server.ts";

fdk.handle(async (body: Uint8Array, ctx: fdk.Context) => {
  const gateway = ctx.httpGateway;
  
  // Construct a standard Request from OCI Gateway metadata
  const req = new Request(`http://localhost${gateway.requestURL}`, {
    method: gateway.method,
    headers: gateway.headers,
    body: ["GET", "HEAD"].includes(gateway.method) ? null : body,
  });

  // Let server.ts handle the logic
  return await handleRequest(req);
}, { inputMode: 'buffer' });