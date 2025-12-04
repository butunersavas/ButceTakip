import { Box, Typography } from "@mui/material";

interface PageHeaderProps {
  title: string;
  subtitle?: string;
}

const PageHeader = ({ title, subtitle }: PageHeaderProps) => (
  <Box sx={{ mb: 2 }}>
    <Typography variant="h5">{title}</Typography>
    {subtitle && (
      <Typography variant="body2" color="text.secondary">
        {subtitle}
      </Typography>
    )}
  </Box>
);

export default PageHeader;
