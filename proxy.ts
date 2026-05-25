import { NextRequest, NextResponse } from "next/server";

export const config = {
  matcher: "/((?!_next|favicon|api/health|api/cron).*)",
};

export function proxy(req: NextRequest) {
  const expected = process.env.ADLAB_PASSWORD;
  if (!expected) return NextResponse.next(); // open if unset

  const auth = req.headers.get("authorization");
  if (auth) {
    const [scheme, encoded] = auth.split(" ");
    if (scheme === "Basic" && encoded) {
      const [, pass] = atob(encoded).split(":");
      if (pass === expected) return NextResponse.next();
    }
  }
  return new NextResponse("Auth required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="AdLab"' },
  });
}
