import type { Config } from '@react-router/dev/config';

export default {
  appDirectory: 'src',
  buildDirectory: process.env.PORTFOLIO_BUILD_DIR ?? 'build',
  ssr: false,
  prerender: ['/', '/en', '/zh-Hans', '/zh-Hant'],
} satisfies Config;
