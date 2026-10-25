import { backendFetch, backendResponse } from "@/lib/backend-proxy";
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const response = await backendFetch(request, `/search?query=${encodeURIComponent(body.query ?? "")}`);
    if (!response.ok) return backendResponse(response);
    const data = await response.json();
    return backendResponse(new Response(JSON.stringify({ data }), { headers: response.headers }));
  } catch { return Response.json({ error: "Could not search your memories." }, { status: 502 }); }
}
