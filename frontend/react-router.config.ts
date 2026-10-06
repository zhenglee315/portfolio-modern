import type { Config } from '@react-router/dev/config';

export default {
  appDirectory: 'src',
  ssr: false,
  prerender: ['/', '/en', '/zh-Hans', '/zh-Hant'],
} satisfies Config;
