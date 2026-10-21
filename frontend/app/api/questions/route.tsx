import { backendFetch, backendResponse } from "@/lib/backend-proxy";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const response = await backendFetch(request, "/questions");
    if (!response.ok) return backendResponse(response);
    const data = await response.json();
    return backendResponse(new Response(JSON.stringify({ data }), { headers: response.headers }));
  } catch { return Response.json({ error: "Could not load questions." }, { status: 502 }); }
}
