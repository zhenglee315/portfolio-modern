import { useTranslation } from 'react-i18next';
import { useProfileEditor } from '../model/editor-context';
import { EditorPagination } from './EditorPagination';

/** API page size and visual slicing share one context; navigating never submits the draft. */
export function ProjectPagination() {
  const { t } = useTranslation();
  const editor = useProfileEditor();
  return (
    <EditorPagination
      page={editor.projectPage}
      size={editor.projectSize}
      total={editor.draft.projectOrder.length}
      range="projectRange"
      label={t('profileEditor.projectPagination')}
      disabled={editor.projectLoading || editor.busy}
      onPageChange={editor.openProjectPage}
      onSizeChange={editor.openProjectSize}
    />
  );
}
