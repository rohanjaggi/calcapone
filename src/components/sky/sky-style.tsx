import { minuteInTz, skyAt, skyVars } from "@/lib/sky";
import { SkyTicker } from "@/components/sky/sky-ticker";

/**
 * Paints the sky for this minute of the user's day into the page's CSS variables.
 *
 * The first paint is settled on the server, in the user's saved timezone, so the page never
 * flashes a default sky before the client wakes up; SkyTicker then keeps it moving.
 */
export function SkyStyle({ timezone }: { timezone: string }) {
  const vars = skyVars(skyAt(minuteInTz(timezone)));
  const css = `:root{${Object.entries(vars)
    .map(([name, value]) => `${name}:${value}`)
    .join(";")}}`;
  return (
    <>
      <style>{css}</style>
      <SkyTicker timezone={timezone} />
    </>
  );
}
