"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
// PrismaClient is attached to the `global` object in development to prevent
// exhausting your database connection limit.
// Learn more: https://pris.ly/d/help/next-js-best-practices
let prisma;
if (process.env.NODE_ENV === 'production') {
    prisma = new client_1.PrismaClient();
}
else {
    // @ts-ignore
    if (!global.prisma) {
        // @ts-ignore
        global.prisma = new client_1.PrismaClient({
        // log: ['query', 'info', 'warn', 'error'], // Optional: for detailed logging
        });
    }
    // @ts-ignore
    prisma = global.prisma;
}
exports.default = prisma;
