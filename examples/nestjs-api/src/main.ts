import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module.js";

const port = Number(process.env.PORT ?? 3080);
const app = await NestFactory.create(AppModule);
app.enableCors();
await app.listen(port);
console.log(`POST http://localhost:${port}/places`);
