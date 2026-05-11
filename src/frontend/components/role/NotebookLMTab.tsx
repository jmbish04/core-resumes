/**
 * @fileoverview Unified NotebookLM Tab — merges the legacy Podcast tab and the
 * NotebookLM blobs view into a single cohesive interface within RoleViewport.
 *
 * Sections:
 *   1. Header with NotebookLMCommandMenu trigger
 *   2. Podcast player + transcript (from RolePodcast)
 *   3. Sources & Artifacts management (from NotebookLMBlobs)
 */

import { NotebookLMBlobs } from "./NotebookLMBlobs";
import { NotebookLMCommandMenu } from "./NotebookLMCommandMenu";
import { RolePodcast } from "./RolePodcast";

export function NotebookLMTab({ roleId }: { roleId: string }) {
  return (
    <div className="grid gap-6">
      {/* Header with action trigger */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">NotebookLM</h3>
          <p className="text-sm text-muted-foreground">
            Generate artifacts, manage sources, and listen to podcasts.
          </p>
        </div>
        <NotebookLMCommandMenu roleId={roleId} />
      </div>

      {/* Podcast section */}
      <section>
        <div className="mb-3 border-b border-border/60 pb-2">
          <h4 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
            Podcast
          </h4>
        </div>
        <RolePodcast roleId={roleId} />
      </section>

      {/* Sources & Artifacts section */}
      <section>
        <div className="mb-3 border-b border-border/60 pb-2">
          <h4 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
            Sources &amp; Artifacts
          </h4>
        </div>
        <NotebookLMBlobs roleId={roleId} />
      </section>
    </div>
  );
}
