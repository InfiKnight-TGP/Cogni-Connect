import { backendFetch, backendResponse } from "@/lib/backend-proxy";
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const params = new URLSearchParams({ given: body.given, real: body.real + ".", ...(body.video && { video: body.video }) });
    const response = await backendFetch(request, `/accuracy?${params}`);
    if (!response.ok) return backendResponse(response);
    const data = await response.json();
    return backendResponse(new Response(JSON.stringify({ data }), { headers: response.headers }));
  } catch { return Response.json({ error: "Could not check your answer." }, { status: 502 }); }
}
