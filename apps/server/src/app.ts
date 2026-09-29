import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import jwt from "@fastify/jwt";
import { config } from "./config.js";

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: config.NODE_ENV !== "test" });

  await app.register(helmet);
  await app.register(cors, {
    origin: config.CORS_ORIGIN,
    credentials: true
  });
  await app.register(jwt, {
    secret: config.JWT_SECRET,
    issuer: config.JWT_ISSUER,
    audience: config.JWT_AUDIENCE
  });

  app.get("/api/v1/health", async () => ({
    status: "ok",
    service: "vansha-logistic-hub-api",
    version: "v1"
  }));

  app.setNotFoundHandler(async (_request, reply) =>
    reply.code(404).send({
      error: { code: "NOT_FOUND", message: "Route not found" }
    })
  );

  app.setErrorHandler(async (error, _request, reply) => {
    app.log.error(error);
    return reply.code(error.statusCode ?? 500).send({
      error: {
        code: "INTERNAL_ERROR",
        message: config.NODE_ENV === "production"
          ? "An unexpected error occurred."
          : error.message
      }
    });
  });

  return app;
}
