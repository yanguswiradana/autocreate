import { NextRequest } from "next/server";
import { proxyRequest } from "@/lib/proxy";

export const dynamic = "force-dynamic";

async function handler(
  req: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  const { path } = await context.params;
  const target = process.env.INTERNAL_API_URL || "http://127.0.0.1:8000";
  return proxyRequest(req, target, `/api/${path.join("/")}`);
}

export {
  handler as GET,
  handler as POST,
  handler as PUT,
  handler as PATCH,
  handler as DELETE,
};
