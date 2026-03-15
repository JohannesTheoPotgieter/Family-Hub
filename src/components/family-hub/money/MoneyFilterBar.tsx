type Option = { key: string; label: string };

type Props = { options: Option[]; value: string; onChange: (next: string) => void };

export const MoneyFilterBar = ({ options, value, onChange }: Props) => (
  <div className="money-filter-row">
    {options.map((option) => (
      <button key={option.key} className={`filter-pill ${value === option.key ? 'is-active' : ''}`} onClick={() => onChange(option.key)}>
        {option.label}
      </button>
    ))}
  </div>
);
