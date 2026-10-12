import { type RouteConfig, route } from '@react-router/dev/routes';

export default [
  route(':locale/access-denied', 'routes/access-denied.tsx'),
  route(':locale/management/:resource', 'routes/management.tsx'),
  route(':locale?', 'routes/home.tsx'),
  route(':locale/:user', 'routes/home.tsx', { id: 'portfolio-user' }),
] satisfies RouteConfig;
