import { NextResponse } from "next/server";
import { logout } from "@/lib/auth";
import { apiError } from "@/lib/api";

export async function POST() {
  try {
    await logout();
    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiError(err);
  }
}
