import { NextRequest, NextResponse } from "next/server";
import { APP_ENV, supabaseAdmin } from "../../../../lib/supabaseAdmin";

export const dynamic = "force-dynamic";

const GITHUB_OWNER = "damoduke91-ui";
const GITHUB_REPOSITORY = "COACH-SELECTION-APP";
const GITHUB_WORKFLOW = "production-afl-csv-replacement.yml";
const GITHUB_BRANCH = "master";
const EXPECTED_JOB_NAME = "Protected production CSV replacement";

type AppSettingsRow = { current_afl_round: number | null };
type GithubRun = {
  id?: number;
  html_url?: string;
  status?: string;
  conclusion?: string | null;
  event?: string;
  head_branch?: string;
  created_at?: string;
  path?: string;
};
type GithubJob = { name?: string; status?: string; conclusion?: string | null };

function jsonResponse(status: number, payload: Record<string, unknown>) {
  return NextResponse.json(payload, { status });
}

function getBearerToken(request: NextRequest): string | null {
  const header = request.headers.get("authorization") ?? "";
  const [scheme, token] = header.split(" ");
  return scheme?.toLowerCase() === "bearer" && token ? token : null;
}

function toPositiveInteger(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

async function isProductionAdmin(token: string): Promise<boolean> {
  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
  if (userError || !userData.user) return false;

  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .eq("id", userData.user.id)
    .eq("environment", "production")
    .eq("role", "admin")
    .maybeSingle();

  return !profileError && Boolean(profile);
}

function githubHeaders(token: string): HeadersInit {
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

function getGithubToken(): string | null {
  return process.env.GITHUB_PRODUCTION_WORKFLOW_TOKEN?.trim() || null;
}

function isDispatchEnabled(): boolean {
  return process.env.PRODUCTION_PIPELINE_DISPATCH_ENABLED === "true";
}

function apiBase(): string {
  return `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPOSITORY}`;
}

export async function POST(request: NextRequest) {
  if (APP_ENV !== "production" || !isDispatchEnabled()) {
    return jsonResponse(403, {
      success: false,
      error: "The production GitHub pipeline dispatcher is locked.",
    });
  }

  try {
    const adminToken = getBearerToken(request);
    if (!adminToken || !(await isProductionAdmin(adminToken))) {
      return jsonResponse(403, { success: false, error: "Production admin access required." });
    }

    const workflowToken = getGithubToken();
    if (!workflowToken) {
      return jsonResponse(503, {
        success: false,
        error: "The production GitHub workflow token is not configured.",
      });
    }

    const body = (await request.json().catch(() => ({}))) as { confirmRound?: unknown };
    const confirmedRound = toPositiveInteger(body.confirmRound);
    if (!confirmedRound) {
      return jsonResponse(400, { success: false, error: "A valid round confirmation is required." });
    }

    const { data: settingsData, error: settingsError } = await supabaseAdmin
      .from("app_settings")
      .select("current_afl_round")
      .eq("environment", "production")
      .maybeSingle();
    if (settingsError) {
      throw new Error(`Production round settings could not be loaded: ${settingsError.message}`);
    }

    const currentRound = toPositiveInteger(
      (settingsData as AppSettingsRow | null)?.current_afl_round
    );
    if (!currentRound || confirmedRound !== currentRound) {
      return jsonResponse(409, {
        success: false,
        error: "The confirmed AFL round no longer matches the production dashboard.",
      });
    }

    const activeRunsResponse = await fetch(
      `${apiBase()}/actions/workflows/${GITHUB_WORKFLOW}/runs?branch=${GITHUB_BRANCH}&event=workflow_dispatch&per_page=10`,
      { headers: githubHeaders(workflowToken), cache: "no-store" }
    );
    if (activeRunsResponse.ok) {
      const activePayload = (await activeRunsResponse.json()) as { workflow_runs?: GithubRun[] };
      const activeRun = activePayload.workflow_runs?.find(
        (run) => run.status === "queued" || run.status === "in_progress"
      );
      if (activeRun) {
        return jsonResponse(409, {
          success: false,
          error: "A production CSV pipeline run is already active.",
          workflowRunUrl: activeRun.html_url ?? null,
        });
      }
    }

    const dispatchedAfter = Date.now() - 5_000;
    const dispatchResponse = await fetch(
      `${apiBase()}/actions/workflows/${GITHUB_WORKFLOW}/dispatches`,
      {
        method: "POST",
        headers: { ...githubHeaders(workflowToken), "Content-Type": "application/json" },
        body: JSON.stringify({
          ref: GITHUB_BRANCH,
          inputs: {
            expected_round: String(confirmedRound),
            confirmation_phrase: "PRODUCTION_AFL_CSV_REPLACEMENT",
          },
        }),
        cache: "no-store",
      }
    );
    if (!dispatchResponse.ok) {
      const details = await dispatchResponse.text();
      throw new Error(`GitHub rejected the production workflow request (${dispatchResponse.status}): ${details}`);
    }

    let workflowRun: GithubRun | null = null;
    for (let attempt = 1; attempt <= 6; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 1_000));
      const runsResponse = await fetch(
        `${apiBase()}/actions/workflows/${GITHUB_WORKFLOW}/runs?branch=${GITHUB_BRANCH}&event=workflow_dispatch&per_page=5`,
        { headers: githubHeaders(workflowToken), cache: "no-store" }
      );
      if (!runsResponse.ok) continue;

      const payload = (await runsResponse.json()) as { workflow_runs?: GithubRun[] };
      workflowRun =
        payload.workflow_runs?.find((run) => {
          const createdAt = Date.parse(run.created_at ?? "");
          return run.head_branch === GITHUB_BRANCH && createdAt >= dispatchedAfter;
        }) ?? null;
      if (workflowRun?.id) break;
    }

    return jsonResponse(202, {
      success: true,
      environment: "production",
      aflRound: confirmedRound,
      workflowRunId: workflowRun?.id ?? null,
      workflowRunUrl: workflowRun?.html_url ?? null,
      workflowStatus: workflowRun?.status ?? "queued",
      message: workflowRun?.html_url
        ? `Protected production pipeline started for AFL Round ${confirmedRound}: ${workflowRun.html_url}`
        : `Protected production pipeline was requested for AFL Round ${confirmedRound}. GitHub is preparing the run.`,
    });
  } catch (error) {
    return jsonResponse(500, {
      success: false,
      error: "The protected production pipeline could not be started.",
      details: error instanceof Error ? error.message : "Unknown dispatch error.",
    });
  }
}

export async function GET(request: NextRequest) {
  if (APP_ENV !== "production" || !isDispatchEnabled()) {
    return jsonResponse(403, {
      success: false,
      error: "The production GitHub pipeline dispatcher is locked.",
    });
  }

  try {
    const adminToken = getBearerToken(request);
    if (!adminToken || !(await isProductionAdmin(adminToken))) {
      return jsonResponse(403, { success: false, error: "Production admin access required." });
    }

    const workflowToken = getGithubToken();
    if (!workflowToken) {
      return jsonResponse(503, {
        success: false,
        error: "The production GitHub workflow token is not configured.",
      });
    }

    const workflowRunId = toPositiveInteger(request.nextUrl.searchParams.get("runId"));
    if (!workflowRunId) {
      return jsonResponse(400, { success: false, error: "A valid workflow run ID is required." });
    }

    const runResponse = await fetch(`${apiBase()}/actions/runs/${workflowRunId}`, {
      headers: githubHeaders(workflowToken),
      cache: "no-store",
    });
    if (!runResponse.ok) {
      const details = await runResponse.text();
      throw new Error(`GitHub run status failed (${runResponse.status}): ${details}`);
    }

    const run = (await runResponse.json()) as GithubRun;
    if (
      run.event !== "workflow_dispatch" ||
      run.head_branch !== GITHUB_BRANCH ||
      !run.path?.startsWith(`.github/workflows/${GITHUB_WORKFLOW}`)
    ) {
      return jsonResponse(403, { success: false, error: "That run is not the production CSV workflow." });
    }

    let pipelineJobConclusion: string | null = null;
    if (run.status === "completed") {
      const jobsResponse = await fetch(`${apiBase()}/actions/runs/${workflowRunId}/jobs`, {
        headers: githubHeaders(workflowToken),
        cache: "no-store",
      });
      if (!jobsResponse.ok) {
        throw new Error(`GitHub job status failed (${jobsResponse.status}).`);
      }
      const jobsPayload = (await jobsResponse.json()) as { jobs?: GithubJob[] };
      const pipelineJob = jobsPayload.jobs?.find((job) => job.name === EXPECTED_JOB_NAME);
      pipelineJobConclusion = pipelineJob?.conclusion ?? null;
    }

    return jsonResponse(200, {
      success: true,
      workflowRunId,
      workflowRunUrl: run.html_url ?? null,
      workflowStatus: run.status ?? "unknown",
      workflowConclusion:
        run.status === "completed" && pipelineJobConclusion !== "success"
          ? pipelineJobConclusion ?? "missing_pipeline_job"
          : run.conclusion ?? null,
      pipelineJobConclusion,
    });
  } catch (error) {
    return jsonResponse(500, {
      success: false,
      error: "Production pipeline status could not be checked.",
      details: error instanceof Error ? error.message : "Unknown status error.",
    });
  }
}
