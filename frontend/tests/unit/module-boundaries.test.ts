import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

const eslint = new ESLint();

/** Exercise the real import policy instead of duplicating the configuration in assertions. */
async function boundaryErrors(filePath: string, source: string) {
  const [result] = await eslint.lintText(source, { filePath });
  return result!.messages.filter((message) => message.ruleId === 'import-x/no-restricted-paths');
}

describe('frontend module ownership', () => {
  it('lets the account menu read auth public contracts while blocking internal schemas', async () => {
    const file = 'src/features/account-menu/model/menu.ts';
    expect(
      await boundaryErrors(
        file,
        "import type { AuthUser } from '@/features/auth/session'; export type Account = AuthUser;",
      ),
    ).toEqual([]);
    expect(
      await boundaryErrors(
        file,
        "import { canManage } from '@/features/auth/permissions'; export { canManage };",
      ),
    ).toEqual([]);
    expect(
      await boundaryErrors(
        file,
        "import type { AuthUser } from '@/features/auth/schemas/auth'; export type Account = AuthUser;",
      ),
    ).toHaveLength(1);
  });

  it('keeps shared code independent even for type-only feature imports', async () => {
    expect(
      await boundaryErrors(
        'src/shared/hooks/useHydrated.ts',
        "import type { AuthUser } from '@/features/auth/session'; export type Identity = AuthUser;",
      ),
    ).toHaveLength(1);
  });

  it('requires ordinary cross-feature composition to stay in pages', async () => {
    expect(
      await boundaryErrors(
        'src/features/projects/model/projects.ts',
        "import { useSkills } from '@/features/skills'; export { useSkills };",
      ),
    ).toHaveLength(1);
    expect(
      await boundaryErrors(
        'src/pages/portfolio/PortfolioPage.tsx',
        "import { useSkills } from '@/features/skills'; export { useSkills };",
      ),
    ).toEqual([]);
  });
});
