import { createBrowserConfig } from './playwright.config';

// Exercise the real dev command independently of the production build/preview suite.
export default createBrowserConfig('development');
