import { NextRequest, NextResponse } from "next/server";
import { APP_ENV, supabaseAdmin } from "../../../../lib/supabaseAdmin";

export const dynamic = "force-dynamic";

function isCronAuthorized(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");
  const adminSecret = process.env.LIVE_STATS_ADMIN_SECRET;
  const suppliedAdminSecret =
    request.nextUrl.searchParams.get("secret") ?? request.headers.get("x-admin-secret");

  if (cronSecret && authorization === `Bearer ${cronSecret}`) return true;
  return Boolean(adminSecret && suppliedAdminSecret === adminSecret);
}

async function runAutoSubmit(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const { data, error } = await supabaseAdmin.rpc(
      "auto_submit_previous_teams_at_lockout",
      { requested_environment: APP_ENV },
    );

    if (error) {
      return NextResponse.json(
        { error: "Automatic team submission failed.", details: error.message },
        { status: 500 },
      );
    }

    return NextResponse.json(data, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Automatic team submission failed.",
        details: error instanceof Error ? error.message : "Unknown error.",
      },
      { status: 500 },
    );
  }
}

export async function GET(request: NextRequest) {
  return runAutoSubmit(request);
}

export async function POST(request: NextRequest) {
  return runAutoSubmit(request);
}
