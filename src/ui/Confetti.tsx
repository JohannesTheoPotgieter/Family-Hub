export const Confetti = ({ active }: { active: boolean }) => {
  if (!active) return null;
  return (
    <div className="confetti" aria-hidden="true">
      {Array.from({ length: 14 }, (_, i) => (
        <span key={i} style={{ ['--i' as any]: i }} />
      ))}
    </div>
  );
};
