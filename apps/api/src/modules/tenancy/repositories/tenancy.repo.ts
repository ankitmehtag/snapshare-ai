import { Types, type ClientSession } from 'mongoose';
import { ScopedRepository } from '../../../kernel/scoped-repo.js';
import { InvitationModel, type InvitationDoc } from '../models/invitation.model.js';
import { MembershipModel, type MembershipDoc } from '../models/membership.model.js';
import { RoleModel, type RoleDoc } from '../models/role.model.js';
import { StudioModel, type StudioDoc } from '../models/studio.model.js';

export type { InvitationDoc, MembershipDoc, RoleDoc, StudioDoc };

const opts = (session?: ClientSession) => (session ? { session } : {});
const oid = (id: string | Types.ObjectId) => new Types.ObjectId(String(id));

/** Tenant-owned collections: every access goes through forScope(scope). */
export const memberships = new ScopedRepository<MembershipDoc>(MembershipModel, 'tenantId');
export const invitations = new ScopedRepository<InvitationDoc>(InvitationModel, 'target.tenantId');

/**
 * Studios are the tenants themselves. Callers pass a studioId that the tenancy
 * guard has already resolved from the caller's membership — never a raw client id.
 */
export const studiosRepo = {
  async create(
    data: Pick<StudioDoc, 'name' | 'slug' | 'ownerUserId'> & { contact?: StudioDoc['contact'] },
    session?: ClientSession,
  ): Promise<StudioDoc> {
    const [doc] = await StudioModel.create([data], opts(session));
    return doc!.toObject();
  },
  findById: (id: string | Types.ObjectId) => StudioModel.findById(oid(id)).lean<StudioDoc>(),
  findByIds: (ids: Types.ObjectId[]) => StudioModel.find({ _id: { $in: ids } }).lean<StudioDoc[]>(),
  async slugTaken(slug: string): Promise<boolean> {
    return (await StudioModel.exists({ slug })) !== null;
  },
  update: (id: string, set: Record<string, unknown>, session?: ClientSession) =>
    StudioModel.findByIdAndUpdate(
      oid(id),
      { $set: set },
      {
        returnDocument: 'after',
        runValidators: true,
        ...opts(session),
      },
    ).lean<StudioDoc>(),
  setStatus: (
    id: string,
    status: StudioDoc['status'],
    deletionRequestedAt: Date | null,
    session?: ClientSession,
  ) =>
    StudioModel.updateOne(
      { _id: oid(id) },
      deletionRequestedAt
        ? { $set: { status, deletionRequestedAt } }
        : { $set: { status }, $unset: { deletionRequestedAt: 1 } },
      opts(session),
    ),
};

export const rolesRepo = {
  async upsertSystem(key: string, name: string, permissions: string[]): Promise<void> {
    await RoleModel.updateOne(
      { tenantId: null, key },
      { $set: { name, permissions, system: true } },
      { upsert: true },
    );
  },
  listSystem: () => RoleModel.find({ tenantId: null }).lean<RoleDoc[]>(),
  findSystem: (key: string) => RoleModel.findOne({ tenantId: null, key }).lean<RoleDoc>(),
  findById: (id: Types.ObjectId) => RoleModel.findById(id).lean<RoleDoc>(),
};

/** Lookups keyed by the signed-in user or by a secret token (not by tenant). */
export const membershipLookup = {
  /** Membership resolution for the tenancy guard (ARCHITECTURE §5.2). */
  findFor: (userId: string, tenantId: string) =>
    Types.ObjectId.isValid(tenantId)
      ? MembershipModel.findOne({
          userId: oid(userId),
          tenantId: oid(tenantId),
        }).lean<MembershipDoc>()
      : Promise.resolve(null),
  listForUser: (userId: string) =>
    MembershipModel.find({ userId: oid(userId), status: 'active' })
      .sort({ createdAt: 1 })
      .limit(200)
      .lean<MembershipDoc[]>(),
};

export const invitationLookup = {
  findByTokenHash: (tokenHash: string) =>
    InvitationModel.findOne({ tokenHash, kind: 'studio_member' }).lean<InvitationDoc>(),
  markAccepted: (id: Types.ObjectId, userId: Types.ObjectId, session?: ClientSession) =>
    InvitationModel.updateOne(
      { _id: id, status: 'pending', expiresAt: { $gt: new Date() } },
      { $set: { status: 'accepted', acceptedBy: userId } },
      opts(session),
    ),
};
