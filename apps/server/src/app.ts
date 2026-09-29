import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import jwt from "@fastify/jwt";
import { config } from "./config.js";
import { registerAuthRoutes } from "./auth.js";

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: config.NODE_ENV !== "test" });
  await app.register(helmet);
  await app.register(cors, { origin: config.CORS_ORIGIN, credentials: true });
  await app.register(jwt, {
    secret: config.JWT_SECRET,
    sign: { iss: config.JWT_ISSUER, aud: config.JWT_AUDIENCE },
    verify: { allowedIss: config.JWT_ISSUER, allowedAud: config.JWT_AUDIENCE }
  });
  await registerAuthRoutes(app);
  app.get("/api/v1/health", async () => ({ status:"ok", service:"vansha-logistic-hub-api", version:"v1" }));
  app.setNotFoundHandler(async (_request,reply)=>reply.code(404).send({error:{code:"NOT_FOUND",message:"Route not found"}}));
  app.setErrorHandler(async (error,_request,reply)=>{
    app.log.error(error);
    const statusCode=typeof error==="object"&&error!==null&&"statusCode" in error&&typeof error.statusCode==="number"?error.statusCode:500;
    const message=config.NODE_ENV==="production"?"An unexpected error occurred.":error instanceof Error?error.message:"An unexpected error occurred.";
    return reply.code(statusCode).send({error:{code:"INTERNAL_ERROR",message}});
  });
  return app;
}
