import type { NextConfig } from "next";
import createNextIntlPlugin from 'next-intl/plugin';

// Use 'never' locale prefix (cookie/header-based, no URL prefixes)
const withNextIntl = createNextIntlPlugin({
  requestPath: './src/i18n/request.ts',
  localePrefix: 'never',
});

const nextConfig: NextConfig = {
  reactCompiler: true,
};

export default withNextIntl(nextConfig);
