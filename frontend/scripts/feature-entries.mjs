/** Lint and README verification share the same explicitly supported cross-feature entry files. */
export function featureEntryFiles(feature) {
  return feature === 'auth'
    ? ['index.ts', 'session.ts', 'permissions.ts', 'actions.ts']
    : ['index.ts'];
}
