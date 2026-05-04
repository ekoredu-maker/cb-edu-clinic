
:root{
  --primary:#6366f1; --primary-dark:#4f46e5; --purple:#8b5cf6;
  --success:#10b981; --warning:#f59e0b; --danger:#ef4444; --info:#06b6d4;
  --bg:#f8fafc; --card:#ffffff; --border:#e2e8f0;
  --text:#0f172a; --muted:#64748b;
  --shadow-sm:0 1px 3px rgba(0,0,0,.08);
  --shadow:0 4px 12px rgba(0,0,0,.08);
  --shadow-lg:0 10px 25px rgba(0,0,0,.12);
  --radius:12px;
}
*{box-sizing:border-box; margin:0; padding:0}
html,body{height:100%}
body{
  font-family:'Pretendard',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
  background:var(--bg); color:var(--text); font-size:14px; line-height:1.5;
  -webkit-font-smoothing:antialiased;
}

/* Login Overlay */
#login-overlay{
  position:fixed; inset:0; background:linear-gradient(135deg,#6366f1 0%,#8b5cf6 100%);
  display:flex; align-items:center; justify-content:center; z-index:9999;
}
.login-card{
  background:#fff; padding:40px; border-radius:20px; box-shadow:var(--shadow-lg);
  width:360px; text-align:center;
}
.login-card h1{font-size:24px; color:var(--primary); margin-bottom:8px}
.login-card p{color:var(--muted); margin-bottom:24px; font-size:13px}
.login-card input{
  width:100%; padding:14px; border:2px solid var(--border); border-radius:10px;
  font-size:16px; text-align:center; letter-spacing:4px; margin-bottom:16px;
}
.login-card input:focus{outline:none; border-color:var(--primary)}
.login-card button{
  width:100%; padding:14px; background:var(--primary); color:#fff; border:none;
  border-radius:10px; font-size:15px; font-weight:600; cursor:pointer;
}
.login-card button:hover{background:var(--primary-dark)}

/* Header */
.header{
  background:#fff; padding:16px 24px; border-bottom:1px solid var(--border);
  display:flex; justify-content:space-between; align-items:center;
  position:sticky; top:0; z-index:100; box-shadow:var(--shadow-sm);
}
.header-left h1{font-size:18px; color:var(--text); margin-bottom:2px}
.header-left .sub{font-size:12px; color:var(--muted)}
.header-right{display:flex; gap:8px; align-items:center}
.badge-storage{
  padding:4px 10px; border-radius:20px; font-size:11px; font-weight:600;
  background:#ecfdf5; color:#059669; border:1px solid #a7f3d0;
}
.badge-storage.ls{background:#fffbeb; color:#b45309; border-color:#fde68a}

/* Tabs */
.tabs{
  background:#fff; padding:0 24px; border-bottom:1px solid var(--border);
  display:flex; gap:4px; overflow-x:auto; position:sticky; top:65px; z-index:99;
}
.nav-btn{
  padding:14px 18px; background:none; border:none; border-bottom:3px solid transparent;
  font-size:14px; font-weight:500; color:var(--muted); cursor:pointer; white-space:nowrap;
  transition:all .2s;
}
.nav-btn:hover{color:var(--text); background:#f1f5f9}
.nav-btn.active{color:var(--primary); border-bottom-color:var(--primary); font-weight:600}

/* Content */
.container{padding:24px; max-width:1400px; margin:0 auto}
.tab-content{display:none}
.tab-content.active{display:block}
.panel{background:#fff; border-radius:var(--radius); padding:24px; box-shadow:var(--shadow-sm); margin-bottom:16px}
.panel-header{display:flex; justify-content:space-between; align-items:center; margin-bottom:20px; flex-wrap:wrap; gap:12px}
.panel-title{font-size:16px; font-weight:600; color:var(--text)}
.panel-title .ico{margin-right:6px}

/* Buttons */
.btn{
  padding:8px 16px; border:none; border-radius:8px; cursor:pointer; font-size:13px;
  font-weight:500; transition:all .15s; display:inline-flex; align-items:center; gap:6px;
}
.btn:hover{transform:translateY(-1px); box-shadow:var(--shadow-sm)}
.btn:active{transform:translateY(0)}
.btn-primary{background:var(--primary); color:#fff}
.btn-primary:hover{background:var(--primary-dark)}
.btn-success{background:var(--success); color:#fff}
.btn-warning{background:var(--warning); color:#fff}
.btn-danger{background:var(--danger); color:#fff}
.btn-info{background:var(--info); color:#fff}
.btn-outline{background:#fff; color:var(--text); border:1px solid var(--border)}
.btn-outline:hover{background:#f8fafc}
.btn-sm{padding:4px 10px; font-size:12px}
.btn-xs{padding:2px 8px; font-size:11px}

/* Forms */
.form-grid{display:grid; grid-template-columns:repeat(auto-fit,minmax(200px,1fr)); gap:12px; margin-bottom:16px}
.form-group label{display:block; font-size:12px; color:var(--muted); margin-bottom:4px; font-weight:500}
.form-group input, .form-group select, .form-group textarea{
  width:100%; padding:9px 12px; border:1px solid var(--border); border-radius:8px;
  font-size:13px; font-family:inherit; background:#fff;
}
.form-group input:focus, .form-group select:focus, .form-group textarea:focus{
  outline:none; border-color:var(--primary); box-shadow:0 0 0 3px rgba(99,102,241,.1);
}
.form-row{display:flex; gap:8px; align-items:flex-end; flex-wrap:wrap}
.chk-group{display:flex; flex-wrap:wrap; gap:8px}
.chk-group label{
  display:inline-flex; align-items:center; gap:4px; padding:4px 10px;
  border:1px solid var(--border); border-radius:20px; font-size:12px; cursor:pointer; background:#fff;
}
.chk-group input[type=checkbox]{margin:0}
.chk-group label:has(input:checked){background:#eef2ff; border-color:var(--primary); color:var(--primary)}

/* Tables */
.tbl{width:100%; border-collapse:collapse; font-size:13px}
.tbl th{
  background:#f8fafc; padding:10px 12px; text-align:left; font-weight:600;
  color:var(--muted); border-bottom:1px solid var(--border); font-size:12px;
  position:sticky; top:0;
}
.tbl td{padding:10px 12px; border-bottom:1px solid #f1f5f9; vertical-align:middle}
.tbl tr:hover{background:#f8fafc}
.tbl .center{text-align:center}
.tbl-wrap{overflow-x:auto; border:1px solid var(--border); border-radius:8px}
.tbl-search{margin-bottom:12px; display:flex; gap:8px; flex-wrap:wrap; align-items:center}
.tbl-search input{padding:8px 12px; border:1px solid var(--border); border-radius:8px; font-size:13px; flex:1; min-width:200px}

/* Stats Cards */
.stats-grid{display:grid; grid-template-columns:repeat(auto-fit,minmax(160px,1fr)); gap:12px; margin-bottom:20px}
.stat-card{
  background:linear-gradient(135deg,#fff,#f8fafc); padding:16px;
  border:1px solid var(--border); border-radius:var(--radius); text-align:center;
}
.stat-card .num{font-size:26px; font-weight:700; color:var(--primary); margin:6px 0}
.stat-card .lbl{font-size:12px; color:var(--muted)}

/* Badge */
.badge{display:inline-block; padding:2px 8px; border-radius:12px; font-size:11px; font-weight:600}
.bg-no{background:#fef3c7; color:#b45309}
.bg-yes{background:#d1fae5; color:#059669}
.bg-info{background:#dbeafe; color:#1e40af}
.bg-danger{background:#fee2e2; color:#b91c1c}
.bg-purple{background:#ede9fe; color:#6d28d9}

/* Drag & Drop */
.dd-container{display:grid; grid-template-columns:1fr 1fr 1fr; gap:16px; margin-top:16px}
.dd-col{background:#f8fafc; border:2px dashed var(--border); border-radius:var(--radius); padding:12px; min-height:300px}
.dd-header{font-weight:600; padding:8px 4px 12px; font-size:13px; display:flex; justify-content:space-between; align-items:center}
.dd-list{min-height:240px}
.dd-card{
  background:#fff; padding:10px 12px; margin-bottom:8px; border-radius:8px;
  cursor:grab; box-shadow:var(--shadow-sm); border:1px solid var(--border); font-size:12px;
}
.dd-card:active{cursor:grabbing}
.dd-card:hover{box-shadow:var(--shadow); transform:translateY(-1px)}
.drop-target{background:#eef2ff !important; border-color:var(--primary) !important}
.conflict{background:#fef2f2 !important; border-color:var(--danger) !important}

/* Toast */
#toast-container{position:fixed; top:20px; right:20px; z-index:10000; display:flex; flex-direction:column; gap:8px}
.toast{
  background:#0f172a; color:#fff; padding:12px 20px; border-radius:8px;
  box-shadow:var(--shadow-lg); font-size:13px; min-width:200px;
  animation:slideIn .2s ease-out; display:flex; align-items:center; gap:8px;
}
.toast.success{background:var(--success)}
.toast.warning{background:var(--warning)}
.toast.danger{background:var(--danger)}
.toast.info{background:var(--info)}
@keyframes slideIn{from{transform:translateX(100%); opacity:0} to{transform:translateX(0); opacity:1}}

/* Modal */
.modal-bg{position:fixed; inset:0; background:rgba(15,23,42,.5); z-index:5000; display:none; align-items:center; justify-content:center; padding:20px}
.modal-bg.show{display:flex}
.modal{
  background:#fff; border-radius:var(--radius); padding:24px; max-width:600px; width:100%;
  max-height:90vh; overflow-y:auto; box-shadow:var(--shadow-lg);
}
.modal-header{display:flex; justify-content:space-between; align-items:center; margin-bottom:16px; padding-bottom:12px; border-bottom:1px solid var(--border)}
.modal-title{font-size:16px; font-weight:600}
.modal-close{background:none; border:none; font-size:24px; color:var(--muted); cursor:pointer}

/* Schedule picker */
.slot-list{display:flex; flex-direction:column; gap:6px; margin-top:8px}
.slot-item{
  display:flex; gap:6px; align-items:center; padding:6px 8px;
  background:#f8fafc; border:1px solid var(--border); border-radius:6px;
}
.slot-item select, .slot-item input{padding:4px 8px; font-size:12px}
.slot-item .rm{padding:2px 8px; background:var(--danger); color:#fff; border:none; border-radius:4px; cursor:pointer; font-size:11px}

/* Pivot tables */
.pivot-tbl{width:100%; border-collapse:collapse; font-size:12px; margin-top:12px}
.pivot-tbl th, .pivot-tbl td{border:1px solid #cbd5e1; padding:6px 8px; text-align:center}
.pivot-tbl th{background:#e0e7ff; color:var(--primary-dark); font-weight:600}
.pivot-tbl td.label{background:#f8fafc; font-weight:500; text-align:left}
.pivot-tbl tr.total{background:#f1f5f9; font-weight:700}
.pivot-title{text-align:center; font-size:14px; font-weight:700; padding:10px; background:var(--primary); color:#fff; border-radius:8px 8px 0 0}
.pivot-sub{font-size:11px; color:#cbd5e1}

/* Virtual scroll */
.vscroll-wrap{height:500px; overflow-y:auto; border:1px solid var(--border); border-radius:8px; background:#fff}
.vscroll-inner{position:relative}

/* Responsive */
@media (max-width:768px){
  .dd-container{grid-template-columns:1fr}
  .header{flex-direction:column; align-items:flex-start; gap:8px}
  .form-grid{grid-template-columns:1fr}
}

/* Print */
@media print{
  .header, .tabs, #toast-container, .no-print{display:none !important}
  .panel{box-shadow:none; border:none; padding:0}
  body{background:#fff}
}

footer{text-align:center; padding:20px; color:var(--muted); font-size:12px}


/* ========== 관리부 (출석부) 스타일 ========== */
.mgr-book{background:#fff; padding:24px; border:1px solid var(--border); border-radius:8px; margin-bottom:16px}
.mgr-title{text-align:center; font-size:20px; font-weight:700; margin-bottom:16px}
.mgr-meta{display:flex; gap:24px; margin:8px 0; font-size:13px; flex-wrap:wrap}
.mgr-tbl{width:100%; border-collapse:collapse; font-size:11px; margin-top:12px}
.mgr-tbl th{background:#f1f5f9; border:1px solid #cbd5e1; padding:6px 4px; text-align:center}
.mgr-tbl td{border:1px solid #cbd5e1; padding:4px; text-align:center; height:32px}
.mgr-tbl tfoot td{background:#f8fafc; font-size:12px}
.mgr-d{width:3%} .mgr-w{width:4%} .mgr-sc{width:12%} .mgr-t{width:11%} .mgr-stu{width:8%}
.page-break{page-break-after:always; height:0}
@media print{
  body * {visibility:hidden}
  #mgr-book-area, #mgr-book-area *, #form-preview, #form-preview * {visibility:visible}
  #mgr-book-area, #form-preview {position:absolute; left:0; top:0; width:100%}
  .no-print, .nav, header, footer, #toast-container {display:none !important}
  .mgr-book{border:none; padding:0; page-break-inside:avoid}
}


/* ========== 시간표 그리드 스타일 ========== */
.tt-wrap{background:#fff;padding:20px;border-radius:8px;border:1px solid #e5e7eb;margin-bottom:20px;page-break-after:always}
.tt-wrap:last-child{page-break-after:auto}
.tt-title{font-size:20px;font-weight:700;text-align:center;margin-bottom:6px;color:#111827}
.tt-meta{text-align:center;color:#6b7280;font-size:13px;margin-bottom:14px}
.tt-meta span{margin:0 10px}
.tt-grid{width:100%;border-collapse:collapse;table-layout:fixed;font-size:11px}
.tt-grid th,.tt-grid td{border:1px solid #cbd5e1;padding:2px;vertical-align:top;height:28px}
.tt-grid th{background:#f1f5f9;color:#334155;text-align:center;font-weight:600;padding:6px 2px}
.tt-grid td.tt-time{background:#f8fafc;text-align:center;color:#64748b;font-weight:600;font-size:10px;width:56px}
.tt-grid td.tt-empty{background:#fff}
.tt-slot{background:#6366f1;color:#fff;padding:3px 5px;border-radius:4px;font-size:10px;line-height:1.3;margin:1px 0;display:block;overflow:hidden;text-overflow:ellipsis}
.tt-slot.color-0{background:#6366f1}
.tt-slot.color-1{background:#10b981}
.tt-slot.color-2{background:#f59e0b}
.tt-slot.color-3{background:#ef4444}
.tt-slot.color-4{background:#8b5cf6}
.tt-slot.color-5{background:#0ea5e9}
.tt-slot.color-6{background:#ec4899}
.tt-slot.color-7{background:#14b8a6}
.tt-slot.color-8{background:#f97316}
.tt-slot .s-nm{font-weight:700}
.tt-slot .s-sub{opacity:.9;font-size:9px}
.tt-legend{margin-top:10px;font-size:11px;color:#64748b;display:flex;gap:14px;flex-wrap:wrap}
.tt-legend .lg-box{display:inline-block;width:12px;height:12px;border-radius:3px;margin-right:4px;vertical-align:middle}
.tt-summary{margin-top:12px;padding:10px;background:#f8fafc;border-radius:6px;font-size:12px;color:#334155}
.tt-summary b{color:#111827}
@media print{
  .tt-wrap{box-shadow:none;border:1px solid #000;padding:12px}
  @page{size:A4 landscape;margin:8mm}
}


/* V9.9 차트 그리드 */
.chart-grid{display:grid; grid-template-columns:repeat(auto-fit,minmax(380px,1fr)); gap:16px}
.chart-box{background:#fff; border:1px solid var(--border); border-radius:10px; padding:16px; min-height:280px; display:flex; flex-direction:column}
.chart-box canvas{flex:1; max-height:280px}
.chart-title{font-size:13px; font-weight:600; color:var(--text); margin-bottom:8px}

/* V9.9 서브탭 (tab 내부) */
.subtabs{display:flex; gap:0; border-bottom:2px solid var(--border); margin-bottom:16px; overflow-x:auto}
.subtab-btn{padding:10px 16px; background:none; border:none; border-bottom:3px solid transparent; cursor:pointer;
  font-size:13px; font-weight:500; color:var(--muted); white-space:nowrap; transition:.2s}
.subtab-btn:hover{color:var(--text); background:#f8fafc}
.subtab-btn.active{color:var(--primary); border-bottom-color:var(--primary); font-weight:600}
.subtab-content{display:none}
.subtab-content.active{display:block}

/* V9.9 인라인 편집 (이름 hover) */
.name-edit{cursor:pointer; text-decoration:none; border-bottom:1px dashed transparent; transition:.15s}
.name-edit:hover{color:var(--primary); border-bottom-color:var(--primary)}

/* V9.9 지급 명세서 */
.pay-doc{background:#fff; padding:28px; border:1px solid var(--border); border-radius:8px; margin-bottom:16px; font-family:"Pretendard",sans-serif}
.pay-title{text-align:center; font-size:22px; font-weight:700; margin-bottom:20px; border-bottom:2px solid #1f2937; padding-bottom:10px}
.pay-meta{display:flex; justify-content:space-between; font-size:13px; margin-bottom:16px; flex-wrap:wrap; gap:8px}
.pay-tbl{width:100%; border-collapse:collapse; font-size:12px; margin-top:8px}
.pay-tbl th,.pay-tbl td{border:1px solid #cbd5e1; padding:6px 8px; text-align:center}
.pay-tbl th{background:#f1f5f9; font-weight:600}
.pay-tbl td.al{text-align:left} .pay-tbl td.ar{text-align:right}
.pay-tbl tfoot td{background:#f8fafc; font-weight:600}
.pay-tbl .subhead td{background:#e0e7ff; font-weight:600; color:#3730a3}
.pay-sum{margin-top:16px; padding:14px; background:#f8fafc; border-radius:8px}
.pay-sum .row{display:flex; justify-content:space-between; padding:4px 0; font-size:13px}
.pay-sum .total{border-top:2px solid #1f2937; padding-top:10px; margin-top:8px; font-weight:700; font-size:16px; color:var(--primary)}
.pay-note{font-size:11px; color:var(--muted); margin-top:12px; padding-top:8px; border-top:1px dashed var(--border)}

/* V9.9 출장 증빙 */
.travel-doc{background:#fff; padding:28px; border:1px solid var(--border); border-radius:8px}
.travel-doc h2{text-align:center; font-size:20px; margin-bottom:16px; border-bottom:2px solid #1f2937; padding-bottom:8px}

/* V9.9 수업협력 카드 */
.cls-grid{display:grid; grid-template-columns:repeat(auto-fill, minmax(280px,1fr)); gap:12px}
.cls-card{background:#fff; border:1px solid var(--border); border-radius:8px; padding:14px}
.cls-card .hd{display:flex; justify-content:space-between; align-items:center; margin-bottom:8px}
.cls-card .stf{color:var(--primary); font-weight:600}