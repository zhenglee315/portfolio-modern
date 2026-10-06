import type { Project } from '../schemas/projects';

/** Group adjacent equal months without reordering authoritative backend records. */
export function projectGroups(records: Project[]) {
  const groups: { start: string; members: Project[] }[] = [];
  for (const record of records) {
    if (groups.at(-1)?.start !== record.startMonth)
      groups.push({ start: record.startMonth, members: [] });
    groups.at(-1)?.members.push(record);
  }
  return groups;
}

/** Avoid opening a blank dialog for null or whitespace-only detail payloads. */
export function hasProjectDetail(project: Project) {
  return (
    !!project.detail &&
    (['workflowDescription', 'technicalDescription', 'contribution', 'outcome'].some((key) =>
      project.detail?.[key as keyof NonNullable<Project['detail']>]?.toString().trim(),
    ) ||
      !!project.detail.flow?.some((label) => label.trim()))
  );
}
