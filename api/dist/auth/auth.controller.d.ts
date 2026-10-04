import type { Response } from 'express';
import { z } from 'zod';
import { AuthService } from './auth.service';
import type { AppRequest, AuthUser } from '../common/request-context';
import type { Actor } from '../audit/audit.service';
declare const loginSchema: z.ZodObject<{
    username: z.ZodString;
    password: z.ZodString;
}, "strip", z.ZodTypeAny, {
    username: string;
    password: string;
}, {
    username: string;
    password: string;
}>;
export declare class AuthController {
    private readonly auth;
    private readonly env;
    constructor(auth: AuthService);
    login(body: z.infer<typeof loginSchema>, req: AppRequest, res: Response): Promise<{
        id: string;
        username: string;
        displayName: string;
        robloxUserId: string | null;
        robloxUsername: string | null;
        roles: string[];
        permissions: import("@enrp/shared").PermissionKey[];
        lastLogin: Date | null;
    }>;
    logout(user: AuthUser, actor: Actor, res: Response): Promise<void>;
    me(user: AuthUser): Promise<{
        id: string;
        username: string;
        displayName: string;
        robloxUserId: string | null;
        robloxUsername: string | null;
        roles: string[];
        permissions: import("@enrp/shared").PermissionKey[];
        lastLogin: Date | null;
    }>;
}
export {};
