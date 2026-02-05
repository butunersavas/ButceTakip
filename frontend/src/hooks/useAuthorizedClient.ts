import { apiClient } from "../api/client";

export default function useAuthorizedClient() {
  return apiClient;
}
