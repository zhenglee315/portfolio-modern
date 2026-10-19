import { describe, expect, it, vi } from 'vitest';
import { createI18n, supportedLocales } from '@/i18n/config';
import type { AuthUser } from '@/features/auth/session';
import {
  profileSections,
  profileSectionParams,
  workspaceNavigation,
} from '@/features/account-menu/model/workspace';
import { profileMessages } from '@/i18n/profile-copy';

const member: AuthUser = {
  id: 91,
  user: 'operator',
  email: 'owner@example.com',
  role: 'member',
  is_create: true,
  is_read: true,
  is_update: true,
  is_delete: true,
  is_monitor: false,
  is_manage_sites: false,
  is_manage_roles: false,
  is_manage_users: false,
};

describe('shared private workspace navigation', () => {
  it('gives ordinary owners all four Profile sections without administrative destinations', () => {
    const items = workspaceNavigation({
      account: member,
      locale: 'en',
      t: createI18n('en').t,
      onClose: vi.fn(),
    });
    expect(items.map((item) => item.id)).toEqual(profileSections.map((item) => item.id));
    expect(items.map((item) => item.group)).toEqual(Array(4).fill('Profile'));
    expect(items[2]?.to).toBe('/en/profile?section=projects');
  });

  it('filters flags independently and keeps monitoring filters out of table and Profile links', () => {
    const items = workspaceNavigation({
      account: { ...member, is_monitor: true, is_manage_roles: true },
      locale: 'en',
      t: createI18n('en').t,
      onClose: vi.fn(),
      monitorSearch: '?monitorView=requests&service=api&start=2026-10-09',
    });
    expect(items.map((item) => item.id)).toEqual([
      'overview',
      'experience',
      'projects',
      'skills',
      'monitor-overview',
      'monitor-requests',
      'monitor-workers',
      'roles',
    ]);
    expect(items.find((item) => item.id === 'roles')?.to).toBe('/en/management/roles');
    expect(items.find((item) => item.id === 'monitor-workers')?.to).toBe(
      '/en/management/monitoring?monitorView=workers&service=api&start=2026-10-09',
    );
    expect(items[0]?.to).toBe('/en/profile?section=overview');
  });

  it('uses local section actions without replacing the working copy or losing paging/language', () => {
    const params = new URLSearchParams(
      'section=experience&edit=experience%3A3&contentLocale=zh-Hant&projectPage=2&projectSize=10',
    );
    const onSelect = vi.fn();
    const onClose = vi.fn();
    const items = workspaceNavigation({
      account: member,
      locale: 'en',
      t: createI18n('en').t,
      onClose,
      profile: { params, onSelect },
    });
    const projects = items.find((item) => item.id === 'projects')!;
    expect(projects.to).toBeUndefined();
    const query = new URL(projects.href!, 'https://example.com').searchParams;
    expect(Object.fromEntries(query)).toEqual({
      section: 'projects',
      contentLocale: 'zh-Hant',
      projectPage: '2',
      projectSize: '10',
    });
    projects.onSelect?.();
    expect(onClose).toHaveBeenCalledOnce();
    expect(onSelect).toHaveBeenCalledWith('projects');
    expect(params.get('edit')).toBe('experience:3');
    expect(profileSectionParams(params, 'projects', 'project:7').get('edit')).toBe('project:7');
  });

  it('provides consistent section names in the small base dictionaries without loading editor forms', () => {
    for (const locale of supportedLocales) {
      const i18n = createI18n(locale);
      for (const section of profileSections)
        expect(i18n.t(`management.profile.${section.id}`)).toBe(
          profileMessages[locale][section.id],
        );
      expect(i18n.exists('profileEditor.fields.city')).toBe(false);
    }
  });
});
