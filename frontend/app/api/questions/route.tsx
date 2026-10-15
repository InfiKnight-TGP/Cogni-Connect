import { API_URL } from "@/lib/api";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const res = await fetch(`${API_URL}/questions`, {
      headers: {
        "Content-Type": "application/json",
      },
      cache: "no-store",
    });
    
    if (!res.ok) {
      console.error("Backend returned error:", res.status);
      return Response.json({ 
        data: [],
        error: "Failed to fetch questions from backend" 
      }, { status: res.status });
    }
    
    const data = await res.json();
    return Response.json({ data });
  } catch (err) {
    console.error("Error fetching questions:", err);
    return Response.json({ 
      data: [],
      error: "Backend server is not responding. Please ensure the Flask backend is running on port 5000." 
    }, { status: 500 });
  }
}
