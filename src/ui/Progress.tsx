export const Progress = ({ value, label }: { value: number; label?: string }) => (
  <div className="wizard-progress-track" role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100} aria-label={label ?? 'Progress'}>
    <div className="wizard-progress-fill" style={{ width: `${value}%` }} />
  </div>
);
