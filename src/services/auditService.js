import { AuditLog } from "../models/index.js";
export const audit = async ({ userId, action, entityType, entityId = null, details = {} }) => AuditLog.create({ user_id:userId, action, entity_type:entityType, entity_id:entityId, details });
