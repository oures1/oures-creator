import { useState, useEffect, useCallback, useRef } from "react";
import {
  Send, Plus, Link, ChevronDown, X, ImagePlus, Film, Copy,
  Package, Camera, Lightbulb, Bell, Clock, CheckCircle2, XCircle,
  CircleDot, Truck, AlertCircle, RefreshCw, Loader
} from "lucide-react";

// ─── Supabase Config ───
// ★ ここにあなたのSupabase情報を入れてください
const SUPABASE_URL = "https://ucjagrgktzuehtvofped.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVjamFncmdrdHp1ZWh0dm9mcGVkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIwMjkyOTIsImV4cCI6MjA4NzYwNTI5Mn0.PHwbgXquwKpeMutcAhzTIIHioTuUzrItNu9kxhS57ko";

// ─── Supabase Client (lightweight, no SDK needed) ───
const supabase = {
  _token: null,
  _user: null,

  _headers() {
    const h = {
      "Content-Type": "application/json",
      "apikey": SUPABASE_ANON_KEY,
    };
    if (this._token) h["Authorization"] = `Bearer ${this._token}`;
    return h;
  },

  _translateError(msg) {
    if (!msg) return "エラーが発生しました";
    const m = msg.toLowerCase();
    if (m.includes("user already registered")) return "このメールアドレスは既に登録されています";
    if (m.includes("invalid login credentials")) return "メールアドレスまたはパスワードが正しくありません";
    if (m.includes("email rate limit exceeded") || m.includes("rate limit")) return "しばらく時間を置いてから再度お試しください";
    if (m.includes("password") && m.includes("at least")) return "パスワードは6文字以上で入力してください";
    if (m.includes("invalid email")) return "メールアドレスの形式が正しくありません";
    if (m.includes("signup is disabled")) return "現在新規登録を受け付けていません";
    if (m.includes("email not confirmed")) return "メールアドレスが確認されていません";
    if (m.includes("duplicate key") || m.includes("already exists")) return "このデータは既に登録されています";
    if (m.includes("violates row level security")) return "権限エラーが発生しました";
    if (m.includes("network") || m.includes("fetch")) return "通信エラーが発生しました。インターネット接続を確認してください";
    return msg;
  },

  async _fetch(path, opts = {}) {
    const res = await fetch(`${SUPABASE_URL}${path}`, {
      ...opts,
      headers: { ...this._headers(), ...opts.headers },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: res.statusText }));
      const rawMsg = err.message || err.error_description || err.msg || "Error";
      throw new Error(this._translateError(rawMsg));
    }
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  },

  // Auth
  async signUp(email, password) {
    const data = await this._fetch("/auth/v1/signup", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    if (data?.access_token) {
      this._token = data.access_token;
      this._user = data.user;
    }
    return data;
  },

  async signIn(email, password) {
    const data = await this._fetch("/auth/v1/token?grant_type=password", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    if (data?.access_token) {
      this._token = data.access_token;
      this._user = data.user;
    }
    return data;
  },

  async signOut() {
    try { await this._fetch("/auth/v1/logout", { method: "POST" }); } catch {}
    this._token = null;
    this._user = null;
  },

  async resetPasswordForEmail(email, redirectTo) {
    return await this._fetch("/auth/v1/recover", {
      method: "POST",
      body: JSON.stringify({ email, gotrue_meta_security: { captcha_token: "" } }),
      headers: redirectTo ? { "redirect_to": redirectTo } : {},
    });
  },

  async updateUser(updates) {
    return await this._fetch("/auth/v1/user", {
      method: "PUT",
      body: JSON.stringify(updates),
    });
  },

  async getSession() {
    const token = localStorage.getItem("sb_token");
    if (!token) return null;
    try {
      const data = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
        headers: { "apikey": SUPABASE_ANON_KEY, "Authorization": `Bearer ${token}` },
      });
      if (!data.ok) { localStorage.removeItem("sb_token"); return null; }
      const user = await data.json();
      this._token = token;
      this._user = user;
      return { token, user };
    } catch { return null; }
  },

  saveToken() { if (this._token) localStorage.setItem("sb_token", this._token); },
  clearToken() { localStorage.removeItem("sb_token"); },

  // DB
  async from(table) {
    return {
      _table: table,
      _url: `/rest/v1/${table}`,
      _params: new URLSearchParams(),
      _supabase: supabase,

      select(cols = "*") { this._params.set("select", cols); this._method = "GET"; return this; },
      insert(data) { this._body = JSON.stringify(data); this._method = "POST"; this._extraHeaders = { "Prefer": "return=representation" }; return this; },
      update(data) { this._body = JSON.stringify(data); this._method = "PATCH"; this._extraHeaders = { "Prefer": "return=representation" }; return this; },
      delete() { this._method = "DELETE"; return this; },
      eq(col, val) { this._params.append(col, `eq.${val}`); return this; },
      order(col, { ascending = true } = {}) { this._params.set("order", `${col}.${ascending ? "asc" : "desc"}`); return this; },

      async execute() {
        const url = `${this._url}?${this._params.toString()}`;
        return supabase._fetch(url, {
          method: this._method || "GET",
          body: this._body,
          headers: this._extraHeaders || {},
        });
      },
    };
  },

  // Storage
  async uploadFile(bucket, path, file) {
    const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${bucket}/${path}`, {
      method: "POST",
      headers: {
        "apikey": SUPABASE_ANON_KEY,
        "Authorization": `Bearer ${this._token}`,
        "Content-Type": file.type,
      },
      body: file,
    });
    if (!res.ok) throw new Error("Upload failed");
    return `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${path}`;
  },

  getFileUrl(bucket, path) {
    return `${SUPABASE_URL}/storage/v1/object/authenticated/${bucket}/${path}?token=${this._token}`;
  },
};

// ─── DB helper (simplifies query builder) ───
const db = {
  async select(table, filters = {}, order = null) {
    let q = (await supabase.from(table)).select();
    Object.entries(filters).forEach(([k, v]) => q = q.eq(k, v));
    if (order) q = q.order(order.col, { ascending: order.asc ?? false });
    return q.execute();
  },
  async insert(table, data) {
    return (await supabase.from(table)).insert(data).execute();
  },
  async update(table, filters, data) {
    let q = (await supabase.from(table)).update(data);
    Object.entries(filters).forEach(([k, v]) => q = q.eq(k, v));
    return q.execute();
  },
};

// ─── Helpers ───
const uid = () => Math.random().toString(36).slice(2, 8);
const today = () => new Date().toISOString().split("T")[0];
const fmt = (d) => d ? d.slice(0, 10).replace(/-/g, ".") : "";

// Status configs
const proposalStatus = { new: "確認中", accepted: "採用", rejected: "不採用" };
const proposalColor = { new: "#C48A1A", accepted: "#2E7D5B", rejected: "#C0392B" };

const sampleStatus = { requested: "サンプル依頼中", preparing: "手配中", shipped: "発送済", rejected: "却下" };
const sampleColor = { requested: "#C48A1A", preparing: "#7C5CBF", shipped: "#2E7D5B", rejected: "#C0392B" };
const sampleIcon = { requested: Clock, shipped: CheckCircle2, preparing: Package, rejected: XCircle };

const MIN_FILES = 3;
const mediaStatusLabels = { none: "未アップロード", short: "素材不足", uploaded: "アップロード済み", resubmit: "再提出" };
const mediaColor = { none: "#C0392B", short: "#C48A1A", uploaded: "#2E7D5B", resubmit: "#D35400" };
const mediaIcon = { none: AlertCircle, short: AlertCircle, uploaded: CheckCircle2, resubmit: RefreshCw };

// ─── Theme ───
const C = { bg: "#FAF9F7", tx: "#1A1A1A", sub: "#888", bdr: "#E5E5E5", light: "#F5F4F0" };

function getMediaStatusFromData(files, statusRecord) {
  if (statusRecord?.status === "resubmit") return "resubmit";
  if (!files || files.length === 0) return "none";
  if (files.length < MIN_FILES) return "short";
  return "uploaded";
}

// ─── Shared Components ───
function CopyBtn({ text }) {
  const [copied, setCopied] = useState(false);
  const handle = () => {
    try {
      const ta = document.createElement("textarea");
      ta.value = text; ta.style.position = "fixed"; ta.style.left = "-9999px";
      document.body.appendChild(ta); ta.select(); document.execCommand("copy");
      document.body.removeChild(ta);
      setCopied(true); setTimeout(() => setCopied(false), 1500);
    } catch { window.prompt("コピーしてください:", text); }
  };
  return (
    <button onClick={handle} style={{
      background: copied ? "#2E7D5B14" : "none", border: `1px solid ${copied ? "#2E7D5B40" : C.bdr}`,
      borderRadius: 6, padding: "5px 10px", cursor: "pointer",
      display: "flex", alignItems: "center", gap: 4, transition: "all 0.2s", flexShrink: 0,
    }}>
      {copied ? <CheckCircle2 size={13} color="#2E7D5B" /> : <Copy size={13} color={C.sub} />}
      <span style={{ fontSize: 11, fontWeight: 600, color: copied ? "#2E7D5B" : C.sub }}>{copied ? "コピー済み" : "コピー"}</span>
    </button>
  );
}

function Nav({ page, set }) {
  const tabs = [
    { id: "proposals", label: "提案", icon: Lightbulb },
    { id: "products", label: "商品選択", icon: Package },
    { id: "media", label: "素材", icon: Camera },
  ];
  return (
    <nav style={{
      position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 100,
      background: "#fff", borderTop: `1px solid ${C.bdr}`,
      display: "flex", padding: "6px 0 env(safe-area-inset-bottom, 8px)",
    }}>
      {tabs.map(({ id, label, icon: Icon }) => (
        <button key={id} onClick={() => set(id)} style={{
          flex: 1, background: "none", border: "none", cursor: "pointer",
          display: "flex", flexDirection: "column", alignItems: "center", gap: 3,
          color: page === id ? C.tx : "#c0c0c0", paddingTop: 4,
        }}>
          <Icon size={18} strokeWidth={page === id ? 2.2 : 1.5} />
          <span style={{ fontSize: 10, fontWeight: page === id ? 700 : 400 }}>{label}</span>
        </button>
      ))}
    </nav>
  );
}

function Top({ title, sub, right }) {
  return (
    <div style={{ padding: "20px 20px 14px", borderBottom: `1px solid ${C.bdr}`, background: "#fff" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: C.tx, letterSpacing: "-0.02em" }}>{title}</h1>
          {sub && <p style={{ margin: "3px 0 0", fontSize: 12, color: C.sub }}>{sub}</p>}
        </div>
        {right}
      </div>
    </div>
  );
}

function Inp({ label, required, ...p }) {
  return (
    <div style={{ marginBottom: 12 }}>
      {label && (
        <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: C.sub, marginBottom: 4, fontWeight: 600 }}>
          {label}{required && <span style={{ color: "#C0392B", fontSize: 10 }}>*</span>}
        </label>
      )}
      <input {...p} style={{
        width: "100%", padding: "10px 12px", borderRadius: 8,
        border: `1px solid ${C.bdr}`, background: "#FAFAFA",
        color: C.tx, fontSize: 15, outline: "none", boxSizing: "border-box", ...p.style,
      }} />
    </div>
  );
}

function Btn({ children, ghost, small, icon: Icon, disabled, ...p }) {
  return (
    <button {...p} disabled={disabled} style={{
      padding: small ? "7px 14px" : "12px 16px", borderRadius: 8,
      fontSize: small ? 12 : 14, fontWeight: 600, cursor: disabled ? "not-allowed" : "pointer",
      border: ghost ? `1px solid ${C.bdr}` : "none",
      background: ghost ? "#fff" : C.tx, color: ghost ? C.tx : "#fff",
      width: small ? "auto" : "100%", opacity: disabled ? 0.5 : 1,
      display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
      ...p.style,
    }}>
      {Icon && <Icon size={small ? 14 : 16} />}
      {children}
    </button>
  );
}

function Tag({ text, color }) {
  return <span style={{ padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600, color, background: color + "14", whiteSpace: "nowrap" }}>{text}</span>;
}

function StatusGrid({ stats, filter, setFilter }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${stats.length}, 1fr)`, gap: 5, marginBottom: 14 }}>
      {stats.map(s => {
        const Icon = s.icon;
        return (
          <button key={s.key} onClick={() => setFilter(s.key)} style={{
            background: filter === s.key ? s.color + "0C" : "#fff",
            border: filter === s.key ? `1.5px solid ${s.color}40` : `1px solid ${C.bdr}`,
            borderRadius: 12, padding: "8px 2px", cursor: "pointer",
            display: "flex", flexDirection: "column", alignItems: "center", gap: 3,
          }}>
            <Icon size={14} color={s.color} strokeWidth={filter === s.key ? 2.5 : 1.8} />
            <span style={{ fontSize: 17, fontWeight: 800, color: s.color, lineHeight: 1 }}>{s.count}</span>
            <span style={{ fontSize: 8, fontWeight: 600, color: filter === s.key ? s.color : C.sub }}>{s.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function Loading() {
  return (
    <div style={{ display: "flex", justifyContent: "center", padding: 40 }}>
      <Loader size={24} color={C.sub} style={{ animation: "spin 1s linear infinite" }} />
    </div>
  );
}

// ════════════════════════════════
//  1. PROPOSALS (Supabase連携)
// ════════════════════════════════
function Proposals({ userId }) {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [url, setUrl] = useState("");
  const [memo, setMemo] = useState("");
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("all");
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await db.select("proposals", { user_id: userId }, { col: "created_at", asc: false });
      setList(data || []);
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  const submit = async () => {
    if (!url.trim() || submitting) return;
    setSubmitting(true);
    try {
      await db.insert("proposals", { user_id: userId, url: url.trim(), memo: memo.trim() });
      setUrl(""); setMemo(""); setOpen(false);
      await load();
    } catch (e) { alert("送信エラー: " + e.message); }
    setSubmitting(false);
  };

  const filtered = filter === "all" ? list : list.filter(p => p.status === filter);
  const stats = [
    { key: "all", label: "全て", count: list.length, color: C.tx, icon: CircleDot },
    { key: "new", label: "確認中", count: list.filter(p => p.status === "new").length, color: "#C48A1A", icon: Clock },
    { key: "accepted", label: "採用", count: list.filter(p => p.status === "accepted").length, color: "#2E7D5B", icon: CheckCircle2 },
    { key: "rejected", label: "不採用", count: list.filter(p => p.status === "rejected").length, color: "#C0392B", icon: XCircle },
  ];

  return (
    <div>
      <Top title="参考商品の提案" sub={`${list.length}件`}
        right={!open && <Btn small icon={Plus} onClick={() => setOpen(true)}>提案</Btn>} />
      <div style={{ padding: "14px 16px 100px" }}>
        {open && (
          <div style={{ background: "#fff", borderRadius: 14, border: `1px solid ${C.bdr}`, padding: 16, marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <Link size={16} color={C.sub} />
              <input value={url} onChange={e => setUrl(e.target.value)} placeholder="参考URLを貼り付け" autoFocus
                style={{ flex: 1, padding: "10px 0", border: "none", background: "transparent", color: C.tx, fontSize: 15, outline: "none" }} />
            </div>
            <div style={{ borderTop: `1px solid ${C.bdr}`, paddingTop: 10, marginBottom: 12 }}>
              <input value={memo} onChange={e => setMemo(e.target.value)} placeholder="ひとことメモ（任意）"
                style={{ width: "100%", padding: "8px 0", border: "none", background: "transparent", color: C.tx, fontSize: 14, outline: "none", boxSizing: "border-box" }} />
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <Btn ghost onClick={() => { setOpen(false); setUrl(""); setMemo(""); }} style={{ flex: 1 }}>キャンセル</Btn>
              <Btn icon={submitting ? Loader : Send} onClick={submit} disabled={submitting} style={{ flex: 1, opacity: url.trim() && !submitting ? 1 : 0.4 }}>送信</Btn>
            </div>
          </div>
        )}

        {loading ? <Loading /> : <>
          {list.length > 0 && !open && <StatusGrid stats={stats} filter={filter} setFilter={setFilter} />}
          {!filtered.length && !open && <p style={{ textAlign: "center", padding: 60, color: C.sub, fontSize: 13 }}>{filter === "all" ? "提案はまだありません" : "該当なし"}</p>}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {filtered.map(p => (
              <div key={p.id} style={{
                background: "#fff", borderRadius: 14, padding: "12px 14px",
                border: `1px solid ${p.status === "new" ? "#C48A1A30" : C.bdr}`,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Link size={14} color={C.sub} style={{ flexShrink: 0 }} />
                  <a href={p.url} target="_blank" rel="noopener" style={{
                    color: C.tx, fontSize: 14, fontWeight: 600, flex: 1, minWidth: 0,
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textDecoration: "none",
                  }}>{p.url.replace(/^https?:\/\//, "")}</a>
                  <Tag text={proposalStatus[p.status]} color={proposalColor[p.status]} />
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4, paddingLeft: 22, overflow: "hidden" }}>
                  {p.memo && <span style={{ fontSize: 13, color: C.sub, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.memo}</span>}
                  <span style={{ marginLeft: "auto", fontSize: 11, color: "#aaa", flexShrink: 0 }}>{fmt(p.created_at)}</span>
                </div>
                {p.status === "accepted" && p.sku && (
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4, paddingLeft: 22 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: C.tx, fontFamily: "'SF Mono', 'Menlo', monospace" }}>{p.sku}</span>
                    <CopyBtn text={p.sku} />
                  </div>
                )}
              </div>
            ))}
          </div>
        </>}
      </div>
    </div>
  );
}

// ════════════════════════════════
//  2. PRODUCTS (Supabase連携)
// ════════════════════════════════
function Products({ userId, onGoMedia }) {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ sku: "", size: "", color: "", note: "" });
  const [errors, setErrors] = useState({});
  const [filter, setFilter] = useState("all");
  const [submitting, setSubmitting] = useState(false);
  const [mediaFiles, setMediaFiles] = useState({});
  const [mediaStatuses, setMediaStatuses] = useState({});

  const load = useCallback(async () => {
    try {
      const products = await db.select("products", { user_id: userId }, { col: "created_at", asc: false });
      setList(products || []);
      // Load media counts for shipped products
      const media = await db.select("media", { user_id: userId });
      const mStatuses = await db.select("media_status", { user_id: userId });
      const fileMap = {};
      (media || []).forEach(m => {
        if (!fileMap[m.product_id]) fileMap[m.product_id] = [];
        fileMap[m.product_id].push(m);
      });
      setMediaFiles(fileMap);
      const statusMap = {};
      (mStatuses || []).forEach(s => statusMap[s.product_id] = s);
      setMediaStatuses(statusMap);
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  const validate = () => {
    const e = {};
    if (!form.sku.trim()) e.sku = true;
    if (!form.size.trim()) e.size = true;
    if (!form.color.trim()) e.color = true;
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const register = async () => {
    if (!validate() || submitting) return;
    setSubmitting(true);
    try {
      await db.insert("products", {
        user_id: userId, sku: form.sku.trim(),
        size: form.size.trim(), color: form.color.trim(), note: form.note.trim(),
      });
      setOpen(false); setForm({ sku: "", size: "", color: "", note: "" }); setErrors({});
      await load();
    } catch (e) { alert("登録エラー: " + e.message); }
    setSubmitting(false);
  };

  const getMs = (productId) => getMediaStatusFromData(mediaFiles[productId], mediaStatuses[productId]);

  const needsMedia = list.filter(p => {
    if (p.sample_status !== "shipped") return false;
    const ms = getMs(p.id);
    return ms === "none" || ms === "short" || ms === "resubmit";
  });

  const filtered = filter === "all" ? list : list.filter(g => g.sample_status === filter);
  const stats = [
    { key: "all", label: "全て", count: list.length, color: C.tx, icon: CircleDot },
    { key: "requested", label: "依頼中", count: list.filter(g => g.sample_status === "requested").length, color: "#C48A1A", icon: Clock },
    { key: "preparing", label: "手配中", count: list.filter(g => g.sample_status === "preparing").length, color: "#7C5CBF", icon: Package },
    { key: "shipped", label: "発送済", count: list.filter(g => g.sample_status === "shipped").length, color: "#2E7D5B", icon: CheckCircle2 },
    { key: "rejected", label: "却下", count: list.filter(g => g.sample_status === "rejected").length, color: "#C0392B", icon: XCircle },
  ];

  return (
    <div>
      <Top title="商品選択" sub={`${list.length}件`}
        right={!open && <Btn small icon={Plus} onClick={() => setOpen(true)}>商品登録</Btn>} />
      <div style={{ padding: "14px 16px 100px" }}>
        {needsMedia.length > 0 && !open && (
          <div style={{
            background: "#FFF8ED", borderRadius: 12, padding: 14, marginBottom: 14,
            border: "1px solid #F0DFC0", display: "flex", gap: 12, alignItems: "flex-start",
          }}>
            <Bell size={18} color="#C48A1A" style={{ flexShrink: 0, marginTop: 1 }} />
            <div>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "#8B6914" }}>素材のアップロードをお願いします</p>
              {needsMedia.map(p => {
                const ms = getMs(p.id);
                return (
                  <div key={p.id} style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 6 }}>
                    <button onClick={() => onGoMedia(p.id)} style={{
                      background: "none", border: "none", cursor: "pointer", padding: 0,
                      fontSize: 13, color: "#C48A1A", fontWeight: 600, fontFamily: "'SF Mono', 'Menlo', monospace",
                      textDecoration: "underline", textUnderlineOffset: 3,
                    }}>{p.sku}</button>
                    {ms === "resubmit" && <Tag text="再提出" color="#D35400" />}
                    {ms === "short" && <Tag text="素材不足" color="#C48A1A" />}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {loading ? <Loading /> : <>
          {list.length > 0 && !open && <StatusGrid stats={stats} filter={filter} setFilter={setFilter} />}

          {open && (
            <div style={{ background: "#fff", borderRadius: 14, border: `1px solid ${C.bdr}`, padding: 16, marginBottom: 16 }}>
              <span style={{ fontSize: 14, fontWeight: 700, display: "block", marginBottom: 12 }}>この品番の商品を登録します</span>
              <div style={{ marginBottom: 12 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: C.sub, marginBottom: 4, fontWeight: 600 }}>
                  Shopify品番<span style={{ color: "#C0392B", fontSize: 10 }}>*</span>
                </label>
                <input value={form.sku} onChange={e => { setForm({ ...form, sku: e.target.value }); setErrors({ ...errors, sku: false }); }}
                  placeholder="AP-2026-0081"
                  style={{
                    width: "100%", padding: "10px 12px", borderRadius: 8,
                    border: `1px solid ${errors.sku ? "#C0392B" : C.bdr}`, background: "#FAFAFA",
                    color: C.tx, fontSize: 15, outline: "none", boxSizing: "border-box",
                    fontFamily: "'SF Mono', 'Menlo', monospace",
                  }} />
                {errors.sku && <span style={{ fontSize: 11, color: "#C0392B", marginTop: 2, display: "block" }}>品番を入力してください</span>}
              </div>
              <div style={{ borderTop: `1px solid ${C.bdr}`, marginTop: 4, paddingTop: 12 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: C.tx, display: "block", marginBottom: 10 }}>サンプル</span>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <div>
                    <Inp label="サイズ" required placeholder="F / M / L" value={form.size}
                      onChange={e => { setForm({ ...form, size: e.target.value }); setErrors({ ...errors, size: false }); }}
                      style={{ borderColor: errors.size ? "#C0392B" : C.bdr }} />
                    {errors.size && <span style={{ fontSize: 11, color: "#C0392B", marginTop: -8, display: "block", marginBottom: 8 }}>必須</span>}
                  </div>
                  <div>
                    <Inp label="カラー" required placeholder="ベージュ" value={form.color}
                      onChange={e => { setForm({ ...form, color: e.target.value }); setErrors({ ...errors, color: false }); }}
                      style={{ borderColor: errors.color ? "#C0392B" : C.bdr }} />
                    {errors.color && <span style={{ fontSize: 11, color: "#C0392B", marginTop: -8, display: "block", marginBottom: 8 }}>必須</span>}
                  </div>
                </div>
                <Inp label="備考" placeholder="着丈長め希望、2着希望 など" value={form.note}
                  onChange={e => setForm({ ...form, note: e.target.value })} />
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <Btn ghost onClick={() => { setOpen(false); setForm({ sku: "", size: "", color: "", note: "" }); setErrors({}); }} style={{ flex: 1 }}>キャンセル</Btn>
                <Btn icon={submitting ? Loader : Send} onClick={register} disabled={submitting} style={{ flex: 1 }}>登録・サンプル依頼</Btn>
              </div>
            </div>
          )}

          {!filtered.length && !open && <p style={{ textAlign: "center", padding: 60, color: C.sub, fontSize: 13 }}>{filter === "all" ? "商品がまだありません" : "該当なし"}</p>}

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {filtered.map(g => (
              <div key={g.id} style={{ background: "#fff", borderRadius: 14, padding: "12px 14px", border: `1px solid ${g.sample_status === "rejected" ? "#C0392B20" : C.bdr}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 15, fontWeight: 700, color: C.tx, fontFamily: "'SF Mono', 'Menlo', monospace" }}>{g.sku}</span>
                    <CopyBtn text={g.sku} />
                  </div>
                  <Tag text={sampleStatus[g.sample_status]} color={sampleColor[g.sample_status]} />
                </div>
                <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: C.sub, overflow: "hidden" }}>
                  <span style={{ fontWeight: 600, color: C.tx, flexShrink: 0 }}>{g.size} / {g.color}</span>
                  {g.note && <><span style={{ color: "#ddd" }}>—</span><span style={{ fontSize: 12, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{g.note}</span></>}
                  <span style={{ marginLeft: "auto", fontSize: 11, color: "#aaa", flexShrink: 0 }}>{fmt(g.created_at)}</span>
                </div>
              </div>
            ))}
          </div>

          {list.length > 0 && (
            <div style={{ textAlign: "center", marginTop: 20, padding: "14px 20px", background: C.light, borderRadius: 10 }}>
              <p style={{ margin: 0, fontSize: 12, color: C.sub, lineHeight: 1.6 }}>
                サンプル到着後は「素材」タブから<br />撮影した画像・動画をアップロードできます
              </p>
            </div>
          )}
        </>}
      </div>
    </div>
  );
}

// ════════════════════════════════
//  3. MEDIA (Supabase連携)
// ════════════════════════════════
function MediaPage({ userId, initialOpen }) {
  const [products, setProducts] = useState([]);
  const [mediaFiles, setMediaFiles] = useState({});
  const [mediaStatuses, setMediaStatuses] = useState({});
  const [loading, setLoading] = useState(true);
  const [selProduct, setSelProduct] = useState(initialOpen || "");
  const [showPicker, setShowPicker] = useState(false);
  const [filter, setFilter] = useState("all");
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async () => {
    try {
      const prods = await db.select("products", { user_id: userId }, { col: "created_at", asc: false });
      setProducts(prods || []);
      const media = await db.select("media", { user_id: userId });
      const mStatuses = await db.select("media_status", { user_id: userId });
      const fileMap = {};
      (media || []).forEach(m => {
        if (!fileMap[m.product_id]) fileMap[m.product_id] = [];
        fileMap[m.product_id].push(m);
      });
      setMediaFiles(fileMap);
      const statusMap = {};
      (mStatuses || []).forEach(s => statusMap[s.product_id] = s);
      setMediaStatuses(statusMap);
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => { if (initialOpen) setSelProduct(initialOpen); }, [initialOpen]);

  const shippedProducts = products.filter(p => p.sample_status === "shipped");
  const getMs = (pid) => getMediaStatusFromData(mediaFiles[pid], mediaStatuses[pid]);

  const addFiles = async (productId, fileList) => {
    if (uploading) return;
    setUploading(true);
    try {
      for (const file of Array.from(fileList)) {
        const ext = file.name.split(".").pop();
        const path = `${userId}/${productId}/${uid()}.${ext}`;
        await supabase.uploadFile("media", path, file);
        await db.insert("media", {
          product_id: productId,
          user_id: userId,
          file_name: file.name,
          file_path: path,
          file_type: file.type.startsWith("video") ? "video" : "image",
        });
      }
      // Update media_status
      const existing = mediaStatuses[productId];
      if (existing) {
        await db.update("media_status", { product_id: productId }, { status: "uploaded", updated_at: new Date().toISOString() });
      } else {
        await db.insert("media_status", { product_id: productId, user_id: userId, status: "uploaded" });
      }
      await load();
    } catch (e) { alert("アップロードエラー: " + e.message); }
    setUploading(false);
  };

  const removeFile = async (mediaId, productId) => {
    try {
      let q = (await supabase.from("media")).delete().eq("id", mediaId);
      await q.execute();
      await load();
    } catch (e) { alert("削除エラー: " + e.message); }
  };

  const totalFiles = Object.values(mediaFiles).reduce((a, files) => a + files.length, 0);

  const shippedStatuses = shippedProducts.map(p => getMs(p.id));
  const statsData = [
    { key: "all", label: "全て", count: shippedProducts.length, color: C.tx, icon: CircleDot },
    { key: "none", label: "未UP", count: shippedStatuses.filter(s => s === "none").length, color: "#C0392B", icon: AlertCircle },
    { key: "short", label: "不足", count: shippedStatuses.filter(s => s === "short").length, color: "#C48A1A", icon: AlertCircle },
    { key: "uploaded", label: "UP済み", count: shippedStatuses.filter(s => s === "uploaded").length, color: "#2E7D5B", icon: CheckCircle2 },
    { key: "resubmit", label: "再提出", count: shippedStatuses.filter(s => s === "resubmit").length, color: "#D35400", icon: RefreshCw },
  ];

  const displayProducts = filter === "all"
    ? shippedProducts.filter(p => true)
    : shippedProducts.filter(p => getMs(p.id) === filter);

  return (
    <div>
      <Top title="素材" sub={`${totalFiles}ファイル`}
        right={!showPicker && <Btn small icon={Plus} onClick={() => setShowPicker(true)}>追加</Btn>} />
      <div style={{ padding: "14px 16px 100px" }}>
        {showPicker && (
          <div style={{ background: "#fff", borderRadius: 14, border: `1px solid ${C.bdr}`, padding: 16, marginBottom: 16 }}>
            <span style={{ fontSize: 14, fontWeight: 700, display: "block", marginBottom: 12 }}>素材を追加する商品を選択</span>
            {shippedProducts.length === 0 && (
              <p style={{ fontSize: 13, color: C.sub, textAlign: "center", padding: 20 }}>発送済みの商品がまだありません</p>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {shippedProducts.map(p => {
                const ms = getMs(p.id);
                return (
                  <button key={p.id} onClick={() => { setSelProduct(p.id); setShowPicker(false); }} style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    padding: "10px 12px", borderRadius: 10, cursor: "pointer",
                    border: `1px solid ${C.bdr}`, background: "#FAFAFA",
                  }}>
                    <span style={{ fontSize: 14, fontWeight: 700, fontFamily: "'SF Mono', 'Menlo', monospace", color: C.tx }}>{p.sku}</span>
                    <Tag text={mediaStatusLabels[ms]} color={mediaColor[ms]} />
                  </button>
                );
              })}
            </div>
            <Btn ghost onClick={() => setShowPicker(false)} style={{ marginTop: 10 }}>閉じる</Btn>
          </div>
        )}

        {loading ? <Loading /> : <>
          {shippedProducts.length > 0 && !showPicker && <StatusGrid stats={statsData} filter={filter} setFilter={setFilter} />}

          {!displayProducts.length && !showPicker && (
            <div style={{ textAlign: "center", padding: 60, color: C.sub }}>
              <p style={{ fontSize: 13, marginBottom: 8 }}>{filter === "all" ? "発送済みの商品がまだありません" : "該当なし"}</p>
              {filter === "all" && <p style={{ fontSize: 12, color: "#bbb" }}>商品が発送されると<br />ここに表示されます</p>}
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {displayProducts.map(p => {
              const files = mediaFiles[p.id] || [];
              const isOpen = selProduct === p.id;
              const ms = getMs(p.id);
              const isResubmit = ms === "resubmit";
              const isShort = ms === "short";
              const remaining = MIN_FILES - files.length;
              const statusRec = mediaStatuses[p.id];

              return (
                <div key={p.id} style={{
                  background: "#fff", borderRadius: 14,
                  border: `1px solid ${isResubmit ? "#D3540030" : isOpen ? "#bbb" : C.bdr}`, overflow: "hidden",
                }}>
                  <div onClick={() => setSelProduct(isOpen ? "" : p.id)} style={{ padding: 14, cursor: "pointer" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ fontSize: 15, fontWeight: 700, color: C.tx, fontFamily: "'SF Mono', 'Menlo', monospace" }}>{p.sku}</span>
                        <span onClick={e => e.stopPropagation()}><CopyBtn text={p.sku} /></span>
                      </div>
                      <ChevronDown size={18} color="#ccc" style={{ transition: "transform 0.2s", transform: isOpen ? "rotate(180deg)" : "" }} />
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
                      <span style={{ fontSize: 12, color: C.sub }}>{p.color} / {p.size} · {files.length}ファイル</span>
                      <Tag text={mediaStatusLabels[ms]} color={mediaColor[ms]} />
                    </div>
                  </div>

                  {isOpen && (
                    <div style={{ padding: "0 14px 14px", borderTop: `1px solid ${C.bdr}` }}>
                      {isResubmit && statusRec?.resubmit_note && (
                        <div style={{
                          background: "#FFF3ED", borderRadius: 10, padding: 12, marginTop: 12,
                          border: "1px solid #F0D0B8", display: "flex", gap: 10, alignItems: "flex-start",
                        }}>
                          <RefreshCw size={16} color="#D35400" style={{ flexShrink: 0, marginTop: 1 }} />
                          <div>
                            <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "#A04000" }}>再提出をお願いします</p>
                            <p style={{ margin: "4px 0 0", fontSize: 12, color: "#B85C1E", lineHeight: 1.5 }}>{statusRec.resubmit_note}</p>
                          </div>
                        </div>
                      )}

                      {isShort && (
                        <div style={{
                          background: "#FFF8ED", borderRadius: 10, padding: "10px 12px", marginTop: 12,
                          border: "1px solid #F0DFC0", display: "flex", alignItems: "center", gap: 8,
                        }}>
                          <AlertCircle size={15} color="#C48A1A" style={{ flexShrink: 0 }} />
                          <span style={{ fontSize: 13, color: "#8B6914" }}>
                            あと<strong>{remaining}</strong>枚以上追加してください（最低{MIN_FILES}枚）
                          </span>
                        </div>
                      )}

                      <label style={{
                        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6,
                        padding: "20px 14px", marginTop: 12, borderRadius: 10,
                        border: `2px dashed ${C.bdr}`, cursor: uploading ? "wait" : "pointer", background: C.light,
                        opacity: uploading ? 0.5 : 1,
                      }}>
                        {uploading ? <Loader size={22} color={C.tx} style={{ animation: "spin 1s linear infinite" }} />
                          : <ImagePlus size={22} color={C.tx} />}
                        <span style={{ fontSize: 14, fontWeight: 600, color: C.tx }}>{uploading ? "アップロード中..." : "画像・動画をまとめて追加"}</span>
                        <span style={{ fontSize: 11, color: C.sub }}>複数ファイルを一度に選択できます</span>
                        <input type="file" accept="image/*,video/*" multiple disabled={uploading}
                          onChange={e => { addFiles(p.id, e.target.files); e.target.value = ""; }}
                          style={{ display: "none" }} />
                      </label>

                      {files.length > 0 ? (
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6, marginTop: 12 }}>
                          {files.map(f => {
                            const fileUrl = supabase.getFileUrl("media", f.file_path);
                            return (
                              <div key={f.id} style={{
                                position: "relative", borderRadius: 10, overflow: "hidden",
                                aspectRatio: "1", background: "#f0f0f0",
                              }}>
                                {f.file_type === "video" ? (
                                  <video src={fileUrl} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                                ) : (
                                  <img src={fileUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                                )}
                                {f.file_type === "video" && (
                                  <span style={{ position: "absolute", top: 6, left: 6, background: "rgba(0,0,0,0.55)", color: "#fff", fontSize: 9, fontWeight: 700, padding: "2px 7px", borderRadius: 4, display: "flex", alignItems: "center", gap: 3 }}>
                                    <Film size={10} /> 動画
                                  </span>
                                )}
                                <button onClick={() => removeFile(f.id, p.id)} style={{
                                  position: "absolute", top: 5, right: 5, background: "rgba(0,0,0,0.45)",
                                  border: "none", color: "#fff", borderRadius: "50%", width: 24, height: 24,
                                  cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                                }}><X size={13} /></button>
                                <div style={{
                                  position: "absolute", bottom: 0, left: 0, right: 0,
                                  padding: "3px 8px", background: "rgba(0,0,0,0.4)",
                                  fontSize: 9, color: "#eee", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                                }}>{f.file_name}</div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <p style={{ textAlign: "center", padding: "20px 0 8px", color: "#bbb", fontSize: 13 }}>素材がまだありません</p>
                      )}

                      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 10, paddingTop: 8, borderTop: `1px solid ${C.bdr}` }}>
                        <span style={{ fontSize: 11, color: "#aaa" }}>登録 {fmt(p.created_at)}</span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>}
      </div>
    </div>
  );
}

// ════════════════════════════════
//  LOGIN
// ════════════════════════════════
function LoginPage({ onLogin, onGoRegister, onGoForgotPassword }) {
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!email.trim() || !pass.trim()) { setError("メールアドレスとパスワードを入力してください"); return; }
    setLoading(true); setError("");
    try {
      const data = await supabase.signIn(email.trim(), pass);
      supabase.saveToken();
      // Load profile
      const profiles = await db.select("profiles", { id: data.user.id });
      if (profiles && profiles.length > 0) {
        onLogin(profiles[0]);
      } else {
        // authにはユーザーがいるがprofileがない → ログアウトしてエラー
        supabase.signOut();
        localStorage.removeItem("sb_token");
        setError("アカウント情報に問題があります。新規登録からやり直してください");
      }
    } catch (e) {
      setError(e.message || "ログインに失敗しました。メールアドレスとパスワードを確認してください");
    }
    setLoading(false);
  };

  return (
    <div style={{ minHeight: "100vh", background: C.bg, display: "flex", flexDirection: "column", justifyContent: "center", padding: "40px 24px" }}>
      <div style={{ textAlign: "center", marginBottom: 36 }}>
        <div style={{ width: 56, height: 56, borderRadius: 16, background: C.tx, color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 18, fontWeight: 800, marginBottom: 12, letterSpacing: "0.02em" }}>OR</div>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: C.tx }}>OURES クリエイター</h1>
        <p style={{ margin: "6px 0 0", fontSize: 13, color: C.sub }}>クリエイター専用ポータル</p>
      </div>

      <div style={{ background: "#fff", borderRadius: 16, padding: 20, border: `1px solid ${C.bdr}` }}>
        <Inp label="メールアドレス" type="email" placeholder="you@example.com" value={email}
          onChange={e => { setEmail(e.target.value); setError(""); }} />
        <Inp label="パスワード" type="password" placeholder="••••••••" value={pass}
          onChange={e => { setPass(e.target.value); setError(""); }} />
        {error && <p style={{ fontSize: 12, color: "#C0392B", margin: "0 0 12px" }}>{error}</p>}
        <Btn onClick={submit} disabled={loading}>{loading ? "ログイン中..." : "ログイン"}</Btn>
        <p style={{ textAlign: "right", margin: "10px 0 0", fontSize: 12 }}>
          <button onClick={onGoForgotPassword} style={{ background: "none", border: "none", color: C.sub, cursor: "pointer", fontSize: 12, textDecoration: "underline", textUnderlineOffset: 3 }}>パスワードを忘れた方へ</button>
        </p>
      </div>

      <p style={{ textAlign: "center", marginTop: 20, fontSize: 13, color: C.sub }}>
        招待コードをお持ちですか？{" "}
        <button onClick={onGoRegister} style={{ background: "none", border: "none", color: C.tx, fontWeight: 700, cursor: "pointer", fontSize: 13, textDecoration: "underline", textUnderlineOffset: 3 }}>新規登録</button>
      </p>
    </div>
  );
}

// ════════════════════════════════
//  REGISTRATION
// ════════════════════════════════
function RegisterPage({ onRegister, onGoLogin, onEmailConfirm }) {
  const [form, setForm] = useState({ code: "", email: "", password: "", name: "", instagram: "", tiktok: "" });
  const [errors, setErrors] = useState({});
  const [globalError, setGlobalError] = useState("");
  const [loading, setLoading] = useState(false);

  const validate = () => {
    const e = {};
    if (!form.code.trim()) e.code = true;
    if (!form.email.trim()) e.email = true;
    if (!form.password.trim() || form.password.length < 6) e.password = true;
    if (!form.name.trim()) e.name = true;
    if (!form.instagram.trim() && !form.tiktok.trim()) e.sns = true;
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const submit = async () => {
    if (!validate()) return;
    setLoading(true); setGlobalError("");
    try {
      // 1. 招待コードの確認（コード一致のみ、使い回し可能）
      const codes = await db.select("invite_codes", { code: form.code.trim() });
      if (!codes || codes.length === 0) {
        setGlobalError("無効な招待コードです");
        setLoading(false);
        return;
      }

      // 2. Supabase Auth でユーザー作成
      let authData;
      try {
        authData = await supabase.signUp(form.email.trim(), form.password);
      } catch (authErr) {
        // signUp失敗 → そのまま日本語エラー表示
        setGlobalError(authErr.message);
        setLoading(false);
        return;
      }
      if (!authData?.user) {
        setGlobalError("登録に失敗しました。もう一度お試しください");
        setLoading(false);
        return;
      }

      // If email confirmation is required, no access_token is returned
      if (!authData.access_token) {
        // Email confirmation required - show confirmation page
        onEmailConfirm(form.email.trim());
        setLoading(false);
        return;
      }

      supabase.saveToken();

      // 3. プロフィール作成
      const profile = {
        id: authData.user.id,
        name: form.name.trim(),
        email: form.email.trim(),
        instagram: form.instagram.trim(),
        tiktok: form.tiktok.trim(),
      };
      try {
        await db.insert("profiles", profile);
      } catch (profileErr) {
        // profile作成失敗 → ログアウトしてエラー表示
        // （auth側のユーザーは残るが、次回同じメールで登録時にはsignInで再試行する）
        supabase.signOut();
        localStorage.removeItem("sb_token");
        setGlobalError("プロフィールの作成に失敗しました。もう一度お試しください");
        setLoading(false);
        return;
      }

      // 4. 招待コード検証完了（コードは使い回し可能）

      onRegister(profile);
    } catch (e) {
      setGlobalError(e.message || "登録に失敗しました。もう一度お試しください");
    }
    setLoading(false);
  };

  return (
    <div style={{ minHeight: "100vh", background: C.bg, padding: "40px 24px" }}>
      <div style={{ textAlign: "center", marginBottom: 28 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: C.tx }}>OURES クリエイター</h1>
        <p style={{ margin: "6px 0 0", fontSize: 13, color: C.sub }}>招待コードを入力して登録してください</p>
      </div>

      <div style={{ background: "#fff", borderRadius: 16, padding: 20, border: `1px solid ${C.bdr}` }}>
        <div style={{ marginBottom: 16 }}>
          <Inp label="招待コード" required placeholder="XXXX-XXXX" value={form.code}
            onChange={e => { setForm({ ...form, code: e.target.value }); setErrors({ ...errors, code: false }); setGlobalError(""); }}
            style={{ borderColor: errors.code ? "#C0392B" : C.bdr, fontFamily: "'SF Mono', 'Menlo', monospace", letterSpacing: "0.05em" }} />
          {errors.code && <span style={{ fontSize: 11, color: "#C0392B", marginTop: -8, display: "block" }}>招待コードを入力してください</span>}
        </div>

        <div style={{ borderTop: `1px solid ${C.bdr}`, paddingTop: 16, marginBottom: 4 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: C.tx, display: "block", marginBottom: 12 }}>アカウント情報</span>
          <Inp label="お名前" required placeholder="田中花子" value={form.name}
            onChange={e => { setForm({ ...form, name: e.target.value }); setErrors({ ...errors, name: false }); }}
            style={{ borderColor: errors.name ? "#C0392B" : C.bdr }} />
          <Inp label="メールアドレス" required type="email" placeholder="you@example.com" value={form.email}
            onChange={e => { setForm({ ...form, email: e.target.value }); setErrors({ ...errors, email: false }); }}
            style={{ borderColor: errors.email ? "#C0392B" : C.bdr }} />
          <div>
            <Inp label="パスワード" required type="password" placeholder="6文字以上" value={form.password}
              onChange={e => { setForm({ ...form, password: e.target.value }); setErrors({ ...errors, password: false }); }}
              style={{ borderColor: errors.password ? "#C0392B" : C.bdr }} />
            {errors.password && <span style={{ fontSize: 11, color: "#C0392B", marginTop: -8, display: "block", marginBottom: 8 }}>6文字以上で入力してください</span>}
          </div>
        </div>

        <div style={{ borderTop: `1px solid ${C.bdr}`, paddingTop: 16 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: C.tx, display: "block", marginBottom: 4 }}>クリエイター情報</span>
          <p style={{ fontSize: 11, color: C.sub, margin: "0 0 12px" }}>いずれか1つ以上を入力してください</p>
          <Inp label="Instagram ID" placeholder="@username" value={form.instagram}
            onChange={e => { setForm({ ...form, instagram: e.target.value }); setErrors({ ...errors, sns: false }); }} />
          <Inp label="TikTok ID" placeholder="@username" value={form.tiktok}
            onChange={e => { setForm({ ...form, tiktok: e.target.value }); setErrors({ ...errors, sns: false }); }} />
          {errors.sns && <span style={{ fontSize: 11, color: "#C0392B", marginTop: -4, display: "block", marginBottom: 8 }}>いずれか1つ以上のIDを入力してください</span>}
        </div>

        {globalError && <p style={{ fontSize: 12, color: "#C0392B", margin: "8px 0" }}>{globalError}</p>}

        <div style={{ marginTop: 4 }}>
          <Btn onClick={submit} disabled={loading}>{loading ? "登録中..." : "登録する"}</Btn>
        </div>
      </div>

      <p style={{ textAlign: "center", marginTop: 20, fontSize: 13, color: C.sub }}>
        アカウントをお持ちですか？{" "}
        <button onClick={onGoLogin} style={{ background: "none", border: "none", color: C.tx, fontWeight: 700, cursor: "pointer", fontSize: 13, textDecoration: "underline", textUnderlineOffset: 3 }}>ログイン</button>
      </p>
    </div>
  );
}

// ════════════════════════════════
//  FORGOT PASSWORD
// ════════════════════════════════
function ForgotPasswordPage({ onGoLogin }) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!email.trim()) { setError("メールアドレスを入力してください"); return; }
    setLoading(true); setError("");
    try {
      await supabase.resetPasswordForEmail(email.trim());
      setSuccess(true);
    } catch (e) {
      setError(e.message || "送信に失敗しました");
    }
    setLoading(false);
  };

  if (success) {
    return (
      <div style={{ minHeight: "100vh", background: C.bg, display: "flex", flexDirection: "column", justifyContent: "center", padding: "40px 24px" }}>
        <div style={{ textAlign: "center", marginBottom: 36 }}>
          <div style={{ width: 56, height: 56, borderRadius: 16, background: C.tx, color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 18, fontWeight: 800, marginBottom: 12 }}>OR</div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: C.tx }}>メール送信完了</h1>
        </div>
        <div style={{ background: "#fff", borderRadius: 16, padding: 24, border: `1px solid ${C.bdr}`, textAlign: "center" }}>
          <p style={{ fontSize: 14, color: C.tx, lineHeight: 1.7, margin: "0 0 8px" }}>パスワードリセット用のメールを送信しました。</p>
          <p style={{ fontSize: 13, color: C.sub, lineHeight: 1.7, margin: "0 0 20px" }}>メールに記載されたリンクをクリックして、新しいパスワードを設定してください。</p>
          <Btn onClick={onGoLogin}>ログイン画面に戻る</Btn>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: C.bg, display: "flex", flexDirection: "column", justifyContent: "center", padding: "40px 24px" }}>
      <div style={{ textAlign: "center", marginBottom: 36 }}>
        <div style={{ width: 56, height: 56, borderRadius: 16, background: C.tx, color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 18, fontWeight: 800, marginBottom: 12 }}>OR</div>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: C.tx }}>パスワードリセット</h1>
        <p style={{ margin: "6px 0 0", fontSize: 13, color: C.sub }}>登録済みのメールアドレスを入力してください</p>
      </div>
      <div style={{ background: "#fff", borderRadius: 16, padding: 20, border: `1px solid ${C.bdr}` }}>
        <Inp label="メールアドレス" type="email" placeholder="you@example.com" value={email}
          onChange={e => { setEmail(e.target.value); setError(""); }} />
        {error && <p style={{ fontSize: 12, color: "#C0392B", margin: "0 0 12px" }}>{error}</p>}
        <Btn onClick={submit} disabled={loading}>{loading ? "送信中..." : "リセットメールを送信"}</Btn>
      </div>
      <p style={{ textAlign: "center", marginTop: 20, fontSize: 13, color: C.sub }}>
        <button onClick={onGoLogin} style={{ background: "none", border: "none", color: C.tx, fontWeight: 700, cursor: "pointer", fontSize: 13, textDecoration: "underline", textUnderlineOffset: 3 }}>ログイン画面に戻る</button>
      </p>
    </div>
  );
}

// ════════════════════════════════
//  RESET PASSWORD (new password input)
// ════════════════════════════════
function ResetPasswordPage({ onComplete }) {
  const [pass, setPass] = useState("");
  const [passConfirm, setPassConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const submit = async () => {
    if (!pass.trim() || pass.length < 6) { setError("パスワードは6文字以上で入力してください"); return; }
    if (pass !== passConfirm) { setError("パスワードが一致しません"); return; }
    setLoading(true); setError("");
    try {
      await supabase.updateUser({ password: pass });
      setSuccess(true);
    } catch (e) {
      setError(e.message || "パスワードの更新に失敗しました");
    }
    setLoading(false);
  };

  if (success) {
    return (
      <div style={{ minHeight: "100vh", background: C.bg, display: "flex", flexDirection: "column", justifyContent: "center", padding: "40px 24px" }}>
        <div style={{ textAlign: "center", marginBottom: 36 }}>
          <div style={{ width: 56, height: 56, borderRadius: 16, background: C.tx, color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 18, fontWeight: 800, marginBottom: 12 }}>OR</div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: C.tx }}>パスワード変更完了</h1>
        </div>
        <div style={{ background: "#fff", borderRadius: 16, padding: 24, border: `1px solid ${C.bdr}`, textAlign: "center" }}>
          <CheckCircle2 size={40} color="#27AE60" style={{ marginBottom: 12 }} />
          <p style={{ fontSize: 14, color: C.tx, margin: "0 0 20px" }}>パスワードが正常に変更されました。</p>
          <Btn onClick={onComplete}>ログイン画面へ</Btn>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: C.bg, display: "flex", flexDirection: "column", justifyContent: "center", padding: "40px 24px" }}>
      <div style={{ textAlign: "center", marginBottom: 36 }}>
        <div style={{ width: 56, height: 56, borderRadius: 16, background: C.tx, color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 18, fontWeight: 800, marginBottom: 12 }}>OR</div>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: C.tx }}>新しいパスワードを設定</h1>
      </div>
      <div style={{ background: "#fff", borderRadius: 16, padding: 20, border: `1px solid ${C.bdr}` }}>
        <Inp label="新しいパスワード" type="password" placeholder="6文字以上" value={pass}
          onChange={e => { setPass(e.target.value); setError(""); }} />
        <Inp label="パスワード（確認）" type="password" placeholder="もう一度入力" value={passConfirm}
          onChange={e => { setPassConfirm(e.target.value); setError(""); }} />
        {error && <p style={{ fontSize: 12, color: "#C0392B", margin: "0 0 12px" }}>{error}</p>}
        <Btn onClick={submit} disabled={loading}>{loading ? "変更中..." : "パスワードを変更"}</Btn>
      </div>
    </div>
  );
}

// ════════════════════════════════
//  EMAIL CONFIRMATION WAITING
// ════════════════════════════════
function EmailConfirmationPage({ email, onGoLogin }) {
  return (
    <div style={{ minHeight: "100vh", background: C.bg, display: "flex", flexDirection: "column", justifyContent: "center", padding: "40px 24px" }}>
      <div style={{ textAlign: "center", marginBottom: 36 }}>
        <div style={{ width: 56, height: 56, borderRadius: 16, background: C.tx, color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 18, fontWeight: 800, marginBottom: 12 }}>OR</div>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: C.tx }}>メールを確認してください</h1>
      </div>
      <div style={{ background: "#fff", borderRadius: 16, padding: 24, border: `1px solid ${C.bdr}`, textAlign: "center" }}>
        <Bell size={40} color={C.tx} style={{ marginBottom: 12 }} />
        <p style={{ fontSize: 14, color: C.tx, lineHeight: 1.7, margin: "0 0 8px" }}>確認メールを送信しました。</p>
        <p style={{ fontSize: 13, color: C.sub, lineHeight: 1.7, margin: "0 0 4px" }}>
          <strong style={{ color: C.tx }}>{email}</strong> に届いたメールのリンクをクリックして、メールアドレスを確認してください。
        </p>
        <p style={{ fontSize: 12, color: C.sub, lineHeight: 1.7, margin: "12px 0 20px" }}>メールが届かない場合は、迷惑メールフォルダもご確認ください。</p>
        <Btn onClick={onGoLogin}>ログイン画面に戻る</Btn>
      </div>
    </div>
  );
}

// ════════════════════════════════
//  MAIN
// ════════════════════════════════
export default function App() {
  const [user, setUser] = useState(null);
  const [authScreen, setAuthScreen] = useState("login");
  const [page, setPage] = useState("proposals");
  const [mediaInitial, setMediaInitial] = useState("");
  const [checkingSession, setCheckingSession] = useState(true);
  const [confirmEmail, setConfirmEmail] = useState("");

  // 起動時にセッション復元 + URLハッシュからリカバリートークン検出
  useEffect(() => {
    (async () => {
      // Check URL hash for recovery (password reset link)
      const hash = window.location.hash;
      if (hash) {
        const params = new URLSearchParams(hash.substring(1));
        const accessToken = params.get("access_token");
        const type = params.get("type");
        if (accessToken && type === "recovery") {
          supabase._token = accessToken;
          supabase.saveToken();
          window.location.hash = "";
          setAuthScreen("resetPassword");
          setCheckingSession(false);
          return;
        }
        // Email confirmation redirect
        if (accessToken && (type === "signup" || type === "email")) {
          supabase._token = accessToken;
          supabase.saveToken();
          window.location.hash = "";
          // Try to load profile and login
          try {
            const userData = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
              headers: { "apikey": SUPABASE_ANON_KEY, "Authorization": `Bearer ${accessToken}` },
            });
            if (userData.ok) {
              const u = await userData.json();
              supabase._user = u;
              const profiles = await db.select("profiles", { id: u.id });
              if (profiles && profiles.length > 0) {
                setUser(profiles[0]);
                setCheckingSession(false);
                return;
              }
            }
          } catch {}
        }
      }

      const session = await supabase.getSession();
      if (session) {
        try {
          const profiles = await db.select("profiles", { id: session.user.id });
          if (profiles && profiles.length > 0) setUser(profiles[0]);
        } catch {}
      }
      setCheckingSession(false);
    })();
  }, []);

  const goMedia = (productId) => { setMediaInitial(productId); setPage("media"); };
  const setPageWrap = (p) => { if (p !== "media") setMediaInitial(""); setPage(p); };

  const handleLogin = (profile) => setUser(profile);
  const handleRegister = (profile) => setUser(profile);
  const handleRegisterEmailConfirm = (email) => { setConfirmEmail(email); setAuthScreen("emailConfirm"); };
  const handleLogout = async () => {
    await supabase.signOut();
    supabase.clearToken();
    setUser(null); setAuthScreen("login"); setPage("proposals");
  };

  if (checkingSession) {
    return (
      <div style={{ minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center",
        fontFamily: "'Noto Sans JP', 'Hiragino Sans', -apple-system, sans-serif" }}>
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;600;700&display=swap');
          @keyframes spin { to { transform: rotate(360deg); } }
          body { margin: 0; background: #F0EFED; }
        `}</style>
        <Loader size={28} color={C.sub} style={{ animation: "spin 1s linear infinite" }} />
      </div>
    );
  }

  return (
    <div style={{
      minHeight: "100vh", background: C.bg,
      fontFamily: "'Noto Sans JP', 'Hiragino Sans', -apple-system, sans-serif",
      maxWidth: 480, margin: "0 auto",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;600;700&display=swap');
        @keyframes spin { to { transform: rotate(360deg); } }
        * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
        body { margin: 0; background: #F0EFED; }
        ::-webkit-scrollbar { width: 0; }
        input::placeholder { color: #ccc; }
      `}</style>

      {!user ? (
        authScreen === "login"
          ? <LoginPage onLogin={handleLogin} onGoRegister={() => setAuthScreen("register")} onGoForgotPassword={() => setAuthScreen("forgotPassword")} />
          : authScreen === "register"
          ? <RegisterPage onRegister={handleRegister} onGoLogin={() => setAuthScreen("login")} onEmailConfirm={handleRegisterEmailConfirm} />
          : authScreen === "forgotPassword"
          ? <ForgotPasswordPage onGoLogin={() => setAuthScreen("login")} />
          : authScreen === "resetPassword"
          ? <ResetPasswordPage onComplete={() => { supabase.signOut(); supabase.clearToken(); setAuthScreen("login"); }} />
          : authScreen === "emailConfirm"
          ? <EmailConfirmationPage email={confirmEmail} onGoLogin={() => setAuthScreen("login")} />
          : <LoginPage onLogin={handleLogin} onGoRegister={() => setAuthScreen("register")} onGoForgotPassword={() => setAuthScreen("forgotPassword")} />
      ) : (
        <>
          <div style={{
            padding: "10px 20px", background: "#fff", borderBottom: `1px solid ${C.bdr}`,
            display: "flex", alignItems: "center", gap: 10,
          }}>
            <div style={{
              width: 28, height: 28, borderRadius: "50%", background: C.tx,
              color: "#fff", display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 12, fontWeight: 700,
            }}>{user.name.charAt(0).toUpperCase()}</div>
            <span style={{ fontSize: 13, fontWeight: 600, color: C.tx }}>{user.name}</span>
            {user.instagram && <span style={{ fontSize: 12, color: C.sub }}>{user.instagram}</span>}
            {user.tiktok && <span style={{ fontSize: 12, color: C.sub }}>{user.tiktok}</span>}
            <button onClick={handleLogout} style={{
              marginLeft: "auto", background: "none", border: "none",
              fontSize: 11, color: C.sub, cursor: "pointer",
            }}>ログアウト</button>
          </div>
          {page === "proposals" && <Proposals userId={user.id} />}
          {page === "products" && <Products userId={user.id} onGoMedia={goMedia} />}
          {page === "media" && <MediaPage userId={user.id} initialOpen={mediaInitial} />}
          <Nav page={page} set={setPageWrap} />
        </>
      )}
    </div>
  );
}
