const LOGO_ROWS = [
  ' ████   █    █   █████',
  '█    █  ██   █  █     ',
  '█       █ █  █  █     ',
  '█       █  █ █   ████ ',
  '█       █   ██       █',
  '█    █  █    █       █',
  ' ████   █    █  █████ ',
] as const;

export function AsciiLogo() {
  return (
    <pre className="ascii-logo" aria-label="CNS">
      {LOGO_ROWS.map((row, i) => (
        <span
          key={i}
          className="ascii-row"
          style={{ animationDelay: `${i * 70}ms` }}
        >
          {row}
        </span>
      ))}
    </pre>
  );
}
