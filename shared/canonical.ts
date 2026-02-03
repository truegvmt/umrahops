// @ts-nocheck
/**
 * Canonical Schema & Validation
 * Defines the normalized data structure for CSV imports with strict validation rules
 */

import { z } from 'zod';

// === CANONICAL FIELD DEFINITIONS ===

/**
 * Canonical traveler schema - all CSV imports must map to this structure
 * Validates formats, required fields, and business rules
 */
export const canonicalTravelerSchema = z.object({
    // Group assignment
    groupId: z.string().uuid().optional(), // Assigned after group creation

    // Core identity (PII - handle with care)
    name: z.string().min(2, 'ERR_NAME_TOO_SHORT').max(200, 'ERR_NAME_TOO_LONG'),

    passportNumber: z.string()
        .regex(/^[A-Z0-9]{6,12}$/, 'ERR_PASSPORT_FORMAT')
        .transform(val => val.toUpperCase()),

    nationality: z.string()
        .min(2, 'ERR_NATIONALITY_INVALID')
        .max(3, 'ERR_NATIONALITY_INVALID'), // ISO 3166-1 alpha-2 or alpha-3

    dob: z.string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, 'ERR_DOB_FORMAT')
        .refine(val => {
            const date = new Date(val);
            const age = (Date.now() - date.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
            return age >= 0 && age <= 120;
        }, 'ERR_DOB_OUT_OF_RANGE'),

    phoneE164: z.string()
        .regex(/^\+[1-9]\d{1,14}$/, 'ERR_PHONE_FORMAT')
        .optional(), // E.164: +92XXXXXXXXXX

    // Travel details
    arrivalDate: z.string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, 'ERR_ARRIVAL_FORMAT')
        .optional(),

    departureDate: z.string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, 'ERR_DEPARTURE_FORMAT')
        .optional(),

    flightNumber: z.string()
        .regex(/^[A-Z0-9]{2,8}$/, 'ERR_FLIGHT_FORMAT')
        .optional(),

    // Service references
    hotelId: z.string().uuid().optional(),
    visaProgramId: z.string().optional(),

}).refine(data => {
    // Business rule: departure must be after arrival
    if (data.arrivalDate && data.departureDate) {
        return new Date(data.departureDate) > new Date(data.arrivalDate);
    }
    return true;
}, {
    message: 'ERR_DEPARTURE_BEFORE_ARRIVAL',
    path: ['departureDate']
});

export type CanonicalTraveler = z.infer<typeof canonicalTravelerSchema>;

// === GROUP SCHEMA ===

export const canonicalGroupSchema = z.object({
    name: z.string().min(3, 'ERR_GROUP_NAME_TOO_SHORT').max(200, 'ERR_GROUP_NAME_TOO_LONG'),
    extAgent: z.string().optional(), // External/sub-agent identifier
    createdBy: z.string().optional(), // Agent ID from auth
});

export type CanonicalGroup = z.infer<typeof canonicalGroupSchema>;

// === CSV IMPORT HELPERS ===

/**
 * Maps common CSV column names to canonical fields
 * Case-insensitive fuzzy matching
 */
export const columnMappings: Record<string, string[]> = {
    name: ['name', 'full name', 'passenger name', 'traveler name', 'اسم'],
    passportNumber: ['passport', 'passport number', 'passport no', 'pp no', 'پاسپورٹ نمبر'],
    nationality: ['nationality', 'country', 'nation', 'قومیت'],
    dob: ['dob', 'date of birth', 'birth date', 'birthdate', 'تاریخ پیدائش'],
    phoneE164: ['phone', 'mobile', 'contact', 'phone number', 'فون'],
    arrivalDate: ['arrival', 'arrival date', 'check in', 'آمد کی تاریخ'],
    departureDate: ['departure', 'departure date', 'check out', 'روانگی کی تاریخ'],
    flightNumber: ['flight', 'flight no', 'flight number', 'پرواز نمبر'],
};

/**
 * Auto-map CSV headers to canonical fields
 */
export function autoMapColumns(csvHeaders: string[]): Record<string, string> {
    const mapped: Record<string, string> = {};

    for (const header of csvHeaders) {
        const normalized = header.toLowerCase().trim();

        for (const [canonical, aliases] of Object.entries(columnMappings)) {
            if (aliases.some(alias => normalized.includes(alias.toLowerCase()))) {
                mapped[header] = canonical;
                break;
            }
        }
    }

    return mapped;
}

/**
 * Validate and normalize a CSV row to canonical format
 * Returns { data, errors } where errors is an array of validation issues
 */
export function validateCanonicalRow(
    row: Record<string, any>,
    columnMap?: Record<string, string>
): { data: Partial<CanonicalTraveler> | null; errors: Array<{ field: string; code: string; message: string }> } {

    // Apply column mapping if provided
    const mappedRow: Record<string, any> = {};
    if (columnMap) {
        for (const [csvCol, canonicalField] of Object.entries(columnMap)) {
            if (row[csvCol] !== undefined) {
                mappedRow[canonicalField] = row[csvCol];
            }
        }
    } else {
        Object.assign(mappedRow, row);
    }

    // Validate against schema
    const result = canonicalTravelerSchema.safeParse(mappedRow);

    if (result.success) {
        return { data: result.data, errors: [] };
    } else {
        const errors = result.error.issues.map(issue => ({
            field: issue.path.join('.') || 'unknown',
            code: issue.message.startsWith('ERR_') ? issue.message : 'ERR_VALIDATION_FAILED',
            message: issue.message,
        }));

        return { data: null, errors };
    }
}

/**
 * Batch validate multiple rows
 * Returns summary stats + detailed errors
 */
export function validateBatch(
    rows: Array<Record<string, any>>,
    columnMap?: Record<string, string>
): {
    valid: CanonicalTraveler[];
    invalid: Array<{ row: number; errors: Array<{ field: string; code: string; message: string }> }>;
    stats: { total: number; valid: number; invalid: number };
} {
    const valid: CanonicalTraveler[] = [];
    const invalid: Array<{ row: number; errors: Array<{ field: string; code: string; message: string }> }> = [];

    rows.forEach((row, index) => {
        const { data, errors } = validateCanonicalRow(row, columnMap);

        if (data && errors.length === 0) {
            valid.push(data as CanonicalTraveler);
        } else {
            invalid.push({ row: index + 1, errors });
        }
    });

    return {
        valid,
        invalid,
        stats: {
            total: rows.length,
            valid: valid.length,
            invalid: invalid.length,
        },
    };
}

/**
 * Generate passport hash (SHA-256) for AI/logging without exposing PII
 */
export async function hashPassport(passportNumber: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(passportNumber.toUpperCase());
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Error code reference for UI display
 */
export const errorCodeMessages: Record<string, string> = {
    ERR_NAME_TOO_SHORT: 'Name must be at least 2 characters',
    ERR_NAME_TOO_LONG: 'Name exceeds 200 characters',
    ERR_PASSPORT_FORMAT: 'Passport must be 6-12 uppercase alphanumeric characters',
    ERR_NATIONALITY_INVALID: 'Nationality must be 2-3 character country code',
    ERR_DOB_FORMAT: 'Date of birth must be YYYY-MM-DD format',
    ERR_DOB_OUT_OF_RANGE: 'Date of birth indicates invalid age (must be 0-120 years)',
    ERR_PHONE_FORMAT: 'Phone must be in E.164 format (e.g., +923001234567)',
    ERR_ARRIVAL_FORMAT: 'Arrival date must be YYYY-MM-DD format',
    ERR_DEPARTURE_FORMAT: 'Departure date must be YYYY-MM-DD format',
    ERR_DEPARTURE_BEFORE_ARRIVAL: 'Departure date must be after arrival date',
    ERR_FLIGHT_FORMAT: 'Flight number must be 2-8 alphanumeric characters',
    ERR_GROUP_NAME_TOO_SHORT: 'Group name must be at least 3 characters',
    ERR_GROUP_NAME_TOO_LONG: 'Group name exceeds 200 characters',
    ERR_VALIDATION_FAILED: 'General validation error',
};
