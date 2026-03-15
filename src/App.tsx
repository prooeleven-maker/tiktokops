import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { createClient, type Session } from "@supabase/supabase-js";

type CustomerItem = {
  id: string;
  external_key: string | null;
  name: string;
  contact_email: string | null;
  status: string;
  notes: string | null;
  license_count: number;
  created_at: string;
  updated_at: string;
};

type LicenseItem = {
  id: string;
  customer_id: string;
  customer_name: string;
  product_id: string;
  channel: string;
  seat_limit: number;
  license_key_mask: string;
  status: string;
  updated_at: string;
};

type RegistrationKeyItem = {
  id: string;
  license_id: string;
  key_mask: string;
  status: string;
  max_uses: number;
  used_count: number;
  expires_at: string | null;
  updated_at: string;
  license_key_mask: string;
  customer_name: string;
};

type DeviceItem = {
  machine_hash: string;
  machine_name: string;
  customer_name: string;
  license_key_mask: string | null;
  access_status: string;
  online_status: string;
  last_seen_at: string | null;
  linked_license_count: number;
  linked_user_count: number;
  blocked: boolean;
  presence_status: string;
  is_unlicensed: boolean;
  product_id: string | null;
  channel: string | null;
  version: string | null;
};

type BuildItem = {
  id: string;
  channel: string;
  version: string;
  is_published: boolean;
  is_mandatory: boolean;
  rollout_notes: string | null;
  created_at: string;
  created_by: string | null;
  installer_url: string | null;
  package_url: string | null;
  package_format: string | null;
  package_sha256: string | null;
  package_entrypoint: string | null;
  manifest_url: string | null;
};

type MachinePresence = {
  machine_hash: string;
  machine_name: string | null;
  product_id: string | null;
  channel: string | null;
  version: string | null;
  license_id: string | null;
  device_id: string | null;
  ip_address: string | null;
  presence_status: string;
  last_seen_at: string | null;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
  is_fresh: boolean;
  license_key_mask: string | null;
  customer_name: string | null;
};

type MachineDevice = {
  id: string;
  machine_name: string | null;
  status: string;
  last_seen_at: string | null;
  license_id: string | null;
  license_key_mask: string | null;
  license_status: string | null;
  customer_name: string | null;
  product_id: string | null;
  channel: string | null;
};

type MachineUser = {
  id: string;
  username: string;
  user_status: string;
  session_status: string;
  session_last_seen_at: string | null;
  license_id: string | null;
  license_key_mask: string | null;
  customer_name: string | null;
  product_id: string | null;
  channel: string | null;
};

type MachineManagementResponse = {
  machineHash: string;
  blocked: boolean;
  presence: MachinePresence | null;
  devices: MachineDevice[];
  users: MachineUser[];
};

type AdminMeRow = {
  email: string;
  authorized: boolean;
};

type RawKeyResult = {
  id: string;
  raw_key: string;
  key_mask?: string;
  license_key_mask?: string;
};

type CreateBuildResult = {
  id: string;
  version: string;
};

type TabName = "onboarding" | "devices" | "updates";

const normalizeEnvUrl = (value: string | undefined, fallback = ""): string =>
  (value ?? fallback)
    .trim()
    .replace(/^['"]+|['"]+$/g, "")
    .replace(/\/+$/, "");

const ADMIN_ORIGIN = normalizeEnvUrl(import.meta.env.VITE_ADMIN_ORIGIN, "https://tiktokops.pages.dev");
const SUPABASE_URL = normalizeEnvUrl(import.meta.env.VITE_SUPABASE_URL, "");
const SUPABASE_ANON_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY ?? "")
  .trim()
  .replace(/^['"]+|['"]+$/g, "");

const isLocalBrowser = (): boolean => {
  if (typeof window === "undefined") {
    return false;
  }
  const { protocol, hostname } = window.location;
  return protocol === "http:" && ["localhost", "127.0.0.1"].includes(hostname);
};

const assertFrontendSecurityContext = (): void => {
  if (typeof window === "undefined") {
    return;
  }

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error("Configure VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY antes de abrir o painel.");
  }

  if (!isLocalBrowser()) {
    if (window.location.protocol !== "https:") {
      throw new Error("O painel exige HTTPS.");
    }
    const currentOrigin = normalizeEnvUrl(window.location.origin);
    if (currentOrigin !== ADMIN_ORIGIN) {
      throw new Error(`Origem do painel nao autorizada. Esperado: ${ADMIN_ORIGIN}`);
    }
    if (!SUPABASE_URL.startsWith("https://")) {
      throw new Error("O Supabase do painel precisa usar HTTPS.");
    }
  }
};

assertFrontendSecurityContext();

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true
  }
});

const normalizeError = (error: unknown): string => {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return "Nao foi possivel concluir a operacao.";
};

const formatDateTime = (value?: string | null): string => {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("pt-BR");
};

const toIsoOrNull = (value: string): string | null => {
  if (!value.trim()) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
};

const statusLabel = (value: string): string => {
  switch (value) {
    case "active":
      return "Ativo";
    case "blocked":
      return "Bloqueado";
    case "revoked":
      return "Revogado";
    case "online":
      return "Online";
    case "offline":
      return "Offline";
    case "banned":
      return "Banido";
    case "unlicensed":
      return "Sem licenca";
    case "licensed":
      return "Licenciado sem login";
    case "with_login":
      return "Com login";
    default:
      return value || "-";
  }
};

const toneForStatus = (value: string): string => {
  switch (value) {
    case "active":
    case "online":
    case "licensed":
    case "with_login":
      return "ok";
    case "blocked":
    case "revoked":
    case "banned":
      return "danger";
    case "offline":
      return "muted";
    default:
      return "warn";
  }
};

const callRpc = async <T,>(fn: string, params?: Record<string, unknown>): Promise<T> => {
  const { data, error } = await supabase.rpc(fn, params ?? {});
  if (error) {
    throw new Error(error.message);
  }
  return data as T;
};

export function App() {
  const [tab, setTab] = useState<TabName>("devices");
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [identityEmail, setIdentityEmail] = useState("");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  const [customers, setCustomers] = useState<CustomerItem[]>([]);
  const [licenses, setLicenses] = useState<LicenseItem[]>([]);
  const [keys, setKeys] = useState<RegistrationKeyItem[]>([]);
  const [devices, setDevices] = useState<DeviceItem[]>([]);
  const [builds, setBuilds] = useState<BuildItem[]>([]);
  const [lastSyncedAt, setLastSyncedAt] = useState("");

  const [selectedMachineHash, setSelectedMachineHash] = useState("");
  const [machineManagement, setMachineManagement] = useState<MachineManagementResponse | null>(null);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [editUsername, setEditUsername] = useState("");
  const [editPassword, setEditPassword] = useState("");
  const [machineLicenseId, setMachineLicenseId] = useState("");

  const [latestGeneratedKey, setLatestGeneratedKey] = useState("");
  const [latestResetKey, setLatestResetKey] = useState("");
  const [latestCreatedLicenseKey, setLatestCreatedLicenseKey] = useState("");

  const [customerForm, setCustomerForm] = useState({
    name: "",
    contactEmail: "",
    externalKey: "",
    notes: ""
  });
  const [licenseForm, setLicenseForm] = useState({
    customerId: "",
    productId: "",
    channel: "stable",
    seatLimit: 1,
    notes: ""
  });
  const [keyForm, setKeyForm] = useState({ licenseId: "", maxUses: 1, expiresAt: "" });
  const [userForm, setUserForm] = useState({ licenseId: "", username: "", password: "" });
  const [buildForm, setBuildForm] = useState({
    channel: "stable",
    version: "",
    installerUrl: "",
    packageUrl: "",
    packageFormat: "zip",
    packageSha256: "",
    packageEntrypoint: "",
    manifestUrl: "",
    publishNow: true,
    mandatory: false,
    rolloutNotes: ""
  });

  const selectedMachine = useMemo(
    () => devices.find((device) => device.machine_hash === selectedMachineHash) ?? null,
    [devices, selectedMachineHash]
  );

  const selectedUser = useMemo(
    () => machineManagement?.users.find((entry) => entry.id === selectedUserId) ?? null,
    [machineManagement, selectedUserId]
  );

  const selectedCustomer = useMemo(
    () => customers.find((customer) => customer.id === licenseForm.customerId) ?? null,
    [customers, licenseForm.customerId]
  );

  const selectedKeyLicense = useMemo(
    () => licenses.find((license) => license.id === keyForm.licenseId) ?? null,
    [keyForm.licenseId, licenses]
  );

  const selectedUserLicense = useMemo(
    () => licenses.find((license) => license.id === userForm.licenseId) ?? null,
    [licenses, userForm.licenseId]
  );

  const clearNotices = () => {
    setError("");
    setMessage("");
  };

  const stampSync = () => setLastSyncedAt(new Date().toLocaleTimeString("pt-BR"));

  const loadMachine = useCallback(async (machineHash: string) => {
    const details = await callRpc<MachineManagementResponse>("admin_get_machine", { p_machine_hash: machineHash });
    setSelectedMachineHash(machineHash);
    setMachineManagement(details);
    setSelectedUserId("");
    setEditUsername("");
    setEditPassword("");
  }, []);

  const refreshCore = useCallback(async () => {
    const [customerRows, licenseRows, keyRows, deviceRows, buildRows] = await Promise.all([
      callRpc<CustomerItem[]>("admin_list_customers"),
      callRpc<LicenseItem[]>("admin_list_licenses"),
      callRpc<RegistrationKeyItem[]>("admin_list_registration_keys"),
      callRpc<DeviceItem[]>("admin_list_devices"),
      callRpc<BuildItem[]>("admin_list_builds")
    ]);

    setCustomers(customerRows ?? []);
    setLicenses(licenseRows ?? []);
    setKeys(keyRows ?? []);
    setDevices(deviceRows ?? []);
    setBuilds(buildRows ?? []);
    stampSync();
  }, []);

  const refreshDeviceView = useCallback(async () => {
    const deviceRowsPromise = callRpc<DeviceItem[]>("admin_list_devices");
    const machinePromise = selectedMachineHash
      ? callRpc<MachineManagementResponse>("admin_get_machine", { p_machine_hash: selectedMachineHash })
      : Promise.resolve(null);

    const [deviceRows, machineDetails] = await Promise.all([deviceRowsPromise, machinePromise]);
    setDevices(deviceRows ?? []);
    if (machineDetails) {
      setMachineManagement(machineDetails);
    }
    stampSync();
  }, [selectedMachineHash]);

  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!active) {
        return;
      }
      setSession(data.session ?? null);
      setAuthLoading(false);
    });

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!active) {
        return;
      }
      setSession(nextSession ?? null);
      setAuthLoading(false);
    });

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadIdentity = async () => {
      if (!session) {
        setAuthorized(false);
        setIdentityEmail("");
        setCustomers([]);
        setLicenses([]);
        setKeys([]);
        setDevices([]);
        setBuilds([]);
        setSelectedMachineHash("");
        setMachineManagement(null);
        return;
      }

      try {
        const rows = await callRpc<AdminMeRow[]>("admin_me");
        const me = rows?.[0];
        if (cancelled) {
          return;
        }
        setIdentityEmail(me?.email ?? session.user.email ?? "");
        setAuthorized(Boolean(me?.authorized));
        if (me?.authorized) {
          await refreshCore();
          if (selectedMachineHash) {
            await loadMachine(selectedMachineHash);
          }
        }
      } catch (rpcError) {
        if (!cancelled) {
          setAuthorized(false);
          setError(normalizeError(rpcError));
        }
      }
    };

    void loadIdentity();

    return () => {
      cancelled = true;
    };
  }, [loadMachine, refreshCore, selectedMachineHash, session]);

  useEffect(() => {
    if (!authorized || tab !== "devices") {
      return;
    }

    void refreshDeviceView().catch(() => undefined);

    const deviceInterval = window.setInterval(() => {
      void refreshDeviceView().catch(() => undefined);
    }, 5000);

    return () => {
      window.clearInterval(deviceInterval);
    };
  }, [authorized, refreshDeviceView, tab]);

  useEffect(() => {
    if (!selectedUser) {
      return;
    }
    setEditUsername(selectedUser.username);
    setEditPassword("");
  }, [selectedUser]);

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    clearNotices();
    setBusy("login");
    try {
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: loginEmail.trim(),
        password: loginPassword
      });
      if (authError) {
        throw authError;
      }
      setMessage("Acesso liberado. Carregando painel.");
      setLoginPassword("");
    } catch (authError) {
      setError(normalizeError(authError));
    } finally {
      setBusy("");
    }
  };

  const handleLogout = async () => {
    clearNotices();
    setBusy("logout");
    try {
      await supabase.auth.signOut();
      setMessage("Sessao encerrada.");
    } catch (logoutError) {
      setError(normalizeError(logoutError));
    } finally {
      setBusy("");
    }
  };

  const handleRefresh = async () => {
    clearNotices();
    setBusy("refresh");
    try {
      await refreshCore();
      if (selectedMachineHash) {
        await loadMachine(selectedMachineHash);
      }
      setMessage("Painel sincronizado com o Supabase.");
    } catch (refreshError) {
      setError(normalizeError(refreshError));
    } finally {
      setBusy("");
    }
  };

  const handleCreateCustomer = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    clearNotices();
    setBusy("create-customer");
    try {
      const rows = await callRpc<Array<{ id: string; name: string }>>("admin_create_customer", {
        p_name: customerForm.name,
        p_contact_email: customerForm.contactEmail || null,
        p_external_key: customerForm.externalKey || null,
        p_notes: customerForm.notes || null
      });
      const created = rows?.[0];
      setCustomerForm({ name: "", contactEmail: "", externalKey: "", notes: "" });
      if (created?.id) {
        setLicenseForm((current) => ({ ...current, customerId: created.id }));
      }
      await refreshCore();
      setMessage("Cliente criado com sucesso.");
    } catch (createError) {
      setError(normalizeError(createError));
    } finally {
      setBusy("");
    }
  };

  const handleCreateLicense = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    clearNotices();
    setBusy("create-license");
    try {
      const rows = await callRpc<RawKeyResult[]>("admin_create_license", {
        p_customer_id: licenseForm.customerId,
        p_product_id: licenseForm.productId,
        p_channel: licenseForm.channel,
        p_seat_limit: Number(licenseForm.seatLimit),
        p_features: [],
        p_notes: licenseForm.notes || null,
        p_status: "active"
      });
      const created = rows?.[0];
      setLatestCreatedLicenseKey(created?.raw_key ?? "");
      setLicenseForm((current) => ({
        ...current,
        productId: "",
        channel: "stable",
        seatLimit: 1,
        notes: ""
      }));
      if (created?.id) {
        setKeyForm((current) => ({ ...current, licenseId: created.id }));
        setUserForm((current) => ({ ...current, licenseId: created.id }));
      }
      await refreshCore();
      setMessage("Licenca criada. Guarde a key real exibida acima.");
    } catch (createError) {
      setError(normalizeError(createError));
    } finally {
      setBusy("");
    }
  };

  const handleCreateKey = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    clearNotices();
    setBusy("create-key");
    try {
      const rows = await callRpc<RawKeyResult[]>("admin_create_registration_key", {
        p_license_id: keyForm.licenseId,
        p_max_uses: Number(keyForm.maxUses),
        p_expires_at: toIsoOrNull(keyForm.expiresAt)
      });
      const created = rows?.[0];
      setLatestGeneratedKey(created?.raw_key ?? "");
      setKeyForm((current) => ({ ...current, expiresAt: "" }));
      await refreshCore();
      setMessage("Chave de cadastro emitida com sucesso.");
    } catch (createError) {
      setError(normalizeError(createError));
    } finally {
      setBusy("");
    }
  };

  const handleCreateUserByLicense = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    clearNotices();
    setBusy("create-user");
    try {
      await callRpc("admin_create_client_user", {
        p_machine_hash: null,
        p_license_id: userForm.licenseId,
        p_username: userForm.username,
        p_password: userForm.password
      });
      setUserForm((current) => ({ ...current, username: "", password: "" }));
      await refreshCore();
      setMessage("Login do cliente criado para a licenca selecionada.");
    } catch (createError) {
      setError(normalizeError(createError));
    } finally {
      setBusy("");
    }
  };

  const openMachineManager = async (device: DeviceItem) => {
    clearNotices();
    setBusy(`machine:${device.machine_hash}`);
    try {
      setMachineLicenseId("");
      await loadMachine(device.machine_hash);
    } catch (loadError) {
      setError(normalizeError(loadError));
    } finally {
      setBusy("");
    }
  };

  const handleBanMachine = async (machineHash: string) => {
    clearNotices();
    setBusy(`ban:${machineHash}`);
    try {
      await callRpc("admin_ban_machine", { p_machine_hash: machineHash, p_reason: "Banido pelo painel" });
      await refreshDeviceView();
      if (selectedMachineHash === machineHash) {
        await loadMachine(machineHash);
      }
      setMessage("Maquina bloqueada e sessoes revogadas.");
    } catch (banError) {
      setError(normalizeError(banError));
    } finally {
      setBusy("");
    }
  };

  const handleUnblockMachine = async (machineHash: string) => {
    clearNotices();
    setBusy(`unblock:${machineHash}`);
    try {
      await callRpc("admin_unblock_machine", { p_machine_hash: machineHash, p_reason: "Liberado pelo painel" });
      await refreshDeviceView();
      if (selectedMachineHash === machineHash) {
        await loadMachine(machineHash);
      }
      setMessage("Maquina liberada.");
    } catch (unblockError) {
      setError(normalizeError(unblockError));
    } finally {
      setBusy("");
    }
  };

  const handleAssignLicense = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedMachine) {
      return;
    }
    clearNotices();
    setBusy("assign-license");
    try {
      await callRpc("admin_assign_license_to_machine", {
        p_machine_hash: selectedMachine.machine_hash,
        p_license_id: machineLicenseId
      });
      await refreshCore();
      await loadMachine(selectedMachine.machine_hash);
      setMessage("Licenca vinculada a maquina.");
    } catch (assignError) {
      setError(normalizeError(assignError));
    } finally {
      setBusy("");
    }
  };

  const handleUpdateUser = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedUserId) {
      return;
    }
    clearNotices();
    setBusy("update-user");
    try {
      await callRpc("admin_update_client_user", {
        p_user_id: selectedUserId,
        p_username: editUsername,
        p_password: editPassword.trim() ? editPassword : null
      });
      if (selectedMachineHash) {
        await loadMachine(selectedMachineHash);
      }
      setEditPassword("");
      await refreshCore();
      setMessage("Usuario atualizado.");
    } catch (updateError) {
      setError(normalizeError(updateError));
    } finally {
      setBusy("");
    }
  };

  const handleResetLicenseKey = async (licenseId: string) => {
    clearNotices();
    setBusy(`reset:${licenseId}`);
    try {
      const rows = await callRpc<RawKeyResult[]>("admin_reset_license_key", { p_license_id: licenseId });
      setLatestResetKey(rows?.[0]?.raw_key ?? "");
      await refreshCore();
      if (selectedMachineHash) {
        await loadMachine(selectedMachineHash);
      }
      setMessage("Nova key real da licenca gerada.");
    } catch (resetError) {
      setError(normalizeError(resetError));
    } finally {
      setBusy("");
    }
  };

  const handleCreateBuild = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    clearNotices();
    setBusy("create-build");
    try {
      await callRpc<CreateBuildResult[]>("admin_create_build", {
        p_channel: buildForm.channel,
        p_version: buildForm.version,
        p_installer_url: buildForm.installerUrl || null,
        p_package_url: buildForm.packageUrl || null,
        p_package_format: buildForm.packageUrl ? buildForm.packageFormat : null,
        p_package_sha256: buildForm.packageSha256 || null,
        p_package_entrypoint: buildForm.packageEntrypoint || null,
        p_manifest_url: buildForm.manifestUrl || null,
        p_publish: buildForm.publishNow,
        p_mandatory: buildForm.mandatory,
        p_rollout_notes: buildForm.rolloutNotes || null
      });
      setBuildForm((current) => ({
        ...current,
        version: "",
        installerUrl: "",
        packageUrl: "",
        packageFormat: "zip",
        packageSha256: "",
        packageEntrypoint: "",
        manifestUrl: "",
        publishNow: true,
        mandatory: false,
        rolloutNotes: ""
      }));
      await refreshCore();
      setMessage("Atualizacao registrada no banco.");
    } catch (buildError) {
      setError(normalizeError(buildError));
    } finally {
      setBusy("");
    }
  };

  if (authLoading) {
    return (
      <main className="auth-shell">
        <section className="auth-card">
          <h1>Carregando painel</h1>
          <p>Validando sessao e permissao de administrador.</p>
        </section>
      </main>
    );
  }

  if (!session) {
    return (
      <main className="auth-shell">
        <form className="auth-card" onSubmit={handleLogin}>
          <p className="eyebrow">CONTROLE OPERACIONAL</p>
          <h1>Acesso administrativo</h1>
          <p className="helper">Autentique-se com sua credencial de operador. O acesso e liberado apenas para identidades registradas em <code>admin_roles</code>.</p>
          {error ? <div className="notice error">{error}</div> : null}
          {message ? <div className="notice success">{message}</div> : null}
          <label>
            <span>E-mail</span>
            <input value={loginEmail} onChange={(event) => setLoginEmail(event.target.value)} type="email" required />
          </label>
          <label>
            <span>Senha</span>
            <input value={loginPassword} onChange={(event) => setLoginPassword(event.target.value)} type="password" required />
          </label>
          <button disabled={busy === "login"} type="submit">{busy === "login" ? "Entrando..." : "Entrar"}</button>
        </form>
      </main>
    );
  }

  if (!authorized) {
    return (
      <main className="auth-shell">
        <section className="auth-card">
          <p className="eyebrow">ACESSO BLOQUEADO</p>
          <h1>Identidade sem permissao administrativa</h1>
          <p className="helper">A conta <strong>{identityEmail || session.user.email}</strong> existe, mas ainda nao possui autorizacao operacional em <code>admin_roles</code>.</p>
          {error ? <div className="notice error">{error}</div> : null}
          <button onClick={() => void handleLogout()} type="button">Sair</button>
        </section>
      </main>
    );
  }

  return (
    <main className="admin-root">
      <header className="topbar">
        <div>
          <p className="eyebrow">PAINEL DE CONTROLE</p>
          <h1>TikTok Ops Admin</h1>
          <p>Onboarding, inventario de maquinas e distribuicao de builds em modo Supabase-only.</p>
        </div>
        <div className="actions right">
          <span className="sync-label">Ultima sincronizacao: {lastSyncedAt || "-"}</span>
          <button onClick={() => void handleRefresh()} type="button">Atualizar</button>
          <button className="secondary" onClick={() => void handleLogout()} type="button">Sair</button>
        </div>
      </header>

      {message ? <div className="notice success">{message}</div> : null}
      {error ? <div className="notice error">{error}</div> : null}
      {latestCreatedLicenseKey ? <div className="notice success">Key real da nova licenca: <strong>{latestCreatedLicenseKey}</strong></div> : null}
      {latestGeneratedKey ? <div className="notice success">Nova chave de cadastro: <strong>{latestGeneratedKey}</strong></div> : null}
      {latestResetKey ? <div className="notice success">Nova key real da licenca: <strong>{latestResetKey}</strong></div> : null}

      <nav className="tabbar">
        <button className={tab === "onboarding" ? "active" : ""} onClick={() => setTab("onboarding")} type="button">Onboarding</button>
        <button className={tab === "devices" ? "active" : ""} onClick={() => setTab("devices")} type="button">Dispositivos</button>
        <button className={tab === "updates" ? "active" : ""} onClick={() => setTab("updates")} type="button">Atualizacoes</button>
      </nav>

      {tab === "onboarding" ? (
        <section className="section-grid onboarding-layout">
          <article className="card compact">
            <h2>Criar cliente</h2>
            <p className="helper">Primeiro passo do painel gratuito. Crie o cliente antes de emitir licencas e logins.</p>
            <form className="grid-form" onSubmit={handleCreateCustomer}>
              <label className="full">
                <span>Nome do cliente</span>
                <input required value={customerForm.name} onChange={(event) => setCustomerForm((current) => ({ ...current, name: event.target.value }))} />
              </label>
              <label>
                <span>E-mail de contato</span>
                <input type="email" value={customerForm.contactEmail} onChange={(event) => setCustomerForm((current) => ({ ...current, contactEmail: event.target.value }))} />
              </label>
              <label>
                <span>Chave externa</span>
                <input value={customerForm.externalKey} onChange={(event) => setCustomerForm((current) => ({ ...current, externalKey: event.target.value }))} />
              </label>
              <label className="full">
                <span>Notas</span>
                <input value={customerForm.notes} onChange={(event) => setCustomerForm((current) => ({ ...current, notes: event.target.value }))} />
              </label>
              <div className="full action-row">
                <button disabled={busy === "create-customer"} type="submit">{busy === "create-customer" ? "Criando..." : "Criar cliente"}</button>
              </div>
            </form>

            <div className="manager-card">
              <h3>Criar licenca</h3>
              <form className="grid-form" onSubmit={handleCreateLicense}>
                <label className="full">
                  <span>Cliente</span>
                  <select required value={licenseForm.customerId} onChange={(event) => setLicenseForm((current) => ({ ...current, customerId: event.target.value }))}>
                    <option value="">Selecione um cliente</option>
                    {customers.map((customer) => (
                      <option key={customer.id} value={customer.id}>{customer.name}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Produto</span>
                  <input required placeholder="tiktok-ops" value={licenseForm.productId} onChange={(event) => setLicenseForm((current) => ({ ...current, productId: event.target.value }))} />
                </label>
                <label>
                  <span>Canal</span>
                  <input required value={licenseForm.channel} onChange={(event) => setLicenseForm((current) => ({ ...current, channel: event.target.value }))} />
                </label>
                <label>
                  <span>Limite de assentos</span>
                  <input min={1} required type="number" value={licenseForm.seatLimit} onChange={(event) => setLicenseForm((current) => ({ ...current, seatLimit: Number(event.target.value) }))} />
                </label>
                <label className="full">
                  <span>Notas</span>
                  <input value={licenseForm.notes} onChange={(event) => setLicenseForm((current) => ({ ...current, notes: event.target.value }))} />
                </label>
                <div className="full action-row">
                  <button disabled={busy === "create-license"} type="submit">{busy === "create-license" ? "Gerando..." : "Criar licenca"}</button>
                </div>
                <p className="helper full">{selectedCustomer ? `A licenca sera criada para ${selectedCustomer.name} e a key real aparecera uma unica vez.` : "Selecione um cliente para gerar a licenca e a key real."}</p>
              </form>
            </div>

            <div className="manager-card">
              <h3>Criar login por licenca</h3>
              <form className="grid-form" onSubmit={handleCreateUserByLicense}>
                <label className="full">
                  <span>Licenca</span>
                  <select required value={userForm.licenseId} onChange={(event) => setUserForm((current) => ({ ...current, licenseId: event.target.value }))}>
                    <option value="">Selecione uma licenca</option>
                    {licenses.map((license) => (
                      <option key={license.id} value={license.id}>{license.customer_name} | {license.license_key_mask}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Usuario</span>
                  <input required value={userForm.username} onChange={(event) => setUserForm((current) => ({ ...current, username: event.target.value }))} />
                </label>
                <label>
                  <span>Senha</span>
                  <input minLength={4} required type="password" value={userForm.password} onChange={(event) => setUserForm((current) => ({ ...current, password: event.target.value }))} />
                </label>
                <div className="full action-row">
                  <button disabled={busy === "create-user"} type="submit">{busy === "create-user" ? "Criando..." : "Criar login"}</button>
                </div>
                <p className="helper full">{selectedUserLicense ? `Esse login sera vinculado a ${selectedUserLicense.customer_name} e podera ser usado em qualquer maquina da licenca.` : "Esse fluxo nao depende de selecionar dispositivo."}</p>
              </form>
            </div>

            <div className="manager-card">
              <h3>Gerar chave de cadastro</h3>
              <form className="grid-form" onSubmit={handleCreateKey}>
                <label className="full">
                  <span>Licenca</span>
                  <select
                    required
                    value={keyForm.licenseId}
                    onChange={(event) => {
                      const nextLicenseId = event.target.value;
                      const nextLicense = licenses.find((license) => license.id === nextLicenseId);
                      setKeyForm((current) => ({
                        ...current,
                        licenseId: nextLicenseId,
                        maxUses: nextLicense?.seat_limit ?? current.maxUses
                      }));
                    }}
                  >
                    <option value="">Selecione uma licenca</option>
                    {licenses.map((license) => (
                      <option key={license.id} value={license.id}>{license.customer_name} | {license.license_key_mask}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Maximo de cadastros</span>
                  <input min={1} type="number" value={keyForm.maxUses} onChange={(event) => setKeyForm((current) => ({ ...current, maxUses: Number(event.target.value) }))} />
                </label>
                <label>
                  <span>Expira em</span>
                  <input type="datetime-local" value={keyForm.expiresAt} onChange={(event) => setKeyForm((current) => ({ ...current, expiresAt: event.target.value }))} />
                </label>
                <div className="full action-row">
                  <button disabled={busy === "create-key"} type="submit">{busy === "create-key" ? "Gerando..." : "Gerar key"}</button>
                </div>
                <p className="helper full">{selectedKeyLicense ? `Essa chave serve para qualquer maquina da licenca ate ${selectedKeyLicense.seat_limit} usos, salvo ajuste manual.` : "A chave de cadastro fica vinculada a uma licenca, nunca a um dispositivo especifico."}</p>
              </form>
            </div>
          </article>

          <div className="stack-column">
            <article className="card">
              <h2>Clientes</h2>
              <p className="helper">Base de clientes cadastrados no painel gratuito.</p>
              <div className="subtable-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Cliente</th>
                      <th>Contato</th>
                      <th>Licencas</th>
                      <th>Status</th>
                      <th>Atualizado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {customers.length === 0 ? (
                      <tr><td colSpan={5}>Nenhum cliente cadastrado.</td></tr>
                    ) : customers.map((customer) => (
                      <tr key={customer.id}>
                        <td>
                          <strong>{customer.name}</strong>
                          <div className="helper small">{customer.external_key || "Sem chave externa"}</div>
                        </td>
                        <td>{customer.contact_email || "-"}</td>
                        <td>{customer.license_count}</td>
                        <td><span className={`pill ${toneForStatus(customer.status)}`}>{statusLabel(customer.status)}</span></td>
                        <td>{formatDateTime(customer.updated_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>

            <article className="card">
              <h2>Licencas</h2>
              <p className="helper">As acoes sensiveis de key e onboarding agora ficam todas aqui, por licenca.</p>
              <div className="subtable-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Cliente</th>
                      <th>Produto</th>
                      <th>Canal</th>
                      <th>Assentos</th>
                      <th>Key</th>
                      <th>Status</th>
                      <th>Acoes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {licenses.length === 0 ? (
                      <tr><td colSpan={7}>Nenhuma licenca cadastrada.</td></tr>
                    ) : licenses.map((license) => (
                      <tr key={license.id}>
                        <td>{license.customer_name}</td>
                        <td>{license.product_id}</td>
                        <td>{license.channel}</td>
                        <td>{license.seat_limit}</td>
                        <td>{license.license_key_mask}</td>
                        <td><span className={`pill ${toneForStatus(license.status)}`}>{statusLabel(license.status)}</span></td>
                        <td>
                          <button className="secondary" onClick={() => void handleResetLicenseKey(license.id)} type="button">Nova key real</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>

            <article className="card">
              <h2>Chaves de cadastro emitidas</h2>
              <p className="helper">O valor real aparece so no momento da geracao. Depois disso, so a mascara fica salva.</p>
              <div className="subtable-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Cliente</th>
                      <th>Licenca</th>
                      <th>Key mascarada</th>
                      <th>Status</th>
                      <th>Usos</th>
                      <th>Expira</th>
                    </tr>
                  </thead>
                  <tbody>
                    {keys.length === 0 ? (
                      <tr><td colSpan={6}>Nenhuma key cadastrada.</td></tr>
                    ) : keys.map((entry) => (
                      <tr key={entry.id}>
                        <td>{entry.customer_name}</td>
                        <td>{entry.license_key_mask}</td>
                        <td>{entry.key_mask}</td>
                        <td><span className={`pill ${toneForStatus(entry.status)}`}>{statusLabel(entry.status)}</span></td>
                        <td>{entry.used_count}/{entry.max_uses}</td>
                        <td>{formatDateTime(entry.expires_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>
          </div>
        </section>
      ) : null}

      {tab === "devices" ? (
        <section className="section-grid devices-layout">
          <article className="card span-2">
            <h2>Dispositivos e maquinas</h2>
            <p className="helper">Qualquer maquina que abrir o programa e enviar beacon aparece aqui. O painel agora mostra desde a presenca anonima ate o uso com licenca e login.</p>
            <div className="subtable-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Maquina</th>
                    <th>Estado</th>
                    <th>Produto</th>
                    <th>Cliente</th>
                    <th>Licenca</th>
                    <th>Conexao</th>
                    <th>Ultimo contato</th>
                    <th>Acoes</th>
                  </tr>
                </thead>
                <tbody>
                  {devices.length === 0 ? (
                    <tr><td colSpan={8}>Nenhuma maquina registrada ainda.</td></tr>
                  ) : devices.map((device) => (
                    <tr key={device.machine_hash}>
                      <td>
                        <strong>{device.machine_name || "Sem nome"}</strong>
                        <div className="mono small">{device.machine_hash}</div>
                        <div className="helper small">v{device.version || "-"}</div>
                      </td>
                      <td>
                        <span className={`pill ${toneForStatus(device.presence_status)}`}>{statusLabel(device.presence_status)}</span>
                        <div className="helper small">{device.linked_user_count} usuario(s) | {device.linked_license_count} licenca(s)</div>
                      </td>
                      <td>
                        <strong>{device.product_id || "-"}</strong>
                        <div className="helper small">{device.channel || "-"}</div>
                      </td>
                      <td>{device.customer_name}</td>
                      <td>{device.license_key_mask ?? "Sem licenca"}</td>
                      <td>
                        <span className={`pill ${toneForStatus(device.online_status)}`}>{statusLabel(device.online_status)}</span>
                        <div className="helper small">Acesso: {statusLabel(device.access_status)}</div>
                      </td>
                      <td>{formatDateTime(device.last_seen_at)}</td>
                      <td>
                        <div className="row-actions">
                          <button className="secondary" onClick={() => void openMachineManager(device)} type="button">Gerenciar</button>
                          {device.blocked ? (
                            <button onClick={() => void handleUnblockMachine(device.machine_hash)} type="button">Desbloquear</button>
                          ) : (
                            <button className="danger" onClick={() => void handleBanMachine(device.machine_hash)} type="button">Banir</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>

          <aside className="card manager-panel">
            <h2>Gerenciamento da maquina</h2>
            {!selectedMachine || !machineManagement ? (
              <p className="helper">Selecione uma maquina para abrir o contexto completo: presenca, licencas observadas, usuarios e vinculo manual.</p>
            ) : (
              <>
                <div className="manager-summary">
                  <div>
                    <span className="helper">Maquina</span>
                    <strong>{selectedMachine.machine_name}</strong>
                    <div className="mono small">{selectedMachine.machine_hash}</div>
                  </div>
                  <div className="row-actions">
                    <span className={`pill ${machineManagement.blocked ? "danger" : toneForStatus(selectedMachine.presence_status)}`}>{machineManagement.blocked ? "Bloqueada" : statusLabel(selectedMachine.presence_status)}</span>
                    {machineManagement.blocked ? (
                      <button onClick={() => void handleUnblockMachine(selectedMachine.machine_hash)} type="button">Desbloquear</button>
                    ) : (
                      <button className="danger" onClick={() => void handleBanMachine(selectedMachine.machine_hash)} type="button">Banir</button>
                    )}
                  </div>
                </div>

                <div className="manager-card">
                  <h3>Presenca observada</h3>
                  {machineManagement.presence ? (
                    <div className="detail-grid">
                      <div className="detail-item"><span className="helper">Status</span><strong>{statusLabel(machineManagement.presence.presence_status)}</strong></div>
                      <div className="detail-item"><span className="helper">Produto</span><strong>{machineManagement.presence.product_id || "-"}</strong></div>
                      <div className="detail-item"><span className="helper">Canal</span><strong>{machineManagement.presence.channel || "-"}</strong></div>
                      <div className="detail-item"><span className="helper">Versao</span><strong>{machineManagement.presence.version || "-"}</strong></div>
                      <div className="detail-item"><span className="helper">Cliente</span><strong>{machineManagement.presence.customer_name || "-"}</strong></div>
                      <div className="detail-item"><span className="helper">Licenca observada</span><strong>{machineManagement.presence.license_key_mask || "-"}</strong></div>
                      <div className="detail-item"><span className="helper">Ultimo beacon</span><strong>{formatDateTime(machineManagement.presence.last_seen_at)}</strong></div>
                      <div className="detail-item"><span className="helper">Expira em</span><strong>{formatDateTime(machineManagement.presence.expires_at)}</strong></div>
                    </div>
                  ) : (
                    <p className="helper">Ainda nao existe registro de presenca persistido para esta maquina.</p>
                  )}
                </div>

                <div className="manager-card">
                  <h3>Licencas ligadas</h3>
                  {machineManagement.devices.length === 0 ? (
                    <p className="helper">Nenhuma licenca associada a esta maquina.</p>
                  ) : machineManagement.devices.map((device) => (
                    <div className="license-row" key={device.id}>
                      <div>
                        <strong>{device.license_key_mask ?? "Sem key"}</strong>
                        <div className="helper">{device.customer_name || "Sem cliente"} | {device.product_id || "-"} | {device.channel || "-"}</div>
                      </div>
                      {device.license_id ? (
                        <button className="secondary" onClick={() => void handleResetLicenseKey(device.license_id)} type="button">Nova key real</button>
                      ) : null}
                    </div>
                  ))}
                </div>

                <div className="manager-card">
                  <h3>Vincular licenca na maquina</h3>
                  <form className="grid-form" onSubmit={handleAssignLicense}>
                    <label className="full">
                      <span>Licenca</span>
                      <select required value={machineLicenseId} onChange={(event) => setMachineLicenseId(event.target.value)}>
                        <option value="">Selecione uma licenca</option>
                        {licenses.map((license) => (
                          <option key={license.id} value={license.id}>{license.customer_name} | {license.license_key_mask}</option>
                        ))}
                      </select>
                    </label>
                    <div className="full action-row">
                      <button disabled={busy === "assign-license"} type="submit">Vincular licenca</button>
                    </div>
                    <p className="helper full">Use isso quando a maquina ja apareceu so com beacon e voce quer enriquecer manualmente o vinculo dela.</p>
                  </form>
                </div>

                <div className="manager-card">
                  <h3>Usuarios vistos nessa maquina</h3>
                  {machineManagement.users.length === 0 ? (
                    <p className="helper">Nenhum login foi usado nessa maquina ainda. Para criar login novo, use a aba Onboarding por licenca.</p>
                  ) : (
                    <>
                      <label>
                        <span>Escolha um usuario</span>
                        <select value={selectedUserId} onChange={(event) => setSelectedUserId(event.target.value)}>
                          <option value="">Selecione</option>
                          {machineManagement.users.map((user) => (
                            <option key={`${user.id}-${user.session_last_seen_at || "none"}`} value={user.id}>{user.username} | {statusLabel(user.user_status)}</option>
                          ))}
                        </select>
                      </label>

                      <form className="grid-form separated" onSubmit={handleUpdateUser}>
                        <label>
                          <span>Usuario</span>
                          <input disabled={!selectedUser} value={editUsername} onChange={(event) => setEditUsername(event.target.value)} />
                        </label>
                        <label>
                          <span>Nova senha</span>
                          <input disabled={!selectedUser} minLength={4} placeholder="Deixe vazio para manter" type="password" value={editPassword} onChange={(event) => setEditPassword(event.target.value)} />
                        </label>
                        <div className="full action-row">
                          <button disabled={!selectedUser || busy === "update-user"} type="submit">Salvar usuario</button>
                        </div>
                      </form>
                    </>
                  )}
                </div>
              </>
            )}
          </aside>
        </section>
      ) : null}

      {tab === "updates" ? (
        <section className="section-grid">
          <article className="card compact">
            <h2>Publicar atualizacao</h2>
            <p className="helper">Registre artefatos por URL, com suporte a instalador direto, pacote, hash e manifesto.</p>
            <form className="grid-form" onSubmit={handleCreateBuild}>
              <label>
                <span>Canal</span>
                <input required value={buildForm.channel} onChange={(event) => setBuildForm((current) => ({ ...current, channel: event.target.value }))} />
              </label>
              <label>
                <span>Versao</span>
                <input required value={buildForm.version} onChange={(event) => setBuildForm((current) => ({ ...current, version: event.target.value }))} />
              </label>
              <label className="full">
                <span>URL do instalador</span>
                <input placeholder="https://.../setup.exe" value={buildForm.installerUrl} onChange={(event) => setBuildForm((current) => ({ ...current, installerUrl: event.target.value }))} />
              </label>
              <label className="full">
                <span>URL do pacote .zip/.rar/.7z</span>
                <input placeholder="https://.../pacote.zip" value={buildForm.packageUrl} onChange={(event) => setBuildForm((current) => ({ ...current, packageUrl: event.target.value }))} />
              </label>
              <label>
                <span>Formato do pacote</span>
                <select value={buildForm.packageFormat} onChange={(event) => setBuildForm((current) => ({ ...current, packageFormat: event.target.value }))}>
                  <option value="zip">zip</option>
                  <option value="rar">rar</option>
                  <option value="7z">7z</option>
                  <option value="tar.gz">tar.gz</option>
                </select>
              </label>
              <label>
                <span>SHA256 do pacote</span>
                <input placeholder="Opcional" value={buildForm.packageSha256} onChange={(event) => setBuildForm((current) => ({ ...current, packageSha256: event.target.value }))} />
              </label>
              <label className="full">
                <span>Entrypoint dentro do pacote</span>
                <input placeholder="Ex.: TikTokOpsSetup.exe" value={buildForm.packageEntrypoint} onChange={(event) => setBuildForm((current) => ({ ...current, packageEntrypoint: event.target.value }))} />
              </label>
              <label className="full">
                <span>URL do manifesto assinado</span>
                <input placeholder="https://.../manifest.json" value={buildForm.manifestUrl} onChange={(event) => setBuildForm((current) => ({ ...current, manifestUrl: event.target.value }))} />
              </label>
              <label className="full">
                <span>Notas do rollout</span>
                <input value={buildForm.rolloutNotes} onChange={(event) => setBuildForm((current) => ({ ...current, rolloutNotes: event.target.value }))} />
              </label>
              <label className="inline">
                <input checked={buildForm.publishNow} onChange={(event) => setBuildForm((current) => ({ ...current, publishNow: event.target.checked }))} type="checkbox" />
                <span>Publicar agora</span>
              </label>
              <label className="inline">
                <input checked={buildForm.mandatory} onChange={(event) => setBuildForm((current) => ({ ...current, mandatory: event.target.checked }))} type="checkbox" />
                <span>Obrigatoria</span>
              </label>
              <div className="full action-row">
                <button disabled={busy === "create-build"} type="submit">Registrar atualizacao</button>
              </div>
            </form>
          </article>

          <article className="card">
            <h2>Versoes registradas</h2>
            <p className="helper">Historico de releases persistidas no banco.</p>
            <div className="subtable-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Canal</th>
                    <th>Versao</th>
                    <th>Status</th>
                    <th>Pacote</th>
                    <th>Manifesto</th>
                    <th>Criado em</th>
                  </tr>
                </thead>
                <tbody>
                  {builds.length === 0 ? (
                    <tr><td colSpan={6}>Nenhuma atualizacao cadastrada.</td></tr>
                  ) : builds.map((build) => (
                    <tr key={build.id}>
                      <td>{build.channel}</td>
                      <td>{build.version}</td>
                      <td><span className={`pill ${build.is_published ? "ok" : "muted"}`}>{build.is_published ? "Publicado" : "Rascunho"}</span></td>
                      <td>{build.package_url || build.installer_url || "-"}</td>
                      <td>{build.manifest_url || "-"}</td>
                      <td>{formatDateTime(build.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>
        </section>
      ) : null}

      <footer className="footer-note">
        <span>Administrador: {identityEmail}</span>
        <span>Origem: {ADMIN_ORIGIN}</span>
      </footer>
    </main>
  );
}
