/**
 * NEXUS Limits & Feature-Entitlements (§150/§151).
 *
 * Business-Limits dürfen niemals nur in UI-Code existieren (§150).
 * Plans/Entitlements sind ein Layer darüber – das Kernsystem funktioniert
 * technisch unabhängig vom Pricing (§151).
 */

export interface ApplicationLimits {
  maxApplications: number;
  maxQuestionsPerApplication: number;
  maxActiveSubmissionsPerUser: number;
  maxOptionsPerQuestion: number;
  maxAnswerLength: number;
  maxAttachmentsPerSubmission: number;
  maxExportRows: number;
}

export const DEFAULT_LIMITS: ApplicationLimits = {
  maxApplications: 50,
  maxQuestionsPerApplication: 100,
  maxActiveSubmissionsPerUser: 5,
  maxOptionsPerQuestion: 100,
  maxAnswerLength: 4000,
  maxAttachmentsPerSubmission: 10,
  maxExportRows: 50_000,
};

export type PlanId = 'free' | 'pro' | 'premium' | 'business' | 'enterprise';

export interface Entitlements {
  applicationsMax: number;
  applicationsQuestionsMax: number;
  applicationsActiveMax: number;
  applicationsAnalytics: boolean;
  applicationsAi: boolean;
  applicationsIntegrations: boolean;
  applicationsAdvancedAutomation: boolean;
}

export const PLAN_ENTITLEMENTS: Readonly<Record<PlanId, Entitlements>> = {
  free: {
    applicationsMax: 3,
    applicationsQuestionsMax: 20,
    applicationsActiveMax: 1,
    applicationsAnalytics: false,
    applicationsAi: false,
    applicationsIntegrations: false,
    applicationsAdvancedAutomation: false,
  },
  pro: {
    applicationsMax: 25,
    applicationsQuestionsMax: 50,
    applicationsActiveMax: 3,
    applicationsAnalytics: true,
    applicationsAi: false,
    applicationsIntegrations: true,
    applicationsAdvancedAutomation: false,
  },
  premium: {
    applicationsMax: 100,
    applicationsQuestionsMax: 100,
    applicationsActiveMax: 5,
    applicationsAnalytics: true,
    applicationsAi: true,
    applicationsIntegrations: true,
    applicationsAdvancedAutomation: true,
  },
  business: {
    applicationsMax: 500,
    applicationsQuestionsMax: 250,
    applicationsActiveMax: 10,
    applicationsAnalytics: true,
    applicationsAi: true,
    applicationsIntegrations: true,
    applicationsAdvancedAutomation: true,
  },
  enterprise: {
    applicationsMax: Number.MAX_SAFE_INTEGER,
    applicationsQuestionsMax: 500,
    applicationsActiveMax: 50,
    applicationsAnalytics: true,
    applicationsAi: true,
    applicationsIntegrations: true,
    applicationsAdvancedAutomation: true,
  },
};

export function entitlementsForPlan(plan: PlanId): Entitlements {
  return PLAN_ENTITLEMENTS[plan];
}

export function effectiveLimits(limits: Partial<ApplicationLimits>): ApplicationLimits {
  return { ...DEFAULT_LIMITS, ...limits };
}
