import { type RouteConfig, route } from '@react-router/dev/routes';

export default [route(':locale?', 'routes/home.tsx')] satisfies RouteConfig;
