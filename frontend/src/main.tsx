import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider, CssBaseline, GlobalStyles } from "@mui/material";

import App from "./App";
import theme from "./theme";
import { AuthProvider } from "./context/AuthContext";

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
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <GlobalStyles
          styles={{
            html: {
              height: "100%",
              overflowY: "auto",
              scrollbarGutter: "stable"
            },
            body: {
              minHeight: "100vh",
              overflowX: "hidden",
              overflowY: "auto",
              scrollbarGutter: "stable both-edges",
              width: "100%"
            },
            "#root": {
              minHeight: "100%"
            }
          }}
        />
        <BrowserRouter>
          <AuthProvider>
            <App />
          </AuthProvider>
        </BrowserRouter>
      </ThemeProvider>
    </QueryClientProvider>
  </React.StrictMode>
);
