import { useState, useEffect } from "react";

const SUPABASE_URL = "https://oiusfwcdqyyfxzpdoqkm.supabase.co";
const SUPABASE_KEY = "sb_publishable_WpwBaxSGrPOa8dXDab5Vug_vfZpDQNR";

async function supabase(path, options = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    headers: {
      "apikey": SUPABASE_KEY,
      "Authorization": `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
      "Prefer": options.prefer || "return=representation",
      ...options.headers,
    },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message || "Supabase error");
  }
  const text = await res.text();
  return text ? JSON.parse(text) : [];
}

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
  const day = d.getDay(); // 0=Sun, 1=Mon, ..., 5=Fri, 6=Sat

  if (day === 6) return []; // שבת — סגור

  const isFriday = day === 5;
  const endHour = isFriday ? "13:30" : "19:00";
  const slots = [];
  let h = 8, m = 0;

  while (true) {
    const timeStr = `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`;
    slots.push(timeStr);
    if (timeStr === endHour) break;
    m += 30;
    if (m >= 60) { m = 0; h++; }
  }
  return slots;
}

function getTodayStr() {
  return new Date().toISOString().split("T")[0];
}

function getNowTime() {
  const now = new Date();
  return `${String(now.getHours()).padStart(2,"0")}:${String(now.getMinutes()).padStart(2,"0")}`;
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
  // אם כל השעות של היום עברו — מינימום מחר
  const todaySlots = generateTimeSlots(today);
  const now = getNowTime();
  const hasAvailable = todaySlots.some(t => t > now);
  if (!hasAvailable) {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString().split("T")[0];
  }
  return today;
}

export default function App() {
  const [view, setView] = useState("home");
  const [barbershop, setBarbershop] = useState(null);
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase("/barbershops?slug=eq.bendahair")
      .then(data => { if (data[0]) setBarbershop(data[0]); })
      .catch(console.error);
  }, []);

  const loadAppointments = async () => {
    if (!barbershop) return;
    setLoading(true);
    try {
      const data = await supabase(`/appointments?barbershop_id=eq.${barbershop.id}&order=date.asc,time.asc`);
      setAppointments(data);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  const addAppointment = async (appt) => {
    const data = await supabase("/appointments", {
      method: "POST",
      body: JSON.stringify({ ...appt, barbershop_id: barbershop.id }),
    });
    return data[0];
  };

  const cancelAppointment = async (id) => {
    await supabase(`/appointments?id=eq.${id}`, { method: "DELETE", prefer: "" });
    setAppointments(prev => prev.filter(a => a.id !== id));
  };

  const isSlotTaken = (date, time) =>
    appointments.some(a => a.date === date && a.time === time);

  if (view === "home") return <Home setView={setView} barbershop={barbershop} />;
  if (view === "book") return <BookView setView={setView} addAppointment={addAppointment} isSlotTaken={isSlotTaken} barbershop={barbershop} appointments={appointments} loadAppointments={loadAppointments} />;
  if (view === "admin") return <AdminView appointments={appointments} cancelAppointment={cancelAppointment} setView={setView} barbershop={barbershop} loadAppointments={loadAppointments} loading={loading} />;
}

function Home({ setView, barbershop }) {
  return (
    <div style={styles.page}>
      <div style={styles.hero}>
        <div style={styles.scissors}>✂</div>
        <h1 style={styles.heroTitle}>{barbershop?.name || "The Barber"}</h1>
        <p style={styles.heroSub}>מספרה מקצועית · זמינה בשבילך</p>
        <div style={styles.heroButtons}>
          <button style={styles.btnPrimary} onClick={() => setView("book")}>קבע תור עכשיו</button>
          <button style={styles.btnGhost} onClick={() => setView("admin")}>כניסת בעל עסק</button>
        </div>
      </div>
      <div style={styles.services}>
        <h2 style={styles.sectionTitle}>השירותים שלנו</h2>
        <div style={styles.serviceGrid}>
          {SERVICES.map(s => (
            <div key={s.id} style={styles.serviceCard}>
              <div style={styles.serviceCardTitle}>{s.name}</div>
              <div style={styles.serviceCardMeta}>
                <span>⏱ {s.duration} דק׳</span>
                <span style={styles.price}>₪{s.price}</span>
              </div>
            </div>
          ))}
        </div>
        <div style={styles.hoursBox}>
          <h3 style={styles.hoursTitle}>שעות פעילות</h3>
          <div style={styles.hoursRow}><span>ראשון–חמישי</span><span>08:00–19:00</span></div>
          <div style={styles.hoursRow}><span>שישי</span><span>08:00–13:30</span></div>
          <div style={{ ...styles.hoursRow, color: "#e05a5a" }}><span>שבת</span><span>סגור</span></div>
        </div>
      </div>
    </div>
  );
}

function BookView({ setView, addAppointment, isSlotTaken, barbershop, appointments, loadAppointments }) {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({ name: "", phone: "", service: "", date: "", time: "" });
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState({});

  const minDate = getMinDate();

  useEffect(() => { loadAppointments(); }, [barbershop]);

  const set = (k, v) => {
    setForm(f => ({ ...f, [k]: v }));
    setErrors(e => ({ ...e, [k]: "" }));
  };

  const validateStep1 = () => {
    const errs = {};
    if (!form.name.trim()) errs.name = "נא להכניס שם";
    if (!form.phone.trim()) errs.phone = "נא להכניס טלפון";
    else if (!/^[0-9\-+\s]{9,15}$/.test(form.phone.trim())) errs.phone = "מספר טלפון לא תקין";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const timeSlots = generateTimeSlots(form.date);
  const isClosed = form.date && timeSlots.length === 0;

  const handleSubmit = async () => {
    if (isSlotInPast(form.date, form.time)) {
      setErrors({ time: "שעה זו כבר עברה" });
      return;
    }
    if (isSlotTaken(form.date, form.time)) {
      setErrors({ time: "שעה זו כבר תפוסה" });
      return;
    }
    setSubmitting(true);
    try {
      await addAppointment(form);
      setSuccess(true);
    } catch (e) {
      alert("שגיאה בקביעת התור, נסה שוב");
    }
    setSubmitting(false);
  };

  if (success) return (
    <div style={styles.page}>
      <div style={styles.successBox}>
        <div style={styles.successIcon}>✓</div>
        <h2 style={styles.successTitle}>התור נקבע בהצלחה!</h2>
        <p style={styles.successDetail}>{formatDate(form.date)} בשעה {form.time}</p>
        <p style={styles.successDetail}>{SERVICES.find(s => s.id === form.service)?.name}</p>
        <p style={{ color: "#8b7355", marginTop: 8 }}>שם: {form.name} | טל׳: {form.phone}</p>
        <button style={{ ...styles.btnPrimary, marginTop: 28 }} onClick={() => setView("home")}>חזרה לעמוד הבית</button>
      </div>
    </div>
  );

  return (
    <div style={styles.page}>
      <div style={styles.bookHeader}>
        <button style={styles.back} onClick={() => step > 1 ? setStep(s => s - 1) : setView("home")}>← חזור</button>
        <h2 style={styles.bookTitle}>קביעת תור</h2>
        <div style={styles.steps}>
          {[1,2,3].map(n => (
            <div key={n} style={{ ...styles.stepDot, background: step >= n ? "#c8a97e" : "#2a2420" }} />
          ))}
        </div>
      </div>

      {step === 1 && (
        <div style={styles.card}>
          <h3 style={styles.cardTitle}>פרטים אישיים</h3>
          <label style={styles.label}>שם מלא</label>
          <input style={{ ...styles.input, borderColor: errors.name ? "#e05a5a" : "#2a2015" }}
            placeholder="ישראל ישראלי" value={form.name} onChange={e => set("name", e.target.value)} />
          {errors.name && <p style={styles.error}>{errors.name}</p>}
          <label style={styles.label}>טלפון</label>
          <input style={{ ...styles.input, borderColor: errors.phone ? "#e05a5a" : "#2a2015" }}
            placeholder="050-0000000" value={form.phone} onChange={e => set("phone", e.target.value)} />
          {errors.phone && <p style={styles.error}>{errors.phone}</p>}
          <button style={{ ...styles.btnPrimary, width: "100%", marginTop: 20 }}
            onClick={() => { if (validateStep1()) setStep(2); }}>
            המשך
          </button>
        </div>
      )}

      {step === 2 && (
        <div style={styles.card}>
          <h3 style={styles.cardTitle}>בחר שירות</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {SERVICES.map(s => (
              <div key={s.id}
                style={{ ...styles.optionRow, borderColor: form.service === s.id ? "#c8a97e" : "#3a3028" }}
                onClick={() => set("service", s.id)}>
                <div>
                  <div style={{ color: "#f0e8d8", fontWeight: 600 }}>{s.name}</div>
                  <div style={{ color: "#8b7355", fontSize: 13 }}>{s.duration} דקות</div>
                </div>
                <div style={{ color: "#c8a97e", fontWeight: 700 }}>₪{s.price}</div>
              </div>
            ))}
          </div>
          <button style={{ ...styles.btnPrimary, width: "100%", marginTop: 20 }}
            disabled={!form.service} onClick={() => setStep(3)}>המשך</button>
        </div>
      )}

      {step === 3 && (
        <div style={styles.card}>
          <h3 style={styles.cardTitle}>תאריך ושעה</h3>
          <label style={styles.label}>תאריך</label>
          <input style={styles.input} type="date" min={minDate} value={form.date}
            onChange={e => { set("date", e.target.value); set("time", ""); }} />

          {isClosed && (
            <div style={styles.closedBox}>🚫 המספרה סגורה בשבת</div>
          )}

          {form.date && !isClosed && (
            <>
              <label style={{ ...styles.label, marginTop: 16 }}>
                שעה פנויה
                {new Date(form.date + "T12:00:00").getDay() === 5 && 
                  <span style={{ color: "#c8a97e", marginRight: 8, fontSize: 12 }}>שישי — עד 13:30</span>}
              </label>
              <div style={styles.timeGrid}>
                {timeSlots.map(t => {
                  const taken = isSlotTaken(form.date, t);
                  const past = isSlotInPast(form.date, t);
                  const unavailable = taken || past;
                  return (
                    <div key={t}
                      style={{
                        ...styles.timeSlot,
                        background: unavailable ? "#1a1512" : form.time === t ? "#c8a97e" : "#2a2420",
                        color: unavailable ? "#4a3f35" : form.time === t ? "#1a1512" : "#f0e8d8",
                        cursor: unavailable ? "not-allowed" : "pointer",
                        border: form.time === t ? "none" : "1px solid #3a3028",
                        textDecoration: past && !taken ? "line-through" : "none",
                      }}
                      onClick={() => !unavailable && set("time", t)}>
                      {t}
                    </div>
                  );
                })}
              </div>
              {errors.time && <p style={styles.error}>{errors.time}</p>}
            </>
          )}

          <button style={{ ...styles.btnPrimary, width: "100%", marginTop: 20 }}
            disabled={!form.date || !form.time || submitting || isClosed}
            onClick={handleSubmit}>
            {submitting ? "שומר..." : "קבע תור ✓"}
          </button>
        </div>
      )}
    </div>
  );
}

function AdminView({ appointments, cancelAppointment, setView, barbershop, loadAppointments, loading }) {
  const [unlocked, setUnlocked] = useState(false);
  const [pass, setPass] = useState("");
  const [passError, setPassError] = useState(false);
  const [filter, setFilter] = useState("upcoming");
  const today = getTodayStr();

  const handleLogin = () => {
    if (pass === (barbershop?.password || "1234")) { setUnlocked(true); loadAppointments(); }
    else setPassError(true);
  };

  if (!unlocked) return (
    <div style={styles.page}>
      <div style={styles.card}>
        <button style={styles.back} onClick={() => setView("home")}>← חזור</button>
        <h2 style={{ ...styles.cardTitle, marginTop: 12 }}>כניסת בעל עסק</h2>
        <label style={styles.label}>סיסמה</label>
        <input style={{ ...styles.input, letterSpacing: 4 }} type="password" placeholder="••••"
          value={pass} onChange={e => setPass(e.target.value)}
          onKeyDown={e => e.key === "Enter" && handleLogin()} />
        {passError && <p style={{ color: "#e05a5a", fontSize: 13, marginTop: 6 }}>סיסמה שגויה</p>}
        <button style={{ ...styles.btnPrimary, width: "100%", marginTop: 16 }} onClick={handleLogin}>כניסה</button>
      </div>
    </div>
  );

  const sorted = [...appointments].sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return a.time.localeCompare(b.time);
  });

  const filtered = sorted.filter(a => {
    if (filter === "upcoming") return a.date > today || (a.date === today && a.time > getNowTime());
    if (filter === "past") return a.date < today || (a.date === today && a.time <= getNowTime());
    return true;
  });

  const grouped = filtered.reduce((acc, a) => {
    if (!acc[a.date]) acc[a.date] = [];
    acc[a.date].push(a);
    return acc;
  }, {});

  return (
    <div style={styles.page}>
      <div style={styles.bookHeader}>
        <button style={styles.back} onClick={() => setView("home")}>← יציאה</button>
        <h2 style={styles.bookTitle}>ניהול תורים</h2>
        <div style={{ color: "#c8a97e", fontSize: 14 }}>{appointments.length} תורים</div>
      </div>

      <div style={styles.filterRow}>
        {[["upcoming","קרובים"],["past","עבר"],["all","הכל"]].map(([k,l]) => (
          <button key={k}
            style={{ ...styles.filterBtn, background: filter === k ? "#c8a97e" : "#2a2420", color: filter === k ? "#1a1512" : "#8b7355" }}
            onClick={() => setFilter(k)}>{l}</button>
        ))}
        <button style={{ ...styles.filterBtn, background: "#2a2420", color: "#8b7355" }} onClick={loadAppointments}>🔄</button>
      </div>

      {loading && <p style={{ textAlign: "center", color: "#8b7355", marginTop: 40 }}>טוען...</p>}

      {!loading && Object.keys(grouped).length === 0 && (
        <div style={{ textAlign: "center", color: "#6b5a4a", marginTop: 60 }}>
          <div style={{ fontSize: 40 }}>📋</div>
          <p>אין תורים להצגה</p>
        </div>
      )}

      <div style={{ padding: "16px 20px 0" }}>
        {Object.entries(grouped).map(([date, appts]) => (
          <div key={date} style={{ marginBottom: 24 }}>
            <div style={styles.dateLabel}>{formatDate(date)}</div>
            {appts.map(a => {
              const svc = SERVICES.find(s => s.id === a.service);
              const past = isSlotInPast(a.date, a.time);
              return (
                <div key={a.id} style={{ ...styles.apptCard, opacity: past ? 0.5 : 1 }}>
                  <div style={{ flex: 1 }}>
                    <div style={styles.apptTime}>{a.time}</div>
                    <div style={styles.apptName}>{a.name}</div>
                    <div style={styles.apptMeta}>{a.phone} · {svc?.name} · ₪{svc?.price}</div>
                  </div>
                  <button style={styles.cancelBtn} onClick={() => cancelAppointment(a.id)}>ביטול</button>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

const styles = {
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
  hoursBox: { marginTop: 24, background: "#1a1512", border: "1px solid #2a2015", borderRadius: 10, padding: "16px" },
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
  input: { width: "100%", background: "#0f0c0a", border: "1px solid", borderRadius: 8, color: "#f0e8d8", padding: "11px 12px", fontSize: 15, outline: "none", boxSizing: "border-box", marginBottom: 4, direction: "rtl" },
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
