export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

export async function POST(request: NextRequest) {
  try {
    const { password } = await request.json();
    const adminPassword = process.env.ADMIN_PASSWORD || "admin1234!";

    if (password === adminPassword) {
      const cookieStore = await cookies();
      cookieStore.set("admin_token", "tactical_admin_ok", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 8 * 60 * 60, // 8 hours
        sameSite: "lax",
      });

      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  } catch (error: any) {
    return NextResponse.json({ error: "INTERNAL_SERVER_ERROR", details: error.message }, { status: 500 });
  }
}
