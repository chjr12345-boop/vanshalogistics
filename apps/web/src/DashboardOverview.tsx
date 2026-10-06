import { useEffect, useState } from "react";

type DashboardProps = { api: (path: string, options?: RequestInit) => Promise<any> };

type Summary = {
  generatedAt: string;
  company: { name: string; tradeName: string | null; legalName: string | null };
  user: { email: string; mfaEnabled: boolean };
  kpis: Record<string, { value: number; available: boolean; source: string }>;
  operationalKpis: Record<string, { value: number | null; available: boolean; reason: string }>;
};

const labels: Record<string,string> = {
  users:"Users", activeUsers:"Active users", branches:"Branches", activeSessions:"Active sessions", auditEvents24h:"Audit events (24h)",
  operations:"Operations", fleet:"Fleet", drivers:"Drivers", sales:"Sales", finance:"Finance", alerts:"Alerts"
};

export default function DashboardOverview({ api }: DashboardProps) {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api("/dashboard/summary").then(setSummary).catch(e => setError(e instanceof Error ? e.message : "Unable to load dashboard"));
  }, [api]);

  if (error) return <section className="dashboard-section"><div className="notice">{error}</div></section>;
  if (!summary) return <section className="dashboard-section"><div className="dashboard-loading">Loading dashboard metrics…</div></section>;

  const operational = Object.entries(summary.operationalKpis);
  return <section className="dashboard-section">
    <div className="dashboard-title">
      <div><div className="eyebrow">MANAGEMENT DASHBOARD</div><h2>{summary.company.tradeName || summary.company.name}</h2><p className="muted">Live tenant metrics from the current platform modules.</p></div>
      <div className="dashboard-updated">Updated {new Date(summary.generatedAt).toLocaleString()}</div>
    </div>
    <div className="kpi-grid">
      {Object.entries(summary.kpis).map(([key,kpi]) => <article className="kpi-card" key={key}><span>{labels[key] || key}</span><strong>{kpi.value.toLocaleString()}</strong><small>Source: {kpi.source}</small></article>)}
    </div>
    <div className="dashboard-panel">
      <div><h3>Operational KPIs</h3><p className="muted">These cards will become live as Orders, Fleet, Drivers, CRM and Finance modules are delivered.</p></div>
      <div className="operational-grid">{operational.map(([key,kpi]) => <article className="operational-card" key={key}><div className="operational-card-head"><b>{labels[key] || key}</b><span className="tag">{kpi.available ? "Live" : "Planned"}</span></div><strong>{kpi.available && kpi.value !== null ? kpi.value.toLocaleString() : "—"}</strong><small>{kpi.available ? "Live source available" : kpi.reason}</small></article>)}</div>
    </div>
  </section>;
}
