import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.117.2";

const ALLOWED_ORIGINS = new Set([
  "https://ekoredu-maker.github.io",
]);

function cors(req: Request) {
  const origin = req.headers.get("origin") || "";
  const allowOrigin = ALLOWED_ORIGINS.has(origin) ? origin : "https://ekoredu-maker.github.io";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors(req), "Content-Type": "application/json; charset=utf-8" },
  });
}

async function sha256Hex(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function getSecretKey() {
  const direct = Deno.env.get("SUPABASE_SECRET_KEY");
  if (direct) return direct;

  const raw = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    return parsed.default || Object.values(parsed)[0] || null;
  } catch {
    return null;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors(req) });
  }

  if (req.method !== "POST") {
    return json(req, { ok: false, message: "허용되지 않은 요청입니다." }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const secretKey = getSecretKey();

  if (!supabaseUrl || !secretKey) {
    return json(req, { ok: false, message: "서버 설정을 확인해 주세요." }, 500);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json(req, { ok: false, message: "요청 형식이 올바르지 않습니다." }, 400);
  }

  const inviteToken = String(body.invite_token || "").trim();
  const approvalCode = String(body.approval_code || "").trim();
  const password = String(body.password || "");

  if (!/^[a-f0-9]{48}$/i.test(inviteToken)) {
    return json(req, { ok: false, message: "초대 링크가 올바르지 않습니다." }, 400);
  }
  if (!/^\d{6}$/.test(approvalCode)) {
    return json(req, { ok: false, message: "승인번호 6자리를 입력해 주세요." }, 400);
  }
  if (password.length < 10) {
    return json(req, { ok: false, message: "비밀번호는 10자 이상으로 설정해 주세요." }, 400);
  }

  const admin = createClient(supabaseUrl, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const tokenHash = await sha256Hex(inviteToken);
  const codeHash = await sha256Hex(approvalCode);

  const { data: invitation, error: invitationError } = await admin
    .from("supporter_invitations")
    .select("id,invitee_name,email,approval_code_hash,status,expires_at,max_attempts,failed_attempts")
    .eq("invite_token_hash", tokenHash)
    .maybeSingle();

  if (invitationError || !invitation) {
    return json(req, { ok: false, message: "초대정보 또는 승인번호를 확인해 주세요." }, 400);
  }

  if (invitation.status !== "pending") {
    return json(req, { ok: false, message: "이미 사용되었거나 사용할 수 없는 초대입니다." }, 400);
  }

  if (new Date(invitation.expires_at).getTime() <= Date.now()) {
    await admin
      .from("supporter_invitations")
      .update({ status: "expired", last_attempt_at: new Date().toISOString() })
      .eq("id", invitation.id);

    return json(req, {
      ok: false,
      message: "초대 유효시간이 만료되었습니다. 담당자에게 재발급을 요청해 주세요.",
    }, 400);
  }

  if (invitation.approval_code_hash !== codeHash) {
    const failed = Number(invitation.failed_attempts || 0) + 1;
    const locked = failed >= Number(invitation.max_attempts || 5);

    await admin
      .from("supporter_invitations")
      .update({
        failed_attempts: failed,
        last_attempt_at: new Date().toISOString(),
        status: locked ? "locked" : "pending",
      })
      .eq("id", invitation.id);

    return json(req, {
      ok: false,
      message: locked
        ? "승인번호 입력 횟수를 초과했습니다. 담당자에게 재발급을 요청해 주세요."
        : "초대정보 또는 승인번호를 확인해 주세요.",
    }, 400);
  }

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: invitation.email,
    password,
    email_confirm: true,
    user_metadata: { display_name: invitation.invitee_name },
  });

  if (createError || !created.user) {
    return json(req, {
      ok: false,
      message: createError?.message?.toLowerCase().includes("already")
        ? "이미 등록된 로그인 이메일입니다. 담당자에게 확인해 주세요."
        : "계정을 만들지 못했습니다. 담당자에게 문의해 주세요.",
    }, 400);
  }

  const userId = created.user.id;

  const { data: completed, error: completeError } = await admin.rpc(
    "complete_supporter_invitation",
    {
      p_invitation_id: invitation.id,
      p_user_id: userId,
    },
  );

  if (completeError) {
    try {
      await admin.auth.admin.deleteUser(userId);
    } catch (_) {
      // best-effort cleanup
    }

    return json(req, {
      ok: false,
      message: "등록 마무리 중 오류가 발생했습니다. 담당자에게 문의해 주세요.",
    }, 500);
  }

  return json(req, {
    ok: true,
    email: invitation.email,
    display_name: invitation.invitee_name,
    mobile_id_no: completed?.mobile_id_no || null,
  });
});
