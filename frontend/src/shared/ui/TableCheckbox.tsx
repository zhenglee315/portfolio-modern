import { type InputHTMLAttributes } from 'react';
/** Keep native checked/mixed state consistent across row and column selectors. */
export function TableCheckbox({
  mixed = false,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { mixed?: boolean }) {
  return (
    <input
      {...props}
      type="checkbox"
      className="form-check-input"
      ref={(input) => {
        if (input) input.indeterminate = mixed;
      }}
    />
  );
}
