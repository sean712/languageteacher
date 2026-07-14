import { LANGUAGES } from '../lib/languages';

// Searchable language picker: a datalist gives type-ahead over the common
// list while still accepting any language the creator types (low-resource
// languages are a core audience — never wall them off behind a fixed list).
export default function LanguageInput({
  value,
  onChange,
  listId = 'lingua-languages',
  placeholder = 'Start typing — e.g. Welsh',
  className = '',
}: {
  value: string;
  onChange: (v: string) => void;
  listId?: string;
  placeholder?: string;
  className?: string;
}) {
  return (
    <>
      <input
        list={listId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoCapitalize="words"
        autoCorrect="off"
        className={
          className ||
          'mt-1.5 w-full rounded-xl border border-paper-300 bg-paper-50 px-4 py-3 text-[0.95rem] focus:outline-none focus:border-ink-400'
        }
      />
      <datalist id={listId}>
        {LANGUAGES.map((l) => (
          <option key={l} value={l} />
        ))}
      </datalist>
    </>
  );
}
