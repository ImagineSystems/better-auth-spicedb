// src/lib/auth.ts
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "./db";
import * as schema from "./db/schema";
import { spicedb, createEventEmitter } from "better-auth-spicedb";

const spiceDBPlugin = spicedb({
  endpoint: "localhost:50051",
  token: "testkey",
  insecure: true,
  
  relationships: [
    // 1. Agent -> Owner
    {
      on: "agent.created",
      resourceType: "agent",
      relation: "owner",
      subjectType: "user",
      resourceId: (event) => event.agent.id,
      subjectId: (event) => event.agent.createdBy,
    },
    // 2. Agent -> Department
    {
      on: "agent.created",
      resourceType: "agent",
      relation: "department",
      subjectType: "department",
      resourceId: (event) => event.agent.id,
      subjectId: (event) => event.agent.departmentId,
    },
    // 3. User -> Department Member
    {
      on: "department.member.added",
      resourceType: "department",
      relation: "member",
      subjectType: "user",
      resourceId: (event) => event.departmentId,
      subjectId: (event) => event.userId,
    },
  ],
});

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "sqlite",
    schema,
  }),
  baseURL: "http://localhost:5173",

  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
  },
  plugins: [
    spiceDBPlugin, 
  ],
});

export const emitAuthEvent = createEventEmitter(spiceDBPlugin);
