import { StrictMode, useEffect, useState, type FormEvent } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import CompanySetup from "./CompanySetup";
import DashboardOverview from "./DashboardOverview";

const API = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000/api/v1";
type User = { id:string; companyId:string; email:string; mfaEnabled:boolean; roles:string[] };
type Session = { id:string; device_name:string|null; ip_address:string|null; last_seen_at:string };

export async function api(path:string, options:RequestInit = {}) {
  const headers = new Headers(options.headers);
  if (options.body && !headers.has("content-type")) headers.set("content-type","application/json");
  const response = await fetch(API + path, {...options, credentials:"include", headers});
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error?.message ?? "Request failed");
  return data;
}

function Field({label,type="text",value,onChange,placeholder}:{label:string;type?:string;value:string;onChange:(v:string)=>void;placeholder?:string}) {
  return <label className="field"><span>{label}</span><input type={type} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder}/></label>;
}

function Login({onLogin}:{onLogin:(user:User)=>void}) {
  const [companyId,setCompanyId]=useState(""); const [email,setEmail]=useState(""); const [password,setPassword]=useState("");
  const [challenge,setChallenge]=useState(""); const [code,setCode]=useState(""); const [loading,setLoading]=useState(false); const [error,setError]=useState("");
  const [forgot,setForgot]=useState(false); const [resetToken,setResetToken]=useState(""); const [newPassword,setNewPassword]=useState("");
  async function submit(e:FormEvent){e.preventDefault();setLoading(true);setError("");try{
    if(forgot){const r=await api("/auth/password/forgot",{method:"POST",body:JSON.stringify({companyId,email})});if(r.resetToken){setResetToken(r.resetToken);setForgot(false);setError("Development reset token generated. Use it below.");}else setError("If the account exists, reset instructions have been requested.");return;}
    if(challenge){const r=await api("/auth/mfa/login",{method:"POST",body:JSON.stringify({challengeToken:challenge,code})});onLogin(r.user);return;}
    const r=await api("/auth/login",{method:"POST",body:JSON.stringify({companyId,email,password})});if(r.mfaRequired){setChallenge(r.challengeToken);return;}onLogin(r.user);
  }catch(err){setError(err instanceof Error?err.message:"Unable to sign in");}finally{setLoading(false);}}
  async function reset(){setLoading(true);setError("");try{await api("/auth/password/reset",{method:"POST",body:JSON.stringify({token:resetToken,password:newPassword})});setError("Password reset successfully. You can sign in now.");setResetToken("");setNewPassword("");}catch(err){setError(err instanceof Error?err.message:"Reset failed");}finally{setLoading(false);}}
  return <div className="auth-page"><section className="brand-panel"><div className="brand-mark">VLH</div><h1>Vansha Logistic Hub</h1><p>Secure operations platform for bulk transportation, fleet and trip management.</p><div className="feature-list"><span>✓ Secure authentication</span><span>✓ Role-based access</span><span>✓ Multi-tenant ready</span></div></section>
    <section className="auth-card"><div className="eyebrow">CONTROL CENTER</div><h2>{challenge?"Two-factor verification":forgot?"Reset access":"Welcome back"}</h2><p className="muted">{challenge?"Enter the 6-digit code from your authenticator.":forgot?"Request a secure password reset.":"Sign in to your company workspace."}</p>
      {error&&<div className="notice">{error}</div>}
      {!challenge&&!resetToken&&<form onSubmit={submit}>{!forgot&&<Field label="Company ID" value={companyId} onChange={setCompanyId} placeholder="Company UUID"/>}<Field label="Email" type="email" value={email} onChange={setEmail} placeholder="name@company.com"/>{!forgot&&<Field label="Password" type="password" value={password} onChange={setPassword} placeholder="••••••••"/>}<button disabled={loading}>{loading?"Please wait…":forgot?"Send reset request":"Sign in"}</button></form>}
      {challenge&&<form onSubmit={submit}><Field label="Authenticator code" value={code} onChange={setCode} placeholder="000000"/><button disabled={loading}>{loading?"Verifying…":"Verify and continue"}</button></form>}
      {resetToken&&<form onSubmit={e=>{e.preventDefault();reset()}}><Field label="Reset token" value={resetToken} onChange={setResetToken}/><Field label="New password" type="password" value={newPassword} onChange={setNewPassword}/><button disabled={loading}>Set new password</button></form>}
      {!challenge&&!resetToken&&<button className="link-button" onClick={()=>{setForgot(!forgot);setError("")}}>{forgot?"Back to sign in":"Forgot password?"}</button>}
    </section></div>;
}

function Dashboard({user,onLogout}:{user:User;onLogout:()=>void}) {
  const [sessions,setSessions]=useState<Session[]>([]); const [mfaSecret,setMfaSecret]=useState(""); const [otpUri,setOtpUri]=useState(""); const [mfaCode,setMfaCode]=useState(""); const [message,setMessage]=useState("");
  async function load(){try{const r=await api("/auth/sessions");setSessions(r.sessions)}catch{}}
  useEffect(()=>{load()},[]);
  async function logout(){try{await api("/auth/logout",{method:"POST"})}finally{onLogout()}}
  async function revoke(id:string){await api("/auth/sessions/"+id,{method:"DELETE"});load()}
  async function setupMfa(){try{const r=await api("/auth/mfa/setup",{method:"POST"});setMfaSecret(r.secret);setOtpUri(r.otpauthUri);setMessage("Scan the secret with your authenticator, then enter the current code to enable MFA.")}catch(e){setMessage(e instanceof Error?e.message:"MFA setup failed")}}
  async function enableMfa(){try{await api("/auth/mfa/enable",{method:"POST",body:JSON.stringify({code:mfaCode})});setMessage("MFA enabled successfully.");setMfaSecret("");setMfaCode("")}catch(e){setMessage(e instanceof Error?e.message:"MFA enable failed")}}
  return <div className="app-shell"><header><div><strong>Vansha Logistic Hub</strong><span className="status-dot"/> Secure workspace</div><button className="outline" onClick={logout}>Sign out</button></header>
    <main className="dashboard"><DashboardOverview api={api} />
      <div className="welcome"><div><div className="eyebrow">AUTHENTICATED</div><h1>Welcome, {user.email}</h1><p className="muted">Your authentication and session controls are active.</p></div><div className="role-badges">{user.roles.map(r=><span key={r}>{r}</span>)}</div></div>
      <div className="grid"><article><h3>Account security</h3><p>MFA status: <b>{user.mfaEnabled?"Enabled":"Not enabled"}</b></p>{!user.mfaEnabled&&!mfaSecret&&<button onClick={setupMfa}>Set up MFA</button>}{mfaSecret&&<div className="mfa-box"><code>{mfaSecret}</code><small>{otpUri}</small><Field label="Authenticator code" value={mfaCode} onChange={setMfaCode} placeholder="000000"/><button onClick={enableMfa}>Enable MFA</button></div>}{message&&<div className="notice">{message}</div>}</article>
      <article><h3>Active sessions</h3><div className="session-list">{sessions.map(s=><div className="session" key={s.id}><div><b>{s.device_name||"Current device"}</b><small>{s.ip_address||"IP unavailable"} · Last active {new Date(s.last_seen_at).toLocaleString()}</small></div><button className="danger" onClick={()=>revoke(s.id)}>Revoke</button></div>)}</div></article></div>
      <CompanySetup api={api} user={user} />\n    </main></div>;
}

function App(){const [user,setUser]=useState<User|null>(null);const [checking,setChecking]=useState(true);useEffect(()=>{api("/auth/me").then(r=>setUser(r.user)).catch(()=>setUser(null)).finally(()=>setChecking(false))},[]);if(checking)return <div className="loading">Loading secure workspace…</div>;return user?<Dashboard user={user} onLogout={()=>setUser(null)}/>:<Login onLogin={setUser}/>}

createRoot(document.getElementById("root")!).render(<StrictMode><App/></StrictMode>);