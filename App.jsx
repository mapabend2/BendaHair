import { useState, useEffect } from "react";

const SUPABASE_URL = "https://oiusfwcdqyyfxzpdoqkm.supabase.co";
const SUPABASE_KEY = "sb_publishable_WpwBaxSGrPOa8dXDab5Vug_vfZpDQNR";

async function sbFetch(path, options = {}) {
  const session = getSession();
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    headers: {
      "apikey": SUPABASE_KEY,
      "Authorization": `Bearer ${session?.access_token || SUPABASE_KEY}`,
      "Content-Type": "application/json",
      "Prefer": options.prefer || "return=representation",
      ...options.headers,
    },
    ...options,
  });
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
  { id: "haircut", name: "תספורת רגילה", duration: 30, price: 60 },
  { id: "beard", name: "עיצוב זקן", duration: 20, price: 40 },
  { id: "haircut_beard", name: "תספורת + זקן", duration: 50, price: 90 },
  { id: "fade", name: "פייד", duration: 40, price: 70 },
  { id: "kids", name: "תספורת ילדים", duration: 25, price: 45 },
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
    await loadProfile(data.user.id);
    return data;
  };

  const signOut = () => { clearSession(); setUser(null); setProfile(null); setView("home"); };

  const addAppointment = async (appt) => {
    const data = await sbFetch("/appointments", {
      method: "POST",
      body: JSON.stringify({ ...appt, barbershop_id: barbershop.id, user_id: user?.id }),
    });
    return data[0];
  };

  const cancelAppointment = async (id) => {
    await sbFetch(`/appointments?id=eq.${id}`, { method: "DELETE", prefer: "" });
    setAppointments(prev => prev.filter(a => a.id !== id));
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

  if (view === "home") return <Home setView={setView} barbershop={barbershop} user={user} profile={profile} signOut={signOut} isOwner={isOwner} />;
  if (view === "signup") return <SignUp setView={setView} signUp={signUp} />;
  if (view === "signin") return <SignIn setView={setView} signIn={signIn} />;
  if (view === "book") return <BookView setView={setView} addAppointment={addAppointment} isSlotTaken={isSlotTaken} isDateBlocked={isDateBlocked} barbershop={barbershop} loadAppointments={loadAppointments} user={user} profile={profile} />;
  if (view === "admin") return <AdminView appointments={appointments} cancelAppointment={cancelAppointment} setView={setView} barbershop={barbershop} loadAppointments={loadAppointments} loading={loading} blockedDates={blockedDates} toggleBlockedDate={toggleBlockedDate} isOwner={isOwner} customers={customers} loadCustomers={loadCustomers} />;
}

function Home({ setView, barbershop, user, profile, signOut, isOwner }) {
  return (
    <div style={s.page}>
      <div style={s.hero}>
        <div style={s.scissors}>✂</div>
        <h1 style={s.heroTitle}>{barbershop?.name || "BendaHair"}</h1>
        <p style={s.heroSub}>מספרה מקצועית · זמינה בשבילך</p>
        {user ? (
          <div style={s.heroButtons}>
            <button style={s.btnPrimary} onClick={() => setView("book")}>קבע תור עכשיו</button>
            {isOwner && <button style={s.btnGhost} onClick={() => setView("admin")}>ניהול תורים</button>}
            <button style={{ ...s.btnGhost, borderColor: "#5a2020", color: "#e05a5a" }} onClick={signOut}>התנתק</button>
          </div>
        ) : (
          <div style={s.heroButtons}>
            <button style={s.btnPrimary} onClick={() => setView("signup")}>הרשמה</button>
            <button style={s.btnGhost} onClick={() => setView("signin")}>כניסה</button>
          </div>
        )}
        {user && profile && (
          <p style={{ color: "#8b7355", marginTop: 16, fontSize: 14 }}>
            שלום, {profile.first_name} {profile.last_name} 👋
          </p>
        )}
      </div>
      <div style={s.services}>
        <h2 style={s.sectionTitle}>השירותים שלנו</h2>
        <div style={s.serviceGrid}>
          {SERVICES.map(sv => (
            <div key={sv.id} style={s.serviceCard}>
              <div style={s.serviceCardTitle}>{sv.name}</div>
              <div style={s.serviceCardMeta}>
                <span>⏱ {sv.duration} דק׳</span>
                <span style={s.price}>₪{sv.price}</span>
              </div>
            </div>
          ))}
        </div>
        <div style={s.hoursBox}>
          <h3 style={s.hoursTitle}>שעות פעילות</h3>
          <div style={s.hoursRow}><span>ראשון–חמישי</span><span>08:00–19:00</span></div>
          <div style={s.hoursRow}><span>שישי</span><span>08:00–13:30</span></div>
          <div style={{ ...s.hoursRow, color: "#e05a5a" }}><span>שבת</span><span>סגור</span></div>
        </div>
      </div>
    </div>
  );
}

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
    try {
      await signUp(form);
      setView("home");
    } catch(e) { setErrors({ general: e.message }); }
    setLoading(false);
  };

  return (
    <div style={s.page}>
      <div style={s.bookHeader}>
        <button style={s.back} onClick={() => setView("home")}>← חזור</button>
        <h2 style={s.bookTitle}>הרשמה</h2>
        <div />
      </div>
      <div style={s.card}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div>
            <label style={s.label}>שם פרטי</label>
            <input style={{ ...s.input, borderColor: errors.firstName ? "#e05a5a" : "#2a2015" }}
              placeholder="ישראל" value={form.firstName} onChange={e => set("firstName", e.target.value)} />
            {errors.firstName && <p style={s.error}>{errors.firstName}</p>}
          </div>
          <div>
            <label style={s.label}>שם משפחה</label>
            <input style={{ ...s.input, borderColor: errors.lastName ? "#e05a5a" : "#2a2015" }}
              placeholder="ישראלי" value={form.lastName} onChange={e => set("lastName", e.target.value)} />
            {errors.lastName && <p style={s.error}>{errors.lastName}</p>}
          </div>
        </div>
        <label style={s.label}>כתובת מייל</label>
        <input style={{ ...s.input, borderColor: errors.email ? "#e05a5a" : "#2a2015" }}
          placeholder="israel@gmail.com" type="email" value={form.email} onChange={e => set("email", e.target.value)} />
        {errors.email && <p style={s.error}>{errors.email}</p>}
        <label style={s.label}>טלפון</label>
        <input style={{ ...s.input, borderColor: errors.phone ? "#e05a5a" : "#2a2015" }}
          placeholder="050-0000000" value={form.phone} onChange={e => set("phone", e.target.value)} />
        {errors.phone && <p style={s.error}>{errors.phone}</p>}
        <label style={s.label}>סיסמה</label>
        <input style={{ ...s.input, borderColor: errors.password ? "#e05a5a" : "#2a2015" }}
          type="password" placeholder="לפחות 6 תווים" value={form.password} onChange={e => set("password", e.target.value)} />
        {errors.password && <p style={s.error}>{errors.password}</p>}
        {errors.general && <p style={{ ...s.error, marginBottom: 10 }}>{errors.general}</p>}
        <button style={{ ...s.btnPrimary, width: "100%" }} disabled={loading} onClick={handleSubmit}>
          {loading ? "נרשם..." : "הרשמה"}
        </button>
        <p style={{ textAlign: "center", color: "#8b7355", fontSize: 13, marginTop: 16 }}>
          כבר יש לך חשבון?{" "}
          <span style={{ color: "#c8a97e", cursor: "pointer" }} onClick={() => setView("signin")}>התחבר</span>
        </p>
      </div>
    </div>
  );
}

function SignIn({ setView, signIn }) {
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async () => {
    if (!form.email || !form.password) { setError("נא למלא את כל השדות"); return; }
    setLoading(true);
    try { await signIn(form); setView("home"); }
    catch(e) { setError("מייל או סיסמה שגויים"); }
    setLoading(false);
  };

  return (
    <div style={s.page}>
      <div style={s.bookHeader}>
        <button style={s.back} onClick={() => setView("home")}>← חזור</button>
        <h2 style={s.bookTitle}>כניסה</h2>
        <div />
      </div>
      <div style={s.card}>
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
        <p style={{ textAlign: "center", color: "#8b7355", fontSize: 13, marginTop: 16 }}>
          אין לך חשבון?{" "}
          <span style={{ color: "#c8a97e", cursor: "pointer" }} onClick={() => setView("signup")}>הרשמה</span>
        </p>
      </div>
    </div>
  );
}

function BookView({ setView, addAppointment, isSlotTaken, isDateBlocked, barbershop, loadAppointments, user, profile }) {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    name: profile ? `${profile.first_name} ${profile.last_name}` : "",
    phone: profile?.phone || "",
    service: "", date: "", time: ""
  });
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
        <p style={{ color: "#f0e8d8", textAlign: "center", marginBottom: 20 }}>כדי לקבוע תור יש להתחבר תחילה</p>
        <button style={{ ...s.btnPrimary, width: "100%", marginBottom: 10 }} onClick={() => setView("signin")}>כניסה</button>
        <button style={{ ...s.btnGhost, width: "100%" }} onClick={() => setView("signup")}>הרשמה</button>
      </div>
    </div>
  );

  if (success) return (
    <div style={s.page}>
      <div style={s.successBox}>
        <div style={s.successIcon}>✓</div>
        <h2 style={s.successTitle}>התור נקבע בהצלחה!</h2>
        <p style={s.successDetail}>{formatDate(form.date)} בשעה {form.time}</p>
        <p style={s.successDetail}>{SERVICES.find(sv => sv.id === form.service)?.name}</p>
        <button style={{ ...s.btnPrimary, marginTop: 28 }} onClick={() => setView("home")}>חזרה לעמוד הבית</button>
      </div>
    </div>
  );

  return (
    <div style={s.page}>
      <div style={s.bookHeader}>
        <button style={s.back} onClick={() => step > 1 ? setStep(st => st - 1) : setView("home")}>← חזור</button>
        <h2 style={s.bookTitle}>קביעת תור</h2>
        <div style={s.steps}>{[1,2].map(n => <div key={n} style={{ ...s.stepDot, background: step >= n ? "#c8a97e" : "#2a2420" }} />)}</div>
      </div>

      {step === 1 && (
        <div style={s.card}>
          <h3 style={s.cardTitle}>בחר שירות</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {SERVICES.map(sv => (
              <div key={sv.id} style={{ ...s.optionRow, borderColor: form.service === sv.id ? "#c8a97e" : "#3a3028" }}
                onClick={() => set("service", sv.id)}>
                <div>
                  <div style={{ color: "#f0e8d8", fontWeight: 600 }}>{sv.name}</div>
                  <div style={{ color: "#8b7355", fontSize: 13 }}>{sv.duration} דקות</div>
                </div>
                <div style={{ color: "#c8a97e", fontWeight: 700 }}>₪{sv.price}</div>
              </div>
            ))}
          </div>
          <button style={{ ...s.btnPrimary, width: "100%", marginTop: 20 }} disabled={!form.service} onClick={() => setStep(2)}>המשך</button>
        </div>
      )}

      {step === 2 && (
        <div style={s.card}>
          <h3 style={s.cardTitle}>תאריך ושעה</h3>
          <label style={s.label}>תאריך</label>
          <input style={s.input} type="date" min={minDate} value={form.date}
            onChange={e => { set("date", e.target.value); set("time", ""); }} />
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
                      background: unavail ? "#1a1512" : form.time === t ? "#c8a97e" : "#2a2420",
                      color: unavail ? "#4a3f35" : form.time === t ? "#1a1512" : "#f0e8d8",
                      cursor: unavail ? "not-allowed" : "pointer",
                      border: form.time === t ? "none" : "1px solid #3a3028",
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

function AdminView({ appointments, cancelAppointment, setView, barbershop, loadAppointments, loading, blockedDates, toggleBlockedDate, isOwner, customers, loadCustomers }) {
  const [tab, setTab] = useState("appointments");
  const [filter, setFilter] = useState("upcoming");
  const [blockDate, setBlockDate] = useState("");
  const today = getTodayStr();

  useEffect(() => { loadAppointments(); }, [barbershop]);

  if (!isOwner) return (
    <div style={s.page}>
      <div style={s.card}>
        <p style={{ color: "#e05a5a", textAlign: "center" }}>אין לך הרשאה לדף זה</p>
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
      <div style={s.bookHeader}>
        <button style={s.back} onClick={() => setView("home")}>← יציאה</button>
        <h2 style={s.bookTitle}>ניהול</h2>
        <div style={{ color: "#c8a97e", fontSize: 14 }}>{appointments.length} תורים</div>
      </div>

      <div style={{ display: "flex", gap: 0, borderBottom: "1px solid #2a2015", margin: "0 20px" }}>
        {[["appointments","📅 תורים"],["customers","👥 לקוחות"],["ooo","🏖️ חופשות"]].map(([k,l]) => (
          <button key={k} onClick={() => { setTab(k); if (k === "customers") loadCustomers(); }} style={{
            flex: 1, background: "none", border: "none",
            borderBottom: tab === k ? "2px solid #c8a97e" : "2px solid transparent",
            color: tab === k ? "#c8a97e" : "#8b7355",
            padding: "12px 4px", fontSize: 13, fontWeight: 600, cursor: "pointer"
          }}>{l}</button>
        ))}
      </div>

      {tab === "appointments" && (
        <>
          <div style={s.filterRow}>
            {[["upcoming","קרובים"],["past","עבר"],["all","הכל"]].map(([k,l]) => (
              <button key={k} style={{ ...s.filterBtn, background: filter === k ? "#c8a97e" : "#2a2420", color: filter === k ? "#1a1512" : "#8b7355" }}
                onClick={() => setFilter(k)}>{l}</button>
            ))}
            <button style={{ ...s.filterBtn, background: "#2a2420", color: "#8b7355" }} onClick={loadAppointments}>🔄</button>
          </div>
          {loading && <p style={{ textAlign: "center", color: "#8b7355", marginTop: 40 }}>טוען...</p>}
          {!loading && Object.keys(grouped).length === 0 && (
            <div style={{ textAlign: "center", color: "#6b5a4a", marginTop: 60 }}>
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
            <button style={{ ...s.filterBtn, background: "#2a2420", color: "#8b7355", padding: "8px 14px" }} onClick={loadCustomers}>🔄</button>
          </div>
          {customers.length === 0 && (
            <div style={{ textAlign: "center", color: "#6b5a4a", marginTop: 60 }}>
              <div style={{ fontSize: 40 }}>👥</div><p>אין לקוחות רשומים עדיין</p>
            </div>
          )}
          {customers.map(c => (
            <div key={c.id} style={s.apptCard}>
              <div style={{ flex: 1 }}>
                <div style={s.apptName}>{c.first_name} {c.last_name}</div>
                <div style={s.apptMeta}>📞 {c.phone}</div>
                <div style={s.apptMeta}>{c.email && `✉️ ${c.email}`}</div>
                <div style={{ ...s.apptMeta, marginTop: 2 }}>
                  נרשם: {new Date(c.created_at).toLocaleDateString("he-IL")}
                </div>
              </div>
              <div style={{ background: "#1e2a1e", border: "1px solid #2a4a2a", borderRadius: 6, padding: "4px 10px", color: "#6abf6a", fontSize: 12 }}>
                לקוח
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === "ooo" && (
        <div style={{ padding: "20px" }}>
          <div style={s.card}>
            <h3 style={s.cardTitle}>🏖️ Out of Office</h3>
            <p style={{ color: "#8b7355", fontSize: 13, marginBottom: 16 }}>בחר תאריכים שבהם המספרה סגורה — לקוחות לא יוכלו לקבוע תורים בימים אלו</p>
            <label style={s.label}>הוסף תאריך חסימה</label>
            <div style={{ display: "flex", gap: 10 }}>
              <input style={{ ...s.input, flex: 1, marginBottom: 0 }} type="date" min={today} value={blockDate}
                onChange={e => setBlockDate(e.target.value)} />
              <button style={{ ...s.btnPrimary, whiteSpace: "nowrap" }}
                disabled={!blockDate}
                onClick={() => { toggleBlockedDate(blockDate); setBlockDate(""); }}>
                {blockedDates.includes(blockDate) ? "בטל חסימה" : "חסום יום"}
              </button>
            </div>
          </div>
          {blockedDates.length > 0 ? (
            <div style={{ marginTop: 20 }}>
              <div style={s.dateLabel}>ימים חסומים</div>
              {[...blockedDates].sort().map(d => (
                <div key={d} style={{ ...s.apptCard, background: "#2a1515" }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ color: "#e05a5a", fontWeight: 600 }}>🚫 {formatDate(d)}</div>
                  </div>
                  <button style={s.cancelBtn} onClick={() => toggleBlockedDate(d)}>הסר</button>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ textAlign: "center", color: "#6b5a4a", marginTop: 40 }}>
              <div style={{ fontSize: 40 }}>✅</div><p>אין ימים חסומים</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const s = {
  page: { minHeight: "100vh", background: "#0f0c0a", color: "#f0e8d8", fontFamily: "'Segoe UI', Tahoma, sans-serif", direction: "rtl", padding: "0 0 40px" },
  hero: { textAlign: "center", padding: "60px 24px 48px", background: "linear-gradient(180deg, #1a1208 0%, #0f0c0a 100%)", borderBottom: "1px solid #2a2015" },
  scissors: { fontSize: 48, display: "block", marginBottom: 12, filter: "drop-shadow(0 0 12px #c8a97e88)" },
  heroTitle: { fontSize: 42, fontWeight: 800, color: "#c8a97e", margin: "0 0 8px", letterSpacing: 2, textTransform: "uppercase" },
  heroSub: { color: "#8b7355", fontSize: 15, margin: "0 0 32px", letterSpacing: 1 },
  heroButtons: { display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" },
  btnPrimary: { background: "#c8a97e", color: "#1a1512", border: "none", borderRadius: 8, padding: "13px 28px", fontSize: 15, fontWeight: 700, cursor: "pointer" },
  btnGhost: { background: "transparent", color: "#c8a97e", border: "1px solid #c8a97e", borderRadius: 8, padding: "12px 24px", fontSize: 14, cursor: "pointer" },
  services: { padding: "32px 20px 0" },
  sectionTitle: { color: "#c8a97e", fontSize: 16, letterSpacing: 2, textTransform: "uppercase", marginBottom: 16 },
  serviceGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 },
  serviceCard: { background: "#1a1512", border: "1px solid #2a2015", borderRadius: 10, padding: "14px 16px" },
  serviceCardTitle: { fontWeight: 600, fontSize: 14, marginBottom: 8 },
  serviceCardMeta: { display: "flex", justifyContent: "space-between", color: "#8b7355", fontSize: 13 },
  price: { color: "#c8a97e", fontWeight: 700 },
  hoursBox: { marginTop: 24, background: "#1a1512", border: "1px solid #2a2015", borderRadius: 10, padding: 16 },
  hoursTitle: { color: "#c8a97e", fontSize: 14, margin: "0 0 12px", letterSpacing: 1 },
  hoursRow: { display: "flex", justifyContent: "space-between", color: "#8b7355", fontSize: 14, marginBottom: 6 },
  bookHeader: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 20px 16px", borderBottom: "1px solid #2a2015" },
  bookTitle: { color: "#c8a97e", fontSize: 18, margin: 0 },
  back: { background: "none", border: "none", color: "#8b7355", cursor: "pointer", fontSize: 14, padding: 0 },
  steps: { display: "flex", gap: 6 },
  stepDot: { width: 8, height: 8, borderRadius: "50%", transition: "background .3s" },
  card: { margin: "24px 20px 0", background: "#1a1512", border: "1px solid #2a2015", borderRadius: 14, padding: "24px 20px" },
  cardTitle: { color: "#c8a97e", fontSize: 17, fontWeight: 700, marginTop: 0, marginBottom: 20 },
  label: { display: "block", color: "#8b7355", fontSize: 13, marginBottom: 6 },
  input: { width: "100%", background: "#0f0c0a", border: "1px solid #2a2015", borderRadius: 8, color: "#f0e8d8", padding: "11px 12px", fontSize: 15, outline: "none", boxSizing: "border-box", marginBottom: 14, direction: "rtl" },
  error: { color: "#e05a5a", fontSize: 12, margin: "0 0 10px" },
  optionRow: { display: "flex", justifyContent: "space-between", alignItems: "center", background: "#0f0c0a", border: "1.5px solid", borderRadius: 10, padding: "12px 14px", cursor: "pointer" },
  timeGrid: { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginTop: 8 },
  timeSlot: { borderRadius: 7, padding: "9px 4px", textAlign: "center", fontSize: 13, fontWeight: 600 },
  closedBox: { background: "#2a1515", border: "1px solid #5a2020", borderRadius: 8, padding: "12px 16px", color: "#e05a5a", textAlign: "center", marginTop: 12 },
  successBox: { margin: "60px 24px 0", background: "#1a1512", border: "1px solid #c8a97e44", borderRadius: 16, padding: "40px 24px", textAlign: "center" },
  successIcon: { width: 56, height: 56, background: "#c8a97e", color: "#1a1512", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26, fontWeight: 700, margin: "0 auto 20px" },
  successTitle: { color: "#c8a97e", fontSize: 22, margin: "0 0 12px" },
  successDetail: { color: "#f0e8d8", fontSize: 15, margin: "4px 0" },
  filterRow: { display: "flex", gap: 8, padding: "16px 20px 0" },
  filterBtn: { flex: 1, border: "none", borderRadius: 7, padding: "9px 0", fontSize: 13, fontWeight: 600, cursor: "pointer" },
  dateLabel: { color: "#8b7355", fontSize: 13, letterSpacing: 1, marginBottom: 8, padding: "0 4px" },
  apptCard: { display: "flex", alignItems: "center", background: "#1a1512", border: "1px solid #2a2015", borderRadius: 10, padding: "14px 16px", marginBottom: 8 },
  apptTime: { color: "#c8a97e", fontWeight: 700, fontSize: 16 },
  apptName: { color: "#f0e8d8", fontWeight: 600, fontSize: 14, marginTop: 2 },
  apptMeta: { color: "#8b7355", fontSize: 12, marginTop: 3 },
  cancelBtn: { background: "transparent", border: "1px solid #5a2020", color: "#e05a5a", borderRadius: 7, padding: "7px 14px", fontSize: 12, cursor: "pointer" },
};
