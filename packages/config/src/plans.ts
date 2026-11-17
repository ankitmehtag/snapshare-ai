/**
 * Default plan used until billing ships (IMPLEMENTATION_PLAN Phase 3.1: "entitlement
 * hooks stubbed to the default plan config, no hardcoded limits"). Phase 6 replaces
 * this with versioned `plans` documents; callers only ever ask for a limit by name.
 * Values follow PRD §6 "Photographer Pro" (owner can change at any gate).
 */
export const DEFAULT_PLAN = {
  key: 'photographer_pro',
  limits: {
    /** Active members plus pending invitations. */
    seats: 5,
  },
} as const;

export type LimitName = keyof typeof DEFAULT_PLAN.limits;
