import { useState, useEffect } from "react";

const SUPABASE_URL = "https://oiusfwcdqyyfxzpdoqkm.supabase.co";
const SUPABASE_KEY = "sb_publishable_WpwBaxSGrPOa8dXDab5Vug_vfZpDQNR";

async function refreshSession() {
  const session = getSession();
  if (!session?.refresh_token) return null;
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
      method: "POST",
      headers: { "apikey": SUPABASE_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: session.refresh_token }),
    });
    if (!res.ok) { clearSession(); return null; }
    const data = await res.json();
    saveSession(data);
    return data;
  } catch { clearSession(); return null; }
}

async function sbFetch(path, options = {}) {
  let session = getSession();
  
  // Try to refresh if token might be expired
  if (session?.expires_at) {
    const expiresAt = new Date(session.expires_at * 1000);
    if (expiresAt < new Date()) {
      session = await refreshSession();
    }
  }

  const token = session?.access_token || SUPABASE_KEY;
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    headers: {
      "apikey": SUPABASE_KEY,
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
      "Prefer": options.prefer || "return=representation",
      ...options.headers,
    },
    ...options,
  });
  
  // If still 401, try refresh once more
  if (res.status === 401) {
    const newSession = await refreshSession();
    if (newSession) {
      const retry = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
        headers: {
          "apikey": SUPABASE_KEY,
          "Authorization": `Bearer ${newSession.access_token}`,
          "Content-Type": "application/json",
          "Prefer": options.prefer || "return=representation",
          ...options.headers,
        },
        ...options,
      });
      if (!retry.ok) { const e = await retry.json(); throw new Error(e.message || "Error"); }
      const text = await retry.text();
      return text ? JSON.parse(text) : [];
    }
  }
  
  if (!res.ok) { const e = await res.json(); throw new Error(e.message || "Error"); }
  const text = await res.text();
  return text ? JSON.parse(text) : [];
}

async function authFetch(path, body) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1${path}`, {
    method: "POST",
    headers: { "apikey": SUPABASE_KEY, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error_description || data.msg || "שגיאה");
  return data;
}

function getSession() {
  try { return JSON.parse(localStorage.getItem("sb_session")); } catch { return null; }
}
function saveSession(s) { localStorage.setItem("sb_session", JSON.stringify(s)); }
function clearSession() { localStorage.removeItem("sb_session"); }

const SERVICES = [
  { id: "haircut", name: "תספורת רגילה", duration: 30, price: 60, emoji: "💈", desc: "תספורת קלאסית מקצועית" },
  { id: "beard", name: "עיצוב זקן", duration: 20, price: 40, emoji: "🧔", desc: "עיצוב וסידור זקן" },
  { id: "haircut_beard", name: "תספורת + זקן", duration: 50, price: 90, emoji: "✂️", desc: "חבילה מלאה במחיר מיוחד" },
  { id: "fade", name: "פייד", duration: 40, price: 70, emoji: "⚡", desc: "גרדיאנט מקצועי" },
  { id: "kids", name: "תספורת ילדים", duration: 25, price: 45, emoji: "🧒", desc: "עד גיל 12, בסבלנות ובאהבה" },
];

function generateTimeSlots(date) {
  if (!date) return [];
  const d = new Date(date + "T12:00:00");
  const day = d.getDay();
  if (day === 6) return [];
  const isFriday = day === 5;
  const endHour = isFriday ? "13:30" : "19:00";
  const slots = [];
  let h = 8, m = 0;
  while (true) {
    const t = `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`;
    slots.push(t);
    if (t === endHour) break;
    m += 30; if (m >= 60) { m = 0; h++; }
  }
  return slots;
}

function getTodayStr() { return new Date().toISOString().split("T")[0]; }
function getNowTime() {
  const n = new Date();
  return `${String(n.getHours()).padStart(2,"0")}:${String(n.getMinutes()).padStart(2,"0")}`;
}
function isSlotInPast(date, time) {
  const today = getTodayStr();
  if (date < today) return true;
  if (date === today && time <= getNowTime()) return true;
  return false;
}
function formatDate(str) {
  if (!str) return "";
  const d = new Date(str + "T12:00:00");
  return d.toLocaleDateString("he-IL", { weekday: "long", day: "numeric", month: "long" });
}
function getMinDate() {
  const today = getTodayStr();
  const slots = generateTimeSlots(today);
  const now = getNowTime();
  if (!slots.some(t => t > now)) {
    const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString().split("T")[0];
  }
  return today;
}

export default function App() {
  const [view, setView] = useState("home");
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [barbershop, setBarbershop] = useState(null);
  const [appointments, setAppointments] = useState([]);
  const [myAppointments, setMyAppointments] = useState([]);
  const [blockedDates, setBlockedDates] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const s = getSession();
    if (s?.user) { setUser(s.user); loadProfile(s.user.id); }
    loadBarbershop();
  }, []);

  const loadBarbershop = async () => {
    try {
      const data = await sbFetch("/barbershops?slug=eq.bendahair");
      if (data[0]) { setBarbershop(data[0]); loadBlockedDates(data[0].id); }
    } catch(e) { console.error(e); }
  };

  const loadProfile = async (uid) => {
    try {
      const data = await sbFetch(`/profiles?id=eq.${uid}`);
      if (data[0]) setProfile(data[0]);
    } catch(e) { console.error(e); }
  };

  const loadAppointments = async () => {
    if (!barbershop) return;
    setLoading(true);
    try {
      const data = await sbFetch(`/appointments?barbershop_id=eq.${barbershop.id}&order=date.asc,time.asc`);
      setAppointments(data);
    } catch(e) { console.error(e); }
    setLoading(false);
  };

  const loadMyAppointments = async (uid) => {
    const userId = uid || user?.id;
    if (!userId) return;
    try {
      const today = getTodayStr();
      const data = await sbFetch(`/appointments?user_id=eq.${userId}&date=gte.${today}&order=date.asc,time.asc`);
      setMyAppointments(data);
    } catch(e) { console.error(e); }
  };

  const loadBlockedDates = async (bsId) => {
    try {
      const id = bsId || barbershop?.id;
      if (!id) return;
      const data = await sbFetch(`/blocked_dates?barbershop_id=eq.${id}`);
      setBlockedDates(data.map(d => d.date));
    } catch(e) { console.error(e); }
  };

  const loadCustomers = async () => {
    try {
      const data = await sbFetch(`/profiles?role=eq.customer&order=created_at.desc`);
      setCustomers(data);
    } catch(e) { console.error(e); }
  };

  const signUp = async ({ firstName, lastName, email, phone, password }) => {
    const data = await authFetch("/signup", { email, password });
    saveSession(data);
    setUser(data.user);
    await sbFetch("/profiles", {
      method: "POST",
      body: JSON.stringify({ id: data.user.id, first_name: firstName, last_name: lastName, phone, email, role: "customer" }),
    });
    const p = { id: data.user.id, first_name: firstName, last_name: lastName, phone, email, role: "customer" };
    setProfile(p);
    return p;
  };

  const signIn = async ({ email, password }) => {
    const data = await authFetch("/token?grant_type=password", { email, password });
    saveSession(data);
    setUser(data.user);
    const profileData = await sbFetch(`/profiles?id=eq.${data.user.id}`);
    if (profileData[0]) setProfile(profileData[0]);
    await loadMyAppointments(data.user.id);
    return data;
  };

  const signOut = () => { clearSession(); setUser(null); setProfile(null); setMyAppointments([]); setView("home"); };

  const resetPassword = async (email) => {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/recover`, {
      method: "POST",
      headers: { "apikey": SUPABASE_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    if (!res.ok) throw new Error("שגיאה בשליחת המייל");
  };

  const addAppointment = async (appt) => {
    const data = await sbFetch("/appointments", {
      method: "POST",
      body: JSON.stringify({ ...appt, barbershop_id: barbershop.id, user_id: user?.id }),
    });
    await loadMyAppointments();
    return data[0];
  };

  const cancelAppointment = async (id) => {
    await sbFetch(`/appointments?id=eq.${id}`, { method: "DELETE", prefer: "" });
    setAppointments(prev => prev.filter(a => a.id !== id));
    setMyAppointments(prev => prev.filter(a => a.id !== id));
  };

  const toggleBlockedDate = async (date) => {
    if (blockedDates.includes(date)) {
      await sbFetch(`/blocked_dates?barbershop_id=eq.${barbershop.id}&date=eq.${date}`, { method: "DELETE", prefer: "" });
      setBlockedDates(prev => prev.filter(d => d !== date));
    } else {
      await sbFetch("/blocked_dates", { method: "POST", body: JSON.stringify({ barbershop_id: barbershop.id, date }) });
      setBlockedDates(prev => [...prev, date]);
    }
  };

  const isSlotTaken = (date, time) => appointments.some(a => a.date === date && a.time === time);
  const isDateBlocked = (date) => blockedDates.includes(date);
  const isOwner = profile?.role === "owner";

  if (view === "home") return <Home setView={setView} barbershop={barbershop} user={user} profile={profile} signOut={signOut} isOwner={isOwner} myAppointments={myAppointments} loadMyAppointments={loadMyAppointments} cancelAppointment={cancelAppointment} />;
  if (view === "signup") return <SignUp setView={setView} signUp={signUp} />;
  if (view === "signin") return <SignIn setView={setView} signIn={signIn} resetPassword={resetPassword} />;
  if (view === "book") return <BookView setView={setView} addAppointment={addAppointment} isSlotTaken={isSlotTaken} isDateBlocked={isDateBlocked} barbershop={barbershop} loadAppointments={loadAppointments} user={user} profile={profile} />;
  if (view === "admin") return <AdminView appointments={appointments} cancelAppointment={cancelAppointment} setView={setView} barbershop={barbershop} loadAppointments={loadAppointments} loading={loading} blockedDates={blockedDates} toggleBlockedDate={toggleBlockedDate} isOwner={isOwner} customers={customers} loadCustomers={loadCustomers} />;
}

// ─── Home ────────────────────────────────────────────────────────
function Home({ setView, barbershop, user, profile, signOut, isOwner, myAppointments, loadMyAppointments, cancelAppointment }) {
  useEffect(() => { if (user) loadMyAppointments(); }, [user]);

  return (
    <div style={s.page}>
      <div style={s.hero}>
        <div style={s.scissors}>✂</div>
        <h1 style={s.heroTitle}>{barbershop?.name || "BendaHair"}</h1>
        <p style={s.heroSub}>מספרה מקצועית · זמינה בשבילך</p>
        {user ? (
          <div style={s.heroButtons}>
            <button style={s.btnPrimary} onClick={() => setView("book")}>+ קבע תור</button>
            {isOwner && <button style={s.btnOutline} onClick={() => setView("admin")}>ניהול</button>}
            <button style={s.btnGhost} onClick={signOut}>התנתק</button>
          </div>
        ) : (
          <div style={s.heroButtons}>
            <button style={s.btnPrimary} onClick={() => setView("signup")}>הרשמה</button>
            <button style={s.btnOutline} onClick={() => setView("signin")}>כניסה</button>
          </div>
        )}
        {user && profile && (
          <p style={{ color: "#6b7280", marginTop: 12, fontSize: 14 }}>שלום, {profile.first_name} 👋</p>
        )}
      </div>

      {user && !isOwner && (
        <div style={s.section}>
          <h2 style={s.sectionTitle}>התורים שלי</h2>
          {myAppointments.length === 0 ? (
            <div style={s.emptyBox}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>📅</div>
              <p style={{ color: "#9ca3af", fontSize: 14 }}>אין תורים קרובים</p>
              <button style={{ ...s.btnPrimary, marginTop: 12, padding: "10px 20px", fontSize: 14 }} onClick={() => setView("book")}>קבע תור עכשיו</button>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {myAppointments.map(a => {
                const svc = SERVICES.find(sv => sv.id === a.service);
                return (
                  <div key={a.id} style={s.myApptCard}>
                    <div style={s.myApptDate}>{formatDate(a.date)}</div>
                    <div style={s.myApptRow}>
                      <div>
                        <div style={s.myApptTime}>{a.time}</div>
                        <div style={s.myApptService}>{svc?.name}</div>
                      </div>
                      <div style={{ textAlign: "left" }}>
                        <div style={s.myApptPrice}>₪{svc?.price}</div>
                        <button style={s.cancelSmallBtn} onClick={() => cancelAppointment(a.id)}>ביטול</button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      <div style={s.section}>
        <h2 style={s.sectionTitle}>השירותים שלנו</h2>
        <div style={s.serviceGrid}>
          {SERVICES.map(sv => (
            <div key={sv.id} style={s.serviceCard}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>{sv.emoji}</div>
              <div style={{ fontWeight: 800, fontSize: 16, color: "#f0e8d8", marginBottom: 6 }}>{sv.name}</div>
              <div style={{ color: "#8b7355", fontSize: 12, marginBottom: 12 }}>{sv.desc}</div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ color: "#6b7280", fontSize: 13 }}>⏱ {sv.duration} דק׳</span>
                <span style={{ color: "#c8a97e", fontWeight: 900, fontSize: 20 }}>₪{sv.price}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={s.section}>
        <div style={s.hoursBox}>
          <h3 style={s.hoursTitle}>🕐 שעות פעילות</h3>
          <div style={s.hoursRow}><span>ראשון–חמישי</span><span>08:00–19:00</span></div>
          <div style={s.hoursRow}><span>שישי</span><span>08:00–13:30</span></div>
          <div style={{ ...s.hoursRow, color: "#ef4444" }}><span>שבת</span><span>סגור</span></div>
        </div>
      </div>
    </div>
  );
}

// ─── SignUp ──────────────────────────────────────────────────────
function SignUp({ setView, signUp }) {
  const [form, setForm] = useState({ firstName: "", lastName: "", email: "", phone: "", password: "" });
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);

  const set = (k, v) => { setForm(f => ({ ...f, [k]: v })); setErrors(e => ({ ...e, [k]: "" })); };

  const validate = () => {
    const errs = {};
    if (!form.firstName.trim()) errs.firstName = "שדה חובה";
    if (!form.lastName.trim()) errs.lastName = "שדה חובה";
    if (!form.email.trim() || !/\S+@\S+\.\S+/.test(form.email)) errs.email = "מייל לא תקין";
    if (!form.phone.trim() || !/^[0-9\-+\s]{9,15}$/.test(form.phone)) errs.phone = "טלפון לא תקין";
    if (form.password.length < 6) errs.password = "סיסמה חייבת להיות לפחות 6 תווים";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setLoading(true);
    try { await signUp(form); setView("home"); }
    catch(e) { setErrors({ general: e.message }); }
    setLoading(false);
  };

  return (
    <div style={s.page}>
      <div style={s.topBar}>
        <button style={s.back} onClick={() => setView("home")}>← חזור</button>
        <h2 style={s.topBarTitle}>הרשמה</h2>
        <div />
      </div>
      <div style={s.card}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div>
            <label style={s.label}>שם פרטי</label>
            <input style={{ ...s.input, borderColor: errors.firstName ? "#ef4444" : "#e5e7eb" }}
              placeholder="ישראל" value={form.firstName} onChange={e => set("firstName", e.target.value)} />
            {errors.firstName && <p style={s.error}>{errors.firstName}</p>}
          </div>
          <div>
            <label style={s.label}>שם משפחה</label>
            <input style={{ ...s.input, borderColor: errors.lastName ? "#ef4444" : "#e5e7eb" }}
              placeholder="ישראלי" value={form.lastName} onChange={e => set("lastName", e.target.value)} />
            {errors.lastName && <p style={s.error}>{errors.lastName}</p>}
          </div>
        </div>
        <label style={s.label}>כתובת מייל</label>
        <input style={{ ...s.input, borderColor: errors.email ? "#ef4444" : "#e5e7eb" }}
          placeholder="israel@gmail.com" type="email" value={form.email} onChange={e => set("email", e.target.value)} />
        {errors.email && <p style={s.error}>{errors.email}</p>}
        <label style={s.label}>טלפון</label>
        <input style={{ ...s.input, borderColor: errors.phone ? "#ef4444" : "#e5e7eb" }}
          placeholder="050-0000000" value={form.phone} onChange={e => set("phone", e.target.value)} />
        {errors.phone && <p style={s.error}>{errors.phone}</p>}
        <label style={s.label}>סיסמה</label>
        <input style={{ ...s.input, borderColor: errors.password ? "#ef4444" : "#e5e7eb" }}
          type="password" placeholder="לפחות 6 תווים" value={form.password} onChange={e => set("password", e.target.value)} />
        {errors.password && <p style={s.error}>{errors.password}</p>}
        {errors.general && <p style={{ ...s.error, marginBottom: 10 }}>{errors.general}</p>}
        <button style={{ ...s.btnPrimary, width: "100%", marginTop: 4 }} disabled={loading} onClick={handleSubmit}>
          {loading ? "נרשם..." : "הרשמה"}
        </button>
        <p style={{ textAlign: "center", color: "#9ca3af", fontSize: 13, marginTop: 16 }}>
          כבר יש לך חשבון?{" "}
          <span style={{ color: "#c8a97e", cursor: "pointer", fontWeight: 600 }} onClick={() => setView("signin")}>התחבר</span>
        </p>
      </div>
    </div>
  );
}

// ─── SignIn ──────────────────────────────────────────────────────
function SignIn({ setView, signIn, resetPassword }) {
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [resetMode, setResetMode] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetSent, setResetSent] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async () => {
    if (!form.email || !form.password) { setError("נא למלא את כל השדות"); return; }
    setLoading(true);
    try { await signIn(form); setView("home"); }
    catch(e) { setError("מייל או סיסמה שגויים"); }
    setLoading(false);
  };

  const handleReset = async () => {
    if (!resetEmail) { return; }
    setResetLoading(true);
    try { await resetPassword(resetEmail); setResetSent(true); }
    catch(e) { setError("שגיאה בשליחת המייל"); }
    setResetLoading(false);
  };

  return (
    <div style={s.page}>
      <div style={s.topBar}>
        <button style={s.back} onClick={() => resetMode ? setResetMode(false) : setView("home")}>← חזור</button>
        <h2 style={s.topBarTitle}>{resetMode ? "איפוס סיסמה" : "כניסה"}</h2>
        <div />
      </div>
      <div style={s.card}>
        {!resetMode ? (
          <>
            <label style={s.label}>כתובת מייל</label>
            <input style={s.input} placeholder="israel@gmail.com" type="email" value={form.email}
              onChange={e => set("email", e.target.value)} />
            <label style={s.label}>סיסמה</label>
            <input style={s.input} type="password" placeholder="••••••" value={form.password}
              onChange={e => set("password", e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleSubmit()} />
            {error && <p style={s.error}>{error}</p>}
            <button style={{ ...s.btnPrimary, width: "100%", marginTop: 8 }} disabled={loading} onClick={handleSubmit}>
              {loading ? "מתחבר..." : "כניסה"}
            </button>
            <p style={{ textAlign: "center", marginTop: 14 }}>
              <span style={{ color: "#c8a97e", cursor: "pointer", fontSize: 13 }} onClick={() => setResetMode(true)}>
                שכחתי סיסמה
              </span>
            </p>
            <p style={{ textAlign: "center", color: "#9ca3af", fontSize: 13, marginTop: 8 }}>
              אין לך חשבון?{" "}
              <span style={{ color: "#c8a97e", cursor: "pointer", fontWeight: 600 }} onClick={() => setView("signup")}>הרשמה</span>
            </p>
          </>
        ) : resetSent ? (
          <div style={{ textAlign: "center", padding: "20px 0" }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>📧</div>
            <h3 style={{ color: "#111827", marginBottom: 8 }}>המייל נשלח!</h3>
            <p style={{ color: "#6b7280", fontSize: 14 }}>בדוק את תיבת הדואר שלך ולחץ על הקישור לאיפוס הסיסמה</p>
            <button style={{ ...s.btnPrimary, marginTop: 20 }} onClick={() => { setResetMode(false); setResetSent(false); }}>חזרה לכניסה</button>
          </div>
        ) : (
          <>
            <p style={{ color: "#6b7280", fontSize: 14, marginBottom: 16 }}>הכנס את המייל שלך ונשלח לך קישור לאיפוס הסיסמה</p>
            <label style={s.label}>כתובת מייל</label>
            <input style={s.input} placeholder="israel@gmail.com" type="email" value={resetEmail}
              onChange={e => setResetEmail(e.target.value)} />
            {error && <p style={s.error}>{error}</p>}
            <button style={{ ...s.btnPrimary, width: "100%", marginTop: 8 }} disabled={resetLoading} onClick={handleReset}>
              {resetLoading ? "שולח..." : "שלח קישור לאיפוס"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ─── BookView ────────────────────────────────────────────────────
function BookView({ setView, addAppointment, isSlotTaken, isDateBlocked, barbershop, loadAppointments, user, profile }) {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({ name: profile ? `${profile.first_name} ${profile.last_name}` : "", phone: profile?.phone || "", service: "", date: "", time: "" });
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState({});
  const minDate = getMinDate();

  useEffect(() => { loadAppointments(); }, [barbershop]);

  const set = (k, v) => { setForm(f => ({ ...f, [k]: v })); setErrors(e => ({ ...e, [k]: "" })); };
  const timeSlots = generateTimeSlots(form.date);
  const isClosed = form.date && timeSlots.length === 0;
  const isBlocked = form.date && isDateBlocked(form.date);

  const handleSubmit = async () => {
    if (isSlotInPast(form.date, form.time)) { setErrors({ time: "שעה זו כבר עברה" }); return; }
    if (isSlotTaken(form.date, form.time)) { setErrors({ time: "שעה זו כבר תפוסה" }); return; }
    setSubmitting(true);
    try { await addAppointment(form); setSuccess(true); }
    catch(e) { alert("שגיאה בקביעת התור"); }
    setSubmitting(false);
  };

  if (!user) return (
    <div style={s.page}>
      <div style={s.card}>
        <p style={{ color: "#374151", textAlign: "center", marginBottom: 20 }}>כדי לקבוע תור יש להתחבר תחילה</p>
        <button style={{ ...s.btnPrimary, width: "100%", marginBottom: 10 }} onClick={() => setView("signin")}>כניסה</button>
        <button style={{ ...s.btnOutline, width: "100%" }} onClick={() => setView("signup")}>הרשמה</button>
      </div>
    </div>
  );

  if (success) return (
    <div style={s.page}>
      <div style={{ ...s.card, textAlign: "center", margin: "60px 20px 0" }}>
        <div style={s.successIcon}>✓</div>
        <h2 style={{ color: "#111827", fontSize: 22, margin: "0 0 12px" }}>התור נקבע בהצלחה!</h2>
        <p style={{ color: "#374151", fontSize: 15, margin: "4px 0" }}>{formatDate(form.date)} בשעה {form.time}</p>
        <p style={{ color: "#374151", fontSize: 15, margin: "4px 0" }}>{SERVICES.find(sv => sv.id === form.service)?.name}</p>
        <button style={{ ...s.btnPrimary, marginTop: 24 }} onClick={() => setView("home")}>חזרה לעמוד הבית</button>
      </div>
    </div>
  );

  return (
    <div style={s.page}>
      <div style={s.topBar}>
        <button style={s.back} onClick={() => step > 1 ? setStep(st => st - 1) : setView("home")}>← חזור</button>
        <h2 style={s.topBarTitle}>קביעת תור</h2>
        <div style={s.steps}>{[1,2].map(n => <div key={n} style={{ ...s.stepDot, background: step >= n ? "#c8a97e" : "#3a3028" }} />)}</div>
      </div>

      {step === 1 && (
        <div style={s.card}>
          <h3 style={s.cardTitle}>בחר שירות</h3>
          <div style={{ display: "flex", flexDirection: "column" }}>
            {SERVICES.map(sv => (
              <div key={sv.id}
                onClick={() => set("service", sv.id)}
                style={{
                  background: form.service === sv.id ? "#2a2015" : "#1a1512",
                  border: `2px solid ${form.service === sv.id ? "#c8a97e" : "#2a2015"}`,
                  borderRadius: 16,
                  padding: "18px 20px",
                  marginBottom: 12,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  boxShadow: form.service === sv.id ? "0 4px 16px rgba(200,169,126,0.2)" : "0 2px 8px rgba(0,0,0,0.3)",
                  transition: "all .2s",
                }}>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
                  <div style={{ fontSize: 28, marginBottom: 6 }}>{sv.emoji}</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: "#111827" }}>{sv.name}</div>
                  <div style={{ fontSize: 13, color: "#9ca3af", marginTop: 2 }}>{sv.desc}</div>
                  <div style={{ fontSize: 13, color: "#6b7280", marginTop: 6, display: "flex", alignItems: "center", gap: 4 }}>
                    <span>⏱</span> <span>{sv.duration} דקות</span>
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
                  <div style={{ fontSize: 28, fontWeight: 900, color: form.service === sv.id ? "#c8a97e" : "#f0e8d8" }}>
                    ₪{sv.price}
                  </div>
                  {form.service === sv.id && (
                    <div style={{ width: 28, height: 28, background: "#c8a97e", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", color: "#1a1512", fontSize: 15, fontWeight: 800 }}>✓</div>
                  )}
                </div>
              </div>
            ))}
          </div>
          <button style={{ ...s.btnPrimary, width: "100%", marginTop: 20 }} disabled={!form.service} onClick={() => setStep(2)}>המשך</button>
        </div>
      )}

      {step === 2 && (
        <div style={s.card}>
          <h3 style={s.cardTitle}>תאריך ושעה</h3>
          <label style={s.label}>📅 בחר תאריך</label>
          <div style={{ position: "relative", marginBottom: 16 }}>
            <input style={{ ...s.input, marginBottom: 0, width: "100%", boxSizing: "border-box", colorScheme: "dark" }} type="date" min={minDate} value={form.date}
              onChange={e => { set("date", e.target.value); set("time", ""); }} />
            {!form.date && (
              <div style={{ position: "absolute", top: "50%", right: 14, transform: "translateY(-50%)", color: "#6b5a4a", fontSize: 14, pointerEvents: "none" }}>
                DD/MM/YYYY
              </div>
            )}
          </div>
          {form.date && !isClosed && !isBlocked && (
            <div style={{ background: "#2a2015", borderRadius: 8, padding: "10px 14px", marginBottom: 8, fontSize: 15, color: "#c8a97e", fontWeight: 700 }}>
              📅 {formatDate(form.date)}
            </div>
          )}
          {isClosed && <div style={s.closedBox}>🚫 המספרה סגורה בשבת</div>}
          {isBlocked && <div style={s.closedBox}>🏖️ המספרה סגורה ביום זה</div>}
          {form.date && !isClosed && !isBlocked && (
            <>
              <label style={{ ...s.label, marginTop: 16 }}>שעה פנויה</label>
              <div style={s.timeGrid}>
                {timeSlots.map(t => {
                  const taken = isSlotTaken(form.date, t);
                  const past = isSlotInPast(form.date, t);
                  const unavail = taken || past;
                  return (
                    <div key={t} style={{
                      ...s.timeSlot,
                      background: unavail ? "#0f0c0a" : form.time === t ? "#c8a97e" : "#1a1512",
                      color: unavail ? "#3a3028" : form.time === t ? "#1a1512" : "#f0e8d8",
                      cursor: unavail ? "not-allowed" : "pointer",
                      border: `2px solid ${unavail ? "#1a1512" : form.time === t ? "#c8a97e" : "#2a2015"}`,
                      textDecoration: past && !taken ? "line-through" : "none",
                    }} onClick={() => !unavail && set("time", t)}>{t}</div>
                  );
                })}
              </div>
              {errors.time && <p style={s.error}>{errors.time}</p>}
            </>
          )}
          <button style={{ ...s.btnPrimary, width: "100%", marginTop: 20 }}
            disabled={!form.date || !form.time || submitting || isClosed || isBlocked}
            onClick={handleSubmit}>
            {submitting ? "שומר..." : "קבע תור ✓"}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── AdminView ───────────────────────────────────────────────────
function AdminView({ appointments, cancelAppointment, setView, barbershop, loadAppointments, loading, blockedDates, toggleBlockedDate, isOwner, customers, loadCustomers }) {
  const [tab, setTab] = useState("appointments");
  const [filter, setFilter] = useState("upcoming");
  const [blockDate, setBlockDate] = useState("");
  const today = getTodayStr();

  useEffect(() => { loadAppointments(); }, [barbershop]);

  if (!isOwner) return (
    <div style={s.page}>
      <div style={s.card}>
        <p style={{ color: "#ef4444", textAlign: "center" }}>אין לך הרשאה לדף זה</p>
        <button style={{ ...s.btnPrimary, width: "100%", marginTop: 16 }} onClick={() => setView("home")}>חזור</button>
      </div>
    </div>
  );

  const sorted = [...appointments].sort((a, b) => a.date !== b.date ? a.date.localeCompare(b.date) : a.time.localeCompare(b.time));
  const filtered = sorted.filter(a => {
    if (filter === "upcoming") return a.date > today || (a.date === today && a.time > getNowTime());
    if (filter === "past") return a.date < today || (a.date === today && a.time <= getNowTime());
    return true;
  });
  const grouped = filtered.reduce((acc, a) => { if (!acc[a.date]) acc[a.date] = []; acc[a.date].push(a); return acc; }, {});

  return (
    <div style={s.page}>
      <div style={s.topBar}>
        <button style={s.back} onClick={() => setView("home")}>← יציאה</button>
        <h2 style={s.topBarTitle}>ניהול</h2>
        <div style={{ color: "#c8a97e", fontSize: 14, fontWeight: 600 }}>{appointments.length} תורים</div>
      </div>

      <div style={{ display: "flex", borderBottom: "2px solid #e5e7eb", margin: "0 20px" }}>
        {[["appointments","📅 תורים"],["customers","👥 לקוחות"],["ooo","🏖️ חופשות"]].map(([k,l]) => (
          <button key={k} onClick={() => { setTab(k); if (k === "customers") loadCustomers(); }} style={{
            flex: 1, background: "none", border: "none",
            borderBottom: tab === k ? "2px solid #c8a97e" : "2px solid transparent",
            marginBottom: -2,
            color: tab === k ? "#c8a97e" : "#6b5a4a",
            padding: "12px 4px", fontSize: 13, fontWeight: 600, cursor: "pointer"
          }}>{l}</button>
        ))}
      </div>

      {tab === "appointments" && (
        <>
          <div style={s.filterRow}>
            {[["upcoming","קרובים"],["past","עבר"],["all","הכל"]].map(([k,l]) => (
              <button key={k} style={{ ...s.filterBtn, background: filter === k ? "#c8a97e" : "#2a2015", color: filter === k ? "#1a1512" : "#8b7355" }}
                onClick={() => setFilter(k)}>{l}</button>
            ))}
            <button style={{ ...s.filterBtn, background: "#f3f4f6", color: "#6b7280" }} onClick={loadAppointments}>🔄</button>
          </div>
          {loading && <p style={{ textAlign: "center", color: "#9ca3af", marginTop: 40 }}>טוען...</p>}
          {!loading && Object.keys(grouped).length === 0 && (
            <div style={{ textAlign: "center", color: "#9ca3af", marginTop: 60 }}>
              <div style={{ fontSize: 40 }}>📋</div><p>אין תורים להצגה</p>
            </div>
          )}
          <div style={{ padding: "16px 20px 0" }}>
            {Object.entries(grouped).map(([date, appts]) => (
              <div key={date} style={{ marginBottom: 24 }}>
                <div style={s.dateLabel}>{formatDate(date)}</div>
                {appts.map(a => {
                  const svc = SERVICES.find(sv => sv.id === a.service);
                  const past = isSlotInPast(a.date, a.time);
                  return (
                    <div key={a.id} style={{ ...s.apptCard, opacity: past ? 0.5 : 1 }}>
                      <div style={{ flex: 1 }}>
                        <div style={s.apptTime}>{a.time}</div>
                        <div style={s.apptName}>{a.name}</div>
                        <div style={s.apptMeta}>{a.phone} · {svc?.name} · ₪{svc?.price}</div>
                      </div>
                      <button style={s.cancelBtn} onClick={() => cancelAppointment(a.id)}>ביטול</button>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </>
      )}

      {tab === "customers" && (
        <div style={{ padding: "16px 20px 0" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div style={s.dateLabel}>{customers.length} לקוחות רשומים</div>
            <button style={{ ...s.filterBtn, background: "#f3f4f6", color: "#6b7280", padding: "8px 14px" }} onClick={loadCustomers}>🔄</button>
          </div>
          {customers.length === 0 ? (
            <div style={{ textAlign: "center", color: "#9ca3af", marginTop: 60 }}>
              <div style={{ fontSize: 40 }}>👥</div><p>אין לקוחות רשומים עדיין</p>
            </div>
          ) : customers.map(c => (
            <div key={c.id} style={s.apptCard}>
              <div style={{ flex: 1 }}>
                <div style={s.apptName}>{c.first_name} {c.last_name}</div>
                <div style={s.apptMeta}>📞 {c.phone}</div>
                {c.email && <div style={s.apptMeta}>✉️ {c.email}</div>}
                <div style={s.apptMeta}>נרשם: {new Date(c.created_at).toLocaleDateString("he-IL")}</div>
              </div>
              <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 6, padding: "4px 10px", color: "#16a34a", fontSize: 12 }}>לקוח</div>
            </div>
          ))}
        </div>
      )}

      {tab === "ooo" && (
        <div style={{ padding: "20px" }}>
          <div style={s.card}>
            <h3 style={s.cardTitle}>🏖️ Out of Office</h3>
            <p style={{ color: "#6b7280", fontSize: 13, marginBottom: 16 }}>בחר תאריכים שבהם המספרה סגורה</p>
            <label style={s.label}>הוסף תאריך חסימה</label>
            <div style={{ display: "flex", gap: 10 }}>
              <input style={{ ...s.input, flex: 1, marginBottom: 0 }} type="date" min={today} value={blockDate}
                onChange={e => setBlockDate(e.target.value)} />
              <button style={{ ...s.btnPrimary, whiteSpace: "nowrap" }} disabled={!blockDate}
                onClick={() => { toggleBlockedDate(blockDate); setBlockDate(""); }}>
                {blockedDates.includes(blockDate) ? "בטל חסימה" : "חסום יום"}
              </button>
            </div>
          </div>
          {blockedDates.length > 0 ? (
            <div style={{ marginTop: 20 }}>
              <div style={s.dateLabel}>ימים חסומים</div>
              {[...blockedDates].sort().map(d => (
                <div key={d} style={{ ...s.apptCard, background: "#fef2f2", border: "1px solid #fecaca" }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ color: "#ef4444", fontWeight: 600 }}>🚫 {formatDate(d)}</div>
                  </div>
                  <button style={s.cancelBtn} onClick={() => toggleBlockedDate(d)}>הסר</button>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ textAlign: "center", color: "#9ca3af", marginTop: 40 }}>
              <div style={{ fontSize: 40 }}>✅</div><p>אין ימים חסומים</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Styles ──────────────────────────────────────────────────────
const s = {
  page: { minHeight: "100vh", background: "#0f0c0a", color: "#f0e8d8", fontFamily: "'Segoe UI', Tahoma, sans-serif", direction: "rtl", padding: "0 0 48px" },
  hero: { textAlign: "center", padding: "52px 24px 44px", background: "linear-gradient(180deg, #1a1208 0%, #0f0c0a 100%)", borderBottom: "1px solid #2a2015" },
  scissors: { fontSize: 56, display: "block", marginBottom: 12, filter: "drop-shadow(0 0 16px #c8a97e88)" },
  heroTitle: { fontSize: 44, fontWeight: 900, color: "#c8a97e", margin: "0 0 8px", letterSpacing: 2, textTransform: "uppercase" },
  heroSub: { color: "#8b7355", fontSize: 18, margin: "0 0 32px" },
  heroButtons: { display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" },
  btnPrimary: { background: "#c8a97e", color: "#1a1512", border: "none", borderRadius: 10, padding: "16px 32px", fontSize: 17, fontWeight: 800, cursor: "pointer", boxShadow: "0 4px 12px rgba(200,169,126,0.35)" },
  btnOutline: { background: "transparent", color: "#c8a97e", border: "2px solid #c8a97e", borderRadius: 10, padding: "14px 26px", fontSize: 16, fontWeight: 700, cursor: "pointer" },
  btnGhost: { background: "transparent", color: "#6b5a4a", border: "1.5px solid #3a3028", borderRadius: 10, padding: "14px 20px", fontSize: 15, cursor: "pointer" },
  section: { padding: "28px 16px 0" },
  sectionTitle: { color: "#c8a97e", fontSize: 24, fontWeight: 900, marginBottom: 16, margin: "0 0 16px", letterSpacing: 1 },
  serviceGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 },
  serviceCard: { background: "#1a1512", border: "2px solid #2a2015", borderRadius: 14, padding: "18px 16px", boxShadow: "0 2px 8px rgba(0,0,0,0.3)" },
  serviceCardTitle: { fontWeight: 700, fontSize: 15, marginBottom: 6, color: "#f0e8d8" },
  serviceCardMeta: { display: "flex", justifyContent: "space-between", color: "#6b5a4a", fontSize: 13, marginTop: 8 },
  price: { color: "#c8a97e", fontWeight: 800, fontSize: 18 },
  hoursBox: { background: "#1a1512", border: "2px solid #2a2015", borderRadius: 14, padding: 20 },
  hoursTitle: { color: "#c8a97e", fontSize: 16, margin: "0 0 14px", fontWeight: 800 },
  hoursRow: { display: "flex", justifyContent: "space-between", color: "#8b7355", fontSize: 16, fontWeight: 500, marginBottom: 10 },
  myApptCard: { background: "#1a1512", border: "2px solid #2a2015", borderRadius: 14, padding: "18px 16px" },
  myApptDate: { color: "#8b7355", fontSize: 13, marginBottom: 10, fontWeight: 600 },
  myApptRow: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  myApptTime: { color: "#c8a97e", fontWeight: 800, fontSize: 22 },
  myApptService: { color: "#f0e8d8", fontSize: 15, marginTop: 4 },
  myApptPrice: { color: "#c8a97e", fontWeight: 900, fontSize: 22, textAlign: "left" },
  cancelSmallBtn: { background: "none", border: "none", color: "#e05a5a", fontSize: 13, cursor: "pointer", padding: "4px 0", textAlign: "left", fontWeight: 600 },
  emptyBox: { background: "#1a1512", border: "2px solid #2a2015", borderRadius: 14, padding: "32px 16px", textAlign: "center" },
  topBar: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 20px", background: "#1a1512", borderBottom: "1px solid #2a2015" },
  topBarTitle: { color: "#c8a97e", fontSize: 20, margin: 0, fontWeight: 800 },
  back: { background: "none", border: "none", color: "#8b7355", cursor: "pointer", fontSize: 16, padding: 0, fontWeight: 600 },
  steps: { display: "flex", gap: 8 },
  stepDot: { width: 10, height: 10, borderRadius: "50%", transition: "background .3s" },
  card: { margin: "20px 16px 0", background: "#1a1512", border: "2px solid #2a2015", borderRadius: 16, padding: "28px 20px" },
  cardTitle: { color: "#c8a97e", fontSize: 19, fontWeight: 800, marginTop: 0, marginBottom: 20 },
  label: { display: "block", color: "#8b7355", fontSize: 15, fontWeight: 600, marginBottom: 8 },
  input: { width: "100%", background: "#0f0c0a", border: "2px solid #2a2015", borderRadius: 10, color: "#f0e8d8", padding: "14px 14px", fontSize: 16, outline: "none", boxSizing: "border-box", marginBottom: 16, direction: "ltr", textAlign: "right" },
  error: { color: "#e05a5a", fontSize: 13, margin: "0 0 12px", fontWeight: 600 },
  optionRow: { display: "flex", justifyContent: "space-between", alignItems: "center", border: "2px solid", borderRadius: 14, padding: "16px 16px", cursor: "pointer", transition: "all .15s", marginBottom: 2 },
  timeGrid: { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginTop: 10 },
  timeSlot: { borderRadius: 10, padding: "13px 4px", textAlign: "center", fontSize: 15, fontWeight: 700, transition: "all .15s", border: "2px solid" },
  closedBox: { background: "#2a1515", border: "2px solid #5a2020", borderRadius: 10, padding: "16px", color: "#e05a5a", textAlign: "center", marginTop: 14, fontSize: 15, fontWeight: 600 },
  successIcon: { width: 68, height: 68, background: "#c8a97e", color: "#1a1512", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 32, fontWeight: 800, margin: "0 auto 24px" },
  filterRow: { display: "flex", gap: 8, padding: "16px 16px 0" },
  filterBtn: { flex: 1, border: "none", borderRadius: 10, padding: "12px 0", fontSize: 14, fontWeight: 700, cursor: "pointer" },
  dateLabel: { color: "#8b7355", fontSize: 13, fontWeight: 700, letterSpacing: 0.5, marginBottom: 10, textTransform: "uppercase" },
  apptCard: { display: "flex", alignItems: "center", background: "#1a1512", border: "2px solid #2a2015", borderRadius: 14, padding: "16px 16px", marginBottom: 10 },
  apptTime: { color: "#c8a97e", fontWeight: 800, fontSize: 20 },
  apptName: { color: "#f0e8d8", fontWeight: 700, fontSize: 16, marginTop: 3 },
  apptMeta: { color: "#6b5a4a", fontSize: 13, marginTop: 4 },
  cancelBtn: { background: "transparent", border: "2px solid #5a2020", color: "#e05a5a", borderRadius: 8, padding: "9px 16px", fontSize: 13, cursor: "pointer", fontWeight: 700 },
  serviceCardEmoji: { fontSize: 36, marginBottom: 10, display: "block" },
};
