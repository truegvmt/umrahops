// @ts-nocheck
import { z } from 'zod';
import {
  insertGroupSchema,
  groups,
  travelers,
  insertTravelerSchema,
  jobsQueue,
  insertJobSchema,
  auditLogs,
  csvImportSchema
} from './schema';

export const errorSchemas = {
  validation: z.object({
    message: z.string(),
    field: z.string().optional(),
  }),
  notFound: z.object({
    message: z.string(),
  }),
  internal: z.object({
    message: z.string(),
  }),
};

export const api = {
  groups: {
    list: {
      method: 'GET' as const,
      path: '/api/groups',
      responses: {
        200: z.array(z.custom<typeof groups.$inferSelect>()),
      },
    },
    get: {
      method: 'GET' as const,
      path: '/api/groups/:id',
      responses: {
        200: z.custom<typeof groups.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/groups',
      input: insertGroupSchema,
      responses: {
        201: z.custom<typeof groups.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    update: {
      method: 'PUT' as const,
      path: '/api/groups/:id',
      input: insertGroupSchema.partial(),
      responses: {
        200: z.custom<typeof groups.$inferSelect>(),
        400: errorSchemas.validation,
        404: errorSchemas.notFound,
      },
    },
  },
  travelers: {
    list: {
      method: 'GET' as const,
      path: '/api/groups/:groupId/travelers',
      responses: {
        200: z.array(z.custom<typeof travelers.$inferSelect>()),
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/travelers',
      input: insertTravelerSchema,
      responses: {
        201: z.custom<typeof travelers.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    bulkCreate: {
      method: 'POST' as const,
      path: '/api/travelers/bulk',
      input: z.object({
        travelers: z.array(insertTravelerSchema),
      }),
      responses: {
        201: z.array(z.custom<typeof travelers.$inferSelect>()),
        400: errorSchemas.validation,
      },
    },
    update: {
      method: 'PUT' as const,
      path: '/api/travelers/:id',
      input: insertTravelerSchema.partial(),
      responses: {
        200: z.custom<typeof travelers.$inferSelect>(),
        400: errorSchemas.validation,
        404: errorSchemas.notFound,
      },
    },
  },
  jobs: {
    list: {
      method: 'GET' as const,
      path: '/api/jobs',
      responses: {
        200: z.array(z.custom<typeof jobsQueue.$inferSelect>()),
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/jobs',
      input: insertJobSchema,
      responses: {
        201: z.custom<typeof jobsQueue.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
  },
  audit: {
    list: {
      method: 'GET' as const,
      path: '/api/audit-logs',
      responses: {
        200: z.array(z.custom<typeof auditLogs.$inferSelect>()),
      },
    },
  }
};

export function buildUrl(path: string, params?: Record<string, string | number>): string {
  let url = path;
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (url.includes(`:${key}`)) {
        url = url.replace(`:${key}`, String(value));
      }
    });
  }
  return url;
}
