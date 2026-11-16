import { NextRequest } from "next/server";
import { proxyRequest } from "@/lib/proxy";

export const dynamic = "force-dynamic";

async function handler(
  req: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  const { path } = await context.params;
  const target = process.env.INTERNAL_RENDERER_URL || "http://127.0.0.1:4173";
  return proxyRequest(req, target, `/api/${path.join("/")}`);
}

export { handler as GET, handler as POST };
