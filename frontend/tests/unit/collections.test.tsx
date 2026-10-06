import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ExpandableCollection } from '@/shared/ui/ExpandableCollection';
import { tagPreviewCount } from '@/shared/lib/tag-layout';
import { hasProjectDetail, projectGroups } from '@/features/projects';
import { projectFixture } from '../fixtures/portfolio';

describe('shared collection policies', () => {
  it('groups consecutive months without sorting or merging separated groups', () => {
    const items = ['2024-02', '2024-02', '2023-01', '2024-02'].map((startMonth, id) => ({
      ...projectFixture,
      id: id + 1,
      startMonth,
      endMonth: '2024-03',
    }));
    expect(projectGroups(items).map((group) => group.members.map((item) => item.id))).toEqual([
      [1, 2],
      [3],
      [4],
    ]);
    expect(hasProjectDetail({ ...projectFixture, detail: null })).toBe(false);
    expect(
      hasProjectDetail({
        ...projectFixture,
        detail: {
          workflowDescription: ' ',
          flow: [],
          technicalDescription: null,
          contribution: null,
          outcome: null,
        },
      }),
    ).toBeFalsy();
  });
  it('reserves the count button within the ordered 75% preview', () => {
    expect(tagPreviewCount([50, 50, 50], 3, 300, 6, () => 30)).toBe(3);
    expect(tagPreviewCount([50, 50, 50], 8, 200, 6, () => 30)).toBe(2);
    expect(tagPreviewCount([300], 1, 100, 6, () => 30)).toBe(0);
  });
  it('loads only on first expansion and restores focus on cached collapse', () => {
    const load = vi.fn();
    const copy = {
      more: 'More records',
      less: 'Fewer records',
      load: 'Next page',
      loading: 'Loading',
    };
    const renderItems = (items: number[]) => items.map((item) => <p key={item}>Record {item}</p>);
    const view = render(
      <ExpandableCollection
        items={[1, 2, 3, 4, 5, 6]}
        total={8}
        hasMore
        busy={false}
        copy={copy}
        onLoadMore={load}
        renderItems={renderItems}
      />,
    );
    const trigger = screen.getByRole('button', { name: /More records/ });
    fireEvent.click(trigger);
    expect(load).toHaveBeenCalledTimes(1);
    view.rerender(
      <ExpandableCollection
        items={[1, 2, 3, 4, 5, 6, 7, 8]}
        total={8}
        hasMore={false}
        busy={false}
        copy={copy}
        onLoadMore={load}
        renderItems={renderItems}
      />,
    );
    expect(screen.getByText('Record 8')).toBeVisible();
    trigger.scrollIntoView = vi.fn();
    fireEvent.click(screen.getByRole('button', { name: 'Fewer records' }));
    expect(screen.queryByText('Record 8')).toBeNull();
    expect(trigger).toHaveFocus();
    fireEvent.click(trigger);
    expect(screen.getByText('Record 8')).toBeVisible();
    expect(load).toHaveBeenCalledTimes(1);
  });
});
