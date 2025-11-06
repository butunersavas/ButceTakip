import { useMemo } from "react";
import axios from "axios";

import { API_URL } from "../config";
import { useAuth } from "../context/AuthContext";

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
