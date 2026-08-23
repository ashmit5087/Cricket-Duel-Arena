export function StatValue({
  value,
  loading = false,
  className = "",
}: {
  value: string | number;
  loading?: boolean;
  className?: string;
}) {
  if (loading) {
    return (
      <span
        className={`inline-block rounded bg-white/5 animate-pulse ${className}`}
        style={{ minWidth: "4ch", height: "1em" }}
      />
    );
  }
  return <span className={className}>{value}</span>;
}
