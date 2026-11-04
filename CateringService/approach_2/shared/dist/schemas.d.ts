import { z } from 'zod';
export declare const registerSchema: z.ZodObject<{
    email: z.ZodString;
    password: z.ZodString;
    fullName: z.ZodString;
    phone: z.ZodString;
    role: z.ZodEnum<["customer", "caterer"]>;
}, "strip", z.ZodTypeAny, {
    email: string;
    password: string;
    fullName: string;
    phone: string;
    role: "customer" | "caterer";
}, {
    email: string;
    password: string;
    fullName: string;
    phone: string;
    role: "customer" | "caterer";
}>;
export declare const loginSchema: z.ZodObject<{
    email: z.ZodString;
    password: z.ZodString;
}, "strip", z.ZodTypeAny, {
    email: string;
    password: string;
}, {
    email: string;
    password: string;
}>;
export declare const catererOnboardingSchema: z.ZodObject<{
    businessName: z.ZodString;
    description: z.ZodOptional<z.ZodString>;
    city: z.ZodDefault<z.ZodString>;
    serviceAreas: z.ZodArray<z.ZodString, "many">;
    cuisines: z.ZodArray<z.ZodString, "many">;
    fssaiNumber: z.ZodString;
    gstNumber: z.ZodNullable<z.ZodOptional<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    businessName: string;
    city: string;
    serviceAreas: string[];
    cuisines: string[];
    fssaiNumber: string;
    description?: string | undefined;
    gstNumber?: string | null | undefined;
}, {
    businessName: string;
    serviceAreas: string[];
    cuisines: string[];
    fssaiNumber: string;
    description?: string | undefined;
    city?: string | undefined;
    gstNumber?: string | null | undefined;
}>;
export declare const packageSchema: z.ZodObject<{
    name: z.ZodString;
    description: z.ZodOptional<z.ZodString>;
    pricePerPlatePaise: z.ZodNumber;
    minGuests: z.ZodNumber;
    maxGuests: z.ZodNullable<z.ZodOptional<z.ZodNumber>>;
    isVeg: z.ZodDefault<z.ZodBoolean>;
    items: z.ZodDefault<z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        category: z.ZodEnum<["starter", "main", "dessert", "beverage"]>;
    }, "strip", z.ZodTypeAny, {
        name: string;
        category: "starter" | "main" | "dessert" | "beverage";
    }, {
        name: string;
        category: "starter" | "main" | "dessert" | "beverage";
    }>, "many">>;
}, "strip", z.ZodTypeAny, {
    name: string;
    pricePerPlatePaise: number;
    minGuests: number;
    isVeg: boolean;
    items: {
        name: string;
        category: "starter" | "main" | "dessert" | "beverage";
    }[];
    description?: string | undefined;
    maxGuests?: number | null | undefined;
}, {
    name: string;
    pricePerPlatePaise: number;
    minGuests: number;
    description?: string | undefined;
    maxGuests?: number | null | undefined;
    isVeg?: boolean | undefined;
    items?: {
        name: string;
        category: "starter" | "main" | "dessert" | "beverage";
    }[] | undefined;
}>;
export declare const bookingRequestSchema: z.ZodObject<{
    catererId: z.ZodString;
    packageId: z.ZodString;
    eventDate: z.ZodString;
    eventTime: z.ZodString;
    guestCount: z.ZodNumber;
    venueAddress: z.ZodString;
    city: z.ZodDefault<z.ZodString>;
    specialRequests: z.ZodNullable<z.ZodOptional<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    city: string;
    catererId: string;
    packageId: string;
    eventDate: string;
    eventTime: string;
    guestCount: number;
    venueAddress: string;
    specialRequests?: string | null | undefined;
}, {
    catererId: string;
    packageId: string;
    eventDate: string;
    eventTime: string;
    guestCount: number;
    venueAddress: string;
    city?: string | undefined;
    specialRequests?: string | null | undefined;
}>;
export declare const createOrderSchema: z.ZodObject<{
    bookingId: z.ZodString;
    paymentOption: z.ZodEnum<["full", "advance"]>;
    advancePct: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    bookingId: string;
    paymentOption: "full" | "advance";
    advancePct: number;
}, {
    bookingId: string;
    paymentOption: "full" | "advance";
    advancePct?: number | undefined;
}>;
export declare const reviewSchema: z.ZodObject<{
    bookingId: z.ZodString;
    rating: z.ZodNumber;
    comment: z.ZodNullable<z.ZodOptional<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    bookingId: string;
    rating: number;
    comment?: string | null | undefined;
}, {
    bookingId: string;
    rating: number;
    comment?: string | null | undefined;
}>;
export declare const blackoutDateSchema: z.ZodObject<{
    date: z.ZodString;
    reason: z.ZodDefault<z.ZodOptional<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    date: string;
    reason: string;
}, {
    date: string;
    reason?: string | undefined;
}>;
export declare const disburseSettlementSchema: z.ZodObject<{
    utrReference: z.ZodString;
}, "strip", z.ZodTypeAny, {
    utrReference: string;
}, {
    utrReference: string;
}>;
export declare const notificationDispatchSchema: z.ZodObject<{
    bookingId: z.ZodString;
    recipientPhone: z.ZodString;
    recipientRole: z.ZodEnum<["customer", "caterer", "admin"]>;
    channel: z.ZodEnum<["whatsapp", "sms"]>;
    templateType: z.ZodEnum<["booking_requested", "booking_accepted", "payment_captured", "booking_cancelled"]>;
    params: z.ZodRecord<z.ZodString, z.ZodAny>;
}, "strip", z.ZodTypeAny, {
    params: Record<string, any>;
    bookingId: string;
    recipientPhone: string;
    recipientRole: "customer" | "caterer" | "admin";
    channel: "whatsapp" | "sms";
    templateType: "booking_requested" | "booking_accepted" | "payment_captured" | "booking_cancelled";
}, {
    params: Record<string, any>;
    bookingId: string;
    recipientPhone: string;
    recipientRole: "customer" | "caterer" | "admin";
    channel: "whatsapp" | "sms";
    templateType: "booking_requested" | "booking_accepted" | "payment_captured" | "booking_cancelled";
}>;
export declare const sendMessageSchema: z.ZodObject<{
    message: z.ZodString;
}, "strip", z.ZodTypeAny, {
    message: string;
}, {
    message: string;
}>;
//# sourceMappingURL=schemas.d.ts.map