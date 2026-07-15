// Remounts on every route navigation → a soft iOS-style page entrance.
// Pure CSS (see .page-enter in globals.css); disabled by prefers-reduced-motion.
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="page-enter">{children}</div>;
}
