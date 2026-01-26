import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Box, Skeleton } from "@mui/material";
import type { SxProps, Theme } from "@mui/material/styles";

type SafeChartContainerProps = {
  children: ReactNode;
  minHeight?: number;
  sx?: SxProps<Theme>;
};

export default function SafeChartContainer({
  children,
  minHeight = 200,
  sx
}: SafeChartContainerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    if (!containerRef.current) return;
    const element = containerRef.current;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        setSize({ width, height });
      }
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const isReady = size.width > 0 && size.height > 0;

  return (
    <Box ref={containerRef} sx={{ width: "100%", height: "100%", minHeight, ...sx }}>
      {isReady ? children : <Skeleton variant="rectangular" height="100%" />}
    </Box>
  );
}
