import { useState } from 'react';
import type { BranchOption } from '../../../shared/ipc-channels';

export interface BranchPickerProps {
  id: string;
  label: string;
  branches: BranchOption[];
  value: string;
  onChange: (value: string) => void;
}

const fieldInputClasses =
  'rounded-md border border-graphite-600 bg-graphite-900 px-3 py-2 text-graphite-100 focus:border-clay-500 focus:outline-none';
const fieldLabelClasses = 'text-sm font-medium text-graphite-400';

export function BranchPicker({ id, label, branches, value, onChange }: BranchPickerProps): JSX.Element {
  const [query, setQuery] = useState(value);
  const [isOpen, setIsOpen] = useState(false);
  const listboxId = `${id}-listbox`;

  const filtered = branches.filter((option) => option.label.toLowerCase().includes(query.toLowerCase()));

  function selectBranch(option: BranchOption): void {
    onChange(option.value);
    setQuery(option.label);
    setIsOpen(false);
  }

  return (
    <div className="relative flex flex-col gap-1">
      <label htmlFor={id} className={fieldLabelClasses}>
        {label}
      </label>
      <input
        id={id}
        role="combobox"
        aria-expanded={isOpen}
        aria-controls={listboxId}
        aria-autocomplete="list"
        autoComplete="off"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setIsOpen(true);
          onChange('');
        }}
        onFocus={() => setIsOpen(true)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            setIsOpen(false);
          }
        }}
        className={fieldInputClasses}
      />
      {isOpen && (
        <ul
          id={listboxId}
          role="listbox"
          className="absolute top-full z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-md border border-graphite-600 bg-graphite-900 shadow-lg"
        >
          {filtered.length === 0 && <li className="px-3 py-2 text-sm text-graphite-400">No matching branches</li>}
          {filtered.map((option) => (
            <li
              key={option.value}
              role="option"
              aria-selected={option.value === value}
              onClick={() => selectBranch(option)}
              className="cursor-pointer px-3 py-2 text-left text-sm text-graphite-100 hover:bg-graphite-700"
            >
              {option.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
