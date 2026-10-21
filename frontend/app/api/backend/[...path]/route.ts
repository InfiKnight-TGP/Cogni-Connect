import { backendFetch, backendResponse } from "@/lib/backend-proxy";
export const dynamic = "force-dynamic";
async function proxy(request: Request, { params }: { params: { path: string[] } }) {
  try {
    const path = "/" + params.path.map(encodeURIComponent).join("/") + new URL(request.url).search;
    return backendResponse(await backendFetch(request, path, {
      method: request.method,
      body: !["GET", "HEAD"].includes(request.method) ? await request.arrayBuffer() : undefined,
    }));
  } catch {
    return Response.json({ error: "Could not reach the server. Please try again." }, { status: 502 });
  }
}
export { proxy as GET, proxy as HEAD, proxy as POST, proxy as PUT, proxy as PATCH, proxy as DELETE, proxy as OPTIONS };
