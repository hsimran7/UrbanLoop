import { UserRole } from '@prisma/client';

export interface UserContext {
  id: string;
  email: string;
  role: UserRole;
}

export interface ResourceContext {
  ownerId?: string;
  [key: string]: any;
}

export interface PolicyHandler {
  handle(user: UserContext, resource: ResourceContext): boolean;
}
