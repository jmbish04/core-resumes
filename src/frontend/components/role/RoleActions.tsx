import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";

export function RoleActions() {
  return (
    <Button
      type="button"
      onClick={() => window.dispatchEvent(new CustomEvent("career:intake-open"))}
    >
      <Plus className="size-4" />
      New Role
    </Button>
  );
}
