import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.117.2";
import ExcelJS from "npm:exceljs@4.4.0";
import Papa from "npm:papaparse@5.5.3";

const MAX_FILE_BYTES = 2 * 1024 * 1024;
const MAX_ROWS = 200;
const ALLOWED_ORIGINS = new Set(["https://ekoredu-maker.github.io"]);

function cors(req: Request) {
  const origin = req.headers.get("origin") || "";
  const allow = ALLOWED_ORIGINS.has(origin) ? origin : "https://ekoredu-maker.github.io";
  return {
    "Access-Control-Allow-Origin": allow,
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
function normHeader(v: unknown) {
  return String(v ?? "").trim().toLowerCase().replace(/[\s_.()\[\]-]+/g, "");
}
function findCol(headers: string[], aliases: string[]) {
  const set = new Set(aliases.map(normHeader));
  return headers.findIndex((h) => set.has(normHeader(h)));
}
function str(v: unknown) { return String(v ?? "").trim(); }
function normSchool(v: unknown) { return str(v).replace(/\s+/g, "").toLowerCase(); }
function intVal(v: unknown) {
  const s = str(v);
  if (!s) return null;
  const n = Number(s);
  return Number.isInteger(n) ? n : null;
}
function schoolType(v: unknown) {
  const s = str(v).replace(/\s+/g, "").toLowerCase();
  if (["초","초등","초등학교","elementary"].includes(s)) return "초";
  if (["중","중등","중학교","middle"].includes(s)) return "중";
  if (["고","고등","고등학교","high"].includes(s)) return "고";
  if (["특수","특수학교","special"].includes(s)) return "특수";
  if (["기타","other"].includes(s)) return "기타";
  return null;
}
function supportType(v: unknown) {
  const s = str(v).replace(/\s+/g, "").toLowerCase();
  if (!s) return "coach";
  if (["coach","코칭","학습코칭","학습지원","학습지원단"].includes(s)) return "coach";
  if (["class","수업","수업지원","교실지원"].includes(s)) return "class";
  if (["counseling","counselor","상담","학습상담"].includes(s)) return "counseling";
  return null;
}
function activeVal(v: unknown) {
  const s = str(v).replace(/\s+/g, "").toLowerCase();
  if (!s) return true;
  if (["y","yes","true","1","활성","사용","재학"].includes(s)) return true;
  if (["n","no","false","0","비활성","중지","종료"].includes(s)) return false;
  return null;
}
async function parseXlsx(file: File) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(new Uint8Array(await file.arrayBuffer()));
  const ws = wb.worksheets[0];
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
async function allStudents(admin: any) {
  const rows: any[] = [];
  for (let from = 0; from < 10000; from += 1000) {
    const { data, error } = await admin
      .from("students")
      .select("id,legacy_student_id,school_id,full_name,grade,class_no,active")
      .range(from, from + 999);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return rows;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(req) });
  if (req.method !== "POST") return json(req, { ok:false, message:"POST 요청만 허용됩니다." }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const secretKey = getSecretKey();
  if (!supabaseUrl || !secretKey) return json(req, { ok:false, message:"서버 설정 오류입니다." }, 500);

  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return json(req, { ok:false, message:"로그인이 필요합니다." }, 401);

  const admin = createClient(supabaseUrl, secretKey, {
    auth: { autoRefreshToken:false, persistSession:false },
  });
  const { data:userData, error:userError } = await admin.auth.getUser(token);
  const user = userData?.user;
  if (userError || !user) return json(req, { ok:false, message:"로그인 세션을 확인해 주세요." }, 401);

  const { data:profile, error:profileError } = await admin
    .from("profiles").select("roles,active").eq("id",user.id).maybeSingle();
  if (profileError || !profile?.active || !(profile.roles || []).some((r:string)=>r==="admin"||r==="supervisor")) {
    return json(req, { ok:false, message:"학생 명부 등록 권한이 없습니다." }, 403);
  }

  let form: FormData;
  try { form = await req.formData(); }
  catch { return json(req, { ok:false, message:"업로드 형식을 확인해 주세요." }, 400); }

  const file = form.get("file");
  if (!(file instanceof File)) return json(req, { ok:false, message:"학생 명부 파일을 선택해 주세요." }, 400);
  if (file.size > MAX_FILE_BYTES) return json(req, { ok:false, message:"학생 명부는 2MB 이하로 올려 주세요." }, 400);

  const filename = file.name.toLowerCase();
  if (!filename.endsWith(".xlsx") && !filename.endsWith(".csv")) {
    return json(req, { ok:false, message:"XLSX 또는 CSV 파일만 사용할 수 있습니다." }, 400);
  }

  let raw: unknown[][];
  try { raw = filename.endsWith(".xlsx") ? await parseXlsx(file) : await parseCsv(file); }
  catch(e) { return json(req, { ok:false, message:e instanceof Error ? e.message : "학생 명부를 읽지 못했습니다." }, 400); }
  if (raw.length < 2) return json(req, { ok:false, message:"헤더와 1명 이상의 학생 자료가 필요합니다." }, 400);

  const headers = raw[0].map(v=>str(v));
  const schoolCol = findCol(headers, ["학교","학교명","학교코드","school","schoolname","schoolcode"]);
  const typeCol = findCol(headers, ["학교급","학교유형","schooltype"]);
  const gradeCol = findCol(headers, ["학년","grade"]);
  const classCol = findCol(headers, ["반","학급","class","classno"]);
  const nameCol = findCol(headers, ["학생명","성명","이름","학생이름","fullname","name"]);
  const aliasCol = findCol(headers, ["별칭","학생별칭","alias"]);
  const legacyCol = findCol(headers, ["학생id","학생코드","기존학생id","legacystudentid"]);
  const supportCol = findCol(headers, ["희망지원유형","지원유형","지원형태","preferredsupporttype"]);
  const activeCol = findCol(headers, ["활성","활성상태","상태","active"]);

  if ([schoolCol,typeCol,gradeCol,classCol,nameCol].some(x=>x<0)) {
    return json(req, {
      ok:false,
      message:"필수 열을 찾지 못했습니다. 학교, 학교급, 학년, 반, 학생명 열이 필요합니다.",
      detected_headers:headers,
    }, 400);
  }

  const { data:schools, error:schoolError } = await admin
    .from("schools").select("id,legacy_school_code,name,active").eq("active",true);
  if (schoolError) return json(req, { ok:false, message:"학교 기본정보를 불러오지 못했습니다." }, 500);

  const schoolMap = new Map<string, any[]>();
  for (const school of schools || []) {
    for (const key of [normSchool(school.name), normSchool(school.legacy_school_code)]) {
      if (!key) continue;
      const arr = schoolMap.get(key) || [];
      arr.push(school);
      schoolMap.set(key,arr);
    }
  }

  let existing: any[];
  try { existing = await allStudents(admin); }
  catch { return json(req, { ok:false, message:"기존 학생 중복정보를 확인하지 못했습니다." }, 500); }

  const legacySet = new Set(existing.filter(x=>x.legacy_student_id).map(x=>String(x.legacy_student_id)));
  const naturalSet = new Set(existing.filter(x=>x.active).map(x=>
    [x.school_id,String(x.full_name||"").trim(),x.grade,x.class_no].join("|")
  ));

  const source = raw.slice(1,MAX_ROWS+1);
  const fileKeys = new Map<string,number>();
  const pre = source.map((r,index)=>{
    const schoolRaw=str(r[schoolCol]);
    const matches=schoolMap.get(normSchool(schoolRaw))||[];
    const st=schoolType(r[typeCol]);
    const grade=intVal(r[gradeCol]);
    const classNo=intVal(r[classCol]);
    const fullName=str(r[nameCol]);
    const alias=aliasCol>=0?str(r[aliasCol]):"";
    const legacy=legacyCol>=0?str(r[legacyCol]):"";
    const support=supportCol>=0?supportType(r[supportCol]):"coach";
    const active=activeCol>=0?activeVal(r[activeCol]):true;
    const school=matches.length===1?matches[0]:null;
    const key=school&&fullName&&grade&&classNo?[school.id,fullName,grade,classNo].join("|"):"";
    if(key) fileKeys.set(key,(fileKeys.get(key)||0)+1);
    return {index,schoolRaw,matches,school,st,grade,classNo,fullName,alias,legacy,support,active,key};
  });

  const rows=pre.map(x=>{
    let status="valid", message="등록 가능";
    if(!x.schoolRaw) { status="error"; message="학교 누락"; }
    else if(x.matches.length===0) { status="school_missing"; message="등록된 학교를 찾을 수 없음"; }
    else if(x.matches.length>1) { status="school_ambiguous"; message="동일 학교명/코드가 여러 개임"; }
    else if(!x.st) { status="error"; message="학교급 값 오류"; }
    else if(x.grade===null || x.grade<1 || (x.st==="초"&&x.grade>6) || (["중","고"].includes(x.st)&&x.grade>3) || (["특수","기타"].includes(x.st)&&x.grade>12)) {
      status="error"; message="학년 범위 오류";
    } else if(x.classNo===null || x.classNo<1 || x.classNo>99) {
      status="error"; message="반 범위 오류";
    } else if(!x.fullName) { status="error"; message="학생명 누락"; }
    else if(!x.support) { status="error"; message="희망 지원유형 오류"; }
    else if(x.active===null) { status="error"; message="활성상태 값 오류"; }
    else if(x.legacy && legacySet.has(x.legacy)) { status="duplicate"; message="기존 학생ID 중복"; }
    else if(x.key && (fileKeys.get(x.key)||0)>1) { status="duplicate_file"; message="파일 내 동일 학생 후보"; }
    else if(x.key && naturalSet.has(x.key)) { status="duplicate"; message="기존 동일 학교·학생명·학년·반 후보"; }

    return {
      row_number:x.index+2,
      school:x.school?.name||x.schoolRaw,
      school_id:x.school?.id||null,
      school_type:x.st,
      grade:x.grade,
      class_no:x.classNo,
      full_name:x.fullName,
      alias:x.alias||null,
      legacy_student_id:x.legacy||null,
      preferred_support_type:x.support,
      active:x.active,
      status,
      message,
    };
  });

  return json(req, {
    ok:true,
    filename:file.name,
    total:rows.length,
    valid:rows.filter(r=>r.status==="valid").length,
    invalid:rows.filter(r=>r.status!=="valid").length,
    truncated:raw.length-1>MAX_ROWS,
    rows,
  });
});
