/**
 * A template (unlike a layout) re-mounts on every navigation, so each route arrives with the
 * same short rise. This replaces the per-section entrance staggers that used to replay on
 * every tab switch.
 */
export default function Template({ children }: { children: React.ReactNode }) {
  // Telegram Desktop can open the app wide; pages keep a phone's measure.
  return <div className="page-in mx-auto max-w-xl">{children}</div>;
}
