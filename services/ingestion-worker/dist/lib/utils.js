"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.prisma = void 0;
exports.cn = cn;
const clsx_1 = require("clsx");
const tailwind_merge_1 = require("tailwind-merge");
function cn(...inputs) {
    return (0, tailwind_merge_1.twMerge)((0, clsx_1.clsx)(inputs));
}
// Example: lib/prisma.ts
const client_1 = require("@prisma/client");
exports.prisma = global.prisma || new client_1.PrismaClient();
if (process.env.NODE_ENV !== 'production')
    global.prisma = exports.prisma;
