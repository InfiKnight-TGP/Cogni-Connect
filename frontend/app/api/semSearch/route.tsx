import { API_URL } from "@/lib/api";
export async function POST(request: Request) {
  try {
    const req = await request.json();

    const query = req.query;

    const res = await fetch(`${API_URL}/search?query=${encodeURIComponent(query)}`, {
      headers: {
        "Content-Type": "application/json",
      },
      cache: "no-store",
    });
    
    if (!res.ok) {
      console.error("Backend search failed:", res.statusText);
      return Response.json({ data: [], error: res.statusText });
    }
    
    const data = await res.json();
    console.log("Search results from backend:", data);

    return Response.json({ data });
  } catch (err) {
    console.error("Search error:", err);
    return Response.json({ data: [], error: String(err) });
  }
}
