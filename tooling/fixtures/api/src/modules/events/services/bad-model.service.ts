// violation: service imports a model directly instead of a repository
import { EventModel } from '../models/event.model.js';
export const bad = EventModel;
