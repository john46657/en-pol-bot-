import { z } from 'zod';
export declare const questionSchema: z.ZodEffects<z.ZodEffects<z.ZodEffects<z.ZodEffects<z.ZodEffects<z.ZodObject<{
    id: z.ZodString;
    label: z.ZodString;
    type: z.ZodEnum<["SHORT" | "LONG" | "YESNO" | "SELECT" | "MULTI" | "CHECKBOX" | "NUMBER" | "DATE" | "FILE", ...("SHORT" | "LONG" | "YESNO" | "SELECT" | "MULTI" | "CHECKBOX" | "NUMBER" | "DATE" | "FILE")[]]>;
    required: z.ZodBoolean;
    options: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    placeholder: z.ZodOptional<z.ZodString>;
    description: z.ZodOptional<z.ZodString>;
    minLength: z.ZodOptional<z.ZodNumber>;
    maxLength: z.ZodOptional<z.ZodNumber>;
    min: z.ZodOptional<z.ZodNumber>;
    max: z.ZodOptional<z.ZodNumber>;
    enabled: z.ZodOptional<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    id: string;
    type: "SHORT" | "LONG" | "YESNO" | "SELECT" | "MULTI" | "CHECKBOX" | "NUMBER" | "DATE" | "FILE";
    label: string;
    options: string[];
    required: boolean;
    description?: string | undefined;
    enabled?: boolean | undefined;
    placeholder?: string | undefined;
    minLength?: number | undefined;
    maxLength?: number | undefined;
    min?: number | undefined;
    max?: number | undefined;
}, {
    id: string;
    type: "SHORT" | "LONG" | "YESNO" | "SELECT" | "MULTI" | "CHECKBOX" | "NUMBER" | "DATE" | "FILE";
    label: string;
    required: boolean;
    description?: string | undefined;
    enabled?: boolean | undefined;
    placeholder?: string | undefined;
    options?: string[] | undefined;
    minLength?: number | undefined;
    maxLength?: number | undefined;
    min?: number | undefined;
    max?: number | undefined;
}>, {
    id: string;
    type: "SHORT" | "LONG" | "YESNO" | "SELECT" | "MULTI" | "CHECKBOX" | "NUMBER" | "DATE" | "FILE";
    label: string;
    options: string[];
    required: boolean;
    description?: string | undefined;
    enabled?: boolean | undefined;
    placeholder?: string | undefined;
    minLength?: number | undefined;
    maxLength?: number | undefined;
    min?: number | undefined;
    max?: number | undefined;
}, {
    id: string;
    type: "SHORT" | "LONG" | "YESNO" | "SELECT" | "MULTI" | "CHECKBOX" | "NUMBER" | "DATE" | "FILE";
    label: string;
    required: boolean;
    description?: string | undefined;
    enabled?: boolean | undefined;
    placeholder?: string | undefined;
    options?: string[] | undefined;
    minLength?: number | undefined;
    maxLength?: number | undefined;
    min?: number | undefined;
    max?: number | undefined;
}>, {
    id: string;
    type: "SHORT" | "LONG" | "YESNO" | "SELECT" | "MULTI" | "CHECKBOX" | "NUMBER" | "DATE" | "FILE";
    label: string;
    options: string[];
    required: boolean;
    description?: string | undefined;
    enabled?: boolean | undefined;
    placeholder?: string | undefined;
    minLength?: number | undefined;
    maxLength?: number | undefined;
    min?: number | undefined;
    max?: number | undefined;
}, {
    id: string;
    type: "SHORT" | "LONG" | "YESNO" | "SELECT" | "MULTI" | "CHECKBOX" | "NUMBER" | "DATE" | "FILE";
    label: string;
    required: boolean;
    description?: string | undefined;
    enabled?: boolean | undefined;
    placeholder?: string | undefined;
    options?: string[] | undefined;
    minLength?: number | undefined;
    maxLength?: number | undefined;
    min?: number | undefined;
    max?: number | undefined;
}>, {
    id: string;
    type: "SHORT" | "LONG" | "YESNO" | "SELECT" | "MULTI" | "CHECKBOX" | "NUMBER" | "DATE" | "FILE";
    label: string;
    options: string[];
    required: boolean;
    description?: string | undefined;
    enabled?: boolean | undefined;
    placeholder?: string | undefined;
    minLength?: number | undefined;
    maxLength?: number | undefined;
    min?: number | undefined;
    max?: number | undefined;
}, {
    id: string;
    type: "SHORT" | "LONG" | "YESNO" | "SELECT" | "MULTI" | "CHECKBOX" | "NUMBER" | "DATE" | "FILE";
    label: string;
    required: boolean;
    description?: string | undefined;
    enabled?: boolean | undefined;
    placeholder?: string | undefined;
    options?: string[] | undefined;
    minLength?: number | undefined;
    maxLength?: number | undefined;
    min?: number | undefined;
    max?: number | undefined;
}>, {
    id: string;
    type: "SHORT" | "LONG" | "YESNO" | "SELECT" | "MULTI" | "CHECKBOX" | "NUMBER" | "DATE" | "FILE";
    label: string;
    options: string[];
    required: boolean;
    description?: string | undefined;
    enabled?: boolean | undefined;
    placeholder?: string | undefined;
    minLength?: number | undefined;
    maxLength?: number | undefined;
    min?: number | undefined;
    max?: number | undefined;
}, {
    id: string;
    type: "SHORT" | "LONG" | "YESNO" | "SELECT" | "MULTI" | "CHECKBOX" | "NUMBER" | "DATE" | "FILE";
    label: string;
    required: boolean;
    description?: string | undefined;
    enabled?: boolean | undefined;
    placeholder?: string | undefined;
    options?: string[] | undefined;
    minLength?: number | undefined;
    maxLength?: number | undefined;
    min?: number | undefined;
    max?: number | undefined;
}>, {
    id: string;
    type: "SHORT" | "LONG" | "YESNO" | "SELECT" | "MULTI" | "CHECKBOX" | "NUMBER" | "DATE" | "FILE";
    label: string;
    options: string[];
    required: boolean;
    description?: string | undefined;
    enabled?: boolean | undefined;
    placeholder?: string | undefined;
    minLength?: number | undefined;
    maxLength?: number | undefined;
    min?: number | undefined;
    max?: number | undefined;
}, {
    id: string;
    type: "SHORT" | "LONG" | "YESNO" | "SELECT" | "MULTI" | "CHECKBOX" | "NUMBER" | "DATE" | "FILE";
    label: string;
    required: boolean;
    description?: string | undefined;
    enabled?: boolean | undefined;
    placeholder?: string | undefined;
    options?: string[] | undefined;
    minLength?: number | undefined;
    maxLength?: number | undefined;
    min?: number | undefined;
    max?: number | undefined;
}>;
export declare const buttonSchema: z.ZodObject<{
    action: z.ZodEnum<[string, ...string[]]>;
    label: z.ZodString;
    emoji: z.ZodOptional<z.ZodString>;
    style: z.ZodEnum<["primary", "secondary", "success", "danger"]>;
    enabled: z.ZodBoolean;
}, "strip", z.ZodTypeAny, {
    enabled: boolean;
    label: string;
    action: string;
    style: "success" | "danger" | "secondary" | "primary";
    emoji?: string | undefined;
}, {
    enabled: boolean;
    label: string;
    action: string;
    style: "success" | "danger" | "secondary" | "primary";
    emoji?: string | undefined;
}>;
export declare const categorySchema: z.ZodObject<{
    /** Discord-Server, auf dem es diese Ticket-Art gibt (leer = alle Server). */
    guildId: z.ZodEffects<z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodLiteral<"">, z.ZodNull]>>, string | null, string | null | undefined>;
    name: z.ZodString;
    description: z.ZodDefault<z.ZodString>;
    emoji: z.ZodEffects<z.ZodOptional<z.ZodNullable<z.ZodString>>, string | null, string | null | undefined>;
    color: z.ZodDefault<z.ZodNumber>;
    buttonStyle: z.ZodDefault<z.ZodEnum<["primary", "secondary", "success", "danger"]>>;
    position: z.ZodDefault<z.ZodNumber>;
    active: z.ZodDefault<z.ZodBoolean>;
    discordCategoryId: z.ZodEffects<z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodLiteral<"">, z.ZodNull]>>, string | null, string | null | undefined>;
    channelNameFormat: z.ZodDefault<z.ZodString>;
    staffRoleIds: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    extraRoleIds: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    requiredRoleIds: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    allowedUserIds: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    accessRoleNames: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    maxOpen: z.ZodDefault<z.ZodNumber>;
    cooldownMinutes: z.ZodDefault<z.ZodNumber>;
    defaultPriorityId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    questions: z.ZodEffects<z.ZodDefault<z.ZodArray<z.ZodEffects<z.ZodEffects<z.ZodEffects<z.ZodEffects<z.ZodEffects<z.ZodObject<{
        id: z.ZodString;
        label: z.ZodString;
        type: z.ZodEnum<["SHORT" | "LONG" | "YESNO" | "SELECT" | "MULTI" | "CHECKBOX" | "NUMBER" | "DATE" | "FILE", ...("SHORT" | "LONG" | "YESNO" | "SELECT" | "MULTI" | "CHECKBOX" | "NUMBER" | "DATE" | "FILE")[]]>;
        required: z.ZodBoolean;
        options: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        placeholder: z.ZodOptional<z.ZodString>;
        description: z.ZodOptional<z.ZodString>;
        minLength: z.ZodOptional<z.ZodNumber>;
        maxLength: z.ZodOptional<z.ZodNumber>;
        min: z.ZodOptional<z.ZodNumber>;
        max: z.ZodOptional<z.ZodNumber>;
        enabled: z.ZodOptional<z.ZodBoolean>;
    }, "strip", z.ZodTypeAny, {
        id: string;
        type: "SHORT" | "LONG" | "YESNO" | "SELECT" | "MULTI" | "CHECKBOX" | "NUMBER" | "DATE" | "FILE";
        label: string;
        options: string[];
        required: boolean;
        description?: string | undefined;
        enabled?: boolean | undefined;
        placeholder?: string | undefined;
        minLength?: number | undefined;
        maxLength?: number | undefined;
        min?: number | undefined;
        max?: number | undefined;
    }, {
        id: string;
        type: "SHORT" | "LONG" | "YESNO" | "SELECT" | "MULTI" | "CHECKBOX" | "NUMBER" | "DATE" | "FILE";
        label: string;
        required: boolean;
        description?: string | undefined;
        enabled?: boolean | undefined;
        placeholder?: string | undefined;
        options?: string[] | undefined;
        minLength?: number | undefined;
        maxLength?: number | undefined;
        min?: number | undefined;
        max?: number | undefined;
    }>, {
        id: string;
        type: "SHORT" | "LONG" | "YESNO" | "SELECT" | "MULTI" | "CHECKBOX" | "NUMBER" | "DATE" | "FILE";
        label: string;
        options: string[];
        required: boolean;
        description?: string | undefined;
        enabled?: boolean | undefined;
        placeholder?: string | undefined;
        minLength?: number | undefined;
        maxLength?: number | undefined;
        min?: number | undefined;
        max?: number | undefined;
    }, {
        id: string;
        type: "SHORT" | "LONG" | "YESNO" | "SELECT" | "MULTI" | "CHECKBOX" | "NUMBER" | "DATE" | "FILE";
        label: string;
        required: boolean;
        description?: string | undefined;
        enabled?: boolean | undefined;
        placeholder?: string | undefined;
        options?: string[] | undefined;
        minLength?: number | undefined;
        maxLength?: number | undefined;
        min?: number | undefined;
        max?: number | undefined;
    }>, {
        id: string;
        type: "SHORT" | "LONG" | "YESNO" | "SELECT" | "MULTI" | "CHECKBOX" | "NUMBER" | "DATE" | "FILE";
        label: string;
        options: string[];
        required: boolean;
        description?: string | undefined;
        enabled?: boolean | undefined;
        placeholder?: string | undefined;
        minLength?: number | undefined;
        maxLength?: number | undefined;
        min?: number | undefined;
        max?: number | undefined;
    }, {
        id: string;
        type: "SHORT" | "LONG" | "YESNO" | "SELECT" | "MULTI" | "CHECKBOX" | "NUMBER" | "DATE" | "FILE";
        label: string;
        required: boolean;
        description?: string | undefined;
        enabled?: boolean | undefined;
        placeholder?: string | undefined;
        options?: string[] | undefined;
        minLength?: number | undefined;
        maxLength?: number | undefined;
        min?: number | undefined;
        max?: number | undefined;
    }>, {
        id: string;
        type: "SHORT" | "LONG" | "YESNO" | "SELECT" | "MULTI" | "CHECKBOX" | "NUMBER" | "DATE" | "FILE";
        label: string;
        options: string[];
        required: boolean;
        description?: string | undefined;
        enabled?: boolean | undefined;
        placeholder?: string | undefined;
        minLength?: number | undefined;
        maxLength?: number | undefined;
        min?: number | undefined;
        max?: number | undefined;
    }, {
        id: string;
        type: "SHORT" | "LONG" | "YESNO" | "SELECT" | "MULTI" | "CHECKBOX" | "NUMBER" | "DATE" | "FILE";
        label: string;
        required: boolean;
        description?: string | undefined;
        enabled?: boolean | undefined;
        placeholder?: string | undefined;
        options?: string[] | undefined;
        minLength?: number | undefined;
        maxLength?: number | undefined;
        min?: number | undefined;
        max?: number | undefined;
    }>, {
        id: string;
        type: "SHORT" | "LONG" | "YESNO" | "SELECT" | "MULTI" | "CHECKBOX" | "NUMBER" | "DATE" | "FILE";
        label: string;
        options: string[];
        required: boolean;
        description?: string | undefined;
        enabled?: boolean | undefined;
        placeholder?: string | undefined;
        minLength?: number | undefined;
        maxLength?: number | undefined;
        min?: number | undefined;
        max?: number | undefined;
    }, {
        id: string;
        type: "SHORT" | "LONG" | "YESNO" | "SELECT" | "MULTI" | "CHECKBOX" | "NUMBER" | "DATE" | "FILE";
        label: string;
        required: boolean;
        description?: string | undefined;
        enabled?: boolean | undefined;
        placeholder?: string | undefined;
        options?: string[] | undefined;
        minLength?: number | undefined;
        maxLength?: number | undefined;
        min?: number | undefined;
        max?: number | undefined;
    }>, {
        id: string;
        type: "SHORT" | "LONG" | "YESNO" | "SELECT" | "MULTI" | "CHECKBOX" | "NUMBER" | "DATE" | "FILE";
        label: string;
        options: string[];
        required: boolean;
        description?: string | undefined;
        enabled?: boolean | undefined;
        placeholder?: string | undefined;
        minLength?: number | undefined;
        maxLength?: number | undefined;
        min?: number | undefined;
        max?: number | undefined;
    }, {
        id: string;
        type: "SHORT" | "LONG" | "YESNO" | "SELECT" | "MULTI" | "CHECKBOX" | "NUMBER" | "DATE" | "FILE";
        label: string;
        required: boolean;
        description?: string | undefined;
        enabled?: boolean | undefined;
        placeholder?: string | undefined;
        options?: string[] | undefined;
        minLength?: number | undefined;
        maxLength?: number | undefined;
        min?: number | undefined;
        max?: number | undefined;
    }>, "many">>, {
        id: string;
        type: "SHORT" | "LONG" | "YESNO" | "SELECT" | "MULTI" | "CHECKBOX" | "NUMBER" | "DATE" | "FILE";
        label: string;
        options: string[];
        required: boolean;
        description?: string | undefined;
        enabled?: boolean | undefined;
        placeholder?: string | undefined;
        minLength?: number | undefined;
        maxLength?: number | undefined;
        min?: number | undefined;
        max?: number | undefined;
    }[], {
        id: string;
        type: "SHORT" | "LONG" | "YESNO" | "SELECT" | "MULTI" | "CHECKBOX" | "NUMBER" | "DATE" | "FILE";
        label: string;
        required: boolean;
        description?: string | undefined;
        enabled?: boolean | undefined;
        placeholder?: string | undefined;
        options?: string[] | undefined;
        minLength?: number | undefined;
        maxLength?: number | undefined;
        min?: number | undefined;
        max?: number | undefined;
    }[] | undefined>;
    welcomeTitle: z.ZodDefault<z.ZodString>;
    welcomeMessage: z.ZodDefault<z.ZodString>;
    mentionStaff: z.ZodDefault<z.ZodBoolean>;
    mentionText: z.ZodDefault<z.ZodString>;
    buttons: z.ZodDefault<z.ZodArray<z.ZodObject<{
        action: z.ZodEnum<[string, ...string[]]>;
        label: z.ZodString;
        emoji: z.ZodOptional<z.ZodString>;
        style: z.ZodEnum<["primary", "secondary", "success", "danger"]>;
        enabled: z.ZodBoolean;
    }, "strip", z.ZodTypeAny, {
        enabled: boolean;
        label: string;
        action: string;
        style: "success" | "danger" | "secondary" | "primary";
        emoji?: string | undefined;
    }, {
        enabled: boolean;
        label: string;
        action: string;
        style: "success" | "danger" | "secondary" | "primary";
        emoji?: string | undefined;
    }>, "many">>;
    claimMode: z.ZodDefault<z.ZodEnum<["MULTI" | "SINGLE" | "PRIMARY", ...("MULTI" | "SINGLE" | "PRIMARY")[]]>>;
    claimMessage: z.ZodDefault<z.ZodString>;
    claimNotifyStaff: z.ZodDefault<z.ZodBoolean>;
    creatorCanClose: z.ZodDefault<z.ZodBoolean>;
    closeReasonMode: z.ZodDefault<z.ZodEnum<["NONE" | "OPTIONAL" | "REQUIRED", ...("NONE" | "OPTIONAL" | "REQUIRED")[]]>>;
    closeReasonSource: z.ZodDefault<z.ZodEnum<["PRESET" | "CUSTOM" | "BOTH", ...("PRESET" | "CUSTOM" | "BOTH")[]]>>;
    closeRemovesAccess: z.ZodDefault<z.ZodBoolean>;
    allowReopen: z.ZodDefault<z.ZodBoolean>;
    transcriptOnClose: z.ZodDefault<z.ZodBoolean>;
    transcriptChannelId: z.ZodEffects<z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodLiteral<"">, z.ZodNull]>>, string | null, string | null | undefined>;
    transcriptToUser: z.ZodDefault<z.ZodBoolean>;
    ratingEnabled: z.ZodDefault<z.ZodBoolean>;
    ratingQuestion: z.ZodDefault<z.ZodString>;
    autoCloseMinutes: z.ZodDefault<z.ZodNumber>;
    autoCloseWarnMinutes: z.ZodDefault<z.ZodNumber>;
    autoCloseMessage: z.ZodDefault<z.ZodString>;
    deleteAfterMinutes: z.ZodDefault<z.ZodNumber>;
    escalationRoleIds: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    escalationPriorityId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    escalationMessage: z.ZodDefault<z.ZodString>;
    welcomeImageUrl: z.ZodEffects<z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodLiteral<"">, z.ZodNull]>>, string | null, string | null | undefined>;
    capacity: z.ZodDefault<z.ZodNumber>;
    creatorCanAddUsers: z.ZodDefault<z.ZodBoolean>;
    claimDiscordCategoryId: z.ZodEffects<z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodLiteral<"">, z.ZodNull]>>, string | null, string | null | undefined>;
    claimLocksChat: z.ZodDefault<z.ZodBoolean>;
    autoClaimOnMessage: z.ZodDefault<z.ZodBoolean>;
    autoUnclaimMinutes: z.ZodDefault<z.ZodNumber>;
    staffAlertMinutes: z.ZodDefault<z.ZodNumber>;
    closeRequestCloses: z.ZodDefault<z.ZodBoolean>;
    departmentId: z.ZodEffects<z.ZodOptional<z.ZodNullable<z.ZodString>>, string | null, string | null | undefined>;
    confidential: z.ZodDefault<z.ZodBoolean>;
    formMode: z.ZodDefault<z.ZodEnum<["CHANNEL", "MODAL"]>>;
    escalateUnassignedMinutes: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    guildId: string | null;
    color: number;
    description: string;
    active: boolean;
    name: string;
    position: number;
    questions: {
        id: string;
        type: "SHORT" | "LONG" | "YESNO" | "SELECT" | "MULTI" | "CHECKBOX" | "NUMBER" | "DATE" | "FILE";
        label: string;
        options: string[];
        required: boolean;
        description?: string | undefined;
        enabled?: boolean | undefined;
        placeholder?: string | undefined;
        minLength?: number | undefined;
        maxLength?: number | undefined;
        min?: number | undefined;
        max?: number | undefined;
    }[];
    departmentId: string | null;
    emoji: string | null;
    staffRoleIds: string[];
    accessRoleNames: string[];
    buttonStyle: "success" | "danger" | "secondary" | "primary";
    discordCategoryId: string | null;
    channelNameFormat: string;
    extraRoleIds: string[];
    requiredRoleIds: string[];
    allowedUserIds: string[];
    maxOpen: number;
    cooldownMinutes: number;
    welcomeTitle: string;
    welcomeMessage: string;
    mentionStaff: boolean;
    mentionText: string;
    buttons: {
        enabled: boolean;
        label: string;
        action: string;
        style: "success" | "danger" | "secondary" | "primary";
        emoji?: string | undefined;
    }[];
    claimMode: "MULTI" | "SINGLE" | "PRIMARY";
    claimMessage: string;
    claimNotifyStaff: boolean;
    creatorCanClose: boolean;
    closeReasonMode: "NONE" | "OPTIONAL" | "REQUIRED";
    closeReasonSource: "PRESET" | "CUSTOM" | "BOTH";
    closeRemovesAccess: boolean;
    allowReopen: boolean;
    transcriptOnClose: boolean;
    transcriptChannelId: string | null;
    transcriptToUser: boolean;
    ratingEnabled: boolean;
    ratingQuestion: string;
    autoCloseMinutes: number;
    autoCloseWarnMinutes: number;
    autoCloseMessage: string;
    deleteAfterMinutes: number;
    escalationRoleIds: string[];
    escalationMessage: string;
    welcomeImageUrl: string | null;
    capacity: number;
    creatorCanAddUsers: boolean;
    claimDiscordCategoryId: string | null;
    claimLocksChat: boolean;
    autoClaimOnMessage: boolean;
    autoUnclaimMinutes: number;
    staffAlertMinutes: number;
    closeRequestCloses: boolean;
    confidential: boolean;
    formMode: "CHANNEL" | "MODAL";
    escalateUnassignedMinutes: number;
    defaultPriorityId?: string | null | undefined;
    escalationPriorityId?: string | null | undefined;
}, {
    name: string;
    guildId?: string | null | undefined;
    color?: number | undefined;
    description?: string | undefined;
    active?: boolean | undefined;
    position?: number | undefined;
    questions?: {
        id: string;
        type: "SHORT" | "LONG" | "YESNO" | "SELECT" | "MULTI" | "CHECKBOX" | "NUMBER" | "DATE" | "FILE";
        label: string;
        required: boolean;
        description?: string | undefined;
        enabled?: boolean | undefined;
        placeholder?: string | undefined;
        options?: string[] | undefined;
        minLength?: number | undefined;
        maxLength?: number | undefined;
        min?: number | undefined;
        max?: number | undefined;
    }[] | undefined;
    departmentId?: string | null | undefined;
    emoji?: string | null | undefined;
    staffRoleIds?: string[] | undefined;
    accessRoleNames?: string[] | undefined;
    buttonStyle?: "success" | "danger" | "secondary" | "primary" | undefined;
    discordCategoryId?: string | null | undefined;
    channelNameFormat?: string | undefined;
    extraRoleIds?: string[] | undefined;
    requiredRoleIds?: string[] | undefined;
    allowedUserIds?: string[] | undefined;
    maxOpen?: number | undefined;
    cooldownMinutes?: number | undefined;
    defaultPriorityId?: string | null | undefined;
    welcomeTitle?: string | undefined;
    welcomeMessage?: string | undefined;
    mentionStaff?: boolean | undefined;
    mentionText?: string | undefined;
    buttons?: {
        enabled: boolean;
        label: string;
        action: string;
        style: "success" | "danger" | "secondary" | "primary";
        emoji?: string | undefined;
    }[] | undefined;
    claimMode?: "MULTI" | "SINGLE" | "PRIMARY" | undefined;
    claimMessage?: string | undefined;
    claimNotifyStaff?: boolean | undefined;
    creatorCanClose?: boolean | undefined;
    closeReasonMode?: "NONE" | "OPTIONAL" | "REQUIRED" | undefined;
    closeReasonSource?: "PRESET" | "CUSTOM" | "BOTH" | undefined;
    closeRemovesAccess?: boolean | undefined;
    allowReopen?: boolean | undefined;
    transcriptOnClose?: boolean | undefined;
    transcriptChannelId?: string | null | undefined;
    transcriptToUser?: boolean | undefined;
    ratingEnabled?: boolean | undefined;
    ratingQuestion?: string | undefined;
    autoCloseMinutes?: number | undefined;
    autoCloseWarnMinutes?: number | undefined;
    autoCloseMessage?: string | undefined;
    deleteAfterMinutes?: number | undefined;
    escalationRoleIds?: string[] | undefined;
    escalationPriorityId?: string | null | undefined;
    escalationMessage?: string | undefined;
    welcomeImageUrl?: string | null | undefined;
    capacity?: number | undefined;
    creatorCanAddUsers?: boolean | undefined;
    claimDiscordCategoryId?: string | null | undefined;
    claimLocksChat?: boolean | undefined;
    autoClaimOnMessage?: boolean | undefined;
    autoUnclaimMinutes?: number | undefined;
    staffAlertMinutes?: number | undefined;
    closeRequestCloses?: boolean | undefined;
    confidential?: boolean | undefined;
    formMode?: "CHANNEL" | "MODAL" | undefined;
    escalateUnassignedMinutes?: number | undefined;
}>;
export type CategoryInput = z.infer<typeof categorySchema>;
export declare const panelSchema: z.ZodEffects<z.ZodObject<{
    guildId: z.ZodEffects<z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodLiteral<"">, z.ZodNull]>>, string | null, string | null | undefined>;
    name: z.ZodString;
    title: z.ZodDefault<z.ZodString>;
    description: z.ZodDefault<z.ZodString>;
    emoji: z.ZodEffects<z.ZodOptional<z.ZodNullable<z.ZodString>>, string | null, string | null | undefined>;
    color: z.ZodDefault<z.ZodNumber>;
    thumbnailUrl: z.ZodEffects<z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodLiteral<"">, z.ZodNull]>>, string | null, string | null | undefined>;
    imageUrl: z.ZodEffects<z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodLiteral<"">, z.ZodNull]>>, string | null, string | null | undefined>;
    bannerUrl: z.ZodEffects<z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodLiteral<"">, z.ZodNull]>>, string | null, string | null | undefined>;
    footer: z.ZodEffects<z.ZodOptional<z.ZodNullable<z.ZodString>>, string | null, string | null | undefined>;
    footerIconUrl: z.ZodEffects<z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodLiteral<"">, z.ZodNull]>>, string | null, string | null | undefined>;
    authorName: z.ZodEffects<z.ZodOptional<z.ZodNullable<z.ZodString>>, string | null, string | null | undefined>;
    authorIconUrl: z.ZodEffects<z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodLiteral<"">, z.ZodNull]>>, string | null, string | null | undefined>;
    style: z.ZodDefault<z.ZodEnum<["BUTTONS", "DROPDOWN"]>>;
    placeholder: z.ZodDefault<z.ZodString>;
    channelId: z.ZodEffects<z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodLiteral<"">, z.ZodNull]>>, string | null, string | null | undefined>;
    categoryIds: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    allowedRoleIds: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    showLoad: z.ZodDefault<z.ZodBoolean>;
    position: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    guildId: string | null;
    color: number;
    title: string;
    description: string;
    name: string;
    position: number;
    channelId: string | null;
    emoji: string | null;
    thumbnailUrl: string | null;
    imageUrl: string | null;
    bannerUrl: string | null;
    footer: string | null;
    footerIconUrl: string | null;
    authorName: string | null;
    authorIconUrl: string | null;
    style: "BUTTONS" | "DROPDOWN";
    placeholder: string;
    categoryIds: string[];
    allowedRoleIds: string[];
    showLoad: boolean;
}, {
    name: string;
    guildId?: string | null | undefined;
    color?: number | undefined;
    title?: string | undefined;
    description?: string | undefined;
    position?: number | undefined;
    channelId?: string | null | undefined;
    emoji?: string | null | undefined;
    thumbnailUrl?: string | null | undefined;
    imageUrl?: string | null | undefined;
    bannerUrl?: string | null | undefined;
    footer?: string | null | undefined;
    footerIconUrl?: string | null | undefined;
    authorName?: string | null | undefined;
    authorIconUrl?: string | null | undefined;
    style?: "BUTTONS" | "DROPDOWN" | undefined;
    placeholder?: string | undefined;
    categoryIds?: string[] | undefined;
    allowedRoleIds?: string[] | undefined;
    showLoad?: boolean | undefined;
}>, {
    guildId: string | null;
    color: number;
    title: string;
    description: string;
    name: string;
    position: number;
    channelId: string | null;
    emoji: string | null;
    thumbnailUrl: string | null;
    imageUrl: string | null;
    bannerUrl: string | null;
    footer: string | null;
    footerIconUrl: string | null;
    authorName: string | null;
    authorIconUrl: string | null;
    style: "BUTTONS" | "DROPDOWN";
    placeholder: string;
    categoryIds: string[];
    allowedRoleIds: string[];
    showLoad: boolean;
}, {
    name: string;
    guildId?: string | null | undefined;
    color?: number | undefined;
    title?: string | undefined;
    description?: string | undefined;
    position?: number | undefined;
    channelId?: string | null | undefined;
    emoji?: string | null | undefined;
    thumbnailUrl?: string | null | undefined;
    imageUrl?: string | null | undefined;
    bannerUrl?: string | null | undefined;
    footer?: string | null | undefined;
    footerIconUrl?: string | null | undefined;
    authorName?: string | null | undefined;
    authorIconUrl?: string | null | undefined;
    style?: "BUTTONS" | "DROPDOWN" | undefined;
    placeholder?: string | undefined;
    categoryIds?: string[] | undefined;
    allowedRoleIds?: string[] | undefined;
    showLoad?: boolean | undefined;
}>;
export type PanelInput = z.infer<typeof panelSchema>;
export declare const statusSchema: z.ZodEffects<z.ZodObject<{
    name: z.ZodString;
    emoji: z.ZodDefault<z.ZodString>;
    color: z.ZodDefault<z.ZodNumber>;
    position: z.ZodDefault<z.ZodNumber>;
    kind: z.ZodDefault<z.ZodEnum<["OPEN" | "CLOSED" | "ARCHIVED", ...("OPEN" | "CLOSED" | "ARCHIVED")[]]>>;
    isDefault: z.ZodDefault<z.ZodBoolean>;
    isClaimed: z.ZodDefault<z.ZodBoolean>;
    isEscalation: z.ZodDefault<z.ZodBoolean>;
    isClose: z.ZodDefault<z.ZodBoolean>;
    /** feste Bedeutung im Lebenszyklus (je Bedeutung höchstens ein Status) */
    key: z.ZodEffects<z.ZodOptional<z.ZodUnion<[z.ZodEnum<["OPEN" | "CLAIMED" | "CLOSED" | "ARCHIVED" | "RESOLVED" | "IN_PROGRESS" | "WAITING_USER" | "WAITING_INTERNAL" | "ESCALATED", ...("OPEN" | "CLAIMED" | "CLOSED" | "ARCHIVED" | "RESOLVED" | "IN_PROGRESS" | "WAITING_USER" | "WAITING_INTERNAL" | "ESCALATED")[]]>, z.ZodNull]>>, "OPEN" | "CLAIMED" | "CLOSED" | "ARCHIVED" | "RESOLVED" | "IN_PROGRESS" | "WAITING_USER" | "WAITING_INTERNAL" | "ESCALATED" | null, "OPEN" | "CLAIMED" | "CLOSED" | "ARCHIVED" | "RESOLVED" | "IN_PROGRESS" | "WAITING_USER" | "WAITING_INTERNAL" | "ESCALATED" | null | undefined>;
}, "strip", z.ZodTypeAny, {
    color: number;
    name: string;
    kind: "OPEN" | "CLOSED" | "ARCHIVED";
    position: number;
    key: "OPEN" | "CLAIMED" | "CLOSED" | "ARCHIVED" | "RESOLVED" | "IN_PROGRESS" | "WAITING_USER" | "WAITING_INTERNAL" | "ESCALATED" | null;
    emoji: string;
    isDefault: boolean;
    isClaimed: boolean;
    isEscalation: boolean;
    isClose: boolean;
}, {
    name: string;
    color?: number | undefined;
    kind?: "OPEN" | "CLOSED" | "ARCHIVED" | undefined;
    position?: number | undefined;
    key?: "OPEN" | "CLAIMED" | "CLOSED" | "ARCHIVED" | "RESOLVED" | "IN_PROGRESS" | "WAITING_USER" | "WAITING_INTERNAL" | "ESCALATED" | null | undefined;
    emoji?: string | undefined;
    isDefault?: boolean | undefined;
    isClaimed?: boolean | undefined;
    isEscalation?: boolean | undefined;
    isClose?: boolean | undefined;
}>, {
    color: number;
    name: string;
    kind: "OPEN" | "CLOSED" | "ARCHIVED";
    position: number;
    key: "OPEN" | "CLAIMED" | "CLOSED" | "ARCHIVED" | "RESOLVED" | "IN_PROGRESS" | "WAITING_USER" | "WAITING_INTERNAL" | "ESCALATED" | null;
    emoji: string;
    isDefault: boolean;
    isClaimed: boolean;
    isEscalation: boolean;
    isClose: boolean;
}, {
    name: string;
    color?: number | undefined;
    kind?: "OPEN" | "CLOSED" | "ARCHIVED" | undefined;
    position?: number | undefined;
    key?: "OPEN" | "CLAIMED" | "CLOSED" | "ARCHIVED" | "RESOLVED" | "IN_PROGRESS" | "WAITING_USER" | "WAITING_INTERNAL" | "ESCALATED" | null | undefined;
    emoji?: string | undefined;
    isDefault?: boolean | undefined;
    isClaimed?: boolean | undefined;
    isEscalation?: boolean | undefined;
    isClose?: boolean | undefined;
}>;
export declare const prioritySchema: z.ZodObject<{
    name: z.ZodString;
    emoji: z.ZodDefault<z.ZodString>;
    color: z.ZodDefault<z.ZodNumber>;
    position: z.ZodDefault<z.ZodNumber>;
    isDefault: z.ZodDefault<z.ZodBoolean>;
    allowedRoleNames: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    notifyRoleIds: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    /** SLA-Zielzeiten (Minuten); leer = keine Frist */
    firstResponseMinutes: z.ZodEffects<z.ZodOptional<z.ZodNullable<z.ZodNumber>>, number | null, number | null | undefined>;
    resolutionMinutes: z.ZodEffects<z.ZodOptional<z.ZodNullable<z.ZodNumber>>, number | null, number | null | undefined>;
}, "strip", z.ZodTypeAny, {
    color: number;
    name: string;
    position: number;
    emoji: string;
    isDefault: boolean;
    allowedRoleNames: string[];
    notifyRoleIds: string[];
    firstResponseMinutes: number | null;
    resolutionMinutes: number | null;
}, {
    name: string;
    color?: number | undefined;
    position?: number | undefined;
    emoji?: string | undefined;
    isDefault?: boolean | undefined;
    allowedRoleNames?: string[] | undefined;
    notifyRoleIds?: string[] | undefined;
    firstResponseMinutes?: number | null | undefined;
    resolutionMinutes?: number | null | undefined;
}>;
export declare const departmentSchema: z.ZodObject<{
    name: z.ZodString;
    description: z.ZodDefault<z.ZodString>;
    emoji: z.ZodEffects<z.ZodOptional<z.ZodNullable<z.ZodString>>, string | null, string | null | undefined>;
    staffRoleIds: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    leadRoleIds: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    accessRoleNames: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    notifyChannelId: z.ZodEffects<z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodLiteral<"">, z.ZodNull]>>, string | null, string | null | undefined>;
    active: z.ZodDefault<z.ZodBoolean>;
    position: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    description: string;
    active: boolean;
    name: string;
    position: number;
    notifyChannelId: string | null;
    emoji: string | null;
    staffRoleIds: string[];
    leadRoleIds: string[];
    accessRoleNames: string[];
}, {
    name: string;
    description?: string | undefined;
    active?: boolean | undefined;
    position?: number | undefined;
    notifyChannelId?: string | null | undefined;
    emoji?: string | null | undefined;
    staffRoleIds?: string[] | undefined;
    leadRoleIds?: string[] | undefined;
    accessRoleNames?: string[] | undefined;
}>;
export type DepartmentInput = z.infer<typeof departmentSchema>;
/** Ereignisse mit einstellbaren Benachrichtigungen. */
export declare const NOTIFY_EVENTS: {
    readonly created: "Neues Ticket";
    readonly claimed: "Ticket übernommen";
    readonly assigned: "Zuständigkeit geändert";
    readonly user_message: "Neue Nachricht des Nutzers";
    readonly info_requested: "Rückfrage an den Nutzer";
    readonly priority: "Priorität geändert";
    readonly escalated: "Eskalation (auch SLA / unzugewiesen)";
    readonly closed: "Ticket geschlossen";
    readonly reopened: "Ticket wieder geöffnet";
    readonly transcript_ready: "Transkript erstellt";
    readonly transcript_failed: "Transkript fehlgeschlagen";
};
export type NotifyEvent = keyof typeof NOTIFY_EVENTS;
export declare const notifySchema: z.ZodDefault<z.ZodObject<{
    created: z.ZodDefault<z.ZodObject<{
        channel: z.ZodDefault<z.ZodBoolean>;
        dm: z.ZodDefault<z.ZodBoolean>;
        dashboard: z.ZodDefault<z.ZodBoolean>;
    }, "strip", z.ZodTypeAny, {
        channel: boolean;
        dm: boolean;
        dashboard: boolean;
    }, {
        channel?: boolean | undefined;
        dm?: boolean | undefined;
        dashboard?: boolean | undefined;
    }>>;
    claimed: z.ZodDefault<z.ZodObject<{
        channel: z.ZodDefault<z.ZodBoolean>;
        dm: z.ZodDefault<z.ZodBoolean>;
        dashboard: z.ZodDefault<z.ZodBoolean>;
    }, "strip", z.ZodTypeAny, {
        channel: boolean;
        dm: boolean;
        dashboard: boolean;
    }, {
        channel?: boolean | undefined;
        dm?: boolean | undefined;
        dashboard?: boolean | undefined;
    }>>;
    assigned: z.ZodDefault<z.ZodObject<{
        channel: z.ZodDefault<z.ZodBoolean>;
        dm: z.ZodDefault<z.ZodBoolean>;
        dashboard: z.ZodDefault<z.ZodBoolean>;
    }, "strip", z.ZodTypeAny, {
        channel: boolean;
        dm: boolean;
        dashboard: boolean;
    }, {
        channel?: boolean | undefined;
        dm?: boolean | undefined;
        dashboard?: boolean | undefined;
    }>>;
    user_message: z.ZodDefault<z.ZodObject<{
        channel: z.ZodDefault<z.ZodBoolean>;
        dm: z.ZodDefault<z.ZodBoolean>;
        dashboard: z.ZodDefault<z.ZodBoolean>;
    }, "strip", z.ZodTypeAny, {
        channel: boolean;
        dm: boolean;
        dashboard: boolean;
    }, {
        channel?: boolean | undefined;
        dm?: boolean | undefined;
        dashboard?: boolean | undefined;
    }>>;
    info_requested: z.ZodDefault<z.ZodObject<{
        channel: z.ZodDefault<z.ZodBoolean>;
        dm: z.ZodDefault<z.ZodBoolean>;
        dashboard: z.ZodDefault<z.ZodBoolean>;
    }, "strip", z.ZodTypeAny, {
        channel: boolean;
        dm: boolean;
        dashboard: boolean;
    }, {
        channel?: boolean | undefined;
        dm?: boolean | undefined;
        dashboard?: boolean | undefined;
    }>>;
    priority: z.ZodDefault<z.ZodObject<{
        channel: z.ZodDefault<z.ZodBoolean>;
        dm: z.ZodDefault<z.ZodBoolean>;
        dashboard: z.ZodDefault<z.ZodBoolean>;
    }, "strip", z.ZodTypeAny, {
        channel: boolean;
        dm: boolean;
        dashboard: boolean;
    }, {
        channel?: boolean | undefined;
        dm?: boolean | undefined;
        dashboard?: boolean | undefined;
    }>>;
    escalated: z.ZodDefault<z.ZodObject<{
        channel: z.ZodDefault<z.ZodBoolean>;
        dm: z.ZodDefault<z.ZodBoolean>;
        dashboard: z.ZodDefault<z.ZodBoolean>;
    }, "strip", z.ZodTypeAny, {
        channel: boolean;
        dm: boolean;
        dashboard: boolean;
    }, {
        channel?: boolean | undefined;
        dm?: boolean | undefined;
        dashboard?: boolean | undefined;
    }>>;
    closed: z.ZodDefault<z.ZodObject<{
        channel: z.ZodDefault<z.ZodBoolean>;
        dm: z.ZodDefault<z.ZodBoolean>;
        dashboard: z.ZodDefault<z.ZodBoolean>;
    }, "strip", z.ZodTypeAny, {
        channel: boolean;
        dm: boolean;
        dashboard: boolean;
    }, {
        channel?: boolean | undefined;
        dm?: boolean | undefined;
        dashboard?: boolean | undefined;
    }>>;
    reopened: z.ZodDefault<z.ZodObject<{
        channel: z.ZodDefault<z.ZodBoolean>;
        dm: z.ZodDefault<z.ZodBoolean>;
        dashboard: z.ZodDefault<z.ZodBoolean>;
    }, "strip", z.ZodTypeAny, {
        channel: boolean;
        dm: boolean;
        dashboard: boolean;
    }, {
        channel?: boolean | undefined;
        dm?: boolean | undefined;
        dashboard?: boolean | undefined;
    }>>;
    transcript_ready: z.ZodDefault<z.ZodObject<{
        channel: z.ZodDefault<z.ZodBoolean>;
        dm: z.ZodDefault<z.ZodBoolean>;
        dashboard: z.ZodDefault<z.ZodBoolean>;
    }, "strip", z.ZodTypeAny, {
        channel: boolean;
        dm: boolean;
        dashboard: boolean;
    }, {
        channel?: boolean | undefined;
        dm?: boolean | undefined;
        dashboard?: boolean | undefined;
    }>>;
    transcript_failed: z.ZodDefault<z.ZodObject<{
        channel: z.ZodDefault<z.ZodBoolean>;
        dm: z.ZodDefault<z.ZodBoolean>;
        dashboard: z.ZodDefault<z.ZodBoolean>;
    }, "strip", z.ZodTypeAny, {
        channel: boolean;
        dm: boolean;
        dashboard: boolean;
    }, {
        channel?: boolean | undefined;
        dm?: boolean | undefined;
        dashboard?: boolean | undefined;
    }>>;
}, "strip", z.ZodTypeAny, {
    priority: {
        channel: boolean;
        dm: boolean;
        dashboard: boolean;
    };
    created: {
        channel: boolean;
        dm: boolean;
        dashboard: boolean;
    };
    closed: {
        channel: boolean;
        dm: boolean;
        dashboard: boolean;
    };
    claimed: {
        channel: boolean;
        dm: boolean;
        dashboard: boolean;
    };
    assigned: {
        channel: boolean;
        dm: boolean;
        dashboard: boolean;
    };
    user_message: {
        channel: boolean;
        dm: boolean;
        dashboard: boolean;
    };
    info_requested: {
        channel: boolean;
        dm: boolean;
        dashboard: boolean;
    };
    escalated: {
        channel: boolean;
        dm: boolean;
        dashboard: boolean;
    };
    reopened: {
        channel: boolean;
        dm: boolean;
        dashboard: boolean;
    };
    transcript_ready: {
        channel: boolean;
        dm: boolean;
        dashboard: boolean;
    };
    transcript_failed: {
        channel: boolean;
        dm: boolean;
        dashboard: boolean;
    };
}, {
    priority?: {
        channel?: boolean | undefined;
        dm?: boolean | undefined;
        dashboard?: boolean | undefined;
    } | undefined;
    created?: {
        channel?: boolean | undefined;
        dm?: boolean | undefined;
        dashboard?: boolean | undefined;
    } | undefined;
    closed?: {
        channel?: boolean | undefined;
        dm?: boolean | undefined;
        dashboard?: boolean | undefined;
    } | undefined;
    claimed?: {
        channel?: boolean | undefined;
        dm?: boolean | undefined;
        dashboard?: boolean | undefined;
    } | undefined;
    assigned?: {
        channel?: boolean | undefined;
        dm?: boolean | undefined;
        dashboard?: boolean | undefined;
    } | undefined;
    user_message?: {
        channel?: boolean | undefined;
        dm?: boolean | undefined;
        dashboard?: boolean | undefined;
    } | undefined;
    info_requested?: {
        channel?: boolean | undefined;
        dm?: boolean | undefined;
        dashboard?: boolean | undefined;
    } | undefined;
    escalated?: {
        channel?: boolean | undefined;
        dm?: boolean | undefined;
        dashboard?: boolean | undefined;
    } | undefined;
    reopened?: {
        channel?: boolean | undefined;
        dm?: boolean | undefined;
        dashboard?: boolean | undefined;
    } | undefined;
    transcript_ready?: {
        channel?: boolean | undefined;
        dm?: boolean | undefined;
        dashboard?: boolean | undefined;
    } | undefined;
    transcript_failed?: {
        channel?: boolean | undefined;
        dm?: boolean | undefined;
        dashboard?: boolean | undefined;
    } | undefined;
}>>;
export declare const reasonSchema: z.ZodObject<{
    text: z.ZodString;
    position: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    position: number;
    text: string;
}, {
    text: string;
    position?: number | undefined;
}>;
/** Allgemeine Einstellungen (CLOSED-Anzeige, Log-Channel, Texte). */
export declare const settingsSchema: z.ZodObject<{
    logChannelId: z.ZodEffects<z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodLiteral<"">, z.ZodNull]>>, string | null, string | null | undefined>;
    transcriptChannelId: z.ZodEffects<z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodLiteral<"">, z.ZodNull]>>, string | null, string | null | undefined>;
    closedTitle: z.ZodDefault<z.ZodString>;
    closedMessage: z.ZodDefault<z.ZodString>;
    closedColor: z.ZodDefault<z.ZodNumber>;
    reopenedMessage: z.ZodDefault<z.ZodString>;
    ratingMessage: z.ZodDefault<z.ZodString>;
    ratingThanks: z.ZodDefault<z.ZodString>;
    transcriptRetentionDays: z.ZodDefault<z.ZodNumber>;
    /** Bewertungen: Team-Channel (alles) und öffentlicher Channel (nur die gewählten Werte). */
    ratingChannelId: z.ZodEffects<z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodLiteral<"">, z.ZodNull]>>, string | null, string | null | undefined>;
    ratingPublicChannelId: z.ZodEffects<z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodLiteral<"">, z.ZodNull]>>, string | null, string | null | undefined>;
    ratingPublicFields: z.ZodDefault<z.ZodArray<z.ZodEnum<["creator", "category", "staff", "duration", "comment"]>, "many">>;
    /** Ersteller verlässt den Discord-Server: offene Tickets schließen (braucht den Server Members Intent). */
    memberLeaveAction: z.ZodDefault<z.ZodEnum<["NONE", "CLOSE"]>>;
    memberLeaveReason: z.ZodDefault<z.ZodString>;
    /** Präfix der dauerhaften Ticket-ID (EMD-000123) */
    refPrefix: z.ZodDefault<z.ZodString>;
    /** offene Tickets je Nutzer über alle Kategorien (0 = unbegrenzt); Recht ticket.bypass_limits hebt es auf */
    maxOpenPerUser: z.ZodDefault<z.ZodNumber>;
    /** Discord-Server, auf dem Tickets geöffnet werden dürfen (leer = keine Einschränkung) */
    guildId: z.ZodEffects<z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodLiteral<"">, z.ZodNull]>>, string | null, string | null | undefined>;
    /** vertrauliche Tickets ohne eingerichtete Abteilung: nur diese Rollen (z. B. Leitung) – nie die allgemeine Staff-Rolle */
    confidentialFallbackRoleIds: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    /** Leitung für Eskalationen, wenn die Abteilung keine eigene hat (bekommt dadurch keinen Zugriff) */
    leadRoleIds: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    /** Erinnerungen bei SLA-Überschreitung wiederholen (Minuten, 0 = nur einmal) und Eskalation an die Leitung nach … Minuten Überschreitung (0 = sofort) */
    slaReminderMinutes: z.ZodDefault<z.ZodNumber>;
    slaEscalateAfterMinutes: z.ZodDefault<z.ZodNumber>;
    /** Benachrichtigung „neue Nachricht des Nutzers“ höchstens alle … Minuten je Ticket */
    userMessageNotifyMinutes: z.ZodDefault<z.ZodNumber>;
    notifications: z.ZodDefault<z.ZodObject<{
        created: z.ZodDefault<z.ZodObject<{
            channel: z.ZodDefault<z.ZodBoolean>;
            dm: z.ZodDefault<z.ZodBoolean>;
            dashboard: z.ZodDefault<z.ZodBoolean>;
        }, "strip", z.ZodTypeAny, {
            channel: boolean;
            dm: boolean;
            dashboard: boolean;
        }, {
            channel?: boolean | undefined;
            dm?: boolean | undefined;
            dashboard?: boolean | undefined;
        }>>;
        claimed: z.ZodDefault<z.ZodObject<{
            channel: z.ZodDefault<z.ZodBoolean>;
            dm: z.ZodDefault<z.ZodBoolean>;
            dashboard: z.ZodDefault<z.ZodBoolean>;
        }, "strip", z.ZodTypeAny, {
            channel: boolean;
            dm: boolean;
            dashboard: boolean;
        }, {
            channel?: boolean | undefined;
            dm?: boolean | undefined;
            dashboard?: boolean | undefined;
        }>>;
        assigned: z.ZodDefault<z.ZodObject<{
            channel: z.ZodDefault<z.ZodBoolean>;
            dm: z.ZodDefault<z.ZodBoolean>;
            dashboard: z.ZodDefault<z.ZodBoolean>;
        }, "strip", z.ZodTypeAny, {
            channel: boolean;
            dm: boolean;
            dashboard: boolean;
        }, {
            channel?: boolean | undefined;
            dm?: boolean | undefined;
            dashboard?: boolean | undefined;
        }>>;
        user_message: z.ZodDefault<z.ZodObject<{
            channel: z.ZodDefault<z.ZodBoolean>;
            dm: z.ZodDefault<z.ZodBoolean>;
            dashboard: z.ZodDefault<z.ZodBoolean>;
        }, "strip", z.ZodTypeAny, {
            channel: boolean;
            dm: boolean;
            dashboard: boolean;
        }, {
            channel?: boolean | undefined;
            dm?: boolean | undefined;
            dashboard?: boolean | undefined;
        }>>;
        info_requested: z.ZodDefault<z.ZodObject<{
            channel: z.ZodDefault<z.ZodBoolean>;
            dm: z.ZodDefault<z.ZodBoolean>;
            dashboard: z.ZodDefault<z.ZodBoolean>;
        }, "strip", z.ZodTypeAny, {
            channel: boolean;
            dm: boolean;
            dashboard: boolean;
        }, {
            channel?: boolean | undefined;
            dm?: boolean | undefined;
            dashboard?: boolean | undefined;
        }>>;
        priority: z.ZodDefault<z.ZodObject<{
            channel: z.ZodDefault<z.ZodBoolean>;
            dm: z.ZodDefault<z.ZodBoolean>;
            dashboard: z.ZodDefault<z.ZodBoolean>;
        }, "strip", z.ZodTypeAny, {
            channel: boolean;
            dm: boolean;
            dashboard: boolean;
        }, {
            channel?: boolean | undefined;
            dm?: boolean | undefined;
            dashboard?: boolean | undefined;
        }>>;
        escalated: z.ZodDefault<z.ZodObject<{
            channel: z.ZodDefault<z.ZodBoolean>;
            dm: z.ZodDefault<z.ZodBoolean>;
            dashboard: z.ZodDefault<z.ZodBoolean>;
        }, "strip", z.ZodTypeAny, {
            channel: boolean;
            dm: boolean;
            dashboard: boolean;
        }, {
            channel?: boolean | undefined;
            dm?: boolean | undefined;
            dashboard?: boolean | undefined;
        }>>;
        closed: z.ZodDefault<z.ZodObject<{
            channel: z.ZodDefault<z.ZodBoolean>;
            dm: z.ZodDefault<z.ZodBoolean>;
            dashboard: z.ZodDefault<z.ZodBoolean>;
        }, "strip", z.ZodTypeAny, {
            channel: boolean;
            dm: boolean;
            dashboard: boolean;
        }, {
            channel?: boolean | undefined;
            dm?: boolean | undefined;
            dashboard?: boolean | undefined;
        }>>;
        reopened: z.ZodDefault<z.ZodObject<{
            channel: z.ZodDefault<z.ZodBoolean>;
            dm: z.ZodDefault<z.ZodBoolean>;
            dashboard: z.ZodDefault<z.ZodBoolean>;
        }, "strip", z.ZodTypeAny, {
            channel: boolean;
            dm: boolean;
            dashboard: boolean;
        }, {
            channel?: boolean | undefined;
            dm?: boolean | undefined;
            dashboard?: boolean | undefined;
        }>>;
        transcript_ready: z.ZodDefault<z.ZodObject<{
            channel: z.ZodDefault<z.ZodBoolean>;
            dm: z.ZodDefault<z.ZodBoolean>;
            dashboard: z.ZodDefault<z.ZodBoolean>;
        }, "strip", z.ZodTypeAny, {
            channel: boolean;
            dm: boolean;
            dashboard: boolean;
        }, {
            channel?: boolean | undefined;
            dm?: boolean | undefined;
            dashboard?: boolean | undefined;
        }>>;
        transcript_failed: z.ZodDefault<z.ZodObject<{
            channel: z.ZodDefault<z.ZodBoolean>;
            dm: z.ZodDefault<z.ZodBoolean>;
            dashboard: z.ZodDefault<z.ZodBoolean>;
        }, "strip", z.ZodTypeAny, {
            channel: boolean;
            dm: boolean;
            dashboard: boolean;
        }, {
            channel?: boolean | undefined;
            dm?: boolean | undefined;
            dashboard?: boolean | undefined;
        }>>;
    }, "strip", z.ZodTypeAny, {
        priority: {
            channel: boolean;
            dm: boolean;
            dashboard: boolean;
        };
        created: {
            channel: boolean;
            dm: boolean;
            dashboard: boolean;
        };
        closed: {
            channel: boolean;
            dm: boolean;
            dashboard: boolean;
        };
        claimed: {
            channel: boolean;
            dm: boolean;
            dashboard: boolean;
        };
        assigned: {
            channel: boolean;
            dm: boolean;
            dashboard: boolean;
        };
        user_message: {
            channel: boolean;
            dm: boolean;
            dashboard: boolean;
        };
        info_requested: {
            channel: boolean;
            dm: boolean;
            dashboard: boolean;
        };
        escalated: {
            channel: boolean;
            dm: boolean;
            dashboard: boolean;
        };
        reopened: {
            channel: boolean;
            dm: boolean;
            dashboard: boolean;
        };
        transcript_ready: {
            channel: boolean;
            dm: boolean;
            dashboard: boolean;
        };
        transcript_failed: {
            channel: boolean;
            dm: boolean;
            dashboard: boolean;
        };
    }, {
        priority?: {
            channel?: boolean | undefined;
            dm?: boolean | undefined;
            dashboard?: boolean | undefined;
        } | undefined;
        created?: {
            channel?: boolean | undefined;
            dm?: boolean | undefined;
            dashboard?: boolean | undefined;
        } | undefined;
        closed?: {
            channel?: boolean | undefined;
            dm?: boolean | undefined;
            dashboard?: boolean | undefined;
        } | undefined;
        claimed?: {
            channel?: boolean | undefined;
            dm?: boolean | undefined;
            dashboard?: boolean | undefined;
        } | undefined;
        assigned?: {
            channel?: boolean | undefined;
            dm?: boolean | undefined;
            dashboard?: boolean | undefined;
        } | undefined;
        user_message?: {
            channel?: boolean | undefined;
            dm?: boolean | undefined;
            dashboard?: boolean | undefined;
        } | undefined;
        info_requested?: {
            channel?: boolean | undefined;
            dm?: boolean | undefined;
            dashboard?: boolean | undefined;
        } | undefined;
        escalated?: {
            channel?: boolean | undefined;
            dm?: boolean | undefined;
            dashboard?: boolean | undefined;
        } | undefined;
        reopened?: {
            channel?: boolean | undefined;
            dm?: boolean | undefined;
            dashboard?: boolean | undefined;
        } | undefined;
        transcript_ready?: {
            channel?: boolean | undefined;
            dm?: boolean | undefined;
            dashboard?: boolean | undefined;
        } | undefined;
        transcript_failed?: {
            channel?: boolean | undefined;
            dm?: boolean | undefined;
            dashboard?: boolean | undefined;
        } | undefined;
    }>>;
}, "strip", z.ZodTypeAny, {
    guildId: string | null;
    notifications: {
        priority: {
            channel: boolean;
            dm: boolean;
            dashboard: boolean;
        };
        created: {
            channel: boolean;
            dm: boolean;
            dashboard: boolean;
        };
        closed: {
            channel: boolean;
            dm: boolean;
            dashboard: boolean;
        };
        claimed: {
            channel: boolean;
            dm: boolean;
            dashboard: boolean;
        };
        assigned: {
            channel: boolean;
            dm: boolean;
            dashboard: boolean;
        };
        user_message: {
            channel: boolean;
            dm: boolean;
            dashboard: boolean;
        };
        info_requested: {
            channel: boolean;
            dm: boolean;
            dashboard: boolean;
        };
        escalated: {
            channel: boolean;
            dm: boolean;
            dashboard: boolean;
        };
        reopened: {
            channel: boolean;
            dm: boolean;
            dashboard: boolean;
        };
        transcript_ready: {
            channel: boolean;
            dm: boolean;
            dashboard: boolean;
        };
        transcript_failed: {
            channel: boolean;
            dm: boolean;
            dashboard: boolean;
        };
    };
    leadRoleIds: string[];
    transcriptChannelId: string | null;
    logChannelId: string | null;
    closedTitle: string;
    closedMessage: string;
    closedColor: number;
    reopenedMessage: string;
    ratingMessage: string;
    ratingThanks: string;
    transcriptRetentionDays: number;
    ratingChannelId: string | null;
    ratingPublicChannelId: string | null;
    ratingPublicFields: ("category" | "duration" | "comment" | "staff" | "creator")[];
    memberLeaveAction: "NONE" | "CLOSE";
    memberLeaveReason: string;
    refPrefix: string;
    maxOpenPerUser: number;
    confidentialFallbackRoleIds: string[];
    slaReminderMinutes: number;
    slaEscalateAfterMinutes: number;
    userMessageNotifyMinutes: number;
}, {
    guildId?: string | null | undefined;
    notifications?: {
        priority?: {
            channel?: boolean | undefined;
            dm?: boolean | undefined;
            dashboard?: boolean | undefined;
        } | undefined;
        created?: {
            channel?: boolean | undefined;
            dm?: boolean | undefined;
            dashboard?: boolean | undefined;
        } | undefined;
        closed?: {
            channel?: boolean | undefined;
            dm?: boolean | undefined;
            dashboard?: boolean | undefined;
        } | undefined;
        claimed?: {
            channel?: boolean | undefined;
            dm?: boolean | undefined;
            dashboard?: boolean | undefined;
        } | undefined;
        assigned?: {
            channel?: boolean | undefined;
            dm?: boolean | undefined;
            dashboard?: boolean | undefined;
        } | undefined;
        user_message?: {
            channel?: boolean | undefined;
            dm?: boolean | undefined;
            dashboard?: boolean | undefined;
        } | undefined;
        info_requested?: {
            channel?: boolean | undefined;
            dm?: boolean | undefined;
            dashboard?: boolean | undefined;
        } | undefined;
        escalated?: {
            channel?: boolean | undefined;
            dm?: boolean | undefined;
            dashboard?: boolean | undefined;
        } | undefined;
        reopened?: {
            channel?: boolean | undefined;
            dm?: boolean | undefined;
            dashboard?: boolean | undefined;
        } | undefined;
        transcript_ready?: {
            channel?: boolean | undefined;
            dm?: boolean | undefined;
            dashboard?: boolean | undefined;
        } | undefined;
        transcript_failed?: {
            channel?: boolean | undefined;
            dm?: boolean | undefined;
            dashboard?: boolean | undefined;
        } | undefined;
    } | undefined;
    leadRoleIds?: string[] | undefined;
    transcriptChannelId?: string | null | undefined;
    logChannelId?: string | null | undefined;
    closedTitle?: string | undefined;
    closedMessage?: string | undefined;
    closedColor?: number | undefined;
    reopenedMessage?: string | undefined;
    ratingMessage?: string | undefined;
    ratingThanks?: string | undefined;
    transcriptRetentionDays?: number | undefined;
    ratingChannelId?: string | null | undefined;
    ratingPublicChannelId?: string | null | undefined;
    ratingPublicFields?: ("category" | "duration" | "comment" | "staff" | "creator")[] | undefined;
    memberLeaveAction?: "NONE" | "CLOSE" | undefined;
    memberLeaveReason?: string | undefined;
    refPrefix?: string | undefined;
    maxOpenPerUser?: number | undefined;
    confidentialFallbackRoleIds?: string[] | undefined;
    slaReminderMinutes?: number | undefined;
    slaEscalateAfterMinutes?: number | undefined;
    userMessageNotifyMinutes?: number | undefined;
}>;
export type TicketSettings = z.infer<typeof settingsSchema>;
export declare const DEFAULT_SETTINGS: TicketSettings;
