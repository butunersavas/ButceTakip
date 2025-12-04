import { Box, Typography } from "@mui/material";

interface PageHeaderProps {
  title: string;
}

export function PageHeader({ title }: PageHeaderProps) {
  return (
    <Box sx={{ mb: 2 }}>
      <Typography variant="h5">
        {title}
      </Typography>
    </Box>
  );
}
