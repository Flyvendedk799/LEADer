import { NextResponse } from "next/server";
import { apiError, HttpError } from "@/lib/api";
import { requireOwnerId } from "@/lib/auth";
import { saveCandidateAsDeal } from "@/lib/crm";

export async function POST(
  req: Request,
  props: { params: Promise<{ id: string }> },
) {
  const params = await props.params;
  try {
    const ownerId = await requireOwnerId();
    const result = await saveCandidateAsDeal(ownerId, params.id);

    return NextResponse.json(result, { status: result.created ? 201 : 200 });
  } catch (err) {
    return apiError(err);
  }
}