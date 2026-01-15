import type { ReactNode } from "react";
import { Avatar, Box, Card, CardActionArea, Skeleton, Typography } from "@mui/material";

export type SummaryCardProps = {
  title: string;
  value: string;
  subtitle: string;
  icon?: ReactNode;
  iconColor?: string;
  isLoading?: boolean;
  onClick?: () => void;
  selected?: boolean;
};

export function SummaryCard({
  title,
  value,
  subtitle,
  icon,
  iconColor,
  isLoading,
  onClick,
  selected
}: SummaryCardProps) {
  const content = (
    <>
      <Box sx={{ p: 3 }}>
        <Typography variant="subtitle2" color="text.secondary">
          {title}
        </Typography>
        {isLoading ? (
          <Skeleton variant="text" height={32} width="60%" sx={{ mt: 0.5 }} />
        ) : (
          <Typography variant="h5" sx={{ mt: 0.5 }}>
            {value}
          </Typography>
        )}
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          {subtitle}
        </Typography>
      </Box>

      {icon && (
        <Box
          sx={{
            position: "absolute",
            top: 12,
            right: 12,
          }}
        >
          <Avatar
            sx={{
              width: 40,
              height: 40,
              bgcolor: iconColor ?? "primary.main",
            }}
          >
            {icon}
          </Avatar>
        </Box>
      )}
    </>
  );
  return (
    <Card
      sx={{
        position: "relative",
        borderRadius: 3,
        height: "100%",
        minHeight: 120,
        width: "100%",
        border: selected ? "1px solid" : undefined,
        borderColor: selected ? "primary.main" : undefined,
        boxShadow: selected ? 3 : undefined,
      }}
    >
      {onClick ? (
        <CardActionArea onClick={onClick} sx={{ height: "100%" }}>
          {content}
        </CardActionArea>
      ) : (
        content
      )}
    </Card>
  );
}
