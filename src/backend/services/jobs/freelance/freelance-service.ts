/**
 * @fileoverview FreelanceService — business logic layer for the freelance pipeline.
 *
 * Handles opportunity upsert (content-hash dedup), triage CRUD, proposal lifecycle,
 * scan run tracking, profile config, and promote-to-role operations.
 */

import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";

import * as schema from "@/backend/db/schema";
import {
  freelanceOpportunities,
  type FreelanceOpportunity,
  type NewFreelanceOpportunity,
} from "@/backend/db/schema";
import {
  freelanceProfile,
  type FreelanceProfileEntry,
} from "@/backend/db/schema";
import {
  freelanceProposals,
  type FreelanceProposal,
  type NewFreelanceProposal,
} from "@/backend/db/schema";
import {
  freelanceScanRuns,
  type FreelanceScanRun,
  type NewFreelanceScanRun,
} from "@/backend/db/schema";
import {
  freelanceTriage,
  type FreelanceTriage,
  type NewFreelanceTriage,
} from "@/backend/db/schema";
import { roles } from "@/backend/db/schema";

import { generateContentHash } from "./rapidapi-client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OpportunityFilters {
  platform?: "upwork" | "freelancer";
  isActive?: boolean;
  triageDecision?: "bid" | "skip" | "pending" | "manual_review";
  budgetType?: "fixed" | "hourly";
  experienceLevel?: string;
  limit?: number;
  offset?: number;
}

export interface ProposalFilters {
  status?: string;
  opportunityId?: number;
  limit?: number;
  offset?: number;
}

export interface UpsertResult {
  inserted: number;
  updated: number;
  unchanged: number;
}

export interface FreelanceStats {
  totalOpportunities: number;
  activeOpportunities: number;
  triageBid: number;
  triageSkip: number;
  triagePending: number;
  proposalsDraft: number;
  proposalsSubmitted: number;
  proposalsAccepted: number;
  proposalsRejected: number;
  byPlatform: Record<string, number>;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class FreelanceService {
  private db;

  constructor(private env: Env) {
    this.db = drizzle(env.DB, { schema });
  }

  // =========================================================================
  // Opportunities
  // =========================================================================

  /**
   * Upsert opportunities from API responses.
   * Uses content-hash + platformJobId for dedup. Updates lastSeenAt on conflict.
   */
  async upsertOpportunities(
    opps: Omit<NewFreelanceOpportunity, "id">[],
  ): Promise<UpsertResult> {
    let inserted = 0;
    let updated = 0;
    let unchanged = 0;

    for (const opp of opps) {
      // Generate content hash if not set
      const contentHash =
        opp.contentHash ?? (await generateContentHash(opp.title, opp.description));

      const existing = await this.db
        .select({ id: freelanceOpportunities.id, contentHash: freelanceOpportunities.contentHash })
        .from(freelanceOpportunities)
        .where(eq(freelanceOpportunities.platformJobId, opp.platformJobId))
        .get();

      if (existing) {
        if (existing.contentHash !== contentHash) {
          // Content changed — update
          await this.db
            .update(freelanceOpportunities)
            .set({
              ...opp,
              contentHash,
              lastSeenAt: new Date(),
              updatedAt: new Date(),
            })
            .where(eq(freelanceOpportunities.id, existing.id));
          updated++;
        } else {
          // Just bump lastSeenAt
          await this.db
            .update(freelanceOpportunities)
            .set({ lastSeenAt: new Date() })
            .where(eq(freelanceOpportunities.id, existing.id));
          unchanged++;
        }
      } else {
        // New listing
        await this.db.insert(freelanceOpportunities).values({
          ...opp,
          contentHash,
        });
        inserted++;
      }
    }

    return { inserted, updated, unchanged };
  }

  /**
   * Query opportunities with filters.
   */
  async getOpportunities(filters: OpportunityFilters = {}): Promise<FreelanceOpportunity[]> {
    const conditions = [];

    if (filters.platform) {
      conditions.push(eq(freelanceOpportunities.platform, filters.platform));
    }
    if (filters.isActive !== undefined) {
      conditions.push(eq(freelanceOpportunities.isActive, filters.isActive));
    }
    if (filters.budgetType) {
      conditions.push(eq(freelanceOpportunities.budgetType, filters.budgetType));
    }

    const limit = filters.limit ?? 50;
    const offset = filters.offset ?? 0;

    const query = this.db
      .select()
      .from(freelanceOpportunities)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(freelanceOpportunities.publishedAt))
      .limit(limit)
      .offset(offset);

    return query.all();
  }

  /**
   * Get a single opportunity by ID.
   */
  async getOpportunity(id: number): Promise<FreelanceOpportunity | null> {
    const result = await this.db
      .select()
      .from(freelanceOpportunities)
      .where(eq(freelanceOpportunities.id, id))
      .get();
    return result ?? null;
  }

  /**
   * Get opportunities that haven't been triaged yet.
   */
  async getUntriagedOpportunities(limit = 50): Promise<FreelanceOpportunity[]> {
    // Left join to find opportunities without triage rows
    const results = await this.db
      .select({ opportunity: freelanceOpportunities })
      .from(freelanceOpportunities)
      .leftJoin(freelanceTriage, eq(freelanceOpportunities.id, freelanceTriage.opportunityId))
      .where(
        and(
          eq(freelanceOpportunities.isActive, true),
          sql`${freelanceTriage.id} IS NULL`,
        ),
      )
      .orderBy(desc(freelanceOpportunities.publishedAt))
      .limit(limit)
      .all();

    return results.map((r) => r.opportunity);
  }

  /**
   * Promote a freelance opportunity to a full role for deeper tracking.
   */
  async promoteToRole(opportunityId: number): Promise<typeof roles.$inferSelect> {
    const opp = await this.getOpportunity(opportunityId);
    if (!opp) throw new Error(`Opportunity ${opportunityId} not found`);

    const roleId = crypto.randomUUID();
    const source = opp.platform === "upwork" ? "freelance_upwork" : "freelance_freelancer";

    const [role] = await this.db
      .insert(roles)
      .values({
        id: roleId,
        companyName: `${opp.platform === "upwork" ? "Upwork" : "Freelancer"} Client`,
        jobTitle: opp.title,
        jobUrl: opp.url,
        salaryMin: opp.budgetMin ? Math.round(opp.budgetMin) : null,
        salaryMax: opp.budgetMax ? Math.round(opp.budgetMax) : null,
        salaryCurrency: opp.budgetCurrency ?? "USD",
        source: source as any,
        metadata: {
          freelance_platform: opp.platform,
          freelance_opportunity_id: opp.id,
          freelance_budget_type: opp.budgetType,
          freelance_client_score: opp.clientScore,
          freelance_client_location: opp.clientLocation,
          freelance_proposals_count: opp.proposalsCount,
        },
      })
      .returning();

    return role;
  }

  // =========================================================================
  // Triage
  // =========================================================================

  /**
   * Save a triage decision for an opportunity.
   */
  async saveTriage(triage: Omit<NewFreelanceTriage, "id">): Promise<void> {
    await this.db.insert(freelanceTriage).values(triage);
  }

  /**
   * Get the triage result for an opportunity.
   */
  async getTriageForOpportunity(oppId: number): Promise<FreelanceTriage | null> {
    const result = await this.db
      .select()
      .from(freelanceTriage)
      .where(eq(freelanceTriage.opportunityId, oppId))
      .orderBy(desc(freelanceTriage.decidedAt))
      .get();
    return result ?? null;
  }

  /**
   * Override an existing triage decision.
   */
  async overrideTriage(
    oppId: number,
    decision: "bid" | "skip" | "pending" | "manual_review",
    rationale: string,
  ): Promise<void> {
    // Insert a new triage row (keeps history)
    await this.db.insert(freelanceTriage).values({
      opportunityId: oppId,
      decision,
      confidence: 1.0, // Manual override = full confidence
      rationale: `[Manual Override] ${rationale}`,
      modelUsed: "human",
      decidedAt: new Date(),
    });
  }

  // =========================================================================
  // Proposals
  // =========================================================================

  /**
   * Create a new proposal draft.
   */
  async createProposal(data: Omit<NewFreelanceProposal, "id">): Promise<FreelanceProposal> {
    const id = crypto.randomUUID();
    const [proposal] = await this.db
      .insert(freelanceProposals)
      .values({ ...data, id })
      .returning();
    return proposal;
  }

  /**
   * Update an existing proposal.
   */
  async updateProposal(
    id: string,
    updates: Partial<FreelanceProposal>,
  ): Promise<FreelanceProposal> {
    const [proposal] = await this.db
      .update(freelanceProposals)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(freelanceProposals.id, id))
      .returning();
    return proposal;
  }

  /**
   * Get proposals with filters.
   */
  async getProposals(filters: ProposalFilters = {}): Promise<FreelanceProposal[]> {
    const conditions = [];

    if (filters.status) {
      conditions.push(eq(freelanceProposals.status, filters.status as any));
    }
    if (filters.opportunityId) {
      conditions.push(eq(freelanceProposals.opportunityId, filters.opportunityId));
    }

    return this.db
      .select()
      .from(freelanceProposals)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(freelanceProposals.createdAt))
      .limit(filters.limit ?? 50)
      .offset(filters.offset ?? 0)
      .all();
  }

  /**
   * Get a single proposal.
   */
  async getProposal(id: string): Promise<FreelanceProposal | null> {
    const result = await this.db
      .select()
      .from(freelanceProposals)
      .where(eq(freelanceProposals.id, id))
      .get();
    return result ?? null;
  }

  // =========================================================================
  // Scan Runs
  // =========================================================================

  /**
   * Record a scan execution.
   */
  async recordScanRun(run: Omit<NewFreelanceScanRun, "id">): Promise<void> {
    const id = crypto.randomUUID();
    await this.db.insert(freelanceScanRuns).values({ ...run, id });
  }

  /**
   * Get scan run history.
   */
  async getScanHistory(limit = 20): Promise<FreelanceScanRun[]> {
    return this.db
      .select()
      .from(freelanceScanRuns)
      .orderBy(desc(freelanceScanRuns.createdAt))
      .limit(limit)
      .all();
  }

  // =========================================================================
  // Profile Config
  // =========================================================================

  /**
   * Get the full freelance profile as a key-value map.
   */
  async getProfile(): Promise<Record<string, unknown>> {
    const entries = await this.db.select().from(freelanceProfile).all();
    const profile: Record<string, unknown> = {};
    for (const entry of entries) {
      profile[entry.key] = entry.value;
    }
    return profile;
  }

  /**
   * Upsert a profile config key.
   */
  async updateProfile(key: string, value: unknown): Promise<void> {
    await this.db
      .insert(freelanceProfile)
      .values({ key, value: value as any, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: freelanceProfile.key,
        set: { value: value as any, updatedAt: new Date() },
      });
  }

  // =========================================================================
  // Dashboard Stats
  // =========================================================================

  /**
   * Aggregate stats for the freelance dashboard.
   */
  async getStats(): Promise<FreelanceStats> {
    // Total + active opportunities
    const [oppStats] = await this.db
      .select({
        total: sql<number>`COUNT(*)`,
        active: sql<number>`SUM(CASE WHEN ${freelanceOpportunities.isActive} = 1 THEN 1 ELSE 0 END)`,
      })
      .from(freelanceOpportunities)
      .all();

    // Triage breakdown
    const triageStats = await this.db
      .select({
        decision: freelanceTriage.decision,
        count: sql<number>`COUNT(*)`,
      })
      .from(freelanceTriage)
      .groupBy(freelanceTriage.decision)
      .all();

    const triageMap = Object.fromEntries(triageStats.map((t) => [t.decision, t.count]));

    // Proposal breakdown
    const proposalStats = await this.db
      .select({
        status: freelanceProposals.status,
        count: sql<number>`COUNT(*)`,
      })
      .from(freelanceProposals)
      .groupBy(freelanceProposals.status)
      .all();

    const proposalMap = Object.fromEntries(proposalStats.map((p) => [p.status, p.count]));

    // By platform
    const platformStats = await this.db
      .select({
        platform: freelanceOpportunities.platform,
        count: sql<number>`COUNT(*)`,
      })
      .from(freelanceOpportunities)
      .where(eq(freelanceOpportunities.isActive, true))
      .groupBy(freelanceOpportunities.platform)
      .all();

    const byPlatform = Object.fromEntries(platformStats.map((p) => [p.platform, p.count]));

    return {
      totalOpportunities: oppStats.total ?? 0,
      activeOpportunities: oppStats.active ?? 0,
      triageBid: triageMap.bid ?? 0,
      triageSkip: triageMap.skip ?? 0,
      triagePending: triageMap.pending ?? 0,
      proposalsDraft: proposalMap.draft ?? 0,
      proposalsSubmitted: proposalMap.submitted ?? 0,
      proposalsAccepted: proposalMap.accepted ?? 0,
      proposalsRejected: proposalMap.rejected ?? 0,
      byPlatform,
    };
  }
}
