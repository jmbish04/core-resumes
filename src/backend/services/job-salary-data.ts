/**
 * @fileoverview Job Salary Data service wrapping the RapidAPI "Job Salary Data"
 * API (by OpenWeb Ninja). Provides real-time salary estimates from Glassdoor,
 * LinkedIn, and ZipRecruiter.
 *
 * Endpoints:
 *   GET /job-salary          — salary by job title + location
 *   GET /company-job-salary  — salary by company + job title + optional location
 *
 * All calls go through the universal RapidApiUsageTracker for budget enforcement
 * and usage logging.
 *
 * @see https://rapidapi.com/openwebninja/api/job-salary-data
 */

import { getRapidApiKey } from "@/backend/utils/secrets";
import { RapidApiUsageTracker } from "@/backend/services/rapidapi-usage-tracker";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const API_HOST = "job-salary-data.p.rapidapi.com";
const BASE_URL = `https://${API_HOST}`;
const REQUEST_TIMEOUT_MS = 8000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface JobSalaryParams {
  job_title: string;
  location: string;
  radius?: number;
}

export interface CompanyJobSalaryParams {
  company_name: string;
  job_title: string;
  location?: string;
}

export interface SalaryEstimate {
  publisher_name: string;
  publisher_link: string;
  min_salary: number;
  max_salary: number;
  median_salary: number;
  salary_period: string;
  salary_currency: string;
}

export interface JobSalaryResponse {
  status: string;
  request_id: string;
  data: SalaryEstimate[];
}

export interface CompanyJobSalaryResponse {
  status: string;
  request_id: string;
  data: Array<{
    publisher_name: string;
    publisher_link: string;
    min_salary: number;
    max_salary: number;
    median_salary: number;
    salary_period: string;
    salary_currency: string;
    company_name: string;
  }>;
}

export interface BudgetExhaustedError {
  error: "budget_exhausted";
  used: number;
  limit: number;
  currentMonth: string;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class JobSalaryDataService {
  private tracker: RapidApiUsageTracker;

  constructor(private env: Env) {
    this.tracker = new RapidApiUsageTracker(env);
  }

  /**
   * Get salary estimates for a job title + location.
   *
   * @throws If budget is exhausted or the API returns an error.
   */
  async getJobSalary(
    params: JobSalaryParams,
  ): Promise<JobSalaryResponse> {
    await this.ensureBudget();

    const url = new URL(`${BASE_URL}/job-salary`);
    url.searchParams.set("job_title", params.job_title);
    url.searchParams.set("location", params.location);
    if (params.radius !== undefined) {
      url.searchParams.set("radius", String(params.radius));
    }

    return this.execute<JobSalaryResponse>(url, "/job-salary", {
      job_title: params.job_title,
      location: params.location,
      radius: params.radius,
    });
  }

  /**
   * Get company-specific salary estimates.
   *
   * @throws If budget is exhausted or the API returns an error.
   */
  async getCompanyJobSalary(
    params: CompanyJobSalaryParams,
  ): Promise<CompanyJobSalaryResponse> {
    await this.ensureBudget();

    const url = new URL(`${BASE_URL}/company-job-salary`);
    url.searchParams.set("company_name", params.company_name);
    url.searchParams.set("job_title", params.job_title);
    if (params.location) {
      url.searchParams.set("location", params.location);
    }

    return this.execute<CompanyJobSalaryResponse>(url, "/company-job-salary", {
      company_name: params.company_name,
      job_title: params.job_title,
      location: params.location,
    });
  }

  // ---------------------------------------------------------------------------
  // Internal
  // ---------------------------------------------------------------------------

  /**
   * Pre-flight budget check. Throws a structured error if exhausted.
   */
  private async ensureBudget(): Promise<void> {
    const budget = await this.tracker.checkBudget();
    if (!budget.allowed) {
      const err: BudgetExhaustedError = {
        error: "budget_exhausted",
        used: budget.used,
        limit: budget.limit,
        currentMonth: budget.currentMonth,
      };
      throw new RapidApiBudgetError(err);
    }
  }

  /**
   * Execute a RapidAPI fetch with timing, logging, and error handling.
   */
  private async execute<T>(
    url: URL,
    endpoint: string,
    requestParams: Record<string, unknown>,
  ): Promise<T> {
    const apiKey = await getRapidApiKey(this.env);
    const start = Date.now();
    let status = 0;
    let responseBytes = 0;
    let errorMsg: string | undefined;

    try {
      const response = await fetch(url.toString(), {
        headers: {
          "X-RapidAPI-Key": apiKey,
          "X-RapidAPI-Host": API_HOST,
        },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      status = response.status;
      const body = await response.text();
      responseBytes = new TextEncoder().encode(body).byteLength;

      if (!response.ok) {
        errorMsg = `Job Salary API returned ${status}: ${body.slice(0, 500)}`;
        throw new Error(errorMsg);
      }

      return JSON.parse(body) as T;
    } catch (e) {
      if (e instanceof RapidApiBudgetError) throw e;
      errorMsg = errorMsg ?? (e instanceof Error ? e.message : String(e));
      throw e;
    } finally {
      const durationMs = Date.now() - start;
      await this.tracker.logCall({
        apiHost: API_HOST,
        apiEndpoint: endpoint,
        requestParams,
        responseStatus: status || 0,
        responseBytes,
        durationMs,
        error: errorMsg,
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Custom error
// ---------------------------------------------------------------------------

export class RapidApiBudgetError extends Error {
  public readonly details: BudgetExhaustedError;

  constructor(details: BudgetExhaustedError) {
    super(
      `RapidAPI monthly budget exhausted: ${details.used}/${details.limit} calls used in ${details.currentMonth}`,
    );
    this.name = "RapidApiBudgetError";
    this.details = details;
  }
}
