import { loadEnv } from "@giromesa/config";
import argon2 from "argon2";

const env = loadEnv();

export async function hashPassword(password: string) {
  return argon2.hash(`${password}${env.PASSWORD_PEPPER}`, {
    type: argon2.argon2id,
    memoryCost: 19_456,
    timeCost: 2,
    parallelism: 1,
  });
}

export async function verifyPassword(hash: string, password: string) {
  return argon2.verify(hash, `${password}${env.PASSWORD_PEPPER}`);
}
