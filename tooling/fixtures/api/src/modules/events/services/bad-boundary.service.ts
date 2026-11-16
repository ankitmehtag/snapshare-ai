// violation: reaches into another module's internals
import { plans } from '../../billing/services/plans.js';
export const bad = plans;
