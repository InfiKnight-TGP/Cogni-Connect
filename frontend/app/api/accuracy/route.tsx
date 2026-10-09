import { API_URL } from "@/lib/api";
export async function POST(request: Request) {
  try {
    const req = await request.json();

    const value = req.given;
    const answer = req.real;
    const video = req.video || '';

    const params = new URLSearchParams({
      given: value,
      real: answer + '.',
      ...(video && { video })
    });

    const res = await fetch(
      `${API_URL}/accuracy?${params.toString()}`,
      {
        headers: {
          "Content-Type": "application/json",
        },
        cache: "no-store",
      },
    );
    const data = await res.json();

    return Response.json({ data });
  } catch (err) {
    console.log(err);
    return Response.json({ error: "Failed to check accuracy" }, { status: 500 });
  }
}
