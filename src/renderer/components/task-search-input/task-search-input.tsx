export interface TaskSearchInputProps {
  value: string;
  onChange: (value: string) => void;
}

export function TaskSearchInput({ value, onChange }: TaskSearchInputProps): JSX.Element {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor="task-search-input" className="sr-only">
        Search tasks
      </label>
      <input
        id="task-search-input"
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Search tasks…"
        className="rounded-md border border-graphite-600 bg-graphite-900 px-3 py-2 text-sm text-graphite-100 placeholder:text-graphite-400 focus:border-clay-500 focus:outline-none"
      />
    </div>
  );
}
