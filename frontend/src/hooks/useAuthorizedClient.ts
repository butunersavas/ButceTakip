import { useMemo } from "react";

import { apiClient } from "../api/client";
import { useAuth } from "../context/AuthContext";

export default function useAuthorizedClient() {
  const { token } = useAuth();

  return useMemo(() => {
    if (token) {
      apiClient.defaults.headers.common.Authorization = `Bearer ${token}`;
    } else {
      delete apiClient.defaults.headers.common.Authorization;
    }

    return apiClient;
  }, [token]);
}
