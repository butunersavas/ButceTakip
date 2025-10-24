import { useMemo } from "react";
import axios from "axios";

import { useAuth } from "../context/AuthContext";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

export default function useAuthorizedClient() {
  const { token } = useAuth();

  return useMemo(() => {
    return axios.create({
      baseURL: API_URL,
      headers: token
        ? {
            Authorization: `Bearer ${token}`
          }
        : undefined
    });
  }, [token]);
}
