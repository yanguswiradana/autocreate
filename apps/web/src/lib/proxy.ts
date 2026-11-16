import { NextRequest } from "next/server";

export async function proxyRequest(
  req: NextRequest,
  targetBase: string,
  targetPath: string
): Promise<Response> {
  const base = targetBase.replace(/\/+$/, "");
  const search = req.nextUrl.search || "";
  const url = `${base}${targetPath}${search}`;

  const headers = new Headers();
  req.headers.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (lower !== "host" && lower !== "connection" && lower !== "content-length") {
      headers.set(key, value);
    }
  });

  const hasBody = !["GET", "HEAD"].includes(req.method.toUpperCase());
  const body = hasBody ? await req.arrayBuffer() : undefined;

  try {
    const upstream = await fetch(url, {
      method: req.method,
      headers,
      body: body && body.byteLength > 0 ? body : undefined,
      redirect: "manual",
    });

    const resHeaders = new Headers();
    upstream.headers.forEach((value, key) => {
      const lower = key.toLowerCase();
      if (lower !== "transfer-encoding" && lower !== "content-encoding") {
        resHeaders.set(key, value);
      }
    });

    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: resHeaders,
    });
  } catch (err) {
    return Response.json(
      {
        error: "Upstream service unreachable",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 502 }
    );
  }
}
