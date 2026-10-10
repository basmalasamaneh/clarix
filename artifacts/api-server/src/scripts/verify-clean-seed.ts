// Legacy entry point now uses the same disposable test target, never dev data.
export {};
process.argv.splice(2,Infinity,"src/tests/foundation.test.ts");
await import("./test-isolated");
