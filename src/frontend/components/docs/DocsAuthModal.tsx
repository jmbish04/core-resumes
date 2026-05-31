import * as React from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Lock } from "lucide-react";

export function DocsAuthModal() {
  const [key, setKey] = React.useState("");
  const [error, setError] = React.useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!key.trim()) {
      setError("Worker API Key is required.");
      return;
    }

    // Set cookie valid for 1 year
    const maxAge = 60 * 60 * 24 * 365;
    document.cookie = `worker_api_key=${encodeURIComponent(key)}; path=/; max-age=${maxAge}; samesite=strict`;

    // Reload the page to trigger Astro SSR auth check
    window.location.reload();
  };

  return (
    <Dialog open={true} onOpenChange={() => {}}>
      <DialogContent className="sm:max-w-md" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Lock className="h-5 w-5 text-primary" />
            Authentication Required
          </DialogTitle>
          <DialogDescription>
            This documentation is private. Please enter your Worker API Key to continue.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="worker_api_key" className="sr-only">
              Worker API Key
            </Label>
            <Input
              id="worker_api_key"
              type="password"
              placeholder="Enter Worker API Key"
              value={key}
              onChange={(e) => {
                setKey(e.target.value);
                setError("");
              }}
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              data-1p-ignore
              data-lpignore="true"
              className="font-mono"
              autoFocus
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <Button type="submit" className="w-full">
              Authenticate
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
