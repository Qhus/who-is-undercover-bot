import type { NextConfig } from 'next';

const onGitHubPages = process.env.PAGES_BUILD === 'true';

const nextConfig: NextConfig = {
  output: 'export',
  trailingSlash: true,
  images: { unoptimized: true },
  basePath: onGitHubPages ? '/who-is-undercover-bot' : '',
  assetPrefix: onGitHubPages ? '/who-is-undercover-bot/' : '',
};

export default nextConfig;
