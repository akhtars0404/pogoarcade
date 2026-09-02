import { useState, useEffect, useCallback, useRef, createContext, useContext, Fragment } from "react";
import { BrowserRouter, Routes, Route, useNavigate, useParams } from "react-router-dom";
import { api, tokenStore } from "./api.js";
import { useMultiplayer } from "./useMultiplayer.js";
import { GameIcon } from "./GameIcons.jsx";

// ══════════════════════════════════════
// CONFIG & THEME
// ══════════════════════════════════════
const SITE = { name: "PoGo Arcade", domain: "pogoarcade.com", email: "contact@pogoarcade.com", year: new Date().getFullYear() };
const C = {
  bg: "#07070f", card: "rgba(255,255,255,0.04)", cardH: "rgba(255,255,255,0.08)",
  border: "rgba(255,255,255,0.08)", text: "#e2e8f0", textM: "#94a3b8", textD: "#64748b",
  violet: "#8b5cf6", cyan: "#06b6d4", amber: "#f59e0b", rose: "#f43f5e", emerald: "#10b981",
  pink: "#ec4899", lime: "#84cc16",
  adBg: "rgba(255,255,255,0.02)", adBd: "rgba(255,255,255,0.05)",
};
const F = "'Inter',system-ui,-apple-system,sans-serif";
const catC = { Strategy: C.violet, Puzzle: C.cyan, Action: C.amber, Kids: C.pink };

// ══════════════════════════════════════
// CONTEXTS
// ══════════════════════════════════════
const AuthCtx = createContext();
const useAuth = () => useContext(AuthCtx);
const NavCtx = createContext();
const useNav = () => useContext(NavCtx);

// ══════════════════════════════════════
// AUTH PROVIDER — talks to the real backend (see /backend) via src/api.js.
// Replaces the artifact-only window.storage approach used in the original
// preview build, since this now runs as a real deployed site.
// ══════════════════════════════════════
function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const token = tokenStore.get();
      if (token) {
        try {
          const { user } = await api.me();
          setUser(user);
        } catch {
          tokenStore.clear();
        }
      }
      setLoading(false);
    })();
  }, []);

  const signup = async (username, password, displayName) => {
    try {
      const { token, user } = await api.signup(username, password, displayName);
      tokenStore.set(token);
      setUser(user);
      return null;
    } catch (e) {
      return e.message;
    }
  };

  const login = async (username, password) => {
    try {
      const { token, user } = await api.login(username, password);
      tokenStore.set(token);
      setUser(user);
      return null;
    } catch (e) {
      return e.message;
    }
  };

  const logout = () => {
    tokenStore.clear();
    setUser(null);
  };

  // Local / vs-AI games call this after a round ends. Online multiplayer
  // games award points server-side via the socket "game:over" event instead
  // (see useMultiplayer.reportGameOver), so they don't call this.
  const recordScore = async (gameId, points) => {
    if (!tokenStore.get()) return; // guest play — nothing to persist
    try {
      const { user } = await api.recordScore(gameId, points);
      setUser(user);
    } catch {
      /* best-effort — don't interrupt gameplay if this fails */
    }
  };

  return <AuthCtx.Provider value={{ user, loading, signup, login, logout, recordScore }}>{children}</AuthCtx.Provider>;
}

// ══════════════════════════════════════
// AUTH SCREEN
// ══════════════════════════════════════
function AuthScreen() {
  const { signup, login } = useAuth();
  const { navigate } = useNav();
  const [tab, setTab] = useState("login");
  const [form, setForm] = useState({ username: "", password: "", displayName: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const upd = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const submit = async () => {
    setBusy(true); setError("");
    const err = tab === "login" ? await login(form.username, form.password) : await signup(form.username, form.password, form.displayName);
    if (err) setError(err);
    else navigate("portal");
    setBusy(false);
  };

  const inputStyle = { width: "100%", padding: "12px 16px", borderRadius: 10, border: `1px solid ${C.border}`, background: "rgba(0,0,0,0.4)", color: C.text, fontSize: 14, boxSizing: "border-box", marginBottom: 12, outline: "none", fontFamily: F };

  return (
    <main style={{ minHeight: "60vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: F, padding: "40px 16px" }}>
      <div style={{ width: "100%", maxWidth: 400 }}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ fontSize: 48, marginBottom: 8 }}>🕹️</div>
          <h1 style={{ fontSize: 28, fontWeight: 900, margin: "0 0 4px", background: "linear-gradient(135deg,#8b5cf6,#06b6d4,#f59e0b)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>{SITE.name}</h1>
          <p style={{ color: C.textM, fontSize: 14, margin: 0 }}>Sign in to track scores, compete on leaderboards, and play online</p>
        </div>

        <div style={{ display: "flex", marginBottom: 24, borderRadius: 12, overflow: "hidden", border: `1px solid ${C.border}` }}>
          {["login", "signup"].map(t => (
            <button key={t} onClick={() => { setTab(t); setError(""); }} style={{ flex: 1, padding: "12px", background: tab === t ? C.violet : "transparent", color: tab === t ? "#fff" : C.textM, border: "none", fontSize: 14, fontWeight: 600, cursor: "pointer", textTransform: "capitalize", fontFamily: F }}>{t === "login" ? "Sign In" : "Sign Up"}</button>
          ))}
        </div>

        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 24 }}>
          {tab === "signup" && <input placeholder="Display Name" value={form.displayName} onChange={e => upd("displayName", e.target.value)} style={inputStyle} />}
          <input placeholder="Username" value={form.username} onChange={e => upd("username", e.target.value)} style={inputStyle} />
          <input placeholder="Password" type="password" value={form.password} onChange={e => upd("password", e.target.value)} style={inputStyle} onKeyDown={e => e.key === "Enter" && submit()} />
          {error && <div style={{ color: C.rose, fontSize: 13, marginBottom: 12, padding: "8px 12px", background: `${C.rose}12`, borderRadius: 8 }}>{error}</div>}
          <button onClick={submit} disabled={busy} style={{ width: "100%", padding: "12px", borderRadius: 10, background: C.violet, color: "#fff", border: "none", fontSize: 15, fontWeight: 700, cursor: "pointer", opacity: busy ? 0.6 : 1, fontFamily: F }}>
            {busy ? "Please wait..." : tab === "login" ? "Sign In" : "Create Account"}
          </button>
        </div>

        <button onClick={() => navigate("portal")} style={{ display: "block", width: "100%", textAlign: "center", marginTop: 16, padding: "10px", background: "none", border: "none", color: C.textM, fontSize: 13, cursor: "pointer", fontFamily: F }}>
          ← Back to games (no account needed for solo play)
        </button>
      </div>
    </main>
  );
}

// ══════════════════════════════════════
// SHARED UI
// ══════════════════════════════════════
function AdSlot({ format = "horizontal", style: sx = {} }) {
  const dims = { horizontal: { minHeight: 90 }, rectangle: { minHeight: 250, maxWidth: 336 }, leaderboard: { minHeight: 90 }, sidebar: { minHeight: 600, maxWidth: 300 } };
  return (<div role="complementary" aria-label="Advertisement" style={{ background: C.adBg, border: `1px dashed ${C.adBd}`, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", margin: "20px auto", padding: 12, width: "100%", ...dims[format], ...sx }}>
    <span style={{ fontSize: 11, color: C.textD, letterSpacing: 1, textTransform: "uppercase" }}>Ad Space</span>
  </div>);
}

function CookieConsent() {
  const [show, setShow] = useState(() => {
    try { return !localStorage.getItem("cookie_ok"); } catch { return true; }
  });
  if (!show) return null;
  return (<div style={{ position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 9999, background: "rgba(10,10,26,0.97)", borderTop: `1px solid ${C.border}`, backdropFilter: "blur(16px)", padding: "14px 20px", fontFamily: F }}>
    <div style={{ maxWidth: 960, margin: "0 auto", display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12 }}>
      <p style={{ flex: 1, minWidth: 200, margin: 0, fontSize: 13, color: C.textM, lineHeight: 1.5 }}>We use cookies for site functionality and to serve personalized ads via Google AdSense. By continuing to use {SITE.domain}, you agree to our use of cookies. See our Privacy Policy for details.</p>
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={() => setShow(false)} style={{ padding: "8px 18px", borderRadius: 8, background: "transparent", border: `1px solid ${C.border}`, color: C.textM, fontSize: 13, cursor: "pointer", fontFamily: F }}>Decline</button>
        <button onClick={() => { try { localStorage.setItem("cookie_ok", "1"); } catch {} setShow(false); }} style={{ padding: "8px 18px", borderRadius: 8, background: C.violet, border: "none", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: F }}>Accept All Cookies</button>
      </div>
    </div>
  </div>);
}

function SignInPrompt() {
  const { user } = useAuth();
  const { navigate } = useNav();
  if (user) return null;
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8, padding: "10px 16px", marginBottom: 14, borderRadius: 10, background: `${C.violet}0c`, border: `1px solid ${C.violet}20`, fontFamily: F }}>
      <span style={{ fontSize: 13, color: C.textM }}>🔑 Sign in to save your scores, compete on leaderboards & play online</span>
      <button onClick={() => navigate("auth")} style={{ padding: "6px 16px", borderRadius: 8, background: C.violet, border: "none", color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: F, whiteSpace: "nowrap" }}>Sign In</button>
    </div>
  );
}

function SiteHeader() {
  const { navigate } = useNav();
  const { user, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const links = [{ l: "Home", p: "portal" }, { l: "Kids Zone", p: "kidszone" }, { l: "Leaderboard", p: "leaderboard" }, { l: "Events", p: "events" }, { l: "About", p: "about" }];
  return (<header style={{ position: "sticky", top: 0, zIndex: 100, background: "rgba(7,7,15,0.92)", borderBottom: `1px solid ${C.border}`, backdropFilter: "blur(16px)", fontFamily: F }}>
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "0 16px", display: "flex", alignItems: "center", justifyContent: "space-between", height: 56 }}>
      <button onClick={() => navigate("portal")} style={{ background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 8, padding: 0 }}>
        <span style={{ fontSize: 24 }}>🕹️</span><span style={{ fontSize: 18, fontWeight: 800, color: C.text }}>{SITE.name}</span>
      </button>
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <nav className="dnav" style={{ display: "flex", gap: 2 }}>
          {links.map(l => (<button key={l.p} onClick={() => navigate(l.p)} style={{ background: "none", border: "none", color: l.p === "kidszone" ? C.pink : C.textM, fontSize: 13, fontWeight: l.p === "kidszone" ? 700 : 500, cursor: "pointer", padding: "6px 10px", borderRadius: 6, fontFamily: F }}>{l.l}</button>))}
        </nav>

        {user ? (
          <div style={{ position: "relative" }}>
            <button onClick={() => setProfileOpen(!profileOpen)} style={{ background: C.violet, border: "none", width: 34, height: 34, borderRadius: "50%", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", marginLeft: 8 }}>
              {user.displayName?.[0]?.toUpperCase() || "?"}
            </button>
            {profileOpen && (<div style={{ position: "absolute", right: 0, top: 42, background: "#12121f", border: `1px solid ${C.border}`, borderRadius: 12, padding: 8, minWidth: 180, boxShadow: "0 8px 32px rgba(0,0,0,0.5)" }}>
              <div style={{ padding: "8px 12px", borderBottom: `1px solid ${C.border}`, marginBottom: 4 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{user.displayName}</div>
                <div style={{ fontSize: 11, color: C.textD }}>@{user.username}</div>
              </div>
              {[{ l: "Dashboard", p: "dashboard" }, { l: "Leaderboard", p: "leaderboard" }].map(i => (
                <button key={i.p} onClick={() => { navigate(i.p); setProfileOpen(false); }} style={{ display: "block", width: "100%", textAlign: "left", padding: "8px 12px", background: "none", border: "none", color: C.textM, fontSize: 13, cursor: "pointer", borderRadius: 6, fontFamily: F }}>{i.l}</button>
              ))}
              <button onClick={() => { logout(); setProfileOpen(false); }} style={{ display: "block", width: "100%", textAlign: "left", padding: "8px 12px", background: "none", border: "none", color: C.rose, fontSize: 13, cursor: "pointer", borderRadius: 6, marginTop: 4, borderTop: `1px solid ${C.border}`, fontFamily: F }}>Sign Out</button>
            </div>)}
          </div>
        ) : (
          <button onClick={() => navigate("auth")} className="dnav" style={{ marginLeft: 8, padding: "7px 16px", borderRadius: 8, background: C.violet, border: "none", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: F }}>Sign In</button>
        )}

        <button className="mbtn" onClick={() => setMenuOpen(!menuOpen)} style={{ background: "none", border: "none", color: C.text, fontSize: 24, cursor: "pointer", display: "none", padding: 4, marginLeft: 8 }}>{menuOpen ? "✕" : "☰"}</button>
      </div>
    </div>
    {menuOpen && (<nav style={{ padding: "8px 16px 16px", display: "flex", flexDirection: "column", gap: 4 }}>
      {[...links, ...(user ? [{ l: "Dashboard", p: "dashboard" }] : [{ l: "Sign In", p: "auth" }])].map(l => (<button key={l.l} onClick={() => { navigate(l.p); setMenuOpen(false); }} style={{ background: C.card, border: `1px solid ${C.border}`, color: l.p === "auth" ? C.violet : l.p === "kidszone" ? C.pink : C.textM, fontSize: 14, padding: "10px 16px", borderRadius: 8, cursor: "pointer", textAlign: "left", fontFamily: F }}>{l.l}</button>))}
    </nav>)}
    <style>{`@media(max-width:640px){.dnav{display:none!important}.mbtn{display:block!important}}@media(min-width:641px){.mbtn{display:none!important}}`}</style>
  </header>);
}

function SiteFooter() {
  const { navigate } = useNav();
  return (<footer style={{ borderTop: `1px solid ${C.border}`, background: "rgba(0,0,0,0.3)", fontFamily: F, padding: "40px 16px 20px" }}>
    <div style={{ maxWidth: 1100, margin: "0 auto" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 28, marginBottom: 28 }}>
        <div><div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}><span style={{ fontSize: 20 }}>🕹️</span><span style={{ fontSize: 15, fontWeight: 800, color: C.text }}>{SITE.name}</span></div><p style={{ fontSize: 12, color: C.textD, lineHeight: 1.6, margin: 0 }}>Free classic & educational games at {SITE.domain} — play solo, locally, or online against another player.</p></div>
        {[
          { t: "Play", ls: [["All Games", "portal"], ["Kids Zone", "kidszone"], ["Leaderboard", "leaderboard"], ["Events", "events"]] },
          { t: "Legal", ls: [["Privacy Policy", "privacy"], ["Terms of Service", "terms"], ["Disclaimer", "disclaimer"]] },
          { t: "Info", ls: [["About Us", "about"], ["Contact Us", "contact"]] },
        ].map(col => (<div key={col.t}><h4 style={{ fontSize: 11, fontWeight: 700, color: C.textM, textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 10 }}>{col.t}</h4>{col.ls.map(([l, p]) => (<button key={l} onClick={() => navigate(p)} style={{ display: "block", background: "none", border: "none", color: C.textD, fontSize: 12, cursor: "pointer", padding: "3px 0", textAlign: "left", fontFamily: F }}>{l}</button>))}</div>))}
      </div>
      <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 14, fontSize: 12, color: C.textD, textAlign: "center" }}>© {SITE.year} {SITE.name} ({SITE.domain}). All rights reserved.</div>
    </div>
  </footer>);
}

function Breadcrumbs({ items }) {
  const { navigate } = useNav();
  return (<nav aria-label="Breadcrumb" style={{ padding: "12px 0 8px", fontSize: 12, color: C.textD }}>{items.map((item, i) => (<span key={i}>{i > 0 && <span style={{ margin: "0 6px" }}>/</span>}{item.page ? (<button onClick={() => navigate(item.page)} style={{ background: "none", border: "none", color: C.cyan, fontSize: 12, cursor: "pointer", padding: 0, fontFamily: F }}>{item.label}</button>) : (<span style={{ color: C.textM }}>{item.label}</span>)}</span>))}</nav>);
}

// Toggle real browser fullscreen on a given element ref — used to let a
// game fill the entire screen (esp. useful on mobile, where the address
// bar/chrome otherwise eats a big chunk of a small viewport).
function useFullscreen(ref) {
  const [active, setActive] = useState(false);
  useEffect(() => {
    const onChange = () => setActive(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);
  const toggle = useCallback(() => {
    if (document.fullscreenElement) {
      document.exitFullscreen?.();
    } else {
      ref.current?.requestFullscreen?.().catch(() => {});
    }
  }, [ref]);
  return [active, toggle];
}

function GS({ id, title, accent, guide, children }) {
  const g = GAMES.find(x => x.id === id);
  const stageRef = useRef(null);
  const [fs, toggleFs] = useFullscreen(stageRef);
  return (<main style={{ maxWidth: 860, margin: "0 auto", padding: "0 16px 48px", fontFamily: F }}>
    <Breadcrumbs items={[{ label: "Home", page: "portal" }, { label: title }]} />
    <AdSlot format="leaderboard" />
    <div style={{ display: "flex", alignItems: "center", gap: 14, margin: "8px 0 16px" }}>
      {g && <GameIcon id={g.id} cat={g.cat} size={52} rounded={16} />}
      <h1 style={{ fontSize: "clamp(22px,5vw,32px)", fontWeight: 800, color: accent, margin: 0 }}>{title}</h1>
    </div>
    <SignInPrompt />
    <div
      ref={stageRef}
      style={fs ? { background: C.bg, minHeight: "100vh", width: "100vw", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 16 } : undefined}
    >
      <div style={{ display: "flex", justifyContent: fs ? "center" : "flex-end", marginBottom: fs ? 14 : 10 }}>
        <button
          onClick={toggleFs}
          aria-label={fs ? "Exit full screen" : "Play full screen"}
          style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: "pointer", background: C.card, color: C.textM, border: `1px solid ${C.border}`, fontFamily: F }}
        >
          {fs ? "⤢ Exit Full Screen" : "⛶ Play Full Screen"}
        </button>
      </div>
      <section aria-label={`${title} game`} style={fs ? { width: "100%", maxWidth: 520 } : undefined}>{children}</section>
    </div>
    {!fs && <>
    <AdSlot format="rectangle" style={{ margin: "28px auto" }} />
    {guide && (<section style={{ marginTop: 28 }}><h2 style={{ fontSize: 18, fontWeight: 700, color: C.text, marginBottom: 12, paddingBottom: 8, borderBottom: `1px solid ${C.border}` }}>How to Play {title}</h2><div style={{ color: C.textM, fontSize: 14, lineHeight: 1.75 }}>{guide}</div></section>)}
    {g?.longDesc && (<section style={{ marginTop: 20, padding: 20, background: C.card, borderRadius: 12, border: `1px solid ${C.border}` }}><h3 style={{ fontSize: 15, fontWeight: 700, color: C.text, margin: "0 0 6px" }}>About {title}</h3><p style={{ margin: 0, fontSize: 13, color: C.textM, lineHeight: 1.7 }}>{g.longDesc}</p></section>)}
    <AdSlot format="leaderboard" />
    </>}
  </main>);
}

const MS = ({ modes, sel, onSel, ac }) => (<div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>{modes.map(m => (<button key={m} onClick={() => onSel(m)} style={{ padding: "7px 16px", borderRadius: 20, fontSize: 13, fontWeight: 600, cursor: "pointer", background: sel === m ? ac : C.card, color: sel === m ? "#fff" : C.textM, border: `1px solid ${sel === m ? ac : C.border}`, boxShadow: sel === m ? `0 0 14px ${ac}40` : "none", fontFamily: F }}>{m}</button>))}</div>);
const SB = ({ msg, ac }) => (<div style={{ textAlign: "center", padding: "10px 14px", marginBottom: 12, borderRadius: 10, background: `${ac}12`, border: `1px solid ${ac}25`, color: ac, fontWeight: 600, fontSize: 14 }}>{msg}</div>);
const RB = ({ onClick, ac, label }) => (<button onClick={onClick} style={{ display: "block", margin: "16px auto 0", padding: "10px 28px", borderRadius: 10, background: ac, color: "#fff", border: "none", fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: F }}>{label || "New Game"}</button>);
const SBd = ({ scores, ac }) => (<div style={{ display: "flex", justifyContent: "center", gap: 20, marginBottom: 12, flexWrap: "wrap" }}>{Object.entries(scores).map(([k, v]) => (<div key={k} style={{ textAlign: "center" }}><div style={{ fontSize: 10, color: C.textD, textTransform: "uppercase", letterSpacing: 1 }}>{k}</div><div style={{ fontSize: 20, fontWeight: 800, color: ac }}>{v}</div></div>))}</div>);

// ══════════════════════════════════════
// ONLINE MULTIPLAYER PANEL — shared by every turn-based board game's
// "Online" mode (Tic Tac Toe, Connect Four, Chess, Checkers, Dots & Boxes).
// ══════════════════════════════════════
function OnlinePanel({ mp, ac, mySymbolLabel, oppSymbolLabel }) {
  const { user } = useAuth();
  const { navigate } = useNav();
  const [joinCode, setJoinCode] = useState("");

  if (!user) {
    return (
      <div style={{ textAlign: "center", padding: "20px 16px", background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, marginBottom: 14 }}>
        <p style={{ color: C.textM, fontSize: 13, margin: "0 0 10px" }}>Sign in to play online against another registered player.</p>
        <button onClick={() => navigate("auth")} style={{ padding: "8px 20px", borderRadius: 8, background: ac, border: "none", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: F }}>Sign In</button>
      </div>
    );
  }

  if (mp.status === "matched" && mp.room) {
    return (
      <div style={{ textAlign: "center", padding: "10px 14px", marginBottom: 12, borderRadius: 10, background: `${C.emerald}12`, border: `1px solid ${C.emerald}25`, color: C.emerald, fontSize: 13, fontWeight: 600 }}>
        🟢 Playing {mp.room.opponent.displayName} online — you are {mp.room.you.slot === 0 ? mySymbolLabel : oppSymbolLabel}
        {mp.opponentLeft && <div style={{ color: C.rose, marginTop: 4 }}>Opponent disconnected.</div>}
      </div>
    );
  }

  if (mp.status === "finished") {
    return (<div style={{ textAlign: "center", marginBottom: 12 }}>
      <SB msg="Match complete!" ac={ac} />
      <button onClick={mp.reset} style={{ padding: "8px 20px", borderRadius: 8, background: ac, border: "none", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: F }}>Find New Match</button>
    </div>);
  }

  if (mp.status === "queued" || mp.status === "connecting") {
    return (<div style={{ textAlign: "center", padding: "20px 16px", background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, marginBottom: 14 }}>
      <div style={{ fontSize: 13, color: C.textM }}>🔎 Looking for an opponent...</div>
      <button onClick={mp.reset} style={{ marginTop: 10, padding: "6px 16px", borderRadius: 8, background: "transparent", border: `1px solid ${C.border}`, color: C.textM, fontSize: 12, cursor: "pointer", fontFamily: F }}>Cancel</button>
    </div>);
  }

  if (mp.status === "waiting-room" && mp.roomCode) {
    return (<div style={{ textAlign: "center", padding: "20px 16px", background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, marginBottom: 14 }}>
      <div style={{ fontSize: 13, color: C.textM, marginBottom: 8 }}>Share this code with a friend:</div>
      <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: 4, color: ac, marginBottom: 10 }}>{mp.roomCode}</div>
      <div style={{ fontSize: 12, color: C.textD }}>Waiting for them to join...</div>
      <button onClick={mp.reset} style={{ marginTop: 10, padding: "6px 16px", borderRadius: 8, background: "transparent", border: `1px solid ${C.border}`, color: C.textM, fontSize: 12, cursor: "pointer", fontFamily: F }}>Cancel</button>
    </div>);
  }

  return (<div style={{ textAlign: "center", padding: "20px 16px", background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, marginBottom: 14 }}>
    {mp.error && <div style={{ color: C.rose, fontSize: 12, marginBottom: 10 }}>{mp.error}</div>}
    <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap", marginBottom: 12 }}>
      <button onClick={mp.quickMatch} style={{ padding: "9px 20px", borderRadius: 8, background: ac, border: "none", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: F }}>⚡ Quick Match</button>
      <button onClick={mp.createRoom} style={{ padding: "9px 20px", borderRadius: 8, background: "transparent", border: `1px solid ${ac}60`, color: ac, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: F }}>Create Room</button>
    </div>
    <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
      <input value={joinCode} onChange={e => setJoinCode(e.target.value.toUpperCase())} placeholder="Room code" maxLength={5} style={{ width: 110, padding: "8px 10px", borderRadius: 8, border: `1px solid ${C.border}`, background: "rgba(0,0,0,0.3)", color: C.text, fontSize: 13, textAlign: "center", letterSpacing: 2, fontFamily: F }} />
      <button onClick={() => joinCode && mp.joinRoom(joinCode)} style={{ padding: "8px 16px", borderRadius: 8, background: C.card, border: `1px solid ${C.border}`, color: C.text, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: F }}>Join</button>
    </div>
  </div>);
}

// ══════════════════════════════════════
// GAME: TIC TAC TOE (vs AI / 2 Players / Online)
// ══════════════════════════════════════
function TicTacToe() {
  const ac = C.violet; const { recordScore } = useAuth();
  const [board, setBoard] = useState(Array(9).fill(null));
  const [xNext, setXN] = useState(true);
  const [mode, setMode] = useState("vs AI");
  const [scores, setScores] = useState({ X: 0, O: 0, Draw: 0 });
  const mp = useMultiplayer("tictactoe");
  const online = mode === "Online";
  const mySlot = mp.room?.you?.slot;
  const mySymbol = mySlot === 0 ? "X" : "O";
  const myTurn = online && mp.status === "matched" && mp.room.turn === mySlot;

  const WL = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
  const gw = (b) => { for (let l of WL) if (b[l[0]] && b[l[0]] === b[l[1]] && b[l[1]] === b[l[2]]) return { w: b[l[0]], l }; return null; };
  const res = gw(board), isDraw = !res && board.every(c => c);
  const mm = (b, isMax) => { const w = gw(b); if (w) return w.w === "O" ? 10 : -10; if (b.every(c => c)) return 0; let best = isMax ? -Infinity : Infinity; for (let i = 0; i < 9; i++) { if (!b[i]) { b[i] = isMax ? "O" : "X"; const s = mm(b, !isMax); best = isMax ? Math.max(best, s) : Math.min(best, s); b[i] = null; } } return best; };
  const ai = useCallback((b) => { let bv = -Infinity, bm = -1; for (let i = 0; i < 9; i++) { if (!b[i]) { b[i] = "O"; const v = mm(b, false); b[i] = null; if (v > bv) { bv = v; bm = i; } } } return bm; }, []);
  useEffect(() => { if (mode === "vs AI" && !xNext && !res && !isDraw) { const t = setTimeout(() => { const nb = [...board]; const m = ai(nb); if (m >= 0) { nb[m] = "O"; setBoard(nb); setXN(true); } }, 300); return () => clearTimeout(t); } }, [xNext, board, mode, res, isDraw, ai]);

  useEffect(() => {
    if (!online || !mp.lastOpponentMove) return;
    const { state } = mp.lastOpponentMove;
    if (state?.board) setBoard(state.board);
    if (typeof state?.xNext === "boolean") setXN(state.xNext);
  }, [mp.lastOpponentMove]);

  const scored = useRef(false);
  useEffect(() => {
    if (scored.current) return;
    if (res) {
      scored.current = true;
      setScores(p => ({ ...p, [res.w]: p[res.w] + 1 }));
      if (online) { if (res.w === mySymbol) mp.reportGameOver("win", 15); }
      else recordScore("tictactoe", res.w === "X" ? 10 : 5);
    } else if (isDraw) {
      scored.current = true;
      setScores(p => ({ ...p, Draw: p.Draw + 1 }));
      if (online) mp.reportGameOver("draw", 5);
      else recordScore("tictactoe", 3);
    }
  }, [res?.w, isDraw]);

  const click = (i) => {
    if (board[i] || res || isDraw) return;
    if (online) { if (!myTurn) return; }
    else if (mode === "vs AI" && !xNext) return;
    const nb = [...board];
    const sym = online ? mySymbol : (xNext ? "X" : "O");
    nb[i] = sym;
    setBoard(nb);
    const nextXNext = !xNext;
    setXN(nextXNext);
    if (online) mp.sendMove({ board: nb, xNext: nextXNext }, nextXNext ? 0 : 1);
  };
  const reset = () => { setBoard(Array(9).fill(null)); setXN(true); scored.current = false; if (online) mp.reset(); };

  return (<GS id="tictactoe" title="Tic Tac Toe" accent={ac} guide={<><p>Two players take turns marking spaces in a 3×3 grid. Place three marks in a row to win. Our AI uses minimax — it's unbeatable! In Online mode, you're matched with another signed-in player in real time.</p><p><strong>Tips:</strong> Take the center first. Create "forks" for two ways to win simultaneously.</p></>}>
    <MS modes={["vs AI", "2 Players", "Online"]} sel={mode} onSel={(m) => { setMode(m); reset(); setScores({ X: 0, O: 0, Draw: 0 }); }} ac={ac} />
    {online && <OnlinePanel mp={mp} ac={ac} mySymbolLabel="X" oppSymbolLabel="O" />}
    {(!online || mp.status === "matched" || mp.status === "finished") && (<>
      <SBd scores={scores} ac={ac} />
      <SB msg={res ? `${res.w} Wins!` : isDraw ? "Draw!" : online ? (myTurn ? "Your Turn" : "Opponent's Turn") : `${xNext ? "X" : "O"}'s Turn`} ac={ac} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 6, maxWidth: 280, margin: "0 auto", aspectRatio: "1" }}>
        {board.map((c, i) => (<button key={i} onClick={() => click(i)} style={{ background: res?.l?.includes(i) ? `${ac}25` : C.card, border: `1px solid ${res?.l?.includes(i) ? ac : C.border}`, borderRadius: 12, fontSize: "clamp(28px,8vw,44px)", fontWeight: 800, cursor: c || res ? "default" : "pointer", color: c === "X" ? C.cyan : c === "O" ? C.rose : "transparent", display: "flex", alignItems: "center", justifyContent: "center" }}>{c || "·"}</button>))}
      </div>
      {(!online || res || isDraw) && <RB onClick={reset} ac={ac} label={online ? "Find New Match" : "New Game"} />}
    </>)}
  </GS>);
}

// ══════════════════════════════════════
// GAME: CONNECT FOUR (vs AI / 2 Players / Online)
// ══════════════════════════════════════
function ConnectFour() {
  const ac = C.cyan, R = 6, CC = 7; const { recordScore } = useAuth();
  const empty = () => Array.from({ length: R }, () => Array(CC).fill(0));
  const [board, setBoard] = useState(empty()); const [turn, setTurn] = useState(1); const [mode, setMode] = useState("vs AI"); const [winner, setWinner] = useState(null); const [winCells, setWC] = useState([]); const [scores, setScores] = useState({ Red: 0, Yellow: 0, Draw: 0 });
  const mp = useMultiplayer("connect4");
  const online = mode === "Online";
  const mySlot = mp.room?.you?.slot; // slot0 = Red(1), slot1 = Yellow(2)
  const myPiece = mySlot === 0 ? 1 : 2;
  const myTurn = online && mp.status === "matched" && mp.room.turn === mySlot;

  const cw = (b) => { const dirs = [[0,1],[1,0],[1,1],[1,-1]]; for (let r = 0; r < R; r++) for (let c = 0; c < CC; c++) { if (!b[r][c]) continue; for (let [dr, dc] of dirs) { let cells = [[r, c]]; for (let k = 1; k < 4; k++) { const nr = r+dr*k, nc = c+dc*k; if (nr>=0&&nr<R&&nc>=0&&nc<CC&&b[nr][nc]===b[r][c]) cells.push([nr,nc]); else break; } if (cells.length===4) return { w: b[r][c], cells }; } } return null; };
  const drop = (b, col, p) => { const nb = b.map(r => [...r]); for (let r = R-1; r >= 0; r--) if (!nb[r][col]) { nb[r][col] = p; return nb; } return null; };
  const aiP = useCallback((b) => { for (let p of [2,1]) for (let c=0;c<CC;c++) { const r=drop(b,c,p); if(r&&cw(r)) return c; } const pref=[3,2,4,1,5,0,6]; for (let c of pref) if(drop(b,c,2)) return c; return 0; }, []);
  useEffect(() => { if (mode==="vs AI"&&turn===2&&!winner) { const t=setTimeout(()=>{ const col=aiP(board); const nb=drop(board,col,2); if(nb){ setBoard(nb); const w=cw(nb); if(w){setWinner(w.w);setWC(w.cells);setScores(p=>({...p,Yellow:p.Yellow+1}));recordScore("connect4",5);} else if(nb.every(r=>r.every(c=>c))){setWinner(-1);setScores(p=>({...p,Draw:p.Draw+1}));recordScore("connect4",3);} else setTurn(1); } },400); return()=>clearTimeout(t); } }, [turn,board,mode,winner,aiP]);

  useEffect(() => {
    if (!online || !mp.lastOpponentMove) return;
    const { state } = mp.lastOpponentMove;
    if (state?.board) setBoard(state.board);
    if (state?.turn) setTurn(state.turn);
    if (state?.winner !== undefined && state.winner !== null) { setWinner(state.winner); setWC(state.winCells || []); }
  }, [mp.lastOpponentMove]);

  const reportedRef = useRef(false);
  useEffect(() => {
    if (!online || winner === null || reportedRef.current) return;
    reportedRef.current = true;
    if (winner === -1) mp.reportGameOver("draw", 5);
    else if (winner === myPiece) mp.reportGameOver("win", 15);
  }, [winner]);

  const click = (col) => {
    if (winner) return;
    if (online) { if (!myTurn) return; }
    else if (mode === "vs AI" && turn === 2) return;
    const nb = drop(board, col, turn);
    if (!nb) return;
    setBoard(nb);
    const w = cw(nb);
    let nextTurn = turn===1?2:1, newWinner = null, newWC = [];
    if (w) {
      newWinner = w.w; newWC = w.cells;
      setWinner(w.w); setWC(w.cells);
      setScores(p=>({...p,[w.w===1?"Red":"Yellow"]:p[w.w===1?"Red":"Yellow"]+1}));
      if (!online) recordScore("connect4",10);
    } else if (nb.every(r=>r.every(c=>c))) {
      newWinner = -1;
      setWinner(-1);
      setScores(p=>({...p,Draw:p.Draw+1}));
      if (!online) recordScore("connect4",3);
    } else {
      setTurn(nextTurn);
    }
    if (online) mp.sendMove({ board: nb, turn: nextTurn, winner: newWinner, winCells: newWC }, newWinner !== null ? mySlot : nextTurn - 1);
  };
  const reset = () => { setBoard(empty());setTurn(1);setWinner(null);setWC([]); reportedRef.current = false; if (online) mp.reset(); };

  return (<GS id="connect4" title="Connect Four" accent={ac} guide={<p>Drop colored discs into a 7-column, 6-row grid. First to connect four in a row wins. Control the center column for the strongest position. Online mode matches you with another signed-in player in real time.</p>}>
    <MS modes={["vs AI","2 Players","Online"]} sel={mode} onSel={(m)=>{setMode(m);reset();setScores({Red:0,Yellow:0,Draw:0});}} ac={ac} />
    {online && <OnlinePanel mp={mp} ac={ac} mySymbolLabel="Red" oppSymbolLabel="Yellow" />}
    {(!online || mp.status==="matched" || mp.status==="finished") && (<>
      <SBd scores={scores} ac={ac} /><SB msg={winner===-1?"Draw!":winner?`${winner===1?"Red":"Yellow"} Wins!`:online?(myTurn?"Your Turn":"Opponent's Turn"):`${turn===1?"Red":"Yellow"}'s Turn`} ac={ac} />
      <div style={{ maxWidth:340,margin:"0 auto",background:"rgba(30,58,138,0.25)",borderRadius:14,padding:8,border:`1px solid ${C.border}` }}>
        {board.map((row,r)=>(<div key={r} style={{ display:"grid",gridTemplateColumns:`repeat(${CC},1fr)`,gap:4 }}>{row.map((cell,c)=>(<button key={c} onClick={()=>click(c)} style={{ aspectRatio:"1",borderRadius:"50%",border:"none",cursor:winner?"default":"pointer",background:cell===1?"#ef4444":cell===2?"#eab308":"rgba(0,0,0,0.4)",boxShadow:winCells.some(([wr,wc])=>wr===r&&wc===c)?`0 0 12px 4px ${cell===1?"#ef4444":"#eab308"}`:"inset 0 2px 4px rgba(0,0,0,0.3)" }} />))}</div>))}
      </div>
      {(!online || winner) && <RB onClick={reset} ac={ac} label={online ? "Find New Match" : "New Game"} />}
    </>)}
  </GS>);
}

// ══════════════════════════════════════
// GAME: MEMORY MATCH
// ══════════════════════════════════════
function MemoryMatch() {
  const ac=C.amber, { recordScore }=useAuth();
  const emojis=["🎮","🎲","🎯","🏆","🎪","🎭","🎨","🎬","🎵","🎸","🌟","🔥","💎","🚀","⚡","🦊","🐶","🌺"];
  const [sz,setSz]=useState(16);const [cards,setCards]=useState([]);const [fl,setFl]=useState([]);const [mt,setMt]=useState(new Set());const [mv,setMv]=useState(0);const [mode,setMode]=useState("Solo");const [p1,setP1]=useState(0);const [p2,setP2]=useState(0);const [cp,setCp]=useState(1);
  const init=useCallback((s)=>{const p=s/2;const d=[...emojis.slice(0,p),...emojis.slice(0,p)].sort(()=>Math.random()-0.5);setCards(d);setFl([]);setMt(new Set());setMv(0);setP1(0);setP2(0);setCp(1);},[]);
  useEffect(()=>{init(sz);},[sz,init]);
  const flip=(i)=>{if(fl.length===2||fl.includes(i)||mt.has(i))return;const nf=[...fl,i];setFl(nf);if(nf.length===2){setMv(m=>m+1);if(cards[nf[0]]===cards[nf[1]]){setTimeout(()=>{setMt(p=>new Set([...p,nf[0],nf[1]]));setFl([]);if(mode!=="Solo"){cp===1?setP1(s=>s+1):setP2(s=>s+1);}},400);}else{setTimeout(()=>{setFl([]);if(mode!=="Solo")setCp(p=>p===1?2:1);},800);}}};
  const done=mt.size===cards.length&&cards.length>0;
  useEffect(()=>{if(done)recordScore("memory",Math.max(1,50-mv));},[done]);
  const cols=sz<=16?4:6;
  return (<GS id="memory" title="Memory Match" accent={ac} guide={<p>Flip two cards per turn to find matching pairs. Clear all pairs to win. In 2-player mode, finding a match earns you another turn.</p>}>
    <MS modes={["Solo","2 Players"]} sel={mode} onSel={m=>{setMode(m);init(sz);}} ac={ac} />
    <div style={{display:"flex",gap:8,marginBottom:12,justifyContent:"center"}}>{[16,24,36].map(s=>(<button key={s} onClick={()=>{setSz(s);init(s);}} style={{padding:"6px 12px",borderRadius:8,fontSize:12,cursor:"pointer",background:sz===s?ac:C.card,color:sz===s?"#000":C.textM,border:`1px solid ${sz===s?ac:C.border}`,fontWeight:600,fontFamily:F}}>{s/2} Pairs</button>))}</div>
    {mode!=="Solo"&&<SBd scores={{P1:p1,P2:p2}} ac={ac} />}
    <SB msg={done?(mode==="Solo"?`Done in ${mv} moves!`:p1>p2?"Player 1 Wins!":p2>p1?"Player 2 Wins!":"Tie!"):mode==="Solo"?`Moves: ${mv}`:`Player ${cp}'s Turn`} ac={ac} />
    <div style={{display:"grid",gridTemplateColumns:`repeat(${cols},1fr)`,gap:6,maxWidth:cols*60,margin:"0 auto"}}>{cards.map((e,i)=>{const sh=fl.includes(i)||mt.has(i);return(<button key={i} onClick={()=>flip(i)} style={{aspectRatio:"1",borderRadius:10,fontSize:"clamp(16px,4vw,26px)",cursor:sh?"default":"pointer",background:mt.has(i)?`${ac}20`:sh?C.cardH:"linear-gradient(135deg,rgba(139,92,246,0.12),rgba(6,182,212,0.12))",border:`1px solid ${mt.has(i)?ac:C.border}`,color:C.text,display:"flex",alignItems:"center",justifyContent:"center"}}>{sh?e:"?"}</button>);})}</div>
    <RB onClick={()=>init(sz)} ac={ac} />
  </GS>);
}

// ══════════════════════════════════════
// GAME: MINESWEEPER
// ══════════════════════════════════════
function Minesweeper() {
  const ac=C.rose,{ recordScore }=useAuth();
  const PR={Easy:{r:8,c:8,m:10},Medium:{r:10,c:10,m:25},Hard:{r:14,c:14,m:50}};
  const [df,setDf]=useState("Easy");const [grid,setGrid]=useState([]);const [rev,setRev]=useState(new Set());const [flag,setFlag]=useState(new Set());const [go,setGo]=useState(false);const [won,setWon]=useState(false);const [fc,setFc]=useState(true);
  const init=useCallback(d=>{const{r,c}=PR[d];setGrid(Array.from({length:r},()=>Array(c).fill(0)));setRev(new Set());setFlag(new Set());setGo(false);setWon(false);setFc(true);},[]);
  useEffect(()=>{init(df);},[df,init]);
  const pm=(rows,cols,mines,sr,sc)=>{const g=Array.from({length:rows},()=>Array(cols).fill(0));let p=0;while(p<mines){const r=Math.floor(Math.random()*rows),c=Math.floor(Math.random()*cols);if(g[r][c]===-1||(Math.abs(r-sr)<=1&&Math.abs(c-sc)<=1))continue;g[r][c]=-1;p++;}for(let r=0;r<rows;r++)for(let c=0;c<cols;c++){if(g[r][c]===-1)continue;let n=0;for(let dr=-1;dr<=1;dr++)for(let dc=-1;dc<=1;dc++){const nr=r+dr,nc=c+dc;if(nr>=0&&nr<rows&&nc>=0&&nc<cols&&g[nr][nc]===-1)n++;}g[r][c]=n;}return g;};
  const flood=(g,r,c,rv)=>{const k=`${r},${c}`;if(rv.has(k)||r<0||r>=g.length||c<0||c>=g[0].length)return;rv.add(k);if(g[r][c]===0)for(let dr=-1;dr<=1;dr++)for(let dc=-1;dc<=1;dc++)flood(g,r+dr,c+dc,rv);};
  const click=(r,c)=>{if(go||won||flag.has(`${r},${c}`)||rev.has(`${r},${c}`))return;let g=grid;if(fc){g=pm(PR[df].r,PR[df].c,PR[df].m,r,c);setGrid(g);setFc(false);}if(g[r][c]===-1){const all=new Set();for(let i=0;i<g.length;i++)for(let j=0;j<g[0].length;j++)all.add(`${i},${j}`);setRev(all);setGo(true);return;}const nr=new Set(rev);flood(g,r,c,nr);setRev(nr);if(nr.size===g.length*g[0].length-PR[df].m){setWon(true);recordScore("minesweeper",{Easy:20,Medium:40,Hard:80}[df]);}};
  const fl=(e,r,c)=>{e.preventDefault();if(go||won||rev.has(`${r},${c}`))return;const nf=new Set(flag);const k=`${r},${c}`;nf.has(k)?nf.delete(k):nf.add(k);setFlag(nf);};
  const{r:rows,c:cols,m:mines}=PR[df];const nc=["","#3b82f6","#22c55e","#ef4444","#7c3aed","#a855f7","#06b6d4","#000","#6b7280"];
  return (<GS id="minesweeper" title="Minesweeper" accent={ac} guide={<p>Clear cells without hitting mines. Numbers show adjacent mine count. Right-click or long-press to flag. First click is always safe.</p>}>
    <MS modes={["Easy","Medium","Hard"]} sel={df} onSel={d=>{setDf(d);init(d);}} ac={ac} />
    <SB msg={go?"💥 Game Over!":won?"🎉 You Win!":`🚩 ${mines-flag.size} mines left`} ac={ac} />
    <div style={{overflowX:"auto",display:"flex",justifyContent:"center"}}><div style={{display:"inline-grid",gridTemplateColumns:`repeat(${cols},minmax(24px,32px))`,gap:2}}>{grid.map((row,r)=>row.map((cell,c)=>{const k=`${r},${c}`,isR=rev.has(k),isF=flag.has(k);return(<button key={k} onClick={()=>click(r,c)} onContextMenu={e=>fl(e,r,c)} style={{aspectRatio:"1",borderRadius:3,fontSize:"clamp(10px,2.2vw,13px)",fontWeight:700,cursor:isR?"default":"pointer",background:isR?(cell===-1?"rgba(239,68,68,0.3)":"rgba(255,255,255,0.06)"):C.card,border:`1px solid ${isR?"transparent":C.border}`,color:isR&&cell>0?nc[cell]:C.text,display:"flex",alignItems:"center",justifyContent:"center",padding:0,minWidth:0}}>{isF&&!isR?"🚩":isR?(cell===-1?"💣":cell>0?cell:""):""}</button>);}))}
    </div></div><p style={{textAlign:"center",fontSize:11,color:C.textD,marginTop:6}}>Right-click or long-press to flag</p>
    <RB onClick={()=>init(df)} ac={ac} />
  </GS>);
}

// ══════════════════════════════════════
// GAME: SNAKE
// ══════════════════════════════════════
function SnakeGame() {
  const ac=C.emerald,SZ=20,{ recordScore }=useAuth();
  const [snake,setSnake]=useState([[10,10],[10,9],[10,8]]);const [food,setFood]=useState([5,5]);const [dir,setDir]=useState([0,1]);const [run,setRun]=useState(false);const [dead,setDead]=useState(false);const [score,setScore]=useState(0);const [best,setBest]=useState(0);
  const dR=useRef(dir);useEffect(()=>{dR.current=dir;},[dir]);
  const sf=s=>{const set=new Set(s.map(p=>p.join(",")));let p;do{p=[Math.floor(Math.random()*SZ),Math.floor(Math.random()*SZ)];}while(set.has(p.join(",")));return p;};
  const reset=()=>{const s=[[10,10],[10,9],[10,8]];setSnake(s);setFood(sf(s));setDir([0,1]);dR.current=[0,1];setDead(false);setScore(0);setRun(false);};
  useEffect(()=>{const h=e=>{const m={ArrowUp:[-1,0],ArrowDown:[1,0],ArrowLeft:[0,-1],ArrowRight:[0,1],w:[-1,0],s:[1,0],a:[0,-1],d:[0,1]}[e.key];if(m){e.preventDefault();const c=dR.current;if(m[0]+c[0]!==0||m[1]+c[1]!==0){setDir(m);dR.current=m;}if(!run&&!dead)setRun(true);}};window.addEventListener("keydown",h);return()=>window.removeEventListener("keydown",h);},[run,dead]);
  useEffect(()=>{if(!run||dead)return;const t=setInterval(()=>{setSnake(prev=>{const d=dR.current;const hd=[(prev[0][0]+d[0]+SZ)%SZ,(prev[0][1]+d[1]+SZ)%SZ];if(prev.some(p=>p[0]===hd[0]&&p[1]===hd[1])){setDead(true);setRun(false);const sc=prev.length-3;setBest(b=>Math.max(b,sc));recordScore("snake",sc);return prev;}const ns=[hd,...prev];if(hd[0]===food[0]&&hd[1]===food[1]){setFood(sf(ns));setScore(s=>s+1);}else ns.pop();return ns;});},120);return()=>clearInterval(t);},[run,dead,food]);
  const dp=nd=>{const c=dR.current;if(nd[0]+c[0]!==0||nd[1]+c[1]!==0){setDir(nd);dR.current=nd;}if(!run&&!dead)setRun(true);};
  return (<GS id="snake" title="Snake" accent={ac} guide={<p>Guide the snake to eat food and grow. Don't hit your own tail! Use arrow keys, WASD, or the on-screen D-pad. The snake wraps around edges.</p>}>
    <SBd scores={{Score:score,Best:best}} ac={ac} />
    {dead&&<SB msg={`Game Over! Score: ${score}`} ac={C.rose} />}
    {!run&&!dead&&<SB msg="Press arrow keys or tap D-pad" ac={ac} />}
    <div style={{position:"relative",width:"min(100%,360px)",aspectRatio:"1",margin:"0 auto",background:"rgba(0,0,0,0.4)",borderRadius:12,border:`1px solid ${C.border}`,overflow:"hidden"}}>
      {snake.map((p,i)=>(<div key={i} style={{position:"absolute",top:`${p[0]/SZ*100}%`,left:`${p[1]/SZ*100}%`,width:`${100/SZ}%`,height:`${100/SZ}%`,background:i===0?ac:`${ac}aa`,borderRadius:i===0?4:2}} />))}
      <div style={{position:"absolute",top:`${food[0]/SZ*100}%`,left:`${food[1]/SZ*100}%`,width:`${100/SZ}%`,height:`${100/SZ}%`,background:C.rose,borderRadius:"50%"}} />
    </div>
    <div style={{display:"grid",gridTemplateAreas:`". u ." "l . r" ". d ."`,gridTemplateColumns:"48px 48px 48px",gridTemplateRows:"48px 48px 48px",justifyContent:"center",marginTop:14,gap:4}}>
      {[["u",[-1,0],"↑"],["l",[0,-1],"←"],["r",[0,1],"→"],["d",[1,0],"↓"]].map(([a,d,lb])=>(<button key={a} onPointerDown={()=>dp(d)} style={{gridArea:a,background:C.card,border:`1px solid ${C.border}`,borderRadius:10,color:C.text,fontSize:20,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>{lb}</button>))}
    </div>{dead&&<RB onClick={reset} ac={ac} />}
  </GS>);
}

// ══════════════════════════════════════
// GAME: WHACK-A-MOLE
// ══════════════════════════════════════
function WhackAMole() {
  const ac=C.amber,{ recordScore }=useAuth();
  const [moles,setMoles]=useState(Array(9).fill(false));const [score,setScore]=useState(0);const [tl,setTl]=useState(30);const [play,setPlay]=useState(false);const [best,setBest]=useState(0);
  useEffect(()=>{if(!play)return;const t=setInterval(()=>setTl(p=>{if(p<=1){setPlay(false);setBest(b=>Math.max(b,score));recordScore("whack",score);return 0;}return p-1;}),1000);return()=>clearInterval(t);},[play,score]);
  useEffect(()=>{if(!play)return;const t=setInterval(()=>{setMoles(()=>{const n=Array(9).fill(false);const c=Math.min(1+Math.floor((30-tl)/10),3);for(let i=0;i<c;i++)n[Math.floor(Math.random()*9)]=true;return n;});},800);return()=>clearInterval(t);},[play,tl]);
  const whack=i=>{if(moles[i]&&play){setScore(s=>s+1);setMoles(p=>{const n=[...p];n[i]=false;return n;});}};
  const start=()=>{setScore(0);setTl(30);setPlay(true);setMoles(Array(9).fill(false));};
  return (<GS id="whack" title="Whack-a-Mole" accent={ac} guide={<p>Moles pop up randomly — tap them before they disappear! Score as many hits as you can in 30 seconds.</p>}>
    <SBd scores={{Score:score,Best:best,Time:tl}} ac={ac} />
    {!play&&<SB msg={tl===0?`Time's up! Score: ${score}`:"Tap Start to Play!"} ac={ac} />}
    <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,maxWidth:280,margin:"0 auto"}}>{moles.map((up,i)=>(<button key={i} onClick={()=>whack(i)} style={{aspectRatio:"1",borderRadius:16,fontSize:36,cursor:"pointer",background:up?"radial-gradient(circle,#8B4513,#5D2E0C)":C.card,border:`2px solid ${up?"#D2691E":C.border}`,transform:up?"scale(1.1)":"scale(1)",display:"flex",alignItems:"center",justifyContent:"center",transition:"all .15s"}}>{up?"🐹":"🕳️"}</button>))}</div>
    <RB onClick={start} ac={ac} />
  </GS>);
}

// ══════════════════════════════════════
// GAME: 2048
// ══════════════════════════════════════
function Game2048() {
  const ac=C.cyan,N=4,{ recordScore }=useAuth();
  const tc={0:"transparent",2:"#eee4da",4:"#ede0c8",8:"#f2b179",16:"#f59563",32:"#f67c5f",64:"#f65e3b",128:"#edcf72",256:"#edcc61",512:"#edc850",1024:"#edc53f",2048:"#edc22e"};const dk=new Set([0,2,4]);
  const ar=g=>{const e=[];for(let r=0;r<N;r++)for(let c=0;c<N;c++)if(!g[r][c])e.push([r,c]);if(!e.length)return;const[r,c]=e[Math.floor(Math.random()*e.length)];g[r][c]=Math.random()<0.9?2:4;};
  const ig=()=>{let g=Array.from({length:N},()=>Array(N).fill(0));ar(g);ar(g);return g;};
  const [grid,setGrid]=useState(ig);const [sc,setSc]=useState(0);const [best,setBest]=useState(0);const [go,setGo]=useState(false);
  const sl=row=>{let a=row.filter(v=>v),pts=0;for(let i=0;i<a.length-1;i++)if(a[i]===a[i+1]){a[i]*=2;pts+=a[i];a.splice(i+1,1);}while(a.length<N)a.push(0);return{row:a,pts};};
  const move=useCallback(dir=>{if(go)return;let g=grid.map(r=>[...r]),pts=0,moved=false;const pr=(gR,sR)=>{for(let i=0;i<N;i++){const row=gR(g,i);const{row:nr,pts:p}=sl(row);if(nr.join()!==row.join())moved=true;pts+=p;sR(g,i,nr);}};if(dir==="left")pr((g,r)=>g[r],(g,r,v)=>g[r]=v);else if(dir==="right")pr((g,r)=>[...g[r]].reverse(),(g,r,v)=>g[r]=v.reverse());else if(dir==="up")pr((g,c)=>g.map(r=>r[c]),(g,c,v)=>v.forEach((val,r)=>g[r][c]=val));else if(dir==="down")pr((g,c)=>g.map(r=>r[c]).reverse(),(g,c,v)=>{v.reverse();v.forEach((val,r)=>g[r][c]=val);});if(moved){ar(g);setGrid(g);setSc(s=>{const ns=s+pts;setBest(b=>Math.max(b,ns));return ns;});let cm=false;for(let r=0;r<N&&!cm;r++)for(let c=0;c<N&&!cm;c++){if(!g[r][c])cm=true;if(c<N-1&&g[r][c]===g[r][c+1])cm=true;if(r<N-1&&g[r][c]===g[r+1][c])cm=true;}if(!cm){setGo(true);recordScore("2048",sc+pts);}}},[grid,go,sc]);
  useEffect(()=>{const h=e=>{const m={ArrowLeft:"left",ArrowRight:"right",ArrowUp:"up",ArrowDown:"down"}[e.key];if(m){e.preventDefault();move(m);}};window.addEventListener("keydown",h);return()=>window.removeEventListener("keydown",h);},[move]);
  const tR=useRef(null);
  return (<GS id="2048" title="2048" accent={ac} guide={<p>Slide tiles to combine matching numbers. Each merge doubles the value. Reach 2048 to win!</p>}>
    <SBd scores={{Score:sc,Best:best}} ac={ac} />{go&&<SB msg="Game Over!" ac={C.rose} />}
    <div onTouchStart={e=>{tR.current={x:e.touches[0].clientX,y:e.touches[0].clientY};}} onTouchEnd={e=>{if(!tR.current)return;const dx=e.changedTouches[0].clientX-tR.current.x,dy=e.changedTouches[0].clientY-tR.current.y;if(Math.abs(dx)>Math.abs(dy)&&Math.abs(dx)>30)move(dx>0?"right":"left");else if(Math.abs(dy)>30)move(dy>0?"down":"up");tR.current=null;}} style={{maxWidth:320,margin:"0 auto",background:"#bbada0",borderRadius:12,padding:8,display:"grid",gridTemplateColumns:`repeat(${N},1fr)`,gap:6}}>
      {grid.flat().map((v,i)=>(<div key={i} style={{aspectRatio:"1",borderRadius:8,display:"flex",alignItems:"center",justifyContent:"center",background:tc[v]||"#3c3a32",color:dk.has(v)?"#776e65":"#f9f6f2",fontSize:v>=1024?"clamp(14px,3.5vw,22px)":"clamp(18px,4.5vw,30px)",fontWeight:800}}>{v||""}</div>))}
    </div>
    <div style={{display:"grid",gridTemplateAreas:`". u ." "l . r" ". d ."`,gridTemplateColumns:"48px 48px 48px",gridTemplateRows:"48px 48px 48px",justifyContent:"center",marginTop:14,gap:4}}>
      {[["u","up","↑"],["l","left","←"],["r","right","→"],["d","down","↓"]].map(([a,d,lb])=>(<button key={a} onClick={()=>move(d)} style={{gridArea:a,background:C.card,border:`1px solid ${C.border}`,borderRadius:10,color:C.text,fontSize:20,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>{lb}</button>))}
    </div><RB onClick={()=>{setGrid(ig());setSc(0);setGo(false);}} ac={ac} />
  </GS>);
}

// ══════════════════════════════════════
// GAME: CHECKERS (2 Players / Online)
// ══════════════════════════════════════
function Checkers() {
  const ac=C.violet,{ recordScore }=useAuth();
  const iB=()=>{const b=Array.from({length:8},()=>Array(8).fill(0));for(let r=0;r<3;r++)for(let c=0;c<8;c++)if((r+c)%2===1)b[r][c]=2;for(let r=5;r<8;r++)for(let c=0;c<8;c++)if((r+c)%2===1)b[r][c]=1;return b;};
  const [board,setBoard]=useState(iB());const [sel,setSel]=useState(null);const [turn,setTurn]=useState(1);const [mvs,setMvs]=useState([]);
  const [mode,setMode]=useState("2 Players");
  const mp = useMultiplayer("checkers");
  const online = mode === "Online";
  const mySlot = mp.room?.you?.slot; // slot0=Red(1), slot1=Black(2)
  const myOwner = mySlot === 0 ? 1 : 2;
  const myTurn = online && mp.status === "matched" && mp.room.turn === mySlot;

  const ik=v=>v>=3; const ow=v=>v===1||v===3?1:v===2||v===4?2:0;
  const gm=useCallback((b,r,c)=>{const v=b[r][c];if(!v)return[];const o=ow(v);const dirs=ik(v)?[-1,1]:o===1?[-1]:[1];const res=[];for(let dr of dirs)for(let dc of[-1,1]){const nr=r+dr,nc=c+dc;if(nr>=0&&nr<8&&nc>=0&&nc<8){if(!b[nr][nc])res.push({r:nr,c:nc,cap:null});else if(ow(b[nr][nc])!==o){const jr=nr+dr,jc=nc+dc;if(jr>=0&&jr<8&&jc>=0&&jc<8&&!b[jr][jc])res.push({r:jr,c:jc,cap:[nr,nc]});}}}return res;},[]);
  const hc=(b,p)=>{for(let r=0;r<8;r++)for(let c=0;c<8;c++)if(ow(b[r][c])===p&&gm(b,r,c).some(m=>m.cap))return true;return false;};

  useEffect(() => {
    if (!online || !mp.lastOpponentMove) return;
    const { state } = mp.lastOpponentMove;
    if (state?.board) setBoard(state.board);
    setSel(null); setMvs([]);
    if (state?.turn) setTurn(state.turn);
  }, [mp.lastOpponentMove]);

  const click=(r,c)=>{
    if (online && !myTurn) return;
    if(sel){
      const mv=mvs.find(m=>m.r===r&&m.c===c);
      if(mv){
        const nb=board.map(row=>[...row]);nb[r][c]=nb[sel.r][sel.c];nb[sel.r][sel.c]=0;if(mv.cap)nb[mv.cap[0]][mv.cap[1]]=0;if(r===0&&ow(nb[r][c])===1)nb[r][c]=3;if(r===7&&ow(nb[r][c])===2)nb[r][c]=4;
        if(mv.cap&&gm(nb,r,c).some(m=>m.cap)){
          setBoard(nb);setSel({r,c});setMvs(gm(nb,r,c).filter(m=>m.cap));
          if (online) mp.sendMove({ board: nb, turn }, mySlot); // multi-jump: same player continues
          return;
        }
        const nextTurn = turn===1?2:1;
        setBoard(nb);setSel(null);setMvs([]);setTurn(nextTurn);
        if (online) mp.sendMove({ board: nb, turn: nextTurn }, nextTurn - 1);
      }else if(ow(board[r][c])===turn){const pm=gm(board,r,c);const mc=hc(board,turn);setSel({r,c});setMvs(mc?pm.filter(m=>m.cap):pm);}
      else{setSel(null);setMvs([]);}
    }else if(ow(board[r][c])===turn){const pm=gm(board,r,c);const mc=hc(board,turn);setSel({r,c});setMvs(mc?pm.filter(m=>m.cap):pm);}
  };
  const p1=board.flat().filter(v=>ow(v)===1).length,p2=board.flat().filter(v=>ow(v)===2).length;
  const wn=p1===0?"Black":p2===0?"Red":null;
  const reportedRef = useRef(false);
  useEffect(()=>{
    if(!wn) return;
    if (online) {
      if (reportedRef.current) return;
      reportedRef.current = true;
      const winnerOwner = wn === "Red" ? 1 : 2;
      if (winnerOwner === myOwner) mp.reportGameOver("win", 25);
    } else {
      recordScore("checkers",20);
    }
  },[wn]);
  const reset = () => { setBoard(iB()); setSel(null); setMvs([]); setTurn(1); reportedRef.current = false; if (online) mp.reset(); };
  return (<GS id="checkers" title="Checkers" accent={ac} guide={<p>Move diagonally forward, jump to capture. Reach the opposite end to become a King (moves both ways). Capture all opponent pieces to win. Online mode matches you with another signed-in player, and multi-jump turns are kept in sync in real time.</p>}>
    <MS modes={["2 Players","Online"]} sel={mode} onSel={(m)=>{setMode(m);reset();}} ac={ac} />
    {online && <OnlinePanel mp={mp} ac={ac} mySymbolLabel="Red" oppSymbolLabel="Black" />}
    {(!online || mp.status==="matched" || mp.status==="finished") && (<>
      <SBd scores={{Red:p1,Black:p2}} ac={ac} /><SB msg={wn?`${wn} Wins!`:online?(myTurn?"Your Turn":"Opponent's Turn"):`${turn===1?"Red":"Black"}'s Turn`} ac={ac} />
      <div style={{maxWidth:340,margin:"0 auto",borderRadius:10,overflow:"hidden",border:`2px solid ${C.border}`}}>
        {board.map((row,r)=>(<div key={r} style={{display:"grid",gridTemplateColumns:"repeat(8,1fr)"}}>{row.map((cell,c)=>{const dark=(r+c)%2===1,isSel=sel?.r===r&&sel?.c===c,isM=mvs.some(m=>m.r===r&&m.c===c);return(<div key={c} onClick={()=>dark&&click(r,c)} style={{aspectRatio:"1",background:dark?(isSel?"rgba(139,92,246,0.4)":"#5d4037"):"#d7ccc8",display:"flex",alignItems:"center",justifyContent:"center",cursor:dark?"pointer":"default",position:"relative"}}>{isM&&<div style={{position:"absolute",width:"30%",height:"30%",borderRadius:"50%",background:`${ac}80`}} />}{cell>0&&(<div style={{width:"70%",height:"70%",borderRadius:"50%",background:ow(cell)===1?"radial-gradient(circle at 35% 35%,#ff6b6b,#c62828)":"radial-gradient(circle at 35% 35%,#555,#111)",border:ik(cell)?"2px solid gold":"2px solid rgba(255,255,255,0.2)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"clamp(8px,2vw,14px)",color:"gold"}}>{ik(cell)?"♛":""}</div>)}</div>);})}</div>))}
      </div>
      {(!online || wn) && <RB onClick={reset} ac={ac} label={online ? "Find New Match" : "New Game"} />}
    </>)}
  </GS>);
}

// ══════════════════════════════════════
// GAME: CHESS (Local / Online)
// ══════════════════════════════════════
function Chess() {
  const ac=C.violet,{ recordScore }=useAuth();
  const initB=()=>{const b=Array.from({length:8},()=>Array(8).fill(0));const back=[2,3,4,5,6,4,3,2];for(let c=0;c<8;c++){b[0][c]=-back[c];b[1][c]=-1;b[6][c]=1;b[7][c]=back[c];}return b;};
  const [board,setBoard]=useState(initB);const [sel,setSel]=useState(null);const [turn,setTurn]=useState(1);const [mvs,setMvs]=useState([]);const [status,setStatus]=useState("");
  const [mode,setMode]=useState("Local");
  const mp = useMultiplayer("chess");
  const online = mode === "Online";
  const mySlot = mp.room?.you?.slot; const mySide = mySlot === 0 ? 1 : -1; // slot0=White(1), slot1=Black(-1)
  const myTurn = online && mp.status === "matched" && mp.room.turn === mySlot;

  const pieces={1:"♟",2:"♜",3:"♞",4:"♝",5:"♛",6:"♚","-1":"♙","-2":"♖","-3":"♘","-4":"♗","-5":"♕","-6":"♔"};
  const side=v=>v>0?1:v<0?-1:0;
  const rawMoves=(b,r,c)=>{const v=b[r][c],s=side(v),t=Math.abs(v),res=[];const can=(nr,nc)=>nr>=0&&nr<8&&nc>=0&&nc<8;const addIf=(nr,nc)=>{if(can(nr,nc)&&side(b[nr][nc])!==s)res.push([nr,nc]);};const slide=(dirs)=>{for(let[dr,dc]of dirs)for(let i=1;i<8;i++){const nr=r+dr*i,nc=c+dc*i;if(!can(nr,nc))break;if(!b[nr][nc])res.push([nr,nc]);else{if(side(b[nr][nc])!==s)res.push([nr,nc]);break;}}};if(t===1){const d=s===1?-1:1;const sr=s===1?6:1;if(can(r+d,c)&&!b[r+d][c]){res.push([r+d,c]);if(r===sr&&!b[r+2*d][c])res.push([r+2*d,c]);}if(can(r+d,c-1)&&b[r+d][c-1]&&side(b[r+d][c-1])!==s)res.push([r+d,c-1]);if(can(r+d,c+1)&&b[r+d][c+1]&&side(b[r+d][c+1])!==s)res.push([r+d,c+1]);}else if(t===2)slide([[0,1],[0,-1],[1,0],[-1,0]]);else if(t===3){for(let[dr,dc]of[[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]])addIf(r+dr,c+dc);}else if(t===4)slide([[1,1],[1,-1],[-1,1],[-1,-1]]);else if(t===5)slide([[0,1],[0,-1],[1,0],[-1,0],[1,1],[1,-1],[-1,1],[-1,-1]]);else if(t===6){for(let dr=-1;dr<=1;dr++)for(let dc=-1;dc<=1;dc++)if(dr||dc)addIf(r+dr,c+dc);}return res;};
  const inCheck=(b,s)=>{let kr=-1,kc=-1;for(let r=0;r<8;r++)for(let c=0;c<8;c++)if(b[r][c]===s*6){kr=r;kc=c;}if(kr<0)return true;for(let r=0;r<8;r++)for(let c=0;c<8;c++)if(side(b[r][c])===-s)for(let[mr,mc]of rawMoves(b,r,c))if(mr===kr&&mc===kc)return true;return false;};
  const legalMoves=(b,r,c)=>{const s=side(b[r][c]);return rawMoves(b,r,c).filter(([mr,mc])=>{const nb=b.map(row=>[...row]);nb[mr][mc]=nb[r][c];nb[r][c]=0;if(Math.abs(nb[mr][mc])===1&&(mr===0||mr===7))nb[mr][mc]=s*5;return !inCheck(nb,s);});};
  const hasAnyMoves=(b,s)=>{for(let r=0;r<8;r++)for(let c=0;c<8;c++)if(side(b[r][c])===s&&legalMoves(b,r,c).length>0)return true;return false;};

  useEffect(() => {
    if (!online || !mp.lastOpponentMove) return;
    const { state } = mp.lastOpponentMove;
    if (state?.board) setBoard(state.board);
    if (state?.turn) setTurn(state.turn);
    setSel(null); setMvs([]);
  }, [mp.lastOpponentMove]);

  const reportedRef = useRef(false);
  useEffect(()=>{const s=turn;if(!hasAnyMoves(board,s)){if(inCheck(board,s)){const winnerSide=s===1?-1:1;setStatus(`${s===1?"Black":"White"} wins by checkmate!`);if(online){if(!reportedRef.current&&winnerSide===mySide){reportedRef.current=true;mp.reportGameOver("win",50);}}else recordScore("chess",50);}else{setStatus("Stalemate — draw!");if(online&&!reportedRef.current){reportedRef.current=true;mp.reportGameOver("draw",15);}}}else if(inCheck(board,s)){setStatus(`${s===1?"White":"Black"} is in check!`);}else setStatus(`${s===1?"White":"Black"}'s turn`);},[board,turn]);

  const click=(r,c)=>{
    if(status.includes("checkmate")||status.includes("Stalemate"))return;
    if (online && !myTurn) return;
    if(sel){
      const mv=mvs.find(([mr,mc])=>mr===r&&mc===c);
      if(mv){
        const nb=board.map(row=>[...row]);nb[r][c]=nb[sel.r][sel.c];nb[sel.r][sel.c]=0;if(Math.abs(nb[r][c])===1&&(r===0||r===7))nb[r][c]=side(nb[r][c])*5;
        const nextTurn = turn===1?-1:1;
        setBoard(nb);setSel(null);setMvs([]);setTurn(nextTurn);
        if (online) mp.sendMove({ board: nb, turn: nextTurn }, nextTurn===1?0:1);
      }else if(side(board[r][c])===turn){setSel({r,c});setMvs(legalMoves(board,r,c));}
      else{setSel(null);setMvs([]);}
    }else if(side(board[r][c])===turn){setSel({r,c});setMvs(legalMoves(board,r,c));}
  };
  const reset = () => { setBoard(initB()); setSel(null); setMvs([]); setTurn(1); setStatus("White's turn"); reportedRef.current = false; if (online) mp.reset(); };

  return (<GS id="chess" title="Chess" accent={ac} guide={<><p>Each piece moves differently — pawns forward, rooks in lines, bishops diagonally, knights in L-shapes, queen any direction, king one square. Checkmate your opponent's king to win! Online mode matches you with another signed-in player in real time.</p></>}>
    <MS modes={["Local","Online"]} sel={mode} onSel={(m)=>{setMode(m);reset();}} ac={ac} />
    {online && <OnlinePanel mp={mp} ac={ac} mySymbolLabel="White" oppSymbolLabel="Black" />}
    {(!online || mp.status==="matched" || mp.status==="finished") && (<>
      <SB msg={status} ac={status.includes("check")?C.rose:ac} />
      <div style={{maxWidth:360,margin:"0 auto",borderRadius:8,overflow:"hidden",border:`2px solid ${C.border}`}}>
        {board.map((row,r)=>(<div key={r} style={{display:"grid",gridTemplateColumns:"repeat(8,1fr)"}}>{row.map((cell,c)=>{const dark=(r+c)%2===1,isSel=sel?.r===r&&sel?.c===c,isM=mvs.some(([mr,mc])=>mr===r&&mc===c);return(<div key={c} onClick={()=>click(r,c)} style={{aspectRatio:"1",background:isSel?"rgba(139,92,246,0.5)":isM?(cell?"rgba(239,68,68,0.3)":"rgba(139,92,246,0.2)"):(dark?"#779952":"#e2e8b0"),display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",fontSize:"clamp(18px,4.5vw,32px)",position:"relative"}}>
          {isM&&!cell&&<div style={{width:"28%",height:"28%",borderRadius:"50%",background:"rgba(0,0,0,0.2)"}} />}
          {cell!==0&&<span>{pieces[cell]||""}</span>}
        </div>);})}</div>))}
      </div>
      {(!online || status.includes("checkmate") || status.includes("Stalemate")) && <RB onClick={reset} ac={ac} label={online ? "Find New Match" : "New Game"} />}
    </>)}
  </GS>);
}

// ══════════════════════════════════════
// GAME: CARROM
// ══════════════════════════════════════
function Carrom() {
  const ac=C.amber,{ recordScore }=useAuth();
  const W=320,H=320,PR=12,POCKET=18;
  const pockets=[{x:PR,y:PR},{x:W-PR,y:PR},{x:PR,y:H-PR},{x:W-PR,y:H-PR}];
  const initCoins=()=>{const coins=[];const cx=W/2,cy=H/2;for(let i=0;i<9;i++){const ang=(i/9)*Math.PI*2;const r=i===0?0:(i<5?24:42);coins.push({x:cx+Math.cos(ang)*r,y:cy+Math.sin(ang)*r,vx:0,vy:0,r:8,color:i<5?"#111":"#eee",active:true,type:i===0?"queen":"coin"});}return coins;};
  const [coins,setCoins]=useState(initCoins);const [striker,setStriker]=useState({x:W/2,y:H-40,vx:0,vy:0,r:10,active:true});const [aiming,setAiming]=useState(false);const [aimStart,setAimStart]=useState(null);const [aimEnd,setAimEnd]=useState(null);const [moving,setMoving]=useState(false);const [score,setScore]=useState(0);const [pottedCount,setPottedCount]=useState(0);
  const boardRef=useRef(null);const animRef=useRef(null);
  const getPos=(e)=>{const rect=boardRef.current?.getBoundingClientRect();if(!rect)return null;const clientX=e.touches?e.touches[0].clientX:e.clientX;const clientY=e.touches?e.touches[0].clientY:e.clientY;return{x:(clientX-rect.left)/rect.width*W,y:(clientY-rect.top)/rect.height*H};};
  const startAim=(e)=>{if(moving)return;e.preventDefault();const p=getPos(e);if(p){setAiming(true);setAimStart({x:striker.x,y:striker.y});setAimEnd(p);}};
  const moveAim=(e)=>{if(!aiming)return;e.preventDefault();const p=getPos(e);if(p)setAimEnd(p);};
  const endAim=(e)=>{if(!aiming)return;e.preventDefault();setAiming(false);if(!aimEnd)return;const dx=striker.x-aimEnd.x,dy=striker.y-aimEnd.y;const power=Math.min(Math.sqrt(dx*dx+dy*dy)*0.12,12);if(power<0.5)return;setStriker(s=>({...s,vx:dx/Math.sqrt(dx*dx+dy*dy)*power,vy:dy/Math.sqrt(dx*dx+dy*dy)*power}));setMoving(true);};
  useEffect(()=>{if(!moving)return;const bodies=[{...striker,id:"striker"},...coins.filter(c=>c.active).map((c,i)=>({...c,id:`c${i}`}))];const step=()=>{let anyMoving=false;const friction=0.97;for(let b of bodies){b.x+=b.vx;b.y+=b.vy;b.vx*=friction;b.vy*=friction;if(Math.abs(b.vx)<0.05&&Math.abs(b.vy)<0.05){b.vx=0;b.vy=0;}else anyMoving=true;if(b.x-b.r<0){b.x=b.r;b.vx=-b.vx*0.7;}if(b.x+b.r>W){b.x=W-b.r;b.vx=-b.vx*0.7;}if(b.y-b.r<0){b.y=b.r;b.vy=-b.vy*0.7;}if(b.y+b.r>H){b.y=H-b.r;b.vy=-b.vy*0.7;}}for(let i=0;i<bodies.length;i++)for(let j=i+1;j<bodies.length;j++){const a=bodies[i],b2=bodies[j];const dx=b2.x-a.x,dy=b2.y-a.y,dist=Math.sqrt(dx*dx+dy*dy);if(dist<a.r+b2.r&&dist>0){const nx=dx/dist,ny=dy/dist,dvx=a.vx-b2.vx,dvy=a.vy-b2.vy,dvn=dvx*nx+dvy*ny;if(dvn>0){a.vx-=dvn*nx*0.9;a.vy-=dvn*ny*0.9;b2.vx+=dvn*nx*0.9;b2.vy+=dvn*ny*0.9;}const ov=(a.r+b2.r-dist)/2;a.x-=ov*nx;a.y-=ov*ny;b2.x+=ov*nx;b2.y+=ov*ny;anyMoving=true;}}let potted=0;for(let b of bodies){for(let p of pockets){if(Math.sqrt((b.x-p.x)**2+(b.y-p.y)**2)<POCKET){if(b.id==="striker"){b.x=W/2;b.y=H-40;b.vx=0;b.vy=0;}else{b.active=false;potted++;}break;}}}if(potted>0){setScore(s=>s+potted*10);setPottedCount(p=>p+potted);}setStriker(s=>({...s,...bodies[0]}));setCoins(prev=>{const nc=[...prev];for(let b of bodies){if(b.id!=="striker"){const idx=parseInt(b.id.substring(1));if(nc[idx])nc[idx]={...nc[idx],x:b.x,y:b.y,vx:b.vx,vy:b.vy,active:b.active};}}return nc;});if(anyMoving)animRef.current=requestAnimationFrame(step);else setMoving(false);};animRef.current=requestAnimationFrame(step);return()=>{if(animRef.current)cancelAnimationFrame(animRef.current);};},[moving]);
  const allPotted=coins.every(c=>!c.active);
  useEffect(()=>{if(allPotted&&coins.length>0)recordScore("carrom",score);},[allPotted]);
  return (<GS id="carrom" title="Carrom" accent={ac} guide={<p>Flick the striker to pot coins into corner pockets. Drag from the striker in the opposite direction (slingshot style) and release to shoot.</p>}>
    <SBd scores={{Score:score,Potted:pottedCount,Left:coins.filter(c=>c.active).length}} ac={ac} />
    {allPotted&&<SB msg={`Board Cleared! Score: ${score}`} ac={C.emerald} />}
    <div ref={boardRef} onMouseDown={startAim} onMouseMove={moveAim} onMouseUp={endAim} onTouchStart={startAim} onTouchMove={moveAim} onTouchEnd={endAim} style={{width:"min(100%,320px)",aspectRatio:"1",margin:"0 auto",background:"#d4a76a",borderRadius:12,border:"6px solid #8B4513",position:"relative",cursor:"crosshair",touchAction:"none",boxShadow:"inset 0 0 30px rgba(0,0,0,0.2)"}}>
      {pockets.map((p,i)=>(<div key={i} style={{position:"absolute",left:`${p.x/W*100}%`,top:`${p.y/H*100}%`,width:POCKET*2,height:POCKET*2,borderRadius:"50%",background:"#222",transform:"translate(-50%,-50%)"}} />))}
      {coins.filter(c=>c.active).map((c,i)=>(<div key={i} style={{position:"absolute",left:`${c.x/W*100}%`,top:`${c.y/H*100}%`,width:c.r*2,height:c.r*2,borderRadius:"50%",background:c.type==="queen"?"#e74c3c":c.color,border:"2px solid rgba(0,0,0,0.3)",transform:"translate(-50%,-50%)",boxShadow:"0 2px 4px rgba(0,0,0,0.3)"}} />))}
      {striker.active&&<div style={{position:"absolute",left:`${striker.x/W*100}%`,top:`${striker.y/H*100}%`,width:striker.r*2,height:striker.r*2,borderRadius:"50%",background:"#f0e68c",border:"2px solid #b8860b",transform:"translate(-50%,-50%)",boxShadow:"0 2px 6px rgba(0,0,0,0.4)"}} />}
      {aiming&&aimEnd&&(<svg style={{position:"absolute",top:0,left:0,width:"100%",height:"100%",pointerEvents:"none"}}><line x1={`${striker.x/W*100}%`} y1={`${striker.y/H*100}%`} x2={`${(striker.x+(striker.x-aimEnd.x)*2)/W*100}%`} y2={`${(striker.y+(striker.y-aimEnd.y)*2)/H*100}%`} stroke="rgba(255,255,255,0.5)" strokeWidth="2" strokeDasharray="5,5" /></svg>)}
    </div>
    <p style={{textAlign:"center",fontSize:12,color:C.textD,marginTop:8}}>Drag from striker to aim (slingshot style)</p>
    <RB onClick={()=>{setCoins(initCoins());setStriker({x:W/2,y:H-40,vx:0,vy:0,r:10,active:true});setScore(0);setPottedCount(0);setMoving(false);}} ac={ac} />
  </GS>);
}

// ══════════════════════════════════════
// GAME: 8-BALL POOL
// ══════════════════════════════════════
function Pool() {
  const ac=C.emerald,{ recordScore }=useAuth();
  const W=400,H=220,BR=7,POCKET=14;
  const pockets=[{x:BR,y:BR},{x:W/2,y:BR},{x:W-BR,y:BR},{x:BR,y:H-BR},{x:W/2,y:H-BR},{x:W-BR,y:H-BR}];
  const ballColors=["#fff","#f1c40f","#3498db","#e74c3c","#9b59b6","#e67e22","#2ecc71","#8e44ad","#000","#f1c40f","#3498db","#e74c3c","#9b59b6","#e67e22","#2ecc71","#8e44ad"];
  const initBalls=()=>{const balls=[{x:100,y:H/2,r:BR,vx:0,vy:0,active:true,color:"#fff",id:0}];const cx=280,cy=H/2;let idx=1;for(let row=0;row<5;row++)for(let col=0;col<=row;col++){balls.push({x:cx+row*14,y:cy+(col-row/2)*14.5,r:BR,vx:0,vy:0,active:true,color:ballColors[idx]||"#999",id:idx,striped:idx>8});idx++;}return balls;};
  const [balls,setBalls]=useState(initBalls);const [moving,setMoving]=useState(false);const [aiming,setAiming]=useState(false);const [aimEnd,setAimEnd]=useState(null);const [potted,setPotted]=useState(0);
  const boardRef=useRef(null);const animRef=useRef(null);
  const cue=balls[0];
  const getPos=(e)=>{const rect=boardRef.current?.getBoundingClientRect();if(!rect)return null;const cx=e.touches?e.touches[0].clientX:e.clientX;const cy=e.touches?e.touches[0].clientY:e.clientY;return{x:(cx-rect.left)/rect.width*W,y:(cy-rect.top)/rect.height*H};};
  const startAim=(e)=>{if(moving||!cue.active)return;e.preventDefault();setAiming(true);setAimEnd(getPos(e));};
  const moveAim=(e)=>{if(!aiming)return;e.preventDefault();setAimEnd(getPos(e));};
  const endAim=(e)=>{if(!aiming)return;e.preventDefault();setAiming(false);if(!aimEnd||!cue.active)return;const dx=cue.x-aimEnd.x,dy=cue.y-aimEnd.y;const power=Math.min(Math.sqrt(dx*dx+dy*dy)*0.1,10);if(power<0.3)return;const len=Math.sqrt(dx*dx+dy*dy);setBalls(prev=>{const nb=[...prev];nb[0]={...nb[0],vx:dx/len*power,vy:dy/len*power};return nb;});setMoving(true);};
  useEffect(()=>{if(!moving)return;const bds=balls.map(b=>({...b}));const step=()=>{let any=false;const fr=0.985;for(let b of bds){if(!b.active)continue;b.x+=b.vx;b.y+=b.vy;b.vx*=fr;b.vy*=fr;if(Math.abs(b.vx)<0.04&&Math.abs(b.vy)<0.04){b.vx=0;b.vy=0;}else any=true;if(b.x-b.r<0){b.x=b.r;b.vx=-b.vx*0.75;}if(b.x+b.r>W){b.x=W-b.r;b.vx=-b.vx*0.75;}if(b.y-b.r<0){b.y=b.r;b.vy=-b.vy*0.75;}if(b.y+b.r>H){b.y=H-b.r;b.vy=-b.vy*0.75;}}for(let i=0;i<bds.length;i++)for(let j=i+1;j<bds.length;j++){const a=bds[i],b2=bds[j];if(!a.active||!b2.active)continue;const dx=b2.x-a.x,dy=b2.y-a.y,dist=Math.sqrt(dx*dx+dy*dy);if(dist<a.r+b2.r&&dist>0){const nx=dx/dist,ny=dy/dist,dvn=(a.vx-b2.vx)*nx+(a.vy-b2.vy)*ny;if(dvn>0){a.vx-=dvn*nx;a.vy-=dvn*ny;b2.vx+=dvn*nx;b2.vy+=dvn*ny;}const ov=(a.r+b2.r-dist)/2;a.x-=ov*nx;a.y-=ov*ny;b2.x+=ov*nx;b2.y+=ov*ny;any=true;}}let pt=0;for(let b of bds)if(b.active)for(let p of pockets)if(Math.sqrt((b.x-p.x)**2+(b.y-p.y)**2)<POCKET){if(b.id===0){b.x=100;b.y=H/2;b.vx=0;b.vy=0;}else{b.active=false;pt++;}break;}if(pt>0)setPotted(p=>p+pt);setBalls(bds.map(b=>({...b})));if(any)animRef.current=requestAnimationFrame(step);else setMoving(false);};animRef.current=requestAnimationFrame(step);return()=>{if(animRef.current)cancelAnimationFrame(animRef.current);};},[moving]);
  const allPotted=balls.filter(b=>b.id>0).every(b=>!b.active);
  useEffect(()=>{if(allPotted&&balls.length>1)recordScore("pool",potted*10);},[allPotted]);
  return (<GS id="pool" title="8-Ball Pool" accent={ac} guide={<p>Simplified billiards — aim the cue ball by dragging (slingshot style) and pot all balls into the six pockets.</p>}>
    <SBd scores={{Potted:potted,Left:balls.filter(b=>b.id>0&&b.active).length}} ac={ac} />
    {allPotted&&<SB msg="Table Cleared!" ac={C.emerald} />}
    <div ref={boardRef} onMouseDown={startAim} onMouseMove={moveAim} onMouseUp={endAim} onTouchStart={startAim} onTouchMove={moveAim} onTouchEnd={endAim} style={{width:"min(100%,400px)",aspectRatio:`${W}/${H}`,margin:"0 auto",background:"#0d6b3d",borderRadius:10,border:"8px solid #5c3317",position:"relative",cursor:"crosshair",touchAction:"none",boxShadow:"inset 0 0 20px rgba(0,0,0,0.3)"}}>
      {pockets.map((p,i)=>(<div key={i} style={{position:"absolute",left:`${p.x/W*100}%`,top:`${p.y/H*100}%`,width:POCKET*2,height:POCKET*2,borderRadius:"50%",background:"#111",transform:"translate(-50%,-50%)"}} />))}
      {balls.filter(b=>b.active).map(b=>(<div key={b.id} style={{position:"absolute",left:`${b.x/W*100}%`,top:`${b.y/H*100}%`,width:b.r*2,height:b.r*2,borderRadius:"50%",background:b.color,border:b.striped?"2px solid #fff":"1px solid rgba(0,0,0,0.3)",transform:"translate(-50%,-50%)",boxShadow:"0 1px 3px rgba(0,0,0,0.4)",fontSize:6,display:"flex",alignItems:"center",justifyContent:"center",color:b.id===0?"transparent":b.id===8?"#fff":"transparent",fontWeight:700}}>{b.id>0?b.id:""}</div>))}
      {aiming&&aimEnd&&cue.active&&(<svg style={{position:"absolute",top:0,left:0,width:"100%",height:"100%",pointerEvents:"none"}}><line x1={`${cue.x/W*100}%`} y1={`${cue.y/H*100}%`} x2={`${(cue.x+(cue.x-aimEnd.x)*1.5)/W*100}%`} y2={`${(cue.y+(cue.y-aimEnd.y)*1.5)/H*100}%`} stroke="rgba(255,255,255,0.5)" strokeWidth="1.5" strokeDasharray="4,4" /></svg>)}
    </div>
    <p style={{textAlign:"center",fontSize:12,color:C.textD,marginTop:8}}>Drag from cue ball to aim</p>
    <RB onClick={()=>{setBalls(initBalls());setPotted(0);setMoving(false);}} ac={ac} />
  </GS>);
}

// ══════════════════════════════════════
// GAME: SNOOKER (new — simplified single-player break-building variant)
// ══════════════════════════════════════
function Snooker() {
  const ac=C.emerald,{ recordScore }=useAuth();
  const W=440,H=220,BR=6,POCKET=13;
  const pockets=[{x:BR,y:BR},{x:W/2,y:BR},{x:W-BR,y:BR},{x:BR,y:H-BR},{x:W/2,y:H-BR},{x:W-BR,y:H-BR}];
  // Snooker colour values: yellow=2, green=3, brown=4, blue=5, pink=6, black=7
  const COLOURS = [
    { name: "yellow", hex: "#f1c40f", value: 2 },
    { name: "green", hex: "#16a34a", value: 3 },
    { name: "brown", hex: "#92400e", value: 4 },
    { name: "blue", hex: "#2563eb", value: 5 },
    { name: "pink", hex: "#ec4899", value: 6 },
    { name: "black", hex: "#111827", value: 7 },
  ];
  const initBalls = () => {
    const balls = [{ x: 70, y: H / 2, r: BR, vx: 0, vy: 0, active: true, color: "#fff", id: "cue", kind: "cue" }];
    // 15 reds in a triangle
    let rid = 0;
    const cx = 260, cy = H / 2;
    for (let row = 0; row < 5; row++) for (let col = 0; col <= row; col++) {
      balls.push({ x: cx + row * 12, y: cy + (col - row / 2) * 12.5, r: BR, vx: 0, vy: 0, active: true, color: "#dc2626", id: `red${rid}`, kind: "red", value: 1 });
      rid++;
    }
    // 6 colours spotted along the baulk-to-baize line
    COLOURS.forEach((col, i) => {
      balls.push({ x: 330 + i * 15, y: H / 2 - 60 + (i % 2 === 0 ? 0 : 30) + Math.floor(i / 2) * 20, r: BR, vx: 0, vy: 0, active: true, color: col.hex, id: col.name, kind: "colour", value: col.value });
    });
    return balls;
  };
  const [balls, setBalls] = useState(initBalls);
  const [moving, setMoving] = useState(false);
  const [aiming, setAiming] = useState(false);
  const [aimEnd, setAimEnd] = useState(null);
  const [score, setScore] = useState(0);
  const [breakScore, setBreakScore] = useState(0);
  const boardRef = useRef(null); const animRef = useRef(null);
  const cue = balls.find(b => b.id === "cue");
  const getPos = (e) => { const rect = boardRef.current?.getBoundingClientRect(); if (!rect) return null; const cx = e.touches ? e.touches[0].clientX : e.clientX; const cy = e.touches ? e.touches[0].clientY : e.clientY; return { x: (cx - rect.left) / rect.width * W, y: (cy - rect.top) / rect.height * H }; };
  const startAim = (e) => { if (moving || !cue?.active) return; e.preventDefault(); setAiming(true); setAimEnd(getPos(e)); };
  const moveAim = (e) => { if (!aiming) return; e.preventDefault(); setAimEnd(getPos(e)); };
  const endAim = (e) => {
    if (!aiming) return; e.preventDefault(); setAiming(false);
    if (!aimEnd || !cue?.active) return;
    const dx = cue.x - aimEnd.x, dy = cue.y - aimEnd.y;
    const power = Math.min(Math.sqrt(dx * dx + dy * dy) * 0.1, 10);
    if (power < 0.3) return;
    const len = Math.sqrt(dx * dx + dy * dy);
    setBalls(prev => prev.map(b => b.id === "cue" ? { ...b, vx: dx / len * power, vy: dy / len * power } : b));
    setMoving(true);
  };
  useEffect(() => {
    if (!moving) return;
    const bds = balls.map(b => ({ ...b }));
    const step = () => {
      let any = false; const fr = 0.985;
      for (let b of bds) { if (!b.active) continue; b.x += b.vx; b.y += b.vy; b.vx *= fr; b.vy *= fr; if (Math.abs(b.vx) < 0.04 && Math.abs(b.vy) < 0.04) { b.vx = 0; b.vy = 0; } else any = true; if (b.x - b.r < 0) { b.x = b.r; b.vx = -b.vx * 0.75; } if (b.x + b.r > W) { b.x = W - b.r; b.vx = -b.vx * 0.75; } if (b.y - b.r < 0) { b.y = b.r; b.vy = -b.vy * 0.75; } if (b.y + b.r > H) { b.y = H - b.r; b.vy = -b.vy * 0.75; } }
      for (let i = 0; i < bds.length; i++) for (let j = i + 1; j < bds.length; j++) { const a = bds[i], b2 = bds[j]; if (!a.active || !b2.active) continue; const dx = b2.x - a.x, dy = b2.y - a.y, dist = Math.sqrt(dx * dx + dy * dy); if (dist < a.r + b2.r && dist > 0) { const nx = dx / dist, ny = dy / dist, dvn = (a.vx - b2.vx) * nx + (a.vy - b2.vy) * ny; if (dvn > 0) { a.vx -= dvn * nx; a.vy -= dvn * ny; b2.vx += dvn * nx; b2.vy += dvn * ny; } const ov = (a.r + b2.r - dist) / 2; a.x -= ov * nx; a.y -= ov * ny; b2.x += ov * nx; b2.y += ov * ny; any = true; } }
      let potPoints = 0;
      for (let b of bds) if (b.active) for (let p of pockets) if (Math.sqrt((b.x - p.x) ** 2 + (b.y - p.y) ** 2) < POCKET) {
        if (b.kind === "cue") { b.x = 70; b.y = H / 2; b.vx = 0; b.vy = 0; }
        else { b.active = false; potPoints += b.value || 0; }
        break;
      }
      if (potPoints > 0) { setScore(s => s + potPoints); setBreakScore(s => s + potPoints); }
      setBalls(bds.map(b => ({ ...b })));
      if (any) animRef.current = requestAnimationFrame(step); else setMoving(false);
    };
    animRef.current = requestAnimationFrame(step);
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current); };
  }, [moving]);
  const redsLeft = balls.filter(b => b.kind === "red" && b.active).length;
  const coloursLeft = balls.filter(b => b.kind === "colour" && b.active).length;
  const cleared = redsLeft === 0 && coloursLeft === 0;
  const reportedRef = useRef(false);
  useEffect(() => { if (cleared && !reportedRef.current) { reportedRef.current = true; recordScore("snooker", score); } }, [cleared, score]);
  const reset = () => { setBalls(initBalls()); setScore(0); setBreakScore(0); setMoving(false); reportedRef.current = false; };
  return (<GS id="snooker" title="Snooker" accent={ac} guide={<><p>A simplified single-table snooker variant: pot the 15 reds (1 point each) and the 6 colours — yellow (2), green (3), brown (4), blue (5), pink (6), black (7) — to build your break. Drag from the cue ball (slingshot style) and release to shoot; clear the table for your final score.</p><p>This is a casual break-building variant rather than full tournament snooker rules (no fouls, no "colour after every red" enforcement) — great for practicing potting and getting a feel for the game.</p></>}>
    <SBd scores={{ Score: score, Break: breakScore, Reds: redsLeft, Colours: coloursLeft }} ac={ac} />
    {cleared && <SB msg={`Table Cleared! Final Score: ${score}`} ac={C.emerald} />}
    <div ref={boardRef} onMouseDown={startAim} onMouseMove={moveAim} onMouseUp={endAim} onTouchStart={startAim} onTouchMove={moveAim} onTouchEnd={endAim} style={{ width: "min(100%,440px)", aspectRatio: `${W}/${H}`, margin: "0 auto", background: "#0a5c33", borderRadius: 10, border: "8px solid #4a2c17", position: "relative", cursor: "crosshair", touchAction: "none", boxShadow: "inset 0 0 24px rgba(0,0,0,0.35)" }}>
      {pockets.map((p, i) => (<div key={i} style={{ position: "absolute", left: `${p.x / W * 100}%`, top: `${p.y / H * 100}%`, width: POCKET * 2, height: POCKET * 2, borderRadius: "50%", background: "#111", transform: "translate(-50%,-50%)" }} />))}
      {balls.filter(b => b.active).map(b => (<div key={b.id} style={{ position: "absolute", left: `${b.x / W * 100}%`, top: `${b.y / H * 100}%`, width: b.r * 2, height: b.r * 2, borderRadius: "50%", background: b.color, border: "1px solid rgba(0,0,0,0.35)", transform: "translate(-50%,-50%)", boxShadow: "0 1px 3px rgba(0,0,0,0.4)" }} />))}
      {aiming && aimEnd && cue?.active && (<svg style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", pointerEvents: "none" }}><line x1={`${cue.x / W * 100}%`} y1={`${cue.y / H * 100}%`} x2={`${(cue.x + (cue.x - aimEnd.x) * 1.5) / W * 100}%`} y2={`${(cue.y + (cue.y - aimEnd.y) * 1.5) / H * 100}%`} stroke="rgba(255,255,255,0.5)" strokeWidth="1.5" strokeDasharray="4,4" /></svg>)}
    </div>
    <p style={{ textAlign: "center", fontSize: 12, color: C.textD, marginTop: 8 }}>Drag from the cue ball to aim</p>
    <RB onClick={reset} ac={ac} />
  </GS>);
}

// ══════════════════════════════════════
// GAME: HANGMAN
// ══════════════════════════════════════
function Hangman() {
  const ac=C.cyan,{ recordScore }=useAuth();
  const words=["JAVASCRIPT","ELEPHANT","BEAUTIFUL","ADVENTURE","DINOSAUR","CHOCOLATE","BUTTERFLY","UNIVERSE","MOUNTAIN","CALENDAR","SYMPHONY","TREASURE","PARADISE","CHAMPION","MIDNIGHT","FIREWORKS","DOLPHIN","VOLCANO","RAINBOW","CRYSTAL","PHOENIX","HARMONY","ABSTRACT","FESTIVAL","NITROGEN"];
  const [word,setWord]=useState(()=>words[Math.floor(Math.random()*words.length)]);
  const [guessed,setGuessed]=useState(new Set());const [wrong,setWrong]=useState(0);const MAX=7;
  const won=word.split("").every(l=>guessed.has(l));const lost=wrong>=MAX;
  useEffect(()=>{if(won)recordScore("hangman",Math.max(1,(MAX-wrong)*10));},[won]);
  const guess=l=>{if(won||lost||guessed.has(l))return;setGuessed(p=>new Set([...p,l]));if(!word.includes(l))setWrong(w=>w+1);};
  const reset=()=>{setWord(words[Math.floor(Math.random()*words.length)]);setGuessed(new Set());setWrong(0);};
  const bodyParts=["○","│","╱","╲","│","╱","╲"];
  return (<GS id="hangman" title="Hangman" accent={ac} guide={<p>Guess the hidden word one letter at a time. Each wrong guess adds a body part. 7 wrong guesses and it's game over!</p>}>
    <SB msg={won?"🎉 You got it!":lost?`💀 The word was: ${word}`:`${MAX-wrong} guesses left`} ac={won?C.emerald:lost?C.rose:ac} />
    <div style={{textAlign:"center",marginBottom:20}}>
      <div style={{fontFamily:"monospace",fontSize:20,lineHeight:1.3,color:C.text,marginBottom:16}}>
        <div>┌───┐</div><div>│{"   "}{wrong>0?bodyParts[0]:" "}</div><div>│{"  "}{wrong>2?bodyParts[2]:wrong>1?" ":""}{wrong>1?bodyParts[1]:""}{wrong>3?bodyParts[3]:""}</div><div>│{"   "}{wrong>4?bodyParts[4]:" "}</div><div>│{"  "}{wrong>5?bodyParts[5]:""}{wrong>5?" ":"  "}{wrong>6?bodyParts[6]:""}</div><div>└───</div>
      </div>
      <div style={{display:"flex",justifyContent:"center",gap:8,marginBottom:20,flexWrap:"wrap"}}>
        {word.split("").map((l,i)=>(<div key={i} style={{width:32,height:40,borderBottom:`3px solid ${guessed.has(l)?C.emerald:ac}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,fontWeight:700,color:C.text}}>{guessed.has(l)||lost?l:""}</div>))}
      </div>
      <div style={{display:"flex",flexWrap:"wrap",justifyContent:"center",gap:4,maxWidth:380,margin:"0 auto"}}>
        {"ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").map(l=>{const used=guessed.has(l);const correct=word.includes(l)&&used;return(<button key={l} onClick={()=>guess(l)} disabled={used||won||lost} style={{width:32,height:36,borderRadius:6,border:"none",fontSize:13,fontWeight:700,cursor:used?"default":"pointer",background:correct?`${C.emerald}30`:used?`${C.rose}20`:C.card,color:correct?C.emerald:used?C.textD:C.text,opacity:used?0.6:1}}>{l}</button>);})}
      </div>
    </div>
    <RB onClick={reset} ac={ac} />
  </GS>);
}

// ══════════════════════════════════════
// GAME: DOTS & BOXES (2 Players / Online)
// ══════════════════════════════════════
function DotsBoxes() {
  const ac=C.rose,{ recordScore }=useAuth();const N=4;
  const [hLines,setHL]=useState(Array.from({length:N+1},()=>Array(N).fill(0)));const [vLines,setVL]=useState(Array.from({length:N},()=>Array(N+1).fill(0)));const [boxes,setBoxes]=useState(Array.from({length:N},()=>Array(N).fill(0)));const [turn,setTurn]=useState(1);const [scores,setScores]=useState({P1:0,P2:0});
  const [mode,setMode]=useState("2 Players");
  const mp = useMultiplayer("dotsboxes");
  const online = mode === "Online";
  const mySlot = mp.room?.you?.slot; const myOwner = mySlot === 0 ? 1 : 2;
  const myTurn = online && mp.status === "matched" && mp.room.turn === mySlot;

  const checkBox=(nh,nv,r,c)=>{if(r<0||r>=N||c<0||c>=N)return false;return nh[r][c]&&nh[r+1][c]&&nv[r][c]&&nv[r][c+1];};

  useEffect(() => {
    if (!online || !mp.lastOpponentMove) return;
    const { state } = mp.lastOpponentMove;
    if (state) { setHL(state.hLines); setVL(state.vLines); setBoxes(state.boxes); setTurn(state.turn); setScores(state.scores); }
  }, [mp.lastOpponentMove]);

  const clickH=(r,c)=>{
    if (online && !myTurn) return;
    if(hLines[r][c])return;
    const nh=hLines.map(row=>[...row]);nh[r][c]=turn;setHL(nh);
    let scored=false;const nb=boxes.map(row=>[...row]);
    if(r>0&&checkBox(nh,vLines,r-1,c)&&!nb[r-1][c]){nb[r-1][c]=turn;scored=true;}
    if(r<N&&checkBox(nh,vLines,r,c)&&!nb[r][c]){nb[r][c]=turn;scored=true;}
    setBoxes(nb);
    let nextTurn=turn, nextScores=scores;
    if(scored){nextScores={...scores,[`P${turn}`]:scores[`P${turn}`]+1};setScores(nextScores);}
    else{nextTurn=turn===1?2:1;setTurn(nextTurn);}
    if (online) mp.sendMove({ hLines: nh, vLines, boxes: nb, turn: nextTurn, scores: nextScores }, nextTurn - 1);
  };
  const clickV=(r,c)=>{
    if (online && !myTurn) return;
    if(vLines[r][c])return;
    const nv=vLines.map(row=>[...row]);nv[r][c]=turn;setVL(nv);
    let scored=false;const nb=boxes.map(row=>[...row]);
    if(c>0&&checkBox(hLines,nv,r,c-1)&&!nb[r][c-1]){nb[r][c-1]=turn;scored=true;}
    if(c<N&&checkBox(hLines,nv,r,c)&&!nb[r][c]){nb[r][c]=turn;scored=true;}
    setBoxes(nb);
    let nextTurn=turn, nextScores=scores;
    if(scored){nextScores={...scores,[`P${turn}`]:scores[`P${turn}`]+1};setScores(nextScores);}
    else{nextTurn=turn===1?2:1;setTurn(nextTurn);}
    if (online) mp.sendMove({ hLines, vLines: nv, boxes: nb, turn: nextTurn, scores: nextScores }, nextTurn - 1);
  };
  const total=boxes.flat().filter(b=>b>0).length;const done=total===N*N;
  const reportedRef = useRef(false);
  useEffect(()=>{
    if(!done) return;
    if (online) {
      if (reportedRef.current) return;
      reportedRef.current = true;
      const isDraw = scores.P1 === scores.P2;
      const iWon = scores[`P${myOwner}`] > scores[`P${myOwner===1?2:1}`];
      if (isDraw) mp.reportGameOver("draw", 10);
      else if (iWon) mp.reportGameOver("win", Math.max(scores.P1,scores.P2)*5);
    } else {
      recordScore("dotsboxes",Math.max(scores.P1,scores.P2)*5);
    }
  },[done]);
  const reset=()=>{setHL(Array.from({length:N+1},()=>Array(N).fill(0)));setVL(Array.from({length:N},()=>Array(N+1).fill(0)));setBoxes(Array.from({length:N},()=>Array(N).fill(0)));setTurn(1);setScores({P1:0,P2:0});reportedRef.current=false;if(online) mp.reset();};
  return (<GS id="dotsboxes" title="Dots & Boxes" accent={ac} guide={<p>Draw lines between dots. Complete a box (all 4 sides) to score and go again. Most boxes wins! Online mode matches you with another signed-in player, and extra turns from completing a box are kept in sync in real time.</p>}>
    <MS modes={["2 Players","Online"]} sel={mode} onSel={(m)=>{setMode(m);reset();}} ac={ac} />
    {online && <OnlinePanel mp={mp} ac={ac} mySymbolLabel="Player 1" oppSymbolLabel="Player 2" />}
    {(!online || mp.status==="matched" || mp.status==="finished") && (<>
      <SBd scores={scores} ac={ac} /><SB msg={done?(scores.P1>scores.P2?"Player 1 Wins!":scores.P2>scores.P1?"Player 2 Wins!":"Tie!"):online?(myTurn?"Your Turn":"Opponent's Turn"):`Player ${turn}'s Turn`} ac={done?C.emerald:ac} />
      <div style={{maxWidth:300,margin:"0 auto"}}>
        {Array.from({length:N*2+1}).map((_,row)=>{const isHRow=row%2===0;const r=Math.floor(row/2);return(<div key={row} style={{display:"flex",alignItems:"center",justifyContent:"center"}}>
          {isHRow?Array.from({length:N*2+1}).map((_,col)=>{const isDot=col%2===0;const c=Math.floor(col/2);return isDot?(<div key={col} style={{width:12,height:12,borderRadius:"50%",background:C.text,flexShrink:0}} />):(<button key={col} onClick={()=>clickH(r,c)} style={{flex:1,height:6,background:hLines[r][c]?(hLines[r][c]===1?C.cyan:C.rose):C.card,border:"none",cursor:hLines[r][c]?"default":"pointer",borderRadius:3,margin:"0 2px",minWidth:40}} />);}):Array.from({length:N*2+1}).map((_,col)=>{const isVLine=col%2===0;const c=Math.floor(col/2);return isVLine?(<button key={col} onClick={()=>clickV(r,c)} style={{width:6,height:40,background:vLines[r]?.[c]?(vLines[r][c]===1?C.cyan:C.rose):C.card,border:"none",cursor:vLines[r]?.[c]?"default":"pointer",borderRadius:3,flexShrink:0}} />):(<div key={col} style={{flex:1,height:40,display:"flex",alignItems:"center",justifyContent:"center",minWidth:40}}>
            {boxes[r]?.[Math.floor(col/2)]?(<span style={{fontSize:16,fontWeight:800,color:boxes[r][Math.floor(col/2)]===1?C.cyan:C.rose}}>{boxes[r][Math.floor(col/2)]===1?"1":"2"}</span>):null}
          </div>);})
        }</div>);})}
      </div>
      {(!online || done) && <RB onClick={reset} ac={ac} label={online ? "Find New Match" : "New Game"} />}
    </>)}
  </GS>);
}

// ═══════════════════════════════════════════════════
// KIDS LEARNING GAMES (Ages 3-10)
// ═══════════════════════════════════════════════════

function ABCExplorer() {
  const ac = C.pink, { recordScore } = useAuth();
  const [target, setTarget] = useState("A");
  const [options, setOptions] = useState([]);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [feedback, setFeedback] = useState(null);
  const [mode, setMode] = useState("Letters");

  const genRound = useCallback((m) => {
    const isUpper = m === "Letters";
    const alpha = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const ti = Math.floor(Math.random() * 26);
    const tgt = isUpper ? alpha[ti] : alpha[ti].toLowerCase();
    const opts = [tgt];
    while (opts.length < 4) {
      const ri = Math.floor(Math.random() * 26);
      const ch = isUpper ? alpha[ri] : alpha[ri].toLowerCase();
      if (!opts.includes(ch)) opts.push(ch);
    }
    opts.sort(() => Math.random() - 0.5);
    setTarget(tgt);
    setOptions(opts);
    setFeedback(null);
  }, []);

  useEffect(() => { genRound(mode); }, [mode, genRound]);

  const pick = (ch) => {
    if (feedback) return;
    if (ch === target) {
      setFeedback("correct");
      setScore(s => s + 10);
      setStreak(s => s + 1);
      recordScore("abc", 10);
      setTimeout(() => genRound(mode), 800);
    } else {
      setFeedback("wrong");
      setStreak(0);
      setTimeout(() => setFeedback(null), 600);
    }
  };

  const letterEmojis = { A: "🍎", B: "🐻", C: "🐱", D: "🐕", E: "🦅", F: "🐸", G: "🍇", H: "🐴", I: "🍦", J: "🎃", K: "🪁", L: "🦁", M: "🐒", N: "🥜", O: "🐙", P: "🐧", Q: "👑", R: "🌈", S: "⭐", T: "🐢", U: "☂️", V: "🎻", W: "🐋", X: "✖️", Y: "🧶", Z: "🦓" };
  const emoji = letterEmojis[target.toUpperCase()] || "📝";

  return (<GS id="abc" title="ABC Explorer" accent={ac} guide={<><p>A fun letter-recognition game for young children! A letter is shown with an illustration, and kids tap the matching letter from four choices. Builds alphabet familiarity and letter recognition through playful repetition.</p><p><strong>Age:</strong> 3-6 years · <strong>Skills:</strong> Letter recognition, alphabet order, uppercase & lowercase</p></>}>
    <MS modes={["Letters", "lowercase"]} sel={mode} onSel={m => { setMode(m); setScore(0); setStreak(0); }} ac={ac} />
    <SBd scores={{ Score: score, Streak: streak }} ac={ac} />
    <div style={{ textAlign: "center", marginBottom: 16 }}>
      <div style={{ fontSize: 64, marginBottom: 8 }}>{emoji}</div>
      <div style={{ fontSize: "clamp(48px,12vw,80px)", fontWeight: 900, color: C.text, lineHeight: 1 }}>{target}</div>
      <div style={{ fontSize: 14, color: C.textM, marginTop: 4 }}>Find this letter!</div>
    </div>
    {feedback === "correct" && <SB msg="⭐ Correct! Great job!" ac={C.emerald} />}
    {feedback === "wrong" && <SB msg="Oops! Try again!" ac={C.rose} />}
    <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 12, maxWidth: 280, margin: "0 auto" }}>
      {options.map((ch, i) => (
        <button key={i} onClick={() => pick(ch)} style={{ padding: 20, borderRadius: 16, fontSize: "clamp(28px,7vw,44px)", fontWeight: 800, cursor: "pointer", background: feedback === "correct" && ch === target ? `${C.emerald}30` : C.card, border: `2px solid ${feedback === "correct" && ch === target ? C.emerald : C.border}`, color: C.text, display: "flex", alignItems: "center", justifyContent: "center", transition: "all .15s" }}>
          {ch}
        </button>
      ))}
    </div>
    <RB onClick={() => { setScore(0); setStreak(0); genRound(mode); }} ac={ac} label="Start Over" />
  </GS>);
}

function NumberFun() {
  const ac = C.lime, { recordScore } = useAuth();
  const fruitEmoji = ["🍎", "🍊", "🍋", "🍇", "🍓", "🍌", "🍑", "🫐", "🥝", "🍒"];
  const [count, setCount] = useState(3);
  const [emoji, setEmoji] = useState("🍎");
  const [options, setOptions] = useState([]);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [feedback, setFeedback] = useState(null);
  const [mode, setMode] = useState("Count (1-5)");

  const maxN = mode === "Count (1-5)" ? 5 : mode === "Count (1-10)" ? 10 : 20;

  const genRound = useCallback(() => {
    const n = Math.floor(Math.random() * maxN) + 1;
    const em = fruitEmoji[Math.floor(Math.random() * fruitEmoji.length)];
    const opts = [n];
    while (opts.length < 4) {
      const r = Math.floor(Math.random() * maxN) + 1;
      if (!opts.includes(r)) opts.push(r);
    }
    opts.sort(() => Math.random() - 0.5);
    setCount(n); setEmoji(em); setOptions(opts); setFeedback(null);
  }, [maxN]);

  useEffect(() => { genRound(); }, [genRound]);

  const pick = (n) => {
    if (feedback) return;
    if (n === count) {
      setFeedback("correct"); setScore(s => s + 10); setStreak(s => s + 1);
      recordScore("numbers", 10);
      setTimeout(() => genRound(), 800);
    } else {
      setFeedback("wrong"); setStreak(0);
      setTimeout(() => setFeedback(null), 600);
    }
  };

  const items = Array(count).fill(emoji);

  return (<GS id="numbers" title="Number Fun 123" accent={ac} guide={<><p>Count the objects on screen, then tap the correct number! Builds counting skills and number recognition with colorful fruit illustrations. Three difficulty levels let children progress as they learn.</p><p><strong>Age:</strong> 3-7 years · <strong>Skills:</strong> Counting, number recognition, quantity comparison</p></>}>
    <MS modes={["Count (1-5)", "Count (1-10)", "Count (1-20)"]} sel={mode} onSel={m => { setMode(m); setScore(0); setStreak(0); }} ac={ac} />
    <SBd scores={{ Score: score, Streak: streak }} ac={ac} />
    <div style={{ textAlign: "center", marginBottom: 16 }}>
      <div style={{ fontSize: 14, color: C.textM, marginBottom: 8 }}>How many {emoji} do you see?</div>
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 8, maxWidth: 320, margin: "0 auto", padding: 16, background: C.card, borderRadius: 16, border: `1px solid ${C.border}`, minHeight: 60 }}>
        {items.map((e, i) => (<span key={i} style={{ fontSize: "clamp(24px,6vw,36px)" }}>{e}</span>))}
      </div>
    </div>
    {feedback === "correct" && <SB msg="🌟 Correct! You're a counting star!" ac={C.emerald} />}
    {feedback === "wrong" && <SB msg="Try counting again!" ac={C.rose} />}
    <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 10, maxWidth: 260, margin: "0 auto" }}>
      {options.map((n, i) => (
        <button key={i} onClick={() => pick(n)} style={{ padding: 18, borderRadius: 16, fontSize: 32, fontWeight: 800, cursor: "pointer", background: feedback === "correct" && n === count ? `${C.emerald}30` : C.card, border: `2px solid ${feedback === "correct" && n === count ? C.emerald : C.border}`, color: C.text }}>
          {n}
        </button>
      ))}
    </div>
    <RB onClick={() => { setScore(0); setStreak(0); genRound(); }} ac={ac} label="Start Over" />
  </GS>);
}

function ColorMatch() {
  const ac = C.pink, { recordScore } = useAuth();
  const colors = [
    { name: "Red", hex: "#ef4444" }, { name: "Blue", hex: "#3b82f6" }, { name: "Green", hex: "#22c55e" },
    { name: "Yellow", hex: "#eab308" }, { name: "Orange", hex: "#f97316" }, { name: "Purple", hex: "#a855f7" },
    { name: "Pink", hex: "#ec4899" }, { name: "Brown", hex: "#92400e" }, { name: "Black", hex: "#1e1e2e" }, { name: "White", hex: "#f0f0f0" },
  ];
  const [target, setTarget] = useState(colors[0]);
  const [options, setOptions] = useState([]);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [feedback, setFeedback] = useState(null);

  const genRound = useCallback(() => {
    const ti = Math.floor(Math.random() * colors.length);
    const tgt = colors[ti];
    const opts = [tgt];
    while (opts.length < 4) {
      const ri = Math.floor(Math.random() * colors.length);
      if (!opts.find(o => o.name === colors[ri].name)) opts.push(colors[ri]);
    }
    opts.sort(() => Math.random() - 0.5);
    setTarget(tgt); setOptions(opts); setFeedback(null);
  }, []);

  useEffect(() => { genRound(); }, [genRound]);

  const pick = (c) => {
    if (feedback) return;
    if (c.name === target.name) {
      setFeedback("correct"); setScore(s => s + 10); setStreak(s => s + 1);
      recordScore("colors", 10);
      setTimeout(() => genRound(), 800);
    } else {
      setFeedback("wrong"); setStreak(0);
      setTimeout(() => setFeedback(null), 600);
    }
  };

  return (<GS id="colors" title="Color Match" accent={ac} guide={<><p>A bright, colorful game that teaches children to recognize and name colors! A large color swatch is displayed, and kids tap the correct color name. Helps build color vocabulary and visual discrimination.</p><p><strong>Age:</strong> 2-6 years · <strong>Skills:</strong> Color recognition, vocabulary, visual matching</p></>}>
    <SBd scores={{ Score: score, Streak: streak }} ac={ac} />
    <div style={{ textAlign: "center", marginBottom: 16 }}>
      <div style={{ fontSize: 14, color: C.textM, marginBottom: 8 }}>What color is this?</div>
      <div style={{ width: 140, height: 140, borderRadius: 24, background: target.hex, margin: "0 auto", boxShadow: `0 4px 24px ${target.hex}40`, border: "4px solid rgba(255,255,255,0.15)" }} />
    </div>
    {feedback === "correct" && <SB msg="🎨 Correct! Great eye!" ac={C.emerald} />}
    {feedback === "wrong" && <SB msg="Not quite — try again!" ac={C.rose} />}
    <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 10, maxWidth: 300, margin: "0 auto" }}>
      {options.map((c, i) => (
        <button key={i} onClick={() => pick(c)} style={{ padding: "14px 16px", borderRadius: 14, fontSize: 16, fontWeight: 700, cursor: "pointer", background: feedback === "correct" && c.name === target.name ? `${C.emerald}30` : C.card, border: `2px solid ${feedback === "correct" && c.name === target.name ? C.emerald : C.border}`, color: C.text, display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 24, height: 24, borderRadius: 6, background: c.hex, border: "1px solid rgba(255,255,255,0.1)", flexShrink: 0 }} />
          {c.name}
        </button>
      ))}
    </div>
    <RB onClick={() => { setScore(0); setStreak(0); genRound(); }} ac={ac} label="Start Over" />
  </GS>);
}

function ShapeSorter() {
  const ac = C.cyan, { recordScore } = useAuth();
  const shapes = [
    { name: "Circle", svg: <circle cx="50" cy="50" r="40" fill="#3b82f6" /> },
    { name: "Square", svg: <rect x="10" y="10" width="80" height="80" rx="4" fill="#ef4444" /> },
    { name: "Triangle", svg: <polygon points="50,10 90,90 10,90" fill="#22c55e" /> },
    { name: "Star", svg: <polygon points="50,5 61,38 97,38 68,58 79,92 50,72 21,92 32,58 3,38 39,38" fill="#eab308" /> },
    { name: "Heart", svg: <path d="M50,85 C20,60 5,40 15,25 C25,10 40,15 50,30 C60,15 75,10 85,25 C95,40 80,60 50,85Z" fill="#ec4899" /> },
    { name: "Diamond", svg: <polygon points="50,5 95,50 50,95 5,50" fill="#a855f7" /> },
  ];
  const [target, setTarget] = useState(shapes[0]);
  const [options, setOptions] = useState([]);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [feedback, setFeedback] = useState(null);

  const genRound = useCallback(() => {
    const ti = Math.floor(Math.random() * shapes.length);
    const tgt = shapes[ti];
    const opts = [tgt];
    while (opts.length < 4) {
      const ri = Math.floor(Math.random() * shapes.length);
      if (!opts.find(o => o.name === shapes[ri].name)) opts.push(shapes[ri]);
    }
    opts.sort(() => Math.random() - 0.5);
    setTarget(tgt); setOptions(opts); setFeedback(null);
  }, []);

  useEffect(() => { genRound(); }, [genRound]);

  const pick = (s) => {
    if (feedback) return;
    if (s.name === target.name) {
      setFeedback("correct"); setScore(s2 => s2 + 10); setStreak(s2 => s2 + 1);
      recordScore("shapes", 10);
      setTimeout(() => genRound(), 800);
    } else {
      setFeedback("wrong"); setStreak(0);
      setTimeout(() => setFeedback(null), 600);
    }
  };

  return (<GS id="shapes" title="Shape Sorter" accent={ac} guide={<><p>Learn to identify basic geometric shapes! A shape is displayed and children choose its name from four options. Develops visual recognition and geometry vocabulary in a playful format.</p><p><strong>Age:</strong> 3-6 years · <strong>Skills:</strong> Shape recognition, geometry basics, visual discrimination</p></>}>
    <SBd scores={{ Score: score, Streak: streak }} ac={ac} />
    <div style={{ textAlign: "center", marginBottom: 16 }}>
      <div style={{ fontSize: 14, color: C.textM, marginBottom: 8 }}>What shape is this?</div>
      <svg viewBox="0 0 100 100" width="140" height="140" style={{ margin: "0 auto", display: "block" }}>{target.svg}</svg>
    </div>
    {feedback === "correct" && <SB msg="🔷 Correct! You know your shapes!" ac={C.emerald} />}
    {feedback === "wrong" && <SB msg="Not that one — try again!" ac={C.rose} />}
    <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 10, maxWidth: 300, margin: "0 auto" }}>
      {options.map((s, i) => (
        <button key={i} onClick={() => pick(s)} style={{ padding: "14px 16px", borderRadius: 14, fontSize: 16, fontWeight: 700, cursor: "pointer", background: feedback === "correct" && s.name === target.name ? `${C.emerald}30` : C.card, border: `2px solid ${feedback === "correct" && s.name === target.name ? C.emerald : C.border}`, color: C.text }}>
          {s.name}
        </button>
      ))}
    </div>
    <RB onClick={() => { setScore(0); setStreak(0); genRound(); }} ac={ac} label="Start Over" />
  </GS>);
}

function AnimalQuiz() {
  const ac = C.amber, { recordScore } = useAuth();
  const animals = [
    { name: "Cat", emoji: "🐱", sound: "Meow!" }, { name: "Dog", emoji: "🐶", sound: "Woof!" },
    { name: "Cow", emoji: "🐮", sound: "Moo!" }, { name: "Lion", emoji: "🦁", sound: "Roar!" },
    { name: "Frog", emoji: "🐸", sound: "Ribbit!" }, { name: "Monkey", emoji: "🐵", sound: "Ooh ooh!" },
    { name: "Elephant", emoji: "🐘", sound: "Trumpet!" }, { name: "Pig", emoji: "🐷", sound: "Oink!" },
    { name: "Horse", emoji: "🐴", sound: "Neigh!" }, { name: "Duck", emoji: "🦆", sound: "Quack!" },
    { name: "Owl", emoji: "🦉", sound: "Hoo!" }, { name: "Bear", emoji: "🐻", sound: "Growl!" },
    { name: "Rabbit", emoji: "🐰", sound: "Squeak!" }, { name: "Fish", emoji: "🐟", sound: "Blub!" },
    { name: "Penguin", emoji: "🐧", sound: "Squawk!" }, { name: "Butterfly", emoji: "🦋", sound: "Flutter!" },
  ];
  const [target, setTarget] = useState(animals[0]);
  const [options, setOptions] = useState([]);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [feedback, setFeedback] = useState(null);

  const genRound = useCallback(() => {
    const ti = Math.floor(Math.random() * animals.length);
    const tgt = animals[ti];
    const opts = [tgt];
    while (opts.length < 4) {
      const ri = Math.floor(Math.random() * animals.length);
      if (!opts.find(o => o.name === animals[ri].name)) opts.push(animals[ri]);
    }
    opts.sort(() => Math.random() - 0.5);
    setTarget(tgt); setOptions(opts); setFeedback(null);
  }, []);

  useEffect(() => { genRound(); }, [genRound]);

  const pick = (a) => {
    if (feedback) return;
    if (a.name === target.name) {
      setFeedback("correct"); setScore(s => s + 10); setStreak(s => s + 1);
      recordScore("animals", 10);
      setTimeout(() => genRound(), 1000);
    } else {
      setFeedback("wrong"); setStreak(0);
      setTimeout(() => setFeedback(null), 600);
    }
  };

  return (<GS id="animals" title="Animal Quiz" accent={ac} guide={<><p>Can you name the animals? A big animal emoji is shown and kids tap the correct animal name. Features 16 beloved animals with fun sound effects displayed on correct answers. Builds vocabulary and animal recognition!</p><p><strong>Age:</strong> 2-7 years · <strong>Skills:</strong> Animal recognition, vocabulary, reading</p></>}>
    <SBd scores={{ Score: score, Streak: streak }} ac={ac} />
    <div style={{ textAlign: "center", marginBottom: 16 }}>
      <div style={{ fontSize: 14, color: C.textM, marginBottom: 8 }}>What animal is this?</div>
      <div style={{ fontSize: "clamp(64px,16vw,100px)", lineHeight: 1.1 }}>{target.emoji}</div>
      {feedback === "correct" && <div style={{ fontSize: 18, fontWeight: 700, color: C.amber, marginTop: 8 }}>{target.sound}</div>}
    </div>
    {feedback === "correct" && <SB msg={`🎉 That's a ${target.name}! ${target.sound}`} ac={C.emerald} />}
    {feedback === "wrong" && <SB msg="Hmm, look again!" ac={C.rose} />}
    <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 10, maxWidth: 300, margin: "0 auto" }}>
      {options.map((a, i) => (
        <button key={i} onClick={() => pick(a)} style={{ padding: "14px 16px", borderRadius: 14, fontSize: 16, fontWeight: 700, cursor: "pointer", background: feedback === "correct" && a.name === target.name ? `${C.emerald}30` : C.card, border: `2px solid ${feedback === "correct" && a.name === target.name ? C.emerald : C.border}`, color: C.text }}>
          {a.name}
        </button>
      ))}
    </div>
    <RB onClick={() => { setScore(0); setStreak(0); genRound(); }} ac={ac} label="Start Over" />
  </GS>);
}

function SizeCompare() {
  const ac = C.emerald, { recordScore } = useAuth();
  const items = ["🍎","🚗","🏠","🐘","🐜","🌳","⭐","🐶","🐱","🎈","✈️","🚌","🐟","🦋","🌺","🎂","📱","🖥️","⚽","🏀"];
  const [left, setLeft] = useState({ emoji: "🐘", size: 120 });
  const [right, setRight] = useState({ emoji: "🐜", size: 40 });
  const [answer, setAnswer] = useState("left");
  const [question, setQuestion] = useState("bigger");
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [feedback, setFeedback] = useState(null);

  const genRound = useCallback(() => {
    const e1 = items[Math.floor(Math.random() * items.length)];
    let e2 = e1;
    while (e2 === e1) e2 = items[Math.floor(Math.random() * items.length)];
    const s1 = 40 + Math.floor(Math.random() * 80);
    let s2 = 40 + Math.floor(Math.random() * 80);
    while (Math.abs(s1 - s2) < 20) s2 = 40 + Math.floor(Math.random() * 80);
    const q = Math.random() > 0.5 ? "bigger" : "smaller";
    const ans = q === "bigger" ? (s1 > s2 ? "left" : "right") : (s1 < s2 ? "left" : "right");
    setLeft({ emoji: e1, size: s1 }); setRight({ emoji: e2, size: s2 });
    setQuestion(q); setAnswer(ans); setFeedback(null);
  }, []);

  useEffect(() => { genRound(); }, [genRound]);

  const pick = (side) => {
    if (feedback) return;
    if (side === answer) {
      setFeedback("correct"); setScore(s => s + 10); setStreak(s => s + 1);
      recordScore("size", 10);
      setTimeout(() => genRound(), 800);
    } else {
      setFeedback("wrong"); setStreak(0);
      setTimeout(() => setFeedback(null), 600);
    }
  };

  return (<GS id="size" title="Size Compare" accent={ac} guide={<><p>Which is bigger? Which is smaller? Two items are shown at different sizes, and kids tap the one that matches the question. Builds spatial awareness and comparison skills. Questions alternate between "bigger" and "smaller" to keep children thinking!</p><p><strong>Age:</strong> 3-7 years · <strong>Skills:</strong> Size comparison, spatial reasoning, critical thinking</p></>}>
    <SBd scores={{ Score: score, Streak: streak }} ac={ac} />
    <div style={{ textAlign: "center", marginBottom: 16 }}>
      <div style={{ fontSize: 18, fontWeight: 700, color: ac, marginBottom: 4 }}>
        Tap the {question === "bigger" ? "BIGGER" : "SMALLER"} one!
      </div>
    </div>
    {feedback === "correct" && <SB msg="✅ Correct! You've got sharp eyes!" ac={C.emerald} />}
    {feedback === "wrong" && <SB msg="Look at the sizes again!" ac={C.rose} />}
    <div style={{ display: "flex", justifyContent: "center", gap: 20, marginBottom: 12 }}>
      {[["left", left], ["right", right]].map(([side, item]) => (
        <button key={side} onClick={() => pick(side)} style={{
          width: 150, height: 150, borderRadius: 20, cursor: "pointer",
          background: feedback === "correct" && side === answer ? `${C.emerald}20` : C.card,
          border: `3px solid ${feedback === "correct" && side === answer ? C.emerald : C.border}`,
          display: "flex", alignItems: "center", justifyContent: "center", transition: "all .15s"
        }}>
          <span style={{ fontSize: item.size }}>{item.emoji}</span>
        </button>
      ))}
    </div>
    <RB onClick={() => { setScore(0); setStreak(0); genRound(); }} ac={ac} label="Start Over" />
  </GS>);
}

function PicturePuzzle() {
  const ac = C.violet, { recordScore } = useAuth();
  const puzzles = [
    { emoji: "🐶", name: "Dog", pieces: ["🐕","🦴","🐾","🏠"] },
    { emoji: "🌊", name: "Ocean", pieces: ["🐟","🦀","🐙","🐚"] },
    { emoji: "🌳", name: "Garden", pieces: ["🌺","🦋","🐝","🌻"] },
    { emoji: "🚀", name: "Space", pieces: ["⭐","🌙","🪐","🛸"] },
    { emoji: "🎪", name: "Circus", pieces: ["🤡","🎈","🐘","🎭"] },
    { emoji: "🏖️", name: "Beach", pieces: ["🌴","☀️","🏄","🐬"] },
  ];
  const N = 3;
  const makeTiles = () => {
    const a = Array.from({ length: N * N - 1 }, (_, i) => i + 1);
    a.push(0);
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  const [tiles, setTiles] = useState(makeTiles);
  const [moves, setMoves] = useState(0);
  const [puzzle, setPuzzle] = useState(puzzles[0]);
  const [score, setScore] = useState(0);

  const isSolved = tiles.every((v, i) => v === (i + 1) % (N * N));

  const click = (idx) => {
    if (isSolved) return;
    const empty = tiles.indexOf(0);
    const eR = Math.floor(empty / N), eC = empty % N;
    const cR = Math.floor(idx / N), cC = idx % N;
    if ((Math.abs(eR - cR) + Math.abs(eC - cC)) !== 1) return;
    const nt = [...tiles];
    [nt[empty], nt[idx]] = [nt[idx], nt[empty]];
    setTiles(nt);
    setMoves(m => m + 1);
  };

  useEffect(() => {
    if (isSolved && moves > 0) {
      setScore(s => s + 1);
      recordScore("puzzle", Math.max(1, 30 - moves));
    }
  }, [isSolved]);

  const reset = () => {
    setTiles(makeTiles());
    setMoves(0);
    setPuzzle(puzzles[Math.floor(Math.random() * puzzles.length)]);
  };

  const tileEmojis = ["", ...puzzle.pieces, "🌟", puzzle.emoji, "🎉", "🎶"];

  return (<GS id="puzzle" title="Picture Puzzle" accent={ac} guide={<><p>A classic sliding puzzle adapted for young children! Slide numbered tiles to put them in order (1 through 8). The empty space lets you move adjacent tiles. Develops problem-solving and spatial reasoning skills.</p><p><strong>Age:</strong> 5-10 years · <strong>Skills:</strong> Problem solving, spatial reasoning, patience, sequential thinking</p></>}>
    <SBd scores={{ Moves: moves, Solved: score }} ac={ac} />
    {isSolved && moves > 0 && <SB msg="🧩 Puzzle Complete! Well done!" ac={C.emerald} />}
    <div style={{ textAlign: "center", marginBottom: 12 }}>
      <span style={{ fontSize: 32 }}>{puzzle.emoji}</span>
      <div style={{ fontSize: 13, color: C.textM }}>{puzzle.name} Puzzle — slide tiles into order!</div>
    </div>
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${N},1fr)`, gap: 6, maxWidth: 240, margin: "0 auto" }}>
      {tiles.map((v, i) => (
        <button key={i} onClick={() => click(i)} style={{
          aspectRatio: "1", borderRadius: 12, fontSize: v ? 28 : 0, fontWeight: 800, cursor: v ? "pointer" : "default",
          background: v === 0 ? "transparent" : `linear-gradient(135deg,${ac}30,${ac}15)`,
          border: v === 0 ? "2px dashed rgba(255,255,255,0.1)" : `2px solid ${ac}50`,
          color: C.text, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 2
        }}>
          {v > 0 && <span style={{ fontSize: 20 }}>{tileEmojis[v] || ""}</span>}
          {v > 0 && <span style={{ fontSize: 14 }}>{v}</span>}
        </button>
      ))}
    </div>
    <RB onClick={reset} ac={ac} label="New Puzzle" />
  </GS>);
}

// ══════════════════════════════════════
// GAME DATA
// ══════════════════════════════════════
const GAMES = [
  { id:"chess",name:"Chess",emoji:"♟️",cat:"Strategy",players:"1-2",desc:"The ultimate strategy game — checkmate your opponent",longDesc:"Chess originated in India around the 6th century and has evolved into the world's most popular strategy game. Our browser version includes check/checkmate detection, pawn promotion, legal move highlighting, and real-time online play against another registered player." },
  { id:"tictactoe",name:"Tic Tac Toe",emoji:"❌",cat:"Strategy",players:"1-2",desc:"Classic X/O with unbeatable AI or online play",longDesc:"One of the oldest known strategy games, dating back to ancient Egypt around 1300 BCE. Our AI uses the minimax algorithm, making it mathematically unbeatable — or challenge another player online." },
  { id:"connect4",name:"Connect Four",emoji:"🔴",cat:"Strategy",players:"1-2",desc:"Drop discs, connect four in a row",longDesc:"First sold by Milton Bradley in 1974. Connect Four is a solved game — the first player can always win with perfect play. Play vs AI, a friend locally, or online." },
  { id:"checkers",name:"Checkers",emoji:"🏁",cat:"Strategy",players:"2",desc:"Jump and capture all opponent pieces",longDesc:"Known as Draughts in British English, Checkers dates back to 3000 BCE. Features king promotion, multi-jump captures, and real-time online play." },
  { id:"dotsboxes",name:"Dots & Boxes",emoji:"⬜",cat:"Strategy",players:"2",desc:"Draw lines, complete boxes, outscore your opponent",longDesc:"Invented by French mathematician Édouard Lucas in the 19th century. A deceptively deep strategy game, playable locally or online." },
  { id:"carrom",name:"Carrom",emoji:"🎯",cat:"Action",players:"1",desc:"Flick the striker to pot coins — classic tabletop game",longDesc:"One of the most beloved tabletop games across South Asia, the Middle East, and East Africa. Features physics-based gameplay." },
  { id:"pool",name:"8-Ball Pool",emoji:"🎱",cat:"Action",players:"1",desc:"Pocket all the balls on the green table",longDesc:"Pool has been played since the 15th century and remains one of the world's most popular games. Our version features simplified 2D physics." },
  { id:"snooker",name:"Snooker",emoji:"🔴",cat:"Action",players:"1",desc:"Pot reds and colours to build the highest break",longDesc:"Snooker originated among British Army officers stationed in India in the 1870s. Our simplified break-building variant features 15 reds and all 6 colours on a longer table." },
  { id:"memory",name:"Memory Match",emoji:"🃏",cat:"Puzzle",players:"1-2",desc:"Flip cards and find matching pairs",longDesc:"Memory games improve cognitive function and recall. Choose from 8, 12, or 18 pairs with solo or competitive modes." },
  { id:"minesweeper",name:"Minesweeper",emoji:"💣",cat:"Puzzle",players:"1",desc:"Clear the minefield without hitting a mine",longDesc:"Became a worldwide phenomenon with Microsoft Windows 3.1 in 1992. Use logic to find all the mines." },
  { id:"2048",name:"2048",emoji:"🔢",cat:"Puzzle",players:"1",desc:"Slide tiles to reach the 2048 tile",longDesc:"Created by Gabriele Cirulli in 2014, 2048 went viral attracting millions of players." },
  { id:"hangman",name:"Hangman",emoji:"💀",cat:"Puzzle",players:"1",desc:"Guess the word before the figure is complete",longDesc:"A classic word-guessing game played worldwide. Test your vocabulary with 7 chances to guess wrong." },
  { id:"snake",name:"Snake",emoji:"🐍",cat:"Action",players:"1",desc:"Eat food, grow longer, don't hit yourself",longDesc:"Nokia made Snake iconic on mobile phones in 1998 — an estimated 400 million devices shipped with it." },
  { id:"whack",name:"Whack-a-Mole",emoji:"🐹",cat:"Action",players:"1",desc:"Whack as many moles as you can in 30s",longDesc:"First introduced in Japan in 1975 as 'Mogura Taiji'. Test your reflexes!" },
  // Kids Learning Games
  { id:"abc",name:"ABC Explorer",emoji:"🔤",cat:"Kids",players:"1",desc:"Learn letters with fun pictures — tap the right letter!",longDesc:"A colorful alphabet learning game for young children aged 3-6. Each letter is paired with an animal or object illustration. Supports both uppercase and lowercase letter recognition to help early readers build confidence.", age:"3-6" },
  { id:"numbers",name:"Number Fun 123",emoji:"🔢",cat:"Kids",players:"1",desc:"Count the objects and tap the right number!",longDesc:"Children practice counting from 1 to 20 with colorful fruit illustrations. Three difficulty levels let kids progress from simple counting (1-5) to larger numbers (1-20) as they grow.", age:"3-7" },
  { id:"colors",name:"Color Match",emoji:"🎨",cat:"Kids",players:"1",desc:"Name the colors — learn red, blue, green and more!",longDesc:"Introduces 10 primary and secondary colors with large, vivid swatches. Children match color names to visual samples, building color vocabulary and visual discrimination skills.", age:"2-6" },
  { id:"shapes",name:"Shape Sorter",emoji:"🔷",cat:"Kids",players:"1",desc:"Circle, square, triangle — identify the shapes!",longDesc:"Features 6 common geometric shapes rendered as colorful SVG illustrations. Children identify shapes by name, building geometry vocabulary and visual recognition in a playful quiz format.", age:"3-6" },
  { id:"animals",name:"Animal Quiz",emoji:"🦁",cat:"Kids",players:"1",desc:"Can you name all the animals? 16 fun creatures to learn!",longDesc:"Features 16 popular animals with large emoji illustrations and fun sound descriptions. Children tap the correct animal name, building vocabulary and animal recognition through play.", age:"2-7" },
  { id:"size",name:"Size Compare",emoji:"📏",cat:"Kids",players:"1",desc:"Which is bigger? Which is smaller? Test your eyes!",longDesc:"Two items appear at different sizes and children tap the bigger or smaller one. Alternating questions keep kids thinking about spatial relationships and comparison skills.", age:"3-7" },
  { id:"puzzle",name:"Picture Puzzle",emoji:"🧩",cat:"Kids",players:"1",desc:"Slide tiles into the right order — solve the puzzle!",longDesc:"A classic 3x3 sliding puzzle adapted for young children with fun emoji themes (animals, ocean, space). Develops problem-solving skills, sequential thinking, and patience.", age:"5-10" },
];
const gameMap = { chess:Chess,tictactoe:TicTacToe,connect4:ConnectFour,checkers:Checkers,dotsboxes:DotsBoxes,carrom:Carrom,pool:Pool,snooker:Snooker,memory:MemoryMatch,minesweeper:Minesweeper,"2048":Game2048,hangman:Hangman,snake:SnakeGame,whack:WhackAMole,abc:ABCExplorer,numbers:NumberFun,colors:ColorMatch,shapes:ShapeSorter,animals:AnimalQuiz,size:SizeCompare,puzzle:PicturePuzzle };

// ══════════════════════════════════════
// KIDS ZONE PAGE
// ══════════════════════════════════════
function KidsZone() {
  const { navigate } = useNav();
  const { user } = useAuth();
  const kidsGames = GAMES.filter(g => g.cat === "Kids");
  return (<main>
    <section style={{ textAlign: "center", padding: "40px 16px 24px", background: "radial-gradient(ellipse at 50% 0%,rgba(236,72,153,0.15) 0%,transparent 70%)" }}>
      <div style={{ fontSize: "clamp(48px,10vw,68px)", marginBottom: 4 }}>🧒</div>
      <h1 style={{ fontSize: "clamp(26px,6vw,40px)", fontWeight: 900, margin: "0 0 6px", background: "linear-gradient(135deg,#ec4899,#f59e0b,#22c55e)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", fontFamily: F }}>Kids Zone</h1>
      <p style={{ color: C.textM, fontSize: "clamp(13px,3vw,16px)", maxWidth: 500, margin: "0 auto 6px", fontFamily: F, lineHeight: 1.5 }}>Fun learning games for children under 10! Letters, numbers, colors, shapes, animals, and puzzles — all free and safe to play.</p>
      <div style={{ display: "flex", justifyContent: "center", gap: 16, flexWrap: "wrap", marginTop: 12 }}>
        {["🔤 ABC","🔢 123","🎨 Colors","🔷 Shapes","🦁 Animals","🧩 Puzzles"].map(t => (
          <span key={t} style={{ fontSize: 12, color: C.pink, background: `${C.pink}10`, padding: "4px 12px", borderRadius: 20, border: `1px solid ${C.pink}25` }}>{t}</span>
        ))}
      </div>
    </section>
    <AdSlot format="leaderboard" />
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(240px,1fr))", gap: 12, padding: "0 16px", maxWidth: 960, margin: "0 auto" }}>
      {kidsGames.map(g => (
        <button key={g.id} onClick={() => navigate(`game:${g.id}`)} style={{ width: "100%", background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 18, cursor: "pointer", textAlign: "left", fontFamily: F, display: "flex", flexDirection: "column", gap: 6, transition: "all .2s" }}
          onMouseEnter={e => { e.currentTarget.style.background = C.cardH; e.currentTarget.style.borderColor = `${C.pink}50`; e.currentTarget.style.transform = "translateY(-2px)"; }}
          onMouseLeave={e => { e.currentTarget.style.background = C.card; e.currentTarget.style.borderColor = C.border; e.currentTarget.style.transform = "none"; }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <span style={{ fontSize: 32 }}>{g.emoji}</span>
            <span style={{ fontSize: 10, fontWeight: 600, color: C.pink, background: `${C.pink}10`, padding: "3px 10px", borderRadius: 10, letterSpacing: 1 }}>Ages {g.age || "3-10"}</span>
          </div>
          <div style={{ fontSize: 16, fontWeight: 700, color: C.text }}>{g.name}</div>
          <div style={{ fontSize: 12, color: C.textM, lineHeight: 1.4 }}>{g.desc}</div>
          {user?.scores?.[g.id] && <div style={{ fontSize: 11, color: C.amber, marginTop: "auto", paddingTop: 4 }}>🏆 {user.scores[g.id]} pts</div>}
        </button>
      ))}
    </div>
    <section style={{ maxWidth: 800, margin: "36px auto 0", padding: "0 16px", fontFamily: F }}>
      <h2 style={{ fontSize: 20, fontWeight: 700, color: C.text, marginBottom: 10 }}>Educational Games for Kids on {SITE.domain}</h2>
      <p style={{ fontSize: 14, color: C.textM, lineHeight: 1.75, marginBottom: 14 }}>The {SITE.name} Kids Zone features age-appropriate learning games designed for children ages 2 to 10. Every game is free, requires no downloads, and works on any device — desktop, tablet, or smartphone. Our games cover foundational skills like letter recognition (ABC Explorer), counting and number sense (Number Fun 123), color identification (Color Match), geometric shape recognition (Shape Sorter), animal vocabulary (Animal Quiz), size comparison and spatial reasoning (Size Compare), and problem-solving through sliding puzzles (Picture Puzzle).</p>
      <p style={{ fontSize: 14, color: C.textM, lineHeight: 1.75, marginBottom: 14 }}>All games use large, tappable buttons and bright visuals optimized for young learners. Positive reinforcement through streaks, stars, and encouraging messages keeps children motivated. Parents can sign up for a free account to track their child's progress and scores across all games. No personal information is collected from children — see our Privacy Policy for details.</p>
    </section>
    <AdSlot format="leaderboard" style={{ maxWidth: 800, margin: "24px auto" }} />
  </main>);
}

// ══════════════════════════════════════
// DASHBOARD
// ══════════════════════════════════════
function Dashboard() {
  const { user } = useAuth();
  const { navigate } = useNav();
  if (!user) return (
    <main style={{ maxWidth: 500, margin: "0 auto", padding: "60px 16px", fontFamily: F, textAlign: "center" }}>
      <div style={{ fontSize: 48, marginBottom: 12 }}>📊</div>
      <h1 style={{ fontSize: 24, fontWeight: 800, color: C.text, marginBottom: 8 }}>Sign in to view your Dashboard</h1>
      <p style={{ color: C.textM, fontSize: 14, marginBottom: 20 }}>Track scores, stats, and compete on leaderboards.</p>
      <button onClick={() => navigate("auth")} style={{ padding: "12px 32px", borderRadius: 10, background: C.violet, border: "none", color: "#fff", fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: F }}>Sign In / Sign Up</button>
    </main>
  );
  const scores = user.scores || {};
  const sortedGames = GAMES.filter(g => scores[g.id]).sort((a, b) => (scores[b.id] || 0) - (scores[a.id] || 0));
  return (<main style={{ maxWidth: 800, margin: "0 auto", padding: "0 16px 48px", fontFamily: F }}>
    <Breadcrumbs items={[{ label: "Home", page: "portal" }, { label: "Dashboard" }]} />
    <h1 style={{ fontSize: 28, fontWeight: 800, color: C.text, margin: "8px 0 20px" }}>Your Dashboard</h1>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 12, marginBottom: 28 }}>
      {[{ l: "Total Score", v: user.totalScore || 0, c: C.amber }, { l: "Games Played", v: user.gamesPlayed || 0, c: C.cyan }, { l: "Games Tried", v: Object.keys(scores).length, c: C.violet }].map(s => (
        <div key={s.l} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, textAlign: "center" }}>
          <div style={{ fontSize: 11, color: C.textD, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>{s.l}</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: s.c }}>{s.v}</div>
        </div>
      ))}
    </div>
    <h2 style={{ fontSize: 18, fontWeight: 700, color: C.text, marginBottom: 12 }}>Score Breakdown</h2>
    {sortedGames.length === 0 ? <p style={{ color: C.textM }}>Play some games to see your scores here!</p> : (
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {sortedGames.map(g => (<div key={g.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", background: C.card, borderRadius: 10, border: `1px solid ${C.border}` }}>
          <span style={{ fontSize: 24 }}>{g.emoji}</span>
          <div style={{ flex: 1 }}><div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{g.name}</div><div style={{ fontSize: 11, color: C.textD }}>{g.cat}</div></div>
          <div style={{ fontSize: 20, fontWeight: 800, color: C.amber }}>{scores[g.id]}</div>
        </div>))}
      </div>
    )}
    <AdSlot format="horizontal" />
  </main>);
}

// ══════════════════════════════════════
// LEADERBOARD — now fetched from the real backend (see /backend/src/routes.js)
// instead of the artifact-only shared-storage approach used in the preview.
// ══════════════════════════════════════
function Leaderboard() {
  const [leaders, setLeaders] = useState([]); const [loading, setLoading] = useState(true);
  useEffect(() => {
    (async () => {
      try {
        const { leaders } = await api.leaderboard();
        setLeaders(leaders.map(l => ({ username: l.username, displayName: l.display_name, totalScore: l.total_score, gamesPlayed: l.games_played })));
      } catch { /* leaderboard best-effort */ }
      setLoading(false);
    })();
  }, []);
  return (<main style={{ maxWidth: 800, margin: "0 auto", padding: "0 16px 48px", fontFamily: F }}>
    <Breadcrumbs items={[{ label: "Home", page: "portal" }, { label: "Leaderboard" }]} />
    <AdSlot format="leaderboard" />
    <h1 style={{ fontSize: 28, fontWeight: 800, color: C.text, margin: "8px 0 20px" }}>🏆 Leaderboard</h1>
    {loading ? <p style={{ color: C.textM }}>Loading...</p> : leaders.length === 0 ? <p style={{ color: C.textM }}>No scores yet. Be the first to play!</p> : (
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {leaders.map((l, i) => (<div key={l.username} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", background: i < 3 ? `${[C.amber, C.textM, "#cd7f32"][i]}10` : C.card, borderRadius: 10, border: `1px solid ${i < 3 ? [C.amber, C.textM, "#cd7f32"][i] + "30" : C.border}` }}>
          <div style={{ width: 32, height: 32, borderRadius: "50%", background: i < 3 ? [C.amber, C.textM, "#cd7f32"][i] : C.card, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 800, color: i < 3 ? "#000" : C.text, border: `1px solid ${C.border}` }}>{i + 1}</div>
          <div style={{ flex: 1 }}><div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{l.displayName}</div><div style={{ fontSize: 11, color: C.textD }}>{l.gamesPlayed} games played</div></div>
          <div style={{ fontSize: 20, fontWeight: 800, color: C.amber }}>{l.totalScore}</div>
        </div>))}
      </div>
    )}
    <AdSlot format="rectangle" style={{ marginTop: 24 }} />
  </main>);
}

// ══════════════════════════════════════
// EVENTS
// ══════════════════════════════════════
function Events() {
  const { navigate } = useNav();
  const events = [
    { name: "Weekend Chess Championship", game: "chess", date: "Every Saturday", prize: "Leaderboard Badge + Top Rank", status: "Open", desc: "Weekly chess tournament. Play rated online games — top scorer each Saturday earns the champion badge." },
    { name: "Speed Memory Challenge", game: "memory", date: "Monthly", prize: "Memory Master Title", status: "Coming Soon", desc: "Complete the 18-pair board in the fewest moves. Monthly competition with persistent rankings." },
    { name: "Snake Marathon", game: "snake", date: "Monthly", prize: "High Score Hall of Fame", status: "Coming Soon", desc: "Highest snake score in a calendar month wins." },
    { name: "Kids Learning Star", game: "abc", date: "Weekly", prize: "Learning Star Badge", status: "Coming Soon", desc: "Earn the most points across all Kids Zone games in a week. Perfect for young learners building their skills!" },
  ];
  return (<main style={{ maxWidth: 800, margin: "0 auto", padding: "0 16px 48px", fontFamily: F }}>
    <Breadcrumbs items={[{ label: "Home", page: "portal" }, { label: "Events" }]} />
    <AdSlot format="leaderboard" />
    <h1 style={{ fontSize: 28, fontWeight: 800, color: C.text, margin: "8px 0 8px" }}>🏅 Events & Tournaments</h1>
    <p style={{ color: C.textM, fontSize: 14, lineHeight: 1.6, marginBottom: 24 }}>Compete with other players in scheduled events on {SITE.domain}. Sign up to participate!</p>
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {events.map(ev => (<div key={ev.name} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8, flexWrap: "wrap", gap: 8 }}>
          <div><h3 style={{ fontSize: 16, fontWeight: 700, color: C.text, margin: "0 0 4px" }}>{ev.name}</h3><div style={{ fontSize: 12, color: C.textD }}>{GAMES.find(g => g.id === ev.game)?.emoji} {GAMES.find(g => g.id === ev.game)?.name} · {ev.date}</div></div>
          <span style={{ fontSize: 11, fontWeight: 600, padding: "4px 12px", borderRadius: 20, background: ev.status === "Open" ? `${C.emerald}15` : `${C.amber}15`, color: ev.status === "Open" ? C.emerald : C.amber, border: `1px solid ${ev.status === "Open" ? C.emerald : C.amber}25` }}>{ev.status}</span>
        </div>
        <p style={{ margin: "0 0 12px", fontSize: 13, color: C.textM, lineHeight: 1.6 }}>{ev.desc}</p>
        <div style={{ fontSize: 12, color: C.amber, marginBottom: 12 }}>🏆 Prize: {ev.prize}</div>
        {ev.status === "Open" && <button onClick={() => navigate(`game:${ev.game}`)} style={{ padding: "8px 20px", borderRadius: 8, background: C.violet, border: "none", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: F }}>Play Now</button>}
      </div>))}
    </div>
    <section style={{ marginTop: 28 }}>
      <h2 style={{ fontSize: 18, fontWeight: 700, color: C.text, marginBottom: 10 }}>How Tournaments Work</h2>
      <p style={{ fontSize: 14, color: C.textM, lineHeight: 1.75 }}>All registered players on {SITE.domain} can participate. Your game scores are automatically tracked, and online matches count toward your leaderboard total. Each event runs weekly or monthly, and top players earn recognition on the global leaderboard and exclusive titles.</p>
    </section>
    <AdSlot format="leaderboard" />
  </main>);
}

// ══════════════════════════════════════
// LEGAL & INFO PAGES (pogoarcade.com)
// ══════════════════════════════════════
const CP = ({ title, bc, children }) => (<main style={{ maxWidth: 800, margin: "0 auto", padding: "0 16px 48px", fontFamily: F }}><Breadcrumbs items={bc} /><article><h1 style={{ fontSize: "clamp(24px,5vw,32px)", fontWeight: 800, color: C.text, margin: "8px 0 20px" }}>{title}</h1><div style={{ color: C.textM, fontSize: 14, lineHeight: 1.75 }}>{children}</div></article></main>);
const H2 = ({ children }) => <h2 style={{ fontSize: 18, fontWeight: 700, color: C.text, margin: "24px 0 10px" }}>{children}</h2>;
const P = ({ children }) => <p style={{ margin: "0 0 14px" }}>{children}</p>;

function PrivacyPage() { return (<CP title="Privacy Policy" bc={[{label:"Home",page:"portal"},{label:"Privacy Policy"}]}>
  <P>Last updated: {new Date().toLocaleDateString("en-US",{year:"numeric",month:"long",day:"numeric"})}</P>
  <P>{SITE.name} ("we," "us," or "our") operates the website {SITE.domain} (the "Service"). This page informs you of our policies regarding the collection, use, and disclosure of Personal Information when you use our Service.</P>
  <H2>Information We Collect</H2><P>We collect usage data such as your browser type, the pages you visit on {SITE.domain}, the time and date of your visit, the time spent on those pages, and other diagnostic data. If you create an account, we store your chosen display name, username, and a securely hashed password. We do not collect real names, email addresses, or other personally identifiable information unless you voluntarily provide it via the contact form.</P>
  <H2>Cookies and Tracking Technologies</H2><P>{SITE.domain} uses cookies and similar tracking technologies to track activity on our Service and hold certain information. Cookies are files with a small amount of data sent to your browser from a website and stored on your device. You can instruct your browser to refuse all cookies or to indicate when a cookie is being sent. However, if you do not accept cookies, some portions of our Service may not function properly.</P>
  <H2>Google AdSense and Advertising</H2><P>We use Google AdSense to display advertisements on {SITE.domain}. Google, as a third-party vendor, uses cookies to serve ads on our Service. Google's use of the DoubleClick cookie enables it and its partners to serve ads to our users based on their visit to {SITE.domain} and/or other sites on the Internet. You may opt out of the use of the DoubleClick cookie for interest-based advertising by visiting the Google Ads Settings page at https://adssettings.google.com. Some of our advertising partners, including Google, may use cookies and web beacons on {SITE.domain}.</P>
  <H2>Third-Party Advertising Partners</H2><P>Third-party ad servers or ad networks use technologies like cookies, JavaScript, or web beacons that are used in their respective advertisements and links that appear on {SITE.domain}, which are sent directly to your browser. They automatically receive your IP address when this occurs. These technologies are used to measure the effectiveness of their advertising campaigns and/or to personalize the advertising content you see on websites you visit. Note that {SITE.name} has no access to or control over these cookies that are used by third-party advertisers.</P>
  <H2>Online Multiplayer</H2><P>When you play a game in "Online" mode, we relay your moves in real time to the other registered player you are matched with, and we display their chosen display name to you (and yours to them) for the duration of the match. We do not share any other account information between matched players.</P>
  <H2>Children's Privacy</H2><P>Our Kids Zone features educational games designed for children, but we do not knowingly collect personal information from anyone under the age of 13. The games on {SITE.domain} function without requiring personal data from children. Account creation is intended for parents or guardians. If we become aware that we have collected personal data from a child under 13 without parental consent, we take steps to remove that information from our servers. If you are a parent or guardian and believe your child has provided us with personal information, please contact us at {SITE.email}.</P>
  <H2>Data Storage and Security</H2><P>Account passwords are stored as salted cryptographic hashes, never in plain text. Game scores and leaderboard data are stored on our servers. We strive to use commercially acceptable means of protecting your data, but no method of transmission over the Internet or electronic storage is 100% secure.</P>
  <H2>Your Data Rights</H2><P>You have the right to request access to, correction of, or deletion of your personal data. To exercise these rights, please contact us at {SITE.email}.</P>
  <H2>Changes to This Privacy Policy</H2><P>We may update our Privacy Policy from time to time. We will notify you of any changes by posting the new Privacy Policy on this page and updating the "last updated" date.</P>
  <H2>Contact Us</H2><P>If you have any questions about this Privacy Policy, please contact us at {SITE.email}.</P><AdSlot format="horizontal" />
</CP>); }

function TermsPage() { return (<CP title="Terms of Service" bc={[{label:"Home",page:"portal"},{label:"Terms of Service"}]}>
  <P>Last updated: {new Date().toLocaleDateString("en-US",{year:"numeric",month:"long",day:"numeric"})}</P>
  <P>By accessing or using the website {SITE.domain} (the "Service") operated by {SITE.name} ("we," "us," or "our"), you agree to be bound by these Terms of Service ("Terms"). If you disagree with any part of the terms, you may not access the Service.</P>
  <H2>Use of Service</H2><P>{SITE.name} provides free browser-based games for entertainment and educational purposes. You agree to use the Service only for lawful purposes and in accordance with these Terms. You agree not to: (a) use the Service in any way that violates any applicable law or regulation; (b) attempt to interfere with, compromise the system integrity or security, or decipher any transmissions to or from the servers running the Service; (c) use any automated means to access the Service, or collect any information from the Service; (d) harass, abuse, or disrupt other players in Online multiplayer matches.</P>
  <H2>User Accounts</H2><P>When you create an account on {SITE.domain}, you must provide accurate and complete information. You are solely responsible for the activity on your account and for maintaining the confidentiality of your login credentials. You must notify us immediately of any breach of security or unauthorized use of your account. Accounts are for individual, personal use only.</P>
  <H2>Online Multiplayer Conduct</H2><P>Online matches connect you in real time with another registered player. We reserve the right to suspend accounts that abuse matchmaking, disconnect intentionally to avoid a loss, or otherwise interfere with fair play.</P>
  <H2>Intellectual Property</H2><P>The rules and mechanics of classic games (such as Chess, Checkers, Tic Tac Toe, etc.) are in the public domain. However, our specific implementations, game designs, user interface designs, graphics, code, and all other original content on {SITE.domain} are the property of {SITE.name} and are protected by intellectual property laws. You may not reproduce, distribute, modify, or create derivative works of our proprietary content without our prior written consent.</P>
  <H2>Advertisements</H2><P>{SITE.domain} displays advertisements through Google AdSense and other advertising partners. By using the Service, you acknowledge that advertisements may be displayed alongside content and games. We are not responsible for the content of third-party advertisements.</P>
  <H2>Disclaimer of Warranties</H2><P>The Service is provided on an "AS IS" and "AS AVAILABLE" basis, without any warranties of any kind, either express or implied, including but not limited to implied warranties of merchantability, fitness for a particular purpose, and non-infringement. We do not warrant that the Service will be uninterrupted, timely, secure, or error-free.</P>
  <H2>Limitation of Liability</H2><P>In no event shall {SITE.name}, its directors, employees, partners, agents, suppliers, or affiliates be liable for any indirect, incidental, special, consequential, or punitive damages, including without limitation, loss of profits, data, use, goodwill, or other intangible losses, resulting from your access to or use of or inability to access or use the Service.</P>
  <H2>Governing Law</H2><P>These Terms shall be governed by the laws applicable to the jurisdiction in which {SITE.name} operates, without regard to its conflict of law provisions.</P>
  <H2>Contact</H2><P>Questions about these Terms? Contact us at {SITE.email}.</P><AdSlot format="horizontal" />
</CP>); }

function DisclaimerPage() { return (<CP title="Disclaimer" bc={[{label:"Home",page:"portal"},{label:"Disclaimer"}]}>
  <P>Last updated: {new Date().toLocaleDateString("en-US",{year:"numeric",month:"long",day:"numeric"})}</P>
  <P>The information provided by {SITE.name} on {SITE.domain} is for general entertainment and educational purposes only. All games on our platform are entirely free to play and involve no real money, gambling, or wagering of any kind.</P>
  <H2>No Gambling</H2><P>All games on {SITE.domain} — including Online multiplayer matches — are purely skill-based or educational in nature. No real money or monetary equivalent is wagered, won, or lost through any game on our platform. Points, scores, and leaderboard rankings are for entertainment only and have no monetary value.</P>
  <H2>Third-Party Advertisements</H2><P>{SITE.domain} displays third-party advertisements through Google AdSense and other advertising partners. We are not responsible for the accuracy, content, or practices of any third-party advertiser. Clicking on advertisements will direct you to the advertiser's website, which is governed by their own terms and privacy policies.</P>
  <H2>External Links</H2><P>{SITE.domain} may contain links to external websites that are not provided or maintained by or in any way affiliated with {SITE.name}. We do not guarantee the accuracy, relevance, timeliness, or completeness of any information on these external websites.</P>
  <H2>Educational Content</H2><P>Our Kids Zone games are designed as supplementary educational tools and should not replace formal education or structured learning programs. Parents and guardians should supervise young children while using any online service.</P>
  <H2>Consent</H2><P>By using {SITE.domain}, you hereby consent to our Disclaimer and agree to its terms.</P><AdSlot format="horizontal" />
</CP>); }

function AboutPage() { return (<CP title="About PoGo Arcade" bc={[{label:"Home",page:"portal"},{label:"About Us"}]}>
  <P>{SITE.name} ({SITE.domain}) is a free online gaming platform bringing classic board games, arcade favorites, and educational kids' games to your browser. Our mission is to preserve timeless games from every culture and make them accessible to everyone, everywhere, on any device — solo, locally with a friend, or online against another registered player.</P>
  <H2>What We Offer</H2><P>{GAMES.length} games across four categories — Strategy, Puzzle, Action, and Kids Learning — completely free, with no downloads required. Features include single-player with AI opponents, local two-player modes, real-time online multiplayer for our board games, score tracking, global leaderboards, and competitive events and tournaments.</P>
  <H2>Games From Around the World</H2><P>From Chess and Checkers to Carrom, 8-Ball Pool, and Snooker, our collection spans cultures and continents. We continuously expand with beloved regional games from South Asia, the Middle East, East Africa, and beyond. Our library includes games originating from India (Chess, Carrom), ancient Egypt (Tic Tac Toe), France (Dots & Boxes), and Britain (Snooker, Pool).</P>
  <H2>Play Online</H2><P>Tic Tac Toe, Connect Four, Chess, Checkers, and Dots & Boxes all support real-time Online play. Sign in, then choose Quick Match to be paired with another waiting player, or Create Room to get a shareable code and challenge a friend directly.</P>
  <H2>Kids Zone — Learning Through Play</H2><P>Our dedicated Kids Zone features 7 educational games designed for children ages 2 to 10. ABC Explorer teaches letter recognition, Number Fun 123 builds counting skills, Color Match develops color vocabulary, Shape Sorter introduces geometry, Animal Quiz builds vocabulary, Size Compare develops spatial reasoning, and Picture Puzzle strengthens problem-solving skills.</P>
  <H2>Our Technology</H2><P>All games on {SITE.domain} run entirely in your browser using modern web technologies, with a real backend powering accounts, leaderboards, and online multiplayer. No plugins, downloads, or installations are required. Games work seamlessly on desktops, laptops, tablets, and smartphones.</P>
  <H2>Advertising</H2><P>{SITE.name} is supported by advertising through Google AdSense. We carefully manage ad placements to ensure they do not interfere with gameplay. Ads are clearly labeled and separated from game content.</P>
  <H2>Contact Us</H2><P>We'd love to hear from you! Reach us at {SITE.email} for questions, feedback, game suggestions, or partnership inquiries.</P><AdSlot format="horizontal" />
</CP>); }

function ContactPage() {
  const [sent, setSent] = useState(false);
  const is = { width: "100%", padding: "10px 14px", borderRadius: 8, border: `1px solid ${C.border}`, background: "rgba(0,0,0,0.3)", color: C.text, fontSize: 14, boxSizing: "border-box", marginBottom: 12, outline: "none", fontFamily: F };
  return (<CP title="Contact Us" bc={[{label:"Home",page:"portal"},{label:"Contact Us"}]}>
    <P>Have questions, feedback, or game suggestions for {SITE.name}? We'd love to hear from you!</P>
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20, marginBottom: 20 }}>
      <input placeholder="Your Name" style={is} /><input placeholder="Email Address" type="email" style={is} />
      <select style={is}><option>General Inquiry</option><option>Game Suggestion</option><option>Bug Report</option><option>Partnership / Advertising</option><option>Kids Zone Feedback</option></select>
      <textarea rows={4} placeholder="Your message..." style={{ ...is, resize: "vertical" }} />
      <button onClick={() => setSent(true)} style={{ padding: "10px 24px", borderRadius: 8, background: C.violet, border: "none", color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: F }}>{sent ? "✓ Message Sent!" : "Send Message"}</button>
    </div>
    <P>You can also email us directly at {SITE.email}. We typically respond within 24-48 hours.</P><AdSlot format="horizontal" />
  </CP>);
}

// ══════════════════════════════════════
// PORTAL HOME
// ══════════════════════════════════════
function Portal() {
  const { navigate } = useNav(); const { user } = useAuth();
  const [filter, setFilter] = useState("All");
  const cats = ["All", "Strategy", "Puzzle", "Action", "Kids"];
  const filtered = filter === "All" ? GAMES : GAMES.filter(g => g.cat === filter);
  return (<main>
    <section style={{ textAlign: "center", padding: "56px 16px 32px", position: "relative", overflow: "hidden", background: "radial-gradient(ellipse 80% 60% at 20% -10%,rgba(139,92,246,0.28) 0%,transparent 60%),radial-gradient(ellipse 70% 60% at 85% 0%,rgba(6,182,212,0.22) 0%,transparent 60%),radial-gradient(ellipse 60% 50% at 50% 100%,rgba(245,158,11,0.14) 0%,transparent 60%)" }}>
      <div style={{ fontSize: "clamp(40px,9vw,60px)", marginBottom: 8 }}>🕹️</div>
      <h1 style={{ fontSize: "clamp(30px,7vw,52px)", fontWeight: 900, margin: "0 0 10px", letterSpacing: "-0.02em", background: "linear-gradient(135deg,#c4b5fd,#67e8f9 45%,#fcd34d)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", fontFamily: F }}>{SITE.name}</h1>
      <p style={{ color: C.textM, fontSize: "clamp(14px,3vw,17px)", maxWidth: 560, margin: "0 auto 10px", fontFamily: F, lineHeight: 1.5 }}>Free classic & educational games at {SITE.domain}. Play solo, locally with a friend, or online against another registered player.</p>
      <p style={{ color: C.textD, fontSize: 12, fontFamily: F, marginBottom: 4 }}>{GAMES.length} games · Classic & Kids · Solo, Local & Online Multiplayer · Leaderboards</p>
      {user ? (
        <p style={{ color: C.violet, fontSize: 13, fontFamily: F, marginTop: 8 }}>Welcome back, {user.displayName}! 🕹️</p>
      ) : (
        <button onClick={() => navigate("auth")} style={{ marginTop: 14, padding: "11px 28px", borderRadius: 24, background: "linear-gradient(135deg,#8b5cf6,#06b6d4)", border: "none", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: F, boxShadow: "0 8px 24px rgba(139,92,246,0.35)" }}>Sign in to save scores & play online</button>
      )}
    </section>
    <AdSlot format="leaderboard" />
    <div style={{ display: "flex", justifyContent: "center", gap: 8, padding: "0 16px", marginBottom: 24, flexWrap: "wrap" }}>
      {cats.map(c => (<button key={c} onClick={() => setFilter(c)} style={{ padding: "8px 18px", borderRadius: 20, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: F, background: filter === c ? (catC[c] || C.violet) : C.card, color: filter === c ? "#fff" : C.textM, border: `1px solid ${filter === c ? (catC[c] || C.violet) : C.border}`, boxShadow: filter === c ? `0 6px 16px ${(catC[c] || C.violet)}50` : "none", transition: "all .15s" }}>{c}{c === "Kids" ? " 🧒" : ""}</button>))}
    </div>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(190px,1fr))", gap: 16, padding: "0 16px", maxWidth: 1080, margin: "0 auto" }}>
      {filtered.map((g, idx) => { const color = catC[g.cat] || C.violet; return (<Fragment key={g.id}>
        <button
          onClick={() => navigate(`game:${g.id}`)}
          className="game-card-3d"
          style={{ width: "100%", background: `linear-gradient(160deg,${color}22,${C.card} 55%)`, border: `1px solid ${color}35`, borderRadius: 20, padding: "22px 16px 16px", cursor: "pointer", textAlign: "center", fontFamily: F, display: "flex", flexDirection: "column", alignItems: "center", gap: 8, transition: "transform .25s cubic-bezier(.2,.8,.2,1), box-shadow .25s, border-color .25s" }}
          onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-6px) scale(1.035)"; e.currentTarget.style.boxShadow = `0 20px 40px -12px ${color}55`; e.currentTarget.style.borderColor = color + "80"; }}
          onMouseLeave={e => { e.currentTarget.style.transform = "none"; e.currentTarget.style.boxShadow = "none"; e.currentTarget.style.borderColor = color + "35"; }}>
          <GameIcon id={g.id} cat={g.cat} size={72} />
          <div style={{ fontSize: 10, fontWeight: 700, color, background: `${color}18`, padding: "3px 10px", borderRadius: 10, textTransform: "uppercase", letterSpacing: 1, marginTop: 2 }}>{g.cat}{g.age ? ` · ${g.age}` : ""}</div>
          <div style={{ fontSize: 16, fontWeight: 800, color: C.text }}>{g.name}</div>
          <div style={{ fontSize: 12, color: C.textM, lineHeight: 1.4 }}>{g.desc}</div>
          <div style={{ fontSize: 11, color: C.textD, marginTop: "auto", paddingTop: 6 }}>👥 {g.players} player{g.players !== "1" ? "s" : ""}{user?.scores?.[g.id] ? ` · 🏆 ${user.scores[g.id]} pts` : ""}</div>
        </button>
        {(idx + 1) % 6 === 0 && idx < filtered.length - 1 && <AdSlot format="rectangle" style={{ marginTop: 12, gridColumn: "1 / -1" }} />}
      </Fragment>); })}
    </div>
    <section style={{ maxWidth: 800, margin: "36px auto 0", padding: "0 16px", fontFamily: F }}>
      <h2 style={{ fontSize: 20, fontWeight: 700, color: C.text, marginBottom: 10 }}>Play Free Games Online at {SITE.domain}</h2>
      <p style={{ fontSize: 14, color: C.textM, lineHeight: 1.75, marginBottom: 14 }}>Welcome to {SITE.name} — your destination for free classic games and educational kids' games at {SITE.domain}. From the strategic depth of Chess and Checkers to the physics-based fun of Carrom, 8-Ball Pool, and Snooker, from brain-teasing puzzles like Minesweeper and 2048 to fast-paced action games like Snake and Whack-a-Mole, we have something for every player.</p>
      <p style={{ fontSize: 14, color: C.textM, lineHeight: 1.75, marginBottom: 14 }}>Sign in to challenge another registered player in real time — Tic Tac Toe, Connect Four, Chess, Checkers, and Dots & Boxes all support Online mode with Quick Match or private room codes you can share with a friend.</p>
      <p style={{ fontSize: 14, color: C.textM, lineHeight: 1.75, marginBottom: 14 }}>Our Kids Zone features 7 educational games designed for children ages 2-10, covering letters, numbers, colors, shapes, animals, sizes, and puzzles — all completely free and safe for young learners.</p>
      <p style={{ fontSize: 14, color: C.textM, lineHeight: 1.75, marginBottom: 14 }}>Create a free account on {SITE.domain} to track your scores across all {GAMES.length} games, compete on the global leaderboard, and participate in weekly and monthly tournaments. Every game works on desktops, tablets, and smartphones with no downloads required.</p>
    </section>
    <AdSlot format="leaderboard" style={{ maxWidth: 800, margin: "24px auto" }} />
  </main>);
}

// ══════════════════════════════════════
// APP ROOT — real per-page URLs via react-router-dom (important for SEO /
// AdSense crawling: every game and legal page now has its own indexable
// URL instead of everything living behind client-side state at "/").
// ══════════════════════════════════════
const PAGE_TO_PATH = {
  portal: "/", auth: "/signin", kidszone: "/kids", leaderboard: "/leaderboard",
  events: "/events", about: "/about", contact: "/contact", privacy: "/privacy",
  terms: "/terms", disclaimer: "/disclaimer", dashboard: "/dashboard",
};
function pageKeyToPath(pageKey) {
  if (pageKey.startsWith("game:")) return `/games/${pageKey.slice(5)}`;
  return PAGE_TO_PATH[pageKey] || "/";
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <RoutedApp />
      </AuthProvider>
    </BrowserRouter>
  );
}

// Bridges the router to the existing navigate("portal") / navigate("game:chess")
// call sites used throughout the app (SiteHeader, SiteFooter, Breadcrumbs, etc.)
// so none of those call sites needed to change.
function RoutedApp() {
  const rrNavigate = useNavigate();
  const navigate = (pageKey) => { rrNavigate(pageKeyToPath(pageKey)); window.scrollTo(0, 0); };
  return (
    <NavCtx.Provider value={{ navigate }}>
      <AppShell />
    </NavCtx.Provider>
  );
}

function GameRoute() {
  const { id } = useParams();
  const G = gameMap[id];
  return G ? <G /> : <Portal />;
}

function AppShell() {
  const { loading } = useAuth();

  if (loading) return (
    <div style={{ minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: F }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>🕹️</div>
        <div style={{ color: C.textM, fontSize: 14 }}>Loading {SITE.name}...</div>
      </div>
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.text, fontFamily: F }}>
      <SiteHeader />
      <Routes>
        <Route path="/" element={<Portal />} />
        <Route path="/games/:id" element={<GameRoute />} />
        <Route path="/signin" element={<AuthScreen />} />
        <Route path="/kids" element={<KidsZone />} />
        <Route path="/leaderboard" element={<Leaderboard />} />
        <Route path="/events" element={<Events />} />
        <Route path="/about" element={<AboutPage />} />
        <Route path="/contact" element={<ContactPage />} />
        <Route path="/privacy" element={<PrivacyPage />} />
        <Route path="/terms" element={<TermsPage />} />
        <Route path="/disclaimer" element={<DisclaimerPage />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="*" element={<Portal />} />
      </Routes>
      <SiteFooter />
      <CookieConsent />
    </div>
  );
}
