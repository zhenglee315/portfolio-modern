import { afterEach, describe, expect, it } from 'vitest';
import { createQueryClient } from '@/app/query-client';
import { forgetAuthSession, rememberAuthSession, type AuthUser } from '@/features/auth/session';

const clients: ReturnType<typeof createQueryClient>[] = [];
afterEach(() => clients.splice(0).forEach((client) => client.clear()));

describe('management query ownership', () => {
  it.each(['sign-in', 'sign-out'])(
    'discards private rows on %s while retaining public content',
    async (action) => {
      const client = createQueryClient();
      clients.push(client);
      const privateKey = ['management', 1, 'users'];
      const publicKey = ['portfolio', 'default', 'site'];
      client.setQueryDefaults(privateKey, { meta: { private: true } });
      client.setQueryData(privateKey, { items: [{ id: 1, email: 'previous-owner@example.com' }] });
      client.setQueryData(publicKey, { user: 'public-owner' });
      if (action === 'sign-out') await forgetAuthSession(client);
      else {
        const account: AuthUser = {
          id: 2,
          user: 'new-owner',
          email: 'new@example.com',
          role: 'editor',
          is_create: false,
          is_read: true,
          is_update: false,
          is_delete: false,
          is_monitor: true,
          is_manage_sites: true,
          is_manage_users: false,
          is_manage_roles: false,
        };
        await rememberAuthSession(client, account, new AbortController().signal);
      }
      expect(client.getQueryData(privateKey)).toBeUndefined();
      expect(client.getQueryData(publicKey)).toEqual({ user: 'public-owner' });
    },
  );
});
