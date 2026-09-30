import { useEffect, useState } from "react";

type Api = (path: string, options?: RequestInit) => Promise<any>;

type CompanySetupProps = {
  api: Api;
  user: { roles: string[] };
};

export default function CompanySetup({ api, user }: CompanySetupProps) {
  const isAdmin =
    user.roles.includes("Company Admin") ||
    user.roles.includes("Super Admin");

  const [company, setCompany] = useState<any>(null);
  const [branches, setBranches] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [roles, setRoles] = useState<any[]>([]);
  const [settings, setSettings] = useState<Record<string, any>>({});
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const [profile, setProfile] = useState({
    legalName: "",
    tradeName: "",
    gstin: "",
    pan: "",
    phone: "",
    email: "",
    website: "",
    addressLine1: "",
    addressLine2: "",
    city: "",
    state: "",
    pincode: ""
  });

  const [branch, setBranch] = useState({
    name: "",
    code: "",
    city: "",
    state: "",
    pincode: "",
    phone: "",
    email: ""
  });

  const [newUser, setNewUser] = useState({
    displayName: "",
    email: "",
    password: "",
    roleId: "",
    branchId: ""
  });

  const [businessSettings, setBusinessSettings] = useState(
    '{"timezone":"Asia/Kolkata","currency":"INR"}'
  );

  async function load() {
    if (!isAdmin) return;

    setLoading(true);
    try {
      const [companyResult, branchResult, userResult, roleResult, settingResult] =
        await Promise.all([
          api("/company/profile"),
          api("/company/branches"),
          api("/company/users"),
          api("/company/roles"),
          api("/company/settings/business")
        ]);

      setCompany(companyResult.company);
      setBranches(branchResult.branches);
      setUsers(userResult.users);
      setRoles(roleResult.roles);
      setSettings(settingResult.settings);

      setProfile({
        legalName: companyResult.company.legal_name ?? "",
        tradeName: companyResult.company.trade_name ?? "",
        gstin: companyResult.company.gstin ?? "",
        pan: companyResult.company.pan ?? "",
        phone: companyResult.company.phone ?? "",
        email: companyResult.company.email ?? "",
        website: companyResult.company.website ?? "",
        addressLine1: companyResult.company.address_line1 ?? "",
        addressLine2: companyResult.company.address_line2 ?? "",
        city: companyResult.company.city ?? "",
        state: companyResult.company.state ?? "",
        pincode: companyResult.company.pincode ?? ""
      });

      setBusinessSettings(
        JSON.stringify(
          settingResult.settings ?? {
            timezone: "Asia/Kolkata",
            currency: "INR"
          },
          null,
          2
        )
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to load company setup"
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [isAdmin]);

  if (!isAdmin) {
    return null;
  }

  async function saveProfile() {
    try {
      const result = await api("/company/profile", {
        method: "PATCH",
        body: JSON.stringify(profile)
      });
      setCompany(result.company);
      setMessage("Company profile saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Save failed");
    }
  }

  async function addBranch() {
    try {
      await api("/company/branches", {
        method: "POST",
        body: JSON.stringify({
          ...branch,
          isHeadOffice: false
        })
      });
      setBranch({
        name: "",
        code: "",
        city: "",
        state: "",
        pincode: "",
        phone: "",
        email: ""
      });
      setMessage("Branch created.");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Branch creation failed");
    }
  }

  async function addUser() {
    try {
      await api("/company/users", {
        method: "POST",
        body: JSON.stringify({
          ...newUser,
          branchId: newUser.branchId || null
        })
      });
      setNewUser({
        displayName: "",
        email: "",
        password: "",
        roleId: "",
        branchId: ""
      });
      setMessage("User created.");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "User creation failed");
    }
  }

  async function saveSettings() {
    try {
      const parsed = JSON.parse(businessSettings);
      await api("/company/settings/business", {
        method: "PUT",
        body: JSON.stringify({ settings: parsed })
      });
      setSettings(parsed);
      setMessage("Business settings saved.");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Settings must contain valid JSON"
      );
    }
  }

  if (loading && !company) {
    return <section className="company-setup"><p className="muted">Loading Company Setup…</p></section>;
  }

  return (
    <section className="company-setup">
      <div className="setup-heading">
        <div>
          <div className="eyebrow">ADMINISTRATION</div>
          <h2>Company Setup</h2>
          <p className="muted">
            Manage your company profile, branches, users, roles and business settings.
          </p>
        </div>
        {message && <div className="notice">{message}</div>}
      </div>

      <div className="setup-grid">
        <article>
          <h3>Company Profile</h3>
          <div className="setup-fields">
            {[
              ["legalName", "Legal name"],
              ["tradeName", "Trade name"],
              ["gstin", "GSTIN"],
              ["pan", "PAN"],
              ["phone", "Phone"],
              ["email", "Email"],
              ["website", "Website"],
              ["addressLine1", "Address line 1"],
              ["addressLine2", "Address line 2"],
              ["city", "City"],
              ["state", "State"],
              ["pincode", "PIN code"]
            ].map(([key, label]) => (
              <label className="field" key={key}>
                <span>{label}</span>
                <input
                  value={(profile as any)[key]}
                  onChange={(e) =>
                    setProfile((current) => ({
                      ...current,
                      [key]: e.target.value
                    }))
                  }
                />
              </label>
            ))}
          </div>
          <button onClick={saveProfile}>Save Company Profile</button>
        </article>

        <article>
          <h3>Branches</h3>
          <div className="setup-list">
            {branches.map((item) => (
              <div className="setup-row" key={item.id}>
                <div>
                  <b>{item.name}</b>
                  <small>{item.code} · {item.city || "Location not set"}</small>
                </div>
                {item.is_head_office && <span className="tag">Head Office</span>}
              </div>
            ))}
          </div>

          <h4>Add Branch</h4>
          <div className="setup-fields">
            {[
              ["name", "Branch name"],
              ["code", "Branch code"],
              ["city", "City"],
              ["state", "State"],
              ["pincode", "PIN code"],
              ["phone", "Phone"],
              ["email", "Email"]
            ].map(([key, label]) => (
              <label className="field" key={key}>
                <span>{label}</span>
                <input
                  value={(branch as any)[key]}
                  onChange={(e) =>
                    setBranch((current) => ({
                      ...current,
                      [key]: e.target.value
                    }))
                  }
                />
              </label>
            ))}
          </div>
          <button onClick={addBranch}>Add Branch</button>
        </article>

        <article>
          <h3>Users</h3>
          <div className="setup-list">
            {users.map((item) => (
              <div className="setup-row" key={item.id}>
                <div>
                  <b>{item.display_name || item.email}</b>
                  <small>{item.email} · {(item.roles || []).join(", ") || "No role"}</small>
                </div>
                <span className="tag">{item.status}</span>
              </div>
            ))}
          </div>

          <h4>Add User</h4>
          <div className="setup-fields">
            <label className="field"><span>Name</span><input value={newUser.displayName} onChange={(e) => setNewUser({...newUser, displayName:e.target.value})}/></label>
            <label className="field"><span>Email</span><input type="email" value={newUser.email} onChange={(e) => setNewUser({...newUser, email:e.target.value})}/></label>
            <label className="field"><span>Temporary password</span><input type="password" value={newUser.password} onChange={(e) => setNewUser({...newUser, password:e.target.value})}/></label>
            <label className="field"><span>Role</span><select value={newUser.roleId} onChange={(e) => setNewUser({...newUser, roleId:e.target.value})}><option value="">Select role</option>{roles.map((role)=><option key={role.id} value={role.id}>{role.name}</option>)}</select></label>
            <label className="field"><span>Branch</span><select value={newUser.branchId} onChange={(e) => setNewUser({...newUser, branchId:e.target.value})}><option value="">No branch</option>{branches.map((item)=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          </div>
          <button onClick={addUser}>Create User</button>
        </article>

        <article>
          <h3>Roles</h3>
          <div className="setup-list">
            {roles.map((role) => (
              <div className="setup-row" key={role.id}>
                <div>
                  <b>{role.name}</b>
                  <small>{role.is_system ? "System role" : "Custom role"} · {(role.permissions || []).length} permissions</small>
                </div>
              </div>
            ))}
          </div>

          <h3>Business Settings</h3>
          <p className="muted">Current: {JSON.stringify(settings)}</p>
          <textarea
            className="settings-editor"
            value={businessSettings}
            onChange={(e) => setBusinessSettings(e.target.value)}
            rows={8}
          />
          <button onClick={saveSettings}>Save Business Settings</button>
        </article>
      </div>
    </section>
  );
}
