const fastify = require("fastify")({ logger: true });
const axios = require("axios");

fastify.register(require("fastify-static"), {
  root: __dirname,
  prefix: "/",
});

const start = async () => {
  try {
    await fastify.listen(8081, "0.0.0.0");
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};
start();
