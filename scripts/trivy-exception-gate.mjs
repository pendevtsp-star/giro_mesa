import { writeFile } from "node:fs/promises";
import { loadSecurityExceptions } from "./security-exceptions.mjs";

const outputPath = ".trivyignore.generated";
const exceptions = await loadSecurityExceptions("security/trivy-exceptions.json", "Trivy");
await writeFile(outputPath, `${[...exceptions.keys()].join("\n")}${exceptions.size ? "\n" : ""}`);
console.log(JSON.stringify({ validatedTrivyExceptions: exceptions.size, ignoreFile: outputPath }));
