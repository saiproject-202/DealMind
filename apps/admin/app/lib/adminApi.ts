const API = "http://localhost:4001";

function getToken() {
  if (typeof window === "undefined") return "";
  return localStorage.getItem("dm_admin_token") || "";
}

function headers() {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${getToken()}`,
  };
}

// ── Auth ───────────────────────────────────────────────────────
export const adminLogin = (email: string, password: string) =>
  fetch(`${API}/api/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  }).then((r) => r.json());

export const getAdminMe = () =>
  fetch(`${API}/api/admin/me`, { headers: headers() }).then((r) => r.json());

// ── Stores ─────────────────────────────────────────────────────
export const getStores = () =>
  fetch(`${API}/api/admin/stores`, { headers: headers() }).then((r) => r.json());

export const createStore = (data: object) =>
  fetch(`${API}/api/admin/stores`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(data),
  }).then((r) => r.json());

export const updateStore = (id: string, data: object) =>
  fetch(`${API}/api/admin/stores/${id}`, {
    method: "PUT",
    headers: headers(),
    body: JSON.stringify(data),
  }).then((r) => r.json());

// ── Products ───────────────────────────────────────────────────
export const getProducts = () =>
  fetch(`${API}/api/admin/products`, { headers: headers() }).then((r) => r.json());

export const createProduct = (data: object) =>
  fetch(`${API}/api/admin/products`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(data),
  }).then((r) => r.json());

// ── Stats ──────────────────────────────────────────────────────
export const getDashboardStats = () =>
  fetch(`${API}/api/admin/stats`, { headers: headers() }).then((r) => r.json());