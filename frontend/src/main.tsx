import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { GlobalStyles } from "@mui/material";

import dayjs from "dayjs";
import "dayjs/locale/tr";

import App from "./App";
import { AuthProvider } from "./context/AuthContext";
import { ThemeModeProvider } from "./context/ThemeModeContext";

dayjs.locale("tr");

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1
    }
  }
});

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeModeProvider>
        <GlobalStyles
          styles={{
            html: {
              height: "100%",
              overflowY: "scroll",
              scrollbarGutter: "stable"
            },
            body: {
              minHeight: "100vh",
              overflowX: "hidden",
              overflowY: "scroll",
              scrollbarGutter: "stable both-edges",
              width: "100%"
            },
            "#root": {
              minHeight: "100%"
            },
            "@page": {
              size: "100mm 100mm",
              margin: 0
            },
            "@media print": {
              body: {
                margin: 0,
                backgroundColor: "#fff"
              },
              "#root": {
                minHeight: "auto"
              },
              "body *": {
                visibility: "hidden"
              },
              ".etiket-print-area": {
                visibility: "visible",
                position: "absolute",
                left: "50%",
                top: 0,
                transform: "translateX(-50%)",
                boxShadow: "none",
                borderRadius: 0
              },
              ".etiket-print-area *": {
                visibility: "visible"
              }
            }
          }}
        />
        <BrowserRouter>
          <AuthProvider>
            <App />
          </AuthProvider>
        </BrowserRouter>
      </ThemeModeProvider>
    </QueryClientProvider>
  </React.StrictMode>
);
