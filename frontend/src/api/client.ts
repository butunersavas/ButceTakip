import axios from "axios";

import { getApiBase } from "../config/apiBase";

export const API_BASE = getApiBase();
console.log("API_BASE", API_BASE);

export const apiClient = axios.create({
  baseURL: API_BASE
});

export function authHeaders(token: string | null) {
  return token
    ? {
        Authorization: `Bearer ${token}`
      }
    : {};
}
