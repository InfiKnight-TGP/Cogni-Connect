import { backendFetch, backendResponse } from "@/lib/backend-proxy";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try { return backendResponse(await backendFetch(request, "/video_chunks")); }
  catch { return Response.json({ error: "Could not load memories." }, { status: 502 }); }
}
