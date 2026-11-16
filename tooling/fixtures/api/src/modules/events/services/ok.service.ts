// allowed: other module through its index; own module internals
import { billing } from '../../billing/index.js';
import { repo } from '../repositories/events.repository.js';
export const ok = [billing, repo];
