import * as icons from "lucide-react";
import { HelpCircle, type LucideProps } from "lucide-react";

/** Renders a lucide icon by its name string (used by config-driven nav/templates). */
export function Icon({ name, ...props }: { name: string } & LucideProps) {
  const Cmp = (icons as unknown as Record<string, React.ComponentType<LucideProps>>)[name] ?? HelpCircle;
  return <Cmp {...props} />;
}
