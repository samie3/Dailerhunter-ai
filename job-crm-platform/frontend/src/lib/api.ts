import axios from "axios";

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000",
});

api.interceptors.request.use((config) => {
  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err.response?.status === 401 && typeof window !== "undefined") {
      localStorage.removeItem("token");
      window.location.href = "/auth/login";
    }
    return Promise.reject(err);
  }
);

export default api;
