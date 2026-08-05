import { ConsoleLogger } from "@nestjs/common";
import { sanitizeSensitiveData } from "./sensitive-data";

export class SanitizedLogger extends ConsoleLogger {
  override log(message: unknown, ...optionalParams: unknown[]) {
    super.log(sanitizeSensitiveData(message), ...sanitizeSensitiveData(optionalParams));
  }
  override error(message: unknown, ...optionalParams: unknown[]) {
    super.error(sanitizeSensitiveData(message), ...sanitizeSensitiveData(optionalParams));
  }
  override warn(message: unknown, ...optionalParams: unknown[]) {
    super.warn(sanitizeSensitiveData(message), ...sanitizeSensitiveData(optionalParams));
  }
  override debug(message: unknown, ...optionalParams: unknown[]) {
    super.debug(sanitizeSensitiveData(message), ...sanitizeSensitiveData(optionalParams));
  }
  override verbose(message: unknown, ...optionalParams: unknown[]) {
    super.verbose(sanitizeSensitiveData(message), ...sanitizeSensitiveData(optionalParams));
  }
  override fatal(message: unknown, ...optionalParams: unknown[]) {
    super.fatal(sanitizeSensitiveData(message), ...sanitizeSensitiveData(optionalParams));
  }
}
