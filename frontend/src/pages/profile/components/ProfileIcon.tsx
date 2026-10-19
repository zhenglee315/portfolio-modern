import arrowDown from 'bootstrap-icons/icons/arrow-down.svg?raw';
import grip from 'bootstrap-icons/icons/grip-vertical.svg?raw';
import pin from 'bootstrap-icons/icons/geo-alt.svg?raw';
import trash from 'bootstrap-icons/icons/trash.svg?raw';
import { Icon as SharedIcon, type IconName as SharedIconName } from '@/shared/ui/Icon';

const editorIcons = { arrowDown, grip, pin, trash };
export type IconName = SharedIconName | keyof typeof editorIcons;

/** Editor-only Bootstrap SVGs stay in this lazy route; ordinary symbols reuse the shared renderer. */
export function Icon({
  name,
  label,
  className = '',
}: {
  name: IconName;
  label?: string;
  className?: string;
}) {
  if (!Object.hasOwn(editorIcons, name))
    return <SharedIcon name={name as SharedIconName} label={label} className={className} />;
  return (
    <span
      className={`icon ${className}`}
      role={label ? 'img' : undefined}
      aria-label={label}
      title={label}
      aria-hidden={label ? undefined : true}
      dangerouslySetInnerHTML={{ __html: editorIcons[name as keyof typeof editorIcons] }}
    />
  );
}
