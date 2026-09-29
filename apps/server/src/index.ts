import { createServer } from "node:http";

const port = Number(process.env.PORT ?? 4000);

const server = createServer((request, response) => {
  response.setHeader("Content-Type", "application/json");

  if (request.method === "GET" && request.url === "/api/v1/health") {
    response.writeHead(200);
    response.end(JSON.stringify({
      status: "ok",
      service: "vansha-logistic-hub-api",
      version: "v1"
    }));
    return;
  }

  response.writeHead(404);
  response.end(JSON.stringify({
    error: {
      code: "NOT_FOUND",
      message: "Route not found"
    }
  }));
});

server.listen(port);
