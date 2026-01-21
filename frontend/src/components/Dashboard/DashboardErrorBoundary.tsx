import { Component, ReactNode } from "react";
import type { ErrorInfo } from "react";
import { Box, Button, Stack, Typography } from "@mui/material";

type DashboardErrorBoundaryProps = {
  children: ReactNode;
};

type DashboardErrorBoundaryState = {
  hasError: boolean;
  retryKey: number;
};

class DashboardErrorBoundary extends Component<
  DashboardErrorBoundaryProps,
  DashboardErrorBoundaryState
> {
  state: DashboardErrorBoundaryState = {
    hasError: false,
    retryKey: 0
  };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Dashboard render error", error, info);
  }

  handleRetry = () => {
    this.setState((prev) => ({ hasError: false, retryKey: prev.retryKey + 1 }));
  };

  render() {
    if (this.state.hasError) {
      return (
        <Box
          sx={{
            minHeight: "60vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            px: 2
          }}
        >
          <Stack spacing={2} alignItems="center">
            <Typography variant="h6" fontWeight={600}>
              Dashboard yüklenirken hata oluştu
            </Typography>
            <Button variant="contained" onClick={this.handleRetry}>
              Yeniden dene
            </Button>
          </Stack>
        </Box>
      );
    }

    return <Box key={this.state.retryKey}>{this.props.children}</Box>;
  }
}

export default DashboardErrorBoundary;
