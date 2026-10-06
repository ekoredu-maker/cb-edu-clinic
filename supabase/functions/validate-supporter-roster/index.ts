import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.117.2";
import ExcelJS from "npm:exceljs@4.4.0";
import Papa from "npm:papaparse@5.5.3";

const MAX_FILE_BYTES = 2 * 1024 * 1024;
const MAX_ROWS = 200;

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

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

function normalizeHeader(v: unknown) {
  return String(v ?? "").trim().toLowerCase().replace(/[\s_.-]+/g, "");
}
function findColumn(headers: string[], aliases: string[]) {
  const targets = new Set(aliases.map(normalizeHeader));
  return headers.findIndex((h) => targets.has(normalizeHeader(h)));
}
function normalizeEmail(v: unknown) { return String(v ?? "").trim().toLowerCase(); }
function normalizeName(v: unknown) { return String(v ?? "").trim(); }
function validEmail(v: string) { return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v); }

async function parseXlsx(file: File) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(new Uint8Array(await file.arrayBuffer()));
  const ws = workbook.worksheets[0];
  if (!ws) return [];
  const rows: unknown[][] = [];
  ws.eachRow({ includeEmpty: false }, (row) => {
    rows.push((row.values as unknown[]).slice(1).map((v: any) => {
      if (v && typeof v === "object" && "text" in v) return v.text;
      if (v && typeof v === "object" && "result" in v) return v.result;
      return v ?? "";
    }));
  });
  return rows;
}

async function parseCsv(file: File) {
  const parsed = Papa.parse<string[]>(await file.text(), { skipEmptyLines: "greedy" });
  if (parsed.errors.length) throw new Error("CSV 형식을 읽지 못했습니다.");
  return parsed.data as unknown[][];
}

async function registeredEmails(admin: any) {
  const emails = new Set<string>();
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 100 });
    if (error) throw error;
    const users = data?.users || [];
    for (const user of users) if (user.email) emails.add(user.email.toLowerCase());
    if (users.length < 100) break;
  }
  return emails;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ ok: false, message: "POST 요청만 허용됩니다." }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const secretKey = getSecretKey();
  if (!supabaseUrl || !secretKey) return json({ ok: false, message: "서버 설정 오류입니다." }, 500);

  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return json({ ok: false, message: "로그인이 필요합니다." }, 401);

  const admin = createClient(supabaseUrl, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: userData, error: userError } = await admin.auth.getUser(token);
  const user = userData?.user;
  if (userError || !user) return json({ ok: false, message: "로그인 세션을 확인해 주세요." }, 401);

  const { data: profile, error: profileError } = await admin
    .from("profiles").select("roles,active").eq("id", user.id).maybeSingle();
  if (profileError || !profile?.active || !(profile.roles || []).some((r: string) => r === "admin" || r === "supervisor")) {
    return json({ ok: false, message: "명부 가져오기 권한이 없습니다." }, 403);
  }

  let form: FormData;
  try { form = await req.formData(); }
  catch { return json({ ok: false, message: "업로드 형식을 확인해 주세요." }, 400); }

  const file = form.get("file");
  if (!(file instanceof File)) return json({ ok: false, message: "명부 파일을 선택해 주세요." }, 400);
  if (file.size > MAX_FILE_BYTES) return json({ ok: false, message: "명부 파일은 2MB 이하로 올려 주세요." }, 400);

  const filename = file.name.toLowerCase();
  if (!filename.endsWith(".xlsx") && !filename.endsWith(".csv")) {
    return json({ ok: false, message: "XLSX 또는 CSV 파일만 사용할 수 있습니다." }, 400);
  }

  let rawRows: unknown[][];
  try { rawRows = filename.endsWith(".xlsx") ? await parseXlsx(file) : await parseCsv(file); }
  catch (e) { return json({ ok: false, message: e instanceof Error ? e.message : "명부를 읽지 못했습니다." }, 400); }

  if (rawRows.length < 2) return json({ ok: false, message: "헤더와 1명 이상의 자료가 필요합니다." }, 400);

  const headers = rawRows[0].map((v) => String(v ?? "").trim());
  const nameCol = findColumn(headers, ["성명", "이름", "name", "display_name", "displayname"]);
  const emailCol = findColumn(headers, ["이메일", "메일", "email", "e-mail"]);
  if (nameCol < 0 || emailCol < 0) {
    return json({ ok: false, message: "첫 행에 '성명'과 '이메일' 열이 필요합니다.", detected_headers: headers }, 400);
  }

  const sourceRows = rawRows.slice(1, MAX_ROWS + 1);
  const emailCounts = new Map<string, number>();
  for (const row of sourceRows) {
    const email = normalizeEmail(row[emailCol]);
    if (email) emailCounts.set(email, (emailCounts.get(email) || 0) + 1);
  }

  const { data: inviteRows, error: inviteError } = await admin
    .from("supporter_invitations").select("email,status").in("status", ["pending", "locked"]);
  if (inviteError) return json({ ok: false, message: "기존 초대정보를 확인하지 못했습니다." }, 500);
  const invited = new Set((inviteRows || []).map((x: any) => String(x.email || "").toLowerCase()));

  let registered: Set<string>;
  try { registered = await registeredEmails(admin); }
  catch { return json({ ok: false, message: "기존 사용자 중복정보를 확인하지 못했습니다." }, 500); }

  const rows = sourceRows.map((row, index) => {
    const name = normalizeName(row[nameCol]);
    const email = normalizeEmail(row[emailCol]);
    let status = "valid";
    let message = "초대 가능";
    if (!name) { status = "error"; message = "성명 누락"; }
    else if (!validEmail(email)) { status = "error"; message = "이메일 형식 오류"; }
    else if ((emailCounts.get(email) || 0) > 1) { status = "duplicate_file"; message = "파일 내 이메일 중복"; }
    else if (registered.has(email)) { status = "registered"; message = "이미 등록된 계정"; }
    else if (invited.has(email)) { status = "pending_invite"; message = "기존 초대 존재"; }
    return { row_number: index + 2, name, email, status, message };
  });

  return json({
    ok: true,
    filename: file.name,
    total: rows.length,
    valid: rows.filter((r) => r.status === "valid").length,
    invalid: rows.filter((r) => r.status !== "valid").length,
    truncated: rawRows.length - 1 > MAX_ROWS,
    rows,
  });
});
