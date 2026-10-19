import { useTranslation } from 'react-i18next';
import { useProfileEditor } from '../model/editor-context';
import { InlineNameInput } from './InlineNameInput';

/** Edit the shared draft directly; only the page's Save changes action persists it. */
export function SkillRenameInput({
  skillId,
  value,
  onChange,
}: {
  skillId: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const { t } = useTranslation();
  const { draft } = useProfileEditor();
  const name = value.trim().toLocaleLowerCase();
  const error = !name
    ? t('profileEditor.errorRequired')
    : Object.values(draft.skills).some(
          (item) => item.id !== skillId && item.label.trim().toLocaleLowerCase() === name,
        )
      ? t('profileEditor.errorDuplicate')
      : undefined;
  return (
    <InlineNameInput
      label={t('profileEditor.fields.skillName')}
      field={`skills.${skillId}`}
      value={value}
      onChange={onChange}
      error={error}
    />
  );
}
